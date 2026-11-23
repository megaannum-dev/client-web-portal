"""Allocation matrix schemas — split from app/schemas/pc.py (007-A).

Period and allocation view Pydantic schemas for the allocation_matrix module.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.models.pm import PeriodStatus

BookCode = Literal["dt", "pt", "inb"]

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


class AllocationBookAccountOut(BaseModel):
    """One client IB account for a book the column requires.

    Cells list these in order dt, pt, inb, one entry per required book.
    `account` is null when that book has no row yet. IB is Interactive
    Brokers. Book codes are dt, pt, and inb (Investment Book).
    """

    book: BookCode
    account: str | None


class AllocationCellOut(BaseModel):
    """One (client, model) cell in the derived matrix.

    `units` and `fund` stay one pooled number. `accounts` is the current
    client_ib_accounts assignment for the model's books, not the single
    string stored on allocation_model_snapshots.ib_account.
    """

    units: float
    fund: float  # precomputed units × model_size (BE-5)
    accounts: list[AllocationBookAccountOut]


class AllocationClientOut(BaseModel):
    """One client row in the derived matrix — frontend AllocationClientDTO shape."""

    id: str
    name: str


class AllocationModelOut(BaseModel):
    """One model column with column-level aggregates."""

    id: str
    name: str
    model_size: float | None
    live: bool
    col_units: float
    col_fund: float
    master_ib: str | None  # models.master_ib_account, on open and confirmed views
    required_books: list[BookCode]  # models.required_books, ordered dt, pt, inb


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
            key: AllocationCellOut(
                units=cell["units"],
                fund=cell["fund"],
                accounts=cell.get("accounts") or [],
            )
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
