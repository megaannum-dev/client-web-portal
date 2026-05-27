from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.security import verify_firebase_token
from app.libs.auth.actions import Action, get_actions_for_role
from app.libs.users.repository import UserRepository
from app.models.users import User, UserRole


def get_current_user(
    claims: Annotated[dict, Depends(verify_firebase_token)],  # type: ignore[type-arg]
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    repo = UserRepository(db)
    if settings.firebase_auth_disabled:
        # Dev mode: always return/create dev-user as ADMIN so all routes are accessible.
        user = repo.get_by_firebase_uid("dev-user")
        if user is None:
            user = repo.create("dev-user", "dev@example.com", UserRole.ADMIN)
        return user

    uid = claims.get("uid")
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing uid"
        )
    raw_email = claims.get("email")
    email = (
        raw_email.strip() if isinstance(raw_email, str) and raw_email.strip() else None
    )

    user = repo.get_by_firebase_uid(uid)
    if user is None:
        user = repo.create(uid, email, UserRole.CLIENT)
    elif email and user.email != email:
        user = repo.update_email(user, email)
    return user


def require_action(action: Action):  # type: ignore[return]
    def _dep(user: Annotated[User, Depends(get_current_user)]) -> User:
        if action not in get_actions_for_role(user.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Action '{action}' not permitted for your role.",
            )
        return user

    return _dep
