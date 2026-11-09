# api-backend/app/libs/onboarding/router.py
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.libs.auth.actions import Action
from app.libs.auth.deps import get_current_admin_user, require_action
from app.libs.clients.repository import ClientRepository
from app.libs.identity.service import FirebaseIdentityService
from app.libs.onboarding.schemas import (
    AllotRdmptDTO,
    BoardDTO,
    ClientEventDTO,
    ClientSubscriptionsDTO,
    ContactLogEntryDTO,
    DocSpecDTO,
    DocumentDTO,
    OnboardingDTO,
    RedemptionDecisionReq,
    ReprovisionReq,
    ResubmitReq,
    RmOptionDTO,
    StartOnboardingReq,
    SubmitAllotmentReq,
    SubmitRedemptionReq,
    TransactionDetailDTO,
    TransactionDetailRequest,
    VerdictBatchReq,
)
from app.libs.onboarding.service import OnboardingService
from app.libs.users.repository import AdminProfileRepository
from app.models.users import AdminRole, User
from app.utils.filenames import fix_mojibake_filename

router = APIRouter(tags=["onboarding"])


def _service(db: Annotated[Session, Depends(get_db)]) -> OnboardingService:
    return OnboardingService(db)


def _get_subscriptions_caller_role(
    user: Annotated[User, Depends(get_current_admin_user)],
    db: Annotated[Session, Depends(get_db)],
) -> AdminRole:
    """A small local role-lookup dependency, mirroring clients/router.py's own
    _get_caller_role (that function is underscore-private to its module; rather
    than import a private name across packages, this router keeps its own copy
    of the same 3-line lookup -- one small extra query rather than changing a
    shared dependency's shape). Lookup only, no action check: every route that
    uses it carries its own require_action (CLIENT_* or ONBOARDING_*)."""
    profile = AdminProfileRepository(db).get_by_user_id(user.id)
    if profile is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No admin profile")
    return AdminRole(profile.role)


def _require_visible_client(
    db: Session, role: AdminRole, rm_uid: str, client_id: uuid.UUID
) -> None:
    """Scoped 404, not 403 -- a non-visible client is indistinguishable from an
    unknown one (same stance as the clients router and _require_rm_visible_ticket).
    Visibility is the D-4 book rule: ADMIN sees all, everyone else only the
    clients they serve as main or assistant RM."""
    if ClientRepository(db).get_profile_for_update(role, rm_uid, client_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")


def _require_visible_allotment(
    svc: OnboardingService, db: Session, role: AdminRole, rm_uid: str, allotment_id: uuid.UUID
) -> None:
    """Resolves the allotment's client, then applies the same book check. An
    unknown allotment keeps the service's own 404 message."""
    allotment = svc.repo.get_allotment(allotment_id)
    if allotment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown allotment/redemption")
    _require_visible_client(db, role, rm_uid, allotment.user_id)


def _require_visible_onboarding(
    svc: OnboardingService, db: Session, role: AdminRole, rm_uid: str, onboarding_id: uuid.UUID
) -> None:
    """Resolves the cycle's client, then applies the same book check. An
    unknown cycle keeps the service's own 404 message."""
    onboarding = svc.repo.get_by_id(onboarding_id)
    if onboarding is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown onboarding cycle")
    _require_visible_client(db, role, rm_uid, onboarding.user_id)


# ---- RM ---------------------------------------------------------------
@router.post("/rm/onboardings", response_model=OnboardingDTO, status_code=201)
def start_onboarding(
    req: StartOnboardingReq,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.ONBOARDING_WRITE))],
    settings: Annotated[Settings, Depends(get_settings)],
) -> OnboardingDTO:
    identity = FirebaseIdentityService(settings)
    return svc.start(req, caller_uid=user.firebase_uid, identity=identity, settings=settings)


@router.get("/rm/onboardings/rm-options", response_model=list[RmOptionDTO])
def get_rm_options(
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ONBOARDING_WRITE))],
) -> list[RmOptionDTO]:
    """Registered before /rm/onboardings/{onboarding_id} so "rm-options"
    isn't swallowed as a (then-invalid) onboarding_id path param."""
    return svc.rm_options()


@router.get("/rm/onboardings/doc-specs", response_model=list[DocSpecDTO])
def get_doc_specs(
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ONBOARDING_WRITE))],
) -> list[DocSpecDTO]:
    """Same registration-order reason as rm-options above. The single source
    of truth for the 7 required docs (compliance_doc_config.py), exposed so
    the "Start Onboarding" wizard's Documents step can render the real
    catalog before an onboarding_id exists, instead of a hardcoded copy."""
    return svc.doc_specs()


@router.get("/rm/onboardings", response_model=BoardDTO)
def get_board(
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.ONBOARDING_VIEW))],
    role: Annotated[AdminRole, Depends(_get_subscriptions_caller_role)],
) -> BoardDTO:
    return svc.board(role=role, rm_uid=user.firebase_uid)


@router.get("/rm/onboardings/by-client/{client_id}", response_model=OnboardingDTO)
def get_onboarding_by_client(
    client_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
    role: Annotated[AdminRole, Depends(_get_subscriptions_caller_role)],
    db: Annotated[Session, Depends(get_db)],
) -> OnboardingDTO:
    """Registered before /rm/onboardings/{onboarding_id} -- same registration-order
    reason as rm-options/doc-specs above ("by-client" would otherwise be swallowed
    as an invalid onboarding_id path param).

    Gated by CLIENT_VIEW, not an onboarding action -- its only caller is the
    client-info detail page's read-only KYC & Documents card (same reasoning as
    get_client_events_rm below): a user with client-info access but no onboarding
    grant still needs to see this client's document status."""
    _require_visible_client(db, role, user.firebase_uid, client_id)
    return svc.detail_by_client(client_id)


@router.get("/rm/clients/{client_id}/events", response_model=list[ClientEventDTO])
def get_client_events_rm(
    client_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
    role: Annotated[AdminRole, Depends(_get_subscriptions_caller_role)],
    db: Annotated[Session, Depends(get_db)],
) -> list[ClientEventDTO]:
    """Thin re-exposure of the existing client_events(user_id) -- client_id IS
    the user_id. Gated by CLIENT_VIEW (same action GET /rm/clients/{id}
    already requires), not the client's own token."""
    _require_visible_client(db, role, user.firebase_uid, client_id)
    return svc.client_events(client_id)


@router.get("/rm/clients/{client_id}/contact-logs", response_model=list[ContactLogEntryDTO])
def get_client_contact_logs(
    client_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
    role: Annotated[AdminRole, Depends(_get_subscriptions_caller_role)],
    db: Annotated[Session, Depends(get_db)],
) -> list[ContactLogEntryDTO]:
    _require_visible_client(db, role, user.firebase_uid, client_id)
    return svc.list_contact_logs(client_id)


@router.post(
    "/rm/clients/{client_id}/contact-logs",
    response_model=ContactLogEntryDTO,
    status_code=201,
)
async def create_client_contact_log(
    client_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.CLIENT_WRITE))],
    role: Annotated[AdminRole, Depends(_get_subscriptions_caller_role)],
    db: Annotated[Session, Depends(get_db)],
    topic: Annotated[str, Form()],
    channel: Annotated[str, Form()],
    occurred_at: Annotated[datetime, Form()],
    description: Annotated[str, Form()],
    interest: Annotated[str | None, Form()] = None,
    complaint: Annotated[str | None, Form()] = None,
    follow_up: Annotated[str | None, Form()] = None,
    file: UploadFile | None = File(None),
) -> ContactLogEntryDTO:
    _require_visible_client(db, role, user.firebase_uid, client_id)
    return svc.create_contact_log(
        client_id,
        caller_uid=user.firebase_uid,
        topic=topic,
        channel=channel,
        occurred_at=occurred_at,
        description=description,
        interest=interest,
        complaint=complaint,
        follow_up=follow_up,
        file=file,
    )


@router.get("/rm/clients/{client_id}/contact-logs/{log_id}/download")
def download_contact_log_attachment(
    client_id: uuid.UUID,
    log_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
    role: Annotated[AdminRole, Depends(_get_subscriptions_caller_role)],
    db: Annotated[Session, Depends(get_db)],
) -> StreamingResponse:
    _require_visible_client(db, role, user.firebase_uid, client_id)
    stream, filename, content_type = svc.download_contact_log_attachment(client_id, log_id)
    return StreamingResponse(
        stream,
        media_type=content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/rm/onboardings/{onboarding_id}", response_model=OnboardingDTO)
def get_onboarding_detail(
    onboarding_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.ONBOARDING_VIEW))],
    role: Annotated[AdminRole, Depends(_get_subscriptions_caller_role)],
    db: Annotated[Session, Depends(get_db)],
) -> OnboardingDTO:
    """Gated by ONBOARDING_VIEW, not WRITE -- this is the read the board's
    client panel calls (fetchOnboarding) to load a client's document rows.
    A VIEW-only user must be able to open the panel and see documents,
    same reasoning as get_board above; WRITE holders still resolve this
    action too (EDIT bucket is a superset of VIEW, § pages.py)."""
    _require_visible_onboarding(svc, db, role, user.firebase_uid, onboarding_id)
    return svc.detail(onboarding_id)


@router.post("/rm/onboardings/{onboarding_id}/documents/{doc_type}", response_model=DocumentDTO)
async def upload_document(
    onboarding_id: uuid.UUID,
    doc_type: str,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.ONBOARDING_WRITE))],
    role: Annotated[AdminRole, Depends(_get_subscriptions_caller_role)],
    db: Annotated[Session, Depends(get_db)],
    file: UploadFile = File(...),
) -> DocumentDTO:
    _require_visible_onboarding(svc, db, role, user.firebase_uid, onboarding_id)
    return svc.upload_document(
        onboarding_id,
        doc_type,
        stream=file.file,
        filename=fix_mojibake_filename(file.filename) or doc_type,
        content_type=file.content_type,
        caller_uid=user.firebase_uid,
    )


@router.post("/rm/onboardings/{onboarding_id}/submit", response_model=OnboardingDTO)
def submit_onboarding(
    onboarding_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.ONBOARDING_WRITE))],
    role: Annotated[AdminRole, Depends(_get_subscriptions_caller_role)],
    db: Annotated[Session, Depends(get_db)],
) -> OnboardingDTO:
    _require_visible_onboarding(svc, db, role, user.firebase_uid, onboarding_id)
    return svc.submit(onboarding_id)


@router.get("/rm/onboardings/{onboarding_id}/documents/{doc_type}/download")
def download_document_rm(
    onboarding_id: uuid.UUID,
    doc_type: str,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.ONBOARDING_VIEW))],
    role: Annotated[AdminRole, Depends(_get_subscriptions_caller_role)],
    db: Annotated[Session, Depends(get_db)],
) -> StreamingResponse:
    _require_visible_onboarding(svc, db, role, user.firebase_uid, onboarding_id)
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
    user: Annotated[User, Depends(require_action(Action.ONBOARDING_VIEW))],
    role: Annotated[AdminRole, Depends(_get_subscriptions_caller_role)],
    db: Annotated[Session, Depends(get_db)],
) -> StreamingResponse:
    _require_visible_onboarding(svc, db, role, user.firebase_uid, onboarding_id)
    stream, zip_name = svc.download_all_documents(onboarding_id)
    return StreamingResponse(
        stream,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_name}"'},
    )


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
    user: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
    role: Annotated[AdminRole, Depends(_get_subscriptions_caller_role)],
    db: Annotated[Session, Depends(get_db)],
) -> list[AllotRdmptDTO]:
    _require_visible_client(db, role, user.firebase_uid, client_id)
    return svc.client_allotments(client_id)


@router.post("/rm/allotment", response_model=AllotRdmptDTO, status_code=201)
def submit_allotment(
    req: SubmitAllotmentReq,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.CLIENT_WRITE))],
    role: Annotated[AdminRole, Depends(_get_subscriptions_caller_role)],
    db: Annotated[Session, Depends(get_db)],
) -> AllotRdmptDTO:
    _require_visible_client(db, role, user.firebase_uid, req.client_id)
    return svc.submit_allotment(req)


@router.post("/rm/redemption", response_model=AllotRdmptDTO, status_code=201)
def submit_redemption(
    req: SubmitRedemptionReq,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.CLIENT_WRITE))],
    role: Annotated[AdminRole, Depends(_get_subscriptions_caller_role)],
    db: Annotated[Session, Depends(get_db)],
) -> AllotRdmptDTO:
    _require_visible_client(db, role, user.firebase_uid, req.client_id)
    return svc.submit_redemption(req)


@router.post(
    "/rm/allotments/{allotment_id}/transaction-detail",
    response_model=TransactionDetailDTO,
    status_code=201,
)
def file_transaction_detail(
    allotment_id: uuid.UUID,
    req: TransactionDetailRequest,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.CLIENT_WRITE))],
    role: Annotated[AdminRole, Depends(_get_subscriptions_caller_role)],
    db: Annotated[Session, Depends(get_db)],
) -> TransactionDetailDTO:
    _require_visible_allotment(svc, db, role, user.firebase_uid, allotment_id)
    return svc.file_transaction_detail(allotment_id, req, filed_by=user.firebase_uid)


@router.get(
    "/rm/allotments/{allotment_id}/transaction-detail",
    response_model=TransactionDetailDTO,
)
def get_transaction_detail(
    allotment_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
    role: Annotated[AdminRole, Depends(_get_subscriptions_caller_role)],
    db: Annotated[Session, Depends(get_db)],
) -> TransactionDetailDTO:
    _require_visible_allotment(svc, db, role, user.firebase_uid, allotment_id)
    return svc.get_transaction_detail(allotment_id)


# ---- Compliance ---------------------------------------------------------
@router.get("/compliance/onboardings", response_model=list[OnboardingDTO])
def get_compliance_queue(
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.COMPLIANCE_WRITE))],
) -> list[OnboardingDTO]:
    return svc.compliance_queue()


@router.get("/compliance/onboardings/{onboarding_id}/documents/{doc_type}/download")
def download_document(
    onboarding_id: uuid.UUID,
    doc_type: str,
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.COMPLIANCE_WRITE))],
) -> StreamingResponse:
    stream, filename, content_type = svc.download_document(onboarding_id, doc_type)
    return StreamingResponse(
        stream,
        media_type=content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/compliance/onboardings/{onboarding_id}/documents/verdicts",
    response_model=list[DocumentDTO],
)
def submit_verdicts(
    onboarding_id: uuid.UUID,
    req: VerdictBatchReq,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.COMPLIANCE_WRITE))],
) -> list[DocumentDTO]:
    return svc.verdict_batch(onboarding_id, req, reviewer_uid=user.firebase_uid)


@router.post("/compliance/onboardings/{onboarding_id}/approve", response_model=OnboardingDTO)
def approve_onboarding(
    onboarding_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.COMPLIANCE_WRITE))],
    settings: Annotated[Settings, Depends(get_settings)],
) -> OnboardingDTO:
    identity = FirebaseIdentityService(settings)
    return svc.approve(
        onboarding_id, compliance_uid=user.firebase_uid, identity=identity, settings=settings
    )


@router.post(
    "/compliance/onboardings/{onboarding_id}/request-resubmit",
    response_model=OnboardingDTO,
)
def request_resubmit(
    onboarding_id: uuid.UUID,
    req: ResubmitReq,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.COMPLIANCE_WRITE))],
) -> OnboardingDTO:
    """Replaces the old /reject: a reviewed package with document issues goes
    back to the RM/client for a corrected submission -- see
    OnboardingService.request_resubmit."""
    return svc.request_resubmit(onboarding_id, req, requested_by=user.firebase_uid)


@router.post(
    "/compliance/onboardings/{onboarding_id}/request-reprovision",
    response_model=OnboardingDTO,
)
def request_reprovision(
    onboarding_id: uuid.UUID,
    req: ReprovisionReq,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.COMPLIANCE_WRITE))],
) -> OnboardingDTO:
    """Ad-hoc counterpart to the scheduler's periodic renewal sweep: sends an
    ACTIVE client back to pending_review instantly, for any set of KYC
    documents Compliance wants a fresh copy of -- see
    OnboardingService.request_reprovision."""
    return svc.request_reprovision(onboarding_id, req, requested_by=user.firebase_uid)


# ---- PM ------------------------------------------------------------------
@router.get("/pm/allotments", response_model=list[AllotRdmptDTO])
def get_allotments(
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ALLOTMENT_VIEW))],
) -> list[AllotRdmptDTO]:
    return svc.list_allotments()


@router.post("/pm/allotments/{allotment_id}/acknowledge", response_model=AllotRdmptDTO)
def acknowledge_allotment(
    allotment_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.ALLOTMENT_ACKNOWLEDGE))],
) -> AllotRdmptDTO:
    return svc.acknowledge_allotment(allotment_id, acked_by=user.firebase_uid)


@router.post("/pm/redemptions/{allotment_id}/decide", response_model=AllotRdmptDTO)
def pm_decide_redemption(
    allotment_id: uuid.UUID,
    req: RedemptionDecisionReq,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.ALLOTMENT_ACKNOWLEDGE))],
) -> AllotRdmptDTO:
    return svc.pm_decide_redemption(allotment_id, req, decided_by=user.firebase_uid)


@router.post("/co/redemptions/{allotment_id}/decide", response_model=AllotRdmptDTO)
def co_decide_redemption(
    allotment_id: uuid.UUID,
    req: RedemptionDecisionReq,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.COMPLIANCE_WRITE))],
) -> AllotRdmptDTO:
    return svc.co_decide_redemption(allotment_id, req, decided_by=user.firebase_uid)


@router.get("/co/redemptions", response_model=list[AllotRdmptDTO])
def get_co_redemptions(
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.COMPLIANCE_WRITE))],
) -> list[AllotRdmptDTO]:
    return svc.list_allotments()
