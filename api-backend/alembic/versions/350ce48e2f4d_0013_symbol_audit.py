"""0013 symbol audit — model_symbols.active + model_symbol_audit table

Revision ID: 350ce48e2f4d
Revises: 2366f5c2d9bd
Create Date: 2026-07-06 00:00:00.000000

Additive migration for feature 008 (Distinctive Symbols / Symbol Audit Trail):
  - adds: model_symbols.active (NOT NULL DEFAULT true)
  - creates: model_symbol_audit (append-only trail, FK -> models, not model_symbols)
  - backfills: one 'added' audit row per existing model_symbols row
"""
import uuid

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "350ce48e2f4d"
down_revision = "2366f5c2d9bd"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # DB-1  model_symbols.active
    # ------------------------------------------------------------------
    op.add_column(
        "model_symbols",
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
    )

    # ------------------------------------------------------------------
    # DB-2  model_symbol_audit
    # ------------------------------------------------------------------
    op.create_table(
        "model_symbol_audit",
        sa.Column("id", sa.Uuid(native_uuid=False), primary_key=True),
        sa.Column(
            "model_id",
            sa.Uuid(native_uuid=False),
            sa.ForeignKey("models.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("symbol", sa.String(32), nullable=False),
        sa.Column(
            "op",
            sa.Enum(
                "added", "deactivated", "activated", "removed",
                name="symbolauditop",
                native_enum=False,
            ),
            nullable=False,
        ),
        sa.Column("note", sa.String(255), nullable=True),
        sa.Column("actor", sa.String(255), nullable=True),
        sa.Column("version", sa.String(32), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_model_symbol_audit_model_symbol", "model_symbol_audit", ["model_id", "symbol"])

    # ------------------------------------------------------------------
    # D-5  backfill: one 'added' audit row per existing model_symbols row.
    # Python-side UUID generation (not raw-SQL dialect UUID funcs) per impl doc.
    # ------------------------------------------------------------------
    bind = op.get_bind()
    model_symbol_audit = sa.table(
        "model_symbol_audit",
        sa.column("id", sa.Uuid(native_uuid=False)),
        sa.column("model_id", sa.Uuid(native_uuid=False)),
        sa.column("symbol", sa.String),
        sa.column("op", sa.String),
        sa.column("note", sa.String),
        sa.column("actor", sa.String),
        sa.column("version", sa.String),
        sa.column("created_at", sa.DateTime),
    )
    rows = bind.execute(
        sa.text(
            "SELECT ms.model_id AS model_id, ms.symbol AS symbol, "
            "m.created_at AS created_at, m.version AS version "
            "FROM model_symbols ms JOIN models m ON m.id = ms.model_id"
        )
    ).fetchall()
    if rows:
        op.bulk_insert(
            model_symbol_audit,
            [
                {
                    "id": uuid.uuid4(),
                    "model_id": uuid.UUID(str(row.model_id)),
                    "symbol": row.symbol,
                    "op": "added",
                    "note": "Initial universe",
                    "actor": None,
                    "version": row.version,
                    "created_at": row.created_at,
                }
                for row in rows
            ],
        )


def downgrade() -> None:
    # Drop the table directly (implicitly drops its indexes) rather than
    # dropping the index first — dropping an index that backs a FK
    # constraint fails on MySQL/MariaDB with ER_DROP_INDEX_FK (see
    # e5f6a7b8c9d0_0008_pc_workspace.py downgrade() for the same pattern).
    op.drop_table("model_symbol_audit")
    op.drop_column("model_symbols", "active")
