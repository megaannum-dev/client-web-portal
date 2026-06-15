"""Smoke tests proving the B0 harness actually works.

These exercise: the TestClient + dependency overrides (/health), the Session
fixture + a factory round-trip, the settings override, and the
FakeFirebaseIdentityService contract (including ensure_identity semantics).
"""

from __future__ import annotations

from app.core.config import get_settings
from app.main import app
from app.models.users import AdminRole, ClientProfile, Portal, User


# --------------------------------------------------------------------------- #
# B0.1 — TestClient runs                                                       #
# --------------------------------------------------------------------------- #
def test_health_endpoint(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


# --------------------------------------------------------------------------- #
# B0.1 / B0.4 — Session fixture + factory round-trip                          #
# --------------------------------------------------------------------------- #
def test_session_and_client_factory_roundtrip(db_session, factories):
    user = factories.make_client(db_session, email="alice@example.test")

    fetched = db_session.query(User).filter_by(firebase_uid=user.firebase_uid).one()
    assert fetched.email == "alice@example.test"
    assert fetched.portal == Portal.CLIENT
    # derived wire role
    assert fetched.role == "CLIENT"
    # attached profile row exists
    profile = db_session.query(ClientProfile).filter_by(user_id=fetched.id).one()
    assert profile.user_id == fetched.id


def test_admin_and_rm_factories(db_session, factories):
    admin = factories.make_admin(db_session, role=AdminRole.ADMIN)
    rm = factories.make_rm(db_session)

    assert admin.portal == Portal.ADMIN
    assert admin.role == "ADMIN"
    assert rm.role == "RM"
    # distinct uids/emails generated automatically
    assert admin.firebase_uid != rm.firebase_uid
    assert admin.email != rm.email


# --------------------------------------------------------------------------- #
# B0.2 — settings override works via dependency_overrides                      #
# --------------------------------------------------------------------------- #
def test_settings_override(client, settings):
    # The client fixture installs a get_settings override.
    assert get_settings in app.dependency_overrides
    assert app.dependency_overrides[get_settings]().firebase_auth_disabled is True
    assert settings.firebase_auth_disabled is True


# --------------------------------------------------------------------------- #
# B0.3 — FakeFirebaseIdentityService contract                                  #
# --------------------------------------------------------------------------- #
def test_fake_firebase_ensure_identity_semantics(fake_firebase):
    uid, created = fake_firebase.ensure_identity("bob@example.test")
    assert created is True
    assert uid.startswith("fake-uid-")

    # adopting an existing identity -> same uid, created False
    uid2, created2 = fake_firebase.ensure_identity("BOB@example.test")  # case-insensitive
    assert created2 is False
    assert uid2 == uid


def test_fake_firebase_create_get_delete(fake_firebase):
    assert fake_firebase.get_user_by_email("carol@example.test") is None

    uid = fake_firebase.create_user("carol@example.test")
    assert fake_firebase.get_user_by_email("carol@example.test") == uid

    # duplicate create raises
    import pytest

    from tests.fakes import FakeFirebaseIdentityError

    with pytest.raises(FakeFirebaseIdentityError):
        fake_firebase.create_user("carol@example.test")

    # invite link is deterministic
    assert fake_firebase.generate_invite_link("carol@example.test") == (
        "https://fake-invite.local/carol@example.test"
    )

    # delete is idempotent; not-found is success
    fake_firebase.delete_user(uid)
    assert fake_firebase.get_user_by_email("carol@example.test") is None
    fake_firebase.delete_user(uid)  # no error
    fake_firebase.delete_user("never-existed")  # no error
