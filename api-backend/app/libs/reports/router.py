# api-backend/app/libs/reports/router.py
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.libs.auth.actions import Action
from app.libs.auth.deps import get_current_admin_user, require_action
from app.libs.reports.schemas import EomCommentUpsertReq, EomReportCommentDTO
from app.libs.reports.service import EomReportCommentsService
from app.models.users import User

router = APIRouter(prefix="/reports", tags=["reports"])


def _service(db: Annotated[Session, Depends(get_db)]) -> EomReportCommentsService:
    return EomReportCommentsService(db)


@router.get("/eom-comments", response_model=list[EomReportCommentDTO])
def list_eom_comments(
    svc: Annotated[EomReportCommentsService, Depends(_service)],
    _: Annotated[User, Depends(get_current_admin_user)],
) -> list[EomReportCommentDTO]:
    return svc.list_comments()


@router.put("/eom-comments/{report_name}", response_model=EomReportCommentDTO)
def upsert_eom_comment(
    report_name: str,
    req: EomCommentUpsertReq,
    svc: Annotated[EomReportCommentsService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.EOM_COMMENT_MANAGE))],
) -> EomReportCommentDTO:
    return svc.upsert_comment(report_name, req.comment, actor=user.firebase_uid)
