# api-backend/app/models/reports.py
import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# ---------------------------------------------------------------------------
# EoM Report Commenting — one comment per report_name (upsert, no history)
# ---------------------------------------------------------------------------


class EomReportComment(Base):
    __tablename__ = "eom_report_comments"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    report_name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    comment: Mapped[str] = mapped_column(Text, nullable=False)
    updated_by: Mapped[str] = mapped_column(String(128), nullable=False)  # firebase_uid of the PC
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
