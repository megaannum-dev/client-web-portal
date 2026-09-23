"""StoredFetcher.fetch — missing source vs no trade record.

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
