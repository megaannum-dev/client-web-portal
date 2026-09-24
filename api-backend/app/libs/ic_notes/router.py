# api-backend/app/libs/ic_notes/router.py
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.libs.auth.actions import Action
from app.libs.auth.deps import require_action
from app.libs.ic_notes.schemas import IcNoteDTO
from app.libs.ic_notes.service import IcNotesService
from app.models.users import User

router = APIRouter(prefix="/ic-notes", tags=["ic-notes"])


def _service(db: Annotated[Session, Depends(get_db)]) -> IcNotesService:
    return IcNotesService(db)


@router.get("", response_model=list[IcNoteDTO])
def list_notes(
    svc: Annotated[IcNotesService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.IC_NOTES_VIEW))],
) -> list[IcNoteDTO]:
    return svc.list()


@router.post("", response_model=IcNoteDTO, status_code=201)
def upload_note(
    svc: Annotated[IcNotesService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.IC_NOTES_WRITE))],
    file: UploadFile = File(...),
    title: str = Form(...),
    meeting_at: datetime = Form(...),
) -> IcNoteDTO:
    return svc.upload(file, title, meeting_at, actor=user)


@router.get("/{note_id}/download")
def download_note(
    note_id: uuid.UUID,
    svc: Annotated[IcNotesService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.IC_NOTES_VIEW))],
) -> StreamingResponse:
    row, stream = svc.open(note_id)
    # `attachment`, never `inline` -- .md served inline would be stored-XSS on
    # the API origin. Same guard as chat/router.py:104-118.
    return StreamingResponse(
        stream,
        media_type=row.content_type,
        # RFC 5987 `filename*` -- a non-latin-1 name in a plain `filename=` 500s in Starlette.
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(row.filename)}"},
    )
