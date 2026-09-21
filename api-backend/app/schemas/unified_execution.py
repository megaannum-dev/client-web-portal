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
    # Cross-system MATCH KEY: osi_strip(contract), e.g. 'SPY260820C00766000'.
    # Not for display -- see `descrpt` for that.
    symbol: str | None
    descrpt: str | None  # DISPLAY ONLY now: derived 'SPY 20AUG26 766 C', or osi_strip/underlying fallback
    # 'exchange or listingExchange'. PC has no venue column at all -- a null
    # here for a PC row is structural, not a data gap.
    exchange: str | None
    currency: str | None
    # RAW vendor values between the source and build_view -- e.g. PC's
    # 'equity_option'/'C' vs IB's 'OPT'/'C'. Normalized to canonical
    # ('OPT', 'CALL') only at the reconciliation layer (unified.py), via
    # `asset_class()`, so every source has reported before the fold happens.
    asset_cat: str | None
    sub_cat: str | None

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


# ---- Nested view: Trade -> Order -> Execution --------------------------------
# The rows above are the SOURCE-facing contract (each mapper emits a flat list,
# each order followed by its own fills). The wire contract is the tree below,
# folded from those rows by app/libs/reconciliation/_tree.py. A Trade spans all
# three systems; the Orders beneath it stay system-scoped.


class _Node(UnifiedExecutionRow):
    # Stable within one response and across a refetch of the same day -- the fold
    # assigns it, never the mappers. Executions carry no identity of their own on
    # the wire, so theirs is positional within their order (see _tree._exec_ref).
    ref: str
    trade_ref: str  # the trade this node hangs under

    # True = a synthesized placeholder standing in for a record this system does
    # NOT have. Every economic field is None on one; it exists so the gap renders
    # in place and is referenceable from ReconSummary.missing_rows -- never to be
    # summed, compared, or counted as a real record.
    missing: bool = False


class ExecutionNode(_Node):
    pass


class OrderNode(_Node):
    executions: list[ExecutionNode] = Field(default_factory=list)


class TradeTotals(BaseModel):
    """One system's contribution to a trade. Never summed ACROSS systems."""

    model_config = ConfigDict(from_attributes=True)

    qty: Decimal | None
    # Quantity-weighted average over that system's order rows -- not a mean, and
    # not the last price. Verified equivalent to the same average recomputed from
    # the executions (86/86 orders, 76/76 trade-grain buckets, august_ib_data).
    # A rounded figure on every source; compare with tolerance, never ==.
    price: Decimal | None
    trade_amt: Decimal | None
    fee: Decimal | None  # signed, as on the rows: positive = charge. Do NOT abs().
    settlement_amt: Decimal | None


class TradeNode(BaseModel):
    """Orders grouped by (account, symbol, trade date, side), across systems.

    This IS the grain IB itself publishes as `SymbolSummary`
    (accountId + symbol + tradeDate + buySell).
    """

    model_config = ConfigDict(from_attributes=True)

    ref: str
    account: str | None
    symbol: str | None
    descrpt: str | None
    trade_date: date | None
    direction: Literal["BUY", "SELL"] | None
    # Canonical here (post-fold): every row this trade groups has already
    # passed through build_view's asset_class() call before build_trades runs.
    asset_cat: str | None
    sub_cat: str | None

    # Per system, because qty across systems is the SAME trade counted three
    # times, not a bigger trade. Absent key = that system has no rows here.
    # exchange/status/currency are deliberately not here: they legitimately
    # differ per system and stay on the order/execution nodes.
    by_system: dict[str, TradeTotals] = Field(default_factory=dict)

    # Mirrors the order-grain annotation of the orders beneath it.
    breaks: list[str] = Field(default_factory=list)
    missing_from: list[str] = Field(default_factory=list)

    orders: list[OrderNode] = Field(default_factory=list)


class ReconSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    # References into the tree, not a scoreboard -- a client jumps straight to
    # what disagrees. Counts remain available as len(). Which field disagreed is
    # on the referenced node's own `breaks`.
    broken_rows: list[str]  # refs of order/execution nodes carrying >=1 break
    missing_rows: list[str]  # refs of the synthesized `missing=True` placeholders
    by_field: dict[str, int]  # 'qty' -> 3, 'exchange' -> 1, ... — open, not fixed buckets
    # 'CRM' | 'IB' | 'PC' -> records absent there. Counts MATCH SLOTS, not rows: a
    # slot holding a PC and a CRM order but no IB one is a single missing record,
    # not two. A slot is one order paired across the systems by time order within
    # its trade (see _reconcile._slots), so a trade with two orders can report two.
    # Keyed only on live systems, so a degraded source is absent rather than a false 0.
    missing_by_system: dict[str, int]


class UnifiedExecutionsViewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    day: date | None
    days: list[date]  # newest first
    trades: list[TradeNode]
    warnings: list[str]  # degraded sources; fixed messages only, never str(exc)
    recon: ReconSummary
