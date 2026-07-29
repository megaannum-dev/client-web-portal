# api-backend/app/models/access.py
import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
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


# --------- DB-2 — page_access_overrides ---------
class PageAccessOverride(Base):
    """A per-account exception to the role's standing level. At most one per
    (user, page). `level = NONE` revokes a page for one person even though their
    role holds it — which is why this table's enum has three values and
    `page_access`'s has two (proposal D-3)."""

    __tablename__ = "page_access_overrides"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    # CASCADE, not SET NULL: an override without a subject is meaningless.
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    page_id: Mapped[str] = mapped_column(String(64), nullable=False)  # PageId literal, no FK (D-8)
    level: Mapped[OverrideLevel] = mapped_column(
        SAEnum(
            OverrideLevel,
            native_enum=False,
            length=16,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    # App-enforced non-empty (422 at the API boundary) — no CHECK constraint, so
    # the error surfaces as a validation message rather than a DB integrity error.
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    # SET NULL, matching the User.authorized_by convention (users.py:73-81): the
    # override outlives the granter's account.
    granted_by: Mapped[str | None] = mapped_column(
        String(128),
        ForeignKey("users.firebase_uid", ondelete="SET NULL"),
        nullable=True,
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )  # NULL = no expiry
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "page_id", name="uq_page_access_overrides_user_id_page_id"),
        Index("ix_page_access_overrides_expires_at", "expires_at"),
    )


# --------- DB-3 — page_access_publications ---------
class PageAccessPublication(Base):
    """One row per matrix publish. Doubles as the optimistic-concurrency token:
    MatrixPublishIn.base_published_at must equal MAX(published_at) or the write
    is rejected 409 (proposal Backend C-5)."""

    __tablename__ = "page_access_publications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    actor_uid: Mapped[str | None] = mapped_column(
        String(128),
        ForeignKey("users.firebase_uid", ondelete="SET NULL"),
        nullable=True,
    )
    # Denormalised on purpose: the publication must still read correctly after the
    # actor's account is gone. Same rule as admin_audit_events.actor_name.
    actor_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    change_count: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)  # PublishModal's "Change note"

    __table_args__ = (Index("ix_page_access_publications_published_at", "published_at"),)


# --------- DB-3 — admin_audit_events ---------
class AdminAuditEvent(Base):
    """Append-only admin audit trail. Same shape as `model_symbol_audit`
    (proposal 008) — the existing pattern for an append-only trail in this
    codebase; no new convention. Display-only: `event` and `detail` are composed
    by the Backend and rendered verbatim."""

    __tablename__ = "admin_audit_events"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    actor_uid: Mapped[str | None] = mapped_column(
        String(128),
        ForeignKey("users.firebase_uid", ondelete="SET NULL"),
        nullable=True,
    )
    actor_name: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )  # denormalised, as above
    # 'account.created', 'access.published', 'override.granted', …
    event: Mapped[str] = mapped_column(String(64), nullable=False)
    detail: Mapped[str] = mapped_column(Text, nullable=False)  # already-composed display string

    __table_args__ = (Index("ix_admin_audit_events_at", "at"),)
