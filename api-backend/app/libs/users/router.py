from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.libs.auth.actions import Action
from app.libs.auth.deps import get_current_user, require_action
from app.libs.users.repository import UserRepository, get_user_repo
from app.libs.users.service import UserService
from app.models.users import User
from app.schemas.users import UserOut, UserSelfUpdate

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
