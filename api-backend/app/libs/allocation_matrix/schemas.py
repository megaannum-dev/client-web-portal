"""Allocation matrix schemas — split from app/schemas/pc.py (007-A).

Period and allocation view Pydantic schemas for the allocation_matrix module.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.models.pc import PeriodStatus


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


class PeriodLiteOut(BaseModel):
    """Period entry as the allocation payload carries it (id as str)."""

    id: str
    label: str
    status: PeriodStatus
    confirmed_at: datetime | None = None
    confirmed_by: str | None = None


class PeriodStatusUpdate(BaseModel):
    status: PeriodStatus


# ---------------------------------------------------------------------------
# Allocation view schemas
# ---------------------------------------------------------------------------


class AllocationCellOut(BaseModel):
    """One (client, model) cell in the derived matrix."""

    units: float
    fund: float  # precomputed units × model_size (BE-5)


class AllocationClientOut(BaseModel):
    """One client row in the derived matrix — frontend AllocationClientDTO shape."""

    id: str
    name: str
    code: str
    ib_account: str | None


class AllocationModelOut(BaseModel):
    """One model column with column-level aggregates."""

    id: str
    name: str
    model_size: float | None
    live: bool
    col_units: float
    col_fund: float


class AllocationViewOut(BaseModel):
    """Full allocation matrix response — matches frontend AllocationDTO."""

    models: list[AllocationModelOut]
    clients: list[AllocationClientOut]
    cells: dict[str, AllocationCellOut]  # keyed "${clientId}-${modelId}"
    total_fund: float
    count: int
    periods: list[PeriodLiteOut]
    open_period_id: str | None = None
    is_open: bool
    etag: str
    period_id: str | None = None  # set for confirmed views

    @classmethod
    def from_dict(
        cls,
        d: dict,
        *,
        etag: str,
        periods: list[PeriodLiteOut],
        open_period_id: str | None,
    ) -> "AllocationViewOut":
        models_out = [AllocationModelOut(**m) for m in d["models"]]
        clients_out = [AllocationClientOut(**c) for c in d["clients"]]
        cells_out = {
            key: AllocationCellOut(units=cell["units"], fund=cell["fund"])
            for key, cell in d["cells"].items()
        }
        return cls(
            models=models_out,
            clients=clients_out,
            cells=cells_out,
            total_fund=d["total_fund"],
            count=d["count"],
            periods=periods,
            open_period_id=open_period_id,
            is_open=d["is_open"],
            etag=etag,
            period_id=d.get("period_id"),
        )
