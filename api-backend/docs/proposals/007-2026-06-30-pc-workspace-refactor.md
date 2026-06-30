# PC Workspace Refactor — Database, Backend & Frontend

> Status: **DRAFT — all three layers written, pending implementation approval.**
> Scope: anything that powers (or is consumed by) the **Portfolio Commander workspace**: trading models, client subscriptions, allocation matrix, allocation period snapshots, and the IB reconciliation staging tables that feed PC reporting.
> Constraint: business logic must not change at a high level. Refactor is structural / model / index / type cleanup.

---

## Layer 1 — Database

### A. Tables in scope

| File | Tables |
|---|---|
| `app/models/pc.py` | `models`, `model_materials`, `model_changes`, `client_subscriptions`, `allocation_periods`, `allocation_model_snapshots` |
| `app/models/reconciliation.py` | `ib_activity`, `ib_trades` |
| `app/models/users.py` (PC-relevant column only) | `client_profiles.ib_account` |

Migrations involved today: `e5f6a7b8c9d0_0008_pc_workspace.py` (PC tables), `d4e5f6a7b8c9_0007_ib_trades_table.py` + `c3d4e5f6a7b8_0006_merge_orders_trades_into_ib_activity.py` (reconciliation).

---

### B. Findings

#### B-1. `ib_activity` and `ib_trades` — merge and split (MANDATORY)

Both are 89–91-column wide staging tables for IB Flex exports. `_ActivityRow` and `_TradeConfirmRow` in `app/models/reconciliation.py` duplicate ~75 % of their columns (just renamed: `ibOrderID` ↔ `orderID`, `tradePrice` ↔ `price`, `tradeMoney` ↔ `amount`, `ibCommission` ↔ `commission`, …) — 700 LOC of mostly-parallel column declarations, repeated again in migrations 0004 / 0005 / 0006 / 0007. Each table also stores **two grain levels in one row** (`ORDER` and `EXECUTION`), separated only by the string column `levelOfDetail`.

**Refactor — per spec:**

1. **Keep the `ib_trades` (TCF) schema as the canonical column set.**
2. **Split by level-of-detail:**
   - `orders` — rows where `levelOfDetail = 'ORDER'`
   - `trades` — rows where `levelOfDetail = 'EXECUTION'`
3. **Add `symbol_summaries`** — same schema as `ib_trades`; populated by the ingest pipeline as a higher-level rollup row. No PC-side column changes vs. the TCF schema.
4. **Drop `ib_activity` and `ib_trades`** after a column-aligned `INSERT … SELECT` backfill. AF (`ib_activity`) rows are re-mapped into the TCF column names via the alias table below; rows whose AF columns have no TCF analogue are dropped with a row-count log line.

| Source (AF / `ib_activity`) | Target (TCF / new tables) |
|---|---|
| `ibOrderID` | `orderID` |
| `ibExecID` | `execID` |
| `tradePrice` | `price` |
| `tradeMoney` | `amount` |
| `ibCommission` | `commission` |
| `ibCommissionCurrency` | `commissionCurrency` |
| `settleDateTarget` | `settleDate` |
| `taxes` | `tax` |
| `transactionID` | `tradeID` (already shared name — no-op) |
| (AF-only) `changeInPrice`, `changeInQuantity`, `closePrice`, `cost`, `fifoPnlRealized`, `fxRateToBase`, `initialInvestment`, `mtmPnl`, `holdingPeriodDateTime`, `openDateTime`, `whenRealized`, `whenReopened`, `origTransactionID`, `relatedTradeID`, `relatedTransactionID`, `positionActionID`, `rtn`, `traderID` | **dropped** (not present in TCF; logged) |

5. **Collapse the two abstract mixins into one** in `app/models/reconciliation.py`: `_TradeRow` (single source of truth) → applied to `Order`, `Trade`, `SymbolSummary`. Net: ~350 LOC removed from `reconciliation.py`, ~250 LOC removed across migration files.
6. **Index policy on the new tables:**
   - `orders.orderID` — UNIQUE
   - `trades.orderID` — INDEX (FK-shaped join key from EXECUTION → ORDER)
   - `trades.execID` — UNIQUE
   - `symbol_summaries.symbol` — INDEX
   - `symbol_summaries (symbol, tradeDate)` — UNIQUE if one row per symbol per day; confirm grain.

**Migration plan (data-preserving):**

New revision `0009_split_activity_trades_into_orders_trades_summaries.py`:
1. `CREATE TABLE orders, trades, symbol_summaries` (TCF schema).
2. `INSERT INTO trades SELECT … FROM ib_trades WHERE levelOfDetail = 'EXECUTION'`.
3. `INSERT INTO orders SELECT … FROM ib_trades WHERE levelOfDetail = 'ORDER'`.
4. `INSERT INTO trades SELECT <mapped cols> FROM ib_activity WHERE levelOfDetail = 'EXECUTION'` (alias table above).
5. `INSERT INTO orders SELECT <mapped cols> FROM ib_activity WHERE levelOfDetail = 'ORDER'`.
6. `DROP TABLE ib_activity, ib_trades`.
   - `symbol_summaries` starts empty — populated by the next ingest run.

---

#### B-1b. Extend `models` with prospectus / fee fields (MANDATORY)

Add the following columns to the `models` table. All nullable so existing draft models keep loading without backfill.

| Column | Type | Source label | Notes |
|---|---|---|---|
| `description`    | `TEXT`            | Description           | Long narrative copy. |
| `underlyings`    | `TEXT`            | Traded Underlyings    | Long free-form list. |
| `risk`           | `TEXT`            | Leverage and Risk     | Long narrative. |
| `liquidity`      | `VARCHAR(255)`    | Liquidity             | Short string ("Daily", "Monthly", …). |
| `reporting`      | `VARCHAR(255)`    | Reporting             | Short string. |
| `nav_perf`       | `VARCHAR(255)`    | NAV and Performance   | Short string. |
| `mgmt_fee`       | `Numeric(9, 6)`   | Management Fee        | Decimal rate: `0.020000` = 2 %. Nullable. |
| `incentive_fee`  | `Numeric(9, 6)`   | Incentive Fee         | Decimal rate: `0.200000` = 20 %. Nullable. |

`mgmt_fee` / `incentive_fee` supersede the hardcoded 2 % / 20 % decision. Frontend falls back to the hardcoded constants only when both columns are `NULL` (legacy rows).

**ORM-layer change** (`app/models/pc.py::Model`):

```python
description:   Mapped[str | None]      = mapped_column(Text, nullable=True)
underlyings:   Mapped[str | None]      = mapped_column(Text, nullable=True)
risk:          Mapped[str | None]      = mapped_column(Text, nullable=True)
liquidity:     Mapped[str | None]      = mapped_column(String(255), nullable=True)
reporting:     Mapped[str | None]      = mapped_column(String(255), nullable=True)
nav_perf:      Mapped[str | None]      = mapped_column(String(255), nullable=True)
mgmt_fee:      Mapped[Decimal | None]  = mapped_column(Numeric(9, 6), nullable=True)
incentive_fee: Mapped[Decimal | None]  = mapped_column(Numeric(9, 6), nullable=True)
```

Migration: pure `ADD COLUMN × 8` in revision `0009`, no backfill required. `ModelCreate` / `ModelUpdate` / `ModelOut` gain all eight fields; `_TRACKED_FIELDS` in `service.py` grows to include them.

---

#### B-2. `model_materials` versioning is not race-safe (Recommend)

`ModelService.upload_material` derives the next version with `f"v{len(existing) + 1}"`. Two concurrent uploads can race past the Python count and produce duplicate `v3` rows blocked only by the unique constraint *after* both have written the file — leaving an orphan blob.

**Refactor:** Add a `version_no INT NOT NULL` column populated server-side from `MAX(version_no) + 1` inside the same transaction. Keep the string `version` as a denormalized display field.

---

#### B-3. `models.symbols` is an opaque JSON blob (Recommend)

The PC workspace already cares about symbols at the row level (`symbol_summaries`). Storing the model→symbol relationship as freeform JSON prevents JOIN `symbol_summaries ↔ models` on symbol and blocks per-symbol weight constraints at the DB level.

**Refactor:** Add `model_symbols` (`model_id UUID FK`, `symbol VARCHAR(32)`, `weight Numeric(28,10) NULL`, PK `(model_id, symbol)`). Keep `models.symbols` JSON during the transition, then drop in a follow-up migration.

---

#### B-4. `allocation_model_snapshots` over-replicates `model_size` (Recommend — Option 1)

`model_size` is per-`model_id` (not per-user) but is stored on every row, letting it drift across rows that should agree. Also causes N+1 in `derive_confirmed_matrix` (see Backend B, item 4).

**Refactor (Option 1 — normalize):** Introduce `allocation_period_models (period_id, model_id, model_size Numeric, model_name VARCHAR)` and drop `model_size` from `allocation_model_snapshots`. The `model_name` column also eliminates the N+1 live-model lookup in `derive_confirmed_matrix`.

---

#### B-5. `ClientSubscription.multiplier` declared `Mapped[float]` over `Numeric(28, 10)` (Yes)

DB stores 10-decimal precision; ORM round-trips via `float`. Same issue on `AllocationModelSnapshot.multiplier` / `.model_size` and `Model.model_size`. Quiet precision loss in the column that drives `fund = multiplier × model_size`.

**Refactor:** Change Python type annotations to `Decimal`. No DB migration needed. Call sites in `_build_matrix` already cast correctly; fixing the ORM types makes the inputs arrive as `Decimal` rather than relying on the explicit casts.

---

#### B-6. PC migration declares UUID PK columns as `sa.String(36)` (Yes)

The 0008 migration uses `sa.Column("id", sa.String(36), …)`. The ORM uses `Uuid(native_uuid=False)`. Both render as `CHAR(36)` in MySQL today, but future tooling (Alembic autogenerate) will diff against it.

**Refactor:** Normalize the 0008 migration's column types to `Uuid(native_uuid=False)` to match the convention from 0003. No data change.

---

#### B-9. Missing indexes for known access patterns (Yes)

| Table | Access pattern | Missing index |
|---|---|---|
| `allocation_model_snapshots` | "list a client's history across periods" | `(user_id, period_id)` |
| `model_changes` | "show latest change of a model" | `(model_id, created_at DESC)` |

**Refactor:** Add both composite indexes in revision `0009`.

---

### C. Summary of DB-layer changes

| # | Change | Required? | Effort | Data migration? |
|---|---|---|---|---|
| B-1 | Merge `ib_activity` + `ib_trades` → split into `orders` / `trades` + add `symbol_summaries` (TCF schema) | **Yes (mandatory per spec)** | M | Yes (column-aligned `INSERT … SELECT`) |
| B-1b | Add 8 new columns to `models` (description / underlyings / risk / liquidity / reporting / nav_perf / mgmt_fee / incentive_fee) | **Yes (mandatory per spec)** | XS | No (all nullable) |
| B-2 | `model_materials.version_no INT` for race-safe versioning | Recommend | S | Yes (backfill from `version` string) |
| B-3 | `model_symbols` join table; deprecate `models.symbols` JSON | Recommend | S | Yes (JSON → rows) |
| B-4 | Normalize `model_size` out of `allocation_model_snapshots` into `allocation_period_models` | Recommend (Opt 1) | S | Yes (per-period dedupe) |
| B-5 | Fix ORM types: `multiplier` / `model_size` → `Decimal` | Yes | XS | No |
| B-6 | Normalize 0008 PK column types to `Uuid(native_uuid=False)` | Yes | XS | No |
| B-9 | Add `(user_id, period_id)` and `(model_id, created_at)` composite indexes | Yes | XS | No |

All migrations bundled into one new revision: **`0009_pc_workspace_db_refactor.py`**. Down-migration writes everything back into `ib_activity` + `ib_trades` for safety.

---

## Layer 2 — Backend

### A. Mandatory: split `app/libs/pc/` into `app/libs/trade_models/` and `app/libs/allocation_matrix/`

The two concerns share **no** mutable state — they only share a read-only `Model` lookup. Splitting them isolates blast radius and removes the cross-private-type imports flagged in DB B-10.

**Target layout:**

```
app/libs/
├── trade_models/
│   ├── __init__.py
│   ├── router.py          # /api/pc/models/*  +  /api/pc/subscriptions/*
│   ├── service.py         # ModelService, SubscriptionService
│   ├── repository.py      # ModelRepository, MaterialRepository, SubscriptionRepository
│   ├── storage.py         # FileStorage (LocalStorage / NasStorage) — verbatim move
│   └── schemas.py         # ModelCreate/Update/Out, MaterialOut, ChangeOut, SubscriptionOut
│
└── allocation_matrix/
    ├── __init__.py
    ├── router.py          # /api/pc/allocation/*
    ├── service.py         # AllocationService — period state machine + matrix derivation
    ├── repository.py      # AllocationRepository (periods, snapshots, period_models)
    │                      # MatrixReadRepository  (single-query cell / roster reads)
    ├── cache.py           # ETag + in-process TTL cache — verbatim move from pc/cache.py
    ├── scheduler.py       # auto-open monthly period — verbatim move
    └── schemas.py         # PeriodCreate/Out/Lite, AllocationViewOut, AllocationCell/Model/Client
```

**Dependency direction:** `allocation_matrix` reads from `trade_models` via `ModelRepository.bulk_get(model_ids)`. `trade_models` does **not** import from `allocation_matrix`.

**`app/libs/pc/` is removed entirely.** Two import-site updates only:
- `app/main.py` — register `trade_models.router` and `allocation_matrix.router`; start `allocation_matrix.scheduler`.
- `tests/` — update imports.

**Schemas move out of `app/schemas/pc.py`** into `trade_models/schemas.py` and `allocation_matrix/schemas.py`. Delete `app/schemas/pc.py`.

This split also drops:
- The private-type leak `from app.libs.pc.repository import _SubscriptionCell` in `derive_confirmed_matrix` — replaced by a publicly-named `AllocationCellRow` DTO in `allocation_matrix.repository`.
- `scheduler.py` bypassing the service — after the move it calls `AllocationService.create_period`, single source of truth for the single-open invariant.

---

### B. Mandatory: lower-time-complexity matrix derivation

#### B-1. Baseline

The current `_build_matrix` Python loop is already Θ(C + M + S). The wins are **constant-factor + round-trip count + precision-correctness**, not asymptotic.

#### B-2. Concrete wins

| # | Today | Refactor | Saves |
|---|---|---|---|
| 1 | `derive_open_matrix` issues **3 separate queries** | One combined UNION ALL (cells + roster), `LIVE` filter in SQL; second query for models. **Two round-trips total**. | ~30 % wall-clock vs 3 RTTs |
| 2 | `list_models()` returns all models, Python filters `LIVE` | `WHERE status = 'live'` in SQL | O(M_deleted) Python work + payload |
| 3 | Per-row `Decimal(str(r.model_size))` and `Decimal(str(r.multiplier))` | Drop the `str()` round-trip — SQLAlchemy already returns `Decimal` for `Numeric` columns | O(S) string allocs |
| 4 | `derive_confirmed_matrix` does **N+1**: `get_model(snap.model_id)` once per distinct model | After DB B-4 (`allocation_period_models` with `model_name`), the confirmed view reads a single table — live `models` never queried | N+1 → 0 |
| 5 | `compute_etag_components` issues **3 watermark queries** | One query with three `(MAX, COUNT)` subqueries | 2 RTTs |
| 6 | `_build_matrix` accumulates `col_units` / `col_fund` in Python per cell | Push to SQL: `SUM(multiplier)` / `SUM(multiplier * model_size)` via `GROUP BY model_id` | constant per row on large S |
| 7 | `AllocationViewOut.from_dict` rebuilds Pydantic models from the raw dict `_build_matrix` just produced | Have repository emit `AllocationCellRow` DTOs; service builds `AllocationViewOut` directly | O(S+C+M) allocations |

Combined effect on `/api/pc/allocation`:
- DB round-trips: **3 → 2** (open), **N+1 → 1** (confirmed).
- Python passes over the cell list: **3 → 1**.
- Dict allocations: **~3·(S+C+M) → ~(S+C+M)**.

#### B-3. The cell-read query (two round-trips)

```sql
-- Round-trip 1: cell stream + roster in one UNION ALL
SELECT 'cell'   AS row_kind, cs.user_id, cs.model_id, cs.multiplier, m.model_size, cp.ib_account, NULL, NULL, NULL
  FROM client_subscriptions cs
  JOIN models          m  ON m.id = cs.model_id AND m.status = 'live'
  JOIN client_profiles cp ON cp.user_id = cs.user_id
UNION ALL
SELECT 'client' AS row_kind, u.id, NULL, NULL, NULL, cp.ib_account, cp.name, u.email, u.firebase_uid
  FROM users u
  JOIN client_profiles cp ON cp.user_id = u.id
 WHERE u.portal = 'client';

-- Round-trip 2: models + column aggregates
SELECT m.id, m.name, m.model_size,
       COALESCE(SUM(cs.multiplier), 0)                AS col_units,
       COALESCE(SUM(cs.multiplier * m.model_size), 0) AS col_fund
  FROM models m
  LEFT JOIN client_subscriptions cs ON cs.model_id = m.id
 WHERE m.status = 'live'
 GROUP BY m.id;
```

---

### C. Other backend findings

#### C-1. Router does direct DB access — bypasses the service layer (Recommend)

`router.py::get_allocation` issues `db.query(AllocationPeriod).filter(label == period)` and imports `AllocationPeriod` / `PeriodStatus` inline.

**Refactor:** `AllocationService.find_period_by_label(label) -> AllocationPeriod | None`. Router calls the service only.

#### C-2. `ModelService.delete_model` silently returns the live model (Yes — correctness)

```python
if model.status == ModelStatus.LIVE:
    return model      # caller has no idea the delete was rejected
```

**Refactor:** raise `HTTPException(409, "Cannot delete a live model")`. Today the frontend assumes a 2xx means deletion happened and drops the row from its cache — live data corruption risk.

#### C-3. `ModelService.upload_material` versioning is race-prone (Yes — pairs with DB B-2)

`next_n = len(existing) + 1` is computed in Python with no row lock. Concurrent uploads can both observe `len == 2`, compute `v3`, and the second insert fails on the unique constraint *after* the file is on disk — orphan blob.

**Refactor:** `MaterialRepository.next_version_no(model_id)` doing `SELECT COALESCE(MAX(version_no), 0) + 1 … FOR UPDATE` inside the same transaction.

#### C-4. `confirm_period` flushes per-row inside its loop (Recommend)

`write_snapshots()` calls `db.flush()` per row inside its loop. If a later snapshot row triggers an integrity error, prior flushed rows live in the session until rollback. Today `get_db` rolls back on exception so live behavior is correct; the intent is non-obvious.

**Refactor:** `db.add_all(rows)` + one final flush, wrapped in an explicit `with db.begin_nested():` block.

#### C-5. `AllocationService` depends on three full repositories (Recommend)

Every request builds `SubscriptionRepository(db) + AllocationRepository(db) + ModelRepository(db)`. After the split, `AllocationService` should depend on `AllocationRepository` + `MatrixReadRepository` + a narrow `ModelLookup` Protocol (1-method facade from `trade_models`).

#### C-6. `cache.py` uses module-level globals (Recommend)

`_store: dict` and `_lock: threading.Lock` are module globals — per-test isolation is awkward (one test's cache state leaks into the next).

**Refactor:** Wrap in an `AllocationCache` class instantiated once at module load; expose `clear()` for tests.

#### C-8. `_TRACKED_FIELDS` change-log diff doesn't handle long-text diffs (Recommend)

Once DB B-1b lands (8 new columns including `description` / `risk` long-text), `model_changes.detail` rows become substantially heavier without a per-field handler — two 2-KB blobs stored on every description edit.

**Refactor:** Introduce a `FieldDiffer` per tracked field (text fields emit a `"changed"` sentinel instead of dumping both blobs). Pairs with DB B-1b.

---

### D. Route simplification & combination

> **Decision (settled):** D-1, D-2, D-3, D-4 are **accepted**.
>
> Final PC route surface after this layer lands:
>
> ```
> GET    /models                                    list (status filter optional)
> POST   /models                                    create (draft)
> GET    /models/{id}[?include=materials,changes]   detail (D-4 — opt-in expansion)
> PATCH  /models/{id}                               edit + status transitions (D-1)
> GET    /models/{id}/materials                     standalone list
> POST   /models/{id}/materials                     upload
> GET    /models/{id}/materials/{mid}/download      download
> GET    /models/{id}/changes                       standalone change log
>
> GET    /allocation                                matrix + embedded full PeriodOut[] (D-2)
> POST   /allocation/periods                        create open period (admin override)
> PATCH  /allocation/periods/{id}                   confirm via {status:'confirmed'} (D-3)
> ```
>
> Net: **14 → 10 routes**.

#### D-1. `PATCH /models/{id}` subsumes `POST /publish` + `DELETE /models/{id}`

All three mutate the `models` row and are guarded by the same `Action.MODEL_MANAGE`. Clients post `{status: 'live'}` instead of hitting `/publish`; same for delete. Service publish preconditions (`model_size` set, ≥ 1 material) remain unchanged.

#### D-2. Drop `GET /allocation/periods`; fold full `PeriodOut` columns into embedded list

`GET /allocation` already embeds `periods: PeriodLiteOut[]`. Folding `confirmed_at` / `confirmed_by` / timestamps directly into `PeriodLiteOut` makes `/allocation` self-contain everything the periods picker needs — no second round-trip.

#### D-3. `PATCH /allocation/periods/{id}` with `{status:'confirmed'}` subsumes `POST /confirm`

Confirm is the only writable transition on a period. The irreversibility check stays in the service.

#### D-4. Compound `GET /models/{id}?include=materials,changes`

Saves 2 round-trips per model detail page navigation. Dedicated child routes remain available for callers that want only one slice.

---

### E. Summary of Backend-layer changes

| # | Change | Required? | Effort |
|---|---|---|---|
| A | Split `app/libs/pc/` → `app/libs/trade_models/` + `app/libs/allocation_matrix/`; delete `app/schemas/pc.py` | **Yes (mandatory)** | M |
| B | Matrix derivation: two-query reads, SQL aggregates, drop `Decimal(str())` casts, fix confirmed N+1, single watermark query | **Yes (mandatory)** | M |
| C-1 | `AllocationService.find_period_by_label`; router stops querying DB | Recommend | XS |
| C-2 | `delete_model` raises 409 on LIVE instead of silent no-op | **Yes** (correctness) | XS |
| C-3 | Race-safe `next_version_no` (pairs with DB B-2) | Yes | XS |
| C-4 | Explicit `begin_nested()` around `confirm_period` snapshot write | Recommend | XS |
| C-5 | `AllocationService` depends on `ModelLookup` Protocol, not full `ModelRepository` | Recommend | XS |
| C-6 | Wrap `cache.py` globals in `AllocationCache` class with `clear()` | Recommend | XS |
| C-8 | `FieldDiffer` registry for `_TRACKED_FIELDS` (preps for B-1b's wide text columns) | Recommend | S |
| D-1 | Collapse `POST /publish` + `DELETE` into `PATCH` with `{status}` | **Accepted** | S |
| D-2 | Drop `GET /allocation/periods`; fold full columns into embedded periods list | **Accepted** | XS |
| D-3 | Collapse `POST /confirm` into `PATCH` with `{status:'confirmed'}` | **Accepted** | XS |
| D-4 | Compound `GET /models/{id}?include=materials,changes` | **Accepted** | S |

---

## Layer 3 — Frontend

Scope = `admin-frontend/`. The PC workspace surface today:

| File | LOC | Role |
|---|---|---|
| `app/(roles)/pc/model-management/page.tsx` | **1139** | one mega-page |
| `app/(roles)/pc/model-management/action.ts` | 27 | trivial re-export shim |
| `app/(roles)/pc/allocation-matrix/page.tsx` | **590** | one mega-page |
| `app/(roles)/pc/allocation-matrix/action.ts` | 11 | trivial re-export shim |
| `hooks/api/useModels.ts` | 47 | read-only hook (no mutations) |
| `hooks/api/useAllocation.ts` | 102 | read-only hook + ETag cache (no mutations) |
| `server/pc/index.ts` | 133 | `apiClient` wrappers |
| `lib/pc/models.ts` | 90 | mapper + re-export hub |
| `lib/pc/allocation.ts` | 113 | mapper + `AllocationView` method-closure interface |
| `lib/pc/types.ts` | 213 | DTO + view types |
| `lib/pc/format.ts`, `lib/pc/change-log.ts` | 73 | presentation helpers |
| `components/pc/Shared.tsx` | 243 | Modal/Fact/Eyebrow/StatusChip/Ticks/VerBadge/FeeCalc |
| **Total** | **2632** | |

The canonical chain `page → hook → action → server → api-client → endpoints` holds only for queries. Mutations short-circuit the hook: `page.tsx` imports 8 actions and orchestrates them inline.

---

### A. Findings

#### A-1. `action.ts` is a no-value re-export shim — populate it (don't delete) (Yes — user req.)

> **Canonical pattern** (from `Megaannum-Frontend/src/app/(tms)/**/actions.ts`): the action tier is the **error-envelope + logging boundary**. Each function wraps a server call in `try/catch`, emits `logger.log` / `logger.json` traces, and normalises errors into `APIResponse | APIErrorResponse`.

Both PC `action.ts` files today are bare thunks — no try/catch, no logging, no error normalisation. Reference shape:

```ts
// app/(roles)/pc/model-management/actions.ts (after — note: plural filename)
"use server";

import { createModel as createModelServer } from "@/server/pc";
import { logger } from "@/lib/logger";

export async function createModel(body: ModelCreate): Promise<APIResponse<ModelDTO> | APIErrorResponse> {
  try {
    logger.log("🔄 Creating model…");
    const response = await createModelServer(body);
    logger.json("✅ Create-model response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error creating model:", { error });
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
```

**Refactor:**
- **Rename** `action.ts` → `actions.ts` (plural; matches the reference convention).
- **Add** try/catch + `logger.log` / `logger.json` envelope to every action.
- **Keep** the action tier in the route folder next to `page.tsx`.
- Hooks call the action tier; they do **not** import `@/server/pc` directly.

#### A-2. Pages bypass the hook on mutations — chain breaks (Yes — user req.)

`model-management/page.tsx` imports eight mutation actions directly. The chain the page follows is `page → action → server → api-client → endpoints` — the hook is skipped. Same on allocation-matrix: `confirmPeriodAction` is imported and called from the page; `useAllocation` only exposes `{data, loading, refetch}`.

**Refactor — re-route every PC mutation through the hook:**

```ts
// hooks/api/useModels.ts (after)
export function useModels() {
  return {
    data, loading, error, refetch,
    createModel, updateModel,          // updateModel covers publish + delete (D-1)
    uploadMaterial, downloadMaterial,
  };
}

// hooks/api/useModelDetail.ts (new — see A-4 / B-4)
export function useModelDetail(id: string | null) {
  return { data /* model + materials + changes */, loading, refetch, uploadMaterial, downloadMaterial };
}

// hooks/api/useAllocation.ts (after)
export function useAllocation(period?: string) {
  return { data, loading, refetch, confirmPeriod };
}
```

After this, `page.tsx` imports the hook and **nothing else from `actions.ts` or `@/server/pc`**.

#### A-3. Too many helpers / handlers in `page.tsx` (Yes — user req.)

`model-management/page.tsx` (1139 LOC) contains 11 in-file components and 7 in-page handlers. `allocation-matrix/page.tsx` (590 LOC) contains 8 in-file components plus `handleConfirm`.

**Refactor — promote each in-file component to `admin-frontend/components/pc/` (outside `app/`):**

> All PC components live under `admin-frontend/components/pc/`. The route folder under `app/(roles)/pc/<feature>/` contains exactly: `page.tsx`, `actions.ts`, and (optionally) `loading.tsx`.

```
admin-frontend/
├── app/(roles)/pc/
│   ├── model-management/
│   │   ├── page.tsx                    (≈ 90 LOC: hook + layout + compose)
│   │   ├── actions.ts                  (try/catch + logger wrappers — A-1)
│   │   └── loading.tsx
│   └── allocation-matrix/
│       ├── page.tsx                    (≈ 80 LOC)
│       ├── actions.ts
│       └── loading.tsx
│
└── components/pc/
    ├── Shared.tsx                      (unchanged)
    ├── model-management/
    │   ├── CardGrid.tsx
    │   ├── ModelTable.tsx
    │   ├── ModelDetailPanel.tsx
    │   ├── OverviewTab.tsx
    │   ├── MaterialsTab.tsx
    │   ├── ChangesTab.tsx
    │   ├── CreateModelForm.tsx
    │   ├── EditModelForm.tsx
    │   └── CalcModal.tsx
    └── allocation-matrix/
        ├── StatStrip.tsx
        ├── PeriodPicker.tsx
        ├── ViewToggle.tsx
        ├── HowToRead.tsx
        ├── Matrix.tsx                  (includes MatrixCell)
        ├── DetailPanel.tsx
        ├── ConfirmModal.tsx
        └── EmptyPeriod.tsx
```

The handlers (`handleCreate`, `handlePublish`, `handleDelete`, `handleUploadMaterial`, `handleDownloadMaterial`, `handleConfirm`) move into the hooks. After this, `page.tsx` is pure composition.

Concrete sketch of the new `page.tsx`:

```ts
export default function ModelManagementPage() {
  const { data: models, loading, createModel, updateModel,
          uploadMaterial, downloadMaterial } = useModels();
  const [openId, setOpenId] = useState<string | null>(null);
  const [layout, setLayout] = useState<Layout>("grid");
  return (
    <PageLayout title="Model Management">
      <Toolbar layout={layout} onLayout={setLayout} onNew={…} />
      {layout === "grid"
        ? <CardGrid models={models} onOpen={setOpenId} />
        : <ModelTable models={models} onOpen={setOpenId} />}
      {openId && <ModelDetailPanel id={openId} onClose={…} />}
    </PageLayout>
  );
}
```

#### A-4. Overly redundant wrappers — delete or merge (Yes — user req.)

| Wrapper | What it does | Action |
|---|---|---|
| `lib/pc/models.ts` re-exports | re-exports `fmtMoney / fmtMoneyShort / computeFees` from `./format` | **Delete the re-exports.** Have consumers import `@/lib/pc/format` directly. |
| `lib/pc/allocation.ts::AllocationView` closure | wraps DTO in method accessors (`.cell()`, `.colUnits()`, `.modelById()`) over O(N) `.find()` lookups | **Replace** with the DTO + a `useMemo`-built `{ byId, cells }` selector inside the hook. Removes ~75 LOC. |
| `mapDtoToModel` field renames | renames `model_size→size`, `mgmt_fee→mgmt`, `incentive_fee→incentive` | After DB B-1b, keep the mapper but consider keeping DTO-shaped field names and dropping the aliases. |
| Page-local `materialsById: Record<string, Material[]>` | mirror of server state per opened model | Delete. Owned by `useModelDetail(id)` after D-4. |
| Page-local `models` state copied from `useModels().data` | `useEffect(() => setModels(remote))` + ad-hoc `setModels(filter…)` for optimistic delete | Delete. Page reads `useModels().data` directly; optimistic update belongs in the hook with rollback on error. |

#### A-5. The canonical chain after the refactor (Yes — user req.)

| Layer | Location | What's there | Imports allowed |
|---|---|---|---|
| **page.tsx** | `app/(roles)/pc/<feature>/page.tsx` | composition + layout + UI-only state | `hooks/api/*`, `@/components/pc/<feature>/*`, `lib/pc/format`, `lib/pc/types` |
| **components** | `components/pc/<feature>/*.tsx` | presentational + interactive components | `lib/pc/format`, `lib/pc/types`, `@/components/pc/Shared`, `@/components/ui/*` |
| **hooks/api/useX** | `hooks/api/useX.ts` | read state + write methods + optimistic updates | `@/app/(roles)/pc/<feature>/actions`, `lib/pc/types` |
| **actions.ts** | `app/(roles)/pc/<feature>/actions.ts` | server-action thunks with try/catch + `logger` | `@/server/pc`, `@/lib/logger`, `@/types/*` |
| **server/pc/index.ts** | `server/pc/index.ts` | `apiClient` calls + DTO typing; `"use server"` | `@/server/api-client`, `@/server/endpoints`, `@/lib/pc/types` |
| **server/api-client.ts** | `server/api-client.ts` | fetch + cookie + error envelope | — |
| **server/endpoints.ts** | `server/endpoints.ts` | URL constants | — |

Each layer imports only **from layers below it**.

---

### B. Adapting to backend changes

| BE change | FE change | Files touched |
|---|---|---|
| **D-1** — `PATCH /models/{id}` w/ `{status}` | `publishModel(id)` → `updateModel(id, {status:'live'})`. `deleteModel(id)` → `updateModel(id, {status:'deleted'})`. Hook still exposes `publishModel` / `deleteModel` as convenience methods. Remove `PUBLISH` + `DELETE` from `endpoints.ts`. | `server/pc/index.ts`, `hooks/api/useModels.ts`, `server/endpoints.ts` |
| **D-2** — `GET /allocation/periods` dropped | Delete `getPeriods` from `server/pc/index.ts` + remove `ENDPOINTS.PC.PERIODS`. Widen `Period` type to carry `confirmed_at` / `confirmed_by`. | `server/pc/index.ts`, `lib/pc/types.ts`, `server/endpoints.ts` |
| **D-3** — `PATCH /allocation/periods/{id}` | `confirmPeriod(id)` calls `updatePeriod(id, {status:'confirmed'})` under the hood; same hook name. Remove `ENDPOINTS.PC.CONFIRM`. | `server/pc/index.ts`, `hooks/api/useAllocation.ts`, `server/endpoints.ts` |
| **D-4** — `GET /models/{id}?include=materials,changes` | New hook `useModelDetail(id)` issues the compound call once on detail-open. Replaces page-local `materialsById` effect. Saves 2 round-trips per detail navigation. | `hooks/api/useModelDetail.ts` (new), `server/pc/index.ts`, `components/pc/model-management/ModelDetailPanel.tsx` |
| **DB B-1b** — 8 new model fields | `Model` type gains `description`, `underlyings`, `risk`, `liquidity`, `reporting`, `nav_perf`, `mgmt_fee`, `incentive_fee`. `OverviewTab` renders them as Fact rows. `CreateModelForm` / `EditModelForm` add inputs. `DEFAULT_MGMT_PCT` / `DEFAULT_INCENTIVE_PCT` become last-resort fallbacks for legacy `NULL` rows. | `lib/pc/types.ts`, `lib/pc/models.ts`, `OverviewTab.tsx`, `CreateModelForm.tsx`, `EditModelForm.tsx` |
| **DB B-1** — `orders` / `trades` / `symbol_summaries` | None. PC workspace doesn't read reconciliation tables. | — |
| Module split `trade_models` / `allocation_matrix` | None on the wire. API routes unchanged. | — |

---

### C. Additional findings

#### C-1. Empty "Changes" tab — `getChanges` is wired but never called (Yes)

`page.tsx` reads `m.changes` to render the changes tab, but `GET /models` does **not** return `changes`. So `m.changes` is always `[]` and the changes tab silently renders empty. Fixed by D-4 (`useModelDetail` populates both `materials` and `changes` in one call).

#### C-2. `handleCreate` issues up to 3 sequential `refetch()` calls (Recommend)

In the create→upload→publish flow, `refetch()` runs at multiple branches. Three sequential `GET /models` calls in the worst case. Move to one terminal `refetch()` at the end of the orchestration (inside `useModels.createModel` after A-2).

#### C-4. Dead bare-array tolerance branch in `mapDtoToModels` (Recommend)

```ts
const list = Array.isArray(dto) ? dto : Array.isArray(dto.models) ? dto.models : [];
```

The backend returns `ModelsListOut = {models: ModelOut[]}` — never a bare array. Delete the bare-array branch.

---

### D. Summary of Frontend-layer changes

| # | Change | Required? | Effort |
|---|---|---|---|
| A-1 | Rename `action.ts` → `actions.ts`; add try/catch + `logger` per reference pattern | **Yes** (user req.) | S |
| A-2 | Route all mutations through hooks; restore canonical chain | **Yes** (user req.) | M |
| A-3 | Split `page.tsx` mega-files; promote components to `components/pc/<feature>/*` (outside `app/`) | **Yes** (user req.) | M |
| A-4 | Delete redundant wrappers: re-exports in `lib/pc/models.ts`, `AllocationView` closure, page-local mirror state | **Yes** (user req.) | S |
| A-5 | Enforce layer-boundary import rules | **Yes** (user req.) | XS |
| B-1 | Adapt to D-1 (PATCH-based status transitions) | **Yes** | XS |
| B-2 | Adapt to D-2 (drop `getPeriods`) | **Yes** | XS |
| B-3 | Adapt to D-3 (PATCH-based confirm) | **Yes** | XS |
| B-4 | New `useModelDetail` hook for D-4 compound endpoint | **Yes** | S |
| B-5 | New model fields (DB B-1b) — types + forms + overview tab | **Yes** | S |
| C-1 | Fix empty changes tab (subsumed by B-4 once D-4 lands) | Yes | — |
| C-2 | Single terminal `refetch()` in `useModels.createModel` | Recommend | XS |
| C-4 | Drop bare-array tolerance branch in `mapDtoToModels` | Recommend | XS |

After this layer lands:
- `model-management/page.tsx` shrinks from **1139 → ~90 LOC**.
- `allocation-matrix/page.tsx` shrinks from **590 → ~80 LOC**.
- `lib/pc/` loses the `models.ts` re-export hub and the `AllocationView` closure layer (~150 LOC).
- Mutation path goes from `page → action(shim) → server → api-client` to `page → hook → actions → server → api-client` — canonical chain restored for both queries and mutations.
