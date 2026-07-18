# app-backend/app/libs/staff/service.py
from __future__ import annotations

import uuid
from typing import Protocol

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import set_portal_claims
from app.libs.identity.service import FirebaseIdentityService
from app.libs.staff.repository import StaffRepository
from app.libs.users.repository import AdminProfileRepository, UserRepository
from app.models.users import AccountStatus, AdminRole, Portal, User


class StaffUpdatePatch(Protocol):
    """Structural shape of BE-17's `StaffUpdateIn` (app/schemas/staff.py) -- this
    unit does not import that schema (BE-17's file, out of BE-16 scope); any object
    with these attributes (a Pydantic model or a plain namespace) satisfies it."""

    role: AdminRole | None
    status: AccountStatus | None
    name: str | None
    phone_number: str | None
    email: str | None


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

    def update(self, uid: str, patch: StaffUpdatePatch, settings: Settings) -> User:
        """Risk A2 last-ADMIN TOCTOU guard: demoting/disabling the sole active ADMIN
        must be rejected atomically -- the active-admin count is read with
        `SELECT ... FOR UPDATE` (via count_active_admins(for_update=True)) inside
        THIS transaction, so two concurrent demotions of two different admins can't
        both observe count>=2 and both commit, leaving zero active admins."""
        user = UserRepository(self.repo.db).get_by_firebase_uid(uid)
        if user is None:
            raise HTTPException(404, "User not found")
        if user.portal != Portal.ADMIN:
            raise HTTPException(409, "User is not an admin-portal user")

        profile = AdminProfileRepository(self.repo.db).get_by_user_id(user.id)
        assert profile is not None  # invariant: every Portal.ADMIN user has one AdminProfile row

        is_demotion = (
            patch.role is not None
            and patch.role != AdminRole.ADMIN
            and profile.role == AdminRole.ADMIN
        )
        is_disabling = (
            patch.status == AccountStatus.DISABLED and user.status == AccountStatus.ACTIVE
        )
        demoting_or_disabling = is_demotion or is_disabling
        if demoting_or_disabling:
            active_admins = self.repo.count_active_admins(for_update=True)
            if (
                profile.role == AdminRole.ADMIN
                and user.status == AccountStatus.ACTIVE
                and active_admins <= 1
            ):
                self.repo.db.rollback()
                raise HTTPException(409, "Cannot demote/disable the last active ADMIN")

        if patch.role is not None:
            profile.role = patch.role
        if patch.status is not None:
            user.status = patch.status
        if patch.name is not None:
            profile.name = patch.name
        if patch.phone_number is not None:
            profile.phone_number = patch.phone_number
        if patch.email is not None:
            user.email = patch.email  # local contact email only -- NOT the Firebase credential

        self.repo.db.commit()
        if patch.role is not None:
            set_portal_claims(uid, "admin", patch.role.value, settings)
        self.repo.db.refresh(user)
        return user
