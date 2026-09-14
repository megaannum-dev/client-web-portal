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

from app.core.ib_flex import FlexFetcher, FlexUnavailable
from app.libs.reconciliation.sources import SourceUnavailable
from app.libs.reconciliation.sources._transform import (
    asset_category,
    flip_fee,
    osi_strip,
    parse_day,
    parse_flex_ts,
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
    ref: str,
    ts_primary: str | None,
    ts_fallback: str | None,
) -> UnifiedExecutionRow:
    quantity = _dec(rec.get("quantity"))
    amount = _dec(rec.get("amount"))
    return UnifiedExecutionRow(
        system="IB",
        grain=grain,  # type: ignore[arg-type]
        ref=ref,
        group_ref=rec.get("orderID") or "",
        contract=osi_strip(rec.get("symbol")) or "",
        underlying=_opt(rec.get("underlyingSymbol")),
        expiry=parse_day(rec.get("expiry")),
        right=_opt(rec.get("putCall")),
        strike=_dec(rec.get("strike")),
        multiplier=_dec(rec.get("multiplier")),
        security_type=asset_category(_opt(rec.get("assetCategory"))),
        currency=_opt(rec.get("currency")),
        account=_opt(rec.get("accountId")),
        event_ts_utc=parse_flex_ts(ts_primary, ts_fallback),
        trade_date=parse_day(rec.get("tradeDate")),
        direction=_direction(_opt(rec.get("buySell")), quantity),  # type: ignore[arg-type]
        qty_signed=quantity,
        qty_abs=abs(quantity) if quantity is not None else None,
        price=_dec(rec.get("price")),
        premium_signed=amount,
        premium_gross=abs(amount) if amount is not None else None,
        fee=flip_fee(rec.get("commission")),
        cash_before_fees=_dec(rec.get("proceeds")),
        cash_after_fees=_dec(rec.get("netCash")),
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
                    ref=order_id,
                    ts_primary=o.get("orderTime"),
                    ts_fallback=o.get("dateTime"),
                )
            )
            for f in fills_by_order.get(order_id, []):
                out.append(
                    _row(
                        f,
                        grain="execution",
                        # tradeID not execID: execID is empty on BookTrade rows
                        # (expiries/assignments). Mirrors crm.py.
                        ref=f.get("tradeID") or f.get("execID") or "",
                        ts_primary=f.get("dateTime"),
                        ts_fallback=f.get("orderTime"),
                    )
                )
        return out
