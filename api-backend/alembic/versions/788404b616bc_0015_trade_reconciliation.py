"""0015_trade_reconciliation

Revision ID: 788404b616bc
Revises: 29a586aaf08b
Create Date: 2026-07-15 17:45:20.316106

Additive migration for feature 012 (Trade Reconciliation integration):
  - creates: recon_sessions (session grouping, FK -> post_trade_allocation_runs
    and composite FK -> allocation_model_snapshots)
  - creates: algotrade_orders (FK -> recon_sessions, models)
  - creates: algotrade_executions (FK -> algotrade_orders)

No existing table/column is touched. Table creation order is FK-dependency
order: recon_sessions -> algotrade_orders -> algotrade_executions; downgrade
is the exact reverse.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "788404b616bc"
down_revision: Union[str, Sequence[str], None] = "29a586aaf08b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "recon_sessions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("trade_date", sa.Date(), nullable=False),
        sa.Column(
            "ib_run_id",
            sa.Uuid(),
            sa.ForeignKey("post_trade_allocation_runs.id"),
            nullable=False,
        ),
        sa.Column("allocation_period_id", sa.Uuid(), nullable=False),
        sa.Column("allocation_user_id", sa.Uuid(), nullable=False),
        sa.Column("allocation_model_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint(
            "trade_date", "ib_run_id", name="uq_recon_sessions_trade_date_ib_run_id"
        ),
        sa.ForeignKeyConstraint(
            ["allocation_period_id", "allocation_user_id", "allocation_model_id"],
            [
                "allocation_model_snapshots.period_id",
                "allocation_model_snapshots.user_id",
                "allocation_model_snapshots.model_id",
            ],
            name="fk_recon_sessions_allocation_model_snapshot",
        ),
    )
    op.create_table(
        "algotrade_orders",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "session_id",
            sa.Uuid(),
            sa.ForeignKey("recon_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("model_id", sa.Uuid(), sa.ForeignKey("models.id"), nullable=False),
        sa.Column("symbol", sa.String(255), nullable=False),
        sa.Column("buy_sell", sa.String(16), nullable=False),
        sa.Column("qty_ordered", sa.Numeric(20, 4), nullable=False),
        sa.Column("price", sa.Numeric(20, 4), nullable=False),
        sa.Column("notional", sa.Numeric(20, 4), nullable=False),
        sa.Column("trade_date", sa.Date(), nullable=False),
        sa.Column("currency", sa.CHAR(3), nullable=False, server_default="USD"),
        sa.Column("asset_class", sa.String(32), nullable=False, server_default="OPT"),
        sa.Column("source_kind", sa.String(16), nullable=False),
        sa.Column(
            "derived_from_ib_run_id",
            sa.Uuid(),
            sa.ForeignKey("post_trade_allocation_runs.id"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_algotrade_orders_session_model_symbol",
        "algotrade_orders",
        ["session_id", "model_id", "symbol"],
    )
    op.create_table(
        "algotrade_executions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "order_id",
            sa.Uuid(),
            sa.ForeignKey("algotrade_orders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("qty_filled", sa.Numeric(20, 4), nullable=False),
        sa.Column("fill_price", sa.Numeric(20, 4), nullable=False),
        sa.Column("fill_notional", sa.Numeric(20, 4), nullable=False),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_algotrade_executions_order", "algotrade_executions", ["order_id"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("algotrade_executions")
    op.drop_table("algotrade_orders")
    op.drop_table("recon_sessions")
