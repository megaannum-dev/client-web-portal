from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.libs.auth.actions import Action
from app.libs.auth.deps import require_action
from app.libs.reconciliation.records import build_view
from app.libs.reconciliation.unified import build_view as build_unified_view
from app.models.users import User
from app.schemas.reconciliation import TradeRecordsViewOut
from app.schemas.unified_execution import UnifiedExecutionsViewOut

router = APIRouter(prefix="/mobo", tags=["mobo"])


@router.get("/trade-records", response_model=TradeRecordsViewOut)
def get_trade_records(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_action(Action.RECON_VIEW))],
    date: str | None = None,
) -> object:
    """Flat orders+executions spreadsheet for one day. Display only — no recon.

    `date` is a raw IB day token ('YYYYMMDD'), matched against the date prefix
    of `dateTime`. Omitted -> the latest day present. A day with no orders is
    an empty `rows` list, not a 404: "nothing traded" is a real answer.
    """
    if date is not None and (len(date) != 8 or not date.isdigit()):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "date must be a YYYYMMDD token")
    return build_view(db, date)


@router.get("/executions", response_model=UnifiedExecutionsViewOut)
def get_executions(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_action(Action.RECON_VIEW))],
    day: date | None = None,
    system: Annotated[list[Literal["CRM", "IB", "PC"]] | None, Query()] = None,
    grain: Literal["order", "execution"] | None = None,
) -> UnifiedExecutionsViewOut:
    """Unified CRM+IB+PC executions for one ET session date.

    `day` is a real ISO date (YYYY-MM-DD), unlike the legacy `/trade-records`
    route's raw YYYYMMDD token — FastAPI validates it. Day-scoping is on each
    row's `trade_date` (the ET session date), not `event_ts_utc`. Omitted ->
    the latest day across all requested sources.

    `system` is repeatable (`?system=CRM&system=PC`) and defaults to all
    three; pass it to skip a slow or unconfigured source. If a requested
    source can't be read it's dropped with a fixed warning and the response
    stays 200 — unless EVERY requested source failed, in which case this
    raises 502 (an empty 200 there would misleadingly read as "nothing
    traded"). Empty `rows` on a real day is otherwise a normal 200, not a 404.
    """
    return build_unified_view(db, day=day, systems=system, grain=grain)
