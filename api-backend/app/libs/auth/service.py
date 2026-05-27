from fastapi import HTTPException, status

from app.core.config import Settings
from app.core.security import verify_firebase_id_token_string
from app.libs.users.repository import UserRepository
from app.models.users import User, UserRole
from app.schemas.auth import PortalKind


def login_or_register(
    id_token: str | None,
    portal: PortalKind,
    repo: UserRepository,
    settings: Settings,
    *,
    must_be_new: bool = False,
    requested_role: UserRole | None = None,
) -> User:
    claims = verify_firebase_id_token_string(id_token, settings)

    if settings.firebase_auth_disabled:
        uid, email = "dev-user", "dev@example.com"
    else:
        uid = claims.get("uid")
        if not uid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing uid"
            )
        raw_email = claims.get("email")
        email = (
            raw_email.strip()
            if isinstance(raw_email, str) and raw_email.strip()
            else None
        )

    existing = repo.get_by_firebase_uid(uid)

    if must_be_new and existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This Firebase account is already registered. Use POST /api/auth/login.",
        )

    if existing is None:
        assigned_role = (
            requested_role
            if requested_role is not None
            else UserRole.CLIENT
        )
        return repo.create(uid, email, assigned_role)

    if email and existing.email != email:
        return repo.update_email(existing, email)

    return existing
