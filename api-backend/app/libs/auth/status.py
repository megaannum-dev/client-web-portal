from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.users import AccountStatus, Portal, User


def assert_can_authenticate(user: User, db: Session | None) -> None:
    """Pure login gate (proposal §4.6): raises 403 on disabled account or missing
    profile, else falls through. `db` is accepted for signature-compatibility with
    the frozen seam only — this function issues no queries of its own."""
    if user.status != AccountStatus.ACTIVE:
        raise HTTPException(403, "Account disabled")  # not yet activated | suspended
    if user.portal == Portal.CLIENT:
        if user.client_profile is None:
            raise HTTPException(403, "Account disabled")  # incomplete record (§4.11 class C)
    else:  # ADMIN
        if user.admin_profile is None:
            raise HTTPException(403, "Account disabled")  # incomplete record (§4.11 class C)
