# api-backend/app/libs/reports/service.py
from __future__ import annotations

from sqlalchemy.orm import Session

from app.libs.reports.repository import EomReportCommentsRepository
from app.libs.reports.schemas import EomReportCommentDTO


class EomReportCommentsService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = EomReportCommentsRepository(db)

    def list_comments(self) -> list[EomReportCommentDTO]:
        return [EomReportCommentDTO.model_validate(row) for row in self.repo.list_all()]

    def upsert_comment(self, report_name: str, comment: str, actor: str) -> EomReportCommentDTO:
        row = self.repo.upsert(report_name, comment, actor)
        self.db.commit()
        self.db.refresh(row)
        return EomReportCommentDTO.model_validate(row)
