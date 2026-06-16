"""Pytest harness for the api-backend (B0).

Provides:
* a SQLite in-memory engine whose schema is built via ``Base.metadata.create_all``
  (the test substrate never runs MariaDB-only migration DDL — migrations are
  covered separately);
* a ``db_session`` fixture (a real SQLAlchemy Session bound to that engine);
* a ``client`` TestClient whose ``get_db`` and ``get_settings`` dependencies are
  overridden so requests share the same in-memory DB and never touch Firebase /
  MariaDB;
* a ``settings`` fixture (``firebase_auth_disabled=true``) and the override hook
  so any test can swap settings via ``app.dependency_overrides``;
* the ``FakeFirebaseIdentityService`` fake and the row factories, re-exported as
  fixtures for ergonomic reuse by later branches.

A shared StaticPool single connection is used so the Session fixture and the
TestClient see the *same* in-memory database.
"""

from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import Settings, get_settings
from app.core.database import Base, get_db
from app.main import app

# Importing the models module registers all tables on Base.metadata so
# create_all builds the full schema.
import app.models.users as _models_users  # noqa: F401

from tests.fakes import FakeFirebaseIdentityService
from tests import factories as _factories


# --------------------------------------------------------------------------- #
# Settings                                                                     #
# --------------------------------------------------------------------------- #
@pytest.fixture
def settings() -> Settings:
    """Test settings: Firebase disabled, throwaway SQLite URL.

    The actual DB connection is provided by the engine fixture via dependency
    override; ``database_url`` here just keeps Settings self-consistent and
    ensures nothing ever points at a real MariaDB instance.
    """
    return Settings(
        firebase_auth_disabled=True,
        database_url="sqlite://",
        dev_mode=True,
    )


# --------------------------------------------------------------------------- #
# Engine / Session                                                            #
# --------------------------------------------------------------------------- #
@pytest.fixture
def engine():
    """A fresh SQLite in-memory engine per test, schema built via create_all.

    StaticPool + a single shared connection make the same in-memory DB visible
    to both the Session fixture and the TestClient.
    """
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=eng)
    try:
        yield eng
    finally:
        Base.metadata.drop_all(bind=eng)
        eng.dispose()


@pytest.fixture
def session_factory(engine):
    return sessionmaker(bind=engine, autocommit=False, autoflush=False, class_=Session)


@pytest.fixture
def db_session(session_factory) -> Generator[Session, None, None]:
    """A SQLAlchemy Session bound to the per-test in-memory engine."""
    db = session_factory()
    try:
        yield db
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# TestClient with dependency overrides                                         #
# --------------------------------------------------------------------------- #
@pytest.fixture
def client(
    session_factory, settings: Settings
) -> Generator[TestClient, None, None]:
    """TestClient sharing the in-memory DB and running Firebase-disabled.

    Overrides ``get_db`` (so requests use the test engine) and ``get_settings``
    (so ``firebase_auth_disabled=true``). Tests that need different settings can
    further mutate ``app.dependency_overrides[get_settings]`` themselves.
    """

    def _override_get_db() -> Generator[Session, None, None]:
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    def _override_get_settings() -> Settings:
        return settings

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_settings] = _override_get_settings
    # NOTE: TestClient is intentionally NOT used as a context manager here.
    # The app's lifespan runs ``Base.metadata.create_all(bind=engine)`` against
    # the *production* MariaDB engine; entering the lifespan would try to connect
    # to a real DB. Skipping the context manager skips lifespan — schema for the
    # in-memory test DB is already built by the ``engine`` fixture's create_all.
    test_client = TestClient(app)
    try:
        yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_settings, None)


# --------------------------------------------------------------------------- #
# Fakes & factories re-exported as fixtures                                    #
# --------------------------------------------------------------------------- #
@pytest.fixture
def fake_firebase() -> FakeFirebaseIdentityService:
    return FakeFirebaseIdentityService()


@pytest.fixture
def factories():
    """Expose the row-factory module so tests do ``factories.make_client(db, ...)``."""
    return _factories
