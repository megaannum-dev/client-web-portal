"""0026_client_portal_integration

Revision ID: a9317a31b484
Revises: fa66b2f3aee6
Create Date: 2026-07-28 00:00:00.000000

Shared revision for proposal 018 (Client Portal <-> Backend Integration),
Layer 1 - Database, units DB-1, DB-2, DB-4, DB-5 (DB-3 is a doc-only comment
with no schema change, landed in its own commit; DB-6's seven RM columns on
client_profiles are a separate, later unit in this same revision file, added
by a different agent in wave W2 -- not present here):

  - DB-1: creates client_tickets (FK -> users.id, users.firebase_uid,
    models.id; reference UNIQUE; two indexes -- ix_client_tickets_user_id,
    ix_client_tickets_rm_status).
  - DB-2: adds client_profiles.occupation (VARCHAR(255) NULL) and
    .date_of_birth (DATE NULL).
  - DB-4: backfills onboarding_documents.expires_at to
    COALESCE(reviewed_at, created_at) + 365 days on every currently-verified
    investment_policy_statement row (self-asserted pre/post-condition, the
    _require helper pattern from e183474e6b91 / 0018).
  - DB-5: adds models.model_limit (NUMERIC(28,10) NULL, no backfill).

No existing row is modified except by DB-4's narrow, already-NULL-only
UPDATE. downgrade() reverses in the opposite order: DB-5's drop, DB-4's
reversal UPDATE, DB-2's two drops, DB-1's drop_table.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a9317a31b484"
down_revision: Union[str, Sequence[str], None] = "fa66b2f3aee6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _require(condition: bool, message: str) -> None:
    """Abort the migration rather than leave a half-migrated schema
    (house convention -- see e183474e6b91 / 0018_client_onboarding)."""
    if not condition:
        raise RuntimeError(f"0026 self-assertion failed: {message}")


def upgrade() -> None:
    # DB-4's pre-condition self-assertion runs FIRST, before any DDL in this
    # revision (DB-1/DB-2/DB-5's CREATE TABLE / ADD COLUMN). MySQL DDL
    # auto-commits (see "Will assume non-transactional DDL" in the alembic
    # log) -- if this check ran after DB-1/DB-2's DDL and then raised, that
    # DDL would NOT roll back with it, leaving a half-migrated schema that a
    # retried upgrade can't get past ("client_tickets already exists").
    conn = op.get_bind()
    pre_nonnull = conn.execute(
        sa.text("SELECT COUNT(*) FROM onboarding_documents WHERE expires_at IS NOT NULL")
    ).scalar()
    _require(
        pre_nonnull == 0,
        "expires_at was expected NULL on every existing row before the B-4 backfill",
    )

    # --- DB-1: client_tickets ------------------------------------------------
    op.create_table(
        "client_tickets",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "assigned_rm_uid",
            sa.String(length=128),
            sa.ForeignKey("users.firebase_uid"),
            nullable=True,
        ),
        sa.Column("reference", sa.String(length=32), nullable=False, unique=True),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="new"),
        sa.Column("model_id", sa.Uuid(), sa.ForeignKey("models.id"), nullable=True),
        sa.Column("subject", sa.String(length=255), nullable=True),
        sa.Column("category", sa.String(length=64), nullable=True),
        sa.Column("amount", sa.Numeric(precision=28, scale=10), nullable=True),
        sa.Column("multiplier", sa.Numeric(precision=28, scale=10), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="USD"),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("responded_by", sa.String(length=128), nullable=True),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("response_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )
    op.create_index("ix_client_tickets_user_id", "client_tickets", ["user_id"])
    op.create_index(
        "ix_client_tickets_rm_status", "client_tickets", ["assigned_rm_uid", "status"]
    )

    # --- DB-2: client_profiles.occupation / .date_of_birth -------------------
    op.add_column(
        "client_profiles",
        sa.Column("occupation", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "client_profiles",
        sa.Column("date_of_birth", sa.Date(), nullable=True),
    )

    # --- DB-4: backfill onboarding_documents.expires_at -----------------------
    op.execute(
        "UPDATE onboarding_documents "
        "SET expires_at = COALESCE(reviewed_at, created_at) + INTERVAL 365 DAY "
        "WHERE doc_type = 'investment_policy_statement' "
        "AND status = 'verified' AND expires_at IS NULL"
    )

    other_touched = conn.execute(
        sa.text(
            "SELECT COUNT(*) FROM onboarding_documents "
            "WHERE doc_type != 'investment_policy_statement' AND expires_at IS NOT NULL"
        )
    ).scalar()
    _require(
        other_touched == 0,
        "backfill wrote expires_at on a doc_type other than investment_policy_statement",
    )
    backfilled = conn.execute(
        sa.text(
            "SELECT COUNT(*) FROM onboarding_documents "
            "WHERE doc_type = 'investment_policy_statement' AND expires_at IS NOT NULL"
        )
    ).scalar()
    verified_ips_total = conn.execute(
        sa.text(
            "SELECT COUNT(*) FROM onboarding_documents "
            "WHERE doc_type = 'investment_policy_statement' AND status = 'verified'"
        )
    ).scalar()
    _require(
        backfilled == verified_ips_total,
        "backfill did not cover every verified investment_policy_statement row",
    )

    # --- DB-5: models.model_limit ---------------------------------------------
    op.add_column(
        "models",
        sa.Column("model_limit", sa.Numeric(precision=28, scale=10), nullable=True),
    )

    # NOTE (W2): DB-6's seven client_profiles RM columns land here, added by a
    # later agent -- this comment marks the insertion point, not the change.


def downgrade() -> None:
    # NOTE (W2): DB-6's seven client_profiles column drops land here first,
    # ahead of DB-5's reversal below -- added by a later agent.

    # --- DB-5 reversal ---------------------------------------------------------
    op.drop_column("models", "model_limit")

    # --- DB-4 reversal ----------------------------------------------------------
    op.execute(
        "UPDATE onboarding_documents SET expires_at = NULL "
        "WHERE doc_type = 'investment_policy_statement'"
    )

    # --- DB-2 reversal ----------------------------------------------------------
    op.drop_column("client_profiles", "date_of_birth")
    op.drop_column("client_profiles", "occupation")

    # --- DB-1 reversal ----------------------------------------------------------
    op.drop_table("client_tickets")
