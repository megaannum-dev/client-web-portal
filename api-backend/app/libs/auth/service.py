from fastapi import HTTPException, status

from app.core.config import Settings
from app.core.security import (
    extract_uid_email,
    portal_from_claims,
    set_portal_claims,
    verify_firebase_id_token_string,
)
from app.libs.users.repository import AdminProfileRepository, UserRepository
from app.models.users import AdminRole, User
from app.schemas.auth import PortalKind


def login_or_register(
    id_token: str | None,
    portal: PortalKind,
    repo: UserRepository,
    settings: Settings,
    *,
    must_be_new: bool = False,
    requested_role: str | AdminRole | None = None,
) -> User:
    claims = verify_firebase_id_token_string(id_token, settings)
    uid, email = extract_uid_email(claims, settings)

    existing = repo.get_by_firebase_uid(uid)

    if must_be_new and existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This Firebase account is already registered. Use POST /api/auth/login.",
        )

    if existing is None:
        if portal == "admin":
            # E-2 coercion: tolerate a str role at the boundary.
            role = AdminRole(requested_role) if requested_role else AdminRole.ADMIN
            user = repo.create_admin(uid, email, role=role)
            set_portal_claims(uid, "admin", role.value, settings)
        else:
            user = repo.create_client(uid, email)
            set_portal_claims(uid, "client", None, settings)
        return user

    # LOGIN of an existing user: trust the PERSISTED portal, not the body (Proposal §7.4).
    if email and existing.email != email:
        existing = repo.update_email(existing, email)

    # Q3 lazy path: if the token lacks a portal claim, refresh it from DB here.
    if portal_from_claims(claims) is None:
        profile = AdminProfileRepository(repo.db).get_by_user_id(existing.id)
        set_portal_claims(
            existing.firebase_uid,
            existing.portal.value,
            profile.role.value if profile else None,
            settings,
        )
    return existing
