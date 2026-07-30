"""0029_eom_report_comments

Revision ID: 326496667c63
Revises: 5cd1cc1948cc
Create Date: 2026-07-30 00:00:00.000000

Adds eom_report_comments — one row per Monthly Reports page report_name,
holding PC's single free-text comment (upsert-only, no history) plus who
last wrote it. report_name is UNIQUE: at most one comment per report.

Re-chained from b34f8c1a9d27 (0027) to 5cd1cc1948cc (0028_admin_access_control,
proposal 019 / branch claude/admin-pages-backend-proposal-f0c9fc-db) — that
migration claimed 0028 first, so this one moves to 0029 to keep a single
linear head instead of forking two revisions off the same parent.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "326496667c63"
down_revision: Union[str, Sequence[str], None] = "5cd1cc1948cc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "eom_report_comments",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("report_name", sa.String(length=255), nullable=False),
        sa.Column("comment", sa.Text(), nullable=False),
        sa.Column("updated_by", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
        sa.UniqueConstraint("report_name", name="uq_eom_report_comments_report_name"),
    )


def downgrade() -> None:
    op.drop_table("eom_report_comments")
