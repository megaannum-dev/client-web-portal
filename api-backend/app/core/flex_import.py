"""IB Flex XML/CSV -> row buckets -> deduped DB insert. Parse then load: two
originally separate modules (``flex_xml.py`` and ``flex_load.py``) that never
imported each other, concatenated here because they are one pipeline end to
end.

Lives in app/core/ (not scripts/) because the Dockerfile copies app/, alembic/,
alembic.ini but not scripts/ — app code (e.g. a new scheduled ingest job) can't
import from scripts. The dedup logic here is what makes a re-run idempotent, so
it's reused from both the CLI importer and any future in-app job rather than
reimplemented.
"""

from __future__ import annotations

import csv
import uuid
import xml.etree.ElementTree as ET
from collections import Counter
from typing import BinaryIO, cast

from sqlalchemy import Table, select, text

from app.core.database import engine
from app.models.reconciliation import Order, SymbolSummary, Trade

# --- parse ---------------------------------------------------------------
#
# Parses IB Flex XML/CSV exports into row buckets split by levelOfDetail.
#
# Handles both Flex query schemas (auto-detected per file):
#   AF  (Activity Flex)       -- 9 columns have different names; aliased to TCF names.
#   TCF (Trade Confirm Flex)  -- column names match the ORM directly.
#
# levelOfDetail routing:
#   ORDER          -> orders          (unique on orderID + accountId)
#   EXECUTION      -> trades          (unique on tradeID + accountId, and execID + accountId)
#   SYMBOL_SUMMARY -> symbol_summaries (dedup on symbol+tradeDate+buySell+accountId)
#   ASSET_SUMMARY  (skipped)
#
# Pure parsing only — no DB access. Used by both the CLI importer
# (scripts/import_activity_xml/run.py) and the app's IB source-adapter module.

# levelOfDetail values that route to each table
ORDER_LEVELS = frozenset({"ORDER"})
EXECUTION_LEVELS = frozenset({"EXECUTION"})
SUMMARY_LEVELS = frozenset({"SYMBOL_SUMMARY"})
KEEP_LEVELS = ORDER_LEVELS | EXECUTION_LEVELS | SUMMARY_LEVELS

# FlexStatement fields. Not columns on the three tables. Still excluded from
# the unknown-column report; _build_row drops any name that is not on the model.
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


def detect_type(source: str | BinaryIO) -> str:
    """Sniff AF vs TCF from the <FlexQueryResponse type=...> attribute.

    `source` is a path or an already-open binary file/stream (e.g. an
    in-memory `BytesIO` from a scheduled ingest job that must classify the
    statement before deciding whether to persist it, or a file object handed
    back by a storage abstraction). `iterparse` reads a stream forward-only
    and this returns as soon as the root element is seen, leaving the rest
    unread — so if you also call `parse()` on the same stream object, pass a
    *fresh* stream per call (e.g. a new `BytesIO` over the same bytes); this
    function does not seek/rewind for you.
    """
    for _event, elem in ET.iterparse(source, events=("start",)):
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


def parse(xml_path: str | BinaryIO, file_type: str) -> ParseResult:
    """Stream-parse a Flex XML export into three row buckets split by levelOfDetail.

    `xml_path` is a path or an already-open binary file/stream, same as
    `detect_type` above — same fresh-stream-per-call contract applies if the
    caller ran `detect_type` on the same stream object first.

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
    (unlike XML, where those live on the parent <FlexStatement> element). Those
    four names are not row columns, so _build_row drops them. Routing happens
    purely off levelOfDetail.
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


# --- load ------------------------------------------------------------------
#
# Dedup + load logic for IB Flex activity rows into orders/trades/symbol_summaries.


def _existing_keys(conn, table: Table, cols: tuple[str, ...]) -> set:
    selected = conn.execute(select(*(table.c[col] for col in cols)))
    return {tuple(row) for row in selected}


# A master ALLOC row and the client BUY/SELL row share tradeID and execID.
# accountId is what separates them, so trades dedup on (tradeID, accountId),
# same shape as orders on (orderID, accountId). execID can be empty on
# BookTrade expiry/assignment rows; the DB unique is (execID, accountId).
# The 7-column heuristic key + Decimal-normalization helpers that used to
# live here are gone; don't reintroduce them.


def _dedupe_fresh(rows, key_fn, existing_keys: set) -> list:
    """Keep rows whose key isn't in `existing_keys`, updating it in place.

    Handles both "already in the DB" and "duplicated within this same
    import call" in one pass.
    """
    fresh = []
    for r in rows:
        key = key_fn(r)
        if key not in existing_keys:
            existing_keys.add(key)
            fresh.append(r)
    return fresh


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
    parsed row is inserted as-is. DB unique constraints still apply and will
    raise IntegrityError if the parsed data itself contains a real duplicate:
    orders (orderID, accountId), trades (tradeID, accountId) and
    (execID, accountId), symbol_summaries
    (symbol, tradeDate, buySell, accountId).

    Returns (orders_inserted, orders_skipped, trades_inserted, trades_skipped,
             summaries_inserted, summaries_skipped).
    """
    # Checked before the transaction opens, so a bad batch never starts one.
    # Fail loud rather than silently collapsing: every row missing a tradeID
    # keys to the same None, so _dedupe_fresh would keep the first and DISCARD
    # the rest -- and MySQL permits many NULLs in a unique index, so
    # uq_trades_tradeID_accountId would not catch it either. The old composite
    # fallback key degraded gracefully here; keying on (tradeID, accountId)
    # does not when tradeID is missing.
    if not no_dedup and any(not r.get("tradeID") for r in trade_rows):
        raise ValueError(
            "trade rows without a tradeID cannot be deduped "
            "((tradeID, accountId) is the dedupe key); refusing to load"
        )

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
                existing_order_keys: set = set()
                existing_trade_keys: set = set()
                existing_summary_keys: set = set()
            else:
                existing_order_keys = _existing_keys(
                    conn, _ORDERS_TABLE, ("orderID", "accountId")
                )
                existing_trade_keys = _existing_keys(
                    conn, _TRADES_TABLE, ("tradeID", "accountId")
                )
                existing_summary_keys = _existing_keys(
                    conn,
                    _SUMMARIES_TABLE,
                    ("symbol", "tradeDate", "buySell", "accountId"),
                )

            fresh_orders = _dedupe_fresh(
                order_rows,
                lambda r: (r.get("orderID"), r.get("accountId")),
                existing_order_keys,
            )
            fresh_trades = _dedupe_fresh(
                trade_rows,
                lambda r: (r.get("tradeID"), r.get("accountId")),
                existing_trade_keys,
            )
            fresh_summaries = _dedupe_fresh(
                summary_rows,
                lambda r: (
                    r.get("symbol"),
                    r.get("tradeDate"),
                    r.get("buySell"),
                    r.get("accountId"),
                ),
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
