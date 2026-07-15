# 012 — Trade Reconciliation: backend + DB implementation with frontend integration

> Status: **DRAFT — pending implementation approval.**
> Scope: Wire the existing MOBO Trade Reconciliation page to real data — new AlgoTrade tables (synthesized from IB Flex-import for now, real API later), three source adapters, a pure reconciliation engine, one endpoint, and a FE cutover that deletes the mock. Out of frame: the two-panel triage view (`recon-overview`, `daily-exception-report`) and any UI/layout redesign.
> Constraint: No design/layout changes to `admin-frontend/app/(roles)/mobo/trade-reconciliation/page.tsx` or its component tree. The FE data contract (`ReconciliationFlowView` in `admin-frontend/lib/mobo/flow-types.ts`) is authoritative — the backend serves that shape verbatim; layers may not renegotiate it in impl docs.

---

## 1. Context and Motivation

The MOBO Trade Reconciliation page today (`admin-frontend/app/(roles)/mobo/trade-reconciliation/page.tsx:45`) is fully mock-backed via `admin-frontend/lib/mock/mobo-flow-data.ts` — the single seam is `loadReconciliationFlow(scenario)` in `admin-frontend/lib/mobo/reconciliation-flow.ts:16`. The spec (`Trade Recon Specification 39e3c758…md`) defines three rows that already have real underlying data or can be synthesized:

- **Row 1 (AlgoTrade)** — no live source yet (no AlgoTrade API), but the spec explicitly asks for a **pluggable synthesizer** that mirrors IB rows during IB Flex-import, purgeable once a real API arrives.
- **Row 2 (IB Clients)** — data already exists in `ib_trades` / `ib_activity` and the normalized `post_trade_allocations` pipeline landed in proposal 011.
- **Row 3 (CRM)** — data already exists in `client_portfolios`.

Reconciliation is notional-anchored (per the spec): a coarse aggregate-notional check per row runs first (the headline `algoTotal`/`ibTotal`/`crmTotal` numbers); only on a coarse mismatch does fine-grained checking run, in fixed sequence — IB↔CRM, then IB↔AlgoTrade (using the pre-trade allocation matrix from PC, proposals 006/007), then AlgoTrade↔IB per order, then a derived CRM↔AlgoTrade verdict that folds the two IB-pivoted results rather than querying independently.

Pairs with the uncommitted MOBO backend integration proposal (`docs/proposals/2026-06-18-mobo-backend-integration.md`) — this proposal adopts its D1 (all business logic in backend, frontend pure view), source-adapter pattern, and new `RECON_VIEW` action.

> **Why now / why this order.** Post-trade allocation (011) is merged into main, which gives us the `post_trade_allocations` table Row 2 depends on. The trade-reconciliation-integration branch is already cut. Order is DB → BE → FE for readability only; the three layers fan out to independent worktree branches (`-db`/`-be`/`-fe`) and may be built in any sequence the human chooses, since §4 freezes the seam.

---

## 2. Goals

1. Three new tables `recon_sessions`, `algotrade_orders`, and `algotrade_executions` with a `source_kind SYNTHESIZED | LIVE` discriminator, so a future real-API integration writes to the same schema.
2. A pluggable synthesizer module (`app/libs/reconciliation/algotrade/synth.py`) that populates AlgoTrade rows from each IB Flex-import run, cleanly deletable once real AlgoTrade API lands.
3. Three source adapters behind a common protocol (AlgoTrade / IB / CRM) — engine sees DTOs only, never SQL.
4. Pure `reconcile(session_id)` engine: coarse aggregate-notional check per row first, falling through to fine-grained per-order / per-(client, model) / CRM-mirror / derived CRM↔AlgoTrade breaks only when the coarse check fails (see Layer 2 §B for the fixed sequence).
5. `GET /api/mobo/reconciliation?session_id=<id>` returning the exact `ReconciliationFlowView` shape defined in `flow-types.ts` — no field renaming, no reshaping in the FE.
6. FE cutover: `loadReconciliationFlow` fetches the endpoint; `mobo-flow-data.ts` deleted; loading + error states added (currently absent).

## 3. Non-Goals

- Real AlgoTrade API integration — synthesizer stays until that lands; only the seam is future-proofed here.
- Redesign of the reconciliation UI, the two-panel triage view, or the `Auto-match` button behavior (still no handler; out of scope).
- Scenario toggling in production — hardcoded `"breaks"` today; §4 removes the query param unless retained for demo (§Open questions Q-7).
- Streaming / live-refresh — one endpoint call per page load; refresh cadence discussed in Q-6.
- Cross-currency FX normalization — see Q-5.

---

## 4. Cross-layer seam (frozen here)

### 4.1 The wire contract

`GET /api/mobo/reconciliation?session_id=<uuid>` — response is `ReconciliationFlowView` **verbatim** as declared in `admin-frontend/lib/mobo/flow-types.ts`. Reproduced here so backend and DB agents work from the same reference without cross-reading the FE tree.

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
// algIbBrk = AlgoTrade↔IB + IB↔AlgoTrade break count; ibCrmBrk = IB↔CRM break count;
// algCrmBrk = derived CRM↔AlgoTrade breaks — NOT independently computed, see Layer 2 §B stage-2 step 4.

interface ReconciliationFlowView {
  settleDay: string;                       // e.g. "03 Jun 2026" — human formatted, backend produces
  orders: RcOrder[]; allocs: RcAlloc[]; ports: RcPort[];
  algoTotal: string; ibTotal: string; crmTotal: string;   // "$X.XXM" formatted by backend via fmtUsd equivalent
  counts: RcBreakCounts;                                  // backend supplies; FE currently re-derives, but backend is authoritative
}
```

**Error envelope:** bare `HTTPException(status_code, detail=<string>)` — same shape every existing route in this codebase already uses (`{"detail": ...}`), NOT a new `{code, message, details?}` envelope. HTTP `400` (bad session_id), `403` (missing `RECON_VIEW` — this is the shared `require_action()` dependency's own exception, unwrapped, so it's naturally consistent with every other gated route), `404` (unknown session — including "no sessions exist yet" when `session_id` is omitted), `500` (adapter/engine failure). *(Resolved 2026-07-15 — see Q-9: introducing a new envelope format is a cross-cutting refactor, not something this proposal should invent unilaterally.)*

**Field-name ↔ column-name map** (frozen):

| Wire (FE) | DB / adapter source | Note |
|---|---|---|
| `RcOrder.id` | `algotrade_orders.id::text` | UUID → string |
| `RcOrder.m` | `models.name` joined on `algotrade_orders.model_id` | Model UUID is an internal join key only — never serialized to the wire; name alone distinguishes models for display |
| `RcOrder.inst` | `algotrade_orders.symbol` | |
| `RcOrder.qty` / `RcOrder.px` / `RcOrder.not` | formatted from `qty_ordered` / `price` / `notional` | Backend formats; raw not exposed on this row (see `notVal`) |
| `RcOrder.notVal` | `algotrade_orders.notional` numeric | raw float for FE highlight math |
| `RcOrder.ref` | `algotrade_orders.id::text` or client-order-id | See Q-3 (stable join key) |
| `RcOrder.ib` | matched IB execution id from `ib_trades` | Empty string if no IB match |
| `RcOrder.execs[]` | `algotrade_executions` rows for that order | |
| `RcAlloc.cid` | `client_profiles.id` (autoincrement **int**, not UUID — cast to string for the wire) | *(Resolved — see Q-10)* |
| `RcAlloc.client` | `client_profiles.name` | *(Resolved — see Q-11; column is `name`, not `display_name`)* |
| `RcAllocModelLine.units` | `client_subscriptions.multiplier` (from PC allocation matrix snapshot) | *(Resolved — see Q-11; column is `multiplier`, not `units`)* |
| `RcAllocModelLine.amtVal` | `post_trade_allocations` sum for (client, model, session) | |
| `RcPort.inTrade/cash/total` | `client_portfolios.amount_in_trade` / `cash_deposit` / their sum | |
| `RcPort.pre/post/chg/pct` | formatted deltas across the session boundary | Backend formats |
| `st: 'brk'` | any finding in engine's break arrays touching that row | Set at row and subrow level |
| `brk` / `note` | narrative from break record's `expected vs actual` | Backend composes |

**Session identifier.** `session_id` is the primary key of the new `recon_sessions` table (§Layer 1). Every AlgoTrade row and reconciliation call is scoped by it. See §Layer 1 B-3 and Q-1 for what a session represents.

### 4.2 Per-layer obligations against the seam

| Layer | Contributes | Assumes from other side |
|---|---|---|
| Database | Persists `algotrade_orders` / `algotrade_executions` / `recon_sessions` with the columns named in the map above; joinable to existing PC + IB + portfolio tables by `(model_id, client_id, session_id)`. | Backend never writes rows with `source_kind` outside `{'SYNTHESIZED','LIVE'}`; synthesizer runs inside the IB Flex-import transaction. |
| Backend | Serves `ReconciliationFlowView` at `GET /api/mobo/reconciliation`, gated by `RECON_VIEW`; joins `model_id` UUID to `models.name` for the wire, never exposing the UUID; formats all currency strings; supplies `counts`. | DB tables present with the columns in §4.1; `post_trade_allocations` is populated by proposal 011's pipeline; PC allocation matrix snapshot exists per session; `models.name` is unique enough for display (no two active models share a name). |
| Frontend | Consumes `ReconciliationFlowView` verbatim at `loadReconciliationFlow`; adds loading/error states around the fetch; deletes `mobo-flow-data.ts`. | Backend returns the DTO exactly as in §4.1; `counts` is authoritative (stop re-deriving in `reconciliation-flow.ts:19-36`). |

### 4.3 Change protocol (post-freeze)

Any edit to §4 requires a proposal revision or a dated addendum here; each impl doc's §7 is then re-copied. The seam never lives in only one place.

---

## Layer 1 — Database

### A. Tables / objects in scope

| File | Tables / objects |
|---|---|
| `api-backend/app/models/algotrade.py` (new) | `algotrade_orders`, `algotrade_executions` |
| `api-backend/app/models/recon.py` (new) | `recon_sessions` |
| `api-backend/alembic/versions/<new>.py` | migration creating the three tables + indexes |
| (read-only reference) `ib_trades`, `ib_activity`, `post_trade_allocations`, `client_portfolios`, `client_subscriptions`, `models`, `allocation_period_models`, `allocation_model_snapshots`, `client_profiles` | existing — no schema change |

### B. Findings

#### B-1. No storage for AlgoTrade orders/executions (MANDATORY)

The spec's Row 1 requires per-order intended-trade data with fills; nothing in the schema holds it today. Row 1 is fully mocked in `admin-frontend/lib/mock/mobo-flow-data.ts`.

**Refactor:** create `algotrade_orders` with a `source_kind` discriminator so future real-API rows share the schema.

```sql
CREATE TABLE algotrade_orders (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id              UUID NOT NULL REFERENCES recon_sessions(id) ON DELETE CASCADE,
  model_id                UUID NOT NULL REFERENCES models(id),
  symbol                  TEXT NOT NULL,
  buySell                 TEXT NOT NULL,        -- 'BUY' | 'SELL'
  qty_ordered             NUMERIC(20,4) NOT NULL,
  price                   NUMERIC(20,4) NOT NULL,
  notional                NUMERIC(20,4) NOT NULL,
  trade_date              DATE NOT NULL,
  currency                CHAR(3) NOT NULL DEFAULT 'USD',
  asset_class             TEXT NOT NULL DEFAULT 'OPT',
  source_kind             TEXT NOT NULL,        -- 'SYNTHESIZED' | 'LIVE'
  derived_from_ib_run_id  UUID NULL REFERENCES post_trade_allocation_runs(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_algotrade_orders_session_model_symbol
  ON algotrade_orders (session_id, model_id, symbol);
```

#### B-2. No execution/fill storage for AlgoTrade orders (MANDATORY)

Row 1 renders `execs: RcExec[]` per order (§4.1). Need a child table so partial-fill scenarios are representable.

**Refactor:**
```sql
CREATE TABLE algotrade_executions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES algotrade_orders(id) ON DELETE CASCADE,
  qty_filled     NUMERIC(20,4) NOT NULL,
  fill_price     NUMERIC(20,4) NOT NULL,
  fill_notional  NUMERIC(20,4) NOT NULL,
  executed_at    TIMESTAMPTZ NOT NULL
);
CREATE INDEX ix_algotrade_executions_order ON algotrade_executions (order_id);
```

#### B-3. No grouping entity for "one reconciliation session" (Accepted)

The engine needs a scope: which set of orders, which IB Flex-import run, which portfolio snapshot boundary. Without it, `?session_id=<id>` has no referent.

**Refactor:** `allocation_model_snapshots` has no single-column PK (its PK is the composite `(period_id, user_id, model_id)` — confirmed at `api-backend/app/models/pc.py:270-287`), so `recon_sessions` references it with a composite FK rather than inventing a surrogate key on that table today.

```sql
CREATE TABLE recon_sessions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_date              DATE NOT NULL,
  ib_run_id               UUID NOT NULL REFERENCES post_trade_allocation_runs(id),
  allocation_period_id    UUID NOT NULL,
  allocation_user_id      UUID NOT NULL,
  allocation_model_id     UUID NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trade_date, ib_run_id),
  FOREIGN KEY (allocation_period_id, allocation_user_id, allocation_model_id)
    REFERENCES allocation_model_snapshots (period_id, user_id, model_id)
);
```

Decision: session = (trade_date, ib_run_id) — created inside the IB Flex-import transaction when the synthesizer runs. See Q-1 for the alternative considered. *(Resolved 2026-07-15 — see Q-12: composite FK chosen for now; a surrogate PK on `allocation_model_snapshots` is deferred to the future schema-cleanup refactor alongside Q-9/Q-10.)*

**Migration plan:** purely additive; three new tables, no touch to existing rows. Down-migration drops the three tables.

### C. Summary of DB-layer changes

| # | Change | Required? | Effort | Data migration? |
|---|---|---|---|---|
| B-1 | Add `algotrade_orders` table | MANDATORY | S | No (additive) |
| B-2 | Add `algotrade_executions` table | MANDATORY | XS | No (additive) |
| B-3 | Add `recon_sessions` table | Accepted | XS | No (additive) |

All three land in **one Alembic revision** so the down-migration is a single drop of the three tables in reverse-FK order (executions → orders → sessions). Additive-only — clean rollback.

---

## Layer 2 — Backend

### A. Module layout

New tree under `api-backend/app/libs/`:

```
app/libs/reconciliation/
├── __init__.py
├── engine.py                  # pure reconcile(session_id) → ReconciliationResult
├── dtos.py                    # ReconciliationFlowView + row/break DTOs (mirrors §4.1)
├── formatting.py              # fmtUsd / pctOf backend parity with flow-types.ts
├── adapters/
│   ├── __init__.py            # SourceAdapter protocol
│   ├── algotrade.py           # AlgoTradeAdapter — reads algotrade_orders/executions
│   ├── ib.py                  # IBAdapter — reads ib_trades/ib_activity/post_trade_allocations
│   └── crm.py                 # CRMAdapter — reads client_portfolios
├── algotrade/
│   ├── __init__.py
│   └── synth.py               # PLUGGABLE — writes SYNTHESIZED rows during IB Flex-import
└── api.py                     # GET /api/mobo/reconciliation router
```

Dependency direction: `api → engine → adapters → models`. `synth.py` imports `models` only; nothing else imports `synth.py` except the IB Flex-import pipeline. Deleting `synth.py` (real-API day) requires touching only that one import site.

### B. Core logic

The engine is a pure function, notional-anchored, and runs in **two stages** — coarse aggregate check first, fine-grained per-row-pair breakdown only if the coarse check fails.

**Stage 1 — coarse (row-level aggregate).** Compute one aggregate notional per row for the session: `algoTotal = SUM(algotrade_orders.notional)`, `ibTotal = SUM(post_trade_allocations)`, `crmTotal = SUM(client_portfolios delta, amount_in_trade)`. These are exactly the headline numbers rendered at the top of each row (`ReconciliationFlowView.algoTotal/ibTotal/crmTotal`). If all three totals agree (within the tolerance in Q-4), the session is reconciled — no per-row-pair breakdown runs, every `st` is `'ok'`, `counts` is all zero. This is the common case and is O(3 sums), not O(orders × clients).

**Stage 2 — fine-grained (only on a coarse mismatch), in fixed sequence:**

1. **IB ↔ CRM, per client.** `expected = SUM(post_trade_allocations) for client in session`; `actual = client_portfolios.amount_in_trade_post - amount_in_trade_pre` across the session boundary. Emit `CrmBreak` on drift. Runs first because it's the cheapest check and, per the spec, should be zero by construction (CRM mirrors IB) — a break here means the pipeline itself is broken, independent of trade data.
2. **IB ↔ AlgoTrade, per (client, model).** For each `client_subscriptions` row referencing the session's allocation snapshot: `expected = algotrade_model_notional × (client_units / total_model_units)`; `actual = SUM(post_trade_allocations) WHERE client_id AND model_id AND allocation_run_id = session.ib_run_id`. Emit `ClientModelBreak{ client_id, model_id, expected, actual, delta }`. Attach narrative → `RcAllocModelLine.note`.
3. **AlgoTrade ↔ IB, per order.** For each `algotrade_orders` row, find matching `ib_trades` row by `(symbol, side, trade_date, model_id)` (see Q-3). Compare `qty_ordered` vs sum of IB fills, `price`, `notional`. Emit `OrderBreak{ order_id, field: 'qty'|'price'|'notional', expected, actual, delta }` for any mismatch beyond tolerance (see Q-4). Attach narrative → `RcOrder.brk`.
4. **CRM ↔ AlgoTrade, per client-model — derived, not independently computed.** This pair has no source-of-truth data path of its own (spec: CRM always mirrors IB by design). Its verdict is purely a function of steps 1 and 2: `crm_algo_ok(client, model) = ib_crm_ok(client) AND ib_algo_ok(client, model)`. Emit `CrmAlgoBreak` (feeding `RcBreakCounts.algCrmBrk`) wherever either upstream check failed — this check never runs its own query, it folds the two prior verdicts.

**Why this sequence.** IB is the pivot every other system is compared against, so both of IB's edges (↔CRM, ↔AlgoTrade) must resolve before the transitive CRM↔AlgoTrade edge can be computed. Running IB↔CRM before IB↔AlgoTrade costs nothing extra (independent queries) and lets a pipeline-level CRM bug get flagged before attributing anything to trade-level breaks.

### C. Route surface

> **Decision (settled):** One endpoint, gated by a new `RECON_VIEW` action (per MOBO integration proposal 2026-06-18).
>
> Final route surface added by this layer:
> ```
> GET /api/mobo/reconciliation?session_id=<uuid>   → 200 ReconciliationFlowView | 400 | 403 | 404 | 500
> ```
> `session_id` is **optional** — omitted, it resolves to the most recent `recon_sessions` row (`ORDER BY trade_date DESC, created_at DESC LIMIT 1`). No session-history endpoint or picker is added (Q-8, resolved) — this is the only lookup the page needs today.
>
> Net: **0 → 1 route.**

Scenario query param is **not** added — see D-1.

### D. Findings

#### D-1. Synthesizer must run at IB import, not on read (Recommend)

Two options for when AlgoTrade rows appear: (a) materialize at IB Flex-import (recommended), (b) regenerate on each read. Materialize wins because it's deterministic, gives us a stable `session_id`, and matches the "pluggable-then-purgeable" design in the spec — the real API will also write rows at ingest time, not on read.

**Refactor:** hook `synth.py` into `post_trade_allocation` pipeline finalization — same DB transaction. On finalize: create `recon_sessions` row, walk IB trades, emit one `algotrade_orders` + N `algotrade_executions` per IB order-equivalent, stripping IB-only fields (commissions, TCF metadata).

#### D-2. Break tolerance = configurable epsilon on notional, default very small; exact on qty/price (Accepted)

Notional arithmetic through the allocation ratio produces float drift. Without a tolerance, a rounding-only "break" fires on every partial fill even when nothing is actually wrong. A hardcoded constant would need a code change if business ever needs to retune it.

**Refactor:** engine reads a config value `RECON_NOTIONAL_EPSILON` (default `0.01`, i.e. one cent) and compares `notional` with `abs(expected - actual) > epsilon`; `qty` and `price` remain exact-match, no epsilon. Same epsilon applies at both the coarse row-aggregate check and every fine-grained check in stage 2 — one config value, not per-check tuning.

#### D-3. `counts` is backend-owned (Yes)

FE currently re-derives break counts in `reconciliation-flow.ts:19-36`. Backend already knows every break in the response; recomputing on the client is duplication that will drift.

**Refactor:** backend populates `counts`; FE reads it. See Frontend A-2.

### E. Summary of Backend-layer changes

| # | Change | Required? | Effort |
|---|---|---|---|
| A | New `app/libs/reconciliation/` tree with adapters, engine, DTOs, formatter | MANDATORY | M |
| B.1 | `reconcile()` engine — pure, coarse aggregate check + fixed-sequence fine-grained breakdown (incl. derived CRM↔AlgoTrade) | MANDATORY | M |
| B.2 | `synth.py` synthesizer wired into IB Flex-import | MANDATORY | S |
| C | `GET /api/mobo/reconciliation` endpoint + `RECON_VIEW` gating | MANDATORY | S |
| D-1 | Materialize at IB import (not regenerate on read) | Recommend | (design) |
| D-2 | Configurable notional epsilon (default $0.01) | Accepted | XS |
| D-3 | Backend supplies `counts` (FE stops re-deriving) | Yes | XS |
| — | Unit tests: coarse-pass shortcut (no fine-grained queries run), partial-fill cascade, CRM drift, derived CRM↔AlgoTrade folding both an IB↔CRM-only and an IB↔AlgoTrade-only break | MANDATORY | S |

---

## Layer 3 — Frontend

| File | LOC | Role |
|---|---|---|
| `admin-frontend/app/(roles)/mobo/trade-reconciliation/page.tsx` | ~205 | Page shell, selection state, layout measurement |
| `admin-frontend/lib/mobo/reconciliation-flow.ts` | ~40 | **The seam** — `loadReconciliationFlow()` |
| `admin-frontend/lib/mobo/flow-types.ts` | ~117 | Types (authoritative — matches §4.1) |
| `admin-frontend/lib/mock/mobo-flow-data.ts` | (uncommitted) | Mock — **delete at cutover** |
| `admin-frontend/components/mobo/recon-flow/Cards.tsx` | — | OrderCard/AllocCard/PortfolioCard/FlowRow/FlowConnector — untouched |
| `admin-frontend/components/mobo/recon-flow/Detail.tsx` | — | FlowDetail — untouched |

Canonical data-flow chain after this layer: `page.tsx` → `loadReconciliationFlow(session_id)` → `api-client.reconciliation.get(session_id)` → `GET /api/mobo/reconciliation` → adapters + engine → response.

### A. Findings

#### A-1. Replace mock seam with fetch (MANDATORY)

Today `reconciliation-flow.ts:13` imports from `../mock/mobo-flow-data`; the file's own header (lines 8-11) already calls out this replacement.

**Refactor:** change signature to `async loadReconciliationFlow(session_id: string): Promise<ReconciliationFlowView>`; body issues an authenticated fetch to `/api/mobo/reconciliation?session_id=…`. Delete `mobo-flow-data.ts` and the `scenario` parameter. `page.tsx:45` becomes an effectful loader — either move to `useEffect` + local state, or convert the page to a server component that awaits the loader (recommend server component — matches the "no client-side business logic" MOBO integration decision).

#### A-2. Stop re-deriving `counts` (Yes)

`reconciliation-flow.ts:19-36` filters rows for `st !== 'ok'` to build `counts`. Backend now supplies this authoritatively (BE D-3).

**Refactor:** delete the derivation; use `response.counts` verbatim.

#### A-3. Add loading + error states (Yes — user req.)

`page.tsx` has no loading spinner, no empty state, no error boundary — it assumes arrays are always populated. Once fetch is async, this becomes a bug on any network failure.

**Refactor:** wrap the loader with a suspense boundary + error boundary; render a skeleton for `orders`/`allocs`/`ports` while pending; render an error card on 4xx/5xx (message from error envelope `.message`).

#### A-4. Remove `RcScenarioKey` and scenario plumbing (Accepted)

Scenarios are dead in production — `page.tsx:45` hardcodes `"breaks"`, no UI toggle. Type `RcScenarioKey` in `flow-types.ts:104` and any parameter threading exists only to serve the mock.

**Refactor:** delete `RcScenarioKey`, drop the `scenario` param from the loader, remove any references in components. (Demo affordance, if kept, moves behind an env flag in a follow-up — see Q-7.)

### B. Adapting to changes in other layers

| Upstream change | Frontend change | Files touched |
|---|---|---|
| BE C (new endpoint) | `loadReconciliationFlow` fetches it | `reconciliation-flow.ts` |
| BE D-3 (`counts` authoritative) | Stop re-deriving; use `response.counts` | `reconciliation-flow.ts` |
| DB B-3 (`session_id` scoping) | Loader takes `session_id`; page resolves it (today: latest session) | `page.tsx`, `reconciliation-flow.ts` |

### C. Additional findings

- **`Auto-match` button** (`page.tsx:102`) still has no `onClick` — out of scope; leave as-is or hide behind a `TODO` comment.

### D. Summary of Frontend-layer changes

| # | Change | Required? | Effort |
|---|---|---|---|
| A-1 | Replace mock with fetch; delete `mobo-flow-data.ts` | MANDATORY | S |
| A-2 | Consume backend `counts` | Yes | XS |
| A-3 | Loading + error states | Yes — user req. | S |
| A-4 | Remove scenario plumbing | Accepted | XS |

---

## Design decisions (settled)

- **D-1 — Backend serves the FE's DTO verbatim.** No FE-side reshaping. Field names, nesting, string vs numeric formatting all match `flow-types.ts`. Rationale: FE is pure view (MOBO integration D1); any reshape adds a place for the seam to drift.
- **D-2 — Synthesizer is materialize-at-import.** See BE D-1. Rationale: deterministic session ids, aligns with future real-API ingest shape, one code path to delete on cutover.
- **D-3 — Session = (trade_date, ib_run_id).** See DB B-3. Rationale: matches how humans think about a "day's trading" and how ops already pivot around Flex-import runs.
- **D-4 — Scenario toggling dropped in production.** See FE A-4. Rationale: real data breaks are the product; demo scenarios move to a future env-flag if genuinely needed.
- **D-5 — Coarse-then-fine reconciliation, fixed sequence IB↔CRM → IB↔AlgoTrade → AlgoTrade↔IB → CRM↔AlgoTrade (derived).** See Layer 2 §B. The coarse aggregate-notional check (the three headline row totals) is the anchor; fine-grained per-row-pair breakdown only runs on a coarse mismatch. CRM↔AlgoTrade is never queried independently — it's a derived AND of the two IB-pivoted verdicts, since CRM has no direct data path to AlgoTrade.

---

## Objectives & standard of the expected outcome

- **Parity with mock.** With a seeded session that mirrors the current mock scenarios, the endpoint returns a `ReconciliationFlowView` that renders byte-for-byte the same UI (modulo timestamps).
- **Purgeable synthesizer.** `git grep synth` returns exactly one production import (the IB Flex-import hook); removing `synth.py` and that line is the entire real-API cutover on the backend side.
- **Logic lives once.** No reconciliation math on the FE; no `counts` re-derivation; no scenario toggling.
- **Additive & reversible.** DB migration is drop-three-tables; no existing rows touched.
- **Seeded verification.** A demo session inserted via `synth.py` from a canned IB run produces both a matched view and a partial-fill (MSFT) view — the same two scenarios the current mock covers.

---

## Execution & verification

Phases run inside each layer independently after this proposal is approved. Layer branches: `trade-reconciliation-integration-db`, `-be`, `-fe`.

1. **DB layer.** Alembic revision creates the three tables. Verification: `alembic upgrade head` runs clean on a fresh dev DB; `alembic downgrade -1` drops them cleanly; unit test confirms FK cascade orders→sessions and executions→orders.
2. **BE layer.** Adapters + engine + endpoint + synthesizer hook. Verification: (a) pytest suite covers matched case, MSFT partial-fill cascade, CRM drift; (b) hitting `/api/mobo/reconciliation` on a seeded session returns a response that structurally validates against a TypeScript-derived schema of `ReconciliationFlowView`; (c) 403 without `RECON_VIEW`, 404 on unknown session.
3. **FE layer.** Loader rewrite + mock deletion + loading/error states. Verification: `pnpm --filter admin-frontend build` passes; page renders against the live seeded endpoint with the same visual as the mock today; network-off shows the error card; `git grep mobo-flow-data` returns zero hits.

**Human gate(s):**
- Before **BE deploys the synthesizer hook into the IB Flex-import path** — the human confirms the seeded IB run is safe to synthesize against and that no production run has already been imported without a session row (would need a backfill).
- Before **FE cutover to main** — the human confirms the endpoint has served at least one real (non-seed) session and its response passes contract validation.

Layer merges into `trade-reconciliation-integration`, and the human alone opens the PR to and merges into `main`.

---

## Rollback

- **DB.** `alembic downgrade -1` drops `algotrade_executions` → `algotrade_orders` → `recon_sessions` in FK order. Additive-only — no existing rows affected. Clean rollback.
- **BE.** Branch revert. If the synthesizer already ran against production, rolled-back code leaves orphaned rows in tables that would then be dropped by the DB rollback — safe order is BE-revert → DB-downgrade.
- **FE.** Branch revert restores the mock file (still in git history) — page returns to mock-backed rendering.

The change is additive-only. There is no data loss on rollback.

---

## Open questions

### Resolved

- **Q-1 — Session grouping semantics.** **Resolved: one session per Flex-import run**, per D-3 (`(trade_date, ib_run_id)`) — no finer sub-day windowing. `recon_sessions` stays as drafted, no schema change.
- **Q-3 — AlgoTrade↔IB join key.** **Resolved: keep the implicit attribute join** — `(symbol, side, trade_date, model_id)`, trivial today since synthesized rows mirror IB 1:1. Do not reserve a `client_order_id`-style `ref` column as the join key yet; revisit once a real AlgoTrade API sample exists (tracked under "Out of scope" below).
- **Q-4 — Break tolerance.** **Resolved: configurable epsilon, not a hardcoded constant.** See BE D-2 — `RECON_NOTIONAL_EPSILON` config value, default `$0.01`, applied to notional comparisons only (`qty`/`price` stay exact). Business can retune the default without a code change.
- **Q-5 — Currency / FX.** **Resolved: USD-only for now.** No base-currency normalization; matches the current all-USD dataset. Revisit if a multi-currency client or model is onboarded.
- **Q-6 — Refresh cadence.** **Resolved: manual reload only**, no polling/websocket. One fetch per page load, matching the page's current behavior.
- **Q-7 — Scenario toggling.** **Resolved: removed entirely** (D-4 / FE A-4) — no env-flag demo path. Real reconciliation breaks are the product.
- **Q-8 — Historical session navigation.** **Resolved: latest-session only, no picker.** `session_id` is optional on the endpoint (see BE §C) and defaults to the most recent `recon_sessions` row; no `/sessions` list endpoint or UI dropdown is built.
- **Q-9 — Error envelope shape.** **Resolved: reuse the existing bare `HTTPException(detail=...)` convention**, not a new `{code, message, details?}` envelope. The new envelope was proposed without precedent in this codebase; introducing it here — including wrapping the shared `require_action()` 403 to match — would be a cross-cutting refactor out of scope for this proposal. See §4.1 error envelope. Unifying the error format app-wide is tracked as a **future refactor** (own branch), alongside Q-12.
- **Q-10 — `client_profiles.id` type.** **Resolved: keep as-is (autoincrement int), cast to string on the wire.** No schema change. Migrating `client_profiles.id` to UUID is **tracked as a future refactor**, alongside Q-9 and Q-12 — not justified by this proposal's scope alone.
- **Q-11 — Seam field-map accuracy.** **Resolved: corrected in place.** `RcAlloc.client` → `client_profiles.name` (not `display_name`); `RcAllocModelLine.units` → `client_subscriptions.multiplier` (not `units`). Pure documentation fix, no schema/model change — see §4.1.
- **Q-12 — `recon_sessions` ↔ `allocation_model_snapshots` join.** **Resolved: composite FK for now** (`allocation_period_id, allocation_user_id, allocation_model_id`) since `allocation_model_snapshots` has no single-column PK. Adding a surrogate PK to that table is **tracked as a future refactor**, alongside Q-9 and Q-10 — batching all three schema/format cleanups into one dedicated branch rather than scope-creeping this proposal.

### Out of scope (tracked elsewhere)

- **Real AlgoTrade API integration** — future track, will replace `synth.py` under this same tree. Also decides the stable order join-key contract (client-assigned order id echoed by IB) deferred in Q-3 above.
- **`Auto-match` button** — no handler today; whichever proposal ships auto-matching owns it.
- **Two-panel triage view** (`recon-overview`, `daily-exception-report`) — untouched; owned by prior recon proposals.
- **Schema/format cleanup refactor** (future track, own branch) — bundles three items surfaced during implementation planning: (1) unify the error-response envelope across all backend routes (Q-9), (2) migrate `client_profiles.id` from int to UUID (Q-10), (3) add a surrogate PK to `allocation_model_snapshots` and simplify the `recon_sessions` FK to single-column (Q-12).
