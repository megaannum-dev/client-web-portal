"""CRM execution source: portal `orders` / `trades` tables (IB Flex TCF schema).

Fetch shape: orders for the day, then their fills fetched by parent
``orderID`` (not by the fill's own ``dateTime``), so an order keeps every
fill even when one rolls past midnight ET.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import ClassVar, Literal

from sqlalchemy import distinct, select
from sqlalchemy.orm import Session

from app.libs.reconciliation.sources._transform import (
    descrpt,
    flip_fee,
    osi_strip,
    parse_day,
    parse_flex_ts,
    venue,
)
from app.models.reconciliation import Order, Trade
from app.schemas.unified_execution import UnifiedExecutionRow


def _direction(buy_sell: str | None, quantity: Decimal | None) -> str | None:
    """`buySell` when present; else the sign of `quantity`."""
    if buy_sell:
        return buy_sell
    if quantity is None:
        return None
    if quantity > 0:
        return "BUY"
    if quantity < 0:
        return "SELL"
    return None


def _row(
    rec: Order | Trade,
    *,
    grain: str,
    ts_primary: str | None,
    ts_fallback: str | None,
) -> UnifiedExecutionRow:
    qty_abs = abs(rec.quantity) if rec.quantity is not None else None
    expiry = parse_day(rec.expiry)
    return UnifiedExecutionRow(
        system="CRM",
        txn_type=grain,  # type: ignore[arg-type]
        group_ref=rec.orderID or "",
        symbol=osi_strip(rec.symbol),
        descrpt=descrpt(rec.underlyingSymbol, expiry, rec.putCall, rec.strike, rec.symbol),
        exchange=venue(rec.exchange, rec.listingExchange),
        asset_cat=rec.assetCategory,  # raw; canonicalized in build_view
        sub_cat=rec.subCategory,
        currency=rec.currency,
        account=rec.accountId,
        txn_time_utc=parse_flex_ts(ts_primary, ts_fallback),
        trade_date=parse_day(rec.tradeDate),
        direction=_direction(rec.buySell, rec.quantity),  # type: ignore[arg-type]
        qty=qty_abs,
        price=rec.price,
        trade_amt=abs(rec.amount) if rec.amount is not None else None,
        fee=flip_fee(rec.commission),
        settlement_amt=rec.netCash,
        # IB has no lifecycle column: a row existing implies it executed.
        status="Filled",
    )


class CrmSource:
    name: ClassVar[Literal["CRM", "IB", "PC"]] = "CRM"

    def __init__(self, db: Session) -> None:
        self._db = db

    def days(self) -> list[date]:
        tokens = (
            self._db.execute(
                select(distinct(Order.tradeDate)).where(Order.tradeDate.is_not(None))
            )
            .scalars()
            .all()
        )
        days = {d for t in tokens if (d := parse_day(t)) is not None}
        return sorted(days, reverse=True)

    def rows(self, day: date) -> list[UnifiedExecutionRow]:
        token = day.strftime("%Y%m%d")
        orders = (
            self._db.execute(
                select(Order)
                .where(Order.tradeDate == token)
                .order_by(Order.dateTime, Order.orderID)
            )
            .scalars()
            .all()
        )
        if not orders:
            return []

        order_ids = [o.orderID for o in orders if o.orderID]
        fills_by_order: dict[str, list[Trade]] = {}
        if order_ids:
            exec_q = (
                select(Trade)
                .where(Trade.orderID.in_(order_ids))
                .order_by(Trade.dateTime, Trade.tradeID)
            )
            for t in self._db.execute(exec_q).scalars().all():
                if t.orderID:
                    fills_by_order.setdefault(t.orderID, []).append(t)

        out: list[UnifiedExecutionRow] = []
        for o in orders:
            out.append(
                _row(
                    o,
                    grain="order",
                    ts_primary=o.orderTime,
                    ts_fallback=o.dateTime,
                )
            )
            for t in fills_by_order.get(o.orderID or "", []):
                out.append(
                    _row(
                        t,
                        grain="execution",
                        # ponytail: tradeID-over-execID no longer feeds a row
                        # field (ref was dropped from UnifiedExecutionRow).
                        # Kept as a note: execID is NULL on every BookTrade
                        # row (expiries/assignments) — 34 of 856 — while
                        # tradeID is populated on all; use tradeID as the key
                        # if a per-row identity is ever re-added.
                        ts_primary=t.dateTime,
                        ts_fallback=t.orderTime,
                    )
                )
        return out
