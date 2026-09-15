"""Cross-system break detection over the assembled unified rows.

Pure and DB-free: takes the rows ``build_view`` already collected plus the set of
sources that actually loaded, annotates each row in place, and returns the roll-up.
Lives beside ``unified.py`` rather than under ``sources/`` because it consumes
``UnifiedExecutionRow``, not source tables.

Matching is on CONTENT. No identifier is shared across the three systems -- see
``unified_view_mapping.md`` §5: PC's ``ib_brokerage_ids`` are small integers, IB's
are hex strings, and "Literal values never compare". Adding the real IB ``orderID``
to PC fill records remains the highest-value schema change available; until then a
content key is the only thing there is.
"""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import TYPE_CHECKING

from app.schemas.unified_execution import ReconSummary

if TYPE_CHECKING:
    from app.schemas.unified_execution import UnifiedExecutionRow

# Compared value-by-value across systems. Deliberately absent:
#   descrpt / trade_date / direction -- they are in the match key instead, so a
#     disagreement there surfaces as a missing-record pair on both sides.
#   price -- a rounded 9dp weighted average; the schema says compare with
#     tolerance, never ==, so an equality check would be pure noise.
#   trade_amt / fee / settlement_amt -- pass-through of each source's own figure
#     by design; the whole point is that they may legitimately differ.
_COMPARED = ("exchange", "currency", "asset_class")

_Key = tuple[object, ...]


def _key(row: UnifiedExecutionRow) -> _Key:
    # ponytail: `account` is single-valued (U17935787) across today's extract and
    # IB's statementAccountId is identical, so it does not discriminate yet -- it
    # is in the key for the first multi-account day. That day is the one to
    # re-verify: if the namespaces ever diverge, every bucket splits and the whole
    # view reads "missing everywhere".
    return (row.account, row.descrpt, row.trade_date, row.direction, row.txn_type)


def _zero_fill_cancel(row: UnifiedExecutionRow) -> bool:
    """A PC row cancelled before any fill -- it never reached the broker.

    Gates on QUANTITY, never on the status string. Of the 13 Canceled PC orders in
    the reference extract 12 are zero-fill, but order 22|8 is Canceled with
    qty_abs=1 and a real 1.0506 fee and DOES have an IB counterpart -- so a
    status=='Canceled' test alone would wrongly excuse a genuine missing record.
    `unified_view_mapping.md` §7 check 8: "Do not assert that a Canceled order has
    no fills."

    Judged PER ROW, not per bucket: a cancelled order and a filled one for the same
    contract/date/direction share a match key, and asking whether the whole bucket
    is cancelled would un-exempt the real cancels because of their filled sibling.
    """
    return row.status == "Canceled" and not row.qty


def _qty_sum(rows: list[UnifiedExecutionRow]) -> Decimal:
    # Summed, not compared row-by-row: at execution grain one order's partial fills
    # all land in the same bucket, and only the total is comparable across systems.
    # At order grain the bucket holds one row, so the sum is that row.
    return sum((r.qty for r in rows if r.qty is not None), Decimal(0))


def reconcile(rows: list[UnifiedExecutionRow], live: set[str]) -> ReconSummary:
    """Annotate `rows` in place with breaks/missing_from; return the roll-up."""
    summary = ReconSummary(broken_rows=0, missing_rows=0, by_field={}, missing_by_system={})
    if len(live) < 2:
        # Nothing to reconcile against. Reporting "missing on IB" when IB simply
        # failed to load would be a lie -- `warnings` already covers that case.
        return summary

    buckets: defaultdict[_Key, defaultdict[str, list[UnifiedExecutionRow]]] = defaultdict(
        lambda: defaultdict(list)
    )
    for row in rows:
        buckets[_key(row)][row.system].append(row)

    by_field: defaultdict[str, int] = defaultdict(int)
    missing_by_system = {s: 0 for s in sorted(live)}

    for by_sys in buckets.values():
        members = [r for source_rows in by_sys.values() for r in source_rows]
        # Zero-fill cancels are expected to exist on PC alone, so they take no part
        # in the counts, the comparisons, or the annotations -- a cancel sharing a
        # bucket with a genuinely missing record must not itself read as missing.
        live_rows = {
            s: [r for r in source_rows if not _zero_fill_cancel(r)]
            for s, source_rows in by_sys.items()
        }
        checked = [r for source_rows in live_rows.values() for r in source_rows]

        if by_sys.get("PC") and not live_rows.get("PC") and any(live_rows.values()):
            # PC's only content here is cancelled-before-fill, yet another system
            # reports a trade: the broker filled what the engine believes it
            # cancelled. The one thing `status` can say across systems.
            for r in members:
                r.breaks.append("status")
            by_field["status"] += 1
            continue

        # One rule covers both "source has no rows at all" and "source has fewer
        # rows than its peers" -- the latter is what catches the known order-393
        # duplicate-fill defect, where PC carries more fills than IB.
        widest = max(len(live_rows.get(s, [])) for s in live)
        short = sorted(s for s in live if len(live_rows.get(s, [])) < widest)
        if short:
            for r in checked:
                r.missing_from = short
            for s in short:
                missing_by_system[s] += 1

        for field in _COMPARED:
            # Compared as a SET PER SYSTEM, never as one pooled set: an order's
            # fills legitimately span several venues, and pooling would read that
            # intra-system spread as a cross-system disagreement. CRM reporting
            # {EMERALD, GEMINI} against IB's {EMERALD, GEMINI} is a match.
            per_system = {
                frozenset(v for r in source_rows if (v := getattr(r, field)) is not None)
                for system, source_rows in live_rows.items()
                # PC has no venue column at all, so its structural null must not
                # read as a disagreement -- `exchange` is a CRM<->IB check.
                if source_rows and not (field == "exchange" and system == "PC")
            }
            if len(per_system - {frozenset()}) > 1:
                for r in checked:
                    r.breaks.append(field)
                by_field[field] += 1

        if len({_qty_sum(rs) for rs in live_rows.values() if rs}) > 1:
            for r in checked:
                r.breaks.append("qty")
            by_field["qty"] += 1

    summary.broken_rows = sum(1 for r in rows if r.breaks)
    summary.missing_rows = sum(1 for r in rows if r.missing_from)
    summary.by_field = dict(by_field)
    summary.missing_by_system = missing_by_system
    return summary
