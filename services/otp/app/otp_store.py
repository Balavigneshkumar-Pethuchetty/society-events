"""
Redis-backed OTP storage + audit log.

Keys used:
  otp:val:{phone}       — HMAC-SHA256(phone:otp), TTL = otp_ttl_seconds
  otp:attempts:{phone}  — wrong-guess counter, same TTL
  otp:rate:{phone}      — rate-limit sentinel, TTL = otp_rate_limit_seconds
  otp:session:{token}   — kc_user_id, TTL = session_ttl_seconds
  otp:audit             — Redis LIST, last 200 JSON events (newest first)
"""
import hashlib
import hmac
import json
import os
import secrets
import time

import redis.asyncio as aioredis

from app.config import settings

_redis: aioredis.Redis | None = None

_AUDIT_KEY = "otp:audit"
_AUDIT_MAX = 200   # keep the 200 most-recent events


def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        url = settings.redis_url
        if settings.redis_password:
            url = url.replace("redis://", f"redis://:{settings.redis_password}@", 1)
        _redis = aioredis.from_url(url, decode_responses=True)
    return _redis


# ── Key helpers ───────────────────────────────────────────────────────────────

def _otp_key(phone: str) -> str:      return f"otp:val:{phone}"
def _attempts_key(phone: str) -> str: return f"otp:attempts:{phone}"
def _rate_key(phone: str) -> str:     return f"otp:rate:{phone}"
def _session_key(tok: str) -> str:    return f"otp:session:{tok}"


# ── Phone masking ─────────────────────────────────────────────────────────────

def mask_phone(phone: str) -> str:
    """Show only the last 4 digits: +91******3210"""
    if len(phone) <= 4:
        return "*" * len(phone)
    prefix = "+" if phone.startswith("+") else ""
    visible = phone[-4:]
    stars = "*" * max(len(phone) - len(prefix) - 4, 0)
    return prefix + stars + visible


# ── Audit log ─────────────────────────────────────────────────────────────────

async def audit(event: str, phone: str, detail: str = "") -> None:
    """Append a JSON event to the Redis audit list (newest first, max 200)."""
    entry = json.dumps({
        "ts": round(time.time(), 3),
        "type": event,           # otp_sent | otp_verified | otp_failed | otp_expired
                                 # session_created | session_refreshed | session_deleted
                                 # reg_otp_sent | reg_confirmed | reg_failed
        "phone": mask_phone(phone),
        "detail": detail,
    })
    r = _get_redis()
    async with r.pipeline() as pipe:
        pipe.lpush(_AUDIT_KEY, entry)
        pipe.ltrim(_AUDIT_KEY, 0, _AUDIT_MAX - 1)
        await pipe.execute()


async def get_audit_log(limit: int = 100) -> list[dict]:
    entries = await _get_redis().lrange(_AUDIT_KEY, 0, limit - 1)
    out = []
    for e in entries:
        try:
            out.append(json.loads(e))
        except Exception:
            pass
    return out


# ── OTP helpers ───────────────────────────────────────────────────────────────

def _hmac_otp(otp: str, phone: str) -> str:
    secret = settings.internal_api_key.encode()
    return hmac.new(secret, f"{phone}:{otp}".encode(), hashlib.sha256).hexdigest()


def generate_otp() -> str:
    return str(int.from_bytes(os.urandom(4), "big") % 900_000 + 100_000)


# ── Public API ────────────────────────────────────────────────────────────────

async def is_rate_limited(phone: str) -> bool:
    return await _get_redis().exists(_rate_key(phone)) == 1


async def store_otp(phone: str, otp: str) -> None:
    r = _get_redis()
    hashed = _hmac_otp(otp, phone)
    async with r.pipeline(transaction=True) as pipe:
        pipe.setex(_otp_key(phone), settings.otp_ttl_seconds, hashed)
        pipe.setex(_rate_key(phone), settings.otp_rate_limit_seconds, "1")
        pipe.delete(_attempts_key(phone))
        await pipe.execute()


async def verify_otp(phone: str, otp: str) -> tuple[bool, str]:
    r = _get_redis()
    stored_hash = await r.get(_otp_key(phone))
    if not stored_hash:
        return False, "OTP has expired or was not requested"

    attempts = int(await r.get(_attempts_key(phone)) or 0)
    if attempts >= settings.otp_max_attempts:
        await r.delete(_otp_key(phone), _attempts_key(phone))
        return False, "Too many incorrect attempts. Please request a new OTP."

    if not hmac.compare_digest(_hmac_otp(otp, phone), stored_hash):
        await r.incr(_attempts_key(phone))
        remaining = settings.otp_max_attempts - attempts - 1
        suffix = "attempt" if remaining == 1 else "attempts"
        return False, f"Incorrect OTP. {remaining} {suffix} remaining."

    async with r.pipeline(transaction=True) as pipe:
        pipe.delete(_otp_key(phone))
        pipe.delete(_attempts_key(phone))
        await pipe.execute()

    return True, ""


# ── Bridge session ────────────────────────────────────────────────────────────

async def create_session(kc_user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    await _get_redis().setex(_session_key(token), settings.session_ttl_seconds, kc_user_id)
    return token


async def get_session_user(session_token: str) -> str | None:
    return await _get_redis().get(_session_key(session_token))


async def delete_session(session_token: str) -> None:
    await _get_redis().delete(_session_key(session_token))


# ── Monitor helpers ───────────────────────────────────────────────────────────

async def get_stats() -> dict:
    """Aggregate live stats from Redis for the monitoring dashboard."""
    r = _get_redis()

    # Count active OTPs, sessions, rate-limited phones
    otp_keys      = await r.keys("otp:val:*")
    session_keys  = await r.keys("otp:session:*")
    rate_keys     = await r.keys("otp:rate:*")

    active_otps: list[dict] = []
    for k in otp_keys:
        ttl = await r.ttl(k)
        phone = k.removeprefix("otp:val:")
        attempts = int(await r.get(_attempts_key(phone)) or 0)
        active_otps.append({
            "phone": mask_phone(phone),
            "ttl_seconds": ttl,
            "attempts_used": attempts,
        })

    rate_limited: list[dict] = []
    for k in rate_keys:
        ttl = await r.ttl(k)
        phone = k.removeprefix("otp:rate:")
        rate_limited.append({
            "phone": mask_phone(phone),
            "retry_in_seconds": ttl,
        })

    return {
        "active_otps": active_otps,
        "active_sessions": len(session_keys),
        "rate_limited_phones": rate_limited,
    }
