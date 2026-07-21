"""BE-7 -- asyncio background scheduler that reopens a client's onboarding row
for renewal when a periodic-review document nears expires_at. Mirrors
app/libs/allocation_matrix/scheduler.py's shape exactly: pure asyncio, no
apscheduler dependency, hourly tick wrapped in try/except Exception."""

from __future__ import annotations

import asyncio
import logging
import os
from collections import defaultdict

logger = logging.getLogger(__name__)

_TICK_SECONDS = 3600  # hourly, matching the sibling schedulers
_RENEWAL_LOOKAHEAD_DAYS = max(0, int(os.getenv("ONBOARDING_RENEWAL_LOOKAHEAD_DAYS", "30")))


async def _renewal_check_job() -> None:
    while True:
        await asyncio.sleep(_TICK_SECONDS)
        try:
            await _trigger_due_renewals()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Onboarding scheduler: unexpected error in tick")


async def _trigger_due_renewals() -> None:
    from app.core.database import SessionLocal
    from app.libs.onboarding.repository import OnboardingRepository
    from app.libs.onboarding.service import OnboardingService

    db = SessionLocal()
    try:
        repo = OnboardingRepository(db)
        due_docs = repo.due_for_renewal(_RENEWAL_LOOKAHEAD_DAYS)
        by_onboarding = defaultdict(list)
        for doc in due_docs:
            by_onboarding[doc.onboarding_id].append(doc)

        svc = OnboardingService(db)
        for onboarding_id, docs in by_onboarding.items():
            onboarding = repo.get_by_id(onboarding_id)
            if onboarding is None:
                continue
            labels = ", ".join(sorted({d.doc_type for d in docs}))
            svc.reopen_for_renewal(
                onboarding.user_id, due_docs=docs, reason=f"Periodic review due: {labels}"
            )
            logger.info(
                "Onboarding scheduler: reopened user %s for renewal (%s)",
                onboarding.user_id,
                labels,
            )
    finally:
        db.close()


def start_scheduler() -> asyncio.Task:  # type: ignore[type-arg]
    task = asyncio.create_task(_renewal_check_job(), name="onboarding_renewal_scheduler")
    logger.info("Onboarding renewal scheduler started (tick every %d s)", _TICK_SECONDS)
    return task
