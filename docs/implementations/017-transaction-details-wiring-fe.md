# 017 — Transaction Details Wiring · Implementation Details — Frontend

> Status: **DRAFT — pending implementation.**
> Implements: proposal `docs/proposals/017-2026-07-24-transaction-details-wiring.md` § "Layer 3 — Frontend"
> Layer: Frontend — **one layer per file.**
> Sibling layer docs: `docs/implementations/017-transaction-details-wiring-db.md` (Database), `docs/implementations/017-transaction-details-wiring-be.md` (Backend)
> Execution schedule: `docs/execution-schedules/017-transaction-details-wiring-fe.md`
> Builds on / prerequisites: the Backend layer's 2 new routes (`POST /api/rm/allotments/{id}/transaction-detail`, `GET /api/rm/allotments/{id}/transaction-detail`) as a **contract precondition, not a runtime one** — per the template's isolation rule (§2), this layer is built entirely against the frozen seam in §7 and does not need the Backend layer's code to exist or be merged. Only genuine end-to-end (cross-layer) testing requires the routes live; this layer's own unit tests (§8) mock the seam.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/017-2026-07-24-transaction-details-wiring.md` § "Layer 3 — Frontend" (+ § 4 frozen seam) |
| Execution schedule | `docs/execution-schedules/017-transaction-details-wiring-fe.md` |
| Sibling layer impl docs | `docs/implementations/017-transaction-details-wiring-db.md` (Database), `docs/implementations/017-transaction-details-wiring-be.md` (Backend) |
| Builds on | Backend layer's 2 new routes (§4.1/§4.2 of the proposal) — contract-only precondition, see note above |

---

## 2. Branch & session contract

- **Branch:** `transaction-details-wiring-fe` — all work units in this doc land on this one branch.
  - **Naming convention:** parent branch `transaction-details-wiring` + `-fe` suffix.
  - The parent branch is captured at session start; this layer branch is cut from it and merges back into it — **the human owns that merge**.
- **Isolation:** implementable in a separate session on its own branch, in parallel with the DB and Backend layers, provided the preconditions below hold. Shares state with sibling layers **only** through the pinned contract in §7.
- **Preconditions (must be true before starting):**
  - [ ] The frozen seam in proposal §4 is agreed and unchanged — §7 below is a verbatim copy, not a negotiation.
  - [ ] No live-DB or live-Backend dependency — this layer compiles, type-checks, and unit-tests green against seam mocks alone.
- **Read-first inventory** (every existing file a unit touches):
  - `admin-frontend/components/rm/TransactionDetailModal.tsx` — the currently no-op form modal (all state client-only, `onSave` just calls the passed-in callback). Header `ponytail:` comment (lines 11-14) already documents the exact gap this layer closes.
  - `admin-frontend/components/rm/SubscriptionAccordion.tsx` — `TxnTable` reads `r[10]` as `txnId` (L75) and `r[9]` as `status` (L76, via `statusToChip`) already — an 11-element `TxnRow`. `filled` state (L307, `useState<Record<string, TransactionDetails>>`) is the ephemeral state this layer replaces. `onFileDetails` (passed down through `ModelAccordionItem`/`TxnTable`) currently just opens the modal unconditionally in edit mode (L328-340).
  - `admin-frontend/lib/mock/rm-data.ts` — `TxnRow` (L221-226, currently an 11-element tuple: 9 display cells + `AllotRdmpStatus | ""` + optional `string` transaction id).
  - `admin-frontend/lib/rm/subscriptions.ts` — `allotmentToTxnRow` (L64-83, maps `AllotRdmptDTO` → the 11-tuple `TxnRow`, appending `dto.status` then `dto.id`), `netRow` (L47-53), `statusToChip` (L13-26).
  - `admin-frontend/lib/onboarding/types.ts` — `AllotRdmptDTO` (L85-97, no `has_transaction_detail` field yet).
  - `admin-frontend/server/endpoints.ts` — `ENDPOINTS.RM` object (L26-43, `RM = "/api/rm"` prefix).
  - `admin-frontend/server/rm/index.ts` — `submitAllotment`/`submitRedemption` (L27-39), the exact POST-call pattern this layer's new functions follow.
  - `admin-frontend/server/api-client.ts` — `apiClient<T>(path, init?)` returns `APIResult<T>`; POST usage sets `method: "POST", body: JSON.stringify(req)` (Content-Type set by `buildHeaders`).
  - `admin-frontend/app/(roles)/rm/model-subscription/actions.ts` — `submitAllotment`/`submitRedemption` server actions (L35-53), the `toErrorResult` wrapper pattern every new action follows.
  - `admin-frontend/hooks/api/useSubscriptions.ts` — `invalidateClientAllotments` (L49-51) — already exists and is exactly what this layer calls after a successful transaction-detail filing to refresh `has_transaction_detail` for that client's ledger.
  - `admin-frontend/components/rm/Shared.tsx` — `Modal` component (L23+): `title`, `subtitle`, `onClose`, `children`, `footer`, `width`, `centered` props — the shell `TransactionDetailModal` already renders inside; this layer does not change `Modal` itself.
  - `admin-frontend/components/ui/Button.tsx` — already accepts `disabled`.
- **Hand-off / exit signal:** all FE-* units committed, `npx vitest run && npx tsc --noEmit && npx next lint` green, PR opened against `transaction-details-wiring`.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- **Layering:** `app/(roles)/rm/model-subscription/actions.ts` (`"use server"`) → `server/rm/index.ts` (`"use server"`, calls `apiClient`) → `server/api-client.ts` (raw fetch + auth). Client components (`"use client"`) call **only** the server actions in `actions.ts`, never `server/rm` or `apiClient` directly.
- **Error envelope:** every server action returns `APIResult<T> = { success: true; data: T } | { success: false; error: string; code: string }`. `actions.ts` wraps the `server/rm` call in `try/catch` and funnels any thrown error through the local `toErrorResult` helper.
- **Decimal-as-number:** per the existing convention, `settlement_amount` crosses the wire as a JSON number, not a string.
- **Date/time-as-string:** `transaction_date`/`transaction_time` cross the wire as plain strings (`"YYYY-MM-DD"` / `"HH:MM"`), matching the native `<input type="date">`/`<input type="time">` values `TransactionDetailModal` already produces — no client-side Date object parsing needed.
- **POST convention:** `apiClient<T>(path, { method: "POST", body: JSON.stringify(req) })`. No new helper needed.

### 3.2 CI/CD & engineering discipline
- Each FE-* unit is a small, independently-revertible commit that leaves the branch green (type-checks, lints, unit tests pass).
- Additive-first: FE-1 (type widening) is additive to `AllotRdmptDTO`/`TxnRow` — no consumer of the old shapes breaks (`has_transaction_detail` defaults meaningfully via `?? false`, the new `TxnRow` element is appended, not inserted).
- **Gates before merge**, confirmed configured in `admin-frontend/package.json` (`"test": "vitest run"`, `vitest`, `@testing-library/react`/`jest-dom` present as devDependencies):
  ```bash
  npx vitest run && npx tsc --noEmit && npx next lint
  ```
- No secrets, no manual steps in the merge path. The only human step is the PR merge itself.

---

## 4. Architecture

**Target layout (new/changed files only):**
```
admin-frontend/
  lib/onboarding/types.ts                          # FE-1: has_transaction_detail on AllotRdmptDTO, 2 new DTOs
  server/endpoints.ts                               # FE-2: 1 new ENDPOINTS.RM entry
  server/rm/index.ts                                # FE-2: fileTransactionDetail, getTransactionDetail
  app/(roles)/rm/model-subscription/actions.ts       # FE-2: server-action wrappers
  lib/mock/rm-data.ts                                # FE-3: widen TxnRow to 12-tuple
  lib/rm/subscriptions.ts                            # FE-3: allotmentToTxnRow appends has_transaction_detail
  components/rm/TransactionDetailModal.tsx           # FE-4: mode="edit"|"view", view-only rendering
  components/rm/SubscriptionAccordion.tsx            # FE-5: wire Save to POST; fetch+view-mode on click; drop ephemeral `filled` state
```

**Dependency direction:** `SubscriptionAccordion` (view) → `actions.ts` (server action) → `server/rm` (API client wrapper) → `server/api-client` (transport). `lib/rm/subscriptions.ts` is a pure mapping module imported by both the hook and the accordion; it imports types only, never `server/*`. `TransactionDetailModal` remains presentation-only — it receives data/callbacks as props and does not call `actions.ts`/`server/*` itself (kept consistent with `SubscriptionFormModal`'s own architecture from proposal 016's FE layer, where the modal owns submit UX but the parent owns data refresh).

**External seams:** consumes `POST /api/rm/allotments/{id}/transaction-detail` and `GET /api/rm/allotments/{id}/transaction-detail` (this layer's calls); reads the widened `has_transaction_detail` field on `AllotRdmptDTO` returned by the existing `GET /api/rm/subscriptions/{client_id}/allotments`.

---

## 5. Modules

### 5.1 `lib/onboarding/types.ts` (DTO types)
- **Responsibility:** shared TS mirror of the backend Pydantic DTOs for the transaction-detail domain, plus the `has_transaction_detail` widening.
- **Files:** `admin-frontend/lib/onboarding/types.ts`.
- **Public surface:** `TransactionDetailRequest`, `TransactionDetailDTO`, widened `AllotRdmptDTO`.
- **Owns features:** FE-1.

### 5.2 `server/rm` + `server/endpoints` + `actions.ts` (transaction-detail read/write path)
- **Responsibility:** typed POST/GET calls to the 2 new transaction-detail routes, exposed to client components as server actions returning `APIResult<...>`.
- **Files:** `admin-frontend/server/endpoints.ts`, `admin-frontend/server/rm/index.ts`, `admin-frontend/app/(roles)/rm/model-subscription/actions.ts`.
- **Public surface:** `fileTransactionDetail(allotmentId, req)`, `getTransactionDetail(allotmentId)` (both layers: `server/rm` internal, `actions.ts` client-facing).
- **Owns features:** FE-2.

### 5.3 `lib/mock/rm-data.ts` + `lib/rm/subscriptions.ts` (row shape)
- **Responsibility:** carry `has_transaction_detail` through the `TxnRow` tuple so `SubscriptionAccordion` can decide edit-vs-view mode without a separate lookup.
- **Files:** `admin-frontend/lib/mock/rm-data.ts`, `admin-frontend/lib/rm/subscriptions.ts`.
- **Public surface:** widened `TxnRow` type; `allotmentToTxnRow` appends the new element.
- **Owns features:** FE-3.

### 5.4 `TransactionDetailModal` (view/edit dual-mode UI)
- **Responsibility:** render either the existing editable form (unfiled record) or a read-only display of previously-filed transaction details (filed record) — same modal shell, no layout change to the field grid.
- **Files:** `admin-frontend/components/rm/TransactionDetailModal.tsx`.
- **Public surface:** widened props (`mode`, `details`, `loading`).
- **Owns features:** FE-4.

### 5.5 `SubscriptionAccordion` (orchestration)
- **Responsibility:** decide edit-vs-view mode per clicked row, fetch existing details for view mode, wire Save to the POST action, refresh data on success, drop the ephemeral `filled` state.
- **Files:** `admin-frontend/components/rm/SubscriptionAccordion.tsx`.
- **Public surface:** unchanged external props; internal state reshaped.
- **Owns features:** FE-5.

---

## 6. Features

### FE-1 — Add transaction-detail DTOs + widen `AllotRdmptDTO` (Yes — user req.)

- **Proposal ref:** § "Layer 3 — Frontend" Goal 4/5; § 4.1
- **Module:** 5.1
- **Files:** `modify: admin-frontend/lib/onboarding/types.ts`
- **Dependencies:** none — parallel-safe

**Contract:**
```ts
// lib/onboarding/types.ts

export interface TransactionDetailRequest {
  bank_account: string;
  settlement_amount: number;       // Decimal-as-number
  transaction_date: string;        // "YYYY-MM-DD"
  transaction_time: string;        // "HH:MM" or "HH:MM:SS"
  currency: string;                // one of USD | CHF | AUD | GBP | EUR | CAD | HKD
  reference_no?: string | null;
}

export interface TransactionDetailDTO {
  id: string;
  allotment_id: string;
  bank_account: string;
  settlement_amount: number;
  transaction_date: string;
  transaction_time: string;
  currency: string;
  reference_no: string | null;
  filed_by: string;
  filed_at: string;
}

export interface AllotRdmptDTO {
  // ...existing fields (id, reference, model_id, model_name, units, amount,
  //   kind, status, note, agg_before, agg_after, expected_cash_in, rm,
  //   created_at, acknowledged_at, emergent, expected_cash_out, decided_by,
  //   decided_at, reject_reason) — UNCHANGED...
  has_transaction_detail: boolean;   // NEW — widened 2026-07-24 (proposal 017, BE-4)
}
```

**Behavior / invariants:** `has_transaction_detail` is a plain required `boolean` on the TS type (the backend DTO's own default is `false`, and the backend always populates it per BE-4's contract — no optional-chaining needed on the frontend). No existing consumer of `AllotRdmptDTO` breaks — every existing field is untouched.

**Done when:** `admin-frontend` type-checks (`npx tsc --noEmit`) with the 2 new interfaces and the widened `AllotRdmptDTO` in place, no other file edited.

---

### FE-2 — Transaction-detail endpoints + API client functions + server actions (Yes — user req.)

- **Proposal ref:** § "Layer 3 — Frontend" Goal 3
- **Module:** 5.2
- **Files:** `modify: admin-frontend/server/endpoints.ts`, `modify: admin-frontend/server/rm/index.ts`, `modify: admin-frontend/app/(roles)/rm/model-subscription/actions.ts`
- **Dependencies:** FE-1 (needs the request/response DTO types)

**Contract:**
```ts
// server/endpoints.ts — inside ENDPOINTS.RM (RM = "/api/rm")
TRANSACTION_DETAIL: (allotmentId: string) => `${RM}/allotments/${allotmentId}/transaction-detail`,
```
```ts
// server/rm/index.ts
import type { TransactionDetailDTO, TransactionDetailRequest } from "@/lib/onboarding/types";

export async function fileTransactionDetail(
  allotmentId: string,
  req: TransactionDetailRequest,
): Promise<APIResult<TransactionDetailDTO>> {
  return apiClient<TransactionDetailDTO>(ENDPOINTS.RM.TRANSACTION_DETAIL(allotmentId), {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function getTransactionDetail(
  allotmentId: string,
): Promise<APIResult<TransactionDetailDTO>> {
  return apiClient<TransactionDetailDTO>(ENDPOINTS.RM.TRANSACTION_DETAIL(allotmentId));
}
```
```ts
// app/(roles)/rm/model-subscription/actions.ts
import { fileTransactionDetail as _fileTransactionDetail, getTransactionDetail as _getTransactionDetail } from "@/server/rm";
import type { TransactionDetailRequest } from "@/lib/onboarding/types";

export async function fileTransactionDetail(allotmentId: string, req: TransactionDetailRequest) {
  try {
    const r = await _fileTransactionDetail(allotmentId, req);
    logger.json("rm.fileTransactionDetail", r.success ? { id: r.data.id } : r);
    return r;
  } catch (e) {
    return toErrorResult(e);
  }
}

export async function getTransactionDetail(allotmentId: string) {
  try {
    const r = await _getTransactionDetail(allotmentId);
    logger.json("rm.getTransactionDetail", r.success ? { id: r.data.id } : r);
    return r;
  } catch (e) {
    return toErrorResult(e);
  }
}
```

**Behavior / invariants:** follows the exact `submitAllotment`/`submitRedemption` pattern already in `server/rm/index.ts`/`actions.ts` — no new error-handling shape introduced. `TRANSACTION_DETAIL(id)` resolves to `/api/rm/allotments/{id}/transaction-detail`, reachable at that path once the onboarding router (mounted at `/api` prefix) is live.

**Done when:** `fileTransactionDetail`/`getTransactionDetail` server actions are callable from a client component, return `APIResult<TransactionDetailDTO>`, and a unit test asserts the exact request path + JSON body (POST) / path only (GET) per §8.

---

### FE-3 — Widen `TxnRow` to carry `has_transaction_detail` (Yes — user req.)

- **Proposal ref:** § "Layer 3 — Frontend" Goal 5
- **Module:** 5.3
- **Files:** `modify: admin-frontend/lib/mock/rm-data.ts`, `modify: admin-frontend/lib/rm/subscriptions.ts`
- **Dependencies:** FE-1 (needs the widened `AllotRdmptDTO`)

**Contract:**
```ts
// lib/mock/rm-data.ts
export type TxnRow = [
  string, string, string, string, string, string, string, string, string,
  AllotRdmpStatus | "",   // 10th — existing
  string?,                // 11th — existing (transaction id)
  boolean?,               // NEW 12th element — has_transaction_detail; absent/undefined for
                          // Net rows and any legacy mock row (nothing to file against)
];
// SUB_CLIENTS literal fixture rows are NOT required to append a 12th element
// (optional tuple slot) — existing mock rows keep type-checking unchanged.
```
```ts
// lib/rm/subscriptions.ts
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
    dto.status,
    dto.id,
    dto.has_transaction_detail,   // NEW 12th element
  ];
}

function netRow(sub: ClientSubscriptionsDTO["subscriptions"][number]): TxnRow {
  const amt = Number(sub.amount).toLocaleString("en-US");
  return ["Net", "", "", "", amt, `${Number(sub.units)}×`, amt, "", "", "", undefined, undefined];
}
```

**Behavior / invariants:** the 12th element is optional in the type (existing mock fixture rows and Net rows need no edit) but always populated (`dto.has_transaction_detail`, a real `boolean`) for every live-data row produced by `allotmentToTxnRow` — the only place `SubscriptionAccordion` reads it (FE-5) already gates on `eligible` (real, id-bearing rows only), so the optionality never needs a runtime fallback beyond a straightforward falsy check.

**Done when:** `allotmentToTxnRow` appends `dto.has_transaction_detail` as the 12th tuple element; `admin-frontend` type-checks with the widened `TxnRow`.

---

### FE-4 — `TransactionDetailModal` dual-mode (edit / view) (Yes — user req.)

- **Proposal ref:** § "Layer 3 — Frontend" A-3
- **Module:** 5.4
- **Files:** `modify: admin-frontend/components/rm/TransactionDetailModal.tsx`
- **Dependencies:** FE-1 (needs `TransactionDetailDTO`)

**Contract:**
```tsx
// components/rm/TransactionDetailModal.tsx
import type { TransactionDetailDTO } from "@/lib/onboarding/types";

export interface TransactionDetails {
  bankAccount: string; amount: string; date: string; time: string; ccy: string; ref: string;
}

const CURRENCIES = ["USD", "CHF", "AUD", "GBP", "EUR", "CAD", "HKD"];
const fieldClass = "w-full rounded border border-outline bg-white px-3.5 py-2.5 text-[14px] font-medium leading-5 text-on-surface outline-none focus:border-primary";
const viewValueClass = "w-full rounded border border-outline-variant bg-surface-low px-3.5 py-2.5 text-[14px] font-medium leading-5 text-on-surface";

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) { /* unchanged */ }

export function TransactionDetailModal({
  type, clientName, modelName, rawAmount, mode = "edit", details, loading = false, onClose, onSave,
}: {
  type: "Allotment" | "Redemption";
  clientName: string;
  modelName: string;
  rawAmount: string;
  mode?: "edit" | "view";                    // NEW — defaults "edit" (unchanged default behavior)
  details?: TransactionDetailDTO | null;       // NEW — required when mode === "view"
  loading?: boolean;                          // NEW — true while view-mode details are being fetched
  onClose: () => void;
  onSave: (details: TransactionDetails) => void;
}) {
  const isRedemption = type === "Redemption";
  const isView = mode === "view";
  const [bankAccount, setBankAccount] = useState("");
  const [amount, setAmount] = useState(rawAmount);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [ccy, setCcy] = useState("USD");
  const [ref, setRef] = useState("");
  const canSave = !!bankAccount && !!amount && !!date && !!time;

  return (
    <Modal
      title={/* unchanged icon/title JSX */}
      subtitle={`${type} · ${clientName} · ${modelName}`}
      onClose={onClose}
      width={480}
      centered
      footer={
        isView ? (
          <Button variant="secondary" onClick={onClose} className="ml-auto">Close</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button icon={Check} disabled={!canSave} onClick={() => onSave({ bankAccount, amount, date, time, ccy, ref })}>Save</Button>
          </>
        )
      }
    >
      <div className="mb-3.5 flex items-center gap-2 rounded-md border border-[#f0dcc6] bg-[#fff8f0] px-3 py-2">
        <Info size={14} strokeWidth={1.75} className="flex-none text-[#b9741f]" />
        <span className="text-[12px] font-semibold text-[#8a6118]">
          {isView
            ? `Transaction details recorded${details ? ` on ${details.filed_at.slice(0, 10)}` : ""}.`
            : `Record the transaction details for this ${type.toLowerCase()} to complete the follow-up.`}
        </span>
      </div>
      {isView && loading ? (
        <div className="py-6 text-center text-[13px] text-secondary">Loading transaction details…</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bank Account No." required={!isView}>
            {isView
              ? <div className={viewValueClass}>{details?.bank_account}</div>
              : <input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="e.g. HSBC-4471-001" className={fieldClass} />}
          </Field>
          <Field label="Settlement Amount" required={!isView}>
            {isView
              ? <div className={viewValueClass}>{details?.settlement_amount.toLocaleString("en-US")}</div>
              : <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 180,000" className={fieldClass} />}
          </Field>
          <Field label="Transaction Date" required={!isView}>
            {isView
              ? <div className={viewValueClass}>{details?.transaction_date}</div>
              : <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />}
          </Field>
          <Field label="Transaction Time" required={!isView}>
            {isView
              ? <div className={viewValueClass}>{details?.transaction_time}</div>
              : <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={fieldClass} />}
          </Field>
          <Field label="Currency" required={!isView}>
            {isView
              ? <div className={viewValueClass}>{details?.currency}</div>
              : (
                <select value={ccy} onChange={(e) => setCcy(e.target.value)} className={`${fieldClass} cursor-pointer`}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
          </Field>
          <Field label="Reference No.">
            {isView
              ? <div className={viewValueClass}>{details?.reference_no || "—"}</div>
              : <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. TXN-20260301-001" className={fieldClass} />}
          </Field>
        </div>
      )}
    </Modal>
  );
}
```

**Behavior / invariants:**
- `mode` defaults to `"edit"` — every existing call site that doesn't pass `mode`/`details`/`loading` keeps compiling and behaving exactly as before (default-parameter backward compatibility, no call-site edit forced by this unit alone).
- View mode never renders an `<input>`/`<select>` — every field is a static `<div>`, so there is no way to mutate an already-filed, audit-immutable record from this UI.
- View mode's footer has only a Close button — no Save affordance exists to accidentally re-submit.
- The info banner's copy changes based on `mode`, but the banner's visual container (border/background/icon) is unchanged — no new layout primitive introduced.
- `loading` covers the gap between the modal opening and `SubscriptionAccordion`'s `getTransactionDetail` call resolving (FE-5) — `details` is `undefined`/`null` during that window and the fields are not rendered until it resolves, avoiding a flash of empty read-only fields.

**Done when:** `mode="edit"` (or omitted) renders identically to the pre-existing modal (same fields, same footer, same Save/Cancel wiring) — a snapshot/behavioral regression test confirms no change. `mode="view"` with a non-null `details` renders all 6 values as read-only text and a single Close button; `mode="view"` with `loading=true` renders the loading message instead of the field grid.

---

### FE-5 — Wire `SubscriptionAccordion` to the new endpoints; drop ephemeral state (Yes — user req.)

- **Proposal ref:** § "Layer 3 — Frontend" A-1, A-2; § 4.2 (Frontend row of the per-layer obligations table)
- **Module:** 5.5
- **Files:** `modify: admin-frontend/components/rm/SubscriptionAccordion.tsx`
- **Dependencies:** FE-2 (server actions), FE-3 (`has_transaction_detail` on `TxnRow`), FE-4 (dual-mode modal)

**Contract — replace the ephemeral `filled` state and `activeTxn` handling:**
```tsx
// components/rm/SubscriptionAccordion.tsx
import { fileTransactionDetail, getTransactionDetail } from "@/app/(roles)/rm/model-subscription/actions";
import type { TransactionDetailDTO } from "@/lib/onboarding/types";

/** A row the user clicked to file/view transaction details for. */
interface ActiveTxn {
  id: string;
  type: "Allotment" | "Redemption";
  clientName: string;
  modelName: string;
  rawAmount: string;
  mode: "edit" | "view";        // NEW — decided at click time from TxnRow's has_transaction_detail
}

// TxnTable's onFileDetails callback (row map) now also threads has_transaction_detail:
onFileDetails={(row) => onFileDetails({
  id: row[10]!,
  type: row[0] as "Allotment" | "Redemption",
  clientName: client.name,
  modelName: model.name,
  rawAmount: (row[4] || "").replace(/[()]/g, "").trim(),
  hasTransactionDetail: !!row[11],     // NEW — 12th TxnRow element
})}
```
```tsx
// components/rm/SubscriptionAccordion.tsx — SubscriptionAccordion's own state
export function SubscriptionAccordion({ clients, onOpenModal, onClientOpen, initialOpenClient, initialOpenModelKey }: { /* unchanged */ }) {
  const [openClient, setOpenClient] = useState<string | null>(initialOpenClient ?? null);
  const [activeTxn, setActiveTxn] = useState<ActiveTxn | null>(null);
  const [viewDetails, setViewDetails] = useState<TransactionDetailDTO | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const handleFileDetails = (txn: { id: string; type: "Allotment" | "Redemption"; clientName: string; modelName: string; rawAmount: string; hasTransactionDetail: boolean }) => {
    const mode = txn.hasTransactionDetail ? "view" : "edit";
    setActiveTxn({ ...txn, mode });
    if (mode === "view") {
      setViewDetails(null);
      setViewLoading(true);
      getTransactionDetail(txn.id).then((r) => {
        setViewLoading(false);
        if (r.success) setViewDetails(r.data);
        // on failure, viewDetails stays null — modal shows an empty read-only
        // panel rather than a fabricated error affordance; acceptable since a
        // 404 here means the row's has_transaction_detail flag was stale (rare, self-
        // corrects on the next data refetch).
      });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {clients.map((client) => (
        <ClientAccordionItem
          key={client.id}
          client={client}
          open={openClient === client.id}
          onToggle={() => toggle(client.id)}
          onOpenModal={onOpenModal}
          initialOpenModelKey={client.id === openClient ? initialOpenModelKey : undefined}
          onFileDetails={handleFileDetails}
        />
      ))}
      {activeTxn && (
        <TransactionDetailModal
          type={activeTxn.type}
          clientName={activeTxn.clientName}
          modelName={activeTxn.modelName}
          rawAmount={activeTxn.rawAmount}
          mode={activeTxn.mode}
          details={viewDetails}
          loading={viewLoading}
          onClose={() => setActiveTxn(null)}
          onSave={async (details) => {
            const r = await fileTransactionDetail(activeTxn.id, {
              bank_account: details.bankAccount,
              settlement_amount: parseFloat(details.amount.replace(/,/g, "")) || 0,
              transaction_date: details.date,
              transaction_time: details.time,
              currency: details.ccy,
              reference_no: details.ref || null,
            });
            if (r.success) {
              setActiveTxn(null);
              // Refresh this client's ledger so has_transaction_detail flips true on
              // the row -- the same invalidation surface FE-3 (016) already
              // exposes on useSubscriptions(), threaded down from page.tsx.
              onTransactionDetailFiled?.(activeTxn.clientName === client.name ? client.id : client.id);
            }
            // on failure, the modal stays open — matches SubscriptionFormModal's
            // (016 FE-3) existing "never close on a failed submit" convention.
          }}
        />
      )}
    </div>
  );
}
```

**Contract — thread an invalidation callback down from the page (mirrors 016 FE-3's `onSuccess`/`invalidateClientAllotments` wiring):**
```tsx
// components/rm/SubscriptionAccordion.tsx — new prop
export function SubscriptionAccordion({
  clients, onOpenModal, onClientOpen, initialOpenClient, initialOpenModelKey,
  onTransactionDetailFiled,   // NEW — (clientId: string) => void
}: {
  // ...existing props...
  onTransactionDetailFiled?: (clientId: string) => void;
}) { /* ... */ }
```
```tsx
// app/(roles)/rm/model-subscription/page.tsx
const { clients, ensureAllotmentsLoaded, invalidateClientAllotments } = useSubscriptions();
// ...
<SubscriptionAccordion
  clients={clients ?? []}
  onOpenModal={setModal}
  onClientOpen={ensureAllotmentsLoaded}
  onTransactionDetailFiled={invalidateClientAllotments}
/>
```

**Behavior / invariants:**
- The ephemeral `useState<Record<string, TransactionDetails>>` `filled` state (and the `TransactionDetails` import used only for that state's shape) is removed entirely — "filled" is now derived, per-row, straight from `has_transaction_detail` on the fetched `AllotRdmptDTO`/`TxnRow`, so it survives a page reload.
- `TxnTable`'s `filled: Set<string>` prop is dropped; `done` (the green-check-vs-amber-icon branch in the row render, `SubscriptionAccordion.tsx:83`) reads `!!row[11]` directly instead of `filled.has(txnId!)`.
- Clicking an eligible row with `has_transaction_detail === false` opens the modal in `edit` mode immediately (no fetch) — identical latency to today's behavior.
- Clicking an eligible row with `has_transaction_detail === true` opens the modal in `view` mode and fires `getTransactionDetail` — the modal shows its loading state until that resolves.
- A successful file (`onSave`) closes the modal and calls `onTransactionDetailFiled(clientId)`, which invalidates that client's cached allotment ledger (`useSubscriptions().invalidateClientAllotments`, already present per 016) so the next render reflects the row's now-`true` `has_transaction_detail` without a full page reload.
- A failed file leaves the modal open (no `setActiveTxn(null)`) — the existing `TransactionDetails` form state inside `TransactionDetailModal` is untouched, so the user's typed input is not lost.

**Done when:** clicking an unfiled eligible row opens the edit-mode modal with no fetch; filling it and clicking Save calls `fileTransactionDetail`, and on success the modal closes and the row's icon/chip reflects transaction-detail-filed state after the client's ledger refetches; clicking an already-filed row opens the view-mode modal, which fetches and displays the exact previously-filed values as read-only text with no editable field and no Save button; a failed Save leaves the modal open.

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal §4.1)

```python
# ─── New table ───────────────────────────────────────────────
# transaction_details  (1:1 with client_allotment_redemptions)
#   id               UUID PK
#   allotment_id     UUID FK → client_allotment_redemptions.id, UNIQUE
#   bank_account     String(64)      NOT NULL
#   settlement_amount Numeric(28,10) NOT NULL
#   transaction_date Date            NOT NULL
#   transaction_time Time            NOT NULL
#   currency         String(3)       NOT NULL  (ISO 4217)
#   reference_no     String(64)      NULL
#   filed_by         String(128)     NOT NULL  (firebase_uid of RM)
#   filed_at         DateTime(tz)    NOT NULL  (server-set)

# ─── POST /api/onboarding/rm/allotments/{allotment_id}/transaction-detail ───
class TransactionDetailRequest(BaseModel):
    bank_account: str              # max 64 chars, required
    settlement_amount: Decimal     # required, positive
    transaction_date: date         # required (ISO 8601 date)
    transaction_time: time         # required (HH:MM or HH:MM:SS)
    currency: str                  # required, one of: USD, CHF, AUD, GBP, EUR, CAD, HKD
    reference_no: str | None       # optional, max 64 chars

# Response: 201 Created → TransactionDetailDTO

class TransactionDetailDTO(BaseModel):
    id: uuid.UUID
    allotment_id: uuid.UUID
    bank_account: str
    settlement_amount: float
    transaction_date: date
    transaction_time: time
    currency: str
    reference_no: str | None
    filed_by: str
    filed_at: datetime

# ─── GET /api/onboarding/rm/allotments/{allotment_id}/transaction-detail ───
# Response: 200 → TransactionDetailDTO
# Response: 404 → no settlement filed yet

# ─── AllotRdmptDTO widened ───
class AllotRdmptDTO(BaseModel):
    # ... existing fields ...
    has_transaction_detail: bool = False    # True when a transaction_details row exists

# ─── Errors (POST) ───
# 404  — allotment_id not found or not owned by requesting RM's clients
# 409  — transaction details already filed (immutable — file once)
# 422  — validation failure (bad currency, negative amount, etc.)
# 403  — caller lacks RM role or row is not in an eligible status
```

**Per-layer obligations (verbatim from proposal §4.2):**

| Layer | What this layer contributes | What this layer assumes from the other side |
|---|---|---|
| Database | `transaction_details` table with UNIQUE FK to `client_allotment_redemptions.id`; all detail columns NOT NULL except `reference_no` | Backend only writes validated values (currency in enum range, amount positive, date/time valid) |
| Backend | Serves POST + GET at `/rm/allotments/{allotment_id}/transaction-detail` with role guard (RM) and status guard (confirmed/approved on POST). Returns `TransactionDetailDTO`. Adds `has_transaction_detail` to `AllotRdmptDTO`. | DB table exists. Frontend sends `TransactionDetailRequest` shape exactly. |
| Frontend | Calls POST on Save, calls GET on click when `has_transaction_detail` is true, renders view-only panel for filed records. | Backend returns `has_transaction_detail` on `AllotRdmptDTO` and `TransactionDetailDTO` on the GET endpoint. |

### 7.2 How this layer honours the seam
- **What this layer contributes:** the POST call on Save (FE-5), the GET call on click-when-filed (FE-5), the view-only panel rendering (FE-4), all against the DTOs pinned in FE-1.
- **What this layer assumes from the other side:** the Backend returns `has_transaction_detail` on every `AllotRdmptDTO` from the existing allotments-list endpoint, and `TransactionDetailDTO` exactly as shaped in §7.1 from the GET endpoint.
- **Change protocol:** any edit to §7 requires editing the proposal first; this section is then re-copied. Never edited in isolation.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Framework / runner:** vitest — command: `npx vitest run` (from `admin-frontend/`).
- **Fixtures / seed:** plain in-memory fixture objects (a fake `AllotRdmptDTO`/`TransactionDetailDTO`) constructed inline per test — no server, no real fetch. `@testing-library/react` renders `TransactionDetailModal`/`SubscriptionAccordion` in isolation.
- **Isolation:** hermetic, no shared external state; safe to run in parallel.
- **Layer isolation (critical):** tests import only from `admin-frontend/` source, stdlib/test tooling (`vitest`, `@testing-library/react`), and mock the seam (`vi.mock("@/app/(roles)/rm/model-subscription/actions")` for `fileTransactionDetail`/`getTransactionDetail`) rather than hitting a real Backend. No Python/Backend code is imported or assumed present.
- **Test location:** `admin-frontend/tests/` (git-ignored), mirroring the source path, e.g. `tests/components/rm/TransactionDetailModal.test.tsx`, `tests/components/rm/SubscriptionAccordion.test.tsx`, `tests/lib/rm/subscriptions.test.ts`.
- **Commit policy:** tests are never committed — `tests/` is git-ignored.
- **Code generation:** concrete test code is written by the `test-gen` skill (`lite`/`standard`/`thorough`) from §8.2/§8.3 below.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| FE-1 | `has_transaction_detail` present on `AllotRdmptDTO` type; new DTOs compile | none (type-only) |
| FE-2 | `fileTransactionDetail`/`getTransactionDetail` call the correct path + method + body | `apiClient` mocked to capture call args |
| FE-3 | `allotmentToTxnRow` appends `dto.has_transaction_detail` as the 12th element | none |
| FE-4 | `mode="edit"` renders the pre-existing editable form + Save/Cancel; `mode="view"` renders read-only fields + Close only, and shows a loading state when `loading=true` | none — pure prop-driven rendering |
| FE-5 | Clicking an unfiled row opens edit mode with no fetch; clicking a filled row triggers `getTransactionDetail` and opens view mode; a successful Save calls `fileTransactionDetail` and closes the modal; a failed Save keeps the modal open | `fileTransactionDetail`/`getTransactionDetail` server actions mocked |

### 8.3 Test goals (per unit)

#### FE-1
- **Positive:** a value satisfying the widened `AllotRdmptDTO` type-checks with `has_transaction_detail: boolean` present; `TransactionDetailRequest`/`TransactionDetailDTO` type-check with all pinned fields.
- **Negative:** n/a — compile-time only.
- **Invariants:** every existing `AllotRdmptDTO`-typed literal elsewhere in the codebase still type-checks once `has_transaction_detail` is added (no consumer needs an edit).
- **Seam mocks:** none.

#### FE-2
- **Positive:** `fileTransactionDetail("abc", req)` calls `apiClient` with path `/api/rm/allotments/abc/transaction-detail`, `method: "POST"`, and `body` equal to `JSON.stringify(req)`; `getTransactionDetail("abc")` calls `apiClient` with the same path and no body/GET method.
- **Negative:** a failed `apiClient` call (mocked to return `{ success: false, ... }`) is passed through unchanged by both functions.
- **Invariants:** the endpoint path is built via `ENDPOINTS.RM.TRANSACTION_DETAIL`, never a hand-inlined string, so a future prefix change only requires editing `endpoints.ts`.
- **Seam mocks:** `apiClient` (or `server/api-client` module) mocked with `vi.fn()`.

#### FE-3
- **Positive:** given a `dto` with `has_transaction_detail: true`, `allotmentToTxnRow(dto, ib)` returns a 12-element array whose 12th element is `true`; given `has_transaction_detail: false`, the 12th element is `false`.
- **Negative:** n/a.
- **Invariants:** the first 11 elements are byte-identical to the pre-existing (016) output for the same input — this unit only appends, never reorders.
- **Seam mocks:** none.

#### FE-4
- **Positive:** rendering with `mode="edit"` (or `mode` omitted) shows 6 editable fields and a Save button that is disabled until the 4 required fields are non-empty, matching pre-existing behavior exactly. Rendering with `mode="view"` and a populated `details` shows all 6 values as plain text (no `<input>`/`<select>` present) and a single "Close" button, no "Save".
- **Negative:** rendering with `mode="view"` and `loading=true` shows the loading message and renders none of the 6 fields.
- **Invariants:** in view mode, no callback that could mutate state (`onSave`) is ever wired to any element — a query for a `button` containing text "Save" finds nothing when `mode="view"`.
- **Seam mocks:** none — pure component test.

#### FE-5
- **Positive:** clicking a `TxnTable` row with `has_transaction_detail=false` (12th `TxnRow` element falsy) opens the modal with `mode="edit"` and does not call `getTransactionDetail`. Clicking a row with `has_transaction_detail=true` calls `getTransactionDetail(id)` and, once resolved, opens the modal with `mode="view"` and the resolved `details`. Calling `onSave` from edit mode invokes `fileTransactionDetail(id, req)` with the request body correctly mapped from the modal's raw form fields (string amount parsed to a number, empty `ref` mapped to `null`); on a successful result, the modal closes and `onTransactionDetailFiled` fires with the row's client id.
- **Negative:** a `fileTransactionDetail` result with `success: false` leaves the modal open (`activeTxn` state unchanged) and does not call `onTransactionDetailFiled`.
- **Invariants:** the removed `filled` state and its `TransactionDetails`-shaped `useState` no longer exist anywhere in the file (a grep/AST check, or simply: the "done" check icon's condition reads `!!row[11]`, not a `Set`/`Record` lookup).
- **Seam mocks:** `fileTransactionDetail`/`getTransactionDetail` (via `vi.mock` on the `actions.ts` module).

### 8.4 Aggregate gate
- All unit tests green is a local gate run before commit/PR hand-off. Tests are git-ignored and never committed.
- Target coverage for changed lines: ≥ 90% of new/changed statements in `TransactionDetailModal.tsx`/`SubscriptionAccordion.tsx`/`lib/rm/subscriptions.ts`/`server/rm/index.ts` for this feature.
- Chosen `test-gen` level for this layer: `standard` (happy path + main negative + the mode-switch/loading-state branch per unit) — a UI-and-plumbing layer, not money-moving logic; `thorough` is not warranted.

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] FE-1 through FE-5 committed on `transaction-details-wiring-fe`; each commit left the branch green.
- [ ] §8 unit tests all pass; `npx vitest run && npx tsc --noEmit && npx next lint` green.
- [ ] §7 matches the proposal's frozen seam verbatim. Checked against the proposal on the parent branch, not against the DB/BE layers' branches.
- [ ] PR opened against `transaction-details-wiring`; human owns the merge.
- [ ] Manual browser verification against a live Backend (once merged/integrated): file a transaction detail on a confirmed allotment → row shows filled; reload → still filled; click the filled row → view-only panel shows the exact values filed.

**Rollback:** additive-only — reverting this branch restores the pre-existing no-op `TransactionDetailModal`/`SubscriptionAccordion` behavior (client-side-only `filled` state, no API calls) with no effect on any other page. No persisted data is affected by a frontend-only rollback — the `transaction_details` rows written via the API remain in the DB and become reachable again the moment this branch (or an equivalent) is reinstated.
