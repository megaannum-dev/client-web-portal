"""Post-trade allocation scheduler — BE-1 scaffold.

Env-gated weekday auto-run job, mirroring app/libs/allocation_matrix/scheduler.py.
Real tick/env-gate logic lands in BE-8; for now start_scheduler() only needs to
be importable and callable, and — matching BE-8's disabled-by-default contract
— it returns None so app/main.py's lifespan can skip cancellation at shutdown.
"""

from __future__ import annotations

import asyncio


def start_scheduler() -> asyncio.Task | None:  # type: ignore[type-arg]
    """Registered from app/main.py lifespan. Real env-gated logic lands in BE-8."""
    return None
