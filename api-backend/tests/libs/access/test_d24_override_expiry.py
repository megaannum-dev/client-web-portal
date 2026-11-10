# D24: expired overrides read as expired (not active), and past expiry dates are refused.
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from app.libs.access.schemas import AccessLevel, OverrideIn
from app.libs.access.service import AccessService
from app.libs.staff.repository import StaffRepository
from app.models.access import OverrideLevel
from app.models.users import AdminRole
from app.schemas.staff import StaffOverrideIn
from tests.libs.access.conftest import make_admin_user, make_override, seed_page_access

NOW = lambda: datetime.now(timezone.utc)  # noqa: E731


# ---------- create: past expiries are a 422 ----------
@pytest.mark.parametrize(
    "expires_at",
    [
        NOW() - timedelta(days=1),
        (NOW() - timedelta(minutes=1)).replace(tzinfo=None),  # naive = UTC
    ],
)
def test_override_in_refuses_a_past_expiry(expires_at):
    with pytest.raises(ValidationError, match="expiry date must be in the future"):
        OverrideIn(
            firebase_uid="u",
            page_id="admin.enroll-user",
            level=AccessLevel("VIEW"),
            reason="r",
            expires_at=expires_at,
        )


def test_staff_override_in_refuses_a_past_expiry():
    with pytest.raises(ValidationError, match="expiry date must be in the future"):
        StaffOverrideIn(
            page_id="admin.enroll-user",
            level="VIEW",
            reason="r",
            expires_at=NOW() - timedelta(days=1),
        )


@pytest.mark.parametrize("expires_at", [None, NOW() + timedelta(days=30)])
def test_future_or_missing_expiry_is_accepted(expires_at):
    body = OverrideIn(
        firebase_uid="u",
        page_id="admin.enroll-user",
        level=AccessLevel("VIEW"),
        reason="r",
        expires_at=expires_at,
    )
    assert body.expires_at == expires_at
    StaffOverrideIn(page_id="admin.enroll-user", level="VIEW", reason="r", expires_at=expires_at)


# ---------- read: the ledger flags expired rows ----------
def test_list_overrides_flags_expired_and_soon_separately(session):
    seed_page_access(session)
    rm = make_admin_user(session, AdminRole.RM)
    make_override(
        session, rm, "admin.enroll-user", OverrideLevel.VIEW, expires_at=NOW() - timedelta(days=1)
    )
    make_override(
        session,
        rm,
        "admin.system-config",
        OverrideLevel.VIEW,
        expires_at=NOW() + timedelta(days=10),
    )
    make_override(session, rm, "rm.request-tickets", OverrideLevel.VIEW, expires_at=None)

    by_page = {o.page_id: o for o in AccessService(session).list_overrides()}

    expired = by_page["admin.enroll-user"]
    assert (expired.is_expired, expired.expiring_soon) == (True, False)
    soon = by_page["admin.system-config"]
    assert (soon.is_expired, soon.expiring_soon) == (False, True)
    standing = by_page["rm.request-tickets"]
    assert (standing.is_expired, standing.expiring_soon) == (False, False)


# ---------- staff directory: "N active" excludes expired ----------
def test_directory_override_count_excludes_expired(session):
    rm = make_admin_user(session, AdminRole.RM)
    make_override(
        session, rm, "admin.enroll-user", OverrideLevel.VIEW, expires_at=NOW() - timedelta(days=1)
    )
    make_override(
        session,
        rm,
        "admin.system-config",
        OverrideLevel.VIEW,
        expires_at=NOW() + timedelta(days=10),
    )
    make_override(session, rm, "rm.request-tickets", OverrideLevel.VIEW, expires_at=None)

    [row] = [
        r for r in StaffRepository(session).list_directory() if r.firebase_uid == rm.firebase_uid
    ]
    assert row.override_count == 2
