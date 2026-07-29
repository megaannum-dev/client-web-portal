# api-backend/app/libs/client_portal/service.py
from __future__ import annotations

import os
import re
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import BinaryIO, Literal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.libs.client_portal.repository import ClientPortalRepository
from app.libs.client_portal.schemas import (
    ClientProfileDTO,
    ClientProfilePatch,
    ClientRequestDTO,
    HistoryPointDTO,
    KycPanelDTO,
    PortfolioDTO,
    PositionDTO,
    RaiseTicketReq,
    RecommendedModelDTO,
    RmContactDTO,
    RmTicketDTO,
    RmTicketStatusReq,
    StoredFileDTO,
    TicketKind,
    TicketStatus,
)
from app.libs.onboarding.compliance_doc_config import REQUIRED_DOCS, get_doc_spec
from app.libs.onboarding.repository import OnboardingRepository
from app.libs.onboarding.schemas import DocumentDTO
from app.libs.onboarding.service import (
    _CAN_REUPLOAD_STATUSES,
    _EDITABLE_STATUSES,
    OnboardingService,
)
from app.libs.trade_models.storage import StoredFile, get_storage
from app.models.onboarding import (
    AllotRdmpStatus,
    ClientAllotmentRedemption,
    ClientOnboarding,
    ClientTicket,
    OnboardingDocument,
)
from app.models.onboarding import TicketStatus as DbTicketStatus
from app.models.pc import Model, ModelStatus
from app.models.users import AdminRole, ClientProfile, User

_PERIOD_RE = re.compile(r"^(\d{4}-\d{2})[_-]")
_SCOPES = {"legal", "statements"}

_TERMINAL = {TicketStatus.RESOLVED, TicketStatus.DECLINED}
_FULL_VISIBILITY_ROLES = {AdminRole.ADMIN}  # mirrors clients/repository.py's FULL_VISIBILITY_ROLES

# ---------- Requests & tickets (BE-13) ----------
# Exhaustive over every AllotRdmpStatus member (6) -- a status added to that
# enum without a matching entry here must KeyError at read time (fail loud).
_ALLOT_STATUS_MAP: dict[str, TicketStatus] = {
    "pending": TicketStatus.IN_PROGRESS,
    "awaiting_pc": TicketStatus.IN_PROGRESS,
    "awaiting_co": TicketStatus.IN_PROGRESS,
    "acknowledged": TicketStatus.RESOLVED,
    "approved": TicketStatus.RESOLVED,
    "rejected": TicketStatus.DECLINED,
}

# ---------- KYC panel (BE-10) ----------
# Same os.getenv convention as ONBOARDING_RENEWAL_LOOKAHEAD_DAYS (scheduler.py) /
# ONBOARDING_SETTLEMENT_DAYS (onboarding/service.py) -- a feature-local tunable,
# not a Settings field.
CLIENT_UPLOAD_WINDOW_DAYS = max(0, int(os.getenv("CLIENT_UPLOAD_WINDOW_DAYS", "14")))

_PERIODIC_DOC_TYPES = {d.key for d in REQUIRED_DOCS if d.periodic_review}  # exactly one today


def assert_upload_window_valid() -> None:
    """Startup check (C-8's invariant): the client window must never exceed the
    scheduler's own reopen lookahead, or a client could be offered an upload
    before the cycle is even reopened for it."""
    from app.libs.onboarding.scheduler import _RENEWAL_LOOKAHEAD_DAYS

    assert CLIENT_UPLOAD_WINDOW_DAYS <= _RENEWAL_LOOKAHEAD_DAYS, (
        f"CLIENT_UPLOAD_WINDOW_DAYS ({CLIENT_UPLOAD_WINDOW_DAYS}) must be <= "
        f"ONBOARDING_RENEWAL_LOOKAHEAD_DAYS ({_RENEWAL_LOOKAHEAD_DAYS})"
    )


# ---------- Portfolio history (BE-4) ----------
def _month_key(dt: date) -> str:
    return dt.strftime("%Y%m")


def _month_range(end: str, count: int) -> list[str]:
    """`count` calendar-month keys ("YYYYMM") ending at `end` inclusive, oldest first."""
    y, m = int(end[:4]), int(end[4:6])
    months = []
    for _ in range(count):
        months.append(f"{y:04d}{m:02d}")
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    return list(reversed(months))


class ClientPortalService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = ClientPortalRepository(db)
        self.onboarding_repo = OnboardingRepository(db)
        self.onboarding = OnboardingService(db)  # C-6/C-7 delegation target
        self._settings = get_settings()

    # ---------- Profile (BE-2) ----------
    def _require_profile(self, user_id: uuid.UUID) -> ClientProfile:
        # ponytail: client_profiles.id (autoincrement int) is the actual PK --
        # user_id is a unique-indexed FK, not the PK -- so this is a filtered
        # query, not session.get(). Dispatch note said "by user_id PK" but the
        # model (app/models/users.py) disagrees; resolved to match the model.
        profile = self.db.query(ClientProfile).filter_by(user_id=user_id).one_or_none()
        if profile is None:
            raise HTTPException(404, "Client profile not found")
        return profile

    def _rm_contact(self, rm_uid: str | None) -> RmContactDTO | None:
        if rm_uid is None:
            return None
        row = self.repo.rm_contact_row(rm_uid)
        if row is None:
            return None
        return RmContactDTO(name=row.name, email=row.email, phone=row.phone_number)

    def profile(self, user_id: uuid.UUID) -> ClientProfileDTO:
        profile = self._require_profile(user_id)
        user = self.db.get(User, user_id)
        return ClientProfileDTO(
            name=profile.name,
            email=user.email if user else None,
            phone=profile.primary_phone,
            occupation=profile.occupation,
            date_of_birth=profile.date_of_birth,
            address=profile.address,
            country_of_residence=profile.country_of_residence,
            ib_account=profile.ib_account,
            client_ref=OnboardingService._client_ref(user_id),
            assigned_rm=self._rm_contact(profile.assigned_rm_uid),
        )

    def update_profile(self, user_id: uuid.UUID, patch: ClientProfilePatch) -> ClientProfileDTO:
        profile = self._require_profile(user_id)
        for field, value in patch.model_dump(exclude_unset=True).items():
            setattr(profile, field, value)
        self.db.commit()
        return self.profile(user_id)

    # ---------- Portfolio (BE-3) ----------
    def portfolio(self, user_id: uuid.UUID) -> PortfolioDTO:
        row = self.repo.get_portfolio(user_id)
        profile = self._require_profile(user_id)
        ib_account = profile.ib_account

        cash_deposit = row.cash_deposit if row else Decimal("0")
        amount_in_trade = row.amount_in_trade if row else Decimal("0")
        previous = row.previous_amount_in_trade if row else Decimal("0")
        change_amount = amount_in_trade - previous
        change_pct = float(change_amount / previous) if previous != 0 else None

        positions = [
            PositionDTO(
                model_id=model.id,
                model_name=model.name,
                units=float(sub.multiplier),
                amount=float(sub.multiplier * (model.model_size or Decimal("0"))),
                model_limit=float(model.model_limit) if model.model_limit is not None else None,
                model_size=float(model.model_size) if model.model_size is not None else None,
                ib_account=ib_account,
                category=model.category,
                has_material=self.repo.has_material(model.id),
            )
            for sub, model in self.repo.positions_for_client(user_id)
        ]
        return PortfolioDTO(
            cash_deposit=float(cash_deposit),
            amount_in_trade=float(amount_in_trade),
            previous_amount_in_trade=float(previous),
            total_value=float(cash_deposit + amount_in_trade),
            change_amount=float(change_amount),
            change_pct=change_pct,
            updated_at=row.updated_at if row else None,
            positions=positions,
        )

    def portfolio_history(self, user_id: uuid.UUID, months: int) -> list[HistoryPointDTO]:
        window = _month_range(_month_key(datetime.utcnow().date()), months)
        window_start = window[0]

        total_rows = self.repo.history_delta_rows(user_id)
        model_rows = self.repo.history_per_model_rows(user_id)
        model_names = sorted({name for _, name, _ in model_rows})

        # cumulative BEFORE the window -- makes the first point's total correct,
        # not a partial sum starting from zero (proposal § Layer 2 B).
        total_before = sum((d for mo, d in total_rows if mo < window_start), Decimal("0"))
        per_model_before: dict[str, Decimal] = {n: Decimal("0") for n in model_names}
        for mo, name, amt in model_rows:
            if mo < window_start:
                per_model_before[name] += amt

        by_month_total: dict[str, Decimal] = defaultdict(Decimal)
        for mo, d in total_rows:
            if mo in window:
                by_month_total[mo] += d
        by_month_model: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(Decimal))
        for mo, name, amt in model_rows:
            if mo in window:
                by_month_model[mo][name] += amt

        points: list[HistoryPointDTO] = []
        running_total = total_before
        running_model = dict(per_model_before)
        for mo in window:
            running_total += by_month_total.get(mo, Decimal("0"))
            for name in model_names:
                running_model[name] += by_month_model.get(mo, {}).get(name, Decimal("0"))
            points.append(
                HistoryPointDTO(
                    month=f"{mo[:4]}-{mo[4:]}",
                    total=float(running_total),
                    per_model={n: float(v) for n, v in running_model.items()},
                )
            )
        return points

    # ---------- Models (BE-5) ----------
    def recommended_models(
        self, user_id: uuid.UUID, include_subscribed: bool = False
    ) -> list[RecommendedModelDTO]:
        subscribed_ids = {m.id for _, m in self.repo.positions_for_client(user_id)}
        return [
            RecommendedModelDTO(
                model_id=m.id,
                name=m.name,
                category=m.category,
                model_limit=float(m.model_limit) if m.model_limit is not None else None,
                model_size=float(m.model_size) if m.model_size is not None else None,
                subscription_redemption=m.subscription_redemption,
                description=m.description,
                has_material=self.repo.has_material(m.id),
            )
            for m in self.repo.recommended_models(set() if include_subscribed else subscribed_ids)
        ]

    def model_material_stream(self, model_id: uuid.UUID) -> tuple[BinaryIO, str, str | None]:
        material = self.repo.latest_material(model_id)
        if material is None or material.storage_key is None:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, "No material uploaded for this model"
            )
        return get_storage().open(material.storage_key), material.filename, material.content_type

    # ---------- Documents (BE-7) ----------
    def _scope_subdir(self, scope: str, user_id: uuid.UUID) -> str:
        if scope not in _SCOPES:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown scope: {scope!r}")
        if scope == "legal":
            return self._settings.legal_docs_subdir
        onboarding = self.onboarding_repo.get_by_user_id(user_id)
        if onboarding is None:
            return f"{self._settings.client_statements_subdir}/__no_cycle__"  # lists as empty
        folder = self.onboarding_repo.client_folder_name(onboarding)
        return f"{self._settings.client_statements_subdir}/{folder}"

    def list_documents(self, scope: str, *, user_id: uuid.UUID) -> list[StoredFileDTO]:
        subdir = self._scope_subdir(scope, user_id)
        return [self._to_stored_file_dto(f, scope) for f in get_storage().list(subdir)]

    def download_document(
        self, scope: str, key: str, *, user_id: uuid.UUID
    ) -> tuple[BinaryIO, str, str | None]:
        subdir = self._scope_subdir(scope, user_id)
        listing = get_storage().list(subdir)  # MANDATORY (C-4): re-list, don't trust the key string
        match = next((f for f in listing if f.key == key), None)
        if match is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized for this document")
        return get_storage().open(match.key), match.filename, None

    def _to_stored_file_dto(self, f: StoredFile, scope: str) -> StoredFileDTO:
        period = None
        if scope == "statements":
            m = _PERIOD_RE.match(f.filename)
            period = m.group(1) if m else None
        return StoredFileDTO(
            key=f.key,
            filename=f.filename,
            size_bytes=f.size_bytes,
            modified_at=f.modified_at,
            category=f.category if scope == "legal" else None,
            period=period,
        )

    # ---------- Tickets (BE-12) ----------
    def create_ticket(self, user_id: uuid.UUID, req: RaiseTicketReq) -> ClientRequestDTO:
        if req.kind != TicketKind.OTHER:
            model = self.db.get(Model, req.model_id)
            if model is None or model.status != ModelStatus.LIVE:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown or non-live model"
                )
        profile = self._require_profile(user_id)
        ticket = self.repo.create_ticket(
            user_id=user_id,
            assigned_rm_uid=profile.assigned_rm_uid,
            kind=req.kind.value,
            model_id=req.model_id,
            subject=req.subject,
            category=req.category,
            amount=req.amount,
            multiplier=req.multiplier,
            currency=req.currency,
            message=req.message,
        )
        self.onboarding_repo.create_event(
            user_id=user_id,
            category="Requests Status",
            title=f"Ticket {ticket.reference} submitted",
            body=req.message,
        )
        self.db.commit()
        return self._ticket_to_request_dto(ticket)

    def list_rm_tickets(self, *, rm_uid: str, role: AdminRole) -> list[RmTicketDTO]:
        full_visibility = role in _FULL_VISIBILITY_ROLES
        tickets = self.repo.list_for_rm(rm_uid=rm_uid, full_visibility=full_visibility)
        return [self._ticket_to_rm_dto(t) for t in tickets]

    def _require_rm_visible_ticket(self, ref: str, *, rm_uid: str, role: AdminRole) -> ClientTicket:
        ticket = self.repo.get_ticket_by_ref(ref)
        if ticket is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown ticket")
        if role not in _FULL_VISIBILITY_ROLES and ticket.assigned_rm_uid != rm_uid:
            # scoped 404, not 403 -- avoid leaking existence to a non-visible caller
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown ticket")
        return ticket

    def _require_rm_visible_ticket_dto(
        self, ref: str, *, rm_uid: str, role: AdminRole
    ) -> RmTicketDTO:
        ticket = self._require_rm_visible_ticket(ref, rm_uid=rm_uid, role=role)
        return self._ticket_to_rm_dto(ticket)

    def set_rm_ticket_status(
        self, ref: str, req: RmTicketStatusReq, *, rm_uid: str, role: AdminRole
    ) -> RmTicketDTO:
        ticket = self._require_rm_visible_ticket(ref, rm_uid=rm_uid, role=role)
        current = self._effective_ticket_status(ticket)
        if current in _TERMINAL:
            raise HTTPException(status.HTTP_409_CONFLICT, "Ticket is already closed")
        if ticket.linked_allotment_id is not None and req.status != TicketStatus.DECLINED:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "In Progress/Resolved for a linked request is driven by PC/Compliance "
                "approval, not set directly",
            )
        ticket.status = DbTicketStatus(req.status.value)
        ticket.response_note = req.note
        ticket.responded_by = rm_uid
        ticket.responded_at = datetime.utcnow()
        if req.status == TicketStatus.DECLINED:
            if ticket.linked_allotment_id is not None:
                allotment = self.db.get(ClientAllotmentRedemption, ticket.linked_allotment_id)
                if allotment is not None:
                    allotment.status = AllotRdmpStatus.REJECTED
                    allotment.reject_reason = req.note
                    allotment.decided_by = rm_uid
                    allotment.decided_at = datetime.utcnow()
            model = self.db.get(Model, ticket.model_id) if ticket.model_id else None
            subject = model.name if model else (ticket.subject or "your request")
            body = f"Your {TicketKind(ticket.kind).value} request for {subject} was declined."
            if req.note:
                body += f' Reason: "{req.note}"'
            self.onboarding_repo.create_event(
                user_id=ticket.user_id,
                category="Requests Status",
                title=f"{TicketKind(ticket.kind).value.capitalize()} request declined",
                body=body,
            )
        self.db.commit()
        return self._ticket_to_rm_dto(ticket)

    def _effective_ticket_status(self, t: ClientTicket) -> TicketStatus:
        """A ticket linked to a real allotment/redemption defers to that row's
        live approval-chain status instead of its own (possibly stale) column --
        PC/Compliance's decision is the source of truth once linked."""
        if t.linked_allotment_id is not None:
            allotment = self.db.get(ClientAllotmentRedemption, t.linked_allotment_id)
            if allotment is not None:
                return _ALLOT_STATUS_MAP[allotment.status.value]
        return TicketStatus(t.status)

    def _ticket_to_rm_dto(self, t: ClientTicket) -> RmTicketDTO:
        profile = self.db.query(ClientProfile).filter_by(user_id=t.user_id).one_or_none()
        user = self.db.get(User, t.user_id)
        model = self.db.get(Model, t.model_id) if t.model_id else None
        amount = float(t.amount) if t.amount is not None else None
        multiplier = float(t.multiplier) if t.multiplier is not None else None
        notional = amount * multiplier if amount is not None and multiplier is not None else None
        return RmTicketDTO(
            ref=t.reference,
            client_id=t.user_id,
            client=(profile.name if profile else None) or "",
            contact=profile.authorized_person if profile else None,
            email=user.email if user else None,
            account=profile.ib_account if profile else None,
            model=model.name if model else None,
            model_id=t.model_id,
            kind=TicketKind(t.kind),
            currency=t.currency,
            amount=amount,
            multiplier=multiplier,
            notional=notional,
            subject=t.subject,
            message=t.message,
            status=self._effective_ticket_status(t),
            created_at=t.created_at,
            responded_by=t.responded_by,
            responded_at=t.responded_at,
            response_note=t.response_note,
        )

    def _ticket_to_request_dto(self, t: ClientTicket) -> ClientRequestDTO:
        model = self.db.get(Model, t.model_id) if t.model_id else None
        return ClientRequestDTO(
            source="ticket",
            ref=t.reference,
            kind=TicketKind(t.kind),
            subject=t.subject or (model.name if model else ""),
            model_name=model.name if model else None,
            amount=float(t.amount) if t.amount is not None else None,
            created_at=t.created_at,
            status=self._effective_ticket_status(t),
        )

    def list_requests(self, user_id: uuid.UUID) -> list[ClientRequestDTO]:
        tickets = self.repo.list_for_client(user_id)
        allotments = self.onboarding_repo.list_allotments_for_client(user_id)
        linked_ids = {t.linked_allotment_id for t in tickets if t.linked_allotment_id is not None}
        rows = [self._ticket_to_request_dto(t) for t in tickets]
        rows += [self._allotment_to_request_dto(a) for a in allotments if a.id not in linked_ids]
        return sorted(rows, key=lambda r: r.created_at, reverse=True)

    def _allotment_to_request_dto(self, a: ClientAllotmentRedemption) -> ClientRequestDTO:
        model = self.db.get(Model, a.model_id)
        assert model is not None
        return ClientRequestDTO(
            source="allotment",
            ref=a.reference,
            kind=TicketKind.ALLOTMENT if a.kind.value == "allotment" else TicketKind.REDEMPTION,
            subject=model.name,
            model_name=model.name,
            amount=float(a.multiplier * (model.model_size or Decimal("0"))),
            created_at=a.created_at,
            status=_ALLOT_STATUS_MAP[a.status.value],
        )

    # ---------- KYC panel (BE-10) ----------
    def _renewal_window(
        self, onboarding: ClientOnboarding, doc: OnboardingDocument | None
    ) -> tuple[
        datetime | None,
        bool,
        Literal["window_not_open", "in_review", "cycle_not_editable", "no_cycle"] | None,
    ]:
        """Read-only mirror of upload_document's own guards (C-9) -- this
        function's answer and that route's 403/409 must never disagree."""
        if doc is None or doc.expires_at is None:
            return None, False, "no_cycle"
        opens_at = doc.expires_at - timedelta(days=CLIENT_UPLOAD_WINDOW_DAYS)
        if onboarding.status not in _EDITABLE_STATUSES:
            return opens_at, False, "cycle_not_editable"
        if doc.status not in _CAN_REUPLOAD_STATUSES:
            return opens_at, False, "in_review"
        if datetime.utcnow() < opens_at:
            return opens_at, False, "window_not_open"
        return opens_at, True, None

    def kyc_panel(self, user_id: uuid.UUID) -> KycPanelDTO:
        onboarding = self.onboarding_repo.get_by_user_id(user_id)
        if onboarding is None:
            return KycPanelDTO(
                overall="due",
                documents=[],
                next_review_at=None,
                renewal_doc_type=None,
                renewal_doc_label=None,
                upload_opens_at=None,
                can_upload=False,
                upload_blocked_reason="no_cycle",
            )
        documents = self.onboarding.detail(onboarding.id).documents  # public method, D-8 reuse
        periodic_doc = next(
            (
                d
                for d in self.onboarding_repo.documents_for(onboarding.id)
                if d.doc_type in _PERIODIC_DOC_TYPES
            ),
            None,
        )
        opens_at, can_upload, reason = self._renewal_window(onboarding, periodic_doc)
        return KycPanelDTO(
            overall=self._overall_status(documents),
            documents=documents,
            next_review_at=periodic_doc.expires_at if periodic_doc else None,
            renewal_doc_type=periodic_doc.doc_type if periodic_doc else None,
            renewal_doc_label=get_doc_spec(periodic_doc.doc_type).label if periodic_doc else None,
            upload_opens_at=opens_at,
            can_upload=can_upload,
            upload_blocked_reason=reason,
        )

    def download_kyc_document(
        self, user_id: uuid.UUID, doc_type: str
    ) -> tuple[BinaryIO, str, str | None]:
        """Client-facing counterpart to the RM/Compliance download routes in
        onboarding/router.py -- scoped to the caller's own onboarding via
        get_by_user_id, same pattern as upload_renewal_document above."""
        onboarding = self.onboarding_repo.get_by_user_id(user_id)
        if onboarding is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No onboarding cycle")
        return self.onboarding.download_document(onboarding.id, doc_type)

    @staticmethod
    def _overall_status(documents: list[DocumentDTO]) -> Literal["due", "processing", "verified"]:
        required = [d for d in documents if d.required]
        if required and all(d.status == "verified" for d in required):
            return "verified"
        if any(d.status in ("uploaded", "in_review") for d in required) and not any(
            d.status in ("rejected", "expired") for d in required
        ):
            return "processing"
        return "due"

    def upload_renewal_document(
        self,
        user_id: uuid.UUID,
        doc_type: str,
        *,
        stream: BinaryIO,
        filename: str,
        content_type: str | None,
        caller_uid: str,
    ) -> DocumentDTO:
        if doc_type not in _PERIODIC_DOC_TYPES:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "This document does not accept a client-initiated renewal upload",
            )
        onboarding = self.onboarding_repo.get_by_user_id(user_id)
        if onboarding is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No onboarding cycle")
        doc = self.onboarding_repo.get_document(onboarding.id, doc_type)
        _, can_upload, reason = self._renewal_window(onboarding, doc)
        if not can_upload:
            raise HTTPException(status.HTTP_403_FORBIDDEN, reason or "window_not_open")
        # Delegates to the EXISTING, UNMODIFIED method -- its own 409 guards still
        # apply underneath this route's own 403 (Backend C-7).
        return self.onboarding.upload_document(
            onboarding.id,
            doc_type,
            stream=stream,
            filename=filename,
            content_type=content_type,
            caller_uid=caller_uid,
        )
