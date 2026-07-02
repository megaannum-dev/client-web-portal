import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Index, Numeric, String, Text, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class _TradeRow:
    """Canonical single-source mixin for IB Flex Trade Confirmation (TCF) rows.

    Column set is the TCF schema from the former _TradeConfirmRow. Applied to
    Order, Trade, and SymbolSummary. Replaces the parallel _ActivityRow /
    _TradeConfirmRow pair (~700 LOC removed).

    Conventions: UUID PK via Uuid(native_uuid=False), server_default=func.now(),
    camelCase attribute names == DB column names (no name= remapping), all source
    columns nullable.
    """

    __abstract__ = True

    # --- Infrastructure -------------------------------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )

    # --- Numeric -> Numeric(28, 10), nullable (24 columns) -------------------
    accruedInt: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    amount: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    brokerClearingCommission: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    brokerExecutionCommission: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    commission: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    fineness: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    multiplier: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    netCash: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    netCashWithBillable: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    origTradePrice: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    otherCommission: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    otherTax: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    price: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    principalAdjustFactor: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    proceeds: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    salesTax: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    strike: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    tax: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    thirdPartyClearingCommission: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    thirdPartyExecutionCommission: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    thirdPartyRegulatoryCommission: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    tradeCharge: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    weight: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)

    # --- Date YYYYMMDD -> String(8), nullable (7 columns) --------------------
    fromDate: Mapped[str | None] = mapped_column(String(8), nullable=True)
    toDate: Mapped[str | None] = mapped_column(String(8), nullable=True)
    expiry: Mapped[str | None] = mapped_column(String(8), nullable=True)
    origTradeDate: Mapped[str | None] = mapped_column(String(8), nullable=True)
    reportDate: Mapped[str | None] = mapped_column(String(8), nullable=True)
    settleDate: Mapped[str | None] = mapped_column(String(8), nullable=True)
    tradeDate: Mapped[str | None] = mapped_column(String(8), nullable=True)

    # --- Datetime YYYYMMDD;HHMMSS -> String(20), nullable (3 columns) --------
    whenGenerated: Mapped[str | None] = mapped_column(String(20), nullable=True)
    dateTime: Mapped[str | None] = mapped_column(String(20), nullable=True)
    orderTime: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # --- Free text -> Text, nullable (2 columns) -----------------------------
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    issuer: Mapped[str | None] = mapped_column(Text, nullable=True)

    # --- Everything else -> String(255), nullable (46 columns) ---------------
    accountId: Mapped[str | None] = mapped_column(String(255), nullable=True)
    acctAlias: Mapped[str | None] = mapped_column(String(255), nullable=True)
    allocatedTo: Mapped[str | None] = mapped_column(String(255), nullable=True)
    assetCategory: Mapped[str | None] = mapped_column(String(255), nullable=True)
    blockID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    brokerageOrderID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    buySell: Mapped[str | None] = mapped_column(String(255), nullable=True)
    clearingFirmID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    code: Mapped[str | None] = mapped_column(String(255), nullable=True)
    commissionCurrency: Mapped[str | None] = mapped_column(String(255), nullable=True)
    commodityType: Mapped[str | None] = mapped_column(String(255), nullable=True)
    conid: Mapped[str | None] = mapped_column(String(255), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cusip: Mapped[str | None] = mapped_column(String(255), nullable=True)
    deliveryType: Mapped[str | None] = mapped_column(String(255), nullable=True)
    execID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    exchange: Mapped[str | None] = mapped_column(String(255), nullable=True)
    extExecID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    figi: Mapped[str | None] = mapped_column(String(255), nullable=True)
    isAPIOrder: Mapped[str | None] = mapped_column(String(255), nullable=True)
    isin: Mapped[str | None] = mapped_column(String(255), nullable=True)
    issuerCountryCode: Mapped[str | None] = mapped_column(String(255), nullable=True)
    levelOfDetail: Mapped[str | None] = mapped_column(String(255), nullable=True)
    listingExchange: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    orderID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    orderReference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    orderType: Mapped[str | None] = mapped_column(String(255), nullable=True)
    origTradeID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    period: Mapped[str | None] = mapped_column(String(255), nullable=True)
    positionActionID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    putCall: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rfqID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    securityID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    securityIDType: Mapped[str | None] = mapped_column(String(255), nullable=True)
    serialNumber: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subCategory: Mapped[str | None] = mapped_column(String(255), nullable=True)
    symbol: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tradeID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    traderID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    transactionType: Mapped[str | None] = mapped_column(String(255), nullable=True)
    underlyingConid: Mapped[str | None] = mapped_column(String(255), nullable=True)
    underlyingListingExchange: Mapped[str | None] = mapped_column(String(255), nullable=True)
    underlyingSecurityID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    underlyingSymbol: Mapped[str | None] = mapped_column(String(255), nullable=True)
    volatilityOrderLink: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # --- Ingestion metadata ---------------------------------------------------
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Order(Base, _TradeRow):
    """IB ORDER-level rows (levelOfDetail='ORDER'), split from ib_activity + ib_trades."""

    __tablename__ = "orders"

    __table_args__ = (
        UniqueConstraint("orderID", name="uq_orders_orderID"),
    )


class Trade(Base, _TradeRow):
    """IB EXECUTION-level rows (levelOfDetail='EXECUTION'), split from ib_activity + ib_trades."""

    __tablename__ = "trades"

    __table_args__ = (
        Index("ix_trades_orderID", "orderID"),
        UniqueConstraint("execID", name="uq_trades_execID"),
    )


class SymbolSummary(Base, _TradeRow):
    """Higher-level rollup rows by symbol, populated by the ingest pipeline."""

    __tablename__ = "symbol_summaries"

    __table_args__ = (
        Index("ix_symbol_summaries_symbol", "symbol"),
    )
