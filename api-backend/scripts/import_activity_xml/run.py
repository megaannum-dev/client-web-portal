"""Importer: IB Flex XML/CSV -> MariaDB. Routes all rows to three tables simultaneously.

  levelOfDetail=ORDER                     -> orders          (unique on orderID)
  levelOfDetail=EXECUTION                 -> trades          (unique on execID)
  levelOfDetail=SYMBOL_SUMMARY              -> symbol_summaries (dedup on symbol+tradeDate+buySell)
  levelOfDetail=ASSET_SUMMARY               (skipped)

Two input formats are accepted (mutually exclusive):

  --xml PATH        A single Flex Query XML export, mixed levelOfDetail values
                     in one <FlexQueryResponse>.
  --csv PATH [PATH ...]
                     One or more per-section Activity Statement CSVs (e.g.
                     *_Order.csv, *_Trade.csv, *_SymbolSummary.csv exported
                     from the IB web portal). Each file has a single header
                     row; rows are routed by their own levelOfDetail column,
                     same as --xml. Multiple files may be passed together.

Handles both Flex query schemas (auto-detected per file):
  AF  (Activity Flex)       -- 9 columns have different names; aliased to TCF names.
  TCF (Trade Confirm Flex)  -- column names match the ORM directly.

Deduplication: rows whose unique key already exists in the target table are
skipped silently. Counts of inserted vs. skipped are reported per table.
Use --mode replace to clear all three tables before loading.

Usage:
    .venv/Scripts/python.exe -m scripts.import_activity_xml.run \\
        --xml "C:/path/to/flex.xml"
    .venv/Scripts/python.exe -m scripts.import_activity_xml.run \\
        --csv "C:/path/to/activity_Order.csv" "C:/path/to/activity_Trade.csv" \\
              "C:/path/to/activity_SymbolSummary.csv"
    ... --mode replace   # clear orders, trades, symbol_summaries first
    ... --dry-run        # parse + report only, touch nothing
"""

from __future__ import annotations

import argparse
import csv
import uuid
import xml.etree.ElementTree as ET
from collections import Counter
from typing import cast

from sqlalchemy import Table, select, text

from app.core.database import engine
from app.models.reconciliation import Order, SymbolSummary, Trade

# levelOfDetail values that route to each table
_ORDER_LEVELS = frozenset({"ORDER"})
_EXECUTION_LEVELS = frozenset({"EXECUTION"})
_SUMMARY_LEVELS = frozenset({"SYMBOL_SUMMARY"})
_KEEP_LEVELS = _ORDER_LEVELS | _EXECUTION_LEVELS | _SUMMARY_LEVELS

# Header attributes on <FlexStatement> that are also row columns.
_STATEMENT_HEADER_KEYS = ("period", "fromDate", "toDate", "whenGenerated")

# AF column name -> TCF column name (9 renames; everything else is unchanged)
_AF_TO_TCF: dict[str, str] = {
    "ibOrderID": "orderID",
    "ibExecID": "execID",
    "tradePrice": "price",
    "tradeMoney": "amount",
    "ibCommission": "commission",
    "ibCommissionCurrency": "commissionCurrency",
    "settleDateTarget": "settleDate",
    "taxes": "tax",
    "transactionID": "tradeID",
}

_ORDERS_TABLE: Table = cast(Table, Order.__table__)
_TRADES_TABLE: Table = cast(Table, Trade.__table__)
_SUMMARIES_TABLE: Table = cast(Table, SymbolSummary.__table__)

_ORDERS_VALID = frozenset(_ORDERS_TABLE.columns.keys()) - {"id", "ingested_at"}
_TRADES_VALID = frozenset(_TRADES_TABLE.columns.keys()) - {"id", "ingested_at"}
_SUMMARIES_VALID = frozenset(_SUMMARIES_TABLE.columns.keys()) - {"id", "ingested_at"}


def _detect_type(xml_path: str) -> str:
    for _event, elem in ET.iterparse(xml_path, events=("start",)):
        if elem.tag == "FlexQueryResponse":
            file_type = elem.attrib.get("type", "")
            if file_type not in ("AF", "TCF"):
                raise SystemExit(
                    f"Unknown FlexQueryResponse type={file_type!r}. Expected 'AF' or 'TCF'."
                )
            return file_type
    raise SystemExit("No <FlexQueryResponse> root element found — not a Flex export.")


def _detect_csv_type(header: list[str]) -> str:
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


_ParseResult = tuple[
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
    if level in _ORDER_LEVELS:
        orders_unknown.update(
            {aliases.get(k, k) for k in attrs} - _ORDERS_VALID - set(_STATEMENT_HEADER_KEYS)
        )
        order_rows.append(_build_row(attrs, header, aliases, _ORDERS_VALID))
    elif level in _EXECUTION_LEVELS:
        trades_unknown.update(
            {aliases.get(k, k) for k in attrs} - _TRADES_VALID - set(_STATEMENT_HEADER_KEYS)
        )
        trade_rows.append(_build_row(attrs, header, aliases, _TRADES_VALID))
    elif level in _SUMMARY_LEVELS:
        summaries_unknown.update(
            {aliases.get(k, k) for k in attrs} - _SUMMARIES_VALID - set(_STATEMENT_HEADER_KEYS)
        )
        summary_rows.append(_build_row(attrs, header, aliases, _SUMMARIES_VALID))


def parse(xml_path: str, file_type: str) -> _ParseResult:
    """Stream-parse a Flex XML export into three row buckets split by levelOfDetail.

    Returns (order_rows, trade_rows, summary_rows, level_counts,
             orders_unknown_attrs, trades_unknown_attrs, summaries_unknown_attrs).
    """
    aliases = _AF_TO_TCF if file_type == "AF" else {}
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


def parse_csv(csv_path: str, file_type: str) -> _ParseResult:
    """Parse a single per-section Activity Statement CSV into three row buckets.

    Each CSV row already carries fromDate/toDate/period/whenGenerated directly
    (unlike XML, where those live on the parent <FlexStatement> element), so no
    separate header dict is needed — routing happens purely off levelOfDetail.
    """
    aliases = _AF_TO_TCF if file_type == "AF" else {}
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


def _existing_single(conn, table: Table, col: str) -> set:
    return {row[0] for row in conn.execute(select(table.c[col]))}


def _existing_pair(conn, table: Table, col1: str, col2: str) -> set:
    return {(row[0], row[1]) for row in conn.execute(select(table.c[col1], table.c[col2]))}


def _existing_triple(conn, table: Table, col1: str, col2: str, col3: str) -> set:
    return {
        (row[0], row[1], row[2])
        for row in conn.execute(select(table.c[col1], table.c[col2], table.c[col3]))
    }


def load(
    order_rows: list[dict[str, object]],
    trade_rows: list[dict[str, object]],
    summary_rows: list[dict[str, object]],
    *,
    mode: str,
    batch_size: int,
) -> tuple[int, int, int, int, int, int]:
    """Insert all three row sets in one transaction.

    Deduplication runs inside the transaction before inserting, so rows whose
    unique key already exists are skipped rather than raising. FK order:
    clear symbol_summaries -> trades -> orders (reverse dependency).

    Returns (orders_inserted, orders_skipped, trades_inserted, trades_skipped,
             summaries_inserted, summaries_skipped).
    """
    with engine.begin() as conn:
        if mode == "replace":
            conn.execute(text("DELETE FROM `symbol_summaries`"))
            conn.execute(text("DELETE FROM `trades`"))
            conn.execute(text("DELETE FROM `orders`"))
            existing_order_ids: set = set()
            existing_exec_ids: set = set()
            existing_null_exec_order_ids: set = set()
            existing_summary_keys: set = set()
        else:
            existing_order_ids = _existing_single(conn, _ORDERS_TABLE, "orderID")
            existing_exec_ids = _existing_single(conn, _TRADES_TABLE, "execID")
            existing_null_exec_order_ids = _existing_single(conn, _TRADES_TABLE, "orderID")
            existing_summary_keys = _existing_triple(conn, _SUMMARIES_TABLE, "symbol", "tradeDate", "buySell")

        fresh_orders = [r for r in order_rows if r.get("orderID") not in existing_order_ids]
        fresh_trades = [
            r for r in trade_rows
            if r.get("execID") is not None and r.get("execID") not in existing_exec_ids
            or r.get("execID") is None and r.get("orderID") not in existing_null_exec_order_ids
        ]
        fresh_summaries = [
            r for r in summary_rows
            if (r.get("symbol"), r.get("tradeDate"), r.get("buySell")) not in existing_summary_keys
        ]

        for start in range(0, len(fresh_orders), batch_size):
            conn.execute(_ORDERS_TABLE.insert(), fresh_orders[start : start + batch_size])
        for start in range(0, len(fresh_trades), batch_size):
            conn.execute(_TRADES_TABLE.insert(), fresh_trades[start : start + batch_size])
        for start in range(0, len(fresh_summaries), batch_size):
            conn.execute(_SUMMARIES_TABLE.insert(), fresh_summaries[start : start + batch_size])

    return (
        len(fresh_orders), len(order_rows) - len(fresh_orders),
        len(fresh_trades), len(trade_rows) - len(fresh_trades),
        len(fresh_summaries), len(summary_rows) - len(fresh_summaries),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--xml", help="Path to an IB Flex XML file (AF or TCF).")
    source.add_argument(
        "--csv",
        nargs="+",
        metavar="PATH",
        help=(
            "One or more per-section Activity Statement CSVs "
            "(e.g. *_Order.csv, *_Trade.csv, *_SymbolSummary.csv)."
        ),
    )
    parser.add_argument(
        "--mode",
        choices=("replace", "append"),
        default="append",
        help="append (default): keep existing rows. replace: clear all three tables first.",
    )
    parser.add_argument("--batch-size", type=int, default=1000)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and report only; do not touch the database.",
    )
    args = parser.parse_args()

    order_rows: list[dict[str, object]] = []
    trade_rows: list[dict[str, object]] = []
    summary_rows: list[dict[str, object]] = []
    counts: Counter = Counter()
    orders_unk: set[str] = set()
    trades_unk: set[str] = set()
    summaries_unk: set[str] = set()

    if args.xml:
        file_type = _detect_type(args.xml)
        o, t, s, c, ou, tu, su = parse(args.xml, file_type)
        print(f"Parsed {args.xml}  (type={file_type})")
        order_rows += o
        trade_rows += t
        summary_rows += s
        counts += c
        orders_unk |= ou
        trades_unk |= tu
        summaries_unk |= su
    else:
        for path in args.csv:
            with open(path, newline="", encoding="utf-8-sig") as f:
                header = next(csv.reader(f))
            file_type = _detect_csv_type(header)
            o, t, s, c, ou, tu, su = parse_csv(path, file_type)
            print(f"Parsed {path}  (type={file_type})")
            order_rows += o
            trade_rows += t
            summary_rows += s
            counts += c
            orders_unk |= ou
            trades_unk |= tu
            summaries_unk |= su

    for level, n in sorted(counts.items()):
        if level in _ORDER_LEVELS:
            dest = "-> orders"
        elif level in _EXECUTION_LEVELS:
            dest = "-> trades"
        elif level in _SUMMARY_LEVELS:
            dest = "-> symbol_summaries"
        else:
            dest = "(skipped)"
        print(f"  levelOfDetail={level:<22} {n:>6}  {dest}")

    for label, unknown in (
        ("orders", orders_unk),
        ("trades", trades_unk),
        ("symbol_summaries", summaries_unk),
    ):
        if unknown:
            print(
                f"  WARNING: {len(unknown)} attribute(s) dropped for `{label}` "
                f"(not in schema): {sorted(unknown)}"
            )

    if args.dry_run:
        print("Dry run — database untouched.")
        print(
            f"  Would route: {len(order_rows)} orders, "
            f"{len(trade_rows)} trades, {len(summary_rows)} summaries"
        )
        return

    o_ins, o_skip, t_ins, t_skip, s_ins, s_skip = load(
        order_rows, trade_rows, summary_rows,
        mode=args.mode,
        batch_size=args.batch_size,
    )
    print(f"Inserted (mode={args.mode}):")
    print(f"  {'orders':<22} inserted={o_ins:>6}  skipped(dup)={o_skip:>6}")
    print(f"  {'trades':<22} inserted={t_ins:>6}  skipped(dup)={t_skip:>6}")
    print(f"  {'symbol_summaries':<22} inserted={s_ins:>6}  skipped(dup)={s_skip:>6}")
    print("OK")


if __name__ == "__main__":
    main()
