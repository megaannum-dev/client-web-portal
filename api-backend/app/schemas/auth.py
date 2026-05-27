from typing import Literal

from pydantic import BaseModel, Field

from app.models.users import UserRole

PortalKind = Literal["client", "admin"]


class FirebaseLoginBody(BaseModel):
    id_token: str | None = Field(
        default=None,
        description="Firebase ID token. Optional when FIREBASE_AUTH_DISABLED is set.",
    )
    portal: PortalKind = Field(default="client")
    role: UserRole | None = Field(
        default=None,
        description="Requested role. Only honoured by POST /api/auth/register when dev_mode=True and portal='admin'.",
    )
