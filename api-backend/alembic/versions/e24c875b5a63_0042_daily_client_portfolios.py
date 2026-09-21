"""0042_daily_client_portfolios

Revision ID: e24c875b5a63
Revises: 7c1e4a92f6d3
Create Date: 2026-09-21 00:00:00.000000

Additive migration: creates daily_client_portfolios, the running-total
sibling to client_portfolio_run_deltas (0016 / d06ece9f47be).

client_portfolio_run_deltas records the *delta* a post-trade-allocation run
applied to a client. This table instead records the running portfolio
AMOUNT AFTER each run, plus a denormalised trade_date -- being additive, it
is itself the change history, which is what a client-portal chart needs.

Nothing is dropped. client_portfolio_run_deltas keeps its table and rows and
merely stops being written by a later unit; it is still read by the
client-portal history endpoint. daily_client_portfolios is private to the
post-trade-allocation module: the allocation run is the only writer, and the
only reader is that module's own repository computing the next running
total. No route, no schema, no other libs/ package, neither frontend, and
explicitly NOT onboarding or allotment/redemption.

Backfill: for each user with client_portfolio_run_deltas rows, baseline =
client_portfolios.amount_in_trade (0 if the row is missing, per that model's
documented invariant) minus the SUM of ALL of that user's deltas. Walking
the user's rows ordered by (trade_date, created_at) and adding each delta to
a running total starting at baseline reproduces the exact running total at
every historical run, and the newest row lands on amount_in_trade exactly --
that continuity is what makes the cutover safe.
"""

from collections import defaultdict
from decimal import Decimal
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e24c875b5a63"
down_revision: Union[str, Sequence[str], None] = "7c1e4a92f6d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "daily_client_portfolios",
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
        sa.Column("portfolio_amount", sa.Numeric(28, 10), nullable=False),
        sa.Column("trade_date", sa.String(8), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_daily_client_portfolios_user_date",
        "daily_client_portfolios",
        ["user_id", "trade_date"],
    )

    # --- backfill ---------------------------------------------------------
    # ponytail: plain Python loop over rows already ordered by the DB
    # (user_id, trade_date, created_at) rather than a window-function SQL
    # query -- target is MariaDB and this runs once, over a ledger table,
    # not a hot path.
    conn = op.get_bind()

    delta_rows = conn.execute(
        sa.text(
            "SELECT d.run_id AS run_id, d.user_id AS user_id, d.delta AS delta, "
            "d.created_at AS created_at, r.trade_date AS trade_date "
            "FROM client_portfolio_run_deltas d "
            "JOIN post_trade_allocation_runs r ON r.id = d.run_id "
            "ORDER BY d.user_id, r.trade_date, d.created_at"
        )
    ).fetchall()

    if not delta_rows:
        return

    amounts = dict(
        conn.execute(
            sa.text("SELECT user_id, amount_in_trade FROM client_portfolios")
        ).fetchall()
    )

    # Pass 1: total delta per user, to derive each user's pre-ledger baseline.
    totals: dict = defaultdict(lambda: Decimal("0"))
    for row in delta_rows:
        totals[row.user_id] += Decimal(row.delta)

    # Pass 2: walk each user's rows in (trade_date, created_at) order,
    # accumulating from that baseline so the last row == amount_in_trade.
    running: dict = {}
    insert_rows = []
    for row in delta_rows:
        uid = row.user_id
        if uid not in running:
            baseline = Decimal(amounts.get(uid, Decimal("0"))) - totals[uid]
            running[uid] = baseline
        running[uid] += Decimal(row.delta)
        insert_rows.append(
            {
                "run_id": row.run_id,
                "user_id": uid,
                "portfolio_amount": running[uid],
                "trade_date": row.trade_date,
                "created_at": row.created_at,
            }
        )

    # ponytail: historical allotment/redemption shifts fold into each user's
    # baseline rather than landing at their real dates, so chart points
    # before the last such shift are approximate. Exact attribution would
    # mean weaving client_allotment_redemptions.decided_at into the series;
    # those flows never belonged in this ledger, so that is an accepted gap.
    daily_client_portfolios = sa.table(
        "daily_client_portfolios",
        sa.column("run_id"),
        sa.column("user_id"),
        sa.column("portfolio_amount"),
        sa.column("trade_date"),
        sa.column("created_at"),
    )
    conn.execute(daily_client_portfolios.insert(), insert_rows)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_daily_client_portfolios_user_date", table_name="daily_client_portfolios")
    op.drop_table("daily_client_portfolios")
