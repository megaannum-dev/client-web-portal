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
    email: EmailStr | None = None


class UserUpsert(BaseModel):
    email: EmailStr | None = None
    role: AdminRole = AdminRole.RM
