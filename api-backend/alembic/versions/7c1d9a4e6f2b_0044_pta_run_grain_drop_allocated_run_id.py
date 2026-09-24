"""0044_pta_run_grain_drop_allocated_run_id

Revision ID: 7c1d9a4e6f2b
Revises: 6bf5237f5329
Create Date: 2026-09-23 00:00:00.000000

`post_trade_allocation_runs` is the daily session ledger -- one row per
`trade_date` -- and `orders.allocated_run_id` is the per-order marker that
proposal 011 used to track which orders had already been folded into a run.
Both facts have never actually diverged (every `trade_date` has had exactly
one run, and the runs ledger alone can answer "is this date done"), so this
migration makes the schema say what has always been true and drops the
now-redundant marker. `post_trade_allocation_runs.settle_date` goes with it
(D8): it only ever fed the `settleDay`/`label` wire fields, and neither is
read by any frontend.

Three changes, applied in FK-safe order:

  a. `post_trade_allocation_runs.trade_date`: the non-unique
     `ix_post_trade_allocation_runs_trade_date` index is replaced by
     `UNIQUE(trade_date)` (`uq_pta_runs_trade_date`).

  b. `orders.allocated_run_id` is dropped. MySQL/MariaDB refuses to drop an
     index that still backs a foreign key (ER_DROP_INDEX_FK), so the FK
     constraint is dropped FIRST, then its index, then the column -- the
     same ordering `29a586aaf08b_0014_post_trade_allocation.py`'s
     `downgrade()` (:157-158) already established for this exact
     constraint/index pair. The FK name is MySQL's auto-generated
     `orders_ibfk_1` (see that same migration's `upgrade()`, which added it
     as `orders`' first FK).

  c. `post_trade_allocation_runs.settle_date` is dropped, reversing
     `fa0eb74e7dac_0018_pta_run_settle_date.py`.

Operator precondition (verified during planning; re-verify at apply time --
something may have changed):

    SELECT COUNT(*) FROM (SELECT trade_date FROM post_trade_allocation_runs
                          GROUP BY trade_date HAVING COUNT(*) > 1) d;
    -- must be 0 (was 0 of 21 rows / 21 distinct dates)

Irreversible in data terms: `downgrade()` restores `orders.allocated_run_id`
and `post_trade_allocation_runs.settle_date` as columns, but every restored
`allocated_run_id` value comes back NULL -- the allocated/unallocated
distinction this column used to carry cannot be recovered from the column
itself, only from the runs ledger (which is the point of dropping it).
`settle_date` similarly comes back NULL for every row; it was always a
derived display value, never a source of truth, so nothing is lost there.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7c1d9a4e6f2b"
down_revision: Union[str, Sequence[str], None] = "6bf5237f5329"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # a. trade_date becomes the unique run-session key.
    op.drop_index(
        "ix_post_trade_allocation_runs_trade_date", table_name="post_trade_allocation_runs"
    )
    op.create_unique_constraint(
        "uq_pta_runs_trade_date", "post_trade_allocation_runs", ["trade_date"]
    )

    # b. orders.allocated_run_id -- FK, then index, then column (ER_DROP_INDEX_FK).
    op.drop_constraint("orders_ibfk_1", "orders", type_="foreignkey")
    op.drop_index("ix_orders_allocated_run_id", table_name="orders")
    op.drop_column("orders", "allocated_run_id")

    # c. settle_date (D8) -- reverses fa0eb74e7dac_0018_pta_run_settle_date.
    op.drop_column("post_trade_allocation_runs", "settle_date")


def downgrade() -> None:
    """Downgrade schema."""
    # Reverse order of upgrade().
    op.add_column(
        "post_trade_allocation_runs",
        sa.Column("settle_date", sa.String(8), nullable=True),
    )

    op.add_column(
        "orders",
        sa.Column(
            "allocated_run_id",
            sa.Uuid(native_uuid=False),
            nullable=True,
        ),
    )
    op.create_index("ix_orders_allocated_run_id", "orders", ["allocated_run_id"])
    op.create_foreign_key(
        "orders_ibfk_1",
        "orders",
        "post_trade_allocation_runs",
        ["allocated_run_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.drop_constraint("uq_pta_runs_trade_date", "post_trade_allocation_runs", type_="unique")
    op.create_index(
        "ix_post_trade_allocation_runs_trade_date",
        "post_trade_allocation_runs",
        ["trade_date"],
    )
