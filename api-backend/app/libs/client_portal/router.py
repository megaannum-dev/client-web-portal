# api-backend/app/libs/client_portal/router.py
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.libs.auth.deps import get_current_client_user
from app.libs.client_portal.service import ClientPortalService
from app.libs.onboarding.schemas import ClientEventDTO, SubscriptionDTO
from app.models.users import User

router = APIRouter(tags=["client_portal"])


def _service(db: Annotated[Session, Depends(get_db)]) -> ClientPortalService:
    return ClientPortalService(db)


# ---- relocated unchanged from onboarding/router.py (A'): identical paths ----
@router.get("/client/subscriptions", response_model=list[SubscriptionDTO])
def get_client_subscriptions(
    svc: Annotated[ClientPortalService, Depends(_service)],
    user: Annotated[User, Depends(get_current_client_user)],
) -> list[SubscriptionDTO]:
    return svc.onboarding.client_subscriptions(user.id)


@router.get("/client/events", response_model=list[ClientEventDTO])
def get_client_events(
    svc: Annotated[ClientPortalService, Depends(_service)],
    user: Annotated[User, Depends(get_current_client_user)],
) -> list[ClientEventDTO]:
    return svc.onboarding.client_events(user.id)
