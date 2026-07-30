"""0028_client_contact_logs

Revision ID: c72e91a4f6b3
Revises: b34f8c1a9d27
Create Date: 2026-07-30 00:00:00.000000

Creates client_contact_logs -- the DB layer for the new RM "Contact Log"
feature (manual-entry record of client touchpoints: calls, meetings,
emails). Deliberately a NEW table, not a reuse of client_events (DB-4,
e183474e6b91 lineage): client_events is system-generated only with a
free category/title/body shape and no manual-entry precedent, and this
feature has its own compliance-visibility concern that would mix poorly
with that table.

Columns:
  - user_id: FK -> users.id (the client this log entry is about), NOT
    NULL, indexed for the list-by-client query pattern (mirrors
    ClientEvent.user_id's index convention).
  - logged_by_uid: the acting RM's firebase_uid, a plain string (NOT a
    FK) since the RM who logs an entry may differ from the client's
    assigned RM -- same convention as OnboardingDocument.uploaded_by.
  - topic/channel/occurred_at/description: required fields describing
    the touchpoint. channel is a free string (e.g. "Phone call", "Video
    call"), not a DB enum, matching ClientEvent.category's convention.
  - interest/complaint/follow_up: optional free-text notes.
  - doc_storage_key/doc_filename/doc_content_type/doc_size_bytes: optional
    single file attachment, same column shapes as
    OnboardingDocument.storage_key/filename/content_type/size_bytes.
  - created_at: server-side insert timestamp (distinct from occurred_at,
    which is the client-entered touchpoint date/time).

This is purely additive (one new table, no existing schema touched).
downgrade() drops exactly what upgrade() created, in reverse order.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c72e91a4f6b3"
down_revision: Union[str, Sequence[str], None] = "b34f8c1a9d27"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "client_contact_logs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("logged_by_uid", sa.String(length=128), nullable=False),
        sa.Column("topic", sa.String(length=255), nullable=False),
        sa.Column("channel", sa.String(length=64), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("interest", sa.Text(), nullable=True),
        sa.Column("complaint", sa.Text(), nullable=True),
        sa.Column("follow_up", sa.Text(), nullable=True),
        sa.Column("doc_storage_key", sa.String(length=512), nullable=True),
        sa.Column("doc_filename", sa.String(length=255), nullable=True),
        sa.Column("doc_content_type", sa.String(length=128), nullable=True),
        sa.Column("doc_size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_client_contact_logs_user_id", "client_contact_logs", ["user_id"]
    )


def downgrade() -> None:
    # drop_table removes the table's indexes and FK constraints together in
    # one DDL statement -- no separate drop_index needed (and MySQL would
    # reject dropping ix_client_contact_logs_user_id first anyway, since it
    # backs the user_id FK constraint; same convention as a9317a31b484's
    # client_tickets reversal).
    op.drop_table("client_contact_logs")
