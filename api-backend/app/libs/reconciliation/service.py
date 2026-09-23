"""Assembles the three execution sources (CRM, IB, PC) into one view.

Each source is built lazily (a factory, not an instance) so that a source
which fails at *construction* time — e.g. IB when the Flex transport is
misconfigured, see ``app.core.ib_flex.get_fetcher`` — degrades only that
source instead of 500ing the whole endpoint. See
``app.libs.reconciliation.sources`` for the seam contract.

REDUCED GUARANTEE, since the IB statements are now produced by our own
scheduled ingest rather than dropped in by an external party: the CRM side
(``orders``/``trades``) and the IB side (the stored XML) come from ONE fetch.
A CRM↔IB agreement therefore proves only that parsing and loading worked —
it can no longer prove IB had no trades we failed to fetch, because a
truncated or silently empty statement makes both sides agree on the same
wrong answer. Do not read a green reconciliation as proof of completeness;
PC↔IB is the comparison that still carries that information.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Callable

from fastapi import HTTPException, status

from app.core.ib_flex import FlexUnavailable, get_fetcher
from app.libs.reconciliation._reconcile import reconcile
from app.libs.reconciliation._tree import build_trades
from app.libs.reconciliation.sources import SourceUnavailable
from app.libs.reconciliation.sources._transform import asset_class
from app.libs.reconciliation.sources.crm import CrmSource
from app.libs.reconciliation.sources.ib import IbSource
from app.libs.reconciliation.sources.pc import PcSource
from app.schemas.unified_execution import UnifiedExecutionsViewOut

if TYPE_CHECKING:
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
) -> UnifiedExecutionsViewOut:
    requested = list(_ALL_SYSTEMS)
    warnings: list[str] = []
    failed: set[str] = set()

    sources: dict[str, ExecutionSource] = {}
    for name in requested:
        source = _build_source(name, db, warnings)
        if source is None:
            failed.add(name)
        else:
            sources[name] = source

    # Kept per source, not just unioned: which days a source COVERS is what makes
    # an absent record meaningful. The CRM tables carry months the IB drop
    # directory never had, and calling every one of those rows "missing on IB"
    # would drown the real breaks.
    days_by_source: dict[str, set[date]] = {}
    for name, source in sources.items():
        try:
            days_by_source[name] = set(source.days())
        except (SourceUnavailable, FlexUnavailable):
            logger.exception("Reconciliation source %s unavailable (days)", name)
            warnings.append(f"{name}: source unavailable")
            failed.add(name)

    days = sorted(set().union(*days_by_source.values()) if days_by_source else set(), reverse=True)
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

    # Fold each source's raw (asset_cat, sub_cat) into canonical values HERE,
    # after every source has reported, rather than duplicating the same
    # asset_class() call in three mappers -- one place to update the rules,
    # one place a new vendor dialect needs a line added.
    for r in rows:
        r.asset_cat, r.sub_cat = asset_class(r.asset_cat, r.sub_cat)
    trades = build_trades(rows)

    # Reconcile only against sources that both loaded AND cover this day. A degraded
    # source must never read as "missing everywhere" (that is what `warnings`
    # reports), and neither must one whose data simply does not reach this day.
    covered = {
        name
        for name in sources
        if name not in failed and resolved_day in days_by_source.get(name, ())
    }
    recon = reconcile(trades, covered)

    return UnifiedExecutionsViewOut(
        day=resolved_day, days=days, trades=trades, warnings=warnings, recon=recon
    )
