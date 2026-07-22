# api-backend/app/libs/onboarding/service.py
from __future__ import annotations

import io
import os
import uuid
import zipfile
from datetime import datetime, timedelta
from decimal import Decimal
from typing import BinaryIO

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.libs.clients.service import ClientService
from app.libs.identity.service import FirebaseIdentityService
from app.libs.onboarding.compliance_doc_config import REQUIRED_DOCS, get_doc_spec
from app.libs.onboarding.repository import OnboardingRepository
from app.libs.onboarding.schemas import (
    AllotRdmptDTO,
    BoardDTO,
    ClientEventDTO,
    ClientSubscriptionRowDTO,
    ClientSubscriptionsDTO,
    DocSpecDTO,
    DocumentDTO,
    OnboardingDTO,
    RejectReq,
    RmOptionDTO,
    StartOnboardingReq,
    SubmitAllotmentReq,
    SubscriptionDTO,
    VerdictReq,
)
from app.libs.trade_models.storage import get_storage
from app.libs.users.repository import AdminProfileRepository
from app.models.onboarding import (
    AllotRdmpKind,
    AllotRdmpStatus,
    ClientAllotmentRedemption,
    ClientOnboarding,
    DocStatus,
    OnboardingDocument,
    OnboardingKind,
    OnboardingStatus,
)
from app.models.pc import ClientSubscription, Model
from app.models.users import AccountStatus, AdminRole, ClientProfile, User

_CAN_REUPLOAD_STATUSES = {"not_started", "uploaded", "rejected", "expired"}
_EDITABLE_STATUSES = {OnboardingStatus.INITIAL, OnboardingStatus.PENDING_REVIEW}

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
        # 014 C-9: AUM-floor check -- validated exactly once, before create_cycle
        # runs, so a 422 here leaves no client_onboardings/onboarding_documents/
        # client_portfolios row behind (no rollback dance needed).
        amount_in_trade = req.units * (model.model_size or Decimal("0"))
        cash_deposit = req.initial_cash_deposit - amount_in_trade
        if cash_deposit < 0:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "Initial cash deposit must cover at least the subscribed amount in trade",
            )
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
            self.repo.set_initial_portfolio(
                staged_user.id, amount_in_trade=amount_in_trade, cash_deposit=cash_deposit
            )
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return self._to_dto(onboarding, with_documents=True)

    def _is_admin(self, caller_uid: str) -> bool:
        caller = self.db.query(User).filter(User.firebase_uid == caller_uid).one_or_none()
        profile = AdminProfileRepository(self.db).get_by_user_id(caller.id) if caller else None
        return profile is not None and profile.role == AdminRole.ADMIN

    def _resolve_rm_override(self, requested_rm_uid: str | None, *, caller_uid: str) -> str:
        """ADMIN-only "Assigned RM" override: any other role gets pinned to
        itself no matter what the request body claims (defence in depth --
        the FE only offers other RMs to ADMIN, but the API can't trust that)."""
        if not requested_rm_uid or not self._is_admin(caller_uid):
            return caller_uid
        return requested_rm_uid

    def doc_specs(self) -> list[DocSpecDTO]:
        return [DocSpecDTO(doc_type=d.key, label=d.label, required=d.required) for d in REQUIRED_DOCS]

    def rm_options(self, *, caller_uid: str) -> list[RmOptionDTO]:
        """ADMIN sees every RM (can assign anyone); any other caller sees only
        themselves (the picker is enabled everywhere but pre-scoped, so there's
        nothing else to pick)."""
        options = [RmOptionDTO(uid=uid, name=name) for uid, name in self.repo.list_rm_options()]
        if self._is_admin(caller_uid):
            return options
        return [o for o in options if o.uid == caller_uid]

    def upload_document(
        self,
        onboarding_id: uuid.UUID,
        doc_type: str,
        *,
        stream: BinaryIO,
        filename: str,
        content_type: str | None,
    ) -> DocumentDTO:
        onboarding = self._require_onboarding(onboarding_id)
        if onboarding.status not in _EDITABLE_STATUSES:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Documents cannot be uploaded while the cycle is under review or active",
            )
        doc = self._require_document(onboarding_id, doc_type)
        if doc.status not in _CAN_REUPLOAD_STATUSES:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "Document cannot be reuploaded in its current status"
            )
        storage_key = get_storage().save(
            stream,
            suggested_name=filename,
            content_type=content_type,
            subdir=f"client_kyc_docs/{self.repo.client_folder_name(onboarding)}",
        )
        self.repo.upload_document(
            doc, storage_key=storage_key, filename=filename, content_type=content_type
        )
        self.db.commit()
        return self._doc_to_dto(doc)

    def submit(self, onboarding_id: uuid.UUID) -> OnboardingDTO:
        onboarding = self._require_onboarding(onboarding_id)
        if onboarding.status not in _EDITABLE_STATUSES:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "Cycle has already been submitted or decided"
            )
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
        self.repo.reset_non_verified_for_reupload(onboarding_id)
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

    def detail_by_client(self, client_id: uuid.UUID) -> OnboardingDTO:
        """014 C-8: RM-scoped by-client lookup -- 404 (not 500) for a client
        with no client_onboardings row (the pre-013 bare POST /rm/clients path)."""
        onboarding = self.repo.get_by_user_id(client_id)
        if onboarding is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Client has no onboarding cycle")
        return self._to_dto(onboarding, with_documents=True)

    def download_document(
        self, onboarding_id: uuid.UUID, doc_type: str
    ) -> tuple[BinaryIO, str, str | None]:
        doc = self._require_document(onboarding_id, doc_type)
        if doc.storage_key is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No file uploaded for this document")
        stream = get_storage().open(doc.storage_key)
        return stream, doc.filename or doc.doc_type, doc.content_type

    def download_all_documents(self, onboarding_id: uuid.UUID) -> tuple[BinaryIO, str]:
        docs = [d for d in self.repo.documents_for(onboarding_id) if d.storage_key]
        if not docs:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No documents have been uploaded yet")
        onboarding = self._require_onboarding(onboarding_id)
        display = self.repo.display_fields(onboarding)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for doc in docs:
                assert doc.storage_key is not None  # filtered above
                with get_storage().open(doc.storage_key) as fh:
                    zf.writestr(f"{doc.doc_type}_{doc.filename or doc.doc_type}", fh.read())
        buf.seek(0)
        return buf, f"{display.client_name or 'client'}_kyc_docs.zip"

    # ---- RM/PC: allotment submission (BE-2) --------------------------------
    def submit_allotment(self, req: SubmitAllotmentReq) -> AllotRdmptDTO:
        """Mirrors _approve_initial (service.py:242) without the onboarding
        ceremony: no compliance gate, no users.status change, no document checks."""
        model = self.db.get(Model, req.model_id)
        if model is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown model_id")
        client = self.db.get(User, req.client_id)
        if client is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown client")

        existing = self.db.get(ClientSubscription, (req.client_id, req.model_id))
        # ORDERING: read agg_before BEFORE the upsert -- same constraint as
        # _approve_initial (double-counts this client's own row otherwise).
        agg_before = self.repo.sum_subscription_multiplier(req.model_id)

        if existing is None:
            new_multiplier = req.multiplier  # new-subscription mode
            mgmt_override = req.mgmt_fee if req.mgmt_fee != model.mgmt_fee else None
            incentive_override = (
                req.incentive_fee if req.incentive_fee != model.incentive_fee else None
            )
        else:
            new_multiplier = existing.multiplier + req.multiplier  # D-4: additive
            mgmt_override = existing.mgmt_fee_override
            incentive_override = existing.incentive_fee_override

        agg_after = agg_before + req.multiplier
        amount = req.multiplier * (model.model_size or Decimal("0"))

        try:
            self.repo.upsert_subscription(
                user_id=req.client_id,
                model_id=req.model_id,
                multiplier=new_multiplier,
                mgmt_fee_override=mgmt_override,
                incentive_fee_override=incentive_override,
            )
            allotment = self.repo.create_allotment(
                user_id=req.client_id,
                model_id=req.model_id,
                multiplier=req.multiplier,  # the submitted delta, not new_multiplier
                agg_before=agg_before,
                agg_after=agg_after,
                kind=AllotRdmpKind.ALLOTMENT,
                status=AllotRdmpStatus.PENDING,
                note="allotment",
                expected_cash_in=(
                    datetime.combine(req.expected_cash_in, datetime.min.time())
                    if req.expected_cash_in
                    else None
                ),
            )
            self.repo.shift_portfolio_for_allotment(req.client_id, amount)
            self.repo.create_event(
                user_id=req.client_id,
                category="Account Notification",
                title="Allotment submitted",
                body=f"An allotment of {req.multiplier} unit(s) in {model.name} was submitted.",
            )
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return self._allotment_to_dto(allotment)

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
                units=float(sub.multiplier),
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

    # ---- RM: Model Subscription read endpoints (014 D / BE-9) ---------------
    def list_subscriptions(self, *, role: AdminRole, rm_uid: str) -> list[ClientSubscriptionsDTO]:
        """Groups the repo's flat joined rows by client, scoped to the caller's
        visible book. Reuses ClientRepository's own visibility rule instead of
        duplicating FULL_VISIBILITY_ROLES/assigned_rm_uid filtering as a second
        SQL WHERE clause -- local import to avoid a module-level onboarding<->clients
        circular dependency (both packages already reference each other's models,
        never each other's service/router, at import time)."""
        from app.libs.clients.repository import ClientRepository

        visible_ids = {row.id for row in ClientRepository(self.db).list_visible(role, rm_uid)}
        by_client: dict[uuid.UUID, ClientSubscriptionsDTO] = {}
        for profile, sub, model in self.repo.list_all_subscriptions():
            if str(profile.user_id) not in visible_ids:
                continue
            amount = sub.multiplier * (model.model_size or Decimal("0"))
            row = ClientSubscriptionRowDTO(
                model_id=model.id,
                model_name=model.name,
                units=sub.multiplier,
                mgmt_fee=(
                    sub.mgmt_fee_override
                    if sub.mgmt_fee_override is not None
                    else (model.mgmt_fee or Decimal("0"))
                ),
                incentive_fee=(
                    sub.incentive_fee_override
                    if sub.incentive_fee_override is not None
                    else (model.incentive_fee or Decimal("0"))
                ),
                ib_account=profile.ib_account,
                amount=amount,
            )
            bucket = by_client.setdefault(
                profile.user_id,
                ClientSubscriptionsDTO(
                    client_id=profile.user_id, client_name=profile.name or "", subscriptions=[]
                ),
            )
            bucket.subscriptions.append(row)
        return list(by_client.values())

    def client_allotments(self, client_id: uuid.UUID) -> list[AllotRdmptDTO]:
        return [self._allotment_to_dto(a) for a in self.repo.list_allotments_for_client(client_id)]

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
            units=float(onboarding.multiplier),
            mgmt_fee=float(mgmt_fee),
            incentive_fee=float(incentive_fee),
            verified_count=verified,
            required_count=required,
            reject_reason=onboarding.reject_reason,
            submitted_at=onboarding.submitted_at,
            created_at=onboarding.created_at,
            approved_by=display.approved_by,
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
            units=float(allotment.multiplier),
            amount=float(amount),
            kind=allotment.kind.value,
            status=allotment.status.value,
            note=allotment.note,
            agg_before=float(allotment.agg_before),
            agg_after=float(allotment.agg_after),
            expected_cash_in=allotment.expected_cash_in,
            rm=assigned_rm,
            created_at=allotment.created_at,
            acknowledged_at=allotment.acknowledged_at,
        )
