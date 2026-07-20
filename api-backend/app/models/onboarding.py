import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
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
# DB-2 — onboarding_documents
# ---------------------------------------------------------------------------


class DocStatus(str, enum.Enum):
    NOT_STARTED = "not_started"
    UPLOADED = "uploaded"
    IN_REVIEW = "in_review"
    VERIFIED = "verified"
    REJECTED = "rejected"
    EXPIRED = "expired"


class OnboardingDocument(Base):
    __tablename__ = "onboarding_documents"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    onboarding_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("client_onboardings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    doc_type: Mapped[str] = mapped_column(String(64), nullable=False)  # stable config KEY
    status: Mapped[DocStatus] = mapped_column(
        SAEnum(
            DocStatus,
            native_enum=False,
            length=16,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        server_default=DocStatus.NOT_STARTED.value,
    )
    storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    version_no: Mapped[int] = mapped_column(Integer(), nullable=False, server_default="0")
    # compliance firebase_uid
    reviewed_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    issue_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
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
        UniqueConstraint("onboarding_id", "doc_type", name="uq_onboarding_documents_cycle_type"),
    )


# ---------------------------------------------------------------------------
# DB-3 — client_allotment_redemptions
# ---------------------------------------------------------------------------


class AllotRdmpStatus(str, enum.Enum):
    PENDING = "pending"
    ACKNOWLEDGED = "acknowledged"


class AllotRdmpKind(str, enum.Enum):
    ALLOTMENT = "allotment"
    # not written by this proposal — reserved for a future redemption proposal
    REDEMPTION = "redemption"


class ClientAllotmentRedemption(Base):
    __tablename__ = "client_allotment_redemptions"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("users.id"), nullable=False, index=True
    )
    model_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("models.id"), nullable=False
    )
    multiplier: Mapped[Decimal] = mapped_column(Numeric(28, 10), nullable=False)
    kind: Mapped[AllotRdmpKind] = mapped_column(
        SAEnum(
            AllotRdmpKind,
            native_enum=False,
            length=16,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    status: Mapped[AllotRdmpStatus] = mapped_column(
        SAEnum(
            AllotRdmpStatus,
            native_enum=False,
            length=16,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        server_default=AllotRdmpStatus.PENDING.value,
    )
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)  # e.g. "initial allotment"
    # Links an onboarding-produced allotment to its cycle; NULL for any future
    # non-onboarding row (e.g. a manually-entered redemption). UNIQUE is
    # load-bearing (proposal B-3): client_onboardings is one row PER CLIENT
    # (DB-1) and is reopened, not re-inserted, on renewal (D-7) — this
    # constraint is the DB-level guarantee that a given onboarding row can
    # ever be cited as the source of at most one allotment, independent of
    # whether the Backend layer's kind-branch (Backend C-2) has a bug.
    source_onboarding_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("client_onboardings.id"),
        nullable=True,
        unique=True,
    )
    reference: Mapped[str] = mapped_column(String(32), nullable=False)  # e.g. "AL-3F9A2C"
    # --- widened 2026-07-20 (D-9): snapshots taken once at insert, never recomputed ---
    agg_before: Mapped[Decimal] = mapped_column(Numeric(28, 10), nullable=False)
    agg_after: Mapped[Decimal] = mapped_column(Numeric(28, 10), nullable=False)
    expected_cash_in: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    acknowledged_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_client_allotment_redemptions_status", "status"),
        Index("ix_client_allotment_redemptions_kind", "kind"),
    )
