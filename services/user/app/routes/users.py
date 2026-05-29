from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from asyncpg import Pool
import httpx

from app.database import get_pool
from app.auth import get_current_claims, require_role
from app.config import settings
from app.models import (
    UserResponse,
    UserUpdateRequest,
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
    # Check local DB first — single source of truth
    async with pool.acquire() as conn:
        db_user = await conn.fetchrow(
            "SELECT id, is_active, identity_provider FROM users WHERE email = $1",
            body.email.strip().lower(),
        )

    if not db_user:
        raise HTTPException(
            status_code=404,
            detail="No account found with this email address. Please check and try again.",
        )

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

    async with httpx.AsyncClient(timeout=10) as client:
        token_resp = await client.post(
            f"{settings.keycloak_url}/realms/master/protocol/openid-connect/token",
            data={
                "client_id": "admin-cli",
                "grant_type": "password",
                "username": settings.keycloak_admin_user,
                "password": settings.keycloak_admin_password,
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Auth service unavailable")
        admin_token = token_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {admin_token}"}
        realm = settings.keycloak_realm

        search_resp = await client.get(
            f"{settings.keycloak_url}/admin/realms/{realm}/users",
            params={"email": body.email.strip().lower(), "exact": "true"},
            headers=headers,
        )
        kc_users = search_resp.json() if search_resp.status_code == 200 else []
        if not kc_users:
            raise HTTPException(
                status_code=404,
                detail="No account found with this email address. Please check and try again.",
            )

        user_id = kc_users[0]["id"]
        reset_resp = await client.put(
            f"{settings.keycloak_url}/admin/realms/{realm}/users/{user_id}/execute-actions-email",
            params={"client_id": "society-frontend", "redirect_uri": f"{settings.keycloak_public_url}/"},
            headers=headers,
            json=["UPDATE_PASSWORD"],
        )
        if reset_resp.status_code not in (200, 204):
            raise HTTPException(status_code=502, detail="Could not send reset email. Please try again later.")


# ── helpers ──────────────────────────────────────────────────────────────────

_USER_COLS = """
    u.id, u.apartment_id, u.name, u.email, u.phone, u.role,
    u.keycloak_sub, u.identity_provider, u.is_active, u.created_at,
    a.id   AS apt_id,
    a.block, a.unit_number, a.type AS apt_type
"""

_USER_JOIN = "LEFT JOIN apartment a ON a.id = u.apartment_id"


def _row_to_user(row) -> UserResponse:
    from app.models import ApartmentBrief
    apt = None
    if row["apt_id"]:
        apt = ApartmentBrief(
            id=row["apt_id"],
            block=row["block"],
            unit_number=row["unit_number"],
            type=row["apt_type"],
        )
    return UserResponse(
        id=row["id"],
        apartment_id=row["apartment_id"],
        apartment=apt,
        name=row["name"],
        email=row["email"],
        phone=row["phone"],
        role=row["role"],
        keycloak_sub=row["keycloak_sub"],
        identity_provider=row["identity_provider"],
        is_active=row["is_active"],
        created_at=row["created_at"],
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

    async with pool.acquire() as conn:
        upsert = await conn.fetchrow(
            """
            INSERT INTO users (name, email, keycloak_sub, role, is_active, identity_provider)
            VALUES ($1, $2, $3, 'resident', FALSE, 'keycloak')
            ON CONFLICT (keycloak_sub) DO UPDATE
                SET name  = EXCLUDED.name,
                    email = EXCLUDED.email
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
            f"SELECT {_USER_COLS} FROM users u {_USER_JOIN} WHERE u.id = $1",
            user_id,
        )
    if row is None:
        raise HTTPException(status_code=500, detail="User not found after sync")
    return _row_to_user(row)


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
            f"SELECT {_USER_COLS} FROM users u {_USER_JOIN} WHERE u.keycloak_sub = $1",
            sub,
        )
    if not row:
        raise HTTPException(status_code=404, detail="User not found — call /users/sync first")
    return _row_to_user(row)


@router.put("/me", response_model=UserResponse, summary="Update own profile")
async def update_me(
    body: UserUpdateRequest,
    claims: dict = Depends(get_current_claims),
    pool: Pool = Depends(get_pool),
):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_parts = [f"{col} = ${i + 2}" for i, col in enumerate(updates)]
    values = list(updates.values())

    async with pool.acquire() as conn:
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
        row = await conn.fetchrow(
            f"SELECT {_USER_COLS} FROM users u {_USER_JOIN} WHERE u.id = $1",
            row["id"],
        )
    return _row_to_user(row)


@router.put("/me/apartment", response_model=UserResponse, summary="Assign apartment to self")
async def assign_my_apartment(
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

        row = await conn.fetchrow(
            "UPDATE users SET apartment_id = $1 WHERE keycloak_sub = $2 RETURNING id",
            body.apartment_id, claims["sub"],
        )
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        row = await conn.fetchrow(
            f"SELECT {_USER_COLS} FROM users u {_USER_JOIN} WHERE u.id = $1",
            row["id"],
        )
    return _row_to_user(row)


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
    conditions = ["1=1"]
    params: list = []

    if role is not None:
        params.append(role)
        conditions.append(f"u.role = ${len(params)}")
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
            SELECT {_USER_COLS} FROM users u {_USER_JOIN}
            WHERE {where}
            ORDER BY u.created_at DESC
            LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}
            """,
            *params, limit, offset,
        )
    return UserListResponse(total=total, items=[_row_to_user(r) for r in rows])


# ── admin stats (must be before /{user_id} to avoid UUID match on "admin-stats") ──

@router.get(
    "/admin-stats",
    response_model=AdminStatsResponse,
    summary="Per-admin action statistics (admin / committee_member)",
    dependencies=[Depends(require_role("admin", "committee_member"))],
)
async def get_admin_stats(pool: Pool = Depends(get_pool)):
    async with pool.acquire() as conn:
        total_pending = await conn.fetchval("SELECT COUNT(*) FROM users WHERE is_active = FALSE")
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
            f"SELECT {_USER_COLS} FROM users u {_USER_JOIN} WHERE u.id = $1",
            user_id,
        )
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    # Residents can only see their own profile
    if not is_privileged and str(row["keycloak_sub"]) != claims.get("sub"):
        raise HTTPException(status_code=403, detail="Access denied")

    return _row_to_user(row)


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
            "SELECT name, email FROM users WHERE id = $1", user_id
        )
        if not user_info:
            raise HTTPException(status_code=404, detail="User not found")
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
            f"SELECT {_USER_COLS} FROM users u {_USER_JOIN} WHERE u.id = $1",
            row["id"],
        )
    return _row_to_user(row)


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
            f"SELECT {_USER_COLS} FROM users u {_USER_JOIN} WHERE u.id = $1",
            row["id"],
        )
    return _row_to_user(row)


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
            f"SELECT {_USER_COLS} FROM users u {_USER_JOIN} WHERE u.id = $1",
            updated["id"],
        )
    return _row_to_user(full)


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
            f"SELECT {_USER_COLS} FROM users u {_USER_JOIN} WHERE u.id = $1", user_id,
        )

    if row["keycloak_sub"]:
        try:
            await _keycloak_remove_all_realm_roles(row["keycloak_sub"])
        except Exception:
            pass

    return _row_to_user(full)


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
