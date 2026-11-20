"""0051_models_required_books

Revision ID: e6b4a91c2d58
Revises: d3f7a2b9e610
Create Date: 2026-11-18 00:00:00.000000

Adds models.required_books, a non-null JSON list of book codes
(dt, pt, inb). Existing rows backfill to ["dt"] — current models are
Day Trade only. Hand-written; do not autogenerate.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e6b4a91c2d58"
down_revision: Union[str, Sequence[str], None] = "d3f7a2b9e610"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_DAY_TRADE = '["dt"]'


def upgrade() -> None:
    op.add_column("models", sa.Column("required_books", sa.JSON(), nullable=True))
    op.get_bind().execute(
        sa.text("UPDATE models SET required_books = :books"),
        {"books": _DAY_TRADE},
    )
    op.alter_column(
        "models",
        "required_books",
        existing_type=sa.JSON(),
        nullable=False,
    )


def downgrade() -> None:
    op.drop_column("models", "required_books")
