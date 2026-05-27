from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.users import User, UserRole


class UserRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get_by_firebase_uid(self, uid: str) -> User | None:
        return self.db.query(User).filter(User.firebase_uid == uid).one_or_none()

    def get_by_id(self, user_id: int) -> User | None:
        return self.db.query(User).filter(User.id == user_id).one_or_none()

    def create(self, uid: str, email: str | None, role: UserRole) -> User:
        user = User(firebase_uid=uid, email=email, role=role)
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def update_email(self, user: User, email: str) -> User:
        user.email = email
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def update_role(self, user: User, role: UserRole) -> User:
        user.role = role
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def list_all(self) -> list[User]:
        return self.db.query(User).all()


def get_user_repo(db: Annotated[Session, Depends(get_db)]) -> UserRepository:
    return UserRepository(db)
