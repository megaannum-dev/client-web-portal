# api-backend/app/models/access.py
import enum
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.users import AdminRole


class AccessLevel(str, enum.Enum):
    """Standing role→page level. TWO values only.

    `NONE` is deliberately absent: on the matrix, "no grant" and "no row" are the
    same statement, so a revoked cell is a DELETE, never a stored value (proposal
    D-3). The asymmetry with `OverrideLevel` — which DOES carry `NONE` — is
    intentional: on a per-account override, `NONE` is an active statement
    ("revoke this page for this one person even though their role has it"), and
    row-absence cannot express it because absence already means "fall back to the
    role default".
    """

    VIEW = "view"
    EDIT = "edit"


class OverrideLevel(str, enum.Enum):
    """Per-account override level. THREE values — see AccessLevel's docstring for
    why this table carries `NONE` and `page_access` does not (proposal D-3)."""

    NONE = "none"
    VIEW = "view"
    EDIT = "edit"


# --------- DB-1 — page_access ---------
class PageAccess(Base):
    """Standing access level for one (page, role) pair. The sole authority for
    role→page access after proposal 019; replaces both `ROLE_ACTIONS`
    (api-backend) and `ROLE_PAGES` (admin-frontend)."""

    __tablename__ = "page_access"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # A PageId literal (e.g. "pc.allocation-matrix"). Deliberately NOT an FK to a
    # pages table: the page registry (paths, labels, icons, grouping) is
    # presentation code owned by admin-frontend/lib/pages-config.ts and does not
    # belong in the DB (proposal D-8). A row whose page_id is no longer a known
    # PageId is ignored by the backend resolver and reported by the registry test.
    page_id: Mapped[str] = mapped_column(String(64), nullable=False)
    role: Mapped[AdminRole] = mapped_column(
        SAEnum(
            AdminRole,
            native_enum=False,
            length=32,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    level: Mapped[AccessLevel] = mapped_column(
        SAEnum(
            AccessLevel,
            native_enum=False,
            length=16,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("page_id", "role", name="uq_page_access_page_id_role"),
        Index("ix_page_access_role", "role"),
    )
