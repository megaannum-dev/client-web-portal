# api-backend/app/libs/sop/schemas.py
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.sop import SopCategory


class SopVersionDTO(BaseModel):
    id: uuid.UUID
    sop_id: uuid.UUID
    version_no: int
    change_note: str | None
    filename: str
    content_type: str
    size_bytes: int
    uploaded_by_uid: str
    uploaded_by_name: str
    uploaded_by_role: str
    uploaded_by_email: str | None
    uploaded_at: datetime
    # storage_key deliberately excluded -- never on the wire
    model_config = {"from_attributes": True}


class SopDocumentDTO(BaseModel):
    id: uuid.UUID
    title: str
    category: SopCategory
    created_by_uid: str
    created_by_name: str
    created_at: datetime
    updated_at: datetime
    latest: SopVersionDTO
    version_count: int
    starts_at: str | None
    ends_at: str | None
    # Monthly only: the concrete day-of-month in the requested month ("-1" = last day).
    effective_starts_day: int | None
    effective_ends_day: int | None


class SopUpdate(BaseModel):
    title: str | None = None
    category: SopCategory | None = None
    # Omitted = unchanged; explicit null = clear (see model_fields_set).
    starts_at: str | None = None
    ends_at: str | None = None
