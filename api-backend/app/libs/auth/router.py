from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.core.config import Settings, get_settings
from app.libs.auth.deps import get_current_user
from app.libs.auth.service import login_or_register
from app.libs.users.repository import UserRepository, get_user_repo
from app.models.users import User
from app.schemas.auth import FirebaseLoginBody
from app.schemas.users import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register_with_firebase(
    body: FirebaseLoginBody,
    settings: Annotated[Settings, Depends(get_settings)],
    repo: Annotated[UserRepository, Depends(get_user_repo)],
) -> User:
    if body.portal == "admin" and not settings.dev_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Internal user self-registration is disabled. Contact a Super Admin.",
        )
    # Role selection is only trusted in dev_mode for admin-portal registrations;
    # in production, a Super Admin must pre-provision internal users instead.
    requested_role = body.role if settings.dev_mode and body.portal == "admin" else None
    return login_or_register(
        body.id_token,
        body.portal,
        repo,
        settings,
        must_be_new=True,
        requested_role=requested_role,
    )


@router.post("/login", response_model=UserOut)
def login_with_firebase(
    body: FirebaseLoginBody,
    settings: Annotated[Settings, Depends(get_settings)],
    repo: Annotated[UserRepository, Depends(get_user_repo)],
) -> User:
    return login_or_register(
        body.id_token, body.portal, repo, settings, must_be_new=False
    )


@router.get("/me", response_model=UserOut)
def auth_me(user: Annotated[User, Depends(get_current_user)]) -> User:
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def logout() -> Response:
    return Response(status_code=status.HTTP_204_NO_CONTENT)
