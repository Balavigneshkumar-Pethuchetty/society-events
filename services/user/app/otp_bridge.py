"""
Keycloak RFC 8693 token exchange for phone-OTP login.

The otp-bridge service account authenticates with client_credentials, then
exchanges its own token for a real access token scoped to the target user
(grant_type=urn:ietf:params:oauth:grant-type:token-exchange with
requested_subject=<kc_sub>). Neither step touches the user's password.
Requires --features=token-exchange on the Keycloak server and the
otp-bridge service account to hold the `impersonation` realm-management
role — both already provisioned on ~/auth-service's Keycloak.

The exchange returns no refresh_token and the token's azp is otp-bridge, not
society-frontend, so it can't be handed to keycloak-js's own refresh cycle.
Callers re-invoke this (via a session token, see routes/users.py's
phone-login endpoints) to mint a fresh short-lived access token instead of
relying on OAuth refresh.
"""
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


async def _service_account_token(client: httpx.AsyncClient) -> str:
    r = await client.post(
        f"{settings.keycloak_url}/realms/{settings.keycloak_realm}/protocol/openid-connect/token",
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
    Returns the OIDC token response dict (has access_token, expires_in).
    Raises RuntimeError on failure.
    """
    async with httpx.AsyncClient(timeout=15) as client:
        sa_token = await _service_account_token(client)
        r = await client.post(
            f"{settings.keycloak_url}/realms/{settings.keycloak_realm}/protocol/openid-connect/token",
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
