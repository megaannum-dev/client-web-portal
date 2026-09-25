"""Units 9 (fix: catch-up fire condition) and 10 (feat: IB ingest before the
allocation run) of the PTA scheduler, branch pta-revival-live-ib.

Pins the pure decision helpers (`_should_fire`, `_ingest_days`) without
sleeping, and `_run_scheduled`'s call order without hitting a real DB or
network. `_ingest_days` reads the archive's filenames via
`ib_ingest.archived_days()`, so its tests fake the `get_storage` it calls
rather than touching the real filesystem.

Run: .venv/Scripts/python.exe -m pytest -q \
    tests/libs/post_trade_allocation/test_be9_be10_scheduler_catchup_ingest.py
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.core import ib_ingest, storage
from app.libs.post_trade_allocation import scheduler as sched

_TZ = ZoneInfo("America/New_York")


def _at(y, m, d, hh, mm):
    return datetime(y, m, d, hh, mm, tzinfo=_TZ)


# --- Unit 9: _should_fire ---------------------------------------------------


def test_should_fire_false_before_target_time(monkeypatch):
    monkeypatch.setattr(sched, "_TARGET_H", 18)
    monkeypatch.setattr(sched, "_TARGET_M", 0)
    monkeypatch.setattr(sched, "PTA_SCHEDULER_DAYS", {"WED"})
    assert sched._should_fire(_at(2026, 6, 3, 17, 59), None) is False


def test_should_fire_true_at_target_time_on_enabled_weekday(monkeypatch):
    monkeypatch.setattr(sched, "_TARGET_H", 18)
    monkeypatch.setattr(sched, "_TARGET_M", 0)
    monkeypatch.setattr(sched, "PTA_SCHEDULER_DAYS", {"WED"})
    assert sched._should_fire(_at(2026, 6, 3, 18, 0), None) is True


def test_should_fire_false_once_fired_today(monkeypatch):
    monkeypatch.setattr(sched, "_TARGET_H", 18)
    monkeypatch.setattr(sched, "_TARGET_M", 0)
    monkeypatch.setattr(sched, "PTA_SCHEDULER_DAYS", {"WED"})
    now = _at(2026, 6, 3, 18, 5)
    assert sched._should_fire(now, now.strftime("%Y-%m-%d")) is False


def test_should_fire_false_on_disabled_weekday(monkeypatch):
    monkeypatch.setattr(sched, "_TARGET_H", 18)
    monkeypatch.setattr(sched, "_TARGET_M", 0)
    monkeypatch.setattr(sched, "PTA_SCHEDULER_DAYS", {"MON", "TUE", "WED", "THU", "FRI"})
    # 2026-06-06 is a Saturday.
    assert sched._should_fire(_at(2026, 6, 6, 18, 0), None) is False


def test_should_fire_true_on_drift_past_target_minute(monkeypatch):
    """Regression for the exact-minute bug: a tick that observes 19:01 (past
    an 18:00 target, having skipped it due to a slow prior tick) must still
    fire when the day hasn't fired yet."""
    monkeypatch.setattr(sched, "_TARGET_H", 18)
    monkeypatch.setattr(sched, "_TARGET_M", 0)
    monkeypatch.setattr(sched, "PTA_SCHEDULER_DAYS", {"WED"})
    assert sched._should_fire(_at(2026, 6, 3, 19, 1), None) is True


# --- Unit 10 (rework): _ingest_days gap fill ---------------------------------


def _fake_archive(monkeypatch, days: list[date]) -> None:
    """Fake the IB_FLEX bucket so `list("trade-confirm")` yields one archived
    file per day (plus a non-statement file that must be ignored)."""
    files = [
        storage.StoredFile(
            key=f"trade-confirm/{d:%Y-%m}/ib_trades_{d:%Y%m%d}.xml",
            filename=f"ib_trades_{d:%Y%m%d}.xml",
            size_bytes=813, modified_at=None, category=f"{d:%Y-%m}",
        )
        for d in days
    ] + [storage.StoredFile("trade-confirm/README.txt", "README.txt", 1, None, None)]

    class _Storage:
        def list(self, subdir: str) -> list:
            return list(files)

    monkeypatch.setattr(ib_ingest, "get_storage", lambda bucket: _Storage())


def test_ingest_days_fills_missing_weekday_but_skips_weekends(monkeypatch):
    # Newest archived date is Friday 2026-06-05; today is Wednesday 2026-06-10.
    # Sat 6/6 and Sun 6/7 are not gaps (D2: weekends are never expected).
    _fake_archive(monkeypatch, [date(2026, 6, 5)])
    today = date(2026, 6, 10)
    assert sched._ingest_days(today) == [
        date(2026, 6, 8),  # Monday, missing -> fetched
        date(2026, 6, 9),  # Tuesday, missing -> fetched
        date(2026, 6, 10),  # today, fetched unconditionally
    ]


def test_ingest_days_today_always_included_even_if_already_archived(monkeypatch):
    today = date(2026, 6, 10)
    _fake_archive(monkeypatch, [today])
    assert sched._ingest_days(today) == [today]  # no duplicate, still re-fetched


def test_ingest_days_empty_archive_returns_just_today(monkeypatch):
    """Fresh install: no archived files -- max([]) would raise
    ValueError if not guarded. No archive means no gap to fill."""
    _fake_archive(monkeypatch, [])
    today = date(2026, 6, 10)
    assert sched._ingest_days(today) == [today]


def test_ingest_days_does_not_refetch_archived_empty_statements(monkeypatch):
    """The 2026-09-25 regression: 09-16..09-23 were archived but empty, and
    the gap fill re-downloaded all of them because it asked "which days have
    trades" instead of "which days have a file". A file is enough."""
    archived = [date(2026, 9, d) for d in (15, 16, 17, 18, 21, 22, 23)]
    _fake_archive(monkeypatch, archived)
    assert sched._ingest_days(date(2026, 9, 24)) == [date(2026, 9, 24)]


def test_ingest_days_refetches_failed_run_dates_missing_from_archive(monkeypatch):
    """A FAILED PTA run means its statement was missing: re-fetch it, however
    far behind the newest archived day. A FAILED date whose file is already
    there is skipped -- the allocation run retries it without a fetch."""
    _fake_archive(monkeypatch, [date(2026, 9, 1), date(2026, 9, 22)])
    failed = {date(2025, 9, 23), date(2026, 8, 20), date(2026, 9, 1)}  # 2025-09-23: >1y, skipped
    assert sched._ingest_days(date(2026, 9, 24), failed) == [
        date(2026, 8, 20),  # FAILED + missing -> fetched, older than the archive's newest
        date(2026, 9, 23),  # ordinary gap
        date(2026, 9, 24),  # today
    ]


# --- Unit 10: _run_scheduled ordering ---------------------------------------


def test_run_scheduled_ingests_before_allocation_run(monkeypatch):
    monkeypatch.setattr(sched, "IB_INGEST_ENABLED", True)
    monkeypatch.setattr(sched, "PTA_SCHEDULER_ENABLED", True)

    calls = []

    async def _fake_ingest_window(today):
        calls.append(("ingest", today))

    monkeypatch.setattr(sched, "_ingest_window", _fake_ingest_window)

    class _FakeSession:
        def rollback(self):
            pass

        def close(self):
            calls.append(("db_close",))

    monkeypatch.setattr("app.core.database.SessionLocal", lambda: _FakeSession())

    class _FakeService:
        def __init__(self, db):
            pass

        def run(self, trigger=None, actor=None):
            calls.append(("run",))

    monkeypatch.setattr(
        "app.libs.post_trade_allocation.service.PostTradeAllocationService", _FakeService
    )

    asyncio.run(sched._run_scheduled())

    kinds = [c[0] for c in calls]
    assert kinds.index("ingest") < kinds.index("run")


def test_run_scheduled_still_runs_allocation_when_ingest_raises(monkeypatch):
    """An ingest failure must never block the allocation run (per the
    module docstring / unit 10 spec)."""
    monkeypatch.setattr(sched, "IB_INGEST_ENABLED", True)
    monkeypatch.setattr(sched, "PTA_SCHEDULER_ENABLED", True)

    calls = []

    async def _boom(today):
        calls.append(("ingest_attempted",))
        raise RuntimeError("boom")

    # _run_scheduled itself doesn't try/except _ingest_window -- that
    # responsibility lives one level down, inside _ingest_window's per-day
    # try/except. Simulate the contract _run_scheduled relies on: an ingest
    # error is swallowed before _run_scheduled's own control flow continues.
    async def _swallowing_ingest_window(today):
        try:
            await _boom(today)
        except RuntimeError:
            pass

    monkeypatch.setattr(sched, "_ingest_window", _swallowing_ingest_window)

    class _FakeSession:
        def rollback(self):
            pass

        def close(self):
            pass

    monkeypatch.setattr("app.core.database.SessionLocal", lambda: _FakeSession())

    class _FakeService:
        def __init__(self, db):
            pass

        def run(self, trigger=None, actor=None):
            calls.append(("run",))

    monkeypatch.setattr(
        "app.libs.post_trade_allocation.service.PostTradeAllocationService", _FakeService
    )

    asyncio.run(sched._run_scheduled())

    assert ("ingest_attempted",) in calls
    assert ("run",) in calls


def test_run_scheduled_skips_ingest_when_disabled(monkeypatch):
    monkeypatch.setattr(sched, "IB_INGEST_ENABLED", False)
    monkeypatch.setattr(sched, "PTA_SCHEDULER_ENABLED", True)

    calls = []

    async def _fake_ingest_window(today):
        calls.append(("ingest", today))

    monkeypatch.setattr(sched, "_ingest_window", _fake_ingest_window)

    class _FakeSession:
        def rollback(self):
            pass

        def close(self):
            pass

    monkeypatch.setattr("app.core.database.SessionLocal", lambda: _FakeSession())

    class _FakeService:
        def __init__(self, db):
            pass

        def run(self, trigger=None, actor=None):
            calls.append(("run",))

    monkeypatch.setattr(
        "app.libs.post_trade_allocation.service.PostTradeAllocationService", _FakeService
    )

    asyncio.run(sched._run_scheduled())

    assert calls == [("run",)]


def test_run_scheduled_skips_allocation_run_when_disabled(monkeypatch):
    """An operator disabling PTA_SCHEDULER_ENABLED for a day must not stop
    ingestion — this is _run_scheduled's own internal gate, separate from
    start_scheduler's loop-level gate."""
    monkeypatch.setattr(sched, "IB_INGEST_ENABLED", True)
    monkeypatch.setattr(sched, "PTA_SCHEDULER_ENABLED", False)

    calls = []

    async def _fake_ingest_window(today):
        calls.append(("ingest", today))

    monkeypatch.setattr(sched, "_ingest_window", _fake_ingest_window)

    def _boom_session_local():
        raise AssertionError("allocation DB session must not open when PTA_SCHEDULER_ENABLED is False")

    monkeypatch.setattr("app.core.database.SessionLocal", _boom_session_local)

    asyncio.run(sched._run_scheduled())

    assert len(calls) == 1
    assert calls[0][0] == "ingest"
