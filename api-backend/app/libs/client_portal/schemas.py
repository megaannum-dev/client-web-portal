# api-backend/app/libs/client_portal/schemas.py
"""DTOs / request bodies for the client_portal package (§ 7.1 of the impl doc).

Skeleton only (BE-1) -- later units (BE-2 onward) add the concrete DTO
classes here.
"""

from __future__ import annotations

from datetime import date

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
