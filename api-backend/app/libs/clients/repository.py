# api-backend/app/libs/clients/repository.py
from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import func
from sqlalchemy.orm import Session, aliased

from app.models.users import AdminProfile, AdminRole, ClientProfile, User

# D-4: roles in this set see every client_profiles row, unfiltered. Every other
# role with CLIENT_VIEW (today: only RM) is scoped to their own book. Written as
# an explicit allowlist, not "every role except RM" — so COMPLIANCE (or any future
# role) is never swept into full visibility by accident if it later gains CLIENT_VIEW.
FULL_VISIBILITY_ROLES = {AdminRole.ADMIN}


@dataclass(frozen=True)
class ClientRow:
    """Repository return shape — one row of the joined query. Service maps this
    into ClientListItemOut. Kept plain (dataclass, not Pydantic) so the repo has
    no dependency on the wire schemas."""

    id: str
    name: str | None
    phone: str | None
    assigned_rm: str | None
    address: str | None
    country_of_residence: str | None
    authorized_person: str | None
    initiate_method: str | None
    ib_account: str | None
    email: str | None


class ClientRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _base_query(self):
        """The one query shared by list + single-row. NO scoping filter here —
        scoping is applied by the caller (list_visible/get_visible) based on role.

        Two aliases of `User`:
          - RM         — the assigned RM's user row, for resolving assigned_rm_uid
          - ClientUser — the client's own user row, for pulling email
        """
        RM = aliased(User)
        RMProfile = aliased(AdminProfile)
        ClientUser = aliased(User)
        rm_name = func.coalesce(RMProfile.name, RM.email, ClientProfile.assigned_rm_uid)

        return (
            self.db.query(
                ClientProfile.user_id.label("id"),
                ClientProfile.name,
                ClientProfile.primary_phone.label("phone"),
                rm_name.label("assigned_rm"),
                ClientProfile.address,
                ClientProfile.country_of_residence,
                ClientProfile.authorized_person,
                ClientProfile.initiate_method,
                ClientProfile.ib_account,
                ClientUser.email.label("email"),
            )
            .outerjoin(RM, RM.firebase_uid == ClientProfile.assigned_rm_uid)
            .outerjoin(RMProfile, RMProfile.user_id == RM.id)
            .outerjoin(ClientUser, ClientUser.id == ClientProfile.user_id)
        )

    def _scoped(self, query, role: AdminRole, rm_firebase_uid: str):
        """Applies D-4's role-based WHERE clause. Full-visibility roles get the
        query untouched; every other role is scoped to their own assigned book."""
        if role in FULL_VISIBILITY_ROLES:
            return query
        return query.filter(ClientProfile.assigned_rm_uid == rm_firebase_uid)

    def list_visible(self, role: AdminRole, rm_firebase_uid: str) -> list[ClientRow]:
        rows = self._scoped(self._base_query(), role, rm_firebase_uid).all()
        return [self._row(r) for r in rows]

    def get_visible(
        self, role: AdminRole, rm_firebase_uid: str, client_id: uuid.UUID
    ) -> ClientRow | None:
        query = self._base_query().filter(ClientProfile.user_id == client_id)
        row = self._scoped(query, role, rm_firebase_uid).one_or_none()
        return self._row(row) if row else None

    @staticmethod
    def _row(r) -> ClientRow:
        return ClientRow(
            id=str(r.id),
            name=r.name,
            phone=r.phone,
            assigned_rm=r.assigned_rm,
            address=r.address,
            country_of_residence=r.country_of_residence,
            authorized_person=r.authorized_person,
            initiate_method=r.initiate_method,
            ib_account=r.ib_account,
            email=r.email,
        )
