"""Idempotent bootstrap seed for the first ADMIN (BE-21).

Out-of-band, non-HTTP entry point -- no authority yet exists to gate this via
POST /api/admin/staff. Run as `python -m app.cli.bootstrap_admin`.

Safe to re-run: no-op once an ADMIN already exists (never seeds a second one).
Under `firebase_auth_disabled`, seeds the deterministic `dev-user` admin the
removed deps.py auto-create used to manufacture (Risk A3), so offline dev
keeps a working admin once BE-7/BE-10 land.
"""

from __future__ import annotations

import uuid

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.libs.identity.service import FirebaseIdentityService
from app.libs.staff.repository import StaffRepository
from app.models.users import AdminRole


def run() -> None:
    settings = get_settings()
    db = SessionLocal()
    try:
        staff_repo = StaffRepository(db)
        if staff_repo.count_active_admins() > 0:
            print("Bootstrap: an ADMIN already exists, no-op.")
            return

        identity = FirebaseIdentityService(settings)
        if settings.firebase_auth_disabled:
            # Risk A3: seed the dev-user admin the removed deps.py auto-create used
            # to manufacture, so offline dev keeps a working admin once BE-7/BE-10 land.
            uid = "dev-user"
        else:
            if not settings.bootstrap_admin_email:
                raise SystemExit("BOOTSTRAP_ADMIN_EMAIL is not set.")
            uid, _created = identity.ensure_identity(settings.bootstrap_admin_email)

        staff_repo.create_with_profile(
            user_id=uuid.uuid4(),
            firebase_uid=uid,
            email=settings.bootstrap_admin_email or "dev@example.com",
            role=AdminRole.ADMIN,
            # NULL: no authorizer for the root admin. StaffRepository.create_with_profile's
            # `authorized_by` param is typed `str` (BE-15), narrower than the nullable DB
            # column it writes -- ponytail: type: ignore, widen to `str | None` in BE-15's
            # repository.py if another NULL-authorizer caller ever needs it untyped-clean.
            authorized_by=None,  # type: ignore[arg-type]
            name=settings.bootstrap_admin_name,
        )
        db.commit()
        link = identity.generate_invite_link(settings.bootstrap_admin_email or "dev@example.com")
        print(f"Bootstrap: seeded first ADMIN ({uid}). Invite link: {link}")
    finally:
        db.close()


if __name__ == "__main__":
    run()
