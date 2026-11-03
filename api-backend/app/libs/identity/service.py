from __future__ import annotations

import logging

from firebase_admin import auth
from firebase_admin.auth import ActionCodeSettings
from firebase_admin.exceptions import FirebaseError

from app.core.config import Settings
from app.core.security import _init_firebase

logger = logging.getLogger(__name__)


class FirebaseIdentityService:
    """The ONLY module in the codebase that mutates Firebase Auth identities."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def create_user(self, email: str, password: str | None = None) -> str:
        """Admin SDK create; returns the new uid. Raises on failure (caller catches).

        Passwordless by default (C-1): pass no `password` to leave the account
        with no credential until its holder sets one through the emailed
        set-password link. Staff enrollment now passes a generated `password`
        instead, so the account is usable immediately."""
        if self._settings.firebase_auth_disabled:
            return f"dev-{email}"  # unchanged: deterministic synthetic uid
        _init_firebase(self._settings)
        kwargs = {"email": email}
        if password is not None:
            kwargs["password"] = password
        user = auth.create_user(**kwargs)
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

    def generate_set_password_link(self, email: str) -> str:
        """Renamed from the old set-password-link generator (3 callers:
        StaffService.enroll, ClientService.onboard, app/cli/bootstrap_admin.py:55).
        KEPT, not deleted.

        Q-5 order, settled by the integration test in
        tests/libs/identity/test_set_password_link_type.py, not by argument:
          1. auth.generate_password_reset_link(email)
          2. on a Firebase rejection for an account with no password provider,
             auth.generate_sign_in_with_email_link(email, action_code_settings)
        The two branches are interchangeable to every caller -- this method's
        signature and return type are identical either way (C-3), so no other
        backend module observes the outcome."""
        if self._settings.firebase_auth_disabled:
            return f"https://dev.invalid/set-password?email={email}"
        _init_firebase(self._settings)
        try:
            return auth.generate_password_reset_link(email)
        except (auth.UserNotFoundError, ValueError, FirebaseError) as exc:
            logger.info(
                "reset link rejected for passwordless %s: %s -- email link fallback", email, exc
            )
            # cors_origins' first entry names the portal (C-3 note): no new
            # Settings field needed for the continue-URL.
            portal_url = self._settings.cors_origins.split(",")[0]
            action_code_settings = ActionCodeSettings(
                url=f"{portal_url}/set-password", handle_code_in_app=True
            )
            return auth.generate_sign_in_with_email_link(email, action_code_settings)

    def ensure_identity(self, email: str, password: str | None = None) -> tuple[str, bool]:
        """Returns (uid, created). If an identity already exists for `email`,
        returns its uid untouched with `created=False`; `password` applies only to
        a NEW identity. Staff enrolment and client onboarding refuse
        `created=False` with 409 (an existing identity may be someone's live
        account, even with no `users` row). Only the bootstrap CLI adopts it.
        """
        existing_uid = self.get_user_by_email(email)
        if existing_uid is not None:
            return existing_uid, False
        return self.create_user(email, password), True
