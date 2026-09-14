"""Tests for the unified CRM+IB+PC execution view (revived MOBO reconciliation).

Layer isolation: only imports from app/libs/reconciliation/, app/core/ib_flex.py,
app/core/flex_xml.py, app/schemas/unified_execution.py, app/models/, and
stdlib/pytest. Prefers pure, DB-free tests (row-mapper functions called
directly, DropFetcher against tmp_path); the few tests that need real rows use
the in-memory sqlite `session` fixture from conftest.py -- never the live
MariaDB.
"""

from __future__ import annotations

import shutil
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException

from app.core.ib_flex import DropFetcher, FlexRows, FlexUnavailable
from app.libs.reconciliation.sources._transform import et_to_utc, flip_fee
from app.libs.reconciliation.sources.crm import CrmSource
from app.libs.reconciliation.sources.crm import _row as crm_row
from app.libs.reconciliation.sources.ib import IbSource
from app.libs.reconciliation.sources.ib import _row as ib_row
from app.libs.reconciliation.sources.pc import _order_row, _trade_row
from app.libs.reconciliation.unified import build_view
from app.models.pc_data import PcOrder, PcTrade
from app.models.reconciliation import Order, Trade

REAL_DROP_ROOT = Path(r"C:\Users\JohnQin\Desktop\mega-crm-ib-flex")

# --- helpers ------------------------------------------------------------------


def _pc_order(**overrides: object) -> PcOrder:
    fields: dict[str, object] = dict(
        scope_key="s",
        source_run_id=1,
        lean_order_id=1,
        symbol="SPY   260828C00774000",
        account_id="A1",
        last_event_utc=datetime(2026, 8, 12, 1, 24, 2),
        latest_status="Filled",
        net_fill_quantity=Decimal("1"),
        gross_fill_quantity=Decimal("1"),
        weighted_average_fill_price=Decimal("1.50"),
        total_fee_usd=Decimal("1.05"),
        signed_premium_usd=Decimal("-150.00"),
        gross_premium_usd=Decimal("150.00"),
        modeled_cash_flow_before_fees_usd=Decimal("150.00"),
        modeled_cash_flow_after_fees_usd=Decimal("148.95"),
    )
    fields.update(overrides)
    return PcOrder(**fields)


def _pc_trade(**overrides: object) -> PcTrade:
    fields: dict[str, object] = dict(
        source_event_id="evt-1",
        source_run_id=1,
        lean_order_id=1,
        symbol="SPY   260828C00774000",
        account_id="A1",
        trade_date_et=date(2026, 8, 11),
        executed_at_utc=datetime(2026, 8, 12, 1, 24, 2),
        fill_status="Filled",
        side="BUY",
        fill_quantity_signed=Decimal("1"),
        fill_quantity_abs=Decimal("1"),
        fill_price=Decimal("1.50"),
        fee_usd=Decimal("1.05"),
        signed_premium_usd=Decimal("-150.00"),
        gross_premium_usd=Decimal("150.00"),
        modeled_cash_flow_before_fees_usd=Decimal("150.00"),
        modeled_cash_flow_after_fees_usd=Decimal("148.95"),
    )
    fields.update(overrides)
    return PcTrade(**fields)


def _crm_trade(**overrides: object) -> Trade:
    fields: dict[str, object] = dict(
        orderID="O1",
        execID="",
        tradeID="T123",
        dateTime="20260811;093001",
        orderTime="20260811;093000",
        tradeDate="20260811",
        symbol="SPY   260828C00774000",
        buySell="BUY",
        quantity=Decimal("1"),
        price=Decimal("1.50"),
        amount=Decimal("-150.00"),
        proceeds=Decimal("150.00"),
        netCash=Decimal("148.95"),
        commission=Decimal("-1.05"),  # IB raw convention: negative == a charge
    )
    fields.update(overrides)
    return Trade(**fields)


def _ib_fill(**overrides: str) -> dict[str, str]:
    fields: dict[str, str] = dict(
        orderID="O1",
        execID="",
        tradeID="T456",
        dateTime="20260811;093001",
        orderTime="20260811;093000",
        tradeDate="20260811",
        symbol="SPY   260828C00774000",
        buySell="BUY",
        quantity="1",
        price="1.50",
        amount="-150.00",
        proceeds="150.00",
        netCash="148.95",
        commission="-1.05",  # IB raw convention: negative == a charge
    )
    fields.update(overrides)
    return fields


class _FakeFetcher:
    """Minimal FlexFetcher stub for IbSource tests that don't need real XML."""

    def __init__(self, rows: FlexRows | None = None, *, unavailable: bool = False) -> None:
        self._rows = rows or FlexRows(orders=[], fills=[])
        self._unavailable = unavailable

    def days(self) -> list[date]:
        if self._unavailable:
            raise FlexUnavailable("unconfigured")
        return [date(2026, 8, 11)]

    def fetch(self, day: date) -> FlexRows:
        if self._unavailable:
            raise FlexUnavailable("unconfigured")
        return self._rows


# --- 1. pc_orders trade_date derivation ----------------------------------------


def test_pc_order_trade_date_derived_from_utc_instant_not_naive_date() -> None:
    order = _pc_order(last_event_utc=datetime(2026, 8, 12, 1, 24, 2))
    row = _order_row(order)
    # A naive .date() on the UTC instant would give 2026-08-12 -- wrong.
    assert row.trade_date == date(2026, 8, 11)


# --- 2. pc_trades keeps its own date --------------------------------------------


def test_pc_trade_keeps_own_trade_date_et_not_composed_from_order() -> None:
    trade = _pc_trade(
        trade_date_et=date(2026, 8, 11),
        executed_at_utc=datetime(2026, 8, 12, 1, 24, 2),
    )
    row = _trade_row(trade)
    assert row.trade_date == date(2026, 8, 11)
    assert row.txn_time_utc is not None
    assert row.txn_time_utc.date() == date(2026, 8, 12)


# --- 3. PartiallyFilled survives to status --------------------------------------


def test_pc_trade_partially_filled_status_survives() -> None:
    trade = _pc_trade(fill_status="PartiallyFilled")
    row = _trade_row(trade)
    assert row.status == "PartiallyFilled"


# --- 4. cash identities, parametrized over all three sources -------------------


def _cash_identity_row(system: str) -> tuple[Decimal | None, Decimal | None, Decimal | None]:
    if system == "PC":
        row = _trade_row(_pc_trade())
    elif system == "CRM":
        row = crm_row(
            _crm_trade(),
            grain="execution",
            ts_primary="20260811;093001",
            ts_fallback="20260811;093000",
        )
    else:  # IB
        row = ib_row(
            _ib_fill(),
            grain="execution",
            ts_primary="20260811;093001",
            ts_fallback="20260811;093000",
        )
    return row.trade_amt, row.fee, row.settlement_amt


@pytest.mark.parametrize("system", ["PC", "CRM", "IB"])
def test_cash_identities_hold_to_1e4(system: str) -> None:
    # trade_amt/fee/settlement_amt are the surviving fields; the removed
    # intermediates (premium_signed/cash_before_fees) are algebraically
    # trade_amt == -premium_signed == cash_before_fees, so this is the same
    # identity restated: settlement_amt == trade_amt - fee.
    trade_amt, fee, settlement_amt = _cash_identity_row(system)
    assert trade_amt is not None and fee is not None and settlement_amt is not None
    assert abs(settlement_amt - (trade_amt - fee)) < Decimal("0.0001")
    # Concrete regression against the fixtures (all three sources share the
    # same economics: gross premium 150.00, fee 1.05, net 148.95).
    assert trade_amt == Decimal("150.00")
    assert settlement_amt == Decimal("148.95")


# --- 4b. descrpt / asset_class / exchange, per source ---------------------------


def test_descrpt_falls_back_to_osi_strip_when_option_legs_unset() -> None:
    # None of the fixtures set the decomposed option legs, so descrpt() falls
    # back to the osi-stripped symbol for all three sources.
    assert _order_row(_pc_order()).descrpt == "SPY260828C00774000"
    crm = crm_row(_crm_trade(), grain="execution", ts_primary="20260811;093001", ts_fallback=None)
    assert crm.descrpt == "SPY260828C00774000"
    ib = ib_row(_ib_fill(), grain="execution", ts_primary="20260811;093001", ts_fallback=None)
    assert ib.descrpt == "SPY260828C00774000"


def test_descrpt_composes_from_option_legs_when_present() -> None:
    order = _pc_order(
        underlying_symbol="SPY",
        option_expiry=date(2026, 8, 20),
        option_right="C",
        strike_price=Decimal("766.0000"),
    )
    assert _order_row(order).descrpt == "SPY 20AUG26 766 C"

    crm = crm_row(
        _crm_trade(underlyingSymbol="SPY", expiry="20260820", putCall="C", strike=Decimal("766")),
        grain="execution",
        ts_primary="20260811;093001",
        ts_fallback=None,
    )
    assert crm.descrpt == "SPY 20AUG26 766 C"

    ib = ib_row(
        _ib_fill(underlyingSymbol="SPY", expiry="20260820", putCall="C", strike="766"),
        grain="execution",
        ts_primary="20260811;093001",
        ts_fallback=None,
    )
    assert ib.descrpt == "SPY 20AUG26 766 C"


def test_asset_class_opt_call_from_pc_and_ib_crm_spellings() -> None:
    order = _pc_order(security_type="equity_option", option_right="C")
    assert _order_row(order).asset_class == "OPT-CALL"

    crm = crm_row(
        _crm_trade(assetCategory="OPT", putCall="C"),
        grain="execution",
        ts_primary="20260811;093001",
        ts_fallback=None,
    )
    assert crm.asset_class == "OPT-CALL"

    ib = ib_row(
        _ib_fill(assetCategory="OPT", putCall="C"),
        grain="execution",
        ts_primary="20260811;093001",
        ts_fallback=None,
    )
    assert ib.asset_class == "OPT-CALL"


def test_exchange_null_on_pc_populated_on_ib_and_crm() -> None:
    assert _order_row(_pc_order()).exchange is None
    assert _trade_row(_pc_trade()).exchange is None

    crm = crm_row(
        _crm_trade(exchange="CBOE"),
        grain="execution",
        ts_primary="20260811;093001",
        ts_fallback=None,
    )
    assert crm.exchange == "CBOE"

    ib = ib_row(
        _ib_fill(exchange="CBOE"),
        grain="execution",
        ts_primary="20260811;093001",
        ts_fallback=None,
    )
    assert ib.exchange == "CBOE"


# --- 5. fee is signed; rebates preserved ----------------------------------------


def test_flip_fee_positive_commission_becomes_negative_fee_rebate() -> None:
    # IB/CRM raw commission is a positive rebate credit here -> fee must be negative.
    assert flip_fee(Decimal("0.5306")) == Decimal("-0.5306")
    # Do NOT assert fee >= 0 anywhere -- that is false on real rebate rows.


def test_crm_rebate_row_yields_negative_fee_not_clamped_to_zero() -> None:
    trade = _crm_trade(
        commission=Decimal("0.5306"), proceeds=Decimal("6.0000"), netCash=Decimal("6.5306")
    )
    row = crm_row(trade, grain="execution", ts_primary="20260811;093001", ts_fallback=None)
    assert row.fee == Decimal("-0.5306")


# --- 6. ref never empty; tradeID beats execID -----------------------------------


def test_crm_source_rows_bookTrade_null_execid_still_yields_one_fill(session) -> None:
    # ref (the row's own natural key, tradeID-over-execID) was dropped from
    # UnifiedExecutionRow -- see the ponytail note in sources/crm.py. This
    # test now only confirms a BookTrade row (NULL execID) still surfaces as
    # exactly one fill row, not the tradeID-preference itself.
    order = Order(
        orderID="O1",
        dateTime="20260811;093000",
        orderTime="20260811;093000",
        tradeDate="20260811",
        symbol="SPY   260828C00774000",
    )
    trade = Trade(
        orderID="O1",
        execID=None,  # NULL execID, e.g. a BookTrade row
        tradeID="T123",
        dateTime="20260811;093001",
        orderTime="20260811;093000",
        tradeDate="20260811",
        symbol="SPY   260828C00774000",
    )
    session.add_all([order, trade])
    session.commit()

    source = CrmSource(session)
    rows = source.rows(date(2026, 8, 11))
    fill_rows = [r for r in rows if r.txn_type == "execution"]
    assert len(fill_rows) == 1


def test_ib_source_rows_bookTrade_null_execid_still_yields_one_fill() -> None:
    # See the ponytail note in sources/ib.py -- ref (tradeID-over-execID) was
    # dropped from the row; this only confirms the fill still surfaces once.
    order = _ib_fill(execID="", tradeID="")  # reuse shape for the order dict too
    order["orderID"] = "O1"
    fill = _ib_fill(execID="", tradeID="T456")
    fetcher = _FakeFetcher(FlexRows(orders=[order], fills=[fill]))
    source = IbSource(fetcher)
    rows = source.rows(date(2026, 8, 11))
    fill_rows = [r for r in rows if r.txn_type == "execution"]
    assert len(fill_rows) == 1


# --- 7. DropFetcher.days() against a real tmp_path tree -------------------------


@pytest.mark.skipif(
    not REAL_DROP_ROOT.exists(),
    reason="mega-crm-ib-flex sample drop tree not present on this machine",
)
def test_drop_fetcher_days_finds_and_sorts_dates(tmp_path: Path) -> None:
    src_aug = REAL_DROP_ROOT / "drop" / "trade-confirm" / "2026" / "08" / "ib_trades_20260811.xml"
    src_sep = REAL_DROP_ROOT / "drop" / "trade-confirm" / "2026" / "09" / "ib_trades_20260901.xml"
    assert src_aug.is_file() and src_sep.is_file()

    dst_aug = tmp_path / "drop" / "trade-confirm" / "2026" / "08"
    dst_sep = tmp_path / "drop" / "trade-confirm" / "2026" / "09"
    dst_aug.mkdir(parents=True)
    dst_sep.mkdir(parents=True)
    shutil.copy2(src_aug, dst_aug / "ib_trades_20260811.xml")
    shutil.copy2(src_sep, dst_sep / "ib_trades_20260901.xml")

    fetcher = DropFetcher(str(tmp_path))
    assert fetcher.days() == [date(2026, 9, 1), date(2026, 8, 11)]  # newest first


# --- 8. DropFetcher with unset/nonexistent root ---------------------------------


def test_drop_fetcher_unset_root_raises_flex_unavailable() -> None:
    with pytest.raises(FlexUnavailable):
        DropFetcher(None)


def test_drop_fetcher_nonexistent_root_raises_flex_unavailable(tmp_path: Path) -> None:
    with pytest.raises(FlexUnavailable):
        DropFetcher(str(tmp_path / "does-not-exist"))


# --- 9. degradation: partial source failure ------------------------------------


def test_build_view_degrades_unconfigured_ib_with_one_warning_no_raise(
    session, monkeypatch
) -> None:
    monkeypatch.setattr(
        "app.libs.reconciliation.unified.get_fetcher",
        lambda: DropFetcher(None),
    )
    out = build_view(session, day=date(2026, 8, 11), systems=["CRM", "IB"], grain=None)
    assert out.warnings == ["IB: source unavailable"]
    for w in out.warnings:
        assert "\\" not in w and "/" not in w  # no filesystem path
        assert "Traceback" not in w and "Exception" not in w  # no exception detail


# --- 10. 502 when every requested source fails ----------------------------------


def test_build_view_502_when_every_requested_source_fails(session, monkeypatch) -> None:
    monkeypatch.setattr(
        "app.libs.reconciliation.unified.get_fetcher",
        lambda: DropFetcher(None),
    )
    with pytest.raises(HTTPException) as exc_info:
        build_view(session, day=date(2026, 8, 11), systems=["IB"], grain=None)
    assert exc_info.value.status_code == 502


# --- 11. ordering: each order immediately followed by its own fills ------------


def test_build_view_orders_each_order_followed_by_its_own_fills(session) -> None:
    o1 = Order(
        orderID="O1", dateTime="20260811;093000", orderTime="20260811;093000",
        tradeDate="20260811", symbol="AAA",
    )
    o2 = Order(
        orderID="O2", dateTime="20260811;100000", orderTime="20260811;100000",
        tradeDate="20260811", symbol="BBB",
    )
    t1a = Trade(
        orderID="O1", execID="E1A", tradeID="E1A", dateTime="20260811;093001",
        orderTime="20260811;093000", tradeDate="20260811", symbol="AAA",
    )
    t1b = Trade(
        orderID="O1", execID="E1B", tradeID="E1B", dateTime="20260811;093002",
        orderTime="20260811;093000", tradeDate="20260811", symbol="AAA",
    )
    t2a = Trade(
        orderID="O2", execID="E2A", tradeID="E2A", dateTime="20260811;100001",
        orderTime="20260811;100000", tradeDate="20260811", symbol="BBB",
    )
    session.add_all([o1, o2, t1a, t1b, t2a])
    session.commit()

    out = build_view(session, day=date(2026, 8, 11), systems=["CRM"], grain=None)
    seq = [(r.txn_type, r.group_ref) for r in out.rows]
    # Walk the sequence: every "execution" must immediately follow an "order" (or
    # another fill) sharing the same group_ref -- i.e. each order's own fills
    # are contiguous with it, never interleaved with another order's rows.
    order_positions = {ref: i for i, (grain, ref) in enumerate(seq) if grain == "order"}
    for i, (grain, ref) in enumerate(seq):
        if grain == "execution":
            assert ref in order_positions
            order_idx = order_positions[ref]
            block = seq[order_idx : i + 1]
            assert all(g_ref == ref for _g, g_ref in block)


# --- 12. DST -------------------------------------------------------------------


def test_et_to_utc_dst_summer_edt() -> None:
    got = et_to_utc(datetime(2026, 8, 11, 9, 30))
    assert got == datetime(2026, 8, 11, 13, 30, tzinfo=ZoneInfo("UTC"))


def test_et_to_utc_dst_winter_est() -> None:
    got = et_to_utc(datetime(2026, 11, 11, 9, 30))
    assert got == datetime(2026, 11, 11, 14, 30, tzinfo=ZoneInfo("UTC"))
