"""0032_admin_profiles_pk

Revision ID: d3f8a2c6e910
Revises: a3f7c1d9e824
Create Date: 2026-08-04 00:00:00.000000

Backfills a tracked migration for a schema change that was applied directly
against the dev database (raw DDL, no revision) alongside an in-place edit to
`app/models/users.py::AdminProfile`: `admin_profiles` drops its surrogate
`id` (INT AUTO_INCREMENT PRIMARY KEY, created at 79729eec2af4/0002:65) and
promotes `user_id` (already NOT NULL + unique) to the primary key.

Same rationale and mechanics as a3f7c1d9e824/0031's DB-5 unit
(client_profiles), applied here to admin_profiles: strip AUTO_INCREMENT in
its own statement first (an AUTO_INCREMENT column must remain part of a
key), swap the primary key, then drop the now-redundant unique index only
AFTER the new PK exists so fk_admin_profiles_user is never left without a
backing index (the 1553 hazard b34f8c1a9d27/0027's downgrade() has already
been fixed for -- see b34f8c1a9d27:61-68 and its own docstring note).

This migration is being AUTHORED to make an already-applied dev-DB change
reproducible in every other environment; it has not been run anywhere as
of this revision's authoring -- the dev database it describes already has
this shape from the earlier raw-DDL edit. Running it there is idempotent
with respect to the end state but the pre-condition/post-condition
self-asserts below still hold on a database at true head a3f7c1d9e824
(id present, user_id unique-but-not-PK).

No inbound foreign key references admin_profiles.id today (verified via
information_schema.KEY_COLUMN_USAGE against the current dev database before
authoring this revision), so this is schema-only -- no data is at risk and
downgrade() restores an INT AUTO_INCREMENT id exactly as DB-5 does for
client_profiles (renumbered from 1, values not preserved -- nothing reads
this column; see admin_profiles.id's absence from every query in
app/libs/access, app/libs/staff, app/libs/onboarding, app/libs/clients,
app/libs/client_portal, app/libs/trade_models, app/libs/users, all of which
already key exclusively off user_id).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d3f8a2c6e910"
down_revision: Union[str, Sequence[str], None] = "a3f7c1d9e824"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(f"0032 self-assertion failed: {message}")


def upgrade() -> None:
    conn = op.get_bind()

    ap_row_count = conn.execute(sa.text("SELECT COUNT(*) FROM admin_profiles")).scalar()

    # Step 1: pre-condition -- no inbound FK onto admin_profiles.id.
    inbound = conn.execute(
        sa.text(
            "SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE "
            "WHERE TABLE_SCHEMA = DATABASE() "
            "AND REFERENCED_TABLE_NAME = 'admin_profiles' "
            "AND REFERENCED_COLUMN_NAME = 'id'"
        )
    ).scalar()
    _require(inbound == 0, f"admin_profiles.id has {inbound} inbound FK(s); cannot drop")

    # Step 2: strip AUTO_INCREMENT first (an AI column must remain a key),
    # then swap the PK, then drop the now-redundant unique key -- only AFTER
    # the new PK exists, so fk_admin_profiles_user is never left without a
    # backing index.
    op.execute("ALTER TABLE admin_profiles MODIFY COLUMN id INT NOT NULL")
    op.execute(
        "ALTER TABLE admin_profiles "
        "DROP PRIMARY KEY, "
        "DROP COLUMN id, "
        "ADD PRIMARY KEY (user_id)"
    )
    op.execute("ALTER TABLE admin_profiles DROP INDEX ux_admin_profiles_user_id")

    # Step 3: post-condition self-assertions.
    pk_cols = [
        r[0]
        for r in conn.execute(
            sa.text(
                "SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_profiles' "
                "AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION"
            )
        ).fetchall()
    ]
    _require(pk_cols == ["user_id"], f"admin_profiles PK is {pk_cols}, expected ['user_id']")
    _require(
        conn.execute(sa.text("SELECT COUNT(*) FROM admin_profiles")).scalar() == ap_row_count,
        "admin_profiles row count changed during migration",
    )
    _require(
        conn.execute(
            sa.text(
                "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_profiles' "
                "AND COLUMN_NAME = 'user_id' AND REFERENCED_TABLE_NAME = 'users'"
            )
        ).scalar()
        is not None,
        "fk_admin_profiles_user no longer resolves after PK swap",
    )


def downgrade() -> None:
    # Order matters: the unique key is re-added BEFORE the PK is dropped, so
    # fk_admin_profiles_user always has a backing index (same ordering as
    # a3f7c1d9e824/0031 DB-5's downgrade()).
    op.execute("ALTER TABLE admin_profiles ADD UNIQUE KEY ux_admin_profiles_user_id (user_id)")
    op.execute(
        "ALTER TABLE admin_profiles "
        "DROP PRIMARY KEY, "
        "ADD COLUMN id INT NOT NULL AUTO_INCREMENT FIRST, "
        "ADD PRIMARY KEY (id)"
    )
    # Reversible in schema, not in values: MySQL renumbers id from 1 on
    # re-creation. Nothing reads the original integers (see module docstring).
