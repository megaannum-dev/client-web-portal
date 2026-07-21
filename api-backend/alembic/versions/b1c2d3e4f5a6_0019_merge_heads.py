"""0019 merge heads

Revision ID: b1c2d3e4f5a6
Revises: e183474e6b91, fa0eb74e7dac
Create Date: 2026-07-21 00:00:00.000000

No-op merge: 0018_client_onboarding and 0018_pta_run_settle_date both branched
off 817926e7604a independently (unrelated tables/columns, no conflict). This
merges the two heads back into one line.
"""

from typing import Sequence, Union

revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = ("e183474e6b91", "fa0eb74e7dac")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
