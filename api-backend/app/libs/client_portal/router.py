# api-backend/app/libs/client_portal/router.py
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.libs.auth.deps import get_current_client_user
from app.libs.client_portal.schemas import (
    ClientProfileDTO,
    ClientProfilePatch,
    PortfolioDTO,
    StoredFileDTO,
)
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


# ---- Profile (BE-2) ----
@router.get("/client/profile", response_model=ClientProfileDTO)
def get_profile(
    svc: Annotated[ClientPortalService, Depends(_service)],
    user: Annotated[User, Depends(get_current_client_user)],
) -> ClientProfileDTO:
    return svc.profile(user.id)


@router.patch("/client/profile", response_model=ClientProfileDTO)
def patch_profile(
    patch: ClientProfilePatch,
    svc: Annotated[ClientPortalService, Depends(_service)],
    user: Annotated[User, Depends(get_current_client_user)],
) -> ClientProfileDTO:
    return svc.update_profile(user.id, patch)


# ---- Portfolio (BE-3) ----
@router.get("/client/portfolio", response_model=PortfolioDTO)
def get_portfolio(
    svc: Annotated[ClientPortalService, Depends(_service)],
    user: Annotated[User, Depends(get_current_client_user)],
) -> PortfolioDTO:
    return svc.portfolio(user.id)


# ---- Documents (BE-7) ----
@router.get("/client/documents/{scope}", response_model=list[StoredFileDTO])
def list_client_documents(
    scope: str,
    svc: Annotated[ClientPortalService, Depends(_service)],
    user: Annotated[User, Depends(get_current_client_user)],
) -> list[StoredFileDTO]:
    return svc.list_documents(scope, user_id=user.id)


@router.get("/client/documents/{scope}/download")
def download_client_document(
    scope: str,
    key: str,
    svc: Annotated[ClientPortalService, Depends(_service)],
    user: Annotated[User, Depends(get_current_client_user)],
) -> StreamingResponse:
    stream, filename, content_type = svc.download_document(scope, key, user_id=user.id)
    return StreamingResponse(
        stream,
        media_type=content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
