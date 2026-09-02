# 021 DB-1 — chat_messages + chat_attachments
import sys
import uuid

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import selectinload, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.models.chat import ChatAttachment, ChatMessage
from app.models.users import Portal, User

# ponytail: no conftest.py here on purpose -- one 10-line engine fixture in the
# only file that needs it beats a shared file two concurrent units both edit.


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
def users(session):
    """Two minimal committed User rows (a client and an RM) to satisfy the FKs."""
    client = User(id=uuid.uuid4(), firebase_uid="uid-client", portal=Portal.CLIENT)
    rm = User(id=uuid.uuid4(), firebase_uid="uid-rm", portal=Portal.ADMIN)
    session.add_all([client, rm])
    session.commit()
    return client, rm


def test_body_only_message_inserts(session, users):
    client, rm = users
    msg = ChatMessage(client_id=client.id, sender_id=rm.id, body="hello")
    session.add(msg)
    session.commit()

    row = session.get(ChatMessage, msg.id)
    assert row.body == "hello"
    assert row.attachments == []
    assert row.created_at is not None


def test_file_only_message_reads_back_both_attachments_in_order(session, users):
    client, rm = users
    msg = ChatMessage(
        client_id=client.id,
        sender_id=client.id,
        body=None,
        # Added b-then-a, with a carrying the LOWER id: both rows land in the
        # same created_at second (second-resolution timestamps), so the
        # deterministic order comes from the relationship's `id` tie-break,
        # not from insertion luck.
        attachments=[
            ChatAttachment(
                id=uuid.UUID(int=2),
                storage_key="chat/b.png",
                filename="b.png",
                content_type="image/png",
                size_bytes=22,
            ),
            ChatAttachment(
                id=uuid.UUID(int=1), storage_key="chat/a.pdf", filename="a.pdf", size_bytes=11
            ),
        ],
    )
    session.add(msg)
    session.commit()
    session.expire_all()

    row = session.scalars(
        select(ChatMessage)
        .options(selectinload(ChatMessage.attachments))
        .where(ChatMessage.id == msg.id)
    ).one()
    assert row.body is None
    # order_by on the relationship => deterministic, not insertion-luck.
    assert [a.filename for a in row.attachments] == ["a.pdf", "b.png"]
    assert row.attachments[0].content_type is None  # a.pdf, client sent no type


def test_composite_index_is_declared():
    names = {tuple(c.name for c in ix.columns) for ix in ChatMessage.__table__.indexes}
    assert ("client_id", "created_at") in names
    # exactly one index: no redundant single-column client_id / sender_id index
    assert len(ChatMessage.__table__.indexes) == 1


def test_deleting_message_cascades_attachments(session, users):
    client, rm = users
    msg = ChatMessage(
        client_id=client.id,
        sender_id=rm.id,
        body=None,
        attachments=[ChatAttachment(storage_key="chat/x.pdf", filename="x.pdf")],
    )
    session.add(msg)
    session.commit()
    assert session.scalars(select(ChatAttachment)).all()

    session.delete(msg)
    session.commit()
    assert session.scalars(select(ChatAttachment)).all() == []


def test_model_module_is_registered_by_app_main():
    """Fails if the `import app.models.chat` line in app/main.py is missing --
    otherwise silent until production (metadata-dependent code sees no table)."""
    import app.main

    # `"app.models.chat" in sys.modules` alone would pass off THIS file's own
    # import, so assert the binding app/main.py's import statement creates.
    assert hasattr(app.main, "_models_chat"), "app/main.py is missing `import app.models.chat`"
    assert "app.models.chat" in sys.modules
    assert "chat_messages" in Base.metadata.tables
    assert "chat_attachments" in Base.metadata.tables
