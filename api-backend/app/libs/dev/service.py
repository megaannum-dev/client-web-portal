# api-backend/app/libs/dev/service.py
from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import (
    extract_uid_email,
    set_portal_claims,
    verify_firebase_id_token_string,
)
from app.libs.clients.repository import ClientRepository
from app.libs.staff.repository import StaffRepository
from app.libs.users.repository import UserRepository
from app.models.users import AccountStatus, AdminRole, User
from app.schemas.dev import DevRegisterIn


def dev_register(body: DevRegisterIn, db: Session, settings: Settings) -> User:
    """Dev-only self-registration (BE-23): the frontend already minted the
    Firebase identity via the client SDK, so this never calls
    identity.create_user/ensure_identity — it only stages the DB row(s) via the
    SAME ClientRepository/StaffRepository primitives real onboarding uses, then
    flips the account active immediately (no compliance-review wait in dev)."""
    claims = verify_firebase_id_token_string(body.id_token, settings)
    uid, email = extract_uid_email(claims, settings)

    if UserRepository(db).get_by_firebase_uid(uid) is not None:
        raise HTTPException(409, "Already registered")

    if body.portal == "client":
        ClientRepository(db).create_with_profile(
            user_id=uuid.uuid4(),
            firebase_uid=uid,
            email=email,
            name=email or uid,
            assigned_rm_uid=uid,
            authorized_by=uid,  # dev: self-authorized, no real RM
        )
        # dev convenience: flip to ACTIVE immediately -- create_with_profile relies
        # on the column default (DISABLED) for real onboarding, but dev self-reg
        # skips the activation step entirely (no compliance review in dev).
        new_user = UserRepository(db).get_by_firebase_uid(uid)
        assert new_user is not None  # just inserted above, in this same txn
        new_user.status = AccountStatus.ACTIVE
    else:
        StaffRepository(db).create_with_profile(
            user_id=uuid.uuid4(),
            firebase_uid=uid,
            email=email,
            name=email or uid,
            role=body.role or AdminRole.ADMIN,
            authorized_by=uid,
        )
    db.commit()
    set_portal_claims(uid, body.portal, (body.role.value if body.role else None), settings)
    result = UserRepository(db).get_by_firebase_uid(uid)
    assert result is not None  # just committed above, in this same txn
    return result
