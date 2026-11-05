"""D11 — allocation period label uniqueness enforced in business logic.

create_period must 409 on a duplicate label even when the existing period is
confirmed (so the single-open check alone would pass), and the scheduler must
skip quietly when a restart makes it retry a month that already has a period.
"""

from __future__ import annotations

import asyncio
import logging

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.libs.allocation_matrix import scheduler
from app.libs.allocation_matrix.service import AllocationService
from app.models.pc import AllocationPeriod, PeriodStatus


@pytest.fixture
def session_factory():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)


def _confirm(db, label: str) -> None:
    db.query(AllocationPeriod).filter(AllocationPeriod.label == label).update(
        {"status": PeriodStatus.CONFIRMED}
    )
    db.commit()


def test_duplicate_label_409_after_confirm(session_factory):
    db = session_factory()
    svc = AllocationService(db)
    svc.create_period("2026-11")
    _confirm(db, "2026-11")  # no open period left, so only the label check can stop it

    with pytest.raises(HTTPException) as ei:
        svc.create_period("2026-11")
    assert ei.value.status_code == 409
    assert "already exists" in ei.value.detail


def test_integrity_error_race_maps_to_409(session_factory, monkeypatch):
    db = session_factory()
    svc = AllocationService(db)
    svc.create_period("2026-11")
    _confirm(db, "2026-11")
    # Simulate losing the race: the pre-check sees nothing, the DB constraint fires.
    monkeypatch.setattr(svc.alloc_repo, "find_by_label", lambda _label: None)

    with pytest.raises(HTTPException) as ei:
        svc.create_period("2026-11")
    assert ei.value.status_code == 409
    assert db.query(AllocationPeriod).count() == 1  # rolled back, session still usable


def test_scheduler_skips_existing_label(session_factory, monkeypatch, caplog):
    db = session_factory()
    AllocationService(db).create_period("2026-11")
    _confirm(db, "2026-11")
    monkeypatch.setattr("app.core.database.SessionLocal", session_factory)

    with caplog.at_level(logging.INFO, logger=scheduler.logger.name):
        asyncio.run(scheduler._try_open_period("2026-11"))  # must not raise

    assert "skipping" in caplog.text
    assert not [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert db.query(AllocationPeriod).count() == 1
