"""Importer: IB Flex XML -> MariaDB. Handles both Flex query types.

The IB Flex export comes in two shapes, distinguished by the ``type`` attribute
on the root ``<FlexQueryResponse>`` element:

    type="AF"  (Activity)           <Trades> section          -> table ``ib_activity``
    type="TCF" (Trade Confirmation) <TradeConfirms> section   -> table ``ib_trades``

The two share many columns but differ in naming (e.g. ``ibOrderID``/``orderID``,
``tradePrice``/``price``, ``ibCommission``/``commission``) and in which columns
exist at all, so each routes to its own table whose schema matches that file.
This importer reads the root type and picks the right target automatically — you
do not pass the file type, and passing the wrong-shaped file is detected (its
attributes will not match the target schema and are reported).

Within either file only the ``ORDER`` and ``EXECUTION`` levelOfDetail rows are
loaded; aggregate rows (``ASSET_SUMMARY`` / ``SYMBOL_SUMMARY``) are skipped. The
``levelOfDetail`` column is kept so the order/execution split is recoverable.

Conventions (unchanged from prompt 006):
  * Empty attribute value ("") -> SQL NULL.
  * Surrogate PK ``id`` = uuid4 per row; ``ingested_at`` defaults.
  * Statement-level header attributes (period / fromDate / toDate /
    whenGenerated) live on ``<FlexStatement>``; they are merged into every row
    (the row's own value wins if present).
  * replace mode clears ONLY the target table before loading, so re-running
    yields exactly the file's contents with no duplicates. append (default)
    keeps existing rows. Both run in a single transaction (DELETE, not TRUNCATE,
    so a failed insert rolls back cleanly).

Usage:
    .venv/Scripts/python.exe -m scripts.import_activity_xml.run \
        --xml "C:/path/to/ib_activity_20260615.xml"     # -> ib_activity
    .venv/Scripts/python.exe -m scripts.import_activity_xml.run \
        --xml "C:/path/to/ib_trades_20260610.xml"        # -> ib_trades

    ... --mode replace   # clear the target table first
    ... --dry-run        # parse + report only, touch nothing
"""

from __future__ import annotations

import argparse
import uuid
import xml.etree.ElementTree as ET
from collections import Counter
from dataclasses import dataclass
from typing import cast

from sqlalchemy import Table, text

from app.core.database import engine
from app.models.reconciliation import IBActivity, IBTrade

# Only these two detail levels are loaded; everything else is skipped.
_KEEP_LEVELS = ("ORDER", "EXECUTION")

# Header attributes carried on <FlexStatement> that are real row columns too.
_STATEMENT_HEADER_KEYS = ("period", "fromDate", "toDate", "whenGenerated")


@dataclass(frozen=True)
class _FileSpec:
    """How to handle one Flex query type."""

    label: str  # human name for messages
    table: Table  # target SQLAlchemy table
    valid_columns: frozenset[str]  # source columns this table accepts


def _spec_for(model) -> tuple[str, _FileSpec]:
    table = cast(Table, model.__table__)
    valid = frozenset(table.columns.keys()) - {"id", "ingested_at"}
    return table.name, _FileSpec(label=table.name, table=table, valid_columns=valid)


# Root FlexQueryResponse type -> handling spec.
_ACTIVITY_NAME, _ACTIVITY_SPEC = _spec_for(IBActivity)
_TRADES_NAME, _TRADES_SPEC = _spec_for(IBTrade)
_TYPE_TO_SPEC: dict[str, _FileSpec] = {
    "AF": _ACTIVITY_SPEC,
    "TCF": _TRADES_SPEC,
}


def _row_from_attrs(
    attrs: dict[str, str], header: dict[str, str], valid: frozenset[str]
) -> dict[str, object]:
    """Build an insert mapping from one element's attributes.

    Merges statement header keys (row value wins), filters to known columns,
    converts "" -> None, and stamps a fresh surrogate id.
    """
    merged: dict[str, str] = {}
    for key in _STATEMENT_HEADER_KEYS:
        if key in header:
            merged[key] = header[key]
    merged.update(attrs)

    row: dict[str, object] = {
        key: (value if value != "" else None)
        for key, value in merged.items()
        if key in valid
    }
    # Uuid(native_uuid=False) expects a UUID object; its bind processor
    # serializes to a 32-char hex string itself.
    row["id"] = uuid.uuid4()
    return row


def _detect_type(xml_path: str) -> str:
    """Read the ``type`` attribute off the root <FlexQueryResponse> element."""
    for _event, elem in ET.iterparse(xml_path, events=("start",)):
        if elem.tag == "FlexQueryResponse":
            file_type = elem.attrib.get("type", "")
            if file_type not in _TYPE_TO_SPEC:
                raise SystemExit(
                    f"Unknown/unsupported FlexQueryResponse type={file_type!r}. "
                    f"Expected one of {sorted(_TYPE_TO_SPEC)}."
                )
            return file_type
    raise SystemExit("No <FlexQueryResponse> root element found — not a Flex export.")


def parse(
    xml_path: str, spec: _FileSpec
) -> tuple[list[dict[str, object]], Counter, set[str]]:
    """Stream-parse the XML for ORDER/EXECUTION rows targeting ``spec.table``.

    Returns (rows, level_counts, unknown_attr_names). Memory stays flat: each
    record element is cleared right after it is read.
    """
    rows: list[dict[str, object]] = []
    counts: Counter = Counter()
    unknown: set[str] = set()
    header: dict[str, str] = {}

    for event, elem in ET.iterparse(xml_path, events=("start", "end")):
        if event == "start":
            if elem.tag == "FlexStatement":
                header = dict(elem.attrib)
            continue

        # event == "end"
        level = elem.attrib.get("levelOfDetail")
        if level is not None:
            counts[level] += 1
            if level in _KEEP_LEVELS:
                unknown.update(
                    set(elem.attrib)
                    - spec.valid_columns
                    - set(_STATEMENT_HEADER_KEYS)
                )
                rows.append(_row_from_attrs(elem.attrib, header, spec.valid_columns))
            elem.clear()

    return rows, counts, unknown


def load(
    rows: list[dict[str, object]], table: Table, *, mode: str, batch_size: int
) -> int:
    """Insert parsed rows into ``table``. ``replace`` clears it first.

    Single transaction, so a failure rolls back cleanly and never leaves the
    table empty. DELETE (transactional), not TRUNCATE (implicit-commit DDL).
    """
    with engine.begin() as conn:
        if mode == "replace":
            conn.execute(text(f"DELETE FROM `{table.name}`"))
        for start in range(0, len(rows), batch_size):
            conn.execute(table.insert(), rows[start : start + batch_size])
    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--xml", required=True, help="Path to an IB Flex XML file (AF or TCF)."
    )
    parser.add_argument(
        "--mode",
        choices=("replace", "append"),
        default="append",
        help="append (default): keep existing rows. replace: clear the target table first.",
    )
    parser.add_argument("--batch-size", type=int, default=1000)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and report only; do not touch the database.",
    )
    args = parser.parse_args()

    file_type = _detect_type(args.xml)
    spec = _TYPE_TO_SPEC[file_type]
    rows, counts, unknown = parse(args.xml, spec)

    print(f"Parsed {args.xml}")
    print(f"  FlexQueryResponse type={file_type} -> table `{spec.table.name}`")
    for level, n in sorted(counts.items()):
        routed = f" -> {spec.table.name}" if level in _KEEP_LEVELS else " (skipped)"
        print(f"  levelOfDetail={level:<14} {n:>6}{routed}")
    if unknown:
        print(
            f"  WARNING: dropped {len(unknown)} attribute(s) not in `{spec.table.name}` "
            f"schema: {sorted(unknown)}"
        )

    if args.dry_run:
        print("Dry run — database untouched.")
        return

    inserted = load(rows, spec.table, mode=args.mode, batch_size=args.batch_size)
    print(f"Inserted (mode={args.mode}):")
    print(f"  {spec.table.name:<12} {inserted:>6}")

    # Assert read == inserted so a silent drop never passes unnoticed.
    assert inserted == len(rows)
    print("OK: rows read == rows inserted.")


if __name__ == "__main__":
    main()
