from app.models.users import User, UserRole
from app.libs.users.repository import UserRepository


class UserService:
    def __init__(self, repo: UserRepository) -> None:
        self.repo = repo

    def get_by_firebase_uid(self, uid: str) -> User | None:
        return self.repo.get_by_firebase_uid(uid)

    def ensure_user(self, uid: str, email: str | None, role: UserRole) -> User:
        user = self.repo.get_by_firebase_uid(uid)
        if user is None:
            return self.repo.create(uid, email, role)
        if email and user.email != email:
            return self.repo.update_email(user, email)
        return user

    def update_email(self, user: User, email: str) -> User:
        return self.repo.update_email(user, email)

    def update_role(self, user: User, role: UserRole) -> User:
        return self.repo.update_role(user, role)
