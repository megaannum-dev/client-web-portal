from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.security import extract_uid_email, verify_firebase_token
from app.libs.auth.actions import Action, get_actions_for_role
from app.libs.users.repository import AdminProfileRepository, UserRepository
from app.models.users import AdminRole, Portal, User


def _resolve_user(
    claims: Annotated[dict, Depends(verify_firebase_token)],  # type: ignore[type-arg]
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    """Bearer token → users row. Portal-agnostic. Used by the shared and both
    portal-scoped dependencies."""
    repo = UserRepository(db)

    if settings.firebase_auth_disabled:
        # Q5: dev bypass unchanged — resolves the single admin dev-user. Client-portal
        # routes aren't testable offline; accepted (FR-2: this bypass is slated for removal).
        user = repo.get_by_firebase_uid("dev-user")
        if user is None:
            user = repo.create_admin("dev-user", "dev@example.com", role="ADMIN")
        return user

    uid, email = extract_uid_email(claims, settings)

    user = repo.get_by_firebase_uid(uid)
    if user is None:
        # Q4: keep today's behaviour — auto-create unknown tokens as client + client_profiles.
        # FUTURE-REFACTOR (FR-1): tighten to reject unknown tokens and require /register, so
        # portal assignment happens in exactly one place. Deferred until both frontends are
        # confirmed to register before any authenticated call.
        user = repo.create_client(uid, email)
    elif email and user.email != email:
        user = repo.update_email(user, email)
    return user


def get_current_user(user: Annotated[User, Depends(_resolve_user)]) -> User:
    """Shared — no portal assertion. Used by /api/auth/me, /api/users/me."""
    return user


def get_current_client_user(user: Annotated[User, Depends(_resolve_user)]) -> User:
    if user.portal != Portal.CLIENT:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Client portal access only")
    return user


def get_current_admin_user(user: Annotated[User, Depends(_resolve_user)]) -> User:
    if user.portal != Portal.ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin portal access only")
    return user


def require_action(action: Action):  # type: ignore[return]
    def _dep(
        user: Annotated[User, Depends(get_current_admin_user)],
        db: Annotated[Session, Depends(get_db)],
    ) -> User:
        profile = AdminProfileRepository(db).get_by_user_id(user.id)
        if profile is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No admin profile")
        # E-2 coercion: tolerate a str role at the boundary.
        if action not in get_actions_for_role(AdminRole(profile.role)):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail=f"Action '{action}' not permitted for your role.",
            )
        return user

    return _dep
