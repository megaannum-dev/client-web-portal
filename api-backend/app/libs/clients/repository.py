# api-backend/app/libs/clients/repository.py
from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import func
from sqlalchemy.orm import Session, aliased

from app.models.onboarding import ClientOnboarding
from app.models.pc import ClientSubscription, Model, ModelStatus
from app.models.users import AdminProfile, AdminRole, ClientProfile, Portal, User

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
    authorized_by_name: str | None  # 014 C-7: resolved display name of users.authorized_by
    id_type: str | None  # 014 C-8: client_onboardings.id_type, joined
    id_number: str | None  # 014 C-8: client_onboardings.id_number, joined


@dataclass(frozen=True)
class SubscriptionRow:
    """One client_subscriptions row joined to its model — account is the
    client's single ib_account (client_profiles.ib_account), repeated per row."""

    model: str
    status: str
    account: str | None


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
        Approver = aliased(User)
        ApproverProfile = aliased(AdminProfile)
        rm_name = func.coalesce(RMProfile.name, RM.email, ClientProfile.assigned_rm_uid)
        # 014 C-7: same uid -> display-name coalesce as onboarding/repository.py's
        # display_fields().approved_by -- one resolution, two call sites.
        authorized_by_name = func.coalesce(
            ApproverProfile.name, Approver.email, ClientUser.authorized_by
        )

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
                authorized_by_name.label("authorized_by_name"),
                ClientOnboarding.id_type,
                ClientOnboarding.id_number,
            )
            .outerjoin(RM, RM.firebase_uid == ClientProfile.assigned_rm_uid)
            .outerjoin(RMProfile, RMProfile.user_id == RM.id)
            .outerjoin(ClientUser, ClientUser.id == ClientProfile.user_id)
            .outerjoin(Approver, Approver.firebase_uid == ClientUser.authorized_by)
            .outerjoin(ApproverProfile, ApproverProfile.user_id == Approver.id)
            # 014 C-8: outerjoin -- a pre-013 client (bare POST /rm/clients, no
            # onboarding cycle) still returns, with id_type/id_number None.
            .outerjoin(ClientOnboarding, ClientOnboarding.user_id == ClientProfile.user_id)
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

    def list_subscriptions(self, client_id: uuid.UUID, ib_account: str | None) -> list[SubscriptionRow]:
        rows = (
            self.db.query(Model.name, Model.status)
            .join(ClientSubscription, ClientSubscription.model_id == Model.id)
            .filter(
                ClientSubscription.user_id == client_id,
                Model.status != ModelStatus.DELETED,
            )
            .all()
        )
        return [
            SubscriptionRow(model=r.name, status=r.status.value, account=ib_account)
            for r in rows
        ]

    def create_with_profile(
        self,
        *,
        user_id: uuid.UUID,
        firebase_uid: str,
        email: str | None,
        name: str | None,
        assigned_rm_uid: str,
        authorized_by: str,
        **profile_fields: str | None,  # primary_phone, address, country_of_residence,
        # authorized_person, initiate_method
    ) -> None:
        """Inserts users(portal=client, status=AccountStatus.DISABLED) + client_profiles(...)
        in the CALLER's transaction (no commit here — the service owns the txn boundary,
        per § 3.1 layering; ClientService.onboard, BE-12, commits once). status is not
        passed explicitly — the column's own default (AccountStatus.DISABLED, per the DB
        layer's DB-1) is what stages new clients as not-yet-activated."""
        user = User(
            id=user_id,
            firebase_uid=firebase_uid,
            email=email,
            portal=Portal.CLIENT,
            authorized_by=authorized_by,
        )
        self.db.add(user)
        self.db.flush()
        self.db.add(
            ClientProfile(
                user_id=user.id, name=name, assigned_rm_uid=assigned_rm_uid, **profile_fields,
            )
        )

    def assign_rm(self, client_user_id: uuid.UUID, rm_uid: str) -> None:
        """Updates assigned_rm_uid on the target profile. No commit here (caller's
        txn boundary) -- exists so `assert_is_rm` (BE-12) has a second caller per
        § 4.5; BE-14, no route wired in 004 (YAGNI)."""
        profile = self.db.query(ClientProfile).filter(ClientProfile.user_id == client_user_id).one()
        profile.assigned_rm_uid = rm_uid

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
            authorized_by_name=r.authorized_by_name,
            id_type=r.id_type,
            id_number=r.id_number,
        )
