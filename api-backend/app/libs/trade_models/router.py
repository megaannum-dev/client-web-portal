"""Trade models router — split from app/libs/pc/router.py (007-A).

All model routes from the PC workspace. Prefix: /pc (mounted under /api/pc in app/main.py).
All routes are guarded by require_action() exactly as app/libs/users/router.py does.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.libs.auth.actions import Action
from app.libs.auth.deps import require_action
from app.libs.trade_models.service import ModelService
from app.libs.trade_models.storage import FileStorage, get_storage
from app.libs.trade_models.schemas import (
    ChangeOut,
    MaterialOut,
    ModelCreate,
    ModelDetailOut,
    ModelOut,
    ModelsListOut,
    ModelUpdate,
    SymbolAddIn,
    SymbolAuditOut,
    SymbolPatchIn,
)
from app.models.users import User

router = APIRouter(prefix="/pc", tags=["pc"])


# ---------------------------------------------------------------------------
# Dependency helpers
# ---------------------------------------------------------------------------


def _get_model_service(
    db: Annotated[Session, Depends(get_db)],
    storage: Annotated[FileStorage, Depends(get_storage)],
) -> ModelService:
    return ModelService(db, storage)


def _resolve_changes(service: ModelService, model_id: uuid.UUID) -> list[ChangeOut]:
    """list_changes() with actor firebase_uid swapped for a display name."""
    changes = service.list_changes(model_id)
    names = service.resolve_actor_names(c.actor for c in changes)
    return [
        ChangeOut.model_validate(c).model_copy(update={"actor": names.get(c.actor, c.actor)})
        for c in changes
    ]


def _resolve_symbol_audit(service: ModelService, model_id: uuid.UUID) -> list[SymbolAuditOut]:
    """list_symbol_audit() with actor firebase_uid swapped for a display name."""
    audit = service.list_symbol_audit(model_id)
    names = service.resolve_actor_names(a.actor for a in audit)
    return [
        SymbolAuditOut.model_validate(a).model_copy(update={"actor": names.get(a.actor, a.actor)})
        for a in audit
    ]


# ---------------------------------------------------------------------------
# Model routes
# ---------------------------------------------------------------------------


@router.get("/models", response_model=ModelsListOut)
def list_models(
    service: Annotated[ModelService, Depends(_get_model_service)],
    _: Annotated[User, Depends(require_action(Action.MODEL_VIEW))],
) -> dict:
    return {"models": service.list_models()}


@router.get("/models/{model_id}")
def get_model(
    model_id: uuid.UUID,
    service: Annotated[ModelService, Depends(_get_model_service)],
    _: Annotated[User, Depends(require_action(Action.MODEL_VIEW))],
    include: str | None = None,
) -> object:
    model = service.get_model(model_id)
    includes = {s.strip() for s in include.split(",")} if include else set()
    result = ModelDetailOut.model_validate(model)
    if "materials" in includes:
        result.materials = service.list_materials(model_id)
    if "changes" in includes:
        result.changes = _resolve_changes(service, model_id)
    if "symbol_audit" in includes:
        result.symbol_audit = _resolve_symbol_audit(service, model_id)
    return result


def _detail_with_audit(service: ModelService, model_id: uuid.UUID) -> ModelDetailOut:
    """Refreshed ModelDetailOut with symbol_audit attached — mirrors get_model's include assembly."""
    result = ModelDetailOut.model_validate(service.get_model(model_id))
    result.symbol_audit = _resolve_symbol_audit(service, model_id)
    return result


@router.post("/models", response_model=ModelOut, status_code=status.HTTP_201_CREATED)
def create_model(
    body: ModelCreate,
    service: Annotated[ModelService, Depends(_get_model_service)],
    actor: Annotated[User, Depends(require_action(Action.MODEL_MANAGE))],
) -> object:
    return service.create_model(
        name=body.name,
        category=body.category,
        subscription_redemption=body.subscription_redemption,
        symbols=body.symbols,
        model_size=body.model_size,
        description=body.description,
        underlyings=body.underlyings,
        risk=body.risk,
        liquidity=body.liquidity,
        reporting=body.reporting,
        nav_perf=body.nav_perf,
        mgmt_fee=body.mgmt_fee,
        incentive_fee=body.incentive_fee,
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
    result = None
    if "status" in updates:
        new_status = updates.pop("status")
        if new_status == "live":
            result = service.publish_model(model_id, actor=actor.firebase_uid)
        elif new_status == "deleted":
            result = service.delete_model(model_id, actor=actor.firebase_uid)
        else:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Invalid status transition: {new_status!r}",
            )
    if updates:
        result = service.edit_model(model_id, actor=actor.firebase_uid, **updates)
    if result is None:
        result = service.get_model(model_id)
    return result


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


@router.post(
    "/models/{model_id}/symbols",
    response_model=ModelDetailOut,
    status_code=status.HTTP_201_CREATED,
)
def add_symbol(
    model_id: uuid.UUID,
    body: SymbolAddIn,
    service: Annotated[ModelService, Depends(_get_model_service)],
    actor: Annotated[User, Depends(require_action(Action.MODEL_MANAGE))],
) -> object:
    service.add_symbol(model_id, body.symbol, actor=actor.firebase_uid)
    return _detail_with_audit(service, model_id)


@router.patch("/models/{model_id}/symbols/{symbol}", response_model=ModelDetailOut)
def set_symbol(
    model_id: uuid.UUID,
    symbol: str,
    body: SymbolPatchIn,
    service: Annotated[ModelService, Depends(_get_model_service)],
    actor: Annotated[User, Depends(require_action(Action.MODEL_MANAGE))],
) -> object:
    service.set_symbol_active(model_id, symbol, body.active, actor=actor.firebase_uid)
    return _detail_with_audit(service, model_id)


@router.delete("/models/{model_id}/symbols/{symbol}", status_code=status.HTTP_204_NO_CONTENT)
def delete_symbol(
    model_id: uuid.UUID,
    symbol: str,
    service: Annotated[ModelService, Depends(_get_model_service)],
    actor: Annotated[User, Depends(require_action(Action.MODEL_MANAGE))],
) -> Response:
    service.remove_symbol(model_id, symbol, actor=actor.firebase_uid)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/models/{model_id}/changes", response_model=list[ChangeOut])
def list_changes(
    model_id: uuid.UUID,
    service: Annotated[ModelService, Depends(_get_model_service)],
    _: Annotated[User, Depends(require_action(Action.MODEL_VIEW))],
) -> list:
    return _resolve_changes(service, model_id)
