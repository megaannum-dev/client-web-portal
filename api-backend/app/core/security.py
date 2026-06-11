from __future__ import annotations

import base64
import json
import logging
from typing import Annotated

import firebase_admin
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth, credentials

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)

FIREBASE_CLOCK_SKEW_SECONDS = 10
security = HTTPBearer(auto_error=False)


def _decode_jwt_payload_unverified(token: str) -> dict[str, object]:
    """Decode the payload of a JWT without verifying the signature.
    Used only when FIREBASE_AUTH_DISABLED=true so multiple dev users
    can be distinguished by their real Firebase uid."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return {}
        padding = 4 - len(parts[1]) % 4
        payload = parts[1] + ("=" * padding)
        return json.loads(base64.urlsafe_b64decode(payload))
    except Exception:
        return {}


def _extract_dev_claims(token: str | None) -> dict:  # type: ignore[type-arg]
    """Return synthetic claims when FIREBASE_AUTH_DISABLED=true.

    Decodes the JWT payload without signature verification so distinct test
    identities can be told apart by their real Firebase uid; falls back to a
    shared ``dev-user`` sentinel when no decodable token is present.
    """
    if token and token.strip():
        claims = _decode_jwt_payload_unverified(token.strip())
        uid = claims.get("user_id") or claims.get("sub")
        if uid:
            return {"uid": str(uid), "email": claims.get("email")}
    return {"uid": "dev-user", "email": "dev@example.com"}


def extract_uid_email(claims: dict) -> tuple[str, str | None]:  # type: ignore[type-arg]
    """Extract and validate ``uid`` and normalised ``email`` from verified Firebase claims.

    Raises ``HTTP 401`` when ``uid`` is absent.  Strips and null-coerces the
    email so callers never receive an empty string.
    """
    uid = claims.get("uid")
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing uid"
        )
    raw_email = claims.get("email")
    email = (
        raw_email.strip() if isinstance(raw_email, str) and raw_email.strip() else None
    )
    return str(uid), email


def _init_firebase(settings: Settings) -> None:
    if settings.firebase_auth_disabled:
        return
    try:
        firebase_admin.get_app()
        return
    except ValueError:
        pass

    opts: dict[str, str] = {}
    if settings.firebase_project_id:
        opts["projectId"] = settings.firebase_project_id

    if settings.firebase_service_account_json:
        info = json.loads(settings.firebase_service_account_json)
        cred = credentials.Certificate(info)
        firebase_admin.initialize_app(cred, opts)
        return

    cred_path = settings.firebase_credentials_path
    if cred_path:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, opts)
        return

    if settings.firebase_project_id:
        try:
            firebase_admin.initialize_app(options=opts)
            return
        except Exception:
            pass

    try:
        cred = credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred, opts)
    except Exception as exc:
        raise RuntimeError(
            "Firebase Admin SDK is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or "
            "FIREBASE_CREDENTIALS_PATH, or set FIREBASE_AUTH_DISABLED=true for local smoke tests."
        ) from exc


def verify_firebase_id_token_string(id_token: str | None, settings: Settings) -> dict:  # type: ignore[type-arg]
    """Verify a raw Firebase ID token string (e.g. from POST /auth/login)."""
    if settings.firebase_auth_disabled:
        return _extract_dev_claims(id_token)
    if not id_token or not id_token.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="id_token is required"
        )
    try:
        _init_firebase(settings)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)
        ) from exc
    try:
        return auth.verify_id_token(
            id_token.strip(), clock_skew_seconds=FIREBASE_CLOCK_SKEW_SECONDS
        )
    except Exception as exc:
        logger.info("Invalid Firebase id_token: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired id_token",
        ) from exc


def verify_firebase_token(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict:  # type: ignore[type-arg]
    """Verify Authorization: Bearer <Firebase ID token>."""
    if settings.firebase_auth_disabled:
        return _extract_dev_claims(creds.credentials if creds is not None else None)
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token"
        )
    try:
        _init_firebase(settings)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)
        ) from exc
    try:
        return auth.verify_id_token(
            creds.credentials, clock_skew_seconds=FIREBASE_CLOCK_SKEW_SECONDS
        )
    except Exception as exc:
        logger.info("Invalid Firebase token: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        ) from exc


def set_portal_claims(
    uid: str, portal: str, role: str | None, settings: Settings
) -> None:
    """Stamp portal (and role for admins) onto the user's Firebase token.

    No-op under FIREBASE_AUTH_DISABLED — dev tokens are decoded unverified and
    carry no server-set claims, so portal is sourced from DB/body in dev (Q5).
    """
    if settings.firebase_auth_disabled:
        return
    _init_firebase(settings)
    claims = {"portal": portal}
    if role is not None:
        claims["role"] = role
    auth.set_custom_user_claims(uid, claims)


def portal_from_claims(claims: dict) -> str | None:  # type: ignore[type-arg]
    """Read the server-set portal claim from a verified token, if present."""
    value = claims.get("portal")
    return value if value in ("client", "admin") else None
