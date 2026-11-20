"""Allocation matrix router — split from app/libs/pc/router.py (007-A).

All allocation routes from the PM workspace. Prefix: /pm (mounted under /api/pm in app/main.py).
All routes are guarded by require_action() exactly as app/libs/users/router.py does.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.libs.auth.actions import Action
from app.libs.auth.deps import require_action
from app.libs.allocation_matrix import cache as _cache
from app.libs.allocation_matrix.service import AllocationService
from app.libs.allocation_matrix.schemas import (
    AllocationViewOut,
    PeriodCreate,
    PeriodLiteOut,
    PeriodOut,
    PeriodStatusUpdate,
)
from app.models.pm import PeriodStatus
from app.models.users import User

router = APIRouter(prefix="/pm", tags=["pm"])


# ---------------------------------------------------------------------------
# Dependency helpers
# ---------------------------------------------------------------------------


def _get_alloc_service(
    db: Annotated[Session, Depends(get_db)],
) -> AllocationService:
    return AllocationService(db)


# ---------------------------------------------------------------------------
# Allocation routes
# ---------------------------------------------------------------------------


@router.post(
    "/allocation/periods",
    response_model=PeriodOut,
    status_code=status.HTTP_201_CREATED,
)
def create_period(
    body: PeriodCreate,
    service: Annotated[AllocationService, Depends(_get_alloc_service)],
    _: Annotated[User, Depends(require_action(Action.ALLOCATION_WRITE))],
) -> object:
    return service.create_period(body.label)


@router.patch("/allocation/periods/{period_id}", response_model=PeriodOut)
def update_period(
    period_id: uuid.UUID,
    body: PeriodStatusUpdate,
    service: Annotated[AllocationService, Depends(_get_alloc_service)],
    actor: Annotated[User, Depends(require_action(Action.ALLOCATION_WRITE))],
) -> object:
    if body.status == PeriodStatus.CONFIRMED:
        return service.confirm_period(period_id, actor=actor.firebase_uid)
    raise HTTPException(
        status.HTTP_409_CONFLICT,
        f"Unsupported period status transition: {body.status!r}",
    )


@router.get("/allocation", response_model=AllocationViewOut, responses={304: {}})
def get_allocation(
    response: Response,
    service: Annotated[AllocationService, Depends(_get_alloc_service)],
    _: Annotated[User, Depends(require_action(Action.ALLOCATION_VIEW))],
    period: str | None = None,
    if_none_match: Annotated[str | None, Header()] = None,
) -> object:
    """Return the allocation matrix.

    * Without ``?period``: returns the open (derived) matrix with ETag.
    * With ``?period=<label>``: finds the matching period; open → live derivation,
      confirmed → read from snapshots.

    ETag / If-None-Match contract (open matrix only):
    - Response always includes ``ETag: <etag>`` header.
    - Client may send ``If-None-Match: <etag>`` on subsequent requests.
    - When the matrix has not changed → 304 Not Modified (no body).
    """
    # Periods + open-period id are attached to every response so the frontend
    # always has the period picker populated. They are cheap to read and
    # change rarely; we don't fold them into the matrix cache.
    all_periods = service.list_periods()
    periods_out = [
        PeriodLiteOut(
            id=str(p.id),
            label=p.label,
            status=p.status,
            confirmed_at=p.confirmed_at,
            confirmed_by=p.confirmed_by,
        )
        for p in all_periods
    ]
    open_period = next((p for p in all_periods if p.status.value == "open"), None)
    open_period_id = str(open_period.id) if open_period is not None else None

    if period is not None:
        # Lookup by label.
        matched = service.find_period_by_label(period)
        if matched is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Period '{period}' not found")

        if matched.status == PeriodStatus.CONFIRMED:
            # Units are frozen. Master account, books, and per-book client
            # accounts are the current rows, so the cache key includes those
            # watermarks. A reassign then misses and the past matrix updates.
            pid_str = str(matched.id)
            _, models_wm, _, accounts_wm = service.compute_etag_components()
            fresh = (
                f"{accounts_wm.max_updated_at}:{accounts_wm.count}|"
                f"{models_wm.max_updated_at}:{models_wm.count}"
            )
            cache_key = f"{pid_str}|{fresh}"
            cached = _cache.get_confirmed(cache_key)
            if cached is None:
                raw = service.derive_confirmed_matrix(matched.id)
                _cache.put_confirmed(cache_key, raw)
                cached = raw
            view = AllocationViewOut.from_dict(
                cached,
                etag=pid_str,
                periods=periods_out,
                open_period_id=open_period_id,
            )
            response.headers["ETag"] = pid_str
            return view
        # Open period by label — fall through to live derivation below.

    # --- Open matrix with ETag ---
    subs_wm, models_wm, clients_wm, accounts_wm = service.compute_etag_components()
    etag = _cache.compute_open_etag(subs_wm, models_wm, clients_wm, accounts_wm)

    # 304 short-circuit.
    if if_none_match and if_none_match.strip('"') == etag:
        return Response(status_code=304)

    # Cache hit.
    cached = _cache.get_open(etag)
    if cached is None:
        cached = service.derive_open_matrix()
        _cache.put_open(etag, cached)

    view = AllocationViewOut.from_dict(
        cached,
        etag=etag,
        periods=periods_out,
        open_period_id=open_period_id,
    )
    response.headers["ETag"] = f'"{etag}"'
    return view
