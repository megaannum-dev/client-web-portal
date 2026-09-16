"""Cross-system break detection over the assembled trade tree.

Pure and DB-free: takes the trades ``build_view`` folded plus the set of sources
that actually loaded, annotates the nodes in place, and returns the roll-up.
Lives beside ``unified.py`` rather than under ``sources/`` because it consumes
the wire contract, not source tables.

Matching is on CONTENT. No identifier is shared across the three systems -- see
``unified_view_mapping.md`` §5: PC's ``ib_brokerage_ids`` are small integers, IB's
are hex strings, and "Literal values never compare". Adding the real IB ``orderID``
to PC fill records remains the highest-value schema change available; until then a
content key is the only thing there is.

That key has two levels. ``_tree`` groups records into trades on
(account, descrpt, trade_date, direction); within a trade, orders are paired
ACROSS systems by time PROXIMITY -- see ``_slots``. Comparison then happens
between paired orders rather than over the trade as a whole, which is what keeps
one system's extra order from contaminating the orders that agree.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import timedelta
from decimal import Decimal
from typing import TYPE_CHECKING, TypeVar

from app.schemas.unified_execution import ExecutionNode, OrderNode, ReconSummary

if TYPE_CHECKING:
    from collections.abc import Mapping
    from datetime import datetime

    from app.schemas.unified_execution import TradeNode, _Node

# Compared value-by-value across systems. Deliberately absent:
#   descrpt / trade_date / direction / account -- they are the trade key instead, so a
#     disagreement there surfaces as a missing-record pair on both sides.
#   price -- a rounded weighted average; the schema says compare with
#     tolerance, never ==, so an equality check would be pure noise.
#   trade_amt / fee / settlement_amt -- pass-through of each source's own figure
#     by design; the whole point is that they may legitimately differ.
_COMPARED = ("exchange", "currency", "asset_class")

# Slotting preserves the node type it was handed: order slots hold OrderNodes.
_N = TypeVar("_N", bound="_Node")


def _zero_fill_cancel(row: _Node) -> bool:
    """A PC row cancelled before any fill -- it never reached the broker.

    Gates on QUANTITY, never on the status string. Of the 13 Canceled PC orders in
    the reference extract 12 are zero-fill, but order 22|8 is Canceled with
    qty_abs=1 and a real 1.0506 fee and DOES have an IB counterpart -- so a
    status=='Canceled' test alone would wrongly excuse a genuine missing record.
    `unified_view_mapping.md` §7 check 8: "Do not assert that a Canceled order has
    no fills."

    Judged PER ROW, not per bucket: a cancelled order and a filled one for the same
    contract/date/direction share a trade, and asking whether the whole bucket is
    cancelled would un-exempt the real cancels because of their filled sibling.
    """
    return row.status == "Canceled" and not row.qty


def _qty_sum(rows: list[_Node]) -> Decimal:
    # Summed, not compared row-by-row: one order's partial fills all land in the
    # same bucket and the sources split them differently -- IB reports a fill per
    # venue where PC may report one aggregate -- so only the total is comparable.
    return sum((r.qty for r in rows if r.qty is not None), Decimal(0))


def _time_key(r: _Node) -> tuple[bool, datetime | None, str]:
    # Nulls last; group_ref breaks ties so the pairing is stable across refetches.
    return (r.txn_time_utc is None, r.txn_time_utc, r.group_ref)


# How far apart two systems' timestamps may be and still be the same order.
# The sources agree on the instant to within a second or two but not exactly, so
# some slack is required; distinct orders on one contract sit minutes apart, so
# it must stay well under that. Widen it if a source starts reporting a lag, and
# narrow it if two genuinely different orders ever pair.
_PAIR_WINDOW = timedelta(seconds=60)


def _gap(a: _Node, b: _Node) -> timedelta:
    # No timestamp on one side: nothing to judge distance on, so treat them as
    # co-located and let the caller fall back to time ORDER.
    if a.txn_time_utc is None or b.txn_time_utc is None:
        return timedelta(0)
    return abs(a.txn_time_utc - b.txn_time_utc)


def _slots(by_sys: dict[str, list[_N]]) -> list[dict[str, _N]]:
    """Pair each system's records with their nearest counterpart in time.

    A slot is one such pairing -- the finest match key available -- and a system
    missing from a slot is missing that record.

    Matched by PROXIMITY, not by rank. Zipping each system's i-th earliest
    record works only while every system holds the same records: on 2026-08-25
    PC carried an extra 12:33:04 order that CRM and IB never saw, so PC's
    *earliest* was the unmatched one and rank-pairing compared it against the
    12:44:46 orders the other two did have -- reporting a quantity break on
    three rows that agreed, and a missing record against the wrong one.

    So the earliest unassigned record anchors a slot and each other system joins
    it with its nearest record, if that falls inside `_PAIR_WINDOW`. Anything
    beyond the window is a different order and opens its own slot -- unless that
    leaves every system in a slot of its own, which the guard at the bottom treats
    as the matcher failing rather than as records missing everywhere.
    """
    pending = {s: sorted(rows, key=_time_key) for s, rows in by_sys.items() if rows}
    slots: list[dict[str, _N]] = []
    while any(pending.values()):
        anchor_sys = min(
            (s for s, rows in pending.items() if rows), key=lambda s: _time_key(pending[s][0])
        )
        anchor = pending[anchor_sys].pop(0)
        slot = {anchor_sys: anchor}
        for system, rows in pending.items():
            if system == anchor_sys or not rows:
                continue
            # ties go to the earliest, since `rows` is time-sorted
            nearest = min(rows, key=lambda r: _gap(anchor, r))
            if _gap(anchor, nearest) > _PAIR_WINDOW:
                continue
            # Mutual-nearest gate. Anchoring on the globally earliest record is
            # not enough on its own: if this system's record is CLOSER to a
            # later record of the anchor's own system, that later one is its
            # real counterpart and the anchor would be stealing the pairing.
            # CRM holding a stale 14:00:00 order plus the real 14:00:45 one,
            # against IB's single 14:00:44, paired IB to the stale order 44s
            # away and left the 1s-apart true match reported missing on both
            # sides -- a false break from the matcher meant to remove them.
            rival = min(pending[anchor_sys], key=lambda r: _gap(nearest, r), default=None)
            if rival is not None and _gap(nearest, rival) < _gap(anchor, nearest):
                continue
            slot[system] = nearest
            # By identity, never `list.remove`: `_Node` is a Pydantic model with
            # field-based equality, so two value-identical rows would let
            # `remove` drop a different object than the one `min` picked.
            rows[:] = [r for r in rows if r is not nearest]
        slots.append(slot)

    # Degenerate-split guard. Time is the ONLY discriminator inside a trade
    # bucket -- every other field is a compare field, and a field used to match
    # can never be reported as a break -- so when the systems disagree about
    # which instant to stamp, the matcher has nothing to fall back on and splits
    # one order into single-system slots. Each half then reports the other
    # half's systems absent, turning one disagreement into six fabricated
    # missing records and a `missing_by_system` that claims an order is missing
    # from all three systems at once -- which cannot be true of an order that
    # exists.
    #
    # When no system holds more than one order here, the bucket key (account,
    # descrpt, trade_date, direction) has already asserted these ARE the same
    # trade, so any split is a matcher artifact and there is exactly one way to
    # rejoin it. Above one order per system the merge would be a guess about
    # which pairs with which, so the guard declines and the split stands.
    #
    # Deliberately NOT a wider `_PAIR_WINDOW`: the gaps seen run to five hours
    # (each system books an expiry on its own end-of-day clock) while genuinely
    # distinct orders sit three seconds apart, so no window separates them.
    if len(slots) > 1 and all(len(rows) <= 1 for rows in by_sys.values()):
        merged: dict[str, _N] = {}
        for slot in slots:
            merged.update(slot)
        return [merged]
    return slots


def _compare_pair(
    slot: Mapping[str, _Node],
    live: set[str],
    by_field: defaultdict[str, int],
) -> tuple[list[str], list[str]]:
    """Annotate one matched set of orders in place.

    Returns (breaks, the live systems with no order in this slot).
    """
    absent = sorted(s for s in live if s not in slot)
    rows = list(slot.values())
    for r in rows:
        # Never a row's own system -- it has itself. `absent` cannot contain it.
        r.missing_from = absent
    breaks: list[str] = []

    for field in _COMPARED:
        values = {
            v
            for system, r in slot.items()
            # PC has no venue column at all, so its structural null must not read
            # as a disagreement -- `exchange` is a CRM<->IB check.
            if not (field == "exchange" and system == "PC") and (v := getattr(r, field)) is not None
        }
        if len(values) > 1:
            for r in rows:
                r.breaks.append(field)
            by_field[field] += 1
            breaks.append(field)

    # Compared value-to-value, not as a bucket sum: these orders are counterparts
    # of each other, so a difference between them is a real disagreement about
    # the same order rather than the arithmetic shadow of a missing one.
    quantities = {r.qty for r in rows if r.qty is not None}
    if len(quantities) > 1:
        for r in rows:
            r.breaks.append("qty")
        by_field["qty"] += 1
        breaks.append("qty")

    return breaks, absent


def _compare_fills(
    by_sys: Mapping[str, list[_Node]],
    live: set[str],
    by_field: defaultdict[str, int],
) -> dict[str, int]:
    """Annotate the fills under one matched set of orders in place.

    Fills are compared as a SET, not paired like their orders: the sources split
    an order into executions differently -- IB reports one per venue where PC may
    report a single aggregate -- so the count and the total are comparable but the
    i-th fill of one is not the i-th fill of another.

    Returns how many fills each system is short by.
    """
    live_rows = {
        s: [r for r in rows if not r.missing and not _zero_fill_cancel(r)]
        for s, rows in by_sys.items()
    }
    checked = [r for rows in live_rows.values() for r in rows]

    # One rule covers both "source has no fills at all" and "source has fewer
    # fills than its peers" -- the latter is what catches the known order-393
    # duplicate-fill defect, where PC carries more fills than IB.
    #
    # It is also the sole owner of "a missing filled order carries at least one
    # missing fill": a system absent from the slot has no fills here, so its
    # deficit is the full `widest` and its order stand-in gets that many fill
    # stand-ins. A second explicit guarantee upstream was redundant.
    widest = max(len(live_rows.get(s, [])) for s in live)
    deficits = {
        s: widest - len(live_rows.get(s, []))
        for s in sorted(live)
        if widest - len(live_rows.get(s, [])) > 0
    }
    short = sorted(deficits)
    for r in checked:
        r.missing_from = [s for s in short if s != r.system]

    for field in _COMPARED:
        # Compared as a SET PER SYSTEM, never as one pooled set: an order's
        # fills legitimately span several venues, and pooling would read that
        # intra-system spread as a cross-system disagreement. CRM reporting
        # {EMERALD, GEMINI} against IB's {EMERALD, GEMINI} is a match.
        per_system = {
            frozenset(v for r in rows if (v := getattr(r, field)) is not None)
            for system, rows in live_rows.items()
            if rows and not (field == "exchange" and system == "PC")
        }
        if len(per_system - {frozenset()}) > 1:
            for r in checked:
                r.breaks.append(field)
            by_field[field] += 1

    # Only when nothing is short. A sum over differently-sized sets is not a
    # comparable: if a system is missing a fill its total is lower BECAUSE of that
    # fill, and the gap is already reported as the missing record itself.
    if not short and len({_qty_sum(rs) for rs in live_rows.values() if rs}) > 1:
        for r in checked:
            r.breaks.append("qty")
        by_field["qty"] += 1

    return deficits


def _placeholder(
    trade: TradeNode, system: str, grain: str, ref: str, present: list[str]
) -> OrderNode | ExecutionNode:
    """An empty stand-in for a record `system` does not have.

    Every economic field is None -- the point is to make the gap renderable in
    place and referenceable from the summary, not to invent a value for it.
    """
    cls = OrderNode if grain == "order" else ExecutionNode
    return cls(
        system=system,  # type: ignore[arg-type]
        account=trade.account,
        txn_type=grain,  # type: ignore[arg-type]
        descrpt=trade.descrpt,
        exchange=None,
        currency=None,
        asset_class=trade.asset_class,
        trade_date=trade.trade_date,
        direction=trade.direction,
        price=None,
        qty=None,
        trade_amt=None,
        fee=None,
        settlement_amt=None,
        status=None,
        txn_time_utc=None,
        group_ref="",
        ref=ref,
        trade_ref=trade.ref,
        missing=True,
        missing_from=present,
    )


def _cancelled_but_traded(
    orders_by_sys: Mapping[str, list[_N]], live_orders: Mapping[str, list[_N]]
) -> bool:
    """PC's only content here is cancelled-before-fill, yet another system reports
    a trade: the broker filled what the engine believes it cancelled. The one thing
    `status` can say across systems."""
    return bool(orders_by_sys.get("PC")) and not live_orders.get("PC") and any(live_orders.values())


def reconcile(trades: list[TradeNode], live: set[str]) -> ReconSummary:
    """Annotate `trades` in place with breaks and missing placeholders; return the roll-up."""
    summary = ReconSummary(broken_rows=[], missing_rows=[], by_field={}, missing_by_system={})
    if len(live) < 2:
        # Nothing to reconcile against. Reporting "missing on IB" when IB simply
        # failed to load would be a lie -- `warnings` already covers that case.
        return summary

    by_field: defaultdict[str, int] = defaultdict(int)
    missing_by_system = {s: 0 for s in sorted(live)}

    for trade in trades:
        orders_by_sys: defaultdict[str, list[OrderNode]] = defaultdict(list)
        for o in trade.orders:
            orders_by_sys[o.system].append(o)
        live_orders = {
            s: [o for o in rows if not o.missing and not _zero_fill_cancel(o)]
            for s, rows in orders_by_sys.items()
        }

        if _cancelled_but_traded(orders_by_sys, live_orders):
            for rows in orders_by_sys.values():
                for o in rows:
                    o.breaks.append("status")
            by_field["status"] += 1
            trade.breaks = ["status"]
            # No placeholders: the cancel explains the gap, so calling it a
            # missing record too would report one fact twice.
            continue

        trade_breaks: list[str] = []
        trade_short: set[str] = set()

        for i, slot in enumerate(_slots(live_orders)):
            breaks, absent = _compare_pair(slot, live, by_field)
            trade_breaks += breaks
            trade_short |= set(absent)
            for s in absent:
                missing_by_system[s] += 1

            # Fills are compared WITHIN this matched set of orders, never across
            # the whole trade: scoped this way, an order only one system carries
            # keeps its fills in its own slot instead of skewing the counts and
            # totals of the orders that do match.
            # `trade.breaks` mirrors the ORDER grain only, per the schema: a fill
            # break is visible on the fill, and the FE rolls it up for display.
            fills: dict[str, list[_Node]] = {s: list(o.executions) for s, o in slot.items()}
            fill_deficits = _compare_fills(fills, live, by_field)
            # A short fill count is its own missing record (the order-393
            # duplicate-fill shape: the orders match, the fills do not) -- but only
            # when this slot was NOT already short for that system, otherwise one
            # absent order and its absent fills would count twice.
            for s in fill_deficits:
                if s not in absent:
                    missing_by_system[s] += 1

            # Materialized only after BOTH comparisons, so a placeholder can never
            # become an input to one.
            present = sorted(slot)
            stand_ins: dict[str, OrderNode] = {}
            for s in absent:
                ref = f"O|{s}|missing|{trade.ref}|{i}"
                stand_in = _placeholder(trade, s, "order", ref, present)
                trade.orders.append(stand_in)  # type: ignore[arg-type]
                stand_ins[s] = stand_in  # type: ignore[assignment]
            for s, n in fill_deficits.items():
                # The order stand-in wins when this system is short at BOTH grains:
                # the fills are missing BECAUSE the order is. Hanging them off a
                # real order instead makes one that reconciles read as broken.
                parent = stand_ins.get(s) or slot.get(s)
                if parent is None:
                    continue
                for k in range(n):
                    ref = f"E|{s}|missing|{trade.ref}|{i}|{k}"
                    parent.executions.append(
                        _placeholder(trade, s, "execution", ref, present)  # type: ignore[arg-type]
                    )

        trade.breaks = sorted(set(trade_breaks))
        trade.missing_from = sorted(trade_short)

    for trade in trades:
        for o in trade.orders:
            for node in (o, *o.executions):
                if node.missing:
                    summary.missing_rows.append(node.ref)
                elif node.breaks:
                    summary.broken_rows.append(node.ref)

    summary.by_field = dict(by_field)
    summary.missing_by_system = missing_by_system
    return summary
