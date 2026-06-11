"""0003 uuid keys and column order

Revision ID: 8f2a1c9d4b6e
Revises: 79729eec2af4
Create Date: 2026-06-11 00:00:00.000000

Expand/contract migration (proposal/impl 005):
  * users.id              INT AUTOINCREMENT  -> CHAR(32) UUID  (Uuid(native_uuid=False))
  * {client,admin}_profiles.user_id  INT FK  -> CHAR(32) FK -> users.id
  * users.portal physically reordered to sit AFTER email (cosmetic).

Strategy: never ALTER a live PK in place. EXPAND with parallel CHAR(32) columns,
backfill from a Python int->uuid map (uuid4().hex), assert integrity, then CONTRACT
by swapping the columns and rebuilding the FKs. assigned_rm_uid -> users.firebase_uid
is untouched (it references firebase_uid, not id).

MariaDB-only DDL (op.execute). The test suite builds the schema via create_all on
SQLite and never runs this revision, so dialect-specific SQL here is intentional.
"""

from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8f2a1c9d4b6e"
down_revision: Union[str, Sequence[str], None] = "79729eec2af4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PROFILES = ("client_profiles", "admin_profiles")


def _require(condition: bool, message: str) -> None:
    """L1 self-assertion: abort the migration (rolls back the transaction on
    transactional-DDL engines) rather than leaving a half-migrated table."""
    if not condition:
        raise RuntimeError(f"0003 self-assertion failed: {message}")


def _fk_name(conn, table: str, column: str, ref_table: str) -> str:
    """Resolve the live FK constraint name for table.column -> ref_table.
    Names are engine-generated (e.g. client_profiles_ibfk_1), so they must be
    looked up rather than hard-coded. Scoped to the referenced table so the
    client_profiles.assigned_rm_uid FK is never matched."""
    row = conn.execute(
        sa.text(
            "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t "
            "AND COLUMN_NAME = :c AND REFERENCED_TABLE_NAME = :rt"
        ),
        {"t": table, "c": column, "rt": ref_table},
    ).fetchone()
    _require(row is not None, f"FK for {table}.{column} -> {ref_table} not found")
    return row[0]


def upgrade() -> None:
    conn = op.get_bind()

    # Pre-migration counts (compared again at the end).
    users_count = conn.execute(sa.text("SELECT COUNT(*) FROM users")).scalar()
    profile_counts = {
        t: conn.execute(sa.text(f"SELECT COUNT(*) FROM {t}")).scalar()
        for t in _PROFILES
    }

    # ----------------------------------------------------------------- EXPAND
    # 1-2. users.uuid parallel column + Python-generated backfill.
    op.execute("ALTER TABLE users ADD COLUMN uuid CHAR(32) NULL")
    ids = [r[0] for r in conn.execute(sa.text("SELECT id FROM users")).fetchall()]
    id_map = {i: uuid.uuid4().hex for i in ids}
    for old_id, new_uuid in id_map.items():
        conn.execute(
            sa.text("UPDATE users SET uuid = :u WHERE id = :i"),
            {"u": new_uuid, "i": old_id},
        )
    _require(
        conn.execute(sa.text("SELECT COUNT(*) FROM users WHERE uuid IS NULL")).scalar()
        == 0,
        "users.uuid backfill left NULLs",
    )
    _require(
        conn.execute(sa.text("SELECT COUNT(DISTINCT uuid) FROM users")).scalar()
        == users_count,
        "users.uuid backfill produced duplicates",
    )

    # 3. Enforce uniqueness at the DB level during the dangerous window.
    op.execute("ALTER TABLE users ADD UNIQUE KEY ux_users_uuid (uuid)")

    # 4-5. Parallel profile FK columns, backfilled by joining on the old int id.
    for table in _PROFILES:
        op.execute(f"ALTER TABLE {table} ADD COLUMN user_uuid CHAR(32) NULL")
        conn.execute(
            sa.text(
                f"UPDATE {table} p JOIN users u ON p.user_id = u.id "
                "SET p.user_uuid = u.uuid"
            )
        )
        _require(
            conn.execute(
                sa.text(f"SELECT COUNT(*) FROM {table} WHERE user_uuid IS NULL")
            ).scalar()
            == 0,
            f"{table}.user_uuid backfill left NULLs (orphan profile?)",
        )

    # --------------------------------------------------------------- CONTRACT
    # 6. Drop the old int FKs (resolved by name; assigned_rm_uid FK preserved).
    for table in _PROFILES:
        op.execute(
            f"ALTER TABLE {table} DROP FOREIGN KEY {_fk_name(conn, table, 'user_id', 'users')}"
        )

    # 7. Rebuild users PK on the UUID column.
    #    Strip AUTO_INCREMENT first (an AI column must remain a key, so it cannot
    #    survive the DROP PRIMARY KEY in the same step otherwise).
    op.execute("ALTER TABLE users DROP INDEX ux_users_uuid")
    op.execute("ALTER TABLE users MODIFY COLUMN id INT NOT NULL")
    # CHANGE ... FIRST repositions the renamed column to the head of the table;
    # without FIRST, id would inherit uuid's appended (last) position.
    op.execute(
        "ALTER TABLE users "
        "DROP PRIMARY KEY, "
        "DROP COLUMN id, "
        "CHANGE COLUMN uuid id CHAR(32) NOT NULL FIRST, "
        "ADD PRIMARY KEY (id)"
    )

    # 8. Swap each profile's int user_id for the UUID column + rebuild FK.
    #    AFTER id keeps user_id at column 2 (its pre-0003 position); without it the
    #    renamed column would inherit user_uuid's appended (last) position.
    for table in _PROFILES:
        op.execute(
            f"ALTER TABLE {table} "
            "DROP COLUMN user_id, "
            "CHANGE COLUMN user_uuid user_id CHAR(32) NOT NULL AFTER id, "
            f"ADD UNIQUE KEY ux_{table}_user_id (user_id), "
            f"ADD CONSTRAINT fk_{table}_user FOREIGN KEY (user_id) REFERENCES users(id)"
        )

    # 9. Cosmetic reorder: portal after email.
    op.execute(
        "ALTER TABLE users MODIFY COLUMN portal VARCHAR(16) NOT NULL AFTER email"
    )

    # 10. Post-migration self-assertions (L1).
    pk_type = conn.execute(
        sa.text(
            "SELECT DATA_TYPE FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' "
            "AND COLUMN_NAME = 'id'"
        )
    ).scalar()
    _require(pk_type == "char", f"users.id type is {pk_type!r}, expected char")

    # Column order: id first, portal immediately after email.
    order = {
        name: pos
        for name, pos in conn.execute(
            sa.text(
                "SELECT COLUMN_NAME, ORDINAL_POSITION FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'"
            )
        ).fetchall()
    }
    _require(order["id"] == 1, f"users.id at position {order['id']}, expected 1")
    _require(
        order["portal"] == order["email"] + 1,
        f"users.portal at {order['portal']}, expected email+1 ({order['email'] + 1})",
    )

    _require(
        conn.execute(sa.text("SELECT COUNT(*) FROM users")).scalar() == users_count,
        "users row count changed during migration",
    )
    for table in _PROFILES:
        _require(
            conn.execute(sa.text(f"SELECT COUNT(*) FROM {table}")).scalar()
            == profile_counts[table],
            f"{table} row count changed during migration",
        )
        # Raises if the new FK is missing.
        _fk_name(conn, table, "user_id", "users")
        user_id_pos = conn.execute(
            sa.text(
                "SELECT ORDINAL_POSITION FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t "
                "AND COLUMN_NAME = 'user_id'"
            ),
            {"t": table},
        ).scalar()
        _require(
            user_id_pos == 2, f"{table}.user_id at position {user_id_pos}, expected 2"
        )
        _require(
            conn.execute(
                sa.text(
                    f"SELECT COUNT(*) FROM {table} p "
                    "LEFT JOIN users u ON p.user_id = u.id WHERE u.id IS NULL"
                )
            ).scalar()
            == 0,
            f"{table} has orphan rows after migration",
        )


def downgrade() -> None:
    """Reverse to int AUTOINCREMENT keys. DEV-ONLY: original integer ids are NOT
    preserved on round-trip — fresh sequential ints are assigned (ordered by
    created_at, id)."""
    conn = op.get_bind()

    # Parallel int column on users, sequential backfill.
    op.execute("ALTER TABLE users ADD COLUMN id_int INT NULL")
    rows = conn.execute(
        sa.text("SELECT id FROM users ORDER BY created_at, id")
    ).fetchall()
    for n, (uid_pk,) in enumerate(rows, start=1):
        conn.execute(
            sa.text("UPDATE users SET id_int = :n WHERE id = :i"),
            {"n": n, "i": uid_pk},
        )

    # Parallel int FK columns on profiles, mapped via the UUID.
    for table in _PROFILES:
        op.execute(f"ALTER TABLE {table} ADD COLUMN user_id_int INT NULL")
        conn.execute(
            sa.text(
                f"UPDATE {table} p JOIN users u ON p.user_id = u.id "
                "SET p.user_id_int = u.id_int"
            )
        )
        op.execute(
            f"ALTER TABLE {table} DROP FOREIGN KEY {_fk_name(conn, table, 'user_id', 'users')}"
        )

    # Rebuild users PK as int AUTOINCREMENT. FIRST restores the pre-0003 position.
    op.execute(
        "ALTER TABLE users "
        "DROP PRIMARY KEY, "
        "DROP COLUMN id, "
        "CHANGE COLUMN id_int id INT NOT NULL AUTO_INCREMENT FIRST, "
        "ADD PRIMARY KEY (id)"
    )

    # Rebuild profile int FKs (AFTER id restores user_id to column 2).
    for table in _PROFILES:
        op.execute(
            f"ALTER TABLE {table} "
            "DROP COLUMN user_id, "
            "CHANGE COLUMN user_id_int user_id INT NOT NULL AFTER id, "
            f"ADD UNIQUE KEY ux_{table}_user_id (user_id), "
            f"ADD CONSTRAINT fk_{table}_user FOREIGN KEY (user_id) REFERENCES users(id)"
        )

    # Restore portal to its pre-0003 physical position (end of table).
    op.execute(
        "ALTER TABLE users MODIFY COLUMN portal VARCHAR(16) NOT NULL AFTER updated_at"
    )
