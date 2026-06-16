import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Index, Numeric, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class _ActivityRow:
    """Shared abstract schema for the IB Flex "Activity" staging tables.

    Both `orders` (levelOfDetail=ORDER) and `trades` (levelOfDetail=EXECUTION)
    come from the same 89-column IB export header, so the column set is defined
    once here and the concrete models add nothing but `__tablename__`/index.
    This makes schema drift between the two tables structurally impossible.

    Conventions match migration 0003 / app.models.users: UUID PK via
    `Uuid(native_uuid=False)`, `server_default=func.now()`. Python attribute
    names mirror the camelCase source column names 1:1 (no `name=` remapping),
    so the DB column names are the exact CSV header tokens.
    """

    __abstract__ = True

    # --- Infrastructure columns (added, not from CSV) ---------------------
    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )

    # --- DECIMAL -> Numeric(28, 10), nullable (22 columns) ----------------
    accruedInt: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    changeInPrice: Mapped[Decimal | None] = mapped_column(
        Numeric(28, 10), nullable=True
    )
    changeInQuantity: Mapped[Decimal | None] = mapped_column(
        Numeric(28, 10), nullable=True
    )
    closePrice: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    cost: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    fifoPnlRealized: Mapped[Decimal | None] = mapped_column(
        Numeric(28, 10), nullable=True
    )
    fineness: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    fxRateToBase: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    ibCommission: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    initialInvestment: Mapped[Decimal | None] = mapped_column(
        Numeric(28, 10), nullable=True
    )
    mtmPnl: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    multiplier: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    netCash: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    origTradePrice: Mapped[Decimal | None] = mapped_column(
        Numeric(28, 10), nullable=True
    )
    principalAdjustFactor: Mapped[Decimal | None] = mapped_column(
        Numeric(28, 10), nullable=True
    )
    proceeds: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    strike: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    taxes: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    tradeMoney: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    tradePrice: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    weight: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)

    # --- Date YYYYMMDD -> String(8), nullable, raw string (7 columns) -----
    fromDate: Mapped[str | None] = mapped_column(String(8), nullable=True)
    toDate: Mapped[str | None] = mapped_column(String(8), nullable=True)
    expiry: Mapped[str | None] = mapped_column(String(8), nullable=True)
    origTradeDate: Mapped[str | None] = mapped_column(String(8), nullable=True)
    reportDate: Mapped[str | None] = mapped_column(String(8), nullable=True)
    settleDateTarget: Mapped[str | None] = mapped_column(String(8), nullable=True)
    tradeDate: Mapped[str | None] = mapped_column(String(8), nullable=True)

    # --- Datetime YYYYMMDD;HHMMSS -> String(20), nullable, raw (7 columns) -
    whenGenerated: Mapped[str | None] = mapped_column(String(20), nullable=True)
    dateTime: Mapped[str | None] = mapped_column(String(20), nullable=True)
    holdingPeriodDateTime: Mapped[str | None] = mapped_column(String(20), nullable=True)
    openDateTime: Mapped[str | None] = mapped_column(String(20), nullable=True)
    orderTime: Mapped[str | None] = mapped_column(String(20), nullable=True)
    whenRealized: Mapped[str | None] = mapped_column(String(20), nullable=True)
    whenReopened: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # --- Free text -> Text, nullable (3 columns) --------------------------
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    issuer: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # --- Everything else -> String(255), nullable (50 columns) ------------
    accountId: Mapped[str | None] = mapped_column(String(255), nullable=True)
    period: Mapped[str | None] = mapped_column(String(255), nullable=True)
    acctAlias: Mapped[str | None] = mapped_column(String(255), nullable=True)
    assetCategory: Mapped[str | None] = mapped_column(String(255), nullable=True)
    brokerageOrderID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    buySell: Mapped[str | None] = mapped_column(String(255), nullable=True)
    clearingFirmID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    commodityType: Mapped[str | None] = mapped_column(String(255), nullable=True)
    conid: Mapped[str | None] = mapped_column(String(255), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cusip: Mapped[str | None] = mapped_column(String(255), nullable=True)
    deliveryType: Mapped[str | None] = mapped_column(String(255), nullable=True)
    exchOrderId: Mapped[str | None] = mapped_column(String(255), nullable=True)
    exchange: Mapped[str | None] = mapped_column(String(255), nullable=True)
    extExecID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    figi: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ibCommissionCurrency: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ibExecID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ibOrderID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    isAPIOrder: Mapped[str | None] = mapped_column(String(255), nullable=True)
    isin: Mapped[str | None] = mapped_column(String(255), nullable=True)
    issuerCountryCode: Mapped[str | None] = mapped_column(String(255), nullable=True)
    levelOfDetail: Mapped[str | None] = mapped_column(String(255), nullable=True)
    listingExchange: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    openCloseIndicator: Mapped[str | None] = mapped_column(String(255), nullable=True)
    orderReference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    orderType: Mapped[str | None] = mapped_column(String(255), nullable=True)
    origOrderID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    origTradeID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    origTransactionID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    positionActionID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    putCall: Mapped[str | None] = mapped_column(String(255), nullable=True)
    relatedTradeID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    relatedTransactionID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rtn: Mapped[str | None] = mapped_column(String(255), nullable=True)
    securityID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    securityIDType: Mapped[str | None] = mapped_column(String(255), nullable=True)
    serialNumber: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subCategory: Mapped[str | None] = mapped_column(String(255), nullable=True)
    symbol: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tradeID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    traderID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    transactionID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    transactionType: Mapped[str | None] = mapped_column(String(255), nullable=True)
    underlyingConid: Mapped[str | None] = mapped_column(String(255), nullable=True)
    underlyingListingExchange: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    underlyingSecurityID: Mapped[str | None] = mapped_column(String(255), nullable=True)
    underlyingSymbol: Mapped[str | None] = mapped_column(String(255), nullable=True)
    volatilityOrderLink: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # --- Ingestion metadata (added, not from CSV) -------------------------
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Order(Base, _ActivityRow):
    __tablename__ = "orders"

    # ibOrderID is the reconciliation join key (trades.ibOrderID = orders.ibOrderID),
    # so it must be indexed. It is stored as a string — IB sometimes emits dotted
    # tokens, sometimes numeric — never assume integer.
    __table_args__ = (Index("ix_orders_ibOrderID", "ibOrderID"),)


class Trade(Base, _ActivityRow):
    __tablename__ = "trades"

    # Same schema as `orders` (shared _ActivityRow). Each execution carries the
    # ibOrderID of its parent order; index it for the reconciliation join.
    __table_args__ = (Index("ix_trades_ibOrderID", "ibOrderID"),)
