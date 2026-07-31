from __future__ import annotations

import logging

from firebase_admin import firestore

from app.core.config import Settings
from app.core.security import _init_firebase
from app.models.users import Portal

logger = logging.getLogger(__name__)

_MAIL_COLLECTION = "mail"  # the Firebase "Trigger Email from Firestore" extension

_PORTAL_SIGN_IN_URL: dict[Portal, str] = {
    Portal.ADMIN: "https://admin.megaannum.ai/login",
    Portal.CLIENT: "https://portal.megaannum.ai/login",
}

_PORTAL_RESEND_CONTACT: dict[Portal, str] = {
    Portal.ADMIN: "your administrator",
    Portal.CLIENT: "your relationship manager",
}


def send_set_password_email(
    *, to: str, name: str, link: str, portal: Portal, settings: Settings
) -> bool:
    """Queues one Firestore `mail` doc for the Trigger Email extension.

    Returns queued, not delivered. Never raises: a failed send must not roll back
    an account that Firebase and MariaDB have both already committed.

    ONE template; `portal` selects the wording and the destination sign-in URL.
    Under settings.firebase_auth_disabled the payload is logged at INFO and True
    is returned -- the same dev-bypass shape every method in identity/service.py
    uses.
    """
    if settings.firebase_auth_disabled:
        logger.info(
            "set-password email (dev bypass) to=%s portal=%s link=%s",
            to,
            portal.value,
            link,
        )
        return True

    sign_in_url = _PORTAL_SIGN_IN_URL[portal]
    resend_contact = _PORTAL_RESEND_CONTACT[portal]
    subject = f"Set your password for the {portal.value} portal"
    text = (
        f"Hi {name},\n\n"
        f"Your account ({to}) has been created for the {portal.value} portal.\n"
        f"Set your password before signing in: {link}\n\n"
        f"This link expires. If it has expired, request a fresh one from {resend_contact}.\n\n"
        f"Sign in at: {sign_in_url}"
    )
    html = (
        f"<p>Hi {name},</p>"
        f"<p>Your account (<strong>{to}</strong>) has been created for the "
        f"{portal.value} portal.</p>"
        f'<p><a href="{link}">Set your password</a> before signing in.</p>'
        f"<p>This link expires. If it has expired, request a fresh one from "
        f"{resend_contact}.</p>"
        f'<p>Sign in at: <a href="{sign_in_url}">{sign_in_url}</a></p>'
    )

    try:
        _init_firebase(settings)
        firestore.client().collection(_MAIL_COLLECTION).add(
            {"to": [to], "message": {"subject": subject, "html": html, "text": text}}
        )
        return True
    except Exception:  # noqa: BLE001 -- never raises, by contract
        logger.exception("set-password email could not be queued for %s", to)
        return False


def send_account_ready_email(*, to: str, name: str, portal: Portal, settings: Settings) -> bool:
    """Queues a "your account is ready" notice for a staff account created with a
    generated password (the admin hands the password off directly) -- same
    queue/never-raises/dev-bypass contract as `send_set_password_email`, but
    intentionally carries NO link and NO password: the admin is the only
    channel for the credential."""
    if settings.firebase_auth_disabled:
        logger.info("account-ready email (dev bypass) to=%s portal=%s", to, portal.value)
        return True

    sign_in_url = _PORTAL_SIGN_IN_URL[portal]
    resend_contact = _PORTAL_RESEND_CONTACT[portal]
    subject = f"Your {portal.value} portal account is ready"
    text = (
        f"Hi {name},\n\n"
        f"Your account ({to}) has been created for the {portal.value} portal.\n"
        f"Ask {resend_contact} for your sign-in credentials.\n\n"
        f"Sign in at: {sign_in_url}"
    )
    html = (
        f"<p>Hi {name},</p>"
        f"<p>Your account (<strong>{to}</strong>) has been created for the "
        f"{portal.value} portal.</p>"
        f"<p>Ask {resend_contact} for your sign-in credentials.</p>"
        f'<p>Sign in at: <a href="{sign_in_url}">{sign_in_url}</a></p>'
    )

    try:
        _init_firebase(settings)
        firestore.client().collection(_MAIL_COLLECTION).add(
            {"to": [to], "message": {"subject": subject, "html": html, "text": text}}
        )
        return True
    except Exception:  # noqa: BLE001 -- never raises, by contract
        logger.exception("account-ready email could not be queued for %s", to)
        return False
