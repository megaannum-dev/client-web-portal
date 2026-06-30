"""Trade models router — split from app/libs/pc/router.py (007-A).

All model routes from the PC workspace. Prefix: /pc (mounted under /api/pc in app/main.py).
All routes are guarded by require_action() exactly as app/libs/users/router.py does.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Response, UploadFile, status
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
    ModelOut,
    ModelsListOut,
    ModelUpdate,
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


# ---------------------------------------------------------------------------
# Model routes
# ---------------------------------------------------------------------------


@router.get("/models", response_model=ModelsListOut)
def list_models(
    service: Annotated[ModelService, Depends(_get_model_service)],
    _: Annotated[User, Depends(require_action(Action.MODEL_VIEW))],
) -> dict:
    return {"models": service.list_models()}


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

@router.delete("/models/{model_id}", response_model=ModelOut)
def delete_model(
    model_id: uuid.UUID,
    service: Annotated[ModelService, Depends(_get_model_service)],
    actor: Annotated[User, Depends(require_action(Action.MODEL_MANAGE))],
) -> object:
    return service.delete_model(model_id, actor=actor.firebase_uid)


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
