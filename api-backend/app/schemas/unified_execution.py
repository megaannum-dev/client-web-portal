from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict

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
    grain: Literal["order", "execution"]
    # This row's own natural key, stringified. Per-source: CRM and IB both
    # orderID/tradeID — the two systems carry the same Flex TCF schema, so they
    # key identically (NOT execID: it is NULL/empty on every BookTrade expiry
    # row, which would leave those rows with no identity at all); PC
    # f"{source_run_id}|{lean_order_id}" for orders (composite is mandatory,
    # lean_order_id restarts at 1 every run) / source_event_id for fills.
    ref: str
    # The parent order's key — fill rows nest under their order via this.
    group_ref: str

    # ---- instrument & context ----
    contract: str  # OSI symbol, whitespace stripped (both IB and PC pad to 21 chars)
    underlying: str | None
    expiry: date | None
    right: str | None  # 'C' | 'P'
    strike: Decimal | None
    multiplier: Decimal | None
    security_type: str | None  # normalised to 'equity_option'
    currency: str | None
    account: str | None

    # ---- time ----
    event_ts_utc: datetime | None  # true instant, tz-aware UTC
    # ET session date — the column day-scoping filters use. Legitimately
    # disagrees with event_ts_utc near midnight ET (e.g. an expiry stamped
    # 2026-08-12 01:24Z is trade_date 2026-08-11). Never derive one from the
    # other with a naive .date() — go through the source's own ET conversion.
    trade_date: date | None

    # ---- economics ----
    direction: Literal["BUY", "SELL"] | None
    qty_signed: Decimal | None
    qty_abs: Decimal | None  # carry both; abs(signed) == abs held in-sample but is not guaranteed
    # Fill price, or the quantity-weighted average at order grain (not last/nominal).
    # None on PC zero-fill cancelled orders. A rounded figure — compare with tolerance, never ==.
    price: Decimal | None
    premium_signed: Decimal | None
    premium_gross: Decimal | None
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
    # The real invariant is the cash identity below, which holds on every row.
    fee: Decimal | None
    # Derived identities that must hold to 1e-4 in every source:
    #   cash_before_fees == -premium_signed
    #   cash_after_fees  == cash_before_fees - fee
    cash_before_fees: Decimal | None
    cash_after_fees: Decimal | None

    # Not a cross-system attribute. Real values only from PC ('Filled' /
    # 'Canceled' at order grain, 'Filled' / 'PartiallyFilled' at execution
    # grain).
    # For IB and CRM this is the structural literal 'Filled' — asserting "a
    # row exists therefore it executed"; IB has no lifecycle column at all.
    # Downstream UI should mark or grey this for non-PC rows.
    status: str | None


class UnifiedExecutionsViewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    day: date | None
    days: list[date]  # newest first
    rows: list[UnifiedExecutionRow]
    warnings: list[str]  # degraded sources; fixed messages only, never str(exc)
