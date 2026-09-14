"""PC execution source: `pc_orders` / `pc_trades` engine landing tables.

The pc_* columns are properly typed in MariaDB (real DATE / datetime(6) UTC,
no NULLs on the date/time columns used here) — unlike the CSV export the
mapping doc's casts and Excel-serial fallback target. Do NOT join the
per-event landing table; `last_event_utc` (orders) and `executed_at_utc`
(trades) are both genuine UTC instants already.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import ClassVar, Literal, cast
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.libs.reconciliation.sources._transform import asset_class, descrpt, et_date
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
    ts = _as_utc(o.last_event_utc)  # type: ignore[arg-type]
    ref = _order_ref(o)
    return UnifiedExecutionRow(
        system="PC",
        txn_type="order",
        group_ref=ref,
        descrpt=descrpt(
            o.underlying_symbol, o.option_expiry, o.option_right, o.strike_price, o.symbol  # type: ignore[arg-type]
        ),
        exchange=None,  # PC has no venue column at all
        asset_class=asset_class(o.security_type, o.option_right),
        currency=o.quote_currency,
        account=o.account_id,
        txn_time_utc=ts,
        # last_event_utc is the last EVENT (may be a later cancel), not the
        # fill — but its ET date is still the correct trade_date per §3.
        trade_date=et_date(ts) if ts is not None else None,
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
        descrpt=descrpt(
            t.underlying_symbol, t.option_expiry, t.option_right, t.strike_price, t.symbol  # type: ignore[arg-type]
        ),
        exchange=None,  # PC has no venue column at all
        asset_class=asset_class(t.security_type, t.option_right),
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
        trade_days: set[date] = {
            cast(date, d)
            for d in self._db.execute(select(PcTrade.trade_date_et)).scalars().all()
            if d
        }
        order_ts = self._db.execute(select(PcOrder.last_event_utc)).scalars().all()
        order_days = {
            et_date(cast(datetime, ts).replace(tzinfo=_UTC)) for ts in order_ts if ts is not None
        }
        return sorted(trade_days | order_days, reverse=True)

    def rows(self, day: date) -> list[UnifiedExecutionRow]:
        # pc_orders has no stored trade_date column (it's derived from
        # last_event_utc), and the table is small (110 rows) -- filter in
        # Python rather than push a per-row zoneinfo conversion into SQL.
        # ponytail: O(n) scan over ~110 rows, fine at this scale.
        all_orders = self._db.execute(select(PcOrder)).scalars().all()
        day_orders = [
            o
            for o in all_orders
            if o.last_event_utc is not None
            and et_date(cast(datetime, o.last_event_utc).replace(tzinfo=_UTC)) == day
        ]
        day_orders.sort(key=lambda o: (o.source_run_id, o.lean_order_id))

        trades = (
            self._db.execute(
                select(PcTrade)
                .where(PcTrade.trade_date_et == day)
                .order_by(PcTrade.executed_at_utc, PcTrade.source_event_id)
            )
            .scalars()
            .all()
        )
        fills_by_group: dict[str, list[PcTrade]] = {}
        for t in trades:
            fills_by_group.setdefault(f"{t.source_run_id}|{t.lean_order_id}", []).append(t)

        out: list[UnifiedExecutionRow] = []
        seen_groups: set[str] = set()
        for o in day_orders:
            ref = _order_ref(o)
            seen_groups.add(ref)
            out.append(_order_row(o))
            for t in fills_by_group.get(ref, []):
                out.append(_trade_row(t))

        # A fill's own trade_date_et can, in principle, differ from its
        # parent order's derived (last-event) date -- see the cancel-time
        # caveat in _transform/module docstring. Surface any such orphaned
        # group by pulling its order in too, so every fill's group_ref
        # still resolves within this day's result.
        for group_ref, fills in fills_by_group.items():
            if group_ref in seen_groups:
                continue
            run_id_s, lean_id_s = group_ref.split("|", 1)
            orphan = next(
                (
                    o
                    for o in all_orders
                    if str(o.source_run_id) == run_id_s and str(o.lean_order_id) == lean_id_s
                ),
                None,
            )
            if orphan is not None:
                out.append(_order_row(orphan))
                out.extend(_trade_row(t) for t in fills)

        return out
