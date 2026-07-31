"""BE-5 unit test: symbol sub-resource routes — status codes, guard, 404s.

Run: .venv/Scripts/python.exe -m pytest -q app/libs/trade_models/test_router_symbols.py
"""

import uuid
from typing import Annotated

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session as OrmSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.libs.auth.deps import get_current_admin_user
from app.main import app
from app.models.access import AccessLevel, PageAccess
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
        firebase_uid="uid-test-admin",
        email="admin@example.com",
        portal=Portal.ADMIN,
    )

    # Seed the admin profile so require_action(MODEL_WRITE) grants naturally
    # (ADMIN role has every action — see app/libs/auth/actions.py). Also seeds
    # one page_access row: ADMIN edit on pc.model-management, the page this
    # router's actions are keyed on (proposal 019 / BE-5 -- require_action now
    # resolves from page_access, not the deleted ROLE_ACTIONS, so an
    # unseeded table would deny even ADMIN). COMPLIANCE gets no row for this
    # page, so the mid-test role switch to COMPLIANCE is denied exactly as
    # this test already expects.
    seed_db = Session()
    seed_db.add(stub_user)
    seed_db.add(AdminProfile(user_id=stub_user.id, role=AdminRole.ADMIN))
    seed_db.add(
        PageAccess(page_id="pc.model-management", role=AdminRole.ADMIN, level=AccessLevel.EDIT)
    )
    seed_db.commit()
    seed_db.close()

    def _override_get_current_admin_user(
        db: Annotated[OrmSession, Depends(get_db)],
    ) -> User:
        """Re-queries `stub_user` by id on the CURRENT request's session, rather
        than handing back the one Python object created above (mirroring how
        `get_current_admin_user` -> `_resolve_user` always re-queries per real
        request). Two reasons this matters, both surfaced by proposal 019's
        BE-4/BE-5 (`access.resolver` reads `user.admin_profile` on every
        guarded request):
          1. A fixed object detaches the instant `seed_db.close()` runs above,
             so any later `user.admin_profile` access (a `lazy="joined"`
             relationship, app/models/users.py) raises `DetachedInstanceError`.
          2. This test mutates `AdminProfile.role` directly via a separate
             session mid-test (the COMPLIANCE/ADMIN role-switch below) to
             exercise the guard both ways. A single cached Python object's
             `admin_profile` relationship, once populated, never observes that
             write -- only a fresh per-request query does, exactly like a real
             request would."""
        return db.query(User).filter(User.id == stub_user.id).one()

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_admin_user] = _override_get_current_admin_user
    try:
        yield TestClient(app), Session
    finally:
        app.dependency_overrides.clear()


def _create_model(http) -> str:
    resp = http.post("/api/pc/models", json={"name": "M", "symbols": []})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_symbol_routes_guarded_and_codes(client):
    http, Session = client
    model_id = _create_model(http)

    # require_action denies MODEL_WRITE when the admin's role has no actions
    # (COMPLIANCE — see app/libs/auth/actions.py ROLE_ACTIONS).
    db = Session()
    db.query(AdminProfile).update({"role": AdminRole.COMPLIANCE})
    db.commit()
    db.close()

    denied = http.post(f"/api/pc/models/{model_id}/symbols", json={"symbol": "AAPL"})
    assert denied.status_code == 403

    db = Session()
    db.query(AdminProfile).update({"role": AdminRole.ADMIN})
    db.commit()
    db.close()

    # POST -> 201, symbol added.
    resp = http.post(f"/api/pc/models/{model_id}/symbols", json={"symbol": "aapl"})
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert any(s["symbol"] == "AAPL" and s["active"] for s in body["symbols"])

    # PATCH -> 200, deactivate.
    resp = http.patch(f"/api/pc/models/{model_id}/symbols/AAPL", json={"active": False})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert any(s["symbol"] == "AAPL" and not s["active"] for s in body["symbols"])

    # DELETE -> 204.
    resp = http.delete(f"/api/pc/models/{model_id}/symbols/AAPL")
    assert resp.status_code == 204, resp.text
    assert resp.content == b""

    # 404 on missing symbol.
    resp = http.patch(f"/api/pc/models/{model_id}/symbols/NOPE", json={"active": True})
    assert resp.status_code == 404

    # include=symbol_audit surfaces the trail.
    resp = http.get(f"/api/pc/models/{model_id}?include=symbol_audit")
    assert resp.status_code == 200, resp.text
    audit = resp.json()["symbol_audit"]
    ops = [a["op"] for a in audit if a["symbol"] == "AAPL"]
    assert ops == ["removed", "deactivated", "added"]  # newest-first
