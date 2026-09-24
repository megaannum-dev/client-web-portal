# api-backend/app/libs/ic_notes/schemas.py
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class IcNoteDTO(BaseModel):
    id: uuid.UUID
    title: str
    meeting_at: datetime
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
