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
    cancel_freeze_at: Optional[datetime] = None
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
    cancel_freeze_at: Optional[datetime] = None


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
    cancel_freeze_at: Optional[datetime] = None


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


# ── Registration & Payment (manual screenshot flow) ───────────────────────────

class TicketSelection(BaseModel):
    ticket_type_id: Optional[str] = None
    ticket_type_name: str = "General Entry"
    quantity: int = Field(1, ge=1, le=20)
    unit_price: Decimal = Decimal("0.00")


class RegistrationCreate(BaseModel):
    event_id: str
    tickets: list[TicketSelection] = Field(default_factory=list)
    ticket_count: int = Field(1, ge=1, le=20)


class PaymentOut(BaseModel):
    id: str
    status: str
    payment_method: Optional[str] = None
    screenshot_path: Optional[str] = None
    utr_number: Optional[str] = None
    review_notes: Optional[str] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None


class RegistrationOut(BaseModel):
    id: str
    event_id: str
    event_title: str
    event_start_time: datetime
    event_end_time: datetime
    event_venue: str
    event_is_free: bool
    event_image_color: Optional[str] = None
    ticket_count: int
    total_amount: Decimal
    display_currency: str
    status: str
    registered_at: datetime
    payment: Optional[PaymentOut] = None
    user_name: Optional[str] = None
    user_email: Optional[str] = None


class PaymentReviewBody(BaseModel):
    action: str = Field(..., pattern=r'^(approve|reject)$')
    notes: Optional[str] = None
