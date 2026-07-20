"""IMAP inbox listener for auto-reconciliation.

Each event configures its own mailbox in `committee_registry` (imap_host/user/
password/mailbox), settable/changeable at any time by that event's organizer via
`PUT /registry/{event_id}/settings`. The background loop re-reads the list of
configured mailboxes every tick, so changes take effect without restarting the
service. Scan cadence and AI-parser config remain a single deployment-wide row
(`payment_reconciliation_settings`).
"""
import asyncio
import email as email_lib
from datetime import datetime, timezone
from typing import Optional

from app.config import settings
from app.crypto import decrypt
from app.database import get_pool
from app.reconciliation.parser import extract_all_ai, extract_all_claude, extract_all_regex

# In-memory state visible to /reconciliation/status
_last_run_at: Optional[datetime] = None
_last_matched_utrs: list[str] = []
_lock = asyncio.Lock()


# ── DB settings loaders ───────────────────────────────────────────────────────

async def _load_ai_settings() -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT poll_interval_s, use_ai_parser, ai_provider,
                      ollama_host, ollama_model
               FROM payment_reconciliation_settings WHERE id = 1"""
        )
    return dict(row) if row else {}


async def _load_event_mailboxes() -> list[dict]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT event_id::text, imap_host, imap_port, imap_user,
                      imap_password, imap_mailbox
               FROM committee_registry
               WHERE imap_host <> '' AND imap_user <> '' AND imap_password <> ''"""
        )
    configs = []
    for r in rows:
        d = dict(r)
        d["imap_password"] = decrypt(d["imap_password"])
        configs.append(d)
    return configs


# ── Public entry points ───────────────────────────────────────────────────────

async def reconciliation_loop() -> None:
    while True:
        ai_cfg = await _load_ai_settings()
        interval = ai_cfg.get("poll_interval_s", 300)
        await asyncio.sleep(interval)
        for event_cfg in await _load_event_mailboxes():
            try:
                await _scan_once(event_cfg["event_id"], event_cfg, ai_cfg)
            except Exception as exc:
                print(f"[reconciliation] inbox scan error (event {event_cfg['event_id']}): {exc}")


async def manual_scan() -> dict:
    """Triggered by POST /reconciliation/scan (admin, scans every configured event)."""
    ai_cfg = await _load_ai_settings()
    totals = {"emails_processed": 0, "matched": 0, "unmatched": 0}
    for event_cfg in await _load_event_mailboxes():
        try:
            result = await _scan_once(event_cfg["event_id"], event_cfg, ai_cfg)
            for k in totals:
                totals[k] += result.get(k, 0)
        except Exception as exc:
            print(f"[reconciliation] inbox scan error (event {event_cfg['event_id']}): {exc}")
    return totals


async def manual_scan_event(event_id: str) -> dict:
    """Triggered by POST /registry/{event_id}/settings/scan (event organizer)."""
    ai_cfg = await _load_ai_settings()
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT event_id::text, imap_host, imap_port, imap_user,
                      imap_password, imap_mailbox
               FROM committee_registry
               WHERE event_id = $1::uuid
                 AND imap_host <> '' AND imap_user <> '' AND imap_password <> ''""",
            event_id,
        )
    if not row:
        return {"emails_processed": 0, "matched": 0, "unmatched": 0, "detail": "IMAP not configured for this event"}
    cfg = dict(row)
    cfg["imap_password"] = decrypt(cfg["imap_password"])
    return await _scan_once(event_id, cfg, ai_cfg)


# ── Core scan ─────────────────────────────────────────────────────────────────

async def _scan_once(event_id: str, cfg: dict, ai_cfg: dict) -> dict:
    global _last_run_at, _last_matched_utrs

    try:
        import aioimaplib
    except ImportError:
        return {"emails_processed": 0, "matched": 0, "unmatched": 0, "detail": "aioimaplib not installed"}

    imap = aioimaplib.IMAP4_SSL(host=cfg["imap_host"], port=cfg.get("imap_port", 993))
    await imap.wait_hello_from_server()
    await imap.login(cfg["imap_user"], cfg["imap_password"])
    await imap.select(cfg.get("imap_mailbox", "INBOX"))

    _, data = await imap.search("UNSEEN")
    msg_ids: list[bytes] = data[0].split() if data and data[0] else []

    matched   = 0
    unmatched = 0
    new_utrs: list[str] = []

    use_ai    = ai_cfg.get("use_ai_parser", False)
    provider  = ai_cfg.get("ai_provider", "ollama")
    ol_host   = ai_cfg.get("ollama_host", "http://localhost:11434")
    ol_model  = ai_cfg.get("ollama_model", "llama3")

    for msg_id in msg_ids:
        mid = msg_id.decode()
        _, msg_data = await imap.fetch(mid, "(RFC822)")
        raw  = msg_data[1] if len(msg_data) > 1 else b""
        body = _extract_body(email_lib.message_from_bytes(raw))

        if use_ai and provider == "claude":
            utr, amount, payer_vpa = await extract_all_claude(
                body, settings.anthropic_api_key, settings.claude_model
            )
        elif use_ai:
            utr, amount, payer_vpa = await extract_all_ai(body, ol_host, ol_model)
        else:
            utr, amount, payer_vpa = extract_all_regex(body)

        if utr and amount:
            ok = await _match_and_verify(utr, amount, payer_vpa, event_id)
            if ok:
                matched += 1
                new_utrs.append(utr)
                await imap.store(mid, "+FLAGS", "\\Seen")
            else:
                unmatched += 1
        else:
            unmatched += 1

    await imap.logout()

    async with _lock:
        _last_run_at = datetime.now(timezone.utc)
        _last_matched_utrs = (new_utrs + _last_matched_utrs)[:10]

    return {"emails_processed": len(msg_ids), "matched": matched, "unmatched": unmatched}


def _extract_body(msg) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() in ("text/plain", "text/html"):
                payload = part.get_payload(decode=True)
                if payload:
                    return payload.decode("utf-8", errors="ignore")
    payload = msg.get_payload(decode=True)
    return payload.decode("utf-8", errors="ignore") if payload else ""


# ── Transaction matching ──────────────────────────────────────────────────────

async def _match_and_verify(utr: str, amount: float, payer_vpa: Optional[str], event_id: str) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Idempotency: skip if UTR already recorded
        exists = await conn.fetchval(
            "SELECT id FROM payment_transaction WHERE payment_utr = $1", utr
        )
        if exists:
            return False

        # Try precise match first: payer VPA + amount, scoped to this event
        row = None
        if payer_vpa:
            row = await conn.fetchrow(
                """SELECT id::text, txn_ref, registration_id::text
                   FROM payment_transaction
                   WHERE status = 'pending'
                     AND event_id = $1::uuid
                     AND ABS(amount - $2::numeric) < 0.01
                     AND LOWER(payer_upi) = $3
                   ORDER BY created_at ASC
                   LIMIT 1""",
                event_id, amount, payer_vpa,
            )

        # Fall back to amount-only, still scoped to this event
        if not row:
            row = await conn.fetchrow(
                """SELECT id::text, txn_ref, registration_id::text
                   FROM payment_transaction
                   WHERE status = 'pending'
                     AND event_id = $1::uuid
                     AND ABS(amount - $2::numeric) < 0.01
                   ORDER BY created_at ASC
                   LIMIT 1""",
                event_id, amount,
            )

        if not row:
            return False

        await conn.execute(
            "UPDATE payment_transaction SET status='verified', payment_utr=$1, updated_at=now() WHERE id=$2::uuid",
            utr, row["id"],
        )
        await conn.execute(
            """INSERT INTO payment_audit_log (txn_id, from_status, to_status, updated_by, note)
               VALUES ($1::uuid, 'pending', 'verified', 'system_auto', $2)""",
            row["id"],
            f"Auto-matched UTR {utr}" + (f" via VPA {payer_vpa}" if payer_vpa else " via amount-only"),
        )
        if row["registration_id"]:
            await conn.execute(
                "UPDATE registration SET status='confirmed' WHERE id=$1::uuid",
                row["registration_id"],
            )
    return True


def get_state() -> dict:
    return {
        "last_run_at": _last_run_at,
        "last_matched_utrs": list(_last_matched_utrs),
    }
