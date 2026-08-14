"""0036_simplify_compliance_gate

Revision ID: c4e97b2d51af
Revises: a1b8f4d27c53
Create Date: 2026-08-14 12:00:00

Drops the "reject" concept from the compliance gate. Nobody is declined from
onboarding in production -- a package with problems is sent back for
resubmission -- so:

  * client_onboardings.reject_reason -> compl_note, now the single home for "why
    Compliance sent this cycle back", replacing the per-document issue_note too;
  * onboarding_documents.issue_note dropped (folded into compl_note);
  * onboarding_documents.status="rejected" rows backfilled to "pending", which
    already means "needs (re)upload";
  * client_onboardings.awaiting_reprovision dropped -- it existed only to tell a
    rejection apart from a re-provision request (0035), and with rejection gone
    "pending_review" has exactly one meaning.

Both status columns are plain sa.String(16) (0018) mapped through a non-native
SAEnum, so dropping an enum member needs NO DDL type change -- there is no
CHECK constraint and no native ENUM to alter, only the data backfill below.

downgrade() reverses all four changes structurally, but the DATA half is
one-way: previously-"rejected" document rows come back as "pending", and the
dropped issue_note text is unrecoverable.
"""

import logging
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "c4e97b2d51af"
down_revision: Union[str, Sequence[str], None] = "a1b8f4d27c53"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")


def upgrade() -> None:
    op.execute("UPDATE onboarding_documents SET status='pending' WHERE status='rejected'")
    op.drop_column("onboarding_documents", "issue_note")
    op.alter_column(
        "client_onboardings",
        "reject_reason",
        new_column_name="compl_note",
        existing_type=sa.Text(),
        existing_nullable=True,
    )
    op.drop_column("client_onboardings", "awaiting_reprovision")


def downgrade() -> None:
    op.add_column(
        "client_onboardings",
        sa.Column(
            "awaiting_reprovision",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.alter_column(
        "client_onboardings",
        "compl_note",
        new_column_name="reject_reason",
        existing_type=sa.Text(),
        existing_nullable=True,
    )
    op.add_column("onboarding_documents", sa.Column("issue_note", sa.Text(), nullable=True))
    # No status backfill: "rejected" is gone from DocStatus and the pre-upgrade
    # rows are indistinguishable from genuinely-pending ones.
