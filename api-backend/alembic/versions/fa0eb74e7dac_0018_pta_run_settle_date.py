"""0018 pta run settle date

Revision ID: fa0eb74e7dac
Revises: 817926e7604a
Create Date: 2026-07-20 00:00:00.000000

Adds post_trade_allocation_runs.settle_date (nullable String(8), IB YYYYMMDD
token) — the real settlement date for the run's (tradeDate, model) group,
computed at write time as max(orders.settleDate) over the group. Purely a
display field: no query/grouping/filter path anywhere in post_trade_allocation
uses it (trade_date remains the sole anchor key). NULL for existing rows and
for any future run whose orders never carried a settleDate from IB.
"""
from alembic import op
import sqlalchemy as sa

revision = "fa0eb74e7dac"
down_revision = "817926e7604a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "post_trade_allocation_runs",
        sa.Column("settle_date", sa.String(8), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("post_trade_allocation_runs", "settle_date")
