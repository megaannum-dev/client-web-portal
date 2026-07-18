from pydantic import BaseModel, EmailStr

from app.models.users import AccountStatus, AdminRole


class StaffEnrollIn(BaseModel):
    email: EmailStr
    name: str
    role: AdminRole
    phone_number: str | None = None


class StaffUpdateIn(BaseModel):
    role: AdminRole | None = None
    status: AccountStatus | None = None
    name: str | None = None
    phone_number: str | None = None
    email: EmailStr | None = None


class StaffOut(BaseModel):
    firebase_uid: str
    role: str
    status: str
    invite_link: str | None = None
