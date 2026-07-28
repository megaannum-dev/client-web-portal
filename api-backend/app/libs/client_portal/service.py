# api-backend/app/libs/client_portal/service.py
from __future__ import annotations

from sqlalchemy.orm import Session

from app.libs.client_portal.repository import ClientPortalRepository
from app.libs.onboarding.repository import OnboardingRepository
from app.libs.onboarding.service import OnboardingService


class ClientPortalService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = ClientPortalRepository(db)
        self.onboarding_repo = OnboardingRepository(db)
        self.onboarding = OnboardingService(db)  # C-6/C-7 delegation target
