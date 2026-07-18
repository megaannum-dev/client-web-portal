from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.libs.dev.service import dev_register
from app.models.users import User
from app.schemas.dev import DevRegisterIn
from app.schemas.users import UserOut

router = APIRouter(prefix="/dev", tags=["dev"])


@router.post("/register", response_model=UserOut, status_code=201)
def register(
    body: DevRegisterIn,
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    return dev_register(body, db, settings)
