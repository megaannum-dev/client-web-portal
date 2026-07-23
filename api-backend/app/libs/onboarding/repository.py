# api-backend/app/libs/onboarding/repository.py
from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session, aliased

from app.libs.onboarding.compliance_doc_config import REQUIRED_DOCS
from app.models.onboarding import (
    AllotRdmpKind,
    AllotRdmpStatus,
    ClientAllotmentRedemption,
    ClientEvent,
    ClientOnboarding,
    DocStatus,
    OnboardingDocument,
    OnboardingStatus,
)
from app.models.pc import ClientSubscription, Model
from app.models.post_trade_allocation import ClientPortfolio
from app.models.users import AdminProfile, ClientProfile, User


@dataclass(frozen=True)
class OnboardingDisplayRow:
    """Widened 2026-07-20 (C-7): display_fields()'s return shape -- the joined
    + resolved fields OnboardingDTO assembly needs beyond the raw
    ClientOnboarding row (client_name/email/assigned_rm/model_name plus the
    ClientProfile-sourced phone/address/country added by D-9)."""

    client_name: str
    email: str
    assigned_rm: str
    model_name: str
    primary_phone: str
    address: str
    country_of_residence: str
    approved_by: str | None  # 014 C-7: resolved display name of users.authorized_by


@dataclass(frozen=True)
class OnboardingRow:
    """Repository return shape for one cycle joined to its client/model display
    fields. Service maps this + its DocumentRow list into OnboardingDTO."""

    onboarding: ClientOnboarding
    client_name: str
    email: str
    assigned_rm: str
    model_name: str


class OnboardingRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ---- create ----------------------------------------------------------
    def create_cycle(
        self,
        *,
        user_id: uuid.UUID,
        model_id: uuid.UUID,
        units: Decimal,
        mgmt_fee: Decimal,
        incentive_fee: Decimal,
        ibhk_account: str,
        sw_account: str,
        id_type: str,
        id_number: str,
    ) -> ClientOnboarding:
        """Inserts the one client_onboardings row (unique per user_id) plus one
        onboarding_documents row per REQUIRED_DOCS entry, all not_started. No
        commit here -- caller's txn boundary (OnboardingService.start)."""
        onboarding = ClientOnboarding(
            id=uuid.uuid4(),
            user_id=user_id,
            model_id=model_id,
            multiplier=units,
            mgmt_fee=mgmt_fee,
            incentive_fee=incentive_fee,
            ibhk_account=ibhk_account,
            sw_account=sw_account,
            id_type=id_type,
            id_number=id_number,
        )
        self.db.add(onboarding)
        self.db.flush()
        for spec in REQUIRED_DOCS:
            self.db.add(
                OnboardingDocument(
                    id=uuid.uuid4(),
                    onboarding_id=onboarding.id,
                    doc_type=spec.key,
                )
            )
        return onboarding

    def set_initial_portfolio(
        self, user_id: uuid.UUID, *, amount_in_trade: Decimal, cash_deposit: Decimal
    ) -> None:
        """014 C-9: seeds client_portfolios (proposal 011) at intake. Assumes no
        row exists yet for this user_id (true by construction -- this is the
        same request that creates the client's subscription eligibility in the
        first place); the `else` branch is defensive-only, not an expected path.
        No commit here -- caller's txn boundary (OnboardingService.start)."""
        portfolio = self.db.get(ClientPortfolio, user_id)
        if portfolio is None:
            portfolio = ClientPortfolio(
                user_id=user_id,
                cash_deposit=cash_deposit,
                amount_in_trade=amount_in_trade,
                previous_amount_in_trade=Decimal("0"),
            )
            self.db.add(portfolio)
        else:
            portfolio.cash_deposit = cash_deposit
            portfolio.amount_in_trade = amount_in_trade

    # ---- read --------------------------------------------------------
    def get_by_id(self, onboarding_id: uuid.UUID) -> ClientOnboarding | None:
        return self.db.get(ClientOnboarding, onboarding_id)

    def get_by_user_id(self, user_id: uuid.UUID) -> ClientOnboarding | None:
        return (
            self.db.query(ClientOnboarding)
            .filter(ClientOnboarding.user_id == user_id)
            .one_or_none()
        )

    def board(self) -> dict[str, list[ClientOnboarding]]:
        """Grouped by status for GET /api/rm/onboardings. Ordering within a
        column: created_at ascending (oldest first), matching kanban convention."""
        rows = self.db.query(ClientOnboarding).order_by(ClientOnboarding.created_at.asc()).all()
        buckets: dict[str, list[ClientOnboarding]] = {
            "initial": [],
            "reviewing": [],
            "pending_review": [],
            "active": [],
        }
        for row in rows:
            buckets[row.status].append(row)
        return buckets

    def compliance_queue(self) -> list[ClientOnboarding]:
        """reviewing + decided history, per GET /api/compliance/onboardings."""
        return (
            self.db.query(ClientOnboarding)
            .filter(ClientOnboarding.status.in_(["reviewing", "pending_review", "active"]))
            .order_by(ClientOnboarding.created_at.desc())
            .all()
        )

    def documents_for(self, onboarding_id: uuid.UUID) -> list[OnboardingDocument]:
        return (
            self.db.query(OnboardingDocument)
            .filter(OnboardingDocument.onboarding_id == onboarding_id)
            .all()
        )

    def get_document(self, onboarding_id: uuid.UUID, doc_type: str) -> OnboardingDocument | None:
        return (
            self.db.query(OnboardingDocument)
            .filter(
                OnboardingDocument.onboarding_id == onboarding_id,
                OnboardingDocument.doc_type == doc_type,
            )
            .one_or_none()
        )

    def display_fields(self, onboarding: ClientOnboarding) -> OnboardingDisplayRow:
        """Widened 2026-07-20 (C-7): joins ClientProfile + User + Model + the
        assigned RM's own User/AdminProfile row to resolve assigned_rm_uid to a
        display name -- the EXACT same pattern app/libs/clients/repository.py's
        _base_query() already uses (RM = aliased(User) joined on
        RM.firebase_uid == ClientProfile.assigned_rm_uid, RMProfile =
        aliased(AdminProfile), coalesce(RMProfile.name, RM.email,
        assigned_rm_uid)) -- reused, not reinvented. No caching; called
        per-row on list/detail."""
        RM = aliased(User)
        RMProfile = aliased(AdminProfile)
        rm_name_expr = func.coalesce(RMProfile.name, RM.email, ClientProfile.assigned_rm_uid)

        profile = (
            self.db.query(ClientProfile).filter(ClientProfile.user_id == onboarding.user_id).one()
        )
        user = self.db.get(User, onboarding.user_id)
        model = self.db.get(Model, onboarding.model_id)
        assert user is not None and model is not None
        rm_name = (
            self.db.query(rm_name_expr)
            .select_from(ClientProfile)
            .outerjoin(RM, RM.firebase_uid == ClientProfile.assigned_rm_uid)
            .outerjoin(RMProfile, RMProfile.user_id == RM.id)
            .filter(ClientProfile.user_id == onboarding.user_id)
            .scalar()
        )
        # 014 C-7: users.authorized_by is NOT exclusively an approval marker --
        # ClientService.onboard already stamps it with the RM's own uid at
        # intake (start()), long before any compliance review; _approve_initial
        # then overwrites it with the compliance officer's uid. So "null until
        # approved" (the seam's own stated invariant) can only hold by gating on
        # the cycle's own status, not on authorized_by's nullness alone.
        approved_by = (
            self._resolve_uid_to_display_name(user.authorized_by)
            if onboarding.status == OnboardingStatus.ACTIVE
            else None
        )
        return OnboardingDisplayRow(
            client_name=profile.name or "",
            email=user.email or "",
            assigned_rm=rm_name or "",
            model_name=model.name,
            primary_phone=profile.primary_phone or "",
            address=profile.address or "",
            country_of_residence=profile.country_of_residence or "",
            approved_by=approved_by,
        )

    def _resolve_uid_to_display_name(self, firebase_uid: str | None) -> str | None:
        """014 C-7: the same uid -> display-name coalesce as
        clients/repository.py's ClientRepository._base_query() authorized_by_name
        join -- one resolution, two call sites. `None` in, `None` out (never
        raises/short-circuits to "")."""
        if firebase_uid is None:
            return None
        Approver = aliased(User)
        ApproverProfile = aliased(AdminProfile)
        name_expr = func.coalesce(ApproverProfile.name, Approver.email, Approver.firebase_uid)
        return (
            self.db.query(name_expr)
            .select_from(Approver)
            .outerjoin(ApproverProfile, ApproverProfile.user_id == Approver.id)
            .filter(Approver.firebase_uid == firebase_uid)
            .scalar()
        )

    def client_folder_name(self, onboarding: ClientOnboarding) -> str:
        """014 C-5 (BE-4): per-client KYC storage subdirectory name -- a
        filesystem-safe slug of the client's display name plus an 8-char
        firebase-uid suffix, so two clients whose names sanitize identically
        still land in distinct folders."""
        display = self.display_fields(onboarding)
        user = self.db.get(User, onboarding.user_id)
        assert user is not None
        slug = re.sub(r"[^A-Za-z0-9]+", "_", display.client_name).strip("_") or "client"
        # Trailing (not leading) slice per the impl doc's own "Behavior/invariants"
        # wording -- this repo's real firebase uids are random throughout, but the
        # distinguishing part of any sequential/test uid scheme lives at the end.
        return f"{slug}_{user.firebase_uid[-8:]}"

    # ---- mutate: documents ------------------------------------------------
    def upload_document(
        self,
        doc: OnboardingDocument,
        *,
        storage_key: str,
        filename: str,
        content_type: str | None,
        uploaded_by: str,
    ) -> None:
        doc.storage_key = storage_key
        doc.filename = filename
        doc.content_type = content_type
        doc.status = DocStatus.UPLOADED
        doc.version_no = (doc.version_no or 0) + 1
        doc.issue_note = None
        doc.uploaded_by = uploaded_by
        doc.uploaded_at = datetime.utcnow()

    def set_verdict(
        self, doc: OnboardingDocument, *, status: DocStatus, reviewed_by: str, note: str | None
    ) -> None:
        doc.status = status
        doc.reviewed_by = reviewed_by
        doc.reviewed_at = datetime.utcnow()
        doc.issue_note = note

    def reset_for_reupload(self, doc: OnboardingDocument) -> None:
        """Renewal-scheduler path (BE-7): clears a periodic-review doc back to
        not_started without touching storage_key (RM re-uploads over it)."""
        doc.status = DocStatus.NOT_STARTED
        doc.reviewed_by = None
        doc.reviewed_at = None
        doc.issue_note = None

    def bump_all_to_in_review(self, onboarding_id: uuid.UUID) -> None:
        for doc in self.documents_for(onboarding_id):
            if doc.status != DocStatus.VERIFIED:
                doc.status = DocStatus.IN_REVIEW

    def reset_non_verified_for_reupload(self, onboarding_id: uuid.UUID) -> None:
        """Cycle-level reject() companion (pre-existing 013 gap, fixed alongside
        014 BE-1): submit() bumps every non-VERIFIED doc to IN_REVIEW, which is
        not itself a reuploadable status -- without this, a bare reject() (no
        per-doc verdict) leaves those docs permanently stuck and unreuploadable.
        VERIFIED docs are left untouched -- rejecting the cycle for other
        reasons shouldn't force re-review of a doc compliance already verified."""
        for doc in self.documents_for(onboarding_id):
            if doc.status != DocStatus.VERIFIED:
                self.reset_for_reupload(doc)

    def counts(self, onboarding_id: uuid.UUID) -> tuple[int, int]:
        """(verified_count, required_count) computed from real rows, never a
        lookup table."""
        docs = self.documents_for(onboarding_id)
        verified = sum(1 for d in docs if d.status == "verified")
        required = sum(1 for d in docs if get_doc_spec_required(d.doc_type))
        return verified, required

    # ---- mutate: subscriptions / allotments / events ----------------------
    def upsert_subscription(
        self,
        *,
        user_id: uuid.UUID,
        model_id: uuid.UUID,
        multiplier: Decimal,
        mgmt_fee_override: Decimal | None,
        incentive_fee_override: Decimal | None,
    ) -> None:
        """INSERT .. ON DUPLICATE KEY UPDATE semantics via SQLAlchemy merge-style
        get-then-set (composite PK user_id+model_id) -- no raw SQL, portable
        across the MariaDB/SQLite test path."""
        sub = self.db.get(ClientSubscription, (user_id, model_id))
        if sub is None:
            sub = ClientSubscription(user_id=user_id, model_id=model_id)
            self.db.add(sub)
        sub.multiplier = multiplier
        sub.mgmt_fee_override = mgmt_fee_override
        sub.incentive_fee_override = incentive_fee_override

    def sum_subscription_multiplier(self, model_id: uuid.UUID) -> Decimal:
        """Widened 2026-07-20 (C-7/D-9): SUM(client_subscriptions.multiplier)
        WHERE model_id = X, for computing agg_before at approve. MUST be called
        before this client's own upsert_subscription() runs for the same
        model_id -- otherwise the sum double-counts this client's new row
        (Backend C-2's ordering constraint). Returns Decimal("0") if no rows."""
        total = (
            self.db.query(func.sum(ClientSubscription.multiplier))
            .filter(ClientSubscription.model_id == model_id)
            .scalar()
        )
        return total if total is not None else Decimal("0")

    def create_allotment(
        self,
        *,
        user_id: uuid.UUID,
        model_id: uuid.UUID,
        multiplier: Decimal,
        agg_before: Decimal,
        agg_after: Decimal,
        kind: AllotRdmpKind = AllotRdmpKind.ALLOTMENT,
        status: AllotRdmpStatus = AllotRdmpStatus.PENDING,
        note: str | None = "initial allotment",
        source_onboarding_id: uuid.UUID | None = None,
        expected_cash_in: datetime | None = None,
        expected_cash_out: datetime | None = None,
        emergent: bool = False,
    ) -> ClientAllotmentRedemption:
        allotment = ClientAllotmentRedemption(
            id=uuid.uuid4(),
            user_id=user_id,
            model_id=model_id,
            multiplier=multiplier,
            kind=kind,
            status=status,
            note=note,
            source_onboarding_id=source_onboarding_id,
            reference=f"AL-{uuid.uuid4().hex[:6].upper()}",
            agg_before=agg_before,
            agg_after=agg_after,
            expected_cash_in=expected_cash_in,
            expected_cash_out=expected_cash_out,
            emergent=emergent,
        )
        self.db.add(allotment)
        return allotment

    def shift_portfolio_for_allotment(self, user_id: uuid.UUID, amount: Decimal) -> None:
        """D-1: cash_deposit -= amount, amount_in_trade += amount,
        previous_amount_in_trade += amount. Preserves the trading delta
        (amount_in_trade - previous_amount_in_trade) and total portfolio value
        (cash_deposit + amount_in_trade) is shifted by zero net, since this moves
        cash INTO trade, not new money in. Does NOT touch client_portfolio_run_deltas
        (proposal D-1 / Non-Goals -- that ledger is post-trade-allocation-run only)."""
        portfolio = self.db.get(ClientPortfolio, user_id)
        assert portfolio is not None  # every subscribed client has one, seeded at onboarding
        portfolio.cash_deposit -= amount
        portfolio.amount_in_trade += amount
        portfolio.previous_amount_in_trade += amount

    def shift_portfolio_for_redemption(self, user_id: uuid.UUID, amount: Decimal) -> None:
        """D-1: the redemption-direction mirror of shift_portfolio_for_allotment
        above -- amount_in_trade -= amount, previous_amount_in_trade -= amount,
        cash_deposit += amount. Does NOT touch client_portfolio_run_deltas."""
        portfolio = self.db.get(ClientPortfolio, user_id)
        assert portfolio is not None
        portfolio.amount_in_trade -= amount
        portfolio.previous_amount_in_trade -= amount
        portfolio.cash_deposit += amount

    def list_rm_options(self) -> list[tuple[str, str]]:
        """(firebase_uid, display name) for every RM-role admin -- feeds the
        ADMIN-only "Assigned RM" override picker. Same name-resolution
        coalesce as display_fields()."""
        rows = (
            self.db.query(User.firebase_uid, func.coalesce(AdminProfile.name, User.email))
            .join(AdminProfile, AdminProfile.user_id == User.id)
            .filter(AdminProfile.role == "RM")
            .order_by(func.coalesce(AdminProfile.name, User.email))
            .all()
        )
        return [(uid, name or uid) for uid, name in rows]

    def list_allotments(self) -> list[ClientAllotmentRedemption]:
        return (
            self.db.query(ClientAllotmentRedemption)
            .order_by(ClientAllotmentRedemption.created_at.desc())
            .all()
        )

    def get_allotment(self, allotment_id: uuid.UUID) -> ClientAllotmentRedemption | None:
        return self.db.get(ClientAllotmentRedemption, allotment_id)

    def list_all_subscriptions(self) -> list[tuple[ClientProfile, ClientSubscription, Model]]:
        """014 D (BE-9): every (client profile, subscription, model) row,
        joined -- unfiltered by RM-book visibility (the SERVICE layer applies
        that via ClientRepository.list_visible)."""
        rows = (
            self.db.query(ClientProfile, ClientSubscription, Model)
            .join(ClientSubscription, ClientSubscription.user_id == ClientProfile.user_id)
            .join(Model, Model.id == ClientSubscription.model_id)
            .all()
        )
        return rows  # type: ignore[return-value]

    def list_allotments_for_client(self, user_id: uuid.UUID) -> list[ClientAllotmentRedemption]:
        return (
            self.db.query(ClientAllotmentRedemption)
            .filter(ClientAllotmentRedemption.user_id == user_id)
            .order_by(ClientAllotmentRedemption.created_at.desc())
            .all()
        )

    def create_event(self, *, user_id: uuid.UUID, category: str, title: str, body: str) -> None:
        self.db.add(
            ClientEvent(id=uuid.uuid4(), user_id=user_id, category=category, title=title, body=body)
        )

    def list_subscriptions_for_client(
        self, user_id: uuid.UUID
    ) -> list[tuple[ClientSubscription, Model]]:
        rows = (
            self.db.query(ClientSubscription, Model)
            .join(Model, Model.id == ClientSubscription.model_id)
            .filter(ClientSubscription.user_id == user_id)
            .all()
        )
        return rows  # type: ignore[return-value]

    def list_events_for_client(self, user_id: uuid.UUID) -> list[ClientEvent]:
        return (
            self.db.query(ClientEvent)
            .filter(ClientEvent.user_id == user_id)
            .order_by(ClientEvent.created_at.desc())
            .all()
        )

    def due_for_renewal(self, lookahead_days: int) -> list[OnboardingDocument]:
        """BE-7 scheduler support: periodic_review docs whose expires_at falls
        inside the lookahead window, owned by a currently-active cycle."""
        cutoff = datetime.utcnow() + timedelta(days=lookahead_days)
        return (
            self.db.query(OnboardingDocument)
            .join(ClientOnboarding, ClientOnboarding.id == OnboardingDocument.onboarding_id)
            .filter(
                ClientOnboarding.status == "active",
                OnboardingDocument.expires_at.isnot(None),
                OnboardingDocument.expires_at <= cutoff,
            )
            .all()
        )


def get_doc_spec_required(doc_type: str) -> bool:
    from app.libs.onboarding.compliance_doc_config import get_doc_spec

    return get_doc_spec(doc_type).required
