# api-backend/app/libs/client_portal/schemas.py
"""DTOs / request bodies for the client_portal package (§ 7.1 of the impl doc).

Skeleton only (BE-1) -- later units (BE-2 onward) add the concrete DTO
classes here.
"""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, model_validator

from app.libs.onboarding.schemas import DocumentDTO  # reused verbatim, D-8


# ---------- Profile (BE-2) ----------
class RmContactDTO(BaseModel):
    name: str | None
    email: str | None
    phone: str | None  # admin_profiles.phone_number


class ClientProfileDTO(BaseModel):
    name: str | None  # client_profiles.name
    email: str | None  # users.email          (read-only)
    phone: str | None  # client_profiles.primary_phone (read-only)
    occupation: str | None  # client_profiles.occupation
    date_of_birth: date | None  # client_profiles.date_of_birth (read-only -- D-11)
    address: str | None  # client_profiles.address
    country_of_residence: str | None
    ib_account: str | None
    client_ref: str  # "MEGA-XXXX", formatted from user_id (existing helper)
    assigned_rm: RmContactDTO | None


class ClientProfilePatch(BaseModel):  # every field optional; unset = unchanged
    model_config = {"extra": "forbid"}  # 422 if `email`/`phone`/any unknown field is sent
    name: str | None = None
    occupation: str | None = None
    address: str | None = None
    country_of_residence: str | None = None
    # email / phone / date_of_birth are NOT patchable here -- 422 if present.


# ---------- Portfolio (BE-3) ----------
class PositionDTO(BaseModel):
    model_id: uuid.UUID
    model_name: str  # models.name
    units: float  # client_subscriptions.multiplier
    amount: float  # units * models.model_size
    model_limit: float | None  # models.model_limit -- a distinct cap, not model_size
    model_size: float | None  # models.model_size -- prices one unit
    ib_account: str | None  # client_profiles.ib_account (per-client, echoed per-row)


class PortfolioDTO(BaseModel):
    cash_deposit: float  # client_portfolios.cash_deposit (0 if no row -- DB B-3)
    amount_in_trade: float
    previous_amount_in_trade: float
    total_value: float  # cash_deposit + amount_in_trade
    change_amount: float  # amount_in_trade - previous_amount_in_trade
    change_pct: float | None  # None when previous == 0
    updated_at: datetime | None
    positions: list[PositionDTO]  # one per client_subscriptions row, name-sorted


class HistoryPointDTO(BaseModel):
    month: str  # "YYYY-MM" -- one point per CALENDAR MONTH, not per run
    total: float  # cumulative amount_in_trade at month end
    per_model: dict[str, float]  # model_name -> cumulative allocated at month end


# ---------- Models (BE-5) ----------
class RecommendedModelDTO(BaseModel):
    model_id: uuid.UUID
    name: str
    category: list[str] | None  # models.category (JSON) -- a real model attribute
    model_limit: float | None  # models.model_limit
    model_size: float | None  # models.model_size -- prices one unit
    subscription_redemption: str | None
    description: str | None
    has_material: bool  # a model_materials row exists


# ---------- Documents (BE-7) ----------
class StoredFileDTO(BaseModel):
    key: str  # opaque storage key; the ONLY thing the FE echoes back
    filename: str
    size_bytes: int | None
    modified_at: datetime | None
    category: str | None  # legal scope: immediate sub-folder name; statements: None
    period: str | None  # statements scope: "YYYY-MM" parsed from a leading date token; else None


# ---------- KYC panel (BE-10) ----------
class KycPanelDTO(BaseModel):
    overall: Literal["due", "processing", "verified"]  # derived, see Backend C-9
    documents: list[DocumentDTO]  # REUSED VERBATIM from app/libs/onboarding/schemas.py
    next_review_at: datetime | None  # the periodic doc's expires_at; None if never verified
    # --- renewal upload window (panel-level, not per-document) ---
    renewal_doc_type: str | None  # e.g. "investment_policy_statement", or None if no periodic doc
    renewal_doc_label: str | None  # DocSpec.label for renewal_doc_type; None iff renewal_doc_type is None
    upload_opens_at: datetime | None  # expires_at - CLIENT_UPLOAD_WINDOW_DAYS
    can_upload: bool  # server-computed; the FE never recomputes this
    upload_blocked_reason: (
        Literal["window_not_open", "in_review", "cycle_not_editable", "no_cycle"] | None
    )  # None iff can_upload is True


# ---------- Requests & tickets (BE-12) ----------
class TicketKind(str, enum.Enum):
    ALLOTMENT = "allotment"
    REDEMPTION = "redemption"
    OTHER = "other"


class TicketStatus(str, enum.Enum):
    NEW = "new"
    IN_PROGRESS = "in_progress"
    REPLIED = "replied"
    CLOSED = "closed"
    DECLINED = "declined"


class RaiseTicketReq(BaseModel):
    kind: TicketKind
    model_id: uuid.UUID | None = None
    subject: str | None = None
    category: str | None = None
    amount: Decimal | None = None
    multiplier: Decimal | None = None
    currency: str = "USD"
    message: str

    @model_validator(mode="after")
    def _check_kind_fields(self) -> "RaiseTicketReq":
        if self.kind == TicketKind.OTHER:
            if not self.subject:
                raise ValueError("subject is required when kind is 'other'")
            if self.model_id is not None:
                raise ValueError("model_id must be absent when kind is 'other'")
        elif self.model_id is None:
            raise ValueError("model_id is required unless kind is 'other'")
        return self


class RmTicketStatusReq(BaseModel):
    status: TicketStatus
    note: str | None = None  # persisted to client_tickets.response_note


class RmTicketDTO(BaseModel):
    ref: str
    client_id: uuid.UUID
    client: str  # client_profiles.name
    contact: str | None  # client_profiles.authorized_person
    email: str | None  # users.email
    account: str | None  # client_profiles.ib_account
    model: str | None
    kind: TicketKind
    currency: str
    amount: float | None
    multiplier: float | None
    notional: float | None  # amount * multiplier; None when either is None
    subject: str | None
    message: str
    status: TicketStatus
    created_at: datetime
    responded_by: str | None
    responded_at: datetime | None
    response_note: str | None


class ClientRequestDTO(BaseModel):
    """One merged row for the client's request history. `source` tells the FE
    which table it came from; both render in the same table. (BE-13 adds the
    allotment-side producer + the GET /client/requests route that reuses this
    DTO -- BE-12 only needs it as its own POST /client/tickets return type.)"""

    source: Literal["ticket", "allotment"]
    ref: str  # tickets: "REQ-3F9A2C"; allotments: existing `reference`
    kind: TicketKind  # allotment rows map AllotRdmpKind -> TicketKind
    subject: str  # tickets: subject or model_name; allotments: model_name
    model_name: str | None
    amount: float | None  # None renders as the existing "—"
    created_at: datetime
    status: TicketStatus  # allotment rows map via Backend C-12's table
