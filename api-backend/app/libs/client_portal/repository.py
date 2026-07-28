# api-backend/app/libs/client_portal/repository.py
"""SQLAlchemy queries owned by the client_portal package.

Skeleton only (BE-1) -- later units (BE-3 onward) add one query method per
data shape (positions, portfolio row, history rows, recommended models,
material lookup, ticket CRUD, RM contact lookup).
"""

from __future__ import annotations

from sqlalchemy.orm import Session


class ClientPortalRepository:
    def __init__(self, db: Session) -> None:
        self.db = db
