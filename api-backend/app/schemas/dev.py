from __future__ import annotations

from pydantic import BaseModel

from app.models.users import AdminRole
from app.schemas.auth import PortalKind


class DevRegisterIn(BaseModel):
    id_token: str
    portal: PortalKind
    role: AdminRole | None = None  # trusted for admin portal in DEV ONLY
