from fastapi import HTTPException, status

from app.core.config import Settings
from app.core.security import extract_uid_email, verify_firebase_id_token_string
from app.libs.users.repository import UserRepository
from app.models.users import User, UserRole


def login_or_register(
    id_token: str | None,
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
        uid, email = extract_uid_email(claims)

    existing = repo.get_by_firebase_uid(uid)

    if must_be_new and existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This Firebase account is already registered. Use POST /api/auth/login.",
        )

    if existing is None:
        return repo.create(uid, email, requested_role or UserRole.CLIENT)

    if email and existing.email != email:
        return repo.update_email(existing, email)

    return existing
