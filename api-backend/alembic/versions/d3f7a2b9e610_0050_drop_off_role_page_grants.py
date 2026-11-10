"""0050_drop_off_role_page_grants

Revision ID: d3f7a2b9e610
Revises: c4e8a1d6f035
Create Date: 2026-11-09 00:00:00.000000

Data only. Removes three seeded page_access cells that grant a role a page it
does not work in (ruling R1, 2026-11-09):

- (pm.allotment-redemption, RM)  -- RM does not get Allotment & Redemption
- (compliance.review, PM)        -- PM does not get Compliance Review
- (compliance.overview, PM)      -- PM does not get Compliance Overview

Per-user page_access_overrides are not touched. Downgrade re-inserts the three
rows at 'view' (their seeded level); INSERT IGNORE keeps it idempotent against
UNIQUE(page_id, role).
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d3f7a2b9e610"
down_revision: Union[str, Sequence[str], None] = "c4e8a1d6f035"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CELLS = (
    ("pm.allotment-redemption", "RM"),
    ("compliance.review", "PM"),
    ("compliance.overview", "PM"),
)


def upgrade() -> None:
    """Upgrade schema."""
    for page_id, role in _CELLS:
        op.execute(f"DELETE FROM page_access WHERE page_id = '{page_id}' AND role = '{role}'")


def downgrade() -> None:
    """Downgrade schema."""
    for page_id, role in _CELLS:
        op.execute(
            f"INSERT IGNORE INTO page_access (page_id, role, level) "
            f"VALUES ('{page_id}', '{role}', 'view')"
        )
