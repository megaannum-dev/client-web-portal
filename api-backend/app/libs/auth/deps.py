from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.security import extract_uid_email, verify_firebase_token
from app.libs.auth.actions import Action, get_actions_for_role
from app.libs.auth.status import assert_can_authenticate  # DB-layer seam, § 7
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
        # BE-7: no auto-create — dev-user must be seeded by `python -m app.cli.bootstrap_admin`
        # (BE-21) before first use.
        user = repo.get_by_firebase_uid("dev-user")
        if user is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No account staged for you")
        return user

    uid, email = extract_uid_email(claims, settings)

    user = repo.get_by_firebase_uid(uid)
    if user is None:
        # BE-7: bind-only — unknown-but-verified token is rejected, never auto-created.
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No account staged for you")
    if email and user.email != email:
        user = repo.update_email(user, email)
    return user


def get_current_user(user: Annotated[User, Depends(_resolve_user)]) -> User:
    """Shared — no portal assertion. Used by /api/auth/me, /api/users/me."""
    return user


def get_current_client_user(user: Annotated[User, Depends(_resolve_user)]) -> User:
    if user.portal != Portal.CLIENT:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Client portal access only")
    # db is unused by the real gate (status.py: "signature-compatibility only") — no
    # extra Depends(get_db) needed here, so the gate runs on every call, not just login.
    assert_can_authenticate(user, None)  # runs on EVERY authenticated client request (Q-H)
    return user


def get_current_admin_user(user: Annotated[User, Depends(_resolve_user)]) -> User:
    if user.portal != Portal.ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin portal access only")
    assert_can_authenticate(user, None)
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
