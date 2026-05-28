from __future__ import annotations
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, EmailStr, field_validator


class ApartmentBrief(BaseModel):
    id: UUID
    block: str
    unit_number: str
    type: str


class UserResponse(BaseModel):
    id: UUID
    apartment_id: Optional[UUID] = None
    apartment: Optional[ApartmentBrief] = None
    name: str
    email: str
    phone: Optional[str] = None
    role: str
    keycloak_sub: Optional[str] = None
    identity_provider: str
    is_active: bool
    created_at: datetime


class UserUpdateRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None


class ApartmentAssignRequest(BaseModel):
    apartment_id: UUID


class RoleUpdateRequest(BaseModel):
    role: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        allowed = {"admin", "committee_member", "resident", "security_guard", "sponsor"}
        if v not in allowed:
            raise ValueError(f"role must be one of {sorted(allowed)}")
        return v


class ApartmentResponse(BaseModel):
    id: UUID
    society_id: UUID
    block: str
    unit_number: str
    type: str


class UserListResponse(BaseModel):
    total: int
    items: list[UserResponse]
