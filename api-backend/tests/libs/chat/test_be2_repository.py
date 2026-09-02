# 021 BE-2 — chat repository (live RM/ARM membership predicate)
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.libs.chat.repository import ChatRepository
from app.models.chat import ChatMessage
from app.models.users import AdminRole, ClientProfile
from tests.libs.onboarding.conftest import make_admin, make_client

# ponytail: no conftest.py here on purpose -- one engine fixture in the only
# file that needs it beats a shared file two concurrent units both edit.


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
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def repo(session):
    return ChatRepository(session)


def _msg(session, *, client_id, sender_id, created_at, body="hi", attachments=1):
    repo = ChatRepository(session)
    msg = repo.create(client_id=client_id, sender_id=sender_id, body=body)
    msg.created_at = created_at
    for i in range(attachments):
        repo.add_attachment(
            message_id=msg.id,
            storage_key=f"chat/{msg.id}/{i}",
            filename=f"f{i}.pdf",
            content_type="application/pdf",
            size_bytes=10,
        )
    session.commit()
    return msg


class CountStatements:
    """before_cursor_execute counter -- catches an N+1 that a value assertion
    would happily pass."""

    def __init__(self, session):
        self.conn = session.get_bind()
        self.n = 0

    def _on(self, *args, **kwargs):
        self.n += 1

    def __enter__(self):
        event.listen(self.conn, "before_cursor_execute", self._on)
        return self

    def __exit__(self, *exc):
        event.remove(self.conn, "before_cursor_execute", self._on)


# --- 1. the predicate -------------------------------------------------------
def test_is_rm_or_arm_true_for_rm_and_arm_false_for_stranger(session, repo):
    rm = make_admin(session, AdminRole.RM, name="Rita RM")
    arm = make_admin(session, AdminRole.RM, name="Arnie ARM")
    other = make_admin(session, AdminRole.RM, name="Otto Other")
    client = make_client(session, assigned_rm_uid=rm.firebase_uid)
    profile = session.get(ClientProfile, client.id)
    profile.asst_rm_uid = arm.firebase_uid
    session.commit()

    assert repo.is_rm_or_arm(client.id, rm.firebase_uid) is True
    assert repo.is_rm_or_arm(client.id, arm.firebase_uid) is True
    assert repo.is_rm_or_arm(client.id, other.firebase_uid) is False
    # a real uid, but the wrong client
    assert repo.is_rm_or_arm(uuid.uuid4(), rm.firebase_uid) is False


# --- 2. THE live-membership invariant ---------------------------------------
def test_membership_is_live_reassignment_flips_access_with_no_invalidation(session, repo):
    old_rm = make_admin(session, AdminRole.RM, name="Old RM")
    new_rm = make_admin(session, AdminRole.RM, name="New RM")
    client = make_client(session, assigned_rm_uid=old_rm.firebase_uid)

    assert repo.is_rm_or_arm(client.id, old_rm.firebase_uid) is True
    assert repo.is_rm_or_arm(client.id, new_rm.firebase_uid) is False

    session.get(ClientProfile, client.id).assigned_rm_uid = new_rm.firebase_uid
    session.commit()

    # Same repo instance, same session, no cache invalidation of any kind.
    assert repo.is_rm_or_arm(client.id, old_rm.firebase_uid) is False
    assert repo.is_rm_or_arm(client.id, new_rm.firebase_uid) is True


# --- 3. history identity ----------------------------------------------------
def test_history_returns_firebase_uid_and_coalesced_name_per_sender(session, repo):
    rm = make_admin(session, AdminRole.RM, name="Rita RM")
    client = make_client(session, assigned_rm_uid=rm.firebase_uid, name="Cathy Client")
    now = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    _msg(session, client_id=client.id, sender_id=rm.id, created_at=now, body="from staff")
    _msg(
        session,
        client_id=client.id,
        sender_id=client.id,
        created_at=now + timedelta(seconds=1),
        body="from client",
    )

    rows = repo.history(client.id, since=None, limit=50)
    assert [m.body for m, _, _, _ in rows] == ["from staff", "from client"]

    _, staff_uid, staff_name, staff_is_staff = rows[0]
    # sender_id stores users.id; the wire value is the firebase_uid
    assert staff_uid == rm.firebase_uid
    assert staff_uid != str(rm.id)
    assert (staff_name, staff_is_staff) == ("Rita RM", True)

    _, client_uid, client_name, client_is_staff = rows[1]
    assert client_uid == client.firebase_uid
    assert (client_name, client_is_staff) == ("Cathy Client", False)


# --- 4. one statement + selectinload, not an N+1 ----------------------------
def test_history_is_two_statements_regardless_of_page_size(session, repo):
    rm = make_admin(session, AdminRole.RM)
    client = make_client(session, assigned_rm_uid=rm.firebase_uid)
    # Bound to locals: `client`/`rm` get expired by expire_all() below, and
    # touching them inside the counter would add a refresh SELECT of its own.
    cid, sid = client.id, rm.id
    now = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    for i in range(2):
        _msg(session, client_id=cid, sender_id=sid, created_at=now + timedelta(seconds=i))

    session.expire_all()
    with CountStatements(session) as c:
        rows = repo.history(cid, since=None, limit=50)
        assert [len(m.attachments) for m, *_ in rows] == [1, 1]
    assert c.n == 2, "expected main SELECT + selectinload attachment SELECT"

    for i in range(2, 6):
        _msg(session, client_id=cid, sender_id=sid, created_at=now + timedelta(seconds=i),
             attachments=2)
    session.expire_all()
    with CountStatements(session) as c:
        rows = repo.history(cid, since=None, limit=50)
        assert sum(len(m.attachments) for m, *_ in rows) == 10
    assert c.n == 2, "statement count grew with row count -> N+1"


# --- 5. ordering + inclusive cursor -----------------------------------------
def test_history_ordering_is_id_tie_broken_and_since_is_inclusive(session, repo):
    rm = make_admin(session, AdminRole.RM)
    client = make_client(session, assigned_rm_uid=rm.firebase_uid)
    now = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    # two messages sharing one created_at second
    a = _msg(session, client_id=client.id, sender_id=rm.id, created_at=now, body="a")
    b = _msg(session, client_id=client.id, sender_id=rm.id, created_at=now, body="b")
    later = _msg(
        session,
        client_id=client.id,
        sender_id=rm.id,
        created_at=now + timedelta(seconds=5),
        body="later",
    )

    ids = [m.id for m, *_ in repo.history(client.id, since=None, limit=50)]
    assert ids == sorted([a.id, b.id]) + [later.id]
    assert ids == [m.id for m, *_ in repo.history(client.id, since=None, limit=50)]  # stable

    # INCLUSIVE: a message whose created_at == since is returned, not dropped.
    same_second = repo.history(client.id, since=now, limit=50)
    assert {m.id for m, *_ in same_second} == {a.id, b.id, later.id}
    assert {m.id for m, *_ in repo.history(client.id, since=later.created_at, limit=50)} == {
        later.id
    }
    assert [m.id for m, *_ in repo.history(client.id, since=None, limit=1)] == [ids[0]]


# --- 6. attachment carries the owning thread --------------------------------
def test_attachment_returns_owning_message_client_id(session, repo):
    rm = make_admin(session, AdminRole.RM)
    client = make_client(session, assigned_rm_uid=rm.firebase_uid)
    now = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    msg = _msg(session, client_id=client.id, sender_id=rm.id, created_at=now)
    att_id = msg.attachments[0].id

    found = repo.attachment(att_id)
    assert found is not None
    att, thread_client_id = found
    assert att.id == att_id
    assert thread_client_id == client.id
    assert repo.attachment(uuid.uuid4()) is None


def test_create_and_add_attachment_do_not_commit(session, repo):
    rm = make_admin(session, AdminRole.RM)
    client = make_client(session, assigned_rm_uid=rm.firebase_uid)
    msg = repo.create(client_id=client.id, sender_id=rm.id, body="draft")
    assert msg.id is not None  # flushed
    repo.add_attachment(
        message_id=msg.id,
        storage_key="k",
        filename="f.pdf",
        content_type=None,
        size_bytes=None,
    )
    session.rollback()
    assert session.query(ChatMessage).count() == 0
