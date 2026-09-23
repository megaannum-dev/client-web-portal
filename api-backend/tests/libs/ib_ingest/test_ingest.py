"""Unit tests for app.libs.ib_ingest.service.ingest_day.

Layer isolation: `ib_async` is not installed in this venv (it's an optional,
lazily-imported dependency of the "live" Flex transport), so it's faked here
the same way tests/core/test_flex_query_live_date.py fakes it -- a
`types.ModuleType` stub with a `FlexReport` class installed into
`sys.modules["ib_async"]`, and the shared `_download_flex_report` lru_cache
is never left dirty across tests (bypassed entirely here via
`download_day`'s own `.__wrapped__` call, so no `cache_clear()` is needed).

`flex_import.load` is faked with a tiny in-memory dedup double (keyed the same
way the real one is: orderID / execID) instead of hitting a real DB -- the
unit under test is ingest_day's fetch/verify/store/ordering logic, which the
real loader's own test suite doesn't cover.

Run: .venv/Scripts/python.exe -m pytest -q tests/libs/ib_ingest/
"""

from __future__ import annotations

import types
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from app.core import flex_query as flex_query_module
from app.core import storage as storage_module
from app.core.config import Settings
from app.core.storage import Bucket, get_storage
from app.libs.ib_ingest import service as service_module
from app.libs.ib_ingest.service import IngestFailed, MarketStillOpen, ingest_day

_ET = ZoneInfo("America/New_York")


def _good_xml(day: date, *, order_id: str = "111", exec_id: str = "222") -> bytes:
    d = f"{day:%Y%m%d}"
    return f"""<FlexQueryResponse queryName="Test" type="TCF">
<FlexStatements count="1">
<FlexStatement accountId="U1" fromDate="{d}" toDate="{d}" period="Today" whenGenerated="{d};180500">
<TradeConfirms>
<Order accountId="U1" symbol="AAPL" orderID="{order_id}" execID="" tradeDate="{d}" buySell="BUY" quantity="10" price="1.0" amount="10" levelOfDetail="ORDER" />
<TradeConfirm accountId="U1" symbol="AAPL" orderID="{order_id}" execID="{exec_id}" tradeDate="{d}" buySell="BUY" quantity="10" price="1.0" amount="10" levelOfDetail="EXECUTION" />
</TradeConfirms>
</FlexStatement>
</FlexStatements>
</FlexQueryResponse>""".encode()


_FAIL_XML = (
    b"<FlexStatementResponse><Status>Fail</Status>"
    b"<ErrorCode>1015</ErrorCode><ErrorMessage>bad token</ErrorMessage></FlexStatementResponse>"
)


class FakeReport:
    """Stands in for ib_async.FlexReport. `.data` is the raw bytes attribute
    `download_day` reads; `calls` records every construction so tests can
    assert the market-hours guard refuses to even try a download."""

    calls: list[str] = []
    data_to_return: bytes = b""

    def __init__(self, token: str, query_id: str) -> None:
        FakeReport.calls.append(f"{token}:{query_id}")
        self.data = FakeReport.data_to_return


class FakeLoader:
    """In-memory stand-in for app.core.flex_import.load: dedups on orderID /
    execID exactly like the real loader's unique-key behavior, so a second
    ingest of the same day genuinely inserts 0 rather than the test merely
    asserting a hardcoded return value."""

    def __init__(self) -> None:
        self.order_ids: set[object] = set()
        self.exec_ids: set[object] = set()
        self.calls: list[dict[str, object]] = []

    def __call__(self, order_rows, trade_rows, summary_rows, *, mode, batch_size, no_dedup=False):
        self.calls.append({"mode": mode, "batch_size": batch_size})
        fresh_orders = [r for r in order_rows if r.get("orderID") not in self.order_ids]
        for r in fresh_orders:
            self.order_ids.add(r.get("orderID"))
        fresh_trades = [r for r in trade_rows if r.get("execID") not in self.exec_ids]
        for r in fresh_trades:
            self.exec_ids.add(r.get("execID"))
        return (
            len(fresh_orders), len(order_rows) - len(fresh_orders),
            len(fresh_trades), len(trade_rows) - len(fresh_trades),
            len(summary_rows), 0,
        )


@pytest.fixture(autouse=True)
def _isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    settings = Settings(  # type: ignore[call-arg]
        storage_root=str(tmp_path), ib_flex_token="tok", ib_flex_query_id="qid",
    )
    monkeypatch.setattr(storage_module, "get_settings", lambda: settings)
    monkeypatch.setattr(flex_query_module, "get_settings", lambda: settings)
    get_storage.cache_clear()

    monkeypatch.setitem(__import__("sys").modules, "ib_async", _stub_ib_async())
    # _flex_date_range imports ib_async.flexreport.FLEXREPORT_URL only when this
    # env var is unset -- ib_async is faked here (no real flexreport submodule),
    # so pre-seed it the same way tests/core/test_flex_query_live_date.py does.
    monkeypatch.setenv("IB_FLEXREPORT_URL", "https://example.test/flex?")
    FakeReport.calls = []
    FakeReport.data_to_return = b""

    loader = FakeLoader()
    monkeypatch.setattr(service_module.flex_import, "load", loader)

    yield loader

    get_storage.cache_clear()


def _stub_ib_async() -> types.ModuleType:
    mod = types.ModuleType("ib_async")
    mod.FlexReport = FakeReport
    return mod


def _canonical_key(day: date) -> str:
    return f"trade-confirm/{day:%Y-%m}/ib_trades_{day:%Y%m%d}.xml"


# --- 1. Idempotency -----------------------------------------------------------------


def test_second_ingest_of_same_day_inserts_nothing(_isolate: FakeLoader) -> None:
    day = date(2026, 9, 15)
    FakeReport.data_to_return = _good_xml(day)

    first = ingest_day(day, now=datetime(2026, 9, 16, 10, 0, tzinfo=_ET))
    second = ingest_day(day, now=datetime(2026, 9, 16, 10, 0, tzinfo=_ET))

    assert first == (1, 0, 1, 0, 0, 0)
    assert second == (0, 1, 0, 1, 0, 0)  # 0 inserted, everything skipped as a dup
    assert _isolate.calls[0]["mode"] == "append"
    assert _isolate.calls[1]["mode"] == "append"


# --- 2. Write-only-on-valid -----------------------------------------------------------


def test_fail_envelope_leaves_no_canonical_key_or_tmp(_isolate: FakeLoader) -> None:
    day = date(2026, 9, 15)
    FakeReport.data_to_return = _FAIL_XML

    with pytest.raises(IngestFailed):
        ingest_day(day, now=datetime(2026, 9, 16, 10, 0, tzinfo=_ET))

    root = get_storage(Bucket.IB_FLEX)._root  # type: ignore[attr-defined]
    assert not (root / _canonical_key(day)).exists()
    assert list(root.rglob("*.tmp")) == []
    assert _isolate.calls == []  # load() never reached


# --- 3. Round-trip --------------------------------------------------------------------


def test_stored_fetcher_reads_back_what_was_ingested(_isolate: FakeLoader) -> None:
    day = date(2026, 9, 15)
    FakeReport.data_to_return = _good_xml(day)

    ingest_day(day, now=datetime(2026, 9, 16, 10, 0, tzinfo=_ET))

    rows = flex_query_module.StoredFetcher().fetch(day)
    assert len(rows.orders) == 1
    assert len(rows.fills) == 1
    assert rows.orders[0]["orderID"] == "111"
    assert rows.fills[0]["execID"] == "222"


# --- 4. The market-hours guard ---------------------------------------------------------


def test_guard_refuses_today_before_close_and_allows_after_or_for_past_days(
    _isolate: FakeLoader,
) -> None:
    today = date(2026, 9, 21)

    with pytest.raises(MarketStillOpen):
        ingest_day(today, now=datetime(2026, 9, 21, 17, 59, tzinfo=_ET))
    assert FakeReport.calls == []  # never even tried to download

    FakeReport.data_to_return = _good_xml(today)
    ingest_day(today, now=datetime(2026, 9, 21, 18, 0, tzinfo=_ET))
    assert len(FakeReport.calls) == 1

    yesterday = date(2026, 9, 20)
    FakeReport.data_to_return = _good_xml(yesterday)
    ingest_day(yesterday, now=datetime(2026, 9, 21, 10, 0, tzinfo=_ET))
    assert len(FakeReport.calls) == 2
