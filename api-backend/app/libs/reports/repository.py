# api-backend/app/libs/reports/repository.py
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.reports import EomReportComment


class EomReportCommentsRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_all(self) -> list[EomReportComment]:
        return (
            self.db.query(EomReportComment)
            .order_by(EomReportComment.report_name.asc())
            .all()
        )

    def get_by_report_name(self, report_name: str) -> EomReportComment | None:
        return (
            self.db.query(EomReportComment)
            .filter(EomReportComment.report_name == report_name)
            .one_or_none()
        )

    def upsert(self, report_name: str, comment: str, actor: str) -> EomReportComment:
        """Load-or-create + set fields. No commit here -- caller (service) owns
        the txn boundary."""
        row = self.get_by_report_name(report_name)
        if row is None:
            row = EomReportComment(id=uuid.uuid4(), report_name=report_name)
            self.db.add(row)
        row.comment = comment
        row.updated_by = actor
        row.updated_at = datetime.utcnow()
        return row
