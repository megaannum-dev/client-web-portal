"""BE-8 — PC workspace router.

All routes are guarded by require_action() exactly as app/libs/users/router.py does.
Prefix: /pc  (mounted under /api/pc in app/main.py).
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.libs.auth.actions import Action
from app.libs.auth.deps import require_action
from app.libs.pc import cache as _cache
from app.libs.pc.repository import AllocationRepository, SubscriptionRepository
from app.libs.pc.service import AllocationService, ModelService
from app.libs.pc.storage import FileStorage, get_storage
from app.models.users import User
from app.schemas.pc import (
    AllocationViewOut,
    ChangeOut,
    MaterialOut,
    ModelCreate,
    ModelOut,
    ModelUpdate,
    PeriodCreate,
    PeriodOut,
)

router = APIRouter(prefix="/pc", tags=["pc"])


# ---------------------------------------------------------------------------
# Dependency helpers
# ---------------------------------------------------------------------------


def _get_model_service(
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[FileStorage, Depends(get_storage)],
) -> ModelService:
    return ModelService(db, storage)


def _get_alloc_service(
    db: Annotated[Session, Depends(get_db)],
) -> AllocationService:
    return AllocationService(db)


# ---------------------------------------------------------------------------
# Model routes
# ---------------------------------------------------------------------------


@router.get("/models", response_model=list[ModelOut])
def list_models(
    service: Annotated[ModelService, Depends(_get_model_service)],
    _: Annotated[User, Depends(require_action(Action.MODEL_VIEW))],
) -> list:
    return service.list_models()


@router.get("/models/{model_id}", response_model=ModelOut)
def get_model(
    model_id: uuid.UUID,
    service: Annotated[ModelService, Depends(_get_model_service)],
    _: Annotated[User, Depends(require_action(Action.MODEL_VIEW))],
) -> object:
    return service.get_model(model_id)


@router.post("/models", response_model=ModelOut, status_code=status.HTTP_201_CREATED)
def create_model(
    body: ModelCreate,
    service: Annotated[ModelService, Depends(_get_model_service)],
    actor: Annotated[User, Depends(require_action(Action.MODEL_MANAGE))],
) -> object:
    return service.create_model(
        name=body.name,
        manager=body.manager,
        model_size=body.model_size,
        intro=body.intro,
        symbols=body.symbols,
        actor=actor.firebase_uid,
    )


@router.patch("/models/{model_id}", response_model=ModelOut)
def edit_model(
    model_id: uuid.UUID,
    body: ModelUpdate,
    service: Annotated[ModelService, Depends(_get_model_service)],
    actor: Annotated[User, Depends(require_action(Action.MODEL_MANAGE))],
) -> object:
    updates = body.model_dump(exclude_unset=True)
    return service.edit_model(model_id, actor=actor.firebase_uid, **updates)


@router.post("/models/{model_id}/publish", response_model=ModelOut)
def publish_model(
    model_id: uuid.UUID,
    service: Annotated[ModelService, Depends(_get_model_service)],
    actor: Annotated[User, Depends(require_action(Action.MODEL_MANAGE))],
) -> object:
    return service.publish_model(model_id, actor=actor.firebase_uid)


@router.get("/models/{model_id}/materials", response_model=list[MaterialOut])
def list_materials(
    model_id: uuid.UUID,
    service: Annotated[ModelService, Depends(_get_model_service)],
    _: Annotated[User, Depends(require_action(Action.MODEL_VIEW))],
) -> list:
    return service.list_materials(model_id)


@router.post(
    "/models/{model_id}/materials",
    response_model=MaterialOut,
    status_code=status.HTTP_201_CREATED,
)
def upload_material(
    model_id: uuid.UUID,
    file: UploadFile,
    service: Annotated[ModelService, Depends(_get_model_service)],
    actor: Annotated[User, Depends(require_action(Action.MODEL_MANAGE))],
) -> object:
    return service.upload_material(
        model_id,
        file.file,
        filename=file.filename or "upload",
        content_type=file.content_type,
        size_bytes=None,
        actor=actor.firebase_uid,
    )


@router.get("/models/{model_id}/materials/{mid}/download")
def download_material(
    model_id: uuid.UUID,
    mid: uuid.UUID,
    service: Annotated[ModelService, Depends(_get_model_service)],
    _: Annotated[User, Depends(require_action(Action.MODEL_VIEW))],
) -> Response:
    mat = service.get_material(model_id, mid)
    stream = service.download_material(model_id, mid)
    content = stream.read()
    return Response(
        content=content,
        media_type=mat.content_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{mat.filename}"',
        },
    )


@router.get("/models/{model_id}/changes", response_model=list[ChangeOut])
def list_changes(
    model_id: uuid.UUID,
    service: Annotated[ModelService, Depends(_get_model_service)],
    _: Annotated[User, Depends(require_action(Action.MODEL_VIEW))],
) -> list:
    return service.list_changes(model_id)


# ---------------------------------------------------------------------------
# Allocation routes
# ---------------------------------------------------------------------------


@router.get("/allocation/periods", response_model=list[PeriodOut])
def list_periods(
    service: Annotated[AllocationService, Depends(_get_alloc_service)],
    _: Annotated[User, Depends(require_action(Action.ALLOCATION_VIEW))],
) -> list:
    return service.list_periods()


@router.post(
    "/allocation/periods",
    response_model=PeriodOut,
    status_code=status.HTTP_201_CREATED,
)
def create_period(
    body: PeriodCreate,
    service: Annotated[AllocationService, Depends(_get_alloc_service)],
    _: Annotated[User, Depends(require_action(Action.ALLOCATION_MANAGE))],
) -> object:
    return service.create_period(body.label)


@router.post("/allocation/periods/{period_id}/confirm", response_model=PeriodOut)
def confirm_period(
    period_id: uuid.UUID,
    service: Annotated[AllocationService, Depends(_get_alloc_service)],
    actor: Annotated[User, Depends(require_action(Action.ALLOCATION_MANAGE))],
) -> object:
    return service.confirm_period(period_id, actor=actor.firebase_uid)


@router.get("/allocation")
def get_allocation(
    response: Response,
    service: Annotated[AllocationService, Depends(_get_alloc_service)],
    db: Annotated[Session, Depends(get_db)],
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
    if period is not None:
        # Lookup by label.
        alloc_repo = AllocationRepository(db)
        sub_repo = SubscriptionRepository(db)
        matched = (
            db.query(__import__("app.models.pc", fromlist=["AllocationPeriod"]).AllocationPeriod)
            .filter(
                __import__("app.models.pc", fromlist=["AllocationPeriod"]).AllocationPeriod.label
                == period
            )
            .one_or_none()
        )
        if matched is None:
            from fastapi import HTTPException

            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Period '{period}' not found")

        from app.models.pc import PeriodStatus as PS

        if matched.status == PS.CONFIRMED:
            # Confirmed: cache by period_id with long TTL.
            pid_str = str(matched.id)
            cached = _cache.get_confirmed(pid_str)
            if cached is None:
                raw = service.derive_confirmed_matrix(matched.id)
                _cache.put_confirmed(pid_str, raw)
                cached = raw
            view = AllocationViewOut.from_dict(cached, etag=pid_str)
            response.headers["ETag"] = pid_str
            response.headers["Cache-Control"] = "immutable"
            return view
        else:
            # Open period by label — fall through to live derivation below.
            pass

    # --- Open matrix with ETag ---
    subs_wm, models_wm, clients_wm = service.compute_etag_components()
    etag = _cache.compute_open_etag(subs_wm, models_wm, clients_wm)

    # 304 short-circuit.
    if if_none_match and if_none_match.strip('"') == etag:
        return Response(status_code=304)

    # Cache hit.
    cached = _cache.get_open(etag)
    if cached is None:
        cached = service.derive_open_matrix()
        _cache.put_open(etag, cached)

    view = AllocationViewOut.from_dict(cached, etag=etag)
    response.headers["ETag"] = f'"{etag}"'
    return view
