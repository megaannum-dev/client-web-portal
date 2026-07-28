# api-backend/app/libs/client_portal/router.py
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.libs.auth.actions import Action
from app.libs.auth.deps import get_current_client_user, require_action
from app.libs.client_portal.schemas import (
    ClientProfileDTO,
    ClientProfilePatch,
    ClientRequestDTO,
    HistoryPointDTO,
    PortfolioDTO,
    RaiseTicketReq,
    RmTicketDTO,
    RmTicketStatusReq,
    StoredFileDTO,
)
from app.libs.client_portal.service import ClientPortalService
from app.libs.onboarding.schemas import ClientEventDTO, SubscriptionDTO
from app.libs.users.repository import AdminProfileRepository
from app.models.users import AdminRole, User

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


@router.get("/client/portfolio/history", response_model=list[HistoryPointDTO])
def get_portfolio_history(
    svc: Annotated[ClientPortalService, Depends(_service)],
    user: Annotated[User, Depends(get_current_client_user)],
    months: int = 6,
) -> list[HistoryPointDTO]:
    if not (1 <= months <= 24):
        raise HTTPException(422, "months must be between 1 and 24")
    return svc.portfolio_history(user.id, months)


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


# ---- Tickets (BE-12) ----
def _caller_role(
    user: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
    db: Annotated[Session, Depends(get_db)],
) -> AdminRole:
    """Same small local role lookup as onboarding/router.py's own
    _get_subscriptions_caller_role -- kept local rather than importing a
    private cross-package name (house convention)."""
    profile = AdminProfileRepository(db).get_by_user_id(user.id)
    return AdminRole(profile.role)  # type: ignore[union-attr]


@router.post("/client/tickets", response_model=ClientRequestDTO, status_code=201)
def raise_ticket(
    req: RaiseTicketReq,
    svc: Annotated[ClientPortalService, Depends(_service)],
    user: Annotated[User, Depends(get_current_client_user)],
) -> ClientRequestDTO:
    return svc.create_ticket(user.id, req)


@router.get("/rm/tickets", response_model=list[RmTicketDTO])
def list_rm_tickets(
    svc: Annotated[ClientPortalService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
    role: Annotated[AdminRole, Depends(_caller_role)],
) -> list[RmTicketDTO]:
    return svc.list_rm_tickets(rm_uid=user.firebase_uid, role=role)


@router.get("/rm/tickets/{ref}", response_model=RmTicketDTO)
def get_rm_ticket(
    ref: str,
    svc: Annotated[ClientPortalService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
    role: Annotated[AdminRole, Depends(_caller_role)],
) -> RmTicketDTO:
    return svc._require_rm_visible_ticket_dto(ref, rm_uid=user.firebase_uid, role=role)


@router.post("/rm/tickets/{ref}/status", response_model=RmTicketDTO)
def set_rm_ticket_status(
    ref: str,
    req: RmTicketStatusReq,
    svc: Annotated[ClientPortalService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
    role: Annotated[AdminRole, Depends(_caller_role)],
) -> RmTicketDTO:
    return svc.set_rm_ticket_status(ref, req, rm_uid=user.firebase_uid, role=role)
