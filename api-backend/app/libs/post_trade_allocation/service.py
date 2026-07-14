"""Post-trade allocation service — BE-1 scaffold.

PostTradeAllocationService owns all business logic: the 5-step run() (BE-3),
GET-path view assembly (BE-6). Method bodies land in those later units.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.orm import Session

from app.libs.post_trade_allocation.repository import PostTradeAllocationRepository
from app.models.pc import AllocationModelSnapshot, Model
from app.models.post_trade_allocation import PostTradeAllocationRun, RunStatus, RunTrigger
from app.models.reconciliation import Order
from app.schemas.post_trade_allocation import PostTradeAllocationView, PtaRunListOut

ZERO = Decimal("0")


class PostTradeAllocationService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = PostTradeAllocationRepository(db)

    def run(self, *, trigger: RunTrigger, actor: str | None) -> PostTradeAllocationRun:
        """Implements requirement steps 1-5, exactly, in ONE transaction.

        D-3 (safety-critical): the net traded amount per (tradeDate, model) is
        Σ orders.proceeds, SIGNED. Never abs(); never Σ|amount|. A losing day
        must produce a negative `traded`, which flows unmodified through the
        pro-rata split into every client's `allocated` and into
        client_portfolios.amount_in_trade (which can therefore DECREASE).

        Corrected during BE-2 implementation (2026-07-14):
        `post_trade_allocation_runs.period_id` is NOT NULL at the DB layer
        (DB-1/DB-5) — a run row, empty or not, cannot be written without a
        resolved period. The split-basis lookup therefore happens FIRST,
        before the empty-order short-circuit; if no confirmed period exists
        at all, `run()` raises instead of writing a run with a null
        period_id. This is a stricter reading of D-5/D-10, not a
        contradiction — § 2's own precondition already assumes a confirmed
        period exists in any real environment.
        """
        with self.db.begin_nested():
            # --- Step 0: resolve split basis (latest confirmed, D-5) — required ---
            period = self.repo.latest_confirmed_period()
            if period is None:
                raise RuntimeError(
                    "No confirmed allocation period exists; cannot create a run "
                    "(post_trade_allocation_runs.period_id is NOT NULL)"
                )
            snapshots = self.repo.snapshots_for_period(period.id)
            by_model: dict[uuid.UUID, list[AllocationModelSnapshot]] = defaultdict(list)
            for s in snapshots:
                by_model[s.model_id].append(s)

            # --- Step 1: pick up new orders ---------------------------------
            orders = self.repo.unallocated_orders()
            if not orders:
                newest_run = self.repo.create_run(
                    trade_date=datetime.now(timezone.utc).strftime("%Y%m%d"),
                    period_id=period.id,
                    status=RunStatus.EMPTY.value,
                    trigger=trigger.value,
                    grand_total=ZERO,
                    run_by=actor,
                )
            else:
                # --- Step 2: aggregate per (tradeDate, model) — SIGNED (D-3) -----
                agg: dict[tuple[str, str], Decimal] = defaultdict(lambda: ZERO)
                model_acct: dict[str, str | None] = {}
                orders_by_key: dict[tuple[str, str], list[Order]] = defaultdict(list)
                for o in orders:
                    key = (o.tradeDate or "", (o.model or "").strip())
                    agg[key] += o.proceeds or ZERO  # signed — no abs(), no |amount|
                    model_acct.setdefault(key[1], o.accountId)
                    orders_by_key[key].append(o)

                newest_run = None
                for (trade_date, model_name), traded in agg.items():
                    model = self.repo.model_by_name(model_name)
                    run = self.repo.create_run(
                        trade_date=trade_date,
                        period_id=period.id,
                        status=RunStatus.COMPLETED.value,
                        trigger=trigger.value,
                        grand_total=traded,
                        run_by=actor,
                    )
                    if model is None:
                        # unresolvable model name — logged, orders still marked so
                        # they don't jam the queue forever; no cells, no portfolio delta
                        self.repo.mark_orders_allocated(
                            [o.id for o in orders_by_key[(trade_date, model_name)]], run.id
                        )
                        newest_run = run
                        continue

                    cells = by_model.get(model.id, [])
                    units_total = sum((c.multiplier for c in cells), ZERO)
                    cell_rows, portfolio_deltas = self._split(
                        traded=traded,
                        units_total=units_total,
                        cells=cells,
                        model=model,
                        model_acct=model_acct[model_name],
                        run_id=run.id,
                    )
                    self.repo.write_cells(cell_rows)
                    self.repo.mark_orders_allocated(
                        [o.id for o in orders_by_key[(trade_date, model_name)]], run.id
                    )

                    # --- Step 5: update portfolios (signed; D-1/D-3) -------------
                    self.repo.upsert_portfolio_deltas(portfolio_deltas, run.id)
                    newest_run = run

            self.db.commit()
        assert newest_run is not None
        self.db.refresh(newest_run)
        return newest_run

    def _split(
        self,
        *,
        traded: Decimal,
        units_total: Decimal,
        cells: list[AllocationModelSnapshot],
        model: Model,
        model_acct: str | None,
        run_id: uuid.UUID,
    ) -> tuple[list[dict], dict[uuid.UUID, Decimal]]:
        """Step 3/4 math: pro-rata split, SIGNED. No abs() anywhere."""
        cell_rows: list[dict] = []
        deltas: dict[uuid.UUID, Decimal] = {}
        for c in cells:
            allocated = traded * c.multiplier / units_total if units_total else ZERO
            pct = (
                (c.multiplier / units_total * 100).quantize(Decimal("0.001"), ROUND_HALF_UP)
                if units_total
                else ZERO
            )
            cell_rows.append(
                {
                    "run_id": run_id,
                    "model_id": model.id,
                    "user_id": c.user_id,
                    "model_traded": traded,
                    "units": c.multiplier,
                    "units_total": units_total,
                    "allocated": allocated,
                    "pct": pct,
                    "ib_account": c.ib_account,
                    "model_name": model.name,
                    "model_acct": model_acct,
                }
            )
            deltas[c.user_id] = deltas.get(c.user_id, ZERO) + allocated  # signed
        return cell_rows, deltas

    def get_view(self, trade_date: str | None = None) -> PostTradeAllocationView | None:
        """GET /post-trade-allocation view assembly — see BE-6."""
        raise NotImplementedError

    def list_runs(self, include_empty: bool = False) -> PtaRunListOut:
        """GET /post-trade-allocation/runs view assembly — see BE-6."""
        raise NotImplementedError
