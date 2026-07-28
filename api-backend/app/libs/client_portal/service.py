# api-backend/app/libs/client_portal/service.py
from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.libs.client_portal.repository import ClientPortalRepository
from app.libs.client_portal.schemas import (
    ClientProfileDTO,
    ClientProfilePatch,
    PortfolioDTO,
    PositionDTO,
    RmContactDTO,
)
from app.libs.onboarding.repository import OnboardingRepository
from app.libs.onboarding.service import OnboardingService
from app.models.users import ClientProfile, User


class ClientPortalService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = ClientPortalRepository(db)
        self.onboarding_repo = OnboardingRepository(db)
        self.onboarding = OnboardingService(db)  # C-6/C-7 delegation target

    # ---------- Profile (BE-2) ----------
    def _require_profile(self, user_id: uuid.UUID) -> ClientProfile:
        # ponytail: client_profiles.id (autoincrement int) is the actual PK --
        # user_id is a unique-indexed FK, not the PK -- so this is a filtered
        # query, not session.get(). Dispatch note said "by user_id PK" but the
        # model (app/models/users.py) disagrees; resolved to match the model.
        profile = self.db.query(ClientProfile).filter_by(user_id=user_id).one_or_none()
        if profile is None:
            raise HTTPException(404, "Client profile not found")
        return profile

    def _rm_contact(self, rm_uid: str | None) -> RmContactDTO | None:
        if rm_uid is None:
            return None
        row = self.repo.rm_contact_row(rm_uid)
        if row is None:
            return None
        return RmContactDTO(name=row.name, email=row.email, phone=row.phone_number)

    def profile(self, user_id: uuid.UUID) -> ClientProfileDTO:
        profile = self._require_profile(user_id)
        user = self.db.get(User, user_id)
        return ClientProfileDTO(
            name=profile.name,
            email=user.email if user else None,
            phone=profile.primary_phone,
            occupation=profile.occupation,
            date_of_birth=profile.date_of_birth,
            address=profile.address,
            country_of_residence=profile.country_of_residence,
            ib_account=profile.ib_account,
            client_ref=OnboardingService._client_ref(user_id),
            assigned_rm=self._rm_contact(profile.assigned_rm_uid),
        )

    def update_profile(self, user_id: uuid.UUID, patch: ClientProfilePatch) -> ClientProfileDTO:
        profile = self._require_profile(user_id)
        for field, value in patch.model_dump(exclude_unset=True).items():
            setattr(profile, field, value)
        self.db.commit()
        return self.profile(user_id)

    # ---------- Portfolio (BE-3) ----------
    def portfolio(self, user_id: uuid.UUID) -> PortfolioDTO:
        row = self.repo.get_portfolio(user_id)
        profile = self._require_profile(user_id)
        ib_account = profile.ib_account

        cash_deposit = row.cash_deposit if row else Decimal("0")
        amount_in_trade = row.amount_in_trade if row else Decimal("0")
        previous = row.previous_amount_in_trade if row else Decimal("0")
        change_amount = amount_in_trade - previous
        change_pct = float(change_amount / previous) if previous != 0 else None

        positions = [
            PositionDTO(
                model_id=model.id,
                model_name=model.name,
                units=float(sub.multiplier),
                amount=float(sub.multiplier * (model.model_size or Decimal("0"))),
                model_limit=float(model.model_limit) if model.model_limit is not None else None,
                ib_account=ib_account,
            )
            for sub, model in self.repo.positions_for_client(user_id)
        ]
        return PortfolioDTO(
            cash_deposit=float(cash_deposit),
            amount_in_trade=float(amount_in_trade),
            previous_amount_in_trade=float(previous),
            total_value=float(cash_deposit + amount_in_trade),
            change_amount=float(change_amount),
            change_pct=change_pct,
            updated_at=row.updated_at if row else None,
            positions=positions,
        )
