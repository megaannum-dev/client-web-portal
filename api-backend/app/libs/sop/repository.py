# api-backend/app/libs/sop/repository.py
from __future__ import annotations

import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.sop import SopCategory, SopDocument, SopVersion


class SopRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def insert(self, row: SopDocument | SopVersion) -> SopDocument | SopVersion:
        self.db.add(row)
        self.db.flush()
        return row

    def list_docs(self, category: SopCategory | None) -> list[SopDocument]:
        q = self.db.query(SopDocument)
        if category is not None:
            q = q.filter(SopDocument.category == category.value)
        return q.order_by(SopDocument.updated_at.desc()).all()

    def get_doc(self, sop_id: uuid.UUID) -> SopDocument | None:
        return self.db.query(SopDocument).filter(SopDocument.id == sop_id).one_or_none()

    def get_version(self, sop_id: uuid.UUID, version_no: int) -> SopVersion | None:
        return (
            self.db.query(SopVersion)
            .filter(SopVersion.sop_id == sop_id, SopVersion.version_no == version_no)
            .one_or_none()
        )

    def max_version_no(self, sop_id: uuid.UUID) -> int:
        return (
            self.db.query(func.max(SopVersion.version_no))
            .filter(SopVersion.sop_id == sop_id)
            .scalar()
            or 0
        )
