"""0046_sop

Revision ID: 5d3b7e2a9c41
Revises: 48df13b1e1d4
Create Date: 2026-10-06 00:00:00.000000

Adds sop_documents (one row per SOP: title + category) and sop_versions
(one row per uploaded file version; FK ON DELETE CASCADE, UNIQUE
(sop_id, version_no), storage_key UNIQUE) for the compliance.sop page.
Seeds page_access for compliance.sop: ADMIN 'edit'; RM/MOBO/PM/PC/COMPLIANCE
'view'.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5d3b7e2a9c41"
down_revision: Union[str, Sequence[str], None] = "48df13b1e1d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "sop_documents",
        sa.Column("id", sa.Uuid(native_uuid=False), primary_key=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("category", sa.String(length=16), nullable=False),
        sa.Column("created_by_uid", sa.String(length=128), nullable=False),
        sa.Column("created_by_name", sa.String(length=255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_sop_documents_category", "sop_documents", ["category"])

    op.create_table(
        "sop_versions",
        sa.Column("id", sa.Uuid(native_uuid=False), primary_key=True),
        sa.Column(
            "sop_id",
            sa.Uuid(native_uuid=False),
            sa.ForeignKey("sop_documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("change_note", sa.String(length=500), nullable=True),
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
        sa.UniqueConstraint("storage_key", name="uq_sop_versions_storage_key"),
        sa.UniqueConstraint(
            "sop_id", "version_no", name="uq_sop_versions_sop_id_version_no"
        ),
    )
    op.create_index("ix_sop_versions_sop_id", "sop_versions", ["sop_id"])

    # --- page_access seed — compliance.sop ---------------------------------------
    op.execute(
        """
        INSERT INTO page_access (page_id, role, level) VALUES
          ('compliance.sop', 'ADMIN',      'edit'),
          ('compliance.sop', 'RM',         'view'),
          ('compliance.sop', 'MOBO',       'view'),
          ('compliance.sop', 'PM',         'view'),
          ('compliance.sop', 'PC',         'view'),
          ('compliance.sop', 'COMPLIANCE', 'view')
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DELETE FROM page_access WHERE page_id = 'compliance.sop'")
    op.drop_index("ix_sop_versions_sop_id", table_name="sop_versions")
    op.drop_table("sop_versions")
    op.drop_index("ix_sop_documents_category", table_name="sop_documents")
    op.drop_table("sop_documents")
