from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, EmailStr


class SubscriptionOut(BaseModel):
    """One client_subscriptions row joined to its model. status is the raw
    ModelStatus value ("live" | "draft") — the frontend maps it to a label."""

    model: str
    status: str
    account: str | None


class ClientListItemOut(BaseModel):
    """One client_profiles row, joined + shaped per §7.1 of the proposal."""

    id: str  # str(client_profiles.user_id) — UUID
    name: str | None
    phone: str | None  # client_profiles.primary_phone
    # resolved: admin_profiles.name -> users.email -> uid -> None
    assigned_rm: str | None
    asst_rm: str | None
    address: str | None
    country_of_residence: str | None
    authorized_person: str | None
    initiate_method: str | None
    email: str | None  # users.email (client's user, not RM's)
    authorized_by_name: str | None  # NEW (014 C-7) — resolved display name of users.authorized_by
    id_type: str | None  # NEW (014 C-8) — client_onboardings.id_type, joined
    id_number: str | None  # NEW (014 C-8) — client_onboardings.id_number, joined

    occupation: str | None = None
    date_of_birth: date | None = None
    anniversary: date | None = None
    spouse_name: str | None = None
    children: str | None = None
    personal_interests: str | None = None
    communication_preferences: str | None = None
    gift_hospitality_preferences: str | None = None
    relationship_notes: str | None = None
    subscriptions: list[SubscriptionOut] = []  # only populated on the single-client route

    cash_deposit: Decimal | None = None
    amount_in_trade: Decimal | None = None


class ClientListOut(BaseModel):
    items: list[ClientListItemOut]


class ClientOnboardIn(BaseModel):
    email: EmailStr
    name: str
    primary_phone: str | None = None
    address: str | None = None
    country_of_residence: str | None = None
    authorized_person: str | None = None
    initiate_method: str | None = None
    assigned_rm_uid: str | None = None
    asst_rm_uid: str | None = None


class ClientOnboardOut(BaseModel):
    firebase_uid: str
    status: str
    invite_link: str


class ClientIbAccountIn(BaseModel):
    """PUT body for the RM repair route. One field on purpose: the (client,
    model) pair is in the path, and nothing else about a client_ib_accounts row
    is writable."""

    model_config = {"extra": "forbid"}

    account: str


class ClientIbAccountOut(BaseModel):
    """Echoes the stored value so the caller sees the canonical (stripped) form
    that ib_accounts.reassign actually wrote, not what it sent."""

    account: str


class ClientProfilePatch(BaseModel):
    """RM edit-profile body (proposal 019). Every field optional; unset =
    unchanged. Deliberately excludes name/primary_phone/email (identity/
    contact, tied to the Firebase account), date_of_birth (identity-sensitive),
    assigned_rm_uid and asst_rm_uid (both separate, more sensitive actions),
    and id_type/id_number (client_onboardings, not this table) -- mirrors
    client_portal/schemas.py's ClientProfilePatch pattern."""

    model_config = {"extra": "forbid"}  # 422 if any excluded/unknown field is sent

    address: str | None = None
    country_of_residence: str | None = None
    authorized_person: str | None = None
    occupation: str | None = None
    anniversary: date | None = None
    spouse_name: str | None = None
    children: str | None = None
    personal_interests: str | None = None
    communication_preferences: str | None = None
    gift_hospitality_preferences: str | None = None
    relationship_notes: str | None = None
