# app-backend/app/libs/staff/repository.py
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime
from typing import Final

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.access import PageAccessOverride
from app.models.onboarding import ClientTicket, TicketStatus
from app.models.users import AccountStatus, AdminProfile, AdminRole, ClientProfile, Portal, User

# `TicketStatus` has no `closed` member -- "open" is the two non-terminal states
# (new/in_progress); resolved/declined are terminal and keep their assigned_rm_uid
# (018 B-1 history preservation). Single spelling shared by list_directory,
# count_book and BE-19's UPDATE so the count and the mutation can never disagree.
OPEN_TICKET_STATUSES: Final[frozenset[TicketStatus]] = frozenset(
    {TicketStatus.NEW, TicketStatus.IN_PROGRESS}
)


@dataclass(frozen=True)
class StaffDirectoryRow:
    """Repository return shape -- one joined row. Plain dataclass, no Pydantic:
    the repo has no dependency on the wire schemas (same rule as ClientRow)."""

    firebase_uid: str
    email: str | None
    name: str | None
    role: AdminRole
    department: str | None
    phone_number: str | None
    status: AccountStatus
    last_sign_in_at: datetime | None
    override_count: int
    client_count: int  # 0 for non-RM roles; the SERVICE nulls them out
    open_ticket_count: int


class StaffRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_with_profile(
        self,
        *,
        user_id: uuid.UUID,
        firebase_uid: str,
        email: str | None,
        role: AdminRole,
        authorized_by: str,
        name: str | None = None,
        phone_number: str | None = None,
        department: str | None = None,
        start_date: date | None = None,
        address: str | None = None,
    ) -> None:
        """Inserts users(portal=admin, status=ACTIVE) + admin_profiles(...) in the
        CALLER's transaction (no commit here — StaffService.enroll owns the txn
        boundary, per § 3.1 layering). status=ACTIVE is explicit, not relied on as
        the column default (DISABLED, per the DB layer's DB-1) — that default exists
        for staged client onboarding; there is no "pending admin" state.

        `department`/`start_date`/`address` (BE-17) are passed through to
        AdminProfile exactly the way `name`/`phone_number` already are — persisted,
        never swallowed (§6 BE-17)."""
        user = User(
            id=user_id,
            firebase_uid=firebase_uid,
            email=email,
            portal=Portal.ADMIN,
            authorized_by=authorized_by,
            status=AccountStatus.ACTIVE,
        )
        self.db.add(user)
        self.db.flush()
        self.db.add(
            AdminProfile(
                user_id=user.id,
                role=role,
                name=name,
                phone_number=phone_number,
                department=department,
                start_date=start_date,
                address=address,
            )
        )

    def count_active_admins(self, *, for_update: bool = False) -> int:
        q = (
            self.db.query(AdminProfile)
            .join(User, User.id == AdminProfile.user_id)
            .filter(AdminProfile.role == AdminRole.ADMIN, User.status == AccountStatus.ACTIVE)
        )
        if for_update:
            q = q.with_for_update()
        return q.count()

    def list_directory(self) -> list[StaffDirectoryRow]:
        """ONE query: users JOIN admin_profiles, LEFT JOIN three grouped subqueries
        (overrides per user_id, client_profiles per assigned_rm_uid, OPEN
        client_tickets per assigned_rm_uid), COALESCEd to 0. Explicitly NOT N+1
        (C-4, C-11 step 1) -- the two handover counts ride the same pass as
        override_count, so adding them costs no extra round-trip."""
        overrides_sq = (
            self.db.query(
                PageAccessOverride.user_id.label("user_id"),
                func.count().label("override_count"),
            )
            .group_by(PageAccessOverride.user_id)
            .subquery()
        )
        clients_sq = (
            self.db.query(
                ClientProfile.assigned_rm_uid.label("rm_uid"),
                func.count().label("client_count"),
            )
            .filter(ClientProfile.assigned_rm_uid.isnot(None))
            .group_by(ClientProfile.assigned_rm_uid)
            .subquery()
        )
        tickets_sq = (
            self.db.query(
                ClientTicket.assigned_rm_uid.label("rm_uid"),
                func.count().label("open_ticket_count"),
            )
            .filter(ClientTicket.assigned_rm_uid.isnot(None))
            .filter(ClientTicket.status.in_(OPEN_TICKET_STATUSES))
            .group_by(ClientTicket.assigned_rm_uid)
            .subquery()
        )

        rows = (
            self.db.query(
                User.firebase_uid,
                User.email,
                AdminProfile.name,
                AdminProfile.role,
                AdminProfile.department,
                AdminProfile.phone_number,
                User.status,
                User.last_sign_in_at,
                func.coalesce(overrides_sq.c.override_count, 0),
                func.coalesce(clients_sq.c.client_count, 0),
                func.coalesce(tickets_sq.c.open_ticket_count, 0),
            )
            .join(AdminProfile, AdminProfile.user_id == User.id)
            .outerjoin(overrides_sq, overrides_sq.c.user_id == User.id)
            .outerjoin(clients_sq, clients_sq.c.rm_uid == User.firebase_uid)
            .outerjoin(tickets_sq, tickets_sq.c.rm_uid == User.firebase_uid)
            .filter(User.portal == Portal.ADMIN)
            .all()
        )
        return [StaffDirectoryRow(*row) for row in rows]

    def count_book(self, rm_uid: str) -> tuple[int, int]:
        """(client_count, open_ticket_count) for ONE rm uid -- the guard's input in
        BE-19. Same predicates as list_directory's subqueries, expressed via the
        shared OPEN_TICKET_STATUSES constant so the number the admin SEES and the
        number the guard ACTS on can never drift."""
        client_count = (
            self.db.query(func.count())
            .select_from(ClientProfile)
            .filter(ClientProfile.assigned_rm_uid == rm_uid)
            .scalar()
        )
        open_ticket_count = (
            self.db.query(func.count())
            .select_from(ClientTicket)
            .filter(ClientTicket.assigned_rm_uid == rm_uid)
            .filter(ClientTicket.status.in_(OPEN_TICKET_STATUSES))
            .scalar()
        )
        return client_count, open_ticket_count
