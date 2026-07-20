# api-backend/app/libs/onboarding/service.py
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from typing import BinaryIO

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.libs.clients.service import ClientService
from app.libs.identity.service import FirebaseIdentityService
from app.libs.onboarding.compliance_doc_config import get_doc_spec
from app.libs.onboarding.repository import OnboardingRepository
from app.libs.onboarding.schemas import (
    AllotRdmptDTO,
    BoardDTO,
    ClientEventDTO,
    DocumentDTO,
    OnboardingDTO,
    RejectReq,
    RmOptionDTO,
    StartOnboardingReq,
    SubscriptionDTO,
    VerdictReq,
)
from app.libs.trade_models.storage import get_storage
from app.libs.users.repository import AdminProfileRepository
from app.models.onboarding import (
    AllotRdmpStatus,
    ClientAllotmentRedemption,
    ClientOnboarding,
    DocStatus,
    OnboardingDocument,
    OnboardingKind,
    OnboardingStatus,
)
from app.models.pc import Model
from app.models.users import AccountStatus, AdminRole, ClientProfile, User

_CAN_REUPLOAD_STATUSES = {"not_started", "uploaded", "rejected", "expired"}

# Widened 2026-07-20 (D-9/C-7): settlement lag used to compute
# client_allotment_redemptions.expected_cash_in at approve. Same os.getenv(...)
# convention as onboarding/scheduler.py's _RENEWAL_LOOKAHEAD_DAYS.
ONBOARDING_SETTLEMENT_DAYS = max(0, int(os.getenv("ONBOARDING_SETTLEMENT_DAYS", "5")))


class OnboardingService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = OnboardingRepository(db)

    # ---- RM: start / documents / submit -----------------------------------
    def start(
        self,
        req: StartOnboardingReq,
        *,
        caller_uid: str,
        identity: FirebaseIdentityService,
        settings,
    ) -> OnboardingDTO:
        """Delegates client(user+profile) creation to the EXISTING ClientService.onboard
        path (proposal § Layer 2 §A) -- this method adds only the onboarding
        cycle + 7 doc rows on top, inside its own commit."""
        client_service = ClientService(self.db)
        staged_user, _invite_link = client_service.onboard(
            caller_uid=caller_uid,
            email=req.email,
            name=req.client_name,
            assigned_rm_uid=self._resolve_rm_override(req.assigned_rm_uid, caller_uid=caller_uid),
            identity=identity,
            settings=settings,
            primary_phone=req.primary_phone,
            address=req.address,
            country_of_residence=req.country_of_residence,
            ib_account=req.ibhk_account,
        )
        model = self.db.get(Model, req.model_id)
        if model is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown model_id")
        try:
            onboarding = self.repo.create_cycle(
                user_id=staged_user.id,
                model_id=req.model_id,
                units=req.units,
                mgmt_fee=req.mgmt_fee,
                incentive_fee=req.incentive_fee,
                ibhk_account=req.ibhk_account,
                sw_account=req.sw_account,
                id_type=req.id_type,
                id_number=req.id_number,
            )
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return self._to_dto(onboarding, with_documents=True)

    def _resolve_rm_override(self, requested_rm_uid: str | None, *, caller_uid: str) -> str:
        """ADMIN-only "Assigned RM" override: any other role gets pinned to
        itself no matter what the request body claims (defence in depth --
        the FE only shows the picker to ADMIN, but the API can't trust that)."""
        if not requested_rm_uid:
            return caller_uid
        caller = self.db.query(User).filter(User.firebase_uid == caller_uid).one_or_none()
        profile = AdminProfileRepository(self.db).get_by_user_id(caller.id) if caller else None
        if profile is None or profile.role != AdminRole.ADMIN:
            return caller_uid
        return requested_rm_uid

    def rm_options(self) -> list[RmOptionDTO]:
        return [RmOptionDTO(uid=uid, name=name) for uid, name in self.repo.list_rm_options()]

    def upload_document(
        self,
        onboarding_id: uuid.UUID,
        doc_type: str,
        *,
        stream: BinaryIO,
        filename: str,
        content_type: str | None,
    ) -> DocumentDTO:
        doc = self._require_document(onboarding_id, doc_type)
        if doc.status not in _CAN_REUPLOAD_STATUSES:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "Document cannot be reuploaded in its current status"
            )
        storage_key = get_storage().save(stream, suggested_name=filename, content_type=content_type)
        self.repo.upload_document(
            doc, storage_key=storage_key, filename=filename, content_type=content_type
        )
        self.db.commit()
        return self._doc_to_dto(doc)

    def submit(self, onboarding_id: uuid.UUID) -> OnboardingDTO:
        onboarding = self._require_onboarding(onboarding_id)
        docs = self.repo.documents_for(onboarding_id)
        missing = [
            d for d in docs if get_doc_spec(d.doc_type).required and d.status == "not_started"
        ]
        if missing:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "All required documents must be uploaded before submitting",
            )

        onboarding.status = OnboardingStatus.REVIEWING
        onboarding.submitted_at = datetime.utcnow()
        self.repo.bump_all_to_in_review(onboarding_id)
        self.db.commit()
        return self._to_dto(onboarding, with_documents=True)

    # ---- Compliance: verdict / approve / reject ----------------------------
    def verdict(
        self, onboarding_id: uuid.UUID, doc_type: str, req: VerdictReq, *, reviewer_uid: str
    ) -> DocumentDTO:
        onboarding = self._require_onboarding(onboarding_id)
        if onboarding.status != "reviewing":
            raise HTTPException(status.HTTP_409_CONFLICT, "Cycle is not under review")
        doc = self._require_document(onboarding_id, doc_type)
        new_status = DocStatus.VERIFIED if req.verdict == "valid" else DocStatus.REJECTED
        self.repo.set_verdict(doc, status=new_status, reviewed_by=reviewer_uid, note=req.note)
        self.db.commit()
        return self._doc_to_dto(doc)

    def approve(self, onboarding_id: uuid.UUID, *, compliance_uid: str) -> OnboardingDTO:
        """Atomic, kind-branched. See § Layer 2 §B / §C-2. Single commit for the
        whole branch; any failure rolls back the entire set of writes."""
        onboarding = self._require_onboarding(onboarding_id)
        if onboarding.status != "reviewing":
            raise HTTPException(status.HTTP_409_CONFLICT, "Cycle is not under review")
        docs = self.repo.documents_for(onboarding_id)
        unverified = [
            d for d in docs if get_doc_spec(d.doc_type).required and d.status != "verified"
        ]
        if unverified:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "Every required document must be verified before approval"
            )

        try:
            if onboarding.kind == "initial":
                self._approve_initial(onboarding, compliance_uid=compliance_uid)
            else:  # "renewal"
                self._approve_renewal(onboarding)
            onboarding.status = OnboardingStatus.ACTIVE
            onboarding.decided_at = datetime.utcnow()
            onboarding.reject_reason = None
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return self._to_dto(onboarding, with_documents=True)

    def _approve_initial(self, onboarding: ClientOnboarding, *, compliance_uid: str) -> None:
        """(1) READ agg_before -- MUST happen before the client_subscriptions
        upsert below (widened 2026-07-20, C-2/C-7): reading it after would
        double-count this client's own new row; (2) upsert client_subscriptions
        w/ fee-override compare-and-set (C-5); (3) insert
        client_allotment_redemptions (pending, kind=allotment,
        agg_before/agg_after/expected_cash_in snapshotted here); (4)
        users.status -> active; (5) insert client_events row.
        source_onboarding_id UNIQUE is the DB-enforced guarantee (DB B-3) --
        this method does not itself re-check for a prior allotment; a bug here
        surfaces as an IntegrityError, not a silent duplicate."""
        model = self.db.get(Model, onboarding.model_id)
        assert model is not None
        mgmt_override = None if model.mgmt_fee == onboarding.mgmt_fee else onboarding.mgmt_fee
        incentive_override = (
            None if model.incentive_fee == onboarding.incentive_fee else onboarding.incentive_fee
        )

        # ORDERING: read before upsert -- see docstring.
        agg_before = self.repo.sum_subscription_multiplier(onboarding.model_id)
        agg_after = agg_before + onboarding.multiplier
        expected_cash_in = datetime.utcnow() + timedelta(days=ONBOARDING_SETTLEMENT_DAYS)

        self.repo.upsert_subscription(
            user_id=onboarding.user_id,
            model_id=onboarding.model_id,
            multiplier=onboarding.multiplier,
            mgmt_fee_override=mgmt_override,
            incentive_fee_override=incentive_override,
        )
        self.repo.create_allotment(
            user_id=onboarding.user_id,
            model_id=onboarding.model_id,
            multiplier=onboarding.multiplier,
            source_onboarding_id=onboarding.id,
            agg_before=agg_before,
            agg_after=agg_after,
            expected_cash_in=expected_cash_in,
        )
        user = self.db.get(User, onboarding.user_id)
        assert user is not None
        user.status = AccountStatus.ACTIVE
        user.authorized_by = compliance_uid
        self.repo.create_event(
            user_id=onboarding.user_id,
            category="Account Notification",
            title="Subscription active",
            body=f"Your subscription to {model.name} is now active.",
        )

    def _approve_renewal(self, onboarding: ClientOnboarding) -> None:
        """No subscription/allotment/users.status writes -- see § Layer 2 §B:
        a renewal re-verifies documents, it does not re-allot or re-activate."""
        self.repo.create_event(
            user_id=onboarding.user_id,
            category="Account Notification",
            title="Periodic review complete",
            body="Your periodic KYC review is complete.",
        )

    def reject(self, onboarding_id: uuid.UUID, req: RejectReq) -> OnboardingDTO:
        onboarding = self._require_onboarding(onboarding_id)
        if onboarding.status != "reviewing":
            raise HTTPException(status.HTTP_409_CONFLICT, "Cycle is not under review")

        onboarding.status = OnboardingStatus.PENDING_REVIEW
        onboarding.decided_at = datetime.utcnow()
        onboarding.reject_reason = req.reason
        self.db.commit()
        return self._to_dto(onboarding, with_documents=True)

    # ---- Scheduler hook (BE-7 calls this) ----------------------------------
    def reopen_for_renewal(
        self, user_id: uuid.UUID, *, due_docs: list[OnboardingDocument], reason: str
    ) -> None:
        onboarding = self.repo.get_by_user_id(user_id)
        if onboarding is None or onboarding.status != "active":
            return  # duplicate guard -- a row already off "active" has a renewal in flight
        onboarding.kind = OnboardingKind.RENEWAL
        onboarding.status = OnboardingStatus.PENDING_REVIEW
        onboarding.reject_reason = reason
        for doc in due_docs:
            self.repo.reset_for_reupload(doc)
        self.db.commit()

    # ---- Board / list reads -------------------------------------------------
    def board(self) -> BoardDTO:
        buckets = self.repo.board()
        return BoardDTO(**{k: [self._to_dto(o) for o in v] for k, v in buckets.items()})

    def compliance_queue(self) -> list[OnboardingDTO]:
        return [self._to_dto(o, with_documents=True) for o in self.repo.compliance_queue()]

    def detail(self, onboarding_id: uuid.UUID) -> OnboardingDTO:
        return self._to_dto(self._require_onboarding(onboarding_id), with_documents=True)

    def download_document(
        self, onboarding_id: uuid.UUID, doc_type: str
    ) -> tuple[BinaryIO, str, str | None]:
        doc = self._require_document(onboarding_id, doc_type)
        if doc.storage_key is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No file uploaded for this document")
        stream = get_storage().open(doc.storage_key)
        return stream, doc.filename or doc.doc_type, doc.content_type

    # ---- PC: allotments -----------------------------------------------------
    def list_allotments(self) -> list[AllotRdmptDTO]:
        return [self._allotment_to_dto(a) for a in self.repo.list_allotments()]

    def acknowledge_allotment(self, allotment_id: uuid.UUID, *, acked_by: str) -> AllotRdmptDTO:
        allotment = self.repo.get_allotment(allotment_id)
        if allotment is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown allotment")
        if allotment.status != "pending":
            raise HTTPException(status.HTTP_409_CONFLICT, "Allotment already acknowledged")

        allotment.status = AllotRdmpStatus.ACKNOWLEDGED
        allotment.acknowledged_by = acked_by
        allotment.acknowledged_at = datetime.utcnow()
        self.db.commit()
        return self._allotment_to_dto(allotment)

    # ---- Client: subscriptions / events --------------------------------------
    def client_subscriptions(self, user_id: uuid.UUID) -> list[SubscriptionDTO]:
        profile = (
            self.db.query(ClientProfile).filter(ClientProfile.user_id == user_id).one_or_none()
        )
        ib_account = profile.ib_account if profile else None
        return [
            SubscriptionDTO(
                model_id=model.id,
                model_name=model.name,
                units=sub.multiplier,
                ib_account=ib_account,
            )
            for sub, model in self.repo.list_subscriptions_for_client(user_id)
        ]

    def client_events(self, user_id: uuid.UUID) -> list[ClientEventDTO]:
        return [
            ClientEventDTO(
                id=e.id, category=e.category, title=e.title, body=e.body, created_at=e.created_at
            )
            for e in self.repo.list_events_for_client(user_id)
        ]

    # ---- internal helpers -----------------------------------------------
    def _require_onboarding(self, onboarding_id: uuid.UUID) -> ClientOnboarding:
        onboarding = self.repo.get_by_id(onboarding_id)
        if onboarding is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown onboarding cycle")
        return onboarding

    def _require_document(self, onboarding_id: uuid.UUID, doc_type: str) -> OnboardingDocument:
        doc = self.repo.get_document(onboarding_id, doc_type)
        if doc is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown document")
        return doc

    def _doc_to_dto(self, doc: OnboardingDocument) -> DocumentDTO:
        spec = get_doc_spec(doc.doc_type)
        return DocumentDTO(
            doc_type=doc.doc_type,
            label=spec.label,
            status=doc.status.value,
            filename=doc.filename,
            required=spec.required,
            periodic_review=spec.periodic_review,
            issue_note=doc.issue_note,
            reviewed_at=doc.reviewed_at,
            expires_at=doc.expires_at,
            can_reupload=doc.status in _CAN_REUPLOAD_STATUSES,
        )

    @staticmethod
    def _client_ref(user_id: uuid.UUID) -> str:
        """Widened 2026-07-20 (C-7): display convention only, never stored --
        derived from a UUID already unique per user, so two clients never
        collide."""
        return f"MEGA-{str(user_id).split('-')[0][:4].upper()}"

    def _to_dto(
        self, onboarding: ClientOnboarding, *, with_documents: bool = False
    ) -> OnboardingDTO:
        display = self.repo.display_fields(onboarding)
        verified, required = self.repo.counts(onboarding.id)
        # mgmt_fee/incentive_fee are always populated by create_cycle -- nullable only
        # because client_subscriptions rows (which share this column definition) may
        # legitimately have neither set.
        mgmt_fee = onboarding.mgmt_fee
        incentive_fee = onboarding.incentive_fee
        assert mgmt_fee is not None and incentive_fee is not None
        return OnboardingDTO(
            id=onboarding.id,
            user_id=onboarding.user_id,
            client_name=display.client_name,
            email=display.email,
            assigned_rm=display.assigned_rm,
            client_ref=self._client_ref(onboarding.user_id),
            primary_phone=display.primary_phone,
            address=display.address,
            country_of_residence=display.country_of_residence,
            id_type=onboarding.id_type,
            id_number=onboarding.id_number,
            ibhk_account=onboarding.ibhk_account or "",
            sw_account=onboarding.sw_account or "",
            status=onboarding.status.value,
            kind=onboarding.kind.value,
            model_id=onboarding.model_id,
            model_name=display.model_name,
            units=onboarding.multiplier,
            mgmt_fee=mgmt_fee,
            incentive_fee=incentive_fee,
            verified_count=verified,
            required_count=required,
            reject_reason=onboarding.reject_reason,
            submitted_at=onboarding.submitted_at,
            created_at=onboarding.created_at,
            documents=[self._doc_to_dto(d) for d in self.repo.documents_for(onboarding.id)]
            if with_documents
            else [],
        )

    def _allotment_to_dto(self, allotment: ClientAllotmentRedemption) -> AllotRdmptDTO:
        model = self.db.get(Model, allotment.model_id)
        assert model is not None
        amount = allotment.multiplier * (model.model_size or Decimal("0"))
        source_onboarding = self.repo.get_by_user_id(allotment.user_id)
        assigned_rm = (
            self.repo.display_fields(source_onboarding).assigned_rm if source_onboarding else ""
        )
        return AllotRdmptDTO(
            id=allotment.id,
            reference=allotment.reference,
            model_id=model.id,
            model_name=model.name,
            units=allotment.multiplier,
            amount=amount,
            kind=allotment.kind.value,
            status=allotment.status.value,
            note=allotment.note,
            agg_before=allotment.agg_before,
            agg_after=allotment.agg_after,
            expected_cash_in=allotment.expected_cash_in,
            rm=assigned_rm,
            created_at=allotment.created_at,
            acknowledged_at=allotment.acknowledged_at,
        )
