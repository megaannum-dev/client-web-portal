"""0035_awaiting_reprovision_flag

Revision ID: a1b8f4d27c53
Revises: 9d1c4a7e6b52
Create Date: 2026-08-13 12:00:00

Adds client_onboardings.awaiting_reprovision -- True while a cycle sits at
status="pending_review" waiting on re-provisioned KYC documents (Compliance's
ad-hoc request, or the renewal scheduler's periodic sweep), as opposed to having
been rejected. Both cases share the same status value, so nothing on the wire
could previously tell them apart and the admin-frontend labelled a re-provision
request "Rejected".

ponytail: this column stands in for a missing fifth OnboardingStatus. It is
deliberately temporary -- collapse it into the status enum next time the
onboarding status machine is reworked, and drop the column then.

Backfill: existing pending_review rows are left at the default false, i.e. read
as rejections. That is correct for the only rows that can exist today -- the
ad-hoc route is new, and a scheduler-reopened row was already being displayed as
a rejection before this migration, so nothing regresses.
"""

import logging
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "a1b8f4d27c53"
down_revision: Union[str, Sequence[str], None] = "9d1c4a7e6b52"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")


def upgrade() -> None:
    op.add_column(
        "client_onboardings",
        sa.Column(
            "awaiting_reprovision",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )


def downgrade() -> None:
    op.drop_column("client_onboardings", "awaiting_reprovision")
