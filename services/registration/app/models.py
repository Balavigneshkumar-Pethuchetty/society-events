from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field


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
    qr_token: Optional[str] = None
    payment: Optional[PaymentOut] = None
    user_name: Optional[str] = None
    user_email: Optional[str] = None


class PaymentReviewBody(BaseModel):
    action: str = Field(..., pattern=r'^(approve|reject)$')
    notes: Optional[str] = None


class ScanBody(BaseModel):
    token: str = Field(..., min_length=1)


# ── Cart ──────────────────────────────────────────────────────────────────────

class CartTicket(BaseModel):
    id: Optional[str] = None
    name: str
    qty: int = Field(..., ge=1, le=20)
    price: float
    is_free: bool


class CartIn(BaseModel):
    event_id: str
    event_title: str
    event_venue: str
    event_start: datetime
    currency: str = "INR"
    tickets: list[CartTicket]


class CartOut(BaseModel):
    id: str
    event_id: str
    event_title: str
    event_venue: str
    event_start: datetime
    currency: str
    tickets: list[CartTicket]
    created_at: datetime
    updated_at: datetime
