import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class OnboardingStatus(str, enum.Enum):
    INITIAL = "initial"
    REVIEWING = "reviewing"
    PENDING_REVIEW = "pending_review"
    ACTIVE = "active"


class OnboardingKind(str, enum.Enum):
    INITIAL = "initial"
    RENEWAL = "renewal"


# ---------------------------------------------------------------------------
# DB-1 — client_onboardings
# ---------------------------------------------------------------------------


class ClientOnboarding(Base):
    __tablename__ = "client_onboardings"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    # One row per client — a renewal reopens this SAME row in place (proposal D-7),
    # it never inserts a second one. unique=True is the schema-level expression of
    # "one onboarding cycle record per client, ever."
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        index=True,
        nullable=False,
    )
    kind: Mapped[OnboardingKind] = mapped_column(
        SAEnum(
            OnboardingKind,
            native_enum=False,
            length=16,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        server_default=OnboardingKind.INITIAL.value,
    )
    status: Mapped[OnboardingStatus] = mapped_column(
        SAEnum(
            OnboardingStatus,
            native_enum=False,
            length=16,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        server_default=OnboardingStatus.INITIAL.value,
    )
    model_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("models.id"), nullable=False
    )
    multiplier: Mapped[Decimal] = mapped_column(Numeric(28, 10), nullable=False)
    mgmt_fee: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    incentive_fee: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    ibhk_account: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sw_account: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # --- widened 2026-07-20 (D-9): genuinely new columns, no prior home anywhere ---
    # e.g. "Hong Kong ID Card" | "Passport"
    id_type: Mapped[str] = mapped_column(String(64), nullable=False)
    id_number: Mapped[str] = mapped_column(String(128), nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (Index("ix_client_onboardings_status", "status"),)


# ---------------------------------------------------------------------------
# DB-4 — client_events
# ---------------------------------------------------------------------------


class ClientEvent(Base):
    __tablename__ = "client_events"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("users.id"), nullable=False, index=True
    )
    category: Mapped[str] = mapped_column(String(64), nullable=False)  # e.g. "Account Notification"
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
