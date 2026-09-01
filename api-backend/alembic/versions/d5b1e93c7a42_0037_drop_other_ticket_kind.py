"""0037_drop_other_ticket_kind

Revision ID: d5b1e93c7a42
Revises: c4e97b2d51af
Create Date: 2026-09-01 00:00:00.000000

Deletes the deprecated 'other' request-ticket kind, which is being removed to
make room for an incoming feature. TicketKind loses its OTHER member on the
Python side (ORM + Pydantic); this migration removes the rows that would
otherwise be left unreadable by that change.

TWO PARTS: a data delete, then a small DDL drop.

PART 1 -- the 'other' rows. No DDL is needed to retire the enum VALUE:

  - client_tickets.kind is sa.String(length=16) as created in a9317a31b484 /
    0026, modelled as SAEnum(..., native_enum=False, length=16) with no CHECK
    constraint (create_constraint defaults to False and is never set). There is
    no native DB enum type to rebuild and no constraint to alter. Same
    reasoning as b34f8c1a9d27 / 0027, which consolidated the sibling `status`
    column with a plain UPDATE.

PART 2 -- the `category` column, and ONLY that column.

`category` held the Others form's "Questionnaire"/"Others" sub-choice. That
form was the only thing that ever wrote it, so with the kind gone the column
has no writer and no reader. It is dropped here.

`subject` is deliberately NOT dropped. An earlier draft of this revision
dropped it too, on the assumption that it was equally Other-only. That was
wrong: create_ticket has always persisted `subject=req.subject` for EVERY
kind, and the client's Allotment and Redemption forms both collect a required
free-text Subject and post it. Dropping that column would have destroyed live
data and silently broken a field the UI still demands. The column stays, and
`subject` remains wired end to end (RaiseTicketReq -> column -> RmTicketDTO
for the RM inbox, and -> ClientRequestDTO for the client's request history).

  - This part IS DDL (one op.drop_column) and IS destructive for `category`:
    any text it holds is gone. Surviving rows are expected to be NULL --
    nothing but the deleted Others form ever wrote it -- but that is an
    expectation about production data, not something the schema enforced, so
    upgrade() COUNTS the non-null values and prints a warning before dropping.
    Read that warning: a non-zero count means real text is about to be
    destroyed, and it would mean the assumption above is wrong for your data.

WHY DELETE RATHER THAN BACKFILL: an 'other' ticket carries no model_id (it was
the only kind for which model_id was optional), so it cannot be rewritten into
an 'allotment' or 'redemption' row without inventing a model. Reassignment
would produce half-valid rows that the surviving validator rejects. Deletion
was chosen explicitly by the product owner.

WHY THE DELETE IS UNCONDITIONAL AND UNORDERED: client_tickets is a leaf table.
It holds outbound FKs (users.id, users.firebase_uid, models.id,
client_allotment_redemptions.id) but NOTHING in the schema holds an FK to
client_tickets.id -- verified against app/models/onboarding.py. So there are no
dependent rows to remove first and no FK ordering hazard.

TWO THINGS THIS MIGRATION DELIBERATELY DOES NOT TOUCH:

  1. client_events rows. Raising or declining a ticket writes a
     category='Requests Status' timeline event (app/libs/client_portal/
     service.py, create_ticket / decline). Those events have no FK to the
     ticket -- they name it only as free text inside the title
     ("Ticket <reference> submitted"). They are standalone historical records,
     matching them would require fragile LIKE-on-reference string matching,
     and erasing a client's timeline history was not asked for. They stay.
  2. client_allotment_redemptions rows. linked_allotment_id points from ticket
     to trade record, never the reverse, and an 'other' ticket never produced a
     trade anyway (it has no model). Trade records are untouched.

The row count is logged immediately before the delete, so the upgrade output
is the record of what was removed. Nothing was pre-queried against the
database while authoring this file.

downgrade() CANNOT restore the deleted rows. Recovery is from the mysqldump
taken before this migration was handed over:

    api-backend/db-backups/portal_pre-037_2026-09-01.sql

(that dump is of the development database, where client_tickets was empty --
take a fresh dump of whatever environment you are actually upgrading before
running this.)
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d5b1e93c7a42"
down_revision: Union[str, Sequence[str], None] = "c4e97b2d51af"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # --- log what is about to go, so the upgrade output is the audit record ---
    row = bind.execute(
        sa.text(
            "SELECT COUNT(*) AS total, "
            "       SUM(model_id IS NOT NULL) AS with_model_id, "
            "       SUM(linked_allotment_id IS NOT NULL) AS linked, "
            "       MIN(created_at) AS oldest, "
            "       MAX(created_at) AS newest "
            "FROM client_tickets WHERE kind = 'other'"
        )
    ).one()

    print(
        f"[0037] client_tickets kind='other': {row.total} row(s) to delete "
        f"(with model_id={row.with_model_id or 0}, "
        f"linked_allotment_id={row.linked or 0}, "
        f"created {row.oldest} .. {row.newest})"
    )

    # A non-zero with_model_id or linked count means these rows are not the
    # shape 'other' tickets were supposed to have. Surface it rather than
    # deleting silently -- the operator can abort and re-inspect.
    if row.with_model_id or row.linked:
        print(
            "[0037] WARNING: some 'other' rows carry a model_id or a "
            "linked_allotment_id, which the application never wrote for this "
            "kind. Review before treating this delete as routine."
        )

    # --- the delete -----------------------------------------------------------
    op.execute("DELETE FROM client_tickets WHERE kind = 'other'")

    # --- part 2: drop the Other-only `category` column -------------------------
    # Counted AFTER the delete above, so this reports only what the surviving
    # allotment/redemption rows still hold. Only the deleted Others form ever
    # wrote `category`, so this is expected to be 0.
    #
    # `subject` is deliberately not counted and not dropped -- see the module
    # docstring. It is a live field for every ticket kind.
    with_category = (
        bind.execute(
            sa.text("SELECT COUNT(*) FROM client_tickets WHERE category IS NOT NULL")
        ).scalar()
        or 0
    )

    if with_category:
        print(
            f"[0037] WARNING: dropping `category` while {with_category} "
            f"surviving row(s) still hold a non-null value. That text is being "
            f"destroyed, and it means something other than the Others form "
            f"wrote this column. Abort and re-inspect -- it is recoverable only "
            f"from the pre-migration dump."
        )
    else:
        print(
            "[0037] `category` is NULL on all surviving rows, as expected -- "
            "dropping the column."
        )

    op.drop_column("client_tickets", "category")


def downgrade() -> None:
    """Restores the SCHEMA but not the DATA.

    Re-adds `category` with its original type and nullability (String(64),
    nullable, no server_default) so that an upgrade -> downgrade -> upgrade
    cycle is structurally identical -- the repo's migration round-trip tests
    assert exactly that, and a no-op here would leave client_tickets
    permanently one column short of its pre-0037 shape.

    `subject` is absent here because upgrade() no longer drops it.

    What CANNOT be restored:
      - the deleted kind='other' rows (no archive table, no soft-delete flag)
      - any `category` text the upgrade dropped

    Both are recoverable only from the pre-migration dump. The column comes
    back empty.

    Column order note: MySQL appends a re-added column at the end of the table
    rather than at its original position. That is cosmetic -- an inspector
    comparing name/type/nullability sees an identical set.
    """
    op.add_column(
        "client_tickets",
        sa.Column("category", sa.String(length=64), nullable=True),
    )
    # Deliberately no data reversal: see docstring.
