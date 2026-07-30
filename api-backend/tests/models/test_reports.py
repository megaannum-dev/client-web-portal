# Model/service test for eom_report_comments (docs/proposals eom-report-commenting).
# Mirrors tests/models/test_post_trade_allocation.py's session fixture pattern.
#
# Run: cd api-backend && .venv/Scripts/python.exe -m pytest -q tests/models/test_reports.py

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.libs.reports.service import EomReportCommentsService
from app.models.reports import EomReportComment  # noqa: F401 — registers table with Base.metadata


@pytest.fixture
def session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    db = Session()
    try:
        yield db
    finally:
        db.close()


def test_list_comments_empty_then_populated(session):
    svc = EomReportCommentsService(session)
    assert svc.list_comments() == []

    svc.upsert_comment("EoM Summary", "Looks good", actor="uid-pc-1")

    comments = svc.list_comments()
    assert len(comments) == 1
    assert comments[0].report_name == "EoM Summary"
    assert comments[0].comment == "Looks good"


def test_upsert_comment_creates_then_updates_same_row_in_place(session):
    svc = EomReportCommentsService(session)

    first = svc.upsert_comment("EoM Summary", "Draft comment", actor="uid-pc-1")
    assert first.updated_by == "uid-pc-1"

    second = svc.upsert_comment("EoM Summary", "Revised comment", actor="uid-pc-2")
    assert second.comment == "Revised comment"
    assert second.updated_by == "uid-pc-2"
    assert second.updated_at > first.updated_at

    # at-most-one-comment-per-report invariant: still exactly one row.
    rows = session.query(EomReportComment).filter_by(report_name="EoM Summary").all()
    assert len(rows) == 1
    assert rows[0].comment == "Revised comment"


if __name__ == "__main__":
    import sys

    sys.exit(pytest.main([__file__, "-q"]))
