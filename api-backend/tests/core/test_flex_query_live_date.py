"""LiveFetcher asks the Flex Web Service for one specific date."""

from __future__ import annotations

import os
from datetime import date

from app.core import flex_query

BASE = "https://example.test/flex?"


def _row(**fields: str) -> object:
    """Stand-in for ib_async.objects.DynamicObject: attributes, no mapping API."""
    obj = type("Order", (), {})()
    obj.__dict__.update(fields)
    return obj


class FakeReport:
    """Captures the URL ib_async would have built at download time."""

    calls: list[str] = []

    def __init__(self, token: str, query_id: str) -> None:
        FakeReport.calls.append(f"{os.environ['IB_FLEXREPORT_URL']}t={token}&q={query_id}&v=3")

    def extract(self, topic: str, parseNumbers: bool = True) -> list[object]:
        # ib_async hands back DynamicObjects, not dicts — that is what broke prod.
        return [_row(tradeDate="20260914"), _row(tradeDate="20260915")]


def _fetcher(monkeypatch) -> flex_query.LiveFetcher:
    monkeypatch.setenv("IB_FLEXREPORT_URL", BASE)
    monkeypatch.setattr(
        flex_query, "_download_flex_report", _uncached(flex_query._download_flex_report)
    )
    FakeReport.calls = []
    return flex_query.LiveFetcher("tok", "qid", 900)


def _uncached(cached):  # each test gets a cold cache
    return cached.__wrapped__


def test_fetch_sends_date_range_and_filters(monkeypatch) -> None:
    fetcher = _fetcher(monkeypatch)
    monkeypatch.setitem(__import__("sys").modules, "ib_async", _stub_module(FakeReport))

    rows = fetcher.fetch(date(2026, 9, 15))

    assert all("fd=20260915&td=20260915&" in url for url in FakeReport.calls)
    assert [r["tradeDate"] for r in rows.orders] == ["20260915"]
    assert [r["tradeDate"] for r in rows.fills] == ["20260915"]
    assert os.environ["IB_FLEXREPORT_URL"] == BASE  # restored


def test_days_sends_no_date_range(monkeypatch) -> None:
    fetcher = _fetcher(monkeypatch)
    monkeypatch.setitem(__import__("sys").modules, "ib_async", _stub_module(FakeReport))

    days = fetcher.days()

    assert FakeReport.calls == [f"{BASE}t=tok&q=qid&v=3"]
    assert days == [date(2026, 9, 15), date(2026, 9, 14)]


def test_cache_is_per_day(monkeypatch) -> None:
    flex_query._download_flex_report.cache_clear()
    monkeypatch.setenv("IB_FLEXREPORT_URL", BASE)
    monkeypatch.setitem(__import__("sys").modules, "ib_async", _stub_module(FakeReport))
    FakeReport.calls = []
    fetcher = flex_query.LiveFetcher("tok", "qid", 900)

    fetcher.fetch(date(2026, 9, 15))  # Order + TradeConfirm share one download
    fetcher.fetch(date(2026, 9, 14))

    assert len(FakeReport.calls) == 2
    flex_query._download_flex_report.cache_clear()


def _stub_module(report_cls):
    import types

    mod = types.ModuleType("ib_async")
    mod.FlexReport = report_cls
    return mod
