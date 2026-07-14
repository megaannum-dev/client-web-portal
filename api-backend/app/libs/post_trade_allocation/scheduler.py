"""Post-trade allocation scheduler — BE-8.

Env-gated weekday auto-run job, mirroring app/libs/allocation_matrix/scheduler.py.
Disabled by default (PTA_SCHEDULER_ENABLED=false) so start_scheduler() returns
None and app/main.py's lifespan skips cancellation at shutdown. The manual
POST route (BE-7) never imports from or checks this module — its availability
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


async def _scheduled_job() -> None:
    tz = ZoneInfo(PTA_SCHEDULER_TZ)
    # YYYY-MM-DD guard against double-fire within the same minute window
    fired_today: str | None = None
    target_h, target_m = (int(x) for x in PTA_SCHEDULER_TIME.split(":"))
    while True:
        await asyncio.sleep(_TICK_SECONDS)
        try:
            now = datetime.now(tz=tz)
            today_token = _WEEKDAY_TOKENS[now.weekday()]
            today_str = now.strftime("%Y-%m-%d")
            if (
                today_token in PTA_SCHEDULER_DAYS
                and now.hour == target_h
                and now.minute == target_m
                and fired_today != today_str
            ):
                await _run_scheduled()
                fired_today = today_str
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
    PTA_SCHEDULER_ENABLED — the manual POST route is NEVER gated by this flag."""
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
