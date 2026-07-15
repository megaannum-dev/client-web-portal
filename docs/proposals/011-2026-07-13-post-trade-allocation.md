# 011 — Post-Trade Allocation: periodic run, persistence, and frontend integration

> Status: **DRAFT — pending implementation approval.**
> Scope: The MOBO Post-Trade Allocation page (`admin-frontend/app/(roles)/mobo/post-trade-allocation/`), currently mock-only, gets a real backend: a periodic run that aggregates each model's daily net traded amount from `orders`, splits it per client by the latest **confirmed** allocation matrix (`allocation_model_snapshots`), persists the allocation records, updates client portfolio values, and serves the result to the page. Out of frame: the reconciliation/exception screens, live IB fetch, the client-subscription write flow, and any change to the allocation-matrix (PC) workspace.
> Constraint: **No design/layout change** to the page or its components — the seam already exists (`lib/mobo/allocation.ts` → `PostTradeAllocationView`); only its body flips from mock to API. All business logic lives in the backend; the frontend is a pure view (the 006 D-5 / MOBO precedent).

---

## 1. Context and Motivation

The Post-Trade Allocation page ships fully-built but mock-only. Its data seam,
`admin-frontend/lib/mobo/allocation.ts`, is the single import site of the mock
(`lib/mock/mobo-data.ts` — `PTA_MODELS` / `PTA_CLIENTS` / `PTA_UNITS`) and computes the pro-rata
client split itself. Its header comment states the acceptance test plainly: *"deleting `lib/mock` and
pointing this loader at a real API must require ZERO edits in any component — only the body of
`loadPostTradeAllocation`."* The view contract is already frozen in `lib/mobo/types.ts`
(`PostTradeAllocationView`, `PtaModelAllocation`, `PtaClientShare`).

The backend pieces this feature needs already exist — they just have never been joined:

- **`orders` / `trades`** (`api-backend/app/models/reconciliation.py`) — IB Flex rows. `orders` is
  order-level (`levelOfDetail='ORDER'`, unique `orderID`). It carries a free-text **`model`** column
  (line 99), money columns (`netCash`, `amount`, `proceeds`, `quantity`, `price`, commissions), and
  raw IB date **strings** (`tradeDate`, `settleDate` as `String(8)` `YYYYMMDD`; `dateTime` as
  `String(20)`). The only typed timestamp is `ingested_at DateTime(tz)` (server clock).
- **`models`** (`app/models/pc.py`) — the firm's investment models (Zero, Diversified) as rows;
  `name`, `model_size`, `status`.
- **`allocation_periods`** + **`allocation_model_snapshots`** (`period_id, user_id, model_id,
  multiplier, ib_account`) + **`allocation_period_models`** (`period_id, model_id, model_name,
  model_size`) — a **confirmed** period's frozen matrix. This is *the latest confirmed allocation
  matrix* the requirement names as the split basis.
- **`client_profiles.ib_account`** and **`users`** — client identity and IB account.

What is missing: (a) no table stores an allocation run or its records; (b) **no portfolio value is
stored anywhere** in the codebase (grep for `portfolio` returns nothing — client value is only ever
derived on read as `multiplier × model_size`); (c) no MOBO backend endpoint or service exists, and
the `MOBO` role's action set in `app/libs/auth/actions.py` is empty; (d) the two `orders`/`trades`
tables have never been read by application code (the importer aside).

> **Why now / why this order.** The requirement is the first consumer of the joined data: it turns
> the standalone `orders` book and the confirmed allocation matrix into a client-facing allocation
> result. It depends on 006/007 (the model book, subscriptions, and the confirmed-snapshot mechanism)
> being landed — they are. DB → Backend → Frontend is the readability order; after approval the layers
> fan out to independent impl docs and may be built in any order against the §4 seam.

---

## 2. Goals

1. A periodic **run** that, for a given trading day, aggregates each model's net traded amount from
   `orders`, splits it across the model's subscribing clients by the **latest confirmed**
   `allocation_model_snapshots` matrix, persists one allocation record per (run, model, client), and
   updates each client's portfolio value (retaining the prior value).
2. Three new DB objects — `post_trade_allocation_runs`, `post_trade_allocations`,
   `client_portfolios` — landed via one additive Alembic migration on head `350ce48e2f4d`.
3. A FastAPI feature module `app/libs/post_trade_allocation/` owning **all** the aggregation, split,
   persistence, and portfolio math server-side, exposed under `/api/mobo/post-trade-allocation`.
4. Two new authorization actions wired into `Action` / `ROLE_ACTIONS`, granting the `MOBO` and
   `ADMIN` roles view + run access.
5. The frontend seam `lib/mobo/allocation.ts` flipped from the mock to the API as a pure DTO→view
   mapper (no client-side pro-rata math), with the `PTA_*` mock deleted — **zero component change**
   beyond the page swapping its synchronous `loadPostTradeAllocation()` for a hook.
6. The timezone discrepancy (IB = ET, CRM = HKT) resolved the simplest correct way: the run window is
   keyed off the IB `tradeDate` `YYYYMMDD` string token directly (already ET-native), never off the
   server clock (`ingested_at`).

## 3. Non-Goals

- **Live IB fetch / reconciliation / exception screens** — separate MOBO tracks; this proposal only
  reads the already-stored `orders`.
- **The client-subscription write flow** and any allocation-matrix (PC) change — owned by 006/007;
  this proposal only *reads* the confirmed snapshot.
- **A second/Diversified model actually trading** — the trading team trades only `Zero` today
  (requirement §Spec); the code groups by `orders.model` generically so Diversified works when it
  starts trading, but no per-model special-casing is built.
- **Mark-to-market / position-book valuation.** `client_portfolios.amount_in_trade` tracks the
  **signed net cashflow** of the trading pot (Σ `proceeds` per D-3, pro-rated per client) — a running
  cash balance that goes up on profit and down on loss. What it is **not**: a position-level valuation
  (open positions marked at current market price), an unrealized P&L, or a composite "portfolio value"
  column (see B-3 note). Those need a position book this proposal doesn't build.
- **Opening/merging any PR** — the human owns `main`; agents stop at a pushed branch + drafted PR.

---

## 4. Cross-layer seam (frozen here)

### 4.1 The wire contract

The response DTO **is** the existing frontend view type `PostTradeAllocationView` — the backend
returns it ready-to-render. The only field-name remap is `units ↔ multiplier` (same as 006 D-4).

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

### 4.2 Per-layer obligations against the seam

| Layer | What this layer contributes | What this layer assumes from the other side |
|---|---|---|
| Database | Persists runs, per-cell allocation records (frozen `units`/`allocated`/`pct`/`ib_account`), and per-client portfolio balances (`cash_deposit` static + signed `amount_in_trade` + `previous_amount_in_trade`). | Backend writes only within one run transaction; `orders.model` resolves to a `models` row; a confirmed period exists. |
| Backend | Serves the `PostTradeAllocationView` above at the three routes with codes {200, 202, 401, 403, 404}; owns all aggregation/split/portfolio math; maps `multiplier → units`. | DB objects exist per Layer 1; `allocation_model_snapshots` holds the confirmed matrix; `orders.netCash/proceeds/amount` populated. |
| Frontend | Consumes the DTO verbatim; `lib/mobo/allocation.ts` becomes a DTO→view mapper (formatting only, no math); page uses a hook. | Backend returns the DTO exactly as §4.1, money as numbers in major units, `units` already remapped. |

### 4.3 Change protocol (post-freeze)

Any edit to §4 requires a revision/addendum in this file, dated and initialled; each impl doc's §7 is
re-copied in the same change set. The seam is never renegotiated between impl docs directly.

---

## Layer 1 — Database

### A. Tables / objects in scope

| File | Tables / objects |
|---|---|
| `app/models/post_trade_allocation.py` (**new**) | `post_trade_allocation_runs`, `post_trade_allocations`, `client_portfolios`, enums `RunStatus`, `RunTrigger` |
| `app/models/__init__.py` (edit) | export the new classes (Alembic discovery) |
| `alembic/env.py` (edit) | `import app.models.post_trade_allocation` |
| `alembic/versions/<rev>_0014_post_trade_allocation.py` (**new**) | additive migration, `down_revision = "350ce48e2f4d"` |
| — reads only — | `orders` (`app/models/reconciliation.py`), `models` / `allocation_periods` / `allocation_model_snapshots` / `allocation_period_models` / `client_profiles` / `users` (`app/models/pc.py`, `users.py`) |

Conventions follow `app/models/pc.py`: `Uuid(native_uuid=False)` PKs (`default=uuid.uuid4`),
value-backed `SAEnum(..., native_enum=False, values_callable=…)`, `Numeric(28, 10)` for money,
`DateTime(timezone=True)` with `server_default=func.now()`.

### B. Findings

#### B-1. No table records an allocation run (Yes — user req.)

Requirement step 4 ("the post-trade allocation records will be saved") has no home. There is no run
header and no per-client record anywhere.

**Refactor:** add **`post_trade_allocation_runs`** — one row per (trading-day) run:

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `Uuid(native_uuid=False)` PK | no | `default=uuid.uuid4` |
| `trade_date` | `String(8)` | no | the IB ET `YYYYMMDD` token this run's orders were traded on (see B-4); **not** unique (D-9) |
| `period_id` | `Uuid` FK → `allocation_periods.id` | no | the confirmed period whose matrix was the split basis (audit) |
| `status` | `String(16)` | no | `RunStatus` value enum `completed`/`empty`/`failed` (D-10); `server_default "completed"` |
| `trigger` | `String(16)` | no | `RunTrigger` value enum `scheduled`/`manual` |
| `grand_total` | `Numeric(28, 10)` | yes | cached Σ of model traded amounts (header stat) |
| `run_by` | `String(255)` | yes | actor display name (null for scheduled) |
| `created_at` | `DateTime(tz)` | no | = run timestamp; immutable, no `updated_at` |

Index (not unique) on `trade_date` for DateControl lookups. Uniqueness is **not** enforced here —
idempotency is guaranteed at the `orders` level via the `allocated_run_id` marker (B-5, D-9); a
"re-click" on the manual button when nothing new was ingested is a natural no-op.

#### B-2. No per-cell allocation record (Yes — user req.)

**Refactor:** add **`post_trade_allocations`** — one immutable row per (run, model, client), storing
the frozen split so the page renders history without recomputation and the record is auditable:

| Column | Type | Null | Notes |
|---|---|---|---|
| `run_id` | `Uuid` FK → `post_trade_allocation_runs.id` | no | **part of composite PK**; `ON DELETE CASCADE` |
| `model_id` | `Uuid` FK → `models.id` | no | **part of composite PK** |
| `user_id` | `Uuid` FK → `users.id` | no | **part of composite PK**; the client |
| `model_traded` | `Numeric(28, 10)` | no | the model's aggregated net traded amount (denormalized so a model total is one read) |
| `units` | `Numeric(28, 10)` | no | frozen `allocation_model_snapshots.multiplier` at run time (API field `units`, D-4) |
| `units_total` | `Numeric(28, 10)` | no | Σ units across the model's clients at run time (frozen divisor) |
| `allocated` | `Numeric(28, 10)` | no | `model_traded × units / units_total` (was "delegated"; renamed per user, matches page semantics) |
| `pct` | `Numeric(6, 3)` | no | `units / units_total × 100`, rounded for display |
| `ib_account` | `String(255)` | yes | frozen client IB account (`allocation_model_snapshots.ib_account`) |
| `model_name` | `String(255)` | no | frozen model name at run time |
| `model_acct` | `String(255)` | yes | IB master account the model traded through (`orders.accountId`, D-4) |

**Primary key:** composite `(run_id, model_id, user_id)`. Index on `(run_id, model_id)` for the
per-model rollup read. Rows are append-once per run (never mutated).

> **Why denormalize `model_traded`/`units_total`/`model_name`/`model_acct` onto the cell.** The page's
> `PtaModelAllocation` needs the model total, account, and units-total alongside each client share;
> keeping them on the row (like `allocation_period_models` freezes `model_name`/`model_size`) makes
> the GET a single indexed scan and keeps the historical record correct if a model is renamed later.

#### B-3. No client portfolio balances are stored (Yes — user req.)

Requirement step 5 ("the portfolio of the clients will be updated, together with the previous
portfolio value") has nowhere to write. Nothing in the schema stores a client balance — it is only
ever derived on read (`multiplier × model_size` in `allocation_matrix`). Two distinct client-facing
balances need homes (user, 2026-07-14 correction): **cash deposit** (static, what the client put in —
external mechanism, not touched by this proposal) and **amount in trade** (dynamic, the working
capital in the trading pot; updated **signed** by each run — profit adds, loss subtracts).

**Refactor:** add **`client_portfolios`** — one row per client, **aggregate grain** (Accepted, per
product owner — see D-1):

| Column | Type | Null | Notes |
|---|---|---|---|
| `user_id` | `Uuid` FK → `users.id` PK | no | one row per client (portal = `client`) |
| `cash_deposit` | `Numeric(28, 10)` | no | static; client's paid-in cash. `server_default "0"`; **not written by this proposal** (declared here so the concept has a home; a future deposit/withdrawal flow owns writes to it) |
| `amount_in_trade` | `Numeric(28, 10)` | no | signed working capital in the trading pot; `server_default "0"` |
| `previous_amount_in_trade` | `Numeric(28, 10)` | no | `amount_in_trade` **before** the last run; `server_default "0"` |
| `last_run_id` | `Uuid` FK → `post_trade_allocation_runs.id` | yes | the run that last touched this row |
| `updated_at` | `DateTime(tz)` | no | `server_default=func.now()`, `onupdate=func.now()` |

On each run, per client: `previous_amount_in_trade = amount_in_trade; amount_in_trade = amount_in_trade
+ Σ allocated (this run)`. **`allocated` is signed** (D-3): a losing model-day produces a negative
`traded`, hence a negative `allocated`, and correctly reduces the client's `amount_in_trade`. A
subscribing client of a losing model on that day therefore *does* absorb their proportional share of
the loss — matching the requirement's "distribute profit or loss proportionally". Idempotency falls
out of B-5 (order marker): only unallocated orders drive a run, so a re-click when none have arrived
is a no-op — balances can never double-count. Empty runs (D-10) do **not** touch these columns.

> **Why no stored `value` column.** A composite "portfolio value" (e.g. `cash_deposit +
> amount_in_trade`, or true mark-to-market against open positions) is a **derived** or **future**
> concept — this proposal deliberately doesn't materialize it. `cash_deposit` and `amount_in_trade`
> are the two ground-truth columns this run actually knows how to reason about; anything named `value`
> today would be either a trivial sum better computed on read, or a stub for the position-book / MTM
> work still out of scope (see Non-Goals). Deferring the name avoids baking a definition into the
> schema that a later valuation feature would have to migrate away from.

#### B-4. Timezone discrepancy — resolve by keying on the IB date token (Accepted)

`orders.tradeDate` / `settleDate` are raw `String(8)` `YYYYMMDD` tokens emitted by IB in **US ET**;
the only typed timestamp, `ingested_at`, is the **server (HKT)** clock. Converting between them is
avoidable.

**Refactor (no schema change — a query convention, stated here so all layers honour it):** the run
window is a single **ET trade day**, selected as `WHERE orders.tradeDate = :yyyymmdd` against the raw
token. No timezone arithmetic, no `ingested_at` in the window. The scheduled job's "previous trading
day" is computed as an ET calendar date and formatted to `YYYYMMDD` before querying. This is the
simplest correct resolution the requirement asks for.

> **`orders.model` → `models` resolution.** `orders.model` is free-text (e.g. `"Zero"`). It resolves
> to a `models` row by **`name`** (case-insensitive exact match) — trivial today since only `Zero`
> trades. Orders whose `model` matches no live model are grouped under that raw string and **skipped
> with a logged count** (no silent drop). A proper FK is a future cleanup (Open questions).

#### B-5. Mark each order with the run that allocated it (Yes — user req.)

Requirement (user update, 2026-07-14): *"post-trade allocation can ONLY perform upon the new trade
records. We MUST avoid reallocating on the already allocated records."* Both scheduled and manual
triggers must skip anything already processed — re-clicks and scheduler/manual overlap are safe.

**Refactor:** add one nullable FK column to `orders`:

| Column | Type | Null | Notes |
|---|---|---|---|
| `orders.allocated_run_id` | `Uuid(native_uuid=False)` FK → `post_trade_allocation_runs.id` | yes | `ON DELETE SET NULL`; **indexed** for the `IS NULL` scan |

Semantics: a row with `allocated_run_id IS NULL` is *unprocessed*; the run's transaction (§C-2) marks
every order it consumed with its `run_id`. Deleting a run (unlikely — we never delete under the new
model, but the ON DELETE fallback keeps the FK sane) clears the marker so the orders can be re-run.

This is the single source of truth for "new records only" — cheaper and safer than window-comparing
`ingested_at` timestamps or diffing hashes.

### C. Summary of DB-layer changes

| # | Change | Required? | Effort | Data migration? |
|---|---|---|---|---|
| B-1 | New `post_trade_allocation_runs` (run header, `trade_date` **not** unique) | Yes — user req. | S | No (additive) |
| B-2 | New `post_trade_allocations` (per-cell records, column `allocated` not `delegated`) | Yes — user req. | S | No (additive) |
| B-3 | New `client_portfolios` (cash_deposit + amount_in_trade + previous_amount_in_trade) | Yes — user req. | S | No (additive) |
| B-4 | Run window keyed on `orders.tradeDate` ET token (query convention) | Accepted | XS | No |
| B-5 | `orders.allocated_run_id` nullable FK + index — "new orders only" marker | Yes — user req. | XS | No (additive column, defaults `NULL`) |

All changes land in **one** additive migration `0014_post_trade_allocation`
(`down_revision = "350ce48e2f4d"`). Additive-only ⇒ `alembic downgrade -1` drops the three tables and
the `orders.allocated_run_id` column cleanly (existing `orders` rows keep their data; only the new
column is dropped).

---

## Layer 2 — Backend

### A. Module layout

New feature package mirroring `app/libs/allocation_matrix/` (the reference for "freeze derived state
into rows", `confirm_period`):

```
app/libs/post_trade_allocation/
  router.py       # APIRouter(prefix="/mobo", tags=["mobo"]); the 3 routes
  service.py      # PostTradeAllocationService — ALL business logic (aggregate, split, persist, portfolio)
  repository.py   # read: order aggregates + confirmed-snapshot rows; write: run + cells + portfolio
  scheduler.py    # weekday auto-run job (start_scheduler hook), mirrors allocation_matrix/scheduler.py
app/schemas/post_trade_allocation.py   # Pydantic response models (PtaView, PtaModel, PtaClientShare, RunListOut)
```

Mounted in `app/main.py` alongside the existing routers: `app.include_router(pta_router, prefix="/api")`
→ routes under `/api/mobo/…`. The weekday job is registered in the `main.py` lifespan next to
`allocation_matrix`'s scheduler.

### B. Mandatory logic — the run (Yes — user req.)

`PostTradeAllocationService.run(trigger, actor)` is one DB transaction implementing the requirement's
business-logic steps 1–5. **Input is the set of unallocated orders**, not a date window (D-9):

1. **Pick up new orders** — `SELECT … FROM orders WHERE allocated_run_id IS NULL` (B-5). If the set
   is empty, write **one empty run row** (`status='empty'`, `grand_total=0`, no cells, no portfolio
   update, `trade_date` = today's ET token) and return it (D-10). This preserves the audit trail for
   trade-less days, keeps the Sync button's confirmation UX honest, and gives DateControl a
   "scheduler ran, no trades" entry. Re-clicks stay safe: the very next call finds `allocated_run_id
   IS NULL` still empty and simply writes another empty row — YAGNI on dedupe, the scheduler fires
   at most once per weekday and a manual re-click is a deliberate user action.
2. **Aggregate per (tradeDate, model)** — group the unallocated set by `(orders.tradeDate,
   orders.model)`, resolve `model → models.id` by name (B-4), and sum the net traded amount as
   **Σ `proceeds`** (signed; D-3). A profitable trading day nets positive, a losing day nets negative;
   the sign flows through the pro-rata into every client's `allocated` and into their
   `amount_in_trade` (B-3). Capture each model's IB master account from `orders.accountId` (D-4). One
   `post_trade_allocation_runs` row is written per distinct `tradeDate` in the batch.
3. **Resolve the split basis** — find the **latest confirmed** `allocation_periods` row; for each
   model read its `allocation_model_snapshots` (multiplier + ib_account per client). `unitsTotal` =
   Σ multiplier; per client `allocated = traded × multiplier / unitsTotal`, `pct = round(multiplier
   / unitsTotal × 100)`. A model with no snapshot rows contributes its bar with no segments.
4. **Persist and mark** — write the run headers (`period_id`, `grand_total`) and the per-cell
   `post_trade_allocations` rows; **`UPDATE orders SET allocated_run_id = <run.id>`** for every order
   consumed by that run (all in one tx).
5. **Update portfolios** — per client across the whole batch, `previous_amount_in_trade =
   amount_in_trade; amount_in_trade += Σ allocated` (signed — a losing day subtracts). `cash_deposit`
   is **not touched** (B-3). Set `last_run_id` to the newest run in this batch. Clients with no row
   get one (all balances default `0`).

All money math uses `Decimal`; the DTO serializes to JSON **numbers in major units** (§4.1).

### C. Other backend findings

#### C-1. `MOBO` role has no actions (MANDATORY)

`app/libs/auth/actions.py` — the `MOBO` role maps to an empty action set, so no guard can admit it.

**Refactor:** add two actions and grant them:

```python
class Action(str, enum.Enum):
    ...
    POST_TRADE_ALLOCATION_VIEW = "mobo:pta_view"
    POST_TRADE_ALLOCATION_RUN  = "mobo:pta_run"

ROLE_ACTIONS = {
    ...
    AdminRole.MOBO:  {POST_TRADE_ALLOCATION_VIEW, POST_TRADE_ALLOCATION_RUN},
    AdminRole.ADMIN: set(Action),   # already grants everything
}
```

Every route guards with `require_action(...)` exactly as `app/libs/allocation_matrix/router.py` does.

#### C-2. Idempotency by construction (Yes — user req.)

Scheduled + manual overlap and re-clicks must not double-allocate. Idempotency is not solved by
"reverse-then-replace" anymore — it is *structural*: the run's input set is `orders WHERE
allocated_run_id IS NULL`, so anything already processed is invisible. The run's writes and the
`UPDATE orders SET allocated_run_id = …` sit in the **same transaction**; a rollback leaves orders
unmarked, letting the next attempt retry cleanly. A run that finds nothing writes an **empty run row**
(D-10) but touches no cells and no portfolios — never double-counts.

> A late-arriving order for an already-processed `tradeDate` naturally lands in the *next* run — a new
> `post_trade_allocation_runs` row for that same `tradeDate` is produced (drop of the unique
> constraint, D-9). The DateControl in the frontend surfaces the latest run per `tradeDate`; older
> runs remain for audit.

#### C-3. Scheduler is env-var-gated; manual button is always live (Yes — user req.)

Development shouldn't fire the run daily by accident; production wants it automatic. Yet the "Sync"
button must be usable regardless of scheduler state.

**Refactor:** `scheduler.py` reads a small env block on `start_scheduler`:

| Var | Type | Default | Notes |
|---|---|---|---|
| `PTA_SCHEDULER_ENABLED` | bool (`"1"`/`"true"`) | `false` | if false, `scheduler.py` no-ops; the manual POST route stays fully available |
| `PTA_SCHEDULER_TIME` | `HH:MM` | `"18:00"` | fire time in the `PTA_SCHEDULER_TZ` zone |
| `PTA_SCHEDULER_TZ` | IANA zone | `"America/New_York"` | ET aligns with `orders.tradeDate` (B-4) |
| `PTA_SCHEDULER_DAYS` | comma set | `"MON,TUE,WED,THU,FRI"` | trading calendar / holiday feed out of scope (Q-2) |

Scheduled fire → `service.run(trigger="scheduled", actor=None)`. Manual POST → the same, with
`trigger="manual"` and `actor=<display name>`. Both share the same "unallocated orders only" input,
so nothing changes semantically between triggers.

### D. Route / contract

> **Decision (settled):** three routes, no cell-write surface (the page is read-only + a run trigger).
>
> Final route surface after this layer lands:
> ```
> GET  /api/mobo/post-trade-allocation?date=YYYY-MM-DD   VIEW  → PostTradeAllocationView (default: latest tradeDate with a non-empty run)
> GET  /api/mobo/post-trade-allocation/runs              VIEW  → run list for the DateControl (distinct tradeDate; can filter `?includeEmpty=1`)
> POST /api/mobo/post-trade-allocation/run               RUN   → manual "Sync": consumes unallocated orders; writes an empty run row if none (D-10)
> ```
> Net: **0 → 3 routes** (greenfield). GET aggregates all `post_trade_allocations` rows whose run's
> `trade_date` matches the requested date (multiple runs per date can exist under D-9; totals sum
> across them; `empty` runs contribute nothing). GET does **not** recompute from `orders`. POST always
> returns a run — the assembled view for a real run, or an empty-run object with `grandTotal=0` and
> `models=[]` for a trade-less day.

### E. Summary of Backend-layer changes

| # | Change | Required? | Effort |
|---|---|---|---|
| A | New `app/libs/post_trade_allocation/` package + `app/schemas/post_trade_allocation.py`; mount in `main.py` | Yes — user req. | M |
| B | `service.run()` — pick-up-new-orders / aggregate / split / persist+mark / portfolio (steps 1–5) | Yes — user req. | M |
| C-1 | Two `MOBO` actions in `actions.py` + `ROLE_ACTIONS` | MANDATORY | XS |
| C-2 | Structural idempotency via `orders.allocated_run_id` (no reverse-and-replace) | Yes — user req. | XS |
| C-3 | Env-var-gated `scheduler.py` (`PTA_SCHEDULER_ENABLED` etc.) + lifespan registration | Yes — user req. | S |
| — | Empty-run row on trade-less days (`RunStatus.EMPTY`, no cells, no portfolio touch) | Yes — user req. (D-10) | XS |

---

## Layer 3 — Frontend

| File | Role |
|---|---|
| `admin-frontend/lib/mobo/allocation.ts` | seam — **repurpose** mock loader → DTO→view mapper |
| `admin-frontend/lib/mobo/types.ts` | view types — **unchanged** (already the DTO shape) |
| `admin-frontend/app/(roles)/mobo/post-trade-allocation/page.tsx` | page — swap sync load for a hook |
| `admin-frontend/components/mobo/allocation/*` | **unchanged** (StackedBarChart, Panels) |
| `admin-frontend/lib/mock/mobo-data.ts` | **delete** the `PTA_*` block |

The canonical fetch chain is already shipped for PC/RM: `page → hooks/api/* → app/**/actions.ts
("use server") → server/<area>/index.ts → server/api-client.ts → server/endpoints.ts`. There is **no
`server/mobo`** yet — this layer adds it, replicating `server/pc` + `hooks/api/useAllocation.ts`.

### A. Findings

#### A-1. The seam computes the split client-side (Yes — user req.)

`lib/mobo/allocation.ts` reads `PTA_UNITS` and computes `delegated`/`pct`/`unitsTotal` in
`buildClientShares`. Per the seam (§4) the backend now returns these.

**Refactor:** replace the mock body with a **DTO→view mapper** `mapDtoToPostTradeAllocation(dto)`:
structural pass-through + any formatting only, **no math** (the DTO already carries `traded`,
`unitsTotal`, `allocated`, `pct`, `grandTotal`). Keep `ptaMoney()` exported from here (presentation
formatter stays frontend, matching the PC `lib/pc/format.ts` precedent). Delete the `PTA_*` mock and
its import. Rename `PtaClientShare.delegated` → `allocated` in `lib/mobo/types.ts` and update the two
component read sites (`components/mobo/allocation/Panels.tsx`, `StackedBarChart.tsx`) — grep for
`\.delegated\b` confirms the blast radius is a handful of lines, no visual change.

#### A-2. The page loads synchronously and has no Sync affordance (Yes — user req.)

`page.tsx` calls `const { … } = loadPostTradeAllocation()` at render, and there is no way for a MOBO
user to trigger a run from the UI.

**Refactor:**
- Add `hooks/api/usePostTradeAllocation.ts` — mirror `useAllocation.ts` (`{data, loading, error,
  refetch, sync}`, module cache keyed by date, refetch on focus). `sync()` calls the POST action,
  invalidates the cache, and refetches.
- Add `app/(roles)/mobo/post-trade-allocation/actions.ts` (`"use server"` wrappers over `server/mobo`
  for GET view / GET runs / POST run).
- Page swaps its synchronous call for the hook, wires a **"Sync"** button in the page header (new,
  small — a `<Button onClick={sync} disabled={loading}>Sync</Button>` next to the existing scope
  toggle). The button is **always enabled**, matching the backend contract; an empty-run response
  (D-10) surfaces as a discreet "No new trades — checked at HH:MM ET" toast (`sonner` is already in
  the project).
- `DateControl`'s hardcoded `PTA_DISCRETE_DATES` is fed from the `/runs` endpoint.

#### A-3. New transport plumbing (Yes)

**Refactor:** add `server/mobo/index.ts` (typed per-endpoint fns returning `APIResult<DTO>`, reusing
`apiClient`) and a `MOBO` block in `server/endpoints.ts`:

```ts
const MOBO = "/api/mobo";
MOBO: {
  PTA:      `${MOBO}/post-trade-allocation`,
  PTA_RUNS: `${MOBO}/post-trade-allocation/runs`,
  PTA_RUN:  `${MOBO}/post-trade-allocation/run`,
}
```

`server/api-client.ts` is reused as-is (cookie→Bearer, `APIResult<T>`). The `id_token` cookie
mirroring the PC/RM screens rely on is already in place app-wide.

### B. Adapting to changes in other layers

| Upstream change | Frontend change | Files touched |
|---|---|---|
| Backend returns `allocated`/`pct`/`unitsTotal`/`grandTotal` (§5 B) | Seam stops computing them; becomes pure mapper; type field renamed `delegated → allocated` | `lib/mobo/allocation.ts`, `lib/mobo/types.ts`, `Panels.tsx`, `StackedBarChart.tsx` |
| Backend `units` = DB `multiplier` (D-4) | Mapper reads `units` directly (already the type field) | `lib/mobo/allocation.ts` |
| `/runs` endpoint (§D) | `DateControl` options sourced from API, not the const | `page.tsx`, `Panels.tsx` (DateControl props) |
| Manual POST `/run` (D-8/D-9) | Header "Sync" button + `sync()` on the hook; empty-run response surfaces as "No new trades — checked at HH:MM ET" toast (D-10) | `page.tsx`, `usePostTradeAllocation.ts`, `actions.ts` |

### C. Additional findings

- **`PtaModel.acct`** — the type carries `acct` (rendered in `ModelRow`/`PerModelDetail`). The model
  has no IB account of its own (per 006 D-3, IB account is per-client). The DTO fills `acct` from the
  model's **IB master trading account** (`orders.accountId`), or `"—"` when absent — no type/component
  change (D-4).
- The `EmptyCard`/`"empty"` view stays wired but unreached; when the backend has no run for a date the
  hook surfaces the existing empty/error state — no new UI.

### D. Summary of Frontend-layer changes

| # | Change | Required? | Effort |
|---|---|---|---|
| A-1 | `lib/mobo/allocation.ts` → DTO→view mapper; delete `PTA_*` mock; rename type field `delegated → allocated` | Yes — user req. | S |
| A-2 | `usePostTradeAllocation.ts` hook (incl. `sync()`) + `actions.ts`; page swaps to hook, adds **Sync** button; `DateControl` fed by `/runs` | Yes — user req. | S |
| A-3 | `server/mobo/index.ts` + `MOBO` endpoints block | Yes | XS |

---

## Design decisions (settled)

- **D-1 — Portfolio is per-client aggregate; three-column split.** `client_portfolios` holds
  `cash_deposit` (static, external), `amount_in_trade` (signed, updated by every run), and
  `previous_amount_in_trade` (snapshot pre-run) per client (product owner's choice; corrected
  2026-07-14). `amount_in_trade` is incremented by the **signed** sum of that client's allocated
  amounts across all models each run. Per-(client, model) grain, a stored composite "value", and a
  full valuation ledger were considered and deferred (Open questions / B-3 rationale).
- **D-2 — Scheduled weekday run + manual "Sync" button.** A weekday job auto-runs (`scheduler.py`,
  mirroring `allocation_matrix`) *when enabled by env var* (D-8); a MOBO/admin **Sync** button in the
  page header is always available. Resolves the requirement's "specific time vs specific event" as
  *scheduled with env kill-switch, plus manual*.
- **D-3 — Net traded amount = Σ `proceeds` (signed; no `abs()`).** (Revised 2026-07-14 after Q-1
  correction — the earlier `Σ|amount|` formulation was wrong: it would have thrown away the sign that
  distinguishes a profitable trading day from a losing one, and pushed monotonically-positive numbers
  into `amount_in_trade`.) `proceeds` is the **signed cashflow** view (BUY = − cash out, SELL = +
  cash in), so summed over the day per model it equals the net cash change of the trading pot: a
  round-trip closed at profit is `+`, at loss is `−`, an unclosed intraday buy is `−` (correctly
  reflecting capital deployed and awaiting return). `amount` (BUY = +, SELL = −) is the *position-
  direction* view and would sum to something else entirely (roughly, net notional built up). For the
  clients' `amount_in_trade` (B-3) — a cash pot, not a position book — `proceeds` is the semantically
  correct source. `netCash` (proceeds net of commission) rejected because commissions are handled as a
  separate concern; a follow-up could switch to `netCash` if the firm decides commissions should flow
  into clients' allocated share, but that's a policy call, not a modelling one.
- **D-4 — `units ↔ multiplier`; model `acct` from `orders.accountId`.** DB column `multiplier` maps
  to API/UI `units` (carried from 006 D-4). The page's per-model `acct` is sourced from the IB master
  account the model traded through (`orders.accountId`), since the model owns no IB account.
- **D-5 — Split basis is the latest *confirmed* matrix.** Per the requirement, the pro-rata uses
  `allocation_model_snapshots` of the latest confirmed period — **not** the live/open
  `client_subscriptions`. The run stores that `period_id` for audit.
- **D-6 — Run *aggregation* keyed on `orders.tradeDate` ET token** (B-4) — the simplest correct
  timezone resolution; no conversion against the server (HKT) `ingested_at`.
- **D-7 — DB column & DTO field named `allocated`, not `delegated`** (user, 2026-07-14). "Allocated"
  matches the page's semantics (post-trade **allocation**) and the requirement's language. The rename
  is limited to one DB column, one DTO field, and two component read sites.
- **D-8 — Scheduler is env-var-gated; manual is always live** (user, 2026-07-14). `PTA_SCHEDULER_ENABLED
  =false` in dev, `=true` in prod (see C-3 table). The manual POST route and Sync button are
  independent of that flag — a MOBO user can trigger a run at any time.
- **D-9 — Idempotency via `orders.allocated_run_id` marker; `trade_date` not unique on runs** (user,
  2026-07-14). A run consumes only unallocated orders and marks them in the same transaction. Two
  consequences: re-click is a natural no-op, and a late-arriving order for an already-processed day
  produces a fresh run row for that same `tradeDate`. The frontend GET sums allocations across all
  runs of the requested `tradeDate` so the total stays correct.
- **D-10 — Trade-less days write an `empty` run row** (user, 2026-07-14). When the run finds no
  unallocated orders it writes one `post_trade_allocation_runs` row with `status='empty'`,
  `grand_total=0`, no cells, no portfolio update. Rejected alternatives: (a) log-only heartbeat —
  splits audit between logs and DB; (b) a separate `pta_scheduler_state` table — extra concept for
  the same audit; (c) reworking idempotency around a per-`tradeDate` "processed" set — larger blast
  radius, no user-visible benefit. Empty rows are cheap (weekday-rate max under normal ops), keep the
  audit and the Sync-button confirmation UX in the same table as real runs, and preserve
  `previous_amount_in_trade` semantics (which advance only on real allocations — matching the
  requirement's *previous allocation* meaning of step 5). YAGNI on dedupe against spam-clicks; the
  scheduler fires ≤1×/day.

---

## Objectives & standard of the expected outcome

- **Parity, not redesign.** Every element of the page renders against real data with components
  untouched; the seam's "purge test" holds (deleting `lib/mock` needs zero component edits).
- **Logic lives once, server-side.** Aggregation, pro-rata split, portfolio update, and the confirmed-
  matrix basis are enforced in the backend; the frontend renders what it is given.
- **Auditable & immutable.** Each run and its per-cell records freeze the split basis (`units`,
  `units_total`, `ib_account`, `model_name`, `period_id`); a re-run replaces atomically and keeps
  portfolios consistent.
- **Convention-faithful.** Models, enums, migration, router/service/repository, scheduler, and authz
  follow `app/models/pc.py`, `app/libs/allocation_matrix/*`, and `alembic/versions/*`.
- **Additive & reversible.** One additive migration; `alembic downgrade -1` drops all three tables.
- **Verified.** Migration applies at the new head; the run against a seeded day reproduces the mock's
  numbers for an identical dataset (regression anchor); the GET returns the exact `PostTradeAllocationView`
  the page already consumes.

---

## Execution & verification

1. **DB first** — write `app/models/post_trade_allocation.py`, wire `__init__`/`env.py`, author the
   `0014` migration, `alembic upgrade head`, verify `alembic current` at the new head and object
   existence. **Human gate:** migration runs against the live DB (same posture as 005/006 cutovers).
2. **Backend** — repository (order aggregate read + confirmed-snapshot read + run/portfolio writes) →
   service (`run()` steps 1–5 + structural idempotency, with unit tests on the split math, the
   **signed** Σ `proceeds` rule (incl. a losing-day case), and the `amount_in_trade` previous/current
   transition) → schemas → router → actions in `actions.py` → mount + scheduler. Exercise all three
   routes against a seeded copy of the mock day; assert `allocated`/`pct`/`grandTotal` equal the
   mock's for the same units.
3. **Frontend** — add `server/mobo` + `MOBO` endpoints + `usePostTradeAllocation` + `actions.ts`;
   repurpose `lib/mobo/allocation.ts` as the mapper; swap the page to the hook; feed `DateControl`
   from `/runs`; delete the `PTA_*` mock; smoke-test all/per-model/empty views.
4. Push the branch and draft the PR; stop (human owns `main`).

**Human gate(s):** the `0014` migration against the live DB (step 1) before any backend work depends
on it.

---

## Rollback

Backend and frontend changes revert with the branch. The schema reverts with `alembic downgrade -1`,
which drops `post_trade_allocations`, `post_trade_allocation_runs`, and `client_portfolios` (with
their indexes/FKs). Additive-only ⇒ clean rollback; no existing rows are altered by the migration
(only the run, at execution time, writes new rows).

---

## Open questions

### Resolved (best judgement, 2026-07-14)

- **Q-1 — Signed cashflow; three-column split; `value` column dropped** (rewritten 2026-07-14 after
  user correction — the earlier resolution here was wrong on both counts and is void). The trader's
  P&L must flow through to clients proportionally *with its sign*: a losing day reduces every
  subscribing client's working capital, mirroring the profit case. So D-3 is now Σ `proceeds` signed
  (see D-3), `allocated` inherits that sign, and `amount_in_trade += Σ allocated` really can decrease.
  Separately, `client_portfolios` no longer conflates "portfolio value" into one column: **`cash_deposit`**
  is static (client's paid-in cash — declared for schema completeness; populated by a future deposit/
  withdrawal flow, out of scope here) and **`amount_in_trade`** is the dynamic column this run writes.
  A composite `value` column is intentionally not stored — see the B-3 rationale. `previous_amount_in_
  trade` gives the "previous portfolio value" the requirement asked for, correctly scoped to the
  changing side.
- **Q-2 — Scheduled fire time & trading calendar: ship the defaults, no calendar integration.**
  `PTA_SCHEDULER_TIME=18:00`, `PTA_SCHEDULER_TZ=America/New_York`, `PTA_SCHEDULER_DAYS=MON-FRI` (C-3)
  are final for this proposal, not placeholders. Reasoning: 18:00 ET is after IB's typical settlement
  cutoff (matching the existing `EmptyCard` copy already in the page), and MON–FRI is correct for every
  case except a market holiday. A market holiday is exactly the trade-less-day case D-10 was built to
  absorb — the scheduler fires, finds no unallocated orders, writes an `empty` run, and the mismatch
  between the trading calendar and the weekday calendar becomes an audit-visible non-event rather than
  a bug. A real holiday feed is real scope (a data source + maintenance burden) for a problem D-10
  already makes harmless; deferred until an actual firm holiday causes a wrong non-empty run (it can't
  — no orders means no allocation regardless of why the day was quiet).
- **Q-3 — `tradeDate` and `settleDay` are now two distinct DTO fields (see §4.1).** `tradeDate`
  (`YYYY-MM-DD`, the raw ET token the run is keyed on, D-6) is the unambiguous machine-usable value;
  `settleDay` remains the existing human-readable display label the page already renders. Today
  `settleDay` is computed from the same trade day (no true T+2 settle-date tracking exists yet), but
  because the two are now separate fields, wiring `settleDay` to a real settlement date later is a
  backend-only change — no DTO shape change, no frontend edit. This directly avoids the semantic
  ambiguity the user flagged: nothing downstream has to guess which calendar concept a single field
  meant.

### Out of scope (tracked elsewhere)

- **`orders.model` → `models` foreign key.** Today a free-text match by name (B-4). A real FK/slug and
  an ingest-time validation belong to the orders/reconciliation track.
- **The client-subscription write flow** that populates the matrix the confirmed snapshot derives from
  — owned by the 006 subscription track.
