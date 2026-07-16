"""0016_recon_order_fields_and_run_delta_ledger

Revision ID: d06ece9f47be
Revises: 788404b616bc
Create Date: 2026-07-16 10:46:42.533653

Additive migration (layer A of the reconciliation bugfix pass):
  - adds: algotrade_orders.ib_order_id, algotrade_orders.contract_multiplier
    (copies of Order.orderID / Order.multiplier, dropped on the floor by the
    current synth.py materializer — fixed in a later layer)
  - creates: client_portfolio_run_deltas (per-run delta ledger, FK ->
    post_trade_allocation_runs and users) — lets recon ask "what delta did
    run X apply to client Y" after previous_amount_in_trade has been
    clobbered by a later run

No existing column is altered or dropped.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d06ece9f47be"
down_revision: Union[str, Sequence[str], None] = "788404b616bc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "algotrade_orders",
        sa.Column("ib_order_id", sa.String(255), nullable=True),
    )
    op.add_column(
        "algotrade_orders",
        sa.Column(
            "contract_multiplier",
            sa.Numeric(18, 6),
            nullable=False,
            server_default="1",
        ),
    )
    op.create_table(
        "client_portfolio_run_deltas",
        sa.Column(
            "run_id",
            sa.Uuid(native_uuid=False),
            sa.ForeignKey("post_trade_allocation_runs.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            sa.Uuid(native_uuid=False),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("delta", sa.Numeric(28, 10), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("client_portfolio_run_deltas")
    op.drop_column("algotrade_orders", "contract_multiplier")
    op.drop_column("algotrade_orders", "ib_order_id")
