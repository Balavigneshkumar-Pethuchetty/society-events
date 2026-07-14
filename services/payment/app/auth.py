import time
import httpx
from fastapi import HTTPException, Security, Depends
from fastapi.security import OAuth2PasswordBearer, APIKeyHeader
from jose import jwt, JWTError
from app.config import settings
from app.database import get_pool

_oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=(
        f"{settings.keycloak_public_url}/realms/{settings.keycloak_realm}"
        "/protocol/openid-connect/token"
    ),
)
_internal_key_header = APIKeyHeader(name="X-Internal-Key", auto_error=False)

_jwks_cache: dict = {"keys": [], "fetched_at": 0.0}
_JWKS_TTL = 300


async def _fetch_jwks() -> list[dict]:
    now = time.monotonic()
    if now - _jwks_cache["fetched_at"] < _JWKS_TTL and _jwks_cache["keys"]:
        return _jwks_cache["keys"]
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.get(settings.jwks_uri)
        resp.raise_for_status()
    keys = resp.json()["keys"]
    _jwks_cache["keys"] = keys
    _jwks_cache["fetched_at"] = now
    return keys


async def get_current_claims(token: str = Security(_oauth2_scheme)) -> dict:
    try:
        keys = await _fetch_jwks()
        header = jwt.get_unverified_header(token)
        key = next((k for k in keys if k.get("kid") == header.get("kid")), None)
        if not key:
            raise HTTPException(status_code=401, detail="Unknown signing key")
        claims = jwt.decode(token, key, algorithms=["RS256"], options={"verify_aud": False})
    except JWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}") from exc
    return claims


def require_role(*roles: str):
    async def _check(claims: dict = Depends(get_current_claims)) -> dict:
        realm_roles: list[str] = claims.get("realm_access", {}).get("roles", [])
        if not any(r in realm_roles for r in roles):
            raise HTTPException(status_code=403, detail="Insufficient role")
        return claims
    return _check


def require_event_access():
    """Absolute per-event access check — no admin/committee_member bypass. Mirrors
    event-service's dependency of the same name; payment-service reads the `event` and
    `event_permission` tables directly from its own connection (this repo's established
    cross-service direct-table-read pattern — see CLAUDE.md). Passes only if the caller is
    the event's organizer or has an active (non-revoked) event_permission grant."""
    async def _check(event_id: str, claims: dict = Depends(get_current_claims)) -> dict:
        pool = await get_pool()
        async with pool.acquire() as conn:
            has_access = await conn.fetchval(
                "SELECT 1 FROM event e JOIN users u ON u.keycloak_sub = $2 "
                "WHERE e.id = $1::uuid AND ("
                "  e.organizer_id = u.id OR EXISTS ("
                "    SELECT 1 FROM event_permission ep "
                "    WHERE ep.event_id = e.id AND ep.user_id = u.id AND ep.revoked_at IS NULL"
                "  )"
                ")",
                event_id, claims.get("sub"),
            )
        if not has_access:
            raise HTTPException(status_code=403, detail="You don't have access to this event")
        return claims
    return _check


async def _has_event_access(conn, keycloak_sub: str, event_id: str) -> bool:
    """Non-dependency helper for routes that need to resolve event_id indirectly (e.g. from
    a sponsorship_id) before they can check access."""
    return bool(await conn.fetchval(
        "SELECT 1 FROM event e JOIN users u ON u.keycloak_sub = $2 "
        "WHERE e.id = $1::uuid AND ("
        "  e.organizer_id = u.id OR EXISTS ("
        "    SELECT 1 FROM event_permission ep "
        "    WHERE ep.event_id = e.id AND ep.user_id = u.id AND ep.revoked_at IS NULL"
        "  )"
        ")",
        event_id, keycloak_sub,
    ))
