# 002 — Implementation: Separating Client and Admin Handling

**Date:** 2026-06-10
**Implements:** [Proposal 002](../proposals/002-2026-06-10-client-admin-separation.md)
**Builds on:** [Implementation 001](001-2026-05-26-modular-backend-architecture.md)
**Branch:** `client-admin-separation`
**Status:** Draft
**Author:** QinQipeng

---

## How to read this document

Each section below maps to one **design aspect** of Proposal 002 and breaks it into ordered implementation steps with the concrete code. The aspects are:

| Aspect | Proposal § | Section here |
|--------|-----------|--------------|
| Migration tooling prerequisite | §4 note, §9 step 0 | A |
| Data model (`portal`, profiles, enum split) | §5, §6 | B |
| Schema migration + **existing-data backfill** | §5.4, §9 | C |
| Firebase custom claims | §4 | D |
| Auth dependency split + portal gate | §7.2, §7.3 | E |
| Action map re-key | §6 | F |
| Portal-aware register / login / provisioning | §7.4, §7.5 | G |
| `UserOut` contract assembly | §8 | H |
| Wiring (`main.py`, route prefixes) | §7.1 | I |
| Verification | §10 | J |

**The decisions in Section 0 are now resolved** (answered 2026-06-10). The code in later sections reflects these answers. Inline `✅ Qn` markers show where each one lands.

---

## Section 0 — Resolved Decisions

All seven blocking questions are answered. This section is the authoritative record; the rest of the document is written to match.

| # | Question | **Decision** | Consequence in this doc |
|---|----------|--------------|-------------------------|
| **Q1** | Migration tooling — `create_all()` cannot add `portal`, set `NOT NULL`, or drop `users.role`, so real DDL is required. | **Adopt Alembic now.** | Section A (Alembic init + baseline) and Section C (versioned revision) stand as written. |
| **Q2** | Is there existing data the backfill must handle? | **Yes — ~18 real rows total, including the dev-user.** | Section C is a **production-grade data migration**: snapshot/back up first, dry-run on a restored copy, verify counts before the irreversible `DROP COLUMN role`. |
| **Q3** | How do existing real Firebase users get their `portal` claim? | **Lazy — refresh on next login.** | No proactive Firebase-iteration script. Section D.3 is dropped; Section G.2's lazy refresh is the mechanism. Safe because enforcement reads the DB-resolved user, not the raw claim. |
| **Q4** | What happens for an authenticated token with no `users` row? | **Leave as-is — auto-create as `client` + `client_profiles`.** Logged as a **future refactor item** (see below). | Section E keeps the auto-create path. A `FUTURE-REFACTOR` note flags tightening this to require `/register`. |
| **Q5** | Testing both portals under `FIREBASE_AUTH_DISABLED`? | **Leave as-is** (single admin `dev-user`). The dev-bypass feature itself is slated for removal later, so no investment in a client sentinel. | Section E dev-bypass is unchanged. Section J notes client-portal paths aren't exercised offline. |
| **Q6** | Profile fields are `NULL` for the existing test rows. | **The ~18 rows are throwaway test records with no real profile data. Add a one-off seeding script that fills dummy profile data.** | New **Section C.6 — dummy-data seeding script**. Columns remain nullable; no registration-time collection. |
| **Q7** | `UserOut.role` type, given `role` leaves the `User` ORM object. | **Discard the `build_user_out` helper; use a computed `role` property on the `User` model** so `from_attributes` still works and endpoints keep returning the ORM object. | Section H rewritten to the property approach. `UserOut.role` is typed `str`. |

### FUTURE-REFACTOR items logged here (not done in this change)

- **FR-1 (from Q4):** `get_current_user` auto-creates an unknown authenticated token as a client. Once portal carries authorization weight this should become explicit — reject unknown tokens and force them through `/register`, so portal assignment happens in exactly one place. Deferred; revisit when the registration flow is locked on both frontends.
- **FR-2 (from Q5):** The `FIREBASE_AUTH_DISABLED` dev bypass is to be removed in a future iteration. Until then it resolves only the admin `dev-user`; client-portal routes are not testable offline.

---

## Section A — Migration tooling prerequisite  ✅ Q1 (Alembic)

### A.1 Add dependency

`requirements.txt`:

```
alembic>=1.13.0
```

### A.2 Initialise and point `env.py` at the existing `Base`

```bash
cd api-backend
alembic init alembic
```

In `alembic/env.py`, wire the shared metadata and URL so autogenerate sees every model registered in Impl-001:

```python
from app.core.config import get_settings
from app.core.database import Base
# Import every model module so its tables register on Base.metadata:
import app.models.users      # noqa: F401
import app.models.financial  # noqa: F401
import app.models.documents  # noqa: F401

config.set_main_option("sqlalchemy.url", get_settings().database_url)
target_metadata = Base.metadata
```

### A.3 Baseline the current schema (no behavioural change)

```bash
alembic revision --autogenerate -m "0001 baseline current schema"
alembic upgrade head
```

### A.4 Stop double-managing the schema

Once Alembic owns DDL, the `create_all()` in `app/main.py` lifespan (lines 24–25) becomes redundant and can mask drift. **Decision point folded into Q1:** remove it, or keep it for dev convenience. If kept, it is harmless for *new* tables but will never perform the `role`-drop in Section C — Alembic still must.

---

## Section B — Data model

Maps to Proposal §5 (tables) and §6 (enum split). Pure model definitions; the DDL that realises them is Section C.

### B.1 `app/models/users.py` — add `Portal`, split the role enum, add `portal` column

```python
import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum as SAEnum, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Portal(str, enum.Enum):
    CLIENT = "client"
    ADMIN = "admin"


class AdminRole(str, enum.Enum):
    RM = "RM"
    PM = "PM"
    PC = "PC"
    COMPLIANCE = "COMPLIANCE"
    ADMIN = "ADMIN"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    firebase_uid: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    portal: Mapped[Portal] = mapped_column(
        SAEnum(Portal, native_enum=False, length=16), nullable=False, index=True
    )
    # NOTE: `role` column is intentionally removed here. It is dropped in Section C
    # ONLY AFTER the backfill copies it into admin_profiles. Do not remove the
    # column from the live DB before the backfill runs (Section C ordering).
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

> **Compatibility note.** Impl-001 §3.3 added `app/models/__init__.py` re-exporting `User, UserRole`. `UserRole` no longer exists. Grep for every `UserRole` importer before deleting it from the package init — `actions.py`, `schemas/auth.py`, `schemas/users.py`, `repository.py`, `service.py`, `deps.py` all reference it today and are rewritten in Sections E–H.

### B.2 `app/models/users.py` (continued) — profile tables

Field set per Proposal §5.1 (finalised). All profile fields nullable ✅ Q6 (filled by the C.5 seeding script for existing rows).

```python
from sqlalchemy import ForeignKey, Text


class ClientProfile(Base):
    __tablename__ = "client_profiles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)

    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    primary_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # FK to users.firebase_uid (the RM is itself a user). App-level invariant:
    # the referenced user must be an admin whose admin_profiles.role == 'RM'.
    # A plain FK cannot express that — enforce in the service layer when assigning.
    assigned_rm_uid: Mapped[str | None] = mapped_column(
        String(128), ForeignKey("users.firebase_uid"), nullable=True
    )
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    country_of_residence: Mapped[str | None] = mapped_column(String(255), nullable=True)
    authorized_person: Mapped[str | None] = mapped_column(String(255), nullable=True)
    initiate_method: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AdminProfile(Base):
    __tablename__ = "admin_profiles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, index=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[AdminRole] = mapped_column(
        SAEnum(AdminRole, native_enum=False, length=32), nullable=False
    )
    phone_number: Mapped[str | None] = mapped_column(String(32), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

> **`assigned_rm_uid` FK caveat.** Two FKs from `client_profiles` into `users` (one via `user_id`, one via `assigned_rm_uid → users.firebase_uid`) is fine, but `assigned_rm_uid` references a non-PK unique column. MySQL/MariaDB requires that target column to be indexed — `firebase_uid` already is (`unique=True, index=True`), so this is satisfied. No endpoint sets this field in Proposal 002's scope; it is schema-only for now.

---

## Section C — Schema migration + existing-data backfill  ✅ Q1 (Alembic), Q2 (~18 real rows)

**This is the edge-case section.** The hard constraint: **`users.role` is the only source of truth for who is a client vs. admin, and it must be read before it is dropped.** Order is therefore non-negotiable.

### C.1 Required ordering

```
1. ADD COLUMN users.portal  (NULLABLE for now)
2. CREATE TABLE client_profiles
3. CREATE TABLE admin_profiles
4. BACKFILL: read users.role → set users.portal + insert profile rows   ← reads role
5. ALTER users.portal  SET NOT NULL                                     ← after every row has a value
6. DROP COLUMN users.role                                              ← only now is role safe to drop
```

Steps 1–3 and 5–6 are DDL in the Alembic `upgrade()`. Step 4 is data and must sit **between** them, inside the same revision.

> ✅ **Q2 — this is a production-grade migration.** ~18 real rows exist (including the dev-user). Before running against any real DB: take a snapshot/backup, run the revision against a *restored copy* first, and verify checks J.1–J.4. The `DROP COLUMN role` in Phase 3 is irreversible without the snapshot.

### C.2 Backfill logic (mapping confirmed in Proposal §5.4 — no edge cases)

```
for each row in users:
    if row.role == 'CLIENT':
        row.portal = 'client'
        if no client_profiles row for row.id:
            INSERT client_profiles(user_id = row.id)        # other fields NULL — filled by C.5 seeding (Q6)
    else:   # RM | PM | PC | COMPLIANCE | ADMIN
        row.portal = 'admin'
        if no admin_profiles row for row.id:
            INSERT admin_profiles(user_id = row.id, role = row.role)
```

The dev-user (`role='ADMIN'`) maps to `portal='admin'` + an `admin_profiles` row with `role='ADMIN'`. ✅ Q5: this is accepted — dev-mode has no client-portal user to test with, and the dev-bypass feature is slated for removal anyway (FR-2).

### C.3 The migration revision — one Alembic revision, three phases

```python
"""0002 client/admin separation"""
from alembic import op
import sqlalchemy as sa

def upgrade() -> None:
    # --- Phase 1: additive DDL ---
    op.add_column("users", sa.Column("portal", sa.String(16), nullable=True))
    op.create_index("ix_users_portal", "users", ["portal"])

    op.create_table(
        "client_profiles",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), unique=True, nullable=False),
        sa.Column("name", sa.String(255)),
        sa.Column("primary_phone", sa.String(32)),
        sa.Column("assigned_rm_uid", sa.String(128), sa.ForeignKey("users.firebase_uid")),
        sa.Column("address", sa.Text),
        sa.Column("country_of_residence", sa.String(255)),
        sa.Column("authorized_person", sa.String(255)),
        sa.Column("initiate_method", sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "admin_profiles",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), unique=True, nullable=False),
        sa.Column("name", sa.String(255)),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("phone_number", sa.String(32)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # --- Phase 2: data backfill (reads users.role) ---
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, role FROM users")).fetchall()
    for uid_pk, role in rows:
        if role == "CLIENT":
            conn.execute(sa.text("UPDATE users SET portal='client' WHERE id=:i"), {"i": uid_pk})
            conn.execute(sa.text(
                "INSERT INTO client_profiles (user_id) "
                "SELECT :i WHERE NOT EXISTS (SELECT 1 FROM client_profiles WHERE user_id=:i)"
            ), {"i": uid_pk})
        else:
            conn.execute(sa.text("UPDATE users SET portal='admin' WHERE id=:i"), {"i": uid_pk})
            conn.execute(sa.text(
                "INSERT INTO admin_profiles (user_id, role) "
                "SELECT :i, :r WHERE NOT EXISTS (SELECT 1 FROM admin_profiles WHERE user_id=:i)"
            ), {"i": uid_pk, "r": role})

    # --- Phase 3: tighten + drop source column ---
    op.alter_column("users", "portal", existing_type=sa.String(16), nullable=False)
    op.drop_column("users", "role")


def downgrade() -> None:
    op.add_column("users", sa.Column("role", sa.String(32), nullable=True))
    conn = op.get_bind()
    # reconstruct role: admins from admin_profiles, clients → 'CLIENT'
    conn.execute(sa.text(
        "UPDATE users u JOIN admin_profiles a ON a.user_id=u.id SET u.role=a.role"
    ))
    conn.execute(sa.text("UPDATE users SET role='CLIENT' WHERE portal='client'"))
    op.alter_column("users", "role", existing_type=sa.String(32), nullable=False)
    op.drop_table("admin_profiles")
    op.drop_table("client_profiles")
    op.drop_index("ix_users_portal", table_name="users")
    op.drop_column("users", "portal")
```

### C.4 Idempotency / safety

- The `WHERE NOT EXISTS` guards make profile inserts re-runnable.
- ✅ Q2: ~18 real rows exist — run against a **backup/snapshot** first; dry-run on a restored copy.
- Verify `SELECT COUNT(*) FROM users WHERE portal IS NULL` returns `0` before Phase 3.

### C.5 Dummy-data seeding for existing test rows  ✅ Q6

The ~18 existing rows are throwaway records from early development; they carry no real profile content, and the migration (C.3) leaves their profile rows with `NULL` fields. A **one-off seeding script** populates dummy values so the profile tables are exercisable end-to-end. It is **not** part of the Alembic revision — it is a standalone script run manually after `alembic upgrade head`, so it never executes against a real production dataset by accident.

**Requirement: every seeded value is unique across rows** (no repeated names, phones, addresses, etc.). To keep mock data separate from the runner, both live in their own package:

```
api-backend/scripts/
└── seed_profiles/
    ├── __init__.py
    ├── mock_data.py     # curated unique value pools + uniqueness guards
    └── seed.py          # the runner (reads mock_data, writes profiles)
```

#### `scripts/seed_profiles/mock_data.py`

Curated, distinct pools. `next_*` helpers pop a never-reused value per call, and uniqueness is asserted at module import so the script fails loudly rather than silently repeating.

```python
"""Unique mock-data pools for the one-off profile seeding (Section C.5).
Each value is consumed at most once; helpers raise if a pool is exhausted."""

CLIENT_NAMES = [
    "Amelia Hart", "Benjamin Cole", "Chloe Nguyen", "Daniel Foster", "Elena Marsh",
    "Felix Romano", "Grace Pemberton", "Henry Adeyemi", "Isabel Cruz", "Jonas Wexler",
]
ADMIN_NAMES = [
    "Olivia Sterling", "Marcus Trent", "Priya Raman", "Sofia Almeida", "Victor Lindqvist",
    "Wei Chen", "Nadia Haddad", "Theo Brandt",
]
COUNTRIES = [
    "Singapore", "Malaysia", "Indonesia", "Thailand", "Philippines",
    "Vietnam", "Hong Kong", "Japan", "South Korea", "Australia",
]
INITIATE_METHODS = [
    "referral", "walk-in", "online-form", "event", "partner-bank",
    "cold-outreach", "existing-relationship", "roadshow", "webinar", "introducer",
]

# Fail at import if a pool has duplicates — the whole point is uniqueness.
for _pool in (CLIENT_NAMES, ADMIN_NAMES, COUNTRIES, INITIATE_METHODS):
    assert len(_pool) == len(set(_pool)), f"duplicate in mock pool: {_pool}"


def client_phone(i: int) -> str:    # deterministic, globally unique by index
    return f"+65{8000_0000 + i}"

def admin_phone(i: int) -> str:
    return f"+65{9000_0000 + i}"

def address(i: int) -> str:
    return f"{10 + i} Marina Boulevard, Unit #{i:02d}-01, Singapore {18000 + i:05d}"

def authorized_person(i: int) -> str:
    return f"Authorized Rep {i + 1:03d}"
```

#### `scripts/seed_profiles/seed.py`

```python
"""One-off: fill UNIQUE dummy profile data for the early-development test rows.
Run ONCE, after `alembic upgrade head`, ONLY on dev/test databases.
Idempotent: only fills rows whose `name` is still NULL (never clobbers real data)."""
from app.core.database import SessionLocal
from app.models.users import AdminProfile, ClientProfile, Portal, User

from scripts.seed_profiles import mock_data as m


def run() -> None:
    db = SessionLocal()
    try:
        users = db.query(User).order_by(User.id).all()
        ci = ai = 0   # independent client / admin indices → unique pool draws

        for u in users:
            if u.portal == Portal.CLIENT:
                p = db.query(ClientProfile).filter(ClientProfile.user_id == u.id).one_or_none()
                if p and p.name is None:                    # skip already-populated rows
                    p.name = m.CLIENT_NAMES[ci]             # IndexError if pool too small — extend it
                    p.primary_phone = m.client_phone(ci)
                    p.address = m.address(ci)
                    p.country_of_residence = m.COUNTRIES[ci]
                    p.authorized_person = m.authorized_person(ci)
                    p.initiate_method = m.INITIATE_METHODS[ci]
                    # assigned_rm_uid left NULL — no RM-assignment flow yet (Section B.2 invariant)
                    ci += 1
            else:
                a = db.query(AdminProfile).filter(AdminProfile.user_id == u.id).one_or_none()
                if a and a.name is None:
                    a.name = m.ADMIN_NAMES[ai]
                    a.phone_number = m.admin_phone(ai)
                    ai += 1
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    run()
```

Run with: `python -m scripts.seed_profiles.seed`

> **Uniqueness & safety guarantees:**
> - Names/countries/initiate-methods come from duplicate-free pools (asserted at import); phones/addresses are generated deterministically per index, so no two rows share a value.
> - Independent `ci`/`ai` counters mean client and admin draws never collide and each pool is consumed in order.
> - Only writes when `name IS NULL`, so re-runs and any genuinely-populated rows are untouched.
> - If a pool is smaller than the number of rows, the script raises `IndexError` immediately — extend the pool rather than letting it wrap and repeat.
> - `assigned_rm_uid` stays `NULL` — pointing it at an arbitrary user could violate the "must be an RM" invariant (Section B.2).

---

## Section D — Firebase custom claims  ✅ Q3 (lazy)

Maps to Proposal §4. One piece: a setter used by register/provisioning (Section G). No proactive backfill — existing users get their claim lazily on next login (Section G.2).

### D.1 `app/core/security.py` — add claim helpers

```python
from firebase_admin import auth  # already imported in this module


def set_portal_claims(uid: str, portal: str, role: str | None, settings: Settings) -> None:
    """Stamp portal (and role for admins) onto the user's Firebase token.

    No-op under FIREBASE_AUTH_DISABLED — dev tokens are decoded unverified and
    carry no server-set claims, so portal is sourced from DB/body in dev (Q5).
    """
    if settings.firebase_auth_disabled:
        return
    _init_firebase(settings)
    claims = {"portal": portal}
    if role is not None:
        claims["role"] = role
    auth.set_custom_user_claims(uid, claims)


def portal_from_claims(claims: dict) -> str | None:
    """Read the server-set portal claim from a verified token, if present."""
    value = claims.get("portal")
    return value if value in ("client", "admin") else None
```

> Note: `verify_firebase_token` / `verify_firebase_id_token_string` already return the full verified claims dict, so `portal` arrives automatically once set — no change to those functions.

### D.2 Claim propagation latency (Proposal §11 Q2)

A freshly set claim only appears after the client refreshes its ID token. The register/provisioning responses should signal the frontends to call `getIdToken(true)`. **This is a frontend coordination item, not backend code** — flagged, not implemented here.

### D.3 No proactive claim backfill  ✅ Q3 (lazy)

Existing real users are **not** iterated. The lazy refresh in Section G.2 stamps the claim on each user's next login. This is safe because the portal gate (Section E) reads the **DB-resolved** user, not the raw token claim — so enforcement is correct even while a user's claim is momentarily stale, and it self-heals on first login.

---

## Section E — Auth dependency split + portal gate  ✅ Q4 (auto-create as client), Q5 (dev unchanged)

Maps to Proposal §7.2–§7.3. Rewrites `app/libs/auth/deps.py`.

### E.1 Shared resolver + three dependencies

```python
from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.security import verify_firebase_token
from app.libs.users.repository import UserRepository
from app.models.users import Portal, User


def _resolve_user(
    claims: Annotated[dict, Depends(verify_firebase_token)],
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    """Bearer token → users row. Portal-agnostic. Used by the shared and both
    portal-scoped dependencies."""
    repo = UserRepository(db)

    if settings.firebase_auth_disabled:
        # ✅ Q5: dev bypass unchanged — resolves the single admin dev-user. Client-portal
        # routes aren't testable offline; accepted (FR-2: this bypass is slated for removal).
        user = repo.get_by_firebase_uid("dev-user")
        if user is None:
            user = repo.create_admin("dev-user", "dev@example.com", role="ADMIN")  # see Section G repo
        return user

    uid = claims.get("uid")
    if not uid:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token missing uid")
    raw_email = claims.get("email")
    email = raw_email.strip() if isinstance(raw_email, str) and raw_email.strip() else None

    user = repo.get_by_firebase_uid(uid)
    if user is None:
        # ✅ Q4: keep today's behaviour — auto-create unknown tokens as client + client_profiles.
        # FUTURE-REFACTOR (FR-1): tighten to reject unknown tokens and require /register, so
        # portal assignment happens in exactly one place. Deferred until both frontends are
        # confirmed to register before any authenticated call.
        user = repo.create_client(uid, email)
    elif email and user.email != email:
        user = repo.update_email(user, email)
    return user


def get_current_user(user: Annotated[User, Depends(_resolve_user)]) -> User:
    """Shared — no portal assertion. Used by /api/auth/me, /api/users/me."""
    return user


def get_current_client_user(user: Annotated[User, Depends(_resolve_user)]) -> User:
    if user.portal != Portal.CLIENT:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Client portal access only")
    return user


def get_current_admin_user(user: Annotated[User, Depends(_resolve_user)]) -> User:
    if user.portal != Portal.ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin portal access only")
    return user
```

### E.2 `require_action` now reads `admin_profiles.role`

`role` is no longer on `User`; action checks are admin-only and read the profile. `require_action` therefore layers on `get_current_admin_user`.

```python
from app.libs.auth.actions import Action, get_actions_for_role
from app.libs.users.repository import AdminProfileRepository  # Section G


def require_action(action: Action):
    def _dep(
        user: Annotated[User, Depends(get_current_admin_user)],
        db: Annotated[Session, Depends(get_db)],
    ) -> User:
        profile = AdminProfileRepository(db).get_by_user_id(user.id)
        if profile is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No admin profile")
        if action not in get_actions_for_role(profile.role):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail=f"Action '{action}' not permitted for your role.",
            )
        return user
    return _dep
```

> **Behavioural consequence.** Every existing `require_action(...)`-gated endpoint (users, financial, documents routers from Impl-001) now also implicitly requires `portal == 'admin'`. A client token gets `403` at the portal assertion before the action check. This is the intended tightening — confirm no current endpoint is meant to be client-reachable via an action (none are, per the action matrix).

---

## Section F — Action map re-key

Maps to Proposal §6. Rewrites `app/libs/auth/actions.py` to key on `AdminRole`; client actions leave the role map.

```python
import enum
from app.models.users import AdminRole


class Action(str, enum.Enum):
    # ... unchanged enum members (financial:*, compliance:*, analytics:*,
    #     clients:*, documents:*, admin:*) ...


# Client capabilities are no longer role-keyed — they are gated by the client
# portal dependency, not by a role lookup.
CLIENT_ACTIONS: set[Action] = {
    Action.DOCUMENT_VIEW_OWN,
    Action.DOCUMENT_SUBMIT_OWN,
}

ROLE_ACTIONS: dict[AdminRole, set[Action]] = {
    AdminRole.RM: {
        Action.FINANCIAL_SUBMIT,
        Action.CLIENT_VIEW,
        Action.CLIENT_MANAGE,
        Action.CLIENT_SUBMIT_ON_BEHALF,
    },
    AdminRole.PM: { ... },          # unchanged contents, key type now AdminRole
    AdminRole.PC: { ... },
    AdminRole.COMPLIANCE: { ... },
    AdminRole.ADMIN: set(Action),
}
# NOTE: the former UserRole.CLIENT entry is deleted.


def get_actions_for_role(role: AdminRole) -> set[Action]:
    return ROLE_ACTIONS.get(role, set())
```

> The client document endpoints in `libs/documents/router.py` (Impl-001 §7.11) currently gate on `require_action(Action.DOCUMENT_VIEW_OWN/SUBMIT_OWN)`. Those must switch from `require_action` to `get_current_client_user` (+ membership check against `CLIENT_ACTIONS` if you want symmetry). ⚠ This is a concrete edit to an existing file — flag for the documents module owner; it is *behaviourally* required because `DOCUMENT_VIEW_OWN` is no longer in any `ROLE_ACTIONS` entry and would otherwise 403 every client.

---

## Section G — Portal-aware register / login / provisioning  ✅ Q4 (auto-create client), Q6 (nullable profiles)

Maps to Proposal §7.4–§7.5.

### G.1 Repository changes — `app/libs/users/repository.py`

`create(uid, email, role)` and `update_role` assume `users.role`. Replace with portal-aware creators plus profile repos.

```python
from app.models.users import AdminProfile, ClientProfile, Portal, User


class UserRepository:
    def __init__(self, db): self.db = db

    def get_by_firebase_uid(self, uid): ...
    def get_by_id(self, user_id): ...
    def update_email(self, user, email): ...    # unchanged

    def create_client(self, uid: str, email: str | None) -> User:
        user = User(firebase_uid=uid, email=email, portal=Portal.CLIENT)
        self.db.add(user); self.db.flush()
        self.db.add(ClientProfile(user_id=user.id))   # empty profile (Q6)
        self.db.commit(); self.db.refresh(user)
        return user

    def create_admin(self, uid: str, email: str | None, role: str) -> User:
        user = User(firebase_uid=uid, email=email, portal=Portal.ADMIN)
        self.db.add(user); self.db.flush()
        self.db.add(AdminProfile(user_id=user.id, role=role))
        self.db.commit(); self.db.refresh(user)
        return user

    # create(...)/update_role(...) are REMOVED. Grep callers (auth/service.py,
    # users/router.py) — all are rewritten in this section.


class AdminProfileRepository:
    def __init__(self, db): self.db = db
    def get_by_user_id(self, user_id: int) -> AdminProfile | None:
        return self.db.query(AdminProfile).filter(AdminProfile.user_id == user_id).one_or_none()
    def upsert_role(self, user_id: int, role: str) -> AdminProfile:
        row = self.get_by_user_id(user_id)
        if row is None:
            row = AdminProfile(user_id=user_id, role=role); self.db.add(row)
        else:
            row.role = role
        self.db.commit(); self.db.refresh(row)
        return row


class ClientProfileRepository:
    def __init__(self, db): self.db = db
    def get_by_user_id(self, user_id: int) -> ClientProfile | None:
        return self.db.query(ClientProfile).filter(ClientProfile.user_id == user_id).one_or_none()
```

### G.2 `app/libs/auth/service.py` — portal-aware `login_or_register`

```python
from app.core.security import set_portal_claims, portal_from_claims
from app.models.users import Portal, User
from app.schemas.auth import PortalKind


def login_or_register(
    id_token, portal: PortalKind, repo, settings,
    *, must_be_new=False, requested_role=None,
) -> User:
    claims = verify_firebase_id_token_string(id_token, settings)
    uid, email = _uid_email(claims, settings)   # same extraction as today

    existing = repo.get_by_firebase_uid(uid)

    if must_be_new and existing is not None:
        raise HTTPException(409, "Already registered. Use POST /api/auth/login.")

    if existing is None:
        if portal == "admin":
            role_value = requested_role or "ADMIN"
            user = repo.create_admin(uid, email, role=role_value)
            set_portal_claims(uid, "admin", role_value, settings)
        else:
            user = repo.create_client(uid, email)
            set_portal_claims(uid, "client", None, settings)
        return user

    # LOGIN of an existing user: trust the PERSISTED portal, not the body (Proposal §7.4).
    if email and existing.email != email:
        existing = repo.update_email(existing, email)
    # ✅ Q3 lazy path: if the token lacks a portal claim, refresh it from DB here.
    if portal_from_claims(claims) is None:
        role = AdminProfileRepository(repo.db).get_by_user_id(existing.id)
        set_portal_claims(
            existing.firebase_uid, existing.portal.value,
            role.role.value if role else None, settings,
        )
    return existing
```

### G.3 `app/libs/auth/router.py` — register gate unchanged in spirit

The existing admin-self-registration block (router lines 22–29) stays; only the `login_or_register` call signature gains `portal`. `requested_role` continues to be honoured only in `dev_mode` + `portal=='admin'`.

### G.4 Provisioning — `PATCH /api/users/{firebase_uid}/role`

The existing endpoint (`users/router.py:37`) must now (a) ensure `portal='admin'`, (b) upsert `admin_profiles.role`, (c) set the claim. Note: it currently calls `service.update_role`, which no longer exists (Section G.1 removed it).

```python
@router.patch("/{firebase_uid}/role", response_model=UserOut)
def update_user_role(
    firebase_uid: str,
    body: UserUpsert,                       # body.role now typed AdminRole (Section H)
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    _: Annotated[User, Depends(require_action(Action.USER_MANAGE))],
) -> UserOut:
    user = UserRepository(db).get_by_firebase_uid(firebase_uid)
    if user is None:
        raise HTTPException(404, "User not found")
    if user.portal != Portal.ADMIN:
        # Proposal §11 Q4 assumes a UID is permanently one portal; this endpoint does
        # not flip portal. (FR-1-adjacent: portal transitions are out of scope.)
        raise HTTPException(409, "User is not an admin-portal user")
    AdminProfileRepository(db).upsert_role(user.id, body.role.value)
    set_portal_claims(user.firebase_uid, "admin", body.role.value, settings)
    db.refresh(user)
    return user                              # role read via User.role property (Section H.0)
```

> ⚠ **Surfaced policy gap (Q4-adjacent).** There is no endpoint that creates an admin user *from scratch* in prod (self-registration is blocked). Impl-001 OQ-7 already flagged that `POST /api/users` for admin creation is unbuilt. With portal separation this becomes more pointed: the only way an `admin_profiles` row appears in prod is the backfill or this PATCH — and PATCH currently 404s on unknown UIDs. Confirm the admin-creation flow before `dev_mode=False`.

---

## Section H — `UserOut` contract assembly  ✅ Q7 (computed `role` property, no helper)

Maps to Proposal §8. `role` is no longer a column on `User`. Rather than build `UserOut` manually at each call site (the discarded `build_user_out` helper), expose a **computed `role` property** on the `User` ORM model. `from_attributes` then reads `user.role` exactly as before, and every endpoint keeps doing `return user` — **no handler signatures change.**

### H.0 Add relationships + a `role` property to `User`  (extends Section B.1)

```python
from sqlalchemy.orm import relationship

class User(Base):
    # ... columns from Section B.1 ...

    # One-to-one to whichever profile matches `portal`. lazy="joined" avoids an
    # extra round-trip when serialising UserOut.
    admin_profile = relationship(
        "AdminProfile", uselist=False, lazy="joined",
        primaryjoin="User.id == AdminProfile.user_id", viewonly=True,
    )
    client_profile = relationship(
        "ClientProfile", uselist=False, lazy="joined",
        primaryjoin="User.id == ClientProfile.user_id", viewonly=True,
    )

    @property
    def role(self) -> str:
        """Derived wire value. 'CLIENT' for clients; admin_profiles.role for admins.
        Replaces the old users.role column; keeps UserOut/from_attributes working."""
        if self.portal == Portal.ADMIN:
            return self.admin_profile.role.value if self.admin_profile else "ADMIN"
        return "CLIENT"
```

> Read within request scope (the `get_db` session is still open during response serialisation, before the dependency's `finally` closes it), so the joined load resolves cleanly. `viewonly=True` keeps these relationships read-only so they never interfere with the explicit profile writes in Section G.

### H.1 `app/schemas/users.py`

```python
from pydantic import BaseModel, EmailStr
from app.models.users import AdminRole


class UserOut(BaseModel):
    id: int
    firebase_uid: str
    email: str | None
    role: str                  # ✅ Q7: was UserRole enum; now reads the User.role
                               # property. Wire-identical (enum already serialised to str).
    # Optional additive field (Proposal §8 / §11 Q1) — include only if frontends want it:
    # portal: str

    model_config = {"from_attributes": True}


class UserSelfUpdate(BaseModel):
    email: EmailStr | None = None


class UserUpsert(BaseModel):
    email: EmailStr | None = None
    role: AdminRole = AdminRole.RM     # was UserRole; default no longer CLIENT
```

### H.2 Endpoints are unchanged

`/api/auth/me`, `/api/users/me`, `/api/users/{uid}` keep `return user`. `from_attributes` reads the `role` property (H.0) transparently. **No `build_user_out` helper, no handler edits** — this is the point of the property approach (Q7).

---

## Section I — Wiring

Maps to Proposal §7.1.

### I.1 `app/main.py`

`models/users.py` already imported for `Base.metadata` (main.py:14). No new model module to register (profiles live in `users.py`). Add the future route prefixes only if you are introducing the trees now:

```python
# Existing routers stay mounted as-is (placeholders untouched per Proposal non-goals).
# When client/admin trees are introduced:
# app.include_router(client_router, prefix="/api/client")
# app.include_router(admin_router,  prefix="/api/admin")
```

> ⚠ Proposal §7.1 says client/admin route *trees* are for **future** domain work and the financial/documents placeholders stay where they are. So Section I introduces **no new routers** in this refactor — only the dependency-level gate (Section E) and the documents-router edit (Section F) change behaviour. Confirm you do **not** want the `/api/client` & `/api/admin` prefixes scaffolded now (empty), to avoid dead routers.

---

## Section J — Verification

Run with the migration applied. Extends Impl-001 §10.

| # | Test | Expected |
|---|------|----------|
| 1 | Migration Phase-2 guard: `SELECT COUNT(*) FROM users WHERE portal IS NULL` | `0` before Phase 3 |
| 2 | Post-migration: every old CLIENT row has a `client_profiles` row | counts match |
| 3 | Post-migration: every old non-CLIENT row has an `admin_profiles` row with matching `role` | counts match |
| 4 | `users.role` column | gone |
| 5 | Client registers (`portal=client`) | 201; `client_profiles` row; `UserOut.role=="CLIENT"`; claim set (prod) |
| 6 | `GET /api/auth/me` (client) | 200; `role=="CLIENT"` |
| 7 | Client token → any `require_action` endpoint (e.g. `PATCH /api/users/{uid}/role`) | 403 (portal gate) |
| 8 | Admin provisioned via `PATCH /{uid}/role` | `admin_profiles` upserted; claim `{portal:admin, role}` |
| 9 | Admin token → admin-gated endpoint | 200/403 per action matrix |
| 10 | Client document endpoints (Section F edit) | reachable by client, not by admin-only action path |
| 11 | `FIREBASE_AUTH_DISABLED=true` login | resolves dev-user; no claim calls; no crash (Q5: client-portal not testable offline) |
| 12 | Legacy token without portal claim logs in (Q3 lazy) | portal derived from DB; claim refreshed; succeeds |

---

## Consolidated open questions

**Section 0 (Q1–Q7): all resolved** — see the decisions table at the top. Two follow-on items logged as FUTURE-REFACTOR: FR-1 (tighten auto-provision to require `/register`) and FR-2 (remove the `FIREBASE_AUTH_DISABLED` dev bypass).

**Non-blocking (inherited / surfaced):**
- Proposal §11 Q1 — expose `portal` in `UserOut`? (frontend coordination)
- Proposal §11 Q2 — admin-frontend must force token refresh after provisioning (Section D.2)
- Proposal §11 Q3 — re-homing financial/documents under `/api/client` vs `/api/admin` when implemented
- Proposal §11 Q4 — can a UID ever change portal? (Section G.4 currently forbids it)
- `assigned_rm_uid` has no setter endpoint in this scope; the "target must be an RM" invariant (Section B.2) is unenforced until one exists
- Impl-001 OQ-7 — prod admin-creation endpoint still unbuilt; more urgent under separation (Section G.4 note)
