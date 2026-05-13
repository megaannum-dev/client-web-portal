from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import get_current_user, require_roles
from app.models import User, UserRole
from app.schemas.user import UserOut, UserSelfUpdate, UserUpsert

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def read_me(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("/me", response_model=UserOut)
def update_me(
    body: UserSelfUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> User:
    """Authenticated user may refresh profile fields; role changes require an admin endpoint."""
    if body.email is not None:
        user.email = str(body.email)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{firebase_uid}/role", response_model=UserOut)
def update_user_role(
    firebase_uid: str,
    body: UserUpsert,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN)),
) -> User:
    row = db.query(User).filter(User.firebase_uid == firebase_uid).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    row.role = body.role
    if body.email is not None:
        row.email = str(body.email)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/{firebase_uid}", response_model=UserOut)
def read_user_by_uid(
    firebase_uid: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.ADMIN, UserRole.COMPLIANCE, UserRole.PM)),
) -> User:
    row = db.query(User).filter(User.firebase_uid == firebase_uid).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return row
