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
        if self._settings.firebase_auth_disabled:
            return f"dev-{email}"  # deterministic synthetic uid, no Firebase call
        _init_firebase(self._settings)
        user = auth.create_user(email=email)
        return user.uid

    def get_user_by_email(self, email: str) -> str | None:
        if self._settings.firebase_auth_disabled:
            return None  # no real backing store to check under dev bypass
        _init_firebase(self._settings)
        try:
            return auth.get_user_by_email(email).uid
        except auth.UserNotFoundError:
            return None

    def delete_user(self, uid: str) -> None:
        """Best-effort compensation. UserNotFoundError is treated as success."""
        if self._settings.firebase_auth_disabled:
            return  # nothing real to clean up for a synthetic uid
        _init_firebase(self._settings)
        try:
            auth.delete_user(uid)
        except auth.UserNotFoundError:
            return

    def generate_invite_link(self, email: str) -> str:
        if self._settings.firebase_auth_disabled:
            return f"https://dev.invalid/set-password?email={email}"
        _init_firebase(self._settings)
        return auth.generate_password_reset_link(email)

    def ensure_identity(self, email: str) -> tuple[str, bool]:
        """Returns (uid, created). If an identity already exists for `email`
        (a prior failed commit left a class-A orphan), ADOPTS its uid instead
        of creating a new one -- `created=False` in that case.

        The `created` flag is load-bearing: it is the ONLY signal that lets a
        caller's compensation step distinguish "this request minted the identity"
        from "this request adopted someone else's" -- an adopted identity must
        NEVER be deleted on compensation (Risk A1).
        """
        existing_uid = self.get_user_by_email(email)
        if existing_uid is not None:
            return existing_uid, False
        return self.create_user(email), True
