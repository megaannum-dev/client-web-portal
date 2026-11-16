# app/libs/access/schemas.py
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Final, Literal

from pydantic import BaseModel, Field, field_validator

from app.libs.access.pages import PAGE_IDS
from app.models.users import AdminRole

# An unexpired override counts as "expiring soon" once its expires_at falls
# within this window. Mirrored by EXPIRING_SOON_DAYS in
# admin-frontend/lib/admin/catalog.ts (the ledger's stat-card label).
EXPIRING_SOON_WINDOW: Final[timedelta] = timedelta(days=30)


class AccessLevel(str, Enum):
    NONE = "NONE"
    VIEW = "VIEW"
    EDIT = "EDIT"


class MatrixPageOut(BaseModel):
    page_id: str
    group: str
    label: str
    path: str


class MatrixRoleOut(BaseModel):
    code: AdminRole
    name: str
    user_count: int


class MatrixCellOut(BaseModel):
    page_id: str
    role: AdminRole
    level: Literal["VIEW", "EDIT"]  # NONE cells are omitted, never sent


class PublishedMetaOut(BaseModel):
    at: datetime
    by: str


class MatrixOut(BaseModel):
    pages: list[MatrixPageOut]  # server-authored order == PAGE_META order
    roles: list[MatrixRoleOut]
    levels: list[MatrixCellOut]
    published: PublishedMetaOut | None


class MatrixChangeIn(BaseModel):
    page_id: str
    role: AdminRole
    level: AccessLevel  # NONE deletes the row

    @field_validator("page_id")
    @classmethod
    def _known_page(cls, v: str) -> str:
        if v not in PAGE_IDS:
            raise ValueError(f"unknown page_id: {v}")
        return v


class MatrixPublishIn(BaseModel):
    changes: list[MatrixChangeIn]
    note: str | None = None
    base_published_at: datetime | None  # None === "no publication exists yet"


class OverrideOut(BaseModel):
    id: uuid.UUID
    firebase_uid: str
    user_name: str | None
    user_role: AdminRole
    page_id: str
    page_label: str
    page_path: str
    role_default: AccessLevel  # resolved server-side AT READ TIME, never snapshotted
    level: AccessLevel  # may be NONE -- a real value on this table (D-3)
    reason: str
    granted_by: str  # granter's display name
    expires_at: datetime | None
    is_expired: bool  # server-computed: expires_at <= now -- no longer applies (D24)
    expiring_soon: bool  # server-computed: now < expires_at <= now + EXPIRING_SOON_WINDOW


class AuditOut(BaseModel):
    id: uuid.UUID
    at: datetime
    actor_name: str  # denormalised -- reads correctly after the actor is deleted
    event: str
    detail: str


def future_expiry(v: datetime | None) -> datetime | None:
    """D24: an override's expiry must be in the future (None = no expiry).
    A naive datetime is read as UTC, matching how the resolver compares it."""
    if v is None:
        return None
    aware = v if v.tzinfo is not None else v.replace(tzinfo=timezone.utc)
    if aware <= datetime.now(timezone.utc):
        raise ValueError("expiry date must be in the future")
    return aware


class OverrideIn(BaseModel):
    firebase_uid: str
    page_id: str  # validated against PAGE_IDS
    level: AccessLevel
    reason: str = Field(min_length=1)  # 422 when blank
    expires_at: datetime | None = None

    @field_validator("page_id")
    @classmethod
    def _known_page(cls, v: str) -> str:
        if v not in PAGE_IDS:
            raise ValueError(f"unknown page_id: {v}")
        return v

    @field_validator("expires_at")
    @classmethod
    def _future_expiry(cls, v: datetime | None) -> datetime | None:
        return future_expiry(v)
