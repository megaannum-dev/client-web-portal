from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import (
    extract_uid_email,
    portal_from_claims,
    set_portal_claims,
    verify_firebase_id_token_string,
)
from app.libs.auth.status import assert_can_authenticate
from app.libs.users.repository import AdminProfileRepository, UserRepository
from app.models.users import User
from app.schemas.auth import PortalKind


def login_and_bind(
    id_token: str | None,
    portal: PortalKind,
    repo: UserRepository,
    settings: Settings,
    db: Session,
) -> User:
    claims = verify_firebase_id_token_string(id_token, settings)
    uid, email = extract_uid_email(claims, settings)

    existing = repo.get_by_firebase_uid(uid)
    if existing is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No account staged for you")
    if existing.portal.value != portal:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Wrong portal for this account")

    if email and existing.email != email:
        existing = repo.update_email(existing, email)

    if portal_from_claims(claims) is None:
        profile = AdminProfileRepository(repo.db).get_by_user_id(existing.id)
        set_portal_claims(
            existing.firebase_uid,
            existing.portal.value,
            profile.role.value if profile else None,
            settings,
        )

    assert_can_authenticate(existing, db)  # DB-layer seam, § 7 — 403 if not active
    return existing
