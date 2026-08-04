from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.libs.auth.actions import Action
from app.libs.auth.deps import require_action
from app.libs.reconciliation.records import build_view
from app.models.users import User
from app.schemas.reconciliation import TradeRecordsViewOut

router = APIRouter(prefix="/mobo", tags=["mobo"])


@router.get("/trade-records", response_model=TradeRecordsViewOut)
def get_trade_records(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_action(Action.RECON_VIEW))],
    date: str | None = None,
) -> object:
    """Flat orders+executions spreadsheet for one day. Display only — no recon.

    `date` is a raw IB day token ('YYYYMMDD'), matched against the date prefix
    of `dateTime`. Omitted -> the latest day present. A day with no orders is
    an empty `rows` list, not a 404: "nothing traded" is a real answer.
    """
    if date is not None and (len(date) != 8 or not date.isdigit()):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "date must be a YYYYMMDD token")
    return build_view(db, date)
