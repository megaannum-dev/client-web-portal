from app.libs.users.repository import UserRepository
from app.models.users import AdminProfile, ClientProfile, Portal, User
from app.schemas.users import UserSelfUpdate


class UserService:
    def __init__(self, repo: UserRepository) -> None:
        self.repo = repo

    def get_by_firebase_uid(self, uid: str) -> User | None:
        return self.repo.get_by_firebase_uid(uid)

    def update_email(self, user: User, email: str) -> User:
        return self.repo.update_email(user, email)

    def update_self(self, user: User, patch: UserSelfUpdate) -> User:
        """BE-19: self-service PATCH /me, benign fields only. role/status are
        not on UserSelfUpdate at all (schema-level exclusion), so there is
        nothing here to ignore -- they simply can't arrive."""
        if patch.email is not None:
            user = self.repo.update_email(user, str(patch.email))
        if patch.name is not None or patch.phone_number is not None:
            self._write_profile_fields(user, patch.name, patch.phone_number)
        return user

    def _write_profile_fields(self, user: User, name: str | None, phone_number: str | None) -> None:
        # ponytail: repository.py is out of scope for this unit, so this reads/
        # writes the profile table directly via the repo's session rather than
        # a new repository method. Fold into a ProfileRepository if BE-15/BE-11
        # introduce one and this becomes a duplicate.
        db = self.repo.db
        if user.portal == Portal.CLIENT:
            client_profile = (
                db.query(ClientProfile).filter(ClientProfile.user_id == user.id).one_or_none()
            )
            if client_profile is None:
                client_profile = ClientProfile(user_id=user.id)
                db.add(client_profile)
            if name is not None:
                client_profile.name = name
            if phone_number is not None:
                client_profile.primary_phone = phone_number
        else:
            admin_profile = (
                db.query(AdminProfile).filter(AdminProfile.user_id == user.id).one_or_none()
            )
            if admin_profile is None:
                return  # AdminProfile.role is non-nullable; can't manufacture one here
            if name is not None:
                admin_profile.name = name
            if phone_number is not None:
                admin_profile.phone_number = phone_number
        db.commit()
