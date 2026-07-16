from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.libs.auth.actions import Action
from app.libs.auth.deps import require_action
from app.libs.reconciliation.engine import reconcile
from app.libs.reconciliation.presenter import to_wire
from app.models.recon import ReconSession
from app.models.users import User
from app.schemas.reconciliation import ReconciliationFlowViewOut

router = APIRouter(prefix="/mobo", tags=["mobo"])


def _resolve_session(db: Session, session_id: uuid.UUID | None) -> ReconSession:
    if session_id is not None:
        session = db.get(ReconSession, session_id)
        if session is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown reconciliation session")
        return session
    session = (
        db.query(ReconSession)
        .order_by(ReconSession.trade_date.desc(), ReconSession.created_at.desc())
        .first()
    )
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No reconciliation sessions exist yet")
    return session


@router.get("/reconciliation", response_model=ReconciliationFlowViewOut)
def get_reconciliation(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_action(Action.RECON_VIEW))],
    session_id: uuid.UUID | None = None,
) -> object:
    session = _resolve_session(db, session_id)
    try:
        result = reconcile(db, session.id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return to_wire(db, session, result)
