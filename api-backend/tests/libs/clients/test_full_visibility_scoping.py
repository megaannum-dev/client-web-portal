# Only ADMIN is in core.config.FULL_VISIBILITY_ROLES. COMPLIANCE holds CLIENT_VIEW but
# is scoped to its own book like RM, so with no clients of its own it sees nothing.
#
# Run: .venv/Scripts/python.exe -m pytest -q tests/libs/clients/test_full_visibility_scoping.py

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException

from app.libs.clients.service import ClientService
from app.models.users import AccountStatus, AdminProfile, AdminRole, Portal, User


@pytest.fixture
def compliance(session):
    user = User(
        id=uuid.uuid4(),
        firebase_uid=f"compliance-uid-{uuid.uuid4()}",
        email="compliance@example.com",
        portal=Portal.ADMIN,
        status=AccountStatus.ACTIVE,
    )
    session.add(user)
    session.flush()
    session.add(AdminProfile(user_id=user.id, role=AdminRole.COMPLIANCE, name="Cory Compliance"))
    session.commit()
    return user


def test_compliance_gets_an_empty_client_list(session, client_target, compliance):
    out = ClientService(session).list_visible(AdminRole.COMPLIANCE, compliance.firebase_uid)
    assert out.items == []


def test_compliance_gets_404_for_a_client_outside_its_book(session, client_target, compliance):
    with pytest.raises(HTTPException) as exc:
        ClientService(session).get_visible(
            AdminRole.COMPLIANCE, compliance.firebase_uid, client_target.id
        )
    assert exc.value.status_code == 404


def test_admin_still_sees_every_client(session, client_target, compliance):
    out = ClientService(session).list_visible(AdminRole.ADMIN, compliance.firebase_uid)
    assert [i.id for i in out.items] == [str(client_target.id)]
