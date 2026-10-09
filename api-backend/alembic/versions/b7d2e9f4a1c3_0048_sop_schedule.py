"""0048_sop_schedule

Revision ID: b7d2e9f4a1c3
Revises: 9e4a6c1b8d27
Create Date: 2026-10-09 00:00:00.000000

Adds sop_documents.starts_at / ends_at (nullable String(16)). Value kind is
decided by category (daily HH:MM, weekly weekday, monthly 1..31 or -1..-31
counted from month-end, resolved per month at read time) and validated
at the API layer; the DB only enforces "ends_at needs starts_at".
starts+ends = interval, starts only = stamp, both NULL = ad_hoc.
Existing rows are left NULL (no backfill).
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7d2e9f4a1c3"
down_revision: Union[str, Sequence[str], None] = "9e4a6c1b8d27"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("sop_documents", sa.Column("starts_at", sa.String(length=16), nullable=True))
    op.add_column("sop_documents", sa.Column("ends_at", sa.String(length=16), nullable=True))
    op.create_check_constraint(
        "ck_sop_documents_ends_requires_starts",
        "sop_documents",
        "ends_at IS NULL OR starts_at IS NOT NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("ck_sop_documents_ends_requires_starts", "sop_documents", type_="check")
    op.drop_column("sop_documents", "ends_at")
    op.drop_column("sop_documents", "starts_at")
