# api-backend/app/libs/reports/schemas.py
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class EomReportCommentDTO(BaseModel):
    report_name: str
    comment: str
    updated_by: str
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class EomCommentUpsertReq(BaseModel):
    comment: str
