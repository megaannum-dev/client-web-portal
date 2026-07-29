"""0028_admin_access_control

Revision ID: 5cd1cc1948cc
Revises: b34f8c1a9d27
Create Date: 2026-07-29 00:00:00.000000

Proposal 019, Layer 1. Four new tables plus four new nullable columns, in one
revision (proposal § C):

  - page_access                 role→page standing level. UNIQUE (page_id, role).
                                2-value level enum ('view','edit') — NONE is the
                                absence of a row (D-3).
  - page_access_overrides       per-account exception. UNIQUE (user_id, page_id).
                                3-value level enum ('none','view','edit') — the
                                asymmetry with page_access is deliberate (D-3).
  - page_access_publications    one row per matrix publish; MAX(published_at) is
                                the optimistic-concurrency token (Backend C-5).
  - admin_audit_events          append-only admin trail; actor_name denormalised
                                so a row survives the actor's deletion.
  - users.last_sign_in_at       NULL = never signed in ⇒ StaffStatus INITIATED
                                is DERIVED, not a third AccountStatus value (D-4).
  - admin_profiles.department   the directory's Dept column.
  - admin_profiles.start_date   DATE (a calendar day, not a timestamp) — the
                                wizard's "Start date" field.
  - admin_profiles.address      TEXT — the wizard's "Correspondence address"
                                field. Both exist because StaffEnrollIn already
                                carries them; without columns the backend would
                                accept and silently discard them (B-4).

page_id is a plain VARCHAR(64) holding a PageId literal, deliberately NOT an FK:
the page registry (paths, labels, icons) is presentation code owned by
admin-frontend/lib/pages-config.ts (D-8).

The page_access seed (55 rows — 30 'edit', 25 'view' — transcribed from the
System Config catalog's level matrix per D-11, NOT from ROLE_PAGES) is added by
DB-7 in upgrade(). It deliberately changes day-one access; see DB-7.

downgrade() drops all four tables and all four columns, restoring the pre-019 schema
exactly. It is LOSSY — see the impl doc §9 and the proposal's Rollback section:
every published grant and override, the whole audit trail and every recorded
sign-in time are destroyed, and any deliberate VIEW/NONE restriction silently
becomes full access again.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "5cd1cc1948cc"
down_revision: Union[str, Sequence[str], None] = "b34f8c1a9d27"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- page_access ---------------------------------------------------------
    op.create_table(
        "page_access",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("page_id", sa.String(length=64), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("level", sa.String(length=16), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_unique_constraint(
        "uq_page_access_page_id_role", "page_access", ["page_id", "role"]
    )
    op.create_index("ix_page_access_role", "page_access", ["role"])

    # --- page_access_overrides ----------------------------------------------
    op.create_table(
        "page_access_overrides",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("page_id", sa.String(length=64), nullable=False),
        sa.Column("level", sa.String(length=16), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("granted_by", sa.String(length=128), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_foreign_key(
        "fk_page_access_overrides_user_id",
        "page_access_overrides",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_page_access_overrides_granted_by",
        "page_access_overrides",
        "users",
        ["granted_by"],
        ["firebase_uid"],
        ondelete="SET NULL",
    )
    op.create_unique_constraint(
        "uq_page_access_overrides_user_id_page_id",
        "page_access_overrides",
        ["user_id", "page_id"],
    )
    op.create_index(
        "ix_page_access_overrides_expires_at", "page_access_overrides", ["expires_at"]
    )

    # --- page_access_publications -------------------------------------------
    op.create_table(
        "page_access_publications",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "published_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("actor_uid", sa.String(length=128), nullable=True),
        sa.Column("actor_name", sa.String(length=255), nullable=True),
        sa.Column("change_count", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
    )
    op.create_foreign_key(
        "fk_page_access_publications_actor_uid",
        "page_access_publications",
        "users",
        ["actor_uid"],
        ["firebase_uid"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_page_access_publications_published_at",
        "page_access_publications",
        ["published_at"],
    )

    # --- admin_audit_events --------------------------------------------------
    op.create_table(
        "admin_audit_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("actor_uid", sa.String(length=128), nullable=True),
        sa.Column("actor_name", sa.String(length=255), nullable=True),
        sa.Column("event", sa.String(length=64), nullable=False),
        sa.Column("detail", sa.Text(), nullable=False),
    )
    op.create_foreign_key(
        "fk_admin_audit_events_actor_uid",
        "admin_audit_events",
        "users",
        ["actor_uid"],
        ["firebase_uid"],
        ondelete="SET NULL",
    )
    op.create_index("ix_admin_audit_events_at", "admin_audit_events", ["at"])

    # --- additive columns (DB-4) --------------------------------------------
    op.add_column(
        "users", sa.Column("last_sign_in_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "admin_profiles", sa.Column("department", sa.String(length=255), nullable=True)
    )
    op.add_column("admin_profiles", sa.Column("start_date", sa.Date(), nullable=True))
    op.add_column("admin_profiles", sa.Column("address", sa.Text(), nullable=True))

    # --- page_access seed (DB-7) — 55 literal rows ---------------------------
    # (see DB-7)


def downgrade() -> None:
    op.drop_column("admin_profiles", "address")
    op.drop_column("admin_profiles", "start_date")
    op.drop_column("admin_profiles", "department")
    op.drop_column("users", "last_sign_in_at")

    op.drop_index("ix_admin_audit_events_at", table_name="admin_audit_events")
    op.drop_table("admin_audit_events")          # drops its FK and PK with it

    op.drop_index(
        "ix_page_access_publications_published_at", table_name="page_access_publications"
    )
    op.drop_table("page_access_publications")

    op.drop_index(
        "ix_page_access_overrides_expires_at", table_name="page_access_overrides"
    )
    op.drop_table("page_access_overrides")

    op.drop_index("ix_page_access_role", table_name="page_access")
    op.drop_table("page_access")                 # takes the seed with it
