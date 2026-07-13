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
- **Mark-to-market portfolio accounting** — portfolio value accumulates the delegated traded amount
  per the requirement; position-level valuation, P&L, and buy/sell accounting semantics are out of
  scope (see Open questions).
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
  "settleDay": "Tue 03 Jun 2026",          // display label of the run's trade day
  "grandTotal": 11450000.0,                 // Σ of every model.traded (number, major units)
  "models": [
    {
      "id": "9f2c…",                        // models.id (UUID string)
      "name": "Zero",                       // models.name
      "acct": "U-1234567",                  // IB master account the model traded through
                                            //   (orders.accountId); "—" if none — see D-4
      "traded": 6800000.0,                  // Σ|proceeds|→amount over the model's orders that day
      "unitsTotal": 25.0,                   // Σ multiplier across subscribing clients (snapshot)
      "clientShares": [
        {
          "clientId": "3a11…",              // users.id (UUID string)
          "name": "Strathmore Fund",        // client_profiles.name
          "units": 5.0,                     // API field ← DB allocation_model_snapshots.multiplier
          "delegated": 1360000.0,           // traded × multiplier / unitsTotal  (backend-computed)
          "pct": 20                         // round(multiplier / unitsTotal × 100)  (backend-computed)
        }
      ]
    }
  ]
}

// GET /api/mobo/post-trade-allocation/runs   (200) — feeds the page's DateControl dropdown
{ "runs": [ { "date": "2026-06-03", "label": "Tue 03 Jun 2026", "grandTotal": 11450000.0 } ] }

// POST /api/mobo/post-trade-allocation/run   (202) — manual trigger (admin override)
// body: { "date": "2026-06-03" }  (optional; defaults to the prior trading day)
// returns the same object shape as GET (the freshly-computed view)

// Error envelope: FastAPI default { "detail": "<msg>" }; 401 → UNAUTHORIZED, 403 → forbidden,
// 404 → no run for that date. Numeric money fields cross the wire as JSON numbers in MAJOR units
// (the mock already uses e.g. 6_800_000), NOT Numeric(28,10) strings — the page's ptaMoney() and
// Recharts consume numbers. (Contrast the recon DTOs, which carry DecimalStrings.)
```

### 4.2 Per-layer obligations against the seam

| Layer | What this layer contributes | What this layer assumes from the other side |
|---|---|---|
| Database | Persists runs, per-cell allocation records (frozen `units`/`delegated`/`pct`/`ib_account`), and per-client portfolio value+previous. | Backend writes only within one run transaction; `orders.model` resolves to a `models` row; a confirmed period exists. |
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
| `trade_date` | `String(8)` | no | the IB ET `YYYYMMDD` token the run aggregated (see B-4); **unique** |
| `period_id` | `Uuid` FK → `allocation_periods.id` | no | the confirmed period whose matrix was the split basis (audit) |
| `status` | `String(16)` | no | `RunStatus` value enum `completed`/`failed`; `server_default "completed"` |
| `trigger` | `String(16)` | no | `RunTrigger` value enum `scheduled`/`manual` |
| `grand_total` | `Numeric(28, 10)` | yes | cached Σ of model traded amounts (header stat) |
| `run_by` | `String(255)` | yes | actor display name (null for scheduled) |
| `created_at` | `DateTime(tz)` | no | = run timestamp; immutable, no `updated_at` |

Unique on `trade_date` — one run per trading day; a re-run replaces (delete-then-write in one tx, see
C-3) rather than duplicating.

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
| `delegated` | `Numeric(28, 10)` | no | `model_traded × units / units_total` |
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

#### B-3. No portfolio value is stored (Yes — user req.)

Requirement step 5 ("the portfolio of the clients will be updated, together with the previous
portfolio value") has nowhere to write. Nothing in the schema stores a client value — it is only ever
derived on read (`multiplier × model_size` in `allocation_matrix`).

**Refactor:** add **`client_portfolios`** — one row per client, **aggregate grain** (Accepted, per
product owner — see D-1):

| Column | Type | Null | Notes |
|---|---|---|---|
| `user_id` | `Uuid` FK → `users.id` PK | no | one row per client (portal = `client`) |
| `value` | `Numeric(28, 10)` | no | current portfolio value; `server_default "0"` |
| `previous_value` | `Numeric(28, 10)` | no | value **before** the last run; `server_default "0"` |
| `last_run_id` | `Uuid` FK → `post_trade_allocation_runs.id` | yes | the run that last touched this row |
| `updated_at` | `DateTime(tz)` | no | `server_default=func.now()`, `onupdate=func.now()` |

On each run, per client: `previous_value = value; value = value + Σ delegated (this run)`. Idempotency
for a re-run of the same `trade_date` is handled by the service (C-3): the replaced run's contribution
is reversed before re-applying.

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

### C. Summary of DB-layer changes

| # | Change | Required? | Effort | Data migration? |
|---|---|---|---|---|
| B-1 | New `post_trade_allocation_runs` (run header) | Yes — user req. | S | No (additive) |
| B-2 | New `post_trade_allocations` (per-cell records) | Yes — user req. | S | No (additive) |
| B-3 | New `client_portfolios` (value + previous_value) | Yes — user req. | S | No (additive) |
| B-4 | Run window keyed on `orders.tradeDate` ET token (query convention) | Accepted | XS | No |

All three tables land in **one** additive migration `0014_post_trade_allocation`
(`down_revision = "350ce48e2f4d"`). Additive-only ⇒ `alembic downgrade -1` drops all three cleanly.

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

`PostTradeAllocationService.run(trade_date, trigger, actor)` is one DB transaction implementing the
requirement's business-logic steps 1–5:

1. **Aggregate per model** — read `orders WHERE tradeDate = :yyyymmdd`, resolve `model → models.id`
   by name (B-4), group, and sum the net traded amount as **Σ `COALESCE(proceeds, amount)`, absolute
   value** (Accepted, D-3). Capture each model's IB master account from `orders.accountId` (D-4).
2. **Resolve the split basis** — find the **latest confirmed** `allocation_periods` row; for each
   model read its `allocation_model_snapshots` (multiplier + ib_account per client). `unitsTotal` =
   Σ multiplier; per client `delegated = traded × multiplier / unitsTotal`, `pct = round(multiplier /
   unitsTotal × 100)`. A model with no snapshot rows (no subscribers) contributes its bar but no
   segments.
3. **Persist** — write the `post_trade_allocation_runs` header (incl. `period_id`, `grand_total`) and
   one `post_trade_allocations` row per (model, client).
4. **Update portfolios** — per client, `previous_value = value; value += Σ delegated`; set
   `last_run_id`. Clients with no row get one (`value` seeded from the delegated sum, `previous_value
   = 0`).
5. **Return** the assembled `PostTradeAllocationView`.

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

#### C-2. Idempotent re-run of a trade day (Yes)

A day may be re-run (correction, or scheduled + manual overlap). Because `trade_date` is unique
(B-1) and portfolios accumulate (B-3), a naive re-run would either violate the unique constraint or
double-count.

**Refactor:** `run()` first checks for an existing run on that `trade_date`; if present it **reverses
that run's portfolio contribution** (`value -= Σ that run's delegated`), deletes the run (cascade
drops its cells), then writes the new run — all in the same transaction. Net effect: a re-run is a
replace, portfolios stay consistent.

### D. Route / contract

> **Decision (settled):** three routes, no cell-write surface (the page is read-only + a run trigger).
>
> Final route surface after this layer lands:
> ```
> GET  /api/mobo/post-trade-allocation?date=YYYY-MM-DD   VIEW  → PostTradeAllocationView (latest run if no date)
> GET  /api/mobo/post-trade-allocation/runs              VIEW  → run list for the DateControl dropdown
> POST /api/mobo/post-trade-allocation/run               RUN   → trigger a run (admin override), returns the view
> ```
> Net: **0 → 3 routes** (greenfield). GET reads persisted `post_trade_allocations` for the day; it does
> **not** recompute. POST invokes `service.run()`.

### E. Summary of Backend-layer changes

| # | Change | Required? | Effort |
|---|---|---|---|
| A | New `app/libs/post_trade_allocation/` package + `app/schemas/post_trade_allocation.py`; mount in `main.py` | Yes — user req. | M |
| B | `service.run()` — aggregate/split/persist/portfolio (steps 1–5) | Yes — user req. | M |
| C-1 | Two `MOBO` actions in `actions.py` + `ROLE_ACTIONS` | MANDATORY | XS |
| C-2 | Idempotent re-run (reverse-then-replace) | Yes | S |
| — | Weekday auto-run `scheduler.py` + lifespan registration | Accepted (D-2) | S |

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
`unitsTotal`, `delegated`, `pct`, `grandTotal`). Keep `ptaMoney()` exported from here (presentation
formatter stays frontend, matching the PC `lib/pc/format.ts` precedent). Delete the `PTA_*` mock and
its import.

#### A-2. The page loads synchronously (Yes)

`page.tsx` calls `const { … } = loadPostTradeAllocation()` at render.

**Refactor:** add `hooks/api/usePostTradeAllocation.ts` (mirror `useAllocation.ts`: `{data, loading,
error, refetch}`, module cache keyed by date, refetch on focus) and
`app/(roles)/mobo/post-trade-allocation/actions.ts` (`"use server"` wrappers over `server/mobo`).
The page swaps its one synchronous call for `const { data, loading, error } = usePostTradeAllocation(pickedDate)`
and renders existing empty/loading states. `DateControl`'s hardcoded `PTA_DISCRETE_DATES` is fed from
the `/runs` endpoint (an already-present dropdown; only its source changes).

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
| Backend returns `delegated`/`pct`/`unitsTotal`/`grandTotal` (§5 B) | Seam stops computing them; becomes pure mapper | `lib/mobo/allocation.ts` |
| Backend `units` = DB `multiplier` (D-4) | Mapper reads `units` directly (already the type field) | `lib/mobo/allocation.ts` |
| `/runs` endpoint (§D) | `DateControl` options sourced from API, not the const | `page.tsx`, `Panels.tsx` (DateControl props) |

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
| A-1 | `lib/mobo/allocation.ts` → DTO→view mapper; delete `PTA_*` mock | Yes — user req. | S |
| A-2 | `usePostTradeAllocation.ts` hook + `actions.ts`; page swaps to hook; `DateControl` fed by `/runs` | Yes | S |
| A-3 | `server/mobo/index.ts` + `MOBO` endpoints block | Yes | XS |

---

## Design decisions (settled)

- **D-1 — Portfolio is per-client aggregate.** `client_portfolios` holds one `value` +
  `previous_value` per client, incremented by the sum of that client's delegated amounts across all
  models each run (product owner's choice). Per-(client, model) grain and a full valuation ledger were
  considered and deferred (Open questions).
- **D-2 — Scheduled weekday run + manual override.** A weekday job auto-runs for the prior ET trading
  day (`scheduler.py`, mirroring `allocation_matrix`); an admin `POST …/run` is the override. Resolves
  the requirement's "specific time vs specific event" as *scheduled, with manual*. The exact fire time
  is a config value (Open questions).
- **D-3 — Net traded amount = Σ|`COALESCE(proceeds, amount)`|.** Absolute gross traded notional per
  model, so buys/sells don't net toward a misleadingly small figure and the bar/pie show positive
  "money traded" (product owner's choice; `netCash` incl. commission was the alternative).
- **D-4 — `units ↔ multiplier`; model `acct` from `orders.accountId`.** DB column `multiplier` maps
  to API/UI `units` (carried from 006 D-4). The page's per-model `acct` is sourced from the IB master
  account the model traded through (`orders.accountId`), since the model owns no IB account.
- **D-5 — Split basis is the latest *confirmed* matrix.** Per the requirement, the pro-rata uses
  `allocation_model_snapshots` of the latest confirmed period — **not** the live/open
  `client_subscriptions`. The run stores that `period_id` for audit.
- **D-6 — Run window keyed on `orders.tradeDate` ET token** (B-4) — the simplest correct timezone
  resolution; no conversion against the server (HKT) `ingested_at`.

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
   service (`run()` steps 1–5 + idempotent replace, with unit tests on the split math, the absolute-
   amount rule, and the portfolio previous/current transition) → schemas → router → actions in
   `actions.py` → mount + scheduler. Exercise all three routes against a seeded copy of the mock day;
   assert `delegated`/`pct`/`grandTotal` equal the mock's for the same units.
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

### Still open

- **Q-1 — Portfolio accounting semantics.** D-1 accumulates the delegated *traded* amount as
  portfolio value. Whether value should reflect buy/sell direction (signed), mark-to-market position,
  or realized P&L is unspecified; the first cut takes the requirement literally (accumulate delegated).
  Revisit when the client-portal portfolio view is specified.
- **Q-2 — Scheduled fire time.** D-2 fixes *scheduled weekday*, but the exact time (e.g. after the
  18:00 GMT cutoff the `EmptyCard` copy mentions) and the trading-calendar/holiday source are a config
  decision, not baked into this proposal.
- **Q-3 — `settleDay` label source.** The page labels the day "settleDay"; the run is keyed on
  `tradeDate` (D-6). Whether the label shows the trade date or the `settleDate` (typically T+2) is a
  display choice — the DTO currently returns the trade day formatted; trivial to switch to `settleDate`.

### Out of scope (tracked elsewhere)

- **`orders.model` → `models` foreign key.** Today a free-text match by name (B-4). A real FK/slug and
  an ingest-time validation belong to the orders/reconciliation track.
- **The client-subscription write flow** that populates the matrix the confirmed snapshot derives from
  — owned by the 006 subscription track.
