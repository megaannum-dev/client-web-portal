"""0017_auth_status_columns

Revision ID: 817926e7604a
Revises: d06ece9f47be
Create Date: 2026-07-18 12:32:36.954995

Adds the R4 account-status + audit-trail columns to `users` (proposal 004 § 6,
revised 2026-07-18 — one shared two-value status column, not a per-profile-table
column, and not the originally-proposed three-value client status):
  * users.status          ENUM-as-VARCHAR(16): active|disabled, default disabled
  * users.authorized_by   nullable FK -> users.firebase_uid, ON DELETE SET NULL

client_profiles and admin_profiles get NO new columns from this migration.

Backfill (over LIVE data — row counts re-queried at migration time, NOT assumed
from any prior design-doc figure): ALL existing users (both portals) -> status='active'
(conscious grandfather decision: current users are not retroactively subjected to
the new compliance gate — see proposal § 4.11 / execution-scheduling-plan risk
register), ALL existing rows -> authorized_by=NULL (provenance unknown pre-rework).
Newly-onboarded clients going forward default to 'disabled' (Backend layer, BE-11);
newly-enrolled admins are explicitly created 'active' (Backend layer, BE-15).

MariaDB-only DDL (op.execute, AFTER-positioned columns). The SQLite test path
(create_all) never runs this revision.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "817926e7604a"
down_revision: Union[str, Sequence[str], None] = "d06ece9f47be"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _require(condition: bool, message: str) -> None:
    """L1 self-assertion: abort the migration rather than leave a half-migrated table."""
    if not condition:
        raise RuntimeError(f"0017 self-assertion failed: {message}")


def upgrade() -> None:
    conn = op.get_bind()

    # Pre-migration count, RE-QUERIED here (never hardcoded — see doc §2 precondition).
    users_count = conn.execute(sa.text("SELECT COUNT(*) FROM users")).scalar()

    # --- additive DDL, positioned before created_at/updated_at ---
    # NOTE: status defaults to 'disabled' here (new-row default for anything inserted
    # after this migration); the backfill below immediately sets every PRE-EXISTING
    # row to 'active' (grandfather decision), so this default only ever takes effect
    # for rows inserted from this point forward that don't explicitly override it
    # (i.e. new client onboarding — new admin enrollment explicitly passes 'active').
    op.execute(
        "ALTER TABLE users "
        "ADD COLUMN authorized_by CHAR(128) NULL AFTER portal"
    )
    op.execute(
        "ALTER TABLE users "
        "ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'disabled' AFTER authorized_by"
    )
    op.execute(
        "ALTER TABLE users ADD CONSTRAINT fk_users_authorized_by "
        "FOREIGN KEY (authorized_by) REFERENCES users(firebase_uid) ON DELETE SET NULL"
    )

    # --- backfill over LIVE data ---
    conn.execute(sa.text("UPDATE users SET status = 'active'"))
    conn.execute(sa.text("UPDATE users SET authorized_by = NULL"))

    # --- post-migration self-assertions (re-queried counts, not stale ones) ---
    _require(
        conn.execute(sa.text("SELECT COUNT(*) FROM users")).scalar() == users_count,
        "users row count changed during migration",
    )
    _require(
        conn.execute(
            sa.text("SELECT COUNT(*) FROM users WHERE status IS NULL")
        ).scalar() == 0,
        "users.status left NULL rows",
    )
    _require(
        conn.execute(
            sa.text("SELECT COUNT(*) FROM users WHERE status != 'active'")
        ).scalar() == 0,
        "not all pre-existing users rows backfilled to active",
    )
    _require(
        conn.execute(
            sa.text("SELECT COUNT(*) FROM users WHERE authorized_by IS NOT NULL")
        ).scalar() == 0,
        "authorized_by backfill left non-NULL rows",
    )

    # Column-position self-assertions (proposal § 6 placement rule).
    order = {
        name: pos
        for name, pos in conn.execute(
            sa.text(
                "SELECT COLUMN_NAME, ORDINAL_POSITION FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'"
            )
        ).fetchall()
    }
    _require(
        order["authorized_by"] == order["portal"] + 1,
        f"users.authorized_by at position {order['authorized_by']}, expected {order['portal'] + 1}",
    )
    _require(
        order["status"] == order["authorized_by"] + 1,
        f"users.status at position {order['status']}, expected {order['authorized_by'] + 1}",
    )
    _require(
        order["status"] < order["created_at"],
        f"users.status at position {order['status']} is not before created_at ({order['created_at']})",
    )


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP FOREIGN KEY fk_users_authorized_by")
    op.execute("ALTER TABLE users DROP COLUMN status")
    op.execute("ALTER TABLE users DROP COLUMN authorized_by")
