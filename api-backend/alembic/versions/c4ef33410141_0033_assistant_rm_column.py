"""0033_assistant_rm_column

Revision ID: c4ef33410141
Revises: b7e3c1d9a248
Create Date: 2026-08-10 12:00:00

Adds a new column to the client_profiles table to store the assistant RM's Firebase UID.
"""

import logging
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c4ef33410141"
down_revision: Union[str, Sequence[str], None] = "b7e3c1d9a248"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")

def upgrade() -> None:
    op.add_column("client_profiles", sa.Column("asst_rm_uid", sa.String(128), nullable=True))
    op.create_index("ix_client_profiles_asst_rm_uid", "client_profiles", ["asst_rm_uid"])


def downgrade() -> None:
    op.drop_index("ix_client_profiles_asst_rm_uid", "client_profiles")
    op.drop_column("client_profiles", "asst_rm_uid")
