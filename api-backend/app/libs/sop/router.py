# api-backend/app/libs/sop/router.py
from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.libs.auth.actions import Action
from app.libs.auth.deps import require_action
from app.libs.sop.schemas import SopDocumentDTO, SopUpdate, SopVersionDTO
from app.libs.sop.service import SopService
from app.models.sop import SopCategory
from app.models.users import User

router = APIRouter(prefix="/sop", tags=["sop"])


def _service(db: Annotated[Session, Depends(get_db)]) -> SopService:
    return SopService(db)


Svc = Annotated[SopService, Depends(_service)]
Viewer = Annotated[User, Depends(require_action(Action.SOP_VIEW))]
Writer = Annotated[User, Depends(require_action(Action.SOP_WRITE))]


Month = Annotated[str | None, Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]


def _ym(month: str | None) -> tuple[int, int]:
    if month is None:
        today = date.today()
        return today.year, today.month
    y, m = month.split("-")
    return int(y), int(m)


@router.get("", response_model=list[SopDocumentDTO])
def list_sops(
    svc: Svc, _: Viewer, category: SopCategory | None = None, month: Month = None
) -> list[SopDocumentDTO]:
    return svc.list(category, *_ym(month))


@router.post("", response_model=SopDocumentDTO, status_code=201)
def create_sop(
    svc: Svc,
    user: Writer,
    file: UploadFile = File(...),
    title: str = Form(...),
    category: SopCategory = Form(...),
    change_note: str | None = Form(None),
    starts_at: str | None = Form(None),
    ends_at: str | None = Form(None),
) -> SopDocumentDTO:
    return svc.create(
        file, title, category, change_note, actor=user, starts_at=starts_at, ends_at=ends_at
    )


@router.post("/{sop_id}/versions", response_model=SopVersionDTO, status_code=201)
def add_version(
    sop_id: uuid.UUID,
    svc: Svc,
    user: Writer,
    file: UploadFile = File(...),
    change_note: str | None = Form(None),
) -> SopVersionDTO:
    return svc.add_version(sop_id, file, change_note, actor=user)


@router.get("/{sop_id}", response_model=SopDocumentDTO)
def get_sop(sop_id: uuid.UUID, svc: Svc, _: Viewer, month: Month = None) -> SopDocumentDTO:
    return svc.get(sop_id, *_ym(month))


@router.patch("/{sop_id}",response_model=SopDocumentDTO)
def update_sop(sop_id: uuid.UUID, body: SopUpdate, svc: Svc, user: Writer) -> SopDocumentDTO:
    return svc.update(sop_id, body, actor=user)


@router.get("/{sop_id}/versions", response_model=list[SopVersionDTO])
def list_versions(sop_id: uuid.UUID, svc: Svc, _: Viewer) -> list[SopVersionDTO]:
    return svc.versions(sop_id)


@router.get("/{sop_id}/versions/{version_no}/download")
def download_version(
    sop_id: uuid.UUID, version_no: int, svc: Svc, _: Viewer
) -> StreamingResponse:
    row, stream = svc.open(sop_id, version_no)
    # `attachment`, never `inline` -- .md served inline would be stored-XSS on
    # the API origin. Same guard as chat/router.py:104-118.
    return StreamingResponse(
        stream,
        media_type=row.content_type,
        # RFC 5987 `filename*` -- a non-latin-1 name in a plain `filename=` 500s in Starlette.
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(row.filename)}"},
    )


@router.delete("/{sop_id}", status_code=204)
def delete_sop(sop_id: uuid.UUID, svc: Svc, user: Writer) -> Response:
    svc.delete(sop_id, actor=user)
    return Response(status_code=204)


@router.delete("/{sop_id}/versions/{version_no}", status_code=204)
def delete_version(sop_id: uuid.UUID, version_no: int, svc: Svc, user: Writer) -> Response:
    svc.delete_version(sop_id, version_no, actor=user)
    return Response(status_code=204)
