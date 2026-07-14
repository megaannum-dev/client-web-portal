# 011 — Post-Trade Allocation · Implementation Details — Database

> Status: **DRAFT — pending implementation.**
> Implements: `docs/proposals/011-2026-07-13-post-trade-allocation.md` § Layer 1 — Database
> Layer: Database — **one layer per file.**
> Sibling layer docs: `docs/implementations/011-2026-07-13-post-trade-allocation-be.md`, `docs/implementations/011-2026-07-13-post-trade-allocation-fe.md`
> Execution schedule: `docs/execution-schedules/011-2026-07-13-post-trade-allocation-db.md`
> Branch: `post-trade-allocation-integration-db`
> Builds on: Alembic head `350ce48e2f4d` (`0013_symbol_audit`); `app/models/pc.py` (`Model`, `AllocationPeriod`, `AllocationModelSnapshot`); `app/models/reconciliation.py` (`Order`); `app/models/users.py` (`User`, `ClientProfile`).

---



## 1. Identity & cross-references


| Reference               | Location                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Proposal                | `docs/proposals/011-2026-07-13-post-trade-allocation.md` § Layer 1 — Database                                                        |
| Execution schedule      | `docs/execution-schedules/011-2026-07-13-post-trade-allocation-db.md`                                                                |
| Sibling layer impl docs | `docs/implementations/011-2026-07-13-post-trade-allocation-be.md`, `docs/implementations/011-2026-07-13-post-trade-allocation-fe.md` |
| Builds on               | Alembic head `350ce48e2f4d`; `app/models/pc.py`; `app/models/reconciliation.py`                                                      |


Realizes proposal decisions **D-1** (three-column `client_portfolios` split), **D-3** (signed `Numeric`
columns — no non-negative constraint), **D-6** (no schema change; documented for the query
convention), **D-7** (`allocated`, not `delegated`), **D-9** (`trade_date` not unique; idempotency via
marker), **D-10** (`RunStatus.EMPTY` row). Findings realized: **B-1, B-2, B-3, B-4 (convention note
only), B-5**.

---



## 2. Branch & session contract

- **Branch:** `post-trade-allocation-integration-db` — cut from `post-trade-allocation-integration`;
merges back into it (human owns the merge).
- **Isolation:** self-contained; shares state with BE/FE only through the §7 seam. No sibling-layer
code (routers, services, frontend files) is visible on or required by this branch.
- **Preconditions:**
  - [ ] Alembic head on the parent branch is `350ce48e2f4d` (`0013_symbol_audit`).
  - [ ] §7 seam agreed (verbatim from proposal §4).
- **Read-first inventory:**
  - `api-backend/app/models/pc.py` — `Model`, `AllocationPeriod`, `AllocationModelSnapshot` — FK
  targets; column/enum/table-arg conventions to match (`Uuid(native_uuid=False)`, `SAEnum(..., native_enum=False, values_callable=...)`, `Numeric(28, 10)`, `DateTime(timezone=True)`).
  - `api-backend/app/models/reconciliation.py` — `Order` (`_TradeRow` mixin, `__tablename__ = "orders"`) — the table this layer adds a column to; note `orders` has **no** `updated_at`/ORM
  `onupdate` column today, so the new FK column is a plain nullable addition, not inserted into a
  timestamp block.
  - `api-backend/app/models/users.py` — `User`, `ClientProfile` — FK targets (`users.id`).
  - `api-backend/app/models/__init__.py` — export list Alembic autogeneration and app startup rely on.
  - `api-backend/alembic/env.py` — model-import block that must pick up the new module.
  - `api-backend/alembic/versions/350ce48e2f4d_0013_symbol_audit.py` — current head, becomes this
  revision's `down_revision`.
  - `api-backend/alembic/versions/e5f6a7b8c9d0_0008_pc_workspace.py` — reference for adding a
  composite-PK table + FK column in this codebase's migration style.
- **Env:** venv at `api-backend/.venv/` — run `.\.venv\Scripts\alembic.exe` (memory
`api-backend-dev-env`). DB URL env var `DATABASE_URL`. Creds `portal/portalsecret`,
`root/rootsecret`.
- **Hand-off / exit signal:** DB-1..DB-5 committed; `alembic upgrade head` then `downgrade -1` then
`upgrade head` run clean on a dev-DB copy; `import app.models.post_trade_allocation` succeeds; PR
opened.

---



## 3. Conventions & engineering principles



### 3.1 Codebase conventions

- ORM: SQLAlchemy 2.0 `Mapped[...]` / `mapped_column`, `Base` from `app.core.database`. UUID PKs use
`Uuid(native_uuid=False), default=uuid.uuid4`.
- Enums stored non-native: `SAEnum(E, native_enum=False, values_callable=lambda e: [m.value for m in e])` → VARCHAR (matches `ModelStatus`, `PeriodStatus`, `SymbolAuditOp`).
- Money: `Numeric(28, 10)`, always **signed** here (D-3) — no `CheckConstraint` forcing
non-negative; `traded`/`allocated`/`amount_in_trade` legitimately go negative on a losing day.
- Percent: `Numeric(6, 3)` (matches `pct` semantics — a small bounded percentage, not a money amount).
- Timestamps: `DateTime(timezone=True)`; `created_at` gets `server_default=func.now()`;
`updated_at` additionally gets `onupdate=func.now()`. Run rows are immutable (`created_at` only, no
`updated_at` — matches `AllocationModelSnapshot`/`ModelChange`/`ModelSymbolAudit` append-only rows);
`client_portfolios` is mutated in place so it keeps both.
- **Column ordering:** timestamps last, matching `ModelSymbolAudit`'s convention.
- FKs use `ForeignKey("...", ondelete=...)`; add indexes via `__table_args__`.
- Migration revisions follow the `<hash>_00NN_<slug>.py` filename pattern; next sequence number is
`0014`.
- Module layout: one new file per proposal, `app/models/post_trade_allocation.py`, mirroring
`app/models/pc.py`'s single-file-per-feature-area pattern rather than folding into `pc.py` or
`reconciliation.py` — this feature's tables are a distinct concern from both.



### 3.2 CI/CD & engineering discipline

- No lint/type config committed in `api-backend`; gate is: **migration applies up+down clean** and the
model imports without error.
  ```bash
  cd api-backend
  .venv/Scripts/alembic.exe upgrade head
  .venv/Scripts/alembic.exe downgrade -1
  .venv/Scripts/alembic.exe upgrade head
  .venv/Scripts/python.exe -c "import app.models.post_trade_allocation"
  ```
- **Additive-only.** Every DB-* unit in this doc adds a table or a nullable column; nothing alters or
drops an existing column. The branch is deployable at every commit.
- **Trunk-friendly, small units.** DB-1/DB-2/DB-3 (the three new tables) are independent model
additions; DB-4 (the `orders` FK column) is independent of them; DB-5 (the migration) depends on
DB-1..DB-4 since it materializes their target shape. Reverting DB-5 alone (`downgrade -1`) removes
all new schema cleanly.
- **Reversibility documented** (§9): `downgrade -1` drops the three new tables and the
`orders.allocated_run_id` column; existing `orders` row data is untouched.

---



## 4. Architecture

**Target layout (additive):**

```
api-backend/app/models/post_trade_allocation.py                    # NEW
api-backend/app/models/__init__.py                                 # + exports
api-backend/alembic/env.py                                         # + import
api-backend/alembic/versions/<hash>_0014_post_trade_allocation.py  # NEW revision
```

**Dependency direction:** `post_trade_allocation.py` imports and FKs **into**
`app/models/pc.py` (`models.id`, `allocation_periods.id`), `app/models/users.py` (`users.id`), and
`app/models/reconciliation.py` (`orders.id` via the reverse FK `orders.allocated_run_id → post_trade_allocation_runs.id`). None of `pc.py`, `users.py`, or `reconciliation.py` import from
`post_trade_allocation.py` — the dependency is one-directional, new module reads existing PKs, and
`reconciliation.Order` gains one column defined on the existing class.

**External seams:** BE reads/writes the three new tables and the new `orders.allocated_run_id` column
exclusively through this layer's ORM classes; BE is the only reader/writer (no FE DB access). Contract
pinned in §7.

---



## 5. Modules



### 5.1 `app.models.post_trade_allocation` (ORM)

- **Responsibility:** table/column/enum definitions for allocation runs, per-cell allocation records,
and client portfolio balances.
- **Files:** `api-backend/app/models/post_trade_allocation.py` (new).
- **Public surface:** `RunStatus`, `RunTrigger` enums; `PostTradeAllocationRun`,
`PostTradeAllocation`, `ClientPortfolio` classes.
- **Owns features:** DB-1, DB-2, DB-3.



### 5.2 `app.models.reconciliation` (edit)

- **Responsibility:** IB Flex row storage — gains the idempotency marker column.
- **Files:** `api-backend/app/models/reconciliation.py` (modify `Order`).
- **Public surface:** `Order.allocated_run_id`.
- **Owns features:** DB-4.



### 5.3 Alembic migration

- **Responsibility:** schema DDL — create three tables, add one column, no data migration.
- **Files:** `api-backend/alembic/versions/<hash>_0014_post_trade_allocation.py` (new);
`api-backend/app/models/__init__.py`, `api-backend/alembic/env.py` (edited for discovery).
- **Owns features:** DB-5.

---



## 6. Features



### DB-1 — `post_trade_allocation_runs` + `RunStatus`/`RunTrigger` (Yes — user req.)

- **Proposal ref:** § Layer 1 B-1
- **Module:** 5.1
- **Files:** create `api-backend/app/models/post_trade_allocation.py`
- **Dependencies:** none — parallel-safe

**Contract:**

```python
import enum

class RunStatus(str, enum.Enum):
    COMPLETED = "completed"
    EMPTY = "empty"
    FAILED = "failed"

class RunTrigger(str, enum.Enum):
    SCHEDULED = "scheduled"
    MANUAL = "manual"

class PostTradeAllocationRun(Base):
    __tablename__ = "post_trade_allocation_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4
    )
    trade_date: Mapped[str] = mapped_column(String(8), nullable=False)  # IB ET YYYYMMDD token (B-4)
    period_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("allocation_periods.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[RunStatus] = mapped_column(
        SAEnum(RunStatus, native_enum=False, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        server_default="completed",
    )
    trigger: Mapped[RunTrigger] = mapped_column(
        SAEnum(RunTrigger, native_enum=False, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    grand_total: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    run_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_post_trade_allocation_runs_trade_date", "trade_date"),
    )
```

**Behavior / invariants:** `trade_date` is **not** unique (D-9) — multiple runs may share a
`trade_date` (a late-arriving order produces a fresh run for an already-processed day). Row is
immutable once written (no `updated_at`); a `FAILED` status is reserved for future use — this proposal's
`service.run()` only ever commits `COMPLETED` or `EMPTY` rows (a raised exception rolls the transaction
back rather than persisting a `FAILED` row — see BE layer). `period_id` is `NOT NULL` even for an
`EMPTY` run: the service resolves "latest confirmed period" before checking the order set, per the
step order in proposal §Layer 2 B.

**Done when:** `PostTradeAllocationRun`, `RunStatus`, `RunTrigger` exist; `import app.models.post_trade_allocation` succeeds.

---



### DB-2 — `post_trade_allocations` (per-cell records) (Yes — user req.)

- **Proposal ref:** § Layer 1 B-2
- **Module:** 5.1
- **Files:** modify `api-backend/app/models/post_trade_allocation.py`
- **Dependencies:** DB-1 (FK target `post_trade_allocation_runs.id`)

**Contract:**

```python
class PostTradeAllocation(Base):
    __tablename__ = "post_trade_allocations"

    run_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("post_trade_allocation_runs.id", ondelete="CASCADE"),
        primary_key=True,
    )
    model_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("models.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    model_traded: Mapped[Decimal] = mapped_column(Numeric(28, 10), nullable=False)   # signed (D-3)
    units: Mapped[Decimal] = mapped_column(Numeric(28, 10), nullable=False)          # frozen multiplier
    units_total: Mapped[Decimal] = mapped_column(Numeric(28, 10), nullable=False)
    allocated: Mapped[Decimal] = mapped_column(Numeric(28, 10), nullable=False)      # signed (D-3, D-7)
    pct: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False)
    ib_account: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model_name: Mapped[str] = mapped_column(String(255), nullable=False)
    model_acct: Mapped[str | None] = mapped_column(String(255), nullable=True)

    __table_args__ = (
        Index("ix_post_trade_allocations_run_model", "run_id", "model_id"),
    )
```

**Behavior / invariants:** composite primary key `(run_id, model_id, user_id)` — one row per client per
model per run; append-once, never mutated or deleted outside a run-cascade. `model_traded`,
`allocated` are **signed** `Numeric` — no `CheckConstraint(allocated >= 0)` or similar; a losing
model-day legitimately produces negative values throughout the row (D-3). `units`/`units_total`/
`ib_account`/`model_name`/`model_acct` are frozen copies of state that can change later
(`allocation_model_snapshots.multiplier`, a model rename, an IB account change) — denormalized onto
the cell so a historical run's numbers never drift and the GET is a single indexed scan (per proposal
B-2 rationale).

**Done when:** `PostTradeAllocation` exists with the composite PK and the index; `import app.models.post_trade_allocation` succeeds.

---



### DB-3 — `client_portfolios` (three-column balance) (Yes — user req.)

- **Proposal ref:** § Layer 1 B-3; D-1
- **Module:** 5.1
- **Files:** modify `api-backend/app/models/post_trade_allocation.py`
- **Dependencies:** DB-1 (FK target `post_trade_allocation_runs.id`)

**Contract:**

```python
class ClientPortfolio(Base):
    __tablename__ = "client_portfolios"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    cash_deposit: Mapped[Decimal] = mapped_column(
        Numeric(28, 10), nullable=False, server_default="0"
    )  # static; NOT written by this proposal (see Behavior)
    amount_in_trade: Mapped[Decimal] = mapped_column(
        Numeric(28, 10), nullable=False, server_default="0"
    )  # signed (D-3); updated by every non-empty run
    previous_amount_in_trade: Mapped[Decimal] = mapped_column(
        Numeric(28, 10), nullable=False, server_default="0"
    )  # snapshot of amount_in_trade before the last run
    last_run_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("post_trade_allocation_runs.id", ondelete="SET NULL"),
        nullable=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
```

**Behavior / invariants:** one row per client (`user_id` PK, aggregate grain per D-1 — no
`model_id` column, no per-model breakdown). `cash_deposit` is declared here for schema completeness
only; **no unit in this layer or the BE layer writes it** — it is reserved for a future
deposit/withdrawal flow (proposal B-3, Q-1). `amount_in_trade` and `previous_amount_in_trade` are
**signed** — no non-negative constraint (D-3): `amount_in_trade` legitimately decreases on a losing
run. No stored composite `value` column exists (B-3 rationale — deliberately deferred, not an
oversight). `last_run_id` uses `ON DELETE SET NULL` (a run is never expected to be deleted under this
model, but the FK stays sane if one ever is). Rows are upserted by the BE service, never inserted by
this layer's migration (no seed data).

**Done when:** `ClientPortfolio` exists with all five business columns plus `updated_at`; `import app.models.post_trade_allocation` succeeds.

---



### DB-4 — `orders.allocated_run_id` idempotency marker (Yes — user req.)

- **Proposal ref:** § Layer 1 B-5; D-9
- **Module:** 5.2
- **Files:** modify `api-backend/app/models/reconciliation.py`
- **Dependencies:** DB-1 (FK target `post_trade_allocation_runs.id`)

**Contract:**

```python
class Order(Base, _TradeRow):
    """IB ORDER-level rows (levelOfDetail='ORDER'), split from ib_activity + ib_trades."""

    __tablename__ = "orders"

    allocated_run_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(native_uuid=False),
        ForeignKey("post_trade_allocation_runs.id", ondelete="SET NULL"),
        nullable=True,
    )

    __table_args__ = (
        UniqueConstraint("orderID", name="uq_orders_orderID"),
        Index("ix_orders_allocated_run_id", "allocated_run_id"),
    )
```

**Behavior / invariants:** `NULL` = unprocessed (the run's input set, per BE C-2); non-`NULL` = the
run that consumed it. Index exists specifically for the `WHERE allocated_run_id IS NULL` scan the
service issues every run. `ON DELETE SET NULL` — deleting a run (not expected under this model)
un-marks its orders so they are eligible for the next run rather than orphaning the FK. `Trade` and
`SymbolSummary` (the sibling `_TradeRow` subclasses) are **not** touched — the marker belongs to
`orders` only, per B-5's scope (order-level rows are the run's input; executions/summaries are not).

**Done when:** `Order.allocated_run_id` exists, nullable, indexed; existing `Order` rows are
unaffected (`NULL` by default); `import app.models.reconciliation` succeeds.

---



### DB-5 — Alembic revision `0014_post_trade_allocation` (Yes — user req.)

- **Proposal ref:** § Layer 1 C ("All changes land in one additive migration")
- **Module:** 5.3
- **Files:** create `api-backend/alembic/versions/<hash>_0014_post_trade_allocation.py`; modify
`api-backend/app/models/__init__.py`; modify `api-backend/alembic/env.py`
- **Dependencies:** DB-1, DB-2, DB-3, DB-4 (models define the target shape)

**Contract (upgrade / downgrade):**

```python
# api-backend/alembic/versions/<hash>_0014_post_trade_allocation.py
revision = "<hash>"
down_revision = "350ce48e2f4d"

def upgrade():
    op.create_table(
        "post_trade_allocation_runs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("trade_date", sa.String(8), nullable=False),
        sa.Column("period_id", sa.Uuid(),
                   sa.ForeignKey("allocation_periods.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="completed"),
        sa.Column("trigger", sa.String(16), nullable=False),
        sa.Column("grand_total", sa.Numeric(28, 10), nullable=True),
        sa.Column("run_by", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_post_trade_allocation_runs_trade_date",
                     "post_trade_allocation_runs", ["trade_date"])

    op.create_table(
        "post_trade_allocations",
        sa.Column("run_id", sa.Uuid(),
                   sa.ForeignKey("post_trade_allocation_runs.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("model_id", sa.Uuid(),
                   sa.ForeignKey("models.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.Uuid(),
                   sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("model_traded", sa.Numeric(28, 10), nullable=False),
        sa.Column("units", sa.Numeric(28, 10), nullable=False),
        sa.Column("units_total", sa.Numeric(28, 10), nullable=False),
        sa.Column("allocated", sa.Numeric(28, 10), nullable=False),
        sa.Column("pct", sa.Numeric(6, 3), nullable=False),
        sa.Column("ib_account", sa.String(255), nullable=True),
        sa.Column("model_name", sa.String(255), nullable=False),
        sa.Column("model_acct", sa.String(255), nullable=True),
    )
    op.create_index("ix_post_trade_allocations_run_model",
                     "post_trade_allocations", ["run_id", "model_id"])

    op.create_table(
        "client_portfolios",
        sa.Column("user_id", sa.Uuid(),
                   sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("cash_deposit", sa.Numeric(28, 10), nullable=False, server_default="0"),
        sa.Column("amount_in_trade", sa.Numeric(28, 10), nullable=False, server_default="0"),
        sa.Column("previous_amount_in_trade", sa.Numeric(28, 10), nullable=False, server_default="0"),
        sa.Column("last_run_id", sa.Uuid(),
                   sa.ForeignKey("post_trade_allocation_runs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.add_column(
        "orders",
        sa.Column("allocated_run_id", sa.Uuid(),
                  sa.ForeignKey("post_trade_allocation_runs.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_orders_allocated_run_id", "orders", ["allocated_run_id"])


def downgrade():
    op.drop_index("ix_orders_allocated_run_id", table_name="orders")
    op.drop_column("orders", "allocated_run_id")
    op.drop_table("client_portfolios")
    op.drop_index("ix_post_trade_allocations_run_model", table_name="post_trade_allocations")
    op.drop_table("post_trade_allocations")
    op.drop_index("ix_post_trade_allocation_runs_trade_date", table_name="post_trade_allocation_runs")
    op.drop_table("post_trade_allocation_runs")
```

`api-backend/app/models/__init__.py` gains:

```python
from app.models.post_trade_allocation import (  # noqa: F401
    RunStatus,
    RunTrigger,
    PostTradeAllocationRun,
    PostTradeAllocation,
    ClientPortfolio,
)
```

`api-backend/alembic/env.py` gains:

```python
import app.models.post_trade_allocation  # noqa: F401
```

**Behavior / invariants:** no data migration — `orders.allocated_run_id` defaults `NULL` for every
existing row (they become "unprocessed" and eligible for the first real run, which is correct: no
order has ever been allocated). Table creation order respects FK dependency
(`post_trade_allocation_runs` → `post_trade_allocations` / `client_portfolios` → `orders` column add);
`downgrade()` reverses that order. No `CheckConstraint` anywhere enforces non-negative money columns
(D-3).

**Done when:** `alembic upgrade head` creates all three tables + the `orders` column + both indexes;
`downgrade -1` cleanly drops all four in dependency-safe order with no orphaned FK; re-`upgrade` is
idempotent (clean re-run).

---



## 7. Frozen seam (from the proposal — verbatim)



### 7.1 The seam (verbatim from proposal §4)

```jsonc
// GET /api/mobo/post-trade-allocation?date=YYYY-MM-DD   (200)
// date optional; defaults to the most recent run. YYYY-MM-DD is the ET trade day.
{
  "tradeDate": "2026-06-03",                // orders.tradeDate ET token this run aggregated (Q-3) — unambiguous, machine-usable
  "settleDay": "Tue 03 Jun 2026",          // display label; currently == tradeDate formatted (Q-3) — kept as a distinct field so a future switch to true T+2 settleDate is a one-line backend change, no DTO shape change
  "grandTotal": 11450000.0,                 // Σ of every model.traded (number, major units)
  "models": [
    {
      "id": "9f2c…",                        // models.id (UUID string)
      "name": "Zero",                       // models.name
      "acct": "U-1234567",                  // IB master account the model traded through
                                            //   (orders.accountId); "—" if none — see D-4
      "traded": 6800000.0,                  // Σ proceeds over the model's orders that day (SIGNED — negative on a losing day; D-3)
      "unitsTotal": 25.0,                   // Σ multiplier across subscribing clients (snapshot)
      "clientShares": [
        {
          "clientId": "3a11…",              // users.id (UUID string)
          "name": "Strathmore Fund",        // client_profiles.name
          "units": 5.0,                     // API field ← DB allocation_model_snapshots.multiplier
          "allocated": 1360000.0,           // traded × multiplier / unitsTotal  (backend-computed; signed — inherits sign from `traded`)
          "pct": 20                         // round(multiplier / unitsTotal × 100)  (backend-computed)
        }
      ]
    }
  ]
}

// GET /api/mobo/post-trade-allocation/runs   (200) — feeds the page's DateControl dropdown
{ "runs": [ { "date": "2026-06-03", "label": "Tue 03 Jun 2026", "grandTotal": 11450000.0 } ] }

// POST /api/mobo/post-trade-allocation/run   (200) — manual "Sync" button (always available)
// body: {}   — no date; the run consumes ALL unallocated orders (D-8) regardless of when they were traded
// 200 → always returns { "newRuns": [...], "latest": PostTradeAllocationView }
//   - unallocated orders found  → one run row per distinct tradeDate consumed, "latest" = the assembled view
//   - none found (D-10)         → one "empty" run row (grandTotal 0, models []), "latest" = that empty view
//   Re-clicking the button is always safe (idempotent no-op on the data; a fresh empty-run row is the only new state)

// Error envelope: FastAPI default { "detail": "<msg>" }; 401 → UNAUTHORIZED, 403 → forbidden,
// 404 → no run for that date. Numeric money fields cross the wire as JSON numbers in MAJOR units
// (the mock already uses e.g. 6_800_000), NOT Numeric(28,10) strings — the page's ptaMoney() and
// Recharts consume numbers. (Contrast the recon DTOs, which carry DecimalStrings.)
```

**Per-layer obligations (verbatim from proposal §4.2, DB row):**


| Layer    | What this layer contributes                                                                                                                                                                                    | What this layer assumes from the other side                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Database | Persists runs, per-cell allocation records (frozen `units`/`allocated`/`pct`/`ib_account`), and per-client portfolio balances (`cash_deposit` static + signed `amount_in_trade` + `previous_amount_in_trade`). | Backend writes only within one run transaction; `orders.model` resolves to a `models` row; a confirmed period exists. |




### 7.2 How this layer honours the seam

- **What this layer contributes to the seam:** the storage the DTO in §7.1 is projected from —
`post_trade_allocation_runs` (run header + `trade_date`/`period_id`/`status`/`trigger`/
`grand_total`), `post_trade_allocations` (the frozen `units`/`allocated`/`pct`/`ib_account`/
`model_name`/`model_acct` per client-cell), `client_portfolios` (`cash_deposit`/`amount_in_trade`/
`previous_amount_in_trade`), and `orders.allocated_run_id` (the idempotency marker BE's "unallocated
orders" query filters on).
- **What this layer assumes from the other side:** BE writes runs, cells, the `orders` marker update,
and the portfolio upsert all inside **one transaction** per run (so a rollback leaves `orders`
unmarked); BE resolves `orders.model` (free text) to a `models.id` before writing
`post_trade_allocations.model_id`; BE only ever reads/writes against a `period_id` that references an
**existing, confirmed** `allocation_periods` row.
- **Change protocol:** any edit to §7 requires editing the proposal §4 first; this section is then
re-copied verbatim. Never edit §7 in isolation.

---



## 8. Internal unit testing



### 8.1 Test setup

- **Framework / runner:** `pytest` if present in the venv, else a plain `python` script asserting on an
in-memory SQLite `Base.metadata.create_all`. Command: `cd api-backend && .venv/Scripts/python.exe -m pytest -q` (or the script). Migration-specific checks run via the Alembic CLI commands in §3.2, not
pytest.
- **Fixtures / seed:** in-memory SQLite engine; `Base.metadata.create_all(engine)`; a minimal seeded
`User`, `Model`, `AllocationPeriod` row set built inline per test (no fixture framework — matches 008
DB doc's style).
- **Isolation:** hermetic; DB-layer only — no BE/FE imports, no network, no live Postgres.
- **Layer isolation (critical):** tests import only from `app.models.`* and stdlib/`sqlalchemy`. They
do not import `app.libs.post_trade_allocation.*` (BE) or exercise any route. Where a test needs to
confirm the seam's storage shape, it asserts on ORM column/attribute presence, not on a live BE
response.
- **Code generation:** concrete test code is written by the `test-gen` skill (arg: `lite` | `standard`
| `thorough`) into `api-backend/tests/models/test_post_trade_allocation.py`, using §8.2/§8.3 as its
spec.



### 8.2 Coverage matrix


| Unit | Behaviour(s) to prove                                                                                                                                                                                       | Seam mocks needed |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| DB-1 | Run row persists with `status`/`trigger` enum values round-tripping as their string values; `trade_date` is not constrained unique (two rows, same `trade_date`, both persist)                              | none              |
| DB-2 | Cell row persists with composite PK `(run_id, model_id, user_id)`; a second insert with the same triple violates the PK; signed `allocated`/`model_traded` (negative values) persist and round-trip exactly | none              |
| DB-3 | Portfolio row persists per `user_id`; `amount_in_trade` and `previous_amount_in_trade` accept and round-trip negative `Decimal` values; defaults are `0` on insert with no explicit value                   | none              |
| DB-4 | `Order.allocated_run_id` defaults `NULL`; can be set to a run's `id`; querying `WHERE allocated_run_id IS NULL` excludes marked rows                                                                        | none              |
| DB-5 | `alembic upgrade head` / `downgrade -1` / re-`upgrade` is clean; downgrade drops exactly the 3 tables + 1 column, leaves pre-existing `orders` rows and their data intact                                   | none              |




### 8.3 Test goals (per unit)



#### DB-1

- **Positive:** inserting a `PostTradeAllocationRun` with `status=RunStatus.EMPTY, trigger=RunTrigger.SCHEDULED` persists and reloads with those exact enum members; two rows with the
same `trade_date` both persist (no unique-constraint violation).
- **Negative:** omitting `trigger` (nullable=False) raises on flush/commit; an invalid `period_id`
(no matching `allocation_periods` row) raises an FK violation on a backend that enforces FKs
(SQLite in-memory with `PRAGMA foreign_keys=ON`, or skip-and-note if the test DB doesn't enforce it).
- **Invariants:** `status`/`trigger` always round-trip as their `.value` string, never the Python enum
repr, regardless of which enum member is stored.
- **Seam mocks:** none — this is a pure storage-shape test.



#### DB-2

- **Positive:** a full cell row (all non-null columns populated, including a negative `allocated` and
`model_traded`) persists and every column reloads with the exact `Decimal` value stored (no rounding
drift at `Numeric(28,10)`/`Numeric(6,3)` precision).
- **Negative:** a second insert with an identical `(run_id, model_id, user_id)` triple raises a
primary-key violation.
- **Invariants:** the sign of `allocated`/`model_traded` survives a store/reload round trip for both
positive and negative values (property-style: parametrize over a positive and a negative case).
- **Seam mocks:** none.



#### DB-3

- **Positive:** inserting a `ClientPortfolio` row with no explicit values for `cash_deposit`/
`amount_in_trade`/`previous_amount_in_trade` persists all three as `0`; explicitly setting
`amount_in_trade` to a negative `Decimal` persists and reloads that exact negative value.
- **Negative:** omitting `user_id` (the PK) raises on flush/commit.
- **Invariants:** `cash_deposit` is never mutated by any operation this test file exercises (this
layer never writes it) — a test creates a row, "runs" a synthetic update to `amount_in_trade` only,
and asserts `cash_deposit` is unchanged.
- **Seam mocks:** none.



#### DB-4

- **Positive:** a newly-inserted `Order` row has `allocated_run_id is None`; setting it to a
`PostTradeAllocationRun.id` and reloading returns that id.
- **Negative:** none beyond ordinary FK behavior (out of scope to test SQLite's FK enforcement here).
- **Invariants:** `SELECT` filtering `WHERE allocated_run_id IS NULL` returns exactly the set of
`Order` rows never assigned a run, regardless of how many other rows have been marked — proves the
idempotency query BE relies on behaves correctly at the storage layer.
- **Seam mocks:** none.



#### DB-5

- **Positive:** `alembic upgrade head` from `350ce48e2f4d` succeeds and creates
`post_trade_allocation_runs`, `post_trade_allocations`, `client_portfolios`, plus
`orders.allocated_run_id`, on a scratch/dev DB copy.
- **Negative:** none (a migration test is a procedural check, not an input-validation check).
- **Invariants:** `downgrade -1` removes exactly those four schema objects and leaves every
pre-migration `orders` row's other columns byte-identical; a subsequent `upgrade head` reproduces the
same schema (round-trip idempotency).
- **Seam mocks:** none — this is a CLI/manual gate per §3.2, not a pytest case.



### 8.4 Aggregate gate

- All unit tests green, plus the migration up/down/up cycle in §3.2, are merge gates.
- Target coverage for changed lines: all new columns/tables exercised by at least one positive
assertion (this is a small, additive layer — no percentage target beyond "every unit has a test").
- Chosen `test-gen` level for this layer: **standard** (happy path + main negative + PK/FK violation
per unit) — set here as the default for an additive schema layer with no authz/role surface of its
own; raise to `thorough` only if the execution schedule flags this migration as higher-risk.

---



## 9. Definition of done & rollback

**Definition of done (this layer):**

- [ ] Every §6 unit (DB-1..DB-5) committed on `post-trade-allocation-integration-db`; each commit left
  the branch green.
- [ ] §8 unit tests all pass; the `alembic upgrade head` → `downgrade -1` → `upgrade head` cycle (§3.2)
  is clean on a dev-DB copy.
- [ ] §7 matches the proposal's frozen seam verbatim (checked against the proposal on the parent
  branch, not against the BE/FE branches, which are not visible here).
- [ ] PR opened; human owns the merge to `post-trade-allocation-integration`.

**Rollback:** the branch revert restores code with no side effects (no code outside this layer's new
files/edits is touched). `alembic downgrade -1` drops `post_trade_allocations`,
`post_trade_allocation_runs`, `client_portfolios` (with their indexes/FKs) and drops
`orders.allocated_run_id` — **additive-only, so clean and non-lossy**: every pre-existing `orders` row
keeps all its original column data; only the new (always-`NULL`-until-a-run-fires) marker column is
removed. No existing table's existing rows are altered by the `0014` migration at any point.