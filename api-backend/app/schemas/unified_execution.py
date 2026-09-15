from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# ---- Unified three-source execution view -------------------------------------
# One row shape for executions pulled from CRM (portal `orders`/`trades` tables),
# IB (Interactive Brokers Flex report `orders`/`trades` sheets) and PC (the
# `pc_orders`/`pc_trades` engine landing tables), at either order or fill grain.
# This is the contract the per-source mappers populate and the API returns as-is
# — see C:\Users\JohnQin\Desktop\pc_mock_data\analysis\unified_view_mapping.md
# (§2 schema, §3 per-column transform) for the full column-by-column mapping,
# sign conventions and verified invariants this model encodes.


class UnifiedExecutionRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    # ---- identity / bookkeeping ----
    system: Literal["CRM", "IB", "PC"]
    account: str | None
    txn_type: Literal["order", "execution"]
    descrpt: str | None  # derived: 'SPY 20AUG26 766 C', or osi_strip/underlying fallback
    # 'exchange or listingExchange'. PC has no venue column at all -- a null
    # here for a PC row is structural, not a data gap.
    exchange: str | None
    currency: str | None
    asset_class: str | None  # derived: 'OPT-CALL' / 'OPT-PUT' / bare category

    # ---- time ----
    # ET session date — the column day-scoping filters use. Legitimately
    # disagrees with txn_time_utc near midnight ET (e.g. an expiry stamped
    # 2026-08-12 01:24Z is trade_date 2026-08-11). Never derive one from the
    # other with a naive .date() — go through the source's own ET conversion.
    trade_date: date | None

    # ---- economics ----
    direction: Literal["BUY", "SELL"] | None
    # Fill price, or the quantity-weighted average at order grain (not last/nominal).
    # None on PC zero-fill cancelled orders. A rounded figure — compare with tolerance, never ==.
    price: Decimal | None
    qty: Decimal | None
    trade_amt: Decimal | None
    # Signed: POSITIVE = a charge, NEGATIVE = a rebate/credit. IB stores
    # commission as a negative charge, so the IB/CRM mappers sign-flip
    # (fee = -commission) and a positive IB commission correctly becomes a
    # negative fee.
    #
    # Do NOT abs() this. Rebates are real and verified on live data: 22 CRM
    # rows and 1 PC fill carry one, all SELL rows where netCash EXCEEDS
    # proceeds (e.g. proceeds 6.0000, netCash 6.5306, commission +0.5306).
    # Mapping doc §7 check 3 asserts `fee >= 0` on all 446 rows — that holds
    # only for its narrow Aug-2026 extract, NOT for the full dataset.
    # The real invariant is the cash identity, asserted in the mapper tests
    # (test_unified.py) rather than encoded on the wire.
    fee: Decimal | None
    # settlement_amt == trade_amt(signed) - fee, per source; see the mapper
    # tests (test_unified.py) for the identity check -- the signed
    # intermediate (formerly cash_before_fees) no longer travels on the wire.
    settlement_amt: Decimal | None

    # Not a cross-system attribute. Real values only from PC ('Filled' /
    # 'Canceled' at order grain, 'Filled' / 'PartiallyFilled' at execution
    # grain).
    # For IB and CRM this is the structural literal 'Filled' — asserting "a
    # row exists therefore it executed"; IB has no lifecycle column at all.
    # Downstream UI should mark or grey this for non-PC rows.
    status: str | None
    txn_time_utc: datetime | None  # true instant, tz-aware UTC

    # The parent order's key — fill rows nest under their order via this.
    # Kept on the wire but never rendered.
    group_ref: str

    # ---- reconciliation output (app/libs/reconciliation/_reconcile.py) ----
    # Both empty when the row reconciles, and on every row when fewer than two
    # sources loaded (nothing to reconcile against).
    breaks: list[str] = Field(default_factory=list)  # wire field names that disagree
    # Live systems carrying no counterpart for this row's match key. Never names a
    # source that failed to load — that is what `warnings` is for.
    missing_from: list[str] = Field(default_factory=list)


class ReconSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    broken_rows: int  # rows carrying at least one entry in `breaks`
    missing_rows: int  # rows carrying at least one entry in `missing_from`
    by_field: dict[str, int]  # 'qty' -> 3, 'exchange' -> 1, ... — open, not fixed buckets
    # 'CRM' | 'IB' | 'PC' -> records absent there. Counts match-key BUCKETS, not rows:
    # a bucket holding a PC and a CRM row but no IB row leaves both survivors carrying
    # missing_from=['IB'], and counting rows would report 2 for one missing record.
    # Keyed only on live systems, so a degraded source is absent rather than a false 0.
    missing_by_system: dict[str, int]


class UnifiedExecutionsViewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    day: date | None
    days: list[date]  # newest first
    rows: list[UnifiedExecutionRow]
    warnings: list[str]  # degraded sources; fixed messages only, never str(exc)
    recon: ReconSummary
