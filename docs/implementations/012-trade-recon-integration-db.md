# 012 — Trade Reconciliation · Implementation Details — Database

> Status: **DRAFT — pending implementation.**
> Implements: `docs/proposals/012-2026-07-15-trade-recon-integration.md` § Layer 1 — Database
> Layer: Database — **one layer per file.**
> Sibling layer docs: [`012-trade-recon-integration-be.md`](012-trade-recon-integration-be.md), [`012-trade-recon-integration-fe.md`](012-trade-recon-integration-fe.md)
> Execution schedule: `docs/execution-schedules/012-trade-recon-integration-db.md`
> Branch: `trade-reconciliation-integration-db` — cut from `trade-reconciliation-integration` (the parent branch already exists and is checked out today). Merges back into the parent; the human owns that merge.
> Builds on / prerequisites: Alembic head `29a586aaf08b` (`api-backend/alembic/versions/29a586aaf08b_0014_post_trade_allocation.py`) — proposal 011, merged into main. `models`, `client_profiles`, `client_subscriptions`, `allocation_periods`, `allocation_model_snapshots`, `post_trade_allocation_runs`, `post_trade_allocations`, `client_portfolios`, `orders`, `trades` all already exist.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/012-2026-07-15-trade-recon-integration.md` § Layer 1 — Database, § 4 (Cross-layer seam) |
| Execution schedule | `docs/execution-schedules/012-trade-recon-integration-db.md` |
| Sibling layer impl docs | `docs/implementations/012-trade-recon-integration-be.md`, `docs/implementations/012-trade-recon-integration-fe.md` |
| Builds on | Alembic head `29a586aaf08b`; proposal 011 (`post_trade_allocations`, `client_portfolios`) |

**Naming correction vs. the proposal (accuracy, not a design change).** The proposal's Layer 1 SQL sketches reference `ib_trades` / `ib_activity`. Those table names predate proposal 005/foundation-cleanup; the live schema (`api-backend/app/models/reconciliation.py`) calls them `orders` and `trades` (ORM classes `Order`, `Trade`), each keyed by IB's `id` (UUID) with the source columns verbatim from the IB Flex TCF export (`symbol`, `buySell`, `tradeDate: String(8)` in `YYYYMMDD` form, `orderID`, `execID`, `model: str | None` — a free-text label already used by the post-trade-allocation pipeline to bucket orders per model). This doc and its siblings use the real names throughout.

---

## 2. Branch & session contract

- **Branch:** `trade-reconciliation-integration-db`, cut from `trade-reconciliation-integration`.
- **Isolation:** fully independent of the BE/FE layer branches — this layer only adds tables and a migration; nothing here imports application code.
- **Preconditions:**
  - [ ] `alembic heads` on the target DB reports `29a586aaf08b`.
  - [ ] The frozen seam in the proposal (§ 4) is agreed — § 7 below is a verbatim copy, not a renegotiation.
- **Read-first inventory:**
  - `api-backend/app/models/reconciliation.py` — `Order`/`Trade` (`orders`/`trades` tables) this layer's FK/join columns must line up with (`symbol`, `buySell`, `tradeDate`, `orderID`, `model`).
  - `api-backend/app/models/pc.py` — `Model` (`models`), `AllocationModelSnapshot` (`allocation_model_snapshots`, composite PK `(period_id, user_id, model_id)`).
  - `api-backend/app/models/post_trade_allocation.py` — `PostTradeAllocationRun` (`post_trade_allocation_runs`), `PostTradeAllocation`, `ClientPortfolio`.
  - `api-backend/app/models/users.py` — `ClientProfile` (`client_profiles`, autoincrement int PK).
  - `api-backend/alembic/versions/29a586aaf08b_0014_post_trade_allocation.py` — the migration this one chains from (`down_revision`).
- **Hand-off / exit signal:** new migration file created, `Order`/model additions committed, `alembic upgrade head` / `downgrade -1` both verified clean on a scratch DB, PR opened against `trade-reconciliation-integration`.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- One model file per feature area under `api-backend/app/models/` (e.g. `post_trade_allocation.py`, `pc.py`). This layer adds `api-backend/app/models/recon.py` — new tables only, no touch to `reconciliation.py`, `pc.py`, `post_trade_allocation.py`, or `users.py`.
- UUID PKs via `Uuid(native_uuid=False), default=uuid.uuid4` (see `Order.id`, `Model.id`) — followed here, not the `gen_random_uuid()` server-default form the proposal's SQL sketch used.
- `created_at`/`updated_at` via `DateTime(timezone=True), server_default=func.now()` (+ `onupdate=func.now()` where a row is mutated after insert — not needed here, these tables are insert-only).
- Migration files: `<revision>_<NNNN>_<slug>.py` under `api-backend/alembic/versions/`, `down_revision` chained to the true current head.
- `app/models/__init__.py` re-exports every model class (see the existing `from app.models.reconciliation import (...)` block) — this layer's new classes must be added there too, so `Base.metadata` picks them up.

### 3.2 CI/CD & engineering discipline
- **Trunk-friendly, small units.** Each unit below (DB-1/DB-2/DB-3) is additive and independently revertible; they land as one Alembic revision (see § 4) because `algotrade_orders`/`algotrade_executions` FK into `recon_sessions` and must exist together for the revision to apply, but the **model file** edits are still reviewable per-table.
- **Additive & backward-compatible first.** Three brand-new tables, zero touch to existing columns/rows.
- **Gates before merge** (in order):
  ```bash
  cd api-backend
  ruff check . && ruff format --check . && mypy app && pytest -q
  ```
- **No secrets, no manual steps in the merge path.** Applying the migration to a shared/staging DB is a gate handed to the execution schedule, not baked into a unit.
- **Reversibility documented:** see § 9 — single down-migration drops all three tables in FK order.

---

## 4. Architecture

**Target layout:**
```
api-backend/app/models/
├── reconciliation.py        # unchanged — Order, Trade, SymbolSummary
├── pc.py                    # unchanged
├── post_trade_allocation.py # unchanged
├── users.py                 # unchanged
└── recon.py                 # NEW — ReconSession, AlgoTradeOrder, AlgoTradeExecution
api-backend/alembic/versions/
└── <hash>_0015_trade_reconciliation.py   # NEW — creates all three tables + indexes
```

**Dependency direction:** `recon.py` imports nothing from `reconciliation.py`/`pc.py`/`post_trade_allocation.py`/`users.py` at the ORM level (FKs are declared by table name string, the SQLAlchemy-standard way to avoid import cycles — see how `Order.allocated_run_id` FKs `post_trade_allocation_runs` without importing that module). The Backend layer's adapters read across these tables; the DB layer does not.

**External seams:** three new tables (`recon_sessions`, `algotrade_orders`, `algotrade_executions`) consumed by the Backend layer's adapters (§ 7). No new tables are read by any existing code path — these are the "AlgoTrade" side, wholly new.

---

## 5. Modules

### 5.1 `app/models/recon.py`
- **Responsibility:** ORM models for the AlgoTrade-side reconciliation schema — session grouping + synthesized/real order & execution storage.
- **Files:** `api-backend/app/models/recon.py` (new).
- **Public surface:** `ReconSession`, `AlgoTradeOrder`, `AlgoTradeExecution`, `SourceKind` (str enum).
- **Owns features:** DB-1, DB-2, DB-3.

### 5.2 Migration   
- **Responsibility:** one Alembic revision creating all three tables in FK-safe order.
- **Files:** `api-backend/alembic/versions/<hash>_0015_trade_reconciliation.py` (new).
- **Public surface:** none (migration, not importable application code).
- **Owns features:** DB-4.

---

## 6. Features

### DB-1 — `recon_sessions` table (Accepted)

- **Proposal ref:** § Layer 1 B-3, § Design decisions D-3
- **Module:** 5.1
- **Files:** `create: api-backend/app/models/recon.py`
- **Dependencies:** none — root unit. Not parallel-safe with DB-2/DB-3 despite all three living in the same file: DB-2 FKs `recon_sessions.id` and DB-3 FKs `algotrade_orders.id`, so the real sequencing is DB-1 → DB-2 → DB-3 (see each unit's own Dependencies line); DB-4's migration needs all three classes defined first.

**Contract:**
```python
import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, ForeignKeyConstraint, Uuid, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SourceKind(str, enum.Enum):
    SYNTHESIZED = "SYNTHESIZED"
    LIVE = "LIVE"


class ReconSession(Base):
    __tablename__ = "recon_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4)
    trade_date: Mapped[date] = mapped_column(Date, nullable=False)
    ib_run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("post_trade_allocation_runs.id"), nullable=False
    )
    allocation_period_id: Mapped[uuid.UUID] = mapped_column(Uuid(native_uuid=False), nullable=False)
    allocation_user_id: Mapped[uuid.UUID] = mapped_column(Uuid(native_uuid=False), nullable=False)
    allocation_model_id: Mapped[uuid.UUID] = mapped_column(Uuid(native_uuid=False), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("trade_date", "ib_run_id", name="uq_recon_sessions_trade_date_ib_run_id"),
        ForeignKeyConstraint(
            ["allocation_period_id", "allocation_user_id", "allocation_model_id"],
            ["allocation_model_snapshots.period_id", "allocation_model_snapshots.user_id", "allocation_model_snapshots.model_id"],
            name="fk_recon_sessions_allocation_model_snapshot",
        ),
    )
```

**Behavior / invariants:**
- `(trade_date, ib_run_id)` is the session identity (proposal D-3, Q-1 resolved) — one session per Flex-import run, no finer sub-day windowing.
- The composite FK exists **only** because `allocation_model_snapshots` has no single-column PK today (confirmed at `api-backend/app/models/pc.py:270-287`). Adding a surrogate PK there is tracked as a future refactor (proposal Q-12) — not done in this unit.
- `ib_run_id` FKs `post_trade_allocation_runs.id`, not `orders`/`trades` directly — a session is scoped to one PTA run, matching how the synthesizer will be hooked (Backend BE-8, inside `PostTradeAllocationService.run()`'s transaction).

**Done when:** `ReconSession` round-trips through a session (`db.add`/`db.flush`) with a valid `(period_id, user_id, model_id)` triple that matches an existing `allocation_model_snapshots` row; violating the FK raises `IntegrityError`.

---

### DB-2 — `algotrade_orders` table (MANDATORY)

- **Proposal ref:** § Layer 1 B-1, § 4.1 field-map
- **Module:** 5.1
- **Files:** `modify: api-backend/app/models/recon.py`
- **Dependencies:** DB-1 (FKs `recon_sessions.id`)

**Contract:**
```python
from decimal import Decimal

from sqlalchemy import CHAR, ForeignKey, Index, Numeric, SAEnum, String, Uuid, func
# (imports merged with DB-1's in the real file; shown split here for readability)


class AlgoTradeOrder(Base):
    __tablename__ = "algotrade_orders"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("recon_sessions.id", ondelete="CASCADE"), nullable=False
    )
    model_id: Mapped[uuid.UUID] = mapped_column(Uuid(native_uuid=False), ForeignKey("models.id"), nullable=False)
    symbol: Mapped[str] = mapped_column(String(255), nullable=False)
    buy_sell: Mapped[str] = mapped_column(String(16), nullable=False)  # 'BUY' | 'SELL'
    qty_ordered: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    notional: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    trade_date: Mapped[date] = mapped_column(Date, nullable=False)
    currency: Mapped[str] = mapped_column(CHAR(3), nullable=False, server_default="USD")
    asset_class: Mapped[str] = mapped_column(String(32), nullable=False, server_default="OPT")
    source_kind: Mapped[SourceKind] = mapped_column(
        SAEnum(SourceKind, native_enum=False, length=16,
               values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    derived_from_ib_run_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("post_trade_allocation_runs.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_algotrade_orders_session_model_symbol", "session_id", "model_id", "symbol"),
    )
```

**Behavior / invariants:**
- `model_id` is a UUID FK to `models.id` — never serialized to the wire (Backend BE-2/BE-3 join it to `models.name` for display; see proposal § 4.1 field-map).
- `source_kind` discriminates synthesized-from-IB rows (today, exclusively) from a future real-AlgoTrade-API row — both share this exact schema so the synthesizer (Backend BE-8) is deletable without a migration.
- `trade_date` is a real `DATE`, unlike `orders.tradeDate` (a `String(8)` `"YYYYMMDD"` token) — the Backend adapter (BE-5) is responsible for the format conversion when joining the two; this layer does not store the IB string form.

**Done when:** inserting a row with a `session_id` from DB-1 and a `model_id` from an existing `models` row succeeds; `source_kind` outside `{'SYNTHESIZED','LIVE'}` is rejected at the application/Pydantic layer (the column itself is a plain string-backed enum, matching the `Portal`/`PeriodStatus` convention elsewhere in this codebase — no DB-level CHECK constraint is added, consistent with how those enums are done).

---

### DB-3 — `algotrade_executions` table (MANDATORY)

- **Proposal ref:** § Layer 1 B-2, § 4.1 field-map (`RcExec`)
- **Module:** 5.1
- **Files:** `modify: api-backend/app/models/recon.py`
- **Dependencies:** DB-2 (FKs `algotrade_orders.id`)

**Contract:**
```python
class AlgoTradeExecution(Base):
    __tablename__ = "algotrade_executions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4)
    order_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("algotrade_orders.id", ondelete="CASCADE"), nullable=False
    )
    qty_filled: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    fill_price: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    fill_notional: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (Index("ix_algotrade_executions_order", "order_id"),)
```

**Behavior / invariants:**
- One row per fill; `RcOrder.execs[]` (proposal § 4.1) is exactly `AlgoTradeExecution` rows for that order, ordered by `executed_at`.
- `ON DELETE CASCADE` from `algotrade_orders` — deleting a session cascades order → execution (via DB-1's `ON DELETE CASCADE` on `algotrade_orders.session_id` too), matching the "additive & reversible" rollback story.

**Done when:** deleting a `recon_sessions` row cascades through `algotrade_orders` and `algotrade_executions` with zero orphans (verified by an integration test against a scratch DB).

---

### DB-4 — Migration: create all three tables (MANDATORY)

- **Proposal ref:** § Layer 1 B-1/B-2/B-3, "Migration plan"
- **Module:** 5.2
- **Files:** `create: api-backend/alembic/versions/<hash>_0015_trade_reconciliation.py`
- **Dependencies:** DB-1, DB-2, DB-3 (model classes must exist so `autogenerate` or hand-written `op.create_table` calls match them)

**Contract:**
```python
"""0015_trade_reconciliation

Revision ID: <hash>
Revises: 29a586aaf08b
"""
from alembic import op
import sqlalchemy as sa

revision = "<hash>"
down_revision = "29a586aaf08b"


def upgrade() -> None:
    op.create_table(
        "recon_sessions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("trade_date", sa.Date(), nullable=False),
        sa.Column("ib_run_id", sa.Uuid(), sa.ForeignKey("post_trade_allocation_runs.id"), nullable=False),
        sa.Column("allocation_period_id", sa.Uuid(), nullable=False),
        sa.Column("allocation_user_id", sa.Uuid(), nullable=False),
        sa.Column("allocation_model_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("trade_date", "ib_run_id", name="uq_recon_sessions_trade_date_ib_run_id"),
        sa.ForeignKeyConstraint(
            ["allocation_period_id", "allocation_user_id", "allocation_model_id"],
            ["allocation_model_snapshots.period_id", "allocation_model_snapshots.user_id", "allocation_model_snapshots.model_id"],
            name="fk_recon_sessions_allocation_model_snapshot",
        ),
    )
    op.create_table(
        "algotrade_orders",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("session_id", sa.Uuid(), sa.ForeignKey("recon_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("model_id", sa.Uuid(), sa.ForeignKey("models.id"), nullable=False),
        sa.Column("symbol", sa.String(255), nullable=False),
        sa.Column("buy_sell", sa.String(16), nullable=False),
        sa.Column("qty_ordered", sa.Numeric(20, 4), nullable=False),
        sa.Column("price", sa.Numeric(20, 4), nullable=False),
        sa.Column("notional", sa.Numeric(20, 4), nullable=False),
        sa.Column("trade_date", sa.Date(), nullable=False),
        sa.Column("currency", sa.CHAR(3), nullable=False, server_default="USD"),
        sa.Column("asset_class", sa.String(32), nullable=False, server_default="OPT"),
        sa.Column("source_kind", sa.String(16), nullable=False),
        sa.Column("derived_from_ib_run_id", sa.Uuid(), sa.ForeignKey("post_trade_allocation_runs.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_algotrade_orders_session_model_symbol", "algotrade_orders", ["session_id", "model_id", "symbol"]
    )
    op.create_table(
        "algotrade_executions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("order_id", sa.Uuid(), sa.ForeignKey("algotrade_orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("qty_filled", sa.Numeric(20, 4), nullable=False),
        sa.Column("fill_price", sa.Numeric(20, 4), nullable=False),
        sa.Column("fill_notional", sa.Numeric(20, 4), nullable=False),
        sa.Column("executed_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_algotrade_executions_order", "algotrade_executions", ["order_id"])


def downgrade() -> None:
    op.drop_table("algotrade_executions")
    op.drop_table("algotrade_orders")
    op.drop_table("recon_sessions")
```

**Behavior / invariants:** table creation order is `recon_sessions` → `algotrade_orders` → `algotrade_executions` (FK-dependency order); `downgrade()` is the exact reverse. Purely additive — no existing table is touched.

**Done when:** `alembic upgrade head` runs clean on a fresh copy of the dev DB; `alembic downgrade -1` drops exactly these three tables and nothing else; re-running `upgrade head` after a `downgrade -1` is idempotent.

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal § 4)

```ts
type FlowState = "ok" | "brk";
// m is the model's display name (e.g. "Model A") — plain string, not a token or a UUID.
// Backend never serializes model_id (UUID) to the wire; it's an internal join key only.

interface RcExec { id: string; qty: string; px: string; t: string; st: FlowState; }
interface RcOrder {
  id: string; m: string; inst: string; cat: string; side: string;
  qty: string; px: string; not: string; notVal: number;
  ref: string; ib: string;                 // ref = AlgoTrade order id echo; ib = IB reference/exec id
  st: FlowState; execs: RcExec[]; brk?: string;
}
interface RcAllocModelLine { m: string; units: number; amt: string; amtVal: number; st: FlowState; note?: string; }
interface RcAlloc { cid: string; client: string; st: FlowState; total: string; totalVal: number; models: RcAllocModelLine[]; }
interface RcPort  { cid: string; client: string; st: FlowState; pre: string; post: string; chg: string; pct: string; inTrade: number; cash: number; total: number; }
interface RcBreakCounts { algIbBrk: number; ibCrmBrk: number; algCrmBrk: number; totalBrk: number; }

interface ReconciliationFlowView {
  settleDay: string;
  orders: RcOrder[]; allocs: RcAlloc[]; ports: RcPort[];
  algoTotal: string; ibTotal: string; crmTotal: string;
  counts: RcBreakCounts;
}
```

**Field-name ↔ column-name map** (frozen — proposal § 4.1, reproduced): `RcOrder.id`↔`algotrade_orders.id`, `RcOrder.m`↔`models.name` joined on `algotrade_orders.model_id`, `RcOrder.inst`↔`algotrade_orders.symbol`, `RcOrder.notVal`↔`algotrade_orders.notional`, `RcOrder.execs[]`↔`algotrade_executions` rows for that order, `RcAlloc.cid`↔`client_profiles.id` (int, cast to string), `RcAlloc.client`↔`client_profiles.name`, `RcAllocModelLine.units`↔`client_subscriptions.multiplier`.

### 7.2 How this layer honours the seam
- **What this layer contributes:** the three tables that back `algotrade_orders`/`algotrade_executions`/`recon_sessions`, with exactly the columns named in the map above.
- **What this layer assumes from the other side:** Backend never writes `source_kind` outside `{'SYNTHESIZED','LIVE'}`; the synthesizer runs inside the same DB transaction as the IB Flex-import (`PostTradeAllocationService.run()`), so a `recon_sessions` row and its `algotrade_orders`/`algotrade_executions` rows are always created atomically.
- **Change protocol:** any edit to this section requires editing the proposal § 4 first; this section is then re-copied verbatim.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Framework / runner:** pytest — command: `pytest -q` (from `api-backend/`; `pyproject.toml` already configures `[tool.pytest.ini_options]`).
- **Fixtures / seed:** an in-memory/scratch Postgres (or SQLite-compatible subset, matching how `tests/models/test_post_trade_allocation.py` already seeds `Base.metadata.create_all`) with one seeded `models` row, one seeded `allocation_model_snapshots` row, and one seeded `post_trade_allocation_runs` row so FK inserts succeed.
- **Isolation:** each test creates its own session/transaction and rolls back; safe to run in parallel.
- **Layer isolation:** tests import only `app.models.recon` (+ the existing models it FKs to, which are fixtures, not application logic) — no Backend adapter/engine code.
- **Test location:** `api-backend/tests/models/test_recon.py` (mirrors `tests/models/test_post_trade_allocation.py`).
- **Commit policy:** tests are never committed — `api-backend/.gitignore` already ignores `/tests/`.
- **Code generation:** concrete test code is written by the `test-gen` skill from § 8.2/8.3 below.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| DB-1 | `ReconSession` inserts with a valid composite FK; violating FK raises | none |
| DB-2 | `AlgoTradeOrder` inserts under a session/model; `source_kind` round-trips as a string value | none |
| DB-3 | `AlgoTradeExecution` inserts under an order; cascade-deletes with the order and session | none |
| DB-4 | `upgrade head` / `downgrade -1` both apply cleanly; downgrade drops exactly 3 tables | none |

### 8.3 Test goals

#### DB-1
- **Positive:** a `ReconSession` row with `(trade_date, ib_run_id)` unique and a valid `(period_id, user_id, model_id)` triple inserts and is retrievable.
- **Negative:** an `(allocation_period_id, allocation_user_id, allocation_model_id)` triple that doesn't match any `allocation_model_snapshots` row raises `IntegrityError`; a duplicate `(trade_date, ib_run_id)` raises a unique-violation.
- **Invariants:** `id` is always a UUID4, never null.
- **Seam mocks:** none — pure DB-layer test.

#### DB-2
- **Positive:** insert succeeds with `source_kind="SYNTHESIZED"` and a `session_id`/`model_id` pointing at seeded rows.
- **Negative:** a `model_id` not present in `models` raises `IntegrityError`.
- **Invariants:** `notional`, `qty_ordered`, `price` preserve `Decimal` precision round-trip (no float coercion).
- **Seam mocks:** none.

#### DB-3
- **Positive:** insert succeeds with a valid `order_id`; deleting the parent `algotrade_orders` row cascades to delete this row.
- **Negative:** an `order_id` not present in `algotrade_orders` raises `IntegrityError`.
- **Invariants:** deleting the top-level `recon_sessions` row cascades through both child tables leaving zero orphans.
- **Seam mocks:** none.

#### DB-4
- **Positive:** `alembic upgrade head` then `alembic downgrade -1` both exit 0 on a scratch DB; the three tables exist after upgrade and are absent after downgrade.
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
- [ ] DB-1/DB-2/DB-3 model classes committed to `app/models/recon.py`; `app/models/__init__.py` re-exports them.
- [ ] DB-4 migration committed; `alembic upgrade head` / `downgrade -1` both verified.
- [ ] § 8 unit tests all pass; CI gate (§ 3.2) green.
- [ ] § 7 matches the proposal's frozen seam verbatim.
- [ ] PR opened; human owns the merge to `trade-reconciliation-integration`.

**Rollback:** `alembic downgrade -1` drops `algotrade_executions` → `algotrade_orders` → `recon_sessions` in FK order. Purely additive — no existing rows are touched, so rollback is lossless and clean at any point before the Backend layer's synthesizer (BE-8) has written real synthesized data. If synthesized data already exists in production, the Backend layer must be rolled back first (see the Backend doc's § 9) — otherwise the DB rollback is always safe.
