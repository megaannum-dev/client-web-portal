"""Folds the flat per-source rows into the Trade -> Order -> Execution tree.

The source seam stays flat on purpose (``sources/__init__.py``: "Both grains for
one ET session date, each order followed by its executions") -- nesting is a
pure, DB-free fold applied after collection, so swapping a source's backing
store still means replacing its module and nothing else.

A Trade spans all three systems; the Orders beneath it stay system-scoped. Its
key -- (account, symbol, trade_date, direction) -- is the reconciliation match
key minus ``txn_type`` and minus ``system``, so a trade node IS a match bucket
and ``_reconcile`` no longer re-derives one. It is also the grain IB itself
publishes as ``SymbolSummary`` (accountId + symbol + tradeDate + buySell).
"""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING, Iterable

from app.schemas.unified_execution import (
    ExecutionNode,
    OrderNode,
    TradeNode,
    TradeTotals,
)

if TYPE_CHECKING:
    from app.schemas.unified_execution import UnifiedExecutionRow

_Key = tuple[object, object, object, object]


def _trade_key(row: UnifiedExecutionRow) -> _Key:
    return (row.account, row.symbol, row.trade_date, row.direction)


def trade_ref(key: _Key) -> str:
    return "T|" + "|".join("" if p is None else str(p) for p in key)


def order_ref(system: str, group_ref: str) -> str:
    return f"O|{system}|{group_ref}"


def _exec_ref(system: str, group_ref: str, index: int) -> str:
    # Positional within its order: executions carry no identity on the wire (the
    # mappers note tradeID is the key to use if a per-row identity is ever
    # re-added). Stable because each source returns its fills in a deterministic
    # order -- CRM/IB by (dateTime, tradeID), PC by (executed_at_utc, event id).
    return f"E|{system}|{group_ref}|{index}"


def wap(pairs: Iterable[tuple[Decimal | None, Decimal | None]]) -> Decimal | None:
    """Quantity-weighted average price. None when nothing carries weight.

    Not a mean: 1@10 and 3@20 is 17.5, not 15. Rows with a null price or qty are
    skipped (a PC zero-fill cancelled order has both), and a total weight of zero
    yields None rather than a ZeroDivisionError or a misleading 0.
    """
    num = Decimal(0)
    den = Decimal(0)
    for price, qty in pairs:
        if price is None or qty is None:
            continue
        num += price * qty
        den += qty
    return (num / den) if den else None


def _sum(values: Iterable[Decimal | None]) -> Decimal | None:
    """None-safe sum. None (not 0) when nothing contributed -- a false zero reads
    as "this system says the fee was nothing", which is a different claim."""
    total: Decimal | None = None
    for v in values:
        if v is None:
            continue
        total = v if total is None else total + v
    return total


def _totals(orders: list[OrderNode]) -> TradeTotals:
    return TradeTotals(
        qty=_sum(o.qty for o in orders),
        price=wap((o.price, o.qty) for o in orders),
        trade_amt=_sum(o.trade_amt for o in orders),
        fee=_sum(o.fee for o in orders),
        settlement_amt=_sum(o.settlement_amt for o in orders),
    )


def _order_sort(o: OrderNode) -> tuple:
    return (o.system, o.txn_time_utc is None, o.txn_time_utc, o.group_ref)


def _exec_sort(e: ExecutionNode) -> tuple:
    return (e.txn_time_utc is None, e.txn_time_utc, e.group_ref)


def _trade_sort(t: TradeNode) -> tuple:
    return (
        t.trade_date is None,
        t.trade_date,
        t.symbol or "",
        t.direction or "",
        t.account or "",
    )


def build_trades(rows: list[UnifiedExecutionRow]) -> list[TradeNode]:
    """Fold flat source rows into trades. Pure; nothing is dropped."""
    order_rows = [r for r in rows if r.txn_type == "order"]
    exec_rows = [r for r in rows if r.txn_type == "execution"]

    # Executions nest by their PARENT's key, never by their own trade key: a PC
    # fill's trade_date_et can differ from its order's derived (last-event) date,
    # and a fill must follow its order rather than open a second trade.
    fills: dict[tuple[str, str], list[UnifiedExecutionRow]] = {}
    for r in exec_rows:
        fills.setdefault((r.system, r.group_ref), []).append(r)

    orders: list[OrderNode] = []
    for r in order_rows:
        orders.append(OrderNode(**r.model_dump(), ref="", trade_ref=""))

    seen = {(o.system, o.group_ref) for o in orders}
    for group, orphans in fills.items():
        if group in seen:
            continue
        # A fill whose order never arrived. Surfacing it under a synthesized
        # parent beats dropping it silently -- a source-side regression then
        # shows up in the view instead of vanishing from it. Its economics are
        # DERIVED from the fills (not invented), so trade totals stay right.
        first = orphans[0]
        orders.append(
            OrderNode(
                **first.model_dump(),
                ref="",
                trade_ref="",
            ).model_copy(
                update={
                    "txn_type": "order",
                    "qty": _sum(f.qty for f in orphans),
                    "price": wap((f.price, f.qty) for f in orphans),
                    "trade_amt": _sum(f.trade_amt for f in orphans),
                    "fee": _sum(f.fee for f in orphans),
                    "settlement_amt": _sum(f.settlement_amt for f in orphans),
                }
            )
        )

    by_trade: dict[_Key, list[OrderNode]] = {}
    for o in orders:
        tkey = _trade_key(o)
        o.ref = order_ref(o.system, o.group_ref)
        o.trade_ref = trade_ref(tkey)
        children = [
            ExecutionNode(**f.model_dump(), ref="", trade_ref=o.trade_ref)
            for f in fills.get((o.system, o.group_ref), [])
        ]
        children.sort(key=_exec_sort)
        for i, e in enumerate(children):
            e.ref = _exec_ref(e.system, e.group_ref, i)
        o.executions = children
        by_trade.setdefault(tkey, []).append(o)

    trades = []
    for (account, symbol, trade_date, direction), members in by_trade.items():
        members.sort(key=_order_sort)
        by_system: dict[str, TradeTotals] = {}
        for system in sorted({o.system for o in members}):
            by_system[system] = _totals([o for o in members if o.system == system])
        trades.append(
            TradeNode(
                ref=members[0].trade_ref,
                account=account,  # type: ignore[arg-type]
                symbol=symbol,  # type: ignore[arg-type]
                # Derived from members, IB preferred: it's authoritative, and a
                # bucket can now legitimately hold two spellings since the key
                # is `symbol`, not `descrpt`.
                descrpt=next((o.descrpt for o in members if o.system == "IB" and o.descrpt), None)
                or next((o.descrpt for o in members if o.descrpt), None),
                trade_date=trade_date,  # type: ignore[arg-type]
                direction=direction,  # type: ignore[arg-type]
                asset_cat=next((o.asset_cat for o in members if o.asset_cat), None),
                sub_cat=next((o.sub_cat for o in members if o.sub_cat), None),
                by_system=by_system,
                orders=members,
            )
        )

    trades.sort(key=_trade_sort)
    return trades
