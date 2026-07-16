"""AlgoTrade-side reconciliation models — session grouping + order/execution storage (012)."""

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CHAR,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SourceKind(str, enum.Enum):
    SYNTHESIZED = "SYNTHESIZED"
    LIVE = "LIVE"


# ---------------------------------------------------------------------------
# DB-1 — recon_sessions
# ---------------------------------------------------------------------------


class ReconSession(Base):
    __tablename__ = "recon_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    trade_date: Mapped[date] = mapped_column(Date, nullable=False)
    ib_run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("post_trade_allocation_runs.id"), nullable=False
    )
    allocation_period_id: Mapped[uuid.UUID] = mapped_column(Uuid(native_uuid=False), nullable=False)
    allocation_user_id: Mapped[uuid.UUID] = mapped_column(Uuid(native_uuid=False), nullable=False)
    allocation_model_id: Mapped[uuid.UUID] = mapped_column(Uuid(native_uuid=False), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("trade_date", "ib_run_id", name="uq_recon_sessions_trade_date_ib_run_id"),
        ForeignKeyConstraint(
            ["allocation_period_id", "allocation_user_id", "allocation_model_id"],
            [
                "allocation_model_snapshots.period_id",
                "allocation_model_snapshots.user_id",
                "allocation_model_snapshots.model_id",
            ],
            name="fk_recon_sessions_allocation_model_snapshot",
        ),
    )


# ---------------------------------------------------------------------------
# DB-2 — algotrade_orders
# ---------------------------------------------------------------------------


class AlgoTradeOrder(Base):
    __tablename__ = "algotrade_orders"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("recon_sessions.id", ondelete="CASCADE"), nullable=False
    )
    model_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("models.id"), nullable=False
    )
    symbol: Mapped[str] = mapped_column(String(255), nullable=False)
    buy_sell: Mapped[str] = mapped_column(String(16), nullable=False)  # 'BUY' | 'SELL'
    qty_ordered: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    notional: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    trade_date: Mapped[date] = mapped_column(Date, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False, server_default="USD")
    asset_class: Mapped[str] = mapped_column(String(32), nullable=False, server_default="OPT")
    source_kind: Mapped[SourceKind] = mapped_column(
        SAEnum(
            SourceKind, native_enum=False, length=16, values_callable=lambda e: [m.value for m in e]
        ),
        nullable=False,
    )
    derived_from_ib_run_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("post_trade_allocation_runs.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_algotrade_orders_session_model_symbol", "session_id", "model_id", "symbol"),
    )


# ---------------------------------------------------------------------------
# DB-3 — algotrade_executions
# ---------------------------------------------------------------------------


class AlgoTradeExecution(Base):
    __tablename__ = "algotrade_executions"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("algotrade_orders.id", ondelete="CASCADE"),
        nullable=False,
    )
    qty_filled: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    fill_price: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    fill_notional: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (Index("ix_algotrade_executions_order", "order_id"),)
