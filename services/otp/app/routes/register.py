"""
Phone-based user registration.

POST /register/send-otp  — verify phone ownership before creating account
POST /register/confirm   — OTP confirmed → create Keycloak user + local DB record
"""
import logging
import re

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from app.config import settings
from app.keycloak_admin import create_keycloak_user
from app.otp_store import audit, generate_otp, is_rate_limited, store_otp, verify_otp
from app.sms import send_sms

router = APIRouter()
logger = logging.getLogger(__name__)

_E164 = re.compile(r"^\+[1-9]\d{6,14}$")
_USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.-]{3,50}$")
_PASSWORD_MIN_LEN = 8


class SendOtpRequest(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        v = v.strip()
        if not _E164.match(v):
            raise ValueError("Phone must be E.164 format: +919876543210")
        return v


class ConfirmRequest(BaseModel):
    phone: str
    otp: str
    username: str
    password: str
    name: str = ""
    email: str | None = None
    flat_number: str | None = None
    address: str | None = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        v = v.strip()
        if not _E164.match(v):
            raise ValueError("Phone must be E.164 format: +919876543210")
        return v

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip()
        if not _USERNAME_RE.match(v):
            raise ValueError("Username must be 3–50 chars: letters, digits, _ . - only")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < _PASSWORD_MIN_LEN:
            raise ValueError(f"Password must be at least {_PASSWORD_MIN_LEN} characters")
        if v == v.lower():
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v

    @field_validator("otp")
    @classmethod
    def validate_otp(cls, v: str) -> str:
        v = v.strip()
        if not (v.isdigit() and len(v) == 6):
            raise ValueError("OTP must be exactly 6 digits")
        return v


@router.post("/send-otp", summary="Send OTP to verify phone before registration")
async def send_registration_otp(body: SendOtpRequest):
    phone = body.phone

    async with httpx.AsyncClient(timeout=5) as client:
        r = await client.get(
            f"{settings.user_service_url}/internal/users/by-phone/{phone}",
            headers={"X-Internal-Key": settings.internal_api_key},
        )
    if r.status_code == 200:
        await audit("reg_rejected", phone, "phone already registered")
        raise HTTPException(
            status_code=409,
            detail="A user with this phone number already exists. Please log in instead.",
        )

    if await is_rate_limited(f"reg:{phone}"):
        await audit("reg_rate_limited", phone, "1 OTP per 60 s")
        raise HTTPException(status_code=429, detail="Please wait 60 seconds before requesting another OTP.")

    otp = generate_otp()
    await store_otp(f"reg:{phone}", otp)
    await audit("reg_otp_sent", phone, f"expires in {settings.otp_ttl_seconds}s")

    sms_body = (
        f"Your {settings.society_name} registration OTP is {otp}. "
        f"Valid for 5 minutes. Do not share with anyone."
    )
    ok = await send_sms(phone, sms_body)
    if not ok:
        await audit("reg_sms_failed", phone, "SMS gateway error")

    masked = "+" + "*" * (len(phone) - 5) + phone[-4:]
    return {"status": "sent", "phone_masked": masked, "expires_in": settings.otp_ttl_seconds}


@router.post("/confirm", status_code=201, summary="Confirm OTP and create account")
async def confirm_registration(body: ConfirmRequest):
    valid, err = await verify_otp(f"reg:{body.phone}", body.otp)
    if not valid:
        await audit("reg_otp_failed", body.phone, err)
        raise HTTPException(status_code=401, detail=err)

    display_name = body.name.strip() or body.username

    try:
        kc_user_id = await create_keycloak_user(
            username=body.username,
            password=body.password,
            phone=body.phone,
            name=display_name,
            email=body.email,
        )
    except ValueError as exc:
        await audit("reg_failed", body.phone, str(exc))
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception:
        logger.exception("Keycloak user creation failed for username=%s", body.username)
        await audit("reg_failed", body.phone, "Keycloak error")
        raise HTTPException(status_code=502, detail="Identity provider error during registration")

    payload: dict = {
        "username": body.username,
        "name": display_name,
        "phone": body.phone,
        "keycloak_sub": kc_user_id,
        "identity_provider": "keycloak",
    }
    if body.email:
        payload["email"] = body.email

    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.post(
            f"{settings.user_service_url}/internal/users/register-phone",
            json=payload,
            headers={"X-Internal-Key": settings.internal_api_key},
        )
    if r.status_code not in (200, 201):
        logger.error("DB registration failed after Keycloak user created (kc_id=%s): %s", kc_user_id, r.text)
        await audit("reg_db_failed", body.phone, "Keycloak user created but DB record failed")
        raise HTTPException(
            status_code=500,
            detail="Account partially created. Contact admin with your username.",
        )

    await audit("reg_confirmed", body.phone, f"username={body.username}")

    return {
        "status": "registered",
        "message": (
            "Registration successful! Your account is pending committee approval. "
            "You can also log in with Google if your Google account uses the same email."
        ),
        "username": body.username,
    }
