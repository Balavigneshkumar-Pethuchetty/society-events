from uuid import UUID
from typing import Optional
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException, Query
from asyncpg import Pool
import httpx

from app.database import get_pool
from app.auth import get_current_claims, require_role
from app.config import settings
from app.models import (
    UserResponse,
    UserUpdateRequest,
    UserUnitRequest,
    ApartmentAssignRequest,
    RoleUpdateRequest,
    ApartmentResponse,
    UserListResponse,
    ForgotPasswordRequest,
    AdminStatsResponse,
    AdminBreakdown,
    AdminActionResponse,
)

router = APIRouter()


# ── public: forgot password ───────────────────────────────────────────────────

@router.post("/forgot-password", status_code=204, summary="Send password reset email")
async def forgot_password(body: ForgotPasswordRequest, pool: Pool = Depends(get_pool)):
    email = body.email.strip().lower()

    # Check local DB for is_active / identity_provider guards
    async with pool.acquire() as conn:
        db_user = await conn.fetchrow(
            "SELECT id, is_active, identity_provider FROM users WHERE email = $1",
            email,
        )

    # If found in local DB, apply guards; otherwise fall through to Keycloak lookup
    if db_user is not None:
        if not db_user["is_active"]:
            raise HTTPException(
                status_code=403,
                detail="Your account is pending approval or has been deactivated. "
                       "Please contact the administrator.",
            )
        if db_user["identity_provider"] != "keycloak":
            raise HTTPException(
                status_code=400,
                detail="This account uses a social login (Google/GitHub). "
                       "Password reset is not available — sign in via your provider.",
            )

    # Build X-Forwarded-* headers so Keycloak uses the public URL in email links.
    # KC_PROXY_HEADERS=xforwarded means Keycloak trusts these from any caller.
    _parsed = urlparse(settings.keycloak_public_url)
    _scheme = _parsed.scheme
    _port = _parsed.port or (443 if _scheme == "https" else 80)
    _fwd_host = f"{_parsed.hostname}:{_port}" if _port not in (80, 443) else _parsed.hostname
    _proxy_headers = {
        "X-Forwarded-Host":  _fwd_host,
        "X-Forwarded-Proto": _scheme,
        "X-Forwarded-Port":  str(_port),
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            token_resp = await client.post(
                f"{settings.keycloak_url}/realms/master/protocol/openid-connect/token",
                data={
                    "client_id": "admin-cli",
                    "grant_type": "password",
                    "username": settings.keycloak_admin_user,
                    "password": settings.keycloak_admin_password,
                },
                headers=_proxy_headers,
            )
            if token_resp.status_code != 200:
                raise HTTPException(status_code=502, detail="Auth service unavailable")
            admin_token = token_resp.json()["access_token"]
            headers = {"Authorization": f"Bearer {admin_token}", **_proxy_headers}
            realm = settings.keycloak_realm

            search_resp = await client.get(
                f"{settings.keycloak_url}/admin/realms/{realm}/users",
                params={"email": email, "exact": "true"},
                headers=headers,
            )
            kc_users = search_resp.json() if search_resp.status_code == 200 else []
            if not kc_users:
                raise HTTPException(
                    status_code=404,
                    detail="No account found with this email address. Please check and try again.",
                )

            kc_user = kc_users[0]
            if not kc_user.get("enabled", True):
                raise HTTPException(
                    status_code=403,
                    detail="Your account is pending approval or has been deactivated. "
                           "Please contact the administrator.",
                )

            reset_resp = await client.put(
                f"{settings.keycloak_url}/admin/realms/{realm}/users/{kc_user['id']}/execute-actions-email",
                params={"client_id": "society-frontend", "redirect_uri": f"{settings.app_public_url}/"},
                headers=headers,
                json=["UPDATE_PASSWORD"],
            )
            if reset_resp.status_code not in (200, 204):
                raise HTTPException(status_code=502, detail="Could not send reset email. Please try again later.")
    except HTTPException:
        raise
    except (httpx.ConnectError, httpx.TimeoutException):
        raise HTTPException(status_code=503, detail="Authentication service is temporarily unavailable. Please try again in a moment.")


# ── helpers ──────────────────────────────────────────────────────────────────

_USER_COLS = """
    u.id, u.username, u.name, u.email, u.phone, u.role,
    u.keycloak_sub, u.identity_provider, u.is_active, u.created_at,
    u.structure_node_id
"""

_USER_JOIN = ""  # no apartment join — apartments fetched separately via user_apartments


async def _fetch_user_apartments(conn, user_id) -> list:
    from app.models import ApartmentBrief
    rows = await conn.fetch(
        """
        SELECT a.id, a.block, a.unit_number, a.type
        FROM user_apartments ua
        JOIN apartment a ON a.id = ua.apartment_id
        WHERE ua.user_id = $1
        ORDER BY ua.added_at
        """,
        user_id,
    )
    return [
        ApartmentBrief(id=r["id"], block=r["block"], unit_number=r["unit_number"], type=r["type"])
        for r in rows
    ]


async def _fetch_user_units(conn, user_id) -> list:
    rows = await conn.fetch(
        "SELECT node_id FROM user_units WHERE user_id = $1 ORDER BY added_at",
        user_id,
    )
    return [r["node_id"] for r in rows]


def _row_to_user(row, apartments: list, unit_node_ids: list = []) -> UserResponse:
    return UserResponse(
        id=row["id"],
        apartments=apartments,
        username=row["username"],
        name=row["name"],
        email=row["email"],
        phone=row["phone"],
        role=row["role"],
        keycloak_sub=row["keycloak_sub"],
        identity_provider=row["identity_provider"],
        is_active=row["is_active"],
        created_at=row["created_at"],
        structure_node_id=row["structure_node_id"],
        unit_node_ids=unit_node_ids,
    )


# ── sync (upsert on first login) ─────────────────────────────────────────────

@router.post("/sync", response_model=UserResponse, summary="Upsert user from Keycloak JWT")
async def sync_user(
    claims: dict = Depends(get_current_claims),
    pool: Pool = Depends(get_pool),
):
    """
    Called by the frontend immediately after a successful Keycloak login.
    Creates the local users row if it doesn't exist, or refreshes name/email.
    """
    sub = claims.get("sub")
    email = claims.get("email", "")
    first = claims.get("given_name", "")
    last = claims.get("family_name", "")
    name = f"{first} {last}".strip() or claims.get("preferred_username", email)

    if not sub:
        raise HTTPException(status_code=400, detail="Token missing 'sub' claim")

    email = email or None  # normalise empty string to NULL

    async with pool.acquire() as conn:
        # Check if this phone-registered user already exists (keycloak_sub match)
        # If so, just refresh name/email without touching phone or username.
        upsert = await conn.fetchrow(
            """
            INSERT INTO users (name, email, keycloak_sub, role, is_active, identity_provider)
            VALUES ($1, $2, $3, 'resident', FALSE, 'keycloak')
            ON CONFLICT (keycloak_sub) DO UPDATE
                SET name  = EXCLUDED.name,
                    email = COALESCE(EXCLUDED.email, users.email)
            RETURNING id, (xmax = 0) AS is_new
            """,
            name, email, sub,
        )
        if upsert is None:
            raise HTTPException(status_code=500, detail="Sync upsert returned no row")

        user_id = upsert["id"]

        # Notify all active admins only on brand-new registration
        if upsert["is_new"]:
            admin_ids = await conn.fetch(
                "SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE"
            )
            for admin in admin_ids:
                await conn.execute(
                    """
                    INSERT INTO notification (user_id, type, title, message)
                    VALUES ($1, 'new_registration', $2, $3)
                    """,
                    admin["id"],
                    "New User Registration",
                    f"{name} ({email}) has registered and is awaiting approval.",
                )

        row = await conn.fetchrow(
            f"SELECT {_USER_COLS} FROM users u WHERE u.id = $1",
            user_id,
        )
        if row is None:
            raise HTTPException(status_code=500, detail="User not found after sync")
        apartments = await _fetch_user_apartments(conn, user_id)
        units = await _fetch_user_units(conn, user_id)
    return _row_to_user(row, apartments, units)


# ── /me endpoints ─────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserResponse, summary="Get own profile")
async def get_me(
    claims: dict = Depends(get_current_claims),
    pool: Pool = Depends(get_pool),
):
    sub = claims.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Token missing 'sub' claim — add 'basic' scope to Keycloak client")
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"SELECT {_USER_COLS} FROM users u WHERE u.keycloak_sub = $1",
            sub,
        )
        if not row:
            raise HTTPException(status_code=404, detail="User not found — call /users/sync first")
        apartments = await _fetch_user_apartments(conn, row["id"])
        units = await _fetch_user_units(conn, row["id"])
    return _row_to_user(row, apartments, units)


@router.put("/me", response_model=UserResponse, summary="Update own profile")
async def update_me(
    body: UserUpdateRequest,
    claims: dict = Depends(get_current_claims),
    pool: Pool = Depends(get_pool),
):
    updates: dict = {}
    if body.name is not None:
        updates["name"] = body.name
    if "phone" in body.model_fields_set:
        # "" (or explicit null) clears the phone number entirely — frees it up for another
        # resident to register with — distinct from the field being omitted from the request
        # altogether, which leaves whatever's on file untouched. Stored as SQL NULL rather
        # than "" so the UNIQUE constraint doesn't collide the next time someone clears theirs.
        updates["phone"] = body.phone.strip() if body.phone and body.phone.strip() else None

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_parts = [f"{col} = ${i + 2}" for i, col in enumerate(updates)]
    values = list(updates.values())

    async with pool.acquire() as conn:
        if updates.get("phone"):
            taken = await conn.fetchval(
                "SELECT 1 FROM users WHERE phone = $1 AND keycloak_sub != $2",
                updates["phone"], claims["sub"],
            )
            if taken:
                raise HTTPException(status_code=409, detail="Phone number already registered to another user")

        row = await conn.fetchrow(
            f"""
            UPDATE users SET {', '.join(set_parts)}
            WHERE keycloak_sub = $1
            RETURNING id
            """,
            claims["sub"], *values,
        )
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        user_id = row["id"]
        row = await conn.fetchrow(
            f"SELECT {_USER_COLS} FROM users u WHERE u.id = $1",
            user_id,
        )
        apartments = await _fetch_user_apartments(conn, user_id)
        units = await _fetch_user_units(conn, user_id)
    return _row_to_user(row, apartments, units)


@router.post("/me/apartments", response_model=UserResponse, summary="Add an apartment to own profile")
async def add_my_apartment(
    body: ApartmentAssignRequest,
    claims: dict = Depends(get_current_claims),
    pool: Pool = Depends(get_pool),
):
    async with pool.acquire() as conn:
        apt = await conn.fetchrow(
            "SELECT id FROM apartment WHERE id = $1", body.apartment_id
        )
        if not apt:
            raise HTTPException(status_code=404, detail="Apartment not found")

        user = await conn.fetchrow(
            "SELECT id FROM users WHERE keycloak_sub = $1", claims["sub"]
        )
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        user_id = user["id"]

        await conn.execute(
            """
            INSERT INTO user_apartments (user_id, apartment_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            """,
            user_id, body.apartment_id,
        )

        row = await conn.fetchrow(f"SELECT {_USER_COLS} FROM users u WHERE u.id = $1", user_id)
        apartments = await _fetch_user_apartments(conn, user_id)
        units = await _fetch_user_units(conn, user_id)
    return _row_to_user(row, apartments, units)


@router.delete(
    "/me/apartments/{apartment_id}",
    response_model=UserResponse,
    summary="Remove an apartment from own profile",
)
async def remove_my_apartment(
    apartment_id: UUID,
    claims: dict = Depends(get_current_claims),
    pool: Pool = Depends(get_pool),
):
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT id FROM users WHERE keycloak_sub = $1", claims["sub"]
        )
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        user_id = user["id"]

        deleted = await conn.execute(
            "DELETE FROM user_apartments WHERE user_id = $1 AND apartment_id = $2",
            user_id, apartment_id,
        )
        if deleted == "DELETE 0":
            raise HTTPException(status_code=404, detail="Apartment not linked to this user")

        row = await conn.fetchrow(f"SELECT {_USER_COLS} FROM users u WHERE u.id = $1", user_id)
        apartments = await _fetch_user_apartments(conn, user_id)
        units = await _fetch_user_units(conn, user_id)
    return _row_to_user(row, apartments, units)


# ── self-service unit management ─────────────────────────────────────────────
# Privileged callers (admin / committee_member) mutate user_units directly.
# Non-privileged callers get a pending request created instead, keeping the
# many-to-many user_units model intact with proper approval gating.
# Role is resolved from JWT first; local DB role is used as fallback so that
# admins with stale / sparse JWTs are never mis-classified as residents.

def _is_privileged(claims: dict, db_role: Optional[str]) -> bool:
    realm_roles: list[str] = claims.get("realm_access", {}).get("roles", [])
    return any(r in realm_roles for r in ("admin", "committee_member")) or \
           db_role in ("admin", "committee_member")


@router.post("/me/units", response_model=UserResponse, summary="Add a flat/unit to own profile")
async def add_my_unit(
    body: UserUnitRequest,
    claims: dict = Depends(get_current_claims),
    pool: Pool = Depends(get_pool),
):
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT id, role FROM users WHERE keycloak_sub = $1", claims["sub"]
        )
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        node = await conn.fetchrow(
            "SELECT id FROM structure_nodes WHERE id = $1", body.node_id
        )
        if not node:
            raise HTTPException(status_code=404, detail="Structure node not found")
        user_id = user["id"]

        if _is_privileged(claims, user["role"]):
            await conn.execute(
                "INSERT INTO user_units (user_id, node_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                user_id, body.node_id,
            )
        else:
            # Non-privileged: submit a pending add request (idempotent)
            existing = await conn.fetchrow(
                "SELECT id FROM unit_assignment_requests "
                "WHERE user_id = $1 AND node_id = $2 AND type = 'add' AND status = 'pending'",
                user_id, body.node_id,
            )
            if not existing:
                await conn.execute(
                    "INSERT INTO unit_assignment_requests (user_id, node_id, type) VALUES ($1, $2, 'add')",
                    user_id, body.node_id,
                )

        row = await conn.fetchrow(f"SELECT {_USER_COLS} FROM users u WHERE u.id = $1", user_id)
        apts = await _fetch_user_apartments(conn, user_id)
        units = await _fetch_user_units(conn, user_id)
    return _row_to_user(row, apts, units)


@router.delete(
    "/me/units/{node_id}",
    response_model=UserResponse,
    summary="Remove a flat/unit from own profile",
)
async def remove_my_unit(
    node_id: UUID,
    claims: dict = Depends(get_current_claims),
    pool: Pool = Depends(get_pool),
):
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT id, role FROM users WHERE keycloak_sub = $1", claims["sub"]
        )
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        user_id = user["id"]

        if _is_privileged(claims, user["role"]):
            deleted = await conn.execute(
                "DELETE FROM user_units WHERE user_id = $1 AND node_id = $2",
                user_id, node_id,
            )
            if deleted == "DELETE 0":
                raise HTTPException(status_code=404, detail="Unit not linked to this user")
        else:
            # Non-privileged: submit a pending remove request (idempotent)
            existing = await conn.fetchrow(
                "SELECT id FROM unit_assignment_requests "
                "WHERE user_id = $1 AND node_id = $2 AND type = 'remove' AND status = 'pending'",
                user_id, node_id,
            )
            if not existing:
                await conn.execute(
                    "INSERT INTO unit_assignment_requests (user_id, node_id, type) VALUES ($1, $2, 'remove')",
                    user_id, node_id,
                )

        row = await conn.fetchrow(f"SELECT {_USER_COLS} FROM users u WHERE u.id = $1", user_id)
        apartments = await _fetch_user_apartments(conn, user_id)
        units = await _fetch_user_units(conn, user_id)
    return _row_to_user(row, apartments, units)


# ── admin / committee endpoints ───────────────────────────────────────────────

@router.get(
    "",
    response_model=UserListResponse,
    summary="List all users",
    dependencies=[Depends(require_role("admin", "committee_member"))],
)
async def list_users(
    role: Optional[str] = Query(None, description="Filter by role"),
    active: Optional[bool] = Query(None, description="Filter by is_active"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    pool: Pool = Depends(get_pool),
):
    # Guest placeholder rows (complimentary-ticket recipients with no real account,
    # role='guest', is_active=FALSE) exist only to satisfy FKs on registration/ticket —
    # they must never surface as pending user approvals. Hide them unless a caller
    # explicitly asks for role=guest.
    conditions = ["1=1"]
    params: list = []

    if role is not None:
        params.append(role)
        conditions.append(f"u.role = ${len(params)}")
    else:
        conditions.append("u.role != 'guest'")
    if active is not None:
        params.append(active)
        conditions.append(f"u.is_active = ${len(params)}")

    where = " AND ".join(conditions)

    async with pool.acquire() as conn:
        total = await conn.fetchval(
            f"SELECT COUNT(*) FROM users u WHERE {where}", *params
        )
        rows = await conn.fetch(
            f"""
            SELECT {_USER_COLS} FROM users u
            WHERE {where}
            ORDER BY u.created_at DESC
            LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}
            """,
            *params, limit, offset,
        )
        user_ids = [r["id"] for r in rows]
        apt_rows = await conn.fetch(
            """
            SELECT ua.user_id, a.id, a.block, a.unit_number, a.type
            FROM user_apartments ua
            JOIN apartment a ON a.id = ua.apartment_id
            WHERE ua.user_id = ANY($1::uuid[])
            ORDER BY ua.added_at
            """,
            user_ids,
        ) if user_ids else []
        unit_rows = await conn.fetch(
            "SELECT user_id, node_id FROM user_units WHERE user_id = ANY($1::uuid[]) ORDER BY added_at",
            user_ids,
        ) if user_ids else []

    from collections import defaultdict
    from app.models import ApartmentBrief
    apts_by_user: dict = defaultdict(list)
    for r in apt_rows:
        apts_by_user[r["user_id"]].append(
            ApartmentBrief(id=r["id"], block=r["block"], unit_number=r["unit_number"], type=r["type"])
        )
    units_by_user: dict = defaultdict(list)
    for r in unit_rows:
        units_by_user[r["user_id"]].append(r["node_id"])
    return UserListResponse(
        total=total,
        items=[_row_to_user(r, apts_by_user[r["id"]], units_by_user[r["id"]]) for r in rows],
    )


# ── admin stats (must be before /{user_id} to avoid UUID match on "admin-stats") ──

@router.get(
    "/admin-stats",
    response_model=AdminStatsResponse,
    summary="Per-admin action statistics (admin / committee_member)",
    dependencies=[Depends(require_role("admin", "committee_member"))],
)
async def get_admin_stats(pool: Pool = Depends(get_pool)):
    async with pool.acquire() as conn:
        total_pending = await conn.fetchval(
            "SELECT COUNT(*) FROM users WHERE is_active = FALSE AND role != 'guest'"
        )
        counts = {r["action"]: r["cnt"] for r in await conn.fetch(
            "SELECT action, COUNT(*) AS cnt FROM admin_actions GROUP BY action"
        )}
        breakdown = await conn.fetch(
            """
            SELECT admin_id, admin_name,
                   COUNT(*) FILTER (WHERE action = 'approved') AS approved,
                   COUNT(*) FILTER (WHERE action = 'rejected') AS rejected,
                   COUNT(*) FILTER (WHERE action = 'removed')  AS removed,
                   COUNT(*) FILTER (WHERE action = 'revoked')  AS revoked
            FROM admin_actions
            GROUP BY admin_id, admin_name
            ORDER BY COUNT(*) DESC
            """
        )
        recent = await conn.fetch(
            """
            SELECT id, admin_name, target_user_name, target_user_email, action, role, performed_at
            FROM admin_actions ORDER BY performed_at DESC LIMIT 20
            """
        )
    return AdminStatsResponse(
        total_pending=total_pending,
        total_approved=counts.get("approved", 0),
        total_rejected=counts.get("rejected", 0),
        total_removed=counts.get("removed", 0),
        total_revoked=counts.get("revoked", 0),
        by_admin=[AdminBreakdown(
            admin_id=r["admin_id"], admin_name=r["admin_name"],
            approved=r["approved"], rejected=r["rejected"],
            removed=r["removed"],  revoked=r["revoked"],
        ) for r in breakdown],
        recent_actions=[AdminActionResponse(
            id=r["id"], admin_name=r["admin_name"],
            target_user_name=r["target_user_name"], target_user_email=r["target_user_email"],
            action=r["action"], role=r["role"], performed_at=r["performed_at"],
        ) for r in recent],
    )


@router.get(
    "/{user_id}",
    response_model=UserResponse,
    summary="Get user by ID",
)
async def get_user(
    user_id: UUID,
    claims: dict = Depends(get_current_claims),
    pool: Pool = Depends(get_pool),
):
    realm_roles = claims.get("realm_access", {}).get("roles", [])
    is_privileged = any(r in realm_roles for r in ("admin", "committee_member"))

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"SELECT {_USER_COLS} FROM users u WHERE u.id = $1",
            user_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        # Residents can only see their own profile
        if not is_privileged and str(row["keycloak_sub"]) != claims.get("sub"):
            raise HTTPException(status_code=403, detail="Access denied")
        apartments = await _fetch_user_apartments(conn, user_id)
    return _row_to_user(row, apartments)


@router.patch(
    "/{user_id}/role",
    response_model=UserResponse,
    summary="Update user role (admin only)",
    dependencies=[Depends(require_role("admin"))],
)
async def update_role(
    user_id: UUID,
    body: RoleUpdateRequest,
    claims: dict = Depends(get_current_claims),
    pool: Pool = Depends(get_pool),
):
    async with pool.acquire() as conn:
        user_info = await conn.fetchrow(
            "SELECT name, email, keycloak_sub, role FROM users WHERE id = $1", user_id
        )
        if not user_info:
            raise HTTPException(status_code=404, detail="User not found")
        old_role = user_info["role"]
        row = await conn.fetchrow(
            "UPDATE users SET role = $1 WHERE id = $2 RETURNING id",
            body.role, user_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        await _record_action(
            conn, claims, user_id,
            user_info["name"], user_info["email"],
            "role_changed", body.role,
        )
        row = await conn.fetchrow(
            f"SELECT {_USER_COLS} FROM users u WHERE u.id = $1",
            row["id"],
        )
        apartments = await _fetch_user_apartments(conn, user_id)

    # Sync role change to Keycloak so the user's next JWT reflects the new role
    if user_info["keycloak_sub"]:
        await _keycloak_update_role(user_info["keycloak_sub"], old_role, body.role)

    return _row_to_user(row, apartments)


@router.patch(
    "/{user_id}/active",
    response_model=UserResponse,
    summary="Activate or deactivate a user (admin only)",
    dependencies=[Depends(require_role("admin"))],
)
async def set_active(
    user_id: UUID,
    is_active: bool = Query(...),
    pool: Pool = Depends(get_pool),
):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE users SET is_active = $1 WHERE id = $2 RETURNING id",
            is_active, user_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        row = await conn.fetchrow(
            f"SELECT {_USER_COLS} FROM users u WHERE u.id = $1",
            row["id"],
        )
        apartments = await _fetch_user_apartments(conn, user_id)
    return _row_to_user(row, apartments)


# ── Keycloak admin helper ─────────────────────────────────────────────────────

async def _keycloak_assign_role(keycloak_sub: str, role_name: str) -> None:
    """Assign a realm role to a Keycloak user via the Admin REST API."""
    base = f"{settings.keycloak_url}/realms/master/protocol/openid-connect/token"

    async with httpx.AsyncClient(timeout=10) as client:
        # 1. Obtain admin token from the master realm
        resp = await client.post(base, data={
            "client_id": "admin-cli",
            "grant_type": "password",
            "username": settings.keycloak_admin_user,
            "password": settings.keycloak_admin_password,
        })
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Keycloak admin token failed: {resp.text}")
        admin_token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {admin_token}"}
        realm = settings.keycloak_realm

        # 2. Look up the realm role by name
        role_resp = await client.get(
            f"{settings.keycloak_url}/admin/realms/{realm}/roles/{role_name}",
            headers=headers,
        )
        if role_resp.status_code == 404:
            raise HTTPException(status_code=400, detail=f"Keycloak role '{role_name}' not found")
        role_resp.raise_for_status()
        role_rep = role_resp.json()

        # 3. Assign the role to the user (keycloak_sub == Keycloak user UUID)
        assign_resp = await client.post(
            f"{settings.keycloak_url}/admin/realms/{realm}/users/{keycloak_sub}/role-mappings/realm",
            headers=headers,
            json=[{"id": role_rep["id"], "name": role_rep["name"]}],
        )
        if assign_resp.status_code not in (200, 204):
            raise HTTPException(status_code=502, detail=f"Keycloak role assign failed: {assign_resp.text}")


_APP_ROLES = {"admin", "committee_member", "resident", "security_guard", "sponsor", "pending"}


async def _keycloak_update_role(keycloak_sub: str, old_role: str | None, new_role: str) -> None:
    """Remove the old app role and assign the new one in Keycloak."""
    base = f"{settings.keycloak_url}/realms/master/protocol/openid-connect/token"

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(base, data={
            "client_id": "admin-cli",
            "grant_type": "password",
            "username": settings.keycloak_admin_user,
            "password": settings.keycloak_admin_password,
        })
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Keycloak admin token failed: {resp.text}")
        admin_token = resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {admin_token}"}
        realm = settings.keycloak_realm
        mappings_url = f"{settings.keycloak_url}/admin/realms/{realm}/users/{keycloak_sub}/role-mappings/realm"

        # Remove the old role if it's one of our app roles
        if old_role and old_role in _APP_ROLES and old_role != new_role:
            old_resp = await client.get(
                f"{settings.keycloak_url}/admin/realms/{realm}/roles/{old_role}",
                headers=headers,
            )
            if old_resp.status_code == 200:
                old_rep = old_resp.json()
                await client.request(
                    "DELETE", mappings_url, headers=headers,
                    json=[{"id": old_rep["id"], "name": old_rep["name"]}],
                )

        # Assign the new role
        new_resp = await client.get(
            f"{settings.keycloak_url}/admin/realms/{realm}/roles/{new_role}",
            headers=headers,
        )
        if new_resp.status_code == 404:
            raise HTTPException(status_code=400, detail=f"Keycloak role '{new_role}' not found")
        new_resp.raise_for_status()
        new_rep = new_resp.json()
        assign = await client.post(
            mappings_url, headers=headers,
            json=[{"id": new_rep["id"], "name": new_rep["name"]}],
        )
        if assign.status_code not in (200, 204):
            raise HTTPException(status_code=502, detail=f"Keycloak role assign failed: {assign.text}")


# ── additional Keycloak helpers ──────────────────────────────────────────────

async def _keycloak_delete_user(keycloak_sub: str) -> None:
    """Delete a user from Keycloak entirely."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"{settings.keycloak_url}/realms/master/protocol/openid-connect/token",
            data={"client_id": "admin-cli", "grant_type": "password",
                  "username": settings.keycloak_admin_user, "password": settings.keycloak_admin_password},
        )
        if resp.status_code != 200:
            return
        headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
        await client.delete(
            f"{settings.keycloak_url}/admin/realms/{settings.keycloak_realm}/users/{keycloak_sub}",
            headers=headers,
        )


async def _keycloak_remove_all_realm_roles(keycloak_sub: str) -> None:
    """Strip all managed realm roles from a Keycloak user (revoke)."""
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"{settings.keycloak_url}/realms/master/protocol/openid-connect/token",
            data={"client_id": "admin-cli", "grant_type": "password",
                  "username": settings.keycloak_admin_user, "password": settings.keycloak_admin_password},
        )
        if resp.status_code != 200:
            return
        headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
        realm = settings.keycloak_realm
        roles_resp = await client.get(
            f"{settings.keycloak_url}/admin/realms/{realm}/users/{keycloak_sub}/role-mappings/realm",
            headers=headers,
        )
        if roles_resp.status_code != 200:
            return
        managed = [r for r in roles_resp.json()
                   if not r["name"].startswith("default-")
                   and r["name"] not in ("offline_access", "uma_authorization")]
        if managed:
            await client.delete(
                f"{settings.keycloak_url}/admin/realms/{realm}/users/{keycloak_sub}/role-mappings/realm",
                headers=headers, json=managed,
            )


async def _record_action(
    conn,
    claims: dict,
    target_user_id,
    target_name: str,
    target_email: str,
    action: str,
    role: Optional[str] = None,
) -> None:
    """Insert a row into admin_actions for persistent audit tracking."""
    sub = claims.get("sub")
    admin = await conn.fetchrow("SELECT id, name FROM users WHERE keycloak_sub = $1", sub)
    admin_id   = admin["id"]   if admin else None
    admin_name = admin["name"] if admin else claims.get("preferred_username", "Unknown Admin")
    await conn.execute(
        """
        INSERT INTO admin_actions
            (admin_id, admin_name, target_user_id, target_user_name, target_user_email, action, role)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        """,
        admin_id, admin_name, target_user_id, target_name, target_email, action, role,
    )


# ── approval endpoints ────────────────────────────────────────────────────────

@router.post(
    "/{user_id}/approve",
    response_model=UserResponse,
    summary="Approve a pending user (admin only)",
    dependencies=[Depends(require_role("admin"))],
)
async def approve_user(
    user_id: UUID,
    body: RoleUpdateRequest,
    claims: dict = Depends(get_current_claims),
    pool: Pool = Depends(get_pool),
):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, name, email, keycloak_sub FROM users WHERE id = $1",
            user_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        if not row["keycloak_sub"]:
            raise HTTPException(status_code=400, detail="User has no Keycloak sub — cannot assign role")

        await _keycloak_assign_role(row["keycloak_sub"], body.role)

        updated = await conn.fetchrow(
            "UPDATE users SET role = $1, is_active = TRUE WHERE id = $2 RETURNING id",
            body.role, user_id,
        )
        if not updated:
            raise HTTPException(status_code=500, detail="Update failed")

        await _record_action(conn, claims, user_id, row["name"], row["email"], "approved", body.role)

        full = await conn.fetchrow(
            f"SELECT {_USER_COLS} FROM users u WHERE u.id = $1",
            updated["id"],
        )
        apartments = await _fetch_user_apartments(conn, updated["id"])
    return _row_to_user(full, apartments)


@router.delete(
    "/{user_id}/reject",
    status_code=204,
    summary="Reject and remove a pending user (admin only)",
    dependencies=[Depends(require_role("admin"))],
)
async def reject_user(
    user_id: UUID,
    claims: dict = Depends(get_current_claims),
    pool: Pool = Depends(get_pool),
):
    async with pool.acquire() as conn:
        user_row = await conn.fetchrow(
            "SELECT id, name, email FROM users WHERE id = $1 AND is_active = FALSE",
            user_id,
        )
        if not user_row:
            raise HTTPException(status_code=404, detail="Pending user not found")
        await conn.execute("DELETE FROM users WHERE id = $1", user_id)
        await _record_action(conn, claims, None, user_row["name"], user_row["email"], "rejected")


@router.delete(
    "/{user_id}",
    status_code=204,
    summary="Permanently remove an active user (admin only)",
    dependencies=[Depends(require_role("admin"))],
)
async def remove_user(
    user_id: UUID,
    claims: dict = Depends(get_current_claims),
    pool: Pool = Depends(get_pool),
):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, name, email, keycloak_sub FROM users WHERE id = $1",
            user_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        await conn.execute("DELETE FROM users WHERE id = $1", user_id)
        await _record_action(conn, claims, None, row["name"], row["email"], "removed")

    if row["keycloak_sub"]:
        try:
            await _keycloak_delete_user(row["keycloak_sub"])
        except Exception:
            pass


@router.patch(
    "/{user_id}/revoke",
    response_model=UserResponse,
    summary="Revoke access for an active user (admin only)",
    dependencies=[Depends(require_role("admin"))],
)
async def revoke_user(
    user_id: UUID,
    claims: dict = Depends(get_current_claims),
    pool: Pool = Depends(get_pool),
):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"SELECT {_USER_COLS} FROM users u {_USER_JOIN} WHERE u.id = $1",
            user_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        await conn.execute("UPDATE users SET is_active = FALSE WHERE id = $1", user_id)
        await _record_action(conn, claims, user_id, row["name"], row["email"], "revoked")
        full = await conn.fetchrow(
            f"SELECT {_USER_COLS} FROM users u WHERE u.id = $1", user_id,
        )
        apartments = await _fetch_user_apartments(conn, user_id)

    if row["keycloak_sub"]:
        try:
            await _keycloak_remove_all_realm_roles(row["keycloak_sub"])
        except Exception:
            pass

    return _row_to_user(full, apartments)


# ── apartments ────────────────────────────────────────────────────────────────

@router.get(
    "/apartments/list",
    response_model=list[ApartmentResponse],
    summary="List all apartments in the society",
)
async def list_apartments(
    _: dict = Depends(get_current_claims),
    pool: Pool = Depends(get_pool),
):
    from app.config import settings
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, society_id, block, unit_number, type FROM apartment "
            "WHERE society_id = $1 ORDER BY block, unit_number",
            UUID(settings.society_id),
        )
    return [ApartmentResponse(**dict(r)) for r in rows]
