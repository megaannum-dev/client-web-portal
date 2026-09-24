"""0043_trades_tradeid_unique

Revision ID: 6bf5237f5329
Revises: e24c875b5a63
Create Date: 2026-09-23 00:00:00.000000

Adds `UNIQUE(tradeID)` on `trades`.

Context: `trades` rows were deduped in `app/core/flex_import.py` on `execID`,
falling back to a 7-column heuristic key for the rows where IB omits
`execID` -- BookTrade expiry/assignment executions. `tradeID` is populated
on every EXECUTION-level row, including those, so that fallback key (and
its Decimal-normalisation helpers) has been deleted in favour of deduping
on `tradeID` alone, symmetric with `orders.orderID`. This migration gives
that dedup the DB-level backstop the old fallback rows never had.

The existing `UniqueConstraint("execID")` (`uq_trades_execID`) is untouched
-- it is still correct for the 947 rows that do carry an execID.

Precondition an operator must check before applying this migration (verified
during planning, but re-verify at apply time -- something may have changed):

    SELECT COUNT(*) FROM trades WHERE tradeID IS NULL;

Must return 0. Verified 2026-09-23: 0 of 982 rows, and all 982 tradeID
values are distinct. If this count is nonzero when you are about to apply,
STOP -- resolve the NULLs first, this migration will fail on them otherwise.
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "6bf5237f5329"
down_revision: Union[str, Sequence[str], None] = "e24c875b5a63"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_unique_constraint("uq_trades_tradeID", "trades", ["tradeID"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("uq_trades_tradeID", "trades", type_="unique")
