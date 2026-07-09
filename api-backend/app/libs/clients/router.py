from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.libs.auth.actions import Action
from app.libs.auth.deps import require_action
from app.libs.clients.schemas import ClientListItemOut, ClientListOut
from app.libs.clients.service import ClientService
from app.libs.users.repository import AdminProfileRepository
from app.models.users import AdminRole, User

# BE-1 stub: symbol must exist for main.py mount + import smoke.
# BE-3 adds the routes.
router = APIRouter(prefix="/rm", tags=["rm"])


def _get_service(db: Annotated[Session, Depends(get_db)]) -> ClientService:
    return ClientService(db)


def _get_caller_role(
    user: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
    db: Annotated[Session, Depends(get_db)],
) -> AdminRole:
    # Duplicates the AdminProfile lookup require_action already makes internally
    # to check the action — accepted as one small extra query rather than
    # changing require_action's return type for every existing consumer of it.
    profile = AdminProfileRepository(db).get_by_user_id(user.id)
    return AdminRole(profile.role)  # type: ignore[union-attr]


@router.get("/clients", response_model=ClientListOut)
def list_clients(
    service: Annotated[ClientService, Depends(_get_service)],
    user: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
    role: Annotated[AdminRole, Depends(_get_caller_role)],
) -> ClientListOut:
    return service.list_visible(role, user.firebase_uid)


@router.get("/clients/{client_id}", response_model=ClientListItemOut)
def get_client(
    client_id: uuid.UUID,
    service: Annotated[ClientService, Depends(_get_service)],
    user: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
    role: Annotated[AdminRole, Depends(_get_caller_role)],
) -> ClientListItemOut:
    return service.get_visible(role, user.firebase_uid, client_id)
