"""
Keycloak Admin REST API client for the OTP Bridge Service.

Token generation strategy (Token Exchange — RFC 8693):
  1. otp-bridge service account authenticates with client_credentials.
  2. Bridge exchanges its own token for a user token using
     grant_type=urn:ietf:params:oauth:grant-type:token-exchange
     with requested_subject=<target_user_kc_id>.
  This requires:
    - --features=token-exchange on the Keycloak server
    - otp-bridge service account has the `impersonation` role from realm-management.
  Neither operation touches the user's existing password.
"""
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_KC = settings.keycloak_url
_REALM = settings.keycloak_realm


# ── Master-realm admin token ──────────────────────────────────────────────────

async def _admin_token(client: httpx.AsyncClient) -> str:
    r = await client.post(
        f"{_KC}/realms/master/protocol/openid-connect/token",
        data={
            "client_id": "admin-cli",
            "grant_type": "password",
            "username": settings.keycloak_admin_user,
            "password": settings.keycloak_admin_password,
        },
    )
    r.raise_for_status()
    return r.json()["access_token"]


# ── User lookup ───────────────────────────────────────────────────────────────

async def find_kc_user(identifier: str, by: str = "username") -> dict | None:
    """
    Look up a Keycloak user by 'username', 'email', or 'id'.
    Returns the Keycloak user representation or None.
    """
    async with httpx.AsyncClient(timeout=10) as client:
        admin = await _admin_token(client)
        headers = {"Authorization": f"Bearer {admin}"}

        if by == "id":
            r = await client.get(
                f"{_KC}/admin/realms/{_REALM}/users/{identifier}",
                headers=headers,
            )
            return r.json() if r.status_code == 200 else None

        r = await client.get(
            f"{_KC}/admin/realms/{_REALM}/users",
            params={by: identifier, "exact": "true"},
            headers=headers,
        )
        users = r.json() if r.status_code == 200 else []
        return users[0] if users else None


# ── Token Exchange (impersonation) ────────────────────────────────────────────

async def _service_account_token(client: httpx.AsyncClient) -> str:
    """Get an access token for the otp-bridge service account (client_credentials)."""
    r = await client.post(
        f"{_KC}/realms/{_REALM}/protocol/openid-connect/token",
        data={
            "grant_type": "client_credentials",
            "client_id": settings.otp_bridge_client_id,
            "client_secret": settings.otp_bridge_client_secret,
        },
    )
    if r.status_code != 200:
        raise RuntimeError(f"otp-bridge service account auth failed: {r.text}")
    return r.json()["access_token"]


async def get_oidc_token_for_user(kc_user_id: str) -> dict:
    """
    Exchange the otp-bridge service account token for a user token.
    Returns the OIDC token response dict (has access_token; may lack refresh_token).
    Raises RuntimeError on failure.
    """
    async with httpx.AsyncClient(timeout=15) as client:
        sa_token = await _service_account_token(client)
        r = await client.post(
            f"{_KC}/realms/{_REALM}/protocol/openid-connect/token",
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
                "client_id": settings.otp_bridge_client_id,
                "client_secret": settings.otp_bridge_client_secret,
                "subject_token": sa_token,
                "subject_token_type": "urn:ietf:params:oauth:token-type:access_token",
                "requested_subject": kc_user_id,
                "requested_token_type": "urn:ietf:params:oauth:token-type:access_token",
            },
        )
        if r.status_code != 200:
            logger.error("Token exchange failed for %s: %s", kc_user_id, r.text)
            raise RuntimeError("Identity provider token exchange failed")
        return r.json()


# ── User creation (for phone registration) ───────────────────────────────────

async def create_keycloak_user(
    *,
    username: str,
    password: str,
    phone: str,
    name: str = "",
    email: str | None = None,
) -> str:
    """
    Create a new Keycloak user with phone attribute.
    Returns the new user's Keycloak UUID.
    Raises ValueError on conflict (duplicate username/email).
    """
    first, *rest = name.split(" ", 1)
    payload: dict = {
        "username": username,
        "enabled": True,
        "emailVerified": bool(email),
        "firstName": first,
        "lastName": rest[0] if rest else "",
        "credentials": [{"type": "password", "value": password, "temporary": False}],
        "attributes": {"phone": [phone]},
        "requiredActions": [],
    }
    if email:
        payload["email"] = email

    async with httpx.AsyncClient(timeout=10) as client:
        admin = await _admin_token(client)
        r = await client.post(
            f"{_KC}/admin/realms/{_REALM}/users",
            json=payload,
            headers={"Authorization": f"Bearer {admin}"},
        )
        if r.status_code == 409:
            raise ValueError("Username or email already taken")
        r.raise_for_status()
        # Keycloak returns Location: .../users/<uuid>
        return r.headers["location"].rstrip("/").split("/")[-1]
