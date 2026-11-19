"""0052_client_ib_accounts_book

Revision ID: b4e8c1a27d90
Revises: e6b4a91c2d58
Create Date: 2026-11-18 00:00:00.000000

Adds client_ib_accounts.book (dt, pt, inb) and widens the primary key
from (user_id, model_id) to (user_id, model_id, book). Existing rows
backfill to dt — current assignments are Day Trade. UNIQUE(ib_account)
is unchanged, so one account string still cannot be stored twice.

Hand-written; do not autogenerate. The primary-key change is one ALTER
so MariaDB can keep an index on user_id for the outgoing foreign key
while PRIMARY is replaced.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b4e8c1a27d90"
down_revision: Union[str, Sequence[str], None] = "e6b4a91c2d58"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if any(col["name"] == "book" for col in insp.get_columns("client_ib_accounts")):
        return

    op.add_column(
        "client_ib_accounts",
        sa.Column("book", sa.String(length=3), nullable=True),
    )
    op.get_bind().execute(sa.text("UPDATE client_ib_accounts SET book = 'dt'"))
    op.alter_column(
        "client_ib_accounts",
        "book",
        existing_type=sa.String(length=3),
        nullable=False,
    )
    op.execute(
        "ALTER TABLE client_ib_accounts "
        "ADD INDEX ix_client_ib_accounts_user_id (user_id), "
        "DROP PRIMARY KEY, "
        "ADD PRIMARY KEY (user_id, model_id, book), "
        "DROP INDEX IF EXISTS ix_client_ib_accounts_user_id"
    )
    op.execute(
        "ALTER TABLE client_ib_accounts "
        "ADD CONSTRAINT ck_client_ib_accounts_book "
        "CHECK (book IN ('dt', 'pt', 'inb'))"
    )


def downgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if not any(col["name"] == "book" for col in insp.get_columns("client_ib_accounts")):
        return

    op.execute(
        "ALTER TABLE client_ib_accounts DROP CONSTRAINT IF EXISTS ck_client_ib_accounts_book"
    )
    # Rows added for pt/inb have no home in the old (user_id, model_id) key.
    # The dt row is the one this migration backfilled, so it is the one kept.
    op.execute("DELETE FROM client_ib_accounts WHERE book <> 'dt'")
    op.execute(
        "ALTER TABLE client_ib_accounts "
        "DROP PRIMARY KEY, "
        "ADD PRIMARY KEY (user_id, model_id)"
    )
    op.drop_column("client_ib_accounts", "book")