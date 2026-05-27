from __future__ import annotations

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
        return {"uid": "dev-user", "email": "dev@example.com"}
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
        return {"uid": "dev-user", "email": "dev@example.com"}
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
