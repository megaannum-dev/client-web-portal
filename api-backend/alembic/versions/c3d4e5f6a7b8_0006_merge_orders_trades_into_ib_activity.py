"""0006 merge orders + trades into ib_activity

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-06-16 00:00:02.000000

The Activity (type="AF") `ORDER` and `EXECUTION` rows share one schema, so the
separate `orders` (0004) and `trades` (0005) tables are merged into a single
`ib_activity` table. The pre-existing `levelOfDetail` column already records
which level each row is, so no information is lost.

Data-preserving: the new table is created, every row from `orders` and `trades`
is copied in (UUID PKs are globally unique, so no collisions), and only then are
the old tables dropped. The column set / builder shape is identical to 0004/0005
so the copy is a column-aligned INSERT ... SELECT.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# DECIMAL -> Numeric(28, 10) (22 columns)
_NUMERIC = (
    "accruedInt",
    "changeInPrice",
    "changeInQuantity",
    "closePrice",
    "cost",
    "fifoPnlRealized",
    "fineness",
    "fxRateToBase",
    "ibCommission",
    "initialInvestment",
    "mtmPnl",
    "multiplier",
    "netCash",
    "origTradePrice",
    "principalAdjustFactor",
    "proceeds",
    "quantity",
    "strike",
    "taxes",
    "tradeMoney",
    "tradePrice",
    "weight",
)
# Date YYYYMMDD -> String(8) (7 columns)
_DATE = (
    "fromDate",
    "toDate",
    "expiry",
    "origTradeDate",
    "reportDate",
    "settleDateTarget",
    "tradeDate",
)
# Datetime YYYYMMDD;HHMMSS -> String(20) (7 columns)
_DATETIME = (
    "whenGenerated",
    "dateTime",
    "holdingPeriodDateTime",
    "openDateTime",
    "orderTime",
    "whenRealized",
    "whenReopened",
)
# Free text -> Text (3 columns)
_TEXT = ("description", "issuer", "notes")
# Everything else -> String(255) (50 columns)
_STRING = (
    "accountId",
    "period",
    "acctAlias",
    "assetCategory",
    "brokerageOrderID",
    "buySell",
    "clearingFirmID",
    "commodityType",
    "conid",
    "currency",
    "cusip",
    "deliveryType",
    "exchOrderId",
    "exchange",
    "extExecID",
    "figi",
    "ibCommissionCurrency",
    "ibExecID",
    "ibOrderID",
    "isAPIOrder",
    "isin",
    "issuerCountryCode",
    "levelOfDetail",
    "listingExchange",
    "model",
    "openCloseIndicator",
    "orderReference",
    "orderType",
    "origOrderID",
    "origTradeID",
    "origTransactionID",
    "positionActionID",
    "putCall",
    "relatedTradeID",
    "relatedTransactionID",
    "rtn",
    "securityID",
    "securityIDType",
    "serialNumber",
    "subCategory",
    "symbol",
    "tradeID",
    "traderID",
    "transactionID",
    "transactionType",
    "underlyingConid",
    "underlyingListingExchange",
    "underlyingSecurityID",
    "underlyingSymbol",
    "volatilityOrderLink",
)

# Full column list, in builder order: id PK, then the source columns by bucket,
# then ingested_at. Identical for ib_activity / orders / trades, so a copy is a
# column-aligned INSERT ... SELECT.
_ALL_COLUMNS = ("id", *_NUMERIC, *_DATE, *_DATETIME, *_TEXT, *_STRING, "ingested_at")


def _activity_columns() -> list[sa.Column]:
    """91 columns: id PK + 89 source columns + ingested_at (same as 0004/0005)."""
    cols: list[sa.Column] = [
        sa.Column("id", sa.Uuid(native_uuid=False), primary_key=True),
    ]
    cols += [sa.Column(n, sa.Numeric(28, 10), nullable=True) for n in _NUMERIC]
    cols += [sa.Column(n, sa.String(8), nullable=True) for n in _DATE]
    cols += [sa.Column(n, sa.String(20), nullable=True) for n in _DATETIME]
    cols += [sa.Column(n, sa.Text(), nullable=True) for n in _TEXT]
    cols += [sa.Column(n, sa.String(255), nullable=True) for n in _STRING]
    cols.append(
        sa.Column(
            "ingested_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        )
    )
    return cols


def _col_list() -> str:
    return ", ".join(f"`{c}`" for c in _ALL_COLUMNS)


def upgrade() -> None:
    # 1. New merged table.
    op.create_table("ib_activity", *_activity_columns())
    op.create_index("ix_ib_activity_ibOrderID", "ib_activity", ["ibOrderID"])

    # 2. Copy every row from both source tables (column-aligned).
    cols = _col_list()
    op.execute(f"INSERT INTO `ib_activity` ({cols}) SELECT {cols} FROM `orders`")
    op.execute(f"INSERT INTO `ib_activity` ({cols}) SELECT {cols} FROM `trades`")

    # 3. Drop the now-redundant source tables.
    op.drop_index("ix_orders_ibOrderID", table_name="orders")
    op.drop_table("orders")
    op.drop_index("ix_trades_ibOrderID", table_name="trades")
    op.drop_table("trades")


def downgrade() -> None:
    # Recreate the split tables and partition rows back by levelOfDetail.
    op.create_table("orders", *_activity_columns())
    op.create_index("ix_orders_ibOrderID", "orders", ["ibOrderID"])
    op.create_table("trades", *_activity_columns())
    op.create_index("ix_trades_ibOrderID", "trades", ["ibOrderID"])

    cols = _col_list()
    op.execute(
        f"INSERT INTO `orders` ({cols}) "
        f"SELECT {cols} FROM `ib_activity` WHERE `levelOfDetail` = 'ORDER'"
    )
    op.execute(
        f"INSERT INTO `trades` ({cols}) "
        f"SELECT {cols} FROM `ib_activity` WHERE `levelOfDetail` = 'EXECUTION'"
    )

    op.drop_index("ix_ib_activity_ibOrderID", table_name="ib_activity")
    op.drop_table("ib_activity")
