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
    DocSpecDTO,
    DocumentDTO,
    OnboardingDTO,
    RejectReq,
    RmOptionDTO,
    StartOnboardingReq,
    SubscriptionDTO,
    VerdictReq,
)
from app.libs.onboarding.service import OnboardingService
from app.models.users import User

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
    _: Annotated[User, Depends(require_action(Action.ONBOARDING_MANAGE))],
    file: UploadFile = File(...),
) -> DocumentDTO:
    return svc.upload_document(
        onboarding_id,
        doc_type,
        stream=file.file,
        filename=file.filename or doc_type,
        content_type=file.content_type,
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
