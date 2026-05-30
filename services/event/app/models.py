from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field


# ── Category ──────────────────────────────────────────────────────────────────

class CategoryOut(BaseModel):
    id: str
    name: str
    icon: Optional[str] = None
    color_hex: Optional[str] = None


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    icon: Optional[str] = None
    color_hex: Optional[str] = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$')


# ── Event ─────────────────────────────────────────────────────────────────────

class TicketTypeSummary(BaseModel):
    name: str
    price: Decimal
    is_free: bool


class EventListItem(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    venue: str
    venue_lat: Optional[float] = None
    venue_lng: Optional[float] = None
    venue_place_id: Optional[str] = None
    venue_address: Optional[str] = None
    capacity: Optional[int] = None
    status: str
    ticket_price: Decimal
    price_currency: str
    is_free: bool
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    category_color: Optional[str] = None
    organizer_id: str
    organizer_name: str
    registration_count: int
    confirmed_tickets: int
    spots_remaining: Optional[int] = None
    is_sold_out: bool
    created_at: datetime
    ticket_types: list[TicketTypeSummary] = []


class EventDetail(EventListItem):
    announcements: list["AnnouncementOut"] = []
    ticket_types: list["TicketTypeOut"] = []


class EventCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    venue: str = Field(..., min_length=1, max_length=255)
    venue_lat: Optional[float] = None
    venue_lng: Optional[float] = None
    venue_place_id: Optional[str] = None
    venue_address: Optional[str] = None
    start_time: datetime
    end_time: datetime
    capacity: Optional[int] = Field(None, gt=0)
    ticket_price: Decimal = Field(Decimal("0.00"), ge=0)
    price_currency: str = Field("INR", min_length=3, max_length=3)
    is_free: bool = True
    category_id: Optional[str] = None


class EventUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    venue: Optional[str] = Field(None, min_length=1, max_length=255)
    venue_lat: Optional[float] = None
    venue_lng: Optional[float] = None
    venue_place_id: Optional[str] = None
    venue_address: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    capacity: Optional[int] = Field(None, gt=0)
    ticket_price: Optional[Decimal] = Field(None, ge=0)
    price_currency: Optional[str] = Field(None, min_length=3, max_length=3)
    is_free: Optional[bool] = None
    category_id: Optional[str] = None


class EventListResponse(BaseModel):
    events: list[EventListItem]
    total: int
    page: int
    limit: int
    total_pages: int


# ── Announcement ──────────────────────────────────────────────────────────────

class AnnouncementOut(BaseModel):
    id: str
    event_id: str
    author_id: str
    author_name: str
    title: str
    body: str
    sent_at: datetime


class AnnouncementCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    body: str = Field(..., min_length=1)


# ── Ticket Type ───────────────────────────────────────────────────────────────

class TicketTypeOut(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    price: Decimal
    is_free: bool
    capacity: Optional[int] = None
    sort_order: int
    is_active: bool


class TicketTypeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    price: Decimal = Field(Decimal("0.00"), ge=0)
    is_free: bool = False
    capacity: Optional[int] = Field(None, gt=0)
    sort_order: int = Field(0, ge=0)
    is_active: bool = True


class TicketTypeUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    price: Optional[Decimal] = Field(None, ge=0)
    is_free: Optional[bool] = None
    capacity: Optional[int] = Field(None, gt=0)
    sort_order: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None


EventDetail.model_rebuild()
