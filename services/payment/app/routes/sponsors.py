"""Sponsor directory, per-event sponsorships, and sponsorship refund requests.

Per-event routes (create/update a sponsorship, refund approve/reject/process) require
`require_event_access`/`_has_event_access` — organizer or approved member of that specific
event, no admin/committee_member bypass (absolute isolation). The sponsor *directory*
(list/create/update sponsors), a sponsor's own cross-event view (`GET
/{sponsor_id}/sponsorships`), and the global refund queue (`GET /refunds`) are deliberately
left at the existing admin/committee_member level — they aren't per-event data.
"""
from fastapi import APIRouter, Depends, HTTPException

from app.auth import _has_event_access, get_current_claims, require_role
from app.database import get_pool
from app.models import (
    SponsorCreate, SponsorOut, SponsorUpdate,
    SponsorshipCreate, SponsorshipOut, SponsorshipUpdate,
    SponsorshipRefundApprove, SponsorshipRefundCreate, SponsorshipRefundOut,
)

router = APIRouter()

_SPONSOR_SELECT = (
    "SELECT s.id::text, s.organization_name, s.organization_type, "
    "s.contact_name, s.contact_email, s.contact_phone, "
    "s.user_id::text, u.name AS platform_user_name, s.is_active, s.created_at, "
    "COALESCE(agg.event_count, 0)::int AS event_count, "
    "COALESCE(agg.total_pledged, 0) AS total_pledged "
    "FROM sponsor s "
    "LEFT JOIN users u ON u.id = s.user_id "
    "LEFT JOIN ("
    "  SELECT sponsor_id, COUNT(*) AS event_count, SUM(amount) AS total_pledged "
    "  FROM event_sponsorship GROUP BY sponsor_id"
    ") agg ON agg.sponsor_id = s.id "
)

_SPONSORSHIP_SELECT = (
    "SELECT es.id::text, es.event_id::text, e.title AS event_title, e.start_time AS event_start_time, "
    "es.sponsor_id::text, s.organization_name AS sponsor_name, "
    "es.amount, es.currency_code, es.status, es.payment_reference, es.notes, es.sponsored_at "
    "FROM event_sponsorship es "
    "JOIN event e ON e.id = es.event_id "
    "JOIN sponsor s ON s.id = es.sponsor_id "
)

_REFUND_SELECT = (
    "SELECT sr.id::text, sr.sponsorship_id::text, e.title AS event_title, "
    "s.organization_name AS sponsor_name, s.contact_name AS sponsor_contact, "
    "es.amount AS sponsorship_amount, es.status AS sponsorship_status, "
    "sr.amount, sr.reason, sr.status, "
    "ru.name AS requested_by, rv.name AS reviewed_by, "
    "sr.reviewed_at, sr.processed_at, sr.created_at "
    "FROM sponsorship_refund sr "
    "JOIN event_sponsorship es ON es.id = sr.sponsorship_id "
    "JOIN event e ON e.id = es.event_id "
    "JOIN sponsor s ON s.id = es.sponsor_id "
    "JOIN users ru ON ru.id = sr.requested_by "
    "LEFT JOIN users rv ON rv.id = sr.reviewed_by "
)


async def _caller_user_id(conn, claims: dict) -> str:
    row = await conn.fetchrow("SELECT id FROM users WHERE keycloak_sub = $1", claims.get("sub"))
    if not row:
        raise HTTPException(status_code=404, detail="User record not found")
    return str(row["id"])


async def _require_own_sponsor_or_staff(conn, claims: dict, sponsor_id: str) -> None:
    """Admin/committee can act on any sponsor; a 'sponsor'-role caller only on their own record."""
    realm_roles: list[str] = claims.get("realm_access", {}).get("roles", [])
    if any(r in realm_roles for r in ("admin", "committee_member")):
        return
    user_id = await _caller_user_id(conn, claims)
    owns = await conn.fetchval(
        "SELECT 1 FROM sponsor WHERE id = $1::uuid AND user_id = $2::uuid", sponsor_id, user_id,
    )
    if not owns:
        raise HTTPException(status_code=403, detail="Not your sponsor record")


# ── Sponsor directory ─────────────────────────────────────────────────────────

@router.get("", response_model=list[SponsorOut], summary="List sponsors")
async def list_sponsors(
    claims: dict = Depends(require_role("admin", "committee_member")),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(_SPONSOR_SELECT + "ORDER BY s.organization_name")
    return [dict(r) for r in rows]


@router.post("", response_model=SponsorOut, status_code=201, summary="Add a sponsor")
async def create_sponsor(
    body: SponsorCreate,
    claims: dict = Depends(require_role("admin", "committee_member")),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO sponsor (user_id, organization_name, organization_type, "
            "contact_name, contact_email, contact_phone) "
            "VALUES ($1::uuid, $2, $3, $4, $5, $6) RETURNING id",
            body.user_id, body.organization_name, body.organization_type,
            body.contact_name, body.contact_email, body.contact_phone,
        )
        full = await conn.fetchrow(_SPONSOR_SELECT + "WHERE s.id = $1::uuid", row["id"])
    return dict(full)


@router.put("/{sponsor_id}", response_model=SponsorOut, summary="Update a sponsor")
async def update_sponsor(
    sponsor_id: str,
    body: SponsorUpdate,
    claims: dict = Depends(require_role("admin", "committee_member")),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchval("SELECT 1 FROM sponsor WHERE id=$1::uuid", sponsor_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Sponsor not found")

        updates: list[str] = []
        params: list = []
        idx = 1
        for field in ("organization_name", "organization_type", "contact_name",
                      "contact_email", "contact_phone", "is_active"):
            val = getattr(body, field)
            if val is not None:
                updates.append(f"{field} = ${idx}")
                params.append(val)
                idx += 1
        if not updates:
            raise HTTPException(status_code=422, detail="No fields to update")
        params.append(sponsor_id)
        await conn.execute(f"UPDATE sponsor SET {', '.join(updates)} WHERE id=${idx}::uuid", *params)
        full = await conn.fetchrow(_SPONSOR_SELECT + "WHERE s.id = $1::uuid", sponsor_id)
    return dict(full)


@router.get("/me", response_model=SponsorOut, summary="Resolve the caller's own sponsor record")
async def get_my_sponsor(
    claims: dict = Depends(require_role("sponsor")),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        user_id = await _caller_user_id(conn, claims)
        row = await conn.fetchrow(_SPONSOR_SELECT + "WHERE s.user_id = $1::uuid", user_id)
    if not row:
        raise HTTPException(status_code=404, detail="No sponsor record linked to this account")
    return dict(row)


# ── Per-event sponsorships ────────────────────────────────────────────────────

@router.get("/{sponsor_id}/sponsorships", response_model=list[SponsorshipOut],
            summary="List a sponsor's event sponsorships")
async def list_sponsorships(
    sponsor_id: str,
    claims: dict = Depends(require_role("admin", "committee_member", "sponsor")),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await _require_own_sponsor_or_staff(conn, claims, sponsor_id)
        rows = await conn.fetch(
            _SPONSORSHIP_SELECT + "WHERE es.sponsor_id = $1::uuid ORDER BY es.sponsored_at DESC",
            sponsor_id,
        )
    return [dict(r) for r in rows]


@router.post("/{sponsor_id}/sponsorships", response_model=SponsorshipOut, status_code=201,
             summary="Link a sponsor to an event")
async def create_sponsorship(
    sponsor_id: str,
    body: SponsorshipCreate,
    claims: dict = Depends(get_current_claims),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        sponsor_exists = await conn.fetchval("SELECT 1 FROM sponsor WHERE id=$1::uuid", sponsor_id)
        if not sponsor_exists:
            raise HTTPException(status_code=404, detail="Sponsor not found")
        event_exists = await conn.fetchval("SELECT 1 FROM event WHERE id=$1::uuid", body.event_id)
        if not event_exists:
            raise HTTPException(status_code=404, detail="Event not found")
        if not await _has_event_access(conn, claims.get("sub"), body.event_id):
            raise HTTPException(status_code=403, detail="You don't have access to this event")
        try:
            row = await conn.fetchrow(
                "INSERT INTO event_sponsorship (event_id, sponsor_id, amount, currency_code, "
                "status, payment_reference, notes) "
                "VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7) RETURNING id",
                body.event_id, sponsor_id, body.amount, body.currency_code,
                body.status, body.payment_reference, body.notes,
            )
        except Exception as exc:
            if "unique" in str(exc).lower():
                raise HTTPException(status_code=409, detail="Sponsor is already linked to this event") from exc
            raise
        full = await conn.fetchrow(_SPONSORSHIP_SELECT + "WHERE es.id = $1::uuid", row["id"])
    return dict(full)


@router.put("/sponsorships/{sponsorship_id}", response_model=SponsorshipOut,
            summary="Update a sponsorship (e.g. mark received)")
async def update_sponsorship(
    sponsorship_id: str,
    body: SponsorshipUpdate,
    claims: dict = Depends(get_current_claims),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchval("SELECT event_id::text FROM event_sponsorship WHERE id=$1::uuid", sponsorship_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Sponsorship not found")
        if not await _has_event_access(conn, claims.get("sub"), existing):
            raise HTTPException(status_code=403, detail="You don't have access to this event")

        updates: list[str] = []
        params: list = []
        idx = 1
        for field in ("amount", "status", "payment_reference", "notes"):
            val = getattr(body, field)
            if val is not None:
                updates.append(f"{field} = ${idx}")
                params.append(val)
                idx += 1
        if not updates:
            raise HTTPException(status_code=422, detail="No fields to update")
        params.append(sponsorship_id)
        await conn.execute(f"UPDATE event_sponsorship SET {', '.join(updates)} WHERE id=${idx}::uuid", *params)
        full = await conn.fetchrow(_SPONSORSHIP_SELECT + "WHERE es.id = $1::uuid", sponsorship_id)
    return dict(full)


# ── Sponsorship refunds ───────────────────────────────────────────────────────

@router.post("/sponsorships/{sponsorship_id}/refunds", response_model=SponsorshipRefundOut,
             status_code=201, summary="Request a refund on a sponsorship")
async def request_refund(
    sponsorship_id: str,
    body: SponsorshipRefundCreate,
    claims: dict = Depends(get_current_claims),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        sponsorship = await conn.fetchrow(
            "SELECT sponsor_id, event_id::text FROM event_sponsorship WHERE id=$1::uuid", sponsorship_id,
        )
        if not sponsorship:
            raise HTTPException(status_code=404, detail="Sponsorship not found")
        # The sponsor themselves may request a refund on their own sponsorship; otherwise
        # only the event's organizer/approved members can log one on the sponsor's behalf —
        # no more blanket admin/committee bypass under the isolation model.
        user_id = await _caller_user_id(conn, claims)
        owns_sponsorship = await conn.fetchval(
            "SELECT 1 FROM sponsor WHERE id = $1::uuid AND user_id = $2::uuid",
            sponsorship["sponsor_id"], user_id,
        )
        if not owns_sponsorship and not await _has_event_access(conn, claims.get("sub"), sponsorship["event_id"]):
            raise HTTPException(status_code=403, detail="Not your sponsorship and no access to this event")

        requester_id = await _caller_user_id(conn, claims)
        row = await conn.fetchrow(
            "INSERT INTO sponsorship_refund (sponsorship_id, requested_by, amount, reason) "
            "VALUES ($1::uuid, $2::uuid, $3, $4) RETURNING id",
            sponsorship_id, requester_id, body.amount, body.reason,
        )
        await conn.execute(
            "UPDATE event_sponsorship SET status='refund_requested' WHERE id=$1::uuid", sponsorship_id,
        )
        full = await conn.fetchrow(_REFUND_SELECT + "WHERE sr.id = $1::uuid", row["id"])
    return dict(full)


@router.get("/refunds", response_model=list[SponsorshipRefundOut],
            summary="List sponsorship refund requests (admin/committee see all; a sponsor sees only their own)")
async def list_refunds(
    claims: dict = Depends(require_role("admin", "committee_member", "sponsor")),
):
    pool = await get_pool()
    realm_roles: list[str] = claims.get("realm_access", {}).get("roles", [])
    async with pool.acquire() as conn:
        if any(r in realm_roles for r in ("admin", "committee_member")):
            rows = await conn.fetch(_REFUND_SELECT + "ORDER BY sr.created_at DESC")
        else:
            user_id = await _caller_user_id(conn, claims)
            rows = await conn.fetch(
                _REFUND_SELECT + "WHERE s.user_id = $1::uuid ORDER BY sr.created_at DESC", user_id,
            )
    return [dict(r) for r in rows]


@router.patch("/refunds/{refund_id}/approve", response_model=SponsorshipRefundOut,
              summary="Approve a sponsorship refund request")
async def approve_refund(
    refund_id: str,
    body: SponsorshipRefundApprove,
    claims: dict = Depends(get_current_claims),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        refund = await conn.fetchrow(
            "SELECT sr.sponsorship_id, sr.status, es.event_id::text AS event_id "
            "FROM sponsorship_refund sr JOIN event_sponsorship es ON es.id = sr.sponsorship_id "
            "WHERE sr.id=$1::uuid", refund_id,
        )
        if not refund:
            raise HTTPException(status_code=404, detail="Refund request not found")
        if not await _has_event_access(conn, claims.get("sub"), refund["event_id"]):
            raise HTTPException(status_code=403, detail="You don't have access to this event")
        if refund["status"] != "pending":
            raise HTTPException(status_code=409, detail="Refund request already reviewed")
        reviewer_id = await _caller_user_id(conn, claims)

        if body.approved_amount is not None:
            await conn.execute(
                "UPDATE sponsorship_refund SET amount=$1 WHERE id=$2::uuid",
                body.approved_amount, refund_id,
            )
        await conn.execute(
            "UPDATE sponsorship_refund SET status='approved', reviewed_by=$1::uuid, reviewed_at=now() "
            "WHERE id=$2::uuid",
            reviewer_id, refund_id,
        )
        full = await conn.fetchrow(_REFUND_SELECT + "WHERE sr.id = $1::uuid", refund_id)
    return dict(full)


@router.patch("/refunds/{refund_id}/reject", response_model=SponsorshipRefundOut,
              summary="Reject a sponsorship refund request")
async def reject_refund(
    refund_id: str,
    claims: dict = Depends(get_current_claims),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        refund = await conn.fetchrow(
            "SELECT sr.sponsorship_id, sr.status, es.event_id::text AS event_id "
            "FROM sponsorship_refund sr JOIN event_sponsorship es ON es.id = sr.sponsorship_id "
            "WHERE sr.id=$1::uuid", refund_id,
        )
        if not refund:
            raise HTTPException(status_code=404, detail="Refund request not found")
        if not await _has_event_access(conn, claims.get("sub"), refund["event_id"]):
            raise HTTPException(status_code=403, detail="You don't have access to this event")
        if refund["status"] != "pending":
            raise HTTPException(status_code=409, detail="Refund request already reviewed")
        reviewer_id = await _caller_user_id(conn, claims)

        await conn.execute(
            "UPDATE sponsorship_refund SET status='rejected', reviewed_by=$1::uuid, reviewed_at=now() "
            "WHERE id=$2::uuid",
            reviewer_id, refund_id,
        )
        # Refund request rejected — the sponsorship's payment status stands as it was (received/pledged).
        await conn.execute(
            "UPDATE event_sponsorship SET status='received' "
            "WHERE id=$1::uuid AND status='refund_requested'",
            refund["sponsorship_id"],
        )
        full = await conn.fetchrow(_REFUND_SELECT + "WHERE sr.id = $1::uuid", refund_id)
    return dict(full)


@router.patch("/refunds/{refund_id}/process", response_model=SponsorshipRefundOut,
              summary="Mark an approved sponsorship refund as processed (paid out)")
async def process_refund(
    refund_id: str,
    claims: dict = Depends(get_current_claims),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        refund = await conn.fetchrow(
            "SELECT sr.sponsorship_id, sr.status, es.event_id::text AS event_id "
            "FROM sponsorship_refund sr JOIN event_sponsorship es ON es.id = sr.sponsorship_id "
            "WHERE sr.id=$1::uuid", refund_id,
        )
        if not refund:
            raise HTTPException(status_code=404, detail="Refund request not found")
        if not await _has_event_access(conn, claims.get("sub"), refund["event_id"]):
            raise HTTPException(status_code=403, detail="You don't have access to this event")
        if refund["status"] != "approved":
            raise HTTPException(status_code=409, detail="Refund must be approved before processing")

        await conn.execute(
            "UPDATE sponsorship_refund SET status='processed', processed_at=now() WHERE id=$1::uuid",
            refund_id,
        )
        await conn.execute(
            "UPDATE event_sponsorship SET status='refunded' WHERE id=$1::uuid", refund["sponsorship_id"],
        )
        full = await conn.fetchrow(_REFUND_SELECT + "WHERE sr.id = $1::uuid", refund_id)
    return dict(full)
