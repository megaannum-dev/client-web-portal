from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.libs.auth.actions import Action
from app.libs.auth.deps import require_action
from app.libs.identity.deps import get_identity_service
from app.libs.identity.service import FirebaseIdentityService
from app.libs.staff.service import StaffService
from app.models.users import User
from app.schemas.staff import LinkSentOut, StaffCreatedOut, StaffEnrollIn, StaffOut, StaffUpdateIn

router = APIRouter(prefix="/admin/staff", tags=["staff"])


def _get_service(db: Annotated[Session, Depends(get_db)]) -> StaffService:
    return StaffService(db)


@router.get("", response_model=list[StaffOut])
def list_staff(
    service: Annotated[StaffService, Depends(_get_service)],
    _: Annotated[User, Depends(require_action(Action.USER_VIEW))],
) -> list[StaffOut]:
    return service.list_directory()


@router.post("", response_model=StaffCreatedOut, status_code=201)
def enroll_staff(
    body: StaffEnrollIn,
    service: Annotated[StaffService, Depends(_get_service)],
    identity: Annotated[FirebaseIdentityService, Depends(get_identity_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    user: Annotated[User, Depends(require_action(Action.USER_WRITE))],
) -> StaffCreatedOut:
    admin_user, notified, override_count, generated_password = service.enroll(
        caller_uid=user.firebase_uid,
        caller_name=user.name,
        email=body.email,
        name=f"{body.first_name} {body.last_name}",
        role=body.role,
        phone_number=body.phone_number,
        department=body.department,
        start_date=body.start_date,
        address=body.address,
        overrides=body.overrides,
        notify=body.notify,
        identity=identity,
        settings=settings,
    )
    return StaffCreatedOut(
        firebase_uid=admin_user.firebase_uid,
        email=body.email,
        role=body.role,
        status="INITIATED",
        notified=notified,
        override_count=override_count,
        generated_password=generated_password,
    )


@router.post("/{uid}/set-password-link", response_model=LinkSentOut)
def send_set_password_link(
    uid: str,
    service: Annotated[StaffService, Depends(_get_service)],
    identity: Annotated[FirebaseIdentityService, Depends(get_identity_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    actor: Annotated[User, Depends(require_action(Action.USER_WRITE))],
) -> LinkSentOut:
    return service.send_set_password_link(uid, actor=actor, identity=identity, settings=settings)


@router.patch("/{uid}", response_model=StaffOut)
def update_staff(
    uid: str,
    body: StaffUpdateIn,
    service: Annotated[StaffService, Depends(_get_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    actor: Annotated[User, Depends(require_action(Action.USER_WRITE))],
) -> StaffOut:
    """Response model widened for BE-19: a PATCH can now move a book/tickets, so
    the reply is the full directory row (StaffOut), not a 3-field sliver -- built
    by re-deriving through list_directory() rather than duplicating its status/
    count derivation here."""
    service.update(uid, body, settings, actor=actor)
    for row in service.list_directory():
        if row.firebase_uid == uid:
            return row
    raise HTTPException(404, "User not found")  # pragma: no cover -- unreachable (update() 404s)
