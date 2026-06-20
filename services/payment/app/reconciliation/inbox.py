"""IMAP inbox listener for auto-reconciliation (FR-05).

Runs as an asyncio background task. If IMAP is not configured the task
silently no-ops so the service still works with manual UTR entry only.
"""
import asyncio
import email as email_lib
from datetime import datetime, timezone
from typing import Optional

from app.config import settings
from app.database import get_pool
from app.reconciliation.parser import extract_utr_amount

# In-memory state visible to the /reconciliation/status endpoint
_last_run_at: Optional[datetime] = None
_last_matched_utrs: list[str] = []
_lock = asyncio.Lock()


async def reconciliation_loop() -> None:
    while True:
        await asyncio.sleep(settings.reconciliation_interval_seconds)
        if settings.imap_host and settings.imap_user and settings.imap_password:
            try:
                await _scan_once()
            except Exception as exc:
                print(f"[reconciliation] inbox scan error: {exc}")


async def manual_scan() -> dict:
    """Triggered by POST /reconciliation/scan (FR-06 operator action)."""
    if not (settings.imap_host and settings.imap_user and settings.imap_password):
        return {"emails_processed": 0, "matched": 0, "unmatched": 0}
    return await _scan_once()


async def _scan_once() -> dict:
    global _last_run_at, _last_matched_utrs

    try:
        import aioimaplib
    except ImportError:
        return {"emails_processed": 0, "matched": 0, "unmatched": 0}

    imap = aioimaplib.IMAP4_SSL(host=settings.imap_host, port=settings.imap_port)
    await imap.wait_hello_from_server()
    await imap.login(settings.imap_user, settings.imap_password)
    await imap.select(settings.imap_mailbox)

    _, data = await imap.search("UNSEEN")
    msg_ids: list[bytes] = data[0].split() if data and data[0] else []

    matched = 0
    unmatched = 0
    new_utrs: list[str] = []

    for msg_id in msg_ids:
        mid = msg_id.decode()
        _, msg_data = await imap.fetch(mid, "(RFC822)")
        raw = msg_data[1] if len(msg_data) > 1 else b""
        body = _extract_body(email_lib.message_from_bytes(raw))

        result = extract_utr_amount(body)
        if result:
            utr, amount = result
            ok = await _match_and_verify(utr, amount)
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


async def _match_and_verify(utr: str, amount: float) -> bool:
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Idempotency: skip if UTR already recorded (NFR-01)
        exists = await conn.fetchval(
            "SELECT id FROM payment_transaction WHERE payment_utr = $1", utr
        )
        if exists:
            return False

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
            row["id"], f"Auto-matched UTR {utr} via inbox scan",
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
