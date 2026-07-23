# api-backend/app/libs/onboarding/schemas.py
from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, EmailStr

OnboardingStatus = Literal["initial", "reviewing", "pending_review", "active"]
OnboardingKind = Literal["initial", "renewal"]
DocStatus = Literal["not_started", "uploaded", "in_review", "verified", "rejected", "expired"]
AllotRdmpStatus = Literal[
    "pending", "acknowledged", "awaiting_pc", "awaiting_co", "approved", "rejected"
]
AllotRdmpKind = Literal["allotment", "redemption"]


class StartOnboardingReq(BaseModel):
    """POST /api/rm/onboardings body. `mgmt_fee`/`incentive_fee` are fractions
    (e.g. 0.015) -- the FE converts its '1.5%' display string before sending."""

    client_name: str
    email: EmailStr
    primary_phone: str
    address: str
    country_of_residence: str
    id_type: str
    id_number: str
    ibhk_account: str
    sw_account: str
    model_id: uuid.UUID
    units: Decimal  # -> onboarding.multiplier
    mgmt_fee: Decimal
    incentive_fee: Decimal
    kind: OnboardingKind = "initial"
    # ADMIN-only override (BE-4 follow-up): non-ADMIN callers always land on
    # themselves regardless of what's sent here -- see OnboardingService.start.
    assigned_rm_uid: str | None = None
    # 014 C-9: "Initial Cash Deposit" step-2 field -- request-only, consumed once
    # inside OnboardingService.start to resolve client_portfolios.cash_deposit/
    # amount_in_trade, then discarded. No column stores this raw figure anywhere.
    initial_cash_deposit: Decimal


class RmOptionDTO(BaseModel):
    uid: str  # firebase_uid -- what ClientProfile.assigned_rm_uid stores
    name: str


class DocSpecDTO(BaseModel):
    """The 7 required-doc catalog itself, independent of any onboarding
    instance -- lets the FE render the doc list before an onboarding_id
    exists (e.g. the "Start Onboarding" wizard's Documents step)."""

    doc_type: str
    label: str
    required: bool


class DocumentDTO(BaseModel):
    doc_type: str
    label: str
    status: DocStatus
    filename: str | None
    required: bool
    periodic_review: bool
    issue_note: str | None
    reviewed_at: datetime | None
    expires_at: datetime | None
    can_reupload: bool  # server-computed: status in {not_started, uploaded, rejected, expired}
    uploaded_by: str | None
    uploaded_at: datetime | None
    approved_at: datetime | None


class OnboardingDTO(BaseModel):
    """Widened 2026-07-20 (D-9/C-7) -- several fields are not 1:1 row
    projections: primary_phone/address/country_of_residence are joined from
    ClientProfile, assigned_rm is resolved from assigned_rm_uid, client_ref is
    formatted server-side from user_id. See service.py's _to_dto (BE-5)."""

    id: uuid.UUID
    user_id: uuid.UUID
    client_name: str
    email: str
    assigned_rm: str  # resolved display name, not the raw uid
    client_ref: str  # e.g. "MEGA-0481" -- formatted from user_id, never stored
    primary_phone: str  # joined from ClientProfile
    address: str  # joined from ClientProfile
    country_of_residence: str  # joined from ClientProfile
    id_type: str  # -> client_onboardings.id_type
    id_number: str  # -> client_onboardings.id_number
    ibhk_account: str  # -> client_onboardings.ibhk_account
    sw_account: str  # -> client_onboardings.sw_account
    status: OnboardingStatus
    kind: OnboardingKind
    model_id: uuid.UUID
    model_name: str
    units: float
    mgmt_fee: float  # the agreed fee as captured at onboarding, echoed back
    incentive_fee: float
    verified_count: int
    required_count: int
    reject_reason: str | None
    submitted_at: datetime | None
    created_at: datetime
    approved_by: str | None  # NEW (014 C-7) — resolved display name of users.authorized_by
    documents: list[DocumentDTO] = []  # present on detail, omitted (empty) on board list


class BoardDTO(BaseModel):
    initial: list[OnboardingDTO]
    reviewing: list[OnboardingDTO]
    pending_review: list[OnboardingDTO]
    active: list[OnboardingDTO]


class VerdictReq(BaseModel):
    verdict: Literal["valid", "issue"]
    note: str | None = None


class RejectReq(BaseModel):
    reason: str | None = None


class SubmitAllotmentReq(BaseModel):
    client_id: uuid.UUID
    model_id: uuid.UUID
    multiplier: Decimal
    expected_cash_in: date | None = None
    mgmt_fee: Decimal | None = None
    incentive_fee: Decimal | None = None


class SubmitRedemptionReq(BaseModel):
    client_id: uuid.UUID
    model_id: uuid.UUID
    multiplier: Decimal
    expected_cash_out: date | None = None
    emergent: bool = False


class RedemptionDecisionReq(BaseModel):
    verdict: Literal["approve", "reject"]
    reason: str | None = None


class AllotRdmptDTO(BaseModel):
    """agg_before/agg_after/expected_cash_in are snapshotted at insert time
    (DB B-3, Backend C-2), never recomputed live -- widened 2026-07-20 (D-9)."""

    id: uuid.UUID
    reference: str  # "AL-3F9A2C" -- UUID-derived, no sequence
    model_id: uuid.UUID
    model_name: str
    units: float
    amount: float  # units * model.model_size
    kind: AllotRdmpKind
    status: AllotRdmpStatus
    note: str | None
    agg_before: (
        float  # snapshot: sum(client_subscriptions.multiplier) for this model_id, before this row
    )
    agg_after: float  # snapshot: agg_before + units
    expected_cash_in: datetime | None  # snapshot: created_at + ONBOARDING_SETTLEMENT_DAYS
    rm: str
    created_at: datetime
    acknowledged_at: datetime | None
    # --- widened 2026-07-23 (proposal 016 addendum, BE-6): redemption approval /
    # emergent fields -- columns already existed (DB-2 + 016 gap-fix migration),
    # just never exposed on this DTO. Defaults mirror the DB: emergent's
    # server_default is false (never null); the other 4 are genuinely
    # nullable until a decision/emergent-flagged submit sets them.
    emergent: bool = False
    expected_cash_out: datetime | None = None
    decided_by: str | None = None
    decided_at: datetime | None = None
    reject_reason: str | None = None


class SubscriptionDTO(BaseModel):
    model_id: uuid.UUID
    model_name: str
    units: float
    ib_account: str | None


class ClientEventDTO(BaseModel):
    id: uuid.UUID
    category: str
    title: str
    body: str
    created_at: datetime


class ClientSubscriptionRowDTO(BaseModel):
    """014 D (BE-9): one client_subscriptions row, joined to its model, with
    fee overrides resolved to their effective (read-time) values."""

    model_id: uuid.UUID
    model_name: str
    units: Decimal
    mgmt_fee: Decimal  # effective = override ?? Model default
    incentive_fee: Decimal  # effective = override ?? Model default
    ib_account: str | None
    amount: Decimal  # = units * model.model_size -- mirrors AllotRdmptDTO.amount


class ClientSubscriptionsDTO(BaseModel):
    client_id: uuid.UUID
    client_name: str
    subscriptions: list[ClientSubscriptionRowDTO]
