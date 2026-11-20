"""0053_trade_confirm_alloc_keys

Revision ID: c7a91e4b2d86
Revises: b4e8c1a27d90
Create Date: 2026-11-20 00:00:00.000000

Trade Confirm rows gain the four sample fields that were missing
(regFINRATradingActivityFee, regSection31TransactionFee, regOther,
requestID) and lose the FlexStatement-only fields (fromDate, toDate,
period, whenGenerated) on orders, trades, and symbol_summaries.

Unique keys also include accountId, so a master ALLOC row and the
client BUY/SELL row may share orderID, tradeID, or execID. The
non-unique indexes on trades.orderID and symbol_summaries.symbol stay.

Hand-written; do not autogenerate. The agent does not run this revision.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c7a91e4b2d86"
down_revision: Union[str, Sequence[str], None] = "b4e8c1a27d90"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLES = ("orders", "trades", "symbol_summaries")


def _added_columns() -> list[sa.Column]:
    return [
        sa.Column("regFINRATradingActivityFee", sa.Numeric(28, 10), nullable=True),
        sa.Column("regSection31TransactionFee", sa.Numeric(28, 10), nullable=True),
        sa.Column("regOther", sa.Numeric(28, 10), nullable=True),
        sa.Column("requestID", sa.String(255), nullable=True),
    ]


def _removed_columns() -> list[sa.Column]:
    return [
        sa.Column("fromDate", sa.String(8), nullable=True),
        sa.Column("toDate", sa.String(8), nullable=True),
        sa.Column("period", sa.String(255), nullable=True),
        sa.Column("whenGenerated", sa.String(20), nullable=True),
    ]


def upgrade() -> None:
    for table in _TABLES:
        for column in _added_columns():
            op.add_column(table, column)
        for name in ("fromDate", "toDate", "period", "whenGenerated"):
            op.drop_column(table, name)

    op.drop_index("uq_orders_orderID", table_name="orders")
    op.create_index(
        "uq_orders_orderID_accountId",
        "orders",
        ["orderID", "accountId"],
        unique=True,
    )

    op.drop_index("uq_trades_tradeID", table_name="trades")
    op.drop_index("uq_trades_execID", table_name="trades")
    op.create_index(
        "uq_trades_tradeID_accountId",
        "trades",
        ["tradeID", "accountId"],
        unique=True,
    )
    op.create_index(
        "uq_trades_execID_accountId",
        "trades",
        ["execID", "accountId"],
        unique=True,
    )

    op.create_index(
        "uq_symbol_summaries_symbol_tradeDate_buySell_accountId",
        "symbol_summaries",
        ["symbol", "tradeDate", "buySell", "accountId"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "uq_symbol_summaries_symbol_tradeDate_buySell_accountId",
        table_name="symbol_summaries",
    )

    op.drop_index("uq_trades_execID_accountId", table_name="trades")
    op.drop_index("uq_trades_tradeID_accountId", table_name="trades")
    op.create_index("uq_trades_execID", "trades", ["execID"], unique=True)
    op.create_index("uq_trades_tradeID", "trades", ["tradeID"], unique=True)

    op.drop_index("uq_orders_orderID_accountId", table_name="orders")
    op.create_index("uq_orders_orderID", "orders", ["orderID"], unique=True)

    for table in _TABLES:
        for column in _removed_columns():
            op.add_column(table, column)
        for name in (
            "regFINRATradingActivityFee",
            "regSection31TransactionFee",
            "regOther",
            "requestID",
        ):
            op.drop_column(table, name)
