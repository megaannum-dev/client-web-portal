"""Post-trade allocation repository — BE-1 scaffold.

PostTradeAllocationRepository: pure DB access, no aggregation/split/portfolio
math, no HTTPException (same discipline as allocation_matrix's
AllocationRepository). Method bodies land in BE-2 (reads/writes) and are
called from the service in BE-3/BE-6.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.pc import AllocationModelSnapshot, AllocationPeriod, Model
from app.models.post_trade_allocation import (
    ClientPortfolio,
    PostTradeAllocation,
    PostTradeAllocationRun,
)
from app.models.reconciliation import Order


class PostTradeAllocationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # --- Step 1: pick up new orders --------------------------------------
    def unallocated_orders(self) -> list[Order]:
        raise NotImplementedError

    # --- Step 3: split basis ----------------------------------------------
    def latest_confirmed_period(self) -> AllocationPeriod | None:
        raise NotImplementedError

    def snapshots_for_period(self, period_id: uuid.UUID) -> list[AllocationModelSnapshot]:
        raise NotImplementedError

    def model_by_name(self, name: str) -> Model | None:
        raise NotImplementedError

    # --- Step 4: persist ----------------------------------------------------
    def create_run(
        self,
        *,
        trade_date: str,
        period_id: uuid.UUID | None,
        status: str,
        trigger: str,
        grand_total: Decimal | None,
        run_by: str | None,
    ) -> PostTradeAllocationRun:
        raise NotImplementedError

    def write_cells(self, rows: list[dict]) -> None:
        raise NotImplementedError

    def mark_orders_allocated(self, order_ids: list[uuid.UUID], run_id: uuid.UUID) -> None:
        raise NotImplementedError

    # --- Step 5: portfolios --------------------------------------------------
    def get_or_create_portfolio(self, user_id: uuid.UUID) -> ClientPortfolio:
        raise NotImplementedError

    def upsert_portfolio_deltas(self, deltas: dict[uuid.UUID, Decimal], run_id: uuid.UUID) -> None:
        raise NotImplementedError

    # --- GET path ------------------------------------------------------------
    def runs_for_trade_date(self, trade_date: str) -> list[PostTradeAllocationRun]:
        raise NotImplementedError

    def list_run_dates(self, include_empty: bool = False) -> list[PostTradeAllocationRun]:
        raise NotImplementedError

    def cells_for_runs(self, run_ids: list[uuid.UUID]) -> list[PostTradeAllocation]:
        raise NotImplementedError
