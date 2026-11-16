"""Expired overrides are swept (with an audit row) and no longer block a re-grant.

Run: .venv/Scripts/python.exe -m pytest -q app/libs/access/test_service_expiry.py
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.libs.access.schemas import AccessLevel, OverrideIn
from app.libs.access.service import AccessService
from app.models.access import AdminAuditEvent, OverrideLevel
from app.models.users import AccountStatus, AdminProfile, AdminRole, Portal, User

NOW = datetime.now(timezone.utc)
PAST = NOW - timedelta(days=3)
FUTURE = NOW + timedelta(days=30)


@pytest.fixture
def session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def service(session):
    return AccessService(session)


def _admin(session, uid: str, role=AdminRole.RM) -> User:
    user = User(
        id=uuid.uuid4(), firebase_uid=uid, portal=Portal.ADMIN, status=AccountStatus.ACTIVE
    )
    session.add(user)
    session.flush()
    session.add(AdminProfile(user_id=user.id, name=uid, role=role))
    session.commit()
    session.refresh(user)
    return user


def _override(service, user, page_id, expires_at):
    row = service.repo.insert_override(
        user_id=user.id,
        page_id=page_id,
        level=OverrideLevel.VIEW,
        reason="r",
        granted_by=None,
        expires_at=expires_at,
    )
    service.repo.db.commit()
    return row


def _expired_events(session):
    return session.query(AdminAuditEvent).filter_by(event="override.expired").all()


def test_expire_removes_only_expired_and_audits_as_system(service, session):
    user = _admin(session, "u1")
    _override(service, user, "rm.client-info", PAST)
    active = _override(service, user, "rm.onboarding-renewal", FUTURE)

    assert service.expire_overrides() == 1

    left = service.repo.list_overrides()
    assert [o.id for o, _, _ in left] == [active.id]
    events = _expired_events(session)
    assert len(events) == 1
    assert events[0].actor_name == "System"


def test_second_sweep_is_a_noop(service, session):
    user = _admin(session, "u1")
    _override(service, user, "rm.client-info", PAST)
    assert service.expire_overrides() == 1

    assert service.expire_overrides() == 0
    assert len(_expired_events(session)) == 1


def test_grant_over_expired_succeeds_over_active_conflicts(service, session):
    user = _admin(session, "u1")
    actor = _admin(session, "boss", AdminRole.ADMIN)
    _override(service, user, "rm.client-info", PAST)
    _override(service, user, "rm.onboarding-renewal", FUTURE)

    body = OverrideIn(
        firebase_uid="u1", page_id="rm.client-info", level=AccessLevel.EDIT, reason="again"
    )
    assert service.grant_override(body, actor=actor).page_id == "rm.client-info"

    with pytest.raises(HTTPException) as exc:
        service.grant_override(
            body.model_copy(update={"page_id": "rm.onboarding-renewal"}), actor=actor
        )
    assert exc.value.status_code == 409
