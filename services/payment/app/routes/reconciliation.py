"""Reconciliation endpoints (FR-05, FR-06)."""
from fastapi import APIRouter, Depends

from app.auth import require_role
from app.database import get_pool
from app.models import ReconciliationStatus, ScanResult
from app.reconciliation import inbox

router = APIRouter()


@router.post("/scan", response_model=ScanResult,
             summary="Trigger inbox fetch + parse + match across every configured event (idempotent, NFR-01)")
async def scan(
    claims: dict = Depends(require_role("admin", "committee_member")),
):
    result = await inbox.manual_scan()
    return ScanResult(**result)


@router.get("/status", response_model=ReconciliationStatus,
            summary="Last run time, pending count, recently matched UTRs")
async def status(
    claims: dict = Depends(require_role("admin", "committee_member")),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        pending = await conn.fetchval(
            "SELECT COUNT(*) FROM payment_transaction WHERE status = 'pending'"
        )
        configured_events = await conn.fetchval(
            """SELECT COUNT(*) FROM committee_registry
               WHERE imap_host <> '' AND imap_user <> '' AND imap_password <> ''"""
        )
    state = inbox.get_state()
    return ReconciliationStatus(
        last_run_at=state["last_run_at"],
        pending_count=int(pending),
        last_matched_utrs=state["last_matched_utrs"],
        imap_configured_events=int(configured_events),
    )
