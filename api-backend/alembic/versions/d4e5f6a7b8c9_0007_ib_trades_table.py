"""0007 ib_trades table

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-06-16 00:00:03.000000

Additive migration: create the `ib_trades` table — staging for the IB Flex
**Trade Confirmation** (type="TCF") `<TradeConfirms>` section. The TCF schema
overlaps but differs from Activity: `orderID`/`execID`/`price`/`amount`/
`commission` instead of `ibOrderID`/`ibExecID`/`tradePrice`/`tradeMoney`/
`ibCommission`, plus a full broker / third-party commission and tax breakdown.

Mirrors `_TradeConfirmRow` (app/models/reconciliation.py). The builder shape is
shared so the model and this DDL cannot drift. Dialect-neutral, additive only.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# DECIMAL -> Numeric(28, 10) (24 columns)
_NUMERIC = (
    "accruedInt",
    "amount",
    "brokerClearingCommission",
    "brokerExecutionCommission",
    "commission",
    "fineness",
    "multiplier",
    "netCash",
    "netCashWithBillable",
    "origTradePrice",
    "otherCommission",
    "otherTax",
    "price",
    "principalAdjustFactor",
    "proceeds",
    "quantity",
    "salesTax",
    "strike",
    "tax",
    "thirdPartyClearingCommission",
    "thirdPartyExecutionCommission",
    "thirdPartyRegulatoryCommission",
    "tradeCharge",
    "weight",
)
# Date YYYYMMDD -> String(8) (7 columns)
_DATE = (
    "fromDate",
    "toDate",
    "expiry",
    "origTradeDate",
    "reportDate",
    "settleDate",
    "tradeDate",
)
# Datetime YYYYMMDD;HHMMSS -> String(20) (3 columns)
_DATETIME = (
    "whenGenerated",
    "dateTime",
    "orderTime",
)
# Free text -> Text (2 columns)
_TEXT = ("description", "issuer")
# Everything else -> String(255) (46 columns)
_STRING = (
    "accountId",
    "acctAlias",
    "allocatedTo",
    "assetCategory",
    "blockID",
    "brokerageOrderID",
    "buySell",
    "clearingFirmID",
    "code",
    "commissionCurrency",
    "commodityType",
    "conid",
    "currency",
    "cusip",
    "deliveryType",
    "execID",
    "exchange",
    "extExecID",
    "figi",
    "isAPIOrder",
    "isin",
    "issuerCountryCode",
    "levelOfDetail",
    "listingExchange",
    "model",
    "orderID",
    "orderReference",
    "orderType",
    "origTradeID",
    "period",
    "positionActionID",
    "putCall",
    "rfqID",
    "securityID",
    "securityIDType",
    "serialNumber",
    "subCategory",
    "symbol",
    "tradeID",
    "traderID",
    "transactionType",
    "underlyingConid",
    "underlyingListingExchange",
    "underlyingSecurityID",
    "underlyingSymbol",
    "volatilityOrderLink",
)


def _tradeconfirm_columns() -> list[sa.Column]:
    """84 columns: id PK + 82 source columns + ingested_at (== _TradeConfirmRow)."""
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
    op.create_table("ib_trades", *_tradeconfirm_columns())
    op.create_index("ix_ib_trades_orderID", "ib_trades", ["orderID"])


def downgrade() -> None:
    op.drop_index("ix_ib_trades_orderID", table_name="ib_trades")
    op.drop_table("ib_trades")
