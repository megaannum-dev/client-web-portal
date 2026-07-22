"""0023 allotment redemption expected_cash_out

Revision ID: 9c4a1e7d2b3f
Revises: 5712eb238fd6
Create Date: 2026-07-22 00:00:01.000000

Adds one additive column to client_allotment_redemptions: expected_cash_out
(redemption's settlement-date counterpart to the existing expected_cash_in).
Gap-fix discovered while implementing proposal 016's Backend layer -- BE-2's
widened create_allotment contract and BE-3's redemption submit both require
storing this value, but the prior migration (5712eb238fd6) only covered
reject_reason/decided_by/decided_at/emergent. Nullable, no drops, no type
narrowing -- not part of the frozen §7 seam (not yet exposed on AllotRdmptDTO).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "9c4a1e7d2b3f"
down_revision: Union[str, Sequence[str], None] = "5712eb238fd6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "client_allotment_redemptions",
        sa.Column("expected_cash_out", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("client_allotment_redemptions", "expected_cash_out")
