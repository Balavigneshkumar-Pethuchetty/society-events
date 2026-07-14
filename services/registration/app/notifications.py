"""Notify whoever manages an event (organizer + active event_permission
grantees) via in-app notification, SMS, and Telegram — used when a resident
submits a payment-verification screenshot, cancels a booking, or that
cancellation triggers a refund request. See ~/auth-service's /api/sms/send
and /api/telegram/send for the actual delivery transport.

Split in two so the outbound HTTP fan-out never happens while a pooled DB
connection is held open (max_size — see database.py):
  - resolve_and_record() runs inside the caller's existing
    `async with pool.acquire() as conn:` block.
  - send_channels() runs after that block exits, via BackgroundTasks, since
    auth-service's SMS failover chain can take up to ~30s worst case and
    must not sit on the resident's request/response cycle.
"""
import asyncio

import httpx

from app.config import settings
from app.splunk_logger import log_app_error


def _mask_phone(phone: str) -> str:
    return "*" * max(0, len(phone) - 4) + phone[-4:] if len(phone) >= 4 else "***"


async def resolve_and_record(
    conn, event_id: str, actor_user_id: str, type_: str, title: str, message: str, related_id: str | None = None,
) -> list[dict]:
    rows = await conn.fetch(
        "SELECT u.id, u.phone FROM users u "
        "WHERE (u.id = (SELECT organizer_id FROM event WHERE id = $1::uuid) "
        "   OR u.id IN (SELECT user_id FROM event_permission WHERE event_id = $1::uuid AND revoked_at IS NULL)) "
        "  AND u.id != $2::uuid",
        event_id, actor_user_id,
    )
    for r in rows:
        await conn.execute(
            "INSERT INTO notification (user_id, event_id, type, title, message, related_id) "
            "VALUES ($1, $2::uuid, $3, $4, $5, $6)",
            r["id"], event_id, type_, title, message, related_id,
        )
    return [dict(r) for r in rows]


async def send_channels(recipients: list[dict], message: str) -> None:
    if not recipients or not settings.auth_service_api_key:
        return

    async with httpx.AsyncClient(timeout=40.0) as client:
        headers = {"X-Api-Key": settings.auth_service_api_key}

        async def _send(url: str, phone: str) -> None:
            try:
                r = await client.post(url, json={"phone": phone, "message": message}, headers=headers)
                if r.status_code >= 300 or not r.json().get("sent", True):
                    await log_app_error({
                        "event": "notify_channel_failed", "url": url,
                        "phone": _mask_phone(phone), "status": r.status_code,
                    })
            except Exception as exc:
                await log_app_error({
                    "event": "notify_channel_exception", "url": url,
                    "phone": _mask_phone(phone), "error": str(exc)[:200],
                })

        tasks = []
        for r in recipients:
            if not r["phone"]:
                continue
            tasks.append(_send(f"{settings.auth_service_url}/api/sms/send", r["phone"]))
            tasks.append(_send(f"{settings.auth_service_url}/api/telegram/send", r["phone"]))

        if tasks:
            await asyncio.gather(*tasks)
