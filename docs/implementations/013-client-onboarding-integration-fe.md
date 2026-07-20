# 013 — Client Onboarding Integration · Implementation Details — Frontend

> Status: **DRAFT — pending implementation.**
> Implements: `docs/proposals/013-2026-07-19-client-onboarding-integration.md` § Layer 3 — Frontend, § 4 (Cross-layer seam)
> Layer: Frontend — **one layer per file.**
> Sibling layer docs: `docs/implementations/013-client-onboarding-integration-db.md`, `docs/implementations/013-client-onboarding-integration-be.md` (not yet written at the time of this doc — this layer builds against § 7 only, never against sibling code)
> Execution schedule: `docs/execution-schedules/013-client-onboarding-integration-fe.md`
> Branch: `client-onboarding-integration-fe` — cut from `client-onboarding-integration`. Merges back into the parent; the human owns that merge.
> Builds on / prerequisites: the 14 routes in proposal § Layer 2-D reachable on the target API base URL (Backend layer, contract only — not the sibling branch itself); admin-frontend's existing cookie-based `apiClient`/`apiClientFormData` (`server/api-client.ts`) and client-frontend's existing `useAuth().getIdToken()` Bearer-token flow (`components/auth/AuthProvider.tsx`) — both unchanged.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/013-2026-07-19-client-onboarding-integration.md` § Layer 3 — Frontend, § 4 (Cross-layer seam), § Design decisions |
| Execution schedule | `docs/execution-schedules/013-client-onboarding-integration-fe.md` |
| Sibling layer impl docs | `docs/implementations/013-client-onboarding-integration-db.md`, `docs/implementations/013-client-onboarding-integration-be.md` |
| Builds on | Backend layer's 14 role-prefixed routes (proposal § Layer 2-D) — contract only, per § 7 |

**Two apps, two conventions — both followed as-is, not unified.** `admin-frontend` already has an established `page.tsx → hook → "use server" action → server/<domain> → server/api-client` layering (see `docs/implementations/012-trade-recon-integration-fe.md` § 1, mirrored here for RM/Compliance/PC) because its auth token rides a cookie only a server context can read. `client-frontend` has no such layering — `lib/auth-api.ts` calls `fetch` directly from client code, with the Firebase ID token pulled via `useAuth().getIdToken()` (see `components/auth/AuthProvider.tsx`) and attached as a Bearer header. This doc's client-frontend units (FE-6/7/8) follow that existing plain-fetch convention; inventing a server-action layer for client-frontend would be new architecture this proposal doesn't call for.

**Known seam gaps (surfaced here, not silently patched over) — updated 2026-07-20 for the D-9 widening.** The 2026-07-20 seam-widening pass (proposal D-9) closed most of the admin-portal gaps this section used to name: `OnboardingDTO` now carries `primary_phone`/`address`/`country_of_residence`/`id_type`/`id_number`/`ibhk_account`/`sw_account`/`client_ref`/`mgmt_fee`/`incentive_fee`, and `AllotRdmptDTO` now carries `agg_before`/`agg_after`/`expected_cash_in` — all read directly by the RM/Compliance/PC mappers below, no `"—"` fallback and no client-side computation. Two gaps remain, both scoped to client-frontend and both deliberate rather than deferred (D-9's scope note):
- `SubscriptionDTO` carries only `model_id`/`model_name`/`units`/`ib_account` — the Portfolio table's `symbol`/`country`/`sector`/`amount`/`modelLimit` columns have no source in this proposal's scope. Per D-9 / proposal Layer 3 A-4, that mock shape describes a stale, prototype-era model-catalog schema the real `Model` table doesn't carry (no country/sector concept; symbols are a weighted one-to-many relationship) — backfilling the real schema to match a stale mock would contaminate it, so these columns degrade to `"—"` by design, not by omission. This is the one place in this layer that still renders `"—"`.
- `ClientEventDTO` carries no icon/level/action-label metadata — the Event page's card chrome for an onboarding-sourced event uses a fixed default (icon `"shield"`, level `"info"`, primary `"Acknowledge"` / secondary `"Mark as Read"`), a Frontend-owned static `category -> styling` lookup, not per-event styling. Kept exactly as before — it needs zero new backend storage, unlike Portfolio's gap.

---

## 2. Branch & session contract

- **Branch:** `client-onboarding-integration-fe`, cut from `client-onboarding-integration`.
- **Isolation:** fully independent of the DB/BE layer branches; this layer builds against the wire contract (§ 7) and can be developed against a mocked `apiClient`/`fetch` response before the Backend branch merges.
- **Preconditions:**
  - [ ] The frozen seam (§ 7) is agreed and matches the proposal § 4 verbatim.
  - [ ] admin-frontend's `NEXT_PUBLIC_API_BASE_URL` / `id_token` cookie flow already works for other admin screens (confirmed via the working PC Model Management / MOBO screens) — no new auth plumbing needed.
  - [ ] client-frontend's `useAuth().getIdToken()` Bearer flow already works for other client screens (confirmed via `postBackendLogin`) — no new auth plumbing needed.
- **Read-first inventory:**
  - `admin-frontend/app/(roles)/rm/onboarding-renewal/page.tsx`, `admin-frontend/components/rm/OnboardingBoard.tsx`, `admin-frontend/components/rm/OnboardingModal.tsx` — RM kanban + Start Onboarding modal; rewritten in FE-3.
  - `admin-frontend/lib/mock/rm-data.ts` — `KYC_COLS`, `KYC_DOCS`, `VERIFIED_COUNT`, `TONE_FOR`, `KycClient`, `KycColumn` deleted in FE-3 (`RM_CLIENTS`, `CLIENT_EXTRA`, `SUB_CLIENTS`, `TICKET_QUEUE`, the Client Book overlay — all out of scope — are untouched).
  - `admin-frontend/app/(roles)/compliance/review/page.tsx`, `admin-frontend/components/compliance/review/ObDetailPanel.tsx`, `admin-frontend/components/compliance/review/RejectModal.tsx`, `admin-frontend/components/compliance/review/OnboardingTable.tsx` — Compliance review; rewritten in FE-4 (the Redemptions tab / `CR_REDEMPTIONS` / `Redemption` type are a separate, out-of-scope flow and are untouched).
  - `admin-frontend/lib/compliance/mock.ts` — `CO_ONBOARDING`, `Onboarding`, `ObStatus`, `DocVerdict`, `DOC_NAMES` deleted in FE-4 (`CR_REDEMPTIONS`, `Redemption`, `CrStatus`, `COMPLIANCE_THRESHOLD`, the redemption helpers stay).
  - `admin-frontend/app/(roles)/pc/allotment-redemption/page.tsx`, `admin-frontend/components/pc/allotment-redemption/AllotDetailPanel.tsx`, `admin-frontend/components/pc/allotment-redemption/AllotTable.tsx` — PC allotments tab; rewritten in FE-5 (the Redemptions tab is untouched).
  - `admin-frontend/lib/pc/allotment-redemption-mock.ts` — `AR_ALLOTMENTS_SEED`, `Allotment`, `AllotStatus`, `arAllotAmt` deleted in FE-5 (`AR_REDEMPTIONS_SEED`, `Redemption`, `ALLOC_MODELS`, `arModelById` stay — read by the still-mock Redemptions tab).
  - `admin-frontend/server/api-client.ts` — `apiClient`, `apiClientFormData`, `APIResult<T>` (reused verbatim, no changes).
  - `admin-frontend/server/endpoints.ts` — `ENDPOINTS` (extended with `RM.ONBOARDINGS*` / `COMPLIANCE.*` / `PC.ALLOTMENTS*`, not restructured).
  - `admin-frontend/server/pc/index.ts`, `admin-frontend/app/(roles)/pc/model-management/actions.ts`, `admin-frontend/hooks/api/useModels.ts` — the sibling-feature reference implementation this layer mirrors unit-for-unit (including the `downloadMaterial` base64-proxy pattern for FE-1's document download).
  - `client-frontend/lib/auth-api.ts`, `client-frontend/components/auth/AuthProvider.tsx` — the plain-`fetch` + Bearer-token convention FE-6 mirrors.
  - `client-frontend/app/(dashboard)/portfolio/page.tsx`, `client-frontend/app/(dashboard)/events/page.tsx`, `client-frontend/lib/mock/data.ts`, `client-frontend/lib/hooks/useAllotmentRequests.ts`, `client-frontend/lib/hooks/useEventItems.ts` — client pages + the existing `useEffect`+`useState` hook shape FE-7/FE-8 mirror.
- **Hand-off / exit signal:** all FE-* units committed, `admin-frontend` and `client-frontend` both build (`next build`) and pass their gates (§ 3.2), both pages render against a live seeded Backend endpoint, `git grep KYC_COLS`, `git grep CO_ONBOARDING`, `git grep AR_ALLOTMENTS_SEED`, and `git grep MOCK_SUBSCRIBED_MODELS` all return zero hits, PR opened.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- **admin-frontend data-access layering:** `page.tsx (client) → hooks/api/use<Feature>.ts (client hook) → app/(roles)/<role>/<feature>/actions.ts ("use server") → server/onboarding/index.ts (server-only fetch) → server/api-client.ts (apiClient<T> / apiClientFormData<T>)`. Established by the MOBO/PC screens; not invented here.
- **client-frontend data-access:** plain async functions in `lib/api/onboarding.ts` calling `fetch(getApiBase() + path, { headers: { Authorization: \`Bearer ${token}\` } })`, token supplied by the caller (`useAuth().getIdToken()`) — mirrors `lib/auth-api.ts`. No server-action layer (nothing here needs the httpOnly cookie admin-frontend relies on).
- **Mappers** (`lib/onboarding/*.ts` in both apps) are the DTO→view boundary: pure functions, no fetch logic, called by hooks — never by page components directly.
- **No design/layout changes** — every page's JSX structure, class names, and component tree are out of scope; only the data-sourcing lines change, per the proposal's Constraint.
- **Precision:** all money/unit fields (`units`, `amount`, fee fractions) arrive from the backend as JSON numbers already coerced from `Decimal`/`Numeric` — this layer does no financial rounding of its own; it only formats for display (`fmtMoney`, `toLocaleString`, etc., reused from existing `lib/pc/format.ts` where applicable).

### 3.2 CI/CD & engineering discipline
- **Trunk-friendly, small units.** Each FE-* unit is a self-contained, revertible commit.
- **Every unit is independently revertible**, except: FE-3 depends on FE-1/FE-2/FE-9; FE-4 depends on FE-1/FE-2; FE-5 depends on FE-1/FE-2; FE-7 depends on FE-6; FE-8 depends on FE-6.
- **Additive & backward-compatible first.** FE-1/FE-2/FE-6 land as new files alongside the still-working mocks; the page cutovers (FE-3/FE-4/FE-5/FE-7/FE-8) and mock deletions land last, so both branches stay deployable at every commit.
- **Gates before merge** (`vitest.config.ts` present in both apps per [[docgen_toolchain_setup]]):
  ```bash
  # admin-frontend
  cd admin-frontend && npx vitest run && npx tsc --noEmit && npx next lint

  # client-frontend
  cd client-frontend && npx vitest run && npx tsc --noEmit && npx next lint
  ```
- **No secrets, no manual steps in the merge path.** Confirming the live Backend endpoint has served ≥1 real onboarding cycle before cutover is a human gate (proposal's Execution & verification § 3), not baked into a commit.
- **Reversibility documented:** see § 9.

---

## 4. Architecture

**Target layout:**
```
admin-frontend/server/endpoints.ts                                   # FE-1 — + RM.ONBOARDINGS*, COMPLIANCE.*, PC.ALLOTMENTS* (modified)
admin-frontend/server/onboarding/index.ts                             # FE-1 — NEW, server-only fetch functions for RM + Compliance + PC
admin-frontend/app/(roles)/rm/onboarding-renewal/actions.ts                # FE-2 — NEW, "use server" boundary (RM)
admin-frontend/app/(roles)/compliance/review/actions.ts                    # FE-2 — NEW, "use server" boundary (Compliance)
admin-frontend/app/(roles)/pc/allotment-redemption/actions.ts               # FE-2 — NEW, "use server" boundary (PC)
admin-frontend/hooks/api/useOnboardingBoard.ts                        # FE-3 — NEW
admin-frontend/hooks/api/useComplianceQueue.ts                        # FE-4 — NEW
admin-frontend/hooks/api/useAllotments.ts                             # FE-5 — NEW
admin-frontend/lib/onboarding/types.ts                                # FE-1 — NEW, DTOs (§7 verbatim) + view types
admin-frontend/lib/onboarding/mappers.ts                              # FE-3/4/5 — NEW, DTO→view mappers + status maps + fee-string parser
admin-frontend/components/rm/OnboardingBoard.tsx                      # FE-3 — modified (data-sourcing only)
admin-frontend/components/rm/OnboardingModal.tsx                      # FE-3, FE-9 — modified (submit wiring + fee parse)
admin-frontend/components/compliance/review/*.tsx                     # FE-4 — modified (data-sourcing only)
admin-frontend/components/pc/allotment-redemption/*.tsx                # FE-5 — modified (data-sourcing only)
admin-frontend/lib/mock/rm-data.ts                                     # FE-3 — KYC_COLS/KYC_DOCS/VERIFIED_COUNT/TONE_FOR/KycClient/KycColumn DELETED
admin-frontend/lib/compliance/mock.ts                                  # FE-4 — CO_ONBOARDING/Onboarding/ObStatus/DocVerdict/DOC_NAMES DELETED
admin-frontend/lib/pc/allotment-redemption-mock.ts                     # FE-5 — AR_ALLOTMENTS_SEED/Allotment/AllotStatus/arAllotAmt DELETED

client-frontend/lib/api/onboarding.ts                                  # FE-6 — NEW, fetchSubscriptions / fetchEvents
client-frontend/lib/hooks/useSubscriptions.ts                          # FE-7 — NEW
client-frontend/lib/hooks/useOnboardingEvents.ts                       # FE-8 — NEW
client-frontend/app/(dashboard)/portfolio/page.tsx                     # FE-7 — modified (data-sourcing only)
client-frontend/app/(dashboard)/events/page.tsx                        # FE-8 — modified (merge with remaining mock)
client-frontend/lib/mock/data.ts                                       # FE-7 — MOCK_SUBSCRIBED_MODELS + SubscribedModel DELETED (MOCK_EVENT_ITEMS, EventEntry stay — non-onboarding categories remain mock per proposal Non-Goal)
```

**Dependency direction (admin-frontend):** `page.tsx → hooks/api/use*.ts → app/(roles)/<role>/<feature>/actions.ts → server/onboarding/index.ts → server/api-client.ts`. Mappers (`lib/onboarding/mappers.ts`) are called by the hooks, not by pages directly — mirrors `usePostTradeAllocation`'s call to `mapDtoToPostTradeAllocation` (see `docs/implementations/012-trade-recon-integration-fe.md` § 4).

**Dependency direction (client-frontend):** `page.tsx → lib/hooks/use*.ts → lib/api/onboarding.ts → fetch`. No server-action indirection — matches the existing `lib/auth-api.ts` shape.

**External seams:** consumes the 14 routes from proposal § Layer 2-D per § 7. No new component props cross into any page's child components beyond what each unit states below — every component keeps its existing JSX/layout.

---

## 5. Modules

### 5.1 `lib/onboarding/types.ts` (admin-frontend)
- **Responsibility:** the DTOs from § 7.1, verbatim, plus the admin-side view types each page's existing components already expect.
- **Files:** `admin-frontend/lib/onboarding/types.ts` (new).
- **Public surface:** all DTO interfaces/enums from § 7.1; `KycBoardColumn`, `KycBoardClient` (RM); `AdminOnboardingRow` (Compliance); `AllotmentView` (PC).
- **Owns features:** FE-1 (types half).

### 5.2 `server/onboarding` (new) + `server/endpoints.ts` (extended)
- **Responsibility:** the one place a Next.js server context reaches the 14 onboarding routes.
- **Files:** `admin-frontend/server/endpoints.ts`, `admin-frontend/server/onboarding/index.ts` (new).
- **Public surface:** `ENDPOINTS.RM.ONBOARDINGS*`, `ENDPOINTS.COMPLIANCE.*`, `ENDPOINTS.PC.ALLOTMENTS*`; `fetchBoard`, `startOnboarding`, `uploadDocument`, `submitAll`, `fetchComplianceQueue`, `downloadDocument`, `submitVerdict`, `approveOnboarding`, `rejectOnboarding`, `fetchAllotments`, `acknowledgeAllotment`.
- **Owns features:** FE-1 (fetch half).

### 5.3 Three `actions.ts` server-action boundaries
- **Responsibility:** `"use server"` boundary each client hook calls; wraps the server function in try/catch + `logger.log`/`logger.json`.
- **Files:** `admin-frontend/app/(roles)/rm/onboarding-renewal/actions.ts`, `admin-frontend/app/(roles)/compliance/review/actions.ts`, `admin-frontend/app/(roles)/pc/allotment-redemption/actions.ts` (all new).
- **Owns features:** FE-2.

### 5.4 Three client hooks
- **Responsibility:** client-side data/loading/error state + mutation wrappers; the pages' only entry point into live data.
- **Files:** `admin-frontend/hooks/api/useOnboardingBoard.ts`, `useComplianceQueue.ts`, `useAllotments.ts` (all new).
- **Owns features:** FE-3 (hook half), FE-4 (hook half), FE-5 (hook half).

### 5.5 RM board + modal cutover
- **Responsibility:** replace `KYC_COLS`/`KYC_DOCS` mock reads with live board data; wire Start Onboarding / doc upload / Submit All.
- **Files:** `admin-frontend/components/rm/OnboardingBoard.tsx`, `admin-frontend/components/rm/OnboardingModal.tsx`, `admin-frontend/lib/mock/rm-data.ts` (modified/deleted).
- **Owns features:** FE-3, FE-9.

### 5.6 Compliance review cutover
- **Responsibility:** replace `CO_ONBOARDING` mock reads with the live queue; wire verdict / approve / reject / download.
- **Files:** `admin-frontend/app/(roles)/compliance/review/page.tsx`, `admin-frontend/components/compliance/review/*.tsx`, `admin-frontend/lib/compliance/mock.ts` (modified/deleted).
- **Owns features:** FE-4.

### 5.7 PC allotments cutover
- **Responsibility:** replace `AR_ALLOTMENTS_SEED` mock reads with the live list; wire acknowledge.
- **Files:** `admin-frontend/app/(roles)/pc/allotment-redemption/page.tsx`, `admin-frontend/components/pc/allotment-redemption/*.tsx`, `admin-frontend/lib/pc/allotment-redemption-mock.ts` (modified/deleted).
- **Owns features:** FE-5.

### 5.8 `lib/api/onboarding.ts` (client-frontend)
- **Responsibility:** the one place client-frontend reaches `/api/client/subscriptions` and `/api/client/events`.
- **Files:** `client-frontend/lib/api/onboarding.ts` (new).
- **Public surface:** `fetchSubscriptions(token): Promise<SubscriptionDTO[]>`, `fetchEvents(token): Promise<ClientEventDTO[]>`.
- **Owns features:** FE-6.

### 5.9 Client Portfolio / Events cutover
- **Responsibility:** replace `MOCK_SUBSCRIBED_MODELS` / merge `MOCK_EVENT_ITEMS` with live data.
- **Files:** `client-frontend/lib/hooks/useSubscriptions.ts`, `useOnboardingEvents.ts` (new); `client-frontend/app/(dashboard)/portfolio/page.tsx`, `events/page.tsx` (modified); `client-frontend/lib/mock/data.ts` (modified).
- **Owns features:** FE-7, FE-8.

---

## 6. Features

### FE-1 — Types + server fetch functions (MANDATORY)

- **Proposal ref:** § 4.1 (wire contract), § Layer 3 A-1/A-2/A-3/A-4
- **Module:** 5.1, 5.2
- **Files:** `create: admin-frontend/lib/onboarding/types.ts`, `create: admin-frontend/server/onboarding/index.ts`, `modify: admin-frontend/server/endpoints.ts`
- **Dependencies:** none — parallel-safe

**Contract:**
```ts
// lib/onboarding/types.ts — §7.1 DTOs verbatim, plus admin-side view types

export type OnboardingStatus = "initial" | "reviewing" | "pending_review" | "active";
export type OnboardingKind   = "initial" | "renewal";
export type DocStatus        = "not_started" | "uploaded" | "in_review" | "verified" | "rejected" | "expired";
export type AllotRdmpStatus  = "pending" | "acknowledged";
export type AllotRdmpKind    = "allotment" | "redemption";

export interface StartOnboardingReq {
  client_name: string; email: string; primary_phone: string;
  address: string; country_of_residence: string;
  id_type: string; id_number: string;
  ibhk_account: string; sw_account: string;
  model_id: string; units: number;
  mgmt_fee: number; incentive_fee: number;   // fractions, e.g. 0.015 — see FE-9
  kind?: OnboardingKind;                      // defaults "initial" server-side
}

export interface DocumentDTO {
  doc_type: string; label: string; status: DocStatus;
  filename: string | null; required: boolean; periodic_review: boolean;
  issue_note: string | null; reviewed_at: string | null; expires_at: string | null;
  can_reupload: boolean;
}

export interface OnboardingDTO {   // widened 2026-07-20 for full field parity with the pre-existing RM/Compliance mocks — see D-9
  id: string; user_id: string;
  client_name: string; email: string; assigned_rm: string;   // assigned_rm: RM display name, resolved server-side from assigned_rm_uid
  client_ref: string;                                          // display code e.g. "MEGA-0481" — server-formatted, not stored
  primary_phone: string; address: string; country_of_residence: string;   // joined from ClientProfile, not duplicated onto client_onboardings
  id_type: string; id_number: string;                          // genuinely new columns on client_onboardings (D-9)
  ibhk_account: string; sw_account: string;                    // already existed on client_onboardings; this widening only adds them to the DTO
  status: OnboardingStatus; kind: OnboardingKind;
  model_id: string; model_name: string; units: number;
  mgmt_fee: number; incentive_fee: number;                     // the agreed fee as captured at onboarding; JSON numbers per §3.1's Decimal-as-number convention
  verified_count: number; required_count: number;
  reject_reason: string | null;
  submitted_at: string | null; created_at: string;
  documents: DocumentDTO[];   // present on detail/board rows; absent only if backend omits on a summary view
}

export interface BoardDTO {
  initial: OnboardingDTO[]; reviewing: OnboardingDTO[];
  pending_review: OnboardingDTO[]; active: OnboardingDTO[];
}

export interface VerdictReq { verdict: "valid" | "issue"; note?: string | null; }
export interface RejectReq  { reason?: string | null; }

export interface AllotRdmptDTO {
  id: string; reference: string;
  model_id: string; model_name: string; units: number; amount: number;
  kind: AllotRdmpKind; status: AllotRdmpStatus; note: string | null;
  agg_before: number; agg_after: number;                       // widened 2026-07-20 — snapshotted server-side at insert (DB B-3), never recomputed here
  expected_cash_in: string | null;                             // widened 2026-07-20 — settlement date, snapshotted at insert time
  rm: string; created_at: string; acknowledged_at: string | null;
}

export interface SubscriptionDTO { model_id: string; model_name: string; units: number; ib_account: string | null; }
export interface ClientEventDTO  { id: string; category: string; title: string; body: string; created_at: string; }

/* ---- Admin-side VIEW types — what OnboardingBoard.tsx/ObDetailPanel/
   AllotDetailPanel actually render. Replace the deleted mock types
   1:1 in shape so the components' JSX is untouched (FE-3/4/5). ---- */

export interface KycBoardClient {
  id: string; name: string; owner: string; clientRef: string;
  phone: string; address: string; country: string;
  idType: string; idNumber: string;
  ibhkAccount: string; swAccount: string;
  verifiedCount: number; requiredCount: number;
  documents: DocumentDTO[];
}
export interface KycBoardColumn { label: string; status: OnboardingStatus; clients: KycBoardClient[]; }

export type ObStatus = "pending" | "approved" | "rejected";
export interface AdminOnboardingRow {
  id: string; client: string; email: string;
  phone: string; address: string; country: string;
  idType: string; idNumber: string;
  ibhk: string; silverwate: string;
  rm: string; clientRef: string; submitted: string; status: ObStatus; type: string;
  documents: DocumentDTO[];
  rejectReason: string | null;
}

export interface AllotmentView {
  id: string; ref: string; modelName: string; mult: number; amount: number;
  status: AllotRdmpStatus; rm: string; date: string; acknowledgedAt: string | null;
  expectedCashIn: string | null;        // sourced directly from AllotRdmptDTO.expected_cash_in
  aggBefore: number; aggAfter: number;  // sourced directly from AllotRdmptDTO.agg_before/agg_after, see FE-5
}
```
```ts
// server/endpoints.ts — extend the existing consts (no restructuring)
const COMPLIANCE = "/api/compliance";
const CLIENT = "/api/client";

export const ENDPOINTS = {
  // ...existing PC / RM / MOBO blocks unchanged...
  RM: {
    CLIENTS: `${RM}/clients`,
    CLIENT:  (id: string) => `${RM}/clients/${encodeURIComponent(id)}`,
    ONBOARDINGS:      `${RM}/onboardings`,
    ONBOARDING:       (id: string) => `${RM}/onboardings/${id}`,
    ONBOARDING_DOC:   (id: string, docType: string) => `${RM}/onboardings/${id}/documents/${encodeURIComponent(docType)}`,
    ONBOARDING_SUBMIT:(id: string) => `${RM}/onboardings/${id}/submit`,
  },
  COMPLIANCE: {
    ONBOARDINGS:        `${COMPLIANCE}/onboardings`,
    ONBOARDING_DOWNLOAD:(id: string, docType: string) => `${COMPLIANCE}/onboardings/${id}/documents/${encodeURIComponent(docType)}/download`,
    ONBOARDING_VERDICT: (id: string, docType: string) => `${COMPLIANCE}/onboardings/${id}/documents/${encodeURIComponent(docType)}/verdict`,
    ONBOARDING_APPROVE: (id: string) => `${COMPLIANCE}/onboardings/${id}/approve`,
    ONBOARDING_REJECT:  (id: string) => `${COMPLIANCE}/onboardings/${id}/reject`,
  },
  PC: {
    // ...existing MODELS/ALLOCATION block unchanged...
    ALLOTMENTS:      `${PC}/allotments`,
    ALLOTMENT_ACK:   (id: string) => `${PC}/allotments/${id}/acknowledge`,
  },
} as const;
```
```ts
// server/onboarding/index.ts — server-only fetch functions
"use server";

import { apiClient, apiClientFormData, type APIResult } from "@/server/api-client";
import { ENDPOINTS } from "@/server/endpoints";
import { cookies } from "next/headers";
import { getApiBase } from "@/lib/auth-api";
import type {
  AllotRdmptDTO, BoardDTO, DocumentDTO, OnboardingDTO,
  RejectReq, StartOnboardingReq, VerdictReq,
} from "@/lib/onboarding/types";

export type { APIResult };

/* ---- RM ---- */
export async function fetchBoard(): Promise<APIResult<BoardDTO>> {
  return apiClient<BoardDTO>(ENDPOINTS.RM.ONBOARDINGS);
}
export async function startOnboarding(body: StartOnboardingReq): Promise<APIResult<OnboardingDTO>> {
  return apiClient<OnboardingDTO>(ENDPOINTS.RM.ONBOARDINGS, { method: "POST", body: JSON.stringify(body) });
}
export async function uploadDocument(
  onboardingId: string, docType: string, formData: FormData,
): Promise<APIResult<DocumentDTO>> {
  return apiClientFormData<DocumentDTO>(ENDPOINTS.RM.ONBOARDING_DOC(onboardingId, docType), formData);
}
export async function submitAll(onboardingId: string): Promise<APIResult<OnboardingDTO>> {
  return apiClient<OnboardingDTO>(ENDPOINTS.RM.ONBOARDING_SUBMIT(onboardingId), { method: "POST" });
}

/* ---- Compliance ---- */
export async function fetchComplianceQueue(): Promise<APIResult<OnboardingDTO[]>> {
  return apiClient<OnboardingDTO[]>(ENDPOINTS.COMPLIANCE.ONBOARDINGS);
}
export async function submitVerdict(
  onboardingId: string, docType: string, body: VerdictReq,
): Promise<APIResult<DocumentDTO>> {
  return apiClient<DocumentDTO>(ENDPOINTS.COMPLIANCE.ONBOARDING_VERDICT(onboardingId, docType), {
    method: "POST", body: JSON.stringify(body),
  });
}
export async function approveOnboarding(onboardingId: string): Promise<APIResult<OnboardingDTO>> {
  return apiClient<OnboardingDTO>(ENDPOINTS.COMPLIANCE.ONBOARDING_APPROVE(onboardingId), { method: "POST" });
}
export async function rejectOnboarding(onboardingId: string, body: RejectReq): Promise<APIResult<OnboardingDTO>> {
  return apiClient<OnboardingDTO>(ENDPOINTS.COMPLIANCE.ONBOARDING_REJECT(onboardingId), {
    method: "POST", body: JSON.stringify(body),
  });
}
/** Base64 proxy — mirrors server/pc/index.ts's downloadMaterial (cookie token can't ride a plain <a href>). */
export async function downloadDocument(
  onboardingId: string, docType: string,
): Promise<APIResult<{ filename: string; contentType: string; base64: string }>> {
  const token = (await cookies()).get("id_token")?.value ?? "";
  const url = `${getApiBase()}${ENDPOINTS.COMPLIANCE.ONBOARDING_DOWNLOAD(onboardingId, docType)}`;
  try {
    const res = await fetch(url, { cache: "no-store", headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (res.status === 401) return { success: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    if (!res.ok) return { success: false, error: `HTTP ${res.status}`, code: `HTTP_${res.status}` };
    const cd = res.headers.get("Content-Disposition") ?? "";
    const filename = /filename="?([^";]+)"?/i.exec(cd)?.[1] ?? docType;
    const contentType = res.headers.get("Content-Type") ?? "application/octet-stream";
    const buf = Buffer.from(await res.arrayBuffer());
    return { success: true, data: { filename, contentType, base64: buf.toString("base64") } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error", code: "NETWORK_ERROR" };
  }
}

/* ---- PC ---- */
export async function fetchAllotments(): Promise<APIResult<AllotRdmptDTO[]>> {
  return apiClient<AllotRdmptDTO[]>(ENDPOINTS.PC.ALLOTMENTS);
}
export async function acknowledgeAllotment(id: string): Promise<APIResult<AllotRdmptDTO>> {
  return apiClient<AllotRdmptDTO>(ENDPOINTS.PC.ALLOTMENT_ACK(id), { method: "POST" });
}
```

**Behavior / invariants:** `apiClient`/`apiClientFormData` already attach the `id_token` cookie as a Bearer token and return the `APIResult<T>` envelope — no new auth code (mirrors `server/pc/index.ts` exactly). `GET /api/compliance/onboardings` returns a flat `OnboardingDTO[]` (reviewing + decided history, per proposal § Layer 2-D), not a `BoardDTO`.

**Done when:** every exported function compiles against `apiClient`'s/`apiClientFormData`'s real signatures; calling `fetchBoard()` against a running Backend returns `{ success: true, data: BoardDTO }`.

---

### FE-2 — Server action boundaries (MANDATORY)

- **Proposal ref:** § Layer 3 A-1, A-2, A-3
- **Module:** 5.3
- **Files:** `create: admin-frontend/app/(roles)/rm/onboarding-renewal/actions.ts`, `create: admin-frontend/app/(roles)/compliance/review/actions.ts`, `create: admin-frontend/app/(roles)/pc/allotment-redemption/actions.ts`
- **Dependencies:** FE-1

**Contract (RM shown; Compliance/PC follow the identical shape, one export per FE-1 function in that role's group):**
```ts
// app/(roles)/rm/onboarding-renewal/actions.ts
"use server";

import {
  fetchBoard as _fetchBoard,
  startOnboarding as _startOnboarding,
  uploadDocument as _uploadDocument,
  submitAll as _submitAll,
  type APIResult,
} from "@/server/onboarding";
import type { BoardDTO, DocumentDTO, OnboardingDTO, StartOnboardingReq } from "@/lib/onboarding/types";
import { logger } from "@/lib/logger";

function toErrorResult(error: unknown): { success: false; error: string; code: string } {
  return { success: false, error: error instanceof Error ? error.message : String(error), code: "ACTION_ERROR" };
}

export async function fetchBoard(): Promise<APIResult<BoardDTO>> {
  try {
    logger.log("🔄 Fetching onboarding board...");
    const response = await _fetchBoard();
    logger.json("✅ Get board response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching onboarding board:", { error });
    return toErrorResult(error);
  }
}

export async function startOnboarding(body: StartOnboardingReq): Promise<APIResult<OnboardingDTO>> {
  try {
    logger.json("🔄 Starting onboarding:", body);
    const response = await _startOnboarding(body);
    logger.json("✅ Start onboarding response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error starting onboarding:", { error, body });
    return toErrorResult(error);
  }
}

export async function uploadDocument(
  onboardingId: string, docType: string, formData: FormData,
): Promise<APIResult<DocumentDTO>> {
  try {
    logger.log("🔄 Uploading onboarding document:", { onboardingId, docType });
    const response = await _uploadDocument(onboardingId, docType, formData);
    logger.json("✅ Upload document response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error uploading onboarding document:", { error, onboardingId, docType });
    return toErrorResult(error);
  }
}

export async function submitAll(onboardingId: string): Promise<APIResult<OnboardingDTO>> {
  try {
    logger.log("🔄 Submitting onboarding:", onboardingId);
    const response = await _submitAll(onboardingId);
    logger.json("✅ Submit all response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error submitting onboarding:", { error, onboardingId });
    return toErrorResult(error);
  }
}
```

**Behavior / invariants:** identical shape to `pc/model-management/actions.ts` — same logging convention, same error-to-`APIResult` conversion. Compliance's `actions.ts` exports `fetchComplianceQueue`, `submitVerdict`, `approveOnboarding`, `rejectOnboarding`, `downloadDocument`; PC's exports `fetchAllotments`, `acknowledgeAllotment` — each a thin try/catch wrapper over its FE-1 counterpart.

**Done when:** every action returns the same `APIResult` shape its FE-1 function does on success, and a thrown network error converts to `{ success: false, error, code: "ACTION_ERROR" }` rather than propagating.

---

### FE-3 — Wire RM board + modal + submit + doc upload (MANDATORY)

- **Proposal ref:** § Layer 3 A-1 (widened 2026-07-20, D-9), § Layer 3 C (Additional findings)
- **Module:** 5.4, 5.5
- **Files:** `create: admin-frontend/hooks/api/useOnboardingBoard.ts`, `create: admin-frontend/lib/onboarding/mappers.ts` (board half), `modify: admin-frontend/components/rm/OnboardingBoard.tsx`, `modify: admin-frontend/components/rm/OnboardingModal.tsx`, `modify: admin-frontend/lib/mock/rm-data.ts`
- **Dependencies:** FE-2, FE-9 (fee parsing used by the modal's submit call)

**Contract:**
```ts
// lib/onboarding/mappers.ts — board half
import type { BoardDTO, KycBoardColumn, OnboardingDTO } from "./types";

const COLUMN_LABELS: Record<keyof BoardDTO, string> = {
  initial: "Initial Onboarding",
  reviewing: "Reviewing",
  pending_review: "Pending for Review",
  active: "Active",
};

function mapRow(o: OnboardingDTO) {
  return {
    id: o.id, name: o.client_name, owner: o.assigned_rm, clientRef: o.client_ref,
    // widened 2026-07-20 (D-9) — read straight off the widened OnboardingDTO, no "—" fallback:
    phone: o.primary_phone, address: o.address, country: o.country_of_residence,
    idType: o.id_type, idNumber: o.id_number,
    ibhkAccount: o.ibhk_account, swAccount: o.sw_account,
    verifiedCount: o.verified_count, requiredCount: o.required_count,
    documents: o.documents,
  };
}

/** BoardDTO → the 4 kanban columns, per §4.2's status↔column mapping. */
export function mapBoardToColumns(dto: BoardDTO): KycBoardColumn[] {
  return (Object.keys(COLUMN_LABELS) as (keyof BoardDTO)[]).map((status) => ({
    label: COLUMN_LABELS[status],
    status,
    clients: dto[status].map(mapRow),
  }));
}
```
```ts
// hooks/api/useOnboardingBoard.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchBoard, startOnboarding, uploadDocument, submitAll } from "@/app/(roles)/rm/onboarding-renewal/actions";
import { mapBoardToColumns } from "@/lib/onboarding/mappers";
import type { KycBoardColumn, StartOnboardingReq } from "@/lib/onboarding/types";

export interface UseOnboardingBoardResult {
  data: KycBoardColumn[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  startOnboarding: (body: StartOnboardingReq) => Promise<{ success: boolean; error?: string; id?: string }>;
  uploadDocument: (onboardingId: string, docType: string, file: File) => Promise<{ success: boolean; error?: string }>;
  submitAll: (onboardingId: string) => Promise<{ success: boolean; error?: string }>;
}

export function useOnboardingBoard(): UseOnboardingBoardResult {
  const [data, setData] = useState<KycBoardColumn[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const fetch_ = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchBoard();
      if (result.success) setData(mapBoardToColumns(result.data));
      else setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load onboarding board");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const start = useCallback(async (body: StartOnboardingReq) => {
    const result = await startOnboarding(body);
    if (!result.success) return { success: false, error: result.error };
    fetch_();
    return { success: true, id: result.data.id };
  }, [fetch_]);

  const upload = useCallback(async (onboardingId: string, docType: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file, file.name);
    const result = await uploadDocument(onboardingId, docType, fd);
    if (result.success) fetch_();
    return { success: result.success, error: result.success ? undefined : result.error };
  }, [fetch_]);

  const submit = useCallback(async (onboardingId: string) => {
    const result = await submitAll(onboardingId);
    if (result.success) fetch_();
    return { success: result.success, error: result.success ? undefined : result.error };
  }, [fetch_]);

  return { data, loading, error, refetch: fetch_, startOnboarding: start, uploadDocument: upload, submitAll: submit };
}
```
```tsx
// components/rm/OnboardingBoard.tsx — data-sourcing diff only; JSX/kanban
// layout, KycPanel structure, floating-panel transition are UNCHANGED
import { useOnboardingBoard } from "@/hooks/api/useOnboardingBoard";
// KYC_COLS/KYC_DOCS/VERIFIED_COUNT/TONE_FOR/KycClient imports from
// "@/lib/mock/rm-data" REMOVED; KNOWN_CLIENT_IDS import stays (Client Book
// is out of scope).
// count/7 chip now reads item.verifiedCount / item.requiredCount directly;
// KycPanel's document rows map over item.documents (DocumentDTO[]) and read
// `can_reupload` to gate the Upload affordance (proposal §Layer 3 C):
//   {item.documents.map((d) => (
//     d.can_reupload
//       ? <UploadButton onFile={(f) => uploadDocument(item.id, d.doc_type, f)} />
//       : <Chip tone={toneForDocStatus(d.status)} dot={false}>{d.status}</Chip>
//   ))}
// "Submit All" is enabled when requiredCount === verifiedCount... no —
// enabled per the SAME outstanding-doc rule as today (any doc not yet
// `uploaded`/`verified`/`in_review` blocks it), now sourced from
// d.status instead of the old BLOCKING_STATUSES string set; calls
// submitAll(item.id) on click.
```
```tsx
// components/rm/OnboardingModal.tsx — "Onboard Client" now calls startOnboarding
// (from useOnboardingBoard, passed down as a prop or read via the hook directly)
// instead of being a disabled/no-op button:
async function handleSubmit() {
  const result = await startOnboarding({
    client_name: form.clientName, email: form.email, primary_phone: form.phone,
    address: form.address, country_of_residence: form.country,
    id_type: form.idType, id_number: form.idNumber,
    ibhk_account: form.ibhkId, sw_account: form.swId,
    model_id: OB_MODEL_CATALOG.find((m) => m.name === form.model)!.id, // catalog gains `id` — see note below
    units: Number(form.modelUnit),
    mgmt_fee: parseFeePercent(form.mgmtFee),     // FE-9
    incentive_fee: parseFeePercent(form.incentiveFee), // FE-9
  });
  if (result.success) onClose();
  // else surface result.error inline — same disabled-button + inline-error
  // pattern already used elsewhere in this file family, no new UI chrome.
}
```

**Behavior / invariants:** `OB_MODEL_CATALOG` (`lib/mock/rm-data.ts`) currently carries only `name`/`mgmtFee`/`incentiveFee` display strings — it needs a `model_id: string` field added (its values are already a small fixed catalog; this is additive, not a mock deletion, since the model list itself is PC's Model Management scope, not this proposal's). `can_reupload` (from `DocumentDTO`) is the single source of truth for whether the Upload affordance renders — the KYC panel no longer computes this from a hardcoded `BLOCKING_STATUSES` set. `verifiedCount`/`requiredCount` replace `VERIFIED_COUNT`/`TONE_FOR` lookups entirely — the chip tone is derived from `verifiedCount === requiredCount` (verified/green) vs. partial (amber) vs. zero (neutral), a pure function of the two counts, not a preset key.

**Done when:** the board renders four columns matching `BoardDTO`'s four buckets; Start Onboarding creates a real onboarding row and the board refetches; doc upload is disabled exactly when `can_reupload` is `false`; Submit All is disabled until every required doc is uploaded and calls the real endpoint when enabled; `git grep KYC_COLS` returns zero hits after this unit.

---

### FE-4 — Wire Compliance review + verdict + decide + download (MANDATORY)

- **Proposal ref:** § Layer 3 A-2 (widened 2026-07-20, D-9), § 4.2 (status projection table), § Layer 3 C
- **Module:** 5.4, 5.6
- **Files:** `create: admin-frontend/hooks/api/useComplianceQueue.ts`, `create: admin-frontend/lib/onboarding/mappers.ts` (compliance half), `modify: admin-frontend/app/(roles)/compliance/review/page.tsx`, `modify: admin-frontend/components/compliance/review/ObDetailPanel.tsx`, `modify: admin-frontend/components/compliance/review/RejectModal.tsx`, `modify: admin-frontend/lib/compliance/mock.ts`
- **Dependencies:** FE-2

**Contract:**
```ts
// lib/onboarding/mappers.ts — compliance half
import type { AdminOnboardingRow, DocStatus, ObStatus, OnboardingDTO } from "./types";

/** §4.2's frozen status projection: DB OnboardingStatus → Compliance's own ObStatus. */
const OB_STATUS_MAP: Partial<Record<OnboardingDTO["status"], ObStatus>> = {
  reviewing: "pending",
  pending_review: "rejected",
  active: "approved",
  // "initial" never appears in GET /api/compliance/onboardings (RM hasn't submitted yet).
};

export function mapOnboardingToRow(o: OnboardingDTO): AdminOnboardingRow {
  return {
    id: o.id, client: o.client_name, email: o.email,
    // widened 2026-07-20 (D-9) — read straight off the widened OnboardingDTO, no "—" fallback:
    phone: o.primary_phone, address: o.address, country: o.country_of_residence,
    idType: o.id_type, idNumber: o.id_number,
    ibhk: o.ibhk_account, silverwate: o.sw_account,
    rm: o.assigned_rm, clientRef: o.client_ref, submitted: o.submitted_at ?? o.created_at,
    status: OB_STATUS_MAP[o.status] ?? "pending",
    type: o.kind === "renewal" ? "Yearly Renewal" : "Initial Onboarding",
    documents: o.documents,
    rejectReason: o.reject_reason,
  };
}

/** DocStatus → the DocVerdict tri-state the existing DocRow/RejectModal render. */
export function docStatusToVerdict(status: DocStatus): "valid" | "issue" | null {
  if (status === "verified") return "valid";
  if (status === "rejected") return "issue";
  return null;
}
```
```ts
// hooks/api/useComplianceQueue.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchComplianceQueue, submitVerdict, approveOnboarding, rejectOnboarding, downloadDocument,
} from "@/app/(roles)/compliance/review/actions";
import { mapOnboardingToRow } from "@/lib/onboarding/mappers";
import type { AdminOnboardingRow } from "@/lib/onboarding/types";

export interface UseComplianceQueueResult {
  data: AdminOnboardingRow[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  submitVerdict: (id: string, docType: string, verdict: "valid" | "issue", note?: string) => Promise<{ success: boolean; error?: string }>;
  approve: (id: string) => Promise<{ success: boolean; error?: string }>;
  reject: (id: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  download: (id: string, docType: string) => Promise<{ success: boolean; error?: string; filename?: string; contentType?: string; base64?: string }>;
}

export function useComplianceQueue(): UseComplianceQueueResult {
  const [data, setData] = useState<AdminOnboardingRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const fetch_ = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchComplianceQueue();
      if (result.success) setData(result.data.map(mapOnboardingToRow));
      else setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load compliance queue");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const doVerdict = useCallback(async (id: string, docType: string, verdict: "valid" | "issue", note?: string) => {
    const result = await submitVerdict(id, docType, { verdict, note });
    if (result.success) fetch_();
    return { success: result.success, error: result.success ? undefined : result.error };
  }, [fetch_]);

  const approve = useCallback(async (id: string) => {
    const result = await approveOnboarding(id);
    if (result.success) fetch_();
    return { success: result.success, error: result.success ? undefined : result.error };
  }, [fetch_]);

  const reject = useCallback(async (id: string, reason: string) => {
    const result = await rejectOnboarding(id, { reason });
    if (result.success) fetch_();
    return { success: result.success, error: result.success ? undefined : result.error };
  }, [fetch_]);

  const download = useCallback(async (id: string, docType: string) => {
    const result = await downloadDocument(id, docType);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, ...result.data };
  }, []);

  return { data, loading, error, refetch: fetch_, submitVerdict: doVerdict, approve, reject, download };
}
```

**Behavior / invariants:** the `docVerdicts` page-state map (`useState<Record<string, DocVerdict[]>>`) is deleted — verdicts are now `docStatusToVerdict(d.status)` read directly off each row's `documents`, always in sync with the server (proposal D-2: transitions are server-owned). `DOC_NAMES` (`lib/compliance/mock.ts`) is deleted — `ObDetailPanel`/`RejectModal` iterate `o.documents` and render `d.label` (server-supplied), not a hardcoded name array (proposal § Layer 3 C: "both pages render `DocumentDTO.label` from the server, ending the divergence"). `RejectModal`'s "flag documents" checklist becomes read-only display of already-`rejected` docs (verdicts are set via `ObDetailPanel`'s per-doc Valid/Issue toggle *before* opening Reject, calling `submitVerdict` per click) — `onConfirm` now calls `reject(o.id, reason)`. The download button calls `download(o.id, d.doc_type)` and, on success, rehydrates a `Blob` from the returned `base64` client-side and triggers a browser download (same technique as PC's `downloadMaterial` consumer).

**Done when:** the queue renders with `AdminOnboardingRow.status` correctly bucketed per § 4.2's table; clicking Valid/Issue on a doc calls `submitVerdict` and the button state updates from the refetched data (not local-only state); Approve/Reject call the real endpoints and are disabled per the existing all-reviewed/no-issues rule; download successfully triggers a file save; `git grep CO_ONBOARDING` and `git grep DOC_NAMES` both return zero hits.

---

### FE-5 — Wire PC allotments + acknowledge (MANDATORY)

- **Proposal ref:** § Layer 3 A-3 (widened 2026-07-20, D-9)
- **Module:** 5.4, 5.7
- **Files:** `create: admin-frontend/hooks/api/useAllotments.ts`, `create: admin-frontend/lib/onboarding/mappers.ts` (PC half), `modify: admin-frontend/app/(roles)/pc/allotment-redemption/page.tsx`, `modify: admin-frontend/components/pc/allotment-redemption/AllotDetailPanel.tsx`, `modify: admin-frontend/lib/pc/allotment-redemption-mock.ts`
- **Dependencies:** FE-2

**Contract:**
```ts
// lib/onboarding/mappers.ts — PC half
import type { AllotRdmptDTO, AllotmentView } from "./types";

/**
 * AllotRdmptDTO[] → AllotmentView[]. Widened 2026-07-20 (D-9): the per-model
 * aggregate multiplier (aggBefore/aggAfter) and expected-cash-in date are now
 * read straight off the DTO — both are snapshotted server-side at insert
 * time (DB B-3, Backend C-2), never recomputed here. This mapper does zero
 * aggregate computation of its own.
 */
export function mapAllotmentsToView(dtos: AllotRdmptDTO[]): AllotmentView[] {
  return dtos.map((d) => ({
    id: d.id, ref: d.reference, modelName: d.model_name, mult: d.units, amount: d.amount,
    status: d.status, rm: d.rm, date: d.created_at, acknowledgedAt: d.acknowledged_at,
    expectedCashIn: d.expected_cash_in,
    aggBefore: d.agg_before, aggAfter: d.agg_after,
  }));
}
```
```ts
// hooks/api/useAllotments.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAllotments, acknowledgeAllotment } from "@/app/(roles)/pc/allotment-redemption/actions";
import { mapAllotmentsToView } from "@/lib/onboarding/mappers";
import type { AllotmentView } from "@/lib/onboarding/types";

export interface UseAllotmentsResult {
  data: AllotmentView[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  acknowledge: (id: string) => Promise<{ success: boolean; error?: string }>;
}

export function useAllotments(): UseAllotmentsResult {
  const [data, setData] = useState<AllotmentView[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const fetch_ = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAllotments();
      if (result.success) setData(mapAllotmentsToView(result.data));
      else setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load allotments");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const acknowledge = useCallback(async (id: string) => {
    const result = await acknowledgeAllotment(id);
    if (result.success) fetch_();
    return { success: result.success, error: result.success ? undefined : result.error };
  }, [fetch_]);

  return { data, loading, error, refetch: fetch_, acknowledge };
}
```

**Behavior / invariants:** `amount` is read directly off `AllotRdmptDTO.amount` (backend-computed `units * model.size`, per § 4.1) — the page drops its local `arAllotAmt`/`arModelById` derivation entirely (proposal § Layer 3 A-3: "the page drops its local `arAllotAmt` derivation"). **Widened 2026-07-20 (D-9):** the table's "Agg. multiplier" column and `AllotDetailPanel`'s aggregate bar (before/after) and "Expected cash-in" fact are likewise read directly off `AllotRdmptDTO.agg_before`/`agg_after`/`expected_cash_in` — no client-side aggregate computation of any kind remains in this unit. `AllotDetailPanel`'s "Client anonymized · {ref}" line is unchanged — `AllotmentView.ref` is `AllotRdmptDTO.reference`, already anonymized server-side (D-8), never a client id.

**Done when:** the Allotments tab renders `amount`/`aggBefore`/`aggAfter`/`expectedCashIn` from the DTO with zero local computation; Acknowledge calls the real endpoint and the row updates from the refetched data; `git grep AR_ALLOTMENTS_SEED` returns zero hits.

---

### FE-6 — Client-frontend data-access module (MANDATORY)

- **Proposal ref:** § Layer 3 A-4, § 4.1 (`SubscriptionDTO`, `ClientEventDTO`)
- **Module:** 5.8
- **Files:** `create: client-frontend/lib/api/onboarding.ts`
- **Dependencies:** none — parallel-safe

**Contract:**
```ts
// client-frontend/lib/api/onboarding.ts
import { getApiBase } from "@/lib/auth-api";

export interface SubscriptionDTO { model_id: string; model_name: string; units: number; ib_account: string | null; }
export interface ClientEventDTO  { id: string; category: string; title: string; body: string; created_at: string; }

async function authedGet<T>(path: string, token: string | null): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body: unknown = await res.json();
      if (typeof body === "object" && body !== null && "detail" in body) {
        const d = (body as { detail?: unknown }).detail;
        if (typeof d === "string") detail = d;
      }
    } catch { /* noop */ }
    throw new Error(`${detail} (${res.status} ${path})`);
  }
  return (await res.json()) as T;
}

/** GET /api/client/subscriptions — the caller supplies its own fresh ID token
 *  (via useAuth().getIdToken()), matching lib/auth-api.ts's convention. */
export async function fetchSubscriptions(token: string | null): Promise<SubscriptionDTO[]> {
  return authedGet<SubscriptionDTO[]>("/api/client/subscriptions", token);
}

/** GET /api/client/events */
export async function fetchEvents(token: string | null): Promise<ClientEventDTO[]> {
  return authedGet<ClientEventDTO[]>("/api/client/events", token);
}
```

**Behavior / invariants:** mirrors `lib/auth-api.ts`'s `parseApiError` shape closely enough to give a useful message without duplicating its dev-only-404 special-casing (that branch is specific to the auth routes, not these). No cookie, no server action — this is client-callable code, consistent with every other client-frontend data function.

**Done when:** `fetchSubscriptions`/`fetchEvents` compile against `getApiBase()`'s real signature; a mocked `fetch` returning 200 resolves to the typed array; a mocked 401/403 throws with the response's `detail` message.

---

### FE-7 — Wire client Portfolio page (Yes)

- **Proposal ref:** § Layer 3 A-4, § 1 (seam gap: `symbol`/`country`/`sector`/`amount`/`modelLimit`), D-9 (Portfolio/`SubscriptionDTO` explicitly NOT widened — this unit stays exactly as originally scoped)
- **Module:** 5.9
- **Files:** `create: client-frontend/lib/hooks/useSubscriptions.ts`, `modify: client-frontend/app/(dashboard)/portfolio/page.tsx`, `modify: client-frontend/lib/mock/data.ts`
- **Dependencies:** FE-6

**Contract:**
```ts
// client-frontend/lib/hooks/useSubscriptions.ts
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { fetchSubscriptions, type SubscriptionDTO } from "@/lib/api/onboarding";

export interface SubscribedModelView {
  name: string; symbol: string; country: string; sector: string;
  amount: string; multiplier: string; modelLimit: string; ibAccount: string;
}

function mapSubscription(dto: SubscriptionDTO): SubscribedModelView {
  return {
    name: dto.model_name,
    // out of scope for this proposal, not a dropped field: this shape is a stale,
    // prototype-era model-catalog schema the real `Model` table doesn't carry
    // (no country/sector concept, symbols are a weighted one-to-many relationship)
    // — backfilling the real schema to match a stale mock would contaminate it.
    // See proposal D-9 / Layer 3 A-4.
    symbol: "—", country: "—", sector: "—", amount: "—", modelLimit: "—",
    multiplier: `${dto.units.toFixed(1)}x`,
    ibAccount: dto.ib_account ?? "—",
  };
}

/** Mirrors useAllotmentRequests's useEffect+useState shape — this hook adds
 *  the actual network call useAllotmentRequests's TODO comment defers. */
export function useSubscriptions() {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<SubscribedModelView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getIdToken();
        const dtos = await fetchSubscriptions(token);
        if (!cancelled) setData(dtos.map(mapSubscription));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load subscriptions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [getIdToken]);

  return { data, loading, error };
}
```
```tsx
// app/(dashboard)/portfolio/page.tsx — data-sourcing diff only
import { useSubscriptions } from "@/lib/hooks/useSubscriptions";
// import { MOCK_SUBSCRIBED_MODELS } from "@/lib/mock/data";  // REMOVED

export default function PortfolioPage() {
  const { data: subscribedModels, loading: subsLoading } = useSubscriptions();
  // ...unchanged state (censored, ticketOpen, dynamic, search, currentPage)...

  // Subscribed Models section maps over `subscribedModels` instead of
  // `MOCK_SUBSCRIBED_MODELS`; a loading/empty row replaces the table body
  // while subsLoading is true, per today's existing empty-state pattern
  // used elsewhere on this page (ticket table's "no_tickets_match" row).
}
```

**Behavior / invariants:** `MOCK_SUBSCRIBED_MODELS` and the `SubscribedModel` type are deleted from `lib/mock/data.ts` (`MOCK_RECOMMENDED_MODELS`/`RecommendedModel` stay — recommended models are not part of this proposal's scope). The Recommended Models and Ticket History sections of the page are untouched.

**Done when:** the Subscribed Models table renders `model_name`/`units`/`ib_account` from a live fetch with the four unavailable columns showing `"—"`; `git grep MOCK_SUBSCRIBED_MODELS` returns zero hits.

---

### FE-8 — Wire client Events page (Yes)

- **Proposal ref:** § Layer 3 A-4, § Non-Goals (general events feed stays mock)
- **Module:** 5.9
- **Files:** `create: client-frontend/lib/hooks/useOnboardingEvents.ts`, `modify: client-frontend/app/(dashboard)/events/page.tsx`
- **Dependencies:** FE-6

**Contract:**
```ts
// client-frontend/lib/hooks/useOnboardingEvents.ts
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { fetchEvents, type ClientEventDTO } from "@/lib/api/onboarding";
import type { EventEntry } from "@/lib/mock/data";

/** Fixed chrome for a server-sourced onboarding event — the DTO carries no
 *  icon/level/action metadata (§1 seam gap), so every row gets the same
 *  "Account Notification"-style treatment the mock already uses for that
 *  category (see MOCK_EVENT_ITEMS's "event-kyc-reminder"/"event-security-alert"). */
function mapEvent(dto: ClientEventDTO): EventEntry {
  return {
    id: dto.id, iconType: "shield", level: "info",
    title: dto.title, time: dto.created_at, description: dto.body,
    category: "Account Notification",
    primaryLabel: "Acknowledge", primaryVariant: "outline", secondaryLabel: "Mark as Read",
  };
}

export function useOnboardingEvents() {
  const { getIdToken } = useAuth();
  const [data, setData] = useState<EventEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getIdToken();
        const dtos = await fetchEvents(token);
        if (!cancelled) setData(dtos.map(mapEvent));
      } catch {
        if (!cancelled) setData([]);  // fail silent — the mock non-onboarding
                                       // items still render (see page.tsx)
      }
    })();
    return () => { cancelled = true; };
  }, [getIdToken]);

  return data;
}
```
```tsx
// app/(dashboard)/events/page.tsx — merge diff only
import { useOnboardingEvents } from "@/lib/hooks/useOnboardingEvents";
// existing: import { useEventItems } from "@/lib/hooks/useEventItems";
// existing: import { MOCK_EVENT_ITEMS, ... } from "@/lib/mock/data";

export default function EventsPage() {
  const dynamicItems = useEventItems();       // unchanged — localStorage items
  const onboardingItems = useOnboardingEvents(); // NEW — live GET /api/client/events

  const allItems = [...dynamicItems, ...onboardingItems, ...MOCK_EVENT_ITEMS].map(/* unchanged mapping */);
  // filter-pill logic, card JSX, ICON_MAP, LEVEL_CONFIG — all unchanged
}
```

**Behavior / invariants:** `MOCK_EVENT_ITEMS` stays exactly as-is (Non-Goal: "general events feed" — Market News, non-onboarding categories — remains mock, per proposal § 3 and § Non-Goals). This unit only *adds* a third source array merged alongside the two that already exist; it deletes nothing from `lib/mock/data.ts`.

**Done when:** a live onboarding event (post-approve) appears in the "Account Notification" filter with the server's `title`/`body`; a failed fetch degrades to showing only the existing dynamic + mock items (no crash, no broken filter).

---

### FE-9 — Fee string→decimal conversion (MANDATORY)

- **Proposal ref:** § Layer 3 A-1 ("the modal's `mgmt_fee`/`incentive_fee` display strings... are parsed to a decimal fraction... before sending"), § 4.1 field-name map
- **Module:** 5.5
- **Files:** `modify: admin-frontend/components/rm/OnboardingModal.tsx` (or `create: admin-frontend/lib/onboarding/fee.ts` if shared elsewhere later)
- **Dependencies:** none — parallel-safe (consumed by FE-3)

**Contract:**
```ts
/**
 * "1.5%" → 0.015. Accepts the modal's free-text fee inputs (which may or
 * may not include a trailing "%", per today's placeholder examples "1.0%"
 * / "10%"); strips non-numeric characters except the decimal point, then
 * divides by 100. Throws on an empty/unparseable string so the caller can
 * surface a validation error rather than silently sending 0.
 */
export function parseFeePercent(input: string): number {
  const cleaned = input.trim().replace(/[^\d.]/g, "");
  if (!cleaned) throw new Error(`Invalid fee value: "${input}"`);
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw new Error(`Invalid fee value: "${input}"`);
  return n / 100;
}
```

**Behavior / invariants:** `parseFeePercent("1.5%") === 0.015`; `parseFeePercent("10%") === 0.1`; `parseFeePercent("0.8%") === 0.008` — matches `OB_MODEL_CATALOG`'s existing seed strings (`"1.0%"`, `"1.5%"`, `"0.75%"`, `"0.8%"`) exactly. A bare number without `%` (e.g. a user retyping "1.5") parses identically, since the regex only strips non-numeric characters — it does not require the `%` to be present.

**Done when:** `StartOnboardingReq.mgmt_fee`/`incentive_fee` sent to the backend are always in the `[0, 1)`-ish fraction range the DTO expects, never a raw percentage integer (e.g. never `1.5` where `0.015` was meant).

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal § 4.1 / § 4.2)

```python
# ---- Shared enums (persisted lowercase; see native_enum=False convention) --------
OnboardingStatus = Literal["initial", "reviewing", "pending_review", "active"]
OnboardingKind   = Literal["initial", "renewal"]
DocStatus        = Literal["not_started", "uploaded", "in_review", "verified", "rejected", "expired"]
AllotRdmpStatus  = Literal["pending", "acknowledged"]
AllotRdmpKind    = Literal["allotment", "redemption"] # this proposal only ever writes "allotment"

# ---- Field-name ↔ column-name map (the ones that differ) ------------------------
#  API/DTO field         DB column                       Notes
#  units | multiplier    onboarding.multiplier /         FE forms call it modelUnit/mult/units;
#                        client_allotment_redemptions.multiplier /   persisted as `multiplier` Numeric(28,10)
#                        client_subscriptions.multiplier
#  docType               onboarding_documents.doc_type    stable config KEY, not the display label
#  verdict "valid"       doc status -> "verified"         Compliance verdict maps to a status
#  verdict "issue"       doc status -> "rejected"
#  verdict null          doc status stays "in_review"     unreviewed
#  mgmt_fee/incentive_fee onboarding.mgmt_fee/incentive_fee -> compared at approve against Model.mgmt_fee/incentive_fee;
#                        client_subscriptions.*_override      only written to *_override if it diverges, else stays NULL
#                        (NULL == "inherit the model default", never a calculated value)
#  --- widened 2026-07-20 (D-9): full field parity with the pre-existing mocks ---
#  primary_phone/address/  ClientProfile.primary_phone/        NOT duplicated onto client_onboardings — OnboardingDTO
#  country_of_residence    address/country_of_residence        assembly joins ClientProfile, already captured at client creation
#  assigned_rm (display)   users.name via ClientProfile.assigned_rm_uid -> AdminProfile lookup, resolved server-side
#  agg_before/agg_after    client_allotment_redemptions.        snapshotted once at insert (Backend C-2), never recomputed later —
#                          agg_before/agg_after                 preserves historical accuracy as more clients subscribe afterward
#  expected_cash_in        client_allotment_redemptions.        snapshotted at insert = created_at + ONBOARDING_SETTLEMENT_DAYS (config)
#                          expected_cash_in
#  (client-frontend / SubscriptionDTO / ClientEventDTO are explicitly OUT of scope for this widening — see D-9)

# ---- RM: start / board / documents / submit ------------------------------------
class StartOnboardingReq(BaseModel):          # POST /api/rm/onboardings  -> 201
    client_name: str; email: EmailStr; primary_phone: str
    address: str; country_of_residence: str
    id_type: str; id_number: str
    ibhk_account: str; sw_account: str
    model_id: UUID; units: Decimal            # "Initial Model to Subscribe" + "Model Unit"
    mgmt_fee: Decimal; incentive_fee: Decimal # the agreed fee (fraction, e.g. 0.015); FE converts its "1.5%" display string before sending
    kind: OnboardingKind = "initial"
    # docs uploaded separately via the document route (form may submit with 0..7 docs)

class DocumentDTO(BaseModel):
    doc_type: str; label: str; status: DocStatus
    filename: str | None; required: bool; periodic_review: bool
    issue_note: str | None; reviewed_at: datetime | None; expires_at: datetime | None
    can_reupload: bool                        # server-computed: status in {not_started,uploaded,rejected,expired}

class OnboardingDTO(BaseModel):               # widened 2026-07-20 for full field parity with the pre-existing RM/Compliance mocks — see D-9
    id: UUID; user_id: UUID
    client_name: str; email: str; assigned_rm: str   # assigned_rm: display name, service resolves ClientProfile.assigned_rm_uid -> AdminProfile/User.name
    client_ref: str                            # display code e.g. "MEGA-0481" — server-formatted from user_id, not stored
    primary_phone: str; address: str; country_of_residence: str   # sourced from ClientProfile (already captured at client creation) via join — NOT duplicated onto client_onboardings
    id_type: str; id_number: str               # sourced from client_onboardings (DB B-1) — the one genuinely new pair of columns this widening adds
    ibhk_account: str; sw_account: str         # sourced from client_onboardings — these columns already existed in DB B-1; this widening only adds them to the DTO
    status: OnboardingStatus; kind: OnboardingKind
    model_id: UUID; model_name: str; units: Decimal
    mgmt_fee: Decimal; incentive_fee: Decimal  # the agreed fee as captured at onboarding — same fields StartOnboardingReq sent in; echoed back for the RM/Compliance detail panels
    verified_count: int; required_count: int   # e.g. 6 / 7 — computed from documents
    reject_reason: str | None
    submitted_at: datetime | None; created_at: datetime
    documents: list[DocumentDTO]               # present on detail, omitted on board list

class BoardDTO(BaseModel):                      # GET /api/rm/onboardings -> 200
    initial: list[OnboardingDTO]; reviewing: list[OnboardingDTO]
    pending_review: list[OnboardingDTO]; active: list[OnboardingDTO]

# POST /api/rm/onboardings/{id}/documents/{doc_type}   multipart file -> 200 DocumentDTO
#   409 if the doc's can_reupload is false (in_review | verified)
# POST /api/rm/onboardings/{id}/submit                 -> 200 OnboardingDTO
#   409 if any required doc is not uploaded; sets status reviewing, docs -> in_review

# ---- Compliance: review / verdict / decide -------------------------------------
# GET  /api/compliance/onboardings                     -> 200 list[OnboardingDTO] (reviewing + decided history)
# GET  /api/compliance/onboardings/{id}/documents/{doc_type}/download -> 200 file stream
class VerdictReq(BaseModel):                    # POST .../documents/{doc_type}/verdict -> 200 DocumentDTO
    verdict: Literal["valid", "issue"]; note: str | None = None
# POST /api/compliance/onboardings/{id}/approve        -> 200 OnboardingDTO
#   409 unless every required doc is "verified"; runs §4.2 side-effects atomically
class RejectReq(BaseModel):                     # POST /api/compliance/onboardings/{id}/reject -> 200
    reason: str | None = None                  # flagged docs already marked "issue" via verdict route

# ---- PC: allotments ------------------------------------------------------------
class AllotRdmptDTO(BaseModel):                  # GET /api/pc/allotments -> 200
    id: UUID; reference: str                    # "Client anonymized · {reference}"; UUID-derived e.g. "AL-3F9A2C" — no sequence, no client identity crosses this seam
    model_id: UUID; model_name: str; units: Decimal; amount: Decimal   # amount = units * model.model_size
    kind: AllotRdmpKind; status: AllotRdmpStatus; note: str | None    # note e.g. "initial allotment"
    agg_before: Decimal; agg_after: Decimal     # widened 2026-07-20 — snapshotted at insert time (DB B-3), NOT recomputed live; = sum(client_subscriptions.multiplier) for this model_id, before/after this row's `units`
    expected_cash_in: datetime | None           # widened 2026-07-20 — settlement date, snapshotted at insert time as created_at + a fixed settlement lag (Backend C-2)
    rm: str; created_at: datetime; acknowledged_at: datetime | None
# POST /api/pc/allotments/{id}/acknowledge             -> 200 AllotRdmptDTO  (pending -> acknowledged)

# ---- Client (own records only, scoped to the authenticated client user) --------
class SubscriptionDTO(BaseModel):              # GET /api/client/subscriptions -> 200 list
    model_id: UUID; model_name: str; units: Decimal; ib_account: str | None
    # Not widened — client-frontend (Portfolio/Events) is explicitly OUT of scope for the
    # 2026-07-20 seam-widening pass (D-9); it stays as originally specified. See D-9's note.
class ClientEventDTO(BaseModel):               # GET /api/client/events -> 200 list
    id: UUID; category: str; title: str; body: str; created_at: datetime
    # icon/level/action-label chrome the client Event page renders is NOT part of this DTO — see D-9:
    # it is a static category -> {icon, level, primaryLabel, secondaryLabel, href} lookup table owned by the
    # Frontend layer, keyed on `category` (a closed, small set: "Account Notification" today). No backend
    # field is added for this — it would be speculative storage for what is, today, a pure styling constant.
    # (Portfolio/SubscriptionDTO is NOT widened this way — see D-9's scope note; this Events treatment is
    # an explicit exception because it needs zero new storage of any kind, unlike Portfolio's gaps.)
```

**Status projection (verbatim, § 4.2):**

| DB `client_onboardings.status` | RM board column | Compliance `ObStatus` | Client can log in? |
|---|---|---|---|
| `initial` | Initial Onboarding | (not shown) | no (`users.status` still `DISABLED`) |
| `reviewing` | Reviewing | `pending` | depends on `kind` — see proposal § 4.2's note |
| `pending_review` | Pending for Review | `rejected` | depends on `kind` — see proposal § 4.2's note |
| `active` | Active | `approved` | yes (`users.status` is `ACTIVE`) |

Routes (verbatim, § Layer 2-D):
```
POST   /api/rm/onboardings                                  start a cycle (create client + docs)
GET    /api/rm/onboardings                                  kanban board (grouped by status)
GET    /api/rm/onboardings/{id}                             cycle detail + documents
POST   /api/rm/onboardings/{id}/documents/{doc_type}        upload / reupload one doc
POST   /api/rm/onboardings/{id}/submit                      Submit All -> reviewing
GET    /api/compliance/onboardings                          review queue + history
GET    /api/compliance/onboardings/{id}/documents/{doc_type}/download   fetch a doc
POST   /api/compliance/onboardings/{id}/documents/{doc_type}/verdict    valid | issue
POST   /api/compliance/onboardings/{id}/approve            all verified -> active (+ side-effects)
POST   /api/compliance/onboardings/{id}/reject             -> pending_review
POST   /api/pc/allotments/{id}/acknowledge                 pending -> acknowledged
GET    /api/pc/allotments                                  allotments tab (pending + history)
GET    /api/client/subscriptions                           client's subscribed models
GET    /api/client/events                                  client's onboarding event(s)
```

### 7.2 How this layer honours the seam
- **What this layer contributes to the seam:** consumes every DTO/route above verbatim; maps `OnboardingStatus`/`kind` onto the RM board's 4 columns and the Compliance page's `ObStatus` per the § 4.2 table exactly; parses the modal's fee display strings to fractions before sending (`StartOnboardingReq.mgmt_fee`/`incentive_fee`); gates the RM upload affordance on `DocumentDTO.can_reupload`; renders `DocumentDTO.label` server-side instead of a hardcoded name list; computes the PC page's `amount` from `AllotRdmptDTO.amount` with zero local re-derivation. **Widened 2026-07-20 (D-9):** the RM/Compliance detail views render `OnboardingDTO`'s `primary_phone`/`address`/`country_of_residence`/`id_type`/`id_number`/`ibhk_account`/`sw_account`/`assigned_rm`/`client_ref` directly, no `"—"` fallback; the PC allotments table/detail panel render `AllotRdmptDTO.agg_before`/`agg_after`/`expected_cash_in` directly, with zero client-side aggregate computation. Portfolio/`SubscriptionDTO` and `ClientEventDTO` are unaffected by the widening — see D-9's scope note and Layer 3 A-4.
- **What this layer assumes from the other side:** the Backend returns every DTO exactly as in § 7.1, including status strings matching the enum literals verbatim; `verified_count`/`required_count`/`can_reupload`/`amount`/`agg_before`/`agg_after`/`expected_cash_in` arrive precomputed (this layer never recomputes them); `client_allotment_redemptions.reference` is already anonymized (no client identity ever reaches `AllotRdmptDTO`).
- **Change protocol:** any edit here requires editing the proposal § 4 first; this section is then re-copied. The seam is never renegotiated between this doc and a sibling layer doc directly.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Framework / runner:** vitest — commands: `cd admin-frontend && npx vitest run`, `cd client-frontend && npx vitest run` (`vitest.config.ts` present in both apps per [[docgen_toolchain_setup]]).
- **Fixtures / seed:** hand-built `BoardDTO` / `OnboardingDTO[]` / `AllotRdmptDTO[]` / `SubscriptionDTO[]` / `ClientEventDTO[]` fixtures covering: a client at each of the 4 statuses (with the widened `OnboardingDTO` fields populated, D-9), a doc at each of the 6 `DocStatus` values, an allotment with `agg_before`/`agg_after`/`expected_cash_in` set (to exercise the FE-5 mapper's pass-through, not a derivation).
- **Isolation:** `vi.mock` replaces each `actions.ts` module (admin-frontend hook tests) and `@/lib/api/onboarding` (client-frontend hook tests) — hermetic, no real fetch, no real Firebase.
- **Layer isolation (critical):** tests import only this layer's own code plus vitest/test doubles. They never spin up the Backend, never hit a real `/api/rm|/compliance|/pc|/client` endpoint, never import DB/BE code. Where a test needs the other side of the seam, it mocks the seam (a canned DTO in, a canned `APIResult` or thrown error) via `vi.fn()`, using § 7 as the fake's shape.
- **Test location:** `admin-frontend/tests/` and `client-frontend/tests/`, each mirroring source paths (e.g. `admin-frontend/tests/hooks/useOnboardingBoard.test.ts`), per each app's `.gitignore`'d `tests/` entry.
- **Commit policy:** tests are never committed — `tests/` is git-ignored on both apps.
- **Code generation:** the `test-gen` skill writes the concrete tests from § 8.2/8.3.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| FE-1 | `fetchBoard`/`startOnboarding`/`uploadDocument`/`submitAll`/`fetchComplianceQueue`/`downloadDocument`/`submitVerdict`/`approveOnboarding`/`rejectOnboarding`/`fetchAllotments`/`acknowledgeAllotment` each call the correct endpoint/method | mocks `@/server/api-client`'s `apiClient`/`apiClientFormData` |
| FE-2 | each action returns success/failure `APIResult`; catches thrown errors | mocks `@/server/onboarding`'s corresponding function |
| FE-3 | `mapBoardToColumns` buckets rows into the 4 columns correctly; `mapRow` passes `phone`/`address`/`country`/`idType`/`idNumber`/`ibhkAccount`/`swAccount`/`clientRef` straight through from the widened `OnboardingDTO` (D-9); hook's loading→data transition; `can_reupload` gating logic; `startOnboarding`/`uploadDocument`/`submitAll` trigger a refetch on success | mocks `@/app/(roles)/rm/onboarding-renewal/actions` |
| FE-4 | `OB_STATUS_MAP` maps `reviewing→pending`, `pending_review→rejected`, `active→approved` per §4.2; `docStatusToVerdict` maps `verified→valid`, `rejected→issue`, else `null`; `mapOnboardingToRow` passes `phone`/`address`/`country`/`idType`/`idNumber`/`ibhk`/`silverwate`/`clientRef` straight through from the widened `OnboardingDTO` (D-9), no `"—"` fallback; verdict/approve/reject/download hook methods trigger a refetch (except download) | mocks `@/app/(roles)/compliance/review/actions` |
| FE-5 | `mapAllotmentsToView`'s `aggBefore`/`aggAfter`/`expectedCashIn` pass through verbatim from `AllotRdmptDTO.agg_before`/`agg_after`/`expected_cash_in` (D-9), with zero client-side computation; `amount` passes through from the DTO unchanged; acknowledge triggers a refetch | mocks `@/app/(roles)/pc/allotment-redemption/actions` |
| FE-6 | `fetchSubscriptions`/`fetchEvents` build the correct URL and Bearer header; a non-ok response throws with the parsed `detail` | mocks global `fetch` |
| FE-7 | `mapSubscription`'s field mapping (`model_name→name`, `units→multiplier` formatted `"Nx"`, `ib_account→ibAccount`, unavailable fields → `"—"`); hook's loading/error states | mocks `@/lib/api/onboarding`'s `fetchSubscriptions` |
| FE-8 | `mapEvent`'s fixed-chrome mapping; a fetch failure yields an empty array (fail-silent), not a thrown error into the page | mocks `@/lib/api/onboarding`'s `fetchEvents` |
| FE-9 | `parseFeePercent` converts `"1.5%"→0.015`, `"10%"→0.1`, a bare `"1.5"→0.015`; throws on empty/garbage input | none (pure function) |

### 8.3 Test goals

#### FE-1
- **Positive:** each function builds the path documented in § 7.1's route list and passes through the correct HTTP method/body; `uploadDocument` is called with a `FormData` body via `apiClientFormData`, not `apiClient`.
- **Negative:** a mocked `apiClient` failure response passes through unchanged.
- **Invariants:** `doc_type` and other path segments are URI-encoded where the endpoint builder does so.
- **Seam mocks:** `apiClient`/`apiClientFormData` mocked to `vi.fn()`s recording call args and returning canned `APIResult`s.

#### FE-2
- **Positive:** each action returns the same `{ success: true, data }` its FE-1 counterpart does.
- **Negative:** a thrown error from the mocked FE-1 function converts to `{ success: false, error, code: "ACTION_ERROR" }`, not re-thrown.
- **Invariants:** logging calls never throw even if `logger` itself is mocked away.
- **Seam mocks:** each role's `@/server/onboarding` functions mocked individually.

#### FE-3
- **Positive:** `mapBoardToColumns` on a 4-bucket fixture produces 4 columns with the right `label`/`status`/`clients.length`; `mapRow` on an `OnboardingDTO` fixture produces `phone`/`address`/`country`/`idType`/`idNumber`/`ibhkAccount`/`swAccount`/`clientRef` equal to the DTO's `primary_phone`/`address`/`country_of_residence`/`id_type`/`id_number`/`ibhk_account`/`sw_account`/`client_ref` verbatim (D-9 — no `"—"` fallback, these are real fields now); the hook transitions `loading:true→false` with `data` populated; `startOnboarding`/`uploadDocument`/`submitAll` each call `refetch` (a second `fetchBoard`) after a successful mutation.
- **Negative:** a mocked `fetchBoard` failure sets `error` and leaves `data` at `null`; `uploadDocument` on a doc with `can_reupload:false` is never called by the (mocked) component logic — asserted at the mapper/gating-function level, not the full component.
- **Invariants:** the chip-tone derivation is a pure function of `verifiedCount`/`requiredCount` (0 → neutral, partial → amber, equal → green) regardless of `requiredCount`'s actual value (works whether the doc config seeds 7 docs or a future N).
- **Seam mocks:** `@/app/(roles)/rm/onboarding-renewal/actions`'s four exports mocked.

#### FE-4
- **Positive:** `OB_STATUS_MAP` produces the exact 3-row mapping from § 4.2 for all three non-`initial` statuses; `docStatusToVerdict` produces the exact 3-way mapping for all 6 `DocStatus` values (only `verified`/`rejected` are non-null); `mapOnboardingToRow` on an `OnboardingDTO` fixture produces `phone`/`address`/`country`/`idType`/`idNumber`/`ibhk`/`silverwate`/`clientRef` equal to the DTO's corresponding widened fields verbatim (D-9 — no `"—"` fallback); `submitVerdict`/`approve`/`reject` each trigger a refetch on success; `download` does not trigger a refetch (read-only).
- **Negative:** a mocked verdict/approve/reject failure surfaces `error` without mutating local state optimistically.
- **Invariants:** `mapOnboardingToRow` never throws on a fully-populated `OnboardingDTO` fixture; none of its output fields default to `"—"` any more (that degradation is gone — see D-9).
- **Seam mocks:** `@/app/(roles)/compliance/review/actions`'s five exports mocked.

#### FE-5
- **Positive:** for an `AllotRdmptDTO` fixture with `agg_before: 2, agg_after: 5, expected_cash_in: "2026-08-01T00:00:00Z"`, `mapAllotmentsToView` yields `aggBefore: 2, aggAfter: 5, expectedCashIn: "2026-08-01T00:00:00Z"` verbatim (D-9 — no cumulative-sum computation, no `"—"` fallback); `acknowledge` triggers a refetch on success.
- **Negative:** a mocked `fetchAllotments` failure sets `error` and leaves `data` at `null`.
- **Invariants:** `amount`/`aggBefore`/`aggAfter`/`expectedCashIn` in the view always equal the DTO's `amount`/`agg_before`/`agg_after`/`expected_cash_in` verbatim — the mapper performs no arithmetic on any of them, even across multiple rows sharing a `model_id`.
- **Seam mocks:** `@/app/(roles)/pc/allotment-redemption/actions`'s two exports mocked.

#### FE-6
- **Positive:** `fetchSubscriptions("tok")` calls `fetch` with `Authorization: Bearer tok` and the documented path; a 200 response resolves to the parsed JSON array.
- **Negative:** a mocked 403 response throws an `Error` whose message includes the response's `detail` field.
- **Invariants:** a `null` token omits the `Authorization` header entirely rather than sending `Bearer null`.
- **Seam mocks:** global `fetch` mocked via `vi.stubGlobal("fetch", vi.fn())`.

#### FE-7
- **Positive:** `mapSubscription` on a full `SubscriptionDTO` fixture produces `multiplier` formatted as `"2.0x"` for `units: 2`, `ibAccount` passed through, and the four gap fields all `"—"`; the hook's `loading`→`data` transition matches FE-3's pattern.
- **Negative:** a mocked `fetchSubscriptions` rejection sets `error` and leaves `data` at `[]` (never `undefined`, since the page always maps over it).
- **Invariants:** `mapSubscription` never throws on a DTO with `ib_account: null`. `SubscriptionDTO`'s fixture shape stays exactly `model_id`/`model_name`/`units`/`ib_account` — the 2026-07-20 D-9 widening pass explicitly does **not** touch this DTO (see proposal D-9 / Layer 3 A-4); a test asserting `symbol`/`country`/`sector`/`amount`/`modelLimit` appear anywhere on `SubscriptionDTO` itself, rather than only on the derived `SubscribedModelView`, would indicate scope creep.
- **Seam mocks:** `@/lib/api/onboarding`'s `fetchSubscriptions` mocked.

#### FE-8
- **Positive:** `mapEvent` on a `ClientEventDTO` fixture produces `category: "Account Notification"`, `iconType: "shield"`, `title`/`description` passed through from `title`/`body`.
- **Negative:** a mocked `fetchEvents` rejection resolves the hook's `data` to `[]` rather than throwing into the page (fail-silent, per the unit's stated behavior).
- **Invariants:** the merged `allItems` array in `events/page.tsx` always includes every `MOCK_EVENT_ITEMS` entry regardless of the live fetch's outcome (asserted at the mapping-logic level, not a full component render).
- **Seam mocks:** `@/lib/api/onboarding`'s `fetchEvents` mocked.

#### FE-9
- **Positive:** `parseFeePercent("1.5%") === 0.015`; `parseFeePercent("10%") === 0.1`; `parseFeePercent("0.8%") === 0.008`; `parseFeePercent("1.5") === 0.015` (no `%` required).
- **Negative:** `parseFeePercent("")` and `parseFeePercent("abc")` both throw.
- **Invariants:** round-trip stability — parsing every string in `OB_MODEL_CATALOG`'s seed (`"1.0%"`, `"1.5%"`, `"0.75%"`, `"0.8%"`, `"10%"`, `"20%"`, `"8%"`) never throws and always yields a value in `(0, 1)`.
- **Seam mocks:** none (pure function).

### 8.4 Aggregate gate
- All unit tests green is a local gate run before commit/PR hand-off (§ 3.2). A red test blocks the unit; tests themselves are never committed.
- Target coverage: ≥ 90% of new/changed statements in `lib/onboarding/`, `server/onboarding/`, `hooks/api/use{OnboardingBoard,ComplianceQueue,Allotments}.ts` (admin-frontend) and `lib/api/onboarding.ts`, `lib/hooks/use{Subscriptions,OnboardingEvents}.ts` (client-frontend). Page-component render tests (FE-3/4/5/7/8's page-level diffs) are thin enough that a couple of branch-coverage tests suffice, matching `docs/implementations/012-trade-recon-integration-fe.md`'s FE-5 precedent.
- Chosen `test-gen` level for this layer: `standard`.

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] FE-1 through FE-9 committed on `client-onboarding-integration-fe`; each commit left both apps' builds green.
- [ ] § 8 unit tests all pass; `cd admin-frontend && npx vitest run && npx tsc --noEmit && npx next lint` and `cd client-frontend && npx vitest run && npx tsc --noEmit && npx next lint` both green.
- [ ] § 7 matches the proposal's frozen seam verbatim. Checked against the proposal on the parent branch, **not** against the DB/BE layers' branches (not visible here).
- [ ] `git grep KYC_COLS`, `git grep CO_ONBOARDING`, `git grep AR_ALLOTMENTS_SEED`, `git grep MOCK_SUBSCRIBED_MODELS` all return zero hits.
- [ ] Both admin-frontend pages (RM board, Compliance review, PC allotments) and both client-frontend pages (Portfolio, Events) render against a live seeded Backend endpoint with the same visual layout as today (human-verified, proposal's Execution & verification § 3(c)).
- [ ] PR opened; human owns the merge to `client-onboarding-integration`.

**Rollback:** reverting the branch restores `lib/mock/rm-data.ts`'s `KYC_COLS`/`KYC_DOCS`, `lib/compliance/mock.ts`'s `CO_ONBOARDING`, `lib/pc/allotment-redemption-mock.ts`'s `AR_ALLOTMENTS_SEED`, and `client-frontend/lib/mock/data.ts`'s `MOCK_SUBSCRIBED_MODELS` (all recoverable from git history) — every page returns to fully mock-backed rendering with zero data loss, since this layer never writes anything of its own (it is a pure consumer of the Backend's onboarding state machine; DB/Backend rollback is a separate, sibling-layer concern per their own docs).
