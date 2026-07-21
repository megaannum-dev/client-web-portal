from __future__ import annotations

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
    address: str | None
    country_of_residence: str | None
    authorized_person: str | None
    initiate_method: str | None
    ib_account: str | None
    email: str | None  # users.email (client's user, not RM's)
    authorized_by_name: str | None  # NEW (014 C-7) — resolved display name of users.authorized_by
    id_type: str | None  # NEW (014 C-8) — client_onboardings.id_type, joined
    id_number: str | None  # NEW (014 C-8) — client_onboardings.id_number, joined
    subscriptions: list[SubscriptionOut] = []  # only populated on the single-client route


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


class ClientOnboardOut(BaseModel):
    firebase_uid: str
    status: str
    invite_link: str
