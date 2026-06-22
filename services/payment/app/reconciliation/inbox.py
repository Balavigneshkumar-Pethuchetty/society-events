"""IMAP inbox listener for auto-reconciliation.

Settings are loaded from the DB on every scan so changes made via the
admin UI take effect without restarting the service.
"""
import asyncio
import email as email_lib
from datetime import datetime, timezone
from typing import Optional

from app.database import get_pool
from app.reconciliation.parser import extract_all_ai, extract_all_regex

# In-memory state visible to /reconciliation/status
_last_run_at: Optional[datetime] = None
_last_matched_utrs: list[str] = []
_lock = asyncio.Lock()


# ── DB settings loader ────────────────────────────────────────────────────────

async def _load_settings() -> dict:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT imap_host, imap_port, imap_user, imap_password,
                      imap_mailbox, poll_interval_s, use_ai_parser,
                      ollama_host, ollama_model
               FROM payment_reconciliation_settings WHERE id = 1"""
        )
    return dict(row) if row else {}


# ── Public entry points ───────────────────────────────────────────────────────

async def reconciliation_loop() -> None:
    while True:
        cfg = await _load_settings()
        interval = cfg.get("poll_interval_s", 300)
        await asyncio.sleep(interval)
        if cfg.get("imap_host") and cfg.get("imap_user") and cfg.get("imap_password"):
            try:
                await _scan_once(cfg)
            except Exception as exc:
                print(f"[reconciliation] inbox scan error: {exc}")


async def manual_scan() -> dict:
    """Triggered by POST /reconciliation/scan."""
    cfg = await _load_settings()
    if not (cfg.get("imap_host") and cfg.get("imap_user") and cfg.get("imap_password")):
        return {"emails_processed": 0, "matched": 0, "unmatched": 0, "detail": "IMAP not configured"}
    return await _scan_once(cfg)


# ── Core scan ─────────────────────────────────────────────────────────────────

async def _scan_once(cfg: dict) -> dict:
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

    use_ai    = cfg.get("use_ai_parser", False)
    ol_host   = cfg.get("ollama_host", "http://localhost:11434")
    ol_model  = cfg.get("ollama_model", "llama3")

    for msg_id in msg_ids:
        mid = msg_id.decode()
        _, msg_data = await imap.fetch(mid, "(RFC822)")
        raw  = msg_data[1] if len(msg_data) > 1 else b""
        body = _extract_body(email_lib.message_from_bytes(raw))

        if use_ai:
            utr, amount, payer_vpa = await extract_all_ai(body, ol_host, ol_model)
        else:
            utr, amount, payer_vpa = extract_all_regex(body)

        if utr and amount:
            ok = await _match_and_verify(utr, amount, payer_vpa)
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

async def _match_and_verify(utr: str, amount: float, payer_vpa: Optional[str]) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Idempotency: skip if UTR already recorded
        exists = await conn.fetchval(
            "SELECT id FROM payment_transaction WHERE payment_utr = $1", utr
        )
        if exists:
            return False

        # Try precise match first: payer VPA + amount
        row = None
        if payer_vpa:
            row = await conn.fetchrow(
                """SELECT id::text, txn_ref, registration_id::text
                   FROM payment_transaction
                   WHERE status = 'pending'
                     AND ABS(amount - $1::numeric) < 0.01
                     AND LOWER(payer_upi) = $2
                   ORDER BY created_at ASC
                   LIMIT 1""",
                amount, payer_vpa,
            )

        # Fall back to amount-only if no VPA match
        if not row:
            row = await conn.fetchrow(
                """SELECT id::text, txn_ref, registration_id::text
                   FROM payment_transaction
                   WHERE status = 'pending'
                     AND ABS(amount - $1::numeric) < 0.01
                   ORDER BY created_at ASC
                   LIMIT 1""",
                amount,
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
