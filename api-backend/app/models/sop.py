# api-backend/app/models/sop.py
import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

# ---------------------------------------------------------------------------
# SOPs — versioned Standard Operating Procedure documents (shared.sop page)
# ---------------------------------------------------------------------------


class SopCategory(StrEnum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    AD_HOC = "ad_hoc"


class SopDocument(Base):
    __tablename__ = "sop_documents"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    # Plain string, not a DB enum -- validated against SopCategory at the API layer.
    category: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    created_by_uid: Mapped[str] = mapped_column(String(128), nullable=False)
    created_by_name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    versions: Mapped[list["SopVersion"]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="SopVersion.version_no.desc()",
    )


class SopVersion(Base):
    __tablename__ = "sop_versions"
    __table_args__ = (
        UniqueConstraint("storage_key", name="uq_sop_versions_storage_key"),
        UniqueConstraint("sop_id", "version_no", name="uq_sop_versions_sop_id_version_no"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    sop_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("sop_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    change_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False)
    uploaded_by_uid: Mapped[str] = mapped_column(String(128), nullable=False)  # firebase_uid
    uploaded_by_name: Mapped[str] = mapped_column(String(255), nullable=False)
    uploaded_by_role: Mapped[str] = mapped_column(String(32), nullable=False)
    uploaded_by_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    document: Mapped["SopDocument"] = relationship(back_populates="versions")
