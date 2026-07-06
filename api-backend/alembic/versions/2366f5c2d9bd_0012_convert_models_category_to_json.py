"""0012 convert models.category from VARCHAR(64) to JSON — stores the
multi-select category list as a real array instead of a comma-joined
string.

Revision ID: 2366f5c2d9bd
Revises: c9e2f4a7b183
Create Date: 2026-07-06 00:00:00.000000
"""
import json

from alembic import op
import sqlalchemy as sa

revision = "2366f5c2d9bd"
down_revision = "c9e2f4a7b183"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("models", sa.Column("category_json", sa.JSON(), nullable=True))

    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT id, category FROM models "
            "WHERE category IS NOT NULL AND category <> ''"
        )
    ).fetchall()
    for row in rows:
        categories = [c.strip() for c in row.category.split(",") if c.strip()]
        conn.execute(
            sa.text("UPDATE models SET category_json = :cats WHERE id = :id"),
            {"cats": json.dumps(categories), "id": row.id},
        )

    op.drop_column("models", "category")
    op.alter_column(
        "models", "category_json", new_column_name="category", existing_type=sa.JSON()
    )

    # Restore original column position (AFTER incentive_fee, BEFORE
    # subscription_redemption) — add_column appended it at the tail.
    op.execute(
        "ALTER TABLE models MODIFY COLUMN category JSON NULL AFTER incentive_fee"
    )
    op.execute(
        "ALTER TABLE models "
        "MODIFY COLUMN subscription_redemption VARCHAR(64) NULL AFTER category"
    )


def downgrade() -> None:
    op.add_column("models", sa.Column("category_str", sa.String(255), nullable=True))

    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, category FROM models WHERE category IS NOT NULL")
    ).fetchall()
    for row in rows:
        raw = row.category
        categories = json.loads(raw) if isinstance(raw, str) else (raw or [])
        conn.execute(
            sa.text("UPDATE models SET category_str = :cat WHERE id = :id"),
            {"cat": ", ".join(categories) if categories else None, "id": row.id},
        )

    op.drop_column("models", "category")
    op.alter_column(
        "models",
        "category_str",
        new_column_name="category",
        existing_type=sa.String(255),
    )
    op.execute(
        "ALTER TABLE models MODIFY COLUMN category VARCHAR(64) NULL AFTER incentive_fee"
    )
    op.execute(
        "ALTER TABLE models "
        "MODIFY COLUMN subscription_redemption VARCHAR(64) NULL AFTER category"
    )
