from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.models.users import AdminRole

# ponytail: AccessLevel's canonical (uppercase-wire) home is app/libs/access/schemas.py
# (BE-8, module 5.4) which doesn't exist yet on this branch and is out of scope for
# this schema-only unit. A Literal matching that wire convention is the lazy,
# self-contained stand-in; swap for the shared type once BE-8 lands.
_OverrideLevel = Literal["NONE", "VIEW", "EDIT"]


class StaffOverrideIn(BaseModel):
    page_id: str  # validated against PAGE_IDS (app/libs/access, not this unit)
    level: _OverrideLevel
    reason: str = Field(min_length=1)
    expires_at: datetime | None = None


class StaffEnrollIn(BaseModel):
    email: EmailStr
    first_name: str
    last_name: str
    role: AdminRole
    phone_number: str | None = None
    department: str | None = None
    start_date: date | None = None
    address: str | None = None
    notify: bool  # the wizard's "Email an account-ready notice" checkbox
    overrides: list[StaffOverrideIn] = []
    # NOTE: no `password` field IN -- the backend always generates it (see
    # StaffCreatedOut.generated_password for the one-time OUT value).


class StaffUpdateIn(BaseModel):  # all optional; omitted = unchanged
    role: AdminRole | None = None
    name: str | None = None
    email: EmailStr | None = None
    phone_number: str | None = None
    department: str | None = None
    status: Literal["ACTIVE", "DEACTIVATED"] | None = None  # INITIATED never settable (D-4)
    deactivate_reason: str | None = None
    reassign_book_to: str | None = None  # C-11


class StaffOut(BaseModel):
    firebase_uid: str
    email: str | None
    name: str | None
    role: AdminRole
    department: str | None
    phone_number: str | None
    status: Literal["ACTIVE", "INITIATED", "DEACTIVATED"]  # INITIATED is DERIVED
    last_sign_in_at: datetime | None
    override_count: int
    client_count: int | None  # RM only; None for every other role
    open_ticket_count: int | None  # RM only; None for every other role
    # invite_link: DELETED (§ Dead code purged) — no consumer ever read it and
    # delivery is the mailer's job now.


class StaffCreatedOut(BaseModel):
    firebase_uid: str
    email: str
    role: AdminRole
    status: Literal["INITIATED"]  # always INITIATED for a fresh enrollment
    notified: bool
    override_count: int
    generated_password: str  # shown once to the enrolling admin; never logged or stored


class LinkSentOut(BaseModel):
    link_sent: bool
