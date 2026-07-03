"""BE-7 — asyncio background scheduler for auto-opening monthly allocation periods.

Registered at app startup in app/main.py.  No apscheduler dependency — pure
asyncio.  The job fires once per hour and checks whether the calendar month has
changed since the last run; if so it calls the service to open a new period.

The single-open invariant is enforced by AllocationService.create_period: if
the prior period is still unconfirmed the call raises HTTP 409, which we catch
and log — no second open period is ever created.
"""

from __future__ import annotations

import asyncio
import calendar
import logging
import os
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_TICK_SECONDS = 3600  # check every hour
# Auto-open fires when (last day of month - N) is reached. Default N=9 → e.g.
# opens July 22 for a 31-day July. Override with PC_PERIOD_OPEN_DAYS_BEFORE_END.
_OPEN_DAYS_BEFORE_END = max(0, int(os.getenv("PC_PERIOD_OPEN_DAYS_BEFORE_END", "9")))


async def _auto_open_job() -> None:
    """Background task body: wait for next tick, open a period if month boundary crossed."""
    last_month: int | None = None

    while True:
        await asyncio.sleep(_TICK_SECONDS)
        try:
            now = datetime.now(tz=timezone.utc)
            current_month = now.year * 100 + now.month  # e.g. 202601

            days_in_month = calendar.monthrange(now.year, now.month)[1]
            days_left = days_in_month - now.day
            if days_left <= _OPEN_DAYS_BEFORE_END and (last_month is None or current_month != last_month):
                label = now.strftime("%Y-%m")
                await _try_open_period(label)
                last_month = current_month
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("PC scheduler: unexpected error in tick")


async def _try_open_period(label: str) -> None:
    """Attempt to open a new period; skip gracefully if one is already open."""
    # Import here to avoid circular imports at module load time.
    from app.core.database import SessionLocal
    from app.libs.allocation_matrix.service import AllocationService

    db = SessionLocal()
    try:
        svc = AllocationService(db)
        svc.create_period(label)
        logger.info("PC scheduler: auto-opened allocation period '%s'", label)
    except Exception as exc:
        if "already exists" in str(exc) or getattr(exc, "status_code", None) == 409:
            logger.info("PC scheduler: skipping — open period already exists")
        else:
            db.rollback()
            logger.exception("PC scheduler: failed to auto-open period '%s'", label)
    finally:
        db.close()


def start_scheduler() -> asyncio.Task:  # type: ignore[type-arg]
    """Register the background task in the running event loop. Call from lifespan."""
    task = asyncio.create_task(_auto_open_job(), name="pc_period_scheduler")
    logger.info("PC scheduler started (tick every %d s)", _TICK_SECONDS)
    return task
