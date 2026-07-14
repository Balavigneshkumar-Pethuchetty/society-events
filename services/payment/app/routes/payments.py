"""Payment lifecycle routes (FR-01, FR-03, FR-04, FR-06, FR-08)."""
import os
import secrets
import uuid
from typing import Optional

import aiofiles
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel

from app import reconciliation_client
from app.adapters.factory import get_processor
from app.auth import get_current_claims, require_role
from app.config import settings
from app.database import get_pool
from app.models import InitiateBody, TransactionOut, VerifyBody
from app.notifications import resolve_and_record, send_channels


class ApproveBody(BaseModel):
    notes: Optional[str] = None


class RejectBody(BaseModel):
    notes: Optional[str] = None


class AutoConfirmBody(BaseModel):
    event_id: str
    registration_id: str
    reconciliation_txn_id: str
    upi_ref: str
    amount: float
    payer_upi: Optional[str] = None


class CheckoutIntentBody(BaseModel):
    event_id: str
    registration_id: Optional[str] = None

router = APIRouter()

_TXN_QUERY = """
    SELECT pt.id::text, pt.txn_ref, pt.event_id::text,
           pt.registration_id::text, pt.user_id::text,
           pt.amount, pt.currency, pt.payee_upi, pt.payer_upi,
           pt.status, pt.payment_utr, pt.refund_utr,
           pt.screenshot_path, pt.refund_screenshot_path,
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
        screenshot_url=f"/api/payments/uploads/{d['screenshot_path']}" if d.get("screenshot_path") else None,
        refund_screenshot_url=(
            f"/api/payments/uploads/{d['refund_screenshot_path']}" if d.get("refund_screenshot_path") else None
        ),
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


# ── POST /payments/checkout-intent ─────────────────────────────────────────────
# Backend wrapper around the external Payment Reconciliation service's
# /createPayment — resolves the correct receiver UPI (this event's collector,
# from committee_registry) server-side before calling out, so residents can
# never be pinned to that service's own hardcoded default VPA, and the amount
# can't be tampered with client-side.

@router.post("/checkout-intent", response_model=dict,
             summary="Create a centralized-reconciliation payment intent for the caller's own checkout")
async def checkout_intent(
    body: CheckoutIntentBody,
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

        collector = await conn.fetchrow(
            """SELECT cr.upi_id, u.name AS member_name,
                      e.title, e.ticket_price, e.price_currency,
                      ec.name AS category_name
               FROM committee_registry cr
               JOIN users u  ON u.id  = cr.member_id
               JOIN event e  ON e.id  = cr.event_id
               LEFT JOIN event_category ec ON ec.id = e.category_id
               WHERE cr.event_id = $1::uuid""",
            body.event_id,
        )
        if not collector:
            raise HTTPException(
                status_code=400,
                detail="No collector assigned for this event. Contact an admin.",
            )

        ticket_count: Optional[int] = None
        if body.registration_id:
            reg = await conn.fetchrow(
                "SELECT total_amount, ticket_count FROM registration WHERE id = $1::uuid",
                body.registration_id,
            )
            amount = float(reg["total_amount"]) if reg else float(collector["ticket_price"] or 0)
            ticket_count = reg["ticket_count"] if reg else None
        else:
            amount = float(collector["ticket_price"] or 0)

        flat = await conn.fetchrow(
            """SELECT a.block, a.unit_number
               FROM user_apartments ua
               JOIN apartment a ON a.id = ua.apartment_id
               WHERE ua.user_id = $1::uuid LIMIT 1""",
            user_id,
        )
        flat_number = f"{flat['block']}-{flat['unit_number']}" if flat else None

        notify_email = await conn.fetchval("SELECT email FROM users WHERE id = $1::uuid", user_id)

    event_title = collector["title"]
    payload = {
        "ctx_type": "EVENT",
        "amount": amount,
        "upi_vpa": collector["upi_id"],
        "upi_display_name": collector["member_name"],
        "reference": f"{event_title} Ticket",
        "description": f"{ticket_count}x ticket" if ticket_count else event_title,
        "flat_number": flat_number,
        "member_id": user_id,
        "payment_category": _slugify(event_title),
        "tags": [collector["category_name"], "ticket"] if collector["category_name"] else ["ticket"],
        "notify_email": notify_email,
        "expiry_hours": 24,
    }

    return await reconciliation_client.create_payment_intent(payload)


def _slugify(text: str) -> str:
    return "_".join(text.lower().split())


# ── POST /payments/parse-screenshot ─────────────────────────────────────────────
# Lets the resident preview what the AI extracted from their screenshot before it's
# used for verification, since Ollama's vision extraction isn't always accurate.

@router.post("/parse-screenshot", response_model=dict,
             summary="Extract amount/UTR/bank from a payment screenshot for the caller to review")
async def parse_screenshot(
    file: UploadFile = File(...),
    claims: dict = Depends(get_current_claims),
):
    content = await file.read()
    result = await reconciliation_client.parse_screenshot(
        content, file.filename or "screenshot", file.content_type or "image/jpeg",
    )
    extracted_data = result.get("extracted_data") or {}
    return {
        "parse_id": result.get("parse_id"),
        "source_type": result.get("source_type"),
        "extracted_amount": result.get("extracted_amount"),
        "extracted_upi_ref": result.get("extracted_upi_ref"),
        "extracted_rrn": result.get("extracted_rrn"),
        "extracted_bank": result.get("extracted_bank"),
        "extracted_timestamp": result.get("extracted_timestamp"),
        "extracted_status": result.get("extracted_status"),
        "is_reconciled": result.get("is_reconciled"),
        "parse_method": extracted_data.get("parse_method"),
        # Candidate existing payment_transaction rows the reconciliation service thinks this
        # screenshot could belong to (matched on amount/timing) — lets the caller sanity-check
        # they uploaded the screenshot for the right transaction before submitting for verification.
        "match_candidates": extracted_data.get("match_candidates") or [],
    }


# ── POST /payments/verify-screenshot ────────────────────────────────────────────
# Resolves the active reconciliation channel server-side (residents can't call
# GET /channels themselves — admin/committee_member only) and forwards the
# resident's (possibly manually-corrected) amount/UTR as overrides.
#
# Persists a `payment_transaction` row (status='pending') plus the screenshot to disk
# BEFORE calling out to the reconciliation service, so an organizer has something to
# review in ReconciliationConsole even if reconciliation is slow, ambiguous, or never
# confirms — previously a row only ever appeared later, in /auto-confirm, and only if
# the SSE verdict was CONFIRMED.

@router.post("/verify-screenshot", response_model=dict,
             summary="Submit a payment screenshot for verification against the bank email")
async def verify_screenshot(
    background_tasks: BackgroundTasks,
    event_id: str = Form(...),
    registration_id: str = Form(...),
    file: UploadFile = File(...),
    txn_id: Optional[str] = Form(None),
    manual_upi_ref: Optional[str] = Form(None),
    manual_amount: Optional[float] = Form(None),
    payer_upi: Optional[str] = Form(None),
    search_days: int = Form(3),
    claims: dict = Depends(get_current_claims),
):
    channels = await reconciliation_client.list_channels()
    active = next((c for c in channels if c.get("is_active")), None)
    if not active:
        raise HTTPException(status_code=400, detail="No payment channel is configured. Contact an admin.")

    content = await file.read()

    sub = claims.get("sub", "")
    pool = await get_pool()
    async with pool.acquire() as conn:
        user_id = await conn.fetchval("SELECT id::text FROM users WHERE keycloak_sub = $1", sub)
        if not user_id:
            raise HTTPException(status_code=404, detail="User not found")

        collector = await conn.fetchrow(
            "SELECT cr.upi_id FROM committee_registry cr WHERE cr.event_id = $1::uuid",
            event_id,
        )
        reg = await conn.fetchrow(
            "SELECT total_amount, price_currency, e.title AS event_title FROM registration r "
            "JOIN event e ON e.id = r.event_id WHERE r.id = $1::uuid",
            registration_id,
        )
        amount = manual_amount if manual_amount is not None else float(reg["total_amount"]) if reg else 0.0
        currency = reg["price_currency"] if reg else "INR"

        ext = (file.filename or "screenshot.jpg").rsplit(".", 1)[-1].lower()
        filename = f"{uuid.uuid4()}.{ext}"
        save_dir = os.path.join(settings.uploads_dir, "payment-screenshots")
        os.makedirs(save_dir, exist_ok=True)
        async with aiofiles.open(os.path.join(save_dir, filename), "wb") as f:
            await f.write(content)
        screenshot_path = f"payment-screenshots/{filename}"

        idempotency_key = f"reconciliation-screenshot:{registration_id}"
        txn_ref = "TXN" + secrets.token_hex(8).upper()

        txn_row = await conn.fetchrow(
            """
            INSERT INTO payment_transaction
                (txn_ref, event_id, registration_id, user_id, amount, currency,
                 payee_upi, payer_upi, payment_utr, screenshot_path,
                 reconciliation_txn_id, status, idempotency_key)
            VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, $10, $11, 'pending', $12)
            ON CONFLICT (idempotency_key) DO UPDATE SET
                amount = EXCLUDED.amount, payer_upi = EXCLUDED.payer_upi,
                payment_utr = EXCLUDED.payment_utr, screenshot_path = EXCLUDED.screenshot_path,
                reconciliation_txn_id = EXCLUDED.reconciliation_txn_id, updated_at = now()
            WHERE payment_transaction.status = 'pending'
            RETURNING id, (xmax = 0) AS inserted
            """,
            txn_ref, event_id, registration_id, user_id, amount, currency,
            collector["upi_id"] if collector else None, payer_upi, manual_upi_ref,
            screenshot_path, txn_id, idempotency_key,
        )

        # Only notify on a genuine fresh submission — xmax=0 means the INSERT
        # landed, not the ON CONFLICT DO UPDATE path (a retry/re-upload of the
        # same registration would otherwise double-notify organizers).
        recipients: list[dict] = []
        message = f"A resident submitted a payment screenshot for \"{reg['event_title'] if reg else 'an event'}\" — please review."
        if txn_row and txn_row["inserted"]:
            recipients = await resolve_and_record(
                conn, event_id, user_id, "payment_verification_requested",
                "Payment verification requested", message, related_id=str(txn_row["id"]),
            )

    if recipients:
        background_tasks.add_task(send_channels, recipients, message)

    return await reconciliation_client.verify_screenshot(
        content, file.filename or "screenshot", file.content_type or "image/jpeg",
        channel_id=active["id"], txn_id=txn_id,
        manual_upi_ref=manual_upi_ref, manual_amount=manual_amount,
        search_days=search_days,
    )


# ── POST /payments/auto-confirm ───────────────────────────────────────────────

@router.post("/auto-confirm", response_model=dict,
             summary="Auto-confirm a payment via reconciliation service verdict")
async def auto_confirm(
    body: AutoConfirmBody,
    claims: dict = Depends(get_current_claims),
):
    """Called by the frontend after receiving a CONFIRMED SSE event. Creates a
    verified payment_transaction and marks the registration confirmed — no admin
    action needed."""
    sub = claims.get("sub", "")
    pool = await get_pool()

    async with pool.acquire() as conn:
        user_id = await conn.fetchval(
            "SELECT id::text FROM users WHERE keycloak_sub = $1", sub
        )
        if not user_id:
            raise HTTPException(status_code=404, detail="User not found")

        reg = await conn.fetchrow(
            """SELECT r.id::text, r.status, r.total_amount, e.price_currency
               FROM registration r
               JOIN event e ON e.id = r.event_id
               WHERE r.id = $1::uuid AND r.user_id = $2::uuid""",
            body.registration_id, user_id,
        )
        if not reg:
            raise HTTPException(status_code=404, detail="Registration not found")

        # Idempotent: if already confirmed return the existing verified txn
        if reg["status"] == "confirmed":
            existing = await conn.fetchrow(
                "SELECT txn_ref FROM payment_transaction "
                "WHERE registration_id = $1::uuid AND status = 'verified' LIMIT 1",
                body.registration_id,
            )
            if existing:
                return {"txn_ref": existing["txn_ref"], "status": "verified"}

        currency = reg["price_currency"] or "INR"

        # /verify-screenshot already created a 'pending' row for this registration
        # (with the screenshot attached) when the resident submitted — update that
        # SAME row to 'verified' instead of inserting a duplicate. Only falls back to
        # inserting fresh if no such row exists (e.g. legacy/edge paths).
        existing_row = await conn.fetchrow(
            """UPDATE payment_transaction
               SET status = 'verified', payment_utr = $1, amount = $2,
                   payer_upi = COALESCE($3, payer_upi), updated_at = now()
               WHERE reconciliation_txn_id = $4 AND registration_id = $5::uuid
               RETURNING id::text, txn_ref""",
            body.upi_ref, body.amount, body.payer_upi,
            body.reconciliation_txn_id, body.registration_id,
        )
        if existing_row:
            txn_id, txn_ref = existing_row["id"], existing_row["txn_ref"]
            from_status = "pending"
        else:
            txn_ref = "TXN" + secrets.token_hex(8).upper()
            idempotency_key = f"reconciliation:{body.reconciliation_txn_id}"
            txn_id = await conn.fetchval(
                """INSERT INTO payment_transaction
                   (txn_ref, event_id, registration_id, user_id, amount, currency,
                    payment_utr, payer_upi, reconciliation_txn_id, status, idempotency_key)
                   VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, 'verified', $10)
                   RETURNING id::text""",
                txn_ref, body.event_id, body.registration_id, user_id,
                body.amount, currency, body.upi_ref, body.payer_upi,
                body.reconciliation_txn_id, idempotency_key,
            )
            from_status = None

        await conn.execute(
            """INSERT INTO payment_audit_log (txn_id, from_status, to_status, updated_by, note)
               VALUES ($1::uuid, $2, 'verified', $3, $4)""",
            txn_id, from_status, sub,
            f"Auto-confirmed via reconciliation service. Rec TXN: {body.reconciliation_txn_id}",
        )
        await conn.execute(
            "UPDATE registration SET status = 'confirmed' WHERE id = $1::uuid",
            body.registration_id,
        )
        # This registration's legacy `payment` row (created at registration time,
        # independent of which payment system is actually used) is otherwise never
        # touched by the reconciliation flow — leaving it stuck at 'pending_screenshot'
        # forever even though the registration is confirmed. Close it out too so legacy
        # consumers (PaymentApprovals, /registrations' bucketing) see consistent state.
        await conn.execute(
            """UPDATE payment SET status = 'approved',
                   review_notes = 'Auto-approved via centralized reconciliation'
               WHERE registration_id = $1::uuid AND status IN ('pending_screenshot', 'pending_review')""",
            body.registration_id,
        )

    return {"txn_ref": txn_ref, "status": "verified"}


# ── POST /payments/{txn_ref}/sync-reconciliation ─────────────────────────────
# Recovery path for the gap /auto-confirm can't cover: that call is fired by the
# resident's own browser after an SSE verdict (or straight off the verify-screenshot
# HTTP response) and is best-effort on the frontend — a closed tab, a dropped SSE
# connection, or any error in that fire-and-forget request silently leaves this row
# 'pending' forever even though the reconciliation service already confirmed it.
# Lets an admin/committee member re-check the source of truth and repair the row.

@router.post("/{txn_ref}/sync-reconciliation", response_model=dict,
             summary="Re-check a stuck pending transaction against the reconciliation "
                      "service and repair it if already reconciled there (admin/committee)")
async def sync_reconciliation(
    txn_ref: str,
    claims: dict = Depends(require_role("admin", "committee_member")),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT id::text, status, registration_id::text, reconciliation_txn_id
               FROM payment_transaction WHERE txn_ref = $1""",
            txn_ref,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Transaction not found")
        if row["status"] != "pending":
            return {"txn_ref": txn_ref, "local_status": row["status"], "synced": False,
                     "message": "Not pending locally — nothing to sync."}
        if not row["reconciliation_txn_id"]:
            raise HTTPException(
                status_code=400,
                detail="This transaction has no reconciliation_txn_id — it wasn't created "
                       "through the centralized reconciliation flow, so there's nothing to check.",
            )

        remote = await reconciliation_client.get_transaction_status(row["reconciliation_txn_id"])
        if remote.get("status") != "RECONCILED":
            return {"txn_ref": txn_ref, "local_status": "pending",
                     "remote_status": remote.get("status"), "synced": False}

        txn_id = row["id"]
        await conn.execute(
            """UPDATE payment_transaction
               SET status = 'verified', payment_utr = COALESCE($1, payment_utr), updated_at = now()
               WHERE id = $2::uuid""",
            remote.get("processor_ref_id"), txn_id,
        )
        await conn.execute(
            """INSERT INTO payment_audit_log (txn_id, from_status, to_status, updated_by, note)
               VALUES ($1::uuid, 'pending', 'verified', $2, $3)""",
            txn_id, claims.get("sub", "admin"),
            f"Synced from reconciliation service (was stuck pending). Rec TXN: {row['reconciliation_txn_id']}",
        )
        if row["registration_id"]:
            await conn.execute(
                "UPDATE registration SET status = 'confirmed' WHERE id = $1::uuid",
                row["registration_id"],
            )
            # See the same UPDATE in /auto-confirm — the legacy `payment` row is
            # otherwise never touched by the reconciliation flow.
            await conn.execute(
                """UPDATE payment SET status = 'approved',
                       review_notes = 'Auto-approved via centralized reconciliation (synced)'
                   WHERE registration_id = $1::uuid AND status IN ('pending_screenshot', 'pending_review')""",
                row["registration_id"],
            )

    return {"txn_ref": txn_ref, "local_status": "verified",
             "remote_status": "RECONCILED", "synced": True}


# ── GET /payments/my ───────────────────────────────────────────────────────────
# Lets a resident view their own payment history (pending / verified / refund_requested /
# refunded / cancelled) across all their checkouts. GET /payments below is deliberately
# admin/committee-only (it lists EVERYONE's transactions) — residents need this separate,
# caller-scoped endpoint instead. Must stay registered before GET /{txn_ref} so "my" isn't
# swallowed as a txn_ref value.

@router.get("/my", response_model=list[TransactionOut],
            summary="Get the caller's own payment transactions")
async def list_my_transactions(
    claims: dict = Depends(get_current_claims),
):
    sub = claims.get("sub", "")
    pool = await get_pool()
    async with pool.acquire() as conn:
        user_id = await conn.fetchval("SELECT id::text FROM users WHERE keycloak_sub = $1", sub)
        if not user_id:
            raise HTTPException(status_code=404, detail="User not found")
        rows = await conn.fetch(
            _TXN_QUERY + " WHERE pt.user_id = $1::uuid ORDER BY pt.created_at DESC",
            user_id,
        )
    return [_build_out(r) for r in rows]


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
