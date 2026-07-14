"""Post-trade allocation repository — BE-1 scaffold.

PostTradeAllocationRepository: pure DB access, no aggregation/split/portfolio
math, no HTTPException (same discipline as allocation_matrix's
AllocationRepository). Method bodies land in BE-2 (reads/writes) and are
called from the service in BE-3/BE-6.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.pc import AllocationModelSnapshot, AllocationPeriod, Model, PeriodStatus
from app.models.post_trade_allocation import (
    ClientPortfolio,
    PostTradeAllocation,
    PostTradeAllocationRun,
    RunStatus,
)
from app.models.reconciliation import Order


class PostTradeAllocationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # --- Step 1: pick up new orders --------------------------------------
    def unallocated_orders(self) -> list[Order]:
        return self.db.query(Order).filter(Order.allocated_run_id.is_(None)).all()

    # --- Step 3: split basis ----------------------------------------------
    def latest_confirmed_period(self) -> AllocationPeriod | None:
        return (
            self.db.query(AllocationPeriod)
            .filter(AllocationPeriod.status == PeriodStatus.CONFIRMED)
            .order_by(AllocationPeriod.confirmed_at.desc())
            .first()
        )

    def snapshots_for_period(self, period_id: uuid.UUID) -> list[AllocationModelSnapshot]:
        return (
            self.db.query(AllocationModelSnapshot)
            .filter(AllocationModelSnapshot.period_id == period_id)
            .all()
        )

    def model_by_name(self, name: str) -> Model | None:
        return self.db.query(Model).filter(func.lower(Model.name) == func.lower(name)).one_or_none()

    # --- Step 4: persist ----------------------------------------------------
    def create_run(
        self,
        *,
        trade_date: str,
        period_id: uuid.UUID,
        status: str,
        trigger: str,
        grand_total: Decimal | None,
        run_by: str | None,
    ) -> PostTradeAllocationRun:
        run = PostTradeAllocationRun(
            id=uuid.uuid4(),
            trade_date=trade_date,
            period_id=period_id,
            status=status,
            trigger=trigger,
            grand_total=grand_total,
            run_by=run_by,
        )
        self.db.add(run)
        self.db.flush()
        return run

    def write_cells(self, rows: list[dict]) -> None:
        """Bulk-insert one PostTradeAllocation row per dict. Each row must
        already include `run_id` (BE-3's cell_rows carry it per-cell)."""
        cells = [PostTradeAllocation(**row) for row in rows]
        self.db.add_all(cells)
        self.db.flush()

    def mark_orders_allocated(self, order_ids: list[uuid.UUID], run_id: uuid.UUID) -> None:
        if not order_ids:
            return
        self.db.query(Order).filter(Order.id.in_(order_ids)).update(
            {"allocated_run_id": run_id}, synchronize_session=False
        )
        self.db.flush()

    # --- Step 5: portfolios --------------------------------------------------
    def get_or_create_portfolio(self, user_id: uuid.UUID) -> ClientPortfolio:
        portfolio = self.db.get(ClientPortfolio, user_id)
        if portfolio is None:
            portfolio = ClientPortfolio(
                user_id=user_id,
                cash_deposit=Decimal("0"),
                amount_in_trade=Decimal("0"),
                previous_amount_in_trade=Decimal("0"),
            )
            self.db.add(portfolio)
            self.db.flush()
        return portfolio

    def upsert_portfolio_deltas(self, deltas: dict[uuid.UUID, Decimal], run_id: uuid.UUID) -> None:
        for user_id, delta in deltas.items():
            portfolio = self.get_or_create_portfolio(user_id)
            portfolio.previous_amount_in_trade = portfolio.amount_in_trade
            portfolio.amount_in_trade = portfolio.amount_in_trade + delta
            portfolio.last_run_id = run_id
        self.db.flush()

    # --- GET path ------------------------------------------------------------
    def runs_for_trade_date(self, trade_date: str) -> list[PostTradeAllocationRun]:
        return (
            self.db.query(PostTradeAllocationRun)
            .filter(PostTradeAllocationRun.trade_date == trade_date)
            .all()
        )

    def list_run_dates(self, include_empty: bool = False) -> list[PostTradeAllocationRun]:
        query = self.db.query(PostTradeAllocationRun)
        if not include_empty:
            query = query.filter(PostTradeAllocationRun.status != RunStatus.EMPTY.value)
        return query.all()

    def cells_for_runs(self, run_ids: list[uuid.UUID]) -> list[PostTradeAllocation]:
        if not run_ids:
            return []
        return (
            self.db.query(PostTradeAllocation).filter(PostTradeAllocation.run_id.in_(run_ids)).all()
        )
