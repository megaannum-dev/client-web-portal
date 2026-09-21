"""0040_drop_algotrade_and_eod_tables

Revision ID: 30388f902d64
Revises: e2a9c47b1f60
Create Date: 2026-09-21 00:00:00.000000

Drops five write-only tables: algotrade_executions, algotrade_orders,
recon_sessions (feature 012, revision 788404b616bc/0015, extended by
d06ece9f47be/0016), and eod_records, eod_break_records (feature 015,
revision 02f0f4296350/0020).

Nothing in app/ ever reads algotrade_orders / algotrade_executions --
the only consumer was `synthesize_from_run()`
(app/libs/reconciliation/algotrade/synth.py, deleted alongside this
revision), which materialized rows into them from inside
PostTradeAllocationService.run() and had no reader on the other end. The
two EoD tables lost their readers in proposal 020 C-5, leaving
`EodRepository.ensure_open()` (app/libs/eod/repository.py, also deleted)
as a write with no downstream consumer either. The write path itself --
the BE-8/BE-6 block in PostTradeAllocationService.run() -- was removed in
the commit preceding this one.

Proposal 020 (docs/proposals/020-2026-08-03-schema-format-cleanup-refactor.md)
decision D-12 considered dropping recon_sessions at that time (see
a3f7c1d9e824/0031's docstring: "B-3 (drop recon_sessions) is withdrawn per
D-12 and contributes no DDL to this revision") and deferred it to a future
reconciliation/EoD rework. This revision is that rework's first step --
it drops all five tables the same withdrawn write path touched, once
recon_sessions was no longer defensible on its own.

Table drop order is FK-dependency order: algotrade_executions (FK ->
algotrade_orders) -> algotrade_orders (FK -> recon_sessions) ->
recon_sessions, then eod_break_records (FK -> eod_records) -> eod_records.
`client_portfolio_run_deltas` (added alongside algotrade_orders in 0016)
is NOT dropped here -- it has its own reader (recon delta lookups) and is
out of scope.

downgrade() recreates all five tables verbatim from their origin
revisions (788404b616bc/0015 + d06ece9f47be/0016 for the algotrade/recon
three, 02f0f4296350/0020 for the two EoD tables), in the reverse order,
so a rollback restores the exact pre-drop schema. It cannot restore data
-- this is a schema-only reversal, same as every other drop in this repo.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "30388f902d64"
down_revision: Union[str, Sequence[str], None] = "e2a9c47b1f60"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_table("algotrade_executions")
    op.drop_table("algotrade_orders")
    op.drop_table("recon_sessions")
    op.drop_table("eod_break_records")
    op.drop_table("eod_records")


def downgrade() -> None:
    """Downgrade schema."""
    # --- eod_records / eod_break_records (from 02f0f4296350/0020) ----------
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

    # --- recon_sessions / algotrade_orders / algotrade_executions ----------
    # (from 788404b616bc/0015, extra algotrade_orders columns from
    # d06ece9f47be/0016)
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
        # 0016 additions:
        sa.Column("ib_order_id", sa.String(255), nullable=True),
        sa.Column(
            "contract_multiplier",
            sa.Numeric(18, 6),
            nullable=False,
            server_default="1",
        ),
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
