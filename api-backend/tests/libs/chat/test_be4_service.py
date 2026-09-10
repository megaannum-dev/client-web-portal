# 021 BE-4 — chat service (live membership gate, send, history, attachments)
from __future__ import annotations

import io
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.libs.chat.service import ChatService
from app.models.access import AccessLevel, PageAccess
from app.models.users import AdminRole, ClientProfile
from tests.libs.client_portal.conftest import set_assigned_rm
from tests.libs.onboarding.conftest import make_admin, make_client

# ponytail: no conftest.py here on purpose -- one engine fixture in the only
# file that needs it beats a shared file several units all edit.


@pytest.fixture
def session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    with engine.connect() as conn:
        conn.exec_driver_sql("PRAGMA foreign_keys=ON")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    db = Session()
    # Without page_access rows actions_for() fails closed with an empty set, so
    # every ADMIN caller would 403. One row is all this feature reads.
    db.add(PageAccess(page_id="rm.client-info", role=AdminRole.RM, level=AccessLevel.EDIT))
    db.commit()
    try:
        yield db
    finally:
        db.close()


class FakeStorage:
    """Records every save()/open() argument; writes nothing."""

    def __init__(self) -> None:
        self.saved: list[dict] = []
        self.opened: list[str] = []

    def save(self, stream, *, suggested_name, content_type=None, subdir=None) -> str:
        key = f"{subdir}/{len(self.saved)}_{suggested_name}" if subdir else suggested_name
        self.saved.append(
            {"key": key, "suggested_name": suggested_name, "ct": content_type, "subdir": subdir}
        )
        return key

    def open(self, storage_key: str):
        self.opened.append(storage_key)
        return io.BytesIO(b"x")


@pytest.fixture
def storage(monkeypatch):
    fake = FakeStorage()
    monkeypatch.setattr("app.libs.chat.service.get_storage", lambda bucket: fake)
    monkeypatch.setattr(
        "app.libs.chat.service.client_folder", lambda name, uid, *, bucket: f"{name}_{uid[-8:]}"
    )
    return fake


class _BigFile:
    """UploadFile stand-in whose seek/tell report `size` without allocating it."""

    def __init__(self, size: int, name: str = "big.bin") -> None:
        self.filename = name
        self.content_type = "application/octet-stream"
        self.file = self
        self._size = size

    def seek(self, offset, whence=0) -> None:
        return None

    def tell(self) -> int:
        return self._size

    def read(self, *a) -> bytes:
        return b""


def _file(data: bytes = b"hello", name: str = "a.txt", ct: str = "text/plain"):
    class _F:
        filename = name
        content_type = ct
        file = io.BytesIO(data)

    return _F()


def _world(session):
    rm = make_admin(session, AdminRole.RM, name="Rita RM")
    arm = make_admin(session, AdminRole.RM, name="Andy ARM")
    client = make_client(session, assigned_rm_uid=rm.firebase_uid)
    row = session.query(ClientProfile).filter_by(user_id=client.id).one()
    row.asst_rm_uid = arm.firebase_uid
    session.commit()
    return ChatService(session), rm, arm, client


# ---------- 1. RM and ARM can both send and read ----------
@pytest.mark.parametrize("who", ["rm", "arm"])
def test_rm_and_arm_can_send_and_read(session, storage, who):
    svc, rm, arm, client = _world(session)
    staff = rm if who == "rm" else arm
    dto, _ = svc.send(staff, client.id, body="hi there", files=[])
    assert dto.body == "hi there"
    assert dto.sender_is_staff is True
    assert dto.sender_uid == staff.firebase_uid
    rows = svc.history(staff, client.id, since=None, limit=50)
    assert [r.id for r in rows] == [dto.id]


# ---------- 2. THE live-membership invariant ----------
def test_reassignment_moves_the_whole_thread(session, storage):
    svc, rm_a, arm, client = _world(session)
    for i in range(3):
        svc.send(rm_a, client.id, body=f"m{i}", files=[])
    assert len(svc.history(rm_a, client.id, since=None, limit=50)) == 3

    rm_b = make_admin(session, AdminRole.RM, name="Bob RM")
    set_assigned_rm(session, client, rm_b)

    with pytest.raises(HTTPException) as e:
        svc.history(rm_a, client.id, since=None, limit=50)
    assert e.value.status_code == 404
    with pytest.raises(HTTPException) as e:
        svc.send(rm_a, client.id, body="still here?", files=[])
    assert e.value.status_code == 404

    # New RM reads ALL prior history immediately. Set, not list: created_at is
    # second-resolution and the (created_at, id) tie-break is a random uuid, so
    # same-second ordering is not deterministic (models/chat.py's own caveat).
    assert {r.body for r in svc.history(rm_b, client.id, since=None, limit=50)} == {
        "m0",
        "m1",
        "m2",
    }


# ---------- 3. Unrelated RM -> 404, not 403 ----------
def test_unrelated_rm_gets_scoped_404(session, storage):
    svc, rm, arm, client = _world(session)
    other = make_admin(session, AdminRole.RM, name="Nosy RM")
    with pytest.raises(HTTPException) as e:
        svc.history(other, client.id, since=None, limit=50)
    assert e.value.status_code == 404


# ---------- 4. ADMIN-portal caller lacking CLIENT_VIEW -> 403 ----------
def test_member_without_client_view_gets_403(session, storage):
    svc, rm, arm, client = _world(session)
    session.query(PageAccess).delete()  # role holds no page grants at all now
    session.commit()
    with pytest.raises(HTTPException) as e:
        svc.history(rm, client.id, since=None, limit=50)
    assert e.value.status_code == 403


# ---------- 5. resolve_client_id ----------
def test_client_id_resolution(session, storage):
    svc, rm, arm, client = _world(session)
    svc.send(rm, client.id, body="hello", files=[])

    assert len(svc.history(client, None, since=None, limit=50)) == 1  # own thread

    other_client = make_client(session, assigned_rm_uid=rm.firebase_uid, name="Other")
    with pytest.raises(HTTPException) as e:
        svc.history(client, other_client.id, since=None, limit=50)
    assert e.value.status_code == 404

    with pytest.raises(HTTPException) as e:
        svc.history(rm, None, since=None, limit=50)
    assert e.value.status_code == 422


# ---------- 6. Empty message -> 422 ----------
@pytest.mark.parametrize("body", [None, "", "   "])
def test_empty_message_rejected(session, storage, body):
    svc, rm, arm, client = _world(session)
    with pytest.raises(HTTPException) as e:
        svc.send(rm, client.id, body=body, files=[])
    assert e.value.status_code == 422
    assert storage.saved == []


# ---------- 7 & 8. The total upload cap ----------
def test_single_oversize_file_rejected(session, storage):
    svc, rm, arm, client = _world(session)
    with pytest.raises(HTTPException) as e:
        svc.send(rm, client.id, body=None, files=[_BigFile(26 * 1024 * 1024)])
    assert e.value.status_code == 413
    assert storage.saved == []


def test_three_files_under_cap_individually_exceed_it_together(session, storage):
    svc, rm, arm, client = _world(session)
    files = [_BigFile(10 * 1024 * 1024, f"f{i}.bin") for i in range(3)]
    with pytest.raises(HTTPException) as e:
        svc.send(rm, client.id, body=None, files=files)
    assert e.value.status_code == 413
    # Validation precedes any write: zero saves, so no orphan on disk.
    assert storage.saved == []


# ---------- 9. attachment_stream ----------
def test_attachment_stream_uses_the_key_from_the_db_row(session, storage):
    svc, rm, arm, client = _world(session)
    pdf = _file(b"pdf", "spec.pdf", "application/pdf")
    dto, _ = svc.send(rm, client.id, body=None, files=[pdf])
    att = dto.attachments[0]
    assert storage.saved[0]["subdir"].endswith(client.firebase_uid[-8:])

    stream, filename, content_type = svc.attachment_stream(rm, att.id)
    assert filename == "spec.pdf"
    assert content_type == "application/pdf"
    assert storage.opened == [storage.saved[0]["key"]]  # the DB row's key, nothing else

    # Non-member -> 404, and no open() attempted.
    other = make_admin(session, AdminRole.RM, name="Nosy RM")
    with pytest.raises(HTTPException) as e:
        svc.attachment_stream(other, att.id)
    assert e.value.status_code == 404
    assert storage.opened == [storage.saved[0]["key"]]

    with pytest.raises(HTTPException) as e:
        svc.attachment_stream(rm, uuid.uuid4())
    assert e.value.status_code == 404
    assert "../../etc/passwd" not in storage.opened  # no caller string ever reaches open()


def test_null_content_type_defaults_to_octet_stream(session, storage):
    svc, rm, arm, client = _world(session)
    f = _file(b"x", "note.bin", ct=None)
    dto, _ = svc.send(rm, client.id, body=None, files=[f])
    _, _, ct = svc.attachment_stream(rm, dto.attachments[0].id)
    assert ct == "application/octet-stream"


# ---------- 10. fan-out includes the sender ----------
def test_to_uids_covers_client_rm_arm_including_sender(session, storage):
    svc, rm, arm, client = _world(session)
    _, to_uids = svc.send(rm, client.id, body="ping", files=[])
    assert set(to_uids) == {client.firebase_uid, rm.firebase_uid, arm.firebase_uid}
