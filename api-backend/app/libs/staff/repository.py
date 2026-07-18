# app-backend/app/libs/staff/repository.py
from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models.users import AccountStatus, AdminProfile, AdminRole, Portal, User


class StaffRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_with_profile(
        self,
        *,
        user_id: uuid.UUID,
        firebase_uid: str,
        email: str | None,
        role: AdminRole,
        authorized_by: str,
        name: str | None = None,
        phone_number: str | None = None,
    ) -> None:
        """Inserts users(portal=admin, status=ACTIVE) + admin_profiles(...) in the
        CALLER's transaction (no commit here — StaffService.enroll owns the txn
        boundary, per § 3.1 layering). status=ACTIVE is explicit, not relied on as
        the column default (DISABLED, per the DB layer's DB-1) — that default exists
        for staged client onboarding; there is no "pending admin" state."""
        user = User(
            id=user_id,
            firebase_uid=firebase_uid,
            email=email,
            portal=Portal.ADMIN,
            authorized_by=authorized_by,
            status=AccountStatus.ACTIVE,
        )
        self.db.add(user)
        self.db.flush()
        self.db.add(AdminProfile(user_id=user.id, role=role, name=name, phone_number=phone_number))

    def count_active_admins(self, *, for_update: bool = False) -> int:
        q = (
            self.db.query(AdminProfile)
            .join(User, User.id == AdminProfile.user_id)
            .filter(AdminProfile.role == AdminRole.ADMIN, User.status == AccountStatus.ACTIVE)
        )
        if for_update:
            q = q.with_for_update()
        return q.count()
