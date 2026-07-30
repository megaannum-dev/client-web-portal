from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.libs.access.resolver import grants_for
from app.libs.auth.deps import get_current_user
from app.libs.auth.service import login_and_bind
from app.libs.users.repository import UserRepository, get_user_repo
from app.models.users import User
from app.schemas.auth import FirebaseLoginBody
from app.schemas.users import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_out(user: User, db: Session) -> UserOut:
    """One composer for all three routes -- grants resolved once, here."""
    return UserOut(
        firebase_uid=user.firebase_uid,
        email=user.email,
        role=user.role,
        name=user.name,
        grants=grants_for(user, db),
    )


@router.post("/client/login", response_model=UserOut)
def client_login(
    body: FirebaseLoginBody,
    settings: Annotated[Settings, Depends(get_settings)],
    repo: Annotated[UserRepository, Depends(get_user_repo)],
    db: Annotated[Session, Depends(get_db)],
) -> UserOut:
    user = login_and_bind(body.id_token, "client", repo, settings, db)
    return _user_out(user, db)


@router.post("/admin/login", response_model=UserOut)
def admin_login(
    body: FirebaseLoginBody,
    settings: Annotated[Settings, Depends(get_settings)],
    repo: Annotated[UserRepository, Depends(get_user_repo)],
    db: Annotated[Session, Depends(get_db)],
) -> UserOut:
    user = login_and_bind(body.id_token, "admin", repo, settings, db)
    return _user_out(user, db)


@router.get("/me", response_model=UserOut)
def auth_me(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> UserOut:
    return _user_out(user, db)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def logout() -> Response:
    return Response(status_code=status.HTTP_204_NO_CONTENT)
