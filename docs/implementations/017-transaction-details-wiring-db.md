# 017 — Transaction Details Wiring · Implementation Details — Database

> Status: **DRAFT — pending implementation.**
> Implements: proposal `docs/proposals/017-2026-07-24-transaction-details-wiring.md` § "Layer 1 — Database" (finding B-1, plus the frozen seam in § 4.1/4.2)
> Layer: Database — **one layer per file.**
> Sibling layer docs: `docs/implementations/017-transaction-details-wiring-be.md`, `docs/implementations/017-transaction-details-wiring-fe.md`
> Execution schedule: `docs/execution-schedules/017-transaction-details-wiring-db.md`
> Branch: `transaction-details-wiring-db`
> Builds on / prerequisites: migration `a4d8e2f6b391` (`0024_onboarding_document_upload_tracking`) — the current, single Alembic head (verified via `alembic heads` → `a4d8e2f6b391 (head)`, no branch point).

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/017-2026-07-24-transaction-details-wiring.md` § "Layer 1 — Database" (B-1), § 4.1/4.2 (frozen seam) |
| Execution schedule | `docs/execution-schedules/017-transaction-details-wiring-db.md` |
| Sibling layer impl docs | `docs/implementations/017-transaction-details-wiring-be.md`, `docs/implementations/017-transaction-details-wiring-fe.md` |
| Builds on | Migration `a4d8e2f6b391` (0024_onboarding_document_upload_tracking) — current head |

---

## 2. Branch & session contract

- **Branch:** `transaction-details-wiring-db`, cut from parent `transaction-details-wiring` (captured via `git rev-parse --abbrev-ref HEAD` at session start).
- **Isolation:** implementable in a separate session on its own branch, in parallel with the BE/FE layer branches, provided the preconditions below hold. Shares state with sibling layers only through the pinned contract in §7.
- **Preconditions (must be true before starting):**
  - [ ] Migration `a4d8e2f6b391` (0024_onboarding_document_upload_tracking) is the current Alembic head on `main`/the parent branch (`alembic heads` → `a4d8e2f6b391 (head)`).
  - [ ] The frozen seam in the proposal § 4.1/4.2 is agreed — §7 below is a verbatim copy, not a negotiation with a sibling layer.
- **Read-first inventory:**
  - `api-backend/app/models/onboarding.py` — contains `ClientAllotmentRedemption` (the FK target for the new table) and is where the new `TransactionDetail` model class is added, alongside it.
  - `api-backend/alembic/versions/a4d8e2f6b391_0024_onboarding_document_upload_tracking.py` — confirms the current head and the required `down_revision` for the new migration.
  - `api-backend/alembic/versions/9c4a1e7d2b3f_0023_allotment_redemption_expected_cash_out.py` — the most recent precedent for a small, additive, single-table migration in this same area (docstring style, `Union[str, Sequence[str], None]` typing convention).
- **Hand-off / exit signal:** DB-1 committed on `transaction-details-wiring-db`; a single new Alembic revision applies cleanly (`upgrade`/`downgrade`) on top of `a4d8e2f6b391` against a scratch DB; unit tests (§8) green; PR opened against `transaction-details-wiring`.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- ORM style: SQLAlchemy 2.0 `Mapped`/`mapped_column`, as used throughout `api-backend/app/models/onboarding.py`.
- New tables are `class X(Base): __tablename__ = "..."` classes placed in the domain-relevant existing models file — `onboarding.py` already owns `ClientAllotmentRedemption`, so the new 1:1-child table is added to the same file, immediately after it, rather than a new module (mirrors how `ClientEvent` sits in the same file as its "parent" concept).
- Migrations live under `api-backend/alembic/versions/`, one file per revision, named `<revision>_<NNNN>_<slug>.py`.
- **Revision IDs are random hex, never hand-invented.** Generate with:
  ```bash
  python -c "import secrets; print(secrets.token_hex(6))"
  ```
- **Hard constraint (DB-safety):** the new revision's `down_revision` MUST be `"a4d8e2f6b391"` — the current, sole Alembic head. Verify with `alembic heads` before authoring the revision file; if a sibling branch has since added a new head, rebase against that instead of guessing.
- Additive-only migration discipline: this migration creates one brand-new table — no existing table, column, or constraint is touched.
- FK + UNIQUE convention: a 1:1 child table (transaction details belonging to exactly one allotment/redemption row) is expressed as a FK column carrying `unique=True`, not a separate `UniqueConstraint` — matches the existing precedent at `ClientAllotmentRedemption.source_onboarding_id` (`app/models/onboarding.py:239-244`, FK + `unique=True` for the same "at most one" invariant).

### 3.2 CI/CD & engineering discipline
- **Trunk-friendly, small units.** DB-1 is a single atomic, self-reviewable commit (new model class + new migration file); the branch stays green after it.
- **Every unit is independently revertible.** Reverting DB-1 drops the migration file and the model class together — no other table or column is affected.
- **Additive & backward-compatible first.** The entire change is a new table; no existing schema object changes. The branch is deployable (migratable) at every commit.
- **Gates before merge** (must pass in CI, in this order): `lint → format → type-check → unit tests (§8) → build`. Exact commands for this layer (confirmed present in `api-backend/pyproject.toml`: `[tool.ruff]`, `[tool.pytest.ini_options]`, `[tool.mypy]`):
  ```bash
  ruff check . && ruff format --check . && mypy app && pytest -q
  ```
- **No secrets, no manual steps in the merge path.** Applying the migration to the live `portal` DB is a human-owned gate, called out in the execution schedule — never silently baked into a unit or run against `portal` from an agent session.
- **Reversibility documented** (§9): purely additive; no destructive down-step.

---

## 4. Architecture (level 1 of 3)

**Target layout:**
```
api-backend/app/models/onboarding.py        # NEW: TransactionDetail class, added after ClientAllotmentRedemption
api-backend/alembic/versions/
  a4d8e2f6b391_0024_onboarding_document_upload_tracking.py   # existing head, unchanged
  <new_hex>_0025_transaction_details.py                        # NEW — this layer's single revision
```

**Dependency direction:** the new Alembic revision depends only on `a4d8e2f6b391` (down_revision). `TransactionDetail` has a one-directional FK to `ClientAllotmentRedemption` (`transaction_details.allotment_id → client_allotment_redemptions.id`); `ClientAllotmentRedemption` does not need a reciprocal ORM relationship for this proposal's scope (the Backend layer looks up settlement rows by `allotment_id`, not via a SQLAlchemy `relationship()` traversal).

**External seams:** creates and owns the `transaction_details` table. Exposes its 9 columns to the Backend layer per the frozen seam (§7). Reads nothing from Backend/Frontend; the FK constraint reads `client_allotment_redemptions.id` only for referential integrity, not as a query dependency.

---

## 5. Modules (level 2 of 3)

### 5.1 `onboarding models` (`app/models/onboarding.py`)
- **Responsibility:** ORM definitions for onboarding-adjacent tables — extended to include the transaction-detail audit record for a filed allotment/redemption.
- **Files:** `api-backend/app/models/onboarding.py`.
- **Public surface:** `TransactionDetail` model class — imported by the Backend layer's service/repository code.
- **Owns features:** DB-1.

### 5.2 `alembic migration` (`app/../alembic/versions/`)
- **Responsibility:** the single schema-migration revision that brings a live/scratch DB from `a4d8e2f6b391` to include the new `transaction_details` table.
- **Files:** `api-backend/alembic/versions/<new_hex>_0025_transaction_details.py`.
- **Public surface:** `upgrade()` / `downgrade()`, `revision = "<new_hex>"`, `down_revision = "a4d8e2f6b391"`.
- **Owns features:** DB-1.

---

## 6. Features (level 3 of 3 — the work units)

### DB-1 — Create `transaction_details` table (Yes — user req.)

- **Proposal ref:** § "Layer 1 — Database" B-1; § 4.1 (frozen seam table definition)
- **Module:** 5.1 `onboarding models`, 5.2 `alembic migration`
- **Files:** `modify: api-backend/app/models/onboarding.py`, `create: api-backend/alembic/versions/<new_hex>_0025_transaction_details.py`
- **Dependencies:** none — parallel-safe; this is the only DB unit in this layer.

**Contract (required code — ORM):**

```python
# app/models/onboarding.py — added immediately after ClientAllotmentRedemption

class TransactionDetail(Base):
    __tablename__ = "transaction_details"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    # 1:1 with client_allotment_redemptions — UNIQUE is load-bearing (file-once,
    # audit-immutable). Mirrors the FK+unique convention already used for
    # ClientAllotmentRedemption.source_onboarding_id (this same file, above).
    allotment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("client_allotment_redemptions.id"),
        nullable=False,
        unique=True,
    )
    bank_account: Mapped[str] = mapped_column(String(64), nullable=False)
    settlement_amount: Mapped[Decimal] = mapped_column(Numeric(28, 10), nullable=False)
    transaction_date: Mapped[date] = mapped_column(Date, nullable=False)
    transaction_time: Mapped[time] = mapped_column(Time, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)  # ISO 4217
    reference_no: Mapped[str | None] = mapped_column(String(64), nullable=True)
    filed_by: Mapped[str] = mapped_column(String(128), nullable=False)  # firebase_uid of the RM
    filed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
```

`date`, `time` (stdlib) must be added to this file's existing `datetime` import line (currently `from datetime import datetime` — widen to `from datetime import date, datetime, time`).

**Contract (required code — Alembic revision):**

```python
"""0025 transaction details

Revision ID: <new_hex>
Revises: a4d8e2f6b391
Create Date: 2026-07-24 00:00:00.000000

Creates transaction_details, a 1:1 audit-record child table of
client_allotment_redemptions (proposal 017, Layer 1 finding B-1). Purely
additive: one new table, no existing table/column touched. The UNIQUE
constraint on allotment_id is the DB-level guarantee that settlement
details are filed at most once per allotment/redemption row (audit
immutability -- see the model's own docstring).

down_revision is a4d8e2f6b391 (0024_onboarding_document_upload_tracking),
the current sole Alembic head at authoring time (verified via
`alembic heads`).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "<new_hex>"
down_revision: Union[str, Sequence[str], None] = "a4d8e2f6b391"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "transaction_details",
        sa.Column("id", sa.CHAR(length=36), nullable=False),
        sa.Column("allotment_id", sa.CHAR(length=36), nullable=False),
        sa.Column("bank_account", sa.String(length=64), nullable=False),
        sa.Column("settlement_amount", sa.Numeric(precision=28, scale=10), nullable=False),
        sa.Column("transaction_date", sa.Date(), nullable=False),
        sa.Column("transaction_time", sa.Time(), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("reference_no", sa.String(length=64), nullable=True),
        sa.Column("filed_by", sa.String(length=128), nullable=False),
        sa.Column(
            "filed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["allotment_id"], ["client_allotment_redemptions.id"]),
        sa.UniqueConstraint("allotment_id"),
    )


def downgrade() -> None:
    op.drop_table("transaction_details")
```

**Behavior / invariants:**
- `allotment_id` is `NOT NULL` + `UNIQUE` + FK — a second insert attempt for the same allotment raises an `IntegrityError`, which is the DB-level backstop behind the Backend layer's own 409 idempotency check (Backend BE-1).
- `bank_account`, `settlement_amount`, `transaction_date`, `transaction_time`, `currency`, `filed_by`, `filed_at` are all `NOT NULL` — the Backend layer is responsible for populating every one of them in a single insert (no partial-row state is representable).
- `reference_no` is the only nullable detail column, matching the frontend form's own "optional" field.
- `filed_at` carries a `server_default` of `CURRENT_TIMESTAMP`, but the Backend layer is expected to also set it explicitly at insert time (matching the existing convention of setting `created_at`-style timestamps in Python, e.g. `ClientAllotmentRedemption.created_at`'s `server_default=func.now()` alongside app-level `datetime.utcnow()` usage elsewhere) — the server default exists as a safety net, not the primary write path.
- The revision must apply cleanly starting from `a4d8e2f6b391`. Verify with `alembic history` showing `<new_hex>` as the sole head after this change.
- No existing table, column, or constraint is touched, dropped, or narrowed.

**Done when:** `alembic upgrade head` (from a DB stamped at `a4d8e2f6b391`) succeeds and creates `transaction_details` with the 9 columns/types/nullability above, the FK to `client_allotment_redemptions.id`, and the UNIQUE constraint on `allotment_id`; `alembic downgrade -1` from the new head succeeds and drops the table entirely; `alembic history` shows a single linear head.

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal § 4.1)

```python
# ─── New table ───────────────────────────────────────────────
# transaction_details  (1:1 with client_allotment_redemptions)
#   id               UUID PK
#   allotment_id     UUID FK → client_allotment_redemptions.id, UNIQUE
#   bank_account     String(64)      NOT NULL
#   settlement_amount Numeric(28,10) NOT NULL
#   transaction_date Date            NOT NULL
#   transaction_time Time            NOT NULL
#   currency         String(3)       NOT NULL  (ISO 4217)
#   reference_no     String(64)      NULL
#   filed_by         String(128)     NOT NULL  (firebase_uid of RM)
#   filed_at         DateTime(tz)    NOT NULL  (server-set)

# ─── POST /api/onboarding/rm/allotments/{allotment_id}/transaction-detail ───
class TransactionDetailRequest(BaseModel):
    bank_account: str              # max 64 chars, required
    settlement_amount: Decimal     # required, positive
    transaction_date: date         # required (ISO 8601 date)
    transaction_time: time         # required (HH:MM or HH:MM:SS)
    currency: str                  # required, one of: USD, CHF, AUD, GBP, EUR, CAD, HKD
    reference_no: str | None       # optional, max 64 chars

# Response: 201 Created → TransactionDetailDTO

class TransactionDetailDTO(BaseModel):
    id: uuid.UUID
    allotment_id: uuid.UUID
    bank_account: str
    settlement_amount: float
    transaction_date: date
    transaction_time: time
    currency: str
    reference_no: str | None
    filed_by: str
    filed_at: datetime

# ─── GET /api/onboarding/rm/allotments/{allotment_id}/transaction-detail ───
# Response: 200 → TransactionDetailDTO
# Response: 404 → no settlement filed yet

# ─── AllotRdmptDTO widened ───
class AllotRdmptDTO(BaseModel):
    # ... existing fields ...
    has_transaction_detail: bool = False    # True when a transaction_details row exists

# ─── Errors (POST) ───
# 404  — allotment_id not found or not owned by requesting RM's clients
# 409  — transaction details already filed (immutable — file once)
# 422  — validation failure (bad currency, negative amount, etc.)
# 403  — caller lacks RM role or row is not in an eligible status
```

| Layer | What this layer contributes | What this layer assumes from the other side |
|---|---|---|
| Database | `transaction_details` table with UNIQUE FK to `client_allotment_redemptions.id`; all detail columns NOT NULL except `reference_no` | Backend only writes validated values (currency in enum range, amount positive, date/time valid) |
| Backend | Serves POST + GET at `/rm/allotments/{allotment_id}/transaction-detail` with role guard (RM) and status guard (confirmed/approved on POST). Returns `TransactionDetailDTO`. Adds `has_transaction_detail` to `AllotRdmptDTO`. | DB table exists. Frontend sends `TransactionDetailRequest` shape exactly. |
| Frontend | Calls POST on Save, calls GET on click when `has_transaction_detail` is true, renders view-only panel for filed records. | Backend returns `has_transaction_detail` on `AllotRdmptDTO` and `TransactionDetailDTO` on the GET endpoint. |

### 7.2 How this layer honours the seam
- **What this layer contributes to the seam:** persists the `transaction_details` table exactly as specified — 9 columns, the UNIQUE FK to `client_allotment_redemptions.id` — the physical storage the Backend layer's POST/GET endpoints read/write.
- **What this layer assumes from the other side:** the Backend layer only ever inserts a row after validating `TransactionDetailRequest` (currency in the 7-member enum, amount positive, date/time well-formed); the Backend layer never attempts a second insert for the same `allotment_id` (relies on the UNIQUE constraint as a backstop, not a substitute for its own 409 check).
- **Change protocol:** any edit to § 7 requires editing the proposal first; this section is then re-copied. Never edit § 7 in isolation.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Framework / runner:** pytest — command: `pytest -q` (run from `api-backend/`).
- **Fixtures / seed:** an isolated, disposable test/scratch database (in-memory SQLite or a throwaway MySQL/MariaDB schema), created and torn down by the test fixture. **Invariant: tests in this layer NEVER connect to, migrate, or write to the live `portal` database.**
- **Isolation:** hermetic, no shared external state; safe to run in parallel in CI.
- **Layer isolation (critical):** tests import only from `api-backend/app/models/onboarding.py`, the new Alembic revision module, and Alembic/SQLAlchemy test tooling. No Backend service/router code or Frontend code is imported or assumed present.
- **Test location:** `api-backend/tests/` (git-ignored), mirroring `app/models/onboarding.py` and the migration path.
- **Commit policy:** tests are never committed. `tests/` is git-ignored.
- **Code generation:** concrete test code is written by the `test-gen` skill (arg: `lite` | `standard` | `thorough`) from the goals below.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| DB-1 | Migration applies cleanly on top of `a4d8e2f6b391`; creates `transaction_details` with the exact 9 columns/types/nullability; FK + UNIQUE on `allotment_id` enforced; downgrade drops the table cleanly | none |

### 8.3 Test goals (per unit)

#### DB-1
- **Positive:** running `alembic upgrade head` against a scratch DB stamped at `a4d8e2f6b391` succeeds and creates `transaction_details` with columns `id` (PK), `allotment_id` (FK, UNIQUE, NOT NULL), `bank_account`/`settlement_amount`/`transaction_date`/`transaction_time`/`currency`/`filed_by`/`filed_at` (NOT NULL), `reference_no` (nullable). Inserting one row referencing a real `client_allotment_redemptions.id` succeeds and round-trips correctly on read-back via the `TransactionDetail` ORM class.
- **Negative:** inserting a second row with the same `allotment_id` raises `IntegrityError` (UNIQUE violation); inserting a row with a non-existent `allotment_id` raises `IntegrityError` (FK violation); omitting any NOT NULL column (e.g. `bank_account`) raises an error at flush/commit time.
- **Invariants:** `alembic downgrade -1` from the new head then `alembic upgrade head` again is idempotent (schema ends identical); no pre-existing table is touched; `alembic history` shows one linear chain with no branch point.
- **Seam mocks:** none.

### 8.4 Aggregate gate
- All unit tests green is a local gate run before commit / PR hand-off (§3.2). Tests are git-ignored and never committed.
- Target coverage for changed lines: ≥ 90% of new/changed statements in this layer (the model class and the migration's `upgrade`/`downgrade` bodies).
- Chosen `test-gen` level for this layer: `standard` (happy path + main negative + precondition check) — a small, single-table, low-branching layer; `thorough` is not warranted.

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] DB-1 committed on `transaction-details-wiring-db`; the commit left the branch green.
- [ ] §8 unit tests all pass against a scratch/ephemeral DB — never against the live `portal` DB; CI gate (§3.2) green.
- [ ] §7 matches the proposal's frozen seam verbatim. Checked against the proposal on the parent branch, not against the BE/FE layers' branches.
- [ ] New migration's `down_revision` is confirmed `"a4d8e2f6b391"` by inspection of the revision file.
- [ ] PR opened against `transaction-details-wiring`; human owns the merge and owns the separate, explicit step of applying the migration to the live `portal` DB.

**Rollback:** Purely additive — no destructive step. `alembic downgrade` on the new revision drops the entire `transaction_details` table; no other table or column is touched. Any transaction details already filed and persisted in the live DB before a rollback are lost when the table is dropped — this is acceptable per the proposal (transaction-detail filing does not gate any allotment/redemption status transition), but should be noted to the human before the downgrade is applied to a DB with real filed data.
