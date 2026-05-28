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
)

router = APIRouter()

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
        user_id = await conn.fetchval(
            """
            INSERT INTO users (name, email, keycloak_sub, role, is_active, identity_provider)
            VALUES ($1, $2, $3, 'resident', FALSE, 'keycloak')
            ON CONFLICT (keycloak_sub) DO UPDATE
                SET name  = EXCLUDED.name,
                    email = EXCLUDED.email
            RETURNING id
            """,
            name, email, sub,
        )
        if user_id is None:
            raise HTTPException(status_code=500, detail="Sync upsert returned no row")
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
    pool: Pool = Depends(get_pool),
):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE users SET role = $1 WHERE id = $2 RETURNING id",
            body.role, user_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
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
    pool: Pool = Depends(get_pool),
):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, keycloak_sub FROM users WHERE id = $1",
            user_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        if not row["keycloak_sub"]:
            raise HTTPException(status_code=400, detail="User has no Keycloak sub — cannot assign role")

        # Assign role in Keycloak so next token contains the role
        await _keycloak_assign_role(row["keycloak_sub"], body.role)

        # Activate user in DB and set chosen role
        updated = await conn.fetchrow(
            "UPDATE users SET role = $1, is_active = TRUE WHERE id = $2 RETURNING id",
            body.role, user_id,
        )
        if not updated:
            raise HTTPException(status_code=500, detail="Update failed")
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
    pool: Pool = Depends(get_pool),
):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "DELETE FROM users WHERE id = $1 AND is_active = FALSE RETURNING id",
            user_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="Pending user not found")


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
