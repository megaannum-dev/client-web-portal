"""0024 onboarding document upload tracking

Revision ID: a4d8e2f6b391
Revises: 9c4a1e7d2b3f
Create Date: 2026-07-23 00:00:00.000000

Adds 2 additive, nullable columns to onboarding_documents so the RM/
compliance UI can show who uploaded each document and when. Purely
additive: no drops, no type narrowing, no data migration, no backfill
(existing rows just render blank for these fields).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a4d8e2f6b391"
down_revision: Union[str, Sequence[str], None] = "9c4a1e7d2b3f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "onboarding_documents",
        sa.Column("uploaded_by", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "onboarding_documents",
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("onboarding_documents", "uploaded_at")
    op.drop_column("onboarding_documents", "uploaded_by")
