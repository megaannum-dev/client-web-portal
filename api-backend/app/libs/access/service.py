# app/libs/access/service.py
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Final

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.libs.access.pages import PAGE_IDS, PAGE_META
from app.libs.access.repository import AccessRepository, from_wire, to_wire
from app.libs.access.schemas import (
    AccessLevel,
    AuditOut,
    MatrixCellOut,
    MatrixOut,
    MatrixPageOut,
    MatrixPublishIn,
    MatrixRoleOut,
    OverrideIn,
    OverrideOut,
    PublishedMetaOut,
)
from app.models.access import AccessLevel as DbAccessLevel
from app.models.access import PageAccessOverride
from app.models.users import AdminRole, Portal, User

# Display name per role code -- there is no roles table (§6 BE-8 behavior note).
# Mirrors admin-frontend/lib/admin/catalog.ts's ROLE_CATALOG (D-8-style hand
# mirror, kept honest by review rather than a shared source).
ROLE_NAMES: Final[dict[AdminRole, str]] = {
    AdminRole.RM: "Relationship Manager",
    AdminRole.MOBO: "Middle / Back Office",
    AdminRole.PM: "Portfolio Manager",
    AdminRole.PC: "Portfolio Controller",
    AdminRole.COMPLIANCE: "Compliance Officer",
    AdminRole.ADMIN: "Administrator",
}


class AccessService:
    def __init__(self, db: Session) -> None:
        self.repo = AccessRepository(db)

    def read_matrix(self) -> MatrixOut:
        pages = [
            MatrixPageOut(page_id=meta.page_id, group=meta.group, label=meta.label, path=meta.path)
            for meta in PAGE_META.values()
        ]

        user_counts = self.repo.user_counts_by_role()
        roles = [
            MatrixRoleOut(code=role, name=ROLE_NAMES[role], user_count=user_counts.get(role, 0))
            for role in AdminRole
        ]

        levels: list[MatrixCellOut] = []
        for row in self.repo.all_levels():
            if row.page_id not in PAGE_IDS:
                continue
            level = to_wire(row.level)
            if level == "NONE":
                continue  # never stored on this table (repository.py) -- belt-and-suspenders
            levels.append(MatrixCellOut(page_id=row.page_id, role=row.role, level=level))

        publication = self.repo.latest_publication()
        published = (
            PublishedMetaOut(at=publication.published_at, by=publication.actor_name or "")
            if publication is not None
            else None
        )

        return MatrixOut(pages=pages, roles=roles, levels=levels, published=published)

    def publish(self, body: MatrixPublishIn, *, actor: User) -> MatrixOut:
        """ONE transaction, ONE commit (C-5): optimistic-concurrency check against
        latest_publication().published_at (both None === fresh DB, the only match
        for an absent token) -- a mismatch is a 409 with the structured
        {"detail": "matrix_changed_since_read", "published": {...}} body (§7.1,
        the layer's one structured exception). Then every change is applied
        (upsert for VIEW/EDIT, delete for NONE -- D-3, never a stored NONE row),
        one publication row and one audit row are written, and the whole thing
        commits together. Any failure -- including one injected mid-apply --
        rolls back all of it and surfaces as a plain-string 500 (§3.1's
        unchanged envelope for every exception but this unit's own 409)."""
        latest = self.repo.latest_publication()
        current_token = latest.published_at if latest is not None else None
        if current_token != body.base_published_at:
            published = (
                {"at": latest.published_at.isoformat(), "by": latest.actor_name or ""}
                if latest is not None
                else None
            )
            raise HTTPException(
                status_code=409,
                detail={"detail": "matrix_changed_since_read", "published": published},
            )

        try:
            for change in body.changes:
                if change.level.value == "NONE":
                    self.repo.delete_level(page_id=change.page_id, role=change.role)
                else:
                    self.repo.upsert_level(
                        page_id=change.page_id,
                        role=change.role,
                        level=DbAccessLevel(change.level.value.lower()),
                    )
            self.repo.insert_publication(
                actor_uid=actor.firebase_uid,
                actor_name=actor.name,
                change_count=len(body.changes),
                note=body.note,
            )
            self.repo.insert_audit(
                actor_uid=actor.firebase_uid,
                actor_name=actor.name,
                event="access.published",
                detail=f"{len(body.changes)} cell(s) published",
            )
            self.repo.db.commit()
        except Exception as exc:
            self.repo.db.rollback()
            raise HTTPException(500, "Failed to publish access matrix") from exc

        return self.read_matrix()

    # --- overrides (BE-10) ---
    def _user_name(self, uid: str | None) -> str:
        """Display name for a firebase_uid, looked up live -- used for
        `granted_by` (SET NULL on account deletion, so the uid can go stale)."""
        if uid is None:
            return ""
        user = self.repo.db.query(User).filter(User.firebase_uid == uid).one_or_none()
        return (user.name if user is not None else None) or ""

    def _to_override_out(
        self,
        override: PageAccessOverride,
        *,
        firebase_uid: str,
        user_name: str | None,
        role: AdminRole,
        role_levels: dict[str, DbAccessLevel],
        now: datetime,
    ) -> OverrideOut:
        page_meta = PAGE_META[override.page_id]
        role_level = role_levels.get(override.page_id)
        role_default = to_wire(role_level) if role_level is not None else "NONE"
        expires_at = override.expires_at
        # SQLite round-trips DateTime(timezone=True) as naive (no driver-level tz
        # support) -- treat a naive value as UTC rather than let the comparison
        # raise on the (offset-naive, offset-aware) mismatch.
        compare_expires_at = (
            expires_at.replace(tzinfo=timezone.utc)
            if expires_at and expires_at.tzinfo is None
            else expires_at
        )
        expiring_soon = compare_expires_at is not None and compare_expires_at <= now + timedelta(
            days=30
        )
        return OverrideOut(
            id=override.id,
            firebase_uid=firebase_uid,
            user_name=user_name,
            user_role=role,
            page_id=override.page_id,
            page_label=page_meta.label,
            page_path=page_meta.path,
            role_default=AccessLevel(role_default),
            level=AccessLevel(to_wire(override.level)),
            reason=override.reason,
            granted_by=self._user_name(override.granted_by),
            expires_at=expires_at,
            expiring_soon=expiring_soon,
        )

    def list_overrides(self) -> list[OverrideOut]:
        """Every override, `role_default` and `user_name`/`user_role` resolved
        from the live join -- never a stored snapshot (§ Layer 3 C). Rows whose
        page_id is no longer in PAGE_IDS are excluded, matching the resolver."""
        now = datetime.now(timezone.utc)
        role_cache: dict[AdminRole, dict[str, DbAccessLevel]] = {}
        out: list[OverrideOut] = []
        for override, user, profile in self.repo.list_overrides():
            if override.page_id not in PAGE_IDS or profile is None:
                # An override always belongs to an admin user (grant_override
                # enforces it); a missing profile is inconsistent state, not a
                # shape the listing needs to render.
                continue
            role = profile.role
            if role not in role_cache:
                role_cache[role] = self.repo.levels_for_role(role)
            out.append(
                self._to_override_out(
                    override,
                    firebase_uid=user.firebase_uid,
                    user_name=user.name,
                    role=role,
                    role_levels=role_cache[role],
                    now=now,
                )
            )
        return out

    def grant_override(self, body: OverrideIn, *, actor: User) -> OverrideOut:
        """404 if firebase_uid is unknown or is not a Portal.ADMIN user; 409 on
        the UNIQUE (user_id, page_id); one audit row, one commit."""
        user = self.repo.db.query(User).filter(User.firebase_uid == body.firebase_uid).one_or_none()
        if user is None or user.portal != Portal.ADMIN or user.admin_profile is None:
            raise HTTPException(404, "Unknown admin user")
        role = user.admin_profile.role

        if self.repo.find_override(user_id=user.id, page_id=body.page_id) is not None:
            raise HTTPException(409, "An override already exists for this user and page")

        try:
            row = self.repo.insert_override(
                user_id=user.id,
                page_id=body.page_id,
                level=from_wire(body.level.value),
                reason=body.reason,
                granted_by=actor.firebase_uid,
                expires_at=body.expires_at,
            )
            grantee = user.name or user.firebase_uid
            self.repo.insert_audit(
                actor_uid=actor.firebase_uid,
                actor_name=actor.name,
                event="override.granted",
                detail=f"granted {body.level.value} on {body.page_id} to {grantee}",
            )
            self.repo.db.commit()
        except Exception as exc:
            self.repo.db.rollback()
            raise HTTPException(500, "Failed to grant override") from exc

        role_levels = self.repo.levels_for_role(role)
        return self._to_override_out(
            row,
            firebase_uid=user.firebase_uid,
            user_name=user.name,
            role=role,
            role_levels=role_levels,
            now=datetime.now(timezone.utc),
        )

    def revoke_override(self, override_id: uuid.UUID, *, actor: User) -> None:
        """404 if unknown. One audit row, one commit."""
        override = self.repo.get_override(override_id)
        if override is None:
            raise HTTPException(404, "Unknown override")

        try:
            self.repo.delete_override(override)
            self.repo.insert_audit(
                actor_uid=actor.firebase_uid,
                actor_name=actor.name,
                event="override.revoked",
                detail=f"revoked override on {override.page_id}",
            )
            self.repo.db.commit()
        except Exception as exc:
            self.repo.db.rollback()
            raise HTTPException(500, "Failed to revoke override") from exc

    # --- audit (BE-11) ---
    def list_audit(self, *, limit: int, before: datetime | None) -> list[AuditOut]:
        """Newest-first, keyset-paged on `before` (repo does `at < before`, so a
        row exactly at the boundary is excluded -- pages never overlap even with
        a concurrent insert). `actor_name` NULL (actor deleted) is never
        serialised as JSON null -- falls back to a display string."""
        return [
            AuditOut(
                id=row.id,
                at=row.at,
                actor_name=row.actor_name or "(deleted user)",
                event=row.event,
                detail=row.detail,
            )
            for row in self.repo.list_audit(limit=limit, before=before)
        ]
