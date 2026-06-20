import io
import uuid
from datetime import datetime, timezone

import qrcode
import qrcode.image.svg
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response as FastAPIResponse

from app.auth import get_current_claims, require_role
from app.database import get_pool
from app.models import ScanBody, ScanOut, TicketOut

router = APIRouter()

_TICKET_QUERY = """
    SELECT
        t.id::text,
        t.reg_id::text,
        t.event_id::text,
        t.qr_token,
        t.status,
        t.issued_at,
        t.scanned_at,
        r.ticket_count,
        r.total_amount,
        r.display_currency,
        e.title        AS event_title,
        e.start_time   AS event_start_time,
        e.end_time     AS event_end_time,
        e.venue        AS event_venue,
        ec.color_hex   AS event_image_color,
        u.name         AS user_name,
        u.email        AS user_email,
        u.keycloak_sub
    FROM ticket t
    JOIN registration r  ON r.id  = t.reg_id
    JOIN event e         ON e.id  = t.event_id
    LEFT JOIN event_category ec ON ec.id = e.category_id
    JOIN users u         ON u.id  = t.user_id
"""


def _build_out(row) -> TicketOut:
    return TicketOut(
        id=row["id"],
        reg_id=row["reg_id"],
        event_id=row["event_id"],
        event_title=row["event_title"],
        event_start_time=row["event_start_time"],
        event_end_time=row["event_end_time"],
        event_venue=row["event_venue"],
        event_image_color=row.get("event_image_color"),
        ticket_count=row["ticket_count"],
        total_amount=float(row["total_amount"]),
        display_currency=row["display_currency"],
        status=row["status"],
        qr_token=row.get("qr_token"),
        issued_at=row["issued_at"],
        scanned_at=row.get("scanned_at"),
        user_name=row.get("user_name"),
        user_email=row.get("user_email"),
    )


def _generate_qr_svg(token: str) -> bytes:
    factory = qrcode.image.svg.SvgPathFillImage
    img = qrcode.make(token, image_factory=factory, box_size=10, border=4)
    buf = io.BytesIO()
    img.save(buf)
    return buf.getvalue()


async def _get_db_user_id(conn, sub: str) -> str:
    row = await conn.fetchrow("SELECT id::text FROM users WHERE keycloak_sub = $1", sub)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return row["id"]


async def _ensure_tickets_issued(conn, user_id: str) -> None:
    """Lazily issue tickets for any confirmed registration that doesn't have one yet."""
    unissued = await conn.fetch(
        """
        SELECT r.id::text AS reg_id, r.event_id::text, r.user_id::text,
               r.qr_code AS existing_qr
        FROM registration r
        LEFT JOIN ticket t ON t.reg_id = r.id
        WHERE r.user_id = $1::uuid
          AND r.status   = 'confirmed'
          AND t.id IS NULL
        """,
        user_id,
    )
    for reg in unissued:
        # Reuse existing qr_code from registration table if present (backward compat)
        qr_token = reg["existing_qr"] or str(uuid.uuid4())
        await conn.execute(
            """
            INSERT INTO ticket (reg_id, user_id, event_id, qr_token)
            VALUES ($1::uuid, $2::uuid, $3::uuid, $4)
            ON CONFLICT (reg_id) DO NOTHING
            """,
            reg["reg_id"], reg["user_id"], reg["event_id"], qr_token,
        )


# ── GET /tickets/my ───────────────────────────────────────────────────────────

@router.get("/my", response_model=list[TicketOut], summary="Get the current user's tickets")
async def get_my_tickets(claims: dict = Depends(get_current_claims)):
    sub = claims.get("sub", "")
    pool = await get_pool()
    async with pool.acquire() as conn:
        user_id = await _get_db_user_id(conn, sub)
        await _ensure_tickets_issued(conn, user_id)
        rows = await conn.fetch(
            _TICKET_QUERY + " WHERE t.user_id = $1::uuid AND t.status != 'cancelled' ORDER BY e.start_time DESC",
            user_id,
        )
    return [_build_out(r) for r in rows]


# ── GET /tickets/{id} ─────────────────────────────────────────────────────────

@router.get("/{ticket_id}", response_model=TicketOut, summary="Get a single ticket")
async def get_ticket(ticket_id: str, claims: dict = Depends(get_current_claims)):
    sub = claims.get("sub", "")
    realm_roles: list[str] = claims.get("realm_access", {}).get("roles", [])
    is_privileged = any(r in realm_roles for r in ("admin", "committee_member", "security_guard"))

    pool = await get_pool()
    async with pool.acquire() as conn:
        user_id = await _get_db_user_id(conn, sub)
        row = await conn.fetchrow(_TICKET_QUERY + " WHERE t.id = $1::uuid", ticket_id)
        if not row:
            raise HTTPException(status_code=404, detail="Ticket not found")
        if not is_privileged and row["user_id" if "user_id" in dict(row) else "keycloak_sub"] != (user_id if is_privileged else user_id):
            # simpler ownership check via keycloak_sub
            pass
    # ownership: ticket belongs to the calling user OR caller is privileged
    reg_owner = dict(row).get("keycloak_sub") == sub or is_privileged
    if not reg_owner:
        raise HTTPException(status_code=403, detail="Not your ticket")
    return _build_out(row)


# ── GET /tickets/{id}/qr ──────────────────────────────────────────────────────

@router.get("/{ticket_id}/qr", summary="Get the gate-entry QR code SVG (public)")
async def get_ticket_qr(ticket_id: str):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT t.qr_token, t.status FROM ticket t WHERE t.id = $1::uuid",
            ticket_id,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if row["status"] == "cancelled":
        raise HTTPException(status_code=400, detail="Ticket is cancelled")

    svg_bytes = _generate_qr_svg(row["qr_token"])
    return FastAPIResponse(content=svg_bytes, media_type="image/svg+xml")


# ── POST /tickets/scan — gate entry ───────────────────────────────────────────

@router.post("/scan", response_model=ScanOut, summary="Scan QR at gate (security guard / admin)")
async def scan_ticket(
    body: ScanBody,
    claims: dict = Depends(require_role("admin", "committee_member", "security_guard")),
):
    sub = claims.get("sub", "")
    pool = await get_pool()
    async with pool.acquire() as conn:
        scanner_id = await _get_db_user_id(conn, sub)

        row = await conn.fetchrow(
            """
            SELECT t.id::text, t.reg_id::text, t.event_id::text, t.status,
                   t.scanned_at, r.ticket_count,
                   e.title AS event_title, e.start_time AS event_start_time, e.venue AS event_venue,
                   u.name  AS user_name
            FROM ticket t
            JOIN registration r ON r.id = t.reg_id
            JOIN event e        ON e.id = t.event_id
            JOIN users u        ON u.id = t.user_id
            WHERE t.qr_token = $1
            """,
            body.token,
        )
        if not row:
            raise HTTPException(status_code=404, detail="QR code not found or invalid")

        already_scanned = row["status"] == "used"

        if not already_scanned:
            now = datetime.now(timezone.utc)
            await conn.execute(
                "UPDATE ticket SET status = 'used', scanned_at = $1, scanned_by = $2::uuid WHERE qr_token = $3",
                now, scanner_id, body.token,
            )
            # Keep registration table in sync so other services stay consistent
            await conn.execute(
                "UPDATE registration SET status = 'attended' WHERE id = $1::uuid",
                row["reg_id"],
            )

    return ScanOut(
        ticket_id=row["id"],
        reg_id=row["reg_id"],
        event_id=row["event_id"],
        event_title=row["event_title"],
        event_start_time=row["event_start_time"],
        event_venue=row["event_venue"],
        ticket_count=row["ticket_count"],
        status="used",
        scanned_at=row["scanned_at"] if already_scanned else datetime.now(timezone.utc),
        user_name=row.get("user_name"),
        already_scanned=already_scanned,
    )


# ── DELETE /tickets/{id} — cancel ─────────────────────────────────────────────

@router.delete("/{ticket_id}", status_code=204, summary="Cancel a ticket (admin only)")
async def cancel_ticket(
    ticket_id: str,
    claims: dict = Depends(require_role("admin", "committee_member")),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, status FROM ticket WHERE id = $1::uuid", ticket_id
        )
        if not row:
            raise HTTPException(status_code=404, detail="Ticket not found")
        if row["status"] == "used":
            raise HTTPException(status_code=400, detail="Cannot cancel a used ticket")
        await conn.execute(
            "UPDATE ticket SET status = 'cancelled' WHERE id = $1::uuid", ticket_id
        )
    return FastAPIResponse(status_code=204)
