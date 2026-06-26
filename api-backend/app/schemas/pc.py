"""BE-8 — Pydantic schemas for the PC workspace feature.

Naming contract: `units` (frontend) ↔ `multiplier` (DB/service).  The
schema boundary is the only place this remap happens.

No fee schema (fees are hardcoded on the frontend at 2%/20%).
No cell-write schema (the allocation matrix is read-only).
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.pc import ModelChangeKind, ModelStatus, PeriodStatus


# ---------------------------------------------------------------------------
# Model schemas
# ---------------------------------------------------------------------------


class ModelCreate(BaseModel):
    name: str
    manager: str | None = None
    model_size: float | None = None
    intro: str | None = None
    symbols: Any = None


class ModelUpdate(BaseModel):
    name: str | None = None
    manager: str | None = None
    model_size: float | None = None
    intro: str | None = None
    symbols: Any = None


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

    model_config = {"from_attributes": True}


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
# Allocation period schemas
# ---------------------------------------------------------------------------


class PeriodCreate(BaseModel):
    label: str


class PeriodOut(BaseModel):
    id: uuid.UUID
    label: str
    status: PeriodStatus
    confirmed_at: datetime | None
    confirmed_by: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Allocation view schemas
# ---------------------------------------------------------------------------


class AllocationCellOut(BaseModel):
    """One (client, model) cell in the derived matrix."""

    # `units` is the public name; internally called `multiplier`.
    units: float
    model_size: float
    cell_fund: float
    pct_share: float  # % share within the model column


class AllocationClientOut(BaseModel):
    """One client row in the derived matrix."""

    user_id: str
    ib_account: str | None
    row_total: float
    # model_id → cell
    cells: dict[str, AllocationCellOut]


class AllocationModelOut(BaseModel):
    """One model column header with column-level aggregates."""

    id: str
    name: str
    model_size: float | None
    col_units: float
    col_fund: float


class AllocationTotalsOut(BaseModel):
    total_fund: float
    count: int  # number of non-empty cells


class AllocationViewOut(BaseModel):
    """Full allocation matrix response."""

    models: list[AllocationModelOut]
    clients: list[AllocationClientOut]
    totals: AllocationTotalsOut
    is_open: bool
    etag: str
    period_id: str | None = None  # set for confirmed views

    @classmethod
    def from_dict(cls, d: dict, etag: str) -> "AllocationViewOut":
        models_out = [AllocationModelOut(**m) for m in d["models"]]
        clients_out = []
        for c in d["clients"]:
            cells = {
                mid: AllocationCellOut(
                    units=cell["multiplier"],
                    model_size=cell["model_size"],
                    cell_fund=cell["cell_fund"],
                    pct_share=cell["pct_share"],
                )
                for mid, cell in c["cells"].items()
            }
            clients_out.append(
                AllocationClientOut(
                    user_id=c["user_id"],
                    ib_account=c["ib_account"],
                    row_total=c["row_total"],
                    cells=cells,
                )
            )
        return cls(
            models=models_out,
            clients=clients_out,
            totals=AllocationTotalsOut(
                total_fund=d["total_fund"],
                count=d["count"],
            ),
            is_open=d["is_open"],
            etag=etag,
            period_id=d.get("period_id"),
        )
