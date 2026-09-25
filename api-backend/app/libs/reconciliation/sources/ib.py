"""IB execution source: Flex XML drop directory (TCF schema).

The IB Flex column names ARE the same TCF schema the CRM `orders`/`trades`
tables store (see crm.py) — this mapper is that one pointed at a dict instead
of an ORM row. Rows arrive as ``dict[str, str]`` with `""` for missing values,
so every field needs an empty-string-aware read; numeric fields additionally
need `Decimal` parsing (never `float` — this is money).

Fetch shape mirrors crm.py: orders for the day, then each order's own fills
(grouped by `orderID`), each order immediately followed by its fills.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation
from typing import ClassVar, Literal

from app.core.flex_query import FlexFetcher, FlexUnavailable
from app.libs.reconciliation.sources import SourceUnavailable
from app.libs.reconciliation.sources._transform import (
    descrpt,
    flip_fee,
    osi_strip,
    parse_day,
    parse_flex_ts,
    venue,
)
from app.schemas.unified_execution import UnifiedExecutionRow


def _opt(v: str | None) -> str | None:
    """'' and missing both collapse to None; anything else passes through."""
    return v or None


def _dec(v: str | None) -> Decimal | None:
    """Flex numeric string -> Decimal. Empty/missing/unparseable -> None."""
    if not v:
        return None
    try:
        return Decimal(v)
    except InvalidOperation:
        return None


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
    rec: dict[str, str],
    *,
    grain: str,
    ts_primary: str | None,
    ts_fallback: str | None,
) -> UnifiedExecutionRow:
    quantity = _dec(rec.get("quantity"))
    amount = _dec(rec.get("amount"))
    expiry = parse_day(rec.get("expiry"))
    right = _opt(rec.get("putCall"))
    strike = _dec(rec.get("strike"))
    return UnifiedExecutionRow(
        system="IB",
        txn_type=grain,  # type: ignore[arg-type]
        group_ref=rec.get("orderID") or "",
        symbol=osi_strip(rec.get("symbol")),
        descrpt=descrpt(
            _opt(rec.get("underlyingSymbol")), expiry, right, strike, rec.get("symbol")
        ),
        exchange=venue(_opt(rec.get("exchange")), _opt(rec.get("listingExchange"))),
        asset_cat=_opt(rec.get("assetCategory")),  # raw; canonicalized in build_view
        sub_cat=_opt(rec.get("subCategory")),
        currency=_opt(rec.get("currency")),
        account=_opt(rec.get("accountId")),
        txn_time_utc=parse_flex_ts(ts_primary, ts_fallback),
        trade_date=parse_day(rec.get("tradeDate")),
        direction=_direction(_opt(rec.get("buySell")), quantity),  # type: ignore[arg-type]
        qty=abs(quantity) if quantity is not None else None,
        price=_dec(rec.get("price")),
        trade_amt=abs(amount) if amount is not None else None,
        fee=flip_fee(rec.get("commission")),
        settlement_amt=_dec(rec.get("netCash")),
        # IB has no lifecycle column: a row existing implies it executed.
        status="Filled",
    )


class IbSource:
    name: ClassVar[Literal["CRM", "IB", "PC"]] = "IB"

    def __init__(self, fetcher: FlexFetcher) -> None:
        self._fetcher = fetcher

    def days(self) -> list[date]:
        try:
            return self._fetcher.days()
        except FlexUnavailable as exc:
            raise SourceUnavailable(str(exc)) from exc

    def rows(self, day: date) -> list[UnifiedExecutionRow]:
        try:
            flex_rows = self._fetcher.fetch(day)
        except FlexUnavailable as exc:
            raise SourceUnavailable(str(exc)) from exc

        fills_by_order: dict[str, list[dict[str, str]]] = {}
        for f in flex_rows.fills:
            fills_by_order.setdefault(f.get("orderID") or "", []).append(f)

        out: list[UnifiedExecutionRow] = []
        for o in flex_rows.orders:
            order_id = o.get("orderID") or ""
            out.append(
                _row(
                    o,
                    grain="order",
                    ts_primary=o.get("orderTime"),
                    ts_fallback=o.get("dateTime"),
                )
            )
            for f in fills_by_order.get(order_id, []):
                out.append(
                    _row(
                        f,
                        grain="execution",
                        # ponytail: tradeID-over-execID no longer feeds a row
                        # field (ref was dropped from UnifiedExecutionRow).
                        # Kept as a note: execID is NULL/empty on every
                        # BookTrade expiry/assignment row, so tradeID is the
                        # key to use if a per-row identity is ever re-added.
                        ts_primary=f.get("dateTime"),
                        ts_fallback=f.get("orderTime"),
                    )
                )
        return out
