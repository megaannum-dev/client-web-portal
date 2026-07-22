"""0021 neutralize recovered head

Revision ID: deb8fd8a60b6
Revises: 02f0f4296350
Create Date: 2026-07-22 00:00:00.000000

No-op checkpoint, same pattern as b1c2d3e4f5a6_0019_merge_heads.py.

Context: the live `portal` database was restored from a backup after
02f0f4296350 (0020_eod_records) was applied, and some columns were
subsequently reconciled back onto the live schema BY HAND (outside Alembic)
to match what the branch/history at the time expected. The live schema was
independently verified (2026-07-22, via `alembic.autogenerate.compare_metadata`
against the current ORM models, plus manual `DESCRIBE` on `eod_records`,
`eod_break_records`, `client_portfolios`, `client_subscriptions`) to match
column-for-column what 02f0f4296350 and every migration before it define --
so this is NOT a schema-drift fix.

The concern this revision addresses is branch/history hygiene: several
long-lived DB-layer topic branches (e.g. trade-reconciliation-integration-db,
rework-authentication-module-db, patching-post-allocation,
historical-view-posttrade-alloc, editable-allocation-matrix,
pc-workspace-refactor-enhance) predate 0020 and do not carry it. Any of them
merging independently risks reproducing the same multi-head situation that
b1c2d3e4f5a6 (0019) already had to clean up once. This revision draws a firm
line: 02f0f4296350 is the last revision those stale branches can be trusted
to rebase against blind; every NEW migration (0022+, including proposal 016's
DB layer) must be authored with down_revision = "deb8fd8a60b6", never
"02f0f4296350" directly, so a stale branch resurrecting 02f0f4296350 as a
down_revision immediately surfaces as a second head instead of silently
racing this one.

No schema change. upgrade()/downgrade() are both pass.
"""

from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = "deb8fd8a60b6"
down_revision: Union[str, Sequence[str], None] = "02f0f4296350"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
