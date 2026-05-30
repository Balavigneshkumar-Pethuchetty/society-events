"""
Async Splunk HTTP Event Collector (HEC) client.

All send functions are fire-and-forget: errors are swallowed so that a
Splunk outage never impacts the application.  Set SPLUNK_HEC_URL and
SPLUNK_HEC_TOKEN in the environment to activate logging; if either is
absent every call is a no-op.
"""
import asyncio
import logging
import os
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_HEC_URL   = os.getenv("SPLUNK_HEC_URL",   "http://splunk:8088/services/collector/event")
_HEC_TOKEN = os.getenv("SPLUNK_HEC_TOKEN", "")
_HOST      = "society_user_service"
_SOURCE    = "user-service"


async def _ship(payload: dict) -> None:
    if not _HEC_TOKEN:
        return
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.post(
                _HEC_URL,
                json=payload,
                headers={"Authorization": f"Splunk {_HEC_TOKEN}"},
            )
            if resp.status_code not in (200, 204):
                logger.debug("Splunk HEC returned HTTP %s", resp.status_code)
    except Exception as exc:
        logger.debug("Splunk HEC unreachable: %s", exc)


def _payload(event: dict[str, Any], index: str, sourcetype: str = "fastapi") -> dict:
    return {
        "time":       time.time(),
        "index":      index,
        "sourcetype": sourcetype,
        "source":     _SOURCE,
        "host":       _HOST,
        "event":      event,
    }


async def log_app_error(event: dict[str, Any]) -> None:
    """Application errors: 4xx/5xx responses, unhandled exceptions, frontend JS errors."""
    asyncio.create_task(_ship(_payload(event, "society_app_errors")))


async def log_web_access(event: dict[str, Any]) -> None:
    """Successful API requests (2xx/3xx)."""
    asyncio.create_task(_ship(_payload(event, "society_web_access")))


async def log_security(event: dict[str, Any]) -> None:
    """Auth events: login, token refresh, 401/403, Keycloak callbacks."""
    asyncio.create_task(_ship(_payload(event, "society_security")))
