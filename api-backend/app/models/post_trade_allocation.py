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
