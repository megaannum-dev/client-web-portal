from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.security import set_portal_claims
from app.libs.auth.actions import Action
from app.libs.auth.deps import get_current_user, require_action
from app.libs.users.repository import (
    AdminProfileRepository,
    UserRepository,
    get_user_repo,
)
from app.libs.users.service import UserService
from app.models.users import Portal, User
from app.schemas.users import UserOut, UserSelfUpdate, UserUpsert

router = APIRouter(prefix="/users", tags=["users"])


def _get_service(
    repo: Annotated[UserRepository, Depends(get_user_repo)],
) -> UserService:
    return UserService(repo)


@router.get("/me", response_model=UserOut)
def read_me(user: Annotated[User, Depends(get_current_user)]) -> User:
    return user


@router.patch("/me", response_model=UserOut)
def update_me(
    body: UserSelfUpdate,
    service: Annotated[UserService, Depends(_get_service)],
    user: Annotated[User, Depends(get_current_user)],
) -> User:
    return service.update_self(user, body)


@router.patch("/{firebase_uid}/role", response_model=UserOut)
def update_user_role(
    firebase_uid: str,
    body: UserUpsert,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    _: Annotated[User, Depends(require_action(Action.USER_MANAGE))],
) -> User:
    user = UserRepository(db).get_by_firebase_uid(firebase_uid)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.portal != Portal.ADMIN:
        # Proposal §11 Q4: a UID is permanently one portal; this endpoint does
        # not flip portal (portal transitions are out of scope).
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is not an admin-portal user",
        )
    # E-2 coercion: body.role is AdminRole; .value persists the canonical str.
    AdminProfileRepository(db).upsert_role(user.id, body.role.value)
    set_portal_claims(user.firebase_uid, "admin", body.role.value, settings)
    db.refresh(user)
    return user  # role read via User.role property (Section H.0)


@router.get("/{firebase_uid}", response_model=UserOut)
def read_user_by_uid(
    firebase_uid: str,
    service: Annotated[UserService, Depends(_get_service)],
    _: Annotated[User, Depends(require_action(Action.USER_VIEW))],
) -> User:
    row = service.repo.get_by_firebase_uid(firebase_uid)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return row
