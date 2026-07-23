# api-backend/app/libs/onboarding/router.py
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.libs.auth.actions import Action
from app.libs.auth.deps import get_current_client_user, require_action
from app.libs.identity.service import FirebaseIdentityService
from app.libs.onboarding.schemas import (
    AllotRdmptDTO,
    BoardDTO,
    ClientEventDTO,
    ClientSubscriptionsDTO,
    DocSpecDTO,
    DocumentDTO,
    OnboardingDTO,
    RedemptionDecisionReq,
    RejectReq,
    RmOptionDTO,
    StartOnboardingReq,
    SubmitAllotmentReq,
    SubmitRedemptionReq,
    SubscriptionDTO,
    VerdictReq,
)
from app.libs.onboarding.service import OnboardingService
from app.libs.users.repository import AdminProfileRepository
from app.models.users import AdminRole, User

router = APIRouter(tags=["onboarding"])


def _service(db: Annotated[Session, Depends(get_db)]) -> OnboardingService:
    return OnboardingService(db)


# ---- RM ---------------------------------------------------------------
@router.post("/rm/onboardings", response_model=OnboardingDTO, status_code=201)
def start_onboarding(
    req: StartOnboardingReq,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.ONBOARDING_MANAGE))],
    settings: Annotated[Settings, Depends(get_settings)],
) -> OnboardingDTO:
    identity = FirebaseIdentityService(settings)
    return svc.start(req, caller_uid=user.firebase_uid, identity=identity, settings=settings)


@router.get("/rm/onboardings/rm-options", response_model=list[RmOptionDTO])
def get_rm_options(
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.ONBOARDING_MANAGE))],
) -> list[RmOptionDTO]:
    """Registered before /rm/onboardings/{onboarding_id} so "rm-options"
    isn't swallowed as a (then-invalid) onboarding_id path param."""
    return svc.rm_options(caller_uid=user.firebase_uid)


@router.get("/rm/onboardings/doc-specs", response_model=list[DocSpecDTO])
def get_doc_specs(
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ONBOARDING_MANAGE))],
) -> list[DocSpecDTO]:
    """Same registration-order reason as rm-options above. The single source
    of truth for the 7 required docs (compliance_doc_config.py), exposed so
    the "Start Onboarding" wizard's Documents step can render the real
    catalog before an onboarding_id exists, instead of a hardcoded copy."""
    return svc.doc_specs()


@router.get("/rm/onboardings", response_model=BoardDTO)
def get_board(
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ONBOARDING_MANAGE))],
) -> BoardDTO:
    return svc.board()


@router.get("/rm/onboardings/by-client/{client_id}", response_model=OnboardingDTO)
def get_onboarding_by_client(
    client_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ONBOARDING_MANAGE))],
) -> OnboardingDTO:
    """Registered before /rm/onboardings/{onboarding_id} -- same registration-order
    reason as rm-options/doc-specs above ("by-client" would otherwise be swallowed
    as an invalid onboarding_id path param)."""
    return svc.detail_by_client(client_id)


@router.get("/rm/clients/{client_id}/events", response_model=list[ClientEventDTO])
def get_client_events_rm(
    client_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
) -> list[ClientEventDTO]:
    """Thin re-exposure of the existing client_events(user_id) -- client_id IS
    the user_id. Gated by CLIENT_VIEW (same action GET /rm/clients/{id}
    already requires), not the client's own token."""
    return svc.client_events(client_id)


@router.get("/rm/onboardings/{onboarding_id}", response_model=OnboardingDTO)
def get_onboarding_detail(
    onboarding_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ONBOARDING_MANAGE))],
) -> OnboardingDTO:
    return svc.detail(onboarding_id)


@router.post("/rm/onboardings/{onboarding_id}/documents/{doc_type}", response_model=DocumentDTO)
async def upload_document(
    onboarding_id: uuid.UUID,
    doc_type: str,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.ONBOARDING_MANAGE))],
    file: UploadFile = File(...),
) -> DocumentDTO:
    return svc.upload_document(
        onboarding_id,
        doc_type,
        stream=file.file,
        filename=file.filename or doc_type,
        content_type=file.content_type,
        caller_uid=user.firebase_uid,
    )


@router.post("/rm/onboardings/{onboarding_id}/submit", response_model=OnboardingDTO)
def submit_onboarding(
    onboarding_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ONBOARDING_MANAGE))],
) -> OnboardingDTO:
    return svc.submit(onboarding_id)


@router.get("/rm/onboardings/{onboarding_id}/documents/{doc_type}/download")
def download_document_rm(
    onboarding_id: uuid.UUID,
    doc_type: str,
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ONBOARDING_MANAGE))],
) -> StreamingResponse:
    stream, filename, content_type = svc.download_document(onboarding_id, doc_type)
    return StreamingResponse(
        stream,
        media_type=content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/rm/onboardings/{onboarding_id}/documents/download-all")
def download_all_documents(
    onboarding_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ONBOARDING_MANAGE))],
) -> StreamingResponse:
    stream, zip_name = svc.download_all_documents(onboarding_id)
    return StreamingResponse(
        stream,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_name}"'},
    )


def _get_subscriptions_caller_role(
    user: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
    db: Annotated[Session, Depends(get_db)],
) -> AdminRole:
    """A small local role-lookup dependency, mirroring clients/router.py's own
    _get_caller_role (that function is underscore-private to its module; rather
    than import a private name across packages, this router keeps its own copy
    of the same 3-line lookup -- one small extra query rather than changing a
    shared dependency's shape)."""
    profile = AdminProfileRepository(db).get_by_user_id(user.id)
    return AdminRole(profile.role)  # type: ignore[union-attr]


@router.get("/rm/subscriptions", response_model=list[ClientSubscriptionsDTO])
def list_subscriptions(
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
    role: Annotated[AdminRole, Depends(_get_subscriptions_caller_role)],
) -> list[ClientSubscriptionsDTO]:
    return svc.list_subscriptions(role=role, rm_uid=user.firebase_uid)


@router.get("/rm/subscriptions/{client_id}/allotments", response_model=list[AllotRdmptDTO])
def list_client_allotments(
    client_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
) -> list[AllotRdmptDTO]:
    return svc.client_allotments(client_id)


@router.post("/rm/allotment", response_model=AllotRdmptDTO, status_code=201)
def submit_allotment(
    req: SubmitAllotmentReq,
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
) -> AllotRdmptDTO:
    return svc.submit_allotment(req)


@router.post("/rm/redemption", response_model=AllotRdmptDTO, status_code=201)
def submit_redemption(
    req: SubmitRedemptionReq,
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
) -> AllotRdmptDTO:
    return svc.submit_redemption(req)


# ---- Compliance ---------------------------------------------------------
@router.get("/compliance/onboardings", response_model=list[OnboardingDTO])
def get_compliance_queue(
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ONBOARDING_REVIEW))],
) -> list[OnboardingDTO]:
    return svc.compliance_queue()


@router.get("/compliance/onboardings/{onboarding_id}/documents/{doc_type}/download")
def download_document(
    onboarding_id: uuid.UUID,
    doc_type: str,
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ONBOARDING_REVIEW))],
) -> StreamingResponse:
    stream, filename, content_type = svc.download_document(onboarding_id, doc_type)
    return StreamingResponse(
        stream,
        media_type=content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/compliance/onboardings/{onboarding_id}/documents/{doc_type}/verdict",
    response_model=DocumentDTO,
)
def submit_verdict(
    onboarding_id: uuid.UUID,
    doc_type: str,
    req: VerdictReq,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.ONBOARDING_REVIEW))],
) -> DocumentDTO:
    return svc.verdict(onboarding_id, doc_type, req, reviewer_uid=user.firebase_uid)


@router.post("/compliance/onboardings/{onboarding_id}/approve", response_model=OnboardingDTO)
def approve_onboarding(
    onboarding_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.ONBOARDING_REVIEW))],
) -> OnboardingDTO:
    return svc.approve(onboarding_id, compliance_uid=user.firebase_uid)


@router.post("/compliance/onboardings/{onboarding_id}/reject", response_model=OnboardingDTO)
def reject_onboarding(
    onboarding_id: uuid.UUID,
    req: RejectReq,
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ONBOARDING_REVIEW))],
) -> OnboardingDTO:
    return svc.reject(onboarding_id, req)


# ---- PC ------------------------------------------------------------------
@router.get("/pc/allotments", response_model=list[AllotRdmptDTO])
def get_allotments(
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ALLOTMENT_ACKNOWLEDGE))],
) -> list[AllotRdmptDTO]:
    return svc.list_allotments()


@router.post("/pc/allotments/{allotment_id}/acknowledge", response_model=AllotRdmptDTO)
def acknowledge_allotment(
    allotment_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.ALLOTMENT_ACKNOWLEDGE))],
) -> AllotRdmptDTO:
    return svc.acknowledge_allotment(allotment_id, acked_by=user.firebase_uid)


@router.post("/pc/redemptions/{allotment_id}/decide", response_model=AllotRdmptDTO)
def pc_decide_redemption(
    allotment_id: uuid.UUID,
    req: RedemptionDecisionReq,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.ALLOTMENT_ACKNOWLEDGE))],
) -> AllotRdmptDTO:
    return svc.pc_decide_redemption(allotment_id, req, decided_by=user.firebase_uid)


@router.post("/co/redemptions/{allotment_id}/decide", response_model=AllotRdmptDTO)
def co_decide_redemption(
    allotment_id: uuid.UUID,
    req: RedemptionDecisionReq,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.ONBOARDING_REVIEW))],
) -> AllotRdmptDTO:
    return svc.co_decide_redemption(allotment_id, req, decided_by=user.firebase_uid)


@router.get("/co/redemptions", response_model=list[AllotRdmptDTO])
def get_co_redemptions(
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ONBOARDING_REVIEW))],
) -> list[AllotRdmptDTO]:
    return svc.list_allotments()


# ---- Client ---------------------------------------------------------------
@router.get("/client/subscriptions", response_model=list[SubscriptionDTO])
def get_client_subscriptions(
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(get_current_client_user)],
) -> list[SubscriptionDTO]:
    return svc.client_subscriptions(user.id)


@router.get("/client/events", response_model=list[ClientEventDTO])
def get_client_events(
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(get_current_client_user)],
) -> list[ClientEventDTO]:
    return svc.client_events(user.id)
