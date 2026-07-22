import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class EodStatus(str, enum.Enum):
    OPEN = "OPEN"
    SIGNED = "SIGNED"


class EodOutcome(str, enum.Enum):
    CLEAR = "CLEAR"
    EXCEPTIONS = "EXCEPTIONS"


class EodRecord(Base):
    __tablename__ = "eod_records"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    trade_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[EodStatus] = mapped_column(
        SAEnum(
            EodStatus, native_enum=False, length=16, values_callable=lambda e: [m.value for m in e]
        ),
        nullable=False,
        server_default=EodStatus.OPEN.value,
    )
    signed_off_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    signed_off_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    order_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    execution_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    notional_total: Mapped[Decimal] = mapped_column(
        Numeric(20, 4), nullable=False, server_default="0"
    )
    break_total: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    outcome: Mapped[EodOutcome | None] = mapped_column(
        SAEnum(
            EodOutcome, native_enum=False, length=16, values_callable=lambda e: [m.value for m in e]
        ),
        nullable=True,
    )
    file_storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("trade_date", name="uq_eod_records_trade_date"),)


class EodLeg(str, enum.Enum):
    IB_ALGO = "IB_ALGO"
    ALGO_CLIENT = "ALGO_CLIENT"
    CLIENT_CRM = "CLIENT_CRM"


class EodBreakRecord(Base):
    __tablename__ = "eod_break_records"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    eod_record_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("eod_records.id", ondelete="CASCADE"), nullable=False
    )
    leg: Mapped[EodLeg] = mapped_column(
        SAEnum(
            EodLeg, native_enum=False, length=16, values_callable=lambda e: [m.value for m in e]
        ),
        nullable=False,
    )
    subject_ref: Mapped[str] = mapped_column(String(255), nullable=False)
    break_type: Mapped[str] = mapped_column(String(64), nullable=False)
    field: Mapped[str | None] = mapped_column(String(32), nullable=True)
    expected: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    actual: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    delta: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    order_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(native_uuid=False), nullable=True)
    client_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    model_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(native_uuid=False), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("ix_eod_break_records_eod_record_leg", "eod_record_id", "leg"),)
