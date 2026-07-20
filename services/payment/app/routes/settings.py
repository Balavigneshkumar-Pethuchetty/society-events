"""Reconciliation settings — deployment-wide scan cadence + AI-parser config (admin only).

Per-event IMAP mailbox credentials moved to committee_registry — see
app/routes/registry.py's `/{event_id}/settings` routes.
"""
from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_role
from app.config import settings as app_settings
from app.database import get_pool
from app.models import ReconSettingsIn, ReconSettingsOut

router = APIRouter()

_SELECT = """
    SELECT poll_interval_s, use_ai_parser, ai_provider,
           ollama_host, ollama_model, updated_at
    FROM payment_reconciliation_settings WHERE id = 1
"""


# ── GET /settings ─────────────────────────────────────────────────────────────

@router.get("", response_model=ReconSettingsOut,
            summary="Get current poll-interval / AI-parser reconciliation settings")
async def get_settings(
    claims: dict = Depends(require_role("admin", "committee_member")),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(_SELECT)
    if not row:
        raise HTTPException(status_code=500, detail="Settings row missing")
    return ReconSettingsOut(**dict(row))


# ── PUT /settings ─────────────────────────────────────────────────────────────

@router.put("", response_model=ReconSettingsOut,
            summary="Save poll-interval / AI-parser reconciliation settings")
async def save_settings(
    body: ReconSettingsIn,
    claims: dict = Depends(require_role("admin")),
):
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE payment_reconciliation_settings SET
                poll_interval_s = $1,
                use_ai_parser   = $2,
                ai_provider     = $3,
                ollama_host     = $4,
                ollama_model    = $5,
                updated_at      = now()
               WHERE id = 1""",
            body.poll_interval_s, body.use_ai_parser,
            body.ai_provider, body.ollama_host, body.ollama_model,
        )
        row = await conn.fetchrow(_SELECT)
    return ReconSettingsOut(**dict(row))


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


# ── POST /settings/test-claude ─────────────────────────────────────────────────

@router.post("/test-claude", summary="Test the Claude (Anthropic) API key from .env")
async def test_claude(
    claims: dict = Depends(require_role("admin", "committee_member")),
):
    if not app_settings.anthropic_api_key:
        raise HTTPException(
            status_code=400,
            detail="ANTHROPIC_API_KEY is not set in this service's .env",
        )

    try:
        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=app_settings.anthropic_api_key)
        resp = await client.messages.create(
            model=app_settings.claude_model,
            max_tokens=8,
            messages=[{"role": "user", "content": "ping"}],
        )
        return {
            "status": "ok",
            "configured_model": app_settings.claude_model,
            "reachable": bool(resp.content),
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Claude error: {exc}")
