from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field


# ── Per-event collector + email-parsing settings (organizer-editable) ─────────

class CollectorSettingsIn(BaseModel):
    member_id: Optional[str] = None   # defaults to the caller when omitted
    upi_id: str = Field(..., min_length=5)
    imap_host: str = ""
    imap_port: int = 993
    imap_user: str = ""
    imap_password: str = ""   # empty string = keep existing password
    imap_mailbox: str = "INBOX"


class CollectorSettingsOut(BaseModel):
    event_id: str
    member_id: Optional[str]
    member_name: Optional[str]
    upi_id: Optional[str]
    imap_host: str
    imap_port: int
    imap_user: str
    imap_password_set: bool
    imap_mailbox: str
    assigned_at: Optional[datetime]
    reconciliation_channel_configured: bool = False


class CollectorOut(BaseModel):
    upi_id: str
    upi_name: str
    upi_intent_uri: str
    event_title: str
    amount: float
    currency: str


# ── Payments ──────────────────────────────────────────────────────────────────

class InitiateBody(BaseModel):
    event_id: str
    registration_id: Optional[str] = None
    payer_upi: Optional[str] = None


class VerifyBody(BaseModel):
    utr: str = Field(..., min_length=6)


class TransactionOut(BaseModel):
    id: str
    txn_ref: str
    event_id: str
    event_title: str
    registration_id: Optional[str]
    amount: float
    currency: str
    payee_upi: Optional[str]
    payer_upi: Optional[str]
    status: str
    payment_utr: Optional[str]
    refund_utr: Optional[str]
    created_at: datetime
    updated_at: datetime
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    screenshot_url: Optional[str] = None
    refund_screenshot_url: Optional[str] = None
    parsed_amount: Optional[float] = None
    parsed_upi_ref: Optional[str] = None
    parsed_rrn: Optional[str] = None
    parsed_bank: Optional[str] = None
    parsed_timestamp: Optional[str] = None


# ── Refunds ───────────────────────────────────────────────────────────────────

class RefundRequestBody(BaseModel):
    reason: str = Field(..., min_length=5)


class ScreenshotExtraction(BaseModel):
    parsed_amount: Optional[float] = None
    parsed_upi_ref: Optional[str] = None
    parsed_rrn: Optional[str] = None
    parsed_bank: Optional[str] = None
    parsed_timestamp: Optional[str] = None


# ── Reconciliation ────────────────────────────────────────────────────────────

class ReconciliationStatus(BaseModel):
    last_run_at: Optional[datetime]
    pending_count: int
    last_matched_utrs: list[str]
    imap_configured_events: int


class ScanResult(BaseModel):
    emails_processed: int
    matched: int
    unmatched: int


# ── Reconciliation settings ───────────────────────────────────────────────────

class ReconSettingsIn(BaseModel):
    poll_interval_s:  int  = 300
    use_ai_parser:    bool = False
    ai_provider:      str  = "ollama"   # "ollama" or "claude" — which backend use_ai_parser selects
    ollama_host:      str  = "http://localhost:11434"
    ollama_model:     str  = "llama3"


class ReconSettingsOut(BaseModel):
    poll_interval_s:  int
    use_ai_parser:    bool
    ai_provider:      str
    ollama_host:      str
    ollama_model:     str
    updated_at:       Optional[datetime]


# ── Audit ─────────────────────────────────────────────────────────────────────

class AuditEntry(BaseModel):
    id: str
    txn_id: str
    from_status: Optional[str]
    to_status: str
    updated_by: str
    note: Optional[str]
    at: datetime


# ── Funds: expenses ───────────────────────────────────────────────────────────

class ExpenseCreate(BaseModel):
    description: str = Field(..., min_length=1, max_length=255)
    amount: Decimal = Field(..., gt=0)
    currency_code: str = Field("INR", min_length=3, max_length=3)
    category: str = "other"   # venue|catering|equipment|marketing|staff|other
    receipt_url: Optional[str] = None


class ExpenseUpdate(BaseModel):
    description: Optional[str] = Field(None, min_length=1, max_length=255)
    amount: Optional[Decimal] = Field(None, gt=0)
    currency_code: Optional[str] = Field(None, min_length=3, max_length=3)
    category: Optional[str] = None
    receipt_url: Optional[str] = None


class ExpenseOut(BaseModel):
    id: str
    event_id: str
    description: str
    amount: Decimal
    currency_code: str
    category: str
    receipt_url: Optional[str]
    created_by: str
    created_by_name: str
    created_at: datetime


# ── Funds: vendor directory + per-event assignment ───────────────────────────

class VendorCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    category: str = "other"   # food|beverages|merchandise|games|services|other
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None


class VendorOut(BaseModel):
    id: str
    name: str
    category: str
    contact_name: Optional[str]
    contact_email: Optional[str]
    contact_phone: Optional[str]
    is_active: bool
    created_at: datetime


class EventVendorCreate(BaseModel):
    vendor_id: str
    stall_number: Optional[str] = None
    fee_type: str = "fixed"   # fixed|revenue_share|free
    fixed_fee: Decimal = Field(Decimal("0.00"), ge=0)
    revenue_share_pct: Decimal = Field(Decimal("0.00"), ge=0, le=100)
    notes: Optional[str] = None


class EventVendorUpdate(BaseModel):
    stall_number: Optional[str] = None
    fee_type: Optional[str] = None
    fixed_fee: Optional[Decimal] = Field(None, ge=0)
    revenue_share_pct: Optional[Decimal] = Field(None, ge=0, le=100)
    actual_revenue: Optional[Decimal] = Field(None, ge=0)
    status: Optional[str] = None   # invited|confirmed|cancelled
    notes: Optional[str] = None


class EventVendorOut(BaseModel):
    id: str
    event_id: str
    vendor_id: str
    vendor_name: str
    vendor_category: str
    stall_number: Optional[str]
    fee_type: str
    fixed_fee: Decimal
    revenue_share_pct: Decimal
    actual_revenue: Optional[Decimal]
    status: str
    notes: Optional[str]
    created_at: datetime


# ── Funds: finance summary + revenue distribution ────────────────────────────

class FinanceSummaryOut(BaseModel):
    event_id: str
    title: str
    status: str
    ticket_revenue: Decimal
    sponsorship_income: Decimal
    total_expenses: Decimal
    vendor_pool: Decimal
    net_balance: Decimal
    sponsor_count: int
    complimentary_tickets: int


class DistributionEntryCreate(BaseModel):
    recipient_type: str   # sponsor|organizer|resident|society
    recipient_user_id: Optional[str] = None
    recipient_sponsor_id: Optional[str] = None
    share_percentage: Decimal = Field(..., gt=0, le=100)
    amount: Decimal = Field(..., ge=0)
    notes: Optional[str] = None


class DistributionEntryOut(BaseModel):
    id: str
    distribution_id: str
    recipient_type: str
    recipient_user_id: Optional[str]
    recipient_sponsor_id: Optional[str]
    recipient_name: Optional[str]
    share_percentage: Decimal
    amount: Decimal
    status: str
    paid_at: Optional[datetime]
    notes: Optional[str]


class RevenueDistributionCreate(BaseModel):
    total_pool: Decimal = Field(..., ge=0)
    currency_code: str = Field("INR", min_length=3, max_length=3)
    notes: Optional[str] = None


class RevenueDistributionOut(BaseModel):
    id: str
    event_id: str
    total_pool: Decimal
    currency_code: str
    status: str   # draft|approved|distributed
    approved_by: Optional[str]
    approved_at: Optional[datetime]
    distributed_at: Optional[datetime]
    notes: Optional[str]
    created_at: datetime
    entries: list[DistributionEntryOut] = []


# ── Sponsors ───────────────────────────────────────────────────────────────────

class SponsorCreate(BaseModel):
    organization_name: str = Field(..., min_length=1, max_length=255)
    organization_type: str = "private"   # public|private|ngo|individual
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    user_id: Optional[str] = None   # link to an existing platform account, if any


class SponsorUpdate(BaseModel):
    organization_name: Optional[str] = Field(None, min_length=1, max_length=255)
    organization_type: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None
    is_active: Optional[bool] = None


class SponsorOut(BaseModel):
    id: str
    organization_name: str
    organization_type: str
    contact_name: Optional[str]
    contact_email: Optional[str]
    contact_phone: Optional[str]
    user_id: Optional[str]
    platform_user_name: Optional[str]
    is_active: bool
    created_at: datetime
    event_count: int = 0
    total_pledged: Decimal = Decimal("0")


class SponsorshipCreate(BaseModel):
    event_id: str
    amount: Decimal = Field(..., gt=0)
    currency_code: str = Field("INR", min_length=3, max_length=3)
    status: str = "pledged"   # pledged|received
    payment_reference: Optional[str] = None
    notes: Optional[str] = None


class SponsorshipUpdate(BaseModel):
    amount: Optional[Decimal] = Field(None, gt=0)
    status: Optional[str] = None
    payment_reference: Optional[str] = None
    notes: Optional[str] = None


class SponsorshipOut(BaseModel):
    id: str
    event_id: str
    event_title: str
    event_start_time: datetime
    sponsor_id: str
    sponsor_name: str
    amount: Decimal
    currency_code: str
    status: str
    payment_reference: Optional[str]
    notes: Optional[str]
    sponsored_at: datetime


class SponsorshipRefundCreate(BaseModel):
    amount: Decimal = Field(..., gt=0)
    reason: str = Field(..., min_length=5)


class SponsorshipRefundOut(BaseModel):
    id: str
    sponsorship_id: str
    event_title: str
    sponsor_name: str
    sponsor_contact: Optional[str]
    sponsorship_amount: Decimal
    sponsorship_status: str
    amount: Decimal
    reason: Optional[str]
    status: str   # pending|approved|rejected|processed
    requested_by: str
    reviewed_by: Optional[str]
    reviewed_at: Optional[datetime]
    processed_at: Optional[datetime]
    created_at: datetime


class SponsorshipRefundApprove(BaseModel):
    approved_amount: Optional[Decimal] = Field(None, gt=0)


# ── Fund export share link ────────────────────────────────────────────────────

class FundShareLinkOut(BaseModel):
    token: str
    path: str
    expires_at: datetime
