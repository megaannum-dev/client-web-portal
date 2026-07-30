# app/libs/access/router.py
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.libs.access.schemas import MatrixOut, MatrixPublishIn, OverrideIn, OverrideOut
from app.libs.access.service import AccessService
from app.libs.auth.actions import Action
from app.libs.auth.deps import require_action
from app.models.users import User

router = APIRouter(prefix="/admin", tags=["access"])


def _get_service(db: Annotated[Session, Depends(get_db)]) -> AccessService:
    return AccessService(db)


@router.get("/access/matrix", response_model=MatrixOut)
def get_matrix(
    service: Annotated[AccessService, Depends(_get_service)],
    _: Annotated[User, Depends(require_action(Action.USER_VIEW))],
) -> MatrixOut:
    return service.read_matrix()


@router.put("/access/matrix", response_model=MatrixOut)
def publish_matrix(
    body: MatrixPublishIn,
    service: Annotated[AccessService, Depends(_get_service)],
    user: Annotated[User, Depends(require_action(Action.USER_WRITE))],
) -> MatrixOut:
    return service.publish(body, actor=user)


@router.get("/access/overrides", response_model=list[OverrideOut])
def list_overrides(
    service: Annotated[AccessService, Depends(_get_service)],
    _: Annotated[User, Depends(require_action(Action.USER_VIEW))],
) -> list[OverrideOut]:
    return service.list_overrides()


@router.post("/access/overrides", response_model=OverrideOut, status_code=201)
def grant_override(
    body: OverrideIn,
    service: Annotated[AccessService, Depends(_get_service)],
    user: Annotated[User, Depends(require_action(Action.USER_WRITE))],
) -> OverrideOut:
    return service.grant_override(body, actor=user)


@router.delete("/access/overrides/{override_id}", status_code=204, response_class=Response)
def revoke_override(
    override_id: uuid.UUID,
    service: Annotated[AccessService, Depends(_get_service)],
    user: Annotated[User, Depends(require_action(Action.USER_WRITE))],
) -> Response:
    service.revoke_override(override_id, actor=user)
    return Response(status_code=204)
