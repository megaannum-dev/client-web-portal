"""0010 drop uq_symbol_summaries_symbol_date — IB SYMBOL_SUMMARY has multiple rows
per (symbol, tradeDate); constraint was too strict and caused IntegrityError on import.

Revision ID: 9b76c05d3e2f
Revises: f0e1d2c3b4a5
Create Date: 2026-06-30 00:00:00.000000
"""
from alembic import op

revision = "9b76c05d3e2f"
down_revision = "f0e1d2c3b4a5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("uq_symbol_summaries_symbol_date", table_name="symbol_summaries")


def downgrade() -> None:
    op.create_index(
        "uq_symbol_summaries_symbol_date",
        "symbol_summaries",
        ["symbol", "tradeDate"],
        unique=True,
    )
