"""Trade model schemas — split from app/schemas/pc.py (007-A).

Model/material/change Pydantic schemas for the trade_models module.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.models.pm import ModelChangeKind, ModelStatus

_FEE_DESC = "Decimal fraction, not percent: 0.020000 means 2%. Must satisfy 0 <= fee < 1."


# ---------------------------------------------------------------------------
# Model schemas
# ---------------------------------------------------------------------------


class SymbolIn(BaseModel):
    symbol: str
    weight: float | None = None


def _coerce_symbols(v):
    # Accept ["QQQ", ...] or [{"symbol": "QQQ", "weight": 0.5}, ...].
    if v is None:
        return v
    return [{"symbol": s} if isinstance(s, str) else s for s in v]


_BOOK_CODES = ("dt", "pt", "inb")


def _validate_required_books(v):
    """One to three unique book codes. None means the caller omitted the field."""
    if v is None:
        return v
    if not isinstance(v, list) or len(v) < 1 or len(v) > 3:
        raise ValueError("Select one to three books.")
    if len(set(v)) != len(v):
        raise ValueError("Duplicate book codes are not allowed.")
    if any(code not in _BOOK_CODES for code in v):
        raise ValueError("Unknown book code.")
    return [code for code in _BOOK_CODES if code in v]


class SymbolOut(BaseModel):
    symbol: str
    weight: float | None = None
    active: bool = True

    model_config = {"from_attributes": True}


class SymbolAuditOut(BaseModel):
    symbol: str
    op: str
    note: str | None
    actor: str | None
    version: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class SymbolAddIn(BaseModel):
    symbol: str


class SymbolPatchIn(BaseModel):
    active: bool


class ModelCreate(BaseModel):
    name: str
    category: list[str] | None = None
    subscription_redemption: str | None = None
    model_size: float | None = None
    description: str | None = None
    underlyings: str | None = None
    risk: str | None = None
    liquidity: str | None = None
    reporting: str | None = None
    nav_perf: str | None = None
    mgmt_fee: float | None = Field(default=None, ge=0, lt=1, description=_FEE_DESC)
    incentive_fee: float | None = Field(default=None, ge=0, lt=1, description=_FEE_DESC)
    symbols: list[SymbolIn] | None = None
    required_books: list[Literal["dt", "pt", "inb"]]
    # Optional, matching the nullable column and ModelUpdate: making it required
    # was an unversioned break -- a draft model is created before its master IB
    # account is known, and existing clients never sent the field.
    master_ib_account: str | None = None

    _coerce_symbols = field_validator("symbols", mode="before")(_coerce_symbols)
    _books = field_validator("required_books", mode="before")(_validate_required_books)


class ModelUpdate(BaseModel):
    name: str | None = None
    category: list[str] | None = None
    subscription_redemption: str | None = None
    model_size: float | None = None
    description: str | None = None
    underlyings: str | None = None
    risk: str | None = None
    liquidity: str | None = None
    reporting: str | None = None
    nav_perf: str | None = None
    mgmt_fee: float | None = Field(default=None, ge=0, lt=1, description=_FEE_DESC)
    incentive_fee: float | None = Field(default=None, ge=0, lt=1, description=_FEE_DESC)
    status: str | None = None  # "live" | "deleted" — triggers state machine
    symbols: list[SymbolIn] | None = None
    required_books: list[Literal["dt", "pt", "inb"]] | None = None
    master_ib_account: str | None = None

    _coerce_symbols = field_validator("symbols", mode="before")(_coerce_symbols)
    _books = field_validator("required_books", mode="before")(_validate_required_books)


class ModelOut(BaseModel):
    id: uuid.UUID
    name: str
    category: list[str] = []
    subscription_redemption: str | None
    model_size: float | None
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
    mgmt_fee: float | None = Field(default=None, ge=0, lt=1, description=_FEE_DESC)
    incentive_fee: float | None = Field(default=None, ge=0, lt=1, description=_FEE_DESC)
    symbols: list[SymbolOut] = []
    master_ib_account: str | None = None
    required_books: list[Literal["dt", "pt", "inb"]]

    model_config = {"from_attributes": True}

    def _coerce_categories(v):
        return v or []

    _coerce_categories = field_validator("category", mode="before")(_coerce_categories)


class ModelsListOut(BaseModel):
    """Wrapper for GET /api/pm/models — matches frontend ModelsListDTO."""

    models: list[ModelOut]


class ModelStatusUpdate(BaseModel):
    status: ModelStatus


class IbAccountOption(BaseModel):
    master: str
    free_count: int


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
    symbol_audit: list[SymbolAuditOut] | None = None
