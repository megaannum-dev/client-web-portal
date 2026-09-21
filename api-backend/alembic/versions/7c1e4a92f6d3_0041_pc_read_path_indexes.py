"""0041_pc_read_path_indexes

Revision ID: 7c1e4a92f6d3
Revises: 30388f902d64
Create Date: 2026-09-21 00:00:00.000000

Adds the secondary indexes 0039 (e2a9c47b1f60) deliberately declined to add
when it brought pc_orders/pc_trades onto a local/dev DB -- that revision's
docstring says explicitly: "If a read path later needs an index, that is its
own revision, applied to BOTH sides." This is that revision.

The read path is `app/libs/reconciliation/sources/pc.py` (`PcSource.rows`/
`PcSource.days`), hit on every `GET /api/mobo/executions`. It now filters
pc_orders by `last_event_utc` range and pc_trades by
`(source_run_id, lean_order_id)` IN a tuple list, and days() additionally
scans pc_trades.trade_date_et -- none of the three had an index to use.

MUST be applied to production AND every dev DB. Unlike 0039, whose downgrade
is a deliberate no-op because it might be dropping tables holding live
extraction data it never created, this revision's downgrade is real: it only
drops indexes this revision creates, so reversing it is safe everywhere.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "7c1e4a92f6d3"
down_revision: Union[str, Sequence[str], None] = "30388f902d64"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_pc_orders_last_event_utc", "pc_orders", ["last_event_utc"])
    op.create_index(
        "ix_pc_trades_source_run_id_lean_order_id",
        "pc_trades",
        ["source_run_id", "lean_order_id"],
    )
    op.create_index("ix_pc_trades_trade_date_et", "pc_trades", ["trade_date_et"])


def downgrade() -> None:
    op.drop_index("ix_pc_trades_trade_date_et", table_name="pc_trades")
    op.drop_index("ix_pc_trades_source_run_id_lean_order_id", table_name="pc_trades")
    op.drop_index("ix_pc_orders_last_event_utc", table_name="pc_orders")
