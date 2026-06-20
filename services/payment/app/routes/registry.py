"""Committee registry — event-to-collector assignment (FR-02, FR-09)."""
import io
import qrcode
import qrcode.image.svg
from urllib.parse import quote_plus

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response as FastAPIResponse

from app.auth import get_current_claims, require_role
from app.database import get_pool
from app.models import CollectorOut, MemberOut, RegistryCreate, RegistryOut, RegistryUpdate

router = APIRouter()


def _qr_svg(uri: str) -> bytes:
    factory = qrcode.image.svg.SvgPathFillImage
    img = qrcode.make(uri, image_factory=factory, box_size=10, border=4)
    buf = io.BytesIO()
    img.save(buf)
    return buf.getvalue()


# ── GET /registry ─────────────────────────────────────────────────────────────

@router.get("", response_model=list[RegistryOut],
            summary="List all event-collector assignments")
async def list_registry(
    claims: dict = Depends(require_role("admin", "committee_member")),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT cr.id::text, cr.event_id::text, cr.member_id::text,
                      cr.upi_id, cr.assigned_at,
                      e.title AS event_title,
                      u.name  AS member_name, u.email AS member_email
               FROM committee_registry cr
               JOIN event e ON e.id = cr.event_id
               JOIN users u ON u.id = cr.member_id
               ORDER BY cr.assigned_at DESC"""
        )
    return [dict(r) for r in rows]


# ── POST /registry ────────────────────────────────────────────────────────────

@router.post("", response_model=RegistryOut, status_code=201,
             summary="Assign a collector to an event (admin)")
async def assign_collector(
    body: RegistryCreate,
    claims: dict = Depends(require_role("admin")),
):
    sub = claims.get("sub", "")
    pool = await get_pool()
    async with pool.acquire() as conn:
        assigner = await conn.fetchval(
            "SELECT id::text FROM users WHERE keycloak_sub = $1", sub
        )
        row = await conn.fetchrow(
            """INSERT INTO committee_registry (event_id, member_id, upi_id, assigned_by)
               VALUES ($1::uuid, $2::uuid, $3, $4::uuid)
               ON CONFLICT (event_id) DO UPDATE
                 SET member_id = EXCLUDED.member_id,
                     upi_id    = EXCLUDED.upi_id,
                     assigned_by = EXCLUDED.assigned_by,
                     assigned_at = now()
               RETURNING id::text""",
            body.event_id, body.member_id, body.upi_id, assigner,
        )
        full = await conn.fetchrow(
            """SELECT cr.id::text, cr.event_id::text, cr.member_id::text,
                      cr.upi_id, cr.assigned_at,
                      e.title AS event_title,
                      u.name  AS member_name, u.email AS member_email
               FROM committee_registry cr
               JOIN event e ON e.id = cr.event_id
               JOIN users u ON u.id = cr.member_id
               WHERE cr.id = $1::uuid""",
            row["id"],
        )
    return dict(full)


# ── PUT /registry/{id} ────────────────────────────────────────────────────────

@router.put("/{registry_id}", response_model=RegistryOut,
            summary="Reassign collector for an event (admin)")
async def reassign_collector(
    registry_id: str,
    body: RegistryUpdate,
    claims: dict = Depends(require_role("admin")),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        exists = await conn.fetchval(
            "SELECT id FROM committee_registry WHERE id = $1::uuid", registry_id
        )
        if not exists:
            raise HTTPException(status_code=404, detail="Registry entry not found")
        await conn.execute(
            "UPDATE committee_registry SET member_id=$1::uuid, upi_id=$2, assigned_at=now() WHERE id=$3::uuid",
            body.member_id, body.upi_id, registry_id,
        )
        full = await conn.fetchrow(
            """SELECT cr.id::text, cr.event_id::text, cr.member_id::text,
                      cr.upi_id, cr.assigned_at,
                      e.title AS event_title,
                      u.name  AS member_name, u.email AS member_email
               FROM committee_registry cr
               JOIN event e ON e.id = cr.event_id
               JOIN users u ON u.id = cr.member_id
               WHERE cr.id = $1::uuid""",
            registry_id,
        )
    return dict(full)


# ── GET /registry/members ─────────────────────────────────────────────────────

@router.get("/members", response_model=list[MemberOut],
            summary="List committee members")
async def list_members(
    claims: dict = Depends(require_role("admin", "committee_member")),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT u.id::text, u.name, u.email,
                      'committee_member' AS role
               FROM users u
               WHERE u.is_active = TRUE
               ORDER BY u.name"""
        )
    return [dict(r) for r in rows]


# ── GET /registry/events ──────────────────────────────────────────────────────

@router.get("/events", summary="List published events with assigned collector")
async def list_events(
    claims: dict = Depends(get_current_claims),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT e.id::text, e.title, e.ticket_price, e.price_currency, e.is_free,
                      e.start_time, e.status,
                      cr.upi_id      AS collector_upi,
                      u.name         AS collector_name
               FROM event e
               LEFT JOIN committee_registry cr ON cr.event_id = e.id
               LEFT JOIN users u              ON u.id = cr.member_id
               WHERE e.status = 'published'
               ORDER BY e.start_time DESC"""
        )
    return [dict(r) for r in rows]


# ── GET /registry/events/{id}/collector ───────────────────────────────────────

@router.get("/events/{event_id}/collector", response_model=CollectorOut,
            summary="Resolve collector for an event (used to generate QR)")
async def get_collector(
    event_id: str,
    amount: float = Query(..., gt=0),
    claims: dict = Depends(get_current_claims),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT cr.upi_id, u.name AS upi_name,
                      e.title, e.price_currency
               FROM committee_registry cr
               JOIN users u ON u.id = cr.member_id
               JOIN event e ON e.id = cr.event_id
               WHERE cr.event_id = $1::uuid""",
            event_id,
        )
    if not row:
        raise HTTPException(status_code=404, detail="No collector assigned for this event")

    upi_id  = row["upi_id"]
    name    = row["upi_name"]
    title   = row["title"]
    currency = row.get("price_currency", "INR")
    uri = (
        f"upi://pay?pa={quote_plus(upi_id)}&pn={quote_plus(name)}"
        f"&am={amount:.2f}&cu=INR&tn={quote_plus(title[:50])}"
    )
    return CollectorOut(
        upi_id=upi_id, upi_name=name,
        upi_intent_uri=uri, event_title=title,
        amount=amount, currency=currency,
    )


# ── GET /registry/events/{id}/collector/qr ────────────────────────────────────

@router.get("/events/{event_id}/collector/qr",
            summary="UPI payment QR SVG for an event")
async def get_collector_qr(
    event_id: str,
    amount: float = Query(..., gt=0),
    claims: dict = Depends(get_current_claims),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT cr.upi_id, u.name AS upi_name, e.title
               FROM committee_registry cr
               JOIN users u ON u.id = cr.member_id
               JOIN event e ON e.id = cr.event_id
               WHERE cr.event_id = $1::uuid""",
            event_id,
        )
    if not row:
        raise HTTPException(status_code=404, detail="No collector assigned for this event")

    uri = (
        f"upi://pay?pa={quote_plus(row['upi_id'])}&pn={quote_plus(row['upi_name'])}"
        f"&am={amount:.2f}&cu=INR&tn={quote_plus(row['title'][:50])}"
    )
    return FastAPIResponse(content=_qr_svg(uri), media_type="image/svg+xml")
