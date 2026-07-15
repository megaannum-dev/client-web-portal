"""AlgoTrade-side reconciliation models — session grouping + order/execution storage (012)."""

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    UniqueConstraint,
    Uuid,
    func,
)
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
