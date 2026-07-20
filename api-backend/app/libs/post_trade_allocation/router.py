"""Post-trade allocation router — routes land here (BE-7).

Thin HTTP boundary, mirroring app/libs/allocation_matrix/router.py.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.libs.auth.actions import Action
from app.libs.auth.deps import require_action
from app.libs.post_trade_allocation.service import (
    PostTradeAllocationService,
    _format_date,
    _format_settle_day,
)
from app.models.post_trade_allocation import RunTrigger
from app.models.users import User
from app.schemas.post_trade_allocation import (
    PostTradeAllocationView,
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
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No run for that date")
    return view


@router.get("/post-trade-allocation/runs", response_model=PtaRunListOut)
def list_post_trade_allocation_runs(
    service: Annotated[PostTradeAllocationService, Depends(_get_service)],
    _: Annotated[User, Depends(require_action(Action.POST_TRADE_ALLOCATION_VIEW))],
    includeEmpty: bool = False,
) -> object:
    return service.list_runs(include_empty=includeEmpty)


@router.post("/post-trade-allocation/run", response_model=PtaRunResultOut)
def run_post_trade_allocation(
    service: Annotated[PostTradeAllocationService, Depends(_get_service)],
    actor: Annotated[User, Depends(require_action(Action.POST_TRADE_ALLOCATION_RUN))],
) -> object:
    run = service.run(trigger=RunTrigger.MANUAL, actor=actor.email or actor.firebase_uid)
    latest = service.get_view(run.trade_date)
    if latest is None:
        # get_view() returns None when the run wrote no cells (a genuine
        # EMPTY-status run with no matching orders) — POST must never 404,
        # so synthesize the empty view instead (BE-7 invariant).
        latest = PostTradeAllocationView(
            tradeDate=_format_date(run.trade_date),
            settleDay=_format_settle_day(run.settle_date),
            grandTotal=0.0,
            models=[],
        )
    # ponytail: service.run() only surfaces the newest of possibly several
    # runs it wrote (one per distinct tradeDate in the batch). newRuns is
    # built from that single run's own view rather than a second list_runs()
    # query; widen to a real multi-date list if run() ever returns more.
    new_runs = [
        PtaRunListEntryOut(
            date=latest.tradeDate,
            label=latest.settleDay,
            grandTotal=latest.grandTotal,
        )
    ]
    return PtaRunResultOut(newRuns=new_runs, latest=latest)
