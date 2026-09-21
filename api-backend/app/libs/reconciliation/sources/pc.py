"""PC execution source: `pc_orders` / `pc_trades` engine landing tables.

The pc_* columns are properly typed in MariaDB (real DATE / datetime(6) UTC,
no NULLs on the date/time columns used here) — unlike the CSV export the
mapping doc's casts and Excel-serial fallback target. Do NOT join the
per-event landing table; `last_event_utc` (orders) and `executed_at_utc`
(trades) are both genuine UTC instants already.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import ClassVar, Literal, cast
from zoneinfo import ZoneInfo

from sqlalchemy import select, tuple_
from sqlalchemy.orm import Session

from app.libs.reconciliation.sources._transform import (
    descrpt,
    et_date,
    et_to_utc,
    osi_strip,
)
from app.models.pc_data import PcOrder, PcTrade
from app.schemas.unified_execution import UnifiedExecutionRow

_UTC = ZoneInfo("UTC")


def _as_utc(naive_utc: datetime | None) -> datetime | None:
    """Stamp tzinfo on an already-UTC naive datetime. No conversion, no shift."""
    if naive_utc is None:
        return None
    return naive_utc.replace(tzinfo=_UTC)


def _order_ref(o: PcOrder) -> str:
    return f"{o.source_run_id}|{o.lean_order_id}"


def _direction(net_fill_quantity: Decimal | None) -> str:
    """`'BUY' if net_fill_quantity > 0 else 'SELL'` — reproduces IB `buySell` on 91/91."""
    return "BUY" if net_fill_quantity is not None and net_fill_quantity > 0 else "SELL"


def _order_row(o: PcOrder) -> UnifiedExecutionRow:
    # `last_event_utc` is the wrong instant to match on. It is the last LIFECYCLE
    # event, so for an order partially filled and then cancelled it is the cancel:
    # order 22|8 filled at 19:50:31.667 and was cancelled at 20:15:00.385, and CRM's
    # counterpart fill is stamped 19:50:31 -- agreeing to the second with the fill
    # and sitting 25 minutes from the cancel, past `_reconcile._PAIR_WINDOW`'s 60s.
    #
    # `first_event_utc` (the submit) is measured at median 0.107s / max 43.7s
    # before the earliest fill, always inside that window -- and needs no fills
    # loaded, which is what lets rows() below fetch orders and fills separately.
    # ponytail: 43.7s of the 60s budget is the worst case seen; _PAIR_WINDOW is
    # the knob to widen if a source develops more lag than that.
    last_event = _as_utc(o.last_event_utc)  # type: ignore[arg-type]
    ts = _as_utc(o.first_event_utc) or last_event  # type: ignore[arg-type]
    ref = _order_ref(o)
    return UnifiedExecutionRow(
        system="PC",
        txn_type="order",
        group_ref=ref,
        symbol=osi_strip(o.symbol),  # type: ignore[arg-type]
        descrpt=descrpt(
            o.underlying_symbol, o.option_expiry, o.option_right, o.strike_price, o.symbol  # type: ignore[arg-type]
        ),
        exchange=None,  # PC has no venue column at all
        asset_cat=o.security_type,  # type: ignore[arg-type]  # raw; canonicalized in build_view
        sub_cat=o.option_right,  # type: ignore[arg-type]
        currency=o.quote_currency,
        account=o.account_id,
        txn_time_utc=ts,
        # Still derived from last_event_utc, never from `ts`: §3 settles the ET
        # date on the last event, and `rows()` below selects the day the same
        # way -- deriving it from the fill instead could hand an order a
        # trade_date outside the very day it was fetched for.
        trade_date=et_date(last_event) if last_event is not None else None,
        direction=_direction(o.net_fill_quantity),  # type: ignore[arg-type]
        qty=o.gross_fill_quantity,  # type: ignore[arg-type]
        # NULL on the zero-fill cancelled orders; a rounded 9dp figure, never compare with ==.
        price=o.weighted_average_fill_price,  # type: ignore[arg-type]
        trade_amt=o.gross_premium_usd,  # type: ignore[arg-type]
        fee=o.total_fee_usd,  # type: ignore[arg-type]  # already positive, do not flip
        settlement_amt=o.modeled_cash_flow_after_fees_usd,  # type: ignore[arg-type]
        status=o.latest_status,  # 'Filled' | 'Canceled' — pass through
    )


def _trade_row(t: PcTrade) -> UnifiedExecutionRow:
    return UnifiedExecutionRow(
        system="PC",
        txn_type="execution",
        group_ref=f"{t.source_run_id}|{t.lean_order_id}",
        symbol=osi_strip(t.symbol),  # type: ignore[arg-type]
        descrpt=descrpt(
            t.underlying_symbol, t.option_expiry, t.option_right, t.strike_price, t.symbol  # type: ignore[arg-type]
        ),
        exchange=None,  # PC has no venue column at all
        asset_cat=t.security_type,  # type: ignore[arg-type]  # raw; canonicalized in build_view
        sub_cat=t.option_right,  # type: ignore[arg-type]
        currency=t.quote_currency,
        account=t.account_id,
        txn_time_utc=_as_utc(t.executed_at_utc),  # type: ignore[arg-type]
        trade_date=t.trade_date_et,  # type: ignore[arg-type]  # already correct ET date
        direction=t.side,  # type: ignore[arg-type]
        qty=t.fill_quantity_abs,  # type: ignore[arg-type]
        price=t.fill_price,  # type: ignore[arg-type]
        trade_amt=t.gross_premium_usd,  # type: ignore[arg-type]
        fee=t.fee_usd,  # type: ignore[arg-type]  # already positive, do not flip
        settlement_amt=t.modeled_cash_flow_after_fees_usd,  # type: ignore[arg-type]
        # 'Filled' | 'PartiallyFilled' — do NOT collapse to a 'Filled' literal;
        # PartiallyFilled is the only signal that a fill was cancelled mid-way.
        status=t.fill_status,
    )


class PcSource:
    name: ClassVar[Literal["CRM", "IB", "PC"]] = "PC"

    def __init__(self, db: Session) -> None:
        self._db = db

    def days(self) -> list[date]:
        # ponytail: NOT folding the ET-date conversion into SQL (e.g. MySQL
        # CONVERT_TZ) -- it needs tz tables loaded, doesn't exist on the
        # SQLite the tests use, and would put timezone math outside
        # _transform, which that module's docstring reserves exclusively for
        # et_to_utc/et_date. .distinct() is still worth adding: it's free and
        # collapses trade_date_et duplicates even though last_event_utc is
        # datetime(6)-precision and DISTINCT there collapses almost nothing.
        trade_days: set[date] = {
            cast(date, d)
            for d in self._db.execute(
                select(PcTrade.trade_date_et).where(PcTrade.trade_date_et.is_not(None)).distinct()
            )
            .scalars()
            .all()
            if d
        }
        order_ts = (
            self._db.execute(
                select(PcOrder.last_event_utc)
                .where(PcOrder.last_event_utc.is_not(None))
                .distinct()
            )
            .scalars()
            .all()
        )
        order_days = {
            et_date(cast(datetime, ts).replace(tzinfo=_UTC)) for ts in order_ts if ts is not None
        }
        return sorted(trade_days | order_days, reverse=True)

    def rows(self, day: date) -> list[UnifiedExecutionRow]:
        # pc_orders has no stored trade_date column -- it's derived from
        # last_event_utc -- so filter on a UTC half-open range for the ET day.
        # Both endpoints go through et_to_utc independently (not lo + 24h)
        # because the DST-transition day is 23h or 25h long, never exactly 24.
        lo = et_to_utc(datetime.combine(day, time.min)).replace(tzinfo=None)
        hi = et_to_utc(datetime.combine(day + timedelta(days=1), time.min)).replace(tzinfo=None)
        # .replace(tzinfo=None): last_event_utc is a naive-UTC column: comparing
        # it to a tz-aware bound would either error or silently misconvert.
        day_orders = (
            self._db.execute(
                select(PcOrder)
                .where(PcOrder.last_event_utc >= lo, PcOrder.last_event_utc < hi)
                .order_by(PcOrder.source_run_id, PcOrder.lean_order_id)
            )
            .scalars()
            .all()
        )
        if not day_orders:
            return []

        # Fetch fills by the parent order's own key, not by trade_date_et: the
        # two date filters could disagree (e.g. an order whose last event is a
        # next-morning cancel), a fill belongs with its order regardless of
        # which day the fill itself is stamped, and keying this way is what
        # removes the need for a second, orphan-reconciliation pass.
        keys = [(o.source_run_id, o.lean_order_id) for o in day_orders]
        trades = (
            self._db.execute(
                select(PcTrade)
                .where(tuple_(PcTrade.source_run_id, PcTrade.lean_order_id).in_(keys))
                .order_by(PcTrade.executed_at_utc, PcTrade.source_event_id)
            )
            .scalars()
            .all()
        )
        fills_by_group: dict[str, list[PcTrade]] = {}
        for t in trades:
            fills_by_group.setdefault(f"{t.source_run_id}|{t.lean_order_id}", []).append(t)

        out: list[UnifiedExecutionRow] = []
        for o in day_orders:
            out.append(_order_row(o))
            for t in fills_by_group.get(_order_ref(o), []):
                out.append(_trade_row(t))
        return out
