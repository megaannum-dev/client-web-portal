# _0009_chunk_b3.py — B-3 DDL fragment
CREATE_TABLE = """
CREATE TABLE model_symbols (
    model_id CHAR(36) NOT NULL,
    symbol VARCHAR(32) NOT NULL,
    weight NUMERIC(28,10) NULL,
    PRIMARY KEY (model_id, symbol),
    CONSTRAINT fk_model_symbols_model FOREIGN KEY (model_id)
        REFERENCES models(id) ON DELETE CASCADE
);
"""
