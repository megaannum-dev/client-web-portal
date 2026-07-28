# api-backend/app/libs/client_portal/repository.py
"""SQLAlchemy queries owned by the client_portal package.

Skeleton only (BE-1) -- later units (BE-3 onward) add one query method per
data shape (positions, portfolio row, history rows, recommended models,
material lookup, ticket CRUD, RM contact lookup).
"""

from __future__ import annotations

from sqlalchemy import Row
from sqlalchemy.orm import Session

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
