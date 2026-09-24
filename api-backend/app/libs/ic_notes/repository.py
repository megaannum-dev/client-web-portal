# api-backend/app/libs/ic_notes/repository.py
from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models.ic_notes import IcNote


class IcNotesRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def insert(self, row: IcNote) -> IcNote:
        self.db.add(row)
        return row

    def list_all(self) -> list[IcNote]:
        return self.db.query(IcNote).order_by(IcNote.meeting_at.desc()).all()

    def get(self, note_id: uuid.UUID) -> IcNote | None:
        return self.db.query(IcNote).filter(IcNote.id == note_id).one_or_none()
