# api-backend/app/libs/access/repository.py
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.access import (
    AccessLevel,
    AdminAuditEvent,
    OverrideLevel,
    PageAccess,
    PageAccessOverride,
    PageAccessPublication,
)
from app.models.users import AdminProfile, AdminRole, User

WireLevel = Literal["NONE", "VIEW", "EDIT"]
# §6's illustrative code names this `AccessLevelEnum`, which doesn't exist in
# app/models/access.py -- a doc typo (see dispatch prompt). The real two enums
# are AccessLevel (view/edit) and OverrideLevel (none/view/edit, D-3).
Level = AccessLevel | OverrideLevel


def to_wire(level: Level) -> WireLevel:
    """DB lowercase -> wire UPPERCASE. The ONLY case fold in the backend (§ 3.1)."""
    return level.value.upper()  # type: ignore[return-value]


def from_wire(level: WireLevel) -> OverrideLevel:
    """Wire UPPERCASE -> DB lowercase. Returns OverrideLevel (the three-value
    superset) -- str-Enum equality makes NONE/VIEW/EDIT interchangeable with
    AccessLevel's VIEW/EDIT members wherever a caller needs the two-value type."""
    return OverrideLevel(level.lower())


class AccessRepository:
    """One query shape per method. NEVER commits or rolls back -- AccessService
    owns the transaction boundary (§ 3.1)."""

    def __init__(self, db: Session) -> None:
        self.db = db

    # --- resolver reads (2 queries per guarded request, both indexed) ---
    def levels_for_role(self, role: AdminRole) -> dict[str, AccessLevel]:
        """page_id -> level for one role. Uses INDEX (role). Does NOT drop rows
        whose page_id is unknown to PAGE_IDS -- that filtering is the resolver's
        job (BE-4), not this dumb reader's."""
        rows = (
            self.db.query(PageAccess.page_id, PageAccess.level)
            .filter(PageAccess.role == role)
            .all()
        )
        return {page_id: level for page_id, level in rows}

    def overrides_for_user(
        self, user_id: uuid.UUID, *, now: datetime | None = None
    ) -> dict[str, OverrideLevel]:
        """page_id -> level for one user, expired rows excluded in SQL
        (expires_at IS NULL OR expires_at > now)."""
        now = now or datetime.now(timezone.utc)
        rows = (
            self.db.query(PageAccessOverride.page_id, PageAccessOverride.level)
            .filter(
                PageAccessOverride.user_id == user_id,
                or_(
                    PageAccessOverride.expires_at.is_(None),
                    PageAccessOverride.expires_at > now,
                ),
            )
            .all()
        )
        return {page_id: level for page_id, level in rows}

    # --- matrix ---
    def all_levels(self) -> list[PageAccess]:
        return self.db.query(PageAccess).all()

    def user_counts_by_role(self) -> dict[AdminRole, int]:
        """One GROUP BY over admin_profiles ⨝ users -- MatrixOut.roles[].user_count."""
        rows = (
            self.db.query(AdminProfile.role, func.count(AdminProfile.user_id))
            .join(User, User.id == AdminProfile.user_id)
            .group_by(AdminProfile.role)
            .all()
        )
        return {role: count for role, count in rows}

    def upsert_level(self, *, page_id: str, role: AdminRole, level: AccessLevel) -> None:
        existing = (
            self.db.query(PageAccess)
            .filter(PageAccess.page_id == page_id, PageAccess.role == role)
            .one_or_none()
        )
        if existing is None:
            self.db.add(PageAccess(page_id=page_id, role=role, level=level))
        else:
            existing.level = level

    def delete_level(self, *, page_id: str, role: AdminRole) -> None:
        """NONE is the absence of a row (D-3) -- this is how NONE is 'stored'.
        A missing cell is a no-op, never an error."""
        existing = (
            self.db.query(PageAccess)
            .filter(PageAccess.page_id == page_id, PageAccess.role == role)
            .one_or_none()
        )
        if existing is not None:
            self.db.delete(existing)

    def latest_publication(self) -> PageAccessPublication | None:
        """ORDER BY published_at DESC LIMIT 1 -- also the concurrency token (C-5)."""
        return (
            self.db.query(PageAccessPublication)
            .order_by(PageAccessPublication.published_at.desc())
            .first()
        )

    def insert_publication(
        self, *, actor_uid: str | None, actor_name: str | None, change_count: int, note: str | None
    ) -> PageAccessPublication:
        row = PageAccessPublication(
            actor_uid=actor_uid, actor_name=actor_name, change_count=change_count, note=note
        )
        self.db.add(row)
        self.db.flush()
        return row

    # --- overrides ---
    def list_overrides(self) -> list[tuple[PageAccessOverride, User, AdminProfile | None]]:
        """Joined once -- user_name/user_role come from the join, never a
        snapshot (§ Layer 3 C)."""
        rows = (
            self.db.query(PageAccessOverride, User, AdminProfile)
            .join(User, User.id == PageAccessOverride.user_id)
            .outerjoin(AdminProfile, AdminProfile.user_id == User.id)
            .all()
        )
        return [(override, user, profile) for override, user, profile in rows]

    def get_override(self, override_id: uuid.UUID) -> PageAccessOverride | None:
        return self.db.get(PageAccessOverride, override_id)

    def find_override(self, *, user_id: uuid.UUID, page_id: str) -> PageAccessOverride | None:
        """UNIQUE (user_id, page_id) pre-check -- the 409 path."""
        return (
            self.db.query(PageAccessOverride)
            .filter(PageAccessOverride.user_id == user_id, PageAccessOverride.page_id == page_id)
            .one_or_none()
        )

    def insert_override(
        self,
        *,
        user_id: uuid.UUID,
        page_id: str,
        level: OverrideLevel,
        reason: str,
        granted_by: str | None,
        expires_at: datetime | None,
    ) -> PageAccessOverride:
        row = PageAccessOverride(
            id=uuid.uuid4(),
            user_id=user_id,
            page_id=page_id,
            level=level,
            reason=reason,
            granted_by=granted_by,
            expires_at=expires_at,
        )
        self.db.add(row)
        self.db.flush()
        return row

    def delete_override(self, override: PageAccessOverride) -> None:
        self.db.delete(override)

    def count_overrides_by_user(self) -> dict[uuid.UUID, int]:
        """GROUP BY user_id -- feeds StaffOut.override_count without an N+1 (BE-16)."""
        rows = (
            self.db.query(PageAccessOverride.user_id, func.count(PageAccessOverride.id))
            .group_by(PageAccessOverride.user_id)
            .all()
        )
        return {user_id: count for user_id, count in rows}

    # --- audit ---
    def insert_audit(
        self, *, actor_uid: str | None, actor_name: str | None, event: str, detail: str
    ) -> AdminAuditEvent:
        row = AdminAuditEvent(
            id=uuid.uuid4(), actor_uid=actor_uid, actor_name=actor_name, event=event, detail=detail
        )
        self.db.add(row)
        self.db.flush()
        return row

    def list_audit(self, *, limit: int, before: datetime | None) -> list[AdminAuditEvent]:
        """ORDER BY at DESC, keyset-paged on `at < before`. Uses INDEX (at)."""
        query = self.db.query(AdminAuditEvent).order_by(AdminAuditEvent.at.desc())
        if before is not None:
            query = query.filter(AdminAuditEvent.at < before)
        return query.limit(limit).all()
