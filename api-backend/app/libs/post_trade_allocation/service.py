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

from app.core.config import get_settings
from app.libs.eod.repository import EodRepository
from app.libs.post_trade_allocation.repository import PostTradeAllocationRepository
from app.libs.reconciliation.algotrade.synth import _parse_yyyymmdd, synthesize_from_run
from app.models.pc import AllocationModelSnapshot, Model
from app.models.post_trade_allocation import (
    PostTradeAllocation,
    PostTradeAllocationRun,
    RunStatus,
    RunTrigger,
)
from app.models.reconciliation import Order
from app.models.users import ClientProfile, User
from app.schemas.post_trade_allocation import (
    PostTradeAllocationView,
    PtaClientShareOut,
    PtaHistoryEntryOut,
    PtaHistoryOut,
    PtaModelOut,
    PtaRunListEntryOut,
    PtaRunListOut,
)

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
            demo_datetime = datetime(2026, 7, 13, tzinfo=timezone.utc);
            # orders = self.repo.unallocated_orders(after=period.confirmed_at)
            orders = self.repo.unallocated_orders(after=demo_datetime)
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
                default_model_name = get_settings().pta_default_model_name
                for o in orders:
                    key = (o.tradeDate or "", (o.model or "").strip() or default_model_name)
                    agg[key] += o.proceeds or ZERO  # signed — no abs(), no |amount|
                    model_acct.setdefault(key[1], o.accountId)
                    orders_by_key[key].append(o)

                newest_run = None
                for (trade_date, model_name), traded in agg.items():
                    model = self.repo.model_by_name(model_name)
                    group_orders = orders_by_key[(trade_date, model_name)]
                    settle_date = max(
                        (o.settleDate for o in group_orders if o.settleDate), default=None
                    )
                    run = self.repo.create_run(
                        trade_date=trade_date,
                        period_id=period.id,
                        status=RunStatus.COMPLETED.value,
                        trigger=trigger.value,
                        grand_total=traded,
                        run_by=actor,
                        settle_date=settle_date,
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

                    # BE-8: materialize the AlgoTrade side for this run, same
                    # transaction. Skipped when there's no snapshot for this
                    # model in the confirmed period (`cells` empty) — same as
                    # the unresolvable-model branch above, there's no
                    # (period, user, model) triple to build a ReconSession
                    # against.
                    if cells:
                        synthesize_from_run(
                            self.db,
                            run=run,
                            period=period,
                            snapshot=cells[0],
                            orders=orders_by_key[(trade_date, model_name)],
                        )
                    # BE-6: open (or no-op if already open) the day's EoD header, same transaction.
                    EodRepository(self.db).ensure_open(_parse_yyyymmdd(trade_date))

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
        """GET /post-trade-allocation?date=. No `date` -> most recent tradeDate
        with a non-empty run. Sums post_trade_allocations across every run of
        the resolved date (D-9); reads exclusively from
        post_trade_allocation_runs/post_trade_allocations, never `orders`.
        """
        if trade_date is None:
            non_empty_runs = self.repo.list_run_dates(include_empty=False)
            if not non_empty_runs:
                return None
            trade_date = max(r.trade_date for r in non_empty_runs)
        else:
            # /runs hands back dashed "YYYY-MM-DD" (D-6); the DB stores raw "YYYYMMDD" —
            # undo the dash so a picked date round-trips into the same equality filter.
            trade_date = trade_date.replace("-", "")

        run_rows = self.repo.runs_for_trade_date(trade_date)
        cells = self.repo.cells_for_runs([r.id for r in run_rows])
        if not cells:
            return None
        settle_date = max((r.settle_date for r in run_rows if r.settle_date), default=None)
        return self._assemble_view(trade_date, cells, settle_date)

    def list_runs(self, include_empty: bool = False) -> PtaRunListOut:
        """GET /post-trade-allocation/runs — feeds the DateControl dropdown.
        One entry per distinct trade_date, grand_total summed across every
        run of that date (empty runs carry grand_total=0, so they add
        nothing even when included)."""
        totals: dict[str, Decimal] = defaultdict(lambda: ZERO)
        settle_dates: dict[str, str | None] = {}
        for run in self.repo.list_run_dates(include_empty=include_empty):
            totals[run.trade_date] += run.grand_total or ZERO
            if run.settle_date:
                settle_dates[run.trade_date] = max(
                    settle_dates.get(run.trade_date) or run.settle_date, run.settle_date
                )

        entries = [
            PtaRunListEntryOut(
                date=_format_date(trade_date),
                label=_format_settle_day(settle_dates.get(trade_date)),
                grandTotal=float(total),
            )
            for trade_date, total in totals.items()
        ]
        entries.sort(key=lambda e: e.date, reverse=True)
        return PtaRunListOut(runs=entries)

    def _assemble_view(
        self, trade_date: str, cells: list[PostTradeAllocation], settle_date: str | None
    ) -> PostTradeAllocationView:
        """Group frozen cell rows by model, then by client, summing across
        every run so a late-arriving second run for the same (date, model)
        folds into one model entry (D-9). Everything needed (model
        name/acct/units_total) is already denormalized on each cell — no
        Model/AllocationModelSnapshot re-fetch."""
        seen_run_model: set[tuple[uuid.UUID, uuid.UUID]] = set()
        model_traded: dict[uuid.UUID, Decimal] = defaultdict(lambda: ZERO)
        model_units_total: dict[uuid.UUID, Decimal] = {}
        model_meta: dict[uuid.UUID, tuple[str, str | None]] = {}
        shares: dict[uuid.UUID, dict[uuid.UUID, dict[str, Decimal]]] = defaultdict(dict)

        for cell in cells:
            run_model_key = (cell.run_id, cell.model_id)
            if run_model_key not in seen_run_model:
                seen_run_model.add(run_model_key)
                model_traded[cell.model_id] += cell.model_traded
            model_units_total[cell.model_id] = cell.units_total
            model_meta[cell.model_id] = (cell.model_name, cell.model_acct)

            client = shares[cell.model_id].setdefault(
                cell.user_id, {"units": ZERO, "allocated": ZERO}
            )
            client["units"] += cell.units
            client["allocated"] += cell.allocated

        user_ids = {uid for per_model in shares.values() for uid in per_model}
        names = self._client_names(user_ids)

        models_out: list[PtaModelOut] = []
        for model_id, (model_name, model_acct) in model_meta.items():
            units_total = model_units_total[model_id]
            client_shares = [
                PtaClientShareOut(
                    clientId=str(uid),
                    name=names.get(uid, str(uid)),
                    units=float(vals["units"]),
                    allocated=float(vals["allocated"]),
                    pct=_pct(vals["units"], units_total),
                )
                for uid, vals in shares[model_id].items()
            ]
            client_shares.sort(key=lambda c: c.name)
            models_out.append(
                PtaModelOut(
                    id=str(model_id),
                    name=model_name,
                    acct=model_acct or "",
                    traded=float(model_traded[model_id]),
                    unitsTotal=float(units_total),
                    clientShares=client_shares,
                )
            )
        models_out.sort(key=lambda m: m.name)

        grand_total = sum(model_traded.values(), ZERO)
        return PostTradeAllocationView(
            tradeDate=_format_date(trade_date),
            settleDay=_format_settle_day(settle_date),
            grandTotal=float(grand_total),
            models=models_out,
        )

    def get_history(
        self, from_date: str, to_date: str, model_id: str | None = None
    ) -> PtaHistoryOut:
        raw_from = from_date.replace("-", "")
        raw_to = to_date.replace("-", "")

        runs = self.repo.runs_in_date_range(raw_from, raw_to)
        if model_id is not None:
            model_run_ids = set(self.repo.run_ids_for_model(uuid.UUID(model_id)))
            runs = [r for r in runs if r.id in model_run_ids]

        totals: dict[str, Decimal] = defaultdict(lambda: ZERO)
        for run in runs:
            totals[run.trade_date] += run.grand_total or ZERO

        series = [
            PtaHistoryEntryOut(date=_format_date(td), pnl=float(total))
            for td, total in sorted(totals.items())
        ]
        return PtaHistoryOut(series=series)

    def _client_names(self, user_ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
        """Best available display name per client: ClientProfile.name, else
        email, else the id itself. Not stored on the frozen cell rows, so
        this is the one GET-path lookup outside post_trade_allocation(_run)s —
        it never touches `orders`."""
        if not user_ids:
            return {}
        rows = (
            self.db.query(User.id, User.email, ClientProfile.name)
            .outerjoin(ClientProfile, ClientProfile.user_id == User.id)
            .filter(User.id.in_(user_ids))
            .all()
        )
        return {uid: (name or email or str(uid)) for uid, email, name in rows}


def _format_date(trade_date: str) -> str:
    """YYYYMMDD -> YYYY-MM-DD wire format (D-6)."""
    return f"{trade_date[0:4]}-{trade_date[4:6]}-{trade_date[6:8]}"


def _format_settle_day(settle_date: str | None) -> str:
    """Display label, e.g. 'Wed 05 Jun 2026' — from orders.settleDate (IB),
    never from tradeDate. Referential only: no query/grouping/filter path
    uses this value, so a genuine gap is shown as "—" rather than faked."""
    if not settle_date:
        return "—"
    return datetime.strptime(settle_date, "%Y%m%d").strftime("%a %d %b %Y")


def _pct(units: Decimal, units_total: Decimal) -> int:
    if not units_total:
        return 0
    return int((units / units_total * 100).quantize(Decimal("1"), ROUND_HALF_UP))
