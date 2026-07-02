"""0008 pc workspace — trading models & client subscriptions

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-06-26 00:00:00.000000

Additive migration for feature 006 (PC Workspace):
  - creates: models, model_materials, model_changes, client_subscriptions,
             allocation_periods, allocation_model_snapshots
  - adds: client_profiles.ib_account column
  - all indexes from DB-1..DB-6
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # DB-1  models
    # ------------------------------------------------------------------
    op.create_table(
        "models",
        sa.Column("id", sa.Uuid(native_uuid=False), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("manager", sa.String(255), nullable=True),
        sa.Column("model_size", sa.Numeric(28, 10), nullable=True),
        sa.Column("intro", sa.String(255), nullable=True),
        sa.Column("symbols", sa.JSON(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("live", "draft", name="modelstatus", native_enum=False),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("version", sa.String(32), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_models_status", "models", ["status"])
    op.create_index("ix_models_updated_at", "models", ["updated_at"])  # DB-6

    # ------------------------------------------------------------------
    # DB-1a  model_materials
    # ------------------------------------------------------------------
    op.create_table(
        "model_materials",
        sa.Column("id", sa.Uuid(native_uuid=False), primary_key=True),
        sa.Column(
            "model_id",
            sa.Uuid(native_uuid=False),
            sa.ForeignKey("models.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("version", sa.String(32), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("storage_key", sa.String(512), nullable=True),
        sa.Column("content_type", sa.String(128), nullable=True),
        sa.Column("uploaded_by", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("model_id", "version", name="uq_model_materials_model_version"),
    )
    op.create_index("ix_model_materials_model_id", "model_materials", ["model_id"])

    # ------------------------------------------------------------------
    # DB-1b  model_changes
    # ------------------------------------------------------------------
    op.create_table(
        "model_changes",
        sa.Column("id", sa.Uuid(native_uuid=False), primary_key=True),
        sa.Column(
            "model_id",
            sa.Uuid(native_uuid=False),
            sa.ForeignKey("models.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "kind",
            sa.Enum(
                "created", "edited", "published", "material_uploaded",
                name="modelchangekind",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("detail", sa.JSON(), nullable=True),
        sa.Column("actor", sa.String(255), nullable=True),
        sa.Column("version", sa.String(32), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_model_changes_model_id", "model_changes", ["model_id"])

    # ------------------------------------------------------------------
    # DB-3  client_subscriptions
    # ------------------------------------------------------------------
    op.create_table(
        "client_subscriptions",
        sa.Column(
            "user_id",
            sa.Uuid(native_uuid=False),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "model_id",
            sa.Uuid(native_uuid=False),
            sa.ForeignKey("models.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "multiplier",
            sa.Numeric(28, 10),
            nullable=False,
            server_default="1",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_client_subscriptions_model_id", "client_subscriptions", ["model_id"])
    op.create_index("ix_client_subscriptions_updated_at", "client_subscriptions", ["updated_at"])  # DB-6

    # ------------------------------------------------------------------
    # DB-4  allocation_periods
    # ------------------------------------------------------------------
    op.create_table(
        "allocation_periods",
        sa.Column("id", sa.Uuid(native_uuid=False), primary_key=True),
        sa.Column("label", sa.String(32), nullable=False),
        sa.Column(
            "status",
            sa.Enum("open", "confirmed", name="periodstatus", native_enum=False),
            nullable=False,
            server_default="open",
        ),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmed_by", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("label", name="uq_allocation_periods_label"),
    )
    op.create_index("ix_allocation_periods_status", "allocation_periods", ["status"])

    # ------------------------------------------------------------------
    # DB-5  allocation_model_snapshots
    # ------------------------------------------------------------------
    op.create_table(
        "allocation_model_snapshots",
        sa.Column(
            "period_id",
            sa.Uuid(native_uuid=False),
            sa.ForeignKey("allocation_periods.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            sa.Uuid(native_uuid=False),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "model_id",
            sa.Uuid(native_uuid=False),
            sa.ForeignKey("models.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("multiplier", sa.Numeric(28, 10), nullable=False),
        sa.Column("model_size", sa.Numeric(28, 10), nullable=True),
        sa.Column("ib_account", sa.String(255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_allocation_model_snapshots_model_id", "allocation_model_snapshots", ["model_id"])

    # ------------------------------------------------------------------
    # DB-2  client_profiles.ib_account  (+ DB-6 index)
    # ------------------------------------------------------------------
    op.add_column(
        "client_profiles",
        sa.Column("ib_account", sa.String(255), nullable=True),
    )
    op.create_index("ix_client_profiles_ib_account", "client_profiles", ["ib_account"])
    op.create_index("ix_client_profiles_updated_at", "client_profiles", ["updated_at"])  # DB-6


def downgrade() -> None:
    # Reverse in FK-safe order (dependents first).
    # For tables being dropped entirely, we drop the table (which implicitly drops
    # all its indexes in MySQL/MariaDB) rather than dropping indexes first — dropping
    # an index that backs a FK constraint would fail with ER_DROP_INDEX_FK.

    # DB-2 + DB-6: remove added column and its indexes from client_profiles
    op.drop_index("ix_client_profiles_updated_at", table_name="client_profiles")
    op.drop_index("ix_client_profiles_ib_account", table_name="client_profiles")
    op.drop_column("client_profiles", "ib_account")

    # DB-5: drop allocation_model_snapshots (table drop removes all indexes)
    op.drop_table("allocation_model_snapshots")

    # DB-4: drop allocation_periods
    op.drop_table("allocation_periods")

    # DB-3: drop client_subscriptions (table drop removes all indexes)
    op.drop_table("client_subscriptions")

    # DB-1b: drop model_changes (table drop removes all indexes)
    op.drop_table("model_changes")

    # DB-1a: drop model_materials (table drop removes all indexes)
    op.drop_table("model_materials")

    # DB-1: drop models (table drop removes all indexes)
    op.drop_table("models")
