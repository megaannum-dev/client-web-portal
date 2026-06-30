# _0009_chunk_b1b.py — B-1b DDL fragment, assembled into 0009 by the migration agent
ADD_COLUMNS = """
ALTER TABLE models ADD COLUMN description TEXT NULL;
ALTER TABLE models ADD COLUMN underlyings TEXT NULL;
ALTER TABLE models ADD COLUMN risk TEXT NULL;
ALTER TABLE models ADD COLUMN liquidity VARCHAR(255) NULL;
ALTER TABLE models ADD COLUMN reporting VARCHAR(255) NULL;
ALTER TABLE models ADD COLUMN nav_perf VARCHAR(255) NULL;
ALTER TABLE models ADD COLUMN mgmt_fee NUMERIC(9,6) NULL;
ALTER TABLE models ADD COLUMN incentive_fee NUMERIC(9,6) NULL;
"""