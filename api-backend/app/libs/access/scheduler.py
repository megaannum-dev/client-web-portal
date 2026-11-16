"""Asyncio background scheduler that sweeps expired page-access overrides
(delete + `override.expired` audit row). Mirrors
app/libs/onboarding/scheduler.py's shape exactly: pure asyncio, no
apscheduler dependency, hourly tick wrapped in try/except Exception."""

from __future__ import annotations

import asyncio
import logging

logger = logging.getLogger(__name__)

_TICK_SECONDS = 3600  # hourly, matching the sibling schedulers


async def _override_expiry_job() -> None:
    while True:
        await asyncio.sleep(_TICK_SECONDS)
        try:
            await _sweep_expired_overrides()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Access override scheduler: unexpected error in tick")


async def _sweep_expired_overrides() -> None:
    from app.core.database import SessionLocal
    from app.libs.access.service import AccessService

    db = SessionLocal()
    try:
        count = AccessService(db).expire_overrides()
        if count > 0:
            logger.info("Access override scheduler: expired %d override(s)", count)
    finally:
        db.close()


def start_scheduler() -> asyncio.Task:  # type: ignore[type-arg]
    task = asyncio.create_task(_override_expiry_job(), name="access_override_expiry_scheduler")
    logger.info("Access override expiry scheduler started (tick every %d s)", _TICK_SECONDS)
    return task
