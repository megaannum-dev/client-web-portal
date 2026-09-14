"""Assembles the three execution sources (CRM, IB, PC) into one view.

Each source is built lazily (a factory, not an instance) so that a source
which fails at *construction* time — IB when ``ib_flex_drop_root`` is unset,
see ``app.core.ib_flex.DropFetcher.__init__`` — degrades only that source
instead of 500ing the whole endpoint. See ``app.libs.reconciliation.sources``
for the seam contract.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Callable

from fastapi import HTTPException, status

from app.core.ib_flex import FlexUnavailable, get_fetcher
from app.libs.reconciliation.sources import SourceUnavailable
from app.libs.reconciliation.sources.crm import CrmSource
from app.libs.reconciliation.sources.ib import IbSource
from app.libs.reconciliation.sources.pc import PcSource
from app.schemas.unified_execution import UnifiedExecutionsViewOut

if TYPE_CHECKING:
    from collections.abc import Sequence
    from datetime import date

    from sqlalchemy.orm import Session

    from app.libs.reconciliation.sources import ExecutionSource
    from app.schemas.unified_execution import UnifiedExecutionRow

logger = logging.getLogger(__name__)

_ALL_SYSTEMS = ("CRM", "IB", "PC")

# Lazy on purpose — constructing IbSource(get_fetcher()) eagerly raises
# FlexUnavailable when IB is unconfigured, before CRM/PC ever run. Each
# factory is called only inside the try/except in _build_source below.
_FACTORIES: dict[str, Callable[[Session], ExecutionSource]] = {
    "CRM": lambda db: CrmSource(db),
    "PC": lambda db: PcSource(db),
    "IB": lambda db: IbSource(get_fetcher()),
}


def _sort_key(row: UnifiedExecutionRow) -> tuple:
    # None-safe: a missing trade_date/contract/group_ref/event_ts_utc must
    # sort, not raise. Executions follow their own order
    # (grain == "execution" -> True).
    return (
        row.trade_date is None,
        row.trade_date,
        row.contract or "",
        row.group_ref or "",
        row.grain == "execution",
        row.event_ts_utc is None,
        row.event_ts_utc,
    )


def _build_source(name: str, db: Session, warnings: list[str]) -> ExecutionSource | None:
    """Construct one source, degrading (fixed warning, never str(exc)) on failure."""
    try:
        return _FACTORIES[name](db)
    except (SourceUnavailable, FlexUnavailable):
        logger.exception("Reconciliation source %s unavailable (construction)", name)
        warnings.append(f"{name}: source unavailable")
        return None


def build_view(
    db: Session,
    *,
    day: date | None,
    systems: Sequence[str] | None,
    grain: str | None,
) -> UnifiedExecutionsViewOut:
    requested = list(systems) if systems else list(_ALL_SYSTEMS)
    warnings: list[str] = []
    failed: set[str] = set()

    sources: dict[str, ExecutionSource] = {}
    for name in requested:
        source = _build_source(name, db, warnings)
        if source is None:
            failed.add(name)
        else:
            sources[name] = source

    all_days: set[date] = set()
    for name, source in sources.items():
        try:
            all_days.update(source.days())
        except (SourceUnavailable, FlexUnavailable):
            logger.exception("Reconciliation source %s unavailable (days)", name)
            warnings.append(f"{name}: source unavailable")
            failed.add(name)

    days = sorted(all_days, reverse=True)
    resolved_day = day if day is not None else (days[0] if days else None)

    rows: list[UnifiedExecutionRow] = []
    if resolved_day is not None:
        for name in requested:
            source = sources.get(name)
            if name in failed or source is None:
                continue
            try:
                rows.extend(source.rows(resolved_day))
            except (SourceUnavailable, FlexUnavailable):
                logger.exception("Reconciliation source %s unavailable (rows)", name)
                warnings.append(f"{name}: source unavailable")
                failed.add(name)

    if requested and failed.issuperset(requested):
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "All requested reconciliation sources are unavailable",
        )

    rows.sort(key=_sort_key)
    if grain is not None:
        rows = [r for r in rows if r.grain == grain]

    return UnifiedExecutionsViewOut(day=resolved_day, days=days, rows=rows, warnings=warnings)
