"""Payment lifecycle routes (FR-01, FR-03, FR-04, FR-06, FR-08)."""
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.adapters.factory import get_processor
from app.auth import get_current_claims, require_role
from app.database import get_pool
from app.models import InitiateBody, TransactionOut, VerifyBody


class ApproveBody(BaseModel):
    notes: Optional[str] = None


class RejectBody(BaseModel):
    notes: Optional[str] = None

router = APIRouter()

_TXN_QUERY = """
    SELECT pt.id::text, pt.txn_ref, pt.event_id::text,
           pt.registration_id::text, pt.user_id::text,
           pt.amount, pt.currency, pt.payee_upi, pt.payer_upi,
           pt.status, pt.payment_utr, pt.refund_utr,
           pt.created_at, pt.updated_at,
           e.title AS event_title,
           u.keycloak_sub, u.name AS user_name, u.email AS user_email
    FROM payment_transaction pt
    JOIN event e ON e.id = pt.event_id
    JOIN users u ON u.id = pt.user_id
"""


def _build_out(row) -> TransactionOut:
    d = dict(row)
    return TransactionOut(
        id=d["id"], txn_ref=d["txn_ref"],
        event_id=d["event_id"], event_title=d["event_title"],
        registration_id=d.get("registration_id"),
        amount=float(d["amount"]), currency=d["currency"],
        payee_upi=d.get("payee_upi"), payer_upi=d.get("payer_upi"),
        status=d["status"], payment_utr=d.get("payment_utr"),
        refund_utr=d.get("refund_utr"),
        created_at=d["created_at"], updated_at=d["updated_at"],
        user_name=d.get("user_name"), user_email=d.get("user_email"),
    )


# ── POST /payments/initiate ───────────────────────────────────────────────────

@router.post("/initiate", response_model=dict,
             summary="Initiate a payment (creates PENDING transaction)")
async def initiate(
    body: InitiateBody,
    claims: dict = Depends(get_current_claims),
):
    sub = claims.get("sub", "")
    pool = await get_pool()
    async with pool.acquire() as conn:
        user_id = await conn.fetchval(
            "SELECT id::text FROM users WHERE keycloak_sub = $1", sub
        )
    if not user_id:
        raise HTTPException(status_code=404, detail="User not found")

    idempotency_key = f"{user_id}:{body.event_id}:{body.registration_id or 'none'}"
    processor = get_processor()
    result = await processor.initiate_payment({
        "event_id": body.event_id,
        "registration_id": body.registration_id,
        "user_id": user_id,
        "payer_upi": body.payer_upi,
        "idempotency_key": idempotency_key,
    })
    return result


# ── GET /payments/{txn_ref} ───────────────────────────────────────────────────

@router.get("/{txn_ref}", response_model=TransactionOut,
            summary="Get a transaction (owner or privileged)")
async def get_transaction(
    txn_ref: str,
    claims: dict = Depends(get_current_claims),
):
    sub = claims.get("sub", "")
    realm_roles: list[str] = claims.get("realm_access", {}).get("roles", [])
    is_privileged = any(r in realm_roles for r in ("admin", "committee_member"))

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(_TXN_QUERY + " WHERE pt.txn_ref = $1", txn_ref)
    if not row:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if not is_privileged and row["keycloak_sub"] != sub:
        raise HTTPException(status_code=403, detail="Not your transaction")
    return _build_out(row)


# ── GET /payments ─────────────────────────────────────────────────────────────

@router.get("", response_model=list[TransactionOut],
            summary="List/filter transactions (admin / committee)")
async def list_transactions(
    status: Optional[str] = Query(None),
    event_id: Optional[str] = Query(None),
    claims: dict = Depends(require_role("admin", "committee_member")),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Auto-verify any pending transactions whose registration was already
        # confirmed via the legacy Payment Approvals flow (screenshot-based).
        await conn.execute("""
            UPDATE payment_transaction pt
            SET status = 'verified', payment_utr = 'APPROVED-VIA-LEGACY', updated_at = now()
            FROM registration r
            WHERE pt.registration_id = r.id
              AND pt.status = 'pending'
              AND r.status = 'confirmed'
        """)

        conditions = ["1=1"]
        params: list = []
        i = 1
        if status:
            conditions.append(f"pt.status = ${i}"); params.append(status); i += 1
        if event_id:
            conditions.append(f"pt.event_id = ${i}::uuid"); params.append(event_id); i += 1

        where = " WHERE " + " AND ".join(conditions)
        rows = await conn.fetch(
            _TXN_QUERY + where + " ORDER BY pt.created_at DESC", *params
        )
    return [_build_out(r) for r in rows]


# ── POST /payments/{txn_ref}/verify ──────────────────────────────────────────

@router.post("/{txn_ref}/verify", response_model=dict,
             summary="Manual UTR entry fallback (FR-06, admin/committee)")
async def verify_manual(
    txn_ref: str,
    body: VerifyBody,
    claims: dict = Depends(require_role("admin", "committee_member")),
):
    processor = get_processor()
    return await processor.verify_payment(txn_ref, body.utr)


# ── POST /payments/{txn_ref}/approve ─────────────────────────────────────────

@router.post("/{txn_ref}/approve", response_model=dict,
             summary="Approve a pending payment without UTR (admin/committee)")
async def approve_payment(
    txn_ref: str,
    body: ApproveBody,
    claims: dict = Depends(require_role("admin", "committee_member")),
):
    approver = claims.get("sub", "admin")
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id::text, status, registration_id::text FROM payment_transaction WHERE txn_ref = $1",
            txn_ref,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Transaction not found")
        if row["status"] == "verified":
            return {"status": "verified", "txn_ref": txn_ref}
        if row["status"] != "pending":
            raise HTTPException(status_code=400, detail=f"Cannot approve transaction in status: {row['status']}")

        auto_ref = "APPROVED-" + secrets.token_hex(4).upper()
        note = body.notes or "Manually approved by admin/committee"

        await conn.execute(
            "UPDATE payment_transaction SET status='verified', payment_utr=$1, updated_at=now() WHERE txn_ref=$2",
            auto_ref, txn_ref,
        )
        await conn.execute(
            """INSERT INTO payment_audit_log (txn_id, from_status, to_status, updated_by, note)
               VALUES ($1::uuid, 'pending', 'verified', $2, $3)""",
            row["id"], approver, note,
        )
        if row["registration_id"]:
            await conn.execute(
                "UPDATE registration SET status='confirmed' WHERE id=$1::uuid",
                row["registration_id"],
            )
    return {"status": "verified", "txn_ref": txn_ref}


# ── POST /payments/{txn_ref}/reject ──────────────────────────────────────────

@router.post("/{txn_ref}/reject", response_model=dict,
             summary="Reject a pending payment (admin/committee)")
async def reject_payment(
    txn_ref: str,
    body: RejectBody,
    claims: dict = Depends(require_role("admin", "committee_member")),
):
    rejector = claims.get("sub", "admin")
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id::text, status FROM payment_transaction WHERE txn_ref = $1", txn_ref
        )
        if not row:
            raise HTTPException(status_code=404, detail="Transaction not found")
        if row["status"] != "pending":
            raise HTTPException(status_code=400, detail=f"Cannot reject transaction in status: {row['status']}")

        note = body.notes or "Rejected by admin/committee"
        await conn.execute(
            "UPDATE payment_transaction SET status='cancelled', updated_at=now() WHERE txn_ref=$1",
            txn_ref,
        )
        await conn.execute(
            """INSERT INTO payment_audit_log (txn_id, from_status, to_status, updated_by, note)
               VALUES ($1::uuid, 'pending', 'cancelled', $2, $3)""",
            row["id"], rejector, note,
        )
    return {"status": "cancelled", "txn_ref": txn_ref}


# ── POST /payments/{txn_ref}/refund-request ──────────────────────────────────

@router.post("/{txn_ref}/refund-request", response_model=dict,
             summary="Flag a verified transaction for refund (admin)")
async def request_refund(
    txn_ref: str,
    claims: dict = Depends(require_role("admin")),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id::text, status FROM payment_transaction WHERE txn_ref = $1", txn_ref
        )
        if not row:
            raise HTTPException(status_code=404, detail="Transaction not found")
        if row["status"] != "verified":
            raise HTTPException(status_code=400, detail=f"Transaction must be verified first (current: {row['status']})")
        await conn.execute(
            "UPDATE payment_transaction SET status='refund_requested', updated_at=now() WHERE txn_ref=$1",
            txn_ref,
        )
        await conn.execute(
            """INSERT INTO payment_audit_log (txn_id, from_status, to_status, updated_by, note)
               VALUES ($1::uuid, 'verified', 'refund_requested', $2, 'Refund requested by admin')""",
            row["id"], claims.get("sub", "admin"),
        )
    return {"status": "refund_requested", "txn_ref": txn_ref}
