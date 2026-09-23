"""StoredFetcher — missing source vs no trade record, and what days() lists.

Storage is redirected to `tmp_path` via `storage_root_ib_flex` (same pattern
as tests/libs/ib_ingest/test_ingest.py's `_isolate` fixture) -- never the
real `crm_filesystem/` archive, which is read-only input here at most.

Run: .venv/Scripts/python.exe -m pytest -q tests/core/test_flex_query_stored_fetcher.py
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from app.core import flex_query as flex_query_module
from app.core import storage as storage_module
from app.core.config import Settings
from app.core.flex_query import FlexUnavailable, StoredFetcher
from app.core.storage import get_storage

# Real archive file for 2026-08-03: a well-formed, empty <TradeConfirms/>
# envelope (IB delivered a statement showing no trades). Read-only reference.
_EMPTY_ENVELOPE = (
    Path(__file__).parents[2] / "crm_filesystem" / "ib_flex" / "trade-confirm" / "2026-08"
    / "ib_trades_20260803.xml"
).read_bytes()

# Real archive file for 2026-08-13: a statement that DOES carry trade
# records. Read-only reference.
_WITH_RECORDS = (
    Path(__file__).parents[2] / "crm_filesystem" / "ib_flex" / "trade-confirm" / "2026-08"
    / "ib_trades_20260813.xml"
).read_bytes()


def _store(tmp_path: Path, day: date, body: bytes) -> None:
    key = tmp_path / "ib_flex" / "trade-confirm" / f"{day:%Y-%m}" / f"ib_trades_{day:%Y%m%d}.xml"
    key.parent.mkdir(parents=True, exist_ok=True)
    key.write_bytes(body)


@pytest.fixture(autouse=True)
def _isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    settings = Settings(storage_root=str(tmp_path))  # type: ignore[call-arg]
    monkeypatch.setattr(storage_module, "get_settings", lambda: settings)
    monkeypatch.setattr(flex_query_module, "get_settings", lambda: settings)
    get_storage.cache_clear()
    yield
    get_storage.cache_clear()


def test_fetch_raises_flex_unavailable_when_file_is_missing() -> None:
    day = date(2026, 8, 4)  # never ingested -- no file at all

    with pytest.raises(FlexUnavailable):
        StoredFetcher().fetch(day)


def test_fetch_returns_empty_rows_when_file_present_but_no_trades(tmp_path: Path) -> None:
    day = date(2026, 8, 3)
    key_path = tmp_path / "ib_flex" / "trade-confirm" / "2026-08" / "ib_trades_20260803.xml"
    key_path.parent.mkdir(parents=True, exist_ok=True)
    key_path.write_bytes(_EMPTY_ENVELOPE)

    rows = StoredFetcher().fetch(day)

    assert rows.orders == []
    assert rows.fills == []


def test_days_lists_only_statements_that_carry_records(tmp_path: Path) -> None:
    """A file on disk only proves the ingest ran, not that anything traded."""
    _store(tmp_path, date(2026, 8, 13), _WITH_RECORDS)
    _store(tmp_path, date(2026, 8, 3), _EMPTY_ENVELOPE)

    assert StoredFetcher().days() == [date(2026, 8, 13)]


def test_days_is_empty_when_every_statement_is_empty(tmp_path: Path) -> None:
    _store(tmp_path, date(2026, 8, 3), _EMPTY_ENVELOPE)
    _store(tmp_path, date(2026, 8, 4), _EMPTY_ENVELOPE)

    assert StoredFetcher().days() == []


def test_days_skips_an_unreadable_file_instead_of_failing(tmp_path: Path) -> None:
    """One corrupt statement must not take the whole listing down."""
    _store(tmp_path, date(2026, 8, 13), _WITH_RECORDS)
    _store(tmp_path, date(2026, 8, 12), b"<FlexQueryResponse><truncated")

    assert StoredFetcher().days() == [date(2026, 8, 13)]


def test_an_empty_day_is_still_distinguishable_from_a_missing_one(tmp_path: Path) -> None:
    """days() drops both, but fetch() keeps the distinction -- the whole point."""
    _store(tmp_path, date(2026, 8, 3), _EMPTY_ENVELOPE)
    fetcher = StoredFetcher()

    assert fetcher.days() == []
    assert fetcher.fetch(date(2026, 8, 3)) == ([], [])  # delivered, nothing traded
    with pytest.raises(FlexUnavailable):
        fetcher.fetch(date(2026, 8, 4))  # never delivered
