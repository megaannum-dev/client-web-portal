"""0020_eod_records

Revision ID: 02f0f4296350
Revises: b1c2d3e4f5a6
Create Date: 2026-07-21 00:00:00.000000

Additive migration for feature 015 (EoD Exception Report):
  - creates: eod_records (header row, one per settlement day)
  - creates: eod_break_records (frozen break snapshot, FK -> eod_records)

No existing table/column is touched. Table creation order is FK-dependency
order: eod_records -> eod_break_records; downgrade is the exact reverse.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "02f0f4296350"
down_revision: Union[str, Sequence[str], None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "eod_records",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("trade_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="OPEN"),
        sa.Column("signed_off_by", sa.String(255), nullable=True),
        sa.Column("signed_off_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("order_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("execution_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notional_total", sa.Numeric(20, 4), nullable=False, server_default="0"),
        sa.Column("break_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("outcome", sa.String(16), nullable=True),
        sa.Column("file_storage_key", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("trade_date", name="uq_eod_records_trade_date"),
    )
    op.create_table(
        "eod_break_records",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "eod_record_id",
            sa.Uuid(),
            sa.ForeignKey("eod_records.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("leg", sa.String(16), nullable=False),
        sa.Column("subject_ref", sa.String(255), nullable=False),
        sa.Column("break_type", sa.String(64), nullable=False),
        sa.Column("field", sa.String(32), nullable=True),
        sa.Column("expected", sa.Numeric(28, 10), nullable=True),
        sa.Column("actual", sa.Numeric(28, 10), nullable=True),
        sa.Column("delta", sa.Numeric(28, 10), nullable=True),
        sa.Column("order_id", sa.Uuid(), nullable=True),
        sa.Column("client_id", sa.Integer(), nullable=True),
        sa.Column("model_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_eod_break_records_eod_record_leg", "eod_break_records", ["eod_record_id", "leg"]
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("eod_break_records")
    op.drop_table("eod_records")
