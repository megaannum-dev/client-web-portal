from typing import Literal

from pydantic import BaseModel, EmailStr


class UserOut(BaseModel):
    # D-A (005): the internal UUID PK is never serialised; firebase_uid is the
    # public identifier. Frontends key on firebase_uid, not id.
    firebase_uid: str
    email: str | None
    role: str
    name: str | None
    # BE-6 (§ 7.1). Absent key === NONE. Always {} for a Portal.CLIENT user --
    # clients have no page matrix (§ 3 Non-Goals). Resolved per request from
    # the DB, NOT carried in Firebase custom claims (D-2: 1000-byte cap +
    # up-to-1h staleness).
    grants: dict[str, Literal["VIEW", "EDIT"]] = {}

    model_config = {"from_attributes": True}


class UserSelfUpdate(BaseModel):
    name: str | None = None
    phone_number: str | None = None
    email: EmailStr | None = None
    # role / status deliberately absent -- never accepted from this endpoint,
    # not merely ignored: adding them to the model would silently start
    # accepting (and Pydantic-validating) fields this endpoint must always
    # reject (BE-19, impl doc §6).
