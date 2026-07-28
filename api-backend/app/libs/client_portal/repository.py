# api-backend/app/libs/client_portal/repository.py
"""SQLAlchemy queries owned by the client_portal package.

Skeleton only (BE-1) -- later units (BE-3 onward) add one query method per
data shape (positions, portfolio row, history rows, recommended models,
material lookup, ticket CRUD, RM contact lookup).
"""

from __future__ import annotations

import uuid

from sqlalchemy import Row
from sqlalchemy.orm import Session

from app.models.pc import ClientSubscription, Model
from app.models.post_trade_allocation import ClientPortfolio
from app.models.users import AdminProfile, User


class ClientPortalRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ---------- Profile (BE-2) ----------
    def rm_contact_row(self, rm_uid: str) -> Row | None:
        return (
            self.db.query(User.email, AdminProfile.name, AdminProfile.phone_number)
            .join(AdminProfile, AdminProfile.user_id == User.id)
            .filter(User.firebase_uid == rm_uid)
            .one_or_none()
        )

    # ---------- Portfolio (BE-3) ----------
    def get_portfolio(self, user_id: uuid.UUID) -> ClientPortfolio | None:
        return self.db.get(ClientPortfolio, user_id)  # DB B-3: may be None

    def positions_for_client(
        self, user_id: uuid.UUID
    ) -> list[tuple[ClientSubscription, Model]]:
        rows = (
            self.db.query(ClientSubscription, Model)
            .join(Model, Model.id == ClientSubscription.model_id)
            .filter(ClientSubscription.user_id == user_id)
            .order_by(Model.name)  # § 4.1: "name-sorted"
            .all()
        )
        return rows  # type: ignore[return-value]
