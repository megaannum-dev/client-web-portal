"""Loader: production pc_* JSON exports -> local MariaDB (revision 0039).

Loads the four landing tables created by alembic revision e2a9c47b1f60 (0039)
from the JSON exports taken off the production DB:

    pc_engine_runs.json   -> pc_engine_runs     (391 rows)
    pc_order.json         -> pc_orders          (110 rows)  <-- NOTE the rename
    pc_order_events.json  -> pc_order_events    (249 rows)
    pc_trades.json        -> pc_trades          (121 rows)

The pc_order.json -> pc_orders mapping is the one trap here: the export file is
named singular, the production table is plural. _FILE_TO_TABLE below is the
single place that mapping lives.

Run the 0039 migration FIRST -- this script reflects the live tables and will
fail loudly if they are missing. It never issues DDL.

Idempotent: every insert is INSERT IGNORE against the production primary keys,
so a re-run inserts nothing and reports every row as skipped. Safe to run twice.

Deliberately NOT part of the migration: ~871 rows of export do not belong in
the alembic version history, and keeping the load separate makes it re-runnable
against a fresh dev DB without touching the revision chain.

Two fidelity rules that matter:
  - strategy_tag is stored VERBATIM. It looks like JSON but is a Python repr
    dict (single quotes, True/False), so it is not parsed, not re-serialised,
    and not validated. Round-tripping it byte-for-byte is the whole contract.
  - Empty strings stay empty strings, never NULL. pc_engine_runs.end_source is
    '' for most rows on production; coercing it to NULL would silently change
    the data.

Usage:
    .venv/Scripts/python.exe -m scripts.load_pc_exports --dir ~/Desktop
    .venv/Scripts/python.exe -m scripts.load_pc_exports --check-only
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import sqlalchemy as sa
from sqlalchemy.dialects.mysql import insert as mysql_insert

from app.core.config import get_settings

# Export filename (without .json) -> production table name. Load order is
# engine_runs -> orders -> events -> trades; purely cosmetic (production
# declares no foreign keys), but it keeps a partial load readable.
_FILE_TO_TABLE: tuple[tuple[str, str], ...] = (
    ("pc_engine_runs", "pc_engine_runs"),
    ("pc_order", "pc_orders"),
    ("pc_order_events", "pc_order_events"),
    ("pc_trades", "pc_trades"),
)

# Expected row counts in the 2026-09-02 production snapshot
# (load_batch_id 911b7c4656b34ec187d27370577b5612).
_EXPECTED_ROWS: dict[str, int] = {
    "pc_engine_runs": 391,
    "pc_orders": 110,
    "pc_order_events": 249,
    "pc_trades": 121,
}


def _load_rows(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as fh:
        rows = json.load(fh)
    if not isinstance(rows, list) or not rows:
        raise SystemExit(f"{path}: expected a non-empty JSON array")
    return rows


def _insert(conn: sa.Connection, table: sa.Table, rows: list[dict]) -> int:
    """INSERT IGNORE every row; returns how many were actually inserted."""
    # Reject unknown keys up front rather than letting SQLAlchemy drop them
    # silently -- a column renamed on production must fail visibly here.
    unknown = set(rows[0]) - set(table.columns.keys())
    if unknown:
        raise SystemExit(f"{table.name}: export has columns not in the table: {sorted(unknown)}")

    before = conn.execute(sa.select(sa.func.count()).select_from(table)).scalar_one()
    # prefix_with("IGNORE") -> INSERT IGNORE: duplicate-PK rows are skipped, so
    # a re-run is a no-op. Chunked so one statement stays a sane size.
    for start in range(0, len(rows), 500):
        conn.execute(mysql_insert(table).prefix_with("IGNORE"), rows[start : start + 500])
    after = conn.execute(sa.select(sa.func.count()).select_from(table)).scalar_one()
    return after - before


def _self_check(conn: sa.Connection, tables: dict[str, sa.Table]) -> None:
    """Assert the load landed intact. Fails the script on any mismatch."""
    for name, expected in _EXPECTED_ROWS.items():
        actual = conn.execute(sa.select(sa.func.count()).select_from(tables[name])).scalar_one()
        assert actual == expected, f"{name}: {actual} rows, expected {expected}"

    # datetime(6) truncation canary: all 391 started_at_utc values are distinct
    # in the export. If the column had landed as fsp=0 they would collide.
    runs = tables["pc_engine_runs"]
    distinct = conn.execute(
        sa.select(sa.func.count(sa.distinct(runs.c.started_at_utc)))
    ).scalar_one()
    assert distinct == 391, (
        f"started_at_utc has {distinct} distinct values, expected 391 (fsp lost?)"
    )

    # Empty string preserved, not coerced to NULL.
    blank = conn.execute(
        sa.select(sa.func.count()).select_from(runs).where(runs.c.end_source == "")
    ).scalar_one()
    assert blank > 0, "end_source='' rows became NULL -- empty strings were not preserved"

    # One wide row end to end, including the 6-decimal cash column.
    orders = tables["pc_orders"]
    row = conn.execute(
        sa.select(orders.c.modeled_cash_flow_after_fees_usd, orders.c.strategy_tag).where(
            orders.c.scope_key == "pc-production-2026-08",
            orders.c.source_run_id == 11,
            orders.c.lean_order_id == 1,
        )
    ).one()
    assert float(row[0]) == 166.6094, (
        f"modeled_cash_flow_after_fees_usd = {row[0]}, expected 166.6094"
    )
    assert row[1].startswith("{'AlgoName': 'OptionZero_0DTE'"), (
        "strategy_tag was not stored verbatim"
    )

    print("[load_pc_exports] self-check passed")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--dir",
        type=Path,
        default=Path.home() / "Desktop",
        help="directory holding the four pc_*.json exports (default: ~/Desktop)",
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="skip loading; just run the self-check against what is already in the DB",
    )
    args = parser.parse_args(argv)

    engine = sa.create_engine(get_settings().database_url)
    metadata = sa.MetaData()
    tables: dict[str, sa.Table] = {}

    with engine.begin() as conn:
        for _, table_name in _FILE_TO_TABLE:
            try:
                tables[table_name] = sa.Table(table_name, metadata, autoload_with=conn)
            except sa.exc.NoSuchTableError:
                raise SystemExit(
                    f"table {table_name} does not exist -- run `alembic upgrade head` first"
                ) from None

        if not args.check_only:
            for file_stem, table_name in _FILE_TO_TABLE:
                path = args.dir.expanduser() / f"{file_stem}.json"
                if not path.exists():
                    raise SystemExit(f"missing export: {path}")
                rows = _load_rows(path)
                inserted = _insert(conn, tables[table_name], rows)
                print(
                    f"[load_pc_exports] {table_name}: {inserted} inserted, "
                    f"{len(rows) - inserted} skipped (already present) of {len(rows)}"
                )

        _self_check(conn, tables)

    return 0


if __name__ == "__main__":
    sys.exit(main())
