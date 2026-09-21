"""One-shot: copy the retired SFTP drop's statements into the ib_flex bucket.

The drop directory nested by ``YYYY/MM/``; the bucket is flat-per-month
(``YYYY-MM/``) because LocalStorage.list walks exactly one level deep. Run
this once per environment that had a populated drop dir, or every historical
day disappears from reconciliation the moment StoredFetcher takes over.

    .venv/Scripts/python.exe -m scripts.migrate_ib_flex_drop \
        --src "C:/Users/JohnQin/Desktop/mega-crm-ib-flex/drop/trade-confirm"

Idempotent: an already-present destination is skipped unless --force.
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from app.core.storage import Bucket, _bucket_root

_SUBDIR = "trade-confirm"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--src", required=True, help="the drop dir's trade-confirm/ root")
    ap.add_argument("--force", action="store_true", help="overwrite existing destinations")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    dest_root = _bucket_root(Bucket.IB_FLEX) / _SUBDIR
    copied = skipped = 0
    for src in sorted(Path(args.src).glob("*/*/ib_trades_*.xml")):
        year, month = src.parent.parent.name, src.parent.name
        dest = dest_root / f"{year}-{month}" / src.name
        if dest.exists() and not args.force:
            skipped += 1
            continue
        print(f"{src} -> {dest}")
        if not args.dry_run:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)
        copied += 1
    print(f"copied={copied} skipped(exists)={skipped} dest={dest_root}")


if __name__ == "__main__":
    main()
