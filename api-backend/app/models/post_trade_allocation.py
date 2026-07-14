"""Post-trade allocation models — run header, per-cell records, client portfolios (feature 011)."""
import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class RunStatus(str, enum.Enum):
    COMPLETED = "completed"
    EMPTY = "empty"
    FAILED = "failed"


class RunTrigger(str, enum.Enum):
    SCHEDULED = "scheduled"
    MANUAL = "manual"


# ---------------------------------------------------------------------------
# DB-1 — post_trade_allocation_runs
# ---------------------------------------------------------------------------


class PostTradeAllocationRun(Base):
    __tablename__ = "post_trade_allocation_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    trade_date: Mapped[str] = mapped_column(String(8), nullable=False)  # IB ET YYYYMMDD token (B-4)
    period_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("allocation_periods.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[RunStatus] = mapped_column(
        SAEnum(RunStatus, native_enum=False, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        server_default="completed",
    )
    trigger: Mapped[RunTrigger] = mapped_column(
        SAEnum(RunTrigger, native_enum=False, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    grand_total: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    run_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_post_trade_allocation_runs_trade_date", "trade_date"),
    )


# ---------------------------------------------------------------------------
# DB-2 — post_trade_allocations (per-cell records)
# ---------------------------------------------------------------------------


class PostTradeAllocation(Base):
    __tablename__ = "post_trade_allocations"

    run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("post_trade_allocation_runs.id", ondelete="CASCADE"),
        primary_key=True,
    )
    model_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("models.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    model_traded: Mapped[Decimal] = mapped_column(Numeric(28, 10), nullable=False)  # signed (D-3)
    units: Mapped[Decimal] = mapped_column(Numeric(28, 10), nullable=False)  # frozen multiplier
    units_total: Mapped[Decimal] = mapped_column(Numeric(28, 10), nullable=False)
    allocated: Mapped[Decimal] = mapped_column(Numeric(28, 10), nullable=False)  # signed (D-3, D-7)
    pct: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False)
    ib_account: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model_name: Mapped[str] = mapped_column(String(255), nullable=False)
    model_acct: Mapped[str | None] = mapped_column(String(255), nullable=True)

    __table_args__ = (
        Index("ix_post_trade_allocations_run_model", "run_id", "model_id"),
    )


# ---------------------------------------------------------------------------
# DB-3 — client_portfolios (three-column balance)
# ---------------------------------------------------------------------------


class ClientPortfolio(Base):
    __tablename__ = "client_portfolios"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    cash_deposit: Mapped[Decimal] = mapped_column(
        Numeric(28, 10), nullable=False, server_default="0"
    )  # static; NOT written by this proposal (see Behavior)
    amount_in_trade: Mapped[Decimal] = mapped_column(
        Numeric(28, 10), nullable=False, server_default="0"
    )  # signed (D-3); updated by every non-empty run
    previous_amount_in_trade: Mapped[Decimal] = mapped_column(
        Numeric(28, 10), nullable=False, server_default="0"
    )  # snapshot of amount_in_trade before the last run
    last_run_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("post_trade_allocation_runs.id", ondelete="SET NULL"),
        nullable=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
