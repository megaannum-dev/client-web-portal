from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request

from app.core.config import Settings
from app.models.users import Portal

logger = logging.getLogger(__name__)

# Firebase sends the mail itself from here, using the project's own Auth email template
# and sending infrastructure -- the same path as the Console's "Reset password" action.
# Replaces the Firestore `mail` collection + "Trigger Email from Firestore" extension,
# which is shut down 2027-03-31 and was never installed (docs piled up undelivered).
_OOB_ENDPOINT = "https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode"
_TIMEOUT_SECONDS = 10

# Where Firebase's action page sends the user once the password is set. This is the only
# genuinely per-portal behaviour left: the wording now lives in the project's single
# Auth template (Firebase allows one per project), so it cannot vary by portal.
# Both hosts must be listed under Auth > Settings > Authorized domains, or Firebase
# rejects the request with UNAUTHORIZED_CONTINUE_URI.
_PORTAL_SIGN_IN_URL: dict[Portal, str] = {
    Portal.ADMIN: "https://admin.megaannum.ai/login",
    Portal.CLIENT: "https://portal.megaannum.ai/login",
}


def send_set_password_email(*, to: str, portal: Portal, settings: Settings) -> bool:
    """Asks Firebase to email `to` a link for setting their password.

    Returns accepted-for-delivery, not delivered. Never raises: a failed send must not
    roll back an account that Firebase and MariaDB have both already committed.

    Firebase mints the one-time code as part of sending, so callers must NOT generate a
    link beforehand -- each new code invalidates the previous one, which would leave the
    pre-generated link dead. `portal` selects only the post-reset destination.

    Under settings.firebase_auth_disabled the payload is logged at INFO and True is
    returned -- the same dev-bypass shape every method in identity/service.py uses.
    """
    if settings.firebase_auth_disabled:
        logger.info("set-password email (dev bypass) to=%s portal=%s", to, portal.value)
        return True

    if not settings.firebase_web_api_key:
        logger.error(
            "FIREBASE_WEB_API_KEY is not set -- cannot send the set-password email to %s", to
        )
        return False

    payload = json.dumps(
        {
            "requestType": "PASSWORD_RESET",
            "email": to,
            "continueUrl": _PORTAL_SIGN_IN_URL[portal],
        }
    ).encode()
    request = urllib.request.Request(
        f"{_OOB_ENDPOINT}?key={settings.firebase_web_api_key}",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=_TIMEOUT_SECONDS) as response:
            # Note: with Email Enumeration Protection enabled (the default on recent
            # projects) Firebase answers 200 even for an unknown address, so a 200 here
            # means "accepted", never "the mailbox exists".
            return 200 <= response.status < 300
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:200]
        logger.error(
            "set-password email rejected for %s: HTTP %s %s", to, exc.code, detail
        )
        return False
    except Exception:  # noqa: BLE001 -- never raises, by contract
        logger.exception("set-password email could not be sent to %s", to)
        return False
