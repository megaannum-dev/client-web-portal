# 015 — End-of-Day Exception Report · Implementation Details — Database

> Status: **DRAFT — pending implementation.**
> Implements: `docs/proposals/015-2026-07-21-eod-exception-report.md` § Layer 1 — Database
> Layer: Database — **one layer per file.**
> Sibling layer docs: [`015-eod-exception-report-be.md`](015-eod-exception-report-be.md), [`015-eod-exception-report-fe.md`](015-eod-exception-report-fe.md)
> Execution schedule: `docs/execution-schedules/015-eod-exception-report-db.md`
> Branch: `<TODO: parent-branch>-db` — cut from the parent branch (not yet named for this proposal; the current repo branch is `daily-exception-page-integration`, but confirm with the user whether this proposal reuses it or cuts a fresh parent branch before starting).
> Builds on / prerequisites: Alembic head `b1c2d3e4f5a6` (`api-backend/alembic/versions/b1c2d3e4f5a6_0019_merge_heads.py`), merged into main. `recon_sessions` (`api-backend/app/models/recon.py`, proposal 012) and `orders` (`api-backend/app/models/reconciliation.py`, proposal 005) already exist and are read (not modified) by this layer's completeness-gate query.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/015-2026-07-21-eod-exception-report.md` § Layer 1 — Database, § 4 (Cross-layer seam) |
| Execution schedule | `docs/execution-schedules/015-eod-exception-report-db.md` |
| Sibling layer impl docs | `docs/implementations/015-eod-exception-report-be.md`, `docs/implementations/015-eod-exception-report-fe.md` |
| Builds on | Alembic head `b1c2d3e4f5a6`; `recon_sessions` (proposal 012); `orders` (proposal 005) |

---

## 2. Branch & session contract

- **Branch:** `<TODO: parent-branch>-db`, cut from the parent.
- **Isolation:** fully independent of the BE/FE layer branches — this layer only adds two tables + one migration; nothing here imports application code beyond `app.core.database.Base`.
- **Preconditions:**
  - [ ] `alembic heads` on the target DB reports `b1c2d3e4f5a6`.
  - [ ] The frozen seam in the proposal (§ 4) is agreed — § 7 below is a verbatim copy, not a renegotiation.
- **Read-first inventory:**
  - `api-backend/app/models/recon.py` — `ReconSession` (`recon_sessions.id`, `.trade_date`) this layer does **not** FK into (no column here references it directly — day-level aggregation is a Backend-layer query responsibility, per proposal § Layer 2 §B), but `eod_records.trade_date` must line up in type/format with `ReconSession.trade_date` (a real `Date`, not IB's `String(8)` token).
  - `api-backend/app/models/reconciliation.py` — `Order` (`orders` table), specifically `Order.tradeDate` (`String(8)`, `"YYYYMMDD"`) and `Order.allocated_run_id` — the two columns the Backend layer's completeness-gate query filters on; this layer stores nothing new on `Order`.
  - `api-backend/app/libs/trade_models/storage.py` — `FileStorage` protocol; this layer's `eod_records.file_storage_key` is an opaque string in this same convention, no new storage table.
  - `api-backend/alembic/versions/b1c2d3e4f5a6_0019_merge_heads.py` — the migration this one chains from (`down_revision`).
  - `api-backend/app/models/__init__.py` — re-export list this layer's two new classes must be added to.
- **Hand-off / exit signal:** new migration file created, `EodRecord`/`EodBreakRecord`/`EodStatus`/`EodLeg`/`EodOutcome` committed, `alembic upgrade head` / `downgrade -1` both verified clean on a scratch DB, PR opened against the parent branch.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- One model file per feature area under `api-backend/app/models/` (e.g. `recon.py`, `post_trade_allocation.py`). This layer adds `api-backend/app/models/eod.py` — new tables only, no touch to `recon.py`, `reconciliation.py`, `post_trade_allocation.py`, or `trade_models/storage.py`.
- UUID PKs via `Uuid(native_uuid=False), default=uuid.uuid4` (see `ReconSession.id`).
- String-backed enums via `SAEnum(Enum, native_enum=False, length=N, values_callable=lambda e: [m.value for m in e])` — matches `recon.py`'s `SourceKind` exactly, not a native Postgres enum type.
- `created_at`/`updated_at` via `DateTime(timezone=True), server_default=func.now()` — `eod_records`/`eod_break_records` are insert-then-update-once (header row transitions `OPEN`→`SIGNED` in place; break rows are insert-only) so no `onupdate=func.now()` is added — the sign-off mutation sets `signed_off_at` explicitly, it does not rely on an auto-updating timestamp.
- Migration files: `<revision>_<NNNN>_<slug>.py` under `api-backend/alembic/versions/`, `down_revision` chained to the true current head (`b1c2d3e4f5a6`).
- `app/models/__init__.py` re-exports every model class — this layer's new classes must be added there too, so `Base.metadata` picks them up.

### 3.2 CI/CD & engineering discipline
- **Trunk-friendly, small units.** DB-1/DB-2/DB-3/DB-4 are additive and independently revertible; they land as one Alembic revision (§ 4) because `eod_break_records` FKs `eod_records.id`, but the **model file** edits are still reviewable per-table.
- **Additive & backward-compatible first.** Two brand-new tables, zero touch to existing columns/rows.
- **Gates before merge** (in order):
  ```bash
  cd api-backend
  ruff check . && ruff format --check . && mypy app && pytest -q
  ```
- **No secrets, no manual steps in the merge path.** Applying the migration to a shared/staging DB is a gate handed to the execution schedule, not baked into a unit.
- **Reversibility documented:** see § 9 — single down-migration drops both tables in FK order.

---

## 4. Architecture

**Target layout:**
```
api-backend/app/models/
├── recon.py                 # unchanged — ReconSession, AlgoTradeOrder, AlgoTradeExecution
├── reconciliation.py        # unchanged — Order, Trade
└── eod.py                   # NEW — EodRecord, EodBreakRecord, EodStatus, EodLeg, EodOutcome
api-backend/alembic/versions/
└── <hash>_0020_eod_records.py   # NEW — creates both tables
```

**Dependency direction:** `eod.py` imports nothing from `recon.py`/`reconciliation.py`/`post_trade_allocation.py` at the ORM level — `EodBreakRecord`'s `order_id`/`client_id`/`model_id` columns are plain, unconstrained value columns (traceability-only, per proposal B-2), **not** foreign keys into `algotrade_orders`/`client_profiles`/`models`. This is deliberate: a signed break snapshot must remain readable even if the source row it once referenced is later deleted (e.g. a client record purged) — the frozen snapshot's `subject_ref`/`break_type`/`expected`/`actual`/`delta` display columns already carry everything needed to render the report without a join. The Backend layer's `EodService` reads across these tables; the DB layer does not.

**External seams:** two new tables (`eod_records`, `eod_break_records`) consumed by the Backend layer's `EodRepository`/`EodService` (§ 7). No existing table is read by any existing code path through these new tables — they are purely additive.

---

## 5. Modules

### 5.1 `app/models/eod.py`
- **Responsibility:** ORM models for the persisted EoD header + frozen break snapshot.
- **Files:** `api-backend/app/models/eod.py` (new).
- **Public surface:** `EodRecord`, `EodBreakRecord`, `EodStatus` (str enum), `EodLeg` (str enum), `EodOutcome` (str enum).
- **Owns features:** DB-1, DB-2, DB-3.

### 5.2 Migration
- **Responsibility:** one Alembic revision creating both tables in FK-safe order.
- **Files:** `api-backend/alembic/versions/<hash>_0020_eod_records.py` (new).
- **Public surface:** none (migration, not importable application code).
- **Owns features:** DB-4.

---

## 6. Features

### DB-1 — `eod_records` header table (Yes — user req.)

- **Proposal ref:** § Layer 1 B-1
- **Module:** 5.1
- **Files:** `create: api-backend/app/models/eod.py`
- **Dependencies:** none — root unit. DB-2 FKs `eod_records.id`, so the real sequencing is DB-1 → DB-2; DB-4's migration needs both classes defined first.

**Contract:**
```python
import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import DateTime, Date, Integer, Numeric, String, Uuid, UniqueConstraint, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class EodStatus(str, enum.Enum):
    OPEN = "OPEN"
    SIGNED = "SIGNED"


class EodOutcome(str, enum.Enum):
    CLEAR = "CLEAR"
    EXCEPTIONS = "EXCEPTIONS"


class EodRecord(Base):
    __tablename__ = "eod_records"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4)
    trade_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[EodStatus] = mapped_column(
        SAEnum(EodStatus, native_enum=False, length=16, values_callable=lambda e: [m.value for m in e]),
        nullable=False, server_default=EodStatus.OPEN.value,
    )
    signed_off_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    signed_off_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    order_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    execution_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    notional_total: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False, server_default="0")
    break_total: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    outcome: Mapped[EodOutcome | None] = mapped_column(
        SAEnum(EodOutcome, native_enum=False, length=16, values_callable=lambda e: [m.value for m in e]),
        nullable=True,
    )
    file_storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("trade_date", name="uq_eod_records_trade_date"),
    )
```

**Behavior / invariants:**
- `trade_date` is a real `Date`, matching `ReconSession.trade_date` — not the IB `String(8)` token (`Order.tradeDate`); the Backend layer performs any needed string↔date conversion (proposal § Layer 2 §C-2), not this layer.
- One row per settlement day (`UNIQUE(trade_date)`) — enforced at the DB level so `EodService.ensure_open()`'s upsert can rely on the constraint rather than an application-level race.
- `status`, `outcome`, and the four stat columns start at their `OPEN`/zero/`NULL` defaults and are the **only** columns this table's rows ever get updated in place (once, at sign-off) — every other column is write-once at creation.
- `outcome` is `NULL` while `OPEN` and written exactly once at sign-off (proposal B-3/D-5 — persisted for compliance, not derived on every read).

**Done when:** `EodRecord` round-trips through `db.add`/`db.flush` with `status=EodStatus.OPEN` and all stat columns defaulting to zero; inserting a second row with the same `trade_date` raises `IntegrityError`.

---

### DB-2 — `eod_break_records` frozen-snapshot table (Yes — user req.)

- **Proposal ref:** § Layer 1 B-2
- **Module:** 5.1
- **Files:** `modify: api-backend/app/models/eod.py`
- **Dependencies:** DB-1 (FKs `eod_records.id`)

**Contract:**
```python
from sqlalchemy import ForeignKey, Index

class EodLeg(str, enum.Enum):
    IB_ALGO = "IB_ALGO"
    ALGO_CLIENT = "ALGO_CLIENT"
    CLIENT_CRM = "CLIENT_CRM"


class EodBreakRecord(Base):
    __tablename__ = "eod_break_records"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4)
    eod_record_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("eod_records.id", ondelete="CASCADE"), nullable=False
    )
    leg: Mapped[EodLeg] = mapped_column(
        SAEnum(EodLeg, native_enum=False, length=16, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    subject_ref: Mapped[str] = mapped_column(String(255), nullable=False)
    break_type: Mapped[str] = mapped_column(String(64), nullable=False)
    field: Mapped[str | None] = mapped_column(String(32), nullable=True)
    expected: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    actual: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    delta: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    order_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(native_uuid=False), nullable=True)
    client_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    model_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(native_uuid=False), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_eod_break_records_eod_record_leg", "eod_record_id", "leg"),
    )
```

**Behavior / invariants:**
- One shared table with a `leg` discriminator, not three per-leg tables (proposal D-2) — `order_id`/`client_id`/`model_id` are each nullable because only a subset applies per leg: `order_id`+`field` for `IB_ALGO`, `client_id`+`model_id` for `ALGO_CLIENT`, `client_id` alone for `CLIENT_CRM`.
- **Raw keys are traceability-only, not FKs** (see § 4) — a signed report must remain fully renderable from `subject_ref`/`break_type`/`expected`/`actual`/`delta` alone even if the referenced order/client/model row is later deleted or renamed.
- Rows are written **once**, at sign-off, and never updated or deleted except via `ON DELETE CASCADE` from the parent `eod_records` row (which itself is never deleted in normal operation — only by an explicit rollback/downgrade).

**Done when:** `EodBreakRecord` inserts under a seeded `eod_records` row for each of the three `leg` values; deleting the parent `eod_records` row cascades to remove all its `eod_break_records` rows with zero orphans.

---

### DB-3 — `app/models/__init__.py` re-export (Yes — user req.)

- **Proposal ref:** § Layer 1 (implicit — required so `Base.metadata` picks up the new tables for `alembic revision --autogenerate` / any future autogenerate diff)
- **Module:** 5.1
- **Files:** `modify: api-backend/app/models/__init__.py`
- **Dependencies:** DB-1, DB-2

**Contract:**
```python
# app/models/__init__.py — add alongside the existing recon.py re-export block
from app.models.eod import EodBreakRecord, EodLeg, EodOutcome, EodRecord, EodStatus
```

**Behavior / invariants:** matches the existing pattern for every other feature's models (e.g. `from app.models.recon import ReconSession, AlgoTradeOrder, AlgoTradeExecution, SourceKind`).

**Done when:** `from app.models import EodRecord` succeeds from anywhere in the codebase; `Base.metadata.tables` includes `"eod_records"` and `"eod_break_records"`.

---

### DB-4 — Migration: create both tables (Yes — user req.)

- **Proposal ref:** § Layer 1 C, "Migration plan"
- **Module:** 5.2
- **Files:** `create: api-backend/alembic/versions/<hash>_0020_eod_records.py`
- **Dependencies:** DB-1, DB-2, DB-3 (model classes must exist so hand-written `op.create_table` calls match them)

**Contract:**
```python
"""0020_eod_records

Revision ID: <hash>
Revises: b1c2d3e4f5a6
"""
from alembic import op
import sqlalchemy as sa

revision = "<hash>"
down_revision = "b1c2d3e4f5a6"


def upgrade() -> None:
    op.create_table(
        "eod_records",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("trade_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="OPEN"),
        sa.Column("signed_off_by", sa.String(255), nullable=True),
        sa.Column("signed_off_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("order_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("execution_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notional_total", sa.Numeric(20, 4), nullable=False, server_default="0"),
        sa.Column("break_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("outcome", sa.String(16), nullable=True),
        sa.Column("file_storage_key", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("trade_date", name="uq_eod_records_trade_date"),
    )
    op.create_table(
        "eod_break_records",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("eod_record_id", sa.Uuid(), sa.ForeignKey("eod_records.id", ondelete="CASCADE"), nullable=False),
        sa.Column("leg", sa.String(16), nullable=False),
        sa.Column("subject_ref", sa.String(255), nullable=False),
        sa.Column("break_type", sa.String(64), nullable=False),
        sa.Column("field", sa.String(32), nullable=True),
        sa.Column("expected", sa.Numeric(28, 10), nullable=True),
        sa.Column("actual", sa.Numeric(28, 10), nullable=True),
        sa.Column("delta", sa.Numeric(28, 10), nullable=True),
        sa.Column("order_id", sa.Uuid(), nullable=True),
        sa.Column("client_id", sa.Integer(), nullable=True),
        sa.Column("model_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_eod_break_records_eod_record_leg", "eod_break_records", ["eod_record_id", "leg"]
    )


def downgrade() -> None:
    op.drop_table("eod_break_records")
    op.drop_table("eod_records")
```

**Behavior / invariants:** table creation order is `eod_records` → `eod_break_records` (FK-dependency order); `downgrade()` is the exact reverse. Purely additive — no existing table is touched.

**Done when:** `alembic upgrade head` runs clean on a fresh copy of the dev DB; `alembic downgrade -1` drops exactly these two tables and nothing else; re-running `upgrade head` after a `downgrade -1` is idempotent.

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal § 4)

```python
# ===== Enums =====
EodStatus  = Literal["OPEN", "SIGNED"]
EodLeg     = Literal["IB_ALGO", "ALGO_CLIENT", "CLIENT_CRM"]   # legs 1 / 2 / 3
EodOutcome = Literal["CLEAR", "EXCEPTIONS"]                     # the day's verdict

# ===== GET /api/mobo/eod?trade_date=YYYY-MM-DD =====
#   trade_date optional; omitted => the latest OPEN eod_records row (the day
#   still awaiting sign-off — the actionable one), falling back to the latest
#   SIGNED row if no OPEN day exists (Q-3, settled).
#   200 -> EodReportViewOut   |   404 -> {detail} if no EoD day exists
#
# EodReportViewOut =  (a) the day-aggregated flow view  +  (b) the EoD header.
# (a) is the EXISTING flow shape (schemas/reconciliation.py), MERGED across every
#     ReconSession whose trade_date == the resolved day. Field names unchanged so
#     the frontend's buildL1/L2/L3 derivation is reused verbatim.
class EodReportViewOut(BaseModel):
    # --- (a) day-aggregated flow view (reused sub-DTOs, verbatim) ---
    settleDay: str
    tradeDate: str                     # "YYYY-MM-DD"
    orders:  list[RcOrderOut]          # from schemas/reconciliation.py — unchanged
    allocs:  list[RcAllocOut]          # "
    ports:   list[RcPortOut]           # "
    algoTotal: str
    ibTotal: str
    crmTotal: str
    counts: RcBreakCountsOut           # "
    # --- (b) EoD header ---
    status: EodStatus
    signedOffBy: str | None            # display name of signer, null while OPEN
    signedOffAt: str | None            # ISO-8601, null while OPEN
    generated: str | None              # signedOffAt rendered for the band, else null
    orderCount: int                    # overall stat 1
    executionCount: int                # overall stat 2
    notionalTraded: str                # overall stat 3 (display, USD) — == ibTotal
    breakTotal: int                    # overall stat 4 (legs 1+2+3, excl. derived)
    outcome: EodOutcome                # "CLEAR" if breakTotal == 0 else "EXCEPTIONS"
    canSignOff: bool                   # zero unallocated IB orders for tradeDate
    exportReady: bool                  # status == "SIGNED" AND file present

# ===== POST /api/mobo/eod/sign-off =====
#   body: EodSignOffReq   |   gated by Action.EOD_SIGNOFF
#   200 -> EodReportViewOut (now status=SIGNED, exportReady=true)
#   409 -> {detail} if already SIGNED, or canSignOff is false (day incomplete)
#   404 -> {detail} if no eod_records row for tradeDate
class EodSignOffReq(BaseModel):
    tradeDate: str                     # "YYYY-MM-DD"

# ===== GET /api/mobo/eod/export?trade_date=YYYY-MM-DD =====
#   gated by Action.RECON_VIEW
#   200 -> application/pdf (StreamingResponse,
#          Content-Disposition: attachment; filename="EoD-YYYY-MM-DD.pdf")
#   409 -> {detail} if status != SIGNED (no file yet)
#   404 -> {detail} if no eod_records row

# ===== Error envelope =====
#   FastAPI default {"detail": str}. Frontend server layer wraps every call in the
#   existing APIResult<T> = {success:true,data} | {success:false,error,code}.
```

**Field-name ↔ column-name map** (frozen — proposal § 4.1, reproduced):

| Wire (API) | DB column | Note |
|---|---|---|
| `tradeDate` `"YYYY-MM-DD"` | `eod_records.trade_date` (`Date`) | orders/PTA store raw `YYYYMMDD`; strip/insert dashes exactly as `PostTradeAllocationService._format_date` does |
| `status` | `eod_records.status` (`EodStatus` enum) | |
| `signedOffBy` (display name) | `eod_records.signed_off_by` (`firebase_uid` str) | resolved to a name in the presenter, like PTA `_client_names` |
| `signedOffAt` / `generated` | `eod_records.signed_off_at` (`DateTime`) | |
| `orderCount` | `eod_records.order_count` (`int`) | |
| `executionCount` | `eod_records.execution_count` (`int`) | |
| `notionalTraded` (display) | `eod_records.notional_total` (`Numeric(20,4)`) | formatted via `fmt_usd` |
| `breakTotal` | `eod_records.break_total` (`int`) | |
| `outcome` | `eod_records.outcome` (`EodOutcome` enum, NULL while OPEN) | Written once at sign-off from that transaction's `break_total` (compliance: stored fact, not recomputed on read). While `OPEN`, the DTO derives it live (`breakTotal == 0`) since the column is still `NULL` |
| (file) | `eod_records.file_storage_key` (str, null until signed) | opaque `FileStorage` key, `subdir="YYYY-MM"` |
| `EodLeg` | `eod_break_records.leg` (enum) | |

### 7.2 How this layer honours the seam
- **What this layer contributes:** the `eod_records`/`eod_break_records` tables with exactly the columns named in the map above, plus the `UNIQUE(trade_date)` constraint that lets the Backend layer's `ensure_open()` upsert rely on the DB rather than an application-level race.
- **What this layer assumes from the other side:** Backend never writes `status` outside `{OPEN, SIGNED}`, `leg` outside the three enum values, or `outcome` outside `{CLEAR, EXCEPTIONS}`/`NULL`; Backend never mutates a row once `status = SIGNED` except via the one sign-off transaction itself (no later edits).
- **Change protocol:** any edit to this section requires editing the proposal § 4 first; this section is then re-copied verbatim.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Framework / runner:** pytest — command: `pytest -q` (from `api-backend/`; `pyproject.toml` already configures `[tool.pytest.ini_options]`).
- **Fixtures / seed:** an in-memory/scratch DB (matching how `tests/models/test_recon.py` already seeds `Base.metadata.create_all`) with no upstream seed rows required — `eod_records`/`eod_break_records` have no FK into `recon_sessions`/`orders`/`models` (§ 4's traceability-only design), so these tests are fully self-contained.
- **Isolation:** each test creates its own session/transaction and rolls back; safe to run in parallel.
- **Layer isolation:** tests import only `app.models.eod` — no Backend service/repository code.
- **Test location:** `api-backend/tests/models/test_eod.py` (mirrors `tests/models/test_recon.py`).
- **Commit policy:** tests are never committed — `api-backend/.gitignore` already ignores `/tests/`.
- **Code generation:** concrete test code is written by the `test-gen` skill from § 8.2/8.3 below.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| DB-1 | `EodRecord` inserts with `OPEN` defaults; duplicate `trade_date` raises | none |
| DB-2 | `EodBreakRecord` inserts under a session for each `leg` value; cascade-deletes with the parent | none |
| DB-3 | `from app.models import EodRecord` (etc.) succeeds; tables registered on `Base.metadata` | none |
| DB-4 | `upgrade head` / `downgrade -1` both apply cleanly; downgrade drops exactly 2 tables | none |

### 8.3 Test goals

#### DB-1
- **Positive:** a fresh `EodRecord` inserts with `status=OPEN`, all stat columns `0`, `outcome=None`, `file_storage_key=None`; it is retrievable by `trade_date`.
- **Negative:** inserting a second row with the same `trade_date` raises `IntegrityError` (unique violation).
- **Invariants:** `id` is always a UUID4, never null; `status` round-trips as the exact `EodStatus` member, never a raw string mismatch.
- **Seam mocks:** none — pure DB-layer test.

#### DB-2
- **Positive:** insert succeeds for each of the three `EodLeg` values under a seeded `eod_records` row, with only the fields relevant to that leg populated (e.g. `order_id`+`field` for `IB_ALGO`, leaving `client_id`/`model_id` null).
- **Negative:** an `eod_record_id` not present in `eod_records` raises `IntegrityError`.
- **Invariants:** deleting the parent `eod_records` row cascades to delete every child `eod_break_records` row, leaving zero orphans; `expected`/`actual`/`delta` preserve `Decimal` precision round-trip (no float coercion).
- **Seam mocks:** none.

#### DB-3
- **Positive:** `from app.models import EodRecord, EodBreakRecord, EodStatus, EodLeg, EodOutcome` succeeds; `"eod_records"` and `"eod_break_records"` are present in `Base.metadata.tables`.
- **Negative:** n/a (import-surface check).
- **Invariants:** re-exporting does not shadow or collide with any existing name in `app.models.__init__`.
- **Seam mocks:** none.

#### DB-4
- **Positive:** `alembic upgrade head` then `alembic downgrade -1` both exit 0 on a scratch DB; both tables exist after upgrade and are absent after downgrade.
- **Negative:** running `upgrade head` twice in a row is a no-op (Alembic's own idempotency), not an error.
- **Invariants:** no other table's row count changes across upgrade/downgrade.
- **Seam mocks:** none.

### 8.4 Aggregate gate
- All unit tests green is a local gate run before PR hand-off.
- Target coverage: 100% of the new model file's statements (small, mechanical surface).
- Chosen `test-gen` level for this layer: `standard`.

---

## 9. Definition of done & rollback

**Definition of done:**
- [ ] DB-1/DB-2 model classes committed to `app/models/eod.py`; DB-3's `app/models/__init__.py` re-export lands.
- [ ] DB-4 migration committed; `alembic upgrade head` / `downgrade -1` both verified.
- [ ] § 8 unit tests all pass; CI gate (§ 3.2) green.
- [ ] § 7 matches the proposal's frozen seam verbatim.
- [ ] PR opened; human owns the merge to the parent branch.

**Rollback:** `alembic downgrade -1` drops `eod_break_records` → `eod_records` in FK order. Purely additive — no existing table/row is touched, so rollback is lossless and clean at any point, **except**: if the Backend layer has already signed off real EoD days in production, downgrading destroys those signed records and their generated files' DB references (the files themselves, on `FileStorage`, are not deleted by this migration and would become orphaned — a follow-up storage-cleanup step, not part of this rollback). Safe order: **Backend/Frontend revert → DB downgrade**, matching the proposal's Rollback section.
