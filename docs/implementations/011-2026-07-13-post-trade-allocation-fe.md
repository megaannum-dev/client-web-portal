# 011 — Post-Trade Allocation: periodic run, persistence, and frontend integration · Implementation Details — Frontend

> Status: **DRAFT — pending implementation.**
> Implements: proposal `docs/proposals/011-2026-07-13-post-trade-allocation.md` § "Layer 3 — Frontend" (§A-1/A-2/A-3, §B, §C, §D) and the frontend-relevant design decisions D-4, D-7, D-9, D-10.
> Layer: Frontend — **one layer per file.**
> Sibling layer docs: `docs/implementations/011-2026-07-13-post-trade-allocation-db.md`, `docs/implementations/011-2026-07-13-post-trade-allocation-be.md`.
> Execution schedule: `docs/execution-schedules/011-2026-07-13-post-trade-allocation-fe.md` (not yet created).
> Branch: `post-trade-allocation-integration-fe` — cut from parent `post-trade-allocation-integration`, merges back into it (human owns the merge).
> Builds on / prerequisites: the frozen wire contract in proposal §4.1 (this layer mocks the seam in its own tests — it does not import or wait on the Backend branch); the existing MOBO view types (`lib/mobo/types.ts`) and PC transport precedent (`server/pc/*`, `hooks/api/useAllocation.ts`).

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/011-2026-07-13-post-trade-allocation.md` § "Layer 3 — Frontend", §4.1 (seam), D-4/D-7/D-9/D-10 |
| Execution schedule | `docs/execution-schedules/011-2026-07-13-post-trade-allocation-fe.md` |
| Sibling layer impl docs | `docs/implementations/011-2026-07-13-post-trade-allocation-db.md`, `docs/implementations/011-2026-07-13-post-trade-allocation-be.md` |
| Builds on | Proposal §4.1 frozen wire contract; 006 frontend precedent (`docs/implementations/006-2026-06-24-trading-models-and-client-subscriptions (frontend).md`) for the transport-stack shape this layer replicates |

---

## 2. Branch & session contract (req 4 — independently executable)

- **Branch:** `post-trade-allocation-integration-fe` — all work units in this doc land on this one branch.
  - **Naming convention:** parent branch `post-trade-allocation-integration` + `-fe` suffix.
  - The parent branch is captured at session start (`git rev-parse --abbrev-ref HEAD`); this layer branch is cut from it. It merges back into the parent — **the human owns that merge**.
- **Isolation:** implementable in a separate session on its own branch, in parallel with the DB and Backend layers, provided the preconditions below hold. It shares state with the other layers **only** through the seam pinned in §7 — it does not import backend or DB code, and its tests fake the seam rather than hitting a real API.
- **Preconditions (must be true before starting):**
  - [ ] The seam in proposal §4.1 is frozen (it is, as of this doc) — this doc's §7 is a verbatim copy, not a negotiation with the Backend layer.
  - [ ] `admin-frontend/lib/mobo/types.ts` and the existing PTA components (`page.tsx`, `Panels.tsx`, `StackedBarChart.tsx`) are present on the branch unmodified from their current mock-bound state (they are, per repo HEAD).
  - [ ] The PC transport precedent (`server/pc/index.ts`, `server/endpoints.ts`, `hooks/api/useAllocation.ts`, `server/api-client.ts`) exists and is unchanged — this layer mirrors its shape, not its content.
- **Read-first inventory:**
  - `admin-frontend/lib/mobo/allocation.ts` — the seam to repurpose from mock pro-rata calculator into a pure DTO→view mapper.
  - `admin-frontend/lib/mobo/types.ts` — view types; `PtaClientShare.delegated` renames to `allocated` here.
  - `admin-frontend/lib/mock/mobo-data.ts` — delete the `PTA_MODELS` / `PTA_CLIENTS` / `PTA_UNITS` block and its import in `allocation.ts` (the file's other exports — `SETTLE_DAY`, `STORED_TRADES`, `EXCEPTIONS`, etc. — belong to reconciliation and are out of scope; do not touch them).
  - `admin-frontend/app/(roles)/mobo/post-trade-allocation/page.tsx` — swaps the synchronous `loadPostTradeAllocation()` call for the new hook; adds the Sync button.
  - `admin-frontend/components/mobo/allocation/Panels.tsx` — `Donut` reads `s.delegated` (line 96, 111,183); `DateControl`'s `PTA_DISCRETE_DATES` const (line 378) is replaced by hook-fed data.
  - `admin-frontend/components/mobo/allocation/StackedBarChart.tsx` — `buildChartData`/`ChartTooltip` read `cs.delegated` / `share.delegated` (lines 96, 123).
  - `admin-frontend/lib/pc/format.ts`, `admin-frontend/hooks/api/useAllocation.ts`, `admin-frontend/server/pc/index.ts`, `admin-frontend/server/endpoints.ts`, `admin-frontend/server/api-client.ts` — the structural precedent this layer mirrors for `server/mobo` + `usePostTradeAllocation`.
- **Hand-off / exit signal:** all `FE-*` units committed; `lib/mock/mobo-data.ts`'s `PTA_*` block deleted with no dangling imports; the page renders against the hook (still against a faked/mocked backend response in this layer's own tests, per layer isolation); `next build` passes; PR opened.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- **Layering / dependency direction (the canonical fetch chain, already shipped for PC/RM):** `page.tsx → hooks/api/*.ts ("use client") → app/**/actions.ts ("use server") → server/<area>/index.ts → server/api-client.ts → server/endpoints.ts`. A layer may only call downward through this chain; `lib/mobo/allocation.ts` (the mapper) is called by the hook, not by `page.tsx` directly.
- **Naming:** DTO field `units` (not `multiplier` — that's the DB column name, per D-4) and `allocated` (not `delegated` — renamed per D-7) are the frozen view-type field names; the mapper does no renaming of its own since the DTO already arrives in these names.
- **Return/error envelope:** `APIResult<T> = {success:true,data:T} | {success:false,error:string,code:string}` (`server/api-client.ts`), reused verbatim — no new envelope type for MOBO.
- **Money:** DTO numbers are already JSON numbers in major units (§4.1) — no string-to-Decimal parsing in this layer, unlike the recon DTOs' `DecimalString`. `ptaMoney()` stays the only presentation formatter, exported from `lib/mobo/allocation.ts` (matches the `lib/pc/format.ts` precedent of colocating formatters with the seam).
- **Module layout:** one new transport module (`server/mobo/index.ts`), one new endpoints block (`MOBO` in `server/endpoints.ts`), one new hook (`hooks/api/usePostTradeAllocation.ts`), one new actions file (`app/(roles)/mobo/post-trade-allocation/actions.ts`). No new component files — `Panels.tsx`/`StackedBarChart.tsx`/`page.tsx` are edited in place.

### 3.2 CI/CD & engineering discipline (req 6)

- **Trunk-friendly, small units.** Each `FE-*` unit below is one atomic, self-reviewable commit that leaves the branch green (`next build` + `tsc` + lint pass).
- **Every unit is independently revertible.** FE-1 (transport) and FE-2 (mapper/types rename) have no cross-dependency beyond FE-3/FE-4 consuming both — noted per-unit below.
- **Additive & backward-compatible first.** The type rename (`delegated → allocated`) is the one non-additive step; it is scoped to a single commit (FE-2) that touches the type plus its two read sites in the same commit, so the branch never sits mid-rename.
- **Gates before merge** (in order):
  ```bash
  cd admin-frontend
  npm run lint && npx tsc --noEmit && npx vitest run && npm run build
  ```
- **No secrets, no manual steps in the merge path.** This layer has no live-DB or live-API dependency — it is greenfield frontend code exercised against faked seam responses in its own tests (§8).
- **Reversibility documented** (§9): every unit here is a code-only, no-migration change; revert = revert the commit.

---

## 4. Architecture (level 1 of 3)

**Target layout:**
```
admin-frontend/
  server/
    endpoints.ts              # + MOBO block (edit)
    mobo/
      index.ts                # new — typed per-endpoint fns, mirrors server/pc/index.ts
  app/(roles)/mobo/post-trade-allocation/
    actions.ts                # new — "use server" wrappers over server/mobo
    page.tsx                  # edit — hook + Sync button
  hooks/api/
    usePostTradeAllocation.ts # new — mirrors useAllocation.ts
  lib/mobo/
    allocation.ts             # edit — mock loader → pure DTO→view mapper
    types.ts                  # edit — PtaClientShare.delegated → allocated
  lib/mock/
    mobo-data.ts              # edit — delete PTA_* block + its import
  components/mobo/allocation/
    Panels.tsx                # edit — .delegated read site + DateControl fed by /runs
    StackedBarChart.tsx       # edit — .delegated read site
```

**Dependency direction:** `page.tsx` depends on `usePostTradeAllocation` and `lib/mobo/allocation.ts`; the hook depends on `actions.ts`; `actions.ts` depends on `server/mobo/index.ts`; `server/mobo` depends on `server/api-client.ts` + `server/endpoints.ts`. `lib/mobo/allocation.ts` (the mapper) has zero dependency on the transport stack — it is a pure function of a DTO, callable from the hook or a test in isolation. `components/mobo/allocation/*` depend only on `lib/mobo/types.ts` and `lib/mobo/allocation.ts` (for `ptaMoney`), never on the transport stack directly.

**External seams:** consumes `GET /api/mobo/post-trade-allocation`, `GET /api/mobo/post-trade-allocation/runs`, `POST /api/mobo/post-trade-allocation/run` per proposal §4.1 (reproduced verbatim in §7 below). No DB or Backend code is imported.

---

## 5. Modules (level 2 of 3)

### 5.1 `server/mobo` (transport)
- **Responsibility:** typed, per-endpoint HTTP calls to the three MOBO PTA routes, returning `APIResult<DTO>`.
- **Files:** `admin-frontend/server/mobo/index.ts` (new), `admin-frontend/server/endpoints.ts` (edit — `MOBO` block).
- **Public surface:** `getPostTradeAllocation(date?)`, `getPostTradeAllocationRuns()`, `runPostTradeAllocation()`.
- **Owns features:** FE-1.

### 5.2 `app/(roles)/mobo/post-trade-allocation` actions (server-action boundary)
- **Responsibility:** thin `"use server"` re-export boundary between client hooks and `server/mobo`.
- **Files:** `admin-frontend/app/(roles)/mobo/post-trade-allocation/actions.ts` (new).
- **Public surface:** `getView(date?)`, `getRuns()`, `runSync()`.
- **Owns features:** FE-2.

### 5.3 `hooks/api/usePostTradeAllocation` (client cache + fetch)
- **Responsibility:** `"use client"` hook owning `{data, loading, error, refetch, sync}` for the PTA view, with a module-scoped cache keyed by date and a `sync()` action that triggers the manual run and invalidates the cache.
- **Files:** `admin-frontend/hooks/api/usePostTradeAllocation.ts` (new).
- **Public surface:** `usePostTradeAllocation(date?)`, `usePostTradeAllocationRuns()` (small sibling hook for the `DateControl` dropdown data).
- **Owns features:** FE-3.

### 5.4 `lib/mobo` seam (mapper + types)
- **Responsibility:** pure DTO→view mapping (no math) and the frozen view types the components render.
- **Files:** `admin-frontend/lib/mobo/allocation.ts` (edit), `admin-frontend/lib/mobo/types.ts` (edit).
- **Public surface:** `mapDtoToPostTradeAllocation(dto)`, `mapDtoToRuns(dto)`, `ptaMoney(v)`.
- **Owns features:** FE-4.

### 5.5 Screen wiring
- **Responsibility:** compose the hook + mapper + existing components into the page; fix the two `.delegated` read sites; delete the mock.
- **Files:** `admin-frontend/app/(roles)/mobo/post-trade-allocation/page.tsx` (edit), `admin-frontend/components/mobo/allocation/Panels.tsx` (edit), `admin-frontend/components/mobo/allocation/StackedBarChart.tsx` (edit), `admin-frontend/lib/mock/mobo-data.ts` (edit — delete block).
- **Owns features:** FE-5, FE-6.

---

## 6. Features (level 3 of 3 — the work units)

### FE-1 — `server/mobo/index.ts` + `MOBO` endpoints block (Yes)

- **Proposal ref:** §Layer 3-A-3
- **Module:** 5.1
- **Files:** `create: admin-frontend/server/mobo/index.ts`, `modify: admin-frontend/server/endpoints.ts`
- **Dependencies:** none — parallel-safe with FE-4/FE-6 (the mapper and type rename touch different files).

**Contract (required code):**

```ts
// admin-frontend/server/endpoints.ts — add alongside PC/RM
const MOBO = "/api/mobo";

export const ENDPOINTS = {
  // ...existing PC, RM...
  MOBO: {
    PTA:      `${MOBO}/post-trade-allocation`,
    PTA_RUNS: `${MOBO}/post-trade-allocation/runs`,
    PTA_RUN:  `${MOBO}/post-trade-allocation/run`,
  },
} as const;
```

```ts
// admin-frontend/server/mobo/index.ts
"use server";

import { apiClient, type APIResult } from "@/server/api-client";
import { ENDPOINTS } from "@/server/endpoints";
import type { PtaViewDTO, PtaRunsDTO, PtaRunResultDTO } from "@/lib/mobo/types";

/** GET the view for a trade date; omitted date = most recent run (§4.1). */
export async function getPostTradeAllocation(date?: string): Promise<APIResult<PtaViewDTO>> {
  const path = date ? `${ENDPOINTS.MOBO.PTA}?date=${encodeURIComponent(date)}` : ENDPOINTS.MOBO.PTA;
  return apiClient<PtaViewDTO>(path);
}

/** GET the run list feeding the DateControl dropdown. */
export async function getPostTradeAllocationRuns(): Promise<APIResult<PtaRunsDTO>> {
  return apiClient<PtaRunsDTO>(ENDPOINTS.MOBO.PTA_RUNS);
}

/** POST the manual "Sync" trigger — always 200, real or empty run (D-10). */
export async function runPostTradeAllocation(): Promise<APIResult<PtaRunResultDTO>> {
  return apiClient<PtaRunResultDTO>(ENDPOINTS.MOBO.PTA_RUN, { method: "POST", body: JSON.stringify({}) });
}
```

**Behavior / invariants:** reuses `apiClient` as-is (cookie→Bearer, `cache: "no-store"`, `APIResult<T>` envelope) — no new HTTP plumbing. `runPostTradeAllocation` always POSTs an empty JSON body per §4.1 ("no date"). None of these three functions catch or reshape errors beyond what `apiClient` already does.

**Done when:** all three functions compile against the DTO types below (FE-4) and return `APIResult<T>`; a unit test with a mocked `fetch` confirms each hits the exact path/method from §4.1.

---

### FE-2 — Server-action wrappers (`app/(roles)/mobo/post-trade-allocation/actions.ts`) (Yes)

- **Proposal ref:** §Layer 3-A-2
- **Module:** 5.2
- **Files:** `create: admin-frontend/app/(roles)/mobo/post-trade-allocation/actions.ts`
- **Dependencies:** FE-1 (imports `server/mobo`).

**Contract (required code):**

```ts
// admin-frontend/app/(roles)/mobo/post-trade-allocation/actions.ts
"use server";

import {
  getPostTradeAllocation,
  getPostTradeAllocationRuns,
  runPostTradeAllocation,
} from "@/server/mobo";
import type { APIResult } from "@/server/api-client";
import type { PtaViewDTO, PtaRunsDTO, PtaRunResultDTO } from "@/lib/mobo/types";

export async function getView(date?: string): Promise<APIResult<PtaViewDTO>> {
  return getPostTradeAllocation(date);
}

export async function getRuns(): Promise<APIResult<PtaRunsDTO>> {
  return getPostTradeAllocationRuns();
}

export async function runSync(): Promise<APIResult<PtaRunResultDTO>> {
  return runPostTradeAllocation();
}
```

**Behavior / invariants:** pure re-export boundary, no logic — matches the `FE-3` precedent in the 006 frontend doc (thin `"use server"` wrappers, one `actions.ts` per screen folder).

**Done when:** the three actions are callable from a client component (`usePostTradeAllocation`) and re-export `server/mobo` 1:1.

---

### FE-3 — `hooks/api/usePostTradeAllocation.ts` (Yes — user req.)

- **Proposal ref:** §Layer 3-A-2
- **Module:** 5.3
- **Files:** `create: admin-frontend/hooks/api/usePostTradeAllocation.ts`
- **Dependencies:** FE-2 (calls the actions), FE-4 (calls the mapper).

**Contract (required code):**

```ts
// admin-frontend/hooks/api/usePostTradeAllocation.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getView, getRuns, runSync } from "@/app/(roles)/mobo/post-trade-allocation/actions";
import { mapDtoToPostTradeAllocation, mapDtoToRuns } from "@/lib/mobo/allocation";
import type { PostTradeAllocationView, PtaRun } from "@/lib/mobo/types";

export interface UsePostTradeAllocationResult {
  data: PostTradeAllocationView | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  /** Manual "Sync" trigger — always safe to re-click (§4.1 idempotent no-op). */
  sync: () => Promise<{ empty: boolean; checkedAt?: string; error?: string }>;
}

// Module-scoped cache shared across hook instances, keyed by trade date
// ("__latest__" for the no-date default) — mirrors useAllocation's period cache.
const cache = new Map<string, PostTradeAllocationView>();
const cacheKey = (date: string | undefined) => date ?? "__latest__";

export function usePostTradeAllocation(date?: string): UsePostTradeAllocationResult {
  const [data, setData] = useState<PostTradeAllocationView | null>(
    () => cache.get(cacheKey(date)) ?? null,
  );
  const [loading, setLoading] = useState(!cache.has(cacheKey(date)));
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const dateRef = useRef(date);

  const doFetch = useCallback(async (d: string | undefined) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await getView(d);
      if (result.success) {
        const view = mapDtoToPostTradeAllocation(result.data);
        cache.set(cacheKey(d), view);
        setData(view);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load allocation");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    dateRef.current = date;
    doFetch(date);
  }, [date, doFetch]);

  // Refetch on window refocus — new orders / a scheduled run may have landed.
  useEffect(() => {
    const onFocus = () => { if (!document.hidden) doFetch(dateRef.current); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [doFetch]);

  const doSync = useCallback(async () => {
    const result = await runSync();
    if (!result.success) return { empty: false, error: result.error };
    cache.delete(cacheKey(dateRef.current));
    await doFetch(dateRef.current);
    const empty = result.data.latest.models.length === 0;
    return { empty, checkedAt: result.data.checkedAt };
  }, [doFetch]);

  return { data, loading, error, refetch: () => doFetch(date), sync: doSync };
}

/** Sibling hook for the DateControl dropdown — feeds it from /runs instead of PTA_DISCRETE_DATES. */
export function usePostTradeAllocationRuns(): { runs: PtaRun[]; loading: boolean } {
  const [runs, setRuns] = useState<PtaRun[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getRuns().then((result) => {
      if (result.success) setRuns(mapDtoToRuns(result.data));
      setLoading(false);
    });
  }, []);
  return { runs, loading };
}
```

**Behavior / invariants:** `sync()` always resolves (never throws to the caller) since the backend contract guarantees a 200 with either a real or an empty run (§4.1, D-10); the caller (page) turns `{empty:true}` into the "No new trades — checked at HH:MM ET" toast. `sync()` invalidates only the currently-viewed date's cache entry, then refetches it — a re-click when nothing new arrived is cheap and idempotent (mirrors the backend's own idempotency, D-9). No ETag/conditional-fetch plumbing here (unlike `useAllocation`) — the PTA payload is small and the proposal's §4.1 contract carries no `ETag`/304 semantics for this route, unlike the PC allocation matrix.

**Done when:** mount/date-change/refocus each trigger exactly one in-flight fetch (guarded by `inFlight`); `sync()` clears the cache entry for the current date and re-populates it from the fresh response; a component using the hook against a mocked `actions` module renders `data`/`loading`/`error` correctly (§8).

---

### FE-4 — `lib/mobo/allocation.ts` → DTO→view mapper; `lib/mobo/types.ts` rename (Yes — user req.)

- **Proposal ref:** §Layer 3-A-1, D-4, D-7
- **Module:** 5.4
- **Files:** `modify: admin-frontend/lib/mobo/allocation.ts`, `modify: admin-frontend/lib/mobo/types.ts`
- **Dependencies:** none — parallel-safe; FE-3/FE-5/FE-6 depend on this landing first.

**Contract (required code):**

```ts
// admin-frontend/lib/mobo/types.ts — DTO types (new) + the renamed view field

/** Wire shape of GET /api/mobo/post-trade-allocation (proposal §4.1). */
export interface PtaClientShareDTO {
  clientId: string;
  name: string;
  units: number;
  allocated: number;
  pct: number;
}
export interface PtaModelDTO {
  id: string;
  name: string;
  acct: string;
  traded: number;
  unitsTotal: number;
  clientShares: PtaClientShareDTO[];
}
export interface PtaViewDTO {
  tradeDate: string;
  settleDay: string;
  grandTotal: number;
  models: PtaModelDTO[];
}
export interface PtaRunDTO { date: string; label: string; grandTotal: number }
export interface PtaRunsDTO { runs: PtaRunDTO[] }
export interface PtaRunResultDTO { newRuns: PtaRunDTO[]; latest: PtaViewDTO; checkedAt: string }

/** One client's pro-rata slice of a model's traded amount.
 *    units     — subscribed units backing the allocation
 *    allocated — raw allocated amount (was `delegated`; renamed D-7 to match
 *                page semantics — "post-trade allocation")
 *    pct       — rounded 0-100 share of the model's units
 */
export interface PtaClientShare {
  clientId: string;
  name: string;
  units: number;
  allocated: number;   // was: delegated
  pct: number;
}

export interface PtaRun { date: string; label: string; grandTotal: number }

// PtaModel, PtaModelAllocation, PostTradeAllocationView are UNCHANGED —
// already shaped exactly as the DTO (view type = DTO type, no divergence).
```

```ts
// admin-frontend/lib/mobo/allocation.ts — pure DTO→view mapper, no PTA_* mock import
import type {
  PostTradeAllocationView,
  PtaModelAllocation,
  PtaRun,
  PtaRunsDTO,
  PtaViewDTO,
} from "./types";

/** Format money the way the design prototype does: $X.XXM above 1e6, else $Xk rounded. */
export function ptaMoney(v: number): string {
  return v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1e3)}k`;
}

/**
 * THE SINGLE DATA MAPPER for Post-Trade Allocation. Structural pass-through
 * only — traded/unitsTotal/allocated/pct/grandTotal all arrive precomputed
 * from the backend (proposal §4.1); this function does NO pro-rata math.
 */
export function mapDtoToPostTradeAllocation(dto: PtaViewDTO): PostTradeAllocationView {
  const models: PtaModelAllocation[] = dto.models.map((m) => ({
    id: m.id,
    name: m.name,
    acct: m.acct,
    traded: m.traded,
    unitsTotal: m.unitsTotal,
    clientShares: m.clientShares,
  }));
  return { settleDay: dto.settleDay, models, grandTotal: dto.grandTotal };
}

/** Maps the /runs DTO to the DateControl's dropdown shape. */
export function mapDtoToRuns(dto: PtaRunsDTO): PtaRun[] {
  return dto.runs.map((r) => ({ date: r.date, label: r.label, grandTotal: r.grandTotal }));
}
```

**Behavior / invariants:** the mapper never sums, divides, or rounds anything — every numeric field is copied verbatim from the DTO. Deleting `lib/mock/mobo-data.ts`'s `PTA_*` block and its import from this file requires **zero** further edits to this file beyond what's shown here (the purge test the file's original header comment promised). `acct` passes through unchanged (per §Layer-3-C: filled by the backend from `orders.accountId`, or `"—"` — this layer does no special-casing).

**Done when:** `mapDtoToPostTradeAllocation` compiles against a hand-built `PtaViewDTO` fixture and produces a `PostTradeAllocationView` with identical numeric values (no derived recomputation); `lib/mock/mobo-data.ts` no longer exports `PTA_MODELS`/`PTA_CLIENTS`/`PTA_UNITS` and nothing imports them; `PtaClientShare.delegated` no longer exists anywhere in `lib/mobo/types.ts`.

---

### FE-5 — Fix the two `.delegated` component read sites (Yes — user req.)

- **Proposal ref:** §Layer 3-A-1, D-7
- **Module:** 5.5
- **Files:** `modify: admin-frontend/components/mobo/allocation/Panels.tsx`, `modify: admin-frontend/components/mobo/allocation/StackedBarChart.tsx`
- **Dependencies:** FE-4 (the type must already be renamed before these compile).

**Contract (required code):**

```ts
// Panels.tsx — Donut(): total/arc-fraction/tooltip amount
const total = shares.reduce((sum, s) => sum + s.allocated, 0) || 1;   // was s.delegated
...
const frac = s.allocated / total;                                     // was s.delegated
...
amt: ptaMoney(s.allocated),                                            // was s.delegated
```

```ts
// StackedBarChart.tsx — buildChartData() / ChartTooltip()
row[cs.clientId] = cs.allocated;              // was cs.delegated   (buildChartData)
<span>{ptaMoney(share.allocated)}</span>       // was share.delegated (ChartTooltip)
```

**Behavior / invariants:** display copy ("Delegated" label text in the tooltip/donut) is **unchanged** — only the property read changes, per the proposal's explicit scoping ("a handful of lines, no visual change"). No prop signatures change; `PtaClientShare` is still the type these components import from `lib/mobo/types.ts`.

**Done when:** `grep -rn "\.delegated\b" admin-frontend/components admin-frontend/lib/mobo` returns nothing; the donut and stacked-bar tooltip render the identical numbers/pixels they did before the rename (verified against a fixed fixture in §8, since layout must not change).

---

### FE-6 — Page wiring: hook, Sync button, DateControl from `/runs`, delete mock (Yes — user req.)

- **Proposal ref:** §Layer 3-A-2, D-10
- **Module:** 5.5
- **Files:** `modify: admin-frontend/app/(roles)/mobo/post-trade-allocation/page.tsx`, `modify: admin-frontend/components/mobo/allocation/Panels.tsx` (DateControl props), `delete (block only): admin-frontend/lib/mock/mobo-data.ts` (`PTA_MODELS`/`PTA_CLIENTS`/`PTA_UNITS` + their type import)
- **Dependencies:** FE-3 (hook), FE-4 (mapper), FE-5 (renamed field must already compile in the components this page renders).

**Contract (required code):**

```tsx
// page.tsx — swap the synchronous mock load for the hook + add Sync
import { usePostTradeAllocation, usePostTradeAllocationRuns } from "@/hooks/api/usePostTradeAllocation";
import { toast } from "sonner";
import { RefreshCw } from "@/lib/icons";

export default function PostTradeAllocationPage() {
  const [pickedDate, setPickedDate] = useState<string | undefined>(undefined); // undefined = latest
  const { data, loading, sync } = usePostTradeAllocation(pickedDate);
  const { runs } = usePostTradeAllocationRuns();
  const { settleDay, models, grandTotal } = data ?? { settleDay: "", models: [], grandTotal: 0 };

  const handleSync = async () => {
    const result = await sync();
    if (result.error) { toast.error(result.error); return; }
    if (result.empty) {
      toast(`No new trades — checked at ${result.checkedAt ?? "—"} ET`);
    }
  };

  // ...existing view/scope/orientation state unchanged...

  return (
    // ...
    <PageHeader
      title="Post-Trade Allocation"
      subtitle={subtitle}
      actions={
        <>
          <DateControl dateLabel={pickedDate ?? "Latest"} runs={runs} onPickDate={setPickedDate} />
          <Button icon={RefreshCw} onClick={handleSync} disabled={loading}>
            Sync
          </Button>
          <Button icon={Download} onClick={() => {}}>Export</Button>
        </>
      }
    />
    // ...
  );
}
```

```ts
// lib/mock/mobo-data.ts — delete this block (and the PtaClient/PtaModel type import
// it needed), leaving SETTLE_DAY / STORED_TRADES / EXCEPTIONS / FEEDS / EOD (reconciliation
// mock, out of scope for this proposal) untouched:
//
//   export const PTA_MODELS: PtaModel[] = [...]
//   export const PTA_CLIENTS: PtaClient[] = [...]
//   export const PTA_UNITS: Record<string, Record<string, number>> = {...}
```

**Behavior / invariants:** the **Sync** button is always enabled (`disabled={loading}` only guards against overlapping clicks, not a permanent disabled state — matches the backend contract's "always available", D-8/D-10). An empty-run response never throws or blocks the UI — it's a `sonner` toast, nothing else changes on screen. `EmptyCard`/`view === "empty"` stays wired but unreached (unchanged from today — no new trigger is added for it; that remains a future signal per the page's existing comment).

**Done when:** the page compiles with no import of `lib/mock/mobo-data`'s `PTA_*` exports; clicking Sync while `loading` is a no-op (button disabled); a successful sync with new data re-renders the chart with the fresh numbers; an empty-run sync shows exactly one toast and leaves the chart as-is; `next build` passes.

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal §4.1)

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

### 7.2 How this layer honours the seam
- **What this layer contributes to the seam:** consumes `PostTradeAllocationView`-shaped DTOs at the three routes exactly as above; `lib/mobo/allocation.ts` maps them into the (already-matching) view types with zero derivation; the page surfaces the POST route's `newRuns`/`latest`/empty-run outcome as a Sync button + toast.
- **What this layer assumes from the other side:** the backend returns money as JSON numbers in major units (not `DecimalString`), `units` already remapped from `multiplier`, `allocated` (not `delegated`) as the field name, and the POST route **always** resolving 200 (real or empty run) — never a distinct "no trades" error code. This layer's own tests (§8) fake exactly this shape; they do not call a live backend.
- **Change protocol:** any edit to §7 requires editing the proposal first; this section is then re-copied. Never edit §7 in isolation.

---

## 8. Internal unit testing (req 5)

### 8.1 Test setup
- **Framework / runner:** Vitest (already configured in `admin-frontend`, per repo memory `docgen_toolchain_setup`) — command: `npx vitest run`.
- **Fixtures / seed:** a hand-built `PtaViewDTO` / `PtaRunsDTO` / `PtaRunResultDTO` fixture module (2–3 models, one with an empty `clientShares`, one negative `traded` to exercise the signed-money path end-to-end at the presentation layer) placed alongside the tests.
- **Isolation:** hermetic — no network, no real backend; `vi.mock` replaces `@/app/(roles)/mobo/post-trade-allocation/actions` and `@/server/mobo` at the module boundary the hook/transport unit under test sits above.
- **Layer isolation (critical):** tests import only this layer's own code, the fixture DTOs (shaped per §7.1), and `vi.mock`/`vi.fn`. No test imports backend or DB code, spins up the FastAPI app, or hits a real `/api/mobo/*` URL.
- **Code generation:** concrete test files are written by the `test-gen` skill from §8.2/§8.3 below, into `admin-frontend/**/*.test.ts(x)` colocated with the unit under test (matching the existing Vitest convention).

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| FE-1 | each `server/mobo` fn calls the correct path/method and returns `APIResult<T>` | mocked `fetch` returning a §7.1-shaped body |
| FE-2 | actions re-export `server/mobo` 1:1, callable as `"use server"` | mocked `server/mobo` module |
| FE-3 | hook fetch/cache/refocus/sync lifecycle; empty-run vs real-run sync outcomes | mocked `actions.ts` (`getView`/`getRuns`/`runSync`) returning §7.1-shaped DTOs, incl. an empty-run `PtaRunResultDTO` |
| FE-4 | mapper does zero derivation; DTO fields pass through unchanged, incl. a negative `traded`/`allocated` fixture | none — pure function, fixture DTO only |
| FE-5 | Donut/StackedBarChart render identical pixels/numbers after the `.allocated` rename | none — pure component test against a fixed `PtaModelAllocation[]` fixture |
| FE-6 | page renders hook data; Sync button always enabled outside `loading`; empty-run triggers exactly one toast; no `PTA_*` mock import remains | mocked `usePostTradeAllocation`/`usePostTradeAllocationRuns` |

### 8.3 Test goals (per unit)

#### FE-1
- **Positive:** `getPostTradeAllocation()` (no date) hits `GET /api/mobo/post-trade-allocation` with no query string; `getPostTradeAllocation("2026-06-03")` appends `?date=2026-06-03`; `getPostTradeAllocationRuns()` hits the `/runs` path; `runPostTradeAllocation()` POSTs `{}` to `/run`.
- **Negative:** a mocked 401/403/404 response surfaces as `{success:false, code:...}` (delegates to `apiClient`'s existing envelope — no unit-specific error handling to break).
- **Invariants:** every call passes through `apiClient` unchanged (no header/body mutation beyond the JSON body for POST).
- **Seam mocks:** `fetch` returning the exact JSON shapes from §7.1.

#### FE-2
- **Positive:** each action calls its `server/mobo` counterpart and returns its result verbatim.
- **Negative:** n/a (no branching logic to fail).
- **Invariants:** no transformation of the result between `server/mobo` and the action's return value.
- **Seam mocks:** `vi.mock("@/server/mobo")`.

#### FE-3
- **Positive:** first mount fetches and populates `data`; a second hook instance for the same date reads from cache without a duplicate fetch mid-flight; window refocus triggers a re-fetch; `sync()` on a real-run response clears the cache and re-populates with the new view; `sync()` on an empty-run response (`latest.models === []`) resolves `{empty:true, checkedAt}` without touching unrelated cache entries.
- **Negative:** a failed `getView` sets `error` and leaves `data` as the previous cached value (not nulled); a failed `sync()` (network/HTTP error) resolves `{empty:false, error}` without invalidating the cache.
- **Invariants:** `inFlight` guard prevents two concurrent fetches for the same hook instance; re-clicking `sync()` repeatedly never throws and never double-invalidates in a way that loses the last good `data`.
- **Seam mocks:** `getView`/`getRuns`/`runSync` from the actions module, each mockable to return success/empty/error per test case.

#### FE-4
- **Positive:** `mapDtoToPostTradeAllocation` on a 2-model fixture (one with a negative `traded`/`allocated` pair) returns a `PostTradeAllocationView` whose every numeric field equals the DTO's input value exactly (no rounding, no re-summation); `mapDtoToRuns` maps `runs[]` 1:1.
- **Negative:** a model with `clientShares: []` maps to an empty array, not an error.
- **Invariants:** calling the mapper twice on the same DTO is deterministic (pure function, no hidden state); grand total returned equals `dto.grandTotal` verbatim, never a re-derived sum of `model.traded`.
- **Seam mocks:** none (pure function over a fixture).

#### FE-5
- **Positive:** given a fixed `PtaModelAllocation[]` fixture, `Donut`'s rendered arc fractions and tooltip amount match `share.allocated / total` and `ptaMoney(share.allocated)`; `StackedBarChart`'s tooltip renders `ptaMoney(share.allocated)`.
- **Negative:** a model with all-zero `allocated` values doesn't divide by zero (existing `|| 1` fallback in `Donut`'s `total` calc must still guard this after the rename).
- **Invariants:** pixel/geometry output is identical before/after the rename for the same input values (confirms the rename didn't change any visual behavior) — compare against a snapshot fixture using the old `delegated` field name relabeled to `allocated`.
- **Seam mocks:** none — component-level test against a hand-built `PtaModelAllocation[]`.

#### FE-6
- **Positive:** page renders `models`/`grandTotal` from `usePostTradeAllocation`'s `data`; clicking Sync while not loading calls `sync()` and shows a toast only on the empty-run branch; DateControl options come from `usePostTradeAllocationRuns`'s `runs`, not a hardcoded const.
- **Negative:** while `loading === true`, the Sync button is disabled and a click is a no-op; a `sync()` error surfaces as an error toast, not a thrown exception.
- **Invariants:** no import anywhere in the page/component tree resolves to `lib/mock/mobo-data`'s `PTA_MODELS`/`PTA_CLIENTS`/`PTA_UNITS`.
- **Seam mocks:** `vi.mock("@/hooks/api/usePostTradeAllocation")` returning canned `{data, loading, error, sync}` per scenario.

### 8.4 Aggregate gate
- All unit tests green is a merge gate (§3.2). A red test blocks the branch.
- Target coverage for changed lines: ≥ 90% of new/changed statements in `server/mobo`, `hooks/api/usePostTradeAllocation.ts`, `lib/mobo/allocation.ts`, and the two `.delegated`→`.allocated` diff hunks.
- Chosen `test-gen` level for this layer: **standard** (happy path + main negative + role/permission-equivalent case per unit) — this is a low-risk, presentation-only layer with no auth/permission logic of its own (auth is enforced server-side); `thorough` is not warranted.

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] FE-1 through FE-6 committed on `post-trade-allocation-integration-fe`; each commit left the branch green.
- [ ] §8 unit tests all pass; `npm run lint && npx tsc --noEmit && npx vitest run && npm run build` green.
- [ ] §7 matches the proposal's frozen §4.1 seam verbatim. Checked against the proposal on the parent branch, not against the Backend layer's branch (not visible here).
- [ ] `grep -rn "\.delegated\b" admin-frontend` and `grep -rn "PTA_MODELS\|PTA_CLIENTS\|PTA_UNITS" admin-frontend` both return nothing.
- [ ] PR opened; human owns the merge to `post-trade-allocation-integration`.

**Rollback:** every change in this layer is code-only — no migration, no persisted state. Reverting the branch (or any single `FE-*` commit, since each is independently revertible per §3.2) fully restores the prior mock-bound behavior with no data loss. The one commit worth calling out explicitly is FE-4 (the `delegated → allocated` rename): reverting it alone requires FE-5's commit to revert in the same step (they touch the same field), which is why FE-5 is scoped as "Dependencies: FE-4" rather than parallel-safe.
