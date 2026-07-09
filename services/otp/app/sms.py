"""
SMS gateway abstraction — swap gateway by setting SMS_GATEWAY in .env.

  auth_service  Committee-phone failover via auth-service + Tailscale — free,
                self-hosted, no hardware cable, fails over across multiple
                phones (recommended default — see docs/mobile-otp-setup.md)
  fast2sms      Fast2SMS cloud API — no phone/hardware needed, costs money
  gammu         USB modem / Android phone connected via cable (Gammu CLI)
  httpsms       Single Android "SMS Gateway" app over Wi-Fi — no USB cable,
                no failover across multiple phones
  log           Print OTP to stdout (dev / demo mode)
  disabled      Silent no-op (CI or environments where SMS is irrelevant)

The gateway is intentionally swappable: change SMS_GATEWAY + relevant vars
in .env and run `make restart-otp-service` — no code changes required.
"""
import asyncio
import logging
import subprocess

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


async def send_sms(phone: str, message: str) -> bool:
    """Dispatch to the configured gateway. Returns True on success."""
    gw = settings.sms_gateway.lower()
    if gw == "auth_service":
        return await _auth_service_sms(phone, message)
    if gw == "fast2sms":
        return await _fast2sms(phone, message)
    if gw == "gammu":
        return await _gammu(phone, message)
    if gw == "httpsms":
        return await _http_sms(phone, message)
    if gw == "log":
        logger.warning("[SMS-LOG] >>> To %s: %s", phone, message)
        return True
    # disabled
    return True


# ── Auth-service gateway (committee-phone failover via Tailscale) ─────────────
#
# auth-service (the centralized Keycloak/tunnel provider this app registers
# with) hosts a small fleet of committee members' Android phones running the
# open-source "SMS Gateway for Android" app, reached over a private Tailscale
# network with automatic failover if one phone is offline. auth-service
# exposes this as a simple authenticated HTTP endpoint; this project doesn't
# need to know anything about Tailscale or which phones exist.
#
# Setup: in auth-service, add/rotate phones via its `sms_gateways` table
# (see its dashboard or POST /api/sms-gateways). Then here, add to .env:
#   SMS_GATEWAY=auth_service
#   AUTH_SERVICE_API_KEY=<same value as auth-service's OTP_SERVICE_API_KEY>
# Run: make restart-otp-service

async def _auth_service_sms(phone: str, message: str) -> bool:
    if not settings.auth_service_api_key:
        logger.error("[SMS-AUTHSVC] AUTH_SERVICE_API_KEY not configured")
        return False

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                settings.auth_service_sms_url,
                json={"phone": phone, "message": message},
                headers={"X-API-Key": settings.auth_service_api_key},
            )
            data = r.json()
            if r.status_code == 200 and data.get("sent"):
                logger.info("[SMS-AUTHSVC] Sent to %s via %s", phone, data.get("via"))
                return True
            logger.error("[SMS-AUTHSVC] Failed for %s: %s", phone, data)
            return False
    except Exception as exc:
        logger.error("[SMS-AUTHSVC] Error: %s", exc)
        return False


# ── Fast2SMS (cloud API — no hardware needed, India only) ─────────────────────
#
# Sign up at https://fast2sms.com → Dev API → copy your API Authorization Key
# Add to .env:
#   SMS_GATEWAY=fast2sms
#   FAST2SMS_API_KEY=<your key>
# Run: make restart-otp-service
#
# Works for Indian numbers (+91 XXXXXXXXXX) only.
# Uses "Quick" route — no DLT registration required.
# Cost: ~₹0.15–0.25 per SMS. ₹50 credit ≈ 200–300 OTPs.

async def _fast2sms(phone: str, message: str) -> bool:
    if not settings.fast2sms_api_key:
        logger.error("[SMS-FAST2SMS] FAST2SMS_API_KEY not set in .env")
        return False

    # Fast2SMS requires 10-digit Indian number (strip +91 or 91 prefix)
    number = phone.lstrip("+")
    if number.startswith("91") and len(number) == 12:
        number = number[2:]   # +919876543210 → 9876543210
    if len(number) != 10:
        logger.error("[SMS-FAST2SMS] Only 10-digit Indian numbers supported, got: %s", phone)
        return False

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                "https://www.fast2sms.com/dev/bulkV2",
                headers={"authorization": settings.fast2sms_api_key},
                data={
                    "route":   "q",       # Quick route — no DLT needed
                    "message": message,
                    "numbers": number,
                    "flash":   "0",
                },
            )
            data = r.json()
            if r.status_code == 200 and data.get("return") is True:
                logger.info("[SMS-FAST2SMS] Sent to %s | request_id=%s",
                            phone, data.get("request_id", "?"))
                return True
            logger.error("[SMS-FAST2SMS] Failed for %s: %s", phone, data)
            return False
    except Exception as exc:
        logger.error("[SMS-FAST2SMS] Error: %s", exc)
        return False


# ── Gammu (USB modem / phone as modem via cable) ──────────────────────────────

async def _gammu(phone: str, message: str) -> bool:
    """
    Send via `gammu sendsms TEXT <phone> -text <msg>`.
    Requires gammu installed inside the container and a USB modem device
    passed in via docker-compose `devices:`.
    Falls back to log mode on FileNotFoundError.
    """
    cmd = ["gammu", "--config", settings.gammu_config,
           "sendsms", "TEXT", phone, "-text", message]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
        if proc.returncode == 0:
            logger.info("[SMS-GAMMU] Sent to %s", phone)
            return True
        logger.error("[SMS-GAMMU] Error for %s: %s", phone, stderr.decode().strip())
        return False
    except FileNotFoundError:
        logger.warning("[SMS-GAMMU] gammu not found — logging OTP for %s: %s", phone, message)
        return False
    except asyncio.TimeoutError:
        logger.error("[SMS-GAMMU] Timed out for %s", phone)
        return False


# ── HTTP SMS gateway (Android app, no USB cable) ──────────────────────────────
#
# Install the open-source "Android SMS Gateway" app on your Android phone:
#   Play Store: https://play.google.com/store/apps/details?id=me.capcom.smsgateway
#   GitHub:     https://github.com/capcom6/android-sms-gateway
#
# Setup:
#   1. Install the app → tap "Start Server"
#   2. The app shows a local URL like http://192.168.1.100:8080
#      and an API key (tap "Show API Key")
#   3. Make sure the server phone and this Docker host are on the same Wi-Fi
#      (or expose via ngrok / Cloudflare tunnel for remote access)
#   4. Add to .env:
#        SMS_GATEWAY=httpsms
#        HTTP_SMS_URL=http://192.168.1.100:8080
#        HTTP_SMS_API_KEY=<key from the app>
#        HTTP_SMS_FROM=+919876543210   ← SIM number in the gateway phone
#   5. make restart-otp-service

async def _http_sms(phone: str, message: str) -> bool:
    if not settings.http_sms_url or not settings.http_sms_api_key:
        logger.error("[SMS-HTTP] HTTP_SMS_URL or HTTP_SMS_API_KEY not configured")
        return False

    payload = {
        "message": message,
        "phoneNumbers": [phone],
    }
    if settings.http_sms_from:
        payload["simNumber"] = 1   # use first SIM (app supports dual-SIM)

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{settings.http_sms_url.rstrip('/')}/api/3rdparty/v1/message",
                json=payload,
                headers={
                    "Authorization": f"Basic {settings.http_sms_api_key}",
                    "Content-Type": "application/json",
                },
            )
            if r.status_code in (200, 201):
                logger.info("[SMS-HTTP] Queued to %s via Android gateway", phone)
                return True
            logger.error("[SMS-HTTP] Gateway returned %s: %s", r.status_code, r.text)
            return False
    except httpx.ConnectError:
        logger.error(
            "[SMS-HTTP] Cannot reach gateway at %s — "
            "is the Android app running and on the same network?",
            settings.http_sms_url,
        )
        return False
    except Exception as exc:
        logger.error("[SMS-HTTP] Unexpected error: %s", exc)
        return False
