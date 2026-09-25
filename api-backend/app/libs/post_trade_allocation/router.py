"""Post-trade allocation router — routes land here (BE-7).

Thin HTTP boundary, mirroring app/libs/allocation_matrix/router.py.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.libs.auth.actions import Action
from app.libs.auth.deps import require_action
from app.libs.post_trade_allocation.service import (
    PostTradeAllocationService,
    _format_date,
)
from app.models.post_trade_allocation import RunTrigger
from app.models.users import User
from app.schemas.post_trade_allocation import (
    PostTradeAllocationView,
    PtaHistoryOut,
    PtaRunListEntryOut,
    PtaRunListOut,
    PtaRunResultOut,
)

router = APIRouter(prefix="/mobo", tags=["mobo"])


def _get_service(db: Annotated[Session, Depends(get_db)]) -> PostTradeAllocationService:
    return PostTradeAllocationService(db)


@router.get("/post-trade-allocation", response_model=PostTradeAllocationView)
def get_post_trade_allocation(
    service: Annotated[PostTradeAllocationService, Depends(_get_service)],
    _: Annotated[User, Depends(require_action(Action.POST_TRADE_ALLOCATION_VIEW))],
    date: str | None = None,
) -> object:
    view = service.get_view(date)
    if view is None:
        # BE-10 row 9: "no data for that date" is a normal empty render, not a 404 —
        # synthesize the empty view here (mirrors the POST-handler pattern below),
        # echoing the requested date back (today's, if none was requested).
        raw_date = date.replace("-", "") if date else datetime.now(timezone.utc).strftime("%Y%m%d")
        view = PostTradeAllocationView(
            tradeDate=_format_date(raw_date),
            grandTotal=0.0,
            models=[],
        )
    return view


@router.get("/post-trade-allocation/runs", response_model=PtaRunListOut)
def list_post_trade_allocation_runs(
    service: Annotated[PostTradeAllocationService, Depends(_get_service)],
    _: Annotated[User, Depends(require_action(Action.POST_TRADE_ALLOCATION_VIEW))],
    includeEmpty: bool = False,
) -> object:
    return service.list_runs(include_empty=includeEmpty)


@router.get("/post-trade-allocation/history", response_model=PtaHistoryOut)
def get_post_trade_allocation_history(
    service: Annotated[PostTradeAllocationService, Depends(_get_service)],
    _: Annotated[User, Depends(require_action(Action.POST_TRADE_ALLOCATION_VIEW))],
    *,
    from_date: str,
    to_date: str,
    model_id: str | None = None,
) -> object:
    return service.get_history(from_date, to_date, model_id)


@router.post("/post-trade-allocation/run", response_model=PtaRunResultOut)
def run_post_trade_allocation(
    service: Annotated[PostTradeAllocationService, Depends(_get_service)],
    actor: Annotated[User, Depends(require_action(Action.POST_TRADE_ALLOCATION_RUN))],
) -> object:
    try:
        run = service.run(trigger=RunTrigger.MANUAL, actor=actor.email or actor.firebase_uid)
    except RuntimeError as exc:
        # No confirmed allocation period: a precondition the operator has to
        # satisfy, not a server fault. 409 rather than a generic 500.
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc

    # run() returns None when the scan found nothing to do -- every date in
    # range is already allocated, or the IB archive is still empty on a fresh
    # install. Neither is an error, and POST must never 404 (BE-7), so fall
    # through to the same synthesized empty view the no-cells case uses.
    latest = service.get_view(run.trade_date) if run is not None else None
    if latest is None:
        raw_date = (
            run.trade_date
            if run is not None
            else datetime.now(timezone.utc).strftime("%Y%m%d")
        )
        latest = PostTradeAllocationView(
            tradeDate=_format_date(raw_date),
            grandTotal=0.0,
            models=[],
        )
    # ponytail: run() surfaces only the newest of the several dates a scan can
    # write, so newRuns reports that one rather than the whole batch. Widen to
    # a real multi-date list if callers ever need every date a scan touched.
    new_runs = (
        []
        if run is None
        else [PtaRunListEntryOut(date=latest.tradeDate, grandTotal=latest.grandTotal)]
    )
    return PtaRunResultOut(newRuns=new_runs, latest=latest)
