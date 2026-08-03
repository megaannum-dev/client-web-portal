"""0027_ticket_status_consolidation

Revision ID: b34f8c1a9d27
Revises: a9317a31b484
Create Date: 2026-07-29 00:00:00.000000

Consolidates ClientTicket.status from 5 states to 4 (drops REPLIED/CLOSED,
both folded into RESOLVED) and adds a linkage column so a ticket can point at
the trade record it produces:

  - Backfill: 'replied' and 'closed' rows become 'resolved'. Safe as a plain
    UPDATE -- client_tickets.status is sa.String(length=16) (native_enum=False
    on the ORM side), not a native DB enum type, so there is no enum-type
    ALTER to worry about; this migration only ever touches data.
  - Schema: adds client_tickets.linked_allotment_id (UUID, nullable, FK ->
    client_allotment_redemptions.id, UNIQUE -- one ticket maps to at most one
    allotment/redemption row).

downgrade() drops the new column/constraints but does NOT attempt to restore
the REPLIED/CLOSED split -- that distinction is destroyed by the upgrade
backfill and cannot be recovered.

Note on editing this historical downgrade() in place (proposal 020 / DB-1):
this is legitimate only because this downgrade() has never executed
successfully in any environment, so no environment's state depends on its
present (broken) statement ordering.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b34f8c1a9d27"
down_revision: Union[str, Sequence[str], None] = "a9317a31b484"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- data backfill: replied/closed -> resolved ---------------------------
    op.execute(
        "UPDATE client_tickets SET status = 'resolved' "
        "WHERE status IN ('replied', 'closed')"
    )

    # --- linked_allotment_id column -------------------------------------------
    op.add_column(
        "client_tickets",
        sa.Column("linked_allotment_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_client_tickets_linked_allotment_id",
        "client_tickets",
        "client_allotment_redemptions",
        ["linked_allotment_id"],
        ["id"],
    )
    op.create_unique_constraint(
        "uq_client_tickets_linked_allotment_id",
        "client_tickets",
        ["linked_allotment_id"],
    )


def downgrade() -> None:
    # MySQL refuses to drop an index that a foreign key still depends on
    # (OperationalError 1553, "Cannot drop index ... needed in a foreign key
    # constraint"), so the FK is released before the UNIQUE that backs it.
    # Same ordering as 29a586aaf08b / 0014:156-157.
    op.drop_constraint(
        "fk_client_tickets_linked_allotment_id", "client_tickets", type_="foreignkey"
    )
    op.drop_constraint(
        "uq_client_tickets_linked_allotment_id", "client_tickets", type_="unique"
    )
    op.drop_column("client_tickets", "linked_allotment_id")

    # Note: REPLIED/CLOSED cannot be distinguished from RESOLVED post-backfill;
    # no data reversal is performed.
