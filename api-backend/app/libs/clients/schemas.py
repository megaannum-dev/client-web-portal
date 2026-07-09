from __future__ import annotations

from pydantic import BaseModel


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


class ClientListOut(BaseModel):
    items: list[ClientListItemOut]
