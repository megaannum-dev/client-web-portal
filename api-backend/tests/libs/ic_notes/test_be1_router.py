"""Router-level test for IC notes (compliance.ic-notes page): GET/POST/download
gated by Action.IC_NOTES_VIEW / IC_NOTES_WRITE. PC is seeded EDIT, RM has no row.

Run: .venv/Scripts/python.exe -m pytest -q tests/libs/ic_notes
"""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Annotated

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session as OrmSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core import storage as storage_module
from app.core.config import Settings
from app.core.database import Base, get_db
from app.core.storage import get_storage
from app.libs.auth.deps import get_current_admin_user
from app.libs.ic_notes import service as ic_notes_service_module
from app.main import app
from app.models.access import AccessLevel, AdminAuditEvent, PageAccess
from app.models.users import AdminProfile, AdminRole, Portal, User


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    get_storage.cache_clear()
    monkeypatch.setattr(
        storage_module, "get_settings", lambda: Settings(storage_root=str(tmp_path))
    )

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
        id=uuid.uuid4(), firebase_uid="uid-test-rm", email="rm@example.com", portal=Portal.ADMIN
    )

    seed_db = Session()
    seed_db.add(stub_user)
    seed_db.add(
        AdminProfile(user_id=stub_user.id, role=AdminRole.RM, name="Test RM")
    )
    seed_db.add(
        PageAccess(page_id="compliance.ic-notes", role=AdminRole.PC, level=AccessLevel.EDIT)
    )
    seed_db.commit()
    seed_db.close()

    def _override_get_current_admin_user(
        db: Annotated[OrmSession, Depends(get_db)],
    ) -> User:
        # Re-queried per request, not a cached object -- a mid-test role switch
        # (RM -> PC below) must be observed. Same fix as reports/test_router.py.
        return db.query(User).filter(User.id == stub_user.id).one()

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_admin_user] = _override_get_current_admin_user
    try:
        yield TestClient(app), Session
    finally:
        app.dependency_overrides.clear()
        get_storage.cache_clear()


def _make_pc(Session) -> None:
    db = Session()
    db.query(AdminProfile).update({"role": AdminRole.PC})
    db.commit()
    db.close()


def test_rm_gets_403_on_list_upload_download(client):
    http, _Session = client

    assert http.get("/api/ic-notes").status_code == 403
    upload = http.post(
        "/api/ic-notes",
        files={"file": ("note.md", b"# hi", "text/markdown")},
        data={"title": "Q1 Minutes", "meeting_at": "2026-01-05T10:00:00"},
    )
    assert upload.status_code == 403
    assert http.get(f"/api/ic-notes/{uuid.uuid4()}/download").status_code == 403


def test_pc_upload_list_download_round_trip_and_audit(client):
    http, Session = client
    _make_pc(Session)

    upload = http.post(
        "/api/ic-notes",
        files={"file": ("note.md", b"# hello world", "text/markdown")},
        data={"title": "Q1 Minutes", "meeting_at": "2026-01-05T10:00:00"},
    )
    assert upload.status_code == 201, upload.text
    body = upload.json()
    assert body["uploaded_by_name"] == "Test RM"  # profile row is still named "Test RM"
    assert body["uploaded_by_role"] == "PC"
    assert body["uploaded_by_email"] == "rm@example.com"
    assert body["content_type"] == "text/markdown"
    assert "storage_key" not in body
    note_id = body["id"]

    listing = http.get("/api/ic-notes")
    assert listing.status_code == 200
    assert len(listing.json()) == 1

    download = http.get(f"/api/ic-notes/{note_id}/download")
    assert download.status_code == 200
    assert download.content == b"# hello world"
    assert download.headers["content-disposition"] == "attachment; filename*=UTF-8''note.md"

    db = Session()
    events = db.query(AdminAuditEvent).all()
    assert len(events) == 1
    assert events[0].event == "ic_notes.uploaded"
    db.close()


def test_unsupported_extension_is_415(client):
    http, Session = client
    _make_pc(Session)

    resp = http.post(
        "/api/ic-notes",
        files={"file": ("virus.exe", b"whatever", "application/octet-stream")},
        data={"title": "Bad file", "meeting_at": "2026-01-05T10:00:00"},
    )
    assert resp.status_code == 415


def test_oversize_upload_is_413(client, monkeypatch: pytest.MonkeyPatch):
    http, Session = client
    _make_pc(Session)
    monkeypatch.setattr(ic_notes_service_module, "IC_NOTES_MAX_UPLOAD_BYTES", 4)

    resp = http.post(
        "/api/ic-notes",
        files={"file": ("note.md", b"way too big", "text/markdown")},
        data={"title": "Too big", "meeting_at": "2026-01-05T10:00:00"},
    )
    assert resp.status_code == 413


def test_blank_title_is_422(client):
    http, Session = client
    _make_pc(Session)

    resp = http.post(
        "/api/ic-notes",
        files={"file": ("note.md", b"content", "text/markdown")},
        data={"title": "   ", "meeting_at": "2026-01-05T10:00:00"},
    )
    assert resp.status_code == 422


def test_empty_file_is_422(client):
    http, Session = client
    _make_pc(Session)

    resp = http.post(
        "/api/ic-notes",
        files={"file": ("note.md", b"", "text/markdown")},
        data={"title": "Empty", "meeting_at": "2026-01-05T10:00:00"},
    )
    assert resp.status_code == 422


def test_unknown_id_is_404(client):
    http, Session = client
    _make_pc(Session)

    resp = http.get(f"/api/ic-notes/{uuid.uuid4()}/download")
    assert resp.status_code == 404


if __name__ == "__main__":
    import sys

    sys.exit(pytest.main([__file__, "-q"]))
