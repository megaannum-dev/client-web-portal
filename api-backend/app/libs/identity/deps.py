from __future__ import annotations

from typing import Annotated

from fastapi import Depends

from app.core.config import Settings, get_settings
from app.libs.identity.service import FirebaseIdentityService


def get_identity_service(
    settings: Annotated[Settings, Depends(get_settings)],
) -> FirebaseIdentityService:
    return FirebaseIdentityService(settings)
