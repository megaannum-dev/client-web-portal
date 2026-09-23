"""Dedup + load logic for IB Flex activity rows into orders/trades/symbol_summaries.

Lives in app/core/ (not scripts/) because the Dockerfile copies app/, alembic/,
alembic.ini but not scripts/ — app code (e.g. a new scheduled ingest job) can't
import from scripts. The dedup logic here is what makes a re-run idempotent, so
it's reused from both the CLI importer and any future in-app job rather than
reimplemented.
"""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import cast

from sqlalchemy import Table, select, text

from app.core.database import engine
from app.models.reconciliation import Order, SymbolSummary, Trade

_ORDERS_TABLE: Table = cast(Table, Order.__table__)
_TRADES_TABLE: Table = cast(Table, Trade.__table__)
_SUMMARIES_TABLE: Table = cast(Table, SymbolSummary.__table__)


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
