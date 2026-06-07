import time
import httpx
from fastapi import HTTPException, Security, Depends
from fastapi.security import OAuth2PasswordBearer, APIKeyHeader
from jose import jwt, JWTError
from asyncpg import Pool
from app.config import settings
from app.database import get_pool

_oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=(
        f"{settings.keycloak_public_url}/realms/{settings.keycloak_realm}"
        "/protocol/openid-connect/token"
    ),
)
_internal_key_header = APIKeyHeader(name="X-Internal-Key", auto_error=False)

# Simple in-process JWKS cache (TTL = 5 min)
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


async def get_current_claims(
    token: str = Security(_oauth2_scheme),
) -> dict:
    try:
        keys = await _fetch_jwks()
        header = jwt.get_unverified_header(token)
        key = next((k for k in keys if k.get("kid") == header.get("kid")), None)
        if not key:
            raise HTTPException(status_code=401, detail="Unknown signing key")
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
    except JWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}") from exc
    return claims


def require_role(*roles: str):
    """Dependency factory — raises 403 if caller's role is not in roles.

    Checks JWT realm_access.roles first; falls back to the local DB role when
    the JWT is sparse or stale (e.g. immediately after Keycloak role assignment).
    """
    async def _check(
        claims: dict = Depends(get_current_claims),
        pool: Pool = Depends(get_pool),
    ) -> dict:
        realm_roles: list[str] = claims.get("realm_access", {}).get("roles", [])
        if any(r in realm_roles for r in roles):
            return claims
        # JWT didn't carry the role — check the local DB as fallback
        sub = claims.get("sub")
        if sub:
            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    "SELECT role FROM users WHERE keycloak_sub = $1", sub
                )
            if row and row["role"] in roles:
                return claims
        raise HTTPException(status_code=403, detail="Insufficient role")
    return _check


def require_internal_key(key: str | None = Security(_internal_key_header)) -> None:
    """Gate for inter-service endpoints — checked against X-Internal-Key header."""
    if key != settings.internal_api_key:
        raise HTTPException(status_code=403, detail="Internal key required")
