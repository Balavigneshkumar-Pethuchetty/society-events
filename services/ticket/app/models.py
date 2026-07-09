from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class TicketTypeLine(BaseModel):
    ticket_type_name: str
    quantity: int
    unit_price: float


class TicketOut(BaseModel):
    id: str
    reg_id: str
    event_id: str
    event_title: str
    event_start_time: datetime
    event_end_time: datetime
    event_venue: str
    event_image_color: Optional[str] = None
    cancel_freeze_at: Optional[datetime] = None
    ticket_count: int
    total_amount: float
    display_currency: str
    status: str          # active | used | cancelled
    qr_token: Optional[str] = None
    issued_at: datetime
    scanned_at: Optional[datetime] = None
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    ticket_items: list[TicketTypeLine] = []
    paid_at: Optional[datetime] = None
    refund_status: Optional[str] = None   # payment_transaction status: refund_requested | refunded | ... | None
    refunded_at: Optional[datetime] = None


class EventTicketItem(BaseModel):
    ticket_id: str
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    user_phone: Optional[str] = None
    ticket_count: int
    status: str   # active | used
    scanned_at: Optional[datetime] = None
    unit_label: Optional[str] = None   # e.g. "Block A – 101" or structure node name


class ScanBody(BaseModel):
    token: str = Field(..., min_length=1)


class ScanOut(BaseModel):
    ticket_id: str
    reg_id: str
    event_id: str
    event_title: str
    event_start_time: datetime
    event_venue: str
    ticket_count: int
    status: str
    scanned_at: Optional[datetime] = None
    user_name: Optional[str] = None
    already_scanned: bool = False
