"""0032_ib_account_relations_rework

Revision ID: b7e3c1d9a248
Revises: a3f7c1d9e824
Create Date: 2026-08-10 00:00:00.000000

IB account relations rework: a client now has one IB account PER MODEL
SUBSCRIPTION (not one account for the whole client), and each model has
its own master IB account.

Steps, in this exact order:
  1. `models.master_ib_account` -- new nullable column, the account the
     model itself trades through.
  2. `client_ib_accounts` -- new table, one row per (user_id, model_id),
     holding that client's IB account for that specific model. This is a
     dedicated table rather than a column on `client_subscriptions` so
     that a client's account for a model SURVIVES that client
     unsubscribing (their `client_subscriptions` row being deleted) --
     `client_ib_accounts` is FK'd only to `users`/`models`, not to the
     subscription row itself, and is only removed if the user or model is
     actually deleted.
  3. Backfill: `client_profiles.ib_account` (the old single per-client
     account) is copied into a `client_ib_accounts` row for every one of
     that client's EXISTING `client_subscriptions` rows. LOSSY /
     best-effort: there is no record of which model the old single
     account actually belonged to, so the same value is applied to all of
     a client's current subscriptions. Row count logged via
     `alembic.runtime.migration` for human review.
  4. `client_profiles.ib_account` (+ its index `ix_client_profiles_ib_account`)
     is dropped -- superseded by `client_ib_accounts`.
  5. `client_subscriptions_pre020_bak` is dropped. It was `a3f7c1d9e824`'s
     own rollback snapshot for that migration's lossy fee-scale
     conversion and is no longer needed. This is a deliberate, ONE-WAY
     cleanup: downgrade() does NOT recreate it, so downgrading past
     `a3f7c1d9e824` after this migration has run will no longer have that
     migration's original rollback data available (accepted risk).

Separately (service layer, not this migration): allotment/redemption
endpoints -- including a full/"big" redemption, which is effectively an
unsubscribe -- must write a row to the existing `client_events` table so
there is a human-readable record of the change. `client_events` needs no
schema change for this.

`downgrade()` reverses in the opposite order: best-effort restores
`client_profiles.ib_account` from `client_ib_accounts` (picking one value
per client -- LOSSY if a client had different accounts across models, only
one survives), then drops `client_ib_accounts` and `models.master_ib_account`.
It does NOT recreate `client_subscriptions_pre020_bak`.
"""

import logging
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b7e3c1d9a248"
down_revision: Union[str, Sequence[str], None] = "a3f7c1d9e824"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(f"0032 self-assertion failed: {message}")


def upgrade() -> None:
    conn = op.get_bind()

    # Step 1: models.master_ib_account
    op.add_column(
        "models", sa.Column("master_ib_account", sa.String(255), nullable=True)
    )

    # Step 2: client_ib_accounts -- one row per (user_id, model_id).
    op.create_table(
        "client_ib_accounts",
        sa.Column("user_id", sa.Uuid(native_uuid=False), nullable=False),
        sa.Column("model_id", sa.Uuid(native_uuid=False), nullable=False),
        sa.Column("ib_account", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["model_id"], ["models.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "model_id"),
    )
    op.create_index(
        "ix_client_ib_accounts_model_id", "client_ib_accounts", ["model_id"]
    )

    # Step 3: backfill from the old single per-client account onto every one
    # of that client's existing subscriptions. LOSSY / best-effort.
    backfilled = conn.execute(
        sa.text(
            "INSERT INTO client_ib_accounts (user_id, model_id, ib_account) "
            "SELECT cs.user_id, cs.model_id, cp.ib_account "
            "FROM client_subscriptions cs "
            "JOIN client_profiles cp ON cp.user_id = cs.user_id "
            "WHERE cp.ib_account IS NOT NULL"
        )
    ).rowcount
    logger.info("0032 step 3  client_ib_accounts backfilled: %s", backfilled)

    # Step 4: drop the now-redundant client_profiles.ib_account.
    op.drop_index("ix_client_profiles_ib_account", table_name="client_profiles")
    op.drop_column("client_profiles", "ib_account")
    _require(
        conn.execute(
            sa.text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'client_profiles' "
                "AND COLUMN_NAME = 'ib_account'"
            )
        ).scalar()
        == 0,
        "client_profiles.ib_account still exists after drop",
    )

    # Step 5: drop the obsolete DB-2/0031 rollback snapshot table.
    op.execute("DROP TABLE IF EXISTS client_subscriptions_pre020_bak")


def downgrade() -> None:
    # Reverse step 4: re-add client_profiles.ib_account + its index.
    op.add_column(
        "client_profiles", sa.Column("ib_account", sa.String(255), nullable=True)
    )
    op.create_index("ix_client_profiles_ib_account", "client_profiles", ["ib_account"])

    # Best-effort restore from client_ib_accounts.
    # LOSSY: if a client had different accounts across models, only one
    # (the lexicographically greatest, arbitrary) survives.
    op.execute(
        "UPDATE client_profiles cp "
        "JOIN ("
        "  SELECT user_id, MAX(ib_account) AS ib_account "
        "  FROM client_ib_accounts "
        "  WHERE ib_account IS NOT NULL "
        "  GROUP BY user_id"
        ") cia ON cia.user_id = cp.user_id "
        "SET cp.ib_account = cia.ib_account"
    )

    # Reverse steps 2 and 1.
    op.drop_index("ix_client_ib_accounts_model_id", table_name="client_ib_accounts")
    op.drop_table("client_ib_accounts")
    op.drop_column("models", "master_ib_account")

    # NOTE: client_subscriptions_pre020_bak (dropped in upgrade() step 5) is
    # intentionally NOT recreated here -- see module docstring.
