"""Reconciliation settings — IMAP + Ollama config stored in DB (admin only)."""
import asyncio

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_role
from app.database import get_pool
from app.models import ReconSettingsIn, ReconSettingsOut

router = APIRouter()

_SELECT = """
    SELECT imap_host, imap_port, imap_user, imap_password,
           imap_mailbox, poll_interval_s, use_ai_parser,
           ollama_host, ollama_model, updated_at
    FROM payment_reconciliation_settings WHERE id = 1
"""


# ── GET /settings ─────────────────────────────────────────────────────────────

@router.get("", response_model=ReconSettingsOut,
            summary="Get current IMAP / Ollama reconciliation settings")
async def get_settings(
    claims: dict = Depends(require_role("admin", "committee_member")),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(_SELECT)
    if not row:
        raise HTTPException(status_code=500, detail="Settings row missing")
    d = dict(row)
    return ReconSettingsOut(
        imap_host=d["imap_host"],
        imap_port=d["imap_port"],
        imap_user=d["imap_user"],
        imap_password_set=bool(d["imap_password"]),
        imap_mailbox=d["imap_mailbox"],
        poll_interval_s=d["poll_interval_s"],
        use_ai_parser=d["use_ai_parser"],
        ollama_host=d["ollama_host"],
        ollama_model=d["ollama_model"],
        updated_at=d["updated_at"],
    )


# ── PUT /settings ─────────────────────────────────────────────────────────────

@router.put("", response_model=ReconSettingsOut,
            summary="Save IMAP / Ollama reconciliation settings")
async def save_settings(
    body: ReconSettingsIn,
    claims: dict = Depends(require_role("admin")),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        current = await conn.fetchrow(_SELECT)
        # Keep existing password if caller sends empty string
        password = body.imap_password if body.imap_password else (current["imap_password"] if current else "")
        await conn.execute(
            """UPDATE payment_reconciliation_settings SET
                imap_host       = $1,
                imap_port       = $2,
                imap_user       = $3,
                imap_password   = $4,
                imap_mailbox    = $5,
                poll_interval_s = $6,
                use_ai_parser   = $7,
                ollama_host     = $8,
                ollama_model    = $9,
                updated_at      = now()
               WHERE id = 1""",
            body.imap_host, body.imap_port, body.imap_user, password,
            body.imap_mailbox, body.poll_interval_s, body.use_ai_parser,
            body.ollama_host, body.ollama_model,
        )
        row = await conn.fetchrow(_SELECT)
    d = dict(row)
    return ReconSettingsOut(
        imap_host=d["imap_host"],
        imap_port=d["imap_port"],
        imap_user=d["imap_user"],
        imap_password_set=bool(d["imap_password"]),
        imap_mailbox=d["imap_mailbox"],
        poll_interval_s=d["poll_interval_s"],
        use_ai_parser=d["use_ai_parser"],
        ollama_host=d["ollama_host"],
        ollama_model=d["ollama_model"],
        updated_at=d["updated_at"],
    )


# ── POST /settings/test-imap ──────────────────────────────────────────────────

@router.post("/test-imap", summary="Test IMAP connection with saved credentials")
async def test_imap(
    claims: dict = Depends(require_role("admin", "committee_member")),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(_SELECT)
    if not row:
        raise HTTPException(status_code=500, detail="Settings row missing")

    host     = row["imap_host"]
    port     = row["imap_port"]
    user     = row["imap_user"]
    password = row["imap_password"]
    mailbox  = row["imap_mailbox"]

    if not (host and user and password):
        raise HTTPException(status_code=400, detail="IMAP credentials not configured")

    try:
        import aioimaplib
        imap = aioimaplib.IMAP4_SSL(host=host, port=port)
        await asyncio.wait_for(imap.wait_hello_from_server(), timeout=10)
        await asyncio.wait_for(imap.login(user, password), timeout=10)
        ok, data = await asyncio.wait_for(imap.select(mailbox), timeout=10)
        count = int(data[0].decode()) if data and data[0] else 0
        await imap.logout()
        return {"status": "ok", "mailbox": mailbox, "message_count": count}
    except ImportError:
        raise HTTPException(status_code=500, detail="aioimaplib not installed")
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Connection timed out")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"IMAP error: {exc}")


# ── POST /settings/test-ollama ────────────────────────────────────────────────

@router.post("/test-ollama", summary="Test Ollama connection with saved config")
async def test_ollama(
    claims: dict = Depends(require_role("admin", "committee_member")),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(_SELECT)

    host  = row["ollama_host"] if row else ""
    model = row["ollama_model"] if row else ""

    if not host:
        raise HTTPException(status_code=400, detail="Ollama host not configured")

    try:
        import httpx
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(f"{host}/api/tags")
            resp.raise_for_status()
            data = resp.json()
            models = [m["name"] for m in data.get("models", [])]
            model_available = any(m.startswith(model) for m in models)
            return {
                "status": "ok",
                "available_models": models,
                "configured_model": model,
                "model_available": model_available,
            }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Ollama error: {exc}")
