"""Post-trade allocation scheduler â€” BE-8.

Env-gated weekday auto-run job, mirroring app/libs/allocation_matrix/scheduler.py.
Disabled by default (PTA_SCHEDULER_ENABLED=false) so start_scheduler() returns
None and app/main.py's lifespan skips cancellation at shutdown. The manual
POST route (BE-7) never imports from or checks this module â€” its availability
is unconditional (D-8).
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

_TICK_SECONDS = 60  # check every minute for the target HH:MM


def _env_bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes")


PTA_SCHEDULER_ENABLED = _env_bool("PTA_SCHEDULER_ENABLED", False)
PTA_SCHEDULER_TIME = os.getenv("PTA_SCHEDULER_TIME", "18:00")
PTA_SCHEDULER_TZ = os.getenv("PTA_SCHEDULER_TZ", "America/New_York")
PTA_SCHEDULER_DAYS = {
    d.strip().upper() for d in os.getenv("PTA_SCHEDULER_DAYS", "MON,TUE,WED,THU,FRI").split(",")
}
_WEEKDAY_TOKENS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
_TARGET_H, _TARGET_M = (int(x) for x in PTA_SCHEDULER_TIME.split(":"))


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


async def _run_scheduled() -> None:
    from app.core.database import SessionLocal
    from app.libs.post_trade_allocation.service import PostTradeAllocationService
    from app.models.post_trade_allocation import RunTrigger

    db = SessionLocal()
    try:
        PostTradeAllocationService(db).run(trigger=RunTrigger.SCHEDULED, actor=None)
        logger.info("PTA scheduler: run completed")
    except Exception:
        db.rollback()
        logger.exception("PTA scheduler: run failed")
    finally:
        db.close()


def start_scheduler() -> asyncio.Task | None:  # type: ignore[type-arg]
    """Registered from app/main.py lifespan. No-ops (returns None) unless
    PTA_SCHEDULER_ENABLED â€” the manual POST route is NEVER gated by this flag."""
    if not PTA_SCHEDULER_ENABLED:
        logger.info("PTA scheduler disabled (PTA_SCHEDULER_ENABLED=false)")
        return None
    task = asyncio.create_task(_scheduled_job(), name="pta_scheduler")
    logger.info(
        "PTA scheduler started: %s %s on %s",
        PTA_SCHEDULER_TIME,
        PTA_SCHEDULER_TZ,
        sorted(PTA_SCHEDULER_DAYS),
    )
    return task
