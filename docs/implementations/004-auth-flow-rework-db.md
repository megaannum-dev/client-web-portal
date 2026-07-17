# 004 — Authentication Flow Rework · Implementation Details — Layer: Database

> Status: **DRAFT — pending implementation.**
> Implements: proposal `docs/proposals/004-2026-06-11-auth-flow-rework.md` § 4.6 (per-portal login status gate), § 4.11 (cross-system consistency / `authorized_by` FK), § 6 (Migration & Compatibility)
> Layer: Database — **one layer per file.**
> Sibling layer docs: `docs/implementations/004-auth-flow-rework-be.md` (Backend — consumes this layer's `assert_can_authenticate` gate function and the new columns.)
> Execution schedule: `docs/execution-schedules/004-auth-flow-rework-db.md` (does not yet exist)
> Branch: `rework-authentication-module-db` — cut from the current branch `rework-authentication-module` (the parent). Merges back into the parent; the human owns that merge.
> Builds on / prerequisites: migration `79729eec2af4` (0002 client/admin separation) and migration `8f2a1c9d4b6e` (0003 UUID keys and column order) — both already landed and merged. **The actual current alembic head, verified by walking `down_revision` across every file in `api-backend/alembic/versions/`, is `d06ece9f47be` (0016 `recon_order_fields_and_run_delta_ledger`)** — 13 revisions ahead of the stale `8f2a1c9d4b6e` figure the earlier hybrid doc cited. This layer's migration revises `d06ece9f47be`, not `8f2a1c9d4b6e`.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/004-2026-06-11-auth-flow-rework.md` § 4.6, § 4.11, § 6 |
| Execution schedule | `docs/execution-schedules/004-auth-flow-rework-db.md` |
| Sibling layer impl docs | `docs/implementations/004-auth-flow-rework-be.md` (Backend — wires `assert_can_authenticate` into the request path) |
| Builds on | Alembic head at session start: `d06ece9f47be` (0016). Prior 004-relevant migrations `79729eec2af4` (0002) and `8f2a1c9d4b6e` (0003) are already merged and untouched by this layer. |

---

## 2. Branch & session contract

- **Branch:** `rework-authentication-module-db` — all work units in this doc land on this one branch.
  - Naming convention: parent branch (`rework-authentication-module`, captured via `git rev-parse --abbrev-ref HEAD` at session start) + `-db` suffix.
  - Per-layer branches merge back into the parent; **the human owns that merge** (this session stops at "PR opened").
- **Isolation:** this layer is implementable in a separate session, in parallel with the Backend layer, provided the preconditions below hold. It shares state with the Backend layer **only** through the pinned contract in § 7 — the Backend layer's code is not visible on this branch and must not be imported or waited on.
- **Preconditions (must be true before starting):**
  - [ ] Alembic head on the target DB/branch is `d06ece9f47be` (0016) — verify with `alembic current` before authoring the new revision; if a newer revision has landed since this doc was written, re-verify the head and adjust `down_revision` accordingly.
  - [ ] The frozen seam in § 7 is taken as agreed (it is a verbatim copy of proposal § 4.6 / § 6) — this layer does not renegotiate it.
  - [ ] **Live row counts are unknown and must be re-queried, not assumed.** The proposal's own migration bullet (§ 6) cites "5 client / 10 admin rows" from the 005 cutover; this figure is known-stale as of this writing. `DB-2`'s `_require()` assertions and rehearsal (§ 9) must run against a fresh `SELECT COUNT(*)` from the actual target database, whatever that count turns out to be — never against the proposal's hardcoded numbers.
- **Read-first inventory:**
  - `api-backend/app/models/users.py` — `Portal`, `AdminRole` enums, `User`, `ClientProfile`, `AdminProfile` models; this layer adds `ClientStatus`, three new columns, and one new relationship disambiguation.
  - `api-backend/alembic/versions/d06ece9f47be_0016_recon_order_fields_and_run_delta_.py` — current head; new migration's `down_revision`.
  - `api-backend/alembic/versions/8f2a1c9d4b6e_0003_uuid_keys_and_column_order.py` — source of the `_require()` self-assertion pattern and MariaDB-only `op.execute` convention this layer's migration follows.
  - `api-backend/alembic/versions/79729eec2af4_0002_client_admin_separation.py` — prior example of an additive-column + backfill migration over live `users`/`client_profiles`/`admin_profiles` data.
  - `api-backend/tests/models/conftest.py` — existing SQLite `create_all` fixture pattern this layer's tests reuse (in-memory engine, `PRAGMA foreign_keys=ON`, `sessionmaker` with `expire_on_commit=False`).
  - `api-backend/pyproject.toml` — confirms `pytest`/`ruff`/`mypy` configuration referenced in § 3.2.
- **Hand-off / exit signal:** all `DB-*` units committed; migration applies clean up **and** down against MariaDB (rehearsed per § 9, not just SQLite `create_all`); `assert_can_authenticate` unit-tested in isolation; PR opened against `rework-authentication-module`.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- **Layering:** models (`app/models/users.py`) → migration (`alembic/versions/`) → pure gate function (`app/libs/auth/status.py`, new file). No FastAPI/HTTP concerns anywhere in this layer — wiring the gate into a route dependency is Backend-layer work.
- **Enum persistence:** value-based string enums via `SAEnum(EnumCls, native_enum=False, length=N, values_callable=lambda c: [m.value for m in c])`, matching the existing `Portal`/`AdminRole` columns exactly (see `app/models/users.py:33-45` and `:126-137`).
- **Column placement:** every new column is added **before** the two timestamp columns (`created_at`, `updated_at`) of its table, per the established layout (proposal § 6) and per migration `8f2a1c9d4b6e`'s column-order precedent.
- **Migration style:** MariaDB-targeted via `op.execute` (not the SQLAlchemy-dialect-agnostic `op.add_column` alone, where column *positioning* — `AFTER <col>` — matters), with a module-level `_require(condition, message)` self-assertion helper copied from `8f2a1c9d4b6e`, and pre/post row-count checks. The SQLite test path (`Base.metadata.create_all`) never executes this migration's DDL — it only ever builds the *end-state* ORM schema — so the migration is unverifiable by the standard `pytest` run and depends on the rehearsal gate (§ 9) instead.
- **Self-referential FK disambiguation:** `users.authorized_by` is a second FK from `users` back into `users` (via `firebase_uid`), joining the existing `assigned_rm_uid` (client_profiles → users.firebase_uid) precedent from § E-3 of the models file. Any relationship built over it must pass explicit `foreign_keys=` to avoid SQLAlchemy's ambiguous-join error, exactly as `User.client_profile` already does for the `assigned_rm_uid` FK.

### 3.2 CI/CD & engineering discipline
- **Trunk-friendly, small units.** Each `DB-*` feature below is one atomic, self-reviewable commit that leaves the branch green.
- **Every unit is independently revertible**, with one documented exception: `DB-2` (the migration) is the layer's single non-additive-only step — its "Dependencies" note this explicitly.
- **Additive & backward-compatible first.** All three new columns are nullable-or-defaulted additions; nothing existing is renamed or dropped. The branch is deployable (schema-wise) at every commit.
- **Gates before merge**, in order — verified against this repo's actual `pyproject.toml` (`[tool.ruff]`, `[tool.pytest.ini_options]`, `[tool.mypy]` are all configured):
  ```bash
  ruff check . && ruff format --check . && mypy app && pytest -q
  ```
- **No secrets, no manual steps in the merge path.** The live-DB migration *apply* (as opposed to authoring/testing it) is a human-gated step in the execution schedule, not silently folded into a `DB-*` unit.
- **Reversibility documented** (§ 9): `DB-2`'s `downgrade()` is mandatory, not optional, given this migration touches live data.

---

## 4. Architecture

**Target layout:**
```
api-backend/app/models/users.py             # + ClientStatus enum, 3 new columns, relationship note
api-backend/alembic/versions/
  <new_rev>_0017_auth_status_columns.py      # revises d06ece9f47be (0016)
api-backend/app/libs/auth/status.py          # NEW: assert_can_authenticate (pure gate function)
```

**Dependency direction:** `status.py` depends only on `app.models.users` (reads `ClientProfile.status`, `AdminProfile.is_active`) and raises a framework-level exception type (`fastapi.HTTPException`, matching the proposal's § 4.6 snippet) — it has no dependency on routers, services, or DB session plumbing. The Backend layer's request-path dependency (`get_current_client_user` / `get_current_admin_user`, sibling doc `004-auth-flow-rework-be.md`) will import and call this function; this layer does not import anything from the Backend layer's modules.

**External seams:** writes/reads `client_profiles.status`, `admin_profiles.is_active`, `users.authorized_by` (all new columns). Exposes the pure function `assert_can_authenticate(user) -> None` as the one thing the Backend layer consumes from this layer for the gate (§ 7).

---

## 5. Modules

### 5.1 `app.models.users` (extended, not new)
- **Responsibility:** ORM schema for `users` / `client_profiles` / `admin_profiles`, now including account-status and audit-trail columns.
- **Files:** `api-backend/app/models/users.py`.
- **Public surface:** `ClientStatus` enum; `ClientProfile.status`, `AdminProfile.is_active`, `User.authorized_by` columns; no new relationships beyond what disambiguation the self-FK requires.
- **Owns features:** `DB-1`.

### 5.2 Alembic migration
- **Responsibility:** land the three columns on the live schema with a safe, assertion-guarded, re-queried backfill; reversible.
- **Files:** `api-backend/alembic/versions/<new_rev>_0017_auth_status_columns.py`.
- **Public surface:** none (infrastructure, not imported by app code).
- **Owns features:** `DB-2`.

### 5.3 `app.libs.auth.status` (new module)
- **Responsibility:** the one pure, portal-dispatching authentication-gate predicate — no I/O beyond reading already-loaded ORM attributes, no side effects.
- **Files:** `api-backend/app/libs/auth/status.py`.
- **Public surface:** `assert_can_authenticate(user) -> None` — raises `HTTPException(403, ...)` on a non-active account; returns `None` (falls through) otherwise. **This is defined here as a DB/model-layer utility; wiring it into the actual request dependency chain (calling it from `get_current_client_user`/`get_current_admin_user` on every authenticated request, per proposal § 4.6 Q-H) is out of scope for this layer — it is Backend-layer work, tracked in the sibling doc `004-auth-flow-rework-be.md`.** This layer's "done" bar is that the function exists, is correct, and is unit-tested in isolation; it does not require any router or dependency-injection code to exist.
- **Owns features:** `DB-3`.

---

## 6. Features

### DB-1 — Status/audit columns on `ClientProfile`, `AdminProfile`, `User` (MANDATORY)

- **Proposal ref:** § 6
- **Module:** 5.1
- **Files:** `modify: api-backend/app/models/users.py`
- **Dependencies:** none — parallel-safe with `DB-3`; must land before `DB-2` (the migration encodes this same shape in DDL) and before the Backend layer's gate-wiring work.

**Contract (required code):**

```python
# api-backend/app/models/users.py

class ClientStatus(str, enum.Enum):
    PENDING = "pending"
    ACTIVE = "active"
    DISABLED = "disabled"


class ClientProfile(Base):
    __tablename__ = "client_profiles"
    # ... existing columns unchanged through ib_account ...

    status: Mapped[ClientStatus] = mapped_column(
        SAEnum(
            ClientStatus,
            native_enum=False,
            length=16,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=ClientStatus.PENDING,
        server_default=ClientStatus.PENDING.value,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AdminProfile(Base):
    __tablename__ = "admin_profiles"
    # ... existing columns unchanged through phone_number ...

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=sa.true())

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class User(Base):
    __tablename__ = "users"
    # ... existing columns through portal ...

    # Nullable self-referential FK: who authorised this account's provisioning
    # (the onboarding RM for a client, the enrolling super-admin for an internal
    # user; NULL for the bootstrap ADMIN and all pre-rework rows). ON DELETE
    # SET NULL, not the SQLAlchemy default RESTRICT — see Behavior/invariants.
    authorized_by: Mapped[str | None] = mapped_column(
        String(128),
        ForeignKey("users.firebase_uid", ondelete="SET NULL"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

(`Boolean` and `sa` need adding to the existing import lines at the top of `users.py`.)

**Behavior / invariants:**
- `status` and `is_active` follow the exact value-based `SAEnum`/`Boolean` convention already used for `Portal`/`AdminRole` — no native DB enum type, no name-based persistence.
- All three columns are physically placed **before** `created_at`/`updated_at` on their table (proposal § 6's placement rule) — the migration in `DB-2` enforces this at the DDL level with `AFTER <col>` clauses; the ORM column *declaration order* here mirrors it for readability but the DB is the source of truth for physical layout.
- `authorized_by` uses **`ON DELETE SET NULL`**, explicitly overriding the SQLAlchemy/MariaDB default of `RESTRICT`. This is load-bearing: `authorized_by` is a *self*-referential FK (`users.authorized_by → users.firebase_uid`). Under the default `RESTRICT`, deleting any user who had ever authorised another user's onboarding would be blocked by that other user's still-existing `authorized_by` reference — including the eventual `identity-drift-report` tool's class-A cleanup deletes (proposal § 4.11), which would then be silently wedged by an unrelated audit-trail pointer. `SET NULL` lets the audit trail degrade gracefully (provenance becomes unknown) instead of blocking deletion.
- If a relationship is later added over `authorized_by`, it must pass explicit `foreign_keys=` (same pattern as `User.client_profile` over `assigned_rm_uid`) to avoid an ambiguous-join error, since `users` will then have two distinct FK paths into itself/`client_profiles` that touch `firebase_uid`.

**Done when:** the three columns exist on the ORM models exactly as above; `mypy app` and `ruff check .` pass; a fresh in-memory SQLite `Base.metadata.create_all()` builds the schema with no errors (this proves ORM correctness only — it does **not** prove the live MariaDB migration, which is `DB-2`'s job).

---

### DB-2 — Alembic migration `0017_auth_status_columns` (MANDATORY)

- **Proposal ref:** § 6, § 4.11
- **Module:** 5.2
- **Files:** `create: api-backend/alembic/versions/<new_rev>_0017_auth_status_columns.py`
- **Dependencies:** `DB-1` (encodes the same column shapes in DDL). **Exception to independent revertibility (§ 3.2):** this is the one non-additive-only, live-data-touching unit in the whole 004 rework (proposal § 6, execution-scheduling-plan B1). Reverting its commit after live application requires running `alembic downgrade` as an explicit, human-gated step — it is not a clean `git revert`.

**Contract (required code):**

```python
"""0017_auth_status_columns

Revision ID: <new_rev>
Revises: d06ece9f47be
Create Date: <timestamp>

Adds the R4 account-status + audit-trail columns (proposal 004 § 6):
  * client_profiles.status      ENUM-as-VARCHAR(16): pending|active|disabled, default pending
  * admin_profiles.is_active    BOOLEAN, default true
  * users.authorized_by         nullable FK -> users.firebase_uid, ON DELETE SET NULL

Backfill (over LIVE data — row counts re-queried at migration time, NOT assumed
from any prior design-doc figure): existing clients -> status='active' (conscious
grandfather decision: current clients are not retroactively subjected to the new
compliance gate — see proposal § 4.11 / execution-scheduling-plan risk register),
existing admins -> is_active=true, ALL existing rows -> authorized_by=NULL
(provenance unknown pre-rework).

MariaDB-only DDL (op.execute, AFTER-positioned columns). The SQLite test path
(create_all) never runs this revision.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "<new_rev>"
down_revision: Union[str, Sequence[str], None] = "d06ece9f47be"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _require(condition: bool, message: str) -> None:
    """L1 self-assertion: abort the migration rather than leave a half-migrated table."""
    if not condition:
        raise RuntimeError(f"0017 self-assertion failed: {message}")


def upgrade() -> None:
    conn = op.get_bind()

    # Pre-migration counts, RE-QUERIED here (never hardcoded — see doc §2 precondition).
    client_count = conn.execute(sa.text("SELECT COUNT(*) FROM client_profiles")).scalar()
    admin_count = conn.execute(sa.text("SELECT COUNT(*) FROM admin_profiles")).scalar()
    users_count = conn.execute(sa.text("SELECT COUNT(*) FROM users")).scalar()

    # --- additive DDL, positioned before created_at/updated_at ---
    op.execute(
        "ALTER TABLE client_profiles "
        "ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'pending' AFTER ib_account"
    )
    op.execute(
        "ALTER TABLE admin_profiles "
        "ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER phone_number"
    )
    op.execute(
        "ALTER TABLE users "
        "ADD COLUMN authorized_by CHAR(128) NULL AFTER portal"
    )
    op.execute(
        "ALTER TABLE users ADD CONSTRAINT fk_users_authorized_by "
        "FOREIGN KEY (authorized_by) REFERENCES users(firebase_uid) ON DELETE SET NULL"
    )

    # --- backfill over LIVE data ---
    conn.execute(sa.text("UPDATE client_profiles SET status = 'active'"))
    conn.execute(sa.text("UPDATE admin_profiles SET is_active = 1"))
    conn.execute(sa.text("UPDATE users SET authorized_by = NULL"))

    # --- post-migration self-assertions (re-queried counts, not stale ones) ---
    _require(
        conn.execute(sa.text("SELECT COUNT(*) FROM client_profiles")).scalar() == client_count,
        "client_profiles row count changed during migration",
    )
    _require(
        conn.execute(sa.text("SELECT COUNT(*) FROM admin_profiles")).scalar() == admin_count,
        "admin_profiles row count changed during migration",
    )
    _require(
        conn.execute(sa.text("SELECT COUNT(*) FROM users")).scalar() == users_count,
        "users row count changed during migration",
    )
    _require(
        conn.execute(
            sa.text("SELECT COUNT(*) FROM client_profiles WHERE status IS NULL")
        ).scalar() == 0,
        "client_profiles.status left NULL rows",
    )
    _require(
        conn.execute(
            sa.text("SELECT COUNT(*) FROM client_profiles WHERE status != 'active'")
        ).scalar() == 0,
        "not all pre-existing client_profiles rows backfilled to active",
    )
    _require(
        conn.execute(
            sa.text("SELECT COUNT(*) FROM admin_profiles WHERE is_active != 1")
        ).scalar() == 0,
        "not all pre-existing admin_profiles rows backfilled to is_active=1",
    )
    _require(
        conn.execute(
            sa.text("SELECT COUNT(*) FROM users WHERE authorized_by IS NOT NULL")
        ).scalar() == 0,
        "authorized_by backfill left non-NULL rows",
    )

    # Column-position self-assertions (proposal § 6 placement rule).
    for table, col, after in (
        ("client_profiles", "status", "ib_account"),
        ("admin_profiles", "is_active", "phone_number"),
        ("users", "authorized_by", "portal"),
    ):
        order = {
            name: pos
            for name, pos in conn.execute(
                sa.text(
                    "SELECT COLUMN_NAME, ORDINAL_POSITION FROM information_schema.COLUMNS "
                    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :t"
                ),
                {"t": table},
            ).fetchall()
        }
        _require(
            order[col] == order[after] + 1,
            f"{table}.{col} at position {order[col]}, expected {after}+1 ({order[after] + 1})",
        )
        _require(
            order[col] < order["created_at"],
            f"{table}.{col} at position {order[col]} is not before created_at ({order['created_at']})",
        )


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP FOREIGN KEY fk_users_authorized_by")
    op.execute("ALTER TABLE users DROP COLUMN authorized_by")
    op.execute("ALTER TABLE admin_profiles DROP COLUMN is_active")
    op.execute("ALTER TABLE client_profiles DROP COLUMN status")
```

**Behavior / invariants:**
- Revises the **actual** current head `d06ece9f47be`, not the stale `8f2a1c9d4b6e` cited in the earlier hybrid doc.
- Backfill counts are **re-queried at migration run time** via `SELECT COUNT(*)`, never hardcoded to any prior design-doc figure (the proposal's "5 client / 10 admin rows" and the old doc's "15 live rows" are both explicitly out of scope as facts — this migration must work correctly regardless of the actual live count).
- Backfilling existing clients to `status='active'` is a **conscious grandfather decision**: it permanently exempts already-onboarded clients from the new compliance gate (the gate only ever protects newly onboarded clients going forward). This is the intended call per the proposal (don't lock out current users), recorded here as a decision, not an incidental default.
- `authorized_by`'s FK is declared `ON DELETE SET NULL` at the DDL level (matching `DB-1`'s ORM declaration) — see `DB-1`'s Behavior/invariants for why.
- The status gate (`DB-3`) must not be enforced by the Backend layer until this migration is applied to the target environment (proposal § 4.6) — that sequencing is an execution-schedule concern, not encoded here.
- Downgrade is a clean column-and-constraint drop; it is lossy only in the sense that any `status`/`is_active`/`authorized_by` values written *after* upgrade (e.g. by application code, if the Backend layer's gate went live before a rollback) are discarded — the migration itself does not lose any pre-existing data by construction, since all three columns are pure additions.

**Done when:**
1. Live row counts for `client_profiles`, `admin_profiles`, and `users` are re-queried against the target environment immediately before running `_require()`-guarded assertions (never assumed from any design doc).
2. `alembic upgrade head` and `alembic downgrade -1` both run clean against a MariaDB instance loaded with a dump shaped like current live data, with every `_require()` assertion passing on the way up and the schema fully reverted on the way down (see § 9 — this is the mandatory rehearsal gate, not optional).
3. Column positions verified: `client_profiles.status` immediately after `ib_account`; `admin_profiles.is_active` immediately after `phone_number`; `users.authorized_by` immediately after `portal`; all three before their table's `created_at`.

---

### DB-3 — `assert_can_authenticate` pure gate function (MANDATORY)

- **Proposal ref:** § 4.6
- **Module:** 5.3
- **Files:** `create: api-backend/app/libs/auth/status.py`
- **Dependencies:** `DB-1` (reads `ClientProfile.status` / `AdminProfile.is_active`) — parallel-safe with `DB-2` otherwise.

**Contract (required code — copied verbatim from proposal § 4.6, see § 7.1 below for the frozen seam):**

```python
def assert_can_authenticate(user, db) -> None:
    if user.portal == Portal.CLIENT:
        if user.client_profile is None or user.client_profile.status != ClientStatus.ACTIVE:
            raise HTTPException(403, "Account not active")          # pending | disabled
    else:  # ADMIN
        if user.admin_profile is None or not user.admin_profile.is_active:
            raise HTTPException(403, "Account disabled")            # suspension / offboarding
```

**Behavior / invariants:**
- Pure and side-effect-free: reads only already-loaded ORM relationship attributes (`user.client_profile`, `user.admin_profile`, both `lazy="joined"` per the existing `User` model — see `app/models/users.py:58-75`); the `db` parameter is accepted for signature-compatibility with the proposal's snippet but this function does not issue its own queries.
- Dispatches purely on `user.portal` (`Portal.CLIENT` vs. the `ADMIN` else-branch) — no other portal values exist (`Portal` is a two-member enum).
- A missing profile (`client_profile is None` / `admin_profile is None`) is treated as a failure, not an error — it raises the same 403 as an inactive/disabled status, matching proposal § 4.11 class-C behavior (an incomplete record already fails closed here).
- Raises `HTTPException(403, ...)` — this is the one place this pure module touches a framework type; it does not itself define routes, dependencies, or session plumbing.
- **This function is defined but NOT wired into the request path in this layer.** Calling it from a FastAPI dependency (`get_current_client_user` / `get_current_admin_user`), on every authenticated client request per proposal § 4.6 Q-H, is Backend-layer work — see sibling doc `004-auth-flow-rework-be.md`. This layer's public surface is exactly the function signature above; the Backend layer imports it, this layer does not import anything back.

**Done when:** `assert_can_authenticate` exists at the stated path with the stated signature and passes/fails exactly per the coverage matrix in § 8.2, exercised via unit tests that construct in-memory `User`/`ClientProfile`/`AdminProfile` instances directly (no HTTP layer, no route, no DB session required beyond what SQLite fixtures in `tests/models/conftest.py`-style already provide).

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal § 4.6 and § 6)

Verbatim from proposal § 4.6:

```python
def assert_can_authenticate(user, db) -> None:
    if user.portal == Portal.CLIENT:
        if user.client_profile is None or user.client_profile.status != ClientStatus.ACTIVE:
            raise HTTPException(403, "Account not active")          # pending | disabled
    else:  # ADMIN
        if user.admin_profile is None or not user.admin_profile.is_active:
            raise HTTPException(403, "Account disabled")            # suspension / offboarding
```

Verbatim from proposal § 6 (migration bullet list):

> - **R4 schema change (NEW, required by this proposal):** add columns to existing tables —
>   - `client_profiles.status` (enum/string; `pending` | `active` | `disabled`; default `pending`)
>   - `admin_profiles.is_active` (boolean; default `true`)
>   - `users.authorized_by` (audit trail, Q-F resolved): nullable FK → `users.firebase_uid` recording **who authorised this account** — the onboarding RM for a client, the enrolling super-admin for an internal user, `NULL` for the bootstrap ADMIN and pre-rework rows. (Named `authorized_by`, not `provisioned_by`.)
>   - **Column placement:** every new column is added **before** the two timestamp columns (`created_at`, `updated_at`) of its table, to match the established layout.
>   - **Alembic migration with safe backfill** over the live 005 data (5 client / 10 admin rows): existing clients → `status = active` (so current users are not locked out), existing admins → `is_active = true`, all existing rows → `authorized_by = NULL` (provenance unknown pre-rework).
>   - The status gate (§4.6) **must not be enforced until this migration is applied.**

### 7.2 How this layer honours the seam
- **What this layer contributes to the seam:** the three columns (`DB-1`/`DB-2`) and the pure gate function `assert_can_authenticate` (`DB-3`), exactly as pinned above. Note the "5 client / 10 admin rows" figure quoted verbatim in § 7.1 is the proposal's own text — this layer does **not** treat it as fact (see `DB-2`'s re-query requirement); it is reproduced here only because § 7 requires verbatim reproduction of the proposal seam, not a corrected paraphrase.
- **What this layer assumes from the other side:** the Backend layer will call `assert_can_authenticate(user, db)` from a shared dependency on every authenticated client request (not only at login) and the admin equivalent, per Q-H — this layer's tests treat that call site as a mocked/assumed consumer, never as code this layer executes or imports.
- **Change protocol:** any edit to § 7 requires editing the proposal first; this section is then re-copied. Never edit § 7 in isolation.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Framework / runner:** `pytest` — command: `pytest -q` (configured in `api-backend/pyproject.toml` `[tool.pytest.ini_options]`, `testpaths = ["app", "tests"]`).
- **Fixtures / seed:** in-memory SQLite engine + `Base.metadata.create_all`, matching the existing `api-backend/tests/models/conftest.py` fixture (`session` fixture with `PRAGMA foreign_keys=ON`, `sessionmaker(expire_on_commit=False)`). New per-file fixtures build `User` + `ClientProfile`/`AdminProfile` rows at chosen `status`/`is_active` values.
- **Isolation:** hermetic, in-memory-DB-per-test; safe to run in parallel.
- **Layer isolation (critical):** tests import only from `app.models.users`, `app.libs.auth.status`, and stdlib/pytest/SQLAlchemy test doubles. No import of any Backend-layer route, dependency, or service module.
- **Test location:** `api-backend/tests/models/` for `DB-1`/`DB-2`-adjacent model/migration-shape tests; `api-backend/tests/libs/auth/` (existing directory, currently holds `test_be4_pta_actions.py`) for `DB-3`'s gate-function tests.
- **Commit policy:** tests are **never committed** — `tests/` is git-ignored; generated locally by the `test-gen` skill and run as a pre-commit / pre-hand-off gate.
- **Code generation:** concrete test code is written by the `test-gen` skill from § 8.2/§ 8.3 below — this doc contains no test code.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| DB-1 | New columns exist with correct type/nullability/default on the ORM models; `Base.metadata.create_all` builds cleanly on SQLite | none |
| DB-2 | Migration `upgrade`/`downgrade` round-trip cleanly on MariaDB with a live-shaped dump; backfill sets 100% of pre-existing rows to `active`/`is_active=1`/`authorized_by=NULL`; row counts unchanged; column positions correct; `_require()` assertions fire on injected bad state | none (this is a rehearsal-only test, run against real MariaDB, not part of the SQLite `pytest` suite — see § 9) |
| DB-3 | `assert_can_authenticate` passes for active client / active admin; raises 403 for pending/disabled client, inactive admin, missing client_profile, missing admin_profile; dispatches correctly by `portal` | none — this unit has no sibling-layer seam to mock; it is itself the seam the Backend layer will mock |

### 8.3 Test goals

#### DB-1
- **Positive:** `ClientProfile.status` defaults to `ClientStatus.PENDING` when unset on insert; `AdminProfile.is_active` defaults to `True`; `User.authorized_by` defaults to `None`/NULL and accepts a valid `firebase_uid` string referencing another `users` row.
- **Negative:** assigning an invalid string to `status` (not one of `pending`/`active`/`disabled`) is rejected by the enum machinery on flush; `is_active` rejects non-boolean values SQLAlchemy would normally coerce/reject.
- **Invariants:** the value persisted for `status`/(admin `role`/`portal`, for consistency check) round-trips as the enum **value** (lowercase string), never the member name, matching the existing `Portal`/`AdminRole` convention — verified by reading the raw column back via a fresh session.
- **Seam mocks:** none.

#### DB-2
- **Positive:** on a MariaDB instance seeded with a live-shaped dump (N client rows, M admin rows, re-queried — not fixed at 5/10), `upgrade()` sets every existing `client_profiles.status` to `'active'`, every `admin_profiles.is_active` to `1`, every `users.authorized_by` to `NULL`; row counts identical before/after; column ordinal positions match the `AFTER <col>` placement for all three columns, each strictly before its table's `created_at`.
- **Negative:** if a `_require()` precondition is violated (e.g. a manually-injected NULL `status` after backfill, or a row-count mismatch), `upgrade()` raises `RuntimeError` and the transaction rolls back — no half-migrated table is left behind.
- **Invariants:** `downgrade()` fully reverses `upgrade()` — dropping `authorized_by` (and its FK constraint) then `is_active` then `status` leaves the schema byte-for-byte equivalent (column set) to pre-migration; running `upgrade()` → `downgrade()` → `upgrade()` again is idempotent and produces the same end state.
- **Seam mocks:** none — this is inherently an integration-style test against real MariaDB DDL, not a pure-Python unit test; it is the rehearsal gate itself (§ 9), run manually/CI-against-MariaDB rather than via the SQLite `pytest -q` path.

#### DB-3
- **Positive:** a `User(portal=CLIENT)` whose `client_profile.status == ClientStatus.ACTIVE` passes (returns `None`, no exception); a `User(portal=ADMIN)` whose `admin_profile.is_active is True` passes.
- **Negative:** `status in (PENDING, DISABLED)` for a client raises `HTTPException` with status `403`; `admin_profile.is_active is False` for an admin raises `HTTPException` with status `403`; a client with `client_profile is None` raises `403`; an admin with `admin_profile is None` raises `403`.
- **Invariants:** the function never raises anything other than `HTTPException(403, ...)` for any combination of portal × profile-presence × status/is_active; it never mutates the passed-in `user`/`db`; behaviour is identical regardless of whether `db` is a real session or `None` (since the function does not use it).
- **Seam mocks:** none — this unit is the seam. The Backend layer's own test suite (sibling doc) is responsible for mocking *this* function's call site; this layer's tests call the real function directly.

### 8.4 Aggregate gate
- All unit tests green (`DB-1`, `DB-3`) is a local gate run before commit/PR hand-off per § 3.2. `DB-2`'s MariaDB rehearsal is a **separate, mandatory, human-gated** check (§ 9) — it is not part of the routine `pytest -q` run and cannot be, since the SQLite test path never executes MariaDB-only DDL.
- Target coverage for changed lines: ≥ 90% of new/changed statements in `app/models/users.py` (the new columns/enum) and 100% of `app/libs/auth/status.py` (small, pure, security-relevant — every branch must be covered).
- Chosen `test-gen` level for this layer: **thorough** — this layer touches live production data and a security-critical gate function; the extra edge/boundary cases (missing profile, invalid enum value, concurrent-safe row-count assertions) are worth the cost here.

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] `DB-1`, `DB-2`, `DB-3` all committed on `rework-authentication-module-db`; each commit left the branch green.
- [ ] § 8 unit tests (`DB-1`, `DB-3`) all pass; CI gate (§ 3.2) green.
- [ ] § 7 matches the proposal's frozen seam verbatim (checked against the proposal on the parent branch, not against the Backend layer's branch, which is not visible here).
- [ ] **Mandatory MariaDB rehearsal gate:** because the SQLite test path (`create_all`) never executes real MariaDB DDL and cannot vouch for `DB-2`, this migration's `upgrade()` **and** `downgrade()` must be run, by hand or in a dedicated CI job, against a MariaDB instance loaded with a dump shaped like current live data — with row counts **re-queried at rehearsal time**, not assumed from any design document's stale 5/10 (or 15-total) figures — before this branch may merge. This is the only migration in the entire 004 rework that touches live production data and can lock out real users; the rehearsal is the substitute for the CI coverage this migration structurally cannot get.
- [ ] PR opened; human owns the merge to `rework-authentication-module`.

**Rollback:** `DB-1` and `DB-3` (ORM columns, pure function) revert cleanly with the branch — no data implication, since `DB-1` alone never touches a live database. `DB-2` is the one **explicit down-step**: reverting requires `alembic downgrade -1` against whatever environment the migration was applied to. The downgrade is schema-clean (drops exactly the three added columns/constraint, non-lossy for pre-existing data) but is **lossy for any `status`/`is_active`/`authorized_by` values written by application code after `upgrade()`** — if the Backend layer's gate (sibling doc) has gone live and clients have been provisioned with real `status` transitions (e.g. compliance-approved to `active`) before a rollback, those transitions are discarded on `downgrade()`. This is acceptable pre-cutover (no application code writes these columns until the Backend layer wires the gate) but must be re-assessed as a real risk once the Backend layer merges and the columns are live-written.
