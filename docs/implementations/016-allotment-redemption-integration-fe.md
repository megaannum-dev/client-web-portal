# 016 — Allotment & Redemption Integration · Implementation Details — Frontend

> Status: **DRAFT — pending implementation.**
> Implements: proposal `docs/proposals/016-2026-07-22-allotment-redemption-integration.md` § "Layer 3 — Frontend"
> Layer: Frontend — **one layer per file.**
> Sibling layer docs: `docs/implementations/016-allotment-redemption-integration-db.md`, `docs/implementations/016-allotment-redemption-integration-be.md`
> Execution schedule: `docs/execution-schedules/016-allotment-redemption-integration-fe.md`
> Builds on / prerequisites: the Backend layer's 4 new routes (`POST /api/rm/allotment`, `POST /api/rm/redemption`, `POST /api/pc/redemptions/{id}/decide`, `POST /api/co/redemptions/{id}/decide`) as a **contract precondition, not a runtime one** — per the template's isolation rule (§2), this layer is built entirely against the frozen seam in §7 and does not need the Backend layer's code to exist or be merged. Only genuine end-to-end (cross-layer) testing requires the routes live; this layer's own unit tests (§8) mock the seam.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/016-2026-07-22-allotment-redemption-integration.md` § "Layer 3 — Frontend" (+ § 4 frozen seam) |
| Execution schedule | `docs/execution-schedules/016-allotment-redemption-integration-fe.md` |
| Sibling layer impl docs | `docs/implementations/016-allotment-redemption-integration-db.md` (Database), `docs/implementations/016-allotment-redemption-integration-be.md` (Backend) |
| Builds on | Backend layer's 4 new routes (§4.1/§4.2 of the proposal) — contract-only precondition, see note above |

---

## 2. Branch & session contract

- **Branch:** `allotment-redemption-integration-fe` — all work units in this doc land on this one branch.
  - **Naming convention:** parent branch `allotment-redemption-integration` + `-fe` suffix.
  - The parent branch was captured at session start; this layer branch is cut from it and merges back into it — **the human owns that merge**.
- **Isolation:** implementable in a separate session on its own branch, in parallel with the DB and Backend layers, provided the preconditions below hold. Shares state with sibling layers **only** through the pinned contract in §7.
- **Preconditions (must be true before starting):**
  - [ ] The frozen seam in proposal §4 is agreed and unchanged — §7 below is a verbatim copy, not a negotiation.
  - [ ] No live-DB or live-Backend dependency — this layer compiles, type-checks, and unit-tests green against seam mocks alone.
- **Read-first inventory** (every existing file a unit touches):
  - `admin-frontend/components/rm/SubscriptionFormModal.tsx` — modal with modes `new-subscription`/`add-allotment`/`redemption`; Submit button (L131-137) has no `onClick`; `SubscriptionModalContext` (L31-38) lacks `modelId`.
  - `admin-frontend/components/rm/SubscriptionAccordion.tsx` — `TxnTable` (L33-84) hardcodes every non-Net row to `<Chip tone="active" dot={false}>Confirmed</Chip>` (L75); `ModelAccordionItem` (L86-151) builds `SubscriptionModalContext` from `SubModel`, which lacks a model id.
  - `admin-frontend/app/(roles)/rm/model-subscription/actions.ts` — only `fetchSubscriptions`/`fetchClientAllotments`; both wrap `@/server/rm` calls in `try { … } catch (e) { return toErrorResult(e); }`.
  - `admin-frontend/app/(roles)/rm/model-subscription/page.tsx` — owns `modal` state (`ModalState | null`), passes `onOpenModal={setModal}` to the accordion and `onClose={() => setModal(null)}` to the modal; owns `useSubscriptions()`.
  - `admin-frontend/server/rm/index.ts` — `getSubscriptions`/`getClientAllotments`, both `apiClient<T>(ENDPOINTS.RM.X)`.
  - `admin-frontend/server/endpoints.ts` — `ENDPOINTS.RM` object (`RM = "/api/rm"` prefix, L24-39).
  - `admin-frontend/server/api-client.ts` — `apiClient<T>(path, init?)` returns `APIResult<T>`; POST usage is `apiClient<T>(path, { method: "POST", body: JSON.stringify(req) })` (Content-Type is set by `buildHeaders` already).
  - `admin-frontend/lib/onboarding/types.ts` — `AllotRdmpStatus` (L7, currently `"pending" | "acknowledged"`), `AllotRdmpKind` (L8), `AllotRdmptDTO` (L56-63).
  - `admin-frontend/lib/rm/subscriptions.ts` — `mapSubscriptionsToSubClients`, `allotmentToTxnRow` (maps `AllotRdmptDTO` → the 9-tuple `TxnRow`, L45-62), `netRow` (L28-34).
  - `admin-frontend/lib/mock/rm-data.ts` — `TxnRow` (L220, 9-tuple), `SubModel`/`SubClient` (L221-237, `SubModel` has no id field), `SUB_CLIENTS` literal fixture rows, `MODEL_SIZES`/`MODEL_SIZE_LIST`/`OB_MODEL_CATALOG`.
  - `admin-frontend/hooks/api/useSubscriptions.ts` — `clients`, `loading`, `error`, `ensureAllotmentsLoaded`; **no refetch/invalidate surface exists today**.
  - `admin-frontend/components/ui/Chip.tsx` — `ChipTone = "active" | "pending" | "review" | "failed" | "overdue" | "neutral" | "warm"`.
  - `admin-frontend/components/ui/Button.tsx` — already accepts `disabled`.
- **Hand-off / exit signal:** all FE-* units committed, `npx vitest run && npx tsc --noEmit && npx next lint` green, PR opened against `allotment-redemption-integration`.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- **Layering:** `app/(roles)/rm/.../actions.ts` (`"use server"`) → `server/rm/index.ts` (`"use server"`, calls `apiClient`) → `server/api-client.ts` (raw fetch + auth). Client components (`"use client"`) call **only** the server actions in `actions.ts`, never `server/rm` or `apiClient` directly.
- **Error envelope:** every server action returns `APIResult<T> = { success: true; data: T } | { success: false; error: string; code: string }`. `actions.ts` wraps the `server/rm` call in `try/catch` and funnels any thrown error through the local `toErrorResult(error): { success: false; error; code: "ACTION_ERROR" }` helper — the underlying `apiClient` call already returns a typed failure branch for HTTP/network errors, so the `catch` only exists for unexpected throws.
- **Decimal-as-number:** per the existing convention in `lib/onboarding/types.ts`, `Decimal` fields cross the wire as JSON numbers (e.g. `mgmt_fee: 0.015`), not strings. New request DTOs (§6 FE-1) follow the same rule.
- **App Router:** page at `app/(roles)/rm/model-subscription/page.tsx`, a client component (`"use client"`) wrapped in `<Suspense>`; server actions live in the sibling `actions.ts` (route-scoped, not global).
- **POST convention (new — this layer establishes it for `server/rm`):** `apiClient<T>(path, { method: "POST", body: JSON.stringify(req) })`. No new helper needed — `apiClient` already sets `Content-Type: application/json` in `buildHeaders`.

### 3.2 CI/CD & engineering discipline
- Each FE-* unit is a small, independently-revertible commit that leaves the branch green (type-checks, lints, unit tests pass).
- Additive-first: FE-1 (type widening) is a strict superset of the existing union — no consumer of the old 2-value type breaks. FE-4 (chip mapping) is additive to `TxnRow`'s tuple shape (append a field), not a rewrite of the render structure — the visual layout of `SubscriptionAccordion`/`SubscriptionFormModal` is unchanged per the proposal's constraint.
- **Gates before merge**, confirmed configured in `admin-frontend/package.json` (`"test": "vitest run"`, `vitest ^4.1.10`, `@testing-library/react`/`jest-dom` present as devDependencies):
  ```bash
  npx vitest run && npx tsc --noEmit && npx next lint
  ```
- No secrets, no manual steps in the merge path. The only human step is the PR merge itself (owned by the user, per repo convention).

---

## 4. Architecture

**Target layout (new/changed files only):**
```
admin-frontend/
  lib/onboarding/types.ts                          # FE-1: widen AllotRdmpStatus, add 3 request DTOs
  server/endpoints.ts                               # FE-2: 2 new ENDPOINTS.RM paths
  server/rm/index.ts                                # FE-2: submitAllotment, submitRedemption
  app/(roles)/rm/model-subscription/actions.ts       # FE-2: submitAllotment, submitRedemption server actions
  hooks/api/useSubscriptions.ts                      # FE-3: add refetch + invalidateClientAllotments
  components/rm/SubscriptionFormModal.tsx            # FE-3: wire Submit onClick, loading/error state, carry modelId
  components/rm/SubscriptionAccordion.tsx            # FE-3: thread modelId into context; FE-4: status-aware chips
  lib/rm/subscriptions.ts                            # FE-4: statusToChip helper, widen allotmentToTxnRow/netRow
  lib/mock/rm-data.ts                                # FE-4: widen TxnRow to 10-tuple, add modelId to SubModel
  app/(roles)/rm/model-subscription/page.tsx         # FE-3: wire onSuccess → refetch + close
```

**Dependency direction:** `page.tsx` → `SubscriptionAccordion`/`SubscriptionFormModal` (view) → `actions.ts` (server action) → `server/rm` (API client wrapper) → `server/api-client` (transport). `lib/rm/subscriptions.ts` is a pure mapping module imported by both the hook and the accordion; it imports types only, never `server/*`.

**External seams:** consumes `POST /api/rm/allotment`, `POST /api/rm/redemption` (this layer's calls); reads/renders the widened `AllotRdmpStatus` values on `AllotRdmptDTO` returned by the existing `GET /api/rm/subscriptions/{client_id}/allotments`. **Addendum 2026-07-23:** also consumes `POST /api/pc/redemptions/{id}/decide` and `POST /api/co/redemptions/{id}/decide` (FE-6), and reads redemption records from `GET /api/pc/allotments` filtered by `kind === "redemption"` (FE-7).

---

## 5. Modules

### 5.1 `lib/onboarding/types.ts` (DTO types)
- **Responsibility:** shared TS mirror of the backend Pydantic DTOs for the onboarding/allotment domain.
- **Files:** `admin-frontend/lib/onboarding/types.ts`.
- **Public surface:** `AllotRdmpStatus`, `SubmitAllotmentReq`, `SubmitRedemptionReq`, `RedemptionDecisionReq`, `AllotRdmptDTO` (unchanged shape, reused).
- **Owns features:** FE-1.

### 5.2 `server/rm` + `server/endpoints` + `actions.ts` (write path)
- **Responsibility:** typed POST calls to the 2 new RM-submit routes, exposed to client components as server actions returning `APIResult<AllotRdmptDTO>`.
- **Files:** `admin-frontend/server/endpoints.ts`, `admin-frontend/server/rm/index.ts`, `admin-frontend/app/(roles)/rm/model-subscription/actions.ts`.
- **Public surface:** `submitAllotment(req: SubmitAllotmentReq)`, `submitRedemption(req: SubmitRedemptionReq)` (both layers: `server/rm` internal, `actions.ts` client-facing).
- **Owns features:** FE-2.

### 5.3 `SubscriptionFormModal` + `useSubscriptions` (submit UX)
- **Responsibility:** wire the modal's Submit button to the new server actions; on success, refresh the page's data and close.
- **Files:** `admin-frontend/components/rm/SubscriptionFormModal.tsx`, `admin-frontend/hooks/api/useSubscriptions.ts`, `admin-frontend/app/(roles)/rm/model-subscription/page.tsx`, `admin-frontend/components/rm/SubscriptionAccordion.tsx` (context plumbing only).
- **Public surface:** `SubscriptionFormModal`'s existing props plus `onSuccess?: () => void`; `useSubscriptions()`'s new `refetch`/`invalidateClientAllotments`.
- **Owns features:** FE-3.

### 5.4 `lib/rm/subscriptions.ts` + `lib/mock/rm-data.ts` + `SubscriptionAccordion` (status rendering)
- **Responsibility:** map `AllotRdmpStatus` → `{ tone, label }` and render it per row instead of the hardcoded "Confirmed" chip.
- **Files:** `admin-frontend/lib/rm/subscriptions.ts`, `admin-frontend/lib/mock/rm-data.ts`, `admin-frontend/components/rm/SubscriptionAccordion.tsx`.
- **Public surface:** `statusToChip(status: AllotRdmpStatus): { tone: ChipTone; label: string }`.
- **Owns features:** FE-4.

### 5.5 `SubscriptionFormModal` dropdowns (Recommend)
- **Responsibility:** source new-subscription-mode client/model dropdowns from live data instead of mock fixtures.
- **Files:** `admin-frontend/components/rm/SubscriptionFormModal.tsx`, `admin-frontend/app/(roles)/rm/model-subscription/page.tsx`.
- **Public surface:** none new — consumes existing `useSubscriptions().clients` and a models list.
- **Owns features:** FE-5.

### 5.6 PC Redemptions live-data wiring (Addendum 2026-07-23)
- **Responsibility:** wire the PC Allotment & Redemption page's Redemptions tab to live data from `GET /pc/allotments` (filtered `kind === "redemption"`) and wire approve/reject to `POST /pc/redemptions/{id}/decide`.
- **Files:** `admin-frontend/lib/onboarding/types.ts`, `admin-frontend/lib/onboarding/mappers.ts`, `admin-frontend/hooks/api/useAllotments.ts`, `admin-frontend/app/(roles)/pc/allotment-redemption/page.tsx`, `admin-frontend/components/pc/allotment-redemption/RedeemTable.tsx`, `admin-frontend/components/pc/allotment-redemption/RedeemDetailPanel.tsx`, `admin-frontend/components/pc/allotment-redemption/StatStrip.tsx`.
- **Public surface:** `RedemptionView` type, `mapRedemptionsToView` mapper, `UseAllotmentsResult.redemptions`/`.decideRedemption`.
- **Owns features:** FE-6, FE-7.

---

## 6. Features

### FE-1 — Widen `AllotRdmpStatus` + add request DTOs (MANDATORY)

- **Proposal ref:** § "Layer 3 — Frontend" A-3; § 4.1
- **Module:** 5.1
- **Files:** `modify: admin-frontend/lib/onboarding/types.ts`
- **Dependencies:** none — parallel-safe

**Contract:**
```ts
// lib/onboarding/types.ts
export type AllotRdmpStatus =
  | "pending"        // existing
  | "acknowledged"   // existing
  | "awaiting_pc"    // NEW — redemption submitted, needs PC approval
  | "awaiting_co"    // NEW — redemption submitted, needs Compliance approval (amount > $300k)
  | "approved"       // NEW — redemption fully approved, took effect
  | "rejected";      // NEW — redemption rejected by PC or CO

export interface SubmitAllotmentReq {
  client_id: string;             // uuid.UUID as string
  model_id: string;              // uuid.UUID as string
  multiplier: number;            // Decimal-as-number — number of units
  expected_cash_in: string | null;  // ISO date "YYYY-MM-DD", nullable
  mgmt_fee?: number | null;      // only populated for new-subscription mode
  incentive_fee?: number | null; // only populated for new-subscription mode
}

export interface SubmitRedemptionReq {
  client_id: string;
  model_id: string;
  multiplier: number;             // units to redeem
  expected_cash_out: string | null;
  emergent?: boolean;             // default false
}

export interface RedemptionDecisionReq {
  verdict: "approve" | "reject";
  reason?: string | null;         // required when verdict === "reject"
}

// AllotRdmptDTO (L56-63) is UNCHANGED — reused verbatim per the frozen seam (§7).
// Its `status: AllotRdmpStatus` field now carries the 4 new values automatically
// via the widened union above; no DTO field edit needed.
```

**Behavior / invariants:** the widened union is a strict superset — every existing literal (`"pending"`, `"acknowledged"`) is retained, so no existing consumer (`AllotmentView.status`, `mapSubscriptionsToSubClients`) needs a code change to keep compiling. `RedemptionDecisionReq` is defined for contract completeness (§7 lists it) even though no FE unit in this layer calls the PC/CO decide routes — it exists so a future PC/CO-page layer can import it without re-deriving the shape.

**Done when:** `admin-frontend` type-checks (`npx tsc --noEmit`) with the widened type in place and no other file edited.

---

### FE-2 — RM-submit endpoints + API client functions + server actions (MANDATORY)

- **Proposal ref:** § "Layer 3 — Frontend" B (upstream-adaptation table); § 4.1 routes
- **Module:** 5.2
- **Files:** `modify: admin-frontend/server/endpoints.ts`, `modify: admin-frontend/server/rm/index.ts`, `modify: admin-frontend/app/(roles)/rm/model-subscription/actions.ts`
- **Dependencies:** FE-1 (needs the request DTO types)

**Contract:**
```ts
// server/endpoints.ts — inside ENDPOINTS.RM (RM = "/api/rm")
SUBMIT_ALLOTMENT:  `${RM}/allotment`,
SUBMIT_REDEMPTION: `${RM}/redemption`,
```
```ts
// server/rm/index.ts
import type { AllotRdmptDTO, ClientSubscriptionsDTO, SubmitAllotmentReq, SubmitRedemptionReq } from "@/lib/onboarding/types";

export async function submitAllotment(req: SubmitAllotmentReq): Promise<APIResult<AllotRdmptDTO>> {
  return apiClient<AllotRdmptDTO>(ENDPOINTS.RM.SUBMIT_ALLOTMENT, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function submitRedemption(req: SubmitRedemptionReq): Promise<APIResult<AllotRdmptDTO>> {
  return apiClient<AllotRdmptDTO>(ENDPOINTS.RM.SUBMIT_REDEMPTION, {
    method: "POST",
    body: JSON.stringify(req),
  });
}
```
```ts
// app/(roles)/rm/model-subscription/actions.ts
import { submitAllotment as _submitAllotment, submitRedemption as _submitRedemption } from "@/server/rm";
import type { SubmitAllotmentReq, SubmitRedemptionReq } from "@/lib/onboarding/types";

export async function submitAllotment(req: SubmitAllotmentReq) {
  try {
    const r = await _submitAllotment(req);
    logger.json("rm.submitAllotment", r.success ? { id: r.data.id } : r);
    return r;
  } catch (e) {
    return toErrorResult(e);
  }
}

export async function submitRedemption(req: SubmitRedemptionReq) {
  try {
    const r = await _submitRedemption(req);
    logger.json("rm.submitRedemption", r.success ? { id: r.data.id } : r);
    return r;
  } catch (e) {
    return toErrorResult(e);
  }
}
```

**Behavior / invariants:** follows the exact `fetchSubscriptions`/`fetchClientAllotments` pattern already in `actions.ts` — no new error-handling shape introduced. `SUBMIT_ALLOTMENT`/`SUBMIT_REDEMPTION` resolve to `/api/rm/allotment` and `/api/rm/redemption` (the onboarding router is mounted with no extra path segment at `app.include_router(onboarding_router, prefix="/api")`, so `POST /rm/allotment` on that router is reachable at `/api/rm/allotment` — consistent with every other `ENDPOINTS.RM` entry already in this file). The PC/CO decide endpoints are **not** added here (out of scope, see §4 "External seams").

**Done when:** `submitAllotment`/`submitRedemption` server actions are callable from a client component, return `APIResult<AllotRdmptDTO>`, and a unit test asserts the exact request path + JSON body per §8.

---

### FE-3 — Wire modal submit + refetch (MANDATORY)

- **Proposal ref:** § "Layer 3 — Frontend" A-1
- **Module:** 5.3
- **Files:** `modify: admin-frontend/components/rm/SubscriptionFormModal.tsx`, `modify: admin-frontend/components/rm/SubscriptionAccordion.tsx` (context only), `modify: admin-frontend/hooks/api/useSubscriptions.ts`, `modify: admin-frontend/app/(roles)/rm/model-subscription/page.tsx`
- **Dependencies:** FE-2 (needs the server actions)

**Contract — context widened to carry `modelId` (required for a real `model_id` on submit):**
```ts
// components/rm/SubscriptionFormModal.tsx
export interface SubscriptionModalContext {
  clientName?: string;
  clientId?: string;
  modelName?: string;
  modelId?: string;        // NEW — required to build SubmitAllotmentReq/SubmitRedemptionReq for locked modes
  modelAccount?: string;
  mgmtFee?: string;
  incentiveFee?: string;
}
```
```ts
// components/rm/SubscriptionAccordion.tsx — ModelAccordionItem, context construction (~L99-106)
const context: SubscriptionModalContext = {
  clientName: client.name,
  clientId: client.id,
  modelName: model.name,
  modelId: model.modelId,   // NEW — SubModel.modelId, see FE-4's rm-data.ts widening
  modelAccount: model.account,
  mgmtFee: model.mgmtFee,
  incentiveFee: model.incentiveFee,
};
```

**Contract — submit wiring (the exact onClick handler shape):**
```ts
// components/rm/SubscriptionFormModal.tsx
import { submitAllotment, submitRedemption } from "@/app/(roles)/rm/model-subscription/actions";

export function SubscriptionFormModal({
  mode = "new-subscription",
  context = {},
  initialEmergent = false,
  onClose,
  onSuccess,                     // NEW
}: {
  mode?: SubscriptionModalMode;
  context?: SubscriptionModalContext;
  initialEmergent?: boolean;
  onClose: () => void;
  onSuccess?: () => void;        // NEW — called after a successful submit, before onClose
}) {
  // ...existing state...
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitError(null);
    setSubmitting(true);
    const result = isRedemption
      ? await submitRedemption({
          client_id: context.clientId ?? "",
          model_id: context.modelId ?? "",
          multiplier: emergent ? 0 : parseFloat(multiplier) || 0,
          expected_cash_out: emergent ? null : (dateVal || null),
          emergent,
        })
      : await submitAllotment({
          client_id: context.clientId ?? "",
          model_id: context.modelId ?? "",
          multiplier: parseFloat(multiplier) || 0,
          expected_cash_in: dateVal || null,
          mgmt_fee: isNew ? parseFloat(mgmtFee) || null : null,
          incentive_fee: isNew ? parseFloat(incentiveFee) || null : null,
        });
    setSubmitting(false);
    if (!result.success) {
      setSubmitError(result.error);
      return;
    }
    onSuccess?.();
    onClose();
  };

  // ...footer JSX...
  // <Button variant="secondary" onClick={onClose} className="ml-auto" disabled={submitting}>Cancel</Button>
  // {emergent
  //   ? <Button icon={TriangleAlert} style={{ background: "#b71c1c" }} onClick={handleSubmit} disabled={submitting}>
  //       {submitting ? "Submitting…" : "Submit emergent redemption"}
  //     </Button>
  //   : <Button icon={Send} onClick={handleSubmit} disabled={submitting}>
  //       {submitting ? "Submitting…" : `Submit ${isRedemption ? "redemption" : "allotment"}`}
  //     </Button>}
  // submitError renders as an inline message above the footer (same visual slot pattern
  // already used for the "Emergent Big Redemption" warning box, L242-251) — no new
  // layout primitive introduced.
}
```

**Contract — refetch surface on the hook:**
```ts
// hooks/api/useSubscriptions.ts
export interface UseSubscriptionsResult {
  clients: SubClient[] | null;
  loading: boolean;
  error: string | null;
  ensureAllotmentsLoaded: (clientId: string) => void;
  refetch: () => void;                              // NEW — re-fetch subscriptions (Net rows, aggregates)
  invalidateClientAllotments: (clientId: string) => void; // NEW — force-refresh one client's ledger, bypassing the cache
}

export function useSubscriptions(): UseSubscriptionsResult {
  // ...existing dtos/error/allotmentsByClient/inFlight state...

  const loadSubscriptions = useCallback(() => {
    fetchSubscriptions().then((r) => (r.success ? setDtos(r.data) : setError(r.error)));
  }, []);

  useEffect(loadSubscriptions, [loadSubscriptions]);

  const loadAllotments = useCallback((clientId: string) => {
    inFlight.current.add(clientId);
    fetchClientAllotments(clientId).then((r) => {
      inFlight.current.delete(clientId);
      if (r.success) setAllotmentsByClient((m) => ({ ...m, [clientId]: r.data }));
    });
  }, []);

  const ensureAllotmentsLoaded = useCallback((clientId: string) => {
    if (allotmentsByClient[clientId] !== undefined || inFlight.current.has(clientId)) return;
    loadAllotments(clientId);
  }, [allotmentsByClient, loadAllotments]);

  const invalidateClientAllotments = useCallback((clientId: string) => {
    loadAllotments(clientId); // unconditional re-fetch, overwrites the cached entry on success
  }, [loadAllotments]);

  return {
    clients: dtos ? mapSubscriptionsToSubClients(dtos, allotmentsByClient) : null,
    loading: dtos === null && !error,
    error,
    ensureAllotmentsLoaded,
    refetch: loadSubscriptions,
    invalidateClientAllotments,
  };
}
```

**Contract — page-level orchestration:**
```tsx
// app/(roles)/rm/model-subscription/page.tsx
const { clients, ensureAllotmentsLoaded, refetch, invalidateClientAllotments } = useSubscriptions();

// ...
{modal && (
  <SubscriptionFormModal
    mode={modal.mode}
    context={modal.context}
    onClose={() => setModal(null)}
    onSuccess={() => {
      refetch();
      if (modal.context.clientId) invalidateClientAllotments(modal.context.clientId);
    }}
  />
)}
```

**Behavior / invariants:**
- The modal never closes on a failed submit — `onClose()` is only reached after `result.success`. `submitError` stays populated until the next submit attempt or a manual Cancel.
- `handleSubmit` is idempotent-safe against double-click via the `submitting` guard driving `disabled` on both footer buttons.
- **Known limitation (carried from proposal C-1, not fixed by this unit):** for `new-subscription` mode, `context.clientId`/`context.modelId` are empty until FE-5 lands (today's dropdowns are unbound to real ids — `SUB_CLIENTS`/`MODEL_SIZE_LIST` are mock fixtures with no `client_id`/`model_id`). This unit wires the call correctly for **add-allotment** and **redemption** modes (where `context` is pre-locked from live accordion data via FE-3's own `SubModel.modelId` plumbing) — those two modes are fully functional end-to-end once Backend lands. New-subscription-mode submission become fully functional only after FE-5 (Recommend) sources the dropdowns from live data.

**Done when:** submitting from add-allotment/redemption mode calls the correct server action with a well-formed request body; a failed submit surfaces `submitError` and leaves the modal open; a successful submit calls `onSuccess` then `onClose`.

---

### FE-4 — Status-aware chip mapping in `TxnTable` (MANDATORY)

- **Proposal ref:** § "Layer 3 — Frontend" A-2; § 4.2 (Frontend row: "renders new statuses in TxnTable with appropriate chips")
- **Module:** 5.4
- **Files:** `modify: admin-frontend/lib/rm/subscriptions.ts`, `modify: admin-frontend/lib/mock/rm-data.ts`, `modify: admin-frontend/components/rm/SubscriptionAccordion.tsx`
- **Dependencies:** FE-1 (needs the widened `AllotRdmpStatus`)

**Contract — status→chip mapping function:**
```ts
// lib/rm/subscriptions.ts
import type { ChipTone } from "@/components/ui/Chip";
import type { AllotRdmpStatus } from "@/lib/onboarding/types";

export function statusToChip(status: AllotRdmpStatus): { tone: ChipTone; label: string } {
  switch (status) {
    case "pending":
    case "acknowledged":
      return { tone: "active", label: "Confirmed" };
    case "awaiting_pc":
    case "awaiting_co":
      return { tone: "pending", label: "Awaiting Approval" };
    case "approved":
      return { tone: "active", label: "Approved" };
    case "rejected":
      return { tone: "overdue", label: "Rejected" };
  }
}
```

**Contract — `TxnRow` widened to carry status (append, don't rewrite):**
```ts
// lib/mock/rm-data.ts
export type TxnRow = [
  string, string, string, string, string, string, string, string, string,
  AllotRdmpStatus | "",   // NEW 10th element — "" for the Net row (no chip rendered) and any
                          // legacy mock literal row not yet backed by a real status
];
export type SubModel = {
  name: string;
  status: string;
  tone: ChipTone;
  mgmtFee: string;
  incentiveFee: string;
  account: string;
  modelId: string;   // NEW — required by FE-3 to build SubmitAllotmentReq/SubmitRedemptionReq
  rows: TxnRow[];
};
// SUB_CLIENTS literal fixture rows: append a status literal to each existing 9-tuple
// (e.g. "pending" for Allotment/Redemption rows, "" for Net rows) and a modelId
// string to each SubModel object, so the file still type-checks as a 10-tuple/
// id-bearing shape. No visual/layout change — TxnTable only reads the new field.
```

**Contract — `allotmentToTxnRow`/`netRow` append the status field:**
```ts
// lib/rm/subscriptions.ts
function netRow(sub: ClientSubscriptionsDTO["subscriptions"][number]): TxnRow {
  const amt = Number(sub.amount).toLocaleString("en-US");
  return ["Net", "", "", "", amt, `${Number(sub.units)}×`, amt, "", "", ""]; // 10th = ""
}

export function allotmentToTxnRow(dto: AllotRdmptDTO, ibAccount: string | null): TxnRow {
  // ...existing body unchanged...
  return [
    isRedemption ? "Redemption" : "Allotment",
    fmtTimestamp(dto.created_at),
    ibAccount ?? "—",
    "USD",
    signedAmt,
    mult,
    signedAmt,
    isRedemption ? "—" : expected,
    isRedemption ? expected : "—",
    dto.status,   // NEW 10th element
  ];
}
```

**Contract — `TxnTable` renders the mapped chip instead of the hardcoded one:**
```tsx
// components/rm/SubscriptionAccordion.tsx
import { statusToChip } from "@/lib/rm/subscriptions";
import type { AllotRdmpStatus } from "@/lib/onboarding/types";

// inside the row map, replace:
//   {!isNet && <Chip tone="active" dot={false}>Confirmed</Chip>}
// with:
{!isNet && (() => {
  const { tone, label } = statusToChip(r[9] as AllotRdmpStatus);
  return <Chip tone={tone} dot={false}>{label}</Chip>;
})()}
```

**Contract — D-5 (settled): a `rejected` row's amount/multiplier cells render**
**muted + overline, never plain text. Only these 3 numeric cells are muted;**
**Type/Date/IB Account/Ccy/Expected Cash In-Out stay normal.**
```tsx
// components/rm/SubscriptionAccordion.tsx
const REJECTED_AMOUNT_COLS = new Set(["Cash Amt", "Model ×", "Notional"]);

// inside the cell map, extend the existing className ternary:
className={clsx(
  "whitespace-nowrap border-t border-outline-variant px-3.5 py-2.5 tabular-nums text-on-surface",
  TXN_RIGHT.has(TXN_COLS[ci]) ? "text-right" : "text-left",
  isNet ? "font-bold" : ci === 0 ? "font-semibold" : "font-normal",
  r[9] === "rejected" && REJECTED_AMOUNT_COLS.has(TXN_COLS[ci]) && "text-secondary opacity-60 [text-decoration:overline]",
)}
```

**Behavior / invariants:** the mapping in §"Refactor" of the proposal's A-2 is exhaustive over all 6 `AllotRdmpStatus` values — the `switch` has no `default`, so a 7th status value added later fails `tsc` (exhaustiveness via the return-type contract), which is the intended guard rail. Net rows never call `statusToChip` (still gated by `!isNet`) — no behavior change there. No JSX layout structure changes — only the chip's `tone`/children are now data-driven instead of literal. Per D-5: a `rejected` row's muted+overline treatment applies **only** to the Cash Amt/Model ×/Notional cells — every other cell in that row (Type, Date, IB Account, Ccy, Expected Cash In/Out) keeps the plain className, since a rejected redemption is still a real, dated record of what was requested and refused, not a row to hide or grey out wholesale. Per D-5's confirmed (not newly-built) guarantee: the Net row is computed from `ClientSubscriptionsDTO.subscriptions[].amount`/`.units` (live `client_subscriptions`), never by summing ledger rows — so a `rejected` row's presence in the ledger has zero effect on Net, by construction, with no new guard needed in this unit.

**Done when:** for each of the 6 `AllotRdmpStatus` values, `statusToChip` returns the exact `{tone, label}` pair from the mapping table above, and `TxnTable` renders that tone/label for a row carrying that status; a row whose status is `rejected` renders its Cash Amt/Model ×/Notional cells with the muted+overline treatment while every other cell in that row renders identically to a non-rejected row; the client's Net row for that model is unaffected by the presence of any `rejected` ledger row.

---

### FE-5 — Source new-subscription dropdowns from live data (Recommend)

- **Proposal ref:** § "Layer 3 — Frontend" C-1
- **Module:** 5.5
- **Files:** `modify: admin-frontend/components/rm/SubscriptionFormModal.tsx`, `modify: admin-frontend/app/(roles)/rm/model-subscription/page.tsx`
- **Dependencies:** FE-3 (needs `modelId`/`clientId` plumbing already in place); does not block FE-1..FE-4

**Contract:**
```ts
// components/rm/SubscriptionFormModal.tsx — new-subscription-mode dropdown sourcing
// Replace the direct SUB_CLIENTS / MODEL_SIZE_LIST imports (used only in
// `!locked` branches, i.e. new-subscription mode) with data threaded in as props:
export function SubscriptionFormModal({
  mode = "new-subscription",
  context = {},
  initialEmergent = false,
  onClose,
  onSuccess,
  availableClients = [],   // NEW — [{ id, name }], from useSubscriptions().clients, new-subscription mode only
  availableModels = [],    // NEW — [{ id, name, mgmtFee, incentiveFee }], from a models list endpoint
}: {
  // ...
  availableClients?: { id: string; name: string }[];
  availableModels?: { id: string; name: string; mgmtFee: string; incentiveFee: string }[];
}) { /* ... */ }
```

**Behavior / invariants:** this unit only changes the `new-subscription`-mode dropdown data source; `add-allotment`/`redemption` modes remain unaffected (their fields are already `locked` and read from `context`, per FE-3). Tagged **Recommend, not MANDATORY** per the proposal's C-1 — the mock dropdown remains functional (compiles, renders, submits with mock string ids) for the two modes that matter most operationally; this unit closes the last gap so `new-subscription` submissions carry real `client_id`/`model_id` values too.

**Done when:** the new-subscription dropdown lists render from `availableClients`/`availableModels` instead of `SUB_CLIENTS`/`MODEL_SIZE_LIST`, and selecting an entry populates `context.clientId`/`context.modelId` with a real id usable by FE-3's `handleSubmit`.

---

### FE-6 — PC/CO redemption decide server layer (MANDATORY) — Addendum 2026-07-23

- **Proposal ref:** § "Layer 3 — Frontend" E-1
- **Module:** 5.2 (server layer extension)
- **Files:** `modify: admin-frontend/server/endpoints.ts`, `modify: admin-frontend/server/onboarding/index.ts`, `modify: admin-frontend/app/(roles)/pc/allotment-redemption/actions.ts`, `modify: admin-frontend/app/(roles)/compliance/review/actions.ts`
- **Dependencies:** FE-1 (needs `RedemptionDecisionReq` type)

**Contract:**
```ts
// server/endpoints.ts — add to ENDPOINTS.PC and ENDPOINTS.COMPLIANCE
PC: {
  // ...existing...
  REDEMPTION_DECIDE: (id: string) => `${PC}/redemptions/${id}/decide`,
},
COMPLIANCE: {
  // ...existing...
  REDEMPTION_DECIDE: (id: string) => `${COMPLIANCE}/redemptions/${id}/decide`,
},
```
```ts
// server/onboarding/index.ts — add alongside existing PC functions
import type { RedemptionDecisionReq } from "@/lib/onboarding/types";

export async function pcDecideRedemption(
  id: string, body: RedemptionDecisionReq,
): Promise<APIResult<AllotRdmptDTO>> {
  return apiClient<AllotRdmptDTO>(ENDPOINTS.PC.REDEMPTION_DECIDE(id), {
    method: "POST", body: JSON.stringify(body),
  });
}

export async function coDecideRedemption(
  id: string, body: RedemptionDecisionReq,
): Promise<APIResult<AllotRdmptDTO>> {
  return apiClient<AllotRdmptDTO>(ENDPOINTS.COMPLIANCE.REDEMPTION_DECIDE(id), {
    method: "POST", body: JSON.stringify(body),
  });
}
```
```ts
// app/(roles)/pc/allotment-redemption/actions.ts — add action
import { pcDecideRedemption as _pcDecideRedemption } from "@/server/onboarding";
import type { RedemptionDecisionReq } from "@/lib/onboarding/types";

export async function pcDecideRedemption(id: string, body: RedemptionDecisionReq) {
  try {
    const r = await _pcDecideRedemption(id, body);
    logger.json("pc.decideRedemption", r.success ? { id: r.data.id, status: r.data.status } : r);
    return r;
  } catch (e) { return toErrorResult(e); }
}
```
```ts
// app/(roles)/compliance/review/actions.ts — add action
import { coDecideRedemption as _coDecideRedemption } from "@/server/onboarding";
import type { RedemptionDecisionReq } from "@/lib/onboarding/types";

export async function coDecideRedemption(id: string, body: RedemptionDecisionReq) {
  try {
    const r = await _coDecideRedemption(id, body);
    logger.json("co.decideRedemption", r.success ? { id: r.data.id, status: r.data.status } : r);
    return r;
  } catch (e) { return toErrorResult(e); }
}
```

**Behavior / invariants:** follows the exact pattern of `acknowledgeAllotment` (PC actions) and `approveOnboarding` (CO actions). Both functions POST a `RedemptionDecisionReq` (`{ verdict: "approve" | "reject", reason?: string }`) and return `APIResult<AllotRdmptDTO>`. The backend handles status routing (to `awaiting_co` for large amounts, directly to `approved` for small ones) — the frontend never sets the next status explicitly.

**Done when:** `pcDecideRedemption` and `coDecideRedemption` server actions are callable from client components, return `APIResult<AllotRdmptDTO>`, and type-check clean.

---

### FE-7 — Wire PC redemptions tab to live data (MANDATORY) — Addendum 2026-07-23

- **Proposal ref:** § "Layer 3 — Frontend" E-2
- **Module:** new — 5.6 PC Redemptions live-data wiring
- **Files:**
  - `modify: admin-frontend/lib/onboarding/types.ts` — widen `AllotRdmptDTO` (optional fields), add `RedemptionView`
  - `modify: admin-frontend/lib/onboarding/mappers.ts` — add `mapRedemptionsToView`
  - `modify: admin-frontend/hooks/api/useAllotments.ts` — expose `redemptions` + `decideRedemption`
  - `modify: admin-frontend/app/(roles)/pc/allotment-redemption/page.tsx` — replace mock redemptions state with hook data
  - `modify: admin-frontend/components/pc/allotment-redemption/RedeemTable.tsx` — replace mock imports with `RedemptionView` + `AllotRdmpStatus`
  - `modify: admin-frontend/components/pc/allotment-redemption/RedeemDetailPanel.tsx` — replace mock imports, wire real decide
  - `modify: admin-frontend/components/pc/allotment-redemption/StatStrip.tsx` — replace mock imports with `RedemptionView`
- **Dependencies:** FE-6 (needs `pcDecideRedemption` action), FE-1 (needs widened `AllotRdmpStatus`)

**Contract — widen `AllotRdmptDTO` with optional fields:**
```ts
// lib/onboarding/types.ts
export interface AllotRdmptDTO {
  // ...existing fields (id, reference, model_id, model_name, units, amount,
  //   kind, status, note, agg_before, agg_after, expected_cash_in, rm,
  //   created_at, acknowledged_at)...
  emergent?: boolean;                   // NEW optional — DB column exists, backend mapper not yet serializing
  expected_cash_out?: string | null;    // NEW optional — same
}
```

**Contract — add `RedemptionView` type:**
```ts
// lib/onboarding/types.ts
export interface RedemptionView {
  id: string;
  ref: string;           // dto.reference
  modelName: string;     // dto.model_name
  mult: number;          // dto.units
  amount: number;        // dto.amount (backend-computed = units × model_size)
  status: AllotRdmpStatus;
  rm: string;
  date: string;          // dto.created_at
  emergent?: boolean;    // dto.emergent (undefined until backend DTO widened)
}
```

**Contract — add mapper:**
```ts
// lib/onboarding/mappers.ts
export function mapRedemptionsToView(dtos: AllotRdmptDTO[]): RedemptionView[] {
  return dtos
    .filter((d) => d.kind === "redemption")
    .map((d) => ({
      id: d.id, ref: d.reference, modelName: d.model_name,
      mult: d.units, amount: d.amount, status: d.status,
      rm: d.rm, date: d.created_at, emergent: d.emergent,
    }));
}
```

**Contract — widen `useAllotments` hook:**
```ts
// hooks/api/useAllotments.ts
import { mapRedemptionsToView } from "@/lib/onboarding/mappers";
import { pcDecideRedemption } from "@/app/(roles)/pc/allotment-redemption/actions";
import type { RedemptionView, RedemptionDecisionReq } from "@/lib/onboarding/types";

export interface UseAllotmentsResult {
  data: AllotmentView[] | null;
  redemptions: RedemptionView[] | null;   // NEW — filtered from same GET /pc/allotments data
  loading: boolean;
  error: string | null;
  refetch: () => void;
  acknowledge: (id: string) => Promise<{ success: boolean; error?: string }>;
  decideRedemption: (id: string, body: RedemptionDecisionReq) =>  // NEW
    Promise<{ success: boolean; error?: string }>;
}
// Inside the hook: store raw DTOs alongside the mapped allotments view.
// redemptions = mapRedemptionsToView(rawDtos). decideRedemption calls
// pcDecideRedemption then refetches on success (same pattern as acknowledge).
```

**Contract — PC page wiring:**
```tsx
// app/(roles)/pc/allotment-redemption/page.tsx
// REMOVE: useState<Redemption[]>(AR_REDEMPTIONS_SEED), local decide()
// REMOVE: imports from @/lib/pc/allotment-redemption-mock
// ADD: use redemptions + decideRedemption from useAllotments()
const { data: allotmentsData, redemptions: redemptionsData, acknowledge, decideRedemption } = useAllotments();
const redemptions = redemptionsData ?? [];
// Pass decideRedemption to RedeemDetailPanel as onDecision
```

**Contract — `RedeemTable` component:**
```tsx
// components/pc/allotment-redemption/RedeemTable.tsx
// REMOVE: all imports from @/lib/pc/allotment-redemption-mock
// REPLACE: Redemption type with RedemptionView
// REPLACE: arModelById(r.mid) lookups with direct r.modelName access
// REPLACE: arRedeemAmt(r) with r.amount
// REPLACE: arNeedsCompliance(r) with r.amount > 300000
// REPLACE: RedeemStatusChip to map AllotRdmpStatus values:
//   "awaiting_pc" → Chip tone="pending", "Awaiting approval"
//   "awaiting_co" → Chip tone="review", "Compliance review"
//   "approved" → Chip tone="active", "Approved"
//   "rejected" → Chip tone="failed", "Rejected"
//   default → Chip tone="neutral"
// r.ref → r.ref (same), r.mult → r.mult (same), r.emergent → r.emergent
// r.rm → r.rm (same), r.status → r.status (AllotRdmpStatus now)
import { fmtMoney } from "@/lib/pc/format";
import type { RedemptionView } from "@/lib/onboarding/types";
```

**Contract — `RedeemDetailPanel` component:**
```tsx
// components/pc/allotment-redemption/RedeemDetailPanel.tsx
// REMOVE: all imports from @/lib/pc/allotment-redemption-mock
// REPLACE: Redemption with RedemptionView, RedeemStatus with AllotRdmpStatus
// REPLACE: arModelById(r.mid) → r.modelName, arRedeemAmt(r) → r.amount
// REPLACE: arNeedsCompliance(r) → r.amount > 300000
// REPLACE: onDecision callback signature:
//   OLD: (id: string, status: RedeemStatus) => void  (local state mutation)
//   NEW: (id: string, verdict: "approve" | "reject") => void  (calls pcDecideRedemption)
// Status checks:
//   r.status === "pending_pc" → r.status === "awaiting_pc"
//   r.status === "approved" → same
//   r.status === "rejected" → same
//   r.status === "pending_compliance" → r.status === "awaiting_co"
// Approve button: onDecision(r.id, "approve") — backend routes to CO if needed
// Reject button: onDecision(r.id, "reject")
// Date display: r.date → fmtTimestamp(r.date) for consistent formatting
```

**Contract — `StatStrip` component:**
```tsx
// components/pc/allotment-redemption/StatStrip.tsx
// REMOVE: imports from @/lib/pc/allotment-redemption-mock (Redemption, arNeedsCompliance, arRedeemAmt)
// REPLACE: Redemption with RedemptionView
// REPLACE: r.status === "pending_pc" → r.status === "awaiting_pc"
// REPLACE: arNeedsCompliance filter → r.amount > 300000
// REPLACE: arRedeemAmt(r) → r.amount
import type { RedemptionView } from "@/lib/onboarding/types";
```

**Behavior / invariants:**
- The `GET /pc/allotments` endpoint already returns both allotments and redemptions. No new read endpoint needed — just filter `kind === "redemption"` from the same response.
- `RedemptionView` is structurally simpler than the mock `Redemption` — no model lookup indirection, amount is pre-computed by the backend, status uses the real `AllotRdmpStatus` union.
- `emergent` is optional on both `AllotRdmptDTO` and `RedemptionView`. When the backend DTO mapper is widened later, emergent highlighting activates automatically with no frontend change.
- The `COMPLIANCE_THRESHOLD` (300000) constant stays hardcoded for the compliance-shield display — same as the mock. This is a display hint, not a business rule (the backend enforces the threshold in `submit_redemption`).
- `pcDecideRedemption` replaces local state mutation. On success, the hook refetches the full dataset so all rows update.
- CO redemptions tab is NOT wired by this unit — blocked on missing `GET /co/redemptions` backend endpoint.

**Done when:** PC Redemptions tab renders live data from `GET /pc/allotments` (filtered to `kind === "redemption"`); approve/reject buttons call `POST /pc/redemptions/{id}/decide` via the real server action; stat strip computes from live data; no imports from `@/lib/pc/allotment-redemption-mock` remain in the modified files.

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal § 4)

```python
# --- Enums (DB layer, consumed by all) ---

class AllotRdmpStatus(str, Enum):
    PENDING      = "pending"       # existing
    ACKNOWLEDGED = "acknowledged"  # existing
    # NEW:
    AWAITING_PC  = "awaiting_pc"   # redemption submitted, needs PC approval
    AWAITING_CO  = "awaiting_co"   # redemption submitted, needs Compliance approval (amount > $300k)
    APPROVED     = "approved"      # redemption fully approved, took effect
    REJECTED     = "rejected"      # redemption rejected by PC or CO

# --- Request DTOs (Frontend → Backend) ---

class SubmitAllotmentReq(BaseModel):
    client_id: uuid.UUID
    model_id: uuid.UUID
    multiplier: Decimal            # number of units
    expected_cash_in: date | None  # settlement date (nullable)
    # fee overrides — only populated for new-subscription mode
    mgmt_fee: Decimal | None = None
    incentive_fee: Decimal | None = None

class SubmitRedemptionReq(BaseModel):
    client_id: uuid.UUID
    model_id: uuid.UUID
    multiplier: Decimal            # units to redeem
    expected_cash_out: date | None # settlement date
    emergent: bool = False         # emergent big redemption flag

# --- Response DTOs (Backend → Frontend) ---
# Reuses existing AllotRdmptDTO (onboarding/schemas.py) — no new shape needed.
# The `status` field now includes the new enum values above.

# --- Approval request DTO ---
class RedemptionDecisionReq(BaseModel):
    verdict: Literal["approve", "reject"]
    reason: str | None = None      # required when verdict == "reject"

# --- Routes ---
# POST /api/onboarding/rm/allotment          → AllotRdmptDTO   (201)
# POST /api/onboarding/rm/redemption         → AllotRdmptDTO   (201)
# POST /api/onboarding/pc/redemptions/{id}/decide   → AllotRdmptDTO   (200)
# POST /api/onboarding/co/redemptions/{id}/decide   → AllotRdmptDTO   (200)
#
# Error codes: 404 (not found), 409 (wrong status), 422 (validation)
```

| Layer | What this layer contributes | What this layer assumes from the other side |
|---|---|---|
| Database | Widens `AllotRdmpStatus` enum with 4 new values; adds `reject_reason`, `decided_by`, `decided_at` columns to `client_allotment_redemptions`; adds `emergent` boolean column | Backend only writes valid enum values |
| Backend | Serves the 4 routes above; allotment immediately upserts `client_subscriptions` + inserts `client_allotment_redemptions` (status=`pending`); redemption inserts with status=`awaiting_pc` (or `awaiting_co` if amount > $300k); approval endpoints transition status and (on final approve) upsert `client_subscriptions` | DB columns from §4.1 are present; Frontend sends DTOs exactly as specified |
| Frontend | Calls POST endpoints on modal submit; renders new statuses in TxnTable with appropriate chips; disables modal submit while in-flight | Backend returns AllotRdmptDTO exactly as in §4.1 with the new status values |

- Any edit to §4 requires a new proposal revision or an explicit addendum in that file, dated and initialled.
- Every impl doc's §7 is then updated in the same change set — the seam never lives in only one place.

### 7.2 How this layer honours the seam
- **What this layer contributes to the seam:** issues `POST` requests carrying exactly `SubmitAllotmentReq`/`SubmitRedemptionReq` (FE-1/FE-2), and renders every value of the widened `status` field with a distinct chip tone/label (FE-4). Disables the Submit button while a request is in flight (FE-3).
- **What this layer assumes from the other side:** the Backend layer serves `POST /api/rm/allotment` and `POST /api/rm/redemption` returning `AllotRdmptDTO` (201) with `status` drawn from the full 6-value enum, and returns 422 on validation failure with a body this layer surfaces via `result.error` (no structured field-level parsing assumed — `apiClient`'s failure branch treats the body as an opaque string per its existing `HTTP_${res.status}` convention). This layer does **not** assume the PC/CO decide routes exist, since it never calls them.
- **Change protocol:** any edit to §7 requires editing the proposal first; this section is then re-copied. Never edit §7 in isolation.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Framework / runner:** Vitest (`vitest ^4.1.10`, confirmed in `admin-frontend/package.json` devDependencies) — command: `npx vitest run`. Component-level assertions use `@testing-library/react ^16.3.2` + `@testing-library/jest-dom ^6.9.1` (both already present as devDependencies).
- **Fixtures / seed:** no DB/network — server actions and `apiClient` calls are mocked with `vi.mock`/`vi.fn`; fake `AllotRdmptDTO` objects are hand-built per test (see §8.3 "Seam mocks").
- **Isolation:** hermetic, no shared state; safe to run in parallel.
- **Layer isolation (critical):** tests import only this layer's own code (`components/rm/*`, `lib/rm/*`, `lib/onboarding/types.ts`, `hooks/api/useSubscriptions.ts`) plus test doubles. The Backend's 4 routes are never really called — every test that would hit them mocks `@/app/(roles)/rm/model-subscription/actions` (`submitAllotment`/`submitRedemption`) directly with `vi.mock`, returning a fake `APIResult<AllotRdmptDTO>` shaped per §7.
- **Test location:** `admin-frontend/tests/`, mirroring source path (e.g. `admin-frontend/tests/components/rm/SubscriptionFormModal.test.tsx`).
- **Commit policy:** tests are **never committed** — `tests/` is git-ignored; generated and run locally/CI only.
- **Code generation:** concrete test code is written by the `test-gen` skill from the goals in §8.2/§8.3, not embedded here.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| FE-1 | Widened `AllotRdmpStatus` compiles against every existing consumer (`AllotmentView.status`, `mapSubscriptionsToSubClients`, `statusToChip`) without a cast | none — type-level only |
| FE-2 | `submitAllotment`/`submitRedemption` server actions call the correct path with the correct JSON body; a thrown error is funneled through `toErrorResult` | `apiClient` mocked to return both a success and a thrown-error case |
| FE-3 | Modal submit (all 3 modes) calls the right server action with the right payload; failed submit shows error + stays open; successful submit calls `onSuccess` then `onClose`; buttons disabled while submitting | `submitAllotment`/`submitRedemption` server actions mocked per mode |
| FE-4 | `statusToChip` returns the correct `{tone,label}` for all 6 `AllotRdmpStatus` values; `TxnTable` renders that tone/label for a row carrying each status; Net row never renders a chip; rejected rows render muted+overline on amount/multiplier cells only, and never affect the Net row | fake `AllotRdmptDTO` per status value (see below) |
| FE-5 | New-subscription dropdowns render from `availableClients`/`availableModels` props, not the mock fixture; selecting an option populates `context.clientId`/`context.modelId` | none — pure prop-driven rendering |

### 8.3 Test goals (per unit)

#### FE-1
- **Positive:** a value of each of the 6 `AllotRdmpStatus` literals is assignable wherever the type is consumed (e.g. as an argument to `statusToChip`, as `AllotmentView.status`) with no `as any`/cast.
- **Negative:** an arbitrary string not in the union is a compile-time error (asserted via a `// @ts-expect-error` line in the test, not a runtime check).
- **Invariants:** the 2 pre-existing literals (`"pending"`, `"acknowledged"`) are unchanged — a snapshot/string-literal check that they still exist verbatim.
- **Seam mocks:** none — pure type-level test.

#### FE-2
- **Positive:** calling `submitAllotment({...})` results in exactly one call to the mocked `apiClient` (or `server/rm.submitAllotment`, depending on mock depth) with method `"POST"`, path `ENDPOINTS.RM.SUBMIT_ALLOTMENT`, and a JSON body matching the input object field-for-field. Same for `submitRedemption` against `SUBMIT_REDEMPTION`.
- **Negative:** when the mocked `apiClient` throws, the action returns `{ success: false, code: "ACTION_ERROR", error: <message> }` — never throws out of the action.
- **Invariants:** the action never mutates its input `req` object.
- **Seam mocks:** `apiClient<AllotRdmptDTO>` mocked to resolve `{ success: true, data: <fake AllotRdmptDTO> }` for the positive case; the fake DTO shape: `{ id: "a1", reference: "REF-1", model_id: "m1", model_name: "Model A", units: 2, amount: 200000, kind: "allotment", status: "pending", note: null, agg_before: 0, agg_after: 2, expected_cash_in: "2026-08-01", rm: "Jane", created_at: "2026-07-22T00:00:00Z", acknowledged_at: null }`.

#### FE-3
- **Positive:** for `add-allotment` mode, `handleSubmit` calls `submitAllotment` with `{ client_id, model_id, multiplier, expected_cash_in, mgmt_fee: null, incentive_fee: null }`. For `redemption` mode (non-emergent), calls `submitRedemption` with `{ client_id, model_id, multiplier, expected_cash_out, emergent: false }`. For emergent redemption, `multiplier` in the request is not read from the (disabled) input — the component sends `multiplier: 0` and relies on the Backend's "if emergent, multiplier = full current subscription multiplier" rule (per proposal Layer 2 §C.2) — assert the request has `emergent: true` and the UI never fabricates a multiplier value for that case. On success, `onSuccess` fires exactly once, then `onClose` fires exactly once.
- **Negative:** when the mocked server action resolves `{ success: false, error: "409 wrong status", code: "HTTP_409" }`, the modal stays mounted (`onClose` not called), an error message containing the returned `error` string is visible, and `onSuccess` is not called.
- **Invariants:** while `submitting` is true, both footer buttons render `disabled`; double-clicking Submit before the promise resolves results in exactly one call to the server action (guarded by the `submitting` state, not by disabling the DOM node alone — assert call count, not just the `disabled` attribute).
- **Seam mocks:** `@/app/(roles)/rm/model-subscription/actions` mocked via `vi.mock`, `submitAllotment`/`submitRedemption` as `vi.fn()` resolving the fake `AllotRdmptDTO` from FE-2's mock (success case) or an `APIResult` failure literal (negative case).

#### FE-4
- **Positive:** `statusToChip("pending")` and `statusToChip("acknowledged")` both return `{ tone: "active", label: "Confirmed" }`; `statusToChip("awaiting_pc")` and `statusToChip("awaiting_co")` both return `{ tone: "pending", label: "Awaiting Approval" }`; `statusToChip("approved")` returns `{ tone: "active", label: "Approved" }`; `statusToChip("rejected")` returns `{ tone: "overdue", label: "Rejected" }`. Rendering `TxnTable` with a row whose 10th element is each of these 6 values shows the corresponding chip text. A `TxnRow` with `r[9] === "rejected"` renders its Cash Amt/Model ×/Notional cells with the muted+overline class applied; the same row's Type/Date/IB Account/Ccy/Expected Cash In-Out cells render with the plain (non-muted) className, identical to a `pending`/`approved` row.
- **Negative:** not applicable to `statusToChip` itself (the union is exhaustive; there is no "wrong" input at the type level — see FE-1's negative case for the compile-time guard). For the muted+overline treatment: a row with any status other than `rejected` never receives the muted+overline class on any cell, even if its numeric values happen to match a rejected row's.
- **Invariants:** the Net row (`r[0] === "Net"`) never renders a `Chip`, regardless of its 10th element's value. Rendering a `SubClient` whose model ledger includes one or more `rejected` rows produces a Net row (`amount`/`units`) byte-for-byte identical to rendering the same client with those `rejected` rows removed from the ledger entirely — i.e. presence of rejected rows has zero effect on the Net computation (cross-checks Backend's guarantee that reject never writes `client_subscriptions`, per D-5).
- **Seam mocks:** one fake `AllotRdmptDTO` per status value, reusing FE-2's fake shape with `status` swapped — fed through `allotmentToTxnRow` to produce the `TxnRow`, then rendered by `TxnTable`. Same fixtures for the rejected-row muted+overline test, with one instance carrying `status: "rejected"`.

#### FE-5
- **Positive:** given `availableClients = [{id:"c1",name:"Acme"}]` and `availableModels = [{id:"m1",name:"Model A",mgmtFee:"1.0%",incentiveFee:"10%"}]`, the new-subscription client/model `<select>` elements list exactly those options (not `SUB_CLIENTS`/`MODEL_SIZE_LIST`); selecting "Acme" then "Model A" results in the component's internal state (and, on submit, the outgoing request) carrying `client_id: "c1"`, `model_id: "m1"`.
- **Negative:** with empty `availableClients`/`availableModels` arrays (loading state not yet resolved), the selects render with no options beyond the disabled placeholder — no crash, no fallback to the mock fixture.
- **Invariants:** `add-allotment`/`redemption` mode rendering is byte-for-byte unaffected by this unit (asserted via a snapshot of the locked-field `<div>`s).
- **Seam mocks:** none.

### 8.4 Aggregate gate
- All unit tests green is a local gate run before commit/PR hand-off; the `tests/` dir is git-ignored, never committed.
- Target coverage for changed lines: ≥ 90% of new/changed statements in this layer (FE-1..FE-5).
- Chosen `test-gen` level for this layer: `standard` (happy path + main negative + role/permission per goal) — this is a UI-write-path layer with real user-facing error states, but not the highest-risk layer (no money movement happens client-side; the Backend enforces amounts/thresholds).

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] Every §6 unit (FE-1..FE-7) committed on `allotment-redemption-integration-fe` (or parent branch for addendum units); each commit left the branch green.
- [ ] §8 unit tests all pass; CI gate (§3.2: `npx vitest run && npx tsc --noEmit && npx next lint`) green.
- [ ] §7 matches the proposal's frozen seam verbatim. Checked against the proposal on the parent branch, not against the DB/Backend layers' branches.
- [ ] PR opened; human owns the merge to `allotment-redemption-integration`.

**Rollback:** this layer has no persisted frontend state to roll back — server actions are stateless per-request, and no client-side cache survives a page reload beyond the in-memory `useSubscriptions` state. Reverting the branch (or the merged commits) cleanly removes the modal wiring, the new endpoints/types, and the chip mapping with no data-loss risk — nothing here writes to a database or external system. If this layer merges before the Backend layer, `submitAllotment`/`submitRedemption` calls simply 404 or return a network-style error at runtime (surfaced via `submitError` in the modal, per FE-3's negative-path behavior) — non-functional until Backend lands, but not a data-loss or corruption risk, and every other page function (read path, accordion browsing) is unaffected.
