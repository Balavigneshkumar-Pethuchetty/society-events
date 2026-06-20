"""Refund task queue and completion (FR-07)."""
from fastapi import APIRouter, Depends, HTTPException

from app.adapters.factory import get_processor
from app.auth import require_role
from app.database import get_pool
from app.models import RefundCompleteBody, TransactionOut

router = APIRouter()

_TXN_QUERY = """
    SELECT pt.id::text, pt.txn_ref, pt.event_id::text,
           pt.registration_id::text, pt.user_id::text,
           pt.amount, pt.currency, pt.payee_upi, pt.payer_upi,
           pt.status, pt.payment_utr, pt.refund_utr,
           pt.created_at, pt.updated_at,
           e.title AS event_title,
           u.name  AS user_name, u.email AS user_email, u.keycloak_sub
    FROM payment_transaction pt
    JOIN event e ON e.id = pt.event_id
    JOIN users u ON u.id = pt.user_id
"""


def _build_out(row) -> dict:
    d = dict(row)
    d["amount"] = float(d["amount"])
    return d


# ── GET /refunds ──────────────────────────────────────────────────────────────

@router.get("", summary="Refund task queue (committee members / admin)")
async def list_refunds(
    claims: dict = Depends(require_role("admin", "committee_member")),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            _TXN_QUERY + " WHERE pt.status = 'refund_requested' ORDER BY pt.updated_at ASC"
        )
    return [_build_out(r) for r in rows]


# ── POST /refunds/{txn_ref}/complete ─────────────────────────────────────────

@router.post("/{txn_ref}/complete", response_model=dict,
             summary="Log refund UTR and close the ledger entry (FR-07)")
async def complete_refund(
    txn_ref: str,
    body: RefundCompleteBody,
    claims: dict = Depends(require_role("admin", "committee_member")),
):
    processor = get_processor()
    return await processor.process_refund(txn_ref, body.refund_utr)
