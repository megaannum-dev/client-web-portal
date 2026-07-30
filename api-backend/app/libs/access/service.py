# app/libs/access/service.py
from __future__ import annotations

from typing import Final

from sqlalchemy.orm import Session

from app.libs.access.pages import PAGE_IDS, PAGE_META
from app.libs.access.repository import AccessRepository, to_wire
from app.libs.access.schemas import (
    MatrixCellOut,
    MatrixOut,
    MatrixPageOut,
    MatrixRoleOut,
    PublishedMetaOut,
)
from app.models.users import AdminRole

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
