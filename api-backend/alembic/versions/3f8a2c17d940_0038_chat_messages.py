"""0038_chat_messages

Revision ID: 3f8a2c17d940
Revises: d5b1e93c7a42
Create Date: 2026-09-02 00:00:00.000000

Creates chat_messages + chat_attachments -- the DB layer for the RM/ARM <->
Client chatroom (proposal 021, DB-1). Deliberately NEW tables, not a reuse of
client_events: per that table's own charter (0030's docstring, and DB-4 /
e183474e6b91 lineage) client_events is system-generated ONLY, has a free
category/title/body shape with no manual-entry precedent, and carries no read
state -- none of which a two-party conversation can live inside.

INTENTIONAL DEVIATION from proposal 018, B-1 (app/models/onboarding.py:409-416):
that unit mandates DENORMALISING client_profiles.assigned_rm_uid onto
client_tickets at raise time, so reassigning an RM never migrates a historical
ticket between inboxes. Chat inverts it: there is NO RM column on the message
row at all, and membership is resolved live from client_profiles on every
request. A ticket is a WORK ITEM owned by whoever was on the hook when it was
raised -- moving it would rewrite accountability. A chat thread is a
RELATIONSHIP CHANNEL, and the requirement is that reassignment transfers the
whole conversation: the new RM sees full history, the old RM loses access
instantly. Snapshotting would produce the exact opposite on both counts.

Columns (chat_messages):
  - id: UUID PK, application-generated (uuid4), same convention as every other
    table in this schema.
  - client_id: FK -> users.id, NOT NULL. The THREAD KEY -- the client the
    thread belongs to, never the sender.
  - sender_id: FK -> users.id, NOT NULL. Client, RM or ARM. No role snapshot;
    see the deviation note above. Both id columns are users.id: persisted rows
    use users.id, the Firebase/transport boundary uses firebase_uid.
  - body: TEXT, nullable -- NULL iff the message carries at least one
    attachment. Enforced by the service as a 422, NOT a CHECK constraint (no
    CHECK exists anywhere in this schema).
  - created_at: server-side insert timestamp. There is deliberately no
    updated_at: the row is immutable and append-only (created_at-only, same as
    client_events / client_contact_logs).
  - ix_chat_messages_client_id_created_at (client_id, created_at): the ONLY
    index. It serves the sole read pattern (one thread, oldest-first) and its
    leftmost prefix already backs the client_id FK on MariaDB, so no separate
    single-column client_id index is created. sender_id is never queried alone.

Columns (chat_attachments):
  - id: UUID PK, also the download route's addressing key.
  - message_id: FK -> chat_messages.id ON DELETE CASCADE, NOT NULL, indexed.
  - storage_key/filename/content_type/size_bytes: same column shapes as
    OnboardingDocument.storage_key/filename/content_type/size_bytes.
    storage_key is bucket-relative and opaque (never on the wire);
    content_type is client-supplied and untrusted.
  - created_at: server-side insert timestamp; also the attachment ordering key.
  A child table (rather than the inline client_contact_logs.doc_* pattern at
  onboarding.py:374-377) because one message may carry several files.

This is purely additive (two new tables, no existing schema touched, no
backfill). downgrade() drops exactly what upgrade() created, in reverse order.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "3f8a2c17d940"
down_revision: Union[str, Sequence[str], None] = "d5b1e93c7a42"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("client_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("sender_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index(
        "ix_chat_messages_client_id_created_at", "chat_messages", ["client_id", "created_at"]
    )

    op.create_table(
        "chat_attachments",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "message_id",
            sa.Uuid(),
            sa.ForeignKey("chat_messages.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("storage_key", sa.String(length=512), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=128), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_chat_attachments_message_id", "chat_attachments", ["message_id"])


def downgrade() -> None:
    # drop_table removes the table's indexes and FK constraints together in one
    # DDL statement -- no separate drop_index needed (and MySQL would reject
    # dropping ix_chat_attachments_message_id first anyway, since it backs the
    # message_id FK constraint; same convention as c72e91a4f6b3's
    # client_contact_logs reversal).
    #
    # Child before parent: chat_attachments holds the FK into chat_messages.
    op.drop_table("chat_attachments")
    op.drop_table("chat_messages")
