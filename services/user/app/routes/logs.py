"""
Frontend error log proxy.

The browser POSTs JS errors here instead of hitting Splunk HEC directly,
keeping the HEC token server-side.  The endpoint is intentionally public
(no auth) so errors caught before/during login are still captured.
"""
from typing import Any, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.splunk_logger import log_app_error

router = APIRouter()


class FrontendLogPayload(BaseModel):
    level:    str = "error"
    message:  str
    source:   Optional[str] = None
    url:      Optional[str] = None
    stack:    Optional[str] = None
    extra:    Optional[dict[str, Any]] = None


@router.post("/frontend-logs", status_code=204, include_in_schema=False)
async def receive_frontend_log(body: FrontendLogPayload, request: Request):
    await log_app_error({
        "source":     "frontend",
        "level":      body.level.upper(),
        "message":    body.message,
        "url":        body.url,
        "stack":      body.stack,
        "js_source":  body.source,
        "user_agent": request.headers.get("user-agent", ""),
        "client_ip":  request.client.host if request.client else "unknown",
        **(body.extra or {}),
    })
