"""Post-trade allocation scheduler — BE-8.

Env-gated weekday auto-run job, mirroring app/libs/allocation_matrix/scheduler.py.
Two independent gates: IB_INGEST_ENABLED (default true) and
PTA_SCHEDULER_ENABLED (default false) -- the loop starts if either is on, and
each half of _run_scheduled checks its own flag. The manual POST route (BE-7)
never imports from or checks this module — its availability is unconditional
(D-8).
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

_TICK_SECONDS = 60  # check every minute for the target HH:MM


def _env_bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes")


PTA_SCHEDULER_ENABLED = _env_bool("PTA_SCHEDULER_ENABLED", False)
IB_INGEST_ENABLED = _env_bool("IB_INGEST_ENABLED", True)
PTA_SCHEDULER_TIME = os.getenv("PTA_SCHEDULER_TIME", "18:00")
PTA_SCHEDULER_TZ = os.getenv("PTA_SCHEDULER_TZ", "America/New_York")
PTA_SCHEDULER_DAYS = {
    d.strip().upper() for d in os.getenv("PTA_SCHEDULER_DAYS", "MON,TUE,WED,THU,FRI").split(",")
}
_WEEKDAY_TOKENS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
_TARGET_H, _TARGET_M = (int(x) for x in PTA_SCHEDULER_TIME.split(":"))

# today, today-1, today-2 in PTA_SCHEDULER_TZ, oldest first. Not a retry
# mechanism -- it's the mitigation for three overlapping gaps at once: a
# missed tick or a restart that skipped a day, a transient IB 5xx, and IB
# amending/correcting confirms overnight (US extended hours run to 20:00 ET,
# past this job's typical 18:00 pull, so today's own pull is provisional).
# Re-ingesting is free: flex_load.load dedups on orders.orderID/trades.execID,
# so re-fetching an already-loaded day inserts zero rows.
_WINDOW_DAYS = 3


def _should_fire(now: datetime, fired_today: str | None) -> bool:
    """True when `now` is on an enabled weekday at/after the target time and
    that day hasn't fired yet.

    Catch-up, not exact-minute match: the old condition required
    `now.minute == target_m`, but the tick loop does `sleep(60)` and only
    THEN checks, so each tick's phase drifts by however long that tick's own
    work took. Once a job runs long inside a tick (e.g. a tens-of-seconds
    ingest), a later tick can land at 19:01 having skipped 18:00 entirely --
    missing the target minute for the rest of the day. A process restart just
    after the target minute has the same problem. `>=` fixes both: any tick
    from the target time onward fires, and `fired_today` still guards against
    firing twice.

    Consequence to note: with catch-up semantics, a process that starts at
    23:00 on an enabled weekday fires immediately for that day (better late
    than skipped -- this is intended), but the `fired_today` guard stops it
    firing again on the next tick.

    ponytail: `fired_today` is in-memory, so a restart after the target time
    re-fires for a day that already ran -- catch-up makes that more likely
    than the old exact-minute condition did. Harmless today (the ingest is
    idempotent, and the allocation run finds no unallocated orders and writes
    an EMPTY run), so the cost is a spare run row. Persist the last fired day
    if that ever matters.
    """
    today_token = _WEEKDAY_TOKENS[now.weekday()]
    today_str = now.strftime("%Y-%m-%d")
    if today_token not in PTA_SCHEDULER_DAYS or fired_today == today_str:
        return False
    return (now.hour, now.minute) >= (_TARGET_H, _TARGET_M)


def _window_days(today: date) -> list[date]:
    """The `_WINDOW_DAYS` calendar days ending at `today`, oldest first."""
    return [today - timedelta(days=n) for n in range(_WINDOW_DAYS - 1, -1, -1)]


async def _scheduled_job() -> None:
    tz = ZoneInfo(PTA_SCHEDULER_TZ)
    # YYYY-MM-DD guard against firing twice on the same day
    fired_today: str | None = None
    while True:
        await asyncio.sleep(_TICK_SECONDS)
        try:
            now = datetime.now(tz=tz)
            if _should_fire(now, fired_today):
                await _run_scheduled()
                fired_today = now.strftime("%Y-%m-%d")
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("PTA scheduler: unexpected error in tick")


async def _ingest_window(today: date) -> None:
    """Ingest the `_WINDOW_DAYS`-day catch-up window, oldest first, each day
    in its own try/except so one bad day doesn't stop the others -- and so an
    ingest failure never blocks the allocation run that follows."""
    from app.core.ib_flex import FlexUnavailable
    from app.libs.ib_ingest.service import IngestFailed, MarketStillOpen, ingest_day

    for day in _window_days(today):
        try:
            # Synchronous HTTP download + full XML parse + batched inserts --
            # off the event loop or it blocks every API request and the
            # container healthcheck for the whole duration.
            await asyncio.to_thread(ingest_day, day)
        except MarketStillOpen:
            # Operator moved the schedule earlier than market close -- not a
            # bug, nothing to fix.
            logger.info("PTA scheduler: %s not ingested — market still open", day)
        except FlexUnavailable:
            logger.warning("PTA scheduler: IB Flex unavailable for %s", day, exc_info=True)
        except IngestFailed:
            logger.error("PTA scheduler: ingest failed for %s", day, exc_info=True)
        except Exception:
            logger.exception("PTA scheduler: unexpected error ingesting %s", day)


async def _run_scheduled() -> None:
    # Ingest strictly before the allocation run opens its DB session: the run
    # reads unallocated_orders(after=period.confirmed_at) from `orders`, and
    # flex_load.load commits its own engine.begin() transaction, so this
    # ordering keeps the run's REPEATABLE READ snapshot from ever opening in
    # front of the ingest's commit.
    if IB_INGEST_ENABLED:
        tz = ZoneInfo(PTA_SCHEDULER_TZ)
        await _ingest_window(datetime.now(tz=tz).date())

    if not PTA_SCHEDULER_ENABLED:
        return

    from app.core.database import SessionLocal
    from app.libs.post_trade_allocation.service import PostTradeAllocationService
    from app.models.post_trade_allocation import RunTrigger

    db = SessionLocal()
    try:
        # Synchronous service call -- off the event loop, same reason as the
        # ingest above. Pre-existing problem, unnoticed only because this run
        # ships disabled by default; fixed here alongside the ingest.
        await asyncio.to_thread(
            PostTradeAllocationService(db).run, trigger=RunTrigger.SCHEDULED, actor=None
        )
        logger.info("PTA scheduler: run completed")
    except Exception:
        db.rollback()
        logger.exception("PTA scheduler: run failed")
    finally:
        db.close()


def start_scheduler() -> asyncio.Task | None:  # type: ignore[type-arg]
    """Registered from app/main.py lifespan. Starts when IB_INGEST_ENABLED
    (default true) or PTA_SCHEDULER_ENABLED (default false) is set; no-ops
    (returns None) only when both are false. Gated separately so disabling
    the allocation run for a day never silently stops data ingestion -- every
    endpoint would keep returning 200 with stale data. The manual POST route
    is NEVER gated by either flag."""
    if not (IB_INGEST_ENABLED or PTA_SCHEDULER_ENABLED):
        logger.info(
            "PTA scheduler disabled (IB_INGEST_ENABLED=false, PTA_SCHEDULER_ENABLED=false)"
        )
        return None
    task = asyncio.create_task(_scheduled_job(), name="pta_scheduler")
    logger.info(
        "PTA scheduler started: %s %s on %s (ingest=%s, allocation=%s)",
        PTA_SCHEDULER_TIME,
        PTA_SCHEDULER_TZ,
        sorted(PTA_SCHEDULER_DAYS),
        IB_INGEST_ENABLED,
        PTA_SCHEDULER_ENABLED,
    )
    return task
