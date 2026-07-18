# app-backend/app/libs/staff/service.py
from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import set_portal_claims
from app.libs.identity.service import FirebaseIdentityService
from app.libs.staff.repository import StaffRepository
from app.models.users import AdminRole, User


class StaffService:
    def __init__(self, db: Session) -> None:
        self.repo = StaffRepository(db)

    def enroll(
        self,
        *,
        caller_uid: str,
        email: str,
        name: str,
        role: AdminRole,
        phone_number: str | None,
        identity: FirebaseIdentityService,
        settings: Settings,
    ) -> tuple[User, str]:
        """Saga: Firebase identity first, DB row second (parity with BE-12).
        Firebase-fail -> ensure_identity raises before any DB write -> zero rows.
        Commit-fail on a newly-created identity (created=True) -> compensating
        delete_user (Risk A1). Commit-fail on an adopted identity (created=False,
        a pre-existing orphan) -> never deleted, since this call didn't mint it."""
        uid, created = identity.ensure_identity(email)
        try:
            self.repo.create_with_profile(
                user_id=uuid.uuid4(),
                firebase_uid=uid,
                email=email,
                role=role,
                authorized_by=caller_uid,
                name=name,
                phone_number=phone_number,
            )
            self.repo.db.commit()
        except Exception:
            self.repo.db.rollback()
            if created:  # Risk A1
                identity.delete_user(uid)
            raise
        set_portal_claims(uid, "admin", role.value, settings)  # Risk A4
        user = self.repo.db.query(User).filter(User.firebase_uid == uid).one()
        return user, identity.generate_invite_link(email)
