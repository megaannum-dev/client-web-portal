# 012 — Trade Reconciliation · Implementation Details — Frontend

> Status: **DRAFT — pending implementation.**
> Implements: `docs/proposals/012-2026-07-15-trade-recon-integration.md` § Layer 3 — Frontend
> Layer: Frontend — **one layer per file.**
> Sibling layer docs: [`012-trade-recon-integration-db.md`](012-trade-recon-integration-db.md), [`012-trade-recon-integration-be.md`](012-trade-recon-integration-be.md)
> Execution schedule: `docs/execution-schedules/012-trade-recon-integration-fe.md`
> Branch: `trade-reconciliation-integration-fe` — cut from `trade-reconciliation-integration`. Merges back into the parent; the human owns that merge.
> Builds on / prerequisites: `GET /api/mobo/reconciliation` (see `012-trade-recon-integration-be.md`) reachable on the target API base URL; `admin-frontend/lib/mobo/flow-types.ts` unchanged (authoritative types, already committed).

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/012-2026-07-15-trade-recon-integration.md` § Layer 3 — Frontend, § 4 (Cross-layer seam) |
| Execution schedule | `docs/execution-schedules/012-trade-recon-integration-fe.md` |
| Sibling layer impl docs | `docs/implementations/012-trade-recon-integration-db.md`, `docs/implementations/012-trade-recon-integration-be.md` |
| Builds on | Backend layer's `GET /api/mobo/reconciliation` route (contract only — not the sibling branch itself) |

**Convention correction vs. the proposal.** The proposal's FE finding A-1 floated "recommend server component" for the data-fetch rewrite. The actual, already-established convention for every other MOBO screen in this codebase (Post-Trade Allocation, proposal 011) is a **client-component + hook + Next.js server-action** layering, not a server component doing a top-level `await`:

```
page.tsx (client)
  → hooks/api/use<Feature>.ts (client hook: cache, loading, error, refetch)
    → app/(roles)/mobo/<feature>/actions.ts ("use server" wrapper: try/catch, logging)
      → server/mobo/index.ts (server-only: apiClient<T> + ENDPOINTS)
        → server/api-client.ts (apiClient<T>: cookie-based Bearer token, no-store fetch, APIResult<T> envelope)
```

This doc follows that established pattern exactly (mirroring `admin-frontend/hooks/api/usePostTradeAllocation.ts`, `admin-frontend/app/(roles)/mobo/post-trade-allocation/actions.ts`, `admin-frontend/server/mobo/index.ts`, `admin-frontend/server/api-client.ts`, `admin-frontend/server/endpoints.ts`) rather than the proposal's looser suggestion. This does not change any frozen-seam decision (§ 7 below is unchanged) — it only fixes *how* the fetch happens to match sibling code, which is more consistent than the proposal's untested alternative.

---

## 2. Branch & session contract

- **Branch:** `trade-reconciliation-integration-fe`, cut from `trade-reconciliation-integration`.
- **Isolation:** fully independent of the DB/BE layer branches; this layer builds against the wire contract (§ 7) and can be developed against a mocked `apiClient` response before the Backend branch merges.
- **Preconditions:**
  - [ ] The frozen seam (§ 7) is agreed and matches the proposal § 4 verbatim.
  - [ ] `NEXT_PUBLIC_API_BASE_URL` / `id_token` cookie flow already work for other MOBO screens (confirmed via the working Post-Trade Allocation page) — no new auth plumbing needed.
- **Read-first inventory:**
  - `admin-frontend/lib/mobo/flow-types.ts` — authoritative types (`ReconciliationFlowView`, `RcOrder`, `RcAlloc`, `RcPort`, `RcBreakCounts`, `fmtUsd`, `pctOf`); unchanged except FE-4 removes `RcScenarioKey`.
  - `admin-frontend/lib/mobo/reconciliation-flow.ts` — today's mock-backed seam; rewritten in FE-3.
  - `admin-frontend/lib/mock/mobo-flow-data.ts` — deleted in FE-6.
  - `admin-frontend/app/(roles)/mobo/trade-reconciliation/page.tsx` — today calls `loadReconciliationFlow("breaks")` synchronously at render (line ~45); rewritten in FE-5 to consume the new hook. Layout/components (`Cards.tsx`, `Detail.tsx`) are **untouched** per the proposal's Constraint.
  - `admin-frontend/server/api-client.ts` — `apiClient<T>`, `APIResult<T>` envelope, cookie-based auth (reused verbatim, no changes).
  - `admin-frontend/server/endpoints.ts` — `ENDPOINTS.MOBO.*` (extended, not restructured).
  - `admin-frontend/server/mobo/index.ts` — server-only fetch functions (extended with reconciliation functions, same file, same style as the existing PTA functions).
  - `admin-frontend/app/(roles)/mobo/post-trade-allocation/actions.ts`, `admin-frontend/hooks/api/usePostTradeAllocation.ts`, `admin-frontend/lib/mobo/allocation.ts` — the sibling-feature reference implementation this layer mirrors unit-for-unit.
- **Hand-off / exit signal:** all FE-* units committed, `pnpm --filter admin-frontend build` passes, page renders against a live seeded Backend endpoint, `git grep mobo-flow-data` and `git grep RcScenarioKey` both return zero hits, PR opened.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- **Data-access layering:** see § 1's diagram — this is the fixed convention, not something this layer invents.
- **Server-only fetch functions** live in `admin-frontend/server/<domain>/index.ts`, marked `"use server"`, importing `apiClient`/`ENDPOINTS` only — never called directly from a client component.
- **Actions** (`app/(roles)/mobo/<feature>/actions.ts`) are the `"use server"` boundary a client hook calls; they wrap the server function in try/catch + `logger.log`/`logger.json`, converting thrown errors to the `APIResult` failure shape via a local `toErrorResult`.
- **Hooks** (`hooks/api/use<Feature>.ts`) own `data`/`loading`/`error`/`refetch` state, a module-scoped cache keyed by the request's discriminating param (here: `session_id ?? "__latest__"`), and refetch-on-window-refocus.
- **Mappers** (`lib/mobo/<feature>.ts`) are pure DTO→View functions with zero fetch logic — reused here almost as a no-op since the wire DTO already matches `ReconciliationFlowView` field-for-field (proposal D-1: backend serves the FE's DTO verbatim).
- **No design/layout changes** — `Cards.tsx`/`Detail.tsx`/`page.tsx`'s JSX structure are out of scope; only data-sourcing code changes.

### 3.2 CI/CD & engineering discipline
- **Trunk-friendly, small units.** Each FE-* unit is a self-contained, revertible commit.
- **Every unit is independently revertible**, except FE-5 (page.tsx) which depends on FE-1 through FE-4 being present to import.
- **Additive & backward-compatible first.** FE-1/FE-2/FE-3/FE-4 land as new files/functions alongside the still-working mock; FE-5 (the actual cutover) and FE-6 (mock deletion) land last, so the branch stays deployable at every commit.
- **Gates before merge** (`vitest.config.ts`/`vitest.setup.ts` already present in `admin-frontend/`, so this layer has a real automated gate):
  ```bash
  cd admin-frontend
  npx vitest run && npx tsc --noEmit && npx next lint
  ```
- **No secrets, no manual steps in the merge path.** Confirming the endpoint has served ≥1 real session before cutover is a human gate (proposal's Execution & verification), not baked into a commit.
- **Reversibility documented:** see § 9.

---

## 4. Architecture

**Target layout:**
```
admin-frontend/server/endpoints.ts               # FE-1 — + ENDPOINTS.MOBO.RECONCILIATION (modified)
admin-frontend/server/mobo/index.ts               # FE-1 — + getReconciliation() (modified)
admin-frontend/app/(roles)/mobo/trade-reconciliation/
├── actions.ts                                    # FE-2 — NEW, "use server" boundary
└── page.tsx                                      # FE-5 — rewritten (data-sourcing only)
admin-frontend/hooks/api/useReconciliationFlow.ts  # FE-3 — NEW, client hook
admin-frontend/lib/mobo/
├── flow-types.ts                                  # FE-4 — modified (RcScenarioKey removed)
├── reconciliation-flow.ts                         # FE-4 — rewritten (pure mapper, no fetch)
└── (reconciliation.ts, types.ts unchanged — the OTHER mobo triage screen's seam)
admin-frontend/lib/mock/mobo-flow-data.ts          # FE-6 — DELETED
```

**Dependency direction:** `page.tsx → useReconciliationFlow (hook) → actions.ts (server action) → server/mobo (server fetch) → server/api-client (HTTP)`. The pure mapper (`reconciliation-flow.ts`) is called by the hook, not by `page.tsx` directly — mirroring `usePostTradeAllocation`'s call to `mapDtoToPostTradeAllocation`.

**External seams:** consumes `GET /api/mobo/reconciliation?session_id=<uuid>` per § 7. No new component props cross into `Cards.tsx`/`Detail.tsx` — they already consume `ReconciliationFlowView`'s row types unchanged.

---

## 5. Modules

### 5.1 `server/mobo` (extended) + `server/endpoints.ts` (extended)
- **Responsibility:** the one place a Next.js server context reaches the reconciliation endpoint.
- **Files:** `admin-frontend/server/endpoints.ts`, `admin-frontend/server/mobo/index.ts`.
- **Public surface:** `ENDPOINTS.MOBO.RECONCILIATION`; `getReconciliation(sessionId?: string): Promise<APIResult<ReconciliationFlowViewDTO>>`.
- **Owns features:** FE-1.

### 5.2 `app/(roles)/mobo/trade-reconciliation/actions.ts`
- **Responsibility:** `"use server"` boundary the client hook calls.
- **Files:** `admin-frontend/app/(roles)/mobo/trade-reconciliation/actions.ts` (new).
- **Public surface:** `getFlow(sessionId?: string): Promise<APIResult<ReconciliationFlowViewDTO>>`.
- **Owns features:** FE-2.

### 5.3 `hooks/api/useReconciliationFlow.ts`
- **Responsibility:** client-side data/loading/error state + cache + refetch-on-refocus.
- **Files:** `admin-frontend/hooks/api/useReconciliationFlow.ts` (new).
- **Public surface:** `useReconciliationFlow(sessionId?: string): { data, loading, error, refetch }`.
- **Owns features:** FE-3.

### 5.4 `lib/mobo/reconciliation-flow.ts` + `flow-types.ts`
- **Responsibility:** pure DTO→View mapping (near-identity, since the wire DTO already matches `ReconciliationFlowView`) and the authoritative types, scenario plumbing removed.
- **Files:** `admin-frontend/lib/mobo/reconciliation-flow.ts`, `admin-frontend/lib/mobo/flow-types.ts` (modified).
- **Public surface:** `mapDtoToReconciliationFlow(dto): ReconciliationFlowView`.
- **Owns features:** FE-4.

### 5.5 `page.tsx`
- **Responsibility:** page shell, selection state, layout measurement — unchanged except the data-sourcing lines.
- **Files:** `admin-frontend/app/(roles)/mobo/trade-reconciliation/page.tsx` (modified).
- **Owns features:** FE-5.

### 5.6 Mock deletion
- **Files:** `admin-frontend/lib/mock/mobo-flow-data.ts` (deleted).
- **Owns features:** FE-6.

---

## 6. Features

### FE-1 — Endpoint + server fetch function (MANDATORY)

- **Proposal ref:** § Layer 3 A-1, § 4.1 (wire contract)
- **Module:** 5.1
- **Files:** `modify: admin-frontend/server/endpoints.ts`, `modify: admin-frontend/server/mobo/index.ts`
- **Dependencies:** none — parallel-safe

**Contract:**
```ts
// server/endpoints.ts — add alongside the existing MOBO block
export const ENDPOINTS = {
  ...
  MOBO: {
    PTA:      `${MOBO}/post-trade-allocation`,
    PTA_RUNS: `${MOBO}/post-trade-allocation/runs`,
    PTA_RUN:  `${MOBO}/post-trade-allocation/run`,
    RECONCILIATION: `${MOBO}/reconciliation`,
  },
} as const;
```
```ts
// server/mobo/index.ts — add alongside the existing PTA functions
import type { ReconciliationFlowViewDTO } from "@/lib/mobo/flow-types";

/** GET the reconciliation flow view for a session; omitted = latest (§4.1, Q-8). */
export async function getReconciliation(sessionId?: string): Promise<APIResult<ReconciliationFlowViewDTO>> {
  const path = sessionId
    ? `${ENDPOINTS.MOBO.RECONCILIATION}?session_id=${encodeURIComponent(sessionId)}`
    : ENDPOINTS.MOBO.RECONCILIATION;
  return apiClient<ReconciliationFlowViewDTO>(path);
}
```

**Behavior / invariants:** `ReconciliationFlowViewDTO` is a **new type alias** in `flow-types.ts` (FE-4) — structurally identical to `ReconciliationFlowView` today, kept as a separate name so the wire DTO and the FE view type can diverge later without renaming call sites (the same pattern `PtaViewDTO` vs. `PostTradeAllocationView` already uses in `lib/mobo/types.ts`). `apiClient` already attaches the `id_token` cookie as a Bearer token and returns the `APIResult<T>` envelope — no new auth code.

**Done when:** `getReconciliation()` compiles against `apiClient`'s real signature; calling it against a running Backend returns `{ success: true, data: ... }` for a valid session and `{ success: false, error, code: "HTTP_404" }` for an unknown one.

---

### FE-2 — Server action boundary (MANDATORY)

- **Proposal ref:** § Layer 3 A-1
- **Module:** 5.2
- **Files:** `create: admin-frontend/app/(roles)/mobo/trade-reconciliation/actions.ts`
- **Dependencies:** FE-1

**Contract:**
```ts
"use server";

import { getReconciliation as _getReconciliation, type APIResult } from "@/server/mobo";
import type { ReconciliationFlowViewDTO } from "@/lib/mobo/flow-types";
import { logger } from "@/lib/logger";

function toErrorResult(error: unknown): { success: false; error: string; code: string } {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
    code: "ACTION_ERROR",
  };
}

export async function getFlow(sessionId?: string): Promise<APIResult<ReconciliationFlowViewDTO>> {
  try {
    logger.log("🔄 Fetching reconciliation flow:", { sessionId });
    const response = await _getReconciliation(sessionId);
    logger.json("✅ Get reconciliation flow response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching reconciliation flow:", { error, sessionId });
    return toErrorResult(error);
  }
}
```

**Behavior / invariants:** identical shape to `post-trade-allocation/actions.ts`'s `getView` — same logging convention, same error-to-`APIResult` conversion.

**Done when:** `getFlow()` returns the same `APIResult` shape `_getReconciliation` does on success, and a thrown network error is converted to `{ success: false, error, code: "ACTION_ERROR" }` rather than propagating.

---

### FE-3 — `useReconciliationFlow` hook (MANDATORY)

- **Proposal ref:** § Layer 3 A-3 (loading/error states)
- **Module:** 5.3
- **Files:** `create: admin-frontend/hooks/api/useReconciliationFlow.ts`
- **Dependencies:** FE-2, FE-4 (calls the mapper)

**Contract:**
```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getFlow } from "@/app/(roles)/mobo/trade-reconciliation/actions";
import { mapDtoToReconciliationFlow } from "@/lib/mobo/reconciliation-flow";
import type { ReconciliationFlowView } from "@/lib/mobo/flow-types";

export interface UseReconciliationFlowResult {
  data: ReconciliationFlowView | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const cache = new Map<string, ReconciliationFlowView>();
const cacheKey = (sessionId: string | undefined) => sessionId ?? "__latest__";

export function useReconciliationFlow(sessionId?: string): UseReconciliationFlowResult {
  const [data, setData] = useState<ReconciliationFlowView | null>(
    () => cache.get(cacheKey(sessionId)) ?? null,
  );
  const [loading, setLoading] = useState(!cache.has(cacheKey(sessionId)));
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const doFetch = useCallback(async (id: string | undefined) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await getFlow(id);
      if (result.success) {
        const view = mapDtoToReconciliationFlow(result.data);
        cache.set(cacheKey(id), view);
        setData(view);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reconciliation flow");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => { doFetch(sessionId); }, [sessionId, doFetch]);

  return { data, loading, error, refetch: () => doFetch(sessionId) };
}
```

**Behavior / invariants:** matches `usePostTradeAllocation`'s shape (module-scoped cache, in-flight guard, `refetch`) minus the refocus-refetch and `sync()` extras that PTA needs and reconciliation doesn't (no manual "Sync" action on this page — proposal Q-6 resolved, manual reload only, and reload here means the page's own remount / an explicit `refetch()` call, not a background poll).

**Done when:** the hook transitions `loading: true → false` with `data` populated on success; on a failed fetch, `error` is set and `data` stays `null` (or the last cached value, matching PTA's behavior); `refetch()` re-triggers a fetch bypassing nothing (cache is overwritten on success).

---

### FE-4 — Rewrite the mapper; remove scenario plumbing (MANDATORY / Accepted)

- **Proposal ref:** § Layer 3 A-2, A-4
- **Module:** 5.4
- **Files:** `modify: admin-frontend/lib/mobo/reconciliation-flow.ts`, `modify: admin-frontend/lib/mobo/flow-types.ts`
- **Dependencies:** none — parallel-safe with FE-1/FE-2/FE-3 (only FE-3 depends on this one)

**Contract:**
```ts
// lib/mobo/flow-types.ts — delete RcScenarioKey and add the DTO alias
// (all other types — RcExec, RcOrder, RcAlloc, RcPort, RcBreakCounts,
//  ReconciliationFlowView, fmtUsd, pctOf — are UNCHANGED)

// REMOVED: export type RcScenarioKey = "matched" | "breaks" | ...;

export type ReconciliationFlowViewDTO = ReconciliationFlowView; // wire shape, kept as a distinct alias (FE-1)
```
```ts
// lib/mobo/reconciliation-flow.ts — full rewrite: pure mapper, no fetch, no mock
import type { ReconciliationFlowView, ReconciliationFlowViewDTO } from "@/lib/mobo/flow-types";

/**
 * THE SINGLE DATA MAPPER for the reconciliation flow view. Near-identity
 * today because the backend already serves ReconciliationFlowView verbatim
 * (proposal D-1) — kept as an explicit function, not a raw pass-through,
 * so a future wire/view divergence has exactly one place to change.
 */
export function mapDtoToReconciliationFlow(dto: ReconciliationFlowViewDTO): ReconciliationFlowView {
  return dto;
}

export { fmtUsd, pctOf } from "@/lib/mobo/flow-types";
```

**Behavior / invariants:** the `counts` field passes through untouched — this is exactly proposal FE A-2 ("stop re-deriving `counts`"; the old `algIbBrk`/`ibCrmBrk`/`algCrmBrk` filter-based derivation is deleted, not ported). `RcScenarioKey` and the `scenario` parameter are gone entirely (FE A-4 / D-4) — no env-flag demo path is added in this layer (tracked as a future item per the proposal's "Out of scope").

**Done when:** `mapDtoToReconciliationFlow` compiles as an identity function against the shared type; `git grep RcScenarioKey` returns zero hits after this unit (until FE-5/FE-6 also land, since `page.tsx` still calls the old signature until then — full zero-hits is the layer's overall exit signal, not this unit's alone).

---

### FE-5 — Cutover `page.tsx` to the hook + loading/error states (MANDATORY / Yes — user req.)

- **Proposal ref:** § Layer 3 A-1, A-3
- **Module:** 5.5
- **Files:** `modify: admin-frontend/app/(roles)/mobo/trade-reconciliation/page.tsx`
- **Dependencies:** FE-3

**Contract:**
```tsx
// page.tsx — data-sourcing lines only; JSX/layout/measurement code below
// this point is UNCHANGED (proposal Constraint: no design/layout changes)
"use client";

import { useReconciliationFlow } from "@/hooks/api/useReconciliationFlow";
// (existing imports: OrderCard, AllocCard, PortfolioCard, FlowRow, FlowConnector, FlowDetail, PageHeader, Button, MetricStat, icons — unchanged)

export default function TradeReconciliationPage() {
  const { data: view, loading, error, refetch } = useReconciliationFlow();

  if (loading && !view) {
    return <PageHeader title="Trade Reconciliation" />; // <TODO: skeleton matching Cards.tsx's row shape — proposal FE A-3, no design spec given>
  }
  if (error) {
    return (
      <div role="alert">
        {/* <TODO: error card per proposal FE A-3; retry calls refetch() */}
        <Button onClick={refetch}>Retry</Button>
      </div>
    );
  }
  if (!view) return null;

  const { orders, allocs, ports, counts } = view;
  // ...rest of the component body (selection state, cross-layer highlighting,
  // ResizeObserver height measurement, JSX) is IDENTICAL to today — no logic
  // beyond the four lines above changes.
}
```

**Behavior / invariants:** everything from `const [sel, setSel] = useState<Sel>(null);` onward in the current file is untouched — this unit only replaces the synchronous `const view = loadReconciliationFlow("breaks");` call and adds the loading/error branches above it. The `Auto-match` button (`page.tsx` ~line 102) keeps its existing no-op state (out of scope, proposal § Layer 3 C).

**Done when:** the page renders the live-fetched view identically to how it rendered the mock's `"breaks"` scenario (visual parity, proposal's "Objectives" § Parity-with-mock goal); a simulated network failure renders the error branch instead of throwing; `pnpm --filter admin-frontend build` passes.

---

### FE-6 — Delete the mock (MANDATORY)

- **Proposal ref:** § Layer 3 A-1
- **Module:** 5.6
- **Files:** `delete: admin-frontend/lib/mock/mobo-flow-data.ts`
- **Dependencies:** FE-4, FE-5 (nothing may still import it)

**Contract:** file removal — no code contract.

**Behavior / invariants:** `git grep mobo-flow-data` returns zero hits anywhere in `admin-frontend/` after this unit (the file is still recoverable from git history per the proposal's Rollback section).

**Done when:** the file no longer exists, the build still passes, and no import references it.

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
  ref: string; ib: string;
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

**Error envelope:** bare `HTTPException(status_code, detail=<string>)` on the backend, surfaced to this layer as `apiClient`'s `APIResult<T>` failure shape (`{ success: false, error: string, code: string }`) — this layer never parses a `{code, message, details?}` envelope because one doesn't exist (proposal Q-9, resolved).

### 7.2 How this layer honours the seam
- **What this layer contributes:** consumes `ReconciliationFlowView` verbatim at `useReconciliationFlow` → `mapDtoToReconciliationFlow` (identity mapping); adds loading/error states around the fetch; deletes `mobo-flow-data.ts` and `RcScenarioKey`.
- **What this layer assumes from the other side:** the backend returns the DTO exactly as in § 7.1; `counts` is authoritative (this layer stops re-deriving it, FE-4).
- **Change protocol:** any edit here requires editing the proposal § 4 first; this section is then re-copied.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Framework / runner:** vitest — command: `npx vitest run` (from `admin-frontend/`; `vitest.config.ts` + `vitest.setup.ts` already present).
- **Fixtures / seed:** hand-built `ReconciliationFlowViewDTO` fixtures covering the matched and MSFT-partial-fill scenarios (mirroring the two scenarios the current mock covers), used to drive `mapDtoToReconciliationFlow` and hook tests without a real network call.
- **Isolation:** `vi.mock` replaces `@/app/(roles)/mobo/trade-reconciliation/actions` (for hook tests) and `@/server/mobo` (for the server-fetch-function test) — hermetic, no real fetch.
- **Layer isolation:** FE tests import only `admin-frontend` code plus vitest/test doubles — never spin up the Backend, never hit a real `/api/mobo/reconciliation`. The Backend seam is faked via `vi.fn()` returning a canned `APIResult<ReconciliationFlowViewDTO>`.
- **Test location:** `admin-frontend/tests/` mirroring source paths (e.g. `admin-frontend/tests/hooks/useReconciliationFlow.test.ts`), per `admin-frontend/.gitignore`'s `tests/` entry.
- **Commit policy:** never committed — `tests/` is git-ignored.
- **Code generation:** `test-gen` skill writes the concrete tests from § 8.2/8.3.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| FE-1 | `getReconciliation` builds the correct path with/without `session_id`; delegates to `apiClient` | mocks `@/server/api-client`'s `apiClient` |
| FE-2 | `getFlow` returns success/failure `APIResult` shapes; catches thrown errors | mocks `@/server/mobo`'s `getReconciliation` |
| FE-3 | hook's loading→data / loading→error transitions; cache hit skips a refetch; `refetch()` re-fetches | mocks `@/app/(roles)/mobo/trade-reconciliation/actions`'s `getFlow` |
| FE-4 | mapper is a faithful identity; `RcScenarioKey` no longer exported | none (pure function / type-level check) |
| FE-5 | page renders loading skeleton, then data, then error branch on a forced failure | mocks `useReconciliationFlow` |
| FE-6 | no remaining import of the deleted mock file | none (static grep-style check, or a build-time assertion) |

### 8.3 Test goals

#### FE-1
- **Positive:** `getReconciliation("abc")` calls `apiClient` with a path ending `?session_id=abc`; `getReconciliation()` (no arg) calls it with the bare path.
- **Negative:** a mocked `apiClient` failure response (`{ success: false, ... }`) passes through unchanged.
- **Invariants:** the `session_id` query value is URI-encoded.
- **Seam mocks:** `apiClient` mocked to a `vi.fn()` recording its call args and returning a canned `APIResult`.

#### FE-2
- **Positive:** on a successful `getReconciliation` mock, `getFlow` returns the same `{ success: true, data }`.
- **Negative:** a thrown error from the mocked `getReconciliation` is caught and converted to `{ success: false, error, code: "ACTION_ERROR" }`, not re-thrown.
- **Invariants:** logging calls (`logger.log`/`logger.json`) never throw even if `logger` itself is mocked away.
- **Seam mocks:** `@/server/mobo`'s `getReconciliation` mocked.

#### FE-3
- **Positive:** first render with an empty cache shows `loading: true`; after the mocked `getFlow` resolves successfully, `loading: false` and `data` equals the mapped fixture. A second mount with the same `sessionId` reads from cache (`loading: false` immediately).
- **Negative:** a mocked `getFlow` failure sets `error` and leaves `data` at its previous value (`null` on first load).
- **Invariants:** calling `refetch()` while a fetch is already in flight is a no-op (the `inFlight` guard).
- **Seam mocks:** `getFlow` mocked via `vi.mock` of the actions module.

#### FE-4
- **Positive:** `mapDtoToReconciliationFlow(fixture)` returns a value `Object.is`-equal in shape to the input fixture for both the matched and MSFT-partial-fill fixtures.
- **Negative:** n/a (identity function; nothing to reject).
- **Invariants:** a TypeScript compile-time check (not a runtime test) confirms `RcScenarioKey` is no longer exported from `flow-types.ts`.
- **Seam mocks:** none.

#### FE-5
- **Positive:** with `useReconciliationFlow` mocked to `{ data: fixture, loading: false, error: null }`, the page renders the same order/alloc/port cards as today's mock-backed render (spot-check a few key labels/values via `render` + `screen.getByText`).
- **Negative:** with `{ data: null, loading: false, error: "boom" }`, the error branch renders (not a crash); clicking "Retry" calls the mocked `refetch`.
- **Invariants:** with `{ data: null, loading: true, error: null }`, the loading branch renders without throwing on `undefined` array access (guards the exact bug proposal A-3 called out).
- **Seam mocks:** `useReconciliationFlow` mocked via `vi.mock("@/hooks/api/useReconciliationFlow")`.

#### FE-6
- **Positive:** a project-wide search confirms no remaining `from "@/lib/mock/mobo-flow-data"` import.
- **Negative:** n/a.
- **Invariants:** the build (`next build`) succeeds without the deleted file.
- **Seam mocks:** none.

### 8.4 Aggregate gate
- All unit tests green is a local gate before commit/PR hand-off.
- Target coverage: ≥ 90% of new/changed statements across FE-1 through FE-4 (FE-5/FE-6 are thin enough that a couple of render-branch tests suffice, per FE-5's goals above).
- Chosen `test-gen` level for this layer: `standard`.

---

## 9. Definition of done & rollback

**Definition of done:**
- [ ] FE-1 through FE-6 committed on `trade-reconciliation-integration-fe`; each commit left the branch green.
- [ ] § 8 unit tests all pass; `npx vitest run && npx tsc --noEmit && npx next lint` green.
- [ ] § 7 matches the proposal's frozen seam verbatim.
- [ ] `git grep mobo-flow-data` and `git grep RcScenarioKey` both return zero hits.
- [ ] Page renders against a live seeded Backend endpoint with the same visual as the mock today (human-verified, proposal's Execution & verification § 3(c)).
- [ ] PR opened; human owns the merge to `trade-reconciliation-integration`.

**Rollback:** reverting the branch restores `mobo-flow-data.ts` (recoverable from git history) and the old synchronous `loadReconciliationFlow("breaks")` call in `page.tsx` — the page returns to fully mock-backed rendering with zero data loss, since this layer never writes anything (read-only consumer of the Backend endpoint).
