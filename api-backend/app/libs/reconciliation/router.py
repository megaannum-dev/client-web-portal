from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.libs.auth.actions import Action
from app.libs.auth.deps import require_action
from app.libs.reconciliation.service import build_view as build_unified_view
from app.models.users import User
from app.schemas.unified_execution import UnifiedExecutionsViewOut

router = APIRouter(prefix="/mobo", tags=["mobo"])


@router.get("/executions", response_model=UnifiedExecutionsViewOut)
def get_executions(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_action(Action.RECON_VIEW))],
    day: date | None = None,
) -> UnifiedExecutionsViewOut:
    """Unified CRM+IB+PC executions for one ET session date.

    `day` is a real ISO date (YYYY-MM-DD), unlike the legacy `/trade-records`
    route's raw YYYYMMDD token — FastAPI validates it. Day-scoping is on each
    row's `trade_date` (the ET session date), not `txn_time_utc`. Omitted ->
    the latest day across all sources.

    Always queries all three sources (CRM+IB+PC) at every grain. If a source
    can't be read it's dropped with a fixed warning and the response stays
    200 — unless EVERY source failed, in which case this raises 502 (an
    empty 200 there would misleadingly read as "nothing traded"). Empty
    `rows` on a real day is otherwise a normal 200, not a 404.
    """
    return build_unified_view(db, day=day)
