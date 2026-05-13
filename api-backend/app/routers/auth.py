from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.deps.auth import ensure_user_for_firebase_claims, get_current_user, verify_firebase_id_token_string
from app.models import User, UserRole
from app.schemas.auth import FirebaseLoginBody
from app.schemas.user import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register_with_firebase(
    body: FirebaseLoginBody,
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
) -> User:
    """
    Create the portal `users` row for a **new** Firebase account (after `createUserWithEmailAndPassword` or first Google sign-in).

    Returns **409** if this Firebase user already has a portal profile — then call `POST /api/auth/login` instead.
    """
    claims = verify_firebase_id_token_string(body.id_token, settings)

    if settings.firebase_auth_disabled:
        existing = db.query(User).filter(User.firebase_uid == "dev-user").one_or_none()
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Portal dev user already exists. Use POST /api/auth/login.",
            )
        return ensure_user_for_firebase_claims(db, settings, claims)

    uid = claims.get("uid")
    if not uid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing uid")

    existing = db.query(User).filter(User.firebase_uid == uid).one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This Firebase account is already registered with the portal. Use POST /api/auth/login.",
        )

    email = claims.get("email")
    if isinstance(email, str):
        email = email.strip() or None
    else:
        email = None

    user = User(firebase_uid=uid, email=email, role=UserRole.CLIENT)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=UserOut)
def login_with_firebase(
    body: FirebaseLoginBody,
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
) -> User:
    """
    Verify a Firebase ID token and return the portal user (upsert: create if missing, refresh email when needed).

    Use for **returning** sign-ins. For **first-time** portal registration, call `POST /api/auth/register` first
    (the client helper `syncPortalUserAfterFirebaseAuth` tries register, then login on 409).
    """
    claims = verify_firebase_id_token_string(body.id_token, settings)
    return ensure_user_for_firebase_claims(db, settings, claims)


@router.get("/me", response_model=UserOut)
def auth_me(user: User = Depends(get_current_user)) -> User:
    """Same as GET /api/users/me; kept under /auth for a single client session surface."""
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def logout() -> Response:
    """
    Firebase sessions are client-side; revoke or clear tokens in the browser.

    This endpoint exists so clients can hit a dedicated URL for analytics or future server-side revoke.
    """
    return Response(status_code=status.HTTP_204_NO_CONTENT)
