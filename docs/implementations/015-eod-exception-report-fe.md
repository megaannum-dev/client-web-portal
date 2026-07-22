# 015 — End-of-Day Exception Report · Implementation Details — Frontend

> Status: **DRAFT — pending implementation.**
> Implements: `docs/proposals/015-2026-07-21-eod-exception-report.md` § Layer 3 — Frontend
> Layer: Frontend — **one layer per file.**
> Sibling layer docs: [`015-eod-exception-report-db.md`](015-eod-exception-report-db.md), [`015-eod-exception-report-be.md`](015-eod-exception-report-be.md)
> Execution schedule: `docs/execution-schedules/015-eod-exception-report-fe.md`
> Branch: `<TODO: parent-branch>-fe` — cut from the parent branch.
> Builds on / prerequisites: `GET /api/mobo/eod`, `POST /api/mobo/eod/sign-off`, `GET /api/mobo/eod/export` (see `015-eod-exception-report-be.md`) reachable on the target API base URL; the current mock-backed page at `admin-frontend/app/(roles)/mobo/daily-exception-report/page.tsx` (already ported to the 3-leg design, pre-existing on this repo) is the starting point this layer cuts over.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/015-2026-07-21-eod-exception-report.md` § Layer 3 — Frontend, § 4 (Cross-layer seam) |
| Execution schedule | `docs/execution-schedules/015-eod-exception-report-fe.md` |
| Sibling layer impl docs | `docs/implementations/015-eod-exception-report-db.md`, `docs/implementations/015-eod-exception-report-be.md` |
| Builds on | Backend layer's three `/api/mobo/eod*` routes (contract only — not the sibling branch itself) |

**Starting point.** `admin-frontend/app/(roles)/mobo/daily-exception-report/page.tsx` already exists, already renders the 3-leg design (`buildL1`/`buildL2`/`buildL3`, `VolumeTile`, `LegBlock`, `AllClear`, sign-off/export footer) — it was ported from `mobo/mobo-app/MoboExceptions.jsx` in a prior UI-only pass, reading `loadReconciliationFlow("breaks")` (mock, `lib/mobo/reconciliation-flow.ts`) and `loadReconciliation()` (mock, `lib/mobo/reconciliation.ts`, for `eod.generated`/`eod.dayOf`/`eod.daysInMonth` only). This layer's job is **narrower** than a full rewrite: swap the two mock calls for one real `useEodReport` hook, wire the two buttons, and add the print route. The JSX/Tailwind layout itself (tiles, leg tables, `AllClear`, footer) is **unchanged** — this proposal's Constraint is business logic/persistence, not a design change.

---

## 2. Branch & session contract

- **Branch:** `<TODO: parent-branch>-fe`, cut from the parent.
- **Isolation:** fully independent of the DB/BE layer branches; this layer builds against the wire contract (§ 7) and can be developed against a mocked `apiClient` response before the Backend branch merges.
- **Preconditions:**
  - [ ] The frozen seam (§ 7) is agreed and matches the proposal § 4 verbatim.
  - [ ] `NEXT_PUBLIC_API_BASE_URL` / `id_token` cookie flow already works for other MOBO screens (confirmed via the working Trade Reconciliation page) — no new auth plumbing needed for `GET`/`POST` calls; the export download reuses the existing base64-proxy pattern (see FE-4) rather than inventing new auth.
- **Read-first inventory:**
  - `admin-frontend/app/(roles)/mobo/daily-exception-report/page.tsx` — the current mock-backed page this layer cuts over; every helper component (`VolumeTile`, `MonthProgress`, `Ref`, `Mismatch`, `LEG_META`, `LegBlock`, `LegRowView`, `AllClear`, `SignLine`, `buildL1`/`buildL2`/`buildL3`) stays as-is — only the two data-sourcing lines and the two button handlers change.
  - `admin-frontend/lib/mobo/flow-types.ts` — `RcOrder`, `RcAlloc`, `RcPort`, `fmtUsd` (unchanged types this layer's new `EodReportView` type embeds).
  - `admin-frontend/lib/mobo/reconciliation-flow.ts`, `admin-frontend/lib/mobo/reconciliation.ts` — the two mock-backed calls being replaced; **not deleted** (proposal Non-Goals: `recon-overview` still depends on `reconciliation.ts`, and `trade-reconciliation` still depends on `reconciliation-flow.ts` — this layer only stops the Daily Exception Report page from calling them).
  - `admin-frontend/hooks/api/useReconciliationFlow.ts` — the client-hook shape (cache, loading, error, in-flight guard, refetch) this layer's `useEodReport` mirrors.
  - `admin-frontend/app/(roles)/mobo/trade-reconciliation/actions.ts`, `admin-frontend/server/mobo/index.ts`, `admin-frontend/server/endpoints.ts` — the server-action/server-fetch/endpoint layering convention this layer extends with three new `EOD` entries, in the same files.
  - `admin-frontend/app/(roles)/compliance/review/actions.ts` (`downloadDocument`), `admin-frontend/app/(roles)/compliance/review/page.tsx` (`saveBase64File`, lines ~26-30) — the established base64-proxy download pattern ("cookie token can't ride a plain `<a href>`") this layer's Export button reuses verbatim, in preference to `lib/downloadFile.ts`'s plain-URL `downloadAs` (which only works for public static assets, e.g. the Monthly Reports page's dummy PDF — not for an authenticated backend stream).
  - `admin-frontend/components/ui/PageHeader.tsx`, `Button.tsx`, `Chip.tsx` — unchanged UI primitives, already imported by the current page.
- **Hand-off / exit signal:** all FE-* units committed, `npx next build` passes, page renders against a live seeded Backend endpoint (sign-off + export round-trip verified), print route renders headlessly, PR opened.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- **Data-access layering** (matches `useReconciliationFlow`'s stack exactly):
  ```
  page.tsx (client)
    → hooks/api/useEodReport.ts (client hook: cache, loading, error, refetch)
      → app/(roles)/mobo/daily-exception-report/actions.ts ("use server" wrapper: try/catch, logging)
        → server/mobo/index.ts (server-only: apiClient<T> + ENDPOINTS)
          → server/api-client.ts (apiClient<T>: cookie-based Bearer token, no-store fetch, APIResult<T> envelope)
  ```
- **Server-only fetch functions** live in `admin-frontend/server/mobo/index.ts`, marked `"use server"` file-level (existing convention), importing `apiClient`/`ENDPOINTS` only.
- **Actions** (`app/(roles)/mobo/daily-exception-report/actions.ts`) wrap the server function in try/catch + `logger.log`/`logger.json`, converting thrown errors to the `APIResult` failure shape — identical shape to `trade-reconciliation/actions.ts`'s `getFlow`.
- **Hooks** (`hooks/api/useEodReport.ts`) own `data`/`loading`/`error`/`refetch` state, a module-scoped cache keyed by the resolved `tradeDate` (or `"__default__"` when omitted), and an in-flight guard — mirrors `useReconciliationFlow` exactly.
- **Binary downloads** go through the base64-proxy pattern (`downloadDocument`-style server action → `saveBase64File`-style client helper) — never a plain `<a href>` or `lib/downloadFile.ts`'s `downloadAs` against an authenticated backend route.
- **No design/layout changes** — every existing component in `page.tsx` (`VolumeTile`, `LegBlock`, `AllClear`, etc.) is reused verbatim; only the data-sourcing lines and button `onClick`s change.

### 3.2 CI/CD & engineering discipline
- **Trunk-friendly, small units.** Each FE-* unit is a self-contained, revertible commit.
- **Every unit is independently revertible**, except FE-5 (`page.tsx` cutover) which depends on FE-1 through FE-4 being present to import.
- **Additive & backward-compatible first.** FE-1/FE-2/FE-3/FE-4 land as new files/functions alongside the still-working mock-backed page; FE-5 (the actual cutover) lands last, so the branch stays deployable at every commit.
- **Gates before merge:**
  ```bash
  cd admin-frontend
  npx vitest run && npx tsc --noEmit && npx next lint
  ```
- **No secrets, no manual steps in the merge path.** `PDF_RENDER_TOKEN` validation in the print route (FE-6) reads from a server-only env var, never exposed to the client bundle. Confirming the page round-trips against a live seeded Backend is a human gate (proposal's Execution & verification), not baked into a commit.
- **Reversibility documented:** see § 9.

---

## 4. Architecture

**Target layout:**
```
admin-frontend/server/endpoints.ts                          # FE-1 — + ENDPOINTS.MOBO.EOD/EOD_SIGNOFF/EOD_EXPORT (modified)
admin-frontend/server/mobo/index.ts                          # FE-1 — + getEod()/signOffEod()/downloadEod() (modified)
admin-frontend/app/(roles)/mobo/daily-exception-report/
├── actions.ts                                                # FE-2 — NEW, "use server" boundary
├── page.tsx                                                  # FE-5 — cut over (data-sourcing + buttons only)
└── print/
    └── page.tsx                                              # FE-6 — NEW, chrome-stripped render target for ChromiumRenderer
admin-frontend/hooks/api/useEodReport.ts                     # FE-3 — NEW, client hook
admin-frontend/lib/mobo/
├── eod-types.ts                                              # FE-4 — NEW, EodReportView/EodStatus/EodOutcome types (wire DTO alias)
├── flow-types.ts                                              # unchanged
├── reconciliation-flow.ts                                     # unchanged (still used by trade-reconciliation)
└── reconciliation.ts                                          # unchanged (still used by recon-overview)
```

**Dependency direction:** `page.tsx → useEodReport (hook) → actions.ts (server action) → server/mobo (server fetch) → server/api-client (HTTP)`. `print/page.tsx` is a sibling route that also calls `useEodReport`'s underlying server action directly (server-side, no client hook needed there — see FE-6) rather than duplicating fetch logic.

**External seams:** consumes `GET /api/mobo/eod?trade_date=`, `POST /api/mobo/eod/sign-off`, `GET /api/mobo/eod/export?trade_date=` per § 7. No new component props cross into the existing `LegBlock`/`AllClear`/`VolumeTile` — they already consume plain values (`orders`, `allocs`, `ports`, counts, strings) unchanged.

---

## 5. Modules

### 5.1 `server/mobo` (extended) + `server/endpoints.ts` (extended)
- **Responsibility:** the one place a Next.js server context reaches the three EoD endpoints.
- **Files:** `admin-frontend/server/endpoints.ts`, `admin-frontend/server/mobo/index.ts`.
- **Public surface:** `ENDPOINTS.MOBO.EOD`/`EOD_SIGNOFF`/`EOD_EXPORT`; `getEod(tradeDate?)`, `signOffEod(tradeDate)`, `downloadEod(tradeDate?)`.
- **Owns features:** FE-1.

### 5.2 `app/(roles)/mobo/daily-exception-report/actions.ts`
- **Responsibility:** `"use server"` boundary the client hook and the Export button call.
- **Files:** `admin-frontend/app/(roles)/mobo/daily-exception-report/actions.ts` (new).
- **Public surface:** `getEodReport(tradeDate?)`, `signOff(tradeDate)`, `downloadEodPdf(tradeDate?)`.
- **Owns features:** FE-2.

### 5.3 `hooks/api/useEodReport.ts`
- **Responsibility:** client-side data/loading/error state + cache + refetch, plus a `signOff()` action that refetches on success.
- **Files:** `admin-frontend/hooks/api/useEodReport.ts` (new).
- **Public surface:** `useEodReport(tradeDate?): { data, loading, error, refetch, signOff, signingOff }`.
- **Owns features:** FE-3.

### 5.4 `lib/mobo/eod-types.ts`
- **Responsibility:** the FE-facing `EodReportView` type (embeds the unchanged `RcOrder`/`RcAlloc`/`RcPort` from `flow-types.ts`) and its wire-DTO alias.
- **Files:** `admin-frontend/lib/mobo/eod-types.ts` (new).
- **Public surface:** `EodReportView`, `EodReportViewDTO`, `EodStatus`, `EodOutcome`.
- **Owns features:** FE-4.

### 5.5 `page.tsx` cutover
- **Responsibility:** replace the two mock calls with `useEodReport`; wire the Sign off/Export buttons; add loading/error branches.
- **Files:** `admin-frontend/app/(roles)/mobo/daily-exception-report/page.tsx` (modified).
- **Owns features:** FE-5.

### 5.6 Print route
- **Responsibility:** chrome-stripped render target for `ChromiumRenderer` (Backend BE-9).
- **Files:** `admin-frontend/app/(roles)/mobo/daily-exception-report/print/page.tsx` (new).
- **Owns features:** FE-6.

---

## 6. Features

### FE-1 — Endpoints + server fetch functions (MANDATORY)

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
    ...
    RECONCILIATION: `${MOBO}/reconciliation`,
    EOD:            `${MOBO}/eod`,
    EOD_SIGNOFF:    `${MOBO}/eod/sign-off`,
    EOD_EXPORT:     `${MOBO}/eod/export`,
  },
} as const;
```
```ts
// server/mobo/index.ts — add alongside the existing reconciliation function
import type { EodReportViewDTO } from "@/lib/mobo/eod-types";
import { cookies } from "next/headers";
import { getApiBase } from "@/lib/auth-api";

/** GET the day-aggregated EoD report; omitted date = latest OPEN, falling back to latest SIGNED (§4.1, Q-3). */
export async function getEod(tradeDate?: string): Promise<APIResult<EodReportViewDTO>> {
  const path = tradeDate ? `${ENDPOINTS.MOBO.EOD}?trade_date=${encodeURIComponent(tradeDate)}` : ENDPOINTS.MOBO.EOD;
  return apiClient<EodReportViewDTO>(path);
}

/** POST sign-off — freezes the day's breaks, generates the PDF, locks it. */
export async function signOffEod(tradeDate: string): Promise<APIResult<EodReportViewDTO>> {
  return apiClient<EodReportViewDTO>(ENDPOINTS.MOBO.EOD_SIGNOFF, {
    method: "POST", body: JSON.stringify({ tradeDate }),
  });
}

/** Base64 proxy — mirrors server/onboarding/index.ts's downloadDocument (cookie token can't ride a plain <a href>). */
export async function downloadEod(
  tradeDate?: string,
): Promise<APIResult<{ filename: string; contentType: string; base64: string }>> {
  const token = (await cookies()).get("id_token")?.value ?? "";
  const path = tradeDate ? `${ENDPOINTS.MOBO.EOD_EXPORT}?trade_date=${encodeURIComponent(tradeDate)}` : ENDPOINTS.MOBO.EOD_EXPORT;
  const url = `${getApiBase()}${path}`;
  try {
    const res = await fetch(url, { cache: "no-store", headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (res.status === 401) return { success: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    if (!res.ok) return { success: false, error: `HTTP ${res.status}`, code: `HTTP_${res.status}` };
    const cd = res.headers.get("Content-Disposition") ?? "";
    const filename = /filename="?([^";]+)"?/i.exec(cd)?.[1] ?? "EoD-report.pdf";
    const contentType = res.headers.get("Content-Type") ?? "application/pdf";
    const buf = Buffer.from(await res.arrayBuffer());
    return { success: true, data: { filename, contentType, base64: buf.toString("base64") } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error", code: "NETWORK_ERROR" };
  }
}
```

**Behavior / invariants:** `getEod`/`signOffEod` follow the plain `apiClient<T>` pattern (JSON in/out); `downloadEod` follows the base64-proxy pattern instead (binary out) — the two are intentionally different shapes, matching how `server/onboarding/index.ts` already has both `approveOnboarding` (plain `apiClient`) and `downloadDocument` (base64 proxy) side by side.

**Done when:** `getEod()`/`signOffEod()`/`downloadEod()` compile against `apiClient`'s/`cookies()`'s real signatures; calling each against a running Backend returns the expected `APIResult` shape for both success and a seeded failure (404/409).

---

### FE-2 — Server action boundary (MANDATORY)

- **Proposal ref:** § Layer 3 A-1
- **Module:** 5.2
- **Files:** `create: admin-frontend/app/(roles)/mobo/daily-exception-report/actions.ts`
- **Dependencies:** FE-1

**Contract:**
```ts
"use server";

import { getEod as _getEod, signOffEod as _signOffEod, downloadEod as _downloadEod, type APIResult } from "@/server/mobo";
import type { EodReportViewDTO } from "@/lib/mobo/eod-types";
import { logger } from "@/lib/logger";

function toErrorResult(error: unknown): { success: false; error: string; code: string } {
  return { success: false, error: error instanceof Error ? error.message : String(error), code: "ACTION_ERROR" };
}

export async function getEodReport(tradeDate?: string): Promise<APIResult<EodReportViewDTO>> {
  try {
    logger.log("🔄 Fetching EoD report:", { tradeDate });
    const response = await _getEod(tradeDate);
    logger.json("✅ Get EoD report response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching EoD report:", { error, tradeDate });
    return toErrorResult(error);
  }
}

export async function signOff(tradeDate: string): Promise<APIResult<EodReportViewDTO>> {
  try {
    logger.log("🔄 Signing off EoD:", { tradeDate });
    const response = await _signOffEod(tradeDate);
    logger.json("✅ Sign-off response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error signing off EoD:", { error, tradeDate });
    return toErrorResult(error);
  }
}

export async function downloadEodPdf(
  tradeDate?: string,
): Promise<APIResult<{ filename: string; contentType: string; base64: string }>> {
  try {
    return await _downloadEod(tradeDate);
  } catch (error) {
    return toErrorResult(error);
  }
}
```

**Behavior / invariants:** identical logging/error-conversion shape to `trade-reconciliation/actions.ts`'s `getFlow`.

**Done when:** each action returns the same `APIResult` shape its underlying server function does on success, and a thrown network error is converted to `{ success: false, error, code: "ACTION_ERROR" }` rather than propagating.

---

### FE-3 — `useEodReport` hook (MANDATORY)

- **Proposal ref:** § Layer 3 A-1
- **Module:** 5.3
- **Files:** `create: admin-frontend/hooks/api/useEodReport.ts`
- **Dependencies:** FE-2, FE-4 (types)

**Contract:**
```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getEodReport, signOff as signOffAction } from "@/app/(roles)/mobo/daily-exception-report/actions";
import type { EodReportView } from "@/lib/mobo/eod-types";

export interface UseEodReportResult {
  data: EodReportView | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  signOff: () => Promise<boolean>;
  signingOff: boolean;
}

const cache = new Map<string, EodReportView>();
const cacheKey = (tradeDate: string | undefined) => tradeDate ?? "__default__";

export function useEodReport(tradeDate?: string): UseEodReportResult {
  const [data, setData] = useState<EodReportView | null>(() => cache.get(cacheKey(tradeDate)) ?? null);
  const [loading, setLoading] = useState(!cache.has(cacheKey(tradeDate)));
  const [error, setError] = useState<string | null>(null);
  const [signingOff, setSigningOff] = useState(false);
  const inFlight = useRef(false);

  const doFetch = useCallback(async (td: string | undefined) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await getEodReport(td);
      if (result.success) {
        cache.set(cacheKey(td), result.data);
        setData(result.data);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load EoD report");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => { doFetch(tradeDate); }, [tradeDate, doFetch]);

  const signOff = useCallback(async (): Promise<boolean> => {
    if (!data) return false;
    setSigningOff(true);
    try {
      const result = await signOffAction(data.tradeDate);
      if (result.success) {
        cache.set(cacheKey(tradeDate), result.data);
        setData(result.data);
        return true;
      }
      setError(result.error);
      return false;
    } finally {
      setSigningOff(false);
    }
  }, [data, tradeDate]);

  return { data, loading, error, refetch: () => doFetch(tradeDate), signOff, signingOff };
}
```

**Behavior / invariants:** matches `useReconciliationFlow`'s shape (module-scoped cache, in-flight guard, `refetch`) plus the one addition (`signOff`/`signingOff`) this page needs that Trade Reconciliation doesn't. `signOff()` reads `data.tradeDate` (the resolved day from the last successful fetch) rather than requiring the caller to pass it again — the button never needs to know which day is loaded.

**Done when:** the hook transitions `loading: true → false` with `data` populated on success; `signOff()` returns `true` and updates `data` to the now-`SIGNED` view on success, `false` and sets `error` on a 409/404 failure; `refetch()` re-triggers a fetch.

---

### FE-4 — `EodReportView` types (MANDATORY)

- **Proposal ref:** § 4.1
- **Module:** 5.4
- **Files:** `create: admin-frontend/lib/mobo/eod-types.ts`
- **Dependencies:** none — parallel-safe

**Contract:**
```ts
import type { RcAlloc, RcOrder, RcPort } from "@/lib/mobo/flow-types";

export type EodStatus = "OPEN" | "SIGNED";
export type EodOutcome = "CLEAR" | "EXCEPTIONS";

export interface EodReportView {
  settleDay: string;
  tradeDate: string; // "YYYY-MM-DD"
  orders: RcOrder[];
  allocs: RcAlloc[];
  ports: RcPort[];
  algoTotal: string;
  ibTotal: string;
  crmTotal: string;
  counts: { algIbBrk: number; ibCrmBrk: number; algCrmBrk: number; totalBrk: number };
  status: EodStatus;
  signedOffBy: string | null;
  signedOffAt: string | null;
  generated: string | null;
  orderCount: number;
  executionCount: number;
  notionalTraded: string;
  breakTotal: number;
  outcome: EodOutcome;
  canSignOff: boolean;
  exportReady: boolean;
}

/** Wire shape returned by the backend — kept as a distinct alias (matches the
 * ReconciliationFlowViewDTO convention in flow-types.ts) so it can diverge from
 * the view type later without renaming call sites. */
export type EodReportViewDTO = EodReportView;
```

**Behavior / invariants:** reuses `RcOrder`/`RcAlloc`/`RcPort` from `flow-types.ts` verbatim — no duplicate row-shape types (matches proposal § 4.1's field-name freeze).

**Done when:** `EodReportViewDTO` structurally matches every field the Backend layer's `EodReportViewOut` (Pydantic) serializes; `admin-frontend`'s `tsc --noEmit` passes with this file imported.

---

### FE-5 — Cut over `page.tsx` (MANDATORY / Yes — user req.)

- **Proposal ref:** § Layer 3 A-1
- **Module:** 5.5
- **Files:** `modify: admin-frontend/app/(roles)/mobo/daily-exception-report/page.tsx`
- **Dependencies:** FE-3

**Contract:**
```tsx
// page.tsx — ONLY the data-sourcing lines, the verdict/subtitle derivation, and
// the two button handlers change. Every helper component below this point
// (VolumeTile, MonthProgress, Ref, Mismatch, LEG_META, LegBlock, LegRowView,
// AllClear, SignLine, buildL1/buildL2/buildL3) is UNCHANGED — same file,
// same JSX, same Tailwind classes (proposal Constraint: no design/layout change).
"use client";

import { useEodReport } from "@/hooks/api/useEodReport";
// (existing imports: icons, PageHeader, Button, Chip, MPill — unchanged)

export default function DailyExceptionReportPage() {
  const { data, loading, error, refetch, signOff, signingOff } = useEodReport();

  if (loading && !data) {
    return <PageHeader title="Daily Exception Report" />; // <TODO: skeleton matching the report's band/tile shape — no design spec given, same gap FE-A-3 of proposal 012 left open for its own page>
  }
  if (error) {
    return (
      <div role="alert">
        {/* <TODO: error card; retry calls refetch() */}
        <Button onClick={refetch}>Retry</Button>
      </div>
    );
  }
  if (!data) return null;

  const { orders, allocs, ports, settleDay, tradeDate, ibTotal, status, outcome,
          orderCount, executionCount, notionalTraded, breakTotal, canSignOff,
          exportReady, generated, signedOffBy } = data;

  const l1 = buildL1(orders);
  const l2 = buildL2(allocs);
  const l3 = buildL3(ports);
  const open = breakTotal;

  // subtitle / VolumeTile / verdict-switch JSX below reuses `outcome === "CLEAR"`
  // in place of the old client-derived `open === 0` check — everything else
  // (grid layout, LegBlock calls, AllClear props) is unchanged from the
  // current file.

  const handleSignOff = async () => { await signOff(); };
  const handleExport = async () => {
    const result = await downloadEodPdf(tradeDate); // imported from actions.ts
    if (result.success) saveBase64File(result.data.filename, result.data.contentType, result.data.base64);
    else alert(`Export failed: ${result.error}`);
  };

  // ...rest of the component body (JSX: band, tiles, verdict, footer with
  // Sign off & lock / Export buttons wired to handleSignOff/handleExport,
  // disabled per canSignOff/exportReady) is otherwise IDENTICAL to today.
}
```

**Behavior / invariants:**
- **Sign-off gate flips from the prototype's "zero open breaks" to `canSignOff`** (proposal D-1) — the button is enabled whenever `status === "OPEN" && canSignOff`, regardless of `breakTotal`.
- **Verdict switch** (`AllClear` vs. the three `LegBlock`s) now keys off `outcome === "CLEAR"` instead of the current file's client-derived `open === 0` — this is the one behavioral change to the existing render logic (proposal's `outcome` addition).
- `saveBase64File` (a small local helper, `Uint8Array.from(atob(base64), ...)` → `Blob` → object-URL `<a>` click) is copied into this file verbatim from `app/(roles)/compliance/review/page.tsx`'s existing implementation — not extracted to a shared util in this pass (two call sites don't yet justify one; `<TODO: promote to a shared lib/base64Download.ts if a third consumer appears>`).
- The `Export` button disables when `!exportReady`, matching the existing disabled-`Button` pattern already used elsewhere on this page (the sign-off button's `disabled` prop).

**Done when:** the page renders identically (visual parity) to how it renders today against an equivalent mock scenario; clicking "Sign off & lock" on a complete day flips the page to the signed state without a full reload (hook's `data` updates in place); clicking "Export" on a signed day triggers a file save dialog with the correct filename; `npx next build` passes.

---

### FE-6 — Print route (Yes — user req.)

- **Proposal ref:** § Layer 3 A-2
- **Module:** 5.6
- **Files:** `create: admin-frontend/app/(roles)/mobo/daily-exception-report/print/page.tsx`
- **Dependencies:** FE-2 (calls the same `getEodReport` action, server-side)

**Contract:**
```tsx
// print/page.tsx — server component, no client hook, no sidebar/nav chrome.
// Validates the internal render token BEFORE fetching or rendering anything.
import { headers } from "next/headers";
import { getEodReport } from "@/app/(roles)/mobo/daily-exception-report/actions";
import { notFound } from "next/navigation";
// (import the SAME leg-rendering pieces FE-5 uses — LegBlock, AllClear,
// VolumeTile, etc. — re-exported or duplicated minimally so this route has
// no sidebar/PageHeader/nav; exact extraction shape is an implementation
// call, not a design decision: <TODO: factor page.tsx's report <section>
// into a shared ReportBody component both page.tsx and print/page.tsx
// import, rather than duplicating JSX>)

export default async function DailyExceptionReportPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ trade_date?: string }>;
}) {
  const token = (await headers()).get("x-eod-render-token");
  if (!token || token !== process.env.PDF_RENDER_TOKEN) notFound(); // 401-equivalent for a page route (Q-2, settled)

  const { trade_date } = await searchParams;
  const result = await getEodReport(trade_date);
  if (!result.success) notFound();

  return <ReportBody data={result.data} print /* hides sidebar/PageHeader/nav, white background */ />;
}
```

**Behavior / invariants:** gated by `X-Eod-Render-Token` (Q-2/D-7, settled) checked server-side against `process.env.PDF_RENDER_TOKEN` — never client-visible, never rendered into the page's own markup. Not linked from any nav; reachable only by the exact URL `ChromiumRenderer` constructs (Backend BE-9). `<TODO: whether the shared report body is factored into a `ReportBody` component both routes import, or `print/page.tsx` duplicates the relevant JSX minimally, is an implementation-time call — either satisfies the proposal's "same components render the PDF" requirement, since both would use the identical Tailwind/CSS-var styling either way>`.

**Done when:** a request to `/mobo/daily-exception-report/print?trade_date=...` with a correct `X-Eod-Render-Token` header renders the report body (no sidebar/nav) for that day; a request with a missing/wrong token returns a 404 (Next.js `notFound()`); the route is not present in `SidebarNav.tsx` or any page-config listing.

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
class EodReportViewOut(BaseModel):
    settleDay: str
    tradeDate: str
    orders:  list[RcOrderOut]
    allocs:  list[RcAllocOut]
    ports:   list[RcPortOut]
    algoTotal: str
    ibTotal: str
    crmTotal: str
    counts: RcBreakCountsOut
    status: EodStatus
    signedOffBy: str | None
    signedOffAt: str | None
    generated: str | None
    orderCount: int
    executionCount: int
    notionalTraded: str
    breakTotal: int
    outcome: EodOutcome
    canSignOff: bool
    exportReady: bool

# ===== POST /api/mobo/eod/sign-off =====
#   body: EodSignOffReq   |   gated by Action.EOD_SIGNOFF
#   200 -> EodReportViewOut (now status=SIGNED, exportReady=true)
#   409 -> {detail} if already SIGNED, or canSignOff is false (day incomplete)
#   404 -> {detail} if no eod_records row for tradeDate
class EodSignOffReq(BaseModel):
    tradeDate: str

# ===== GET /api/mobo/eod/export?trade_date=YYYY-MM-DD =====
#   gated by Action.RECON_VIEW
#   200 -> application/pdf (StreamingResponse,
#          Content-Disposition: attachment; filename="EoD-YYYY-MM-DD.pdf")
#   409 -> {detail} if status != SIGNED (no file yet)
#   404 -> {detail} if no eod_records row
```

**Error envelope:** bare `HTTPException(status_code, detail=<string>)` on the backend, surfaced to this layer as `apiClient`'s `APIResult<T>` failure shape (`{ success: false, error: string, code: string }`), or (for `downloadEod`) the equivalent base64-proxy failure shape — this layer never parses a `{code, message, details?}` envelope.

### 7.2 How this layer honours the seam
- **What this layer contributes:** consumes `EodReportViewOut` verbatim at `useEodReport`; POSTs `EodSignOffReq` on sign-off; streams the PDF via the base64-proxy pattern on export; renders the print route gated by `X-Eod-Render-Token`.
- **What this layer assumes from the other side:** the backend returns the DTO exactly as in § 7.1; `canSignOff`/`exportReady`/`outcome` are authoritative — this layer never re-derives them from `breakTotal` or unallocated-order state itself.
- **Change protocol:** any edit here requires editing the proposal § 4 first; this section is then re-copied.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Framework / runner:** vitest — command: `npx vitest run` (from `admin-frontend/`; `vitest.config.ts` + `vitest.setup.ts` already present).
- **Fixtures / seed:** hand-built `EodReportViewDTO` fixtures covering an `OPEN`-with-breaks day, an `OPEN`-clean day, and a `SIGNED` day, used to drive hook/page tests without a real network call.
- **Isolation:** `vi.mock` replaces `@/app/(roles)/mobo/daily-exception-report/actions` (for hook/page tests) and `@/server/mobo` (for the server-fetch-function tests) — hermetic, no real fetch.
- **Layer isolation:** FE tests import only `admin-frontend` code plus vitest/test doubles — never spin up the Backend, never hit a real `/api/mobo/eod*`, never launch Chromium (the print route's rendering is verified manually/by the deployment gate, not this layer's automated suite — see Backend § 8.1's identical note for `ChromiumRenderer`).
- **Test location:** `admin-frontend/tests/` mirroring source paths (e.g. `admin-frontend/tests/hooks/useEodReport.test.ts`), per `admin-frontend/.gitignore`'s `tests/` entry.
- **Commit policy:** never committed — `tests/` is git-ignored.
- **Code generation:** `test-gen` skill writes the concrete tests from § 8.2/8.3.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| FE-1 | `getEod`/`signOffEod` build correct paths/bodies; `downloadEod` parses `Content-Disposition` and base64-encodes the body | mocks `apiClient`/`fetch`/`cookies` |
| FE-2 | actions return success/failure `APIResult` shapes; catch thrown errors | mocks `@/server/mobo`'s three functions |
| FE-3 | hook's loading→data / loading→error transitions; `signOff()` updates `data` on success and sets `error` on failure; cache hit skips a refetch | mocks `@/app/(roles)/mobo/daily-exception-report/actions` |
| FE-4 | type-level check only (DTO structurally matches the seam) | none |
| FE-5 | page renders loading→data→error branches; Sign-off button `disabled` matches `!canSignOff`; Export button `disabled` matches `!exportReady`; verdict switch follows `outcome` | mocks `useEodReport` |
| FE-6 | missing/wrong render token → 404; correct token renders the report body for the requested `trade_date` | mocks `getEodReport` action; `headers()`/`searchParams` |

### 8.3 Test goals

#### FE-1
- **Positive:** `getEod("2026-07-21")` calls `apiClient` with a path containing `trade_date=2026-07-21`; `getEod()` (no arg) calls it with the bare path; `signOffEod("2026-07-21")` POSTs a JSON body `{tradeDate: "2026-07-21"}`; `downloadEod` extracts `filename` from a mocked `Content-Disposition` header and base64-encodes a mocked binary body.
- **Negative:** a mocked `401`/`409` response passes through as the corresponding `APIResult` failure/`HTTP_409` code.
- **Invariants:** the `trade_date` query value is URI-encoded.
- **Seam mocks:** `apiClient` mocked to a `vi.fn()`; `fetch`/`cookies` mocked for `downloadEod`.

#### FE-2
- **Positive:** on a successful mocked server function, each action returns the same `{ success: true, data }`.
- **Negative:** a thrown error from the mocked server function is caught and converted to `{ success: false, error, code: "ACTION_ERROR" }`.
- **Invariants:** logging calls never throw even if `logger` is mocked away.
- **Seam mocks:** `@/server/mobo`'s `getEod`/`signOffEod`/`downloadEod` mocked.

#### FE-3
- **Positive:** first render with an empty cache shows `loading: true`; after a mocked `getEodReport` resolves, `loading: false` and `data` equals the fixture. Calling `signOff()` against a mocked successful `signOff` action updates `data` to the returned (now-`SIGNED`) fixture and returns `true`.
- **Negative:** a mocked `signOff` failure (409) sets `error`, leaves `data` unchanged, and returns `false`.
- **Invariants:** calling `refetch()`/`signOff()` while a fetch is already in flight does not double-fire (the `inFlight` guard on `doFetch`; `signOff` itself has no separate in-flight guard — acceptable since `signingOff` already disables the calling button, per FE-5).
- **Seam mocks:** `getEodReport`/`signOff` mocked via `vi.mock` of the actions module.

#### FE-4
- **Positive:** a hand-built object matching every field in § 7's `EodReportViewOut` type-checks as `EodReportViewDTO` with no `tsc` error.
- **Negative:** n/a (type-level only).
- **Invariants:** `EodReportView`'s `orders`/`allocs`/`ports` fields accept the exact `RcOrder`/`RcAlloc`/`RcPort` types from `flow-types.ts` with no structural mismatch.
- **Seam mocks:** none.

#### FE-5
- **Positive:** with `useEodReport` mocked to an `OPEN`, `canSignOff: true` fixture, the Sign-off button renders enabled; with `exportReady: true`, Export renders enabled; with `outcome: "CLEAR"`, `AllClear` renders instead of the leg tables. Clicking Sign off calls the mocked `signOff`.
- **Negative:** with `{ data: null, loading: false, error: "boom" }`, the error branch renders (not a crash); with `canSignOff: false`, the Sign-off button renders disabled even if `breakTotal === 0`.
- **Invariants:** with `{ data: null, loading: true, error: null }`, the loading branch renders without throwing on `undefined` array access.
- **Seam mocks:** `useEodReport` mocked via `vi.mock("@/hooks/api/useEodReport")`.

#### FE-6
- **Positive:** a request with the correct `X-Eod-Render-Token` header renders the report body for the given `trade_date`, using a mocked `getEodReport` action.
- **Negative:** a request with a missing or mismatched token triggers `notFound()` (asserted via the mocked `next/navigation` `notFound` throwing/being called) before `getEodReport` is ever invoked.
- **Invariants:** the token comparison never logs or echoes the token value itself (no accidental leak into server logs).
- **Seam mocks:** `getEodReport` mocked; `next/headers`'s `headers()` and the route's `searchParams` mocked to supply/withhold the token.

### 8.4 Aggregate gate
- All unit tests green is a local gate before commit/PR hand-off.
- Target coverage: ≥ 90% of new/changed statements across FE-1 through FE-4 (FE-5/FE-6 are thin enough that a handful of render-branch tests suffice, per their goals above).
- Chosen `test-gen` level for this layer: `standard`.

---

## 9. Definition of done & rollback

**Definition of done:**
- [ ] FE-1 through FE-6 committed on `<parent-branch>-fe`; each commit left the branch green.
- [ ] § 8 unit tests all pass; `npx vitest run && npx tsc --noEmit && npx next lint` green.
- [ ] § 7 matches the proposal's frozen seam verbatim.
- [ ] Page renders against a live seeded Backend endpoint with the same visual as the mock today (human-verified); sign-off and export both round-trip against a live Backend.
- [ ] The print route renders correctly when hit directly with a valid token (human-verified, ahead of the Backend layer's `ChromiumRenderer` deployment gate).
- [ ] PR opened; human owns the merge to the parent branch.

**Rollback:** reverting the branch restores the two synchronous mock calls (`loadReconciliationFlow("breaks")`/`loadReconciliation()`) in `page.tsx` — the page returns to fully mock-backed rendering with zero data loss, since this layer never writes anything itself (all writes happen via the Backend's `sign-off` endpoint, which is the Backend layer's own transaction, not this layer's state). The print route, if already deployed and reachable, becomes an orphaned unlinked page on revert — harmless (gated by a token, not indexed/linked anywhere) but worth deleting in the same revert commit rather than leaving stranded.
