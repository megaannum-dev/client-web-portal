"""0025 transaction details

Revision ID: fa66b2f3aee6
Revises: a4d8e2f6b391
Create Date: 2026-07-24 00:00:00.000000

Creates transaction_details, a 1:1 audit-record child table of
client_allotment_redemptions (proposal 017, Layer 1 finding B-1). Purely
additive: one new table, no existing table/column touched. The UNIQUE
constraint on allotment_id is the DB-level guarantee that settlement
details are filed at most once per allotment/redemption row (audit
immutability -- see the model's own docstring).

down_revision is a4d8e2f6b391 (0024_onboarding_document_upload_tracking),
the current sole Alembic head at authoring time (verified via
`alembic heads`).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "fa66b2f3aee6"
down_revision: Union[str, Sequence[str], None] = "a4d8e2f6b391"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "transaction_details",
        sa.Column("id", sa.CHAR(length=36), nullable=False),
        sa.Column("allotment_id", sa.CHAR(length=36), nullable=False),
        sa.Column("bank_account", sa.String(length=64), nullable=False),
        sa.Column("settlement_amount", sa.Numeric(precision=28, scale=10), nullable=False),
        sa.Column("transaction_date", sa.Date(), nullable=False),
        sa.Column("transaction_time", sa.Time(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("reference_no", sa.String(length=64), nullable=True),
        sa.Column("filed_by", sa.String(length=128), nullable=False),
        sa.Column(
            "filed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["allotment_id"], ["client_allotment_redemptions.id"]),
        sa.UniqueConstraint("allotment_id"),
    )


def downgrade() -> None:
    op.drop_table("transaction_details")
