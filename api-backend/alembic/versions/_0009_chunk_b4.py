# _0009_chunk_b4.py — B-4 DDL fragment
CREATE_TABLE = """
CREATE TABLE allocation_period_models (
    period_id CHAR(36) NOT NULL,
    model_id CHAR(36) NOT NULL,
    model_name VARCHAR(255) NOT NULL,
    model_size NUMERIC(28,10) NOT NULL,
    PRIMARY KEY (period_id, model_id),
    CONSTRAINT fk_apm_period FOREIGN KEY (period_id)
        REFERENCES allocation_periods(id) ON DELETE CASCADE,
    CONSTRAINT fk_apm_model FOREIGN KEY (model_id)
        REFERENCES models(id) ON DELETE CASCADE
);
"""
DROP_COLUMN = """
ALTER TABLE allocation_model_snapshots DROP COLUMN model_size;
"""
BACKFILL = """
INSERT INTO allocation_period_models (period_id, model_id, model_name, model_size)
SELECT DISTINCT
    ams.period_id,
    ams.model_id,
    m.name          AS model_name,
    ams.model_size  AS model_size
FROM allocation_model_snapshots ams
JOIN models m ON m.id = ams.model_id
WHERE ams.model_size IS NOT NULL;
"""
