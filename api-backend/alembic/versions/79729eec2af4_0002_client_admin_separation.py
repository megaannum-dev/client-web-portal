"""0002 client admin separation

Revision ID: 79729eec2af4
Revises: 6405e823862b
Create Date: 2026-06-11 09:57:55.441028

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "79729eec2af4"
down_revision: Union[str, Sequence[str], None] = "6405e823862b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    Three phases (impl Section C.3):
      1. additive DDL: add nullable users.portal + create profile tables
      2. data backfill: read users.role -> set portal + insert profile rows
      3. tighten: portal NOT NULL, then drop users.role (irreversible w/o backup)

    Per errata E-6, portal and admin_profiles.role are plain VARCHAR (string-backed
    enums, native_enum=False) — NOT native ENUM types.
    """
    # --- Phase 1: additive DDL ---
    op.add_column("users", sa.Column("portal", sa.String(16), nullable=True))
    op.create_index("ix_users_portal", "users", ["portal"])

    op.create_table(
        "client_profiles",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id"),
            unique=True,
            nullable=False,
        ),
        sa.Column("name", sa.String(255)),
        sa.Column("primary_phone", sa.String(32)),
        sa.Column(
            "assigned_rm_uid", sa.String(128), sa.ForeignKey("users.firebase_uid")
        ),
        sa.Column("address", sa.Text),
        sa.Column("country_of_residence", sa.String(255)),
        sa.Column("authorized_person", sa.String(255)),
        sa.Column("initiate_method", sa.String(255)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
    )
    op.create_table(
        "admin_profiles",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id"),
            unique=True,
            nullable=False,
        ),
        sa.Column("name", sa.String(255)),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("phone_number", sa.String(32)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
    )

    # --- Phase 2: data backfill (reads users.role before it is dropped) ---
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, role FROM users")).fetchall()
    for uid_pk, role in rows:
        if role == "CLIENT":
            conn.execute(
                sa.text("UPDATE users SET portal='client' WHERE id=:i"), {"i": uid_pk}
            )
            conn.execute(
                sa.text(
                    "INSERT INTO client_profiles (user_id) "
                    "SELECT :i WHERE NOT EXISTS (SELECT 1 FROM client_profiles WHERE user_id=:i)"
                ),
                {"i": uid_pk},
            )
        else:
            conn.execute(
                sa.text("UPDATE users SET portal='admin' WHERE id=:i"), {"i": uid_pk}
            )
            conn.execute(
                sa.text(
                    "INSERT INTO admin_profiles (user_id, role) "
                    "SELECT :i, :r WHERE NOT EXISTS (SELECT 1 FROM admin_profiles WHERE user_id=:i)"
                ),
                {"i": uid_pk, "r": role},
            )

    # --- Phase 3: tighten + drop source column ---
    op.alter_column("users", "portal", existing_type=sa.String(16), nullable=False)
    op.drop_column("users", "role")


def downgrade() -> None:
    """Downgrade schema.

    Reverses C.3: re-add users.role, reconstruct it from admin_profiles.role
    (admins) and portal='client' (clients), then drop the profile tables and the
    portal column. Re-add role as plain VARCHAR per errata E-6.
    """
    op.add_column("users", sa.Column("role", sa.String(32), nullable=True))
    conn = op.get_bind()
    # reconstruct role: admins from admin_profiles, clients -> 'CLIENT'
    conn.execute(
        sa.text(
            "UPDATE users u JOIN admin_profiles a ON a.user_id=u.id SET u.role=a.role"
        )
    )
    conn.execute(sa.text("UPDATE users SET role='CLIENT' WHERE portal='client'"))
    op.alter_column("users", "role", existing_type=sa.String(32), nullable=False)
    op.drop_table("admin_profiles")
    op.drop_table("client_profiles")
    op.drop_index("ix_users_portal", table_name="users")
    op.drop_column("users", "portal")
