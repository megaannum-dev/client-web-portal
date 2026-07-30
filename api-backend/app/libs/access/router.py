# app/libs/access/router.py
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.libs.access.schemas import MatrixOut
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
