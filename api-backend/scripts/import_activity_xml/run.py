"""Importer: IB Flex XML/CSV -> MariaDB. Routes all rows to three tables simultaneously.

  levelOfDetail=ORDER                     -> orders          (unique on orderID)
  levelOfDetail=EXECUTION                 -> trades          (unique on execID)
  levelOfDetail=SYMBOL_SUMMARY              -> symbol_summaries (dedup on symbol+tradeDate+buySell)
  levelOfDetail=ASSET_SUMMARY               (skipped)

Two input formats are accepted (mutually exclusive):

  --xml PATH [PATH ...]
                     One or more Flex Query XML exports, each with mixed
                     levelOfDetail values in one <FlexQueryResponse>. Multiple
                     files are parsed and merged before loading, same as --csv.
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
Use --no-dedup to skip all dedup lookups/filtering and insert every parsed
row as-is — intended for a clean import (normally --mode replace + --no-dedup
together) where you know the tables start empty and want a byte-for-byte
insert of what's in the source file, with no risk of the dedup logic itself
silently dropping a row it misjudges as a duplicate.

Usage:
    .venv/Scripts/python.exe -m scripts.import_activity_xml.run \\
        --xml "C:/path/to/flex.xml"
    .venv/Scripts/python.exe -m scripts.import_activity_xml.run \\
        --xml "C:/path/to/flex1.xml" "C:/path/to/flex2.xml"
    .venv/Scripts/python.exe -m scripts.import_activity_xml.run \\
        --csv "C:/path/to/activity_Order.csv" "C:/path/to/activity_Trade.csv" \\
              "C:/path/to/activity_SymbolSummary.csv"
    ... --mode replace   # clear orders, trades, symbol_summaries first
    ... --no-dedup       # skip dedup entirely; insert every parsed row as-is
    ... --dry-run        # parse + report only, touch nothing
"""

from __future__ import annotations

import argparse
import csv
import uuid
import xml.etree.ElementTree as ET
from collections import Counter
from decimal import Decimal, InvalidOperation
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


def _existing_triple(conn, table: Table, col1: str, col2: str, col3: str) -> set:
    return {
        (row[0], row[1], row[2])
        for row in conn.execute(select(table.c[col1], table.c[col2], table.c[col3]))
    }


def _existing_multi_where_null(
    conn, table: Table, cols: tuple[str, ...], null_col: str
) -> set[tuple]:
    """Return `cols` tuples for rows where `null_col` IS NULL only.

    Used for the trades NULL-execID fallback key: only rows that themselves
    lack an execID are candidates for that key space. A row with a real
    execID must never suppress a genuinely distinct NULL-execID execution
    that happens to share the same orderID (e.g. a normal fill followed by
    a later assignment/expiry execution on the same order).
    """
    column_objs = [table.c[c] for c in cols]
    stmt = select(*column_objs).where(table.c[null_col].is_(None))
    return {
        tuple(_normalize_key_value(c, v) for c, v in zip(cols, row))
        for row in conn.execute(stmt)
    }


# Columns used to key a trades row that has no execID (IB omits execID for
# option expiry/assignment executions). orderID alone is too coarse — an
# order can accumulate more than one NULL-execID execution over its life —
# so the key also pins symbol/date/side/qty/price/amount to make a false
# collision between two genuinely different executions statistically
# negligible.
_NULL_EXEC_KEY_COLS = ("orderID", "symbol", "tradeDate", "buySell", "quantity", "price", "amount")

# Numeric(28,10) columns in the key: incoming rows hold these as raw text
# (from CSV/XML), but a value read back from the DB is a Decimal. "0E-10"
# (str) != Decimal("0") as dict-key material even though they're the same
# number, so both sides must be normalized to Decimal or the same row
# silently re-inserts on every subsequent import.
_NULL_EXEC_NUMERIC_COLS = frozenset({"quantity", "price", "amount"})


def _normalize_key_value(col: str, value: object) -> object:
    if value is None or col not in _NULL_EXEC_NUMERIC_COLS:
        return value
    try:
        return Decimal(str(value))
    except InvalidOperation:
        return value


def _dedupe_fresh(rows, key_fn, existing_keys: set) -> list:
    """Keep rows whose key isn't in `existing_keys`, updating it in place.

    Handles both "already in the DB" and "duplicated within this same
    import call" in one pass — the latter matters for trades/summaries,
    which (for NULL-execID rows / post-B-6 summaries) have no DB unique
    constraint to fall back on if the in-memory filter misses a dup.
    """
    fresh = []
    for r in rows:
        key = key_fn(r)
        if key not in existing_keys:
            existing_keys.add(key)
            fresh.append(r)
    return fresh


def _trade_key(row: dict[str, object]) -> tuple:
    """execID when present (unique per fill); the composite fallback key
    otherwise (see _NULL_EXEC_KEY_COLS). Tagged so the two key spaces can't
    collide with each other in the same set."""
    exec_id = row.get("execID")
    if exec_id is not None:
        return ("exec", exec_id)
    return (
        "null_exec",
        *(_normalize_key_value(c, row.get(c)) for c in _NULL_EXEC_KEY_COLS),
    )


def load(
    order_rows: list[dict[str, object]],
    trade_rows: list[dict[str, object]],
    summary_rows: list[dict[str, object]],
    *,
    mode: str,
    batch_size: int,
    no_dedup: bool = False,
) -> tuple[int, int, int, int, int, int]:
    """Insert all three row sets in one transaction.

    Deduplication runs inside the transaction before inserting, so rows whose
    unique key already exists (in the DB, or earlier in this same batch) are
    skipped rather than raising. FK order: clear symbol_summaries -> trades ->
    orders (reverse dependency).

    If no_dedup is True, all dedup lookups/filtering are skipped and every
    parsed row is inserted as-is. DB unique constraints (orders.orderID,
    trades.execID) still apply and will raise IntegrityError if the parsed
    data itself contains a real duplicate — trades rows with a NULL execID
    and symbol_summaries rows have no such backstop, so a raw re-import in
    this mode against a non-empty table WILL create literal duplicates.

    Returns (orders_inserted, orders_skipped, trades_inserted, trades_skipped,
             summaries_inserted, summaries_skipped).
    """
    with engine.begin() as conn:
        if mode == "replace":
            conn.execute(text("DELETE FROM `symbol_summaries`"))
            conn.execute(text("DELETE FROM `trades`"))
            conn.execute(text("DELETE FROM `orders`"))

        if no_dedup:
            fresh_orders = order_rows
            fresh_trades = trade_rows
            fresh_summaries = summary_rows
        else:
            if mode == "replace":
                existing_order_ids: set = set()
                existing_trade_keys: set = set()
                existing_summary_keys: set = set()
            else:
                existing_order_ids = _existing_single(conn, _ORDERS_TABLE, "orderID")
                existing_trade_keys = {
                    ("exec", e) for e in _existing_single(conn, _TRADES_TABLE, "execID")
                } | {
                    ("null_exec", *t)
                    for t in _existing_multi_where_null(
                        conn, _TRADES_TABLE, _NULL_EXEC_KEY_COLS, "execID"
                    )
                }
                existing_summary_keys = _existing_triple(
                    conn, _SUMMARIES_TABLE, "symbol", "tradeDate", "buySell"
                )

            fresh_orders = _dedupe_fresh(order_rows, lambda r: r.get("orderID"), existing_order_ids)
            fresh_trades = _dedupe_fresh(trade_rows, _trade_key, existing_trade_keys)
            fresh_summaries = _dedupe_fresh(
                summary_rows,
                lambda r: (r.get("symbol"), r.get("tradeDate"), r.get("buySell")),
                existing_summary_keys,
            )

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
    source.add_argument(
        "--xml",
        nargs="+",
        metavar="PATH",
        help="One or more IB Flex XML files (AF or TCF), parsed and merged before loading.",
    )
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
        "--no-dedup",
        action="store_true",
        help=(
            "Skip all deduplication (DB-existing lookup and intra-batch check); "
            "insert every parsed row as-is. For a clean import into empty "
            "tables. DB unique constraints on orders.orderID/trades.execID "
            "still apply; NULL-execID trades and symbol_summaries have no "
            "such backstop and WILL duplicate if the target table isn't empty."
        ),
    )
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
        for path in args.xml:
            file_type = _detect_type(path)
            o, t, s, c, ou, tu, su = parse(path, file_type)
            print(f"Parsed {path}  (type={file_type})")
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

    if args.no_dedup:
        print("WARNING: --no-dedup is set — inserting every parsed row as-is, no dedup checks.")

    o_ins, o_skip, t_ins, t_skip, s_ins, s_skip = load(
        order_rows, trade_rows, summary_rows,
        mode=args.mode,
        batch_size=args.batch_size,
        no_dedup=args.no_dedup,
    )
    print(f"Inserted (mode={args.mode}, no_dedup={args.no_dedup}):")
    print(f"  {'orders':<22} inserted={o_ins:>6}  skipped(dup)={o_skip:>6}")
    print(f"  {'trades':<22} inserted={t_ins:>6}  skipped(dup)={t_skip:>6}")
    print(f"  {'symbol_summaries':<22} inserted={s_ins:>6}  skipped(dup)={s_skip:>6}")
    print("OK")


if __name__ == "__main__":
    main()
