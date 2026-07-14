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
_oauth2_optional = OAuth2PasswordBearer(
    tokenUrl=(
        f"{settings.keycloak_public_url}/realms/{settings.keycloak_realm}"
        "/protocol/openid-connect/token"
    ),
    auto_error=False,
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


async def get_optional_claims(token: str | None = Security(_oauth2_optional)) -> dict | None:
    """Returns claims if a valid token is provided, None otherwise (public endpoints)."""
    if not token:
        return None
    try:
        keys = await _fetch_jwks()
        header = jwt.get_unverified_header(token)
        key = next((k for k in keys if k.get("kid") == header.get("kid")), None)
        if not key:
            return None
        return jwt.decode(token, key, algorithms=["RS256"], options={"verify_aud": False})
    except JWTError:
        return None


def require_role(*roles: str):
    async def _check(claims: dict = Depends(get_current_claims)) -> dict:
        realm_roles: list[str] = claims.get("realm_access", {}).get("roles", [])
        if not any(r in realm_roles for r in roles):
            raise HTTPException(status_code=403, detail="Insufficient role")
        return claims
    return _check


def require_role_or_organizer(*roles: str):
    """Passes if the caller has one of `*roles` globally, OR is the organizer of the
    event_id path parameter on the route this is used as a dependency for. Lets a
    resident who created an event manage that one event without granting them (or
    changing) any existing admin/committee_member access."""
    async def _check(event_id: str, claims: dict = Depends(get_current_claims)) -> dict:
        realm_roles: list[str] = claims.get("realm_access", {}).get("roles", [])
        if any(r in realm_roles for r in roles):
            return claims
        pool = await get_pool()
        async with pool.acquire() as conn:
            is_organizer = await conn.fetchval(
                "SELECT 1 FROM event e JOIN users u ON u.id = e.organizer_id "
                "WHERE e.id = $1::uuid AND u.keycloak_sub = $2",
                event_id, claims.get("sub"),
            )
        if not is_organizer:
            raise HTTPException(status_code=403, detail="Insufficient role")
        return claims
    return _check


async def _has_event_access(conn, keycloak_sub: str | None, event_id: str) -> bool:
    """Shared organizer-or-approved-member check, usable outside a FastAPI dependency (e.g.
    for read routes that need to hide draft events from everyone else, not just block writes).
    False for an unauthenticated caller (keycloak_sub is None)."""
    if not keycloak_sub:
        return False
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


def require_event_access():
    """Absolute per-event access check — no admin/committee_member bypass. Passes only if
    the caller is the event's organizer OR has an active (non-revoked) event_permission
    grant for it. This is the isolation model: an event's management/fund data is visible
    only to its organizer and whoever they've explicitly approved."""
    async def _check(event_id: str, claims: dict = Depends(get_current_claims)) -> dict:
        pool = await get_pool()
        async with pool.acquire() as conn:
            has_access = await _has_event_access(conn, claims.get("sub"), event_id)
        if not has_access:
            raise HTTPException(status_code=403, detail="You don't have access to this event")
        return claims
    return _check


def require_internal_key(key: str | None = Security(_internal_key_header)) -> None:
    if key != settings.internal_api_key:
        raise HTTPException(status_code=403, detail="Internal key required")
