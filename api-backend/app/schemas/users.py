from pydantic import BaseModel, EmailStr

from app.models.users import AdminRole


class UserOut(BaseModel):
    # D-A (005): the internal UUID PK is never serialised; firebase_uid is the
    # public identifier. Frontends key on firebase_uid, not id.
    firebase_uid: str
    email: str | None
    role: str

    model_config = {"from_attributes": True}


class UserSelfUpdate(BaseModel):
    name: str | None = None
    phone_number: str | None = None
    email: EmailStr | None = None
    # role / status deliberately absent -- never accepted from this endpoint,
    # not merely ignored: adding them to the model would silently start
    # accepting (and Pydantic-validating) fields this endpoint must always
    # reject (BE-19, impl doc §6).


class UserUpsert(BaseModel):
    email: EmailStr | None = None
    role: AdminRole = AdminRole.RM
