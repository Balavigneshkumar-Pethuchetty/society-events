from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# ── Registry ──────────────────────────────────────────────────────────────────

class RegistryCreate(BaseModel):
    event_id: str
    member_id: str
    upi_id: str = Field(..., min_length=5)


class RegistryUpdate(BaseModel):
    member_id: str
    upi_id: str = Field(..., min_length=5)


class RegistryOut(BaseModel):
    id: str
    event_id: str
    event_title: str
    member_id: str
    member_name: str
    member_email: Optional[str]
    upi_id: str
    assigned_at: datetime


class CollectorOut(BaseModel):
    upi_id: str
    upi_name: str
    upi_intent_uri: str
    event_title: str
    amount: float
    currency: str


class MemberOut(BaseModel):
    id: str
    name: str
    email: Optional[str]
    role: str


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


# ── Refunds ───────────────────────────────────────────────────────────────────

class RefundRequestBody(BaseModel):
    reason: str = Field(..., min_length=5)


class RefundCompleteBody(BaseModel):
    refund_utr: str = Field(..., min_length=6)


# ── Reconciliation ────────────────────────────────────────────────────────────

class ReconciliationStatus(BaseModel):
    last_run_at: Optional[datetime]
    pending_count: int
    last_matched_utrs: list[str]
    imap_configured: bool


class ScanResult(BaseModel):
    emails_processed: int
    matched: int
    unmatched: int


# ── Reconciliation settings ───────────────────────────────────────────────────

class ReconSettingsIn(BaseModel):
    imap_host:        str  = ""
    imap_port:        int  = 993
    imap_user:        str  = ""
    imap_password:    str  = ""    # empty string = keep existing password
    imap_mailbox:     str  = "INBOX"
    poll_interval_s:  int  = 300
    use_ai_parser:    bool = False
    ollama_host:      str  = "http://localhost:11434"
    ollama_model:     str  = "llama3"


class ReconSettingsOut(BaseModel):
    imap_host:        str
    imap_port:        int
    imap_user:        str
    imap_password_set: bool   # True when a password is saved
    imap_mailbox:     str
    poll_interval_s:  int
    use_ai_parser:    bool
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
