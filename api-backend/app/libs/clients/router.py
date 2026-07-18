from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.libs.auth.actions import Action
from app.libs.auth.deps import require_action
from app.libs.clients.schemas import (
    ClientListItemOut,
    ClientListOut,
    ClientOnboardIn,
    ClientOnboardOut,
)
from app.libs.clients.service import ClientService
from app.libs.identity.deps import get_identity_service
from app.libs.identity.service import FirebaseIdentityService
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


@router.post("/clients", response_model=ClientOnboardOut, status_code=201)
def onboard_client(
    body: ClientOnboardIn,
    service: Annotated[ClientService, Depends(_get_service)],
    identity: Annotated[FirebaseIdentityService, Depends(get_identity_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    user: Annotated[User, Depends(require_action(Action.CLIENT_MANAGE))],
) -> ClientOnboardOut:
    staged, link = service.onboard(
        caller_uid=user.firebase_uid,
        email=body.email,
        name=body.name,
        assigned_rm_uid=body.assigned_rm_uid,
        identity=identity,
        settings=settings,
        primary_phone=body.primary_phone,
        address=body.address,
        country_of_residence=body.country_of_residence,
        authorized_person=body.authorized_person,
        initiate_method=body.initiate_method,
    )
    return ClientOnboardOut(
        firebase_uid=staged.firebase_uid, status=staged.status.value, invite_link=link
    )
