"""Post-trade allocation service — BE-1 scaffold.

PostTradeAllocationService owns all business logic: the 5-step run() (BE-3),
GET-path view assembly (BE-6). Method bodies land in those later units.
"""

from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from datetime import datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.flex_query import FlexUnavailable, StoredFetcher
from app.libs.post_trade_allocation.repository import PostTradeAllocationRepository
from app.models.pc import AllocationModelSnapshot, AllocationPeriod, Model
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

logger = logging.getLogger(__name__)

ZERO = Decimal("0")


class PostTradeAllocationService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = PostTradeAllocationRepository(db)

    def run(
        self, *, trigger: RunTrigger, actor: str | None
    ) -> PostTradeAllocationRun | None:
        """Allocate every trading day that still needs it, oldest first.

        Anchored on trade_date, not on unallocated orders: the runs ledger
        (one session row per date since 0044) is the sole record of which
        dates are done, so the scan asks "which weekdays between the floor
        and the anchor have no run, or a failed one". That makes the ledger
        consecutive -- a day with no trades gets an EMPTY row rather than
        silently not existing.

        Returns the newest run written, or None when there was nothing to do
        (including a fresh install whose archive is still empty).

        D-3 (safety-critical): the net traded amount per model is
        SUM(orders.proceeds), SIGNED. Never abs(); never SUM(|amount|). A
        losing day must produce a negative `traded`, which flows unmodified
        through the pro-rata split into every client's `allocated` and into
        their running portfolio balance (which can therefore DECREASE).
        """
        anchor = self._resolve_anchor()
        if anchor is None:
            # No source data at all -- a fresh install, not an error. Writing
            # an EMPTY run for today would assert "nothing traded today",
            # which is exactly the claim we cannot make without a statement.
            logger.info("PTA: no IB statements with records; nothing to allocate")
            return None

        period = self._require_confirmed_period()
        newest = None
        for trade_date in self._pending_dates(anchor):
            run = self._run_one_date(trade_date, period=period, trigger=trigger, actor=actor)
            if run is not None:
                newest = run
        return newest

    # --- run() helpers -------------------------------------------------------

    def _resolve_anchor(self) -> str | None:
        """Newest trading day the scan may reach, as YYYYMMDD.

        PTA_ANCHOR_DATE when set, else the newest day the IB flex archive
        holds records for -- so allocation never runs ahead of its source.
        Returns None when neither is available (empty archive, no override);
        StoredFetcher.days() is [] then and a bare max([]) would raise.

        Read ONCE per run() and passed down as a parameter, never re-read, so
        a statement landing mid-scan cannot move the target.
        """
        configured = get_settings().pta_anchor_date
        if configured:
            return configured
        days = StoredFetcher().days()
        return max(days).strftime("%Y%m%d") if days else None

    def _require_confirmed_period(self) -> AllocationPeriod:
        """The split basis. post_trade_allocation_runs.period_id is NOT NULL,
        so no run row of any status can be written without one."""
        period = self.repo.latest_confirmed_period()
        if period is None:
            raise RuntimeError(
                "No confirmed allocation period exists; cannot create a run "
                "(post_trade_allocation_runs.period_id is NOT NULL)"
            )
        return period

    def _pending_dates(self, anchor: str) -> list[str]:
        """Weekdays in [floor, anchor] with no run, or a failed one, oldest first.

        Floor is MIN(trade_date) in the ledger, or the anchor itself when the
        ledger is empty (D4) -- a first-ever run covers one date, it does not
        sweep in all of history.

        Weekdays only (D2): the ingest job runs Mon-Fri, so a weekend without
        a statement is expected rather than a gap. Oldest first because the
        portfolio balance is a running total, so write order is chain order.
        """
        floor = self.repo.earliest_run_date() or anchor
        if floor > anchor:
            return []
        status_by_date = self.repo.run_status_by_trade_date()
        out = []
        day = datetime.strptime(floor, "%Y%m%d").date()
        last = datetime.strptime(anchor, "%Y%m%d").date()
        while day <= last:
            if day.weekday() < 5:
                token = day.strftime("%Y%m%d")
                if status_by_date.get(token) in (None, RunStatus.FAILED.value):
                    out.append(token)
            day += timedelta(days=1)
        return out

    def _run_one_date(
        self,
        trade_date: str,
        *,
        period: AllocationPeriod,
        trigger: RunTrigger,
        actor: str | None,
    ) -> PostTradeAllocationRun | None:
        """One date, one transaction.

        Per-date commits matter twice over: a FAILED row must survive to be
        the retry marker (a rollback would erase the very thing that brings
        the date back), and one bad date must not undo the dates already
        allocated earlier in this same scan.
        """
        try:
            with self.db.begin_nested():
                self.repo.reset_portfolio_cache()
                self.repo.delete_run_for_date(trade_date)  # clear a prior FAILED marker

                if not self._has_records(trade_date):
                    status, total = self._no_record_status(trade_date)
                    run = self.repo.create_run(
                        trade_date=trade_date,
                        period_id=period.id,
                        status=status,
                        trigger=trigger.value,
                        grand_total=total,
                        run_by=actor,
                    )
                    self.db.commit()
                    return run

                orders = self.repo.orders_for_trade_date(trade_date)
                if not orders:
                    run = self.repo.create_run(
                        trade_date=trade_date,
                        period_id=period.id,
                        status=RunStatus.EMPTY.value,
                        trigger=trigger.value,
                        grand_total=ZERO,
                        run_by=actor,
                    )
                    self.db.commit()
                    return run

                run = self._allocate(
                    trade_date, orders, period=period, trigger=trigger, actor=actor
                )
                self.db.commit()
                return run
        except Exception:
            self.db.rollback()
            logger.exception("PTA: allocation failed for %s", trade_date)
            raise

    def _has_records(self, trade_date: str) -> bool:
        """Does the IB archive hold trade records for this day?

        days() lists exactly the days whose stored statement carries records,
        so a date missing from it has nothing to allocate -- either because
        IB delivered an empty statement or because it delivered none at all.
        _no_record_status tells those two apart.
        """
        day = datetime.strptime(trade_date, "%Y%m%d").date()
        return day in set(StoredFetcher().days())

    def _no_record_status(self, trade_date: str) -> tuple[str, Decimal | None]:
        """EMPTY when IB delivered a statement showing no trades; FAILED when
        it delivered nothing at all.

        This is the whole point of the fetch-layer split: an empty statement
        is positive evidence that nothing traded, so the date is DONE and
        must not be retried forever. A missing statement means we do not know
        what happened, so the date stays pending and comes back next scan
        (D7). FAILED carries a NULL grand_total -- zero would be a claim.
        """
        day = datetime.strptime(trade_date, "%Y%m%d").date()
        try:
            StoredFetcher().fetch(day)
        except FlexUnavailable:
            return RunStatus.FAILED.value, None
        return RunStatus.EMPTY.value, ZERO

    def _allocate(
        self,
        trade_date: str,
        orders: list[Order],
        *,
        period: AllocationPeriod,
        trigger: RunTrigger,
        actor: str | None,
    ) -> PostTradeAllocationRun:
        """Write one session row for this date plus its per-model cells."""
        snapshots = self.repo.snapshots_for_period(period.id)
        by_model = defaultdict(list)
        for snap in snapshots:
            by_model[snap.model_id].append(snap)

        agg, model_acct = self._aggregate(orders)
        run = self.repo.create_run(
            trade_date=trade_date,
            period_id=period.id,
            status=RunStatus.COMPLETED.value,
            trigger=trigger.value,
            grand_total=sum(agg.values(), ZERO),  # signed day total across models
            run_by=actor,
        )

        # Accumulated across ALL models before a single write:
        # daily_client_portfolios is keyed (run_id, user_id), and there is now
        # one run per DATE, so a client subscribed to two models that both
        # traded today would collide on a per-model write. Their allocations
        # net into one balance row for the day, which is what the balance
        # means anyway.
        day_deltas: dict = defaultdict(lambda: ZERO)
        for model_name, traded in sorted(agg.items()):
            model = self.repo.model_by_name(model_name)
            if model is None:
                # Unresolvable model name: the run row still records the
                # traded amount, but nothing can be split without a model.
                logger.warning(
                    "PTA: %s has orders for unknown model %r; no cells written",
                    trade_date,
                    model_name,
                )
                continue
            cells = by_model.get(model.id, [])
            units_total = sum((c.multiplier for c in cells), ZERO)
            cell_rows, deltas = self._split(
                traded=traded,
                units_total=units_total,
                cells=cells,
                model=model,
                # models.master_ib_account is the source of truth for the
                # account a model trades through; the first-order accountId
                # is only a fallback while the column is still nullable.
                model_acct=model.master_ib_account or model_acct[model_name],
                run_id=run.id,
            )
            self.repo.write_cells(cell_rows)
            for user_id, delta in deltas.items():
                day_deltas[user_id] += delta  # signed (D-3)

        self.repo.upsert_portfolio_deltas(dict(day_deltas), run.id, trade_date)

        # This date may have been filled BEHIND dates already allocated (a
        # failed fetch retried once the statement arrived), and the balance is
        # a running total, so every later row for these users is now stale.
        self.repo.rechain_balances(set(day_deltas), trade_date)
        return run

    def _aggregate(self, orders):
        """Net proceeds per model for one date -- SIGNED (D-3), never abs()."""
        agg = defaultdict(lambda: ZERO)
        model_acct = {}
        default_model_name = get_settings().pta_default_model_name
        for o in orders:
            model_name = (o.model or "").strip() or default_model_name
            agg[model_name] += o.proceeds or ZERO  # signed -- no abs(), no |amount|
            model_acct.setdefault(model_name, o.accountId)
        return dict(agg), model_acct

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
        return self._assemble_view(trade_date, cells)

    def list_runs(self, include_empty: bool = False) -> PtaRunListOut:
        """GET /post-trade-allocation/runs — feeds the DateControl dropdown.
        One entry per distinct trade_date, grand_total summed across every
        run of that date (empty runs carry grand_total=0, so they add
        nothing even when included)."""
        totals: dict[str, Decimal] = defaultdict(lambda: ZERO)
        for run in self.repo.list_run_dates(include_empty=include_empty):
            totals[run.trade_date] += run.grand_total or ZERO

        entries = [
            PtaRunListEntryOut(
                date=_format_date(trade_date),
                grandTotal=float(total),
            )
            for trade_date, total in totals.items()
        ]
        entries.sort(key=lambda e: e.date, reverse=True)
        return PtaRunListOut(runs=entries)

    def _assemble_view(
        self, trade_date: str, cells: list[PostTradeAllocation]
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


def _pct(units: Decimal, units_total: Decimal) -> int:
    if not units_total:
        return 0
    return int((units / units_total * 100).quantize(Decimal("1"), ROUND_HALF_UP))
