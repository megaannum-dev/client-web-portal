from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.libs.auth.actions import Action
from app.libs.auth.deps import require_action
from app.libs.eod.service import EodService
from app.models.users import User
from app.schemas.eod import EodReportViewOut, EodSignOffReq

router = APIRouter(prefix="/mobo", tags=["mobo"])


def _service(db: Annotated[Session, Depends(get_db)]) -> EodService:
    return EodService(db)


@router.get("/eod", response_model=EodReportViewOut)
def get_eod(
    svc: Annotated[EodService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.RECON_VIEW))],
    trade_date: str | None = None,
) -> EodReportViewOut:
    return svc.build_day_view(trade_date)


@router.post("/eod/sign-off", response_model=EodReportViewOut)
def sign_off_eod(
    req: EodSignOffReq,
    svc: Annotated[EodService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.EOD_SIGNOFF))],
) -> EodReportViewOut:
    return svc.sign_off(req.tradeDate, signed_off_by=user.firebase_uid)


@router.get("/eod/export")
def export_eod(
    svc: Annotated[EodService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.RECON_VIEW))],
    trade_date: str | None = None,
) -> StreamingResponse:
    stream, filename = svc.export(trade_date)
    return StreamingResponse(
        stream,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
