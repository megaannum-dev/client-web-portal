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
from collections import Counter

from app.core.flex_load import load
from app.core.flex_xml import EXECUTION_LEVELS as _EXECUTION_LEVELS
from app.core.flex_xml import ORDER_LEVELS as _ORDER_LEVELS
from app.core.flex_xml import SUMMARY_LEVELS as _SUMMARY_LEVELS
from app.core.flex_xml import detect_csv_type as _detect_csv_type
from app.core.flex_xml import detect_type as _detect_type
from app.core.flex_xml import parse, parse_csv


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
