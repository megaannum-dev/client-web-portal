# 013 — Client Onboarding Integration · Implementation Details — Database

> Status: **DRAFT — pending implementation.**
> Implements: `docs/proposals/013-2026-07-19-client-onboarding-integration.md` § Layer 1 — Database, § 4 (Cross-layer seam)
> Layer: Database — **one layer per file.**
> Sibling layer docs: `docs/implementations/013-client-onboarding-integration-be.md`, `docs/implementations/013-client-onboarding-integration-fe.md`
> Execution schedule: `docs/execution-schedules/013-client-onboarding-integration-db.md`
> Branch: `client-onboarding-integration-db` — cut from `client-onboarding-integration` (the parent branch already exists and is checked out today). Merges back into the parent; the human owns that merge.
> Builds on / prerequisites: Alembic head `817926e7604a` (`api-backend/alembic/versions/817926e7604a_0017_auth_status_columns.py`) — proposal 004 rework, merged into main. `users`, `client_profiles`, `admin_profiles`, `models`, `client_subscriptions` all already exist.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/013-2026-07-19-client-onboarding-integration.md` § Layer 1 — Database, § 4 (Cross-layer seam) |
| Execution schedule | `docs/execution-schedules/013-client-onboarding-integration-db.md` |
| Sibling layer impl docs | `docs/implementations/013-client-onboarding-integration-be.md`, `docs/implementations/013-client-onboarding-integration-fe.md` |
| Builds on | Alembic head `817926e7604a`; proposal 004 rework (`users.status`/`authorized_by`) |

---

## 2. Branch & session contract

- **Branch:** `client-onboarding-integration-db`, cut from `client-onboarding-integration`.
- **Isolation:** fully independent of the BE/FE layer branches — this layer only adds tables, adds two nullable columns to an existing table, and one migration; nothing here imports application code.
- **Preconditions:**
  - [ ] `alembic heads` on the target DB reports `817926e7604a`.
  - [ ] The frozen seam in the proposal (§ 4) is agreed — § 7 below is a verbatim copy, not a renegotiation.
- **Read-first inventory:**
  - `api-backend/app/models/pc.py` — `ClientSubscription` (`client_subscriptions`, composite PK `(user_id, model_id)`, gains the two override columns — DB-5); `Model` (`models`, read for `id`/`model_size`/`mgmt_fee`/`incentive_fee` — FK target and the fee-default comparison the Backend layer performs at approve, not this layer's concern but the reason the two override columns exist).
  - `api-backend/app/models/users.py` — `User` (`users.id` PK, `users.status`/`authorized_by` — FK target for `client_onboardings.user_id`, `onboarding_documents` and `client_events` route through it too); `ClientProfile` (unaffected — stays the client's identity/KYC home).
  - `api-backend/app/models/__init__.py` — the re-export block this layer must extend (DB-7).
  - `api-backend/app/core/database.py` — `Base` (declarative base every new model subclasses).
  - `api-backend/alembic/versions/817926e7604a_0017_auth_status_columns.py` — the migration this one chains from (`down_revision`), and the `_require` self-assertion pattern this layer's `client_subscriptions` column-add step follows (existing-table DDL, not `op.create_table`).
  - `api-backend/alembic/versions/788404b616bc_0015_trade_reconciliation.py` — the generic `op.create_table` pattern this layer's four brand-new tables follow.
- **Hand-off / exit signal:** all DB-1..DB-7 units committed, `alembic upgrade head` / `downgrade -1` both verified clean on a scratch DB, `pytest -q` green, PR opened against `client-onboarding-integration`.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- One model file per feature area under `api-backend/app/models/`. This layer adds `api-backend/app/models/onboarding.py` (new — four classes + four enums) and modifies `api-backend/app/models/pc.py` (two new nullable columns on the existing `ClientSubscription` class only — no other class in that file is touched).
- UUID PKs via `Uuid(native_uuid=False), default=uuid.uuid4` (see `Model.id`, `ClientProfile`-adjacent `User.id`) — followed here throughout `onboarding.py`.
- DB enums as `class X(str, enum.Enum)` persisted via `SAEnum(X, native_enum=False, length=N, values_callable=lambda e: [m.value for m in e])` (see `users.py` `Portal`/`AccountStatus`, `pc.py` `ModelStatus`/`PeriodStatus`) — every one of the five new enums (`OnboardingStatus`, `OnboardingKind`, `DocStatus`, `AllotRdmpStatus`, `AllotRdmpKind`) follows this exact shape, values persisted lowercase per the proposal's § 4.1 `Literal` blocks.
- `Mapped[T]` + `mapped_column` (SQLAlchemy 2.0 style) throughout; no legacy `Column(...)` declarations.
- FKs declared by table-name string (`ForeignKey("client_onboardings.id")`), never by importing the sibling ORM class — avoids import cycles, matches `recon.py`'s FK-by-string-into-`pc.py`/`post_trade_allocation.py`.
- `created_at`/`updated_at` via `DateTime(timezone=True), server_default=func.now()` (+ `onupdate=func.now()` only on tables whose rows are mutated post-insert — `client_onboardings` and `onboarding_documents` get both; `client_allotment_redemptions` and `client_events` are insert-only/append-only and get `created_at` alone, matching `recon_sessions`'s insert-only precedent).
- Migration files: `<revision>_<NNNN>_<slug>.py` under `api-backend/alembic/versions/`, `down_revision` chained to the true current head (`817926e7604a`).
- `app/models/__init__.py` re-exports every model class (see the existing per-module `from app.models.X import (...)` blocks) — this layer's eight new names (four classes + this doc's four persisted enums surfaced at module level: `OnboardingStatus`, `OnboardingKind`, `DocStatus`, `AllotRdmpStatus`, `AllotRdmpKind`, `ClientOnboarding`, `OnboardingDocument`, `ClientAllotmentRedemption`, `ClientEvent`) must be added there too, so `Base.metadata` picks them up for `create_all` in tests.

### 3.2 CI/CD & engineering discipline
- **Trunk-friendly, small units.** DB-1 through DB-5 are additive and independently reviewable per-class; they land as one Alembic revision (DB-6) because `onboarding_documents` FKs `client_onboardings.id` and `client_allotment_redemptions.source_onboarding_id` FKs the same table, so the tables must exist together for the revision to apply — the **model file** edits remain reviewable per-table.
- **Additive & backward-compatible first.** Four brand-new tables plus two new nullable columns on one existing table; zero touch to any existing row or existing column.
- **Gates before merge** (in order):
  ```bash
  cd api-backend
  ruff check . && ruff format --check . && mypy app && pytest -q
  ```
- **No secrets, no manual steps in the merge path.** Applying the `0018` migration to a shared/staging/live DB is a gate handed to the execution schedule and to the human (per [[git_workflow_human_owns_main]]), not baked into a unit.
- **Reversibility documented:** see § 9 — single down-migration drops all four new tables (in FK order) and the two new columns; clean unless a client has already been activated through this flow (proposal § Rollback).

---

## 4. Architecture

**Target layout:**
```
api-backend/app/models/
├── users.py                 # unchanged — User, ClientProfile, AdminProfile
├── pc.py                    # MODIFIED — ClientSubscription gains 2 nullable columns; nothing else in this file changes
├── reconciliation.py        # unchanged
├── recon.py                 # unchanged
├── post_trade_allocation.py # unchanged
└── onboarding.py             # NEW — ClientOnboarding, OnboardingDocument, ClientAllotmentRedemption, ClientEvent
                               #       + OnboardingStatus, OnboardingKind, DocStatus, AllotRdmpStatus, AllotRdmpKind
api-backend/alembic/versions/
└── <hash>_0018_client_onboarding.py   # NEW — creates all four tables + the two client_subscriptions columns
```

**Dependency direction:** `onboarding.py` imports nothing from `pc.py`/`users.py`/`recon.py` at the ORM level — every cross-table FK (`users.id`, `models.id`, `client_onboardings.id`) is declared by table-name string, the same convention `recon.py` already uses to FK into `pc.py`/`post_trade_allocation.py` without an import cycle. `pc.py`'s `ClientSubscription` edit is two columns only; it does not import `onboarding.py`. The Backend layer's `OnboardingService` reads/writes across all of these tables; the DB layer does not contain any transition logic.

**External seams:** four new tables (`client_onboardings`, `onboarding_documents`, `client_allotment_redemptions`, `client_events`) plus two new columns on `client_subscriptions` (`mgmt_fee_override`, `incentive_fee_override`), all consumed by the Backend layer's `OnboardingService`/`OnboardingRepository` (§ 7). No existing code path reads these new tables or columns yet — they are wholly new surface, populated for the first time by the Backend layer's approve transaction.

---

## 5. Modules

### 5.1 `app/models/onboarding.py`
- **Responsibility:** ORM models + enums for the onboarding cycle, its per-document compliance state, the shared allotment/redemption ledger, and the minimal client-event sink.
- **Files:** `api-backend/app/models/onboarding.py` (new).
- **Public surface:** `ClientOnboarding`, `OnboardingDocument`, `ClientAllotmentRedemption`, `ClientEvent`, `OnboardingStatus`, `OnboardingKind`, `DocStatus`, `AllotRdmpStatus`, `AllotRdmpKind`.
- **Owns features:** DB-1, DB-2, DB-3, DB-4.

### 5.2 `app/models/pc.py` (modified)
- **Responsibility:** unchanged file responsibility (trading models & client subscriptions); this layer's only contribution is two new nullable fee-override columns on the existing `ClientSubscription` class.
- **Files:** `api-backend/app/models/pc.py` (modify — `ClientSubscription` only).
- **Public surface:** `ClientSubscription.mgmt_fee_override`, `ClientSubscription.incentive_fee_override` (both `Decimal | None`).
- **Owns features:** DB-5.

### 5.3 Migration
- **Responsibility:** one Alembic revision creating the four new tables (FK-safe order) and adding the two `client_subscriptions` columns.
- **Files:** `api-backend/alembic/versions/<hash>_0018_client_onboarding.py` (new).
- **Public surface:** none (migration, not importable application code).
- **Owns features:** DB-6.

### 5.4 Model re-exports
- **Responsibility:** make every new class/enum importable from `app.models` so `Base.metadata` sees them (SQLite `create_all` test path) and so Backend-layer code has one import surface.
- **Files:** `api-backend/app/models/__init__.py` (modify).
- **Public surface:** n/a (re-export only).
- **Owns features:** DB-7.

---

## 6. Features

### DB-1 — `client_onboardings` table + `OnboardingStatus`/`OnboardingKind` enums (MANDATORY)

- **Proposal ref:** § Layer 1 B-1
- **Module:** 5.1
- **Files:** `create: api-backend/app/models/onboarding.py`
- **Dependencies:** none — root unit. Not parallel-safe with DB-2/DB-3 despite living in the same file eventually: DB-2 FKs `client_onboardings.id`, DB-3's `source_onboarding_id` also FKs `client_onboardings.id`, so the real sequencing is DB-1 → {DB-2, DB-3} → DB-4; DB-6's migration needs all four classes defined first.

**Contract:**
```python
import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class OnboardingStatus(str, enum.Enum):
    INITIAL = "initial"
    REVIEWING = "reviewing"
    PENDING_REVIEW = "pending_review"
    ACTIVE = "active"


class OnboardingKind(str, enum.Enum):
    INITIAL = "initial"
    RENEWAL = "renewal"


# ---------------------------------------------------------------------------
# DB-1 — client_onboardings
# ---------------------------------------------------------------------------


class ClientOnboarding(Base):
    __tablename__ = "client_onboardings"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    # One row per client — a renewal reopens this SAME row in place (proposal D-7),
    # it never inserts a second one. unique=True is the schema-level expression of
    # "one onboarding cycle record per client, ever."
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        index=True,
        nullable=False,
    )
    kind: Mapped[OnboardingKind] = mapped_column(
        SAEnum(
            OnboardingKind,
            native_enum=False,
            length=16,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        server_default=OnboardingKind.INITIAL.value,
    )
    status: Mapped[OnboardingStatus] = mapped_column(
        SAEnum(
            OnboardingStatus,
            native_enum=False,
            length=16,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        server_default=OnboardingStatus.INITIAL.value,
    )
    model_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("models.id"), nullable=False
    )
    multiplier: Mapped[Decimal] = mapped_column(Numeric(28, 10), nullable=False)
    mgmt_fee: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    incentive_fee: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    ibhk_account: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sw_account: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # --- widened 2026-07-20 (D-9): genuinely new columns, no prior home anywhere ---
    id_type: Mapped[str] = mapped_column(String(64), nullable=False)  # e.g. "Hong Kong ID Card" | "Passport"
    id_number: Mapped[str] = mapped_column(String(128), nullable=False)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (Index("ix_client_onboardings_status", "status"),)
```

**Behavior / invariants:**
- `user_id` is `unique=True` — this is the schema-level guarantee behind proposal B-1/D-7 ("one row per client, not per cycle"); a renewal must `UPDATE` this row, never `INSERT` a second one. A second insert for the same `user_id` raises `IntegrityError`.
- `kind` defaults `"initial"` and is only ever flipped to `"renewal"` by the Backend layer's renewal-trigger scheduler (Backend C-6) reopening this same row; this layer does not model a per-cycle history — `kind` records "was this row ever reopened," not a log of every cycle (proposal D-7).
- `status` transitions (`initial → reviewing → pending_review → active`, and `active → pending_review` on renewal) are entirely Backend-owned (proposal D-2); this table only stores the current value plus an index for the board-query group-by.
- `mgmt_fee`/`incentive_fee` share `Model.mgmt_fee`/`Model.incentive_fee`'s exact `Numeric(9, 6)` precision (`pc.py:91-92`) so the Backend layer's compare-and-set (Backend C-5) never hits a precision mismatch.
- `model_id` FKs `models.id` with no `ondelete` clause (matches `ClientOnboarding`'s spec — a model is never expected to be deleted out from under a live onboarding cycle; this mirrors `AllocationModelSnapshot.model_id`'s plain FK in `pc.py`).
- **Widened 2026-07-20 (D-9):** `id_type`/`id_number` are `nullable=False` — the RM's Start Onboarding form already collects both today (`OnboardingModal.tsx`), so there is no legitimate cycle without them; they are cycle-specific (an ID can change between onboarding cycles) so they live here, not on `ClientProfile`.

**Done when:** a `ClientOnboarding` row round-trips through `db.add`/`db.flush` with a valid `user_id`/`model_id`/`id_type`/`id_number`; a second insert attempt with the same `user_id` raises `IntegrityError`; an insert omitting `id_type` or `id_number` raises `IntegrityError`/`NOT NULL` violation; `status`/`kind` round-trip as their exact string enum values (`"initial"`, `"reviewing"`, `"pending_review"`, `"active"` / `"initial"`, `"renewal"`).

---

### DB-2 — `onboarding_documents` table + `DocStatus` enum (MANDATORY)

- **Proposal ref:** § Layer 1 B-2
- **Module:** 5.1
- **Files:** `modify: api-backend/app/models/onboarding.py`
- **Dependencies:** DB-1 (FKs `client_onboardings.id`)

**Contract:**
```python
from sqlalchemy import BigInteger, Integer, UniqueConstraint
# (imports merged with DB-1's in the real file; shown split here for readability)


class DocStatus(str, enum.Enum):
    NOT_STARTED = "not_started"
    UPLOADED = "uploaded"
    IN_REVIEW = "in_review"
    VERIFIED = "verified"
    REJECTED = "rejected"
    EXPIRED = "expired"


class OnboardingDocument(Base):
    __tablename__ = "onboarding_documents"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    onboarding_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("client_onboardings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    doc_type: Mapped[str] = mapped_column(String(64), nullable=False)  # stable config KEY
    status: Mapped[DocStatus] = mapped_column(
        SAEnum(
            DocStatus,
            native_enum=False,
            length=16,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        server_default=DocStatus.NOT_STARTED.value,
    )
    storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    version_no: Mapped[int] = mapped_column(Integer(), nullable=False, server_default="0")
    reviewed_by: Mapped[str | None] = mapped_column(String(128), nullable=True)  # compliance firebase_uid
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    issue_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "onboarding_id", "doc_type", name="uq_onboarding_documents_cycle_type"
        ),
    )
```

**Behavior / invariants:**
- `(onboarding_id, doc_type)` is unique — one row per (cycle, doc_type), the schema-level fix for the "two-source drift" the proposal calls out (RM's `VERIFIED_COUNT` lookup vs. Compliance's ephemeral `docVerdicts`, proposal B-2). Attempting a second row for the same cycle/doc_type raises `IntegrityError`; the Backend layer's renewal path (Backend C-6) resets an *existing* row's `status` back to `not_started` rather than inserting a new one.
- `doc_type` is a plain `String(64)`, not a DB-level enum — it is a stable key into the Backend layer's `compliance_doc_config.py` (proposal C-4), which is the extensibility point for adding future doc types without a migration. This layer places no CHECK constraint on the value, consistent with how `AlgoTradeOrder.source_kind` is handled in `recon.py` (validated at the application/Pydantic layer, not the DB layer).
- `status` values map 1:1 to the seam's `DocStatus` literal (§ 7); `expired` is a reserved-but-unused value at this layer too — no job in this proposal ever writes it (proposal Non-Goals).
- `version_no` bumps on each reupload (Backend-owned); this layer only provides the column and its zero default, mirroring `ModelMaterial.version_no` in `pc.py`.
- Deleting a `client_onboardings` row cascades to delete its `onboarding_documents` rows (`ondelete="CASCADE"`) — this only matters for test/scratch-DB cleanup; a live client's onboarding row is never deleted by any code path in this proposal.

**Done when:** an `OnboardingDocument` row inserts under a valid `onboarding_id`; a second row for the same `(onboarding_id, doc_type)` raises `IntegrityError`; deleting the parent `client_onboardings` row cascades to delete this row with zero orphans; `status` round-trips through all six enum values.

---

### DB-3 — `client_allotment_redemptions` table + `AllotRdmpStatus`/`AllotRdmpKind` enums (MANDATORY)

- **Proposal ref:** § Layer 1 B-3, § Design decisions D-3, D-8
- **Module:** 5.1
- **Files:** `modify: api-backend/app/models/onboarding.py`
- **Dependencies:** DB-1 (`source_onboarding_id` FKs `client_onboardings.id`)

**Contract:**
```python
class AllotRdmpStatus(str, enum.Enum):
    PENDING = "pending"
    ACKNOWLEDGED = "acknowledged"


class AllotRdmpKind(str, enum.Enum):
    ALLOTMENT = "allotment"
    REDEMPTION = "redemption"  # not written by this proposal — reserved for a future redemption proposal


class ClientAllotmentRedemption(Base):
    __tablename__ = "client_allotment_redemptions"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("users.id"), nullable=False, index=True
    )
    model_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("models.id"), nullable=False
    )
    multiplier: Mapped[Decimal] = mapped_column(Numeric(28, 10), nullable=False)
    kind: Mapped[AllotRdmpKind] = mapped_column(
        SAEnum(
            AllotRdmpKind,
            native_enum=False,
            length=16,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    status: Mapped[AllotRdmpStatus] = mapped_column(
        SAEnum(
            AllotRdmpStatus,
            native_enum=False,
            length=16,
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        server_default=AllotRdmpStatus.PENDING.value,
    )
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)  # e.g. "initial allotment"
    # Links an onboarding-produced allotment to its cycle; NULL for any future
    # non-onboarding row (e.g. a manually-entered redemption). UNIQUE is
    # load-bearing (proposal B-3): client_onboardings is one row PER CLIENT
    # (DB-1) and is reopened, not re-inserted, on renewal (D-7) — this
    # constraint is the DB-level guarantee that a given onboarding row can
    # ever be cited as the source of at most one allotment, independent of
    # whether the Backend layer's kind-branch (Backend C-2) has a bug.
    source_onboarding_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("client_onboardings.id"),
        nullable=True,
        unique=True,
    )
    reference: Mapped[str] = mapped_column(String(32), nullable=False)  # e.g. "AL-3F9A2C"
    # --- widened 2026-07-20 (D-9): snapshots taken once at insert, never recomputed ---
    agg_before: Mapped[Decimal] = mapped_column(Numeric(28, 10), nullable=False)
    agg_after: Mapped[Decimal] = mapped_column(Numeric(28, 10), nullable=False)
    expected_cash_in: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_client_allotment_redemptions_status", "status"),
        Index("ix_client_allotment_redemptions_kind", "kind"),
    )
```

**Behavior / invariants:**
- `source_onboarding_id` is `nullable=True, unique=True` — SQL `UNIQUE` on a nullable column allows any number of `NULL` rows (rows not sourced from an onboarding cycle) while still enforcing at most one non-NULL value per `client_onboardings.id`. This is the exact schema mechanism the proposal calls "DB-enforced, not just app-code" (B-3, and restated in the proposal's Objectives).
- `kind` is a required column with two values today; only `"allotment"` is ever written by this proposal's Backend layer (Backend C-2) — `"redemption"` is reserved for a future, separate proposal that will reuse this same table (proposal D-3) rather than a cloned one.
- `reference` is a plain `String(32)`, generated by the Backend layer as `f"AL-{uuid4().hex[:6].upper()}"` (proposal D-8) — no sequence/counter table at this layer, no uniqueness constraint on `reference` itself (collisions are astronomically unlikely at 6 hex chars and are not a correctness requirement per the proposal; only `source_onboarding_id` carries a uniqueness guarantee).
- `model_id` has no `ondelete` clause (same rationale as DB-1); `user_id` likewise — this is an append-only ledger, never expected to be pruned by a cascading delete.
- This table is the **movement ledger** (history + PC-ack workflow); it is distinct from `client_subscriptions` (DB-5's target), which is the current-state projection. Both are written by the same Backend approve transaction but serve different reads (proposal D-3).
- **Widened 2026-07-20 (D-9) — `agg_before`/`agg_after` are a snapshot, not a live aggregate.** Both are `nullable=False`: `agg_before` = `SUM(client_subscriptions.multiplier)` for this row's `model_id`, taken **before** this row's own effect; `agg_after` = `agg_before + multiplier`. Both are computed once, by the Backend layer, at the same insert that writes this row (Backend C-2) — this layer never recomputes them later. A live aggregate computed at read time would make an *old* allotment's displayed history silently drift upward every time a new client subscribes to that model afterward, so a permanent snapshot is required to keep the ledger's history accurate. This is a DB-layer concern only insofar as the two columns must be `NOT NULL` — the values themselves are supplied by the Backend layer at insert; this layer does not compute them. `expected_cash_in` is likewise a snapshot (`created_at` + a fixed settlement-lag config constant, Backend C-2) but is `nullable=True` — unlike the two aggregate columns, no value is guaranteed to be known at every insert path.

**Done when:** a row inserts with a valid `user_id`/`model_id`, `kind="allotment"`, `agg_before`/`agg_after` set, and a `source_onboarding_id` pointing at an existing `client_onboardings` row; an insert omitting `agg_before` or `agg_after` raises `IntegrityError`/`NOT NULL` violation; an insert omitting `expected_cash_in` succeeds with it `NULL`; `agg_before`/`agg_after` round-trip as exact `Numeric(28,10)` values; a second insert attempt with the **same** `source_onboarding_id` raises `IntegrityError`; a row with `source_onboarding_id=NULL` never collides with any other `NULL` row (multiple NULLs coexist); `status` round-trips `pending`/`acknowledged`.

---

### DB-4 — `client_events` table (Yes)

- **Proposal ref:** § Layer 1 B-4
- **Module:** 5.1
- **Files:** `modify: api-backend/app/models/onboarding.py`
- **Dependencies:** none beyond `users.id` existing — no FK to `client_onboardings`, so this unit is parallel-safe with DB-2/DB-3 (both depend on DB-1; this one only depends on `users.py`, already merged).

**Contract:**
```python
class ClientEvent(Base):
    __tablename__ = "client_events"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("users.id"), nullable=False, index=True
    )
    category: Mapped[str] = mapped_column(String(64), nullable=False)  # e.g. "Account Notification"
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
```

**Behavior / invariants:**
- Deliberately minimal and scoped to onboarding notifications only (proposal Non-Goals — the general events feed, Market News etc., stays mock and out of scope). No `updated_at` — rows are append-only, never mutated after insert.
- `category` is a free-text `String(64)`, not an enum — this table is intentionally not built to be the general events feed's eventual schema; it is sized only for what Backend C-2's approve transaction writes today ("Your subscription to `<model>` is now active." / "Your periodic KYC review is complete.").
- No FK to `client_onboardings` — an event is a fact about a user, not about a specific onboarding cycle, so it survives independently of any future onboarding-table change.

**Done when:** a `ClientEvent` row inserts under a valid `user_id` and is retrievable ordered by `created_at`; no additional constraint beyond FK validity is enforced at this layer.

---

### DB-5 — `client_subscriptions` fee-override columns (MANDATORY)

- **Proposal ref:** § Layer 1 B-5, § Design decisions D-6
- **Module:** 5.2
- **Files:** `modify: api-backend/app/models/pc.py` (`ClientSubscription` class only)
- **Dependencies:** none — additive columns on an existing, already-merged table; independently revertible from DB-1..DB-4.

**Contract:**
```python
# api-backend/app/models/pc.py — ClientSubscription, existing class, two new columns added
# immediately after `multiplier` (matches the AFTER-positioning convention used by
# migration 0017 for users.status/authorized_by).


class ClientSubscription(Base):
    __tablename__ = "client_subscriptions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    model_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("models.id", ondelete="CASCADE"),
        primary_key=True,
    )
    multiplier: Mapped[Decimal] = mapped_column(
        Numeric(28, 10), nullable=False, server_default="1"
    )
    # --- NEW (013 / DB-5) --------------------------------------------------
    # NULL = inherit Model.mgmt_fee / Model.incentive_fee (the model's own
    # default). Set ONLY when the client's onboarding-captured fee diverges
    # from that default (Backend C-5's compare-and-set at approve). This is
    # never a calculated value — see proposal D-6 / Non-Goals.
    mgmt_fee_override: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    incentive_fee_override: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    # ------------------------------------------------------------------------
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        Index("ix_client_subscriptions_model_id", "model_id"),
        Index("ix_client_subscriptions_updated_at", "updated_at"),  # DB-6 (pre-existing, unrelated)
    )
```

**Behavior / invariants:**
- Both columns are nullable with **no** `server_default` — existing rows get `NULL` on migration (no backfill; proposal B-5 states this explicitly), meaning "inherit the model default" for every subscription that predates this proposal.
- Same `Numeric(9, 6)` precision as `Model.mgmt_fee`/`Model.incentive_fee` (`pc.py:91-92`) and as `ClientOnboarding.mgmt_fee`/`incentive_fee` (DB-1) — all three columns must compare exactly without cross-precision rounding surprises, since the Backend layer's compare-and-set (Backend C-5) reads all three.
- This layer stores **state**, not a calculation: no trigger, no computed column, no CHECK constraint ties these two columns to `models.mgmt_fee`/`incentive_fee`. The "effective fee" (`override ?? model.default`) is a read-side coalesce owned entirely by whichever layer displays it (Backend/Frontend) — proposal D-6.
- No index added — these columns are never queried/filtered on directly in this proposal's scope (only read alongside their owning row).

**Done when:** `alembic upgrade head` adds both columns to `client_subscriptions` with existing rows showing `NULL` in both; a fresh `INSERT` can set either column independently of the other; `alembic downgrade -1` removes both columns and existing `client_subscriptions` rows are otherwise untouched (row count and all other column values unchanged).

---

### DB-6 — Migration `0018_client_onboarding` (MANDATORY)

- **Proposal ref:** § Layer 1 B-1/B-2/B-3/B-4/B-5, § Layer 1 C ("Summary of DB-layer changes")
- **Module:** 5.3
- **Files:** `create: api-backend/alembic/versions/<hash>_0018_client_onboarding.py`
- **Dependencies:** DB-1, DB-2, DB-3, DB-4, DB-5 (model classes must exist so the migration's DDL matches them; and, per DB-1's FK, `client_onboardings` must be created before `onboarding_documents`/`client_allotment_redemptions`)

**Contract:**
```python
"""0018_client_onboarding

Revision ID: <hash>
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

from alembic import op
import sqlalchemy as sa

revision: str = "<hash>"
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
        sa.UniqueConstraint(
            "onboarding_id", "doc_type", name="uq_onboarding_documents_cycle_type"
        ),
    )
    op.create_index("ix_onboarding_documents_onboarding_id", "onboarding_documents", ["onboarding_id"])

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
        sa.Column("expected_cash_in", sa.DateTime(timezone=True), nullable=True),  # widened 2026-07-20 (D-9)
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
        conn.execute(sa.text("SELECT COUNT(*) FROM client_subscriptions")).scalar()
        == subs_count,
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
```

**Behavior / invariants:** table creation order is `client_onboardings` → `{onboarding_documents, client_allotment_redemptions}` → `client_events` (FK-dependency order, `client_events` unconstrained by the others); the `client_subscriptions` ALTER runs after all four tables exist (order is immaterial between them, but keeping the existing-table change last matches the "additive-first" convention from 0017). `downgrade()` is the exact reverse: drop the two new columns first (cheapest, always-safe step), then drop the four new tables in reverse FK order. Purely additive — no existing row in any pre-existing table is modified except the two `client_subscriptions` columns, which stay `NULL` on every existing row.

**Done when:** `alembic upgrade head` runs clean on a fresh copy of the dev DB; `alembic downgrade -1` drops exactly the four new tables and the two new columns and nothing else; re-running `upgrade head` after a `downgrade -1` is idempotent; the two `_require` self-assertions both pass.

---

### DB-7 — Re-export new models in `app/models/__init__.py` (MANDATORY)

- **Proposal ref:** § Layer 1 A (table), implied by the existing re-export convention
- **Module:** 5.4
- **Files:** `modify: api-backend/app/models/__init__.py`
- **Dependencies:** DB-1, DB-2, DB-3, DB-4 (the classes/enums being re-exported must exist)

**Contract:**
```python
# api-backend/app/models/__init__.py — new block, appended after the existing
# app.models.recon import block and before `from app.core.database import Base`.

from app.models.onboarding import (  # noqa: F401
    ClientOnboarding,
    OnboardingDocument,
    ClientAllotmentRedemption,
    ClientEvent,
    OnboardingStatus,
    OnboardingKind,
    DocStatus,
    AllotRdmpStatus,
    AllotRdmpKind,
)
```
The existing `app.models.pc` import block is unchanged (DB-5's two new columns live on the already-imported `ClientSubscription` class — no new name to add).

**Behavior / invariants:** this is the mechanism by which `Base.metadata.create_all(engine)` (the SQLite test path, per proposal § Layer 1 C) sees all four new tables — a model class not imported somewhere reachable from `app.models` never registers with `Base.metadata`, and `create_all` silently omits it. This has bitten prior features in this codebase (`app/models/recon.py`'s re-export block exists for the same reason) — DB-7 is the one-line insurance against that failure mode for this proposal's four tables.

**Done when:** `from app.models import ClientOnboarding, OnboardingDocument, ClientAllotmentRedemption, ClientEvent` succeeds; a test calling `Base.metadata.create_all(engine)` against a fresh SQLite/scratch engine creates all four new tables without any other import.

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal § 4.1 — widened 2026-07-20, D-9)

```python
# ---- Shared enums (persisted lowercase; see native_enum=False convention) --------
OnboardingStatus = Literal["initial", "reviewing", "pending_review", "active"]
OnboardingKind   = Literal["initial", "renewal"]
DocStatus        = Literal["not_started", "uploaded", "in_review", "verified", "rejected", "expired"]
AllotRdmpStatus  = Literal["pending", "acknowledged"]
AllotRdmpKind    = Literal["allotment", "redemption"] # this proposal only ever writes "allotment"

# ---- Field-name ↔ column-name map (the ones that differ) ------------------------
#  API/DTO field         DB column                       Notes
#  units | multiplier    onboarding.multiplier /         FE forms call it modelUnit/mult/units;
#                        client_allotment_redemptions.multiplier /   persisted as `multiplier` Numeric(28,10)
#                        client_subscriptions.multiplier
#  docType               onboarding_documents.doc_type    stable config KEY, not the display label
#  verdict "valid"       doc status -> "verified"         Compliance verdict maps to a status
#  verdict "issue"       doc status -> "rejected"
#  verdict null          doc status stays "in_review"     unreviewed
#  mgmt_fee/incentive_fee onboarding.mgmt_fee/incentive_fee -> compared at approve against Model.mgmt_fee/incentive_fee;
#                        client_subscriptions.*_override      only written to *_override if it diverges, else stays NULL
#                        (NULL == "inherit the model default", never a calculated value)
#  --- widened 2026-07-20 (D-9): full field parity with the pre-existing mocks ---
#  primary_phone/address/  ClientProfile.primary_phone/        NOT duplicated onto client_onboardings — OnboardingDTO
#  country_of_residence    address/country_of_residence        assembly joins ClientProfile, already captured at client creation
#  assigned_rm (display)   users.name via ClientProfile.assigned_rm_uid -> AdminProfile lookup, resolved server-side
#  agg_before/agg_after    client_allotment_redemptions.        snapshotted once at insert (Backend C-2), never recomputed later —
#                          agg_before/agg_after                 preserves historical accuracy as more clients subscribe afterward
#  expected_cash_in        client_allotment_redemptions.        snapshotted at insert = created_at + ONBOARDING_SETTLEMENT_DAYS (config)
#                          expected_cash_in
#  (client-frontend / SubscriptionDTO / ClientEventDTO are explicitly OUT of scope for this widening — see D-9)

# ---- RM: start / board / documents / submit ------------------------------------
class StartOnboardingReq(BaseModel):          # POST /api/rm/onboardings  -> 201
    client_name: str; email: EmailStr; primary_phone: str
    address: str; country_of_residence: str
    id_type: str; id_number: str
    ibhk_account: str; sw_account: str
    model_id: UUID; units: Decimal            # "Initial Model to Subscribe" + "Model Unit"
    mgmt_fee: Decimal; incentive_fee: Decimal # the agreed fee (fraction, e.g. 0.015); FE converts its "1.5%" display string before sending
    kind: OnboardingKind = "initial"
    # docs uploaded separately via the document route (form may submit with 0..7 docs)

class DocumentDTO(BaseModel):
    doc_type: str; label: str; status: DocStatus
    filename: str | None; required: bool; periodic_review: bool
    issue_note: str | None; reviewed_at: datetime | None; expires_at: datetime | None
    can_reupload: bool                        # server-computed: status in {not_started,uploaded,rejected,expired}

class OnboardingDTO(BaseModel):               # widened 2026-07-20 for full field parity with the pre-existing RM/Compliance mocks — see D-9
    id: UUID; user_id: UUID
    client_name: str; email: str; assigned_rm: str   # assigned_rm: display name, service resolves ClientProfile.assigned_rm_uid -> AdminProfile/User.name
    client_ref: str                            # display code e.g. "MEGA-0481" — server-formatted from user_id, not stored
    primary_phone: str; address: str; country_of_residence: str   # sourced from ClientProfile (already captured at client creation) via join — NOT duplicated onto client_onboardings
    id_type: str; id_number: str               # sourced from client_onboardings (DB B-1) — the one genuinely new pair of columns this widening adds
    ibhk_account: str; sw_account: str         # sourced from client_onboardings — these columns already existed in DB B-1; this widening only adds them to the DTO
    status: OnboardingStatus; kind: OnboardingKind
    model_id: UUID; model_name: str; units: Decimal
    mgmt_fee: Decimal; incentive_fee: Decimal  # the agreed fee as captured at onboarding — same fields StartOnboardingReq sent in; echoed back for the RM/Compliance detail panels
    verified_count: int; required_count: int   # e.g. 6 / 7 — computed from documents
    reject_reason: str | None
    submitted_at: datetime | None; created_at: datetime
    documents: list[DocumentDTO]               # present on detail, omitted on board list

class BoardDTO(BaseModel):                      # GET /api/rm/onboardings -> 200
    initial: list[OnboardingDTO]; reviewing: list[OnboardingDTO]
    pending_review: list[OnboardingDTO]; active: list[OnboardingDTO]

# POST /api/rm/onboardings/{id}/documents/{doc_type}   multipart file -> 200 DocumentDTO
#   409 if the doc's can_reupload is false (in_review | verified)
# POST /api/rm/onboardings/{id}/submit                 -> 200 OnboardingDTO
#   409 if any required doc is not uploaded; sets status reviewing, docs -> in_review

# ---- Compliance: review / verdict / decide -------------------------------------
# GET  /api/compliance/onboardings                     -> 200 list[OnboardingDTO] (reviewing + decided history)
# GET  /api/compliance/onboardings/{id}/documents/{doc_type}/download -> 200 file stream
class VerdictReq(BaseModel):                    # POST .../documents/{doc_type}/verdict -> 200 DocumentDTO
    verdict: Literal["valid", "issue"]; note: str | None = None
# POST /api/compliance/onboardings/{id}/approve        -> 200 OnboardingDTO
#   409 unless every required doc is "verified"; runs §4.2 side-effects atomically
class RejectReq(BaseModel):                     # POST /api/compliance/onboardings/{id}/reject -> 200
    reason: str | None = None                  # flagged docs already marked "issue" via verdict route

# ---- PC: allotments ------------------------------------------------------------
class AllotRdmptDTO(BaseModel):                  # GET /api/pc/allotments -> 200
    id: UUID; reference: str                    # "Client anonymized · {reference}"; UUID-derived e.g. "AL-3F9A2C" — no sequence, no client identity crosses this seam
    model_id: UUID; model_name: str; units: Decimal; amount: Decimal   # amount = units * model.model_size
    kind: AllotRdmpKind; status: AllotRdmpStatus; note: str | None    # note e.g. "initial allotment"
    agg_before: Decimal; agg_after: Decimal     # widened 2026-07-20 — snapshotted at insert time (DB B-3), NOT recomputed live; = sum(client_subscriptions.multiplier) for this model_id, before/after this row's `units`
    expected_cash_in: datetime | None           # widened 2026-07-20 — settlement date, snapshotted at insert time as created_at + a fixed settlement lag (Backend C-2)
    rm: str; created_at: datetime; acknowledged_at: datetime | None
# POST /api/pc/allotments/{id}/acknowledge             -> 200 AllotRdmptDTO  (pending -> acknowledged)

# ---- Client (own records only, scoped to the authenticated client user) --------
class SubscriptionDTO(BaseModel):              # GET /api/client/subscriptions -> 200 list
    model_id: UUID; model_name: str; units: Decimal; ib_account: str | None
    # Not widened — client-frontend (Portfolio/Events) is explicitly OUT of scope for the
    # 2026-07-20 seam-widening pass (D-9); it stays as originally specified. See D-9's note.
class ClientEventDTO(BaseModel):               # GET /api/client/events -> 200 list
    id: UUID; category: str; title: str; body: str; created_at: datetime
    # icon/level/action-label chrome the client Event page renders is NOT part of this DTO — see D-9:
    # it is a static category -> {icon, level, primaryLabel, secondaryLabel, href} lookup table owned by the
    # Frontend layer, keyed on `category` (a closed, small set: "Account Notification" today). No backend
    # field is added for this — it would be speculative storage for what is, today, a pure styling constant.
    # (Portfolio/SubscriptionDTO is NOT widened this way — see D-9's scope note; this Events treatment is
    # an explicit exception because it needs zero new storage of any kind, unlike Portfolio's gaps.)
```

**Per-layer obligations against the seam (verbatim from proposal § 4.2):**

| Layer | What this layer contributes | What this layer assumes from the other side |
|---|---|---|
| Database | `client_onboardings`, `onboarding_documents`, `client_allotment_redemptions` tables; writes `client_subscriptions` + `users.status='active'` inside the approve transaction | Backend never writes an enum value outside the §4.1 ranges; `multiplier` fits `Numeric(28,10)` |
| Backend | Serves every DTO/route in §4.1 with the stated codes; owns all transitions + the atomic approve side-effects; computes `can_reupload`, `verified_count`, `amount` server-side | DB tables exist per Layer 1; `get_storage()` + `models` table present; RBAC actions registered |
| Frontend | Consumes the DTOs, maps them onto the existing mock-shaped types (no layout change), sends the mutation calls | Backend returns DTOs exactly as in §4.1; status strings match the enum literals verbatim |

### 7.2 How this layer honours the seam
- **What this layer contributes to the seam:** the four tables (`client_onboardings`, `onboarding_documents`, `client_allotment_redemptions`, `client_events`) with exactly the columns named in the field-map above, plus the two `client_subscriptions.*_override` columns; every enum column is typed to accept **only** the seam's literal values via `SAEnum(..., values_callable=...)`. **Widened 2026-07-20 (D-9):** this includes `client_onboardings.id_type`/`id_number` (both `NOT NULL`, DB-1) and `client_allotment_redemptions.agg_before`/`agg_after` (`NOT NULL`)/`expected_cash_in` (nullable, DB-3) — all four are Backend-supplied values at insert time; this layer only guarantees the column types/nullability, it does not compute any of them.
- **What this layer assumes from the other side:** the Backend layer never writes an enum value outside the ranges above (this layer's `SAEnum(native_enum=False, ...)` columns are plain `VARCHAR` underneath — MariaDB does not reject an out-of-range string at the DB level, so this is an assumption on Backend discipline, not a DB CHECK constraint, consistent with how `ModelStatus`/`PortalStatus`/`SourceKind` are already handled elsewhere in this codebase); `multiplier` values fit `Numeric(28, 10)`; the Backend layer's approve transaction is the only writer of `client_subscriptions.*_override`, `client_allotment_redemptions`, and the `users.status='active'` flip, and performs all of them atomically (this layer only provides the columns/FKs that make that atomicity possible — it does not itself enforce cross-table atomicity, which is a transaction-boundary concern owned by Backend C-2).
- **Change protocol:** any edit to this section requires editing the proposal § 4 first; this section is then re-copied verbatim.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Framework / runner:** pytest — command: `pytest -q` (from `api-backend/`; `pyproject.toml` already configures `[tool.pytest.ini_options]`).
- **Fixtures / seed:** an in-memory/scratch SQLite engine built via `Base.metadata.create_all` (matching the existing `tests/models/test_post_trade_allocation.py`/`tests/models/test_recon.py` precedent), seeded with one `users` row (client), one `users` row (compliance/RM, for `authorized_by`/`reviewed_by` string fields — these are plain strings, not FKs, so no seed is strictly required but is included for realism), and one `models` row so FK inserts succeed.
- **Isolation:** each test creates its own session/transaction and rolls back; safe to run in parallel.
- **Layer isolation:** tests import only `app.models.onboarding` and `app.models.pc.ClientSubscription` (+ the existing `users`/`pc` models they FK to, which are fixtures, not application logic) — no `app.libs.onboarding` service/repository code, since that package does not exist on this branch (Backend layer, built in parallel).
- **Test location:** `api-backend/tests/models/test_onboarding.py` (mirrors `tests/models/test_recon.py`, `tests/models/test_post_trade_allocation.py`).
- **Commit policy:** tests are never committed — `api-backend/.gitignore` already ignores `/tests/`.
- **Code generation:** concrete test code is written by the `test-gen` skill from § 8.2/8.3 below.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| DB-1 | `ClientOnboarding` inserts once per `user_id`; a second insert for the same `user_id` raises; `status`/`kind` round-trip all enum values; `id_type`/`id_number` are `NOT NULL` — an insert omitting either raises | none |
| DB-2 | `OnboardingDocument` inserts under a valid cycle; `(onboarding_id, doc_type)` uniqueness holds; cascade-deletes with its parent cycle | none |
| DB-3 | `ClientAllotmentRedemption` inserts with `kind="allotment"`; `source_onboarding_id` UNIQUE holds (a second row for the same source raises); multiple `NULL` sources coexist; `agg_before`/`agg_after` round-trip as `NOT NULL` `Numeric(28,10)`; `expected_cash_in` accepts `NULL` | none |
| DB-4 | `ClientEvent` inserts under a valid `user_id`; independent of any onboarding cycle | none |
| DB-5 | `client_subscriptions` accepts both override columns as `NULL` or set independently; existing-row precision matches `Model.mgmt_fee`/`incentive_fee` | none |
| DB-6 | `upgrade head` / `downgrade -1` both apply cleanly; downgrade drops exactly the 4 tables + 2 columns; existing `client_subscriptions` rows untouched otherwise | none |
| DB-7 | `Base.metadata.create_all` creates all four new tables from a bare `from app.models import ...` | none |

### 8.3 Test goals

#### DB-1
- **Positive:** a `ClientOnboarding` row with a valid `user_id`/`model_id`/`id_type`/`id_number` inserts and is retrievable; `status`/`kind` default to `"initial"` when omitted.
- **Negative:** a second insert with the same `user_id` raises `IntegrityError` (unique violation); a `user_id` not present in `users` raises `IntegrityError`; a `model_id` not present in `models` raises `IntegrityError`; an insert omitting `id_type` raises a `NOT NULL`/`IntegrityError` violation; an insert omitting `id_number` raises the same.
- **Invariants:** `id` is always a UUID4, never null; `status`/`kind` only ever persist one of the seam's literal values, round-tripped exactly (`"initial"`, `"reviewing"`, `"pending_review"`, `"active"` / `"initial"`, `"renewal"`); `id_type`/`id_number` are never null on any successfully-inserted row.
- **Seam mocks:** none — pure DB-layer test.

#### DB-2
- **Positive:** insert succeeds with a valid `onboarding_id` and a unique `doc_type` for that cycle; `status` defaults to `"not_started"`.
- **Negative:** a second row with the same `(onboarding_id, doc_type)` raises `IntegrityError`; an `onboarding_id` not present in `client_onboardings` raises `IntegrityError`.
- **Invariants:** deleting the parent `client_onboardings` row cascades to delete all its `onboarding_documents` rows, leaving zero orphans; `version_no` defaults to `0`.
- **Seam mocks:** none.

#### DB-3
- **Positive:** insert succeeds with `kind="allotment"`, `status` defaulting to `"pending"`, `agg_before`/`agg_after` set to arbitrary `Numeric(28,10)` values, `expected_cash_in` set to a datetime, and a `source_onboarding_id` pointing at a seeded `client_onboardings` row; a second positive case with `expected_cash_in=NULL` also inserts successfully.
- **Negative:** a second insert with the **same** `source_onboarding_id` raises `IntegrityError`; a `user_id`/`model_id` not present in their respective tables raises `IntegrityError`; an insert omitting `agg_before` raises a `NOT NULL`/`IntegrityError` violation; an insert omitting `agg_after` raises the same.
- **Invariants:** two rows both with `source_onboarding_id=NULL` coexist without violating uniqueness; `reference` round-trips as an opaque string with no format enforced at this layer; `agg_before`/`agg_after` round-trip at full `Numeric(28,10)` precision with no rounding; `expected_cash_in` is the only one of the three widened columns that ever legitimately persists `NULL`.
- **Seam mocks:** none.

#### DB-4
- **Positive:** insert succeeds with a valid `user_id`, arbitrary `category`/`title`/`body`.
- **Negative:** a `user_id` not present in `users` raises `IntegrityError`.
- **Invariants:** no FK to `client_onboardings` exists — deleting a `client_onboardings` row never cascades into `client_events`.
- **Seam mocks:** none.

#### DB-5
- **Positive:** an existing `client_subscriptions` row (seeded pre-migration-equivalent, i.e. inserted without the two override columns specified) shows `NULL` for both; a fresh insert can set `mgmt_fee_override` without setting `incentive_fee_override` (and vice versa).
- **Negative:** none beyond standard column-type validation — both columns are unconstrained nullable `Numeric(9,6)`.
- **Invariants:** setting/clearing either override column never mutates `multiplier` or the composite `(user_id, model_id)` PK.
- **Seam mocks:** none.

#### DB-6
- **Positive:** `alembic upgrade head` then `alembic downgrade -1` both exit 0 on a scratch DB; the four new tables exist and the two new columns are present after upgrade; all are absent after downgrade.
- **Negative:** running `upgrade head` twice in a row is a no-op (Alembic's own idempotency), not an error.
- **Invariants:** no pre-existing table's row count changes across upgrade/downgrade except the intended `client_subscriptions` column add/drop (row count itself never changes, only column set); both `_require` self-assertions pass on `upgrade`.
- **Seam mocks:** none.

#### DB-7
- **Positive:** `from app.models import ClientOnboarding, OnboardingDocument, ClientAllotmentRedemption, ClientEvent, OnboardingStatus, OnboardingKind, DocStatus, AllotRdmpStatus, AllotRdmpKind` succeeds with no import error; calling `Base.metadata.create_all(engine)` against a bare scratch engine (no other import) creates all four new tables.
- **Negative:** none — this is a wiring check, not a validation check.
- **Invariants:** the set of tables created by `create_all` is stable across repeated calls to the same engine (idempotent `create_all`).
- **Seam mocks:** none.

### 8.4 Aggregate gate
- All unit tests green is a local gate run before PR hand-off.
- Target coverage: 100% of the new model file's statements (small, mechanical surface); the two-line `pc.py` diff is covered incidentally by DB-5's tests.
- Chosen `test-gen` level for this layer: `standard`.

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] DB-1 through DB-5 model/column changes committed (`app/models/onboarding.py` new; `app/models/pc.py` modified).
- [ ] DB-6 migration committed; `alembic upgrade head` / `downgrade -1` both verified on a scratch DB.
- [ ] DB-7 re-export committed; `Base.metadata.create_all` picks up all four new tables.
- [ ] § 8 unit tests all pass; CI gate (§ 3.2) green.
- [ ] § 7 matches the proposal's frozen seam verbatim.
- [ ] PR opened; human owns the merge to `client-onboarding-integration`.

**Rollback:** `alembic downgrade -1` drops `client_events`, `client_allotment_redemptions`, `onboarding_documents`, `client_onboardings` (reverse FK order) and drops `client_subscriptions.mgmt_fee_override`/`incentive_fee_override`. **Clean (additive-only) rollback iff no client has been activated through this flow** (proposal § Rollback). Dropping the two override columns is always clean on its own — they are nullable and additive, and their loss only means "no client's fee override is remembered," with every subscription falling back to the model's default. If a client *was* activated before rollback, the down-migration still drops the four onboarding tables and the two override columns cleanly, but the pre-existing `client_subscriptions.multiplier` row it wrote (and the `users.status='active'`/`authorized_by` flip, both outside this layer's tables) are **not** auto-reverted by this migration — they are by-then-legitimate live data, and reverting an activated client is a manual data decision, not part of this layer's schema rollback.
