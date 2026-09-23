"""Manual IB Flex ingest route -- for backfills and re-running a day whose
scheduled ingest failed. Mirrors the router style of
app/libs/post_trade_allocation/router.py / app/libs/reconciliation/router.py.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.flex_query import FlexUnavailable
from app.libs.auth.actions import Action
from app.libs.auth.deps import require_action
from app.libs.ib_ingest.service import IngestFailed, MarketStillOpen, ingest_day
from app.models.users import User
from app.schemas.ib_ingest import IbIngestRunOut

router = APIRouter(prefix="/mobo", tags=["mobo"])


@router.post("/ib-ingest", response_model=IbIngestRunOut)
def run_ib_ingest(
    day: date,
    _: Annotated[User, Depends(require_action(Action.POST_TRADE_ALLOCATION_RUN))],
) -> IbIngestRunOut:
    """Manual backfill/retry for one day's IB Flex ingest. `day` is required
    -- unlike the scheduled job, an operator-triggered ingest is always for a
    specific day, and defaulting to "today" would collide confusingly with
    the market-hours guard below.

    def, not async def: ingest_day does blocking I/O (Flex HTTP download, XML
    parse, batched DB inserts, ~10s) -- FastAPI runs a sync def in its own
    threadpool instead of blocking the event loop.
    """
    try:
        counts = ingest_day(day)
    except MarketStillOpen as exc:
        # Well-formed request, resource just isn't ready yet (today's
        # session hasn't closed) -- 409, not 4xx-for-bad-input or 5xx.
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except IngestFailed as exc:
        # IB gave us a response we can't use (Fail envelope / mismatched
        # tradeDate) -- same 502 reconciliation/service.py uses for an
        # unusable upstream Flex response.
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    except FlexUnavailable as exc:
        # Transport-level failure reaching the Flex Web Service -- also 502,
        # for the same "bad upstream gateway" reason as IngestFailed above
        # (reconciliation/service.py maps this exception to 502 too).
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc

    orders_ins, orders_skip, trades_ins, trades_skip, summaries_ins, summaries_skip = counts
    return IbIngestRunOut(
        day=day,
        orders_inserted=orders_ins,
        orders_skipped=orders_skip,
        trades_inserted=trades_ins,
        trades_skipped=trades_skip,
        summaries_inserted=summaries_ins,
        summaries_skipped=summaries_skip,
    )
