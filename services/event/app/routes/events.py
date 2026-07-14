import json
import math
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from app.auth import _has_event_access, get_current_claims, get_optional_claims, require_event_access, require_role, require_role_or_organizer
from app.config import settings
from app.database import get_pool
from app.models import (
    AnnouncementCreate, AnnouncementOut,
    EventCreate, EventDetail, EventListItem, EventListResponse, EventUpdate,
    EventPermissionGrant, EventPermissionOut,
    TicketTypeOut, TicketTypeCreate, TicketTypeUpdate,
)

router = APIRouter()

_SOCIETY = settings.society_id

# ── helpers ───────────────────────────────────────────────────────────────────

_EVENT_COLS = """
    e.id::text,
    e.title,
    e.description,
    e.start_time,
    e.end_time,
    e.venue,
    e.venue_lat,
    e.venue_lng,
    e.venue_place_id,
    e.venue_address,
    e.capacity,
    e.status,
    e.ticket_price,
    e.price_currency,
    e.is_free,
    e.cancel_freeze_at,
    e.created_at,
    e.organizer_id::text,
    ec.id::text          AS category_id,
    ec.name              AS category_name,
    ec.color_hex         AS category_color,
    u.name               AS organizer_name,
    COALESCE(rc.registration_count, 0)::int  AS registration_count,
    COALESCE(rc.confirmed_tickets,  0)::int  AS confirmed_tickets,
    CASE
        WHEN e.capacity IS NULL THEN NULL
        ELSE GREATEST(0, e.capacity - COALESCE(rc.confirmed_tickets, 0))
    END                  AS spots_remaining,
    (
        SELECT json_agg(
            json_build_object('name', tt.name, 'price', tt.price, 'is_free', tt.is_free)
            ORDER BY tt.sort_order
        )::text
        FROM ticket_type tt
        WHERE tt.event_id = e.id AND tt.is_active = TRUE
    )                    AS ticket_types_json
"""

_REG_CTE = """
WITH reg_counts AS (
    SELECT event_id,
           COUNT(*)::int                                                    AS registration_count,
           COALESCE(SUM(ticket_count) FILTER (WHERE status='confirmed'),0)::int AS confirmed_tickets
    FROM registration
    GROUP BY event_id
)
"""


def _to_event_item(row) -> dict:
    d = dict(row)
    capacity  = d.get("capacity")
    remaining = d.get("spots_remaining")
    d["is_sold_out"] = bool(capacity is not None and remaining is not None and remaining <= 0)
    # Parse ticket types JSON (returned as text from the subquery)
    raw = d.pop("ticket_types_json", None)
    d["ticket_types"] = json.loads(raw) if raw else []
    return d


# ── GET /events ───────────────────────────────────────────────────────────────

@router.get("", response_model=EventListResponse, summary="Paginated event listing")
async def list_events(
    page:        int            = Query(1,  ge=1),
    limit:       int            = Query(9,  ge=1, le=50),
    search:      Optional[str]  = Query(None),
    category_id: Optional[str]  = Query(None),
    status:      Optional[str]  = Query(None),
    is_free:     Optional[bool] = Query(None),
    sort:        str            = Query("date_asc"),
    mine:        bool           = Query(False, description="Only events organized by the caller, any status"),
    claims:      Optional[dict] = Depends(get_optional_claims),
):
    order_map = {
        "date_asc":   "e.start_time ASC",
        "date_desc":  "e.start_time DESC",
        "newest":     "e.created_at DESC",
        "price_asc":  "e.ticket_price ASC",
        "price_desc": "e.ticket_price DESC",
        "popular":    "confirmed_tickets DESC",
    }
    order_clause = order_map.get(sort, "e.start_time ASC")
    offset = (page - 1) * limit

    if status is None and not mine:
        status = "published"

    pool = await get_pool()

    # Resolve the caller's internal user id once — used both for `mine=true` and, below, to
    # let a draft's organizer/approved members still see it in the general listing while
    # everyone else can't (drafts aren't "published to everyone" yet, per the isolation model).
    caller_user_id: Optional[str] = None
    if claims:
        async with pool.acquire() as conn:
            caller = await conn.fetchrow("SELECT id FROM users WHERE keycloak_sub = $1", claims.get("sub"))
        if caller:
            caller_user_id = str(caller["id"])

    organizer_user_id: Optional[str] = None
    if mine:
        if not claims:
            raise HTTPException(status_code=401, detail="Authentication required")
        if not caller_user_id:
            raise HTTPException(status_code=404, detail="User record not found")
        organizer_user_id = caller_user_id

    conditions = ["e.society_id = $1"]
    params: list = [_SOCIETY]
    idx = 2

    if status:
        conditions.append(f"e.status = ${idx}")
        params.append(status)
        idx += 1

    if organizer_user_id:
        conditions.append(f"e.organizer_id = ${idx}::uuid")
        params.append(organizer_user_id)
        idx += 1
    elif not mine:
        # Hide draft events from everyone except their organizer/approved members —
        # only "mine=true" (handled above) or organizer/approved-member access reveals a draft.
        if caller_user_id:
            conditions.append(
                f"(e.status != 'draft' OR e.organizer_id = ${idx}::uuid OR EXISTS ("
                f"  SELECT 1 FROM event_permission ep "
                f"  WHERE ep.event_id = e.id AND ep.user_id = ${idx}::uuid AND ep.revoked_at IS NULL"
                f"))"
            )
            params.append(caller_user_id)
            idx += 1
        else:
            conditions.append("e.status != 'draft'")

    if search:
        conditions.append(f"(e.title ILIKE ${idx} OR e.title % ${idx})")
        params.append(f"%{search}%")
        idx += 1

    if category_id:
        conditions.append(f"e.category_id = ${idx}::uuid")
        params.append(category_id)
        idx += 1

    if is_free is not None:
        conditions.append(f"e.is_free = ${idx}")
        params.append(is_free)
        idx += 1

    where = " AND ".join(conditions)

    count_sql = (
        f"{_REG_CTE} "
        f"SELECT COUNT(*) FROM event e "
        f"LEFT JOIN event_category ec ON ec.id = e.category_id "
        f"LEFT JOIN users u ON u.id = e.organizer_id "
        f"LEFT JOIN reg_counts rc ON rc.event_id = e.id "
        f"WHERE {where}"
    )
    data_sql = (
        f"{_REG_CTE} "
        f"SELECT {_EVENT_COLS} FROM event e "
        f"LEFT JOIN event_category ec ON ec.id = e.category_id "
        f"LEFT JOIN users u ON u.id = e.organizer_id "
        f"LEFT JOIN reg_counts rc ON rc.event_id = e.id "
        f"WHERE {where} "
        f"ORDER BY {order_clause} "
        f"LIMIT ${idx} OFFSET ${idx+1}"
    )
    params_page = params + [limit, offset]

    async with pool.acquire() as conn:
        total = await conn.fetchval(count_sql, *params)
        rows  = await conn.fetch(data_sql, *params_page)

    total = total or 0
    total_pages = max(1, math.ceil(total / limit))
    return EventListResponse(
        events=[_to_event_item(r) for r in rows],
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
    )


# ── GET /events/{event_id} ────────────────────────────────────────────────────

@router.get("/{event_id}", response_model=EventDetail, summary="Event detail")
async def get_event(
    event_id: str,
    claims:   Optional[dict] = Depends(get_optional_claims),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"{_REG_CTE} "
            f"SELECT {_EVENT_COLS} FROM event e "
            f"LEFT JOIN event_category ec ON ec.id = e.category_id "
            f"LEFT JOIN users u ON u.id = e.organizer_id "
            f"LEFT JOIN reg_counts rc ON rc.event_id = e.id "
            f"WHERE e.id = $1::uuid AND e.society_id = $2::uuid",
            event_id, _SOCIETY,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Event not found")

        # A draft isn't "published to everyone" yet — hide it from anyone who isn't its
        # organizer or an approved member, same as it's hidden from the general listing.
        # 404 (not 403) so it doesn't even reveal the draft exists.
        if row["status"] == "draft" and not await _has_event_access(conn, claims.get("sub") if claims else None, event_id):
            raise HTTPException(status_code=404, detail="Event not found")

        ann_rows = await conn.fetch(
            "SELECT a.id::text, a.event_id::text, a.author_id::text, "
            "u.name AS author_name, a.title, a.body, a.sent_at "
            "FROM announcement a JOIN users u ON u.id = a.author_id "
            "WHERE a.event_id = $1::uuid ORDER BY a.sent_at DESC",
            event_id,
        )
        tt_rows = await conn.fetch(
            "SELECT id::text, name, description, price, is_free, capacity, "
            "sort_order, is_active "
            "FROM ticket_type WHERE event_id = $1::uuid AND is_active = TRUE "
            "ORDER BY sort_order",
            event_id,
        )

    event_dict = _to_event_item(row)
    event_dict["announcements"] = [dict(r) for r in ann_rows]
    event_dict["ticket_types"]  = [dict(r) for r in tt_rows]
    return event_dict


# ── POST /events ──────────────────────────────────────────────────────────────

@router.post("", status_code=201, summary="Create event (admin/committee/resident)")
async def create_event(
    body:   EventCreate,
    claims: dict = Depends(require_role("admin", "committee_member", "resident")),
):
    if body.end_time <= body.start_time:
        raise HTTPException(status_code=422, detail="end_time must be after start_time")
    if body.cancel_freeze_at is not None and body.cancel_freeze_at >= body.start_time:
        raise HTTPException(status_code=422, detail="cancel_freeze_at must be before start_time")

    organizer_sub = claims.get("sub")
    pool = await get_pool()
    async with pool.acquire() as conn:
        organizer = await conn.fetchrow(
            "SELECT id FROM users WHERE keycloak_sub = $1", organizer_sub
        )
        if not organizer:
            raise HTTPException(status_code=404, detail="Organizer user record not found")

        row = await conn.fetchrow(
            "INSERT INTO event (society_id, category_id, organizer_id, title, description, "
            "start_time, end_time, venue, venue_lat, venue_lng, venue_place_id, venue_address, "
            "capacity, ticket_price, price_currency, is_free, cancel_freeze_at, status) "
            "VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'draft') "
            "RETURNING id::text",
            _SOCIETY,
            body.category_id,
            str(organizer["id"]),
            body.title,
            body.description,
            body.start_time,
            body.end_time,
            body.venue,
            body.venue_lat,
            body.venue_lng,
            body.venue_place_id,
            body.venue_address,
            body.capacity,
            body.ticket_price,
            body.price_currency,
            body.is_free,
            body.cancel_freeze_at,
        )
    return {"id": row["id"], "status": "draft"}


# ── PUT /events/{event_id} ────────────────────────────────────────────────────

@router.put("/{event_id}", summary="Update event details (admin/committee/organizer)")
async def update_event(
    event_id: str,
    body:     EventUpdate,
    claims:   dict = Depends(require_event_access()),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        event = await conn.fetchrow(
            "SELECT status, start_time FROM event WHERE id=$1::uuid AND society_id=$2::uuid",
            event_id, _SOCIETY,
        )
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        if event["status"] not in ("draft", "published"):
            raise HTTPException(status_code=409, detail="Cannot edit a cancelled or completed event")

        if body.cancel_freeze_at is not None:
            effective_start = body.start_time or event["start_time"]
            if body.cancel_freeze_at >= effective_start:
                raise HTTPException(status_code=422, detail="cancel_freeze_at must be before start_time")

        updates: list[str] = []
        params: list = []
        idx = 1

        for field, col in [
            ("title", "title"), ("description", "description"),
            ("venue", "venue"), ("venue_lat", "venue_lat"), ("venue_lng", "venue_lng"),
            ("venue_place_id", "venue_place_id"), ("venue_address", "venue_address"),
            ("start_time", "start_time"), ("end_time", "end_time"),
            ("capacity", "capacity"), ("ticket_price", "ticket_price"),
            ("price_currency", "price_currency"), ("is_free", "is_free"),
            ("category_id", "category_id"), ("cancel_freeze_at", "cancel_freeze_at"),
        ]:
            val = getattr(body, field)
            if val is not None:
                cast = "::uuid" if field == "category_id" else ""
                updates.append(f"{col} = ${idx}{cast}")
                params.append(val)
                idx += 1

        if not updates:
            raise HTTPException(status_code=422, detail="No fields to update")

        params += [event_id, _SOCIETY]
        await conn.execute(
            f"UPDATE event SET {', '.join(updates)} "
            f"WHERE id=${idx}::uuid AND society_id=${idx+1}::uuid",
            *params,
        )
    return {"id": event_id, "updated": True}


# ── PATCH /events/{event_id}/publish ─────────────────────────────────────────

@router.patch("/{event_id}/publish", summary="Publish a draft event")
async def publish_event(
    event_id: str,
    claims:   dict = Depends(require_event_access()),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE event SET status='published' "
            "WHERE id=$1::uuid AND society_id=$2::uuid AND status='draft'",
            event_id, _SOCIETY,
        )
    if result == "UPDATE 0":
        raise HTTPException(status_code=409, detail="Event not found or not in draft state")
    return {"id": event_id, "status": "published"}


# ── PATCH /events/{event_id}/cancel ──────────────────────────────────────────

@router.patch("/{event_id}/cancel", summary="Cancel a published event")
async def cancel_event(
    event_id: str,
    claims:   dict = Depends(require_event_access()),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE event SET status='cancelled' "
            "WHERE id=$1::uuid AND society_id=$2::uuid AND status='published'",
            event_id, _SOCIETY,
        )
    if result == "UPDATE 0":
        raise HTTPException(status_code=409, detail="Event not found or not published")
    return {"id": event_id, "status": "cancelled"}


# ── PATCH /events/{event_id}/complete ────────────────────────────────────────

@router.patch("/{event_id}/complete", summary="Mark an event as completed")
async def complete_event(
    event_id: str,
    claims:   dict = Depends(require_event_access()),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE event SET status='completed' "
            "WHERE id=$1::uuid AND society_id=$2::uuid AND status='published'",
            event_id, _SOCIETY,
        )
    if result == "UPDATE 0":
        raise HTTPException(status_code=409, detail="Event not found or not published")
    return {"id": event_id, "status": "completed"}


# ── DELETE /events/{event_id} ─────────────────────────────────────────────────

@router.delete("/{event_id}", status_code=204,
               summary="Delete a draft or completed event (organizer/approved member)")
async def delete_event(
    event_id: str,
    claims:   dict = Depends(require_event_access()),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM event "
            "WHERE id=$1::uuid AND society_id=$2::uuid AND status IN ('draft', 'completed')",
            event_id, _SOCIETY,
        )
    if result == "DELETE 0":
        raise HTTPException(status_code=409,
                             detail="Event not found or not in a deletable state (must be draft or completed)")


# ── GET /events/{event_id}/announcements ─────────────────────────────────────

@router.get("/{event_id}/announcements",
            response_model=list[AnnouncementOut],
            summary="List announcements for an event")
async def list_announcements(
    event_id: str,
    _claims:  Optional[dict] = Depends(get_optional_claims),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        exists = await conn.fetchval(
            "SELECT 1 FROM event WHERE id=$1::uuid AND society_id=$2::uuid",
            event_id, _SOCIETY,
        )
        if not exists:
            raise HTTPException(status_code=404, detail="Event not found")

        rows = await conn.fetch(
            "SELECT a.id::text, a.event_id::text, a.author_id::text, "
            "u.name AS author_name, a.title, a.body, a.sent_at "
            "FROM announcement a JOIN users u ON u.id = a.author_id "
            "WHERE a.event_id = $1::uuid ORDER BY a.sent_at DESC",
            event_id,
        )
    return [dict(r) for r in rows]


# ── POST /events/{event_id}/announcements ────────────────────────────────────

@router.post("/{event_id}/announcements",
             response_model=AnnouncementOut,
             status_code=201,
             summary="Post an announcement (admin/committee)")
async def create_announcement(
    event_id: str,
    body:     AnnouncementCreate,
    claims:   dict = Depends(require_event_access()),
):
    author_sub = claims.get("sub")
    pool = await get_pool()
    async with pool.acquire() as conn:
        event = await conn.fetchrow(
            "SELECT status FROM event WHERE id=$1::uuid AND society_id=$2::uuid",
            event_id, _SOCIETY,
        )
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        if event["status"] not in ("published", "completed"):
            raise HTTPException(status_code=409, detail="Announcements only for published or completed events")

        author = await conn.fetchrow(
            "SELECT id, name FROM users WHERE keycloak_sub = $1", author_sub
        )
        if not author:
            raise HTTPException(status_code=404, detail="Author user record not found")

        row = await conn.fetchrow(
            "INSERT INTO announcement (event_id, author_id, title, body) "
            "VALUES ($1::uuid, $2::uuid, $3, $4) "
            "RETURNING id::text, event_id::text, author_id::text, title, body, sent_at",
            event_id, str(author["id"]), body.title, body.body,
        )
    result = dict(row)
    result["author_name"] = author["name"]
    return result


# ── Ticket Type CRUD ──────────────────────────────────────────────────────────

_TT_SELECT = (
    "SELECT id::text, name, description, price, is_free, capacity, sort_order, is_active "
    "FROM ticket_type WHERE event_id = $1::uuid ORDER BY sort_order, name"
)


@router.get("/{event_id}/ticket-types",
            response_model=list[TicketTypeOut],
            summary="List ticket types for an event")
async def list_ticket_types(
    event_id: str,
    _claims: Optional[dict] = Depends(get_optional_claims),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        exists = await conn.fetchval(
            "SELECT 1 FROM event WHERE id=$1::uuid AND society_id=$2::uuid",
            event_id, _SOCIETY,
        )
        if not exists:
            raise HTTPException(status_code=404, detail="Event not found")
        rows = await conn.fetch(_TT_SELECT, event_id)
    return [dict(r) for r in rows]


@router.post("/{event_id}/ticket-types",
             response_model=TicketTypeOut,
             status_code=201,
             summary="Add a ticket type (admin/committee)")
async def create_ticket_type(
    event_id: str,
    body: TicketTypeCreate,
    claims: dict = Depends(require_event_access()),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        exists = await conn.fetchval(
            "SELECT 1 FROM event WHERE id=$1::uuid AND society_id=$2::uuid",
            event_id, _SOCIETY,
        )
        if not exists:
            raise HTTPException(status_code=404, detail="Event not found")

        # Auto-assign sort_order if not provided (append at end)
        if body.sort_order == 0:
            max_order = await conn.fetchval(
                "SELECT COALESCE(MAX(sort_order), 0) FROM ticket_type WHERE event_id=$1::uuid",
                event_id,
            )
            sort_order = (max_order or 0) + 1
        else:
            sort_order = body.sort_order

        row = await conn.fetchrow(
            "INSERT INTO ticket_type (event_id, name, description, price, is_free, "
            "capacity, sort_order, is_active) "
            "VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8) "
            "RETURNING id::text, name, description, price, is_free, capacity, sort_order, is_active",
            event_id, body.name, body.description,
            body.price if not body.is_free else 0,
            body.is_free, body.capacity, sort_order, body.is_active,
        )
    return dict(row)


@router.put("/{event_id}/ticket-types/{type_id}",
            response_model=TicketTypeOut,
            summary="Update a ticket type (admin/committee)")
async def update_ticket_type(
    event_id: str,
    type_id: str,
    body: TicketTypeUpdate,
    claims: dict = Depends(require_event_access()),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM ticket_type WHERE id=$1::uuid AND event_id=$2::uuid",
            type_id, event_id,
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Ticket type not found")

        updates: list[str] = []
        params: list = []
        idx = 1
        for field in ("name", "description", "price", "is_free", "capacity", "sort_order", "is_active"):
            val = getattr(body, field)
            if val is not None:
                updates.append(f"{field} = ${idx}")
                params.append(val)
                idx += 1

        # If is_free toggled to True, zero out price
        if body.is_free is True:
            if "price" not in [u.split(" = ")[0] for u in updates]:
                updates.append(f"price = ${idx}")
                params.append(0)
                idx += 1

        if not updates:
            raise HTTPException(status_code=422, detail="No fields to update")

        params += [type_id]
        row = await conn.fetchrow(
            f"UPDATE ticket_type SET {', '.join(updates)} WHERE id=${idx}::uuid "
            "RETURNING id::text, name, description, price, is_free, capacity, sort_order, is_active",
            *params,
        )
    return dict(row)


@router.delete("/{event_id}/ticket-types/{type_id}",
               status_code=204,
               summary="Delete a ticket type (admin/committee)")
async def delete_ticket_type(
    event_id: str,
    type_id: str,
    claims: dict = Depends(require_event_access()),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM ticket_type WHERE id=$1::uuid AND event_id=$2::uuid",
            type_id, event_id,
        )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Ticket type not found")


# ── Event permission (approved-member delegation) ─────────────────────────────
# Organizer-only — approved members don't get to grant further access themselves.
# Uses require_role_or_organizer() with no roles passed, which reduces to a pure
# organizer check (the role-bypass list is empty, so only the organizer_id match applies).

_PERMISSION_SELECT = (
    "SELECT ep.id::text, ep.event_id::text, ep.user_id::text, "
    "u.name AS user_name, u.email AS user_email, "
    "ep.granted_by::text, gb.name AS granted_by_name, ep.granted_at "
    "FROM event_permission ep "
    "JOIN users u ON u.id = ep.user_id "
    "JOIN users gb ON gb.id = ep.granted_by "
)


@router.get("/{event_id}/permissions", response_model=list[EventPermissionOut],
            summary="List approved members for an event (organizer-only)")
async def list_permissions(
    event_id: str,
    claims: dict = Depends(require_role_or_organizer()),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            _PERMISSION_SELECT + "WHERE ep.event_id = $1::uuid AND ep.revoked_at IS NULL "
            "ORDER BY ep.granted_at DESC",
            event_id,
        )
    return [dict(r) for r in rows]


@router.post("/{event_id}/permissions", response_model=EventPermissionOut, status_code=201,
             summary="Grant a user access to manage this event (organizer-only)")
async def grant_permission(
    event_id: str,
    body: EventPermissionGrant,
    claims: dict = Depends(require_role_or_organizer()),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        target = await conn.fetchrow("SELECT id FROM users WHERE email = $1", body.email)
        if not target:
            raise HTTPException(status_code=404, detail="No user found with that email")
        granter = await conn.fetchrow("SELECT id FROM users WHERE keycloak_sub = $1", claims.get("sub"))
        if not granter:
            raise HTTPException(status_code=404, detail="Granter user record not found")

        row = await conn.fetchrow(
            "INSERT INTO event_permission (event_id, user_id, granted_by) "
            "VALUES ($1::uuid, $2::uuid, $3::uuid) "
            "ON CONFLICT (event_id, user_id) DO UPDATE SET "
            "  granted_by = EXCLUDED.granted_by, granted_at = now(), revoked_at = NULL "
            "RETURNING id",
            event_id, str(target["id"]), str(granter["id"]),
        )
        full = await conn.fetchrow(_PERMISSION_SELECT + "WHERE ep.id = $1::uuid", row["id"])
    return dict(full)


@router.delete("/{event_id}/permissions/{user_id}", status_code=204,
               summary="Revoke a user's access to this event (organizer-only)")
async def revoke_permission(
    event_id: str,
    user_id: str,
    claims: dict = Depends(require_role_or_organizer()),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "UPDATE event_permission SET revoked_at = now() "
            "WHERE event_id = $1::uuid AND user_id = $2::uuid AND revoked_at IS NULL",
            event_id, user_id,
        )
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Active permission not found")
