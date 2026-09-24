# api-backend/app/libs/ic_notes/service.py
from __future__ import annotations

import os
import uuid
from datetime import datetime
from typing import BinaryIO

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.storage import Bucket, get_storage
from app.libs.access.repository import AccessRepository
from app.libs.ic_notes.repository import IcNotesRepository
from app.libs.ic_notes.schemas import IcNoteDTO
from app.libs.onboarding.service import fix_mojibake_filename
from app.models.ic_notes import IcNote
from app.models.users import User

# Same feature-local-tunable convention as CHAT_MAX_UPLOAD_BYTES (chat/service.py:25).
IC_NOTES_MAX_UPLOAD_BYTES = int(os.getenv("IC_NOTES_MAX_UPLOAD_BYTES", str(25 * 1024 * 1024)))

# Extension -> server-decided MIME. Client-supplied content_type is ignored --
# same reasoning as the storage-key trust boundary: never trust the caller.
_EXT_CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".md": "text/markdown",
}


class IcNotesService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = IcNotesRepository(db)

    def upload(
        self, file: UploadFile, title: str, meeting_at: datetime, actor: User
    ) -> IcNoteDTO:
        title = title.strip()
        if not title:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "title is required")

        filename = fix_mojibake_filename(file.filename) or "note"
        ext = os.path.splitext(filename)[1].lower()
        content_type = _EXT_CONTENT_TYPES.get(ext)
        if content_type is None:
            raise HTTPException(
                status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                f"Unsupported file type '{ext or filename}' -- expected .pdf/.docx/.md",
            )

        file.file.seek(0, 2)
        size = file.file.tell()
        file.file.seek(0)
        if size == 0:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "File is empty")
        if size > IC_NOTES_MAX_UPLOAD_BYTES:
            raise HTTPException(
                status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                f"File exceeds the {IC_NOTES_MAX_UPLOAD_BYTES} byte upload budget",
            )

        key = get_storage(Bucket.IC_NOTES).save(
            file.file, suggested_name=filename, content_type=content_type
        )
        row = self.repo.insert(
            IcNote(
                id=uuid.uuid4(),
                title=title,
                meeting_at=meeting_at,
                filename=filename,
                content_type=content_type,
                size_bytes=size,
                storage_key=key,
                uploaded_by_uid=actor.firebase_uid,
                uploaded_by_name=actor.name or "",
                uploaded_by_role=actor.role,
                uploaded_by_email=actor.email,
            )
        )
        AccessRepository(self.db).insert_audit(
            actor_uid=actor.firebase_uid,
            actor_name=actor.name,
            event="ic_notes.uploaded",
            detail=f"{title} ({filename})",
        )
        self.db.commit()
        self.db.refresh(row)
        return IcNoteDTO.model_validate(row)

    def list(self) -> list[IcNoteDTO]:
        return [IcNoteDTO.model_validate(row) for row in self.repo.list_all()]

    def open(self, note_id: uuid.UUID) -> tuple[IcNote, BinaryIO]:
        row = self.repo.get(note_id)
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown note")
        return row, get_storage(Bucket.IC_NOTES).open(row.storage_key)
