# app/libs/access/service.py
from __future__ import annotations

from typing import Final

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.libs.access.pages import PAGE_IDS, PAGE_META
from app.libs.access.repository import AccessRepository, to_wire
from app.libs.access.schemas import (
    MatrixCellOut,
    MatrixOut,
    MatrixPageOut,
    MatrixPublishIn,
    MatrixRoleOut,
    PublishedMetaOut,
)
from app.models.access import AccessLevel as DbAccessLevel
from app.models.users import AdminRole, User

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
