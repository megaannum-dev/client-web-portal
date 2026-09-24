"""0045_ic_notes

Revision ID: 48df13b1e1d4
Revises: 7c1d9a4e6f2b
Create Date: 2026-09-24 00:00:00.000000

Adds ic_notes — uploaded Investment Committee meeting note files
(compliance.ic-notes page). storage_key is UNIQUE (one row per stored
object). Seeds page_access for compliance.ic-notes: MOBO/PM/PC/COMPLIANCE/
ADMIN all get 'edit'; RM gets no row at all, i.e. no access (NONE is the
absence of a row, per 0028's convention).

down_revision 7c1d9a4e6f2b (0044) is not present in this checkout -- it
lives on another branch. Do not try to fix the chain here.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "48df13b1e1d4"
down_revision: Union[str, Sequence[str], None] = "7c1d9a4e6f2b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "ic_notes",
        sa.Column("id", sa.Uuid(native_uuid=False), primary_key=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("meeting_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("storage_key", sa.String(length=512), nullable=False),
        sa.Column("uploaded_by_uid", sa.String(length=128), nullable=False),
        sa.Column("uploaded_by_name", sa.String(length=255), nullable=False),
        sa.Column("uploaded_by_role", sa.String(length=32), nullable=False),
        sa.Column("uploaded_by_email", sa.String(length=255), nullable=True),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("storage_key", name="uq_ic_notes_storage_key"),
    )
    op.create_index("ix_ic_notes_meeting_at", "ic_notes", ["meeting_at"])

    # --- page_access seed — compliance.ic-notes ------------------------------
    # RM has no row = no access (D-3's convention: NONE is the absence of a row).
    op.execute(
        """
        INSERT INTO page_access (page_id, role, level) VALUES
          ('compliance.ic-notes', 'MOBO',       'edit'),
          ('compliance.ic-notes', 'PM',         'edit'),
          ('compliance.ic-notes', 'PC',         'edit'),
          ('compliance.ic-notes', 'COMPLIANCE', 'edit'),
          ('compliance.ic-notes', 'ADMIN',      'edit')
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DELETE FROM page_access WHERE page_id = 'compliance.ic-notes'")
    op.drop_index("ix_ic_notes_meeting_at", table_name="ic_notes")
    op.drop_table("ic_notes")
