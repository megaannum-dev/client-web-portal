# api-backend/app/models/ic_notes.py
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# ---------------------------------------------------------------------------
# IC Notes — uploaded Investment Committee meeting note files (compliance)
# ---------------------------------------------------------------------------


class IcNote(Base):
    __tablename__ = "ic_notes"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    meeting_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    uploaded_by_uid: Mapped[str] = mapped_column(String(128), nullable=False)  # firebase_uid
    uploaded_by_name: Mapped[str] = mapped_column(String(255), nullable=False)
    uploaded_by_role: Mapped[str] = mapped_column(String(32), nullable=False)
    uploaded_by_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
