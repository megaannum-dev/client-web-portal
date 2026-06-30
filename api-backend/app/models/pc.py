"""PC workspace models — trading models & client subscriptions (feature 006)."""
import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class ModelStatus(str, enum.Enum):
    LIVE = "live"
    DRAFT = "draft"
    DELETED = "deleted"


class PeriodStatus(str, enum.Enum):
    OPEN = "open"
    CONFIRMED = "confirmed"


class ModelChangeKind(str, enum.Enum):
    CREATED = "created"
    EDITED = "edited"
    PUBLISHED = "published"
    MATERIAL_UPLOADED = "material_uploaded"
    DELETED = "deleted"


# ---------------------------------------------------------------------------
# DB-1 — models
# ---------------------------------------------------------------------------


class Model(Base):
    __tablename__ = "models"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    manager: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model_size: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    intro: Mapped[str | None] = mapped_column(String(255), nullable=True)
    symbols: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[ModelStatus] = mapped_column(
        SAEnum(
            ModelStatus,
            native_enum=False,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        server_default="draft",
    )
    version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        Index("ix_models_status", "status"),
        Index("ix_models_updated_at", "updated_at"),  # DB-6
    )


# ---------------------------------------------------------------------------
# DB-1a — model_materials
# ---------------------------------------------------------------------------


class ModelMaterial(Base):
    __tablename__ = "model_materials"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    model_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("models.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[str] = mapped_column(String(32), nullable=False)
    version_no: Mapped[int] = mapped_column(
        Integer(),
        nullable=False,
        server_default="0",
    )
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    uploaded_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint("model_id", "version", name="uq_model_materials_model_version"),
    )


# ---------------------------------------------------------------------------
# DB-1b — model_changes
# ---------------------------------------------------------------------------


class ModelChange(Base):
    __tablename__ = "model_changes"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    model_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("models.id", ondelete="CASCADE"),
        nullable=False,
    )
    kind: Mapped[ModelChangeKind] = mapped_column(
        SAEnum(
            ModelChangeKind,
            native_enum=False,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    detail: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    actor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (Index("ix_model_changes_model_id", "model_id"),)


# ---------------------------------------------------------------------------
# DB-3 — client_subscriptions
# ---------------------------------------------------------------------------


class ClientSubscription(Base):
    __tablename__ = "client_subscriptions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    model_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("models.id", ondelete="CASCADE"),
        primary_key=True,
    )
    multiplier: Mapped[Decimal] = mapped_column(
        Numeric(28, 10), nullable=False, server_default="1"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        Index("ix_client_subscriptions_model_id", "model_id"),
        Index("ix_client_subscriptions_updated_at", "updated_at"),  # DB-6
    )


# ---------------------------------------------------------------------------
# DB-4 — allocation_periods
# ---------------------------------------------------------------------------


class AllocationPeriod(Base):
    __tablename__ = "allocation_periods"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    label: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[PeriodStatus] = mapped_column(
        SAEnum(
            PeriodStatus,
            native_enum=False,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        server_default="open",
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    confirmed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("label", name="uq_allocation_periods_label"),
        Index("ix_allocation_periods_status", "status"),
    )


# ---------------------------------------------------------------------------
# DB-5 — allocation_model_snapshots
# ---------------------------------------------------------------------------


class AllocationModelSnapshot(Base):
    __tablename__ = "allocation_model_snapshots"

    period_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("allocation_periods.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    model_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("models.id", ondelete="CASCADE"),
        primary_key=True,
    )
    multiplier: Mapped[Decimal] = mapped_column(Numeric(28, 10), nullable=False)
    model_size: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    ib_account: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_allocation_model_snapshots_model_id", "model_id"),
    )


# ---------------------------------------------------------------------------
# DB-new — model_symbols
# ---------------------------------------------------------------------------


class ModelSymbol(Base):
    __tablename__ = "model_symbols"

    model_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("models.id", ondelete="CASCADE"),
        primary_key=True,
    )
    symbol: Mapped[str] = mapped_column(String(32), nullable=False, primary_key=True)
    weight: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
