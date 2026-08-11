# api-backend/app/libs/clients/service.py
from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import set_portal_claims
from app.libs import client_ib_accounts
from app.libs.clients.repository import ClientRepository, ClientRow
from app.libs.clients.schemas import (
    ClientIbAccountOut,
    ClientListItemOut,
    ClientListOut,
    ClientProfilePatch,
    SubscriptionOut,
)
from app.libs.identity.service import FirebaseIdentityService
from app.libs.users.repository import AdminProfileRepository, UserRepository
from app.models.pc import Model
from app.models.users import AdminRole, Portal, User


class ClientService:
    def __init__(self, db: Session) -> None:
        self.repo = ClientRepository(db)

    def assert_is_rm(self, rm_uid: str) -> None:
        """RM-literal check (Q-E) -- widening who may onboard is a require_action/
        role-matrix change at the route, never a loosening of this check."""
        user = UserRepository(self.repo.db).get_by_firebase_uid(rm_uid)
        profile = AdminProfileRepository(self.repo.db).get_by_user_id(user.id) if user else None
        if (
            not user
            or user.portal != Portal.ADMIN
            or profile is None
            or profile.role != AdminRole.RM
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="assigned_rm_uid must reference an RM",
            )

    def onboard(
        self,
        *,
        caller_uid: str,
        email: str,
        name: str,
        assigned_rm_uid: str | None,
        identity: FirebaseIdentityService,
        settings: Settings,
        asst_rm_uid: str | None = None,
        **profile_fields: str | None,
    ) -> tuple[User, str]:
        """Onboards a new client: assert_is_rm runs BEFORE any Firebase call (no
        identity/DB side effects if the target isn't an RM); ensure_identity then
        create_with_profile + a single commit (§ 3.1 txn boundary owned here).
        Compensation (delete_user) fires iff `created is True` (Risk A1) -- an
        adopted identity is NEVER deleted on rollback."""
        rm_uid = assigned_rm_uid or caller_uid
        self.assert_is_rm(rm_uid)
        if asst_rm_uid is not None:
            self.assert_is_rm(asst_rm_uid)

        uid, created = identity.ensure_identity(email)
        try:
            self.repo.create_with_profile(
                user_id=uuid.uuid4(),
                firebase_uid=uid,
                email=email,
                name=name,
                assigned_rm_uid=rm_uid,
                asst_rm_uid=asst_rm_uid,
                authorized_by=caller_uid,
                **profile_fields,
            )
            self.repo.db.commit()
        except Exception:
            self.repo.db.rollback()
            if created:  # Risk A1: NEVER delete an identity this call adopted
                identity.delete_user(uid)
            raise

        set_portal_claims(uid, "client", None, settings)  # Risk A4: stamp at provisioning
        staged = self.repo.db.query(User).filter(User.firebase_uid == uid).one()
        return staged, identity.generate_set_password_link(email)

    def list_visible(self, role: AdminRole, rm_firebase_uid: str) -> ClientListOut:
        rows = self.repo.list_visible(role, rm_firebase_uid)
        return ClientListOut(items=[self._to_dto(r) for r in rows])

    def get_visible(
        self, role: AdminRole, rm_firebase_uid: str, client_id: uuid.UUID
    ) -> ClientListItemOut:
        row = self.repo.get_visible(role, rm_firebase_uid, client_id)
        if row is None:
            # For RM: does NOT distinguish "not found" from "not yours" — see D-5.
            # For ADMIN: this genuinely means the client doesn't exist, since its
            # visible set (per D-4) is unfiltered.
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
        dto = self._to_dto(row)
        subs = self.repo.list_subscriptions(client_id)
        dto.subscriptions = [
            SubscriptionOut(model=s.model, status=s.status, client_ib=s.client_ib) for s in subs
        ]
        portfolio = self.repo.get_portfolio(client_id)
        if portfolio is not None:
            dto.cash_deposit = portfolio.cash_deposit
            dto.amount_in_trade = portfolio.amount_in_trade
        return dto

    def update_profile(
        self,
        role: AdminRole,
        rm_firebase_uid: str,
        client_id: uuid.UUID,
        patch: ClientProfilePatch,
    ) -> ClientListItemOut:
        """Edit-profile write path (proposal 019). Scoping mirrors get_visible
        exactly (same 404-not-403 behavior for an RM's out-of-book client) --
        it reuses the same repo-level visibility check, just against the live
        ORM row so setattr sticks."""
        profile = self.repo.get_profile_for_update(role, rm_firebase_uid, client_id)
        if profile is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
        for field, value in patch.model_dump(exclude_unset=True).items():
            setattr(profile, field, value)
        self.repo.db.commit()
        return self.get_visible(role, rm_firebase_uid, client_id)

    def set_ib_account(
        self,
        role: AdminRole,
        rm_firebase_uid: str,
        client_id: uuid.UUID,
        model_id: uuid.UUID,
        account_id: str,
    ) -> ClientIbAccountOut:
        """The only write to client_ib_accounts outside onboarding: an RM/admin
        correcting a wrong account, chiefly migration 0032's lossy backfill.
        Without it those values are unreachable through the API.

        Scoping reuses get_profile_for_update, so an RM cannot touch a client
        outside their own book (D-4) and gets the same 404-not-403 answer as
        update_profile. The invariant itself lives in client_ib_accounts.reassign;
        this method only owns the txn boundary."""
        if self.repo.get_profile_for_update(role, rm_firebase_uid, client_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found")
        if self.repo.db.get(Model, model_id) is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")

        row = client_ib_accounts.reassign(
            self.repo.db, user_id=client_id, model_id=model_id, account=account_id
        )
        stored = row.ib_account  # read before commit expires the instance
        self.repo.db.commit()
        return ClientIbAccountOut(account_id=stored)

    @staticmethod
    def _to_dto(r: ClientRow) -> ClientListItemOut:
        return ClientListItemOut(**r.__dict__)
