"""0031_schema_format_cleanup

Revision ID: a3f7c1d9e824
Revises: c72e91a4f6b3
Create Date: 2026-08-03 00:00:00.000000

Proposal 020, Layer 1: findings B-1, B-2 and B-4 == impl units DB-2, DB-3
and DB-5. B-3 (drop recon_sessions) is withdrawn per D-12 and contributes
no DDL to this revision.

This revision is built up across three commits (DB-2, then DB-3, then
DB-5), each self-contained in its own `# --- DB-N ---` banner block inside
`upgrade()` / `downgrade()`, in that order both ways round -- upgrade()
runs DB-2 then DB-3 then DB-5 (data corrections first, the one destructive
DDL statement last, so a self-assertion failure aborts before anything
irreversible auto-commits); downgrade() reverses in the opposite order.

DB-2 (this commit) -- fee columns to the decimal-fraction scale
-----------------------------------------------------------------
The frozen seam (proposal § 4.1(a), impl doc § 7.1(a)) fixes the fee unit
as a decimal fraction everywhere: 0.020000 means 2%. `models.mgmt_fee` /
`incentive_fee` were written percent-scale without exception by the PC
editor; `client_subscriptions.mgmt_fee_override` / `incentive_fee_override`
are a mix, because the broken compare-and-set at
`app/libs/onboarding/service.py:362-365` sometimes copies a percent-scale
value in verbatim. `client_onboardings.mgmt_fee` / `incentive_fee` are
already fractions and are NOT touched by any statement in this unit.

Steps, in this exact order (order is load-bearing -- see the note on step
4 below):
  0. Snapshot `client_subscriptions` (user_id, model_id, both override
     columns) into `client_subscriptions_pre020_bak`. This is the sole
     rollback mechanism for the LOSSY step 4 below and the human-gate
     evidence; a migration cannot reproducibly write a file outside the
     database (the path/filesystem/credentials/dump binary all differ
     across dev/CI/prod), so the backup lives inside the DB instead.
  1. `models`: unconditional /100 (every row is percent-scale).
  3. `client_subscriptions` overrides: /100 WHERE >= 1 (a genuine
     fraction is always < 1; a value >= 1 can only be a percent-scale
     stray from the RM allotment path). Ceiling, stated and accepted
     by the proposal: this misclassifies a genuine fee >= 100%, which
     does not occur in this business.
  4. `client_subscriptions` overrides: NULL out wherever the override now
     equals the model's own default -- restores the `NULL = inherit`
     invariant documented at `app/models/pc.py:219-226`, which the
     compare-and-set bug above has been violating on every approval.
     LOSSY: a nulled override is indistinguishable after the fact from
     one that was always NULL; recoverable only from the step-0 snapshot.
     Runs strictly after steps 1 and 3 -- comparing a fraction override
     against a percent-scale model default (or vice versa) yields zero
     matches and this correction would silently no-op.
  5. Row counts for steps 1/3/4 are logged via `alembic.runtime.migration`
     (INFO) for human review before this migration is trusted in a real
     environment.
  6. Column comments (`_FEE_COMMENT`) added to all six fee columns --
     the first `comment=` values in this repo, mirrored on the ORM side
     (`app/models/pc.py`, `app/models/onboarding.py`) so
     `--autogenerate` reports no drift.

Steps 1 and 3 are NOT idempotent -- a second run would divide by 100
again. Protected by alembic's own version table, not a guard in the SQL;
nobody should re-run these statements by hand.

`downgrade()` for DB-2 reverses steps 3+4 together (exactly, by copying
every override straight back from the snapshot, which is the only way to
undo the lossy NULL-out) and step 1 by multiplying `models` fees by 100,
then drops the snapshot table and clears the six column comments. It does
NOT reintroduce the pre-existing compare-and-set bug -- it restores state,
not behaviour.
"""

import logging
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a3f7c1d9e824"
down_revision: Union[str, Sequence[str], None] = "c72e91a4f6b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")

_FEE_COMMENT = "decimal fraction: 0.020000 = 2% (proposal 020, DB-2)"


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(f"0031 self-assertion failed: {message}")


def upgrade() -> None:
    conn = op.get_bind()

    # --- DB-2 ---------------------------------------------------------------
    # Step 0: recovery snapshot. Pre-condition: no populated leftover from an
    # aborted prior run (DROP TABLE IF EXISTS handles a leftover shell; the
    # _require below confirms the fresh snapshot's row count).
    op.execute("DROP TABLE IF EXISTS client_subscriptions_pre020_bak")
    op.execute(
        "CREATE TABLE client_subscriptions_pre020_bak AS "
        "SELECT user_id, model_id, mgmt_fee_override, incentive_fee_override "
        "FROM client_subscriptions"
    )
    snapshot_count = conn.execute(
        sa.text("SELECT COUNT(*) FROM client_subscriptions_pre020_bak")
    ).scalar()
    source_count = conn.execute(
        sa.text("SELECT COUNT(*) FROM client_subscriptions")
    ).scalar()
    _require(
        snapshot_count == source_count,
        f"client_subscriptions_pre020_bak row count ({snapshot_count}) does not "
        f"match client_subscriptions ({source_count})",
    )

    # Step 1: models -- unconditional /100, every row is percent-scale.
    step1 = conn.execute(
        sa.text(
            "UPDATE models SET mgmt_fee = mgmt_fee / 100, "
            "incentive_fee = incentive_fee / 100"
        )
    ).rowcount

    # Step 2: client_onboardings -- no data change, already fractions
    # (app/libs/onboarding/schemas.py:23-24). Column comment only, in step 6.

    # Step 3: client_subscriptions -- percent-scale strays (>= 1) rescaled.
    # Ceiling: misclassifies a genuine fee >= 100%, which does not occur in
    # this business. Row counts go through the human gate.
    step3_mgmt = conn.execute(
        sa.text(
            "UPDATE client_subscriptions SET mgmt_fee_override = mgmt_fee_override / 100 "
            "WHERE mgmt_fee_override >= 1"
        )
    ).rowcount
    step3_inc = conn.execute(
        sa.text(
            "UPDATE client_subscriptions "
            "SET incentive_fee_override = incentive_fee_override / 100 "
            "WHERE incentive_fee_override >= 1"
        )
    ).rowcount

    # Step 4: client_subscriptions -- spurious overrides -> NULL. LOSSY.
    # Must run strictly after steps 1 and 3 so both sides of the comparison
    # are on the same scale. A nulled override is indistinguishable from one
    # that was always NULL; recoverable only from client_subscriptions_pre020_bak
    # (step 0), which downgrade() reads.
    step4_mgmt = conn.execute(
        sa.text(
            "UPDATE client_subscriptions cs JOIN models m ON m.id = cs.model_id "
            "SET cs.mgmt_fee_override = NULL "
            "WHERE cs.mgmt_fee_override = m.mgmt_fee"
        )
    ).rowcount
    step4_inc = conn.execute(
        sa.text(
            "UPDATE client_subscriptions cs JOIN models m ON m.id = cs.model_id "
            "SET cs.incentive_fee_override = NULL "
            "WHERE cs.incentive_fee_override = m.incentive_fee"
        )
    ).rowcount

    # Step 5: row-count logging -- the numbers the human gate reviews.
    logger.info("0031 DB-2 step 1  models rescaled:            %s", step1)
    logger.info("0031 DB-2 step 3  mgmt_fee_override rescaled: %s", step3_mgmt)
    logger.info("0031 DB-2 step 3  incentive_override rescaled: %s", step3_inc)
    logger.info("0031 DB-2 step 4  mgmt_fee_override nulled:   %s", step4_mgmt)
    logger.info("0031 DB-2 step 4  incentive_override nulled:  %s", step4_inc)

    # Step 6: column comments -- the first comment= values in this repo.
    for table, column in (
        ("models", "mgmt_fee"),
        ("models", "incentive_fee"),
        ("client_onboardings", "mgmt_fee"),
        ("client_onboardings", "incentive_fee"),
        ("client_subscriptions", "mgmt_fee_override"),
        ("client_subscriptions", "incentive_fee_override"),
    ):
        op.alter_column(
            table,
            column,
            existing_type=sa.Numeric(precision=9, scale=6),
            existing_nullable=True,
            comment=_FEE_COMMENT,
        )
    # --- end DB-2 -------------------------------------------------------------

    # --- DB-3 -----------------------------------------------------------------
    # Bucket-relative storage keys (proposal 020, B-2). Each UPDATE is
    # LIKE-guarded, so it is idempotent and safe to re-run after a partial
    # failure. eod_records.file_storage_key is NOT touched: EoD writes
    # "{YYYY-MM}/" straight at the shared root (app/libs/eod/service.py:130-135),
    # so its values are already bucket-relative -- touching it would corrupt
    # the one column that was already correct.
    db3 = {}
    db3["model_materials"] = conn.execute(
        sa.text(
            "UPDATE model_materials "
            "SET storage_key = SUBSTRING(storage_key, LENGTH('models_mrkt_materials/') + 1) "
            "WHERE storage_key LIKE 'models_mrkt_materials/%'"
        )
    ).rowcount
    db3["onboarding_documents"] = conn.execute(
        sa.text(
            "UPDATE onboarding_documents "
            "SET storage_key = SUBSTRING(storage_key, LENGTH('client_kyc_docs/') + 1) "
            "WHERE storage_key LIKE 'client_kyc_docs/%'"
        )
    ).rowcount
    db3["client_contact_logs"] = conn.execute(
        sa.text(
            "UPDATE client_contact_logs "
            "SET doc_storage_key = SUBSTRING(doc_storage_key, LENGTH('client_contact_logs/') + 1) "
            "WHERE doc_storage_key LIKE 'client_contact_logs/%'"
        )
    ).rowcount
    for table, n in db3.items():
        logger.info("0031 DB-3  %s keys stripped: %s", table, n)

    _require(
        conn.execute(
            sa.text(
                "SELECT COUNT(*) FROM model_materials "
                "WHERE storage_key LIKE 'models_mrkt_materials/%'"
            )
        ).scalar()
        == 0,
        "model_materials still holds prefixed storage_key values",
    )
    _require(
        conn.execute(
            sa.text(
                "SELECT COUNT(*) FROM onboarding_documents "
                "WHERE storage_key LIKE 'client_kyc_docs/%'"
            )
        ).scalar()
        == 0,
        "onboarding_documents still holds prefixed storage_key values",
    )
    _require(
        conn.execute(
            sa.text(
                "SELECT COUNT(*) FROM client_contact_logs "
                "WHERE doc_storage_key LIKE 'client_contact_logs/%'"
            )
        ).scalar()
        == 0,
        "client_contact_logs still holds prefixed doc_storage_key values",
    )
    # --- end DB-3 -------------------------------------------------------------


def downgrade() -> None:
    # --- DB-2 ---------------------------------------------------------------
    # Steps 3 and 4 reverse together, exactly, from the step-0 snapshot: it
    # holds the pre-migration override values in their original scale.
    op.execute(
        "UPDATE client_subscriptions cs "
        "JOIN client_subscriptions_pre020_bak b "
        "  ON b.user_id = cs.user_id AND b.model_id = cs.model_id "
        "SET cs.mgmt_fee_override = b.mgmt_fee_override, "
        "    cs.incentive_fee_override = b.incentive_fee_override"
    )
    op.execute("DROP TABLE IF EXISTS client_subscriptions_pre020_bak")

    # Step 1 reverses by multiplication.
    op.execute(
        "UPDATE models SET mgmt_fee = mgmt_fee * 100, incentive_fee = incentive_fee * 100"
    )

    # Comments back to NULL.
    for table, column in (
        ("models", "mgmt_fee"),
        ("models", "incentive_fee"),
        ("client_onboardings", "mgmt_fee"),
        ("client_onboardings", "incentive_fee"),
        ("client_subscriptions", "mgmt_fee_override"),
        ("client_subscriptions", "incentive_fee_override"),
    ):
        op.alter_column(
            table,
            column,
            existing_type=sa.Numeric(precision=9, scale=6),
            existing_nullable=True,
            comment=None,
        )
    # --- end DB-2 -------------------------------------------------------------

    # --- DB-3 -----------------------------------------------------------------
    # Re-prepend the same three prefixes. NOT LIKE-guarded so rows that
    # already carry the prefix (idempotent retry) are not double-prefixed.
    # NULL keys stay NULL both ways -- LIKE/NOT LIKE never matches NULL, so
    # the explicit IS NOT NULL guard is what actually excludes them.
    op.execute(
        "UPDATE model_materials SET storage_key = CONCAT('models_mrkt_materials/', storage_key) "
        "WHERE storage_key IS NOT NULL AND storage_key NOT LIKE 'models_mrkt_materials/%'"
    )
    op.execute(
        "UPDATE onboarding_documents SET storage_key = CONCAT('client_kyc_docs/', storage_key) "
        "WHERE storage_key IS NOT NULL AND storage_key NOT LIKE 'client_kyc_docs/%'"
    )
    op.execute(
        "UPDATE client_contact_logs "
        "SET doc_storage_key = CONCAT('client_contact_logs/', doc_storage_key) "
        "WHERE doc_storage_key IS NOT NULL AND doc_storage_key NOT LIKE 'client_contact_logs/%'"
    )
    # --- end DB-3 -------------------------------------------------------------
