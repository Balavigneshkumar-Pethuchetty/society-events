"""
OTP Monitor — live dashboard served at /monitor (nginx: /api/otp/monitor).
Shows active OTPs, sessions, rate limits, and the last 100 audit events
pulled directly from Redis.  Auto-refreshes every 3 seconds via fetch.

  HTML page  →  GET /monitor
  JSON data  →  GET /monitor/data   (polled by the page every 3 s)
"""
import time

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse

from app.config import settings
from app.otp_store import get_audit_log, get_stats

router = APIRouter()


def _require_auth_service_key(x_auth_service_key: str = Header(default="")) -> None:
    """Gate for cross-project calls (auth-service's dashboard proxy) — same
    shared secret already used for the auth_service SMS gateway integration."""
    if not settings.auth_service_api_key or x_auth_service_key != settings.auth_service_api_key:
        raise HTTPException(401, "invalid key")


# ── Per-transaction rollup (for auth-service's OTP Transactions dashboard) ────
#
# The audit log is a flat event stream (otp_sent / otp_failed / otp_verified /
# ...). This reconstructs one row per OTP challenge by walking the log in
# chronological order and grouping events for the same (masked) phone between
# an otp_sent and its resolution. The OTP value itself is never available —
# only an HMAC hash is ever stored (see otp_store.py) — so it can't appear here
# even if requested; that's a deliberate, unrecoverable-by-design property.

@router.get("/transactions", dependencies=[Depends(_require_auth_service_key)])
async def transactions(limit: int = 200):
    log = list(reversed(await get_audit_log(limit)))  # chronological order
    now = time.time()
    ttl = settings.otp_ttl_seconds

    open_by_phone: dict[str, dict] = {}
    done: list[dict] = []

    def close(phone: str, status: str):
        tx = open_by_phone.pop(phone, None)
        if tx:
            tx["status"] = status
            done.append(tx)

    for e in log:
        phone, etype, ts, detail = e.get("phone"), e.get("type"), e.get("ts"), e.get("detail", "")

        if etype == "otp_sent":
            close(phone, "expired")  # a resend supersedes any still-open challenge
            open_by_phone[phone] = {
                "phone": phone,
                "generated_at": ts,
                "expires_at": ts + ttl,
                "verified_at": None,
                "failed_at": None,
                "attempts": 0,
                "sms_delivery_failed": False,
                "status": "pending",
            }
        elif etype == "otp_failed" and phone in open_by_phone:
            tx = open_by_phone[phone]
            tx["attempts"] += 1
            tx["failed_at"] = ts
            tx["last_error"] = detail
            if "too many incorrect attempts" in detail.lower():
                close(phone, "locked")
        elif etype == "otp_verified" and phone in open_by_phone:
            open_by_phone[phone]["verified_at"] = ts
            close(phone, "verified")
        elif etype == "otp_sms_failed" and phone in open_by_phone:
            open_by_phone[phone]["sms_delivery_failed"] = True

    # Anything still open has either lapsed (past its TTL) or is genuinely
    # still awaiting the user's input.
    for phone, tx in list(open_by_phone.items()):
        close(phone, "pending" if tx["expires_at"] > now else "expired")

    done.sort(key=lambda t: t["generated_at"], reverse=True)
    return {"transactions": done[:limit]}

# ── Data endpoint (polled by the browser) ────────────────────────────────────

@router.get("/monitor/data", include_in_schema=False)
async def monitor_data():
    stats = await get_stats()
    log   = await get_audit_log(100)

    # Humanise timestamps in log
    now = time.time()
    for entry in log:
        delta = now - entry.get("ts", now)
        if delta < 60:
            entry["ago"] = f"{int(delta)}s ago"
        elif delta < 3600:
            entry["ago"] = f"{int(delta/60)}m ago"
        else:
            entry["ago"] = f"{int(delta/3600)}h ago"

    return JSONResponse({
        "stats": stats,
        "log": log,
        "ts": round(now),
    })


# ── HTML dashboard ─────────────────────────────────────────────────────────────

_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OTP Bridge — Monitor</title>
<style>
  :root {
    --bg: #0f172a; --surface: #1e293b; --border: #334155;
    --text: #e2e8f0; --muted: #94a3b8; --accent: #6366f1;
    --green: #10b981; --red: #ef4444; --yellow: #f59e0b; --blue: #38bdf8;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, sans-serif; font-size: 14px; }

  header {
    background: var(--surface); border-bottom: 1px solid var(--border);
    padding: 12px 24px; display: flex; align-items: center; gap: 12px;
  }
  header h1 { font-size: 18px; font-weight: 700; }
  .badge {
    font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 99px;
    background: var(--accent); color: #fff; letter-spacing: 0.5px;
  }
  .live-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--green); animation: pulse 1.5s infinite; margin-left: auto;
  }
  .live-label { font-size: 12px; color: var(--green); font-weight: 600; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }

  .last-updated { font-size: 11px; color: var(--muted); margin-left: 8px; }

  main { padding: 20px 24px; display: grid; gap: 20px; }

  /* Stat cards row */
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
  .card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 10px; padding: 16px 20px;
  }
  .card-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; }
  .card-value { font-size: 32px; font-weight: 800; line-height: 1; }
  .card-value.green { color: var(--green); }
  .card-value.yellow { color: var(--yellow); }
  .card-value.blue { color: var(--blue); }
  .card-value.red { color: var(--red); }

  /* Tables */
  .section { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  .section-header {
    padding: 12px 16px; border-bottom: 1px solid var(--border);
    font-size: 12px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.8px; color: var(--muted); display: flex; align-items: center; gap: 8px;
  }
  .section-header .count {
    font-size: 11px; background: var(--border); color: var(--text);
    padding: 1px 7px; border-radius: 99px;
  }
  table { width: 100%; border-collapse: collapse; }
  th {
    padding: 8px 16px; text-align: left; font-size: 11px; font-weight: 600;
    color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px;
    background: rgba(255,255,255,0.03);
  }
  td { padding: 9px 16px; border-top: 1px solid var(--border); vertical-align: middle; }
  tr:hover td { background: rgba(255,255,255,0.03); }

  /* Event type chips */
  .chip {
    display: inline-block; font-size: 10px; font-weight: 700;
    padding: 2px 8px; border-radius: 99px; letter-spacing: 0.4px;
  }
  .chip-sent     { background: rgba(56,189,248,.15); color: var(--blue); }
  .chip-verified { background: rgba(16,185,129,.15); color: var(--green); }
  .chip-failed   { background: rgba(239,68,68,.15);  color: var(--red); }
  .chip-session  { background: rgba(99,102,241,.15); color: var(--accent); }
  .chip-reg      { background: rgba(245,158,11,.15); color: var(--yellow); }
  .chip-default  { background: var(--border); color: var(--muted); }

  /* TTL bar */
  .ttl-wrap { display: flex; align-items: center; gap: 8px; }
  .ttl-bar { flex: 1; height: 4px; background: var(--border); border-radius: 2px; max-width: 80px; }
  .ttl-fill { height: 100%; border-radius: 2px; background: var(--accent); transition: width .5s; }
  .ttl-text { font-size: 12px; color: var(--muted); white-space: nowrap; }

  .empty { padding: 20px 16px; color: var(--muted); font-size: 13px; text-align: center; }

  /* Scrollable log */
  .log-wrap { max-height: 420px; overflow-y: auto; }

  /* Detail text */
  .detail { color: var(--muted); font-size: 12px; }
  .ago    { color: var(--muted); font-size: 12px; white-space: nowrap; }
  .phone  { font-family: monospace; font-size: 13px; }
</style>
</head>
<body>

<header>
  <span style="font-size:22px">🔐</span>
  <h1>OTP Bridge Monitor</h1>
  <span class="badge">LIVE</span>
  <span class="last-updated" id="ts">—</span>
  <span class="live-dot"></span>
  <span class="live-label">auto-refresh 3s</span>
</header>

<main>

  <!-- Stat cards -->
  <div class="cards">
    <div class="card">
      <div class="card-label">Active OTPs</div>
      <div class="card-value blue" id="cnt-otp">—</div>
    </div>
    <div class="card">
      <div class="card-label">Active Sessions</div>
      <div class="card-value green" id="cnt-session">—</div>
    </div>
    <div class="card">
      <div class="card-label">Rate-Limited</div>
      <div class="card-value yellow" id="cnt-rate">—</div>
    </div>
    <div class="card">
      <div class="card-label">Events (log)</div>
      <div class="card-value" id="cnt-log">—</div>
    </div>
  </div>

  <!-- Active OTPs -->
  <div class="section">
    <div class="section-header">
      Pending OTPs
      <span class="count" id="otp-count">0</span>
    </div>
    <div id="otp-body">
      <div class="empty">No active OTPs</div>
    </div>
  </div>

  <!-- Rate-limited phones -->
  <div class="section">
    <div class="section-header">
      Rate-Limited Phones
      <span class="count" id="rate-count">0</span>
    </div>
    <div id="rate-body">
      <div class="empty">No rate-limited phones</div>
    </div>
  </div>

  <!-- Audit log -->
  <div class="section">
    <div class="section-header">
      Request / Response Audit Log
      <span class="count" id="log-count">0</span>
    </div>
    <div class="log-wrap">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Event</th>
            <th>Phone</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody id="log-body">
          <tr><td colspan="4" class="empty">No events yet</td></tr>
        </tbody>
      </table>
    </div>
  </div>

</main>

<script>
const OTP_TTL = 300;

function chipClass(type) {
  if (type.includes('sent'))     return 'chip-sent';
  if (type.includes('verified')) return 'chip-verified';
  if (type.includes('failed') || type.includes('expired')) return 'chip-failed';
  if (type.includes('session'))  return 'chip-session';
  if (type.includes('reg'))      return 'chip-reg';
  return 'chip-default';
}

function ttlBar(ttl, max) {
  const pct = Math.max(0, Math.min(100, (ttl / max) * 100));
  const col = pct > 50 ? '#10b981' : pct > 20 ? '#f59e0b' : '#ef4444';
  return `
    <div class="ttl-wrap">
      <div class="ttl-bar"><div class="ttl-fill" style="width:${pct}%;background:${col}"></div></div>
      <span class="ttl-text">${ttl}s</span>
    </div>`;
}

async function refresh() {
  try {
    const r = await fetch('data', { cache: 'no-store' });
    if (!r.ok) return;
    const d = await r.json();
    const { stats, log } = d;

    // Stat cards
    document.getElementById('cnt-otp').textContent     = stats.active_otps.length;
    document.getElementById('cnt-session').textContent = stats.active_sessions;
    document.getElementById('cnt-rate').textContent    = stats.rate_limited_phones.length;
    document.getElementById('cnt-log').textContent     = log.length;
    document.getElementById('ts').textContent          = 'Updated ' + new Date().toLocaleTimeString();

    // Active OTPs table
    const otpCount = document.getElementById('otp-count');
    const otpBody  = document.getElementById('otp-body');
    otpCount.textContent = stats.active_otps.length;
    if (stats.active_otps.length === 0) {
      otpBody.innerHTML = '<div class="empty">No active OTPs</div>';
    } else {
      otpBody.innerHTML = `
        <table>
          <thead><tr><th>Phone</th><th>Expires in</th><th>Attempts used</th></tr></thead>
          <tbody>
            ${stats.active_otps.map(o => `
              <tr>
                <td class="phone">${o.phone}</td>
                <td>${ttlBar(o.ttl_seconds, OTP_TTL)}</td>
                <td style="color:${o.attempts_used>0?'#f59e0b':'#10b981'}">${o.attempts_used} / 3</td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    }

    // Rate-limited table
    const rateCount = document.getElementById('rate-count');
    const rateBody  = document.getElementById('rate-body');
    rateCount.textContent = stats.rate_limited_phones.length;
    if (stats.rate_limited_phones.length === 0) {
      rateBody.innerHTML = '<div class="empty">No rate-limited phones</div>';
    } else {
      rateBody.innerHTML = `
        <table>
          <thead><tr><th>Phone</th><th>Retry in</th></tr></thead>
          <tbody>
            ${stats.rate_limited_phones.map(p => `
              <tr>
                <td class="phone">${p.phone}</td>
                <td>${ttlBar(p.retry_in_seconds, 60)}</td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    }

    // Audit log
    const logCount = document.getElementById('log-count');
    const logBody  = document.getElementById('log-body');
    logCount.textContent = log.length;
    if (log.length === 0) {
      logBody.innerHTML = '<tr><td colspan="4" class="empty">No events yet — send an OTP to see activity</td></tr>';
    } else {
      logBody.innerHTML = log.map(e => `
        <tr>
          <td class="ago">${e.ago}</td>
          <td><span class="chip ${chipClass(e.type)}">${e.type}</span></td>
          <td class="phone">${e.phone}</td>
          <td class="detail">${e.detail || '—'}</td>
        </tr>`).join('');
    }

  } catch(err) {
    document.getElementById('ts').textContent = 'Error: ' + err.message;
  }
}

refresh();
setInterval(refresh, 3000);
</script>
</body>
</html>"""


@router.get("/monitor", include_in_schema=False)
async def monitor_page() -> HTMLResponse:
    return HTMLResponse(_HTML)
