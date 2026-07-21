"""0018_client_onboarding

Revision ID: e183474e6b91
Revises: 817926e7604a
Create Date: 2026-07-19 00:00:00.000000

Additive migration for feature 013 (Client Onboarding Integration):
  - creates: client_onboardings (one row per client; FK -> users, models;
    incl. id_type/id_number, both NOT NULL — widened 2026-07-20, D-9)
  - creates: onboarding_documents (FK -> client_onboardings)
  - creates: client_allotment_redemptions (FK -> users, models, client_onboardings;
    source_onboarding_id UNIQUE — see DB-3 invariants; incl. agg_before/agg_after
    (NOT NULL) and expected_cash_in (nullable) — widened 2026-07-20, D-9)
  - creates: client_events (FK -> users)
  - alters:  client_subscriptions — adds mgmt_fee_override, incentive_fee_override
    (both nullable Numeric(9,6), no backfill, no server_default)

No existing row is modified. Table creation order is FK-dependency order:
client_onboardings -> {onboarding_documents, client_allotment_redemptions};
client_events has no dependency on the other three and is created last for
readability only. downgrade() is the exact reverse, dropping the two
client_subscriptions columns last (they are independent of the four new
tables and can be reverted in isolation if ever needed).
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "e183474e6b91"
down_revision: Union[str, Sequence[str], None] = "817926e7604a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _require(condition: bool, message: str) -> None:
    """L1 self-assertion: abort the migration rather than leave a half-migrated schema."""
    if not condition:
        raise RuntimeError(f"0018 self-assertion failed: {message}")


def upgrade() -> None:
    conn = op.get_bind()

    # Pre-migration count, RE-QUERIED (never hardcoded) — client_subscriptions is
    # the one existing table this migration touches.
    subs_count = conn.execute(sa.text("SELECT COUNT(*) FROM client_subscriptions")).scalar()

    # --- new tables (FK-dependency order) ----------------------------------
    op.create_table(
        "client_onboardings",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("kind", sa.String(16), nullable=False, server_default="initial"),
        sa.Column("status", sa.String(16), nullable=False, server_default="initial"),
        sa.Column("model_id", sa.Uuid(), sa.ForeignKey("models.id"), nullable=False),
        sa.Column("multiplier", sa.Numeric(28, 10), nullable=False),
        sa.Column("mgmt_fee", sa.Numeric(9, 6), nullable=True),
        sa.Column("incentive_fee", sa.Numeric(9, 6), nullable=True),
        sa.Column("ibhk_account", sa.String(255), nullable=True),
        sa.Column("sw_account", sa.String(255), nullable=True),
        sa.Column("id_type", sa.String(64), nullable=False),  # widened 2026-07-20 (D-9)
        sa.Column("id_number", sa.String(128), nullable=False),  # widened 2026-07-20 (D-9)
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reject_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )
    op.create_index("ix_client_onboardings_status", "client_onboardings", ["status"])

    op.create_table(
        "onboarding_documents",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "onboarding_id",
            sa.Uuid(),
            sa.ForeignKey("client_onboardings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("doc_type", sa.String(64), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="not_started"),
        sa.Column("storage_key", sa.String(512), nullable=True),
        sa.Column("filename", sa.String(255), nullable=True),
        sa.Column("content_type", sa.String(128), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("version_no", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reviewed_by", sa.String(128), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("issue_note", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
        sa.UniqueConstraint("onboarding_id", "doc_type", name="uq_onboarding_documents_cycle_type"),
    )
    op.create_index(
        "ix_onboarding_documents_onboarding_id", "onboarding_documents", ["onboarding_id"]
    )

    op.create_table(
        "client_allotment_redemptions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("model_id", sa.Uuid(), sa.ForeignKey("models.id"), nullable=False),
        sa.Column("multiplier", sa.Numeric(28, 10), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("note", sa.String(255), nullable=True),
        sa.Column(
            "source_onboarding_id",
            sa.Uuid(),
            sa.ForeignKey("client_onboardings.id"),
            nullable=True,
            unique=True,
        ),
        sa.Column("reference", sa.String(32), nullable=False),
        sa.Column("agg_before", sa.Numeric(28, 10), nullable=False),  # widened 2026-07-20 (D-9)
        sa.Column("agg_after", sa.Numeric(28, 10), nullable=False),  # widened 2026-07-20 (D-9)
        # widened 2026-07-20 (D-9)
        sa.Column("expected_cash_in", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_by", sa.String(128), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_client_allotment_redemptions_status", "client_allotment_redemptions", ["status"]
    )
    op.create_index(
        "ix_client_allotment_redemptions_kind", "client_allotment_redemptions", ["kind"]
    )
    op.create_index(
        "ix_client_allotment_redemptions_user_id", "client_allotment_redemptions", ["user_id"]
    )

    op.create_table(
        "client_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_client_events_user_id", "client_events", ["user_id"])

    # --- existing table: two additive nullable columns ---------------------
    op.execute(
        "ALTER TABLE client_subscriptions "
        "ADD COLUMN mgmt_fee_override NUMERIC(9,6) NULL AFTER multiplier"
    )
    op.execute(
        "ALTER TABLE client_subscriptions "
        "ADD COLUMN incentive_fee_override NUMERIC(9,6) NULL AFTER mgmt_fee_override"
    )

    # --- post-migration self-assertions -------------------------------------
    _require(
        conn.execute(sa.text("SELECT COUNT(*) FROM client_subscriptions")).scalar() == subs_count,
        "client_subscriptions row count changed during migration",
    )
    _require(
        conn.execute(
            sa.text(
                "SELECT COUNT(*) FROM client_subscriptions WHERE mgmt_fee_override IS NOT NULL "
                "OR incentive_fee_override IS NOT NULL"
            )
        ).scalar()
        == 0,
        "client_subscriptions override columns were not left NULL on existing rows",
    )


def downgrade() -> None:
    op.execute("ALTER TABLE client_subscriptions DROP COLUMN incentive_fee_override")
    op.execute("ALTER TABLE client_subscriptions DROP COLUMN mgmt_fee_override")
    op.drop_table("client_events")
    op.drop_table("client_allotment_redemptions")
    op.drop_table("onboarding_documents")
    op.drop_table("client_onboardings")
