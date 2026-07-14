"""0014 post trade allocation — allocation runs, per-cell records, client portfolios

Revision ID: 29a586aaf08b
Revises: 350ce48e2f4d
Create Date: 2026-07-14 00:00:00.000000

Additive migration for feature 011 (Post-Trade Allocation):
  - creates: post_trade_allocation_runs (run header)
  - creates: post_trade_allocations (per-cell records, FK -> runs/models/users)
  - creates: client_portfolios (three-column balance, FK -> users/runs)
  - adds: orders.allocated_run_id (idempotency marker, FK -> runs)

No data migration: orders.allocated_run_id defaults NULL for every existing row
(they become "unprocessed" and eligible for the first real run, which is
correct: no order has ever been allocated). No CheckConstraint on money
columns (D-3).
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "29a586aaf08b"
down_revision = "350ce48e2f4d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # DB-1  post_trade_allocation_runs
    # ------------------------------------------------------------------
    op.create_table(
        "post_trade_allocation_runs",
        sa.Column("id", sa.Uuid(native_uuid=False), primary_key=True),
        sa.Column("trade_date", sa.String(8), nullable=False),
        sa.Column(
            "period_id",
            sa.Uuid(native_uuid=False),
            sa.ForeignKey("allocation_periods.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(16), nullable=False, server_default="completed"),
        sa.Column("trigger", sa.String(16), nullable=False),
        sa.Column("grand_total", sa.Numeric(28, 10), nullable=True),
        sa.Column("run_by", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_post_trade_allocation_runs_trade_date",
        "post_trade_allocation_runs",
        ["trade_date"],
    )

    # ------------------------------------------------------------------
    # DB-2  post_trade_allocations (per-cell records)
    # ------------------------------------------------------------------
    op.create_table(
        "post_trade_allocations",
        sa.Column(
            "run_id",
            sa.Uuid(native_uuid=False),
            sa.ForeignKey("post_trade_allocation_runs.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "model_id",
            sa.Uuid(native_uuid=False),
            sa.ForeignKey("models.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            sa.Uuid(native_uuid=False),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("model_traded", sa.Numeric(28, 10), nullable=False),
        sa.Column("units", sa.Numeric(28, 10), nullable=False),
        sa.Column("units_total", sa.Numeric(28, 10), nullable=False),
        sa.Column("allocated", sa.Numeric(28, 10), nullable=False),
        sa.Column("pct", sa.Numeric(6, 3), nullable=False),
        sa.Column("ib_account", sa.String(255), nullable=True),
        sa.Column("model_name", sa.String(255), nullable=False),
        sa.Column("model_acct", sa.String(255), nullable=True),
    )
    op.create_index(
        "ix_post_trade_allocations_run_model",
        "post_trade_allocations",
        ["run_id", "model_id"],
    )

    # ------------------------------------------------------------------
    # DB-3  client_portfolios (three-column balance)
    # ------------------------------------------------------------------
    op.create_table(
        "client_portfolios",
        sa.Column(
            "user_id",
            sa.Uuid(native_uuid=False),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "cash_deposit", sa.Numeric(28, 10), nullable=False, server_default="0"
        ),
        sa.Column(
            "amount_in_trade", sa.Numeric(28, 10), nullable=False, server_default="0"
        ),
        sa.Column(
            "previous_amount_in_trade",
            sa.Numeric(28, 10),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "last_run_id",
            sa.Uuid(native_uuid=False),
            sa.ForeignKey("post_trade_allocation_runs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # ------------------------------------------------------------------
    # DB-4  orders.allocated_run_id
    # ------------------------------------------------------------------
    op.add_column(
        "orders",
        sa.Column(
            "allocated_run_id",
            sa.Uuid(native_uuid=False),
            sa.ForeignKey("post_trade_allocation_runs.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_orders_allocated_run_id", "orders", ["allocated_run_id"])


def downgrade() -> None:
    # Drop the orders FK constraint before its index — MySQL/MariaDB refuses
    # to drop an index that still backs a foreign key (ER_DROP_INDEX_FK), and
    # here (unlike model_symbol_audit's downgrade in 0013) we are not also
    # dropping the whole table, so the index needs its own explicit drop.
    # `orders` had no prior FK, so this is MySQL's first auto-generated name
    # for it (deterministic given this migration chain).
    op.drop_constraint("orders_ibfk_1", "orders", type_="foreignkey")
    op.drop_index("ix_orders_allocated_run_id", table_name="orders")
    op.drop_column("orders", "allocated_run_id")

    # Table drops implicitly remove their own indexes (see 0013's downgrade
    # for the same pattern) — reverse of upgrade()'s FK-safe creation order.
    op.drop_table("client_portfolios")
    op.drop_table("post_trade_allocations")
    op.drop_table("post_trade_allocation_runs")
