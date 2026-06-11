from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.users import AdminProfile, AdminRole, ClientProfile, Portal, User


class UserRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_firebase_uid(self, uid: str) -> User | None:
        return self.db.query(User).filter(User.firebase_uid == uid).one_or_none()

    def get_by_id(self, user_id: int) -> User | None:
        return self.db.query(User).filter(User.id == user_id).one_or_none()

    def update_email(self, user: User, email: str) -> User:
        user.email = email
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def create_client(self, uid: str, email: str | None) -> User:
        user = User(firebase_uid=uid, email=email, portal=Portal.CLIENT)
        self.db.add(user)
        self.db.flush()
        self.db.add(ClientProfile(user_id=user.id))  # empty profile (Q6)
        self.db.commit()
        self.db.refresh(user)
        return user

    def create_admin(self, uid: str, email: str | None, role: str | AdminRole) -> User:
        user = User(firebase_uid=uid, email=email, portal=Portal.ADMIN)
        self.db.add(user)
        self.db.flush()
        self.db.add(AdminProfile(user_id=user.id, role=AdminRole(role)))  # E-2 coercion
        self.db.commit()
        self.db.refresh(user)
        return user

    def list_all(self) -> list[User]:
        return self.db.query(User).all()


class AdminProfileRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_user_id(self, user_id: int) -> AdminProfile | None:
        return (
            self.db.query(AdminProfile)
            .filter(AdminProfile.user_id == user_id)
            .one_or_none()
        )

    def upsert_role(self, user_id: int, role: str | AdminRole) -> AdminProfile:
        coerced_role = AdminRole(role)  # E-2 coercion
        row = self.get_by_user_id(user_id)
        if row is None:
            row = AdminProfile(user_id=user_id, role=coerced_role)
            self.db.add(row)
        else:
            row.role = coerced_role
        self.db.commit()
        self.db.refresh(row)
        return row


class ClientProfileRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_user_id(self, user_id: int) -> ClientProfile | None:
        return (
            self.db.query(ClientProfile)
            .filter(ClientProfile.user_id == user_id)
            .one_or_none()
        )


def get_user_repo(db: Annotated[Session, Depends(get_db)]) -> UserRepository:
    return UserRepository(db)


def get_admin_profile_repo(
    db: Annotated[Session, Depends(get_db)],
) -> AdminProfileRepository:
    return AdminProfileRepository(db)


def get_client_profile_repo(
    db: Annotated[Session, Depends(get_db)],
) -> ClientProfileRepository:
    return ClientProfileRepository(db)
