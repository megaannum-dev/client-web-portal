# app-backend/app/libs/staff/service.py
from __future__ import annotations

import uuid
from datetime import date
from typing import Literal, Protocol

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import set_portal_claims
from app.libs.access.repository import AccessRepository, from_wire
from app.libs.clients.service import ClientService
from app.libs.identity.mailer import send_set_password_email
from app.libs.identity.service import FirebaseIdentityService
from app.libs.staff.repository import StaffRepository
from app.libs.users.repository import AdminProfileRepository, UserRepository
from app.models.users import AccountStatus, AdminRole, Portal, User
from app.schemas.staff import LinkSentOut, StaffOut, StaffOverrideIn

# Wire status ("ACTIVE"/"DEACTIVATED", the StaffUpdateIn literal) -> DB-native
# AccountStatus. BE-19: both the last-ADMIN guard and the handover guard compare
# against the wire value, but the actual column write needs the DB enum.
_STATUS_WIRE_TO_DB: dict[str, AccountStatus] = {
    "ACTIVE": AccountStatus.ACTIVE,
    "DEACTIVATED": AccountStatus.DISABLED,
}


# (audit label, StaffUpdatePatch/AdminProfile attribute). Nullable on the profile, so an
# explicitly sent null clears them; name/role/status are required and keep `is not None`.
_CLEARABLE_FIELDS: tuple[tuple[str, str], ...] = (
    ("phone", "phone_number"),
    ("dept", "department"),
    ("start date", "start_date"),
    ("address", "address"),
)


class StaffUpdatePatch(Protocol):
    """Structural shape of BE-17's `StaffUpdateIn` (app/schemas/staff.py) -- this
    unit does not import that schema (BE-17's file, out of BE-16 scope); any object
    with these attributes (a Pydantic model or a plain namespace) satisfies it."""

    role: AdminRole | None
    status: Literal["ACTIVE", "DEACTIVATED"] | None
    name: str | None
    phone_number: str | None
    department: str | None
    start_date: date | None
    address: str | None
    model_fields_set: set[str]  # which fields the caller SENT (null = clear, omitted = keep)
    deactivate_reason: str | None  # audit detail only -- not stored on the user
    reassign_book_to: str | None  # BE-19


def _handover_block(
    *,
    profile_role: AdminRole,
    user_status: AccountStatus,
    patch: StaffUpdatePatch,
    client_count: int,
) -> str | None:
    """THE guard (C-11). ONE condition, evaluated ONCE: "this user is about to stop
    being an active RM". Returns the 409 detail to raise when a handover is required
    and `reassign_book_to` is absent, else None.

    Two triggers, not two checks -- deactivation and a role change away from RM do
    the same damage (the book keeps pointing at a uid no active RM holds), so they
    share this function rather than drifting apart as parallel branches.
    A no-op role write (role == RM) is NOT a trigger. A non-RM, or an RM with an
    empty book, is never blocked."""
    if profile_role != AdminRole.RM or client_count == 0:
        return None
    if patch.status == "DEACTIVATED" and user_status == AccountStatus.ACTIVE:
        return "Reassign this RM's client book before deactivating"
    if patch.role is not None and patch.role != AdminRole.RM:
        return "Reassign this RM's client book before changing their role"
    return None


class StaffService:
    def __init__(self, db: Session) -> None:
        self.repo = StaffRepository(db)

    def list_directory(self) -> list[StaffOut]:
        """Derives StaffOut.status:
            DISABLED                                  -> "DEACTIVATED"
            ACTIVE and last_sign_in_at IS NULL        -> "INITIATED"   (derived, D-4)
            ACTIVE and last_sign_in_at IS NOT NULL    -> "ACTIVE"
        and nulls client_count/open_ticket_count for every role except RM -- nothing
        else in the system is owned per-person, so there is nothing else to hand
        over (§ 7.1)."""
        out = []
        for row in self.repo.list_directory():
            status: Literal["ACTIVE", "INITIATED", "DEACTIVATED"]
            if row.status == AccountStatus.DISABLED:
                status = "DEACTIVATED"
            elif row.last_sign_in_at is None:
                status = "INITIATED"
            else:
                status = "ACTIVE"
            is_rm = row.role == AdminRole.RM
            out.append(
                StaffOut(
                    firebase_uid=row.firebase_uid,
                    email=row.email,
                    name=row.name,
                    role=row.role,
                    department=row.department,
                    phone_number=row.phone_number,
                    start_date=row.start_date,
                    address=row.address,
                    status=status,
                    last_sign_in_at=row.last_sign_in_at,
                    override_count=row.override_count,
                    client_count=row.client_count if is_rm else None,
                    open_ticket_count=row.open_ticket_count if is_rm else None,
                )
            )
        return out

    def enroll(
        self,
        *,
        caller_uid: str,
        caller_name: str | None,
        email: str,
        name: str,
        role: AdminRole,
        phone_number: str | None,
        department: str | None,
        start_date: date | None,
        address: str | None,
        overrides: list[StaffOverrideIn],
        notify: bool,
        password: str,
        identity: FirebaseIdentityService,
        settings: Settings,
    ) -> tuple[User, bool, int, str]:
        """Saga: Firebase identity first, DB row second (parity with BE-12).
        Firebase-fail -> ensure_identity raises before any DB write -> zero rows.
        An email that already has a Firebase identity -- with or without a `users`
        row -- is refused with 409 before any write: enrolment never adopts or
        touches someone else's identity. Commit-fail -> compensating delete_user of
        the identity this call just minted (Risk A1).

        User + profile (with department/start_date/address) + every enrollment-time
        override + the "account.created" audit row are all flushed in the SAME
        transaction and committed together (§6 BE-17 Done-when) -- a commit failure
        rolls all of it back at once, in lockstep with the compensating delete_user.
        set_portal_claims and the set-password-link email are Firebase/mailer side
        effects, not DB rows, so they happen strictly AFTER the commit succeeds --
        the email ordering is load-bearing (§6): a send failure must never strand
        an already-committed account, so it can never run inside the try block.

        The password (generated client-side, previewed/regenerable on the
        wizard's Credentials step) is set on the new identity by `ensure_identity`.
        It is returned once to the caller and never logged or persisted anywhere
        else. The new user can still take the account over via
        the emailed set-password link (`notify` below), which resets whatever
        password was set here."""
        uid, created = identity.ensure_identity(email, password=password)
        if not created:  # the email already has a Firebase identity: never adopt it
            raise HTTPException(409, "An account with this email already exists")
        user_id = uuid.uuid4()
        try:
            self.repo.create_with_profile(
                user_id=user_id,
                firebase_uid=uid,
                email=email,
                role=role,
                authorized_by=caller_uid,
                name=name,
                phone_number=phone_number,
                department=department,
                start_date=start_date,
                address=address,
            )
            access_repo = AccessRepository(self.repo.db)
            for override in overrides:
                access_repo.insert_override(
                    user_id=user_id,
                    page_id=override.page_id,
                    level=from_wire(override.level),
                    reason=override.reason,
                    granted_by=caller_uid,
                    expires_at=override.expires_at,
                )
            access_repo.insert_audit(
                actor_uid=caller_uid,
                actor_name=caller_name,
                event="account.created",
                detail=f"Enrolled {email} as {role.value}",
            )
            self.repo.db.commit()
        except Exception:
            self.repo.db.rollback()
            identity.delete_user(uid)  # Risk A1: always minted by this call
            raise
        set_portal_claims(uid, "admin", role.value, settings)  # Risk A4
        user = self.repo.db.query(User).filter(User.firebase_uid == uid).one()

        link_sent = False
        if notify:
            # No generate_set_password_link here: Firebase mints the code as it sends,
            # and a pre-generated one would be invalidated by it.
            link_sent = send_set_password_email(
                to=email, portal=Portal.ADMIN, settings=settings
            )
        return user, link_sent, len(overrides), password

    def send_set_password_link(
        self, uid: str, *, actor: User, identity: FirebaseIdentityService, settings: Settings
    ) -> LinkSentOut:
        """The "Reset password" row action. Empty body. Idempotent: each call mints a
        FRESH Firebase link, which invalidates any earlier unused one -- no state to
        track here.

        Does NOT touch the Firebase credential -- no auth.update_user(...) -- so an
        admin cannot lock a user out by "resetting" them (§6 BE-18 critical invariant).
        404 if uid is unknown or is not a Portal.ADMIN user.
        One audit row (event="account.link_sent"), written and committed BEFORE the
        send, so the record exists even if the queue call fails."""
        user = UserRepository(self.repo.db).get_by_firebase_uid(uid)
        if user is None or user.portal != Portal.ADMIN:
            raise HTTPException(404, "User not found")

        profile = AdminProfileRepository(self.repo.db).get_by_user_id(user.id)
        assert profile is not None  # invariant: every Portal.ADMIN user has one AdminProfile row
        assert user.email is not None  # invariant: enroll requires email for every admin user

        AccessRepository(self.repo.db).insert_audit(
            actor_uid=actor.firebase_uid,
            actor_name=actor.name,
            event="account.link_sent",
            detail=f"Sent set-password link to {user.email}",
        )
        self.repo.db.commit()

        link_sent = send_set_password_email(
            to=user.email, portal=Portal.ADMIN, settings=settings
        )
        return LinkSentOut(link_sent=link_sent)

    def _assert_valid_receiver(self, to_uid: str | None, *, from_uid: str) -> None:
        """422 "reassign_book_to must be an active RM" (§7.1's exact message) when
        the receiver is missing, not an admin, not role RM, not ACTIVE, or is the
        user being changed. The RM-role half REUSES ClientService.assert_is_rm
        rather than reimplementing it (C-11 step 3) -- its 422 is caught and
        re-raised with this endpoint's message; the ACTIVE and not-self checks are
        this method's own, since assert_is_rm does not make them."""
        bad_receiver = HTTPException(422, "reassign_book_to must be an active RM")
        if to_uid is None or to_uid == from_uid:
            raise bad_receiver
        receiver = UserRepository(self.repo.db).get_by_firebase_uid(to_uid)
        if receiver is None or receiver.status != AccountStatus.ACTIVE:
            raise bad_receiver
        try:
            ClientService(self.repo.db).assert_is_rm(to_uid)
        except HTTPException as exc:
            raise bad_receiver from exc

    def update(
        self, uid: str, patch: StaffUpdatePatch, settings: Settings, *, actor: User | None = None
    ) -> User:
        """Risk A2 last-ADMIN TOCTOU guard: demoting/disabling the sole active ADMIN
        must be rejected atomically -- the active-admin count is read with
        `SELECT ... FOR UPDATE` (via count_active_admins(for_update=True)) inside
        THIS transaction, so two concurrent demotions of two different admins can't
        both observe count>=2 and both commit, leaving zero active admins.
        UNCHANGED by BE-19, and evaluated BEFORE the handover guard below.

        BE-19: when this patch makes a booked RM (client_count > 0) stop being an
        active RM (deactivation or a role change away from RM), `_handover_block`
        requires a valid `reassign_book_to` -- 409 (no receiver) or 422 (bad
        receiver) -- and, once satisfied, the book + open tickets move to the
        receiver in the SAME transaction/commit as the status/role write, plus one
        audit row. Reactivating a previously-handed-over RM does not restore a
        book (client_count is 0 by then, so the guard never re-triggers)."""
        user = UserRepository(self.repo.db).get_by_firebase_uid(uid)
        if user is None:
            raise HTTPException(404, "User not found")
        if user.portal != Portal.ADMIN:
            raise HTTPException(409, "User is not an admin-portal user")

        profile = AdminProfileRepository(self.repo.db).get_by_user_id(user.id)
        assert profile is not None  # invariant: every Portal.ADMIN user has one AdminProfile row

        is_demotion = (
            patch.role is not None
            and patch.role != AdminRole.ADMIN
            and profile.role == AdminRole.ADMIN
        )
        is_disabling = patch.status == "DEACTIVATED" and user.status == AccountStatus.ACTIVE
        demoting_or_disabling = is_demotion or is_disabling
        if demoting_or_disabling:
            active_admins = self.repo.count_active_admins(for_update=True)
            if (
                profile.role == AdminRole.ADMIN
                and user.status == AccountStatus.ACTIVE
                and active_admins <= 1
            ):
                self.repo.db.rollback()
                raise HTTPException(409, "Cannot demote/disable the last active ADMIN")

        target_label = profile.name or uid
        role_before = profile.role
        client_count, _ = self.repo.count_book(uid)
        block = _handover_block(
            profile_role=profile.role,
            user_status=user.status,
            patch=patch,
            client_count=client_count,
        )
        receiver_uid = patch.reassign_book_to
        if block is not None:
            if receiver_uid is None:
                self.repo.db.rollback()
                raise HTTPException(409, block)
            self._assert_valid_receiver(receiver_uid, from_uid=uid)

        # Audit fragments, built from the before-values and ACTUAL changes only (a
        # no-op write adds nothing). `state` = role/status, `contact` = name and the
        # clearable profile fields; a handover row already says role/deactivation in
        # its own words. users.email mirrors the sign-in identity; never written here.
        state: list[str] = []
        contact: list[str] = []
        reason = patch.deactivate_reason if is_disabling else None
        reactivated = patch.status == "ACTIVE" and user.status != AccountStatus.ACTIVE
        if patch.role is not None and patch.role != role_before:
            state.append(f"role {role_before.value}→{patch.role.value}")
        if is_disabling:
            state.append(f"deactivated (reason: {reason})" if reason else "deactivated")
        elif reactivated:
            state.append("reactivated")
        if patch.name is not None and patch.name != profile.name:
            contact.append(f"name {profile.name or '(none)'}→{patch.name}")
        for label, field in _CLEARABLE_FIELDS:
            if field in patch.model_fields_set:
                old, new = getattr(profile, field), getattr(patch, field)
                if new != old:
                    contact.append(f"{label} {old or '(none)'}→{new or '(none)'}")

        if patch.role is not None:
            profile.role = patch.role
        if patch.status is not None:
            user.status = _STATUS_WIRE_TO_DB[patch.status]
        if patch.name is not None:
            profile.name = patch.name
        for _, field in _CLEARABLE_FIELDS:
            if field in patch.model_fields_set:
                setattr(profile, field, getattr(patch, field))

        if block is not None:
            assert receiver_uid is not None  # guarded above -- 409/422 already raised otherwise
            moved_clients = self.repo.reassign_book(from_uid=uid, to_uid=receiver_uid)
            moved_tickets = self.repo.reassign_open_tickets(from_uid=uid, to_uid=receiver_uid)
            if patch.status == "DEACTIVATED":
                change_desc = f"Deactivated {target_label}"
                if patch.role is not None and patch.role != role_before:
                    change_desc += f" · role {role_before.value}→{patch.role.value}"
            else:
                change_desc = f"{target_label} {role_before.value} → {patch.role.value}"  # type: ignore[union-attr]
            # ONE row: the handover row carries the extras (reason, contact edits)
            # instead of a second row, which would tie on `at` (now() is the txn start).
            extras = ([f"reason: {reason}"] if reason else []) + contact
            AccessRepository(self.repo.db).insert_audit(
                actor_uid=actor.firebase_uid if actor is not None else None,
                actor_name=actor.name if actor is not None else None,
                event="staff.book_handover",
                detail=" · ".join(
                    [
                        f"{change_desc} · book of {moved_clients} clients + "
                        f"{moved_tickets} open tickets → {receiver_uid}",
                        *extras,
                    ]
                ),
            )
        elif state or contact:
            AccessRepository(self.repo.db).insert_audit(
                actor_uid=actor.firebase_uid if actor is not None else None,
                actor_name=actor.name if actor is not None else None,
                event=(
                    "staff.deactivated"
                    if is_disabling
                    else "staff.reactivated"
                    if reactivated
                    else "staff.updated"
                ),
                detail=f"{target_label}: {'; '.join(state + contact)}",
            )

        self.repo.db.commit()
        if patch.role is not None:
            set_portal_claims(uid, "admin", patch.role.value, settings)
        self.repo.db.refresh(user)
        return user
