# api-backend/app/libs/sop/service.py
from __future__ import annotations

import logging
import os
import uuid
from typing import BinaryIO

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.storage import Bucket, get_storage
from app.libs.access.repository import AccessRepository
from app.libs.sop.repository import SopRepository
from app.libs.sop.schemas import SopDocumentDTO, SopUpdate, SopVersionDTO
from app.models.sop import SopCategory, SopDocument, SopVersion
from app.models.users import User
from app.utils.filenames import fix_mojibake_filename

logger = logging.getLogger(__name__)

SOP_MAX_UPLOAD_BYTES = int(os.getenv("SOP_MAX_UPLOAD_BYTES", str(50 * 1024 * 1024)))

# Extension -> server-decided MIME. Client-supplied content_type is ignored.
# .svg/.html deliberately excluded: stored-XSS vectors.
_EXT_CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "Unknown SOP")


def _validate(file: UploadFile) -> tuple[str, str, int]:
    """-> (filename, content_type, size). Raises 415/422/413."""
    filename = fix_mojibake_filename(file.filename) or "sop"
    ext = os.path.splitext(filename)[1].lower()
    content_type = _EXT_CONTENT_TYPES.get(ext)
    if content_type is None:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"Unsupported file type '{ext or filename}' -- expected one of "
            f"{'/'.join(sorted(_EXT_CONTENT_TYPES))}",
        )
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if size == 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "File is empty")
    if size > SOP_MAX_UPLOAD_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File exceeds the {SOP_MAX_UPLOAD_BYTES} byte upload budget",
        )
    return filename, content_type, size


def _doc_dto(doc: SopDocument) -> SopDocumentDTO:
    return SopDocumentDTO(
        id=doc.id,
        title=doc.title,
        category=SopCategory(doc.category),
        created_by_uid=doc.created_by_uid,
        created_by_name=doc.created_by_name,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        latest=SopVersionDTO.model_validate(doc.versions[0]),  # ordered version_no desc
        version_count=len(doc.versions),
    )


class SopService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = SopRepository(db)

    def _doc(self, sop_id: uuid.UUID) -> SopDocument:
        doc = self.repo.get_doc(sop_id)
        if doc is None:
            raise _not_found()
        return doc

    def _version(self, sop_id: uuid.UUID, version_no: int) -> SopVersion:
        row = self.repo.get_version(sop_id, version_no)
        if row is None:
            raise _not_found()
        return row

    def _new_version(
        self,
        sop_id: uuid.UUID,
        version_no: int,
        file: UploadFile,
        change_note: str | None,
        actor: User,
    ) -> SopVersion:
        filename, content_type, size = _validate(file)
        key = get_storage(Bucket.SOP).save(
            file.file, suggested_name=filename, content_type=content_type, subdir=str(sop_id)
        )
        return SopVersion(
            id=uuid.uuid4(),
            sop_id=sop_id,
            version_no=version_no,
            change_note=change_note,
            filename=filename,
            content_type=content_type,
            size_bytes=size,
            storage_key=key,
            uploaded_by_uid=actor.firebase_uid,
            uploaded_by_name=actor.name or "",
            uploaded_by_role=actor.role,
            uploaded_by_email=actor.email,
        )

    def _audit(self, actor: User, event: str, detail: str) -> None:
        AccessRepository(self.db).insert_audit(
            actor_uid=actor.firebase_uid, actor_name=actor.name, event=event, detail=detail
        )

    def _delete_files(self, keys: list[str]) -> None:
        # Called after the commit, deliberately: an orphan file is acceptable,
        # a row pointing at a missing file is not.
        storage = get_storage(Bucket.SOP)
        for key in keys:
            try:
                storage.delete(key)
            except Exception:
                logger.exception("Failed to delete SOP file %s", key)

    def list(self, category: SopCategory | None) -> list[SopDocumentDTO]:
        return [_doc_dto(d) for d in self.repo.list_docs(category)]

    def create(
        self,
        file: UploadFile,
        title: str,
        category: SopCategory,
        change_note: str | None,
        actor: User,
    ) -> SopDocumentDTO:
        title = title.strip()
        if not title:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "title is required")
        sop_id = uuid.uuid4()
        version = self._new_version(sop_id, 1, file, change_note, actor)
        doc = SopDocument(
            id=sop_id,
            title=title,
            category=category.value,
            created_by_uid=actor.firebase_uid,
            created_by_name=actor.name or "",
        )
        self.repo.insert(doc)
        self.repo.insert(version)
        self._audit(actor, "sop.created", f"{title} ({version.filename})")
        self.db.commit()
        self.db.refresh(doc)
        return _doc_dto(doc)

    def add_version(
        self, sop_id: uuid.UUID, file: UploadFile, change_note: str | None, actor: User
    ) -> SopVersionDTO:
        doc = self._doc(sop_id)
        version = self._new_version(
            sop_id, self.repo.max_version_no(sop_id) + 1, file, change_note, actor
        )
        try:
            self.repo.insert(version)
            doc.updated_at = func.now()
            self._audit(actor, "sop.version_added", f"{doc.title} v{version.version_no}")
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            self._delete_files([version.storage_key])
            raise HTTPException(
                status.HTTP_409_CONFLICT, "Another version was uploaded concurrently; retry"
            ) from None
        self.db.refresh(version)
        return SopVersionDTO.model_validate(version)

    def update(self, sop_id: uuid.UUID, body: SopUpdate, actor: User) -> SopDocumentDTO:
        doc = self._doc(sop_id)
        if body.title is not None:
            title = body.title.strip()
            if not title:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "title is required")
            doc.title = title
        if body.category is not None:
            doc.category = body.category.value
        doc.updated_at = func.now()
        self._audit(actor, "sop.updated", f"{doc.title} ({doc.category})")
        self.db.commit()
        self.db.refresh(doc)
        return _doc_dto(doc)

    def versions(self, sop_id: uuid.UUID) -> list[SopVersionDTO]:
        return [SopVersionDTO.model_validate(v) for v in self._doc(sop_id).versions]

    def open(self, sop_id: uuid.UUID, version_no: int) -> tuple[SopVersion, BinaryIO]:
        row = self._version(sop_id, version_no)
        return row, get_storage(Bucket.SOP).open(row.storage_key)

    def delete(self, sop_id: uuid.UUID, actor: User) -> None:
        doc = self._doc(sop_id)
        keys = [v.storage_key for v in doc.versions]
        title = doc.title
        self.db.delete(doc)  # cascades to the version rows (loaded above)
        self._audit(actor, "sop.deleted", title)
        self.db.commit()
        self._delete_files(keys)

    def delete_version(self, sop_id: uuid.UUID, version_no: int, actor: User) -> None:
        doc = self._doc(sop_id)
        row = self._version(sop_id, version_no)
        key = row.storage_key
        title = doc.title
        if len(doc.versions) == 1:
            self.db.delete(doc)  # only version -> drop the whole doc (cascades)
        else:
            doc.versions.remove(row)  # delete-orphan; keeps the loaded collection fresh
        self._audit(actor, "sop.version_deleted", f"{title} v{version_no}")
        self.db.commit()
        self._delete_files([key])
