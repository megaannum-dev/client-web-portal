"""0011 models schema fix — drop manager/intro/symbols, add category/
subscription_redemption, and reorder created_at/updated_at to trail on
models, client_profiles, and model_materials.

Revision ID: a1b2c3d4e5f6
Revises: 9b76c05d3e2f
Create Date: 2026-07-03 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f6"
down_revision = "9b76c05d3e2f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -----------------------------------------------------------------------
    # models: drop stale cols, add new cols
    # -----------------------------------------------------------------------
    op.drop_column("models", "symbols")
    op.drop_column("models", "manager")
    op.drop_column("models", "intro")

    op.add_column("models", sa.Column("category", sa.String(64), nullable=True))
    op.add_column(
        "models",
        sa.Column("subscription_redemption", sa.String(64), nullable=True),
    )

    # -----------------------------------------------------------------------
    # Reorder created_at/updated_at to be the last two columns on `models`.
    # Alembic's alter_column cannot reorder in MariaDB; use raw MODIFY AFTER.
    # Target tail order:
    #   ... description, underlyings, risk, liquidity, reporting, nav_perf,
    #       mgmt_fee, incentive_fee, created_at, updated_at
    # -----------------------------------------------------------------------
    op.execute(
        "ALTER TABLE models "
        "MODIFY COLUMN created_at DATETIME NOT NULL "
        "DEFAULT CURRENT_TIMESTAMP AFTER incentive_fee"
    )
    op.execute(
        "ALTER TABLE models "
        "MODIFY COLUMN updated_at DATETIME NOT NULL "
        "DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at"
    )

    # -----------------------------------------------------------------------
    # client_profiles: move ib_account to sit AFTER initiate_method
    # (before the timestamps).
    # -----------------------------------------------------------------------
    op.execute(
        "ALTER TABLE client_profiles "
        "MODIFY COLUMN ib_account VARCHAR(255) NULL AFTER initiate_method"
    )

    # -----------------------------------------------------------------------
    # model_materials: move version_no to sit AFTER version
    # (before created_at).
    # -----------------------------------------------------------------------
    op.execute(
        "ALTER TABLE model_materials "
        "MODIFY COLUMN version_no INT NOT NULL DEFAULT 0 AFTER version"
    )


def downgrade() -> None:
    # ponytail: forward-only reorder — column ordering is not restored
    op.drop_column("models", "subscription_redemption")
    op.drop_column("models", "category")

    op.add_column("models", sa.Column("intro", sa.String(255), nullable=True))
    op.add_column("models", sa.Column("manager", sa.String(255), nullable=True))
    op.add_column("models", sa.Column("symbols", sa.JSON(), nullable=True))
