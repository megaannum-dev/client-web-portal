"""0004 orders table

Revision ID: a1b2c3d4e5f6
Revises: 8f2a1c9d4b6e
Create Date: 2026-06-16 00:00:00.000000

Additive migration (proposal/prompt 006): create the `orders` table — an IB Flex
"Activity" staging table (levelOfDetail=ORDER). 89 source columns kept verbatim
(camelCase names == CSV header tokens) plus a UUID surrogate PK and ingested_at.

`trades` (0005) shares this exact column set via the _ActivityRow mixin; the two
create_table column lists are built by the same helper shape so they cannot drift.
Dialect-neutral DDL: plain create_table / drop_table, additive only.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "8f2a1c9d4b6e"
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


def _activity_columns() -> list[sa.Column]:
    """91 columns: id PK + 89 source columns + ingested_at. Identical for both
    `orders` and `trades` (shared schema, see _ActivityRow)."""
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


def upgrade() -> None:
    op.create_table("orders", *_activity_columns())
    op.create_index("ix_orders_ibOrderID", "orders", ["ibOrderID"])


def downgrade() -> None:
    op.drop_index("ix_orders_ibOrderID", table_name="orders")
    op.drop_table("orders")
