# app/libs/access/schemas.py
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, field_validator

from app.libs.access.pages import PAGE_IDS
from app.models.users import AdminRole


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
