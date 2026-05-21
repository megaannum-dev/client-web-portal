from typing import Literal

from pydantic import BaseModel, Field

PortalKind = Literal["client", "admin"]


class FirebaseLoginBody(BaseModel):
    """Exchange a Firebase ID token for a portal user row."""

    id_token: str | None = Field(
        default=None,
        description="Firebase ID token from the client SDK. Optional when API runs with FIREBASE_AUTH_DISABLED.",
    )
    portal: PortalKind = Field(
        default="client",
        description="Which frontend is calling: client portal users get CLIENT; admin portal users get ADMIN.",
    )
