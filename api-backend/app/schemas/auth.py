from pydantic import BaseModel, Field


class FirebaseLoginBody(BaseModel):
    """Exchange a Firebase ID token for a portal user row (creates CLIENT on first sight)."""

    id_token: str | None = Field(
        default=None,
        description="Firebase ID token from the client SDK. Optional when API runs with FIREBASE_AUTH_DISABLED.",
    )
