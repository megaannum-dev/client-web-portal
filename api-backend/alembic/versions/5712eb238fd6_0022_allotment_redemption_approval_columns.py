"""0022 allotment redemption approval columns

Revision ID: 5712eb238fd6
Revises: deb8fd8a60b6
Create Date: 2026-07-22 00:00:00.000000

Adds 4 additive columns to client_allotment_redemptions supporting the
redemption approval workflow (proposal 016, Layer 1 findings B-1/B-2).
Purely additive: all new columns nullable or defaulted, no drops, no
type narrowing, no data migration. AllotRdmpStatus is widened in the
same change set (app/models/onboarding.py) — a VARCHAR(16)-backed,
native_enum=False column, so no enum-type ALTER is required here.

down_revision is deb8fd8a60b6 (0021_neutralize_recovered_head) per the
branch-hygiene rule established there: every new migration must rebase
against deb8fd8a60b6, never 02f0f4296350 directly.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "5712eb238fd6"
down_revision: Union[str, Sequence[str], None] = "deb8fd8a60b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "client_allotment_redemptions",
        sa.Column("reject_reason", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "client_allotment_redemptions",
        sa.Column("decided_by", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "client_allotment_redemptions",
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "client_allotment_redemptions",
        sa.Column(
            "emergent",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("client_allotment_redemptions", "emergent")
    op.drop_column("client_allotment_redemptions", "decided_at")
    op.drop_column("client_allotment_redemptions", "decided_by")
    op.drop_column("client_allotment_redemptions", "reject_reason")
