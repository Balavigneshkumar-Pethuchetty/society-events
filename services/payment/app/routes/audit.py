"""Audit trail endpoint (NFR-02)."""
from fastapi import APIRouter, Depends, Query

from app.auth import require_role
from app.database import get_pool
from app.models import AuditEntry

router = APIRouter()


@router.get("", response_model=list[AuditEntry],
            summary="Ordered state-transition trail for a transaction")
async def get_audit(
    txn_ref: str = Query(...),
    claims: dict = Depends(require_role("admin", "committee_member")),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        txn = await conn.fetchrow(
            "SELECT id::text FROM payment_transaction WHERE txn_ref = $1", txn_ref
        )
        if not txn:
            return []
        rows = await conn.fetch(
            """SELECT id::text, txn_id::text, from_status, to_status, updated_by, note, at
               FROM payment_audit_log
               WHERE txn_id = $1::uuid
               ORDER BY at ASC""",
            txn["id"],
        )
    return [dict(r) for r in rows]
