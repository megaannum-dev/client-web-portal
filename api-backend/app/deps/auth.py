from __future__ import annotations

import json
import logging
import os
from typing import Annotated

import firebase_admin
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth, credentials
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.models import User, UserRole

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)
# Allow small time drift between client/browser and container clock.
FIREBASE_CLOCK_SKEW_SECONDS = 10


def _init_firebase(settings: Settings) -> None:
    if settings.firebase_auth_disabled:
        return
    try:
        firebase_admin.get_app()
        return
    except ValueError:
        pass
    cred_path = settings.firebase_credentials_path or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    json_blob = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    opts: dict[str, str] = {}
    if settings.firebase_project_id:
        opts["projectId"] = settings.firebase_project_id

    if json_blob:
        info = json.loads(json_blob)
        cred = credentials.Certificate(info)
        firebase_admin.initialize_app(cred, opts)
        return

    if cred_path:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, opts)
        return

    # Local/dev fallback: ID token verification only needs project context.
    # Try project-only init first to avoid forcing ADC when not required.
    if settings.firebase_project_id:
        try:
            firebase_admin.initialize_app(options=opts)
            return
        except Exception:
            # Fall through to ADC path if the runtime still requires credentials.
            pass

    try:
        cred = credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred, opts)
    except Exception as exc:
        raise RuntimeError(
            "Firebase Admin SDK is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or "
            "FIREBASE_CREDENTIALS_PATH, or set FIREBASE_AUTH_DISABLED=true for local smoke tests."
        ) from exc


def verify_firebase_id_token_string(id_token: str | None, settings: Settings) -> dict:
    """Verify a raw Firebase ID token string (e.g. from POST /auth/login)."""
    if settings.firebase_auth_disabled:
        return {"uid": "dev-user", "email": "dev@example.com"}
    if not id_token or not id_token.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="id_token is required")
    try:
        _init_firebase(settings)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    try:
        return auth.verify_id_token(id_token.strip(), clock_skew_seconds=FIREBASE_CLOCK_SKEW_SECONDS)
    except Exception as exc:
        logger.info("Invalid Firebase id_token: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired id_token"
        ) from exc


def verify_firebase_token(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict:
    """Verify Authorization: Bearer <Firebase ID token>."""
    if settings.firebase_auth_disabled:
        return {"uid": "dev-user", "email": "dev@example.com"}
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    try:
        _init_firebase(settings)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    try:
        return auth.verify_id_token(
            creds.credentials, clock_skew_seconds=FIREBASE_CLOCK_SKEW_SECONDS
        )
    except Exception as exc:
        logger.info("Invalid Firebase token: %s", exc)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc


def ensure_user_for_firebase_claims(db: Session, settings: Settings, claims: dict) -> User:
    """Create or update the portal user row for Firebase uid / email."""
    if settings.firebase_auth_disabled:
        uid = "dev-user"
        email = "dev@example.com"
        user = db.query(User).filter(User.firebase_uid == uid).one_or_none()
        if user is None:
            user = User(firebase_uid=uid, email=email, role=UserRole.ADMIN)
            db.add(user)
            db.commit()
            db.refresh(user)
            return user
        if user.email != email:
            user.email = email
            db.add(user)
            db.commit()
            db.refresh(user)
        return user

    uid = claims.get("uid")
    if not uid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing uid")
    email = claims.get("email")
    if isinstance(email, str):
        email = email.strip() or None
    else:
        email = None

    user = db.query(User).filter(User.firebase_uid == uid).one_or_none()
    if user is None:
        user = User(firebase_uid=uid, email=email, role=UserRole.CLIENT)
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    if email and user.email != email:
        user.email = email
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def get_current_user(
    token: Annotated[dict, Depends(verify_firebase_token)],
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    return ensure_user_for_firebase_claims(db, settings, token)


def require_roles(*allowed: UserRole):
    def _dep(user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.role not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return user

    return _dep
