"""
OTP endpoints for mobile login.

POST /send     — request OTP for a registered phone number
POST /verify   — verify OTP and obtain access + session tokens
POST /refresh  — refresh access token using a bridge session token
POST /logout   — revoke bridge session
"""
import logging
import re

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.keycloak_admin import get_oidc_token_for_user
from app.otp_store import (
    audit,
    create_session,
    delete_session,
    generate_otp,
    get_session_user,
    is_rate_limited,
    store_otp,
    verify_otp,
)
from app.sms import send_sms

router = APIRouter()
logger = logging.getLogger(__name__)

_E164 = re.compile(r"^\+[1-9]\d{6,14}$")


def _check_phone(phone: str) -> str:
    phone = phone.strip()
    if not _E164.match(phone):
        raise HTTPException(
            status_code=422,
            detail="Phone must be in E.164 format, e.g. +919876543210",
        )
    return phone


class SendRequest(BaseModel):
    phone: str


class VerifyRequest(BaseModel):
    phone: str
    otp: str


class RefreshRequest(BaseModel):
    session_token: str


class LogoutRequest(BaseModel):
    session_token: str


@router.post("/send", summary="Send OTP to a registered mobile number")
async def send_otp(body: SendRequest):
    phone = _check_phone(body.phone)

    async with httpx.AsyncClient(timeout=5) as client:
        r = await client.get(
            f"{settings.user_service_url}/internal/users/by-phone/{phone}",
            headers={"X-Internal-Key": settings.internal_api_key},
        )

    if r.status_code == 404:
        await audit("otp_send_rejected", phone, "phone not registered")
        raise HTTPException(
            status_code=404,
            detail="No account found with this mobile number. Please register first.",
        )
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="User service temporarily unavailable")

    user = r.json()
    if not user.get("is_active"):
        await audit("otp_send_rejected", phone, "account not yet approved")
        raise HTTPException(
            status_code=403,
            detail="Your account is pending committee approval. Google login still works.",
        )

    if await is_rate_limited(phone):
        await audit("otp_rate_limited", phone, "1 OTP per 60 s")
        raise HTTPException(
            status_code=429,
            detail="Please wait 60 seconds before requesting another OTP.",
        )

    otp = generate_otp()
    await store_otp(phone, otp)
    await audit("otp_sent", phone, f"expires in {settings.otp_ttl_seconds}s")

    sms_body = (
        f"Your {settings.society_name} OTP is {otp}. "
        f"Valid for 5 minutes. Do not share with anyone."
    )
    ok = await send_sms(phone, sms_body)
    if not ok:
        await audit("otp_sms_failed", phone, "SMS gateway error")

    masked = "+" + "*" * (len(phone) - 5) + phone[-4:]
    return {"status": "sent", "phone_masked": masked, "expires_in": settings.otp_ttl_seconds}


@router.post("/verify", summary="Verify OTP and obtain access + session tokens")
async def verify_otp_endpoint(body: VerifyRequest):
    phone = _check_phone(body.phone)
    otp = body.otp.strip()

    if not (otp.isdigit() and len(otp) == 6):
        raise HTTPException(status_code=422, detail="OTP must be exactly 6 digits")

    valid, err = await verify_otp(phone, otp)
    if not valid:
        await audit("otp_failed", phone, err)
        raise HTTPException(status_code=401, detail=err)

    await audit("otp_verified", phone, "OTP correct — fetching Keycloak token")

    async with httpx.AsyncClient(timeout=5) as client:
        r = await client.get(
            f"{settings.user_service_url}/internal/users/by-phone/{phone}",
            headers={"X-Internal-Key": settings.internal_api_key},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="User service unavailable after OTP verification")

    user = r.json()
    kc_sub = user.get("keycloak_sub")
    if not kc_sub:
        await audit("otp_error", phone, "keycloak_sub missing — contact admin")
        raise HTTPException(
            status_code=500,
            detail="Account not linked to identity provider. Contact admin.",
        )

    try:
        oidc = await get_oidc_token_for_user(kc_sub)
    except RuntimeError as exc:
        await audit("otp_error", phone, f"token exchange failed: {exc}")
        logger.exception("Token exchange failed for phone %s (kc_sub=%s)", phone, kc_sub)
        raise HTTPException(status_code=500, detail=str(exc))

    session_token = await create_session(kc_sub)
    await audit("session_created", phone, f"session valid {settings.session_ttl_seconds}s")

    return {
        "access_token": oidc["access_token"],
        "token_type": "Bearer",
        "expires_in": oidc.get("expires_in", settings.otp_ttl_seconds),
        "session_token": session_token,
        "session_expires_in": settings.session_ttl_seconds,
    }


@router.post("/refresh", summary="Refresh access token using a bridge session token")
async def refresh_token(body: RefreshRequest):
    kc_sub = await get_session_user(body.session_token)
    if not kc_sub:
        raise HTTPException(
            status_code=401,
            detail="Session expired or invalid. Please log in again.",
        )

    try:
        oidc = await get_oidc_token_for_user(kc_sub)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    await audit("session_refreshed", "session", f"kc_sub={kc_sub[:8]}…")

    return {
        "access_token": oidc["access_token"],
        "token_type": "Bearer",
        "expires_in": oidc.get("expires_in", settings.otp_ttl_seconds),
        "session_token": body.session_token,
    }


@router.post("/logout", status_code=204, summary="Revoke bridge session")
async def logout(body: LogoutRequest):
    kc_sub = await get_session_user(body.session_token)
    await delete_session(body.session_token)
    if kc_sub:
        await audit("session_deleted", "session", f"kc_sub={kc_sub[:8]}…")
