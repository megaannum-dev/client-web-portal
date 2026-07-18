from __future__ import annotations

from firebase_admin import auth

from app.core.config import Settings
from app.core.security import _init_firebase


class FirebaseIdentityService:
    """The ONLY module in the codebase that mutates Firebase Auth identities."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def create_user(self, email: str) -> str:
        """Admin SDK create; returns the new uid. Raises on failure (caller catches)."""
        _init_firebase(self._settings)
        user = auth.create_user(email=email)
        return user.uid

    def get_user_by_email(self, email: str) -> str | None:
        _init_firebase(self._settings)
        try:
            return auth.get_user_by_email(email).uid
        except auth.UserNotFoundError:
            return None

    def delete_user(self, uid: str) -> None:
        """Best-effort compensation. UserNotFoundError is treated as success."""
        _init_firebase(self._settings)
        try:
            auth.delete_user(uid)
        except auth.UserNotFoundError:
            return

    def generate_invite_link(self, email: str) -> str:
        _init_firebase(self._settings)
        return auth.generate_password_reset_link(email)
