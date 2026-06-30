# _0009_chunk_b2.py — B-2 DDL fragment
ADD_COLUMNS = """
ALTER TABLE model_materials ADD COLUMN version_no INT NOT NULL DEFAULT 0;
-- Dialect note: CAST(... AS UNSIGNED) is MySQL/MariaDB; use CAST(... AS INTEGER) for SQLite
UPDATE model_materials SET version_no = COALESCE(CAST(SUBSTR(version, 2) AS UNSIGNED), 0);
"""
