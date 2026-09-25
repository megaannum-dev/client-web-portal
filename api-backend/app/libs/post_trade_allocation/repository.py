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
    DailyClientPortfolio,
    PostTradeAllocation,
    PostTradeAllocationRun,
    RunStatus,
)
from app.models.reconciliation import Order


class PostTradeAllocationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db
        # ponytail: one repository instance = one service = one run() call.
        # Rows this run just flushed (but not committed) never get a real
        # created_at (server_default only fires on commit), so two
        # same-trade-date rows from this run can't be told apart by
        # re-querying the DB. Cache each user's latest running total here
        # instead of trusting DB ordering for writes this run itself made.
        self._latest_portfolio_cache: dict[uuid.UUID, Decimal] = {}

    # --- Step 1: pick up new orders --------------------------------------
    def orders_for_trade_date(self, trade_date: str) -> list[Order]:
        """Every order booked on one trading day.

        Replaces the old unallocated_orders(): there is no per-order marker
        and no ingested_at cutoff any more. Idempotency comes from the runs
        ledger instead -- a date that already has a non-failed run is simply
        never handed to run(), so re-reading its orders cannot double-count.
        """
        return self.db.query(Order).filter(Order.tradeDate == trade_date).all()

    def run_status_by_trade_date(self) -> dict[str, str]:
        """{trade_date: status} for every session row, for the gap scan.

        trade_date is unique (migration 0044), so one status per date.
        """
        return {
            r[0]: r[1]
            for r in self.db.query(
                PostTradeAllocationRun.trade_date, PostTradeAllocationRun.status
            ).all()
        }

    def earliest_run_date(self) -> str | None:
        """MIN(trade_date) -- the scan floor (D4). None on an empty ledger."""
        return self.db.query(func.min(PostTradeAllocationRun.trade_date)).scalar()

    def delete_run_for_date(self, trade_date: str) -> None:
        """Drop a failed date's session row so it can be rewritten.

        A failed row carries no cells and no portfolio rows (see
        _run_one_date), so this only removes the retry marker itself. The
        cascade on post_trade_allocations would handle cells anyway.
        """
        for run in self.runs_for_trade_date(trade_date):
            self.db.query(PostTradeAllocation).filter(
                PostTradeAllocation.run_id == run.id
            ).delete(synchronize_session=False)
            self.db.query(DailyClientPortfolio).filter(
                DailyClientPortfolio.run_id == run.id
            ).delete(synchronize_session=False)
            self.db.delete(run)
        self.db.flush()

    def rechain_balances(self, user_ids: set[uuid.UUID], from_date: str) -> None:
        """Recompute daily_client_portfolios running balances from `from_date`.

        Needed because a date can be filled BEHIND dates already written: a
        failed IB fetch leaves a gap that is retried once the statement
        arrives, by which time later days may already be allocated. The
        balance is a running total, so inserting into the middle without
        rechaining leaves every later row understated.

        Walks each affected user's rows in trade_date order and rewrites
        portfolio_amount as the running sum of that user's allocated cells.
        """
        if not user_ids:
            return
        for user_id in user_ids:
            rows = (
                self.db.query(DailyClientPortfolio)
                .filter(
                    DailyClientPortfolio.user_id == user_id,
                    DailyClientPortfolio.trade_date >= from_date,
                )
                .order_by(DailyClientPortfolio.trade_date)
                .all()
            )
            if not rows:
                continue
            # Balance carried into from_date: the newest row strictly before it.
            prior = (
                self.db.query(DailyClientPortfolio)
                .filter(
                    DailyClientPortfolio.user_id == user_id,
                    DailyClientPortfolio.trade_date < from_date,
                )
                .order_by(DailyClientPortfolio.trade_date.desc())
                .first()
            )
            running = prior.portfolio_amount if prior is not None else Decimal("0")
            for row in rows:
                delta = (
                    self.db.query(func.sum(PostTradeAllocation.allocated))
                    .filter(
                        PostTradeAllocation.run_id == row.run_id,
                        PostTradeAllocation.user_id == user_id,
                    )
                    .scalar()
                    or Decimal("0")
                )
                running = running + delta  # signed (D-3)
                row.portfolio_amount = running
            self._latest_portfolio_cache.pop(user_id, None)
        self.db.flush()

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

    # --- Step 5: portfolios --------------------------------------------------
    def reset_portfolio_cache(self) -> None:
        """Drop the running-total cache. Called at the top of every run() so a
        repository instance reused after a rollback (or for a second run)
        cannot carry forward amounts that were never committed."""
        self._latest_portfolio_cache.clear()

    def latest_portfolio_amount(self, user_id: uuid.UUID) -> Decimal:
        """Newest daily_client_portfolios balance for this user (0 if none
        exist yet). Checks this run's own in-memory cache first — see the
        comment on `_latest_portfolio_cache` in __init__ for why a fresh
        DB query can't disambiguate two rows this same run just wrote.

        "newest" is by trade_date, so this assumes runs arrive in trade-date
        order. Back-dated fills are now routine (a failed IB fetch is retried
        once the statement lands, behind days already allocated), so callers
        MUST follow such a write with rechain_balances() -- see _run_one_date.
        """
        if user_id in self._latest_portfolio_cache:
            return self._latest_portfolio_cache[user_id]
        row = (
            self.db.query(DailyClientPortfolio)
            .filter(DailyClientPortfolio.user_id == user_id)
            .order_by(
                DailyClientPortfolio.trade_date.desc(),
                DailyClientPortfolio.created_at.desc(),
            )
            .first()
        )
        return row.portfolio_amount if row is not None else Decimal("0")

    def upsert_portfolio_deltas(
        self, deltas: dict[uuid.UUID, Decimal], run_id: uuid.UUID, trade_date: str
    ) -> None:
        for user_id, delta in deltas.items():
            # run_id is a fresh uuid4 per create_run call (one per trade_date
            # since 0044), so (run_id, user_id) can never repeat within or
            # across calls — plain insert, no upsert-on-conflict needed.
            new_amount = self.latest_portfolio_amount(user_id) + delta  # signed (D-3)
            self.db.add(
                DailyClientPortfolio(
                    run_id=run_id,
                    user_id=user_id,
                    portfolio_amount=new_amount,
                    trade_date=trade_date,
                )
            )
            self._latest_portfolio_cache[user_id] = new_amount
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

    def runs_in_date_range(
        self, from_date: str, to_date: str, *, include_empty: bool = False
    ) -> list[PostTradeAllocationRun]:
        query = self.db.query(PostTradeAllocationRun).filter(
            PostTradeAllocationRun.trade_date >= from_date,
            PostTradeAllocationRun.trade_date <= to_date,
        )
        if not include_empty:
            query = query.filter(PostTradeAllocationRun.status != RunStatus.EMPTY.value)
        return query.all()

    def run_ids_for_model(self, model_id: uuid.UUID) -> list[uuid.UUID]:
        rows = (
            self.db.query(PostTradeAllocation.run_id)
            .filter(PostTradeAllocation.model_id == model_id)
            .distinct()
            .all()
        )
        return [r[0] for r in rows]
