from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.libs.auth.actions import Action
from app.libs.auth.deps import require_action
from app.libs.identity.deps import get_identity_service
from app.libs.identity.service import FirebaseIdentityService
from app.libs.staff.service import StaffService
from app.models.users import User
from app.schemas.staff import StaffEnrollIn, StaffOut, StaffUpdateIn

router = APIRouter(prefix="/admin/staff", tags=["staff"])


def _get_service(db: Annotated[Session, Depends(get_db)]) -> StaffService:
    return StaffService(db)


@router.post("", response_model=StaffOut, status_code=201)
def enroll_staff(
    body: StaffEnrollIn,
    service: Annotated[StaffService, Depends(_get_service)],
    identity: Annotated[FirebaseIdentityService, Depends(get_identity_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    user: Annotated[User, Depends(require_action(Action.USER_MANAGE))],
) -> StaffOut:
    admin_user, invite_link = service.enroll(
        caller_uid=user.firebase_uid,
        email=body.email,
        name=body.name,
        role=body.role,
        phone_number=body.phone_number,
        identity=identity,
        settings=settings,
    )
    return StaffOut(
        firebase_uid=admin_user.firebase_uid,
        role=admin_user.role,
        status=admin_user.status.value,
        invite_link=invite_link,
    )


@router.patch("/{uid}", response_model=StaffOut)
def update_staff(
    uid: str,
    body: StaffUpdateIn,
    service: Annotated[StaffService, Depends(_get_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    _: Annotated[User, Depends(require_action(Action.USER_MANAGE))],
) -> StaffOut:
    user = service.update(uid, body, settings)
    return StaffOut(firebase_uid=user.firebase_uid, role=user.role, status=user.status.value)
