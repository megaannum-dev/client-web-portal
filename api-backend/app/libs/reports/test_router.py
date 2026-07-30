"""Router-level auth test for EoM report comments — GET is open to any
authenticated admin, PUT is gated by Action.EOM_COMMENT_MANAGE (PC only).

Run: .venv/Scripts/python.exe -m pytest -q app/libs/reports/test_router.py
"""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.libs.auth.deps import get_current_admin_user
from app.main import app
from app.models.users import AdminProfile, AdminRole, Portal, User


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)

    def _override_get_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    stub_user = User(
        id=uuid.uuid4(),
        firebase_uid="uid-test-rm",
        email="rm@example.com",
        portal=Portal.ADMIN,
    )

    # RM has no EOM_COMMENT_MANAGE action (see app/libs/auth/actions.py
    # ROLE_ACTIONS) -- a non-PC role for the 403 assertion.
    seed_db = Session()
    seed_db.add(stub_user)
    seed_db.add(AdminProfile(user_id=stub_user.id, role=AdminRole.RM))
    seed_db.commit()
    seed_db.close()

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_admin_user] = lambda: stub_user
    try:
        yield TestClient(app), Session
    finally:
        app.dependency_overrides.clear()


def test_non_pc_role_gets_403_on_put_but_200_on_get(client):
    http, _Session = client

    get_resp = http.get("/api/reports/eom-comments")
    assert get_resp.status_code == 200, get_resp.text
    assert get_resp.json() == []

    put_resp = http.put(
        "/api/reports/eom-comments/EoM Summary", json={"comment": "Should not land"}
    )
    assert put_resp.status_code == 403


def test_pc_role_can_put_and_it_round_trips_on_get(client):
    http, Session = client

    db = Session()
    db.query(AdminProfile).update({"role": AdminRole.PC})
    db.commit()
    db.close()

    put_resp = http.put("/api/reports/eom-comments/EoM Summary", json={"comment": "Looks good"})
    assert put_resp.status_code == 200, put_resp.text
    body = put_resp.json()
    assert body["report_name"] == "EoM Summary"
    assert body["comment"] == "Looks good"
    assert body["updated_by"] == "uid-test-rm"

    get_resp = http.get("/api/reports/eom-comments")
    assert get_resp.status_code == 200, get_resp.text
    comments = get_resp.json()
    assert len(comments) == 1
    assert comments[0]["report_name"] == "EoM Summary"
    assert comments[0]["comment"] == "Looks good"
