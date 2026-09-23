"""HTTP boundary tests for POST /api/mobo/ib-ingest.

`ingest_day` is patched directly (module-level, on app.libs.ib_ingest.router
where the router imported it) -- no network, no real DB. Auth is overridden
the same way tests/libs/post_trade_allocation/test_be7_router.py does it
(get_current_admin_user override + a committed admin User via
tests.conftest.make_admin_stub), since require_action needs a real
AdminProfile row to check the role against.

Run: .venv/Scripts/python.exe -m pytest -q tests/libs/ib_ingest/test_router.py
"""

from __future__ import annotations

from datetime import date
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.flex_query import FlexUnavailable
from app.libs.auth.deps import get_current_admin_user
from app.libs.ib_ingest.service import IngestFailed, MarketStillOpen
from app.main import app
from app.models.access import AccessLevel, PageAccess
from app.models.users import AdminRole
from tests.conftest import make_admin_stub


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

    stub_user = make_admin_stub(
        Session, role=AdminRole.MOBO, firebase_uid="uid-ib-ingest-router", email="admin@example.com"
    )

    # require_action(POST_TRADE_ALLOCATION_RUN) resolves through actions_for(),
    # which is fail-closed on an empty page_access table (access/resolver.py) --
    # seed the same (page, role, level) grant that gives MOBO
    # POST_TRADE_ALLOCATION_RUN today (access/pages.py "mobo.post-trade-allocation"
    # EDIT bucket), same as the real seeded matrix.
    seed = Session()
    seed.add(PageAccess(page_id="mobo.post-trade-allocation", role=AdminRole.MOBO, level=AccessLevel.EDIT))
    seed.commit()
    seed.close()

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_admin_user] = lambda: stub_user
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


# --- 1. Happy path -----------------------------------------------------------


def test_happy_path_returns_200_with_six_counts(client):
    with patch("app.libs.ib_ingest.router.ingest_day") as mock_ingest:
        mock_ingest.return_value = (1, 2, 3, 4, 5, 6)
        resp = client.post("/api/mobo/ib-ingest?day=2026-09-15")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["day"] == "2026-09-15"
    assert body["orders_inserted"] == 1
    assert body["orders_skipped"] == 2
    assert body["trades_inserted"] == 3
    assert body["trades_skipped"] == 4
    assert body["summaries_inserted"] == 5
    assert body["summaries_skipped"] == 6
    mock_ingest.assert_called_once_with(date(2026, 9, 15))


# --- 2. MarketStillOpen -> 409 ------------------------------------------------


def test_market_still_open_returns_409_with_message(client):
    with patch("app.libs.ib_ingest.router.ingest_day") as mock_ingest:
        mock_ingest.side_effect = MarketStillOpen("2026-09-21 is still in progress")
        resp = client.post("/api/mobo/ib-ingest?day=2026-09-21")

    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == "2026-09-21 is still in progress"


# --- 3. IngestFailed -> 502 ---------------------------------------------------


def test_ingest_failed_returns_502_with_message(client):
    with patch("app.libs.ib_ingest.router.ingest_day") as mock_ingest:
        mock_ingest.side_effect = IngestFailed("Flex Web Service returned a Fail envelope")
        resp = client.post("/api/mobo/ib-ingest?day=2026-09-15")

    assert resp.status_code == 502, resp.text
    assert resp.json()["detail"] == "Flex Web Service returned a Fail envelope"


# --- 3b. FlexUnavailable -> 502 (same reasoning as IngestFailed) ------------


def test_flex_unavailable_returns_502_with_message(client):
    with patch("app.libs.ib_ingest.router.ingest_day") as mock_ingest:
        mock_ingest.side_effect = FlexUnavailable("Flex Web Service request failed: timeout")
        resp = client.post("/api/mobo/ib-ingest?day=2026-09-15")

    assert resp.status_code == 502, resp.text
    assert resp.json()["detail"] == "Flex Web Service request failed: timeout"


# --- 4. Malformed day -> 422 from FastAPI's own validation -------------------


def test_malformed_day_returns_422(client):
    with patch("app.libs.ib_ingest.router.ingest_day") as mock_ingest:
        resp = client.post("/api/mobo/ib-ingest?day=not-a-date")

    assert resp.status_code == 422, resp.text
    mock_ingest.assert_not_called()


# --- 5. Route registration ----------------------------------------------------


def test_route_registered_at_expected_path():
    # Included routers are lazy `_IncludedRouter` objects with no `.path` --
    # [r.path for r in app.routes] AttributeErrors on this app (project
    # memory). openapi()["paths"] is the resolved view test_be7_router.py's
    # own `test_all_three_routes_resolve_in_openapi` uses for the same reason.
    paths = app.openapi()["paths"]
    assert "/api/mobo/ib-ingest" in paths
    assert "post" in paths["/api/mobo/ib-ingest"]
