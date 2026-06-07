"""
Internal endpoints — only reachable by other containers on society_net.
Protected by X-Internal-Key header; never proxied through nginx.
"""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.database import get_pool
from app.auth import require_internal_key
from app.models import UserResponse
from app.routes.users import _USER_COLS, _row_to_user, _fetch_user_apartments

router = APIRouter(dependencies=[Depends(require_internal_key)])


@router.get(
    "/by-sub/{keycloak_sub}",
    response_model=UserResponse,
    summary="Resolve keycloak_sub → user row",
)
async def get_by_sub(
    keycloak_sub: str,
    pool=Depends(get_pool),
):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"SELECT {_USER_COLS} FROM users u WHERE u.keycloak_sub = $1",
            keycloak_sub,
        )
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        apartments = await _fetch_user_apartments(conn, row["id"])
    return _row_to_user(row, apartments)


@router.get(
    "/by-phone/{phone}",
    response_model=UserResponse,
    summary="Look up user by E.164 phone number (used by OTP Bridge)",
)
async def get_by_phone(
    phone: str,
    pool=Depends(get_pool),
):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"SELECT {_USER_COLS} FROM users u WHERE u.phone = $1",
            phone,
        )
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        apartments = await _fetch_user_apartments(conn, row["id"])
    return _row_to_user(row, apartments)


class PhoneRegisterRequest(BaseModel):
    username: str
    name: str
    phone: str
    keycloak_sub: str
    identity_provider: str = "keycloak"
    email: str | None = None


@router.post(
    "/register-phone",
    response_model=UserResponse,
    status_code=201,
    summary="Create a phone-registered user (called by OTP Bridge after Keycloak user is created)",
)
async def register_phone_user(
    body: PhoneRegisterRequest,
    pool=Depends(get_pool),
):
    async with pool.acquire() as conn:
        # Uniqueness guards
        if await conn.fetchval("SELECT 1 FROM users WHERE username = $1", body.username):
            raise HTTPException(status_code=409, detail="Username already taken")
        if await conn.fetchval("SELECT 1 FROM users WHERE phone = $1", body.phone):
            raise HTTPException(status_code=409, detail="Phone number already registered")
        if body.email and await conn.fetchval("SELECT 1 FROM users WHERE email = $1", body.email):
            raise HTTPException(status_code=409, detail="Email already registered")

        row = await conn.fetchrow(
            """
            INSERT INTO users
                (username, name, email, phone, keycloak_sub, identity_provider, role, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, 'resident', FALSE)
            RETURNING id
            """,
            body.username, body.name, body.email, body.phone,
            body.keycloak_sub, body.identity_provider,
        )
        user_id = row["id"]

        # Notify all active admins
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
                "New Phone Registration",
                f"{body.name} (@{body.username}, {body.phone}) registered via mobile and is awaiting approval.",
            )

        full = await conn.fetchrow(
            f"SELECT {_USER_COLS} FROM users u WHERE u.id = $1",
            user_id,
        )
        apartments = await _fetch_user_apartments(conn, user_id)
    return _row_to_user(full, apartments)


@router.get(
    "/{user_id}",
    response_model=UserResponse,
    summary="Get user by internal UUID",
)
async def get_by_id(
    user_id: UUID,
    pool=Depends(get_pool),
):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            f"SELECT {_USER_COLS} FROM users u WHERE u.id = $1",
            user_id,
        )
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        apartments = await _fetch_user_apartments(conn, user_id)
    return _row_to_user(row, apartments)
