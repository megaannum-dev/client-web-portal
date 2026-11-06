"""0049_merge_pc_role_into_pm

Revision ID: c4e8a1d6f035
Revises: b7d2e9f4a1c3
Create Date: 2026-11-05 00:00:00.000000

The staff role PC is merged into PM (PM keeps every PC permission). Data only,
no schema change except the temporary backup table:

- page_access.role PC -> PM (where a page already has a PM row, PM is raised to
  the higher level and the PC duplicate is deleted: UNIQUE(page_id, role)).
- admin_profiles.role, ic_notes.uploaded_by_role, sop_versions.uploaded_by_role
  PC -> PM.
- client_allotment_redemptions.status awaiting_pc -> awaiting_pm.
- page ids pc.* -> pm.* in page_access and page_access_overrides.

NOT touched: admin_audit_events.detail and page_access_publications (history).

Every value overwritten or deleted is first snapshotted into
pc_role_merge_backup_0049 so downgrade is lossless for rows that existed before
the upgrade. Rows created AFTER the upgrade (new PM users / grants) stay PM on
downgrade. Full disaster recovery is the dump
api-backend/db-backups/portal_pre-0049_2026-11-05.sql.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4e8a1d6f035"
down_revision: Union[str, Sequence[str], None] = "b7d2e9f4a1c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _x(sql: str) -> None:
    op.execute(sa.text(sql))


def upgrade() -> None:
    """Upgrade schema."""
    # 0. Snapshot everything the steps below overwrite or delete.
    _x(
        "CREATE TABLE pc_role_merge_backup_0049 ("
        "id INT AUTO_INCREMENT PRIMARY KEY, "
        "tbl VARCHAR(64) NOT NULL, pk VARCHAR(64) NOT NULL, col VARCHAR(64) NOT NULL, "
        "old_value VARCHAR(64) NULL, extra VARCHAR(255) NULL)"
    )
    # every PC grant: enough to re-insert it if it is deleted as a duplicate
    _x(
        "INSERT INTO pc_role_merge_backup_0049 (tbl, pk, col, old_value, extra) "
        "SELECT 'page_access', id, 'row', level, page_id FROM page_access WHERE role = 'PC'"
    )
    # PM rows step 1 will raise
    _x(
        "INSERT INTO pc_role_merge_backup_0049 (tbl, pk, col, old_value) "
        "SELECT 'page_access', pm.id, 'level', pm.level "
        "FROM page_access pm JOIN page_access pc ON pc.page_id = pm.page_id AND pc.role = 'PC' "
        "WHERE pm.role = 'PM' AND pm.level = 'view' AND pc.level = 'edit'"
    )
    _x(
        "INSERT INTO pc_role_merge_backup_0049 (tbl, pk, col, old_value) "
        "SELECT 'admin_profiles', user_id, 'role', role FROM admin_profiles WHERE role = 'PC'"
    )
    _x(
        "INSERT INTO pc_role_merge_backup_0049 (tbl, pk, col, old_value) "
        "SELECT 'ic_notes', id, 'uploaded_by_role', uploaded_by_role "
        "FROM ic_notes WHERE uploaded_by_role = 'PC'"
    )
    _x(
        "INSERT INTO pc_role_merge_backup_0049 (tbl, pk, col, old_value) "
        "SELECT 'sop_versions', id, 'uploaded_by_role', uploaded_by_role "
        "FROM sop_versions WHERE uploaded_by_role = 'PC'"
    )

    # 1. Collisions: PM takes the higher level (AccessLevel is only view < edit),
    #    then the PC duplicate goes (MariaDB multi-table DELETE).
    _x(
        "UPDATE page_access pm JOIN page_access pc "
        "ON pc.page_id = pm.page_id AND pc.role = 'PC' "
        "SET pm.level = 'edit' "
        "WHERE pm.role = 'PM' AND pm.level = 'view' AND pc.level = 'edit'"
    )
    _x(
        "DELETE pc FROM page_access pc JOIN page_access pm "
        "ON pm.page_id = pc.page_id AND pm.role = 'PM' WHERE pc.role = 'PC'"
    )

    # 2-5. Role / status moves.
    _x("UPDATE page_access SET role = 'PM' WHERE role = 'PC'")
    _x("UPDATE admin_profiles SET role = 'PM' WHERE role = 'PC'")
    _x("UPDATE ic_notes SET uploaded_by_role = 'PM' WHERE uploaded_by_role = 'PC'")
    _x("UPDATE sop_versions SET uploaded_by_role = 'PM' WHERE uploaded_by_role = 'PC'")
    _x(
        "UPDATE client_allotment_redemptions SET status = 'awaiting_pm' "
        "WHERE status = 'awaiting_pc'"
    )

    # 6. Page ids pc.* -> pm.*. No UNIQUE collision: no pm.* page ids exist yet,
    #    so neither UNIQUE(page_id, role) nor UNIQUE(user_id, page_id) can clash.
    #    (LIKE 'pc.%': '.' is literal in LIKE; '_' would be the wildcard.)
    for table in ("page_access", "page_access_overrides"):
        _x(
            f"UPDATE {table} SET page_id = CONCAT('pm.', SUBSTRING(page_id, 4)) "
            "WHERE page_id LIKE 'pc.%'"
        )


def downgrade() -> None:
    """Downgrade schema."""
    # Reverse 6 and 5 (reversible by rule).
    for table in ("page_access", "page_access_overrides"):
        _x(
            f"UPDATE {table} SET page_id = CONCAT('pc.', SUBSTRING(page_id, 4)) "
            "WHERE page_id LIKE 'pm.%'"
        )
    _x(
        "UPDATE client_allotment_redemptions SET status = 'awaiting_pc' "
        "WHERE status = 'awaiting_pm'"
    )

    # Restore from the snapshot. Key comparisons are BINARY: the backup table takes the
    # server default collation (uca1400) while the app tables are utf8mb4_unicode_ci,
    # and MariaDB refuses `=` across the two (error 1267). Keys are ASCII ids/UUIDs.
    # raised PM levels first
    _x(
        "UPDATE page_access pa JOIN pc_role_merge_backup_0049 b "
        "ON b.tbl = 'page_access' AND b.col = 'level' "
        "AND BINARY b.pk = BINARY CAST(pa.id AS CHAR) "
        "SET pa.level = b.old_value"
    )
    # surviving PC rows back to PC (their page_id was already restored above)
    _x(
        "UPDATE page_access pa JOIN pc_role_merge_backup_0049 b "
        "ON b.tbl = 'page_access' AND b.col = 'row' "
        "AND BINARY b.pk = BINARY CAST(pa.id AS CHAR) "
        "SET pa.role = 'PC'"
    )
    # re-insert the PC rows deleted as duplicates (their PC slot is free now)
    _x(
        "INSERT INTO page_access (id, page_id, role, level) "
        "SELECT CAST(b.pk AS UNSIGNED), b.extra, 'PC', b.old_value "
        "FROM pc_role_merge_backup_0049 b "
        "LEFT JOIN page_access pa ON BINARY CAST(pa.id AS CHAR) = BINARY b.pk "
        "WHERE b.tbl = 'page_access' AND b.col = 'row' AND pa.id IS NULL"
    )
    _x(
        "UPDATE admin_profiles t JOIN pc_role_merge_backup_0049 b "
        "ON b.tbl = 'admin_profiles' AND BINARY b.pk = BINARY t.user_id SET t.role = 'PC'"
    )
    _x(
        "UPDATE ic_notes t JOIN pc_role_merge_backup_0049 b "
        "ON b.tbl = 'ic_notes' AND BINARY b.pk = BINARY t.id SET t.uploaded_by_role = 'PC'"
    )
    _x(
        "UPDATE sop_versions t JOIN pc_role_merge_backup_0049 b "
        "ON b.tbl = 'sop_versions' AND BINARY b.pk = BINARY t.id SET t.uploaded_by_role = 'PC'"
    )

    _x("DROP TABLE pc_role_merge_backup_0049")
