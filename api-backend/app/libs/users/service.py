from app.libs.users.repository import UserRepository
from app.models.users import User


class UserService:
    def __init__(self, repo: UserRepository) -> None:
        self.repo = repo

    def get_by_firebase_uid(self, uid: str) -> User | None:
        return self.repo.get_by_firebase_uid(uid)

    def update_email(self, user: User, email: str) -> User:
        return self.repo.update_email(user, email)
