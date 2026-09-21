"""Tests for the Trade -> Order -> Execution fold (app/libs/reconciliation/_tree.py).

Pure and DB-free: `build_trades` takes the flat rows the source mappers emit.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.libs.reconciliation._tree import build_trades, wap
from app.schemas.unified_execution import UnifiedExecutionRow

_UTC = ZoneInfo("UTC")


def _row(system: str, txn_type: str = "order", **overrides: object) -> UnifiedExecutionRow:
    fields: dict[str, object] = dict(
        system=system,
        account="U17935787",
        txn_type=txn_type,
        symbol="SPY260828C00774000",
        descrpt="SPY 28AUG26 774 C",
        exchange=None if system == "PC" else "CBOE",
        currency="USD",
        asset_cat="OPT",
        sub_cat="CALL",
        trade_date=date(2026, 8, 11),
        direction="BUY",
        price=Decimal("1.50"),
        qty=Decimal("1"),
        trade_amt=Decimal("150.00"),
        fee=Decimal("1.05"),
        settlement_amt=Decimal("148.95"),
        status="Filled",
        txn_time_utc=datetime(2026, 8, 11, 13, 30, tzinfo=_UTC),
        group_ref="g1",
    )
    fields.update(overrides)
    return UnifiedExecutionRow(**fields)


# --- nesting ------------------------------------------------------------------


def test_executions_nest_under_their_own_system_and_group_ref() -> None:
    rows = [
        _row("CRM", group_ref="o1"),
        _row("CRM", "execution", group_ref="o1"),
        _row("CRM", group_ref="o2"),
        # same group_ref as CRM's o1, but a different system -- must not cross over
        _row("IB", "execution", group_ref="o1"),
        _row("IB", group_ref="o1"),
    ]

    [trade] = build_trades(rows)

    nested = {(o.system, o.group_ref): len(o.executions) for o in trade.orders}
    assert nested == {("CRM", "o1"): 1, ("CRM", "o2"): 0, ("IB", "o1"): 1}


def test_an_orphan_execution_is_kept_under_a_synthesized_order() -> None:
    """A fill whose order never arrived must surface, not vanish."""
    rows = [
        _row("PC", "execution", group_ref="22|8", qty=Decimal("1"), price=Decimal("2")),
        _row("PC", "execution", group_ref="22|8", qty=Decimal("3"), price=Decimal("4")),
    ]

    [trade] = build_trades(rows)

    [order] = trade.orders
    assert order.txn_type == "order"
    assert len(order.executions) == 2
    # economics DERIVED from the fills, never invented
    assert order.qty == Decimal("4")
    assert order.price == Decimal("3.5")  # (1*2 + 3*4) / 4


def test_a_fill_follows_its_parent_order_not_its_own_trade_date() -> None:
    """A PC fill's trade_date_et can differ from its order's derived (last-event)
    date; it must stay under its order rather than open a second trade."""
    rows = [
        _row("PC", group_ref="22|8"),
        _row("PC", "execution", group_ref="22|8", trade_date=date(2026, 8, 12)),
    ]

    trades = build_trades(rows)

    assert len(trades) == 1
    assert len(trades[0].orders[0].executions) == 1


# --- trade grouping -----------------------------------------------------------


def test_one_trade_gathers_all_three_systems() -> None:
    rows = [_row("CRM"), _row("IB"), _row("PC")]

    [trade] = build_trades(rows)

    assert sorted(o.system for o in trade.orders) == ["CRM", "IB", "PC"]
    assert set(trade.by_system) == {"CRM", "IB", "PC"}
    assert (trade.account, trade.descrpt, trade.direction) == (
        "U17935787",
        "SPY 28AUG26 774 C",
        "BUY",
    )


def test_buy_and_sell_are_different_trades() -> None:
    trades = build_trades([_row("CRM"), _row("CRM", direction="SELL", group_ref="o2")])

    assert [t.direction for t in trades] == ["BUY", "SELL"]


def test_every_node_carries_its_trade_ref() -> None:
    [trade] = build_trades([_row("CRM"), _row("CRM", "execution")])

    assert all(o.trade_ref == trade.ref for o in trade.orders)
    assert all(e.trade_ref == trade.ref for o in trade.orders for e in o.executions)


# --- weighted average price ---------------------------------------------------


def test_wap_is_weighted_not_a_mean() -> None:
    assert wap([(Decimal("10"), Decimal("1")), (Decimal("20"), Decimal("3"))]) == Decimal("17.5")


def test_wap_is_none_when_nothing_carries_weight() -> None:
    # a PC zero-fill cancelled order: price None, qty 0
    assert wap([(None, Decimal("0"))]) is None
    assert wap([]) is None
    assert wap([(Decimal("1.5"), Decimal("0"))]) is None


def test_trade_price_is_the_weighted_average_of_its_orders() -> None:
    rows = [
        _row("CRM", group_ref="o1", price=Decimal("10"), qty=Decimal("1")),
        _row("CRM", group_ref="o2", price=Decimal("20"), qty=Decimal("3")),
    ]

    [trade] = build_trades(rows)

    assert trade.by_system["CRM"].price == Decimal("17.5")
    assert trade.by_system["CRM"].qty == Decimal("4")


def test_order_derived_wap_equals_execution_derived_wap() -> None:
    """Verified on august_ib_data: an order's `price` IS the weighted average of
    its own fills (86/86 orders, incl. 15 multi-fill), so the cheaper order-level
    weighting is the same number as weighting the fills. Pinning it here means a
    source that stops honouring that fails loudly instead of skewing the view.
    """
    rows = [
        _row("IB", group_ref="o1", price=Decimal("1.38"), qty=Decimal("5")),  # = its fills
        _row("IB", "execution", group_ref="o1", price=Decimal("1.2"), qty=Decimal("2")),
        _row("IB", "execution", group_ref="o1", price=Decimal("1.5"), qty=Decimal("2")),
        _row("IB", "execution", group_ref="o1", price=Decimal("1.5"), qty=Decimal("1")),
        _row("IB", group_ref="o2", price=Decimal("2"), qty=Decimal("5")),
        _row("IB", "execution", group_ref="o2", price=Decimal("2"), qty=Decimal("5")),
    ]

    [trade] = build_trades(rows)

    from_orders = trade.by_system["IB"].price
    from_fills = wap((e.price, e.qty) for o in trade.orders for e in o.executions)
    assert from_orders is not None and from_fills is not None
    # a rounded figure on every source -- tolerance, never ==
    assert abs(from_orders - from_fills) < Decimal("0.0000001")


def test_a_zero_fill_cancel_leaves_the_price_none_without_skewing_its_siblings() -> None:
    rows = [
        _row("PC", group_ref="o1", price=Decimal("2"), qty=Decimal("3")),
        _row("PC", group_ref="o2", price=None, qty=Decimal("0"), status="Canceled"),
    ]

    [trade] = build_trades(rows)

    assert trade.by_system["PC"].price == Decimal("2")
    assert trade.by_system["PC"].qty == Decimal("3")


# --- totals -------------------------------------------------------------------


def test_totals_are_none_when_a_system_contributed_nothing() -> None:
    """None, not 0 -- a false zero reads as 'this system says the fee was nothing'."""
    [trade] = build_trades([_row("CRM", fee=None, trade_amt=None, settlement_amt=None)])

    totals = trade.by_system["CRM"]
    assert totals.fee is None
    assert totals.trade_amt is None
    assert totals.settlement_amt is None


def test_a_fee_rebate_stays_signed_in_the_total() -> None:
    """Rebates are real and verified on live data. Do NOT abs()."""
    rows = [
        _row("CRM", group_ref="o1", fee=Decimal("1.05")),
        _row("CRM", group_ref="o2", fee=Decimal("-0.5306")),
    ]

    [trade] = build_trades(rows)

    assert trade.by_system["CRM"].fee == Decimal("0.5194")


def test_totals_are_never_summed_across_systems() -> None:
    """The same 1-lot seen by three systems is one trade, not three lots."""
    [trade] = build_trades([_row("CRM"), _row("IB"), _row("PC")])

    assert [t.qty for t in trade.by_system.values()] == [Decimal("1")] * 3


# --- ordering -----------------------------------------------------------------


def test_trades_orders_and_fills_are_each_sorted() -> None:
    rows = [
        _row("PC", group_ref="p1", symbol="QQQ260828C00719000", descrpt="QQQ 28AUG26 719 C"),
        _row("IB", group_ref="i1"),
        _row("CRM", group_ref="c1"),
        _row(
            "CRM",
            "execution",
            group_ref="c1",
            txn_time_utc=datetime(2026, 8, 11, 15, 0, tzinfo=_UTC),
        ),
        _row(
            "CRM",
            "execution",
            group_ref="c1",
            txn_time_utc=datetime(2026, 8, 11, 14, 0, tzinfo=_UTC),
        ),
    ]

    trades = build_trades(rows)

    assert [t.descrpt for t in trades] == ["QQQ 28AUG26 719 C", "SPY 28AUG26 774 C"]
    spy = trades[1]
    assert [o.system for o in spy.orders] == ["CRM", "IB"]
    assert [e.txn_time_utc.hour for e in spy.orders[0].executions if e.txn_time_utc] == [14, 15]


def test_null_dates_and_descriptions_sort_without_raising() -> None:
    rows = [_row("CRM", trade_date=None, descrpt=None, direction=None), _row("CRM")]

    trades = build_trades(rows)

    assert len(trades) == 2
    assert trades[-1].trade_date is None  # nulls last
