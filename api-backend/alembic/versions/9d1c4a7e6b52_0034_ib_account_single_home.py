"""0034_ib_account_single_home

Revision ID: 9d1c4a7e6b52
Revises: c4ef33410141
Create Date: 2026-08-11 00:00:00.000000

Makes `client_ib_accounts` the single, globally-unique home of a client's
per-model IB account, and removes the duplicate copy that
`client_onboardings.ibhk_account` kept.

Steps, in this exact order (each depends on the one before it):
  1. Backfill `client_ib_accounts` from `client_onboardings`, joined on
     (user_id, model_id), insert-if-absent only. 0032's own backfill is
     documented LOSSY -- it copied a client's single old
     `client_profiles.ib_account` onto EVERY model that client subscribed
     to, because there was no record of which model the account really
     belonged to. `client_onboardings` does carry a real (user_id,
     model_id, ibhk_account) triple, so for a client whose 0032 backfill
     produced nothing (no `client_subscriptions` row at the time) this is
     the only truthful per-model value left. Existing rows are never
     overwritten -- 0032's values may be wrong, but correcting them is
     `ib_accounts.reassign`'s job (the RM repair route), not a
     migration's.
  2. Dedupe for global uniqueness. Because of that same 0032 fan-out, the
     same account string can appear on several of one client's rows, so
     UNIQUE cannot be applied yet. Rule: keep exactly ONE row per account
     string -- preferring the row whose `model_id` equals that client's
     `client_onboardings.model_id` (the truthful assignment), otherwise the
     lowest (user_id, model_id) -- and set `ib_account = NULL` on the rest.
     This is deliberately NOT limited to clients that have an onboarding
     row: a client created through the bare POST /rm/clients path has none,
     and two different clients can hold the same string, so a narrower rule
     would leave duplicates behind and abort step 3. The number of rows
     nulled is logged via `logger.info` -- this step loses data, and a
     silent count would misrepresent that. A final check then fails fast,
     naming any string still duplicated, rather than letting step 3 die on
     a constraint violation that identifies no rows.
  3. `UNIQUE(ib_account)` on `client_ib_accounts`. Nullable + unique is
     fine on MySQL/MariaDB (multiple NULLs are permitted), so this
     coexists with step 2's NULLs and with the column's deliberate
     nullability (an account may legitimately not be known yet).
  4. Drop `client_onboardings.ibhk_account` -- LAST, because step 1 reads
     it.

`downgrade()` re-adds the column, restores its values from
`client_ib_accounts` via the composite key, and drops the unique
constraint. NOTE: step 2's nulled duplicates are NOT recoverable by
downgrade -- the duplicated strings are gone, and only the account still
attached to the client's onboarding model comes back.
"""

import logging
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "9d1c4a7e6b52"
down_revision: Union[str, Sequence[str], None] = "c4ef33410141"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")


def upgrade() -> None:
    conn = op.get_bind()

    # Step 1: backfill the truthful per-model value, insert-if-absent only.
    backfilled = conn.execute(
        sa.text(
            "INSERT INTO client_ib_accounts (user_id, model_id, ib_account) "
            "SELECT co.user_id, co.model_id, co.ibhk_account "
            "FROM client_onboardings co "
            "WHERE co.ibhk_account IS NOT NULL "
            "  AND NOT EXISTS ("
            "    SELECT 1 FROM client_ib_accounts cia "
            "    WHERE cia.user_id = co.user_id AND cia.model_id = co.model_id"
            "  )"
        )
    ).rowcount
    logger.info("0034 step 1  client_ib_accounts backfilled from onboardings: %s", backfilled)

    # Step 2: null every duplicate account string, keeping exactly one row per
    # string. Ordering: the client's onboarding-model row wins (tag '0' -- it is
    # the truthful assignment), otherwise the lowest (user_id, model_id).
    #
    # Deliberately NOT restricted to rows that join client_onboardings. A client
    # created through the bare POST /rm/clients path has no onboarding row at
    # all, so an inner join would skip its 0032 fan-out duplicates entirely and
    # step 3 would then abort on them; two different clients holding the same
    # string would survive for the same reason. user_id/model_id are CHAR(32)
    # (Uuid(native_uuid=False)), so CONCAT ordering is deterministic, and
    # client_onboardings.user_id is UNIQUE so the LEFT JOIN cannot fan out.
    #
    # A temp table is used because MySQL forbids an UPDATE whose subquery reads
    # the table being updated.
    conn.execute(sa.text("DROP TEMPORARY TABLE IF EXISTS _ib_keep"))
    conn.execute(
        sa.text(
            "CREATE TEMPORARY TABLE _ib_keep AS "
            "SELECT c.ib_account, "
            "       MIN(CONCAT("
            "         CASE WHEN co.model_id = c.model_id THEN '0' ELSE '1' END, "
            "         c.user_id, c.model_id)) AS keep_tag "
            "  FROM client_ib_accounts c "
            "  LEFT JOIN client_onboardings co ON co.user_id = c.user_id "
            " WHERE c.ib_account IS NOT NULL "
            " GROUP BY c.ib_account"
        )
    )
    nulled = conn.execute(
        sa.text(
            "UPDATE client_ib_accounts cia "
            "  LEFT JOIN client_onboardings co ON co.user_id = cia.user_id "
            "  JOIN _ib_keep k ON k.ib_account = cia.ib_account "
            "   SET cia.ib_account = NULL "
            " WHERE cia.ib_account IS NOT NULL "
            "   AND CONCAT("
            "         CASE WHEN co.model_id = cia.model_id THEN '0' ELSE '1' END, "
            "         cia.user_id, cia.model_id) <> k.keep_tag"
        )
    ).rowcount
    conn.execute(sa.text("DROP TEMPORARY TABLE _ib_keep"))
    logger.info("0034 step 2  duplicate ib_account values NULLED: %s", nulled)

    # Step 2b: fail fast, naming the offenders. Without this the operator gets a
    # bare constraint violation from step 3 that identifies no rows.
    leftover = conn.execute(
        sa.text(
            "SELECT ib_account FROM client_ib_accounts "
            " WHERE ib_account IS NOT NULL "
            " GROUP BY ib_account HAVING COUNT(*) > 1"
        )
    ).fetchall()
    if leftover:
        raise RuntimeError(
            "0034 cannot apply UNIQUE(ib_account); duplicates remain for "
            f"{[r[0] for r in leftover]}. Resolve these rows, then re-run."
        )

    # Step 3: enforce global uniqueness now that duplicates are gone.
    op.create_unique_constraint(
        "uq_client_ib_accounts_ib_account", "client_ib_accounts", ["ib_account"]
    )

    # Step 4: drop the duplicate copy -- last, step 1 read it.
    op.drop_column("client_onboardings", "ibhk_account")


def downgrade() -> None:
    op.drop_constraint(
        "uq_client_ib_accounts_ib_account", "client_ib_accounts", type_="unique"
    )
    op.add_column(
        "client_onboardings", sa.Column("ibhk_account", sa.String(255), nullable=True)
    )
    # Restore from the composite key. Only the account still attached to the
    # client's onboarding model comes back -- see the module docstring.
    op.execute(
        "UPDATE client_onboardings co "
        "JOIN client_ib_accounts cia "
        "  ON cia.user_id = co.user_id AND cia.model_id = co.model_id "
        "SET co.ibhk_account = cia.ib_account"
    )
