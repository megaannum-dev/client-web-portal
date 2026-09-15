"""Cross-system break detection over the assembled trade tree.

Pure and DB-free: takes the trades ``build_view`` folded plus the set of sources
that actually loaded, annotates the nodes in place, and returns the roll-up.
Lives beside ``unified.py`` rather than under ``sources/`` because it consumes
the wire contract, not source tables.

Matching is on CONTENT. No identifier is shared across the three systems -- see
``unified_view_mapping.md`` §5: PC's ``ib_brokerage_ids`` are small integers, IB's
are hex strings, and "Literal values never compare". Adding the real IB ``orderID``
to PC fill records remains the highest-value schema change available; until then a
content key is the only thing there is. That key is the trade node itself
(account, descrpt, trade_date, direction) -- ``_tree`` already grouped by it, so
this module compares buckets rather than re-deriving them.
"""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import TYPE_CHECKING

from app.schemas.unified_execution import ExecutionNode, OrderNode, ReconSummary

if TYPE_CHECKING:
    from app.schemas.unified_execution import TradeNode, _Node

# Compared value-by-value across systems. Deliberately absent:
#   descrpt / trade_date / direction / account -- they are the trade key instead, so a
#     disagreement there surfaces as a missing-record pair on both sides.
#   price -- a rounded weighted average; the schema says compare with
#     tolerance, never ==, so an equality check would be pure noise.
#   trade_amt / fee / settlement_amt -- pass-through of each source's own figure
#     by design; the whole point is that they may legitimately differ.
_COMPARED = ("exchange", "currency", "asset_class")


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
    # Summed, not compared row-by-row: at execution grain one order's partial fills
    # all land in the same bucket, and only the total is comparable across systems.
    # At order grain the bucket usually holds one row, so the sum is that row.
    return sum((r.qty for r in rows if r.qty is not None), Decimal(0))


def _compare(
    by_sys: dict[str, list[_Node]],
    live: set[str],
    by_field: defaultdict[str, int],
) -> tuple[list[str], list[str], dict[str, int]]:
    """Annotate one bucket in place.

    Returns (breaks, systems short of the widest, how many records each is short by).
    """
    members = [r for rows in by_sys.values() for r in rows]
    # Zero-fill cancels are expected to exist on PC alone, so they take no part
    # in the counts, the comparisons, or the annotations -- a cancel sharing a
    # bucket with a genuinely missing record must not itself read as missing.
    # `missing` placeholders are output, never input: they are excluded too.
    live_rows = {
        s: [r for r in rows if not r.missing and not _zero_fill_cancel(r)]
        for s, rows in by_sys.items()
    }
    checked = [r for rows in live_rows.values() for r in rows]
    breaks: list[str] = []

    if by_sys.get("PC") and not live_rows.get("PC") and any(live_rows.values()):
        # PC's only content here is cancelled-before-fill, yet another system
        # reports a trade: the broker filled what the engine believes it
        # cancelled. The one thing `status` can say across systems.
        for r in members:
            r.breaks.append("status")
        by_field["status"] += 1
        return ["status"], [], {}

    # One rule covers both "source has no rows at all" and "source has fewer
    # rows than its peers" -- the latter is what catches the known order-393
    # duplicate-fill defect, where PC carries more fills than IB.
    widest = max(len(live_rows.get(s, [])) for s in live)
    deficits = {
        s: widest - len(live_rows.get(s, []))
        for s in sorted(live)
        if widest - len(live_rows.get(s, [])) > 0
    }
    short = sorted(deficits)
    if short:
        for r in checked:
            r.missing_from = short

    for field in _COMPARED:
        # Compared as a SET PER SYSTEM, never as one pooled set: an order's
        # fills legitimately span several venues, and pooling would read that
        # intra-system spread as a cross-system disagreement. CRM reporting
        # {EMERALD, GEMINI} against IB's {EMERALD, GEMINI} is a match.
        per_system = {
            frozenset(v for r in rows if (v := getattr(r, field)) is not None)
            for system, rows in live_rows.items()
            # PC has no venue column at all, so its structural null must not
            # read as a disagreement -- `exchange` is a CRM<->IB check.
            if rows and not (field == "exchange" and system == "PC")
        }
        if len(per_system - {frozenset()}) > 1:
            for r in checked:
                r.breaks.append(field)
            by_field[field] += 1
            breaks.append(field)

    if len({_qty_sum(rs) for rs in live_rows.values() if rs}) > 1:
        for r in checked:
            r.breaks.append("qty")
        by_field["qty"] += 1
        breaks.append("qty")

    return breaks, short, deficits


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
        orders_by_sys: defaultdict[str, list[_Node]] = defaultdict(list)
        execs_by_sys: defaultdict[str, list[_Node]] = defaultdict(list)
        for o in trade.orders:
            orders_by_sys[o.system].append(o)
            execs_by_sys[o.system].extend(o.executions)

        breaks, short, deficits = _compare(dict(orders_by_sys), live, by_field)
        trade.breaks = breaks
        trade.missing_from = short
        for s in short:
            missing_by_system[s] += 1

        _, _, exec_deficits = _compare(dict(execs_by_sys), live, by_field)
        # A short fill count is its own missing record (the order-393
        # duplicate-fill shape: the orders match, the fills do not) -- but only
        # when the order grain was NOT already short for that system, otherwise
        # one absent order and its absent fills would count twice.
        for s in exec_deficits:
            if s not in short:
                missing_by_system[s] += 1

        # Materialized only after BOTH comparisons, so a placeholder can never
        # become an input to one.
        present = sorted(s for s in live if s not in short)
        for s, n in deficits.items():
            for i in range(n):
                trade.orders.append(
                    _placeholder(trade, s, "order", f"O|{s}|missing|{trade.ref}|{i}", present)  # type: ignore[arg-type]
                )
        for s, n in exec_deficits.items():
            # ponytail: attached to that system's first order in the trade -- the
            # gap belongs to the bucket, not to any one order. Revisit only if the
            # FE needs a fill gap pinned to a specific parent.
            parent = next((o for o in trade.orders if o.system == s), None)
            if parent is None:
                continue
            for i in range(n):
                parent.executions.append(
                    _placeholder(trade, s, "execution", f"E|{s}|missing|{trade.ref}|{i}", present)  # type: ignore[arg-type]
                )

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
