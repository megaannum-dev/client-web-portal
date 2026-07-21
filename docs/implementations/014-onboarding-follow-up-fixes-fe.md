# 014 — Client Onboarding Follow-Up Fixes · Implementation Details — Frontend

> Status: **DRAFT — pending implementation.**
> Implements: [proposal `docs/proposals/014-2026-07-21-onboarding-follow-up-fixes.md`](../proposals/014-2026-07-21-onboarding-follow-up-fixes.md) § Layer 2 — Frontend (Findings A-1 through A-6)
> Layer: **Frontend**
> Sibling layer docs: [`docs/implementations/014-onboarding-follow-up-fixes-be.md`](014-onboarding-follow-up-fixes-be.md)
> Execution schedule: `docs/execution-schedules/014-onboarding-follow-up-fixes-fe.md`
> Builds on: proposal 013 (`client-onboarding-integration`, already merged into the current branch) — `OnboardingBoard.tsx`, `OnboardingModal.tsx`, `useOnboardingBoard.ts`, `lib/onboarding/{types,mappers}.ts`; the Backend layer's routes/DTOs in this same proposal (§7 below).

<!-- OVERRIDE — branching convention (per explicit user instruction on this proposal):
Same override as the sibling Backend doc: no `<parent>-fe` branch, no worktree
isolation. Every unit below commits directly to the CURRENT branch
(`onboarding-subsystem-fixing`), the SAME branch the Backend layer's units land
on. Non-collision comes from disjoint working directories (`admin-frontend/`
here vs `api-backend/` in the sibling doc), not from git branch isolation. -->

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/014-2026-07-21-onboarding-follow-up-fixes.md` § Layer 2 — Frontend |
| Execution schedule | `docs/execution-schedules/014-onboarding-follow-up-fixes-fe.md` |
| Sibling layer impl docs | `docs/implementations/014-onboarding-follow-up-fixes-be.md` |
| Builds on | Proposal 013 (already merged, this branch); Backend layer's new routes/DTOs (this proposal, §7 below) |

---

## 2. Branch & session contract

- **Branch:** `onboarding-subsystem-fixing` (the current branch) — **override, no per-layer branch.** All `FE-*` units in this doc commit directly here, as ordinary commits on the branch already in progress. There is no `014-onboarding-follow-up-fixes-fe` branch and no worktree isolation for this layer.
- **Isolation (redefined for this override):** this layer lands on the same branch as Backend, not a sibling branch merged later. Non-collision comes from disjoint file ownership: every `FE-*` unit below touches only `admin-frontend/**`; the Backend doc's `BE-*` units touch only `api-backend/**`.
- **Preconditions (must be true before starting):**
  - [ ] The Backend layer's routes/DTOs in this same proposal (§7 below) are either already implemented on this branch, or this layer's units are built against §7 as a contract and wired against a real backend before browser verification (per the pipeline's "layer isolation" rule — a unit test mocks the seam; a browser-verified "Done when" needs the real endpoint present).
  - [ ] Proposal 013's existing Frontend surfaces are present: `OnboardingBoard.tsx`, `OnboardingModal.tsx`, `useOnboardingBoard.ts`, `lib/onboarding/{types,mappers}.ts`, `client-info/[id]/page.tsx`, `model-subscription/page.tsx` + its components — all already on this branch.
  - [ ] The frozen seam in proposal §4.1 is agreed — §7 below is copied verbatim from it.
- **Read-first inventory:**
  - `admin-frontend/app/(roles)/rm/onboarding-renewal/page.tsx` — currently renders `OnboardingBoard`/`OnboardingModal` as independent siblings; FE-1 lifts state here.
  - `admin-frontend/components/rm/OnboardingBoard.tsx` — `KanbanCard`, `KycPanel`, `OnboardingBoard` — FE-1, FE-2, FE-3 all touch this file.
  - `admin-frontend/components/rm/OnboardingModal.tsx` — the Start Onboarding wizard — FE-1 (prop wiring), FE-5.
  - `admin-frontend/hooks/api/useOnboardingBoard.ts` — unchanged in shape, just called from a different place (FE-1).
  - `admin-frontend/lib/onboarding/types.ts` — `KycBoardClient`, `OnboardingDTO` — FE-2 adds `status`.
  - `admin-frontend/lib/onboarding/mappers.ts` — `mapRow`/`mapBoardToColumns` — FE-2.
  - `admin-frontend/app/(roles)/rm/client-info/[id]/page.tsx` — FE-4.
  - `admin-frontend/hooks/api/useClient.ts` — FE-4 (widen the returned shape).
  - `admin-frontend/lib/rm/clients.ts` — `dtoToRow`/`ClientRow` — FE-4 (add `idType`/`idNumber`/`authorizedByName`).
  - `admin-frontend/app/(roles)/rm/model-subscription/page.tsx`, `admin-frontend/components/rm/SubscriptionAccordion.tsx` — FE-6 (modified). `admin-frontend/components/rm/SubscriptionFormModal.tsx` — FE-6 read-only reference (not modified). `admin-frontend/lib/pc/format.ts` — FE-6 read-only reference (`fmtMoney`/`fmtMoneyShort`/`fmtTimestamp` reused, not redefined).
  - `admin-frontend/lib/mock/rm-data.ts` — read-only reference for what's being replaced (`SUB_CLIENTS`, `getMockOverlay`, `clientHistory`) — not edited itself except to leave the now-unused Account Balance mock fields untouched (out of scope, proposal §3).
- **Hand-off / exit signal:** all `FE-1`..`FE-6` committed on `onboarding-subsystem-fixing`; `vitest`/`tsc`/`next lint` gate green; browser verification per §6's "Done when" criteria passes against a real backend (this layer's units, unlike a fresh parallel build, can be verified end-to-end immediately since Backend lands on the same branch).

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- Data flow: `page.tsx` → hook (`hooks/api/use*.ts`) → server action (`app/(roles)/.../actions.ts`) → `lib/rm/api-client.ts` → backend route. No component calls `fetch` directly.
- View-model mapping: DTOs are mapped to page-specific view types in `lib/onboarding/mappers.ts` (or an equivalent `lib/rm/*.ts` mapper) — components never destructure a raw DTO field name that diverges from its view-model name.
- State sharing between sibling components: **lift to the nearest common parent**, pass down as props — no ad-hoc global store/context introduced for this proposal (FE-1 is the one place this convention is applied for the first time in this file, per proposal D-1... no, per proposal's Frontend A-1 finding).
- Styling/status-tone lookups (`DOC_STATUS_TONE`, `DOC_ICON`, chip tones) are defined once per file that owns the visual and reused, never re-declared with different values in a second file (FE-4 explicitly reuses `OnboardingBoard.tsx`'s lookups rather than inventing new ones for the client-detail page).
- `null`-safety: any newly-widened DTO field that can be `null` renders as `"—"`, matching every existing field on the same pages (`InfoField`'s existing `?? "—"` pattern).

### 3.2 CI/CD & engineering discipline

- **Trunk-friendly, small units.** Each `FE-*` unit is one commit, leaves the branch green.
- **Every unit is independently revertible.** FE-2 (chip fix) and FE-3 (status-locked buttons) both touch `OnboardingBoard.tsx` but are logically independent — sequence them as two separate commits, not squashed into one, so either can be reverted alone if needed.
- **Additive & backward-compatible first.** FE-1's prop-lifting is the only structural reshape in this layer — the components' internal rendering is otherwise unchanged, keeping the diff reviewable.
- **Gates before merge** (verified present in this repo — `admin-frontend/package.json` has a `test`/`vitest run` script backed by `admin-frontend/vitest.config.ts`, plus `lint`/`build` scripts):
  ```bash
  npm run test && npx tsc --noEmit && npm run lint
  ```
- **No secrets, no manual steps in the merge path.**
- **Reversibility documented** (§9).

---

## 4. Architecture

**Target layout (no new files — every change lands in existing components/hooks/pages):**
```
admin-frontend/app/(roles)/rm/onboarding-renewal/page.tsx   # FE-1 (hook lifted here)
admin-frontend/components/rm/
  OnboardingBoard.tsx    # FE-1 (props), FE-2 (chip), FE-3 (buttons)
  OnboardingModal.tsx    # FE-1 (props), FE-5 (cash-deposit field)
  SubscriptionAccordion.tsx    # FE-6 (accepts clients/onClientOpen props, JSX otherwise unchanged)
admin-frontend/app/(roles)/rm/client-info/[id]/page.tsx     # FE-4
admin-frontend/app/(roles)/rm/model-subscription/page.tsx   # FE-6
admin-frontend/hooks/api/
  useClient.ts           # FE-4 (widened shape)
  useSubscriptions.ts    # FE-6 — new file
admin-frontend/lib/onboarding/
  types.ts               # FE-2 (status on KycBoardClient)
  mappers.ts             # FE-2
admin-frontend/lib/rm/
  clients.ts             # FE-4 (widened ClientRow)
  subscriptions.ts       # FE-6 — new file (DTO→SubClient/SubModel/TxnRow mapper)
```

**Dependency direction:** unchanged — `page.tsx` owns data-fetching state and passes it down; `components/rm/*` are presentational-plus-interaction, never fetch on their own after FE-1 (today `OnboardingModal` does, which is exactly the bug FE-1 fixes).

**External seams:** every DTO/route this layer consumes is defined in the Backend layer's §7 (mirrored below) — this layer never assumes a field or route not listed there.

---

## 5. Modules

### 5.1 RM Onboarding Board + Wizard
- **Responsibility:** the kanban board, its floating KYC panel, and the Start Onboarding wizard.
- **Files:** `onboarding-renewal/page.tsx`, `OnboardingBoard.tsx`, `OnboardingModal.tsx`.
- **Public surface:** `<OnboardingBoard {...board} />`, `<OnboardingModal onClose startOnboarding uploadDocument fetchRmOptions fetchDocSpecs />` — both now take the shared hook's return value as props instead of calling the hook themselves.
- **Owns features:** FE-1, FE-2, FE-3, FE-5.

### 5.2 Client Information detail
- **Responsibility:** the single-client detail subpage.
- **Files:** `client-info/[id]/page.tsx`, `hooks/api/useClient.ts`, `lib/rm/clients.ts`.
- **Owns features:** FE-4.

### 5.3 Model Subscription
- **Responsibility:** the RM's client-book-by-model-subscription view.
- **Files modified:** `model-subscription/page.tsx`, `SubscriptionAccordion.tsx`.
- **Files created:** `hooks/api/useSubscriptions.ts`, `lib/rm/subscriptions.ts`.
- **Files read, not modified:** `SubscriptionFormModal.tsx` (keeps reading its own mock catalogs for the allotment/redemption entry form — a different, out-of-scope concept from the client-subscriptions view this module wires).
- **Owns features:** FE-6.

---

## 6. Features

### FE-1 — Lift `useOnboardingBoard()` to the shared parent page (MANDATORY)

- **Proposal ref:** § Layer 2 — Frontend, A-1
- **Module:** 5.1
- **Files:** `modify: admin-frontend/app/(roles)/rm/onboarding-renewal/page.tsx`, `modify: admin-frontend/components/rm/OnboardingBoard.tsx`, `modify: admin-frontend/components/rm/OnboardingModal.tsx`
- **Dependencies:** none — do this first among this layer's units, since FE-2/FE-3 both edit `OnboardingBoard.tsx` and are easier to write against its already-prop-based shape.

**Contract:**

```tsx
// onboarding-renewal/page.tsx
import { useOnboardingBoard } from "@/hooks/api/useOnboardingBoard";

export default function OnboardingRenewalPage() {
  const [onboarding, setOnboarding] = useState(false);
  const board = useOnboardingBoard();   // NEW — the single shared instance
  return (
    <div className="mx-auto max-w-[1180px]">
      {/* header unchanged */}
      <OnboardingBoard {...board} />
      {onboarding && (
        <OnboardingModal
          onClose={() => setOnboarding(false)}
          startOnboarding={board.startOnboarding}
          uploadDocument={board.uploadDocument}
          fetchRmOptions={board.fetchRmOptions}
          fetchDocSpecs={board.fetchDocSpecs}
        />
      )}
    </div>
  );
}
```

```tsx
// OnboardingBoard.tsx — signature change
export function OnboardingBoard(props: UseOnboardingBoardResult) {
  const { data: columns, loading, error, uploadDocument, submitAll, fetchOnboarding } = props;
  // ...unchanged body — no internal useOnboardingBoard() call
}
```

```tsx
// OnboardingModal.tsx — signature change
export function OnboardingModal({
  onClose, startOnboarding, uploadDocument, fetchRmOptions, fetchDocSpecs,
}: {
  onClose: () => void;
} & Pick<UseOnboardingBoardResult, "startOnboarding" | "uploadDocument" | "fetchRmOptions" | "fetchDocSpecs">) {
  // ...unchanged body — no internal useOnboardingBoard() call
}
```

**Behavior / invariants:**
- Exactly one `useOnboardingBoard()` call exists on this page after this unit lands (in `onboarding-renewal/page.tsx`); neither `OnboardingBoard.tsx` nor `OnboardingModal.tsx` calls it internally anymore.
- No new caching/context library is introduced — this is a prop-drilling lift, matching the proposal's D-1 rationale (standard "hoist to nearest common parent," not a new abstraction).
- Because `startOnboarding` is now the same closure the board's own `data` state is bound to, a successful `startOnboarding()` call's internal `fetch_()` (inside `useOnboardingBoard.ts`, unchanged) updates the exact `data` the board renders — no new refetch call is added anywhere; the fix is that the state is shared.

**Done when:** in the browser, opening "Start Onboarding," completing the wizard, and closing it shows the new client's card on the board immediately, with no navigation or manual refresh — verified against a real backend (Backend layer's existing `POST /rm/onboardings` + `GET /rm/onboardings`, both already present from 013).

---

### FE-2 — Chip branches on status, not count (MANDATORY)

- **Proposal ref:** § Layer 2 — Frontend, A-2
- **Module:** 5.1
- **Files:** `modify: admin-frontend/lib/onboarding/types.ts`, `modify: admin-frontend/lib/onboarding/mappers.ts`, `modify: admin-frontend/components/rm/OnboardingBoard.tsx`
- **Dependencies:** FE-1 (touches the same `OnboardingBoard.tsx`; sequence after FE-1 to avoid a merge conflict on the same file, not a functional dependency).

**Contract:**

```ts
// lib/onboarding/types.ts
export interface KycBoardClient {
  ...
  status: OnboardingStatus;   // NEW
}
```

```ts
// lib/onboarding/mappers.ts
export function mapRow(o: OnboardingDTO): KycBoardClient {
  return {
    ...
    status: o.status,   // NEW — OnboardingDTO already carries this; just wasn't copied onto the view type before
  };
}
```

```tsx
// OnboardingBoard.tsx
function KanbanCard({ item, ... }: { item: KycBoardClient; ... }) {
  const tone = chipToneForCounts(item.verifiedCount, item.requiredCount);
  return (
    ...
    {item.status === "initial"
      ? <Chip tone="neutral" dot={false}>Not started</Chip>
      : <Chip tone={tone} dot={false}>{item.verifiedCount}/{item.requiredCount} verified</Chip>}
    ...
  );
}
```

**Behavior / invariants:** the "Not started" branch renders if and only if `item.status === "initial"`, regardless of `verifiedCount`; every other column (`reviewing`, `pending_review`, `active`) always renders `${verifiedCount}/${requiredCount} verified`, including the `0/N` case.

**Done when:** a client freshly submitted into "Reviewing" (0 docs verified so far) shows "0/7 verified" on its card, not "Not started"; a client still in "Initial Onboarding" (0 docs, not yet submitted) still shows "Not started".

---

### FE-3 — Status-locked buttons + download affordances (MANDATORY)

- **Proposal ref:** § Layer 2 — Frontend, A-3
- **Module:** 5.1
- **Files:** `modify: admin-frontend/components/rm/OnboardingBoard.tsx`
- **Dependencies:** FE-2 (both touch `KanbanCard`/`KycPanel` in the same file — sequence after FE-2; not a functional dependency, `status` just needs to already be on `KycBoardClient` first, which FE-2 adds). Also depends on the Backend layer's BE-2 (single-doc download route) and BE-3 (download-all route) existing for the "Done when" browser verification, though this unit's own code can be written against the §7 contract without waiting.

**Contract:**

```tsx
// KycPanel — button slot becomes status-conditional
function KycPanel({ item, onClose, onOpenProfile, onUploadDoc, onSubmitAll, onDownloadAll }: {
  item: KycBoardClient;
  ...
  onDownloadAll: (onboardingId: string) => Promise<{ success: boolean; error?: string }>;   // NEW
}) {
  const locked = item.status === "reviewing" || item.status === "active";
  ...
  <div className="flex gap-2.5">
    {!locked && <Button variant="secondary" icon={Bell} full>Request docs</Button>}
    {locked ? (
      <Button icon={Download} full onClick={() => onDownloadAll(item.id)}>Download All</Button>
    ) : (
      <Button icon={Check} full disabled={!canSubmit} onClick={handleSubmitAll}>Submit All</Button>
    )}
  </div>
}
```

```tsx
// per-document row — download affordance replaces the bare chip when locked and a file exists
{!d.can_reupload && d.filename ? (
  <a
    href={downloadUrl(item.id, d.doc_type)}   // GET /rm/onboardings/{id}/documents/{doc_type}/download
    className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary"
  >
    <Download size={13} strokeWidth={2} /> {DOC_STATUS_LABEL[d.status]}
  </a>
) : hovered === i && d.can_reupload ? (
  /* existing upload affordance, unchanged */
) : (
  <Chip tone={tone} dot={false}>{DOC_STATUS_LABEL[d.status]}</Chip>
)}
```

**Behavior / invariants:**
- "Request docs" renders **only** when `item.status ∈ {"initial", "pending_review"}` — it was already inert (no handler) before this unit, so removing it for locked statuses is strictly a subtraction, not a behavior change for the statuses where it stays.
- "Submit All" (today's behavior, including its `canSubmit` gate) is unchanged for `item.status ∈ {"initial", "pending_review"}`.
- "Download All" renders in the exact same slot "Submit All" occupied, only when `item.status ∈ {"reviewing", "active"}`; clicking it hits the Backend layer's `GET /rm/onboardings/{id}/documents/download-all` and triggers a browser download of the returned zip.
- Per-document: a download link (not the upload affordance) shows whenever `!d.can_reupload && d.filename` — i.e. the document is `in_review`/`verified` **and** has a file; when `can_reupload` is true, the existing hover-to-upload behavior is completely unchanged.

**Done when:** on a card in "Reviewing"/"Active," "Request docs" is absent and "Download All" is present in the vacated slot; clicking it downloads a zip; a document in `in_review`/`verified` shows a clickable download link instead of a bare status chip, and clicking it downloads that one file; none of this changes for a card in "Initial"/"Pending for Review".

---

### FE-4 — Client-detail page: 4 fields off mock, onto live data (MANDATORY)

- **Proposal ref:** § Layer 2 — Frontend, A-4
- **Module:** 5.2
- **Files:** `modify: admin-frontend/app/(roles)/rm/client-info/[id]/page.tsx`, `modify: admin-frontend/hooks/api/useClient.ts`, `modify: admin-frontend/lib/rm/clients.ts`
- **Dependencies:** Backend layer's BE-6 (`authorized_by_name`), BE-7 (`id_type`/`id_number`, by-client onboarding route, by-client events route) must exist for this unit's "Done when" to verify against a real backend; the code itself can be written against §7's contract independently.

**Contract:**

```ts
// lib/rm/clients.ts — ClientRow widened
export interface ClientRow {
  ...
  idType: string | null;
  idNumber: string | null;
  authorizedByName: string | null;
}
// dtoToRow(dto) additionally maps: idType: dto.id_type, idNumber: dto.id_number, authorizedByName: dto.authorized_by_name
```

```tsx
// client-info/[id]/page.tsx
// ID Info
<InfoField label="ID Info" value={[data.idType, data.idNumber].filter(Boolean).join(" ") || "—"} />

// Authorized Person
<InfoField label="Authorized Person" value={data.authorizedByName ?? "—"} />

// KYC & Documents — fetched, not mocked
const { data: onboarding } = useOnboardingByClient(data.id);   // NEW hook, GET /rm/onboardings/by-client/{id}
...
{(onboarding?.documents ?? []).map((doc, i) => (
  <CheckRow key={doc.doc_type} doc={docFromDto(doc)} last={i === (onboarding!.documents.length - 1)} />
))}
<Chip tone={...}>{onboarding?.verified_count ?? 0} of {onboarding?.required_count ?? 0} verified</Chip>

// History — fetched, not mocked
const { data: events } = useClientEvents(data.id);   // NEW hook, GET /rm/clients/{id}/events
...
{(events ?? []).map((e, i) => (
  <HistoryItem key={e.id} item={{ t: e.title, d: formatDate(e.created_at), detail: [e.body] }} last={...} />
))}
```

**Behavior / invariants:**
- `docFromDto` maps a `DocumentDTO` to the existing `ClientDoc` shape (`icon`/`tone`/`name`/`status`) reusing `OnboardingBoard.tsx`'s existing `DOC_STATUS_TONE`/`DOC_ICON` lookups (imported, not re-declared) — the same status→visual mapping the KYC board already uses.
- ID Info renders `"—"` only when **both** `idType` and `idNumber` are absent; if only one is present it still shows that one (matches the page's general `?? "—"` convention applied per-field, joined).
- `overlay.tone`/`overlay.status`/`overlay.mandate`/`overlay.since`/`overlay.portfolioValue`/`overlay.cashValue` (the Account Balance card and header chip) **stay on `getMockOverlay`** — not touched by this unit, per the proposal's explicit non-goal.
- The verified/total count shown in the KYC card header comes from `OnboardingDTO.verified_count`/`required_count` (server-computed), not a client-side `.filter(...).length` over the fetched documents.

**Done when:** for a client with a real 013 onboarding cycle: ID Info shows `"<ID Type> <ID Number>"`; Authorized Person shows the real approving officer's name (or `"—"` if not yet approved); KYC & Documents shows the client's actual uploaded/verified documents with a correct `verified/required` count; History shows real `client_events` rows. For a pre-013 client with no onboarding row: ID Info and Authorized Person both show `"—"`; KYC & Documents and History render empty states, not errors.

---

### FE-5 — Initial Cash Deposit field wiring + client-side AUM floor (MANDATORY)

- **Proposal ref:** § Layer 2 — Frontend, A-5
- **Module:** 5.1
- **Files:** `modify: admin-frontend/components/rm/OnboardingModal.tsx`
- **Dependencies:** FE-1 (same file — sequence after FE-1's prop-signature change to avoid a merge conflict, not a functional dependency). Backend layer's BE-8 for the "Done when" 422-parity check against a real backend.

**Contract:**

```tsx
interface ObForm {
  ...
  modelUnit: string;
  initialCashDeposit: string;   // NEW
  mgmtFee: string;
  ...
}
// useState initializer: ..., modelUnit: "", initialCashDeposit: "", mgmtFee: "", ...

<ObField label="Initial Cash Deposit" required>
  <input
    className={inputCls}
    inputMode="numeric"
    value={form.initialCashDeposit}
    onChange={(e) => setForm((f) => ({ ...f, initialCashDeposit: e.target.value.replace(/[^\d.]/g, "") }))}
    placeholder="e.g. 250000"
  />
</ObField>
```

```tsx
// page2Valid gains the floor check
const selectedModel = liveModels.find((m) => m.id === form.model);
const page2Valid = !!(
  form.ibhkId.trim() && form.swId.trim() && form.model &&
  /^[1-9]\d*$/.test(form.modelUnit.trim()) && form.mgmtFee.trim() && form.incentiveFee.trim() &&
  form.initialCashDeposit.trim() &&
  Number(form.initialCashDeposit) >= Number(form.modelUnit) * (selectedModel?.model_size ?? 0)
);
```

```tsx
// handleSubmit's startOnboarding payload
initial_cash_deposit: Number(form.initialCashDeposit),
```

**Behavior / invariants:**
- The floor check mirrors the backend's exactly (`N=0`): `initial_cash_deposit >= units * model_size`. If `model_size` is ever `null`/unknown for the selected model, the check must not silently pass — treat it as `0` (matching the backend's own `model.model_size or Decimal("0")` fallback used elsewhere in this codebase for the identical field).
- A validation message near the field explains *why* Next/Submit is disabled when the floor isn't met — not just a disabled button with no explanation (per the proposal's explicit spec).
- The field follows the exact same controlled-input pattern as `modelUnit` (`:266-271`) — no new input-handling convention introduced.

**Done when:** entering a deposit below the floor disables progressing past step 2 with a visible reason; entering exactly the floor value or above enables it; the submitted payload includes `initial_cash_deposit` as a plain number; a raw value one cent under the floor, if it somehow reaches the backend, gets the same `422` the backend's own BE-8 unit tests for — i.e. client and server agree on the boundary.

---

### FE-6 — Model Subscription: mock swap, allotment/redemption stay interactable no-ops (MANDATORY)

- **Proposal ref:** § Layer 2 — Frontend, A-6
- **Module:** 5.3
- **Files:** `create: admin-frontend/hooks/api/useSubscriptions.ts`, `create: admin-frontend/lib/rm/subscriptions.ts` (the DTO→view mapper — pulled out of the hook, mirroring the existing `lib/pc/models.ts` DTO-mapper convention), `modify: admin-frontend/app/(roles)/rm/model-subscription/page.tsx`, `modify: admin-frontend/components/rm/SubscriptionAccordion.tsx`
- **Dependencies:** Backend layer's BE-9 (`GET /rm/subscriptions`, `GET /rm/subscriptions/{id}/allotments`, including the widened `ClientSubscriptionRowDTO.amount` field) for this unit's "Done when"; code can be written against §7's contract independently.

> **Design goal, stated precisely:** `SubscriptionAccordion.tsx`'s JSX (`ClientAccordionItem`, `ModelAccordionItem`, `TxnTable`) and `SubscriptionFormModal.tsx` are **not rewritten** — they keep consuming the exact same `SubClient`/`SubModel`/`TxnRow` types the mock already produces (`lib/mock/rm-data.ts`). This unit's entire job is producing values of those SAME types from live DTOs, so "what's displayed with mock data" and "what's displayed with live data" are, structurally, the same code path. The "Add allotment"/"Add redemption" buttons and `SubscriptionFormModal` keep opening, prefilling, and closing exactly as today — genuinely interactable, just still not wired to a persisting submit (per the proposal's explicit non-goal).

**Contract:**

```ts
// lib/rm/subscriptions.ts — new file. Pure DTO→view mapping, no fetch logic,
// mirroring lib/pc/models.ts's mapDtoToModel convention. Reuses the EXISTING
// SubClient/SubModel/TxnRow types from lib/mock/rm-data.ts verbatim — this
// file produces values of those types, it does not redefine them.
import { fmtMoney, fmtMoneyShort, fmtTimestamp } from "@/lib/pc/format";
import type { ClientSubscriptionsDTO, AllotRdmptDTO } from "@/lib/onboarding/types";
import type { SubClient, SubModel, TxnRow } from "@/lib/mock/rm-data";

/** "Ardent Capital Partners" -> "AC" — first letter of the first two words,
 *  matching the mock's own `initials` convention exactly. */
export function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = (words[0]?.[0] ?? "") + (words[1]?.[0] ?? "");
  return letters ? letters.toUpperCase() : "—";
}

/** "1.5" (Decimal-as-number, per §3.1's JSON-number convention) -> "1.5%". */
function formatFeePercent(fraction: number): string {
  return `${(fraction * 100).toFixed(fraction * 100 % 1 === 0 ? 0 : 2)}%`;
}

/** One client's summary "Net" row — sourced from the AUTHORITATIVE current
 *  state (ClientSubscriptionRowDTO.units/amount), never re-derived by summing
 *  the ledger. This guarantees the Net row can never drift from what
 *  client_subscriptions actually holds, even before allotment history has
 *  loaded. */
function netRow(sub: ClientSubscriptionsDTO["subscriptions"][number]): TxnRow {
  const amt = sub.amount.toLocaleString("en-US");
  return ["Net", "", "", "", amt, `${sub.units}×`, amt, "", ""];
}

/** One ledger entry -> one TxnRow. Cash Amt and Notional are the SAME number
 *  for live data (the backend has no separately-negotiated cash figure distinct
 *  from units × model_size, unlike a few of the mock's illustrative rows) —
 *  this is a real, stated simplification, not a bug. Currency is always "USD":
 *  no currency field exists anywhere in the schema yet (the mock's CHF/AUD rows
 *  are decorative and have no backing concept to preserve). Dates are formatted
 *  with the SAME fmtTimestamp already used for this exact DTO's fields on the
 *  PC allotments page (AllotTable.tsx) — the mock's placeholder "DD/MM/YYYY"
 *  strings are not a convention worth preserving once real data is behind it. */
export function allotmentToTxnRow(dto: AllotRdmptDTO, ibAccount: string | null): TxnRow {
  const isRedemption = dto.kind === "redemption";
  const amt = fmtMoney(dto.amount).slice(1); // fmtMoney prepends "$"; TxnRow cells don't (Ccy is its own column)
  const signedAmt = isRedemption ? `(${amt})` : amt;
  const mult = `${isRedemption ? "−" : ""}${dto.units}×`;
  const expected = dto.expected_cash_in ? fmtTimestamp(dto.expected_cash_in) : "—";
  return [
    isRedemption ? "Redemption" : "Allotment",
    fmtTimestamp(dto.created_at),
    ibAccount ?? "—",
    "USD",
    signedAmt,
    mult,
    signedAmt,                       // Cash Amt === Notional for live rows — see note above
    isRedemption ? "—" : expected,   // Expected Cash In
    isRedemption ? expected : "—",   // Expected Redemption
  ];
}

/**
 * `ClientSubscriptionsDTO[]` (+ optionally-loaded per-client allotment history)
 * -> `SubClient[]`, the EXACT type `SubscriptionAccordion.tsx` already renders.
 * `allotmentsByClient` is a cache keyed by `client_id`; a client not yet in the
 * cache renders with just its Net row per model (correct, just history-less) —
 * see FE-6's hook for when this cache is populated (lazily, on accordion open).
 */
export function mapSubscriptionsToSubClients(
  dtos: ClientSubscriptionsDTO[],
  allotmentsByClient: Record<string, AllotRdmptDTO[]>,
): SubClient[] {
  return dtos.map((c): SubClient => {
    const ledger = allotmentsByClient[c.client_id];
    const totalAum = c.subscriptions.reduce((s, sub) => s + sub.amount, 0);
    return {
      id: c.client_id,
      name: c.client_name,
      initials: initialsFromName(c.client_name),
      // Every live client has signed the Discretionary PMS Service Agreement
      // (compliance_doc_config.py's REQUIRED_DOCS #1, MANDATORY for every
      // onboarding) — "Discretionary" is a true fact about every real client
      // here, not an invented label standing in for missing data.
      mandate: "Discretionary",
      aum: fmtMoneyShort(totalAum),
      models: c.subscriptions.map((sub): SubModel => {
        const ibAccount = sub.ib_account ?? null;
        const modelTxns = (ledger ?? [])
          .filter((a) => a.model_id === sub.model_id)
          .map((a) => allotmentToTxnRow(a, ibAccount));
        return {
          name: sub.model_name,
          // A client_subscriptions row only exists once onboarding is
          // APPROVED (013 _approve_initial) — there is no per-model
          // review/pending concept in the backend yet, so every live model
          // row is, by construction, Active. Add a real status source here
          // if/when one is modeled; don't invent one now.
          status: "Active",
          tone: "active",
          mgmtFee: formatFeePercent(sub.mgmt_fee),
          incentiveFee: formatFeePercent(sub.incentive_fee),
          account: ibAccount ?? "—",
          rows: ledger === undefined ? [netRow(sub)] : [...modelTxns, netRow(sub)],
        };
      }),
    };
  });
}
```

```ts
// hooks/api/useSubscriptions.ts — new file, following useOnboardingBoard.ts's pattern
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSubscriptions, fetchClientAllotments } from "@/app/(roles)/rm/model-subscription/actions";
import { mapSubscriptionsToSubClients } from "@/lib/rm/subscriptions";
import type { ClientSubscriptionsDTO, AllotRdmptDTO } from "@/lib/onboarding/types";
import type { SubClient } from "@/lib/mock/rm-data";

export interface UseSubscriptionsResult {
  clients: SubClient[] | null;
  loading: boolean;
  error: string | null;
  /** Triggers the per-client allotment fetch at most once per client id
   *  (idempotent no-op if already cached or in flight) — called when a
   *  client's accordion section is opened, not eagerly for every client
   *  up front (that would be one request per row on page load). */
  ensureAllotmentsLoaded: (clientId: string) => void;
}

export function useSubscriptions(): UseSubscriptionsResult {
  const [dtos, setDtos] = useState<ClientSubscriptionsDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allotmentsByClient, setAllotmentsByClient] = useState<Record<string, AllotRdmptDTO[]>>({});
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    fetchSubscriptions().then((r) => (r.success ? setDtos(r.data) : setError(r.error)));
  }, []);

  const ensureAllotmentsLoaded = useCallback((clientId: string) => {
    if (allotmentsByClient[clientId] !== undefined || inFlight.current.has(clientId)) return;
    inFlight.current.add(clientId);
    fetchClientAllotments(clientId).then((r) => {
      inFlight.current.delete(clientId);
      if (r.success) setAllotmentsByClient((m) => ({ ...m, [clientId]: r.data }));
    });
  }, [allotmentsByClient]);

  return {
    clients: dtos ? mapSubscriptionsToSubClients(dtos, allotmentsByClient) : null,
    loading: dtos === null && !error,
    error,
    ensureAllotmentsLoaded,
  };
}
```

```tsx
// model-subscription/page.tsx
const { clients, ensureAllotmentsLoaded } = useSubscriptions();   // replaces: import { SUB_CLIENTS } from "@/lib/mock/rm-data"
const totalClients = clients?.length ?? 0;
const totalModels = clients?.reduce((s, c) => s + c.models.length, 0) ?? 0;
...
<SubscriptionAccordion
  clients={clients ?? []}
  onClientOpen={ensureAllotmentsLoaded}
  onOpenModal={setModal}
  initialOpenClient={deepLink?.openClient}
  initialOpenModelKey={deepLink?.openModelKey}
/>
```

```tsx
// SubscriptionAccordion.tsx — the ONLY changes: accept `clients`/`onClientOpen`
// as props instead of importing SUB_CLIENTS, and call onClientOpen when a
// client section transitions closed -> open. ClientAccordionItem,
// ModelAccordionItem, and TxnTable's own JSX are untouched.
export function SubscriptionAccordion({
  clients, onOpenModal, onClientOpen, initialOpenClient, initialOpenModelKey,
}: {
  clients: SubClient[];                          // NEW — was: `SUB_CLIENTS` imported directly
  onOpenModal: OpenSubscriptionModal;
  onClientOpen?: (clientId: string) => void;      // NEW
  initialOpenClient?: string;
  initialOpenModelKey?: string;
}) {
  const [openClient, setOpenClient] = useState<string | null>(initialOpenClient ?? null);
  const toggle = (id: string) => {
    const next = openClient === id ? null : id;
    setOpenClient(next);
    if (next) onClientOpen?.(next);   // fire on open, not on close
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
        />
      ))}
    </div>
  );
}
```

**Behavior / invariants:**
- **`SubscriptionFormModal.tsx` is not modified by this unit at all.** Its submit button (currently no `onClick`) stays exactly as inert as it is today, and it keeps reading `SUB_CLIENTS`/`MODEL_SIZES`/`MODEL_SIZE_LIST`/`OB_MODEL_CATALOG` for its own dropdowns/fee-autofill — those mock catalogs describe *available models to allot/redeem against*, a genuinely different (and, per the proposal's non-goal, out-of-scope) concept from *a client's existing subscriptions*, which is what this unit wires. The modal remains fully interactable (opens, lets the RM pick client/model/multiplier/date, shows the computed notional) — it simply doesn't persist on submit, identical to its behavior before this unit.
- `ModelAccordionItem`'s "Add allotment"/"Add redemption" buttons are **untouched** — they already call `onOpenModal({ mode, context })` with a `context` built from the (now live) `client`/`model` props; since `SubClient`/`SubModel`'s shape is unchanged, this call site needs zero edits.
- A client's model rows show only the `Net` row until that client's accordion section is opened at least once (`ledger === undefined` in `mapSubscriptionsToSubClients`) — this is a **loading state**, not a bug: opening the section calls `ensureAllotmentsLoaded`, which re-renders with the full ledger once the fetch resolves. `SubClient`/`SubModel`'s shape supports this natively since `rows` was already just an array.
- `aum`/`mandate`/`initials`/`status` are all computed, not carried by the backend as literal strings — each has an explicit, stated justification above (not a silent invention): `aum` sums real `amount` figures, `mandate` is a true fact about every onboarded client, `initials` is a pure display derivation, `status` is "Active" because that's the only state a `client_subscriptions` row can be in today.
- The `RequestTickets.tsx` deep-link (`resolveDeepLink`, reading `SUB_CLIENTS` by array id) is **not** touched by this unit — its `client`/`model` params will need to become real client/model UUIDs once `SUB_CLIENTS` is fully retired, but that's explicitly out of scope here (proposal §3) and is left for whichever future work owns `RequestTickets.tsx`. Note `resolveDeepLink` currently reads `SUB_CLIENTS` directly (`page.tsx:30`) — it will need to switch to reading from `clients` (the live data) in lockstep with whenever `RequestTickets.tsx`'s own ids go live, not before.

**Done when:** the Model Subscription page lists real clients with real subscribed models sourced from `client_subscriptions` (a client onboarded and approved through the wizard appears here with their subscribed model, effective mgmt/incentive fee, IB account, and correct AUM); expanding a client's row triggers exactly one `GET /rm/subscriptions/{id}/allotments` call (not one per model) and then shows that client's real allotment history per model, correctly filtered by `model_id`; the Net row's multiplier/notional always matches `client_subscriptions`'s current `units`/`amount`, independent of whether the ledger has loaded yet; clicking "Add allotment"/"Add redemption"/"Subscribe Client" still opens `SubscriptionFormModal` with the correct prefilled context and still does nothing persistent on submit, identical to before this unit.

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal §4.1)

```python
# ---- New / changed StartOnboardingReq field (Goal 8) -----------------------
class StartOnboardingReq(BaseModel):
    ...                       # unchanged existing fields (013 §4.1)
    initial_cash_deposit: Decimal   # NEW — "Initial Cash Deposit" step-2 field. Request-only:
                                     # consumed once inside OnboardingService.start to resolve
                                     # client_portfolios.cash_deposit/amount_in_trade (Backend C-9)
                                     # and then discarded — no column on client_onboardings or
                                     # anywhere else stores this raw figure.

# 422 from POST /rm/onboardings if initial_cash_deposit < units * model.model_size
# (the N=0% floor; see Backend C-9 for the generalized N% form) — the ONLY place this is
# checked, since the value is resolved and written in this same request, not deferred to approve.

# ---- OnboardingDTO widened field (Goal 7.2) --------------------------------
class OnboardingDTO(BaseModel):
    ...                       # unchanged existing fields (013 §4.1, widened D-9)
    approved_by: str | None   # NEW — display name of the compliance officer who approved
                               # (resolved from users.authorized_by firebase_uid); null until approved

# ---- New RM-scoped client-detail endpoints (Goal 7) ------------------------
# GET /api/rm/onboardings/by-client/{client_id}   -> 200 OnboardingDTO (with documents)
#   404 if the client has no onboarding row (shouldn't happen post-013, but a client
#   created via the pre-existing bare POST /rm/clients path, bypassing onboarding,
#   would have none)
# GET /api/rm/clients/{client_id}/events          -> 200 list[ClientEventDTO]
#   thin re-exposure of the existing OnboardingService.client_events(user_id),
#   gated by Action.CLIENT_VIEW instead of the client's own token

# ---- ClientListItemOut widened fields (Goal 7.1/7.2) -----------------------
class ClientListItemOut(BaseModel):
    ...                       # unchanged existing fields
    id_type: str | None       # NEW — client_onboardings.id_type, joined
    id_number: str | None     # NEW — client_onboardings.id_number, joined
    authorized_by_name: str | None  # NEW — resolved display name of users.authorized_by

# ---- New download endpoints (Goal 4) ---------------------------------------
# GET /api/rm/onboardings/{onboarding_id}/documents/{doc_type}/download  -> 200 file stream
#   RM-scoped mirror of the existing compliance download route; same
#   service.download_document, gated by ONBOARDING_MANAGE instead of ONBOARDING_REVIEW
# GET /api/rm/onboardings/{onboarding_id}/documents/download-all         -> 200 application/zip
#   streams a zip of every document that has a file (storage_key is not null);
#   404 if none has ever been uploaded

# ---- Model Subscription read endpoints (Goal 9) -----------------------------
class ClientSubscriptionRowDTO(BaseModel):
    model_id: uuid.UUID; model_name: str; units: Decimal
    mgmt_fee: Decimal; incentive_fee: Decimal   # effective = override ?? Model default (013 C-5's read-side coalesce)
    ib_account: str | None
    amount: Decimal   # = units * model.model_size — mirrors AllotRdmptDTO.amount (service.py:435);
                       # added (post-draft refinement, BE-9) so this layer's accordion/AUM figure
                       # needs no separate model-size lookup via useModels()

class ClientSubscriptionsDTO(BaseModel):
    client_id: uuid.UUID; client_name: str
    subscriptions: list[ClientSubscriptionRowDTO]

# GET /api/rm/subscriptions                          -> 200 list[ClientSubscriptionsDTO]
#   scoped by the same RM-book visibility rule as GET /rm/clients (clients/repository.py
#   FULL_VISIBILITY_ROLES / _scoped)
# GET /api/rm/subscriptions/{client_id}/allotments   -> 200 list[AllotRdmptDTO]
#   that one client's rows from client_allotment_redemptions (both kinds, history + pending)

# ---- Storage adapter signature widening (Goal 5) ----------------------------
# FileStorage.save(stream, *, suggested_name, content_type=None, subdir: str | None = None) -> str
# FileStorage.open(storage_key) -> BinaryIO   # UNCHANGED signature — subdir is baked into
#                                              # the returned storage_key, not a separate param
```

### 7.2 How this layer honours the seam
- **What this layer contributes:** consumes every DTO/route above via typed hooks/actions; renders `id_type`/`id_number`/`authorized_by_name` with `null`-safe fallbacks; wires `initial_cash_deposit` into the wizard's request payload; gates its own UI on `status` to match what the backend now enforces server-side.
- **What this layer assumes from the other side:** the Backend layer returns exactly these DTOs, with these field names, at these routes, with these status codes — this layer never invents a field name or infers a route path not listed here (the storage `subdir` widening is BE-only and has no frontend-visible surface at all).
- **Change protocol:** any edit to this seam goes back to the proposal's §4 first; this §7 is then re-copied.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Framework / runner:** `vitest` — command: `npx vitest run` (confirmed configured: `admin-frontend/package.json`'s `"test": "vitest run"` script, `admin-frontend/vitest.config.ts` present).
- **Fixtures / seed:** component tests render with React Testing Library (if already the convention in this repo's existing FE tests — otherwise plain hook/pure-function unit tests for the mapper/validation logic, which is where most of this layer's real logic lives).
- **Isolation:** hermetic; no real network calls — every `fetch`/server-action call is mocked via `vi.fn()`/`vi.mock()`.
- **Layer isolation:** tests import only from `admin-frontend/**` and test doubles — the Backend layer's actual endpoints are never hit; where a unit's behavior depends on a DTO shape, the test constructs a fake DTO matching §7 by hand.
- **Test location:** `admin-frontend/tests/`, mirroring source path (e.g. `admin-frontend/tests/lib/onboarding/mappers.test.ts`).
- **Commit policy:** tests are never committed — `tests/` is git-ignored; generated and run locally/CI only.
- **Code generation:** concrete test code is written by the `test-gen` skill from §8.3's goals.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| FE-1 | shared hook instance: modal's `startOnboarding` updates the board's own `data` | fake `useOnboardingBoard()` return shape (`data`/`fetch_`/mutators) |
| FE-2 | `mapRow` copies `status`; `KanbanCard` branches on `status`, not count | fake `OnboardingDTO` with `status="reviewing"`, `verified_count=0` |
| FE-3 | button visibility per status; per-doc download link condition | fake `KycBoardClient`/`DocumentDTO` at each status combination |
| FE-4 | ID Info concatenation incl. partial-null case; each of the 4 fields' fallback-to-mock removal | fake widened `ClientRow`, fake `OnboardingDTO`, fake `ClientEventDTO[]` |
| FE-5 | floor check matches backend formula incl. `model_size` fallback | fake `Model` with/without `model_size` |
| FE-6 | DTO→`SubClient`/`SubModel`/`TxnRow` mapping (incl. Net row, allotment/redemption row shape, fee/AUM formatting); lazy per-client ledger fetch; modal stays untouched/interactable no-op | fake `ClientSubscriptionsDTO[]`, fake `AllotRdmptDTO[]` |

### 8.3 Test goals

#### FE-1
- **Positive:** given a fake `useOnboardingBoard()`-shaped object passed as `board`, `<OnboardingBoard {...board} />` renders `board.data`'s columns; `<OnboardingModal startOnboarding={board.startOnboarding} .../>`'s submit calls the exact same `startOnboarding` reference — asserting reference equality is the practical proxy for "same hook instance" in a component test.
- **Negative:** neither `OnboardingBoard` nor `OnboardingModal` calls `useOnboardingBoard()` internally after this change — a static check (no import of the hook in either file) or a spy on the hook module confirming zero internal invocations from these two components.
- **Invariants:** none beyond "exactly one call site total" (the parent page).
- **Seam mocks:** fake `UseOnboardingBoardResult` object.

#### FE-2
- **Positive:** `mapRow({..., status: "reviewing", verified_count: 0, required_count: 7})` produces a `KycBoardClient` with `status: "reviewing"`; `KanbanCard` given that item renders "0/7 verified", not "Not started".
- **Negative:** `KanbanCard` given `status: "initial"` (any `verifiedCount`) always renders "Not started".
- **Invariants:** the chip text is a pure function of `status` (and, when not `initial`, of the two counts) — never re-derives status from `verifiedCount === 0`.
- **Seam mocks:** fake `OnboardingDTO` rows, one per status value.

#### FE-3
- **Positive:** for `status ∈ {"reviewing", "active"}`, "Download All" renders in place of "Submit All" and clicking it invokes the passed `onDownloadAll` with the item's id; a document with `can_reupload: false` and a `filename` renders a download link.
- **Negative:** "Request docs" does not render for `status ∈ {"reviewing", "active"}`; for `status ∈ {"initial", "pending_review"}`, "Submit All"/"Request docs" render exactly as before this unit (regression check against the pre-existing behavior).
- **Invariants:** the download link only ever appears when `can_reupload` is false AND a filename exists — never when a document has no file yet (nothing to download).
- **Seam mocks:** fake `KycBoardClient` at each status; fake `DocumentDTO` at each `(can_reupload, filename)` combination.

#### FE-4
- **Positive:** `idType="Passport", idNumber="A1"` → ID Info renders `"Passport A1"`; only `idType` present → renders `"Passport"` (not `"Passport —"` or similar); `authorizedByName="Jane Compliance"` → Authorized Person renders that name; fetched documents/events render instead of any `getMockOverlay` call for those two sections.
- **Negative:** both `idType`/`idNumber` `null` → ID Info renders `"—"`; `authorizedByName` `null` → Authorized Person renders `"—"`; a client with no onboarding row (404 from the by-client route) renders an empty KYC/History state, not a crash.
- **Invariants:** the Account Balance card's mocked fields are untouched and still render from `getMockOverlay` — this unit's diff must not remove or alter that call.
- **Seam mocks:** fake widened `ClientRow`, fake `OnboardingDTO` (with `documents`), fake `ClientEventDTO[]`.

#### FE-5
- **Positive:** `initialCashDeposit` exactly equal to `modelUnit * model_size` → `page2Valid` true (all other fields valid); one unit below the floor → false, with a visible reason shown.
- **Negative:** `model_size` unknown/`null` for the selected model → the floor check treats it as `0`, so any non-negative deposit passes rather than the check throwing/`NaN`-ing.
- **Invariants:** the floor formula is textually identical in intent to the backend's `initial_cash_deposit >= units * model.model_size` (N=0) — a shared constant/comment cross-referencing Backend C-9 is enough to keep them from silently drifting apart, not a shared code module (different languages).
- **Seam mocks:** fake `Model` objects with/without `model_size`.

#### FE-6
- **Positive:** `mapSubscriptionsToSubClients` given a fake `ClientSubscriptionsDTO[]` and an empty `allotmentsByClient` produces `SubClient[]` whose every model has `rows = [netRow]` only; given the same DTOs plus a populated `allotmentsByClient` entry for one client, that client's models include the mapped ledger rows (filtered correctly by `model_id`) followed by the Net row, in that order; `allotmentToTxnRow` on a `kind: "allotment"` DTO produces `["Allotment", <date>, <ib>, "USD", <amt>, "<units>×", <amt>, <expected>, "—"]` and on a `kind: "redemption"` DTO produces the parenthesized/negative-multiplier form with the last two columns swapped; `initialsFromName("Ardent Capital")` → `"AC"`; `initialsFromName("Solo")` → single-letter uppercase, not a crash on a one-word name; `formatFeePercent(0.015)` → `"1.5%"`, `formatFeePercent(0.1)` → `"10%"` (no trailing `.0`).
- **Negative:** `mapSubscriptionsToSubClients` given a subscription whose `model_size` was `null` server-side (i.e. `amount: 0` in the DTO) produces a Net row of `"0"`/`"0×"`... no, `sub.units×`, not a crash or `NaN` string; `useSubscriptions().ensureAllotmentsLoaded` called twice in a row for the same `clientId` before the first fetch resolves triggers exactly one network call, not two (the `inFlight` guard). Clicking the modal's submit button (`new-subscription`/`add-allotment`/`redemption`) triggers no network call and no state change beyond the modal's own open/close — confirms the deliberate no-op is preserved, not silently regressed into "does nothing because it's broken" (i.e. the button/inputs remain fully interactive up to the point of submit).
- **Invariants:** `SubscriptionAccordion.tsx` no longer imports `SUB_CLIENTS` from `lib/mock/rm-data.ts` after this unit (an explicit negative-import check is a cheap, high-value assertion here); `SubscriptionFormModal.tsx` is byte-identical to its pre-unit state (this unit's diff must not touch that file at all — assert via a file-not-in-diff check at the schedule/PR level, not a unit test); the Net row's multiplier is always `client_subscriptions`'s current `units`, never a value derived by summing ledger rows (guards against the exact kind of drift a live `SUM()` would introduce, per the proposal's own D-2-adjacent reasoning for `AllotRdmptDTO.agg_before/agg_after`).
- **Seam mocks:** fake `ClientSubscriptionsDTO[]` (including at least one row with `mgmt_fee_override`/`incentive_fee_override` semantics already baked into `mgmt_fee`/`incentive_fee` per the backend's read-side coalesce), fake `AllotRdmptDTO[]` with at least one of each `kind`.
- **Seam mocks:** fake `ClientSubscriptionsDTO[]`/`AllotRdmptDTO[]`.

### 8.4 Aggregate gate
- Local gate, run before commit/PR hand-off: all of the above green, plus `npx tsc --noEmit` and `npm run lint`.
- Target coverage for changed lines: ≥ 90% of new/changed statements in the files listed in §2's read-first inventory.
- Chosen `test-gen` level: **standard** — bump to `thorough` for FE-5 (money-math floor check mirroring a backend validation — worth the extra boundary/parametrized cases) and FE-3 (the most state-combinations-per-unit finding in this layer).

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] FE-1 through FE-6 committed on `onboarding-subsystem-fixing`; each commit left the branch green.
- [ ] §8 unit tests all pass; `npm run test && npx tsc --noEmit && npm run lint` green.
- [ ] §7 matches the proposal's frozen seam verbatim.
- [ ] Browser verification per each unit's "Done when" passes against a real, already-implemented backend (this layer and the Backend layer share a branch, so end-to-end verification is available immediately rather than deferred to an integration phase).
- [ ] PR opened; human owns the merge to `main`.

**Rollback:** every unit reverts cleanly with the branch — this layer introduces no persisted state of its own (no localStorage schema change, no new client-side cache; FE-6's `allotmentsByClient` cache is in-memory `useState`, gone on unmount). FE-6 introduces two net-new files (`hooks/api/useSubscriptions.ts`, `lib/rm/subscriptions.ts`) — reverting its commit removes both and restores `SubscriptionAccordion.tsx`'s prior direct `SUB_CLIENTS` import; `SubscriptionFormModal.tsx` was never touched by FE-6, so there is nothing to revert there.
