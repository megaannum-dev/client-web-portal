"""Parses IB Flex XML/CSV exports into row buckets split by levelOfDetail.

Handles both Flex query schemas (auto-detected per file):
  AF  (Activity Flex)       -- 9 columns have different names; aliased to TCF names.
  TCF (Trade Confirm Flex)  -- column names match the ORM directly.

levelOfDetail routing:
  ORDER          -> orders          (unique on orderID)
  EXECUTION      -> trades          (unique on execID)
  SYMBOL_SUMMARY -> symbol_summaries (dedup on symbol+tradeDate+buySell)
  ASSET_SUMMARY  (skipped)

Pure parsing only — no DB access. Used by both the CLI importer
(scripts/import_activity_xml/run.py) and the app's IB source-adapter module.
"""

from __future__ import annotations

import csv
import uuid
import xml.etree.ElementTree as ET
from collections import Counter
from typing import cast

from sqlalchemy import Table

from app.models.reconciliation import Order, SymbolSummary, Trade

# levelOfDetail values that route to each table
ORDER_LEVELS = frozenset({"ORDER"})
EXECUTION_LEVELS = frozenset({"EXECUTION"})
SUMMARY_LEVELS = frozenset({"SYMBOL_SUMMARY"})
KEEP_LEVELS = ORDER_LEVELS | EXECUTION_LEVELS | SUMMARY_LEVELS

# Header attributes on <FlexStatement> that are also row columns.
_STATEMENT_HEADER_KEYS = ("period", "fromDate", "toDate", "whenGenerated")

# AF column name -> TCF column name (8 renames; everything else is unchanged).
# NOTE: AF also has its own native "tradeID" attribute (same name as the TCF
# column, so it needs no alias and passes through as-is). "transactionID" is
# a *different* AF attribute that must NOT be aliased onto "tradeID" — doing
# so overwrites the correct native tradeID with transactionID's value
# whenever both are present on the same row (transactionID appears to vary
# between report regenerations for the same trade; tradeID does not).
AF_TO_TCF: dict[str, str] = {
    "ibOrderID": "orderID",
    "ibExecID": "execID",
    "tradePrice": "price",
    "tradeMoney": "amount",
    "ibCommission": "commission",
    "ibCommissionCurrency": "commissionCurrency",
    "settleDateTarget": "settleDate",
    "taxes": "tax",
}

_ORDERS_TABLE: Table = cast(Table, Order.__table__)
_TRADES_TABLE: Table = cast(Table, Trade.__table__)
_SUMMARIES_TABLE: Table = cast(Table, SymbolSummary.__table__)

_ORDERS_VALID = frozenset(_ORDERS_TABLE.columns.keys()) - {"id", "ingested_at"}
_TRADES_VALID = frozenset(_TRADES_TABLE.columns.keys()) - {"id", "ingested_at"}
_SUMMARIES_VALID = frozenset(_SUMMARIES_TABLE.columns.keys()) - {"id", "ingested_at"}


def detect_type(xml_path: str) -> str:
    for _event, elem in ET.iterparse(xml_path, events=("start",)):
        if elem.tag == "FlexQueryResponse":
            file_type = elem.attrib.get("type", "")
            if file_type not in ("AF", "TCF"):
                raise SystemExit(
                    f"Unknown FlexQueryResponse type={file_type!r}. Expected 'AF' or 'TCF'."
                )
            return file_type
    raise SystemExit("No <FlexQueryResponse> root element found — not a Flex export.")


def detect_csv_type(header: list[str]) -> str:
    """Infer AF vs TCF schema from a CSV header row (no type= attribute in CSV)."""
    if "ibOrderID" in header:
        return "AF"
    if "orderID" in header:
        return "TCF"
    raise SystemExit(
        f"Cannot detect Flex schema from CSV header — no 'ibOrderID' (AF) or "
        f"'orderID' (TCF) column found: {header}"
    )


def _build_row(
    attrs: dict[str, str],
    header: dict[str, str],
    aliases: dict[str, str],
    valid: frozenset[str],
) -> dict[str, object]:
    """Merge header + attrs, apply aliases, filter to valid columns, stamp id."""
    merged: dict[str, str] = {}
    for key in _STATEMENT_HEADER_KEYS:
        if key in header:
            merged[key] = header[key]
    for k, v in attrs.items():
        merged[aliases.get(k, k)] = v

    row: dict[str, object] = {
        k: (v if v != "" else None)
        for k, v in merged.items()
        if k in valid
    }
    row["id"] = uuid.uuid4()
    return row


ParseResult = tuple[
    list[dict[str, object]],
    list[dict[str, object]],
    list[dict[str, object]],
    Counter,
    set[str],
    set[str],
    set[str],
]


def _route_row(
    attrs: dict[str, str],
    header: dict[str, str],
    aliases: dict[str, str],
    counts: Counter,
    order_rows: list[dict[str, object]],
    trade_rows: list[dict[str, object]],
    summary_rows: list[dict[str, object]],
    orders_unknown: set[str],
    trades_unknown: set[str],
    summaries_unknown: set[str],
) -> None:
    """Route one raw row (an XML element's attrib, or a CSV DictReader row) by levelOfDetail.

    Shared by both the XML and CSV parsers so routing/dedup-of-unknown-columns
    logic lives in exactly one place.
    """
    level = attrs.get("levelOfDetail")
    if level is None:
        return

    counts[level] += 1
    if level in ORDER_LEVELS:
        orders_unknown.update(
            {aliases.get(k, k) for k in attrs} - _ORDERS_VALID - set(_STATEMENT_HEADER_KEYS)
        )
        order_rows.append(_build_row(attrs, header, aliases, _ORDERS_VALID))
    elif level in EXECUTION_LEVELS:
        trades_unknown.update(
            {aliases.get(k, k) for k in attrs} - _TRADES_VALID - set(_STATEMENT_HEADER_KEYS)
        )
        trade_rows.append(_build_row(attrs, header, aliases, _TRADES_VALID))
    elif level in SUMMARY_LEVELS:
        summaries_unknown.update(
            {aliases.get(k, k) for k in attrs} - _SUMMARIES_VALID - set(_STATEMENT_HEADER_KEYS)
        )
        summary_rows.append(_build_row(attrs, header, aliases, _SUMMARIES_VALID))


def parse(xml_path: str, file_type: str) -> ParseResult:
    """Stream-parse a Flex XML export into three row buckets split by levelOfDetail.

    Returns (order_rows, trade_rows, summary_rows, level_counts,
             orders_unknown_attrs, trades_unknown_attrs, summaries_unknown_attrs).
    """
    aliases = AF_TO_TCF if file_type == "AF" else {}
    order_rows: list[dict[str, object]] = []
    trade_rows: list[dict[str, object]] = []
    summary_rows: list[dict[str, object]] = []
    counts: Counter = Counter()
    orders_unknown: set[str] = set()
    trades_unknown: set[str] = set()
    summaries_unknown: set[str] = set()
    header: dict[str, str] = {}

    for event, elem in ET.iterparse(xml_path, events=("start", "end")):
        if event == "start":
            if elem.tag == "FlexStatement":
                header = dict(elem.attrib)
            continue

        _route_row(
            elem.attrib, header, aliases, counts,
            order_rows, trade_rows, summary_rows,
            orders_unknown, trades_unknown, summaries_unknown,
        )
        elem.clear()

    return (
        order_rows, trade_rows, summary_rows,
        counts,
        orders_unknown, trades_unknown, summaries_unknown,
    )


def parse_csv(csv_path: str, file_type: str) -> ParseResult:
    """Parse a single per-section Activity Statement CSV into three row buckets.

    Each CSV row already carries fromDate/toDate/period/whenGenerated directly
    (unlike XML, where those live on the parent <FlexStatement> element), so no
    separate header dict is needed — routing happens purely off levelOfDetail.
    """
    aliases = AF_TO_TCF if file_type == "AF" else {}
    order_rows: list[dict[str, object]] = []
    trade_rows: list[dict[str, object]] = []
    summary_rows: list[dict[str, object]] = []
    counts: Counter = Counter()
    orders_unknown: set[str] = set()
    trades_unknown: set[str] = set()
    summaries_unknown: set[str] = set()

    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            _route_row(
                row, {}, aliases, counts,
                order_rows, trade_rows, summary_rows,
                orders_unknown, trades_unknown, summaries_unknown,
            )

    return (
        order_rows, trade_rows, summary_rows,
        counts,
        orders_unknown, trades_unknown, summaries_unknown,
    )
