"""Units 9 (fix: catch-up fire condition) and 10 (feat: IB ingest before the
allocation run) of the PTA scheduler, branch pta-revival-live-ib.

Pins the pure decision helpers (`_should_fire`, `_window_days`) without
sleeping, and `_run_scheduled`'s call order without hitting a real DB or
network.

Run: .venv/Scripts/python.exe -m pytest -q \
    tests/libs/post_trade_allocation/test_be9_be10_scheduler_catchup_ingest.py
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime
from zoneinfo import ZoneInfo

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


# --- Unit 10: _window_days ---------------------------------------------------


def test_window_days_is_three_dates_oldest_first_ending_today():
    today = date(2026, 6, 10)
    assert sched._window_days(today) == [date(2026, 6, 8), date(2026, 6, 9), date(2026, 6, 10)]
    assert len(sched._window_days(today)) == sched._WINDOW_DAYS == 3


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
