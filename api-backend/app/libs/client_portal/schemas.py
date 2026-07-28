# api-backend/app/libs/client_portal/schemas.py
"""DTOs / request bodies for the client_portal package (§ 7.1 of the impl doc).

Skeleton only (BE-1) -- later units (BE-2 onward) add the concrete DTO
classes here.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel


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


# ---------- Documents (BE-7) ----------
class StoredFileDTO(BaseModel):
    key: str  # opaque storage key; the ONLY thing the FE echoes back
    filename: str
    size_bytes: int | None
    modified_at: datetime | None
    category: str | None  # legal scope: immediate sub-folder name; statements: None
    period: str | None  # statements scope: "YYYY-MM" parsed from a leading date token; else None
