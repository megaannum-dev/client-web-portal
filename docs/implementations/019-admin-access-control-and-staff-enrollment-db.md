# 019 — Admin Access Control & Staff Enrollment · Implementation Details — Database

> Status: **DRAFT — pending implementation.**
> Implements: proposal `docs/proposals/019-2026-07-29-admin-access-control-and-staff-enrollment.md` § "Layer 1 — Database" (findings B-1 through B-4, § C summary), § 4 "Cross-layer seam (frozen here)", § "Design decisions (settled)" (D-3, D-4, D-8, D-9), § "Execution & verification" step 1 + human gate (b), § "Rollback" (DB-layer paragraph)
> Layer: Database — **one layer per file.**
> Sibling layer docs: `docs/implementations/019-admin-access-control-and-staff-enrollment-be.md` (Backend), `docs/implementations/019-admin-access-control-and-staff-enrollment-fe.md` (Frontend)
> Execution schedule: `docs/execution-schedules/019-admin-access-control-and-staff-enrollment-db.md`
> Branch: `claude/admin-pages-backend-proposal-f0c9fc-db` — cut from parent `claude/admin-pages-backend-proposal-f0c9fc`; merges back into that parent, and **the human owns that merge**.
> Builds on / prerequisites: Alembic revision **`b34f8c1a9d27`** (`0027_ticket_status_consolidation`) — the current, sole head (determined by walking every `down_revision` under `api-backend/alembic/versions/`: `b34f8c1a9d27` is the only revision with no child). No upstream layer — this is Layer 1 of 3.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/019-2026-07-29-admin-access-control-and-staff-enrollment.md` § "Layer 1 — Database" |
| Execution schedule | `docs/execution-schedules/019-admin-access-control-and-staff-enrollment-db.md` |
| Sibling layer impl docs | `docs/implementations/019-admin-access-control-and-staff-enrollment-be.md`, `docs/implementations/019-admin-access-control-and-staff-enrollment-fe.md` |
| Builds on | Alembic head `b34f8c1a9d27` (`0027_ticket_status_consolidation`). No upstream layer. |

Traceability of every unit in §6 back to an approved proposal decision:

| Unit | Proposal decision realized |
|---|---|
| DB-1 | Layer 1 B-1 (MANDATORY) — `page_access` table; D-3 (`NONE` = row absence); D-8 (`page_id` is a plain string, no pages table) |
| DB-2 | Layer 1 B-2 (MANDATORY) — `page_access_overrides` table, 3-value enum; D-3 (the deliberate asymmetry) |
| DB-3 | Layer 1 B-3 (Yes) — `page_access_publications` + `admin_audit_events`; Backend C-5 (publication row is the concurrency token) |
| DB-4 | Layer 1 B-4 (Yes — user req.) — `users.last_sign_in_at`, `admin_profiles.department`/`.start_date`/`.address`; D-4 (`INITIATED` derived); B-4's note that **no** `password_expires_at` column is added |
| DB-5 | Layer 1 A (the new model file must register with `Base.metadata`) |
| DB-6 | Layer 1 § C — all four tables + all four columns in **one** Alembic revision |
| DB-7 | Layer 1 B-1 "Migration plan — the seed comes from the System Config catalog" — the literal 55-row seed (30 `edit` + 25 `view`) and its three construction rules; D-11 (catalog, not `ROLE_PAGES`, is the source); D-10 (PC × Post-Trade Allocation at `view`); D-12 (PM keeps zero grants); D-13 (PC keeps `edit` on Monthly Reports); § "Objectives" |

---

## 2. Branch & session contract

- **Branch:** `claude/admin-pages-backend-proposal-f0c9fc-db` — all seven units land on this one branch.
  - **Naming convention:** parent branch (`claude/admin-pages-backend-proposal-f0c9fc`, captured at session start via `git rev-parse --abbrev-ref HEAD`) plus the `-db` layer suffix. Per-layer branches merge back into the parent; **the human owns that merge** (this session stops at "PR opened").
- **Isolation:** implementable in a separate session on its own layer branch, in parallel with the `-be` and `-fe` branches. State is shared with sibling layers **only** through the frozen seam in §7. No unit here imports, tests against, or waits on sibling-layer code.
- **Preconditions (must be true before starting):**
  - [ ] `alembic heads` (run from `api-backend/`, via `.\.venv\Scripts\alembic.exe`) reports `b34f8c1a9d27` as the single head. If a sibling branch has since added a head, re-chain `down_revision` against that instead of guessing.
  - [ ] The proposal's §4.1/§4.2 seam is frozen — §7 below is a verbatim copy of it, not a negotiation with a sibling layer.
  - [ ] A scratch MariaDB database is reachable via `DATABASE_URL` for the up/down/up rehearsal. The **live** `portal` database is *not* touched from this session — that is the proposal's human gate (b).
- **Read-first inventory** (every existing file a unit touches):
  - `api-backend/app/models/users.py` — `User` (DB-4 target: one nullable column), `AdminProfile` (DB-4 target: one nullable column), `AdminRole` (reused verbatim by `page_access.role`), `AccountStatus` (unchanged — read to confirm D-4: no third value is added), and the canonical `SAEnum(..., native_enum=False, length=N, values_callable=...)` convention documented inline at `:38-47` and repeated at `:186-197`. Also `User.authorized_by` (`:73-81`) — the house precedent for a nullable `String(128)` FK to `users.firebase_uid` with `ondelete="SET NULL"`, which DB-2/DB-3 copy.
  - `api-backend/app/main.py:7-9` — the three `import app.models.X as _models_X  # noqa: F401` lines DB-5 appends to.
  - `api-backend/alembic/versions/b34f8c1a9d27_0027_ticket_status_consolidation.py` — the current head; confirms the required `down_revision` and the docstring/typing style.
  - `api-backend/alembic/versions/a9317a31b484_0026_client_portal_integration.py` — the closest prior art for a `create_table` + `create_index` revision (`sa.Uuid()` PKs, `sa.String(length=N)` for enum-backed columns, `ix_*` index naming).
  - `api-backend/alembic.ini` — confirms `script_location = alembic`, `prepend_sys_path = .`, and that revision filenames are `<rev>_<slug>.py`.
  - `admin-frontend/lib/pages-config.ts` — **read-only from this layer.** `PAGES` (`:62-179`, 16 `PageId` keys) is the authoritative `page_id` value set. `ROLE_PAGES` (`:196-225`) is **not** the seed source (D-11); it is read only for DB-7's rule 2, which preserves today's grant for the two pages the catalog never modelled.
  - `admin-frontend/lib/admin/catalog.ts:23-51` — **read-only from this layer, and the actual seed source** (D-11): `PAGE_CATALOG`'s `levels: Level[]` matrix, positionally indexed by `ROLES` = RM, MOBO, PM, PC, COMPLIANCE, ADMIN. Its *paths* are unusable (14 of 17 fictional) and are replaced by DB-7's rename map; its *levels* are what DB-7 transcribes. Note that the authoritative transcription is B-1's 16×6 table in the proposal — read the catalog to check that table, not to recompute it. This layer changes nothing in `admin-frontend/`.
- **Hand-off / exit signal:** DB-1…DB-7 committed on the layer branch; `alembic upgrade head` → `alembic downgrade -1` → `alembic upgrade head` all clean on a scratch DB; `SELECT role, COUNT(*) FROM page_access GROUP BY role` returns RM 7 / MOBO 10 / PC 10 / COMPLIANCE 12 / ADMIN 16 and no PM row (55 total), with `edit` 30 / `view` 25 by level; §8 tests green; §3.2 gate green; PR opened against the parent branch.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions

- **ORM style:** SQLAlchemy 2.0 `Mapped` / `mapped_column`, as used throughout `api-backend/app/models/*.py`.
- **Enum columns are never native.** Every string-backed enum column in this codebase follows one fixed shape:
  ```python
  SAEnum(
      <PyEnum>,
      native_enum=False,
      length=<N>,
      values_callable=lambda enum_cls: [member.value for member in enum_cls],
  )
  ```
  This persists and reads by enum **value**, not member name — the convention documented inline on `User.portal` (`app/models/users.py:38-47`) and repeated on `AdminProfile.role`, `User.status`, and every enum column in `onboarding.py`/`pc.py`. `AccessLevel` and `OverrideLevel` (DB-1/DB-2) follow it exactly. Deviating here is the specific mistake this codebase's own comments warn against.
- **Migration-side enum columns are plain `sa.String(length=N)`**, never `sa.Enum(...)` — the ORM owns the enum type, the migration owns the underlying `VARCHAR`. Same split as `client_tickets.kind/status`, `client_onboardings.kind/status`, `onboarding_documents.status`.
- **UUID primary keys** use `Uuid(native_uuid=False)` with `default=uuid.uuid4` on the ORM side and `sa.Uuid()` in the migration — the shape used by `users.id` and `client_tickets.id`. The proposal writes these columns as `CHAR(36)`; `sa.Uuid()` with a non-native backend renders `CHAR(32)` (hex, no dashes). **The house type wins** — a second UUID storage shape in one schema is worse than a 4-character discrepancy in a proposal sketch, and `OverrideOut.id` is a string on the wire either way.
- **New module, not an append.** Unlike proposal 018 (where new tables joined an existing domain file), the proposal explicitly names a **new** `app/models/access.py` for all four tables (Layer 1 § A). Access control is its own domain and has no FK-free reason to sit inside `users.py`; the four tables are added there in `# --------- DB-N — <table> ---------` sections mirroring the existing header style.
- **Nullable actor FKs use `ondelete="SET NULL"`**, following `User.authorized_by` (`users.py:73-81`) — not SQLAlchemy's default RESTRICT. The one exception is `page_access_overrides.user_id`, which is `CASCADE` (B-2: an override without a subject is meaningless).
- **Naming:** indexes `ix_<table>_<col>`, unique constraints `uq_<table>_<cols…>`, foreign keys `fk_<table>_<col>` — as in `ix_client_profiles_updated_at`, `uq_client_tickets_linked_allotment_id`, `fk_client_tickets_linked_allotment_id`. The proposal does not pin index/constraint names; the names in §6 are chosen to that pattern and are stated per unit so a reviewer can check them mechanically.
- **Migrations** live at `api-backend/alembic/versions/<revision>_<NNNN>_<slug>.py`, one file per revision, with the `Union[str, Sequence[str], None]` typed `revision`/`down_revision`/`branch_labels`/`depends_on` block.
- **Revision ids are random hex, never hand-invented.** Generated for this layer with:
  ```bash
  python -c "import secrets; print(secrets.token_hex(6))"
  ```
  → `5cd1cc1948cc` (used in DB-6).
- **`page_id` is an opaque `VARCHAR(64)`** carrying a `PageId` literal, with **no** FK and no pages table (proposal D-8). Paths, labels, icons and grouping stay in `pages-config.ts`; drift between the three registries is caught by tests in the sibling layers, not by a constraint here.

### 3.2 CI/CD & engineering discipline

- **Trunk-friendly, small units.** DB-1…DB-5 are ORM/registration-only commits that leave the branch green on their own. DB-6 and DB-7 share one Alembic file (the proposal mandates one revision) and are two commits against it: schema first, seed second.
- **Every unit is independently revertible**, with one documented exception: DB-7 (the seed) is inside DB-6's `upgrade()`, so reverting DB-6 necessarily reverts DB-7. Reverting DB-7 alone is a valid, separate edit (delete the `INSERT` block) and leaves an empty-but-present `page_access` table — which, per Backend C-2, **fails closed** (every admin gets 403) rather than falling back. That is deliberate, not a regression, but it means an un-seeded deploy is not a shippable state: DB-6 and DB-7 deploy together.
- **Additive & backward-compatible first.** Every unit is purely additive *as schema*: four `CREATE TABLE`s, four nullable `ADD COLUMN`s, one `INSERT` into a table created in the same revision. No existing column, constraint or row is altered or dropped, so the branch is migratable at every commit and no existing reader of `users`/`admin_profiles` observes a change. **The seed's *semantics* are not additive-only**, though: once the Backend layer is live, DB-7's 55 rows are the access policy, and two of them narrow `shared.monthly-reports` from `edit` to `view` for RM and MOBO — PC keeps `edit` per D-13 (DB-7). That is why the live apply is a human gate (below) rather than a routine migration.
- **Gates before merge** (in this order): `lint → format → type-check → unit tests (§8) → build`. Exact commands for this layer — verified present in `api-backend/pyproject.toml` (`[tool.ruff]`, `[tool.pytest.ini_options]`, `[tool.mypy]` all configured), run from `api-backend/`:
  ```bash
  ruff check . && ruff format --check . && mypy app && pytest -q
  ```
  Note the existing house carve-out: `ruff` and `mypy` both exclude `alembic/`, so the migration file itself is covered by `pytest -q` (§8) only. That is the pre-existing convention, not a gap introduced here.
- **No secrets, no manual steps in the merge path.** Applying this revision to the live `portal` database is the proposal's **human gate** (§"Human gate(s)" (b)) — the seed writes rows that immediately govern real logins, and it is a deliberate policy change rather than a copy of today's grants (DB-7), so the gate includes reviewing the seed table and confirming the Monthly Reports narrowing. It is called out in the execution schedule and never run against `portal` from an agent session.
- **Reversibility documented** (§9): additive up; the down-step is **lossy in a security-relevant way** — carried verbatim from the proposal's Rollback section.

---

## 4. Architecture (level 1 of 3)

**Target layout:**
```
api-backend/app/models/
  users.py                                        # MODIFY: User += last_sign_in_at (DB-4)
                                                  #         AdminProfile += department, start_date, address (DB-4)
  access.py                                       # NEW: AccessLevel, OverrideLevel,
                                                  #      PageAccess          (DB-1)
                                                  #      PageAccessOverride  (DB-2)
                                                  #      PageAccessPublication, AdminAuditEvent (DB-3)
api-backend/app/main.py                           # MODIFY: += import app.models.access (DB-5)
api-backend/alembic/versions/
  b34f8c1a9d27_0027_ticket_status_consolidation.py  # existing head, unchanged
  5cd1cc1948cc_0028_admin_access_control.py          # NEW — this layer's single revision (DB-6 schema, DB-7 seed)
```

**Revision naming (settled).** The revision is `0028_admin_access_control`, chained onto the head `b34f8c1a9d27`. Per the proposal (§ "Layer 1 — Database" § A and § C), `0026` and `0027` are already taken by `client_portal_integration` (`a9317a31b484`) and `ticket_status_consolidation` (`b34f8c1a9d27`), so `0028` is the next free ordinal and `b34f8c1a9d27` is the parent.

**Dependency direction:**
- `app/models/access.py` → `app/core/database.Base` and (by FK target only, not by import) `users.id` / `users.firebase_uid`. It does **not** import `app/models/users.py`: every FK is declared as a string target (`ForeignKey("users.id")`), matching how `ClientProfile.assigned_rm_uid` and `User.authorized_by` are written. No reciprocal `relationship()` is added to `User` — the Backend layer reaches these tables by filtered query (`role`, `user_id`, `page_id`), never by traversal from a `User` instance, so a relationship would be unused surface.
- The new Alembic revision depends only on `b34f8c1a9d27` (`down_revision`).
- `app/main.py` → `app/models/access.py` (import-for-side-effect only, so `Base.metadata` knows the tables).

**External seams:** creates `page_access`, `page_access_overrides`, `page_access_publications`, `admin_audit_events`; widens `users` by one nullable column and `admin_profiles` by three nullable columns; inserts 55 `page_access` rows (30 `edit`, 25 `view`). Everything in §7's Database row is produced here; nothing is read from the Backend or Frontend layers. The `page_id` value space is owned by `admin-frontend/lib/pages-config.ts` (`PAGES` keys) and is consumed here as literal strings only — this layer edits no frontend file.

---

## 5. Modules (level 2 of 3)

### 5.1 `access models` (`app/models/access.py` — new)
- **Responsibility:** ORM definitions for the four access-control tables and the two level enums; the single place the DB layer states what a grant, an override, a publication and an audit row are.
- **Files:** `api-backend/app/models/access.py`.
- **Public surface:** `AccessLevel`, `OverrideLevel`, `PageAccess`, `PageAccessOverride`, `PageAccessPublication`, `AdminAuditEvent` — imported by the Backend layer's `app/libs/access/` package (`repository.py`, `resolver.py`, `service.py`). No other module may import them; in particular `app/libs/staff/` reaches overrides through `access`, never through these models directly (Backend § A dependency rule).
- **Owns features:** DB-1, DB-2, DB-3.

### 5.2 `users models` (`app/models/users.py`)
- **Responsibility:** ORM definitions of `users` / `client_profiles` / `admin_profiles` — widened by four nullable columns that let the directory express "has this account ever signed in" and store the three staff-profile facts the enrolment wizard already collects (department, start date, correspondence address).
- **Files:** `api-backend/app/models/users.py`.
- **Public surface:** `User.last_sign_in_at` — written by the Backend layer's `login_and_bind` (C-7), read by `GET /api/admin/staff` to derive `StaffStatus.INITIATED`; `AdminProfile.department` — read/written by the staff routes (it is on `StaffOut`); `AdminProfile.start_date`/`.address` — written from `StaffEnrollIn`/`StaffUpdateIn`, storage-only for now (neither is on `StaffOut` per §4.1, so no read surface exists yet — do not add one here). `AccountStatus` is unchanged and **must not** gain an `INITIATED` member (D-4).
- **Owns features:** DB-4.

### 5.3 `app bootstrap` (`app/main.py`)
- **Responsibility:** registering every model module with `Base.metadata` at import time, so `create_all` / metadata-driven tooling sees all tables.
- **Files:** `api-backend/app/main.py`.
- **Public surface:** none (import-for-side-effect).
- **Owns features:** DB-5.

### 5.4 `alembic migration` (`api-backend/alembic/versions/`)
- **Responsibility:** the single revision that brings a database from `b34f8c1a9d27` to the post-019 schema — four new tables, four new nullable columns, and the 55-row `page_access` seed that installs the System Config catalog's access policy (D-11) — deliberately not a copy of today's grants.
- **Files:** `api-backend/alembic/versions/5cd1cc1948cc_0028_admin_access_control.py`.
- **Public surface:** `upgrade()` / `downgrade()`; `revision = "5cd1cc1948cc"`, `down_revision = "b34f8c1a9d27"`.
- **Owns features:** DB-6, DB-7.

---

## 6. Features (level 3 of 3 — the work units)

### DB-1 — `page_access` table + the 2-value `AccessLevel` enum (MANDATORY)

- **Proposal ref:** § "Layer 1 — Database" B-1; D-3; D-8
- **Module:** §5.1 `access models`
- **Files:** `create: api-backend/app/models/access.py`
- **Dependencies:** none — parallel-safe (first unit in the new file).

**Contract (required code):**

```python
# api-backend/app/models/access.py
import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Uuid,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.users import AdminRole


class AccessLevel(str, enum.Enum):
    """Standing role→page level. TWO values only.

    `NONE` is deliberately absent: on the matrix, "no grant" and "no row" are the
    same statement, so a revoked cell is a DELETE, never a stored value (proposal
    D-3). The asymmetry with `OverrideLevel` — which DOES carry `NONE` — is
    intentional: on a per-account override, `NONE` is an active statement
    ("revoke this page for this one person even though their role has it"), and
    row-absence cannot express it because absence already means "fall back to the
    role default".
    """

    VIEW = "view"
    EDIT = "edit"


class OverrideLevel(str, enum.Enum):
    """Per-account override level. THREE values — see AccessLevel's docstring for
    why this table carries `NONE` and `page_access` does not (proposal D-3)."""

    NONE = "none"
    VIEW = "view"
    EDIT = "edit"


# --------- DB-1 — page_access ---------
class PageAccess(Base):
    """Standing access level for one (page, role) pair. The sole authority for
    role→page access after proposal 019; replaces both `ROLE_ACTIONS`
    (api-backend) and `ROLE_PAGES` (admin-frontend)."""

    __tablename__ = "page_access"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # A PageId literal (e.g. "pc.allocation-matrix"). Deliberately NOT an FK to a
    # pages table: the page registry (paths, labels, icons, grouping) is
    # presentation code owned by admin-frontend/lib/pages-config.ts and does not
    # belong in the DB (proposal D-8). A row whose page_id is no longer a known
    # PageId is ignored by the backend resolver and reported by the registry test.
    page_id: Mapped[str] = mapped_column(String(64), nullable=False)
    role: Mapped[AdminRole] = mapped_column(
        SAEnum(
            AdminRole,
            native_enum=False,
            length=32,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    level: Mapped[AccessLevel] = mapped_column(
        SAEnum(
            AccessLevel,
            native_enum=False,
            length=16,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("page_id", "role", name="uq_page_access_page_id_role"),
        Index("ix_page_access_role", "role"),
    )
```

**Behavior / invariants:**
- Exactly one row per `(page_id, role)`; the unique constraint is what makes `PUT /matrix`'s upsert well-defined.
- `level` can only ever hold `'view'` or `'edit'`. A `NONE` cell is the absence of the row — nothing writes `'none'` here, and no tombstone column exists.
- `role` reuses the existing `AdminRole` values verbatim (`RM`/`MOBO`/`PM`/`PC`/`COMPLIANCE`/`ADMIN`) — no parallel role vocabulary is introduced.
- `ix_page_access_role` supports the resolver's hot read (all rows for one role, once per guarded request).
- No `relationship()` back to anything; the Backend queries by `role` and `page_id`.

**Done when:** `app/models/access.py` imports cleanly, `PageAccess.__table__` shows `page_id VARCHAR(64) NOT NULL`, `role VARCHAR(32) NOT NULL`, `level VARCHAR(16) NOT NULL`, `updated_at`, the named unique constraint and the named index; `AccessLevel` has exactly two members with lowercase values.

---

### DB-2 — `page_access_overrides` table + the 3-value `OverrideLevel` enum (MANDATORY)

- **Proposal ref:** § "Layer 1 — Database" B-2 (incl. "Note on a `NONE` override"); D-3
- **Module:** §5.1 `access models`
- **Files:** `modify: api-backend/app/models/access.py`
- **Dependencies:** DB-1 (same file; `OverrideLevel` is declared in DB-1's enum block).

**Contract (required code):**

```python
# --------- DB-2 — page_access_overrides ---------
class PageAccessOverride(Base):
    """A per-account exception to the role's standing level. At most one per
    (user, page). `level = NONE` revokes a page for one person even though their
    role holds it — which is why this table's enum has three values and
    `page_access`'s has two (proposal D-3)."""

    __tablename__ = "page_access_overrides"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    # CASCADE, not SET NULL: an override without a subject is meaningless.
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    page_id: Mapped[str] = mapped_column(String(64), nullable=False)  # PageId literal, no FK (D-8)
    level: Mapped[OverrideLevel] = mapped_column(
        SAEnum(
            OverrideLevel,
            native_enum=False,
            length=16,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    # App-enforced non-empty (422 at the API boundary) — no CHECK constraint, so
    # the error surfaces as a validation message rather than a DB integrity error.
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    # SET NULL, matching the User.authorized_by convention (users.py:73-81): the
    # override outlives the granter's account.
    granted_by: Mapped[str | None] = mapped_column(
        String(128),
        ForeignKey("users.firebase_uid", ondelete="SET NULL"),
        nullable=True,
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )  # NULL = no expiry
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id", "page_id", name="uq_page_access_overrides_user_id_page_id"
        ),
        Index("ix_page_access_overrides_expires_at", "expires_at"),
    )
```

**Behavior / invariants:**
- At most one override per `(user_id, page_id)` — the 409 the Backend returns on a duplicate grant is this constraint's contract.
- Deleting a `users` row removes its overrides (`CASCADE`); deleting the granter leaves the override with `granted_by = NULL` (`SET NULL`).
- `level` may be `'none'`, `'view'` or `'edit'`. `'none'` is a stored, meaningful value **on this table only**.
- `expires_at IS NULL` means "no expiry"; an expired override is still stored (history) and is filtered out by the Backend resolver, not deleted by the DB. `ix_page_access_overrides_expires_at` serves that filter and the ledger's `expiring_soon` computation.
- `reason` is `NOT NULL` at the DB level; emptiness is an application-layer rule, so a blank reason is a 422 rather than a 500.

**Done when:** the table exists with a `CHAR`-rendered UUID PK, `CASCADE` on `user_id`, `SET NULL` on `granted_by`, the named unique constraint and the named `expires_at` index; `OverrideLevel` has exactly three members with lowercase values.

---

### DB-3 — `page_access_publications` + `admin_audit_events` tables (Yes)

- **Proposal ref:** § "Layer 1 — Database" B-3; Backend C-5 (publication row doubles as the concurrency token); § "Objectives" ("Every state-changing admin act is on the record")
- **Module:** §5.1 `access models`
- **Files:** `modify: api-backend/app/models/access.py`
- **Dependencies:** DB-1 (same file, shared imports).

**Contract (required code):**

```python
# --------- DB-3 — page_access_publications ---------
class PageAccessPublication(Base):
    """One row per matrix publish. Doubles as the optimistic-concurrency token:
    MatrixPublishIn.base_published_at must equal MAX(published_at) or the write
    is rejected 409 (proposal Backend C-5)."""

    __tablename__ = "page_access_publications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    actor_uid: Mapped[str | None] = mapped_column(
        String(128),
        ForeignKey("users.firebase_uid", ondelete="SET NULL"),
        nullable=True,
    )
    # Denormalised on purpose: the publication must still read correctly after the
    # actor's account is gone. Same rule as admin_audit_events.actor_name.
    actor_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    change_count: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)  # PublishModal's "Change note"

    __table_args__ = (Index("ix_page_access_publications_published_at", "published_at"),)


# --------- DB-3 — admin_audit_events ---------
class AdminAuditEvent(Base):
    """Append-only admin audit trail. Same shape as `model_symbol_audit`
    (proposal 008) — the existing pattern for an append-only trail in this
    codebase; no new convention. Display-only: `event` and `detail` are composed
    by the Backend and rendered verbatim."""

    __tablename__ = "admin_audit_events"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    actor_uid: Mapped[str | None] = mapped_column(
        String(128),
        ForeignKey("users.firebase_uid", ondelete="SET NULL"),
        nullable=True,
    )
    actor_name: Mapped[str | None] = mapped_column(String(255), nullable=True)  # denormalised, as above
    # 'account.created', 'access.published', 'override.granted', …
    event: Mapped[str] = mapped_column(String(64), nullable=False)
    detail: Mapped[str] = mapped_column(Text, nullable=False)  # already-composed display string

    __table_args__ = (Index("ix_admin_audit_events_at", "at"),)
```

**Behavior / invariants:**
- Both tables are **append-only** by convention — no `updated_at`, and nothing in this proposal issues an `UPDATE` or `DELETE` against either. That is a discipline, not a constraint; it is stated in the docstrings so a later reader does not "helpfully" add mutation.
- `actor_name` survives the actor's deletion; `actor_uid` goes `NULL`. An audit row with `actor_uid IS NULL AND actor_name IS NOT NULL` is the normal post-deletion state, not corruption.
- `MAX(published_at)` is the concurrency token. `ix_page_access_publications_published_at` exists so that read is an index lookup, not a table scan — it is on the path of every matrix read *and* every publish.
- `change_count` is `NOT NULL` and records the size of the publish; it is display/audit data, not a driver of any logic.
- `event`/`detail` are free text (`VARCHAR(64)` / `TEXT`); no enum, because the Backend composes new event names as features land and the DB should not need a migration for each.

**Done when:** both tables exist with the named indexes and `SET NULL` actor FKs; `page_access_publications.change_count` is `NOT NULL`; both `actor_name` columns are nullable `VARCHAR(255)`.

---

### DB-4 — `users.last_sign_in_at` + `admin_profiles.department`/`.start_date`/`.address` (Yes — user req.)

- **Proposal ref:** § "Layer 1 — Database" B-4 (including its note that **no** `password_expires_at` column is added); D-4; Backend C-7; §4.1's map rows for `last_sign_in_at` / `StaffOut.department` / `StaffEnrollIn.start_date`+`.address` / `StaffOut.status "INITIATED"`
- **Module:** §5.2 `users models`
- **Files:** `modify: api-backend/app/models/users.py`
- **Dependencies:** none — parallel-safe (independent of DB-1…DB-3).

**Contract (required code):**

```python
# app/models/users.py — class User, appended after `authorized_by`, before created_at
    # Written by login_and_bind on every successful login (Backend C-7). NULL =
    # never signed in, which is exactly how the directory derives StaffStatus
    # INITIATED: status == 'active' AND last_sign_in_at IS NULL (proposal D-4).
    #
    # INITIATED is DERIVED, not stored: no third AccountStatus value is added.
    # "May they sign in" (status) and "have they ever" (this column) are
    # independent facts; a third enum member would conflate them and force every
    # existing assert_can_authenticate / status comparison to learn about it.
    #
    # There is deliberately NO password_expires_at column: with the set-password
    # link (Backend C-3) no password is ever issued, so nothing can expire. Link
    # lifetime belongs to Firebase's action-link settings.
    last_sign_in_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


# app/models/users.py — class AdminProfile, appended after `phone_number`
    # The staff directory's "Dept" column (§4.1 StaffOut.department). Free text,
    # nullable, no business logic reads it.
    department: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # The wizard's "Start date" field, carried by StaffEnrollIn (§4.1). DATE, not
    # DATETIME: it is a calendar day, and the wizard's help text says "Defaults
    # to today". Same plain-Date treatment as ClientProfile.anniversary.
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # The wizard's "Correspondence address" field, carried by StaffEnrollIn
    # (§4.1). TEXT, matching the existing client_profiles.address precedent.
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
```

`date`, `Date` and `Text` are already imported at the top of `app/models/users.py` (`:3`, `:5`) for `ClientProfile.date_of_birth`/`.anniversary`/`.address` — this unit adds no import.

**Behavior / invariants:**
- All four columns are nullable with **no** server default and **no** backfill. Existing admin rows read `last_sign_in_at = NULL` and therefore render as `Initiated` in the directory until their next login — more accurate than inventing a sign-in time nobody recorded, and self-correcting on first login. `department`/`start_date`/`address` read `NULL` on every pre-019 row and are only ever populated by an enrollment or an edit.
- `start_date` is a `DATE` and carries no time component; `address` is free text with no length cap. Neither has business logic attached — they exist because `StaffEnrollIn` already carries both and a backend that accepted them and discarded them would be a contract that lies to its caller (B-4).
- `AccountStatus` is **unchanged**: still exactly `active` / `disabled`. Adding an `initiated` member is a spec violation, not an optimisation (D-4).
- No `password_expires_at`, no password-policy column of any kind, is added by this unit or any other in this layer.
- `last_sign_in_at` is `DateTime(timezone=True)`, matching every other timestamp on these tables; the wire renders ISO-8601 UTC.
- Column placement follows the file's existing ordering (new nullable columns appended at the end of their logical block, before the `created_at`/`updated_at` pair on `User`; after `phone_number` on `AdminProfile`, in the order `department`, `start_date`, `address`).

**Done when:** `User.last_sign_in_at` plus `AdminProfile.department`/`.start_date`/`.address` exist as nullable columns with types `DATETIME`/`VARCHAR(255)`/`DATE`/`TEXT`; `AccountStatus` still has exactly two members; `grep -r "password_expires_at" api-backend/` returns nothing.

---

### DB-5 — Register `app.models.access` with `Base.metadata` (MANDATORY)

- **Proposal ref:** § "Layer 1 — Database" § A (the new `app/models/access.py` must be a live model module)
- **Module:** §5.3 `app bootstrap`
- **Files:** `modify: api-backend/app/main.py`
- **Dependencies:** DB-1 (the module must exist to be imported).

**Contract (required code):**

```python
# api-backend/app/main.py — alongside the existing import-for-side-effect lines
# (currently app/main.py:7-9), kept alphabetical:
import app.models.access as _models_access  # noqa: F401 — registers access tables with Base.metadata
import app.models.onboarding as _models_onboarding  # noqa: F401 — registers onboarding tables with Base.metadata
import app.models.pc as _models_pc  # noqa: F401 — registers PC tables with Base.metadata
import app.models.users as _models_users  # noqa: F401 — registers User with Base.metadata
```

**Behavior / invariants:**
- Import-for-side-effect only — nothing in `main.py` references `_models_access`; the `# noqa: F401` comment is required and follows the existing wording pattern exactly.
- Alphabetical placement puts `access` first in the block, matching the existing ordering of the three lines.
- After this unit, `Base.metadata.tables` contains all four new table names — which is what any metadata-driven tooling and the §8 tests assert against.

**Done when:** `python -c "import app.main; from app.core.database import Base; print(sorted(t for t in Base.metadata.tables if 'page_access' in t or t == 'admin_audit_events'))"` lists all four tables; `ruff check .` still passes (the `noqa` suppresses F401).

---

### DB-6 — Single Alembic revision `0028_admin_access_control` — schema (MANDATORY)

- **Proposal ref:** § "Layer 1 — Database" § A + § C ("All four land in **one** Alembic revision"); § "Execution & verification" step 1
- **Module:** §5.4 `alembic migration`
- **Files:** `create: api-backend/alembic/versions/5cd1cc1948cc_0028_admin_access_control.py`
- **Dependencies:** DB-1, DB-2, DB-3, DB-4 (the migration is the schema those ORM definitions describe; authoring it first risks divergence).

**Contract (required code):**

```python
"""0028_admin_access_control

Revision ID: 5cd1cc1948cc
Revises: b34f8c1a9d27
Create Date: 2026-07-29 00:00:00.000000

Proposal 019, Layer 1. Four new tables plus four new nullable columns, in one
revision (proposal § C):

  - page_access                 role→page standing level. UNIQUE (page_id, role).
                                2-value level enum ('view','edit') — NONE is the
                                absence of a row (D-3).
  - page_access_overrides       per-account exception. UNIQUE (user_id, page_id).
                                3-value level enum ('none','view','edit') — the
                                asymmetry with page_access is deliberate (D-3).
  - page_access_publications    one row per matrix publish; MAX(published_at) is
                                the optimistic-concurrency token (Backend C-5).
  - admin_audit_events          append-only admin trail; actor_name denormalised
                                so a row survives the actor's deletion.
  - users.last_sign_in_at       NULL = never signed in ⇒ StaffStatus INITIATED
                                is DERIVED, not a third AccountStatus value (D-4).
  - admin_profiles.department   the directory's Dept column.
  - admin_profiles.start_date   DATE (a calendar day, not a timestamp) — the
                                wizard's "Start date" field.
  - admin_profiles.address      TEXT — the wizard's "Correspondence address"
                                field. Both exist because StaffEnrollIn already
                                carries them; without columns the backend would
                                accept and silently discard them (B-4).

page_id is a plain VARCHAR(64) holding a PageId literal, deliberately NOT an FK:
the page registry (paths, labels, icons) is presentation code owned by
admin-frontend/lib/pages-config.ts (D-8).

The page_access seed (55 rows — 30 'edit', 25 'view' — transcribed from the
System Config catalog's level matrix per D-11, NOT from ROLE_PAGES) is added by
DB-7 in upgrade(). It deliberately changes day-one access; see DB-7.

downgrade() drops all four tables and all four columns, restoring the pre-019 schema
exactly. It is LOSSY — see the impl doc §9 and the proposal's Rollback section:
every published grant and override, the whole audit trail and every recorded
sign-in time are destroyed, and any deliberate VIEW/NONE restriction silently
becomes full access again.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "5cd1cc1948cc"
down_revision: Union[str, Sequence[str], None] = "b34f8c1a9d27"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- page_access ---------------------------------------------------------
    op.create_table(
        "page_access",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("page_id", sa.String(length=64), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("level", sa.String(length=16), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_unique_constraint(
        "uq_page_access_page_id_role", "page_access", ["page_id", "role"]
    )
    op.create_index("ix_page_access_role", "page_access", ["role"])

    # --- page_access_overrides ----------------------------------------------
    op.create_table(
        "page_access_overrides",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("page_id", sa.String(length=64), nullable=False),
        sa.Column("level", sa.String(length=16), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("granted_by", sa.String(length=128), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_foreign_key(
        "fk_page_access_overrides_user_id",
        "page_access_overrides",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_page_access_overrides_granted_by",
        "page_access_overrides",
        "users",
        ["granted_by"],
        ["firebase_uid"],
        ondelete="SET NULL",
    )
    op.create_unique_constraint(
        "uq_page_access_overrides_user_id_page_id",
        "page_access_overrides",
        ["user_id", "page_id"],
    )
    op.create_index(
        "ix_page_access_overrides_expires_at", "page_access_overrides", ["expires_at"]
    )

    # --- page_access_publications -------------------------------------------
    op.create_table(
        "page_access_publications",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "published_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("actor_uid", sa.String(length=128), nullable=True),
        sa.Column("actor_name", sa.String(length=255), nullable=True),
        sa.Column("change_count", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
    )
    op.create_foreign_key(
        "fk_page_access_publications_actor_uid",
        "page_access_publications",
        "users",
        ["actor_uid"],
        ["firebase_uid"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_page_access_publications_published_at",
        "page_access_publications",
        ["published_at"],
    )

    # --- admin_audit_events --------------------------------------------------
    op.create_table(
        "admin_audit_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("actor_uid", sa.String(length=128), nullable=True),
        sa.Column("actor_name", sa.String(length=255), nullable=True),
        sa.Column("event", sa.String(length=64), nullable=False),
        sa.Column("detail", sa.Text(), nullable=False),
    )
    op.create_foreign_key(
        "fk_admin_audit_events_actor_uid",
        "admin_audit_events",
        "users",
        ["actor_uid"],
        ["firebase_uid"],
        ondelete="SET NULL",
    )
    op.create_index("ix_admin_audit_events_at", "admin_audit_events", ["at"])

    # --- additive columns (DB-4) --------------------------------------------
    op.add_column(
        "users", sa.Column("last_sign_in_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "admin_profiles", sa.Column("department", sa.String(length=255), nullable=True)
    )
    op.add_column("admin_profiles", sa.Column("start_date", sa.Date(), nullable=True))
    op.add_column("admin_profiles", sa.Column("address", sa.Text(), nullable=True))

    # --- page_access seed (DB-7) — 55 literal rows --------------------------
    # (see DB-7)


def downgrade() -> None:
    op.drop_column("admin_profiles", "address")
    op.drop_column("admin_profiles", "start_date")
    op.drop_column("admin_profiles", "department")
    op.drop_column("users", "last_sign_in_at")

    op.drop_index("ix_admin_audit_events_at", table_name="admin_audit_events")
    op.drop_table("admin_audit_events")          # drops its FK and PK with it

    op.drop_index(
        "ix_page_access_publications_published_at", table_name="page_access_publications"
    )
    op.drop_table("page_access_publications")

    op.drop_index(
        "ix_page_access_overrides_expires_at", table_name="page_access_overrides"
    )
    op.drop_table("page_access_overrides")

    op.drop_index("ix_page_access_role", table_name="page_access")
    op.drop_table("page_access")                 # takes the seed with it
```

**Behavior / invariants:**
- `down_revision` **must** be `"b34f8c1a9d27"` — the current sole head. Re-verify with `alembic heads` before authoring; if a sibling branch added a head in the meantime, re-chain rather than guess.
- Enum-backed columns are `sa.String(length=N)` in the migration, never `sa.Enum(...)` — the ORM owns the enum type. `page_access.level` and `page_access_overrides.level` are therefore the *same* `VARCHAR(16)` at the DB level; the two-vs-three-value asymmetry lives in the ORM enums (DB-1/DB-2) and in the application, not in a DB constraint. This is the existing house split, and it is why the §8 goals include an ORM-level assertion on the member sets.
- UUID PKs carry no `server_default` — they are ORM-assigned (`default=uuid.uuid4`), as with `users.id` and `client_tickets.id`.
- `downgrade()` reverses `upgrade()` exactly; the four tables plus four columns leave no residue. It is destructive of data — see §9.
- The revision performs **no** `ALTER` on an existing column and touches **no** existing row: nothing in this revision can fail on pre-existing data.
- `alembic upgrade head` → `alembic downgrade -1` → `alembic upgrade head` must all succeed on a scratch DB, run twice in sequence without manual cleanup.

**Done when:** the revision applies, reverses and re-applies cleanly on a scratch DB; `alembic heads` reports `5cd1cc1948cc` as the single head; the four tables and four columns match the DB-1…DB-4 ORM definitions (no autogenerate diff).

---

### DB-7 — The 55-row `page_access` seed (MANDATORY)

- **Proposal ref:** § "Layer 1 — Database" B-1 "Migration plan — the seed comes from the System Config catalog, not from `ROLE_PAGES` (D-11)" (its 16×6 table and its three construction rules); D-10 (PC × PTA at `view`); D-11 (the catalog is the seed source); D-12 (PM stays at zero grants); § "Objectives"; § "Execution & verification" step 1 and human gate (b)
- **Module:** §5.4 `alembic migration`
- **Files:** `modify: api-backend/alembic/versions/5cd1cc1948cc_0028_admin_access_control.py`
- **Dependencies:** DB-6 (same file; the `INSERT` is the last statement of its `upgrade()`).

**Source of the data — the System Config catalog, not `ROLE_PAGES` (D-11).** `admin-frontend/lib/admin/catalog.ts:23-51`'s `PAGE_CATALOG` already carries a per-page, per-role **three-level** matrix (`levels: Level[]`, positionally indexed by `ROLES` = RM, MOBO, PM, PC, COMPLIANCE, ADMIN) — the design handoff's actual access intent, which has never been enforceable. `ROLE_PAGES` is uniformly `OPERATE` and cannot express `view` at all, so seeding from it would discard the only real level data in the repo and leave the `VIEW` level with no instances. The catalog's *paths* are unusable (14 of 17 are fictional, Frontend A-1); its *levels* are the point.

**Construction rules** (all three from B-1 — stated here so the transcription is checkable, not so it is recomputed):

1. **The 14 catalog rows that map to a real `PageId`** supply that page's whole column verbatim, through the rename map: `/rm/dashboard`→`rm.client-info`, `/rm/onboarding`→`rm.onboarding-renewal`, `/rm/subscription`→`rm.model-subscription`, `/rm/reports`→`shared.monthly-reports`, `/mobo/dashboard`→`mobo.recon-overview`, `/mobo/reconciliation`→`mobo.trade-reconciliation`, `/mobo/allocation`→`mobo.post-trade-allocation`, `/pc/models`→`pc.model-management`, `/pc/matrix`→`pc.allocation-matrix`, `/pc/allotment`→`pc.allotment-redemption`, `/compliance/overview`→`compliance.overview`, `/compliance/guidelines`→`compliance.review`, plus `admin.enroll-user` and `admin.system-config` unchanged. The 3 catalog rows with no real page — `/mobo/exceptions`, `/pc/guidelines`, `/compliance/redemptions` — are **dropped**.
2. **The 2 real pages the catalog never modelled** — `rm.request-tickets`, `mobo.commission-tracking` — keep today's `ROLE_PAGES` grant: `edit` for the owning role plus `edit` for ADMIN. Without this rule RM silently loses Request Tickets and MOBO loses Commission Tracking, both currently-working pages.
3. **Three overrides on the catalog's values:** every `PM` cell becomes absent (**D-12** — PM stays at zero grants); `PC × mobo.post-trade-allocation` becomes `view` rather than the catalog's `edit` (**D-10**); and `PC × shared.monthly-reports` becomes `edit` rather than the catalog's `view` (**D-13** — the page is "Monthly Reports (Models)" and model reporting is Portfolio Control's own output, so PC produces it while RM and MOBO consume it).

**The 55 rows**, transcribed from B-1's table (— = no row, i.e. `NONE`):

| Page (`page_id`) | RM | MOBO | PM | PC | COMPLIANCE | ADMIN |
|---|---|---|---|---|---|---|
| `rm.client-info` | edit | — | — | — | view | edit |
| `rm.onboarding-renewal` | edit | view | — | — | view | edit |
| `rm.model-subscription` | edit | view | — | view | view | edit |
| `rm.request-tickets` *(rule 2)* | edit | — | — | — | — | edit |
| `shared.monthly-reports` | view | view | — | **edit** *(D-13)* | view | edit |
| `mobo.recon-overview` | — | edit | — | view | view | edit |
| `mobo.trade-reconciliation` | — | edit | — | view | view | edit |
| `mobo.post-trade-allocation` | — | edit | — | **view** *(D-10)* | view | edit |
| `mobo.commission-tracking` *(rule 2)* | — | edit | — | — | — | edit |
| `pc.model-management` | view | view | — | edit | view | edit |
| `pc.allocation-matrix` | — | view | — | edit | view | edit |
| `pc.allotment-redemption` | view | view | — | edit | view | edit |
| `compliance.overview` | — | — | — | view | edit | edit |
| `compliance.review` | — | — | — | view | edit | edit |
| `admin.enroll-user` | — | — | — | — | — | edit |
| `admin.system-config` | — | — | — | — | — | edit |

**Counts, asserted by the migration test (both axes):**

| Axis | Expected |
|---|---|
| Total rows | **55** |
| By level | `edit` **30**, `view` **25** |
| By role | RM **7**, MOBO **10**, PM **0**, PC **10**, COMPLIANCE **12**, ADMIN **16** — sums to 7+10+0+10+12+16 = **55** |
| ADMIN | exactly **one `edit` row per page** — 16 rows, no `view`, so "ADMIN sees everything" is a property of the data, not of a special case in code |
| PM | **zero rows** (D-12) |

**This is not a parity seed — it deliberately changes day-one access.** Every difference, per B-1:

| Change | Detail |
|---|---|
| Many new **reads** | COMPLIANCE gains `view` on 10 pages it cannot reach today; PC gains `view` on the three MOBO pages and 2 RM pages; RM and MOBO gain `view` on PC pages. All read-only — the catalog's intent, now actually enforceable. |
| RM and MOBO **lose write** on Monthly Reports; PC keeps it | The catalog gives RM/MOBO/PC `view` on `shared.monthly-reports`, where all three hold `OPERATE` today. Overridden for PC, which keeps `edit` (**D-13**) because the page is model reporting and PC produces it; RM and MOBO drop to `view`, and ADMIN keeps `edit`. **This is the only narrowing in the seed, and B-1 asks for it to be confirmed as intended before the phase-4 live apply** — it takes write on one page away from two roles. |
| PC gains a working PTA read | Per D-10: currently PC sees the page and 403s on every call, including the read. `view` grants `POST_TRADE_ALLOCATION_VIEW` and *not* `POST_TRADE_ALLOCATION_RUN` — running allocations stays MOBO's. |
| **Nobody loses a page** | Rules 2 and 3 exist to guarantee this. Every role keeps `edit` on every page it owns today, Monthly Reports excepted. |

Because the seed is a policy statement rather than a copy, the review question at the human gate is **"is every difference on B-1's change list?"** — not "did anything change". The down-migration is still a plain `DROP TABLE`.

**Contract (required code):**

```python
    # --- page_access seed — 55 literal rows ---------------------------------
    # Source: admin-frontend/lib/admin/catalog.ts PAGE_CATALOG's `levels` matrix
    # (positionally indexed by ROLES = RM,MOBO,PM,PC,COMPLIANCE,ADMIN), NOT
    # ROLE_PAGES — the catalog is the only place three-level intent exists, and
    # ROLE_PAGES is uniformly OPERATE (D-11). Catalog paths are fictional and are
    # mapped to real PageIds; the 3 catalog rows with no real page are dropped;
    # rm.request-tickets and mobo.commission-tracking are absent from the catalog
    # and keep today's grant (owner + ADMIN at 'edit'); every PM cell is dropped
    # (D-12) and PC x mobo.post-trade-allocation is 'view' not 'edit' (D-10).
    #
    # NOT a parity seed: it adds ~26 read-only cells and narrows
    # shared.monthly-reports from edit to view for RM and MOBO (PC keeps edit,
    # D-13). See the impl doc's
    # DB-7 change table; every difference is deliberate and listed there.
    #
    # Written out as literal VALUES, not computed: after Backend C-2 deletes
    # ROLE_ACTIONS these 55 rows are the SOLE statement of which role gets what,
    # so the policy must be reviewable in the diff. Counts: 55 rows = 30 edit +
    # 25 view; RM 7, MOBO 10, PM 0, PC 10, COMPLIANCE 12, ADMIN 16.
    #
    # Grouped by page, in the same order as the impl doc's / B-1's matrix table,
    # so a reviewer can read the INSERT against the table row by row.
    op.execute(
        """
        INSERT INTO page_access (page_id, role, level) VALUES
          -- rm.client-info
          ('rm.client-info',              'RM',         'edit'),
          ('rm.client-info',              'COMPLIANCE', 'view'),
          ('rm.client-info',              'ADMIN',      'edit'),
          -- rm.onboarding-renewal
          ('rm.onboarding-renewal',       'RM',         'edit'),
          ('rm.onboarding-renewal',       'MOBO',       'view'),
          ('rm.onboarding-renewal',       'COMPLIANCE', 'view'),
          ('rm.onboarding-renewal',       'ADMIN',      'edit'),
          -- rm.model-subscription
          ('rm.model-subscription',       'RM',         'edit'),
          ('rm.model-subscription',       'MOBO',       'view'),
          ('rm.model-subscription',       'PC',         'view'),
          ('rm.model-subscription',       'COMPLIANCE', 'view'),
          ('rm.model-subscription',       'ADMIN',      'edit'),
          -- rm.request-tickets — rule 2: absent from the catalog, so today's
          -- ROLE_PAGES grant is preserved (owner + ADMIN at 'edit').
          ('rm.request-tickets',          'RM',         'edit'),
          ('rm.request-tickets',          'ADMIN',      'edit'),
          -- shared.monthly-reports — the catalog gives RM/MOBO/PC 'view' where
          -- all three hold OPERATE today. This is the one NARROWING in the seed,
          -- and it applies to RM and MOBO only. Confirm before the live apply (B-1).
          ('shared.monthly-reports',      'RM',         'view'),
          ('shared.monthly-reports',      'MOBO',       'view'),
          -- ⚠ D-13 (user ruling): the SECOND cell that deliberately departs from
          -- the catalog, which says 'view' here. The page is "Monthly Reports
          -- (Models)" and model reporting is Portfolio Control's own output — PC
          -- produces it, RM and MOBO consume it — so PC keeps 'edit'. Do NOT
          -- fold it in with the RM/MOBO 'view' rows above.
          ('shared.monthly-reports',      'PC',         'edit'),
          ('shared.monthly-reports',      'COMPLIANCE', 'view'),
          ('shared.monthly-reports',      'ADMIN',      'edit'),
          -- mobo.recon-overview
          ('mobo.recon-overview',         'MOBO',       'edit'),
          ('mobo.recon-overview',         'PC',         'view'),
          ('mobo.recon-overview',         'COMPLIANCE', 'view'),
          ('mobo.recon-overview',         'ADMIN',      'edit'),
          -- mobo.trade-reconciliation
          ('mobo.trade-reconciliation',   'MOBO',       'edit'),
          ('mobo.trade-reconciliation',   'PC',         'view'),
          ('mobo.trade-reconciliation',   'COMPLIANCE', 'view'),
          ('mobo.trade-reconciliation',   'ADMIN',      'edit'),
          -- mobo.post-trade-allocation
          ('mobo.post-trade-allocation',  'MOBO',       'edit'),
          -- ⚠ D-10 (user ruling): the ONE cell that deliberately contradicts the
          -- catalog, which says 'edit' here. PC access to PTA is a requirement
          -- but READ-ONLY: 'view' grants POST_TRADE_ALLOCATION_VIEW and NOT
          -- _RUN. Running allocations stays MOBO's. Do NOT "correct" it to
          -- 'edit' to match the catalog.
          ('mobo.post-trade-allocation',  'PC',         'view'),
          ('mobo.post-trade-allocation',  'COMPLIANCE', 'view'),
          ('mobo.post-trade-allocation',  'ADMIN',      'edit'),
          -- mobo.commission-tracking — rule 2, as rm.request-tickets above.
          ('mobo.commission-tracking',    'MOBO',       'edit'),
          ('mobo.commission-tracking',    'ADMIN',      'edit'),
          -- pc.model-management
          ('pc.model-management',         'RM',         'view'),
          ('pc.model-management',         'MOBO',       'view'),
          ('pc.model-management',         'PC',         'edit'),
          ('pc.model-management',         'COMPLIANCE', 'view'),
          ('pc.model-management',         'ADMIN',      'edit'),
          -- pc.allocation-matrix
          ('pc.allocation-matrix',        'MOBO',       'view'),
          ('pc.allocation-matrix',        'PC',         'edit'),
          ('pc.allocation-matrix',        'COMPLIANCE', 'view'),
          ('pc.allocation-matrix',        'ADMIN',      'edit'),
          -- pc.allotment-redemption
          ('pc.allotment-redemption',     'RM',         'view'),
          ('pc.allotment-redemption',     'MOBO',       'view'),
          ('pc.allotment-redemption',     'PC',         'edit'),
          ('pc.allotment-redemption',     'COMPLIANCE', 'view'),
          ('pc.allotment-redemption',     'ADMIN',      'edit'),
          -- compliance.overview
          ('compliance.overview',         'PC',         'view'),
          ('compliance.overview',         'COMPLIANCE', 'edit'),
          ('compliance.overview',         'ADMIN',      'edit'),
          -- compliance.review
          ('compliance.review',           'PC',         'view'),
          ('compliance.review',           'COMPLIANCE', 'edit'),
          ('compliance.review',           'ADMIN',      'edit'),
          -- admin.enroll-user
          ('admin.enroll-user',           'ADMIN',      'edit'),
          -- admin.system-config
          ('admin.system-config',         'ADMIN',      'edit')
          -- PM — ZERO rows, in every column above. That is D-12, not an omission:
          -- PM has no grants today and keeps none. NONE is the absence of a row
          -- (D-3), so there is nothing to insert for PM.
        """
    )
```

**Behavior / invariants:**
- Exactly **55 rows**. By level: `SELECT level, COUNT(*) FROM page_access GROUP BY level` returns `edit` 30 / `view` 25. By role: `SELECT role, COUNT(*) FROM page_access GROUP BY role` returns RM 7 / MOBO 10 / PC 10 / COMPLIANCE 12 / ADMIN 16, and **no PM row at all**. Both axes are asserted, because a single mistyped cell changes one of the two counts and must fail loudly rather than quietly shift someone's access.
- **ADMIN holds exactly one `edit` row per page** — 16 rows, zero `view`. "ADMIN sees everything" is therefore a property the data satisfies, not a special case anywhere in code.
- **PM holds zero rows** (D-12). An empty result for PM is the expected state, not a missing seed.
- `('mobo.post-trade-allocation', 'PC')` is `'view'`, not `'edit'` (D-10) — the one cell that deliberately contradicts the catalog it was transcribed from.
- `('shared.monthly-reports', 'RM')` and `('shared.monthly-reports', 'MOBO')` are `'view'`, not `'edit'` — the seed's one narrowing relative to today, and the change B-1 singles out for confirmation before the live apply. `('shared.monthly-reports', 'PC')` is `'edit'` (D-13) — the second cell that deliberately departs from the catalog.
- Every `page_id` in the seed is one of the 16 `PAGES` keys. No catalog path literal (`/rm/dashboard` and friends) ever reaches this table — the rename map is applied at transcription time, and the fictional catalog rows are dropped, not stored.
- Every `role` value is an `AdminRole` **value** (uppercase, matching `values_callable`) — the ORM reads these rows back as enum members without a translation step.
- No `updated_at` is supplied; the column's `server_default` supplies insert time.
- The seed lives inside DB-6's `upgrade()`, so it is removed by `DROP TABLE page_access` in `downgrade()` — there is no separate seed teardown.
- The seed is written literally, never computed from a Python dict or scraped from the TypeScript at build time, so the whole access policy is visible in the diff and in `git blame`. After Backend C-2 deletes `ROLE_ACTIONS`, these 55 rows are the *only* statement of which role gets what.

**Done when:** the seed applies on a fresh DB; the per-role group-by is RM 7 / MOBO 10 / PC 10 / COMPLIANCE 12 / ADMIN 16 with no PM row (55 total); the per-level group-by is `edit` 30 / `view` 25; ADMIN has 16 rows all `edit`; `('mobo.post-trade-allocation','PC')` is `view` (D-10); the `shared.monthly-reports` rows for RM and MOBO are `view` while PC's is `edit` (D-13); and no row carries a `page_id` outside the 16 known ids.

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal § 4 "Cross-layer seam (frozen here)")

#### 4.1 The wire contract

```ts
/* ---------- shared enums ---------- */
// Replaces pages-config.ts `AccessLevel = "OPERATE" | "VIEW"` (Goal 2) and
// lib/admin/types.ts `Level = "none" | "view" | "edit"` — one type, one spelling.
// Wire + code use UPPERCASE; the DB column stores the lowercase value (map below).
type AccessLevel = "NONE" | "VIEW" | "EDIT";

type PageId =            // authoritative list = keys of PAGES in pages-config.ts
  | "rm.client-info" | "rm.onboarding-renewal" | "rm.model-subscription" | "rm.request-tickets"
  | "mobo.recon-overview" | "mobo.trade-reconciliation" | "mobo.commission-tracking"
  | "mobo.post-trade-allocation"
  | "pc.model-management" | "pc.allocation-matrix" | "pc.allotment-redemption"
  | "compliance.overview" | "compliance.review"
  | "shared.monthly-reports" | "admin.enroll-user" | "admin.system-config";

type Role = "ADMIN" | "MOBO" | "RM" | "PM" | "PC" | "COMPLIANCE";
type StaffStatus = "ACTIVE" | "INITIATED" | "DEACTIVATED";   // INITIATED is DERIVED — see map

/* ---------- 1. login / me: the caller's own effective access ---------- */
// GET /api/auth/me  and  POST /api/auth/admin/login  → UserOut (extended)
interface UserOut {
  firebase_uid: string;
  email: string | null;
  role: Role | "CLIENT";
  name: string | null;
  grants: Partial<Record<PageId, "VIEW" | "EDIT">>;  // NEW. absent key === NONE.
}                                                    // clients: always {}

/* ---------- 2. staff directory ---------- */
// GET /api/admin/staff → StaffOut[]        (Action.USER_VIEW)
interface StaffOut {
  firebase_uid: string;
  email: string | null;
  name: string | null;
  role: Role;
  department: string | null;
  phone_number: string | null;
  status: StaffStatus;
  last_sign_in_at: string | null;   // ISO-8601 UTC; null ⇒ status is INITIATED
  override_count: number;
  // Handover preview (Backend C-11). Both null for every role except RM — nothing
  // else in the system is owned per-person, so there is nothing else to hand over.
  client_count: number | null;      // clients whose assigned_rm_uid is this user
  open_ticket_count: number | null; // their tickets with status != closed
}

// POST /api/admin/staff → 201 StaffCreatedOut | 409 | 422   (Action.USER_WRITE)
interface StaffEnrollIn {
  email: string;                 // must end @megaannum.ai — server-enforced, 422 otherwise
  first_name: string;
  last_name: string;
  role: Role;
  phone_number?: string | null;
  department?: string | null;
  start_date?: string | null;    // ISO date
  address?: string | null;
  send_link: boolean;            // the wizard's "Email the invitation" checkbox
  overrides?: Array<{ page_id: PageId; level: AccessLevel; reason: string; expires_at: string | null }>;
}
// NOTE: no `password` field, in or out. The identity is created WITHOUT a password
// and the user sets their own via the emailed link. Nothing to display, copy or store.
interface StaffCreatedOut {
  firebase_uid: string;
  email: string;
  role: Role;
  status: StaffStatus;           // always "INITIATED" for a fresh enrollment
  link_sent: boolean;            // false ⇒ send failed or send_link was false; account still created
  override_count: number;
}

// PATCH /api/admin/staff/{uid} → StaffOut | 404 | 409       (Action.USER_WRITE)
interface StaffUpdateIn {        // all optional; omitted = unchanged
  role?: Role; name?: string; email?: string; phone_number?: string | null;
  department?: string | null;
  status?: "ACTIVE" | "DEACTIVATED";     // INITIATED is never settable — it is derived
  deactivate_reason?: string | null;
  // Book handover (C-11). REQUIRED when the target is an RM with client_count > 0 and
  // this patch makes them stop being an active RM — i.e. status: "DEACTIVATED" OR a
  // role other than "RM". Server-validated: a different, ACTIVE, RM-role uid.
  reassign_book_to?: string | null;      // firebase_uid of the receiving RM
}
// 409 "Cannot demote/disable the last active ADMIN"              (existing, unchanged)
// 409 "Reassign this RM's client book before deactivating"        (C-11)
// 409 "Reassign this RM's client book before changing their role" (C-11)
// 422 "reassign_book_to must be an active RM"                     (C-11)

// POST /api/admin/staff/{uid}/set-password-link → LinkSentOut  (Action.USER_WRITE)
// The "Reset password" row action. Body is empty. Idempotent: each call generates a
// fresh Firebase link, which invalidates any earlier unused one.
interface LinkSentOut { link_sent: boolean }

/* ---------- 3. access matrix ---------- */
// GET /api/admin/access/matrix → MatrixOut                  (Action.USER_VIEW)
interface MatrixOut {
  pages: Array<{ page_id: PageId; group: string; label: string; path: string }>;  // server-authored order
  roles: Array<{ code: Role; name: string; user_count: number }>;
  levels: Array<{ page_id: PageId; role: Role; level: "VIEW" | "EDIT" }>;  // NONE cells omitted
  published: { at: string; by: string } | null;
}

// PUT /api/admin/access/matrix → MatrixOut | 409             (Action.USER_WRITE)
// Atomic: all cells applied in one transaction + one audit row, or none.
interface MatrixPublishIn {
  changes: Array<{ page_id: PageId; role: Role; level: AccessLevel }>;  // NONE deletes the row
  note?: string | null;
}
// 409 { detail: "matrix_changed_since_read", published: {at, by} } when If-Unmodified-Since-style
// guard trips: the request MUST carry `base_published_at` matching the server's current value.

/* ---------- 4. per-account overrides ---------- */
// GET /api/admin/access/overrides → OverrideOut[]            (Action.USER_VIEW)
interface OverrideOut {
  id: string;                    // UUID
  firebase_uid: string; user_name: string; user_role: Role;
  page_id: PageId; page_label: string; page_path: string;
  role_default: AccessLevel;     // resolved server-side at read time
  level: AccessLevel;            // the granted level
  reason: string;
  granted_by: string;            // granter's display name
  expires_at: string | null;     // null ⇒ no expiry
  expiring_soon: boolean;        // server-computed: expires_at within 30 days
}
// POST   /api/admin/access/overrides  { firebase_uid, page_id, level, reason, expires_at }
//        → 201 OverrideOut | 409 (one override per (user, page)) | 422 (reason required)
// DELETE /api/admin/access/overrides/{id} → 204               (Action.USER_WRITE)

/* ---------- 5. audit ---------- */
// GET /api/admin/audit?limit=&before= → AuditOut[]           (Action.USER_VIEW)
interface AuditOut { id: string; at: string; actor_name: string; event: string; detail: string }
```

**Field-name ↔ column-name map** (anything not listed is same-named):

| Wire | DB | Note |
|---|---|---|
| `AccessLevel` `"VIEW"`/`"EDIT"` | `page_access.level` enum `('view','edit')` | lowercase in DB, uppercase on the wire. On **this** table `"NONE"` is never stored — it is the absence of a row |
| `AccessLevel` `"NONE"`/`"VIEW"`/`"EDIT"` | `page_access_overrides.level` enum `('none','view','edit')` | **three** values here, deliberately (D-3): a `NONE` override is an active statement ("revoke this page for this one person"), which row-absence cannot express — absence already means "fall back to the role default" |
| `page_id` | `page_access.page_id` `VARCHAR(64)` | the `PageId` literal, e.g. `"pc.allocation-matrix"` |
| `StaffOut.name` | `admin_profiles.name` | `first_name`+`last_name` are joined server-side on enroll; there is one `name` column |
| `StaffOut.department` | `admin_profiles.department` | new column |
| `StaffEnrollIn.start_date` / `.address` | `admin_profiles.start_date` (DATE) / `.address` (TEXT) | new columns — the wizard collects both, so they are persisted, not discarded |
| `StaffOut.status` `"ACTIVE"`/`"DEACTIVATED"` | `users.status` enum `('active','disabled')` | `DEACTIVATED` ↔ `disabled` |
| `StaffOut.status` `"INITIATED"` | *(derived)* | `users.status = 'active' AND users.last_sign_in_at IS NULL` — **no `initiated` enum value is added** |
| `last_sign_in_at` | `users.last_sign_in_at` | new column, written by `login_and_bind` |
| `expiring_soon` | *(derived)* | `expires_at <= NOW() + INTERVAL 30 DAY` |
| `MatrixOut.published` | `page_access_publications.published_at / actor_name` | latest row |
| `AuditOut.event` / `.detail` | `admin_audit_events.event` / `.detail` | free text, display-only |

#### 4.2 Per-layer obligations against the seam

| Layer | What this layer contributes | What this layer assumes from the other side |
|---|---|---|
| Database | `page_access`, `page_access_overrides`, `page_access_publications`, `admin_audit_events`; `admin_profiles.{department,start_date,address}`; `users.last_sign_in_at`. Seeds `page_access` with the 55-row matrix in B-1, derived from the System Config catalog's own levels (D-11) — a stated policy, not a copy of today's grants. Uniqueness: `(page_id, role)` and `(user_id, page_id)`. | Backend only ever writes `page_id` values that are `PageId` literals and `level ∈ {view, edit}`; `NONE` arrives as a DELETE, never as a row. |
| Backend | Serves §4.1's 10 admin routes plus the extended `/auth/me` and `/auth/*/login`; resolves effective level = override (unexpired) **else** role standing level; derives the action set from that level via a code-side `PAGE_ACTIONS` map; returns `grants` on `UserOut`; mints passwordless identities and sends the set-password email for both portals. | The four tables and four columns exist with the §4.1 types; the FE never sends `"NONE"` as a stored level and always sends `base_published_at` on `PUT /matrix`. |
| Frontend | Consumes `grants` from login/me into `usePageAccess(pageId)`; gates all 32 marker sites; replaces `AdminStoreContext`'s mock seed with the §4.1 endpoints; keeps staging client-side and publishes one `MatrixPublishIn`. | `grants` is present on every `UserOut` (`{}` for a client); `page_id`/`group`/`label`/`path` in `MatrixOut.pages` are display-ready and ordered — the FE does not re-sort or re-label. |

### 7.2 How this layer honours the seam

- **What this layer contributes:** exactly the Database row of §4.2 — the four tables (DB-1/DB-2/DB-3), `admin_profiles.{department,start_date,address}` and `users.last_sign_in_at` (DB-4), the two uniqueness guarantees `(page_id, role)` and `(user_id, page_id)`, and the 55-row `page_access` seed transcribed from the System Config catalog's level matrix — 30 `edit`, 25 `view`, a stated policy rather than a copy of today's grants (DB-7, D-11). Every column type matches the §4.1 map: `page_id` is `VARCHAR(64)`; `level` stores the **lowercase** value while the wire uses uppercase; `"NONE"` is never stored on `page_access`; `AccountStatus` keeps its two values so `INITIATED` stays derivable as `status='active' AND last_sign_in_at IS NULL`. `page_access_publications.published_at`/`actor_name` are the source of `MatrixOut.published`, and `MAX(published_at)` is the concurrency token.
  - The two level enums are separate rows of the §4.1 map and this layer implements both as written: `page_access.level` is `('view','edit')` (DB-1) with `NONE` expressed as row absence, and `page_access_overrides.level` is `('none','view','edit')` (DB-2), because a `NONE` override is an active statement that absence cannot carry (D-3).
- **What this layer assumes from the other side (used as the ASSUMPTION for §8's mocks, never as a runtime dependency):** the Backend only ever writes `page_id` values drawn from the 16 `PageId` literals and, on `page_access`, only `level ∈ {view, edit}`; a `NONE` cell reaches the DB as a `DELETE`, never as a row. Uniqueness violations are the Backend's 409s. `reason` non-emptiness and `reassign_book_to` validation are enforced above the DB (422), not by constraints here. `users.last_sign_in_at` has exactly one writer, `login_and_bind`.
- **Change protocol:** any edit to §7 requires editing the proposal's §4 first; this section is then re-copied verbatim. Never edit §7 in isolation.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Framework / runner:** `pytest` — command: `pytest -q`, run from `api-backend/` (config lives in `[tool.pytest.ini_options]` in `api-backend/pyproject.toml`).
- **Fixtures / seed:** a per-test in-memory/scratch engine created from `Base.metadata`, plus, for the migration units, an Alembic-driven scratch database stamped to `b34f8c1a9d27` and upgraded through the new revision. A minimal `users`/`admin_profiles` row factory supplies FK targets for the override and audit tables. No fixture reads the live `portal` database.
- **Isolation:** hermetic — each test builds and tears down its own schema; safe to run in parallel.
- **Layer isolation (critical):** tests import **only** from `app.models.*`, `app.core.database`, the Alembic revision module, and the standard library. They must not import from `app.libs.access`, `app.libs.staff`, `app.libs.auth` or any other Backend-layer package, must not stand up FastAPI, and must not call a route — none of that is visible on this branch. Where the other side of the seam is needed (e.g. "the Backend writes only `PageId` literals"), the test fakes it with a literal list matching §7's `PageId` union, via `unittest.mock` / `monkeypatch`. Cross-layer verification belongs to the integration track (proposal § "Execution & verification" step 5).
- **Test location:** `api-backend/tests/`, mirroring source paths (e.g. `tests/models/test_access.py`, `tests/alembic/test_0028_admin_access_control.py`) — never co-located next to source.
- **Commit policy:** tests are **never committed** — `tests/` is git-ignored on every layer. They are generated and run locally / pre-hand-off, not from repo-committed CI.
- **Code generation:** the concrete test code is written by the `test-gen` skill (`lite` | `standard` | `thorough`) from the goals in §8.2/§8.3. This doc embeds no test code.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| DB-1 | `page_access` maps with `page_id VARCHAR(64)`, `role`, `level`, `updated_at`; `AccessLevel` has exactly `{"view","edit"}`; `(page_id, role)` is unique; `ix_page_access_role` exists; no `'none'` is storable through the ORM enum | none |
| DB-2 | `page_access_overrides` maps with a UUID PK; `OverrideLevel` has exactly `{"none","view","edit"}`; `(user_id, page_id)` is unique; `user_id` FK is `CASCADE`, `granted_by` FK is `SET NULL`; `expires_at`/`granted_by` nullable, `reason` not | none |
| DB-3 | both tables map; `change_count` is `NOT NULL`; both `actor_uid` FKs are `SET NULL` and both `actor_name` columns are nullable; `published_at`/`at` have server defaults; the two indexes exist | none |
| DB-4 | `User.last_sign_in_at` and `AdminProfile.department`/`.start_date`/`.address` exist, nullable, no default, with types `DATETIME`/`VARCHAR(255)`/`DATE`/`TEXT`; `start_date` round-trips as a `date` with no time component; `AccountStatus` still has exactly two members; no `password_expires_at` attribute exists on any model | none |
| DB-5 | after importing the app bootstrap, `Base.metadata` contains all four new table names | none |
| DB-6 | `down_revision == "b34f8c1a9d27"`; upgrade→downgrade→upgrade is clean on a scratch DB; post-upgrade schema has no autogenerate diff against `Base.metadata`; downgrade leaves no residual table/column | Backend's `PageId` literal set, faked as a list, to assert the schema can hold every id |
| DB-7 | exactly 55 rows after upgrade; per-role counts RM 7 / MOBO 10 / PM 0 / PC 10 / COMPLIANCE 12 / ADMIN 16; per-level counts `edit` 30 / `view` 25; ADMIN is 16 rows all `edit`, one per page; PM has zero rows (D-12); `('mobo.post-trade-allocation','PC')` is `view` (D-10); `('shared.monthly-reports', RM\|MOBO)` are `view` while `('shared.monthly-reports','PC')` is `edit` (D-13); the whole set equals B-1's matrix cell for cell; every `page_id` is one of the 16 known ids (no catalog path literal survived the rename map); every `role` is an `AdminRole` value and reads back as an enum member; re-running the seed violates the unique constraint (idempotency is by revision, not by `INSERT IGNORE`) | the 16 `PageId` literals plus B-1's expected `{(page_id, role): level}` matrix, both as fixture data (neither `pages-config.ts` nor `catalog.ts` is importable from pytest) |

### 8.3 Test goals (per unit)

#### DB-1
- **Positive:** the mapped table has the five expected columns with the expected types and nullability; the named unique constraint and named index are present on `__table__`; `AccessLevel` members are exactly `VIEW`/`EDIT` with values `"view"`/`"edit"`.
- **Negative:** inserting a second row with the same `(page_id, role)` raises an integrity error; assigning a non-member (e.g. the string `"none"`) to `level` is rejected before it reaches the DB.
- **Invariants:** `level` never holds `'none'`; the enum column is non-native (`native_enum=False`) and persists by value, not member name — assert the emitted DDL/round-trip value is lowercase.
- **Seam mocks:** none.

#### DB-2
- **Positive:** the table maps with a UUID PK defaulted from `uuid.uuid4`; `OverrideLevel` members are exactly `NONE`/`VIEW`/`EDIT` with lowercase values; `reason` is `NOT NULL`, `granted_by`/`expires_at` nullable.
- **Negative:** a second override for the same `(user_id, page_id)` raises an integrity error; deleting the referenced `users` row deletes the override (`CASCADE`); deleting the granter leaves the row with `granted_by IS NULL` rather than raising or cascading.
- **Invariants:** the three-value enum on this table and the two-value enum on `page_access` are distinct objects with distinct member sets — one assertion pinning the D-3 asymmetry so a later "consolidation" fails the suite.
- **Seam mocks:** none.

#### DB-3
- **Positive:** both tables map with their indexes; `published_at` and `at` receive a server-side timestamp on insert without the caller supplying one; `change_count` accepts an integer and rejects `NULL`.
- **Negative:** deleting the actor's `users` row leaves both an audit row and a publication row present with `actor_uid IS NULL` while `actor_name` is unchanged — the denormalisation's whole point; inserting an audit row without `event` or `detail` fails.
- **Invariants:** neither model exposes an `updated_at`, and nothing in the layer issues an `UPDATE`/`DELETE` against them (append-only by construction).
- **Seam mocks:** none.

#### DB-4
- **Positive:** all four new columns exist, are nullable, have no server default, and default to `NULL` on a row inserted without them; `last_sign_in_at` round-trips as an aware datetime, `department` as a string, `start_date` as a `datetime.date` (no time component), `address` as arbitrary-length text.
- **Negative:** `AccountStatus` does **not** contain an `INITIATED`/`initiated` member — a guard test that fails loudly if someone adds one (D-4); no model in `app.models` has a `password_expires_at` attribute (B-4's explicit exclusion).
- **Invariants:** the derivation `status == ACTIVE and last_sign_in_at is None ⇒ INITIATED` is computable purely from these two fields for every combination of the two — asserted as a small truth table over the model, not against a Backend function (which is not importable here).
- **Seam mocks:** none.

#### DB-5
- **Positive:** importing the bootstrap module registers all four new tables in `Base.metadata.tables`.
- **Negative:** the import is side-effect-only — nothing in the bootstrap references the alias, so removing the `noqa` would trip lint; assert the four tables are absent from a metadata built without the import (i.e. the registration is what puts them there, not an incidental import elsewhere).
- **Invariants:** repeated import does not duplicate or re-define a table (`extend_existing` is never needed).
- **Seam mocks:** none.

#### DB-6
- **Positive:** the revision module declares `revision == "5cd1cc1948cc"` and `down_revision == "b34f8c1a9d27"`; `upgrade` then `downgrade -1` then `upgrade` again completes without error on a scratch DB; after upgrade, an Alembic autogenerate comparison against `Base.metadata` reports no differences for the four tables and four columns.
- **Negative:** after `downgrade -1`, none of the four tables and none of the four columns exists; the revision performs no `ALTER` against an existing column (assert by inspecting the module's operations, so a future edit that adds one is caught).
- **Invariants:** the migration is order-independent with respect to pre-existing data — running it against both an empty DB and a DB with existing `users`/`admin_profiles` rows produces the same schema and never fails on data.
- **Seam mocks:** the Backend's `PageId` literal set, faked as a plain list of the 16 strings, used to assert `page_id VARCHAR(64)` accommodates the longest id with headroom.

#### DB-7
- **Positive:** after upgrade, `page_access` holds exactly **55** rows; the group-by by role is RM 7 / MOBO 10 / PC 10 / COMPLIANCE 12 / ADMIN 16 with **no PM row**; the group-by by level is `edit` 30 / `view` 25; ADMIN's 16 rows are all `edit`, one per page. Assert **both** axes plus the total — a single mistyped cell moves exactly one of the two distributions, so a per-role-only or per-level-only check can miss it.
- **Negative:** no seeded `page_id` falls outside the 16 known ids (catches a typo in the literal list, and proves no catalog path literal such as `/rm/dashboard` survived the rename map); no seeded `role` falls outside `AdminRole`'s values; PM has zero rows (D-12, an expected absence — not a "seed missing" failure); `('mobo.post-trade-allocation','PC')` is `'view'` and never `'edit'` (D-10, the one cell that contradicts the catalog); the three `('shared.monthly-reports', RM|MOBO|PC)` rows are `'view'` and never `'edit'` (the seed's one narrowing); re-executing the seed statement raises an integrity error on `uq_page_access_page_id_role` (proving the unique constraint actually guards the seed, and that idempotency comes from the revision, not the `INSERT`).
- **Invariants:** the seed equals B-1's 16×6 matrix **cell for cell**, including levels — the fixture is the expected `{(page_id, role): level}` mapping transcribed from that table, compared as a whole so both a missing row and a wrong level fail, and so the D-10/D-12/D-13/rule-2 exceptions live in the fixture as ordinary data rather than as skipped assertions. This is **not** a `ROLE_PAGES` parity test: `ROLE_PAGES` is not the source (D-11) and comparing against it would fail by design on ~26 new read cells and on Monthly Reports. Arithmetic self-check: 7+10+0+10+12+16 = 55 = 30 edit + 25 view.
- **Seam mocks:** the 16 `PageId` literals as a fixture list, standing in for `admin-frontend/lib/pages-config.ts`'s `PAGES` keys (a TypeScript file, not importable from pytest). The drift check between the real registries is the Backend layer's `PAGE_IDS == PAGES` test (proposal D-8), not this one.

### 8.4 Aggregate gate
- All unit tests green is a **local gate** before commit / PR hand-off (§3.2). A red test blocks the unit; the tests themselves are never committed (git-ignored `tests/`), so this gate runs on the implementer's / orchestrator's machine rather than repo-committed CI.
- Target coverage for changed lines: ≥ 90% of new/changed statements in `app/models/access.py`, the four `users.py` column additions, and the revision module.
- Chosen `test-gen` level for this layer: **standard**. Justification: the schema is additive and mechanical, but the 55-cell seed (a hand-transcribed access policy with three named exceptions) and the two-vs-three-value enum asymmetry are the places a silent error becomes a security-relevant access mistake — `standard`'s happy-path + main-negative pair per goal covers both without paying for `thorough`'s boundary-class expansion on plain nullable columns. The seed's own protection is the cell-for-cell matrix comparison in §8.3, which does not scale with the `test-gen` level.

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] DB-1 … DB-7 committed on `claude/admin-pages-backend-proposal-f0c9fc-db`; each commit left the branch green.
- [ ] `app/models/access.py` exists with all four tables and both enums; `AccessLevel` has 2 members and `OverrideLevel` has 3 (D-3 asymmetry intact and documented in the model docstring).
- [ ] `users.last_sign_in_at` and `admin_profiles.department`/`.start_date`/`.address` exist (`DATETIME`/`VARCHAR(255)`/`DATE`/`TEXT`, all nullable); `AccountStatus` unchanged; `grep -r "password_expires_at" api-backend/` returns nothing.
- [ ] `app/main.py` imports `app.models.access`; `Base.metadata` contains all four tables.
- [ ] One Alembic revision `5cd1cc1948cc` (`0028_admin_access_control`) chained to `b34f8c1a9d27`; `upgrade` → `downgrade -1` → `upgrade` clean on a scratch DB; `alembic heads` reports a single head.
- [ ] `SELECT role, COUNT(*) FROM page_access GROUP BY role` returns RM 7 / MOBO 10 / PC 10 / COMPLIANCE 12 / ADMIN 16, no PM row (D-12), 55 rows total; `SELECT level, COUNT(*) FROM page_access GROUP BY level` returns `edit` 30 / `view` 25; ADMIN's 16 rows are all `edit`.
- [ ] The seed matches B-1's 16×6 matrix **cell for cell**. The review question is **"is every difference from today's behavior on B-1's change list?"** — not "did anything change": this seed is a policy statement, not a parity copy. It grants ~26 new read-only cells, narrows `shared.monthly-reports` from `edit` to `view` for RM and MOBO (PC keeps `edit` per D-13, as does ADMIN), and gives PC a working PTA read at `view` (D-10). Nobody loses a page.
- [ ] The Monthly Reports narrowing is **explicitly confirmed as intended** before the phase-4 live apply — B-1 flags it as the seed's only narrowing, taking write on one page away from **two** roles (RM and MOBO; PC keeps `edit` per D-13). Confirmation is the human's, sought at the gate; it is not something this layer can settle on its own.
- [ ] §8 unit tests all pass; §3.2 gate (`ruff check . && ruff format --check . && mypy app && pytest -q`) green from `api-backend/`.
- [ ] §7 matches the proposal's frozen §4 verbatim — checked against the proposal on the parent branch, **not** against sibling layers' branches (which are not visible here).
- [ ] The live-DB apply is **not** performed from this session — it is the proposal's human gate (b). PR opened against the parent branch; the human owns the merge.

**Rollback** (carried from the proposal's § "Rollback", DB-layer paragraph — its wording, not a blander restatement):

> **DB layer:** `alembic downgrade -1` drops four tables and four columns. **Lossy, and specifically:** every access grant and override an administrator published since the migration, the entire audit trail, and all recorded sign-in times. **A downgrade must be treated as a security-relevant event**, not a routine revert: dump `page_access` and `page_access_overrides` first, and re-apply any restriction by hand if the tables do not come back.
>   - **Order matters, because C-2 left no fallback.** Against a *post-019* backend, a downgraded DB means an empty `page_access` and therefore 403 for every admin on every guarded route — the deliberate fail-closed behavior, but a full outage of the admin portal. So the DB downgrade is a standalone operation only while the Backend branch is not deployed; otherwise revert **backend first, then the DB**. The reverted backend restores `ROLE_ACTIONS` and behaves exactly as today, at which point dropping the tables changes nothing.
>   - The mirror-image hazard on the way *forward*: deploying the backend before applying the migration produces the same 403 outage. Both directions have one safe order, and it is the same rule — the code that reads `page_access` must never be live while `page_access` is absent.

What reverts automatically with the branch: `app/models/access.py`, the two `users.py` columns, the `main.py` import line, and the revision *file*. What needs an explicit step: `alembic downgrade -1` against any database the revision was applied to — reverting the code does not un-apply the migration, and a database left at `5cd1cc1948cc` with the revision file gone is an unresolvable Alembic state.

**The ordering rule, stated once** (the sequencing itself belongs to the execution schedule; the rule belongs here because it is a property of this layer's artifact): *the code that reads `page_access` must never be live while `page_access` is absent.* Both directions follow from that single sentence.
- **Forward:** apply this revision **before** deploying the Backend branch. Backend C-2 deletes `ROLE_ACTIONS` and declares `0028_admin_access_control` a hard prerequisite, so a post-019 backend against an un-migrated (or un-seeded) DB fails closed — 403 for every admin on every guarded route.
- **Reverse:** revert the **Backend branch first, then** downgrade the DB. A DB downgrade is a standalone operation only while the Backend branch is not deployed. Once the reverted backend has restored `ROLE_ACTIONS`, dropping the four tables changes no behavior; doing it in the other order is the same 403 outage as the forward hazard.
