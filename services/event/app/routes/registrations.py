import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from app.auth import get_current_claims, require_role
from app.config import settings
from app.database import get_pool
from app.models import PaymentReviewBody, RegistrationCreate, RegistrationOut, PaymentOut

router = APIRouter()

_SOCIETY = settings.society_id
_ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_MAX_BYTES = 10 * 1024 * 1024  # 10 MB


# ── helpers ───────────────────────────────────────────────────────────────────

async def _get_db_user_id(conn, keycloak_sub: str) -> str:
    row = await conn.fetchrow(
        "SELECT id::text FROM users WHERE keycloak_sub = $1", keycloak_sub
    )
    if not row:
        raise HTTPException(status_code=404, detail="User not found in database")
    return row["id"]


def _build_reg_out(row: dict) -> RegistrationOut:
    pay = None
    if row.get("payment_id"):
        pay = PaymentOut(
            id=row["payment_id"],
            status=row["payment_status"],
            payment_method=row.get("payment_method"),
            screenshot_path=row.get("screenshot_path"),
            utr_number=row.get("utr_number"),
            review_notes=row.get("review_notes"),
            created_at=row["payment_created_at"],
            reviewed_at=row.get("reviewed_at"),
        )
    return RegistrationOut(
        id=row["id"],
        event_id=row["event_id"],
        event_title=row["event_title"],
        event_start_time=row["event_start_time"],
        event_end_time=row["event_end_time"],
        event_venue=row["event_venue"],
        event_is_free=row["event_is_free"],
        event_image_color=row.get("category_color"),
        ticket_count=row["ticket_count"],
        total_amount=row["total_amount"],
        display_currency=row["display_currency"],
        status=row["status"],
        registered_at=row["registered_at"],
        payment=pay,
        user_name=row.get("user_name"),
        user_email=row.get("user_email"),
    )


_REG_QUERY = """
    SELECT
        r.id::text,
        r.event_id::text,
        r.ticket_count,
        r.total_amount,
        r.display_currency,
        r.status,
        r.registered_at,
        e.title        AS event_title,
        e.start_time   AS event_start_time,
        e.end_time     AS event_end_time,
        e.venue        AS event_venue,
        e.is_free      AS event_is_free,
        ec.color_hex   AS category_color,
        p.id::text     AS payment_id,
        p.status       AS payment_status,
        p.payment_method,
        p.screenshot_path,
        p.utr_number,
        p.review_notes,
        p.created_at   AS payment_created_at,
        p.reviewed_at,
        u.name         AS user_name,
        u.email        AS user_email,
        u.keycloak_sub
    FROM registration r
    JOIN event e        ON e.id = r.event_id
    LEFT JOIN event_category ec ON ec.id = e.category_id
    LEFT JOIN payment p ON p.registration_id = r.id
    LEFT JOIN users u   ON u.id = r.user_id
"""


# ── POST /registrations ───────────────────────────────────────────────────────

@router.post("", status_code=201, response_model=RegistrationOut,
             summary="Register for an event")
async def create_registration(
    body: RegistrationCreate,
    claims: dict = Depends(get_current_claims),
):
    sub = claims.get("sub", "")
    pool = await get_pool()
    async with pool.acquire() as conn:
        user_id = await _get_db_user_id(conn, sub)

        event = await conn.fetchrow(
            "SELECT id, title, ticket_price, price_currency, is_free, status, capacity "
            "FROM event WHERE id = $1::uuid AND society_id = $2::uuid",
            body.event_id, _SOCIETY,
        )
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        if event["status"] != "published":
            raise HTTPException(status_code=400, detail="Event is not open for registration")

        # Check capacity
        if event["capacity"] is not None:
            confirmed = await conn.fetchval(
                "SELECT COALESCE(SUM(ticket_count), 0) FROM registration "
                "WHERE event_id = $1::uuid AND status IN ('confirmed', 'pending_payment', 'pending_review')",
                body.event_id,
            )
            requested = sum(t.quantity for t in body.tickets) if body.tickets else body.ticket_count
            if confirmed + requested > event["capacity"]:
                raise HTTPException(status_code=400, detail="Not enough spots available")

        # Prevent double-registration
        existing = await conn.fetchval(
            "SELECT id FROM registration WHERE event_id = $1::uuid AND user_id = $2::uuid",
            body.event_id, user_id,
        )
        if existing:
            raise HTTPException(status_code=409, detail="Already registered for this event")

        # Calculate total
        if body.tickets:
            ticket_count = sum(t.quantity for t in body.tickets)
            total_amount = sum(
                Decimal(str(t.unit_price)) * t.quantity for t in body.tickets
            )
        else:
            ticket_count = body.ticket_count
            total_amount = Decimal(str(event["ticket_price"])) * ticket_count

        is_free = event["is_free"] or total_amount == 0
        reg_status = "confirmed" if is_free else "pending_payment"

        reg_id = await conn.fetchval(
            "INSERT INTO registration (event_id, user_id, ticket_count, total_amount, display_currency, status) "
            "VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6) RETURNING id::text",
            body.event_id, user_id, ticket_count, total_amount,
            event["price_currency"], reg_status,
        )

        # Create payment record for paid registrations
        payment_id: Optional[str] = None
        if not is_free:
            payment_id = await conn.fetchval(
                "INSERT INTO payment "
                "(registration_id, gateway_name, payment_method, original_amount, original_currency, "
                "settled_amount, settled_currency, status) "
                "VALUES ($1::uuid, 'manual', 'manual_upi', $2, $3, $2, 'INR', 'pending_screenshot') "
                "RETURNING id::text",
                reg_id, total_amount, event["price_currency"],
            )

        row = await conn.fetchrow(
            _REG_QUERY + " WHERE r.id = $1::uuid", reg_id
        )

    return _build_reg_out(dict(row))


# ── GET /registrations/my ─────────────────────────────────────────────────────

@router.get("/my", response_model=list[RegistrationOut],
            summary="Get my registrations")
async def my_registrations(claims: dict = Depends(get_current_claims)):
    sub = claims.get("sub", "")
    pool = await get_pool()
    async with pool.acquire() as conn:
        user_id = await _get_db_user_id(conn, sub)
        rows = await conn.fetch(
            _REG_QUERY + " WHERE r.user_id = $1::uuid ORDER BY r.registered_at DESC",
            user_id,
        )
    return [_build_reg_out(dict(r)) for r in rows]


# ── POST /registrations/{id}/screenshot ───────────────────────────────────────

@router.post("/{reg_id}/screenshot", response_model=RegistrationOut,
             summary="Upload payment screenshot")
async def upload_screenshot(
    reg_id: str,
    utr_number: Optional[str] = Form(None),
    file: UploadFile = File(...),
    claims: dict = Depends(get_current_claims),
):
    if file.content_type not in _ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, or WebP images are accepted")

    content = await file.read()
    if len(content) > _MAX_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 10 MB)")

    sub = claims.get("sub", "")
    pool = await get_pool()
    async with pool.acquire() as conn:
        user_id = await _get_db_user_id(conn, sub)

        reg = await conn.fetchrow(
            "SELECT r.id, r.user_id::text, r.status, p.id::text AS payment_id "
            "FROM registration r LEFT JOIN payment p ON p.registration_id = r.id "
            "WHERE r.id = $1::uuid",
            reg_id,
        )
        if not reg:
            raise HTTPException(status_code=404, detail="Registration not found")
        if reg["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not your registration")
        if reg["status"] not in ("pending_payment",):
            raise HTTPException(status_code=400, detail=f"Cannot upload screenshot for status: {reg['status']}")

        # Save file
        ext = (file.filename or "screenshot.jpg").rsplit(".", 1)[-1].lower()
        filename = f"{uuid.uuid4()}.{ext}"
        save_dir = os.path.join(settings.uploads_dir, "payment-screenshots")
        os.makedirs(save_dir, exist_ok=True)
        save_path = os.path.join(save_dir, filename)
        async with aiofiles.open(save_path, "wb") as f:
            await f.write(content)

        screenshot_rel = f"payment-screenshots/{filename}"

        await conn.execute(
            "UPDATE payment SET screenshot_path = $1, utr_number = $2, status = 'pending_review' "
            "WHERE id = $3::uuid",
            screenshot_rel, utr_number, reg["payment_id"],
        )

        row = await conn.fetchrow(_REG_QUERY + " WHERE r.id = $1::uuid", reg_id)

    return _build_reg_out(dict(row))


# ── GET /registrations (admin) ────────────────────────────────────────────────

@router.get("", response_model=list[RegistrationOut],
            summary="List all registrations (admin/committee)")
async def list_registrations(
    status: Optional[str] = None,
    claims: dict = Depends(require_role("admin", "committee_member")),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        if status:
            rows = await conn.fetch(
                _REG_QUERY + " WHERE e.society_id = $1::uuid AND p.status = $2 ORDER BY r.registered_at DESC",
                _SOCIETY, status,
            )
        else:
            rows = await conn.fetch(
                _REG_QUERY + " WHERE e.society_id = $1::uuid ORDER BY r.registered_at DESC",
                _SOCIETY,
            )
    return [_build_reg_out(dict(r)) for r in rows]


# ── PATCH /registrations/{id}/review (admin) ─────────────────────────────────

@router.patch("/{reg_id}/review", response_model=RegistrationOut,
              summary="Approve or reject a payment (admin/committee)")
async def review_payment(
    reg_id: str,
    body: PaymentReviewBody,
    claims: dict = Depends(require_role("admin", "committee_member")),
):
    sub = claims.get("sub", "")
    pool = await get_pool()
    async with pool.acquire() as conn:
        reviewer_id = await _get_db_user_id(conn, sub)

        reg = await conn.fetchrow(
            "SELECT r.id, r.status, p.id::text AS payment_id, p.status AS payment_status "
            "FROM registration r LEFT JOIN payment p ON p.registration_id = r.id "
            "WHERE r.id = $1::uuid",
            reg_id,
        )
        if not reg:
            raise HTTPException(status_code=404, detail="Registration not found")
        if reg["payment_status"] != "pending_review":
            raise HTTPException(
                status_code=400,
                detail=f"Payment is not pending review (current: {reg['payment_status']})",
            )

        now = datetime.now(timezone.utc)

        if body.action == "approve":
            await conn.execute(
                "UPDATE payment SET status = 'approved', review_notes = $1, "
                "reviewed_by = $2::uuid, reviewed_at = $3 WHERE id = $4::uuid",
                body.notes, reviewer_id, now, reg["payment_id"],
            )
            await conn.execute(
                "UPDATE registration SET status = 'confirmed' WHERE id = $1::uuid",
                reg_id,
            )
        else:
            await conn.execute(
                "UPDATE payment SET status = 'rejected', review_notes = $1, "
                "reviewed_by = $2::uuid, reviewed_at = $3, screenshot_path = NULL "
                "WHERE id = $4::uuid",
                body.notes, reviewer_id, now, reg["payment_id"],
            )
            # Reset to pending_payment so user can re-upload
            await conn.execute(
                "UPDATE registration SET status = 'pending_payment' WHERE id = $1::uuid",
                reg_id,
            )

        row = await conn.fetchrow(_REG_QUERY + " WHERE r.id = $1::uuid", reg_id)

    return _build_reg_out(dict(row))
