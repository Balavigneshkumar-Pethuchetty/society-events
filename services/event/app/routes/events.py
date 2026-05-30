import math
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from app.auth import get_current_claims, get_optional_claims, require_role
from app.config import settings
from app.database import get_pool
from app.models import (
    AnnouncementCreate, AnnouncementOut,
    EventCreate, EventDetail, EventListItem, EventListResponse, EventUpdate,
    TicketTypeOut,
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
    e.capacity,
    e.status,
    e.ticket_price,
    e.price_currency,
    e.is_free,
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
    END                  AS spots_remaining
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
    confirmed = d.get("confirmed_tickets", 0)
    remaining = d.get("spots_remaining")
    d["is_sold_out"] = bool(capacity is not None and remaining is not None and remaining <= 0)
    return d


# ── GET /events ───────────────────────────────────────────────────────────────

@router.get("", response_model=EventListResponse, summary="Paginated event listing")
async def list_events(
    page:        int            = Query(1,  ge=1),
    limit:       int            = Query(9,  ge=1, le=50),
    search:      Optional[str]  = Query(None),
    category_id: Optional[str]  = Query(None),
    status:      Optional[str]  = Query("published"),
    is_free:     Optional[bool] = Query(None),
    sort:        str            = Query("date_asc"),
    _claims:     Optional[dict] = Depends(get_optional_claims),
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

    conditions = ["e.society_id = $1"]
    params: list = [_SOCIETY]
    idx = 2

    if status:
        conditions.append(f"e.status = ${idx}")
        params.append(status)
        idx += 1

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

    pool = await get_pool()
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
    _claims:  Optional[dict] = Depends(get_optional_claims),
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

@router.post("", status_code=201, summary="Create event (admin/committee)")
async def create_event(
    body:   EventCreate,
    claims: dict = Depends(require_role("admin", "committee_member")),
):
    if body.end_time <= body.start_time:
        raise HTTPException(status_code=422, detail="end_time must be after start_time")

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
            "start_time, end_time, venue, capacity, ticket_price, price_currency, is_free, status) "
            "VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'draft') "
            "RETURNING id::text",
            _SOCIETY,
            body.category_id,
            str(organizer["id"]),
            body.title,
            body.description,
            body.start_time,
            body.end_time,
            body.venue,
            body.capacity,
            body.ticket_price,
            body.price_currency,
            body.is_free,
        )
    return {"id": row["id"], "status": "draft"}


# ── PUT /events/{event_id} ────────────────────────────────────────────────────

@router.put("/{event_id}", summary="Update event details (admin/committee)")
async def update_event(
    event_id: str,
    body:     EventUpdate,
    claims:   dict = Depends(require_role("admin", "committee_member")),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        event = await conn.fetchrow(
            "SELECT status FROM event WHERE id=$1::uuid AND society_id=$2::uuid",
            event_id, _SOCIETY,
        )
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        if event["status"] not in ("draft", "published"):
            raise HTTPException(status_code=409, detail="Cannot edit a cancelled or completed event")

        updates: list[str] = []
        params: list = []
        idx = 1

        for field, col in [
            ("title", "title"), ("description", "description"), ("venue", "venue"),
            ("start_time", "start_time"), ("end_time", "end_time"),
            ("capacity", "capacity"), ("ticket_price", "ticket_price"),
            ("price_currency", "price_currency"), ("is_free", "is_free"),
            ("category_id", "category_id"),
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
    claims:   dict = Depends(require_role("admin", "committee_member")),
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
    claims:   dict = Depends(require_role("admin", "committee_member")),
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
    claims:   dict = Depends(require_role("admin", "committee_member")),
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

@router.delete("/{event_id}", status_code=204, summary="Delete a draft event")
async def delete_event(
    event_id: str,
    claims:   dict = Depends(require_role("admin", "committee_member")),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM event "
            "WHERE id=$1::uuid AND society_id=$2::uuid AND status='draft'",
            event_id, _SOCIETY,
        )
    if result == "DELETE 0":
        raise HTTPException(status_code=409, detail="Event not found or not in draft state")


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
    claims:   dict = Depends(require_role("admin", "committee_member")),
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
