"""Trade model schemas — split from app/schemas/pc.py (007-A).

Model/material/change Pydantic schemas for the trade_models module.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.pc import ModelChangeKind, ModelStatus


# ---------------------------------------------------------------------------
# Model schemas
# ---------------------------------------------------------------------------


class ModelCreate(BaseModel):
    name: str
    manager: str | None = None
    model_size: float | None = None
    intro: str | None = None
    symbols: Any = None
    description: str | None = None
    underlyings: str | None = None
    risk: str | None = None
    liquidity: str | None = None
    reporting: str | None = None
    nav_perf: str | None = None
    mgmt_fee: float | None = None
    incentive_fee: float | None = None


class ModelUpdate(BaseModel):
    name: str | None = None
    manager: str | None = None
    model_size: float | None = None
    intro: str | None = None
    symbols: Any = None
    description: str | None = None
    underlyings: str | None = None
    risk: str | None = None
    liquidity: str | None = None
    reporting: str | None = None
    nav_perf: str | None = None
    mgmt_fee: float | None = None
    incentive_fee: float | None = None
    status: str | None = None   # "live" | "deleted" — triggers state machine


class ModelOut(BaseModel):
    id: uuid.UUID
    name: str
    manager: str | None
    model_size: float | None
    intro: str | None
    symbols: Any
    status: ModelStatus
    version: str | None
    created_at: datetime
    updated_at: datetime
    description: str | None = None
    underlyings: str | None = None
    risk: str | None = None
    liquidity: str | None = None
    reporting: str | None = None
    nav_perf: str | None = None
    mgmt_fee: float | None = None
    incentive_fee: float | None = None

    model_config = {"from_attributes": True}


class ModelsListOut(BaseModel):
    """Wrapper for GET /api/pc/models — matches frontend ModelsListDTO."""

    models: list[ModelOut]


class ModelStatusUpdate(BaseModel):
    status: ModelStatus


# ---------------------------------------------------------------------------
# Material schemas
# ---------------------------------------------------------------------------


class MaterialOut(BaseModel):
    id: uuid.UUID
    model_id: uuid.UUID
    filename: str
    version: str
    size_bytes: int | None
    content_type: str | None
    uploaded_by: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Change schemas (structured — no rendered message string)
# ---------------------------------------------------------------------------


class ChangeOut(BaseModel):
    id: uuid.UUID
    model_id: uuid.UUID
    kind: ModelChangeKind
    detail: Any  # raw before/after dict or None; frontend renders display text
    actor: str | None
    version: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Model detail schema (model + materials + changes)
# ---------------------------------------------------------------------------


class ModelDetailOut(ModelOut):
    materials: list[MaterialOut] | None = None
    changes: list[ChangeOut] | None = None
