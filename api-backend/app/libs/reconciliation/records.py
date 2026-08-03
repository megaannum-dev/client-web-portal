"""Flat trade-record rows for the MOBO Trade Reconciliation spreadsheet.

Read-only projection of `orders` + `trades` — NO reconciliation, no matching,
no computation. Every row is labelled system "CRM" and status "Confirmed"
because CRM is the only source wired today; when a second source lands, this
module gains a discriminator, not an engine.

Deliberately independent of `engine.py` / `adapters/` (which serve the older
ReconciliationFlowView): there is nothing to reconcile, so there is nothing
for the engine to do here.

Day scoping uses the DATE PREFIX OF `dateTime` (`YYYYMMDD;HHMMSS`), the same
column that renders in the Time cell, so the filter and the displayed time can
never disagree. `settleDate` is not consulted.
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.reconciliation import Order, Trade

SYSTEM = "CRM"
STATUS = "Confirmed"
DASH = "—"

_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

# `dateTime` is 'YYYYMMDD;HHMMSS'; MariaDB has no LEFT() on the ORM side worth
# the import, so slice with substr via func.
_DAY = func.substr(Order.dateTime, 1, 8)


def _fmt_day(token: str | None) -> str:
    """'20260527' -> '27 May 2026'. Falls through unrecognised input unchanged."""
    if not token or len(token) < 8 or not token[:8].isdigit():
        return token or DASH
    mi = int(token[4:6]) - 1
    month = _MONTHS[mi] if 0 <= mi < 12 else token[4:6]
    return f"{int(token[6:8])} {month} {token[:4]}"


def _fmt_short_date(token: str | None) -> str:
    """'20260527' -> '27 May' (the Trade Date cell)."""
    if not token or len(token) < 8 or not token[:8].isdigit():
        return DASH
    mi = int(token[4:6]) - 1
    month = _MONTHS[mi] if 0 <= mi < 12 else token[4:6]
    return f"{int(token[6:8])} {month}"


def _fmt_time(token: str | None) -> str:
    """'20260527;154501' -> '15:45'."""
    if not token or ";" not in token:
        return DASH
    hhmmss = token.split(";", 1)[1]
    if len(hhmmss) < 4 or not hhmmss[:4].isdigit():
        return DASH
    return f"{hhmmss[:2]}:{hhmmss[2:4]}"


def _fmt_price(v: Decimal | None) -> str:
    if v is None:
        return DASH
    # Trim trailing zeros from the Numeric(28,10) storage, keep at least 2 dp.
    s = f"{v:f}".rstrip("0").rstrip(".")
    if "." not in s:
        return f"${s}.00"
    whole, frac = s.split(".")
    return f"${whole}.{frac.ljust(2, '0')}"


def _fmt_qty(v: Decimal | None) -> str:
    if v is None:
        return DASH
    return f"{v.normalize():,f}" if v % 1 else f"{int(v):,}"


def _market(exchange: str | None, listing: str | None) -> str:
    """`exchange` is null on order rows, `listingExchange` on execution rows."""
    return exchange or listing or DASH


def _row(
    *,
    ref: str | None,
    trade_id: str,
    date_token: str | None,
    exchange: str | None,
    listing: str | None,
    symbol: str | None,
    price: Decimal | None,
    qty: Decimal | None,
    txn_type: str,
    date_time: str | None,
    is_first: bool,
) -> dict[str, object]:
    return {
        "sys": SYSTEM,
        "ref": ref or DASH,
        "tradeId": trade_id,
        "tradeDate": _fmt_short_date(date_token),
        "mkt": _market(exchange, listing),
        "stock": symbol or DASH,
        "price": _fmt_price(price),
        "qty": _fmt_qty(qty),
        "txnType": txn_type,
        "time": _fmt_time(date_time),
        "status": STATUS,
        "isFirst": is_first,
    }


def available_days(db: Session) -> list[str]:
    """Distinct `dateTime` day tokens present in `orders`, newest first."""
    rows = db.execute(
        select(_DAY).where(Order.dateTime.is_not(None)).distinct().order_by(_DAY.desc())
    ).scalars()
    return [d for d in rows if d]


def latest_day(db: Session) -> str | None:
    return db.execute(select(func.max(_DAY))).scalar()


def load_records(db: Session, day: str) -> list[dict[str, object]]:
    """Every order for `day` (a 'YYYYMMDD' token) with its executions beneath it.

    Executions are fetched by parent `orderID`, NOT by their own `dateTime`, so
    an order keeps all its fills even when a fill's timestamp rolls past
    midnight.
    """
    orders = (
        db.execute(
            select(Order)
            .where(Order.dateTime.like(f"{day};%"))
            .order_by(Order.dateTime, Order.orderID)
        )
        .scalars()
        .all()
    )
    if not orders:
        return []

    order_ids = [o.orderID for o in orders if o.orderID]
    execs_by_order: dict[str, list[Trade]] = {}
    if order_ids:
        exec_q = (
            select(Trade)
            .where(Trade.orderID.in_(order_ids))
            .order_by(Trade.dateTime, Trade.execID)
        )
        for t in db.execute(exec_q).scalars().all():
            if t.orderID:
                execs_by_order.setdefault(t.orderID, []).append(t)

    rows: list[dict[str, object]] = []
    for o in orders:
        # tradeId groups an order with its fills — it is the row-click target,
        # and today it is simply the order id (nothing to reconcile against).
        trade_id = o.orderID or str(o.id)
        rows.append(
            _row(
                ref=o.orderID,
                trade_id=trade_id,
                date_token=o.tradeDate,
                exchange=o.exchange,
                listing=o.listingExchange,
                symbol=o.symbol,
                price=o.price,
                qty=o.quantity,
                txn_type="Order",
                date_time=o.dateTime,
                is_first=True,
            )
        )
        for t in execs_by_order.get(trade_id, []):
            rows.append(
                _row(
                    ref=t.execID,
                    trade_id=trade_id,
                    date_token=t.tradeDate,
                    exchange=t.exchange,
                    listing=t.listingExchange,
                    symbol=t.symbol,
                    price=t.price,
                    qty=t.quantity,
                    txn_type="Execution",
                    date_time=t.dateTime,
                    is_first=False,
                )
            )
    return rows


def build_view(db: Session, date: str | None) -> dict[str, object]:
    """The whole payload: resolved day label, the picker's day list, the rows."""
    days = available_days(db)
    day = date or latest_day(db)
    if day is None:
        return {"day": DASH, "dates": [], "rows": []}
    return {"day": _fmt_day(day), "dates": days, "rows": load_records(db, day)}
