"""Tests for the cross-system break engine (app/libs/reconciliation/_reconcile.py).

Pure and DB-free by construction -- `reconcile()` takes already-built rows, so these
build `UnifiedExecutionRow` directly rather than going through a source mapper or the
sqlite `session` fixture.

Note every row factory sets `account`: it is part of the match key, so rows with a
None account would bucket separately from rows with one and every test would read
"missing everywhere".
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from app.libs.reconciliation._reconcile import reconcile
from app.schemas.unified_execution import UnifiedExecutionRow

ALL = {"CRM", "IB", "PC"}
_UTC = ZoneInfo("UTC")


def _row(system: str, **overrides: object) -> UnifiedExecutionRow:
    """One reconcilable row. Defaults match across systems, so any break in a test
    comes from that test's overrides and nothing else."""
    fields: dict[str, object] = dict(
        system=system,
        account="U17935787",
        txn_type="order",
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


# --- the happy path -----------------------------------------------------------


def test_clean_three_way_match_reports_nothing() -> None:
    rows = [_row("CRM"), _row("IB"), _row("PC")]

    summary = reconcile(rows, ALL)

    assert all(not r.breaks and not r.missing_from for r in rows)
    assert summary.broken_rows == 0
    assert summary.missing_rows == 0
    assert summary.by_field == {}
    assert summary.missing_by_system == {"CRM": 0, "IB": 0, "PC": 0}


def test_pc_null_exchange_is_not_an_exchange_break() -> None:
    """PC's null venue is structural, so `exchange` is effectively a CRM<->IB check."""
    rows = [_row("CRM"), _row("IB"), _row("PC", exchange=None)]

    reconcile(rows, ALL)

    assert all("exchange" not in r.breaks for r in rows)


# --- field breaks -------------------------------------------------------------


def test_exchange_disagreement_between_crm_and_ib_breaks() -> None:
    rows = [_row("CRM", exchange="CBOE"), _row("IB", exchange="AMEX"), _row("PC")]

    summary = reconcile(rows, ALL)

    assert all(r.breaks == ["exchange"] for r in rows)
    assert summary.by_field == {"exchange": 1}
    assert summary.broken_rows == 3


def test_qty_sum_disagreement_breaks() -> None:
    rows = [_row("CRM"), _row("IB"), _row("PC", qty=Decimal("2"))]

    summary = reconcile(rows, ALL)

    assert all("qty" in r.breaks for r in rows)
    assert summary.by_field["qty"] == 1


def test_currency_and_asset_class_are_compared() -> None:
    rows = [_row("CRM"), _row("IB", currency="CAD", asset_class="OPT-PUT"), _row("PC")]

    summary = reconcile(rows, ALL)

    assert summary.by_field == {"currency": 1, "asset_class": 1}


# --- missing records ----------------------------------------------------------


def test_pc_only_filled_order_is_missing_on_both_other_systems() -> None:
    """The most serious break this screen reports: the engine believes it traded
    and the broker has no record of it."""
    rows = [_row("PC")]

    summary = reconcile(rows, ALL)

    assert rows[0].missing_from == ["CRM", "IB"]
    assert summary.missing_rows == 1
    assert summary.missing_by_system == {"CRM": 1, "IB": 1, "PC": 0}


def test_partially_filled_pc_order_with_no_counterpart_is_missing() -> None:
    rows = [_row("PC", txn_type="execution", status="PartiallyFilled")]

    reconcile(rows, ALL)

    assert rows[0].missing_from == ["CRM", "IB"]


def test_unequal_fill_counts_report_the_short_source(
) -> None:
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

    summary = reconcile(rows, ALL)

    assert all(r.missing_from == ["CRM", "IB"] for r in rows)
    assert all("qty" not in r.breaks for r in rows)
    assert summary.missing_by_system == {"CRM": 1, "IB": 1, "PC": 0}


def test_ib_manual_trade_is_reported_missing_on_pc_not_suppressed() -> None:
    """ActivityMonitor manual trades reach IB/CRM without passing through PC."""
    rows = [_row("IB"), _row("CRM")]

    summary = reconcile(rows, ALL)

    assert all(r.missing_from == ["PC"] for r in rows)
    assert summary.missing_by_system["PC"] == 1


def test_missing_by_system_counts_buckets_not_rows() -> None:
    """Two survivors of one absent counterpart are ONE missing record."""
    rows = [_row("PC"), _row("CRM")]

    summary = reconcile(rows, ALL)

    assert summary.missing_rows == 2  # two rows carry the annotation
    assert summary.missing_by_system["IB"] == 1  # but only one record is missing


# --- status: gates the missing check, never compared as a string --------------


def test_zero_fill_cancel_alone_is_exempt_from_missing() -> None:
    rows = [_row("PC", status="Canceled", qty=Decimal("0"), price=None)]

    summary = reconcile(rows, ALL)

    assert rows[0].missing_from == []
    assert rows[0].breaks == []
    assert summary.missing_rows == 0


def test_zero_fill_cancel_with_a_broker_counterpart_breaks_on_status() -> None:
    """The broker filled what the engine believes it cancelled."""
    rows = [_row("PC", status="Canceled", qty=Decimal("0"), price=None), _row("IB")]

    summary = reconcile(rows, ALL)

    assert all(r.breaks == ["status"] for r in rows)
    assert summary.by_field == {"status": 1}


def test_cancelled_order_that_partially_filled_is_still_checked_for_missing() -> None:
    """The order-22|8 shape: Canceled, qty_abs=1, a real fee, and a genuine IB
    counterpart. Gating the exemption on the status string instead of on quantity
    would wrongly excuse this as 'never reached the broker'."""
    rows = [_row("PC", status="Canceled", qty=Decimal("1"))]

    summary = reconcile(rows, ALL)

    assert rows[0].missing_from == ["CRM", "IB"]
    assert summary.missing_rows == 1


# --- degradation guard --------------------------------------------------------


def test_a_single_live_source_reconciles_nothing() -> None:
    rows = [_row("PC"), _row("PC", descrpt="QQQ 28AUG26 719 C")]

    summary = reconcile(rows, {"PC"})

    assert all(not r.breaks and not r.missing_from for r in rows)
    assert summary.missing_by_system == {}


def test_a_degraded_source_is_never_reported_missing() -> None:
    """IB unconfigured must read identically to a CRM+PC-only day."""
    rows = [_row("CRM"), _row("PC")]

    summary = reconcile(rows, {"CRM", "PC"})

    assert all(not r.missing_from for r in rows)
    assert "IB" not in summary.missing_by_system
    assert summary.missing_rows == 0
