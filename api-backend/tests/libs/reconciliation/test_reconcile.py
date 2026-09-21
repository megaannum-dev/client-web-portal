"""Tests for the cross-system break engine (app/libs/reconciliation/_reconcile.py).

Pure and DB-free by construction -- `reconcile()` takes an already-built trade tree,
so these build `UnifiedExecutionRow`s and fold them with `build_trades` rather than
going through a source mapper or the sqlite `session` fixture.

Note every row factory sets `account`: it is part of the trade key, so rows with a
None account would bucket separately from rows with one and every test would read
"missing everywhere".
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.libs.reconciliation._reconcile import reconcile
from app.libs.reconciliation._tree import build_trades
from app.schemas.unified_execution import ReconSummary, TradeNode, UnifiedExecutionRow, _Node

ALL = {"CRM", "IB", "PC"}
_UTC = ZoneInfo("UTC")


def _row(system: str, **overrides: object) -> UnifiedExecutionRow:
    """One reconcilable row. Defaults match across systems, so any break in a test
    comes from that test's overrides and nothing else."""
    fields: dict[str, object] = dict(
        system=system,
        account="U17935787",
        txn_type="order",
        symbol="SPY260828C00774000",
        descrpt="SPY 28AUG26 774 C",
        # PC has no venue column at all -- structural null, not a data gap.
        exchange=None if system == "PC" else "CBOE",
        currency="USD",
        asset_class="OPT-CALL",
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


def _recon(
    rows: list[UnifiedExecutionRow], live: set[str] = ALL
) -> tuple[list[TradeNode], ReconSummary]:
    trades = build_trades(rows)
    return trades, reconcile(trades, live)


def _nodes(trades: list[TradeNode]) -> list[_Node]:
    """Every real (non-placeholder) node in the tree."""
    return [n for t in trades for o in t.orders for n in (o, *o.executions) if not n.missing]


def _placeholders(trades: list[TradeNode]) -> list[_Node]:
    return [n for t in trades for o in t.orders for n in (o, *o.executions) if n.missing]


# --- the happy path -----------------------------------------------------------


def test_clean_three_way_match_reports_nothing() -> None:
    trades, summary = _recon([_row("CRM"), _row("IB"), _row("PC")])

    assert all(not n.breaks and not n.missing_from for n in _nodes(trades))
    assert summary.broken_rows == []
    assert summary.missing_rows == []
    assert summary.by_field == {}
    assert summary.missing_by_system == {"CRM": 0, "IB": 0, "PC": 0}
    assert len(trades) == 1 and not trades[0].breaks and not trades[0].missing_from


def test_pc_null_exchange_is_not_an_exchange_break() -> None:
    """PC's null venue is structural, so `exchange` is effectively a CRM<->IB check."""
    trades, _ = _recon([_row("CRM"), _row("IB"), _row("PC", exchange=None)])

    assert all("exchange" not in n.breaks for n in _nodes(trades))


# --- field breaks -------------------------------------------------------------


def test_exchange_disagreement_between_crm_and_ib_breaks() -> None:
    trades, summary = _recon(
        [_row("CRM", exchange="CBOE"), _row("IB", exchange="AMEX"), _row("PC")]
    )

    assert all(n.breaks == ["exchange"] for n in _nodes(trades))
    assert summary.by_field == {"exchange": 1}
    assert len(summary.broken_rows) == 3


def test_a_break_on_the_orders_is_mirrored_onto_the_trade() -> None:
    trades, _ = _recon([_row("CRM", exchange="CBOE"), _row("IB", exchange="AMEX"), _row("PC")])

    assert trades[0].breaks == ["exchange"]


def test_an_execution_grain_break_does_not_leak_onto_the_trade() -> None:
    """Orders agree; only the fills disagree on venue."""
    rows = [
        _row("CRM"),
        _row("IB"),
        _row("CRM", txn_type="execution", exchange="EMERALD"),
        _row("IB", txn_type="execution", exchange="GEMINI"),
    ]
    trades, summary = _recon(rows, {"CRM", "IB"})

    assert trades[0].breaks == []
    assert all("exchange" in e.breaks for o in trades[0].orders for e in o.executions)
    assert summary.by_field == {"exchange": 1}


def test_qty_sum_disagreement_breaks() -> None:
    trades, summary = _recon([_row("CRM"), _row("IB"), _row("PC", qty=Decimal("2"))])

    assert all("qty" in n.breaks for n in _nodes(trades))
    assert summary.by_field["qty"] == 1


def test_currency_and_asset_class_are_compared() -> None:
    # asset_class is part of neither the trade key nor the nesting, so a
    # disagreeing IB row still lands in the same trade and is compared there.
    rows = [_row("CRM"), _row("IB", currency="CAD", asset_class="OPT-PUT"), _row("PC")]
    _, summary = _recon(rows)

    assert summary.by_field == {"currency": 1, "asset_class": 1}


# --- missing records ----------------------------------------------------------


def test_pc_only_filled_order_is_missing_on_both_other_systems() -> None:
    """The most serious break this screen reports: the engine believes it traded
    and the broker has no record of it."""
    trades, summary = _recon([_row("PC")])

    assert _nodes(trades)[0].missing_from == ["CRM", "IB"]
    assert summary.missing_by_system == {"CRM": 1, "IB": 1, "PC": 0}


def test_a_missing_order_is_materialized_as_an_empty_node_under_the_trade() -> None:
    """The gap is renderable in place, not just counted."""
    trades, summary = _recon([_row("CRM"), _row("PC")])

    gaps = _placeholders(trades)
    assert [g.ref for g in gaps] == summary.missing_rows
    assert len(gaps) == 1
    gap = gaps[0]
    assert gap.system == "IB"
    assert gap.txn_type == "order"
    assert gap.trade_ref == trades[0].ref
    assert gap in trades[0].orders
    # identity copied from the trade, every economic field empty
    assert (gap.descrpt, gap.trade_date, gap.direction) == (
        trades[0].descrpt,
        trades[0].trade_date,
        trades[0].direction,
    )
    assert (gap.qty, gap.price, gap.trade_amt, gap.fee, gap.settlement_amt) == (
        None,
        None,
        None,
        None,
        None,
    )
    # and it names the systems that DO carry the record
    assert gap.missing_from == ["CRM", "PC"]
    assert gap.breaks == []


def test_an_extra_order_on_one_system_does_not_break_the_ones_that_agree() -> None:
    """Quantity is compared as a SUM across the bucket, so an order only PC has
    made the totals read CRM 6 / IB 6 / PC 9 -- and every row in the bucket came
    back carrying a `qty` break, including the three qty-6 orders that agree to
    the cent. Observed on 2026-08-25, SPY 25AUG26 758 P.

    The gap is the missing record, and it is already reported as one. Reporting
    the arithmetic consequence as well says the same thing twice and pins the
    second copy on rows that are correct.
    """
    rows = [
        _row("CRM", group_ref="c1"),
        _row("IB", group_ref="i1"),
        _row("PC", group_ref="p1"),
        _row("PC", group_ref="p2", qty=Decimal("3")),
    ]

    trades, summary = _recon(rows)

    assert [n.breaks for n in _nodes(trades)] == [[], [], [], []]
    assert trades[0].breaks == []
    assert "qty" not in summary.by_field
    # the real finding still lands
    assert trades[0].missing_from == ["CRM", "IB"]
    assert summary.missing_by_system == {"CRM": 1, "IB": 1, "PC": 0}


def test_an_unmatched_order_that_came_FIRST_does_not_steal_the_pairing() -> None:
    """2026-08-25, SPY 25AUG26 758 P. PC carried an extra qty-3 order at 12:33:04
    that CRM and IB never saw, plus the qty-6 order all three agreed on at
    12:44:46. Pairing each system's i-th EARLIEST record put PC's unmatched order
    opposite the other two systems' matched ones -- a quantity break on three rows
    that agree, and the missing record pinned to the wrong order.

    Matching on proximity instead: the 12:33:04 order is more than a minute from
    anything CRM or IB holds, so it opens its own slot and carries the gap alone.
    """
    early = datetime(2026, 8, 25, 16, 33, 4, tzinfo=_UTC)
    late = datetime(2026, 8, 25, 16, 44, 46, tzinfo=_UTC)
    rows = [
        _row("CRM", group_ref="c1", qty=Decimal("6"), txn_time_utc=late),
        _row("IB", group_ref="i1", qty=Decimal("6"), txn_time_utc=late),
        _row("PC", group_ref="p1", qty=Decimal("6"), txn_time_utc=late),
        _row("PC", group_ref="p2", qty=Decimal("3"), txn_time_utc=early),
    ]

    trades, summary = _recon(rows)

    assert [n.breaks for n in _nodes(trades)] == [[], [], [], []]
    assert summary.by_field == {}
    # only the 12:33:04 order reports the gap
    gaps = {o.group_ref: o.missing_from for o in trades[0].orders if not o.missing}
    assert gaps == {"c1": [], "i1": [], "p1": [], "p2": ["CRM", "IB"]}
    assert summary.missing_by_system == {"CRM": 1, "IB": 1, "PC": 0}


def test_a_stale_earlier_order_does_not_steal_a_closer_pairing() -> None:
    """Anchoring on the globally earliest record is not enough on its own.

    CRM holds a stale 14:00:00 order and the real 14:00:45 one; IB holds a single
    14:00:44 order. The stale order anchors first and IB's is 44s away -- inside
    the pairing window -- so it was captured there, and the 1-second-apart true
    match was left unpaired and reported missing on both sides. A pair only
    commits when neither side has a closer remaining counterpart.
    """
    stale = datetime(2026, 8, 11, 14, 0, 0, tzinfo=_UTC)
    ib_t = datetime(2026, 8, 11, 14, 0, 44, tzinfo=_UTC)
    true_t = datetime(2026, 8, 11, 14, 0, 45, tzinfo=_UTC)
    rows = [
        _row("CRM", group_ref="c_stale", qty=Decimal("9"), txn_time_utc=stale),
        _row("CRM", group_ref="c_true", qty=Decimal("1"), txn_time_utc=true_t),
        _row("IB", group_ref="i1", qty=Decimal("1"), txn_time_utc=ib_t),
    ]

    trades, summary = _recon(rows, live={"CRM", "IB"})

    gaps = {o.group_ref: o.missing_from for o in trades[0].orders if not o.missing}
    # the 1s-apart pair reconciles; only the stale order is short a counterpart
    assert gaps == {"c_stale": ["IB"], "c_true": [], "i1": []}
    assert [n.breaks for n in _nodes(trades)] == [[], [], []]
    assert summary.by_field == {}
    assert summary.missing_by_system == {"CRM": 0, "IB": 1}


def test_a_few_seconds_of_clock_drift_still_pairs() -> None:
    """The sources agree on the instant to within a second or two, not exactly,
    so proximity matching has to tolerate the drift rather than split on it."""
    rows = [
        _row("CRM", group_ref="c1", txn_time_utc=datetime(2026, 8, 11, 13, 30, 0, tzinfo=_UTC)),
        _row("IB", group_ref="i1", txn_time_utc=datetime(2026, 8, 11, 13, 30, 2, tzinfo=_UTC)),
        _row("PC", group_ref="p1", txn_time_utc=datetime(2026, 8, 11, 13, 29, 58, tzinfo=_UTC)),
    ]

    trades, summary = _recon(rows)

    assert len(trades[0].orders) == 3  # one slot, no placeholders
    assert summary.missing_by_system == {"CRM": 0, "IB": 0, "PC": 0}


def test_orders_pair_across_systems_by_time_not_by_arrival() -> None:
    """Two orders on the same contract, same side, same day: the 10:00 one for 4
    and the 14:00 one for 6. They arrive from IB in the opposite order, so a
    positional pairing on arrival would compare 4 against 6 and report two qty
    breaks on four correct rows. Pairing on time compares like with like."""
    early = datetime(2026, 8, 11, 14, 0, tzinfo=_UTC)
    late = datetime(2026, 8, 11, 18, 30, tzinfo=_UTC)
    rows = [
        _row("CRM", group_ref="c1", qty=Decimal("4"), txn_time_utc=early),
        _row("CRM", group_ref="c2", qty=Decimal("6"), txn_time_utc=late),
        _row("IB", group_ref="i2", qty=Decimal("6"), txn_time_utc=late),
        _row("IB", group_ref="i1", qty=Decimal("4"), txn_time_utc=early),
    ]

    trades, summary = _recon(rows, live={"CRM", "IB"})

    assert [n.breaks for n in _nodes(trades)] == [[], [], [], []]
    assert trades[0].breaks == []
    assert summary.by_field == {}
    assert summary.missing_by_system == {"CRM": 0, "IB": 0}


def test_the_gap_lands_on_the_unpaired_order_not_on_every_row() -> None:
    """PC has two orders, CRM one. Pairing by time makes PC's EARLIER order the
    counterpart of CRM's, so only PC's later one is unmatched. A row is never
    reported missing from its own system either -- it has itself."""
    rows = [
        _row("CRM", group_ref="c1", txn_time_utc=datetime(2026, 8, 11, 13, 30, tzinfo=_UTC)),
        _row("PC", group_ref="p1", txn_time_utc=datetime(2026, 8, 11, 13, 30, tzinfo=_UTC)),
        _row("PC", group_ref="p2", txn_time_utc=datetime(2026, 8, 11, 15, 5, tzinfo=_UTC)),
    ]

    trades, _ = _recon(rows, live={"CRM", "PC"})

    paired = {o.group_ref: o.missing_from for o in trades[0].orders if not o.missing}
    assert paired == {"c1": [], "p1": [], "p2": ["CRM"]}
    # and the stand-in sits alongside, naming the system that DOES hold the record
    [gap] = [o for o in trades[0].orders if o.missing]
    assert (gap.system, gap.missing_from) == ("CRM", ["PC"])


def test_a_missing_filled_order_carries_at_least_one_missing_fill() -> None:
    """An order that filled did so through executions. A childless stand-in would
    read as "the order slip is missing but nothing was traded" -- the opposite."""
    trades, _ = _recon(
        [
            _row("PC", group_ref="o1"),
            _row("PC", txn_type="execution", group_ref="o1"),
        ]
    )

    stand_ins = [o for o in trades[0].orders if o.missing]
    assert sorted(o.system for o in stand_ins) == ["CRM", "IB"]
    # each one owns its fill gap -- and the real PC order keeps only its real fill
    assert all(len(o.executions) == 1 and o.executions[0].missing for o in stand_ins)
    real = next(o for o in trades[0].orders if not o.missing)
    assert [e.missing for e in real.executions] == [False]


def test_a_missing_filled_order_gets_its_fill_gap_even_when_fill_COUNTS_match() -> None:
    """The two grains are compared independently and count-wise, so a system can be
    short an ORDER while its fill count happens to equal its peers'. CRM has one
    order with two fills; PC has two orders with one fill each -- 2 fills either
    way, so the execution grain reports no deficit at all. The missing order still
    filled, so its stand-in must still show a missing fill."""
    rows = [
        _row("CRM", group_ref="c1"),
        _row("CRM", txn_type="execution", group_ref="c1"),
        _row("CRM", txn_type="execution", group_ref="c1"),
        _row("PC", group_ref="p1"),
        _row("PC", txn_type="execution", group_ref="p1"),
        _row("PC", group_ref="p2"),
        _row("PC", txn_type="execution", group_ref="p2"),
    ]

    trades, _ = _recon(rows, live={"CRM", "PC"})

    [stand_in] = [o for o in trades[0].orders if o.missing]
    assert stand_in.system == "CRM"
    assert len(stand_in.executions) == 1 and stand_in.executions[0].missing


def test_a_missing_order_on_an_order_grain_only_day_stays_childless() -> None:
    """No source published fills, so none can be missing -- inventing one would
    claim a gap the data cannot support."""
    trades, _ = _recon([_row("CRM"), _row("PC")])

    [stand_in] = [o for o in trades[0].orders if o.missing]
    assert stand_in.system == "IB"
    assert stand_in.executions == []


def test_partially_filled_pc_order_with_no_counterpart_is_missing() -> None:
    trades, _ = _recon([_row("PC", txn_type="execution", status="PartiallyFilled")])

    assert all(n.missing_from == ["CRM", "IB"] for n in _nodes(trades))


def test_unequal_fill_counts_report_the_short_source() -> None:
    """The order-393 duplicate-fill shape: PC carries more fills than IB.

    Quantities are split so the totals still agree -- isolating the row-count rule
    from the qty rule, which on the real order-393 data trips as well.
    """
    rows = [
        _row("PC", txn_type="execution", qty=Decimal("0.5")),
        _row("PC", txn_type="execution", qty=Decimal("0.5")),
        _row("CRM", txn_type="execution", qty=Decimal("1")),
        _row("IB", txn_type="execution", qty=Decimal("1")),
    ]
    trades, summary = _recon(rows)

    # each row names the systems short of a counterpart FOR IT -- never its own,
    # which has itself
    fills = {(n.system, tuple(n.missing_from)) for n in _nodes(trades) if n.txn_type == "execution"}
    assert fills == {("PC", ("CRM", "IB")), ("CRM", ("IB",)), ("IB", ("CRM",))}
    assert all("qty" not in n.breaks for n in _nodes(trades))
    assert summary.missing_by_system == {"CRM": 1, "IB": 1, "PC": 0}
    # the gap is at FILL grain: one empty execution per short system, nested under
    # that system's own order -- not an order-level gap.
    gaps = _placeholders(trades)
    assert sorted(g.system for g in gaps) == ["CRM", "IB"]
    assert all(g.txn_type == "execution" for g in gaps)
    assert all(g not in trades[0].orders for g in gaps)


def test_ib_manual_trade_is_reported_missing_on_pc_not_suppressed() -> None:
    """ActivityMonitor manual trades reach IB/CRM without passing through PC."""
    trades, summary = _recon([_row("IB"), _row("CRM")])

    assert all(n.missing_from == ["PC"] for n in _nodes(trades))
    assert summary.missing_by_system["PC"] == 1


def test_missing_by_system_counts_buckets_not_rows() -> None:
    """Two survivors of one absent counterpart are ONE missing record."""
    trades, summary = _recon([_row("PC"), _row("CRM")])

    assert len([n for n in _nodes(trades) if n.missing_from]) == 2  # two survivors annotated
    assert len(summary.missing_rows) == 1  # but only one record is missing
    assert summary.missing_by_system["IB"] == 1


def test_a_missing_order_is_not_counted_again_for_its_missing_fills() -> None:
    """IB has neither the order nor its fill; that is one absent record, not two."""
    rows = [
        _row("CRM"),
        _row("CRM", txn_type="execution"),
        _row("IB"),
        _row("IB", txn_type="execution"),
        _row("PC"),
        _row("PC", txn_type="execution"),
    ]
    rows = [r for r in rows if r.system != "IB"]
    _, summary = _recon(rows)

    assert summary.missing_by_system["IB"] == 1


# --- status: gates the missing check, never compared as a string --------------


def test_zero_fill_cancel_alone_is_exempt_from_missing() -> None:
    trades, summary = _recon([_row("PC", status="Canceled", qty=Decimal("0"), price=None)])

    node = _nodes(trades)[0]
    assert node.missing_from == []
    assert node.breaks == []
    assert summary.missing_rows == []


def test_zero_fill_cancel_with_a_broker_counterpart_breaks_on_status() -> None:
    """The broker filled what the engine believes it cancelled."""
    trades, summary = _recon(
        [_row("PC", status="Canceled", qty=Decimal("0"), price=None), _row("IB")]
    )

    assert all(n.breaks == ["status"] for n in _nodes(trades))
    assert summary.by_field == {"status": 1}
    assert summary.missing_rows == []  # the status break replaces the missing check


def test_cancelled_order_that_partially_filled_is_still_checked_for_missing() -> None:
    """The order-22|8 shape: Canceled, qty_abs=1, a real fee, and a genuine IB
    counterpart. Gating the exemption on the status string instead of on quantity
    would wrongly excuse this as 'never reached the broker'."""
    trades, summary = _recon([_row("PC", status="Canceled", qty=Decimal("1"))])

    assert _nodes(trades)[0].missing_from == ["CRM", "IB"]
    assert len(summary.missing_rows) == 2


# --- references ---------------------------------------------------------------


def test_every_summary_reference_resolves_to_a_node_and_refs_are_unique() -> None:
    rows = [
        _row("CRM", exchange="CBOE"),
        _row("IB", exchange="AMEX"),
        _row("CRM", txn_type="execution"),
        _row("PC", symbol="QQQ260828C00719000", descrpt="QQQ 28AUG26 719 C"),
    ]
    trades, summary = _recon(rows)

    refs = [n.ref for t in trades for o in t.orders for n in (o, *o.executions)]
    assert len(refs) == len(set(refs))
    assert set(summary.broken_rows) <= set(refs)
    assert set(summary.missing_rows) <= set(refs)
    assert summary.broken_rows and summary.missing_rows


def test_placeholders_do_not_move_the_trade_totals() -> None:
    trades, _ = _recon([_row("CRM"), _row("PC")])

    assert set(trades[0].by_system) == {"CRM", "PC"}  # no IB key invented
    assert trades[0].by_system["CRM"].qty == Decimal("1")


# --- degradation guard --------------------------------------------------------


def test_a_single_live_source_reconciles_nothing() -> None:
    rows = [_row("PC"), _row("PC", symbol="QQQ260828C00719000", descrpt="QQQ 28AUG26 719 C")]
    trades, summary = _recon(rows, {"PC"})

    assert all(not n.breaks and not n.missing_from for n in _nodes(trades))
    assert _placeholders(trades) == []
    assert summary.missing_by_system == {}


def test_a_degraded_source_is_never_reported_missing() -> None:
    """IB unconfigured must read identically to a CRM+PC-only day."""
    trades, summary = _recon([_row("CRM"), _row("PC")], {"CRM", "PC"})

    assert all(not n.missing_from for n in _nodes(trades))
    assert "IB" not in summary.missing_by_system
    assert summary.missing_rows == []


# --- the degenerate-split guard -----------------------------------------------


def test_one_order_per_system_never_reports_missing_on_every_system() -> None:
    """The 2026-08-11 QQQ 735 C defect: an expiry each system books on its own
    end-of-day clock (CRM 20:20 UTC, PC 01:24 the next day) fell outside the
    pairing window, so PC's half reported CRM+IB absent and CRM+IB's half
    reported PC absent -- six fabricated rows claiming ONE order was missing
    from all three systems at once, which cannot be true of an order that exists.
    """
    rows = [
        _row("CRM", group_ref="c1", txn_time_utc=datetime(2026, 8, 11, 20, 20, tzinfo=_UTC)),
        _row("IB", group_ref="i1", txn_time_utc=datetime(2026, 8, 11, 20, 20, tzinfo=_UTC)),
        _row("PC", group_ref="p1", txn_time_utc=datetime(2026, 8, 12, 1, 24, tzinfo=_UTC)),
    ]

    trades, summary = _recon(rows)

    assert _placeholders(trades) == []
    assert summary.missing_rows == []
    assert summary.missing_by_system == {"CRM": 0, "IB": 0, "PC": 0}


def test_the_guard_declines_when_a_system_holds_more_than_one_order() -> None:
    """Above one order per system the merge would be a guess about which pairs
    with which, so the split has to stand and the real gap stay reported."""
    rows = [
        _row("CRM", group_ref="c1", txn_time_utc=datetime(2026, 8, 11, 13, 30, tzinfo=_UTC)),
        _row("CRM", group_ref="c2", txn_time_utc=datetime(2026, 8, 11, 15, 5, tzinfo=_UTC)),
        _row("PC", group_ref="p1", txn_time_utc=datetime(2026, 8, 11, 13, 30, tzinfo=_UTC)),
    ]

    trades, summary = _recon(rows, live={"CRM", "PC"})

    assert [(p.system, p.txn_type) for p in _placeholders(trades)] == [("PC", "order")]
    assert summary.missing_by_system == {"CRM": 0, "PC": 1}


def test_the_guard_still_compares_the_orders_it_rejoins() -> None:
    """Merging is not suppressing: a real disagreement between the two halves is
    still reported -- as one break, not as six missing records."""
    rows = [
        _row("CRM", group_ref="c1", txn_time_utc=datetime(2026, 8, 11, 20, 20, tzinfo=_UTC)),
        _row("IB", group_ref="i1", txn_time_utc=datetime(2026, 8, 11, 20, 20, tzinfo=_UTC)),
        _row(
            "PC",
            group_ref="p1",
            qty=Decimal("7"),
            txn_time_utc=datetime(2026, 8, 12, 1, 24, tzinfo=_UTC),
        ),
    ]

    trades, summary = _recon(rows)

    assert _placeholders(trades) == []
    assert summary.by_field == {"qty": 1}
    assert trades[0].breaks == ["qty"]
