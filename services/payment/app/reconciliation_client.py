"""Backend-to-backend client for the external Payment Reconciliation service
(~/payment_reconcilation_service). We call it on behalf of residents as a
trusted internal caller — this is required both to honor the receiver UPI ID
resolved from our own committee_registry (instead of that service's hardcoded
default VPA) and because /channels (admin only), /parseImage, and
/verifyPaymentScreenshot (admin or committee_member) all require roles a real
resident's own token never has. We mint both roles so every endpoint we call
is covered without needing to track each one's exact RBAC requirement.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import HTTPException
from jose import jwt as jose_jwt

from app.config import settings

_LOCAL_ISSUER = "payment-reconciliation-local"


def _mint_service_token() -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "iss": _LOCAL_ISSUER,
        "sub": "event-management-payment-service",
        "preferred_username": "event-management",
        "aud": [settings.reconciliation_service_audience],
        "realm_access": {"roles": ["admin", "committee_member"]},
        "iat": now,
        "exp": now + timedelta(minutes=5),
    }
    return jose_jwt.encode(payload, settings.reconciliation_service_secret_key, algorithm="HS256")


def _raise_for_error(resp: httpx.Response) -> None:
    if resp.status_code < 400:
        return
    detail = resp.json().get("detail") if resp.headers.get("content-type", "").startswith("application/json") else resp.text
    raise HTTPException(status_code=502, detail=f"Payment reconciliation service error: {detail}")


async def create_payment_intent(payload: dict) -> dict:
    token = _mint_service_token()
    url = f"{settings.reconciliation_service_base_url}/createPayment"
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.post(url, json=payload, headers={"Authorization": f"Bearer {token}"})
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Payment reconciliation service unreachable: {exc}")

    _raise_for_error(resp)
    data = resp.json()
    # upi_qr_data comes back as bare base64 (no data-URI prefix) — normalize so the
    # frontend can drop it straight into an <img src> as documented.
    qr = data.get("upi_qr_data")
    if qr and not qr.startswith("data:"):
        data["upi_qr_data"] = f"data:image/png;base64,{qr}"
    return data


async def get_transaction_status(transaction_id: str) -> dict:
    """Read a PaymentIntent's current status from the reconciliation service directly —
    used to recover a local payment_transaction that's stuck 'pending' even though the
    other side already reconciled it. Confirming the SSE-driven /payments/auto-confirm
    call from the browser is the only thing that normally flips it, and that call is
    entirely client-side and best-effort (a closed tab, dropped connection, or any error
    in that fire-and-forget request silently leaves the local row stale forever)."""
    token = _mint_service_token()
    url = f"{settings.reconciliation_service_base_url}/transactions/{transaction_id}"
    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Payment reconciliation service unreachable: {exc}")

    _raise_for_error(resp)
    return resp.json()


async def list_channels() -> list[dict]:
    token = _mint_service_token()
    url = f"{settings.reconciliation_service_base_url}/channels"
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Payment reconciliation service unreachable: {exc}")

    _raise_for_error(resp)
    return resp.json()


async def create_channel(name: str, credentials: dict, is_active: bool = False) -> dict:
    """Provision a per-event IMAP channel on the sibling service, mirroring an event's
    own committee_registry.imap_* fields so verify_screenshot/verify_refund_screenshot
    can search that organizer's own inbox instead of a single shared channel. Defaults
    to is_active=False — these on-demand endpoints don't require it, and it keeps
    per-event channels out of the sibling's background polling monitor_loop."""
    token = _mint_service_token()
    url = f"{settings.reconciliation_service_base_url}/channels"
    payload = {
        "name": name,
        "channel_type": "EMAIL",
        "provider": "IMAP",
        "credentials": credentials,
        "is_active": is_active,
    }
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.post(url, json=payload, headers={"Authorization": f"Bearer {token}"})
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Payment reconciliation service unreachable: {exc}")

    _raise_for_error(resp)
    return resp.json()


async def update_channel(channel_id: str, credentials: dict) -> dict:
    """Push updated IMAP credentials to an already-provisioned per-event channel."""
    token = _mint_service_token()
    url = f"{settings.reconciliation_service_base_url}/channels/{channel_id}"
    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.patch(
                url, json={"credentials": credentials}, headers={"Authorization": f"Bearer {token}"}
            )
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Payment reconciliation service unreachable: {exc}")

    _raise_for_error(resp)
    return resp.json()


async def test_channel(channel_id: str, limit: int = 3) -> dict:
    """Live, read-only check that the sibling service can actually log into and read this
    event's channel — used by the Collector & Email tab's 'Test via Reconciliation Service'
    button, distinct from this repo's own direct IMAP test (test_event_imap in registry.py):
    this one confirms the *sibling's* copy of the credentials (as synced by
    _sync_reconciliation_channel) still works, not just this repo's own. mark_seen stays
    False so testing never consumes unread messages the real scan would still need."""
    token = _mint_service_token()
    url = f"{settings.reconciliation_service_base_url}/channels/test-fetch"
    payload = {
        "channel_id": channel_id,
        "limit": limit,
        "include_seen": True,
        "mark_seen": False,
    }
    # Same reasoning as parse_screenshot/verify_screenshot's timeouts below: this
    # endpoint runs Ollama over every fetched message (their own code notes up to
    # ~30s per model call), gathered concurrently but still capped by the slowest
    # one — 30s was measured to be too tight and produced real timeouts here.
    async with httpx.AsyncClient(timeout=60) as client:
        try:
            resp = await client.post(url, json=payload, headers={"Authorization": f"Bearer {token}"})
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Payment reconciliation service unreachable: {exc}")

    _raise_for_error(resp)
    return resp.json()


# No concrete example date/time here on purpose — an earlier version included one
# ("e.g. 27 Jun 2026, 7:56 PM") and the vision model echoed that exact literal string
# back as the "extracted" timestamp on a test image that had no date/time text on it
# at all. Describe the format abstractly instead so there's nothing to parrot.
_PARSE_HINT = (
    "Extract exactly three things from this UPI payment confirmation screenshot: "
    "1) the UPI transaction reference number (UTR) — usually a 12-digit number labeled "
    "'UPI Ref No', 'UTR', 'Txn ID', or 'Reference No'; "
    "2) the transaction date AND time shown on screen, both together as one string, using "
    "only the digits/words actually visible in the image — never invent or guess a date; "
    "3) the amount paid in rupees. "
    "If any of these three is not visible anywhere in the image, return null for that field "
    "rather than making one up."
)


async def parse_screenshot(file_bytes: bytes, filename: str, content_type: str) -> dict:
    token = _mint_service_token()
    url = f"{settings.reconciliation_service_base_url}/parseImage"
    # The full extraction chain on the other side (vision AI, then on a miss OCR +
    # a second AI text-parse pass) is CPU-bound Ollama inference — measured up to
    # ~35s per model call, so a null/failed vision attempt followed by the OCR
    # fallback can approach 80s total. 80s was cutting it too close and produced
    # real 502s; give it real headroom (kept under nginx's proxy_read_timeout below
    # so this fires first with a clear message instead of nginx's generic timeout).
    async with httpx.AsyncClient(timeout=110) as client:
        try:
            resp = await client.post(
                url,
                data={"parse_hint": _PARSE_HINT},
                files={"file": (filename, file_bytes, content_type)},
                headers={"Authorization": f"Bearer {token}"},
            )
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Payment reconciliation service unreachable: {exc}")

    _raise_for_error(resp)
    return resp.json()


async def verify_refund_screenshot(
    file_bytes: bytes, filename: str, content_type: str,
    channel_id: str, reconciliation_txn_id: str,
    manual_upi_ref: Optional[str] = None,
    manual_amount: Optional[float] = None,
    search_days: int = 3,
) -> dict:
    """Same AI-vision + bank-email verification as verify_screenshot, but for an
    OUTGOING refund transfer instead of an incoming payment (is_refund=True on the
    other side). reconciliation_txn_id must already be RECONCILED there — it's the
    original payment being refunded, read from this row's own reconciliation_txn_id
    column (set when the original payment was verified)."""
    token = _mint_service_token()
    url = f"{settings.reconciliation_service_base_url}/verifyPaymentScreenshot"
    form: dict = {
        "channel_id": channel_id,
        "search_days": str(search_days),
        "parse_hint": _PARSE_HINT,
        "txn_id": reconciliation_txn_id,
        "is_refund": "true",
    }
    if manual_upi_ref:
        form["manual_upi_ref"] = manual_upi_ref
    if manual_amount is not None:
        form["manual_amount"] = str(manual_amount)

    # Same reasoning as verify_screenshot's timeout above.
    async with httpx.AsyncClient(timeout=110) as client:
        try:
            resp = await client.post(
                url,
                data=form,
                files={"file": (filename, file_bytes, content_type)},
                headers={"Authorization": f"Bearer {token}"},
            )
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Payment reconciliation service unreachable: {exc}")

    _raise_for_error(resp)
    return resp.json()


async def verify_screenshot(
    file_bytes: bytes, filename: str, content_type: str,
    channel_id: str, txn_id: Optional[str],
    manual_upi_ref: Optional[str], manual_amount: Optional[float],
    search_days: int = 3,
) -> dict:
    token = _mint_service_token()
    url = f"{settings.reconciliation_service_base_url}/verifyPaymentScreenshot"
    form: dict = {"channel_id": channel_id, "search_days": str(search_days), "parse_hint": _PARSE_HINT}
    if txn_id:
        form["txn_id"] = txn_id
    if manual_upi_ref:
        form["manual_upi_ref"] = manual_upi_ref
    if manual_amount is not None:
        form["manual_amount"] = str(manual_amount)

    # Same reasoning as parse_screenshot's timeout above — this path also does a live
    # IMAP mailbox search on top of the AI extraction chain.
    async with httpx.AsyncClient(timeout=110) as client:
        try:
            resp = await client.post(
                url,
                data=form,
                files={"file": (filename, file_bytes, content_type)},
                headers={"Authorization": f"Bearer {token}"},
            )
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail=f"Payment reconciliation service unreachable: {exc}")

    _raise_for_error(resp)
    return resp.json()
