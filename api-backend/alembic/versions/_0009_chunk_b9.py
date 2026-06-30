# _0009_chunk_b9.py — B-9 index fragment
CREATE_INDEXES = """
CREATE INDEX ix_allocation_model_snapshots_user_period
    ON allocation_model_snapshots (user_id, period_id);
CREATE INDEX ix_model_changes_model_id_created_at
    ON model_changes (model_id, created_at DESC);
"""
DROP_INDEXES = """
DROP INDEX ix_allocation_model_snapshots_user_period
    ON allocation_model_snapshots;
DROP INDEX ix_model_changes_model_id_created_at
    ON model_changes;
"""
