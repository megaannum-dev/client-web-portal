# 016 — Allotment & Redemption Integration · Implementation Details — Database

> Status: **DRAFT — pending implementation.**
> Implements: proposal `docs/proposals/016-2026-07-22-allotment-redemption-integration.md` § "Layer 1 — Database" (plus the frozen seam in § 4.1/4.2)
> Layer: Database — **one layer per file.**
> Sibling layer docs: `docs/implementations/016-allotment-redemption-integration-be.md`, `docs/implementations/016-allotment-redemption-integration-fe.md`
> Execution schedule: `docs/execution-schedules/016-allotment-redemption-integration-db.md`
> Builds on / prerequisites: migration `deb8fd8a60b6` (`0021_neutralize_recovered_head.py`) — this must be the current Alembic head before this layer's migration is authored. The live `portal` DB is currently stamped at `deb8fd8a60b6` (verified via `alembic current`).

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/016-2026-07-22-allotment-redemption-integration.md` § "Layer 1 — Database" (findings B-1, B-2), § 4.1/4.2 (frozen seam) |
| Execution schedule | `docs/execution-schedules/016-allotment-redemption-integration-db.md` |
| Sibling layer impl docs | `docs/implementations/016-allotment-redemption-integration-be.md`, `docs/implementations/016-allotment-redemption-integration-fe.md` |
| Builds on | Migration `deb8fd8a60b6` (0021_neutralize_recovered_head) — must be the current head; live DB already stamped here |

---

## 2. Branch & session contract

- **Branch:** `allotment-redemption-integration-db` — all work units in this doc land on this one branch.
  - Parent branch is `allotment-redemption-integration` (the branch this repo is currently on, captured via `git rev-parse --abbrev-ref HEAD`).
  - Per-layer branches merge back into the parent — **the human owns that merge** (agents stop at "PR opened").
- **Isolation:** implementable in a separate session on its own branch, in parallel with the BE/FE layer branches, provided the preconditions below hold. Shares state with sibling layers only through the pinned contract in §7.
- **Preconditions (must be true before starting):**
  - [ ] Migration `deb8fd8a60b6` (0021_neutralize_recovered_head) is the current Alembic head on `main`/the parent branch, and the live `portal` DB is stamped at it (`alembic current` → `deb8fd8a60b6`).
  - [ ] `api-backend/db-backups/portal_pre-016_2026-07-22.sql` exists as the pre-work backup of the live DB — this file must not be modified or deleted by this layer's work.
  - [ ] The frozen seam in the proposal § 4.1/4.2 is agreed — §7 below is a verbatim copy, not a negotiation with a sibling layer.
- **Read-first inventory:**
  - `api-backend/app/models/onboarding.py` — contains `AllotRdmpStatus` (lines ~179-181) and `ClientAllotmentRedemption` (lines ~190-252), the two objects this layer widens.
  - `api-backend/alembic/versions/deb8fd8a60b6_0021_neutralize_recovered_head.py` — confirms the current head and the required `down_revision` for the new migration; read it before authoring DB-2's revision file.
- **Hand-off / exit signal:** DB-1 and DB-2 committed on `allotment-redemption-integration-db`; a single new Alembic revision applies cleanly (`upgrade`/`downgrade`) on top of `deb8fd8a60b6` against a scratch DB; unit tests (§8) green; PR opened against `allotment-redemption-integration`.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- ORM style: SQLAlchemy 2.0 `Mapped`/`mapped_column`, as used throughout `api-backend/app/models/onboarding.py`.
- Enums are Python `str, enum.Enum` subclasses persisted with `SAEnum(..., native_enum=False, values_callable=lambda e: [m.value for m in e])` — i.e. VARCHAR-backed, not a Postgres/MySQL native enum type. Widening the enum is a pure Python-level change; no `ALTER TYPE`/`ALTER COLUMN` for the enum itself is needed, only a migration revision that documents the contract.
- Migrations live under `api-backend/alembic/versions/`, one file per revision, named `<revision>_<NNNN>_<slug>.py`.
- **Revision IDs are random hex, never hand-invented.** Generate with:
  ```bash
  python -c "import secrets; print(secrets.token_hex(6))"
  ```
- **Hard constraint (DB-safety):** the new revision's `down_revision` MUST be `"deb8fd8a60b6"` — never `"02f0f4296350"` directly. `deb8fd8a60b6` exists specifically to give stale unmerged DB-layer branches a single, unambiguous rebase point (see that revision's own docstring). Authoring against `02f0f4296350` would silently recreate a multi-head history.
- Additive-only migration discipline: nullable columns, `server_default` for the one NOT NULL column (`emergent`), no drops, no narrowing, no destructive backfill.

### 3.2 CI/CD & engineering discipline
- **Trunk-friendly, small units.** DB-1 (enum widen) and DB-2 (columns + migration) are each an atomic, self-reviewable commit; the branch stays green after each.
- **Every unit is independently revertible.** Reverting DB-2's commit removes the migration file; reverting DB-1 removes the enum members. Note: DB-2's migration references the DB-1 enum only in commentary, not in a runtime dependency (VARCHAR column accepts any string) — see Dependencies in §6.
- **Additive & backward-compatible first.** All new columns are nullable or defaulted; the enum widening only adds accepted string values to an existing VARCHAR(16) column. The branch is deployable (migratable) at every commit.
- **Gates before merge** (must pass in CI, in this order): lint → format → type-check → unit tests (§8) → build. Exact commands for this layer (confirmed present in `api-backend/pyproject.toml`: `[tool.ruff]`, `[tool.pytest.ini_options]`, `[tool.mypy]`):
  ```bash
  ruff check . && ruff format --check . && mypy app && pytest -q
  ```
- **No secrets, no manual steps in the merge path.** Applying the migration to the live `portal` DB is a human-owned gate, called out in the execution schedule — never silently baked into a unit or run against `portal` from an agent session.
- **Reversibility documented** (§9): purely additive; no destructive down-step.

---

## 4. Architecture (level 1 of 3)

**Target layout:**
```
api-backend/app/models/onboarding.py        # AllotRdmpStatus widened, ClientAllotmentRedemption widened
api-backend/alembic/versions/
  deb8fd8a60b6_0021_neutralize_recovered_head.py   # existing head (no-op), unchanged
  <new_hex>_0022_allotment_redemption_approval_columns.py   # NEW — this layer's single revision
```

**Dependency direction:** the new Alembic revision depends only on `deb8fd8a60b6` (down_revision). The ORM model changes (`onboarding.py`) and the migration are authored together in this layer; no other module in the codebase needs to change for this layer's scope.

**External seams:** writes/reads the `client_allotment_redemptions` table and the `AllotRdmpStatus` VARCHAR(16) column. Exposes the widened enum values and the 4 new columns to the Backend layer per the frozen seam (§7). Reads nothing from Backend/Frontend.

---

## 5. Modules (level 2 of 3)

### 5.1 `onboarding models` (`app/models/onboarding.py`)
- **Responsibility:** ORM definitions for onboarding-adjacent tables, including the allotment/redemption record and its status enum.
- **Files:** `api-backend/app/models/onboarding.py`.
- **Public surface:** `AllotRdmpStatus` enum, `ClientAllotmentRedemption` model class — imported by the Backend layer's service/router code.
- **Owns features:** DB-1, DB-2.

### 5.2 `alembic migration` (`app/../alembic/versions/`)
- **Responsibility:** the single schema-migration revision that brings a live/scratch DB from `deb8fd8a60b6` to include DB-2's new columns.
- **Files:** `api-backend/alembic/versions/<new_hex>_0022_allotment_redemption_approval_columns.py`.
- **Public surface:** `upgrade()` / `downgrade()`, `revision = "<new_hex>"`, `down_revision = "deb8fd8a60b6"`.
- **Owns features:** DB-2.

---

## 6. Features (level 3 of 3 — the work units)

### DB-1 — Widen `AllotRdmpStatus` enum (MANDATORY)

- **Proposal ref:** § "Layer 1 — Database" B-1; § 4.1 (frozen seam enum block)
- **Module:** 5.1 `onboarding models`
- **Files:** `modify: api-backend/app/models/onboarding.py`
- **Dependencies:** none — parallel-safe with DB-2 at the Python level; DB-2's migration file references this enum only in its own commentary.

**Contract (required code):**

```python
class AllotRdmpStatus(str, enum.Enum):
    PENDING = "pending"
    ACKNOWLEDGED = "acknowledged"
    # NEW (proposal 016, B-1):
    AWAITING_PC = "awaiting_pc"   # redemption submitted, needs PC approval
    AWAITING_CO = "awaiting_co"   # redemption submitted, needs Compliance approval (amount > $300k)
    APPROVED = "approved"         # redemption fully approved, took effect
    REJECTED = "rejected"         # redemption rejected by PC or CO
```

The existing `status` column mapping (`SAEnum(AllotRdmpStatus, native_enum=False, length=16, values_callable=lambda e: [m.value for m in e])`) is unchanged — it already accepts any string the enum produces, up to length 16. No column-definition edit is needed beyond the enum class itself.

**Behavior / invariants:** all 6 members remain distinct string values ≤ 16 chars (longest new value is `"awaiting_pc"` / `"awaiting_co"` at 11 chars — well under the VARCHAR(16) limit). Existing rows with `pending`/`acknowledged` are unaffected — no rewrite needed since this is additive to the accepted value set, not a column type change.

**Done when:** `AllotRdmpStatus` has exactly 6 members (2 existing + 4 new) with the exact string values above; `ClientAllotmentRedemption.status` still type-checks and the model imports cleanly.

---

### DB-2 — Add approval-tracking columns to `client_allotment_redemptions` (MANDATORY)

- **Proposal ref:** § "Layer 1 — Database" B-2; § 4.2 (Database row of the per-layer obligations table)
- **Module:** 5.1 `onboarding models`, 5.2 `alembic migration`
- **Dependencies:** none — parallel-safe with DB-1. (Both units typically land as sequential commits on the same branch since they touch the same file, but neither's *logic* depends on the other.)

**Contract (required code — ORM):**

```python
class ClientAllotmentRedemption(Base):
    __tablename__ = "client_allotment_redemptions"

    # ... existing columns unchanged ...

    # NEW (proposal 016, B-2):
    reject_reason: Mapped[str | None] = mapped_column(String(512), nullable=True)
    decided_by: Mapped[str | None] = mapped_column(String(128), nullable=True)  # firebase_uid of PC/CO
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    emergent: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
```

**Contract (required code — Alembic revision):**

```python
"""0022 allotment redemption approval columns

Revision ID: <new_hex>
Revises: deb8fd8a60b6
Create Date: 2026-07-22 00:00:00.000000

Adds 4 additive columns to client_allotment_redemptions supporting the
redemption approval workflow (proposal 016, Layer 1 findings B-1/B-2).
Purely additive: all new columns nullable or defaulted, no drops, no
type narrowing, no data migration. AllotRdmpStatus is widened in the
same change set (app/models/onboarding.py) — a VARCHAR(16)-backed,
native_enum=False column, so no enum-type ALTER is required here.

down_revision is deb8fd8a60b6 (0021_neutralize_recovered_head) per the
branch-hygiene rule established there: every new migration must rebase
against deb8fd8a60b6, never 02f0f4296350 directly.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "<new_hex>"
down_revision: Union[str, Sequence[str], None] = "deb8fd8a60b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "client_allotment_redemptions",
        sa.Column("reject_reason", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "client_allotment_redemptions",
        sa.Column("decided_by", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "client_allotment_redemptions",
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "client_allotment_redemptions",
        sa.Column(
            "emergent",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("client_allotment_redemptions", "emergent")
    op.drop_column("client_allotment_redemptions", "decided_at")
    op.drop_column("client_allotment_redemptions", "decided_by")
    op.drop_column("client_allotment_redemptions", "reject_reason")
```

**Behavior / invariants:**
- `reject_reason`, `decided_by`, `decided_at` are all nullable — existing rows get `NULL` on upgrade, no backfill.
- `emergent` is `NOT NULL` but carries a `server_default` of `false`, so existing rows are populated by the DB engine at `ALTER TABLE` time without an app-level backfill step.
- The revision must apply cleanly starting from `deb8fd8a60b6` — not from `02f0f4296350`. Verify with `alembic history` showing `<new_hex>` as the sole head after this change.
- No existing column is touched, dropped, or narrowed.

**Done when:** `alembic upgrade head` (from a DB stamped at `deb8fd8a60b6`) succeeds and `client_allotment_redemptions` has the 4 new columns with the exact types/nullability above; `alembic downgrade -1` from the new head succeeds and removes exactly those 4 columns; `alembic history` shows a single linear head.

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal § 4.1 / § 4.2)

```python
# --- Enums (DB layer, consumed by all) ---

class AllotRdmpStatus(str, Enum):
    PENDING      = "pending"       # existing
    ACKNOWLEDGED = "acknowledged"  # existing
    # NEW:
    AWAITING_PC  = "awaiting_pc"   # redemption submitted, needs PC approval
    AWAITING_CO  = "awaiting_co"   # redemption submitted, needs Compliance approval (amount > $300k)
    APPROVED     = "approved"      # redemption fully approved, took effect
    REJECTED     = "rejected"      # redemption rejected by PC or CO

# --- Request DTOs (Frontend → Backend) ---

class SubmitAllotmentReq(BaseModel):
    client_id: uuid.UUID
    model_id: uuid.UUID
    multiplier: Decimal            # number of units
    expected_cash_in: date | None  # settlement date (nullable)
    # fee overrides — only populated for new-subscription mode
    mgmt_fee: Decimal | None = None
    incentive_fee: Decimal | None = None

class SubmitRedemptionReq(BaseModel):
    client_id: uuid.UUID
    model_id: uuid.UUID
    multiplier: Decimal            # units to redeem
    expected_cash_out: date | None # settlement date
    emergent: bool = False         # emergent big redemption flag

# --- Response DTOs (Backend → Frontend) ---
# Reuses existing AllotRdmptDTO (onboarding/schemas.py) — no new shape needed.
# The `status` field now includes the new enum values above.

# --- Approval request DTO ---
class RedemptionDecisionReq(BaseModel):
    verdict: Literal["approve", "reject"]
    reason: str | None = None      # required when verdict == "reject"

# --- Routes ---
# POST /api/onboarding/rm/allotment          → AllotRdmptDTO   (201)
# POST /api/onboarding/rm/redemption         → AllotRdmptDTO   (201)
# POST /api/onboarding/pc/redemptions/{id}/decide   → AllotRdmptDTO   (200)
# POST /api/onboarding/co/redemptions/{id}/decide   → AllotRdmptDTO   (200)
#
# Error codes: 404 (not found), 409 (wrong status), 422 (validation)
```

| Layer | What this layer contributes | What this layer assumes from the other side |
|---|---|---|
| Database | Widens `AllotRdmpStatus` enum with 4 new values; adds `reject_reason`, `decided_by`, `decided_at` columns to `client_allotment_redemptions`; adds `emergent` boolean column | Backend only writes valid enum values |
| Backend | Serves the 4 routes above; allotment immediately upserts `client_subscriptions` + inserts `client_allotment_redemptions` (status=`pending`); redemption inserts with status=`awaiting_pc` (or `awaiting_co` if amount > $300k); approval endpoints transition status and (on final approve) upsert `client_subscriptions` | DB columns from § 4.1 are present; Frontend sends DTOs exactly as specified |
| Frontend | Calls POST endpoints on modal submit; renders new statuses in TxnTable with appropriate chips; disables modal submit while in-flight | Backend returns AllotRdmptDTO exactly as in § 4.1 with the new status values |

### 7.2 How this layer honours the seam
- **What this layer contributes to the seam:** persists the 6-member `AllotRdmpStatus` enum as VARCHAR(16) values on `client_allotment_redemptions.status`; persists `reject_reason`, `decided_by`, `decided_at`, `emergent` as nullable/defaulted columns on the same table — the physical storage the Backend layer's approval endpoints read/write.
- **What this layer assumes from the other side:** the Backend layer writes only the 6 documented string values into `status` and never writes a string longer than 16 characters; the Backend layer is responsible for all state-machine transition logic (this layer imposes no CHECK constraint on valid transitions).
- **Change protocol:** any edit to § 7 requires editing the proposal first; this section is then re-copied. Never edit § 7 in isolation.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Framework / runner:** pytest — command: `pytest -q` (run from `api-backend/`).
- **Fixtures / seed:** an isolated, disposable test/scratch database (e.g. SQLite in-memory or a throwaway MySQL/MariaDB schema created and torn down by the test fixture), or a MySQL connection wrapped in a transaction that is rolled back at test end. **Invariant: tests in this layer NEVER connect to, migrate, or write to the live `portal` database.** No test may leave persisted rows behind — either the DB is ephemeral (in-memory/throwaway schema, destroyed after the run) or every test's transaction is rolled back, never committed.
- **Isolation:** hermetic, no shared external state; safe to run in parallel in CI.
- **Layer isolation (critical):** tests import only from `api-backend/app/models/onboarding.py`, the new Alembic revision module, and Alembic/SQLAlchemy test tooling. No Backend service/router code or Frontend code is imported or assumed present.
- **Test location:** `api-backend/tests/` (git-ignored), mirroring `app/models/onboarding.py` and the migration path.
- **Commit policy:** tests are never committed. `tests/` is git-ignored.
- **Code generation:** concrete test code is written by the `test-gen` skill (arg: `lite` | `standard` | `thorough`) from the goals below.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| DB-1 | Enum has exactly 6 members with the exact string values; each value is ≤ 16 chars; enum still binds correctly through the existing `SAEnum(native_enum=False, length=16, ...)` column mapping | none |
| DB-2 | Migration applies cleanly on top of `deb8fd8a60b6`; adds exactly the 4 documented columns with correct nullability/defaults; downgrade removes exactly those 4 columns; existing rows survive the upgrade unaffected | none |

### 8.3 Test goals (per unit)

#### DB-1
- **Positive:** `AllotRdmpStatus` exposes `PENDING`, `ACKNOWLEDGED`, `AWAITING_PC`, `AWAITING_CO`, `APPROVED`, `REJECTED` with values `"pending"`, `"acknowledged"`, `"awaiting_pc"`, `"awaiting_co"`, `"approved"`, `"rejected"` respectively. Constructing/persisting a `ClientAllotmentRedemption` row with `status=AllotRdmpStatus.AWAITING_PC` (in a scratch DB) round-trips correctly on read-back.
- **Negative:** an out-of-set string (e.g. `"bogus_status"`) assigned directly to the column is not one of the enum's valid Python values — a test asserts the enum rejects construction from an unknown member name/value where the codebase relies on `AllotRdmpStatus(value)` conversions.
- **Invariants:** every member's `.value` length is ≤ 16 (the column's VARCHAR length) regardless of future additions review; enum member set is stable in ordering-independent equality checks used by the Backend layer's status-branching logic (out of scope here, but the enum's `str` mixin must keep `==` comparison against plain strings working, e.g. `AllotRdmpStatus.PENDING == "pending"`).
- **Seam mocks:** none — this unit has no sibling-layer dependency.

#### DB-2
- **Positive:** running `alembic upgrade head` against a scratch DB stamped at `deb8fd8a60b6` succeeds and leaves `client_allotment_redemptions` with `reject_reason` (VARCHAR(512), nullable), `decided_by` (VARCHAR(128), nullable), `decided_at` (DATETIME, nullable), `emergent` (BOOLEAN, NOT NULL, default false). A row inserted before the upgrade (with only pre-existing columns populated) is still readable after upgrade, with the 4 new columns showing `NULL`/`false` as appropriate.
- **Negative:** attempting to insert a row without providing `emergent` does not fail (server default fills it); attempting to author the revision with `down_revision = "02f0f4296350"` is flagged in review — a test can assert the revision file's `down_revision` constant equals exactly `"deb8fd8a60b6"`.
- **Invariants:** `alembic downgrade -1` from the new head then `alembic upgrade head` again is idempotent (schema ends identical); no pre-existing column's type/nullability changes; `alembic history` shows one linear chain with no branch point.
- **Seam mocks:** none.

### 8.4 Aggregate gate
- All unit tests green is a local gate run before commit/PR hand-off (§3.2). Tests are git-ignored and never committed.
- Target coverage for changed lines: ≥ 90% of new/changed statements in this layer (the enum block and the migration's `upgrade`/`downgrade` bodies).
- Chosen `test-gen` level for this layer: `standard` (happy path + main negative + precondition check per unit) — this is a small, low-branching layer; `thorough` is not warranted.

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] DB-1 and DB-2 committed on `allotment-redemption-integration-db`; each commit left the branch green.
- [ ] §8 unit tests all pass against a scratch/ephemeral DB or rolled-back transaction — never against the live `portal` DB; CI gate (§3.2) green.
- [ ] §7 matches the proposal's frozen seam verbatim. Checked against the proposal on the parent branch, not against the BE/FE layers' branches.
- [ ] New migration's `down_revision` is confirmed `"deb8fd8a60b6"` (not `"02f0f4296350"`) by inspection of the revision file.
- [ ] PR opened against `allotment-redemption-integration`; human owns the merge and owns the separate, explicit step of applying the migration to the live `portal` DB.

**Rollback:** Purely additive — no destructive step. `alembic downgrade` on the new revision drops exactly the 4 new columns (`reject_reason`, `decided_by`, `decided_at`, `emergent`); no other column is touched. The 4 new `AllotRdmpStatus` enum values are additive to a VARCHAR(16) column with no CHECK constraint enforcing the value set at the DB level — a downgrade does not need to (and cannot cleanly) strip a status string already written to a row. If a redemption row was written with a new status value (e.g. `awaiting_pc`) before a downgrade, that row is simply un-representable/unrecognized by old (pre-016) application code — it is not corrupted, and no data is lost. The pre-work backup `api-backend/db-backups/portal_pre-016_2026-07-22.sql` remains the full-restore fallback if ever needed, and must not be modified by this layer's work.
