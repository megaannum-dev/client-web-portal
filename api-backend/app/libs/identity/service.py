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

    def create_user(self, email: str) -> str:
        """Admin SDK create; returns the new uid. Raises on failure (caller catches).

        PASSWORDLESS by construction (C-1): no `password` argument, so the account
        holds no password credential at all until its holder sets one through the
        emailed set-password link. There is no interval in which a credential the
        system chose exists."""
        if self._settings.firebase_auth_disabled:
            return f"dev-{email}"  # unchanged: deterministic synthetic uid
        _init_firebase(self._settings)
        user = auth.create_user(email=email)  # was: password=_DEFAULT_PASSWORD
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
