"""
Internal endpoints — only reachable by other containers on society_net.
Protected by X-Internal-Key header; never proxied through nginx.
"""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException

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
