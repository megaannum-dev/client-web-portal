# 018 — Client Portal ↔ Backend Integration · Implementation Details — Frontend (client-frontend)

> Status: **DRAFT — pending implementation.**
> Implements: proposal `docs/proposals/018-2026-07-28-client-portal-integration.md` § Layer 3 — Frontend (client-frontend), § 4 (seam), § Design decisions D-1 through D-10, § Execution & verification (step 3), § Rollback.
> Layer: Frontend (client-frontend) — one layer per file.
> Sibling layer docs: `docs/implementations/018-client-portal-integration-db.md` (Database), `docs/implementations/018-client-portal-integration-be.md` (Backend), `docs/implementations/018-client-portal-integration-admin-fe.md` (Frontend — admin-frontend; owns the RM inbox that is the other end of the raise-ticket flow built here).
> Execution schedule: `docs/execution-schedules/018-client-portal-integration-fe.md`
> Branch: `client-portal-integration-fe` — cut from parent `client-portal-integration` (confirmed current branch), merged back into it; human owns the merge to `main`.
> Builds on / prerequisites: this layer builds against the Backend layer's §4/§7 seam (the DTOs and routes below), **not** against the Backend layer's actual implementation. Precondition: Backend layer's routes are deployed/reachable at the configured API base (`NEXT_PUBLIC_API_BASE_URL`), matching §7 exactly. `<TODO: Backend layer's PR/branch merged>`. DB layer's migration (B-1/B-2/B-4/B-5) must also be applied wherever the backend is running against, since several DTO fields (`occupation`, `model_limit`) are sourced from it — this is a Backend-layer concern, not something this layer verifies directly.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/018-2026-07-28-client-portal-integration.md` § Layer 3 — Frontend (client-frontend), § 4, § Design decisions |
| Execution schedule | `docs/execution-schedules/018-client-portal-integration-fe.md` |
| Sibling layer impl docs | `docs/implementations/018-client-portal-integration-db.md`, `docs/implementations/018-client-portal-integration-be.md`, `docs/implementations/018-client-portal-integration-admin-fe.md` |
| Builds on | Backend layer's §4.1 wire contract (routes + DTOs), reproduced verbatim in §7 below; DB layer's migration (indirectly, via the Backend layer) |

---

## 2. Branch & session contract

- **Branch:** `client-portal-integration-fe` — all FE-* units in this doc land on this one branch.
  - Cut from `client-portal-integration` (parent, captured at session start via `git rev-parse --abbrev-ref HEAD`); merges back into it. The human owns that merge.
- **Isolation:** implementable in its own session, in parallel with the DB, Backend, and admin-frontend sessions, provided the preconditions below hold. Shares state with other layers only through §7.
- **Preconditions:**
  - [ ] Backend layer's `/client/*` and `/rm/tickets*` routes are reachable at `NEXT_PUBLIC_API_BASE_URL` and match §7.1 exactly (status codes included).
  - [ ] The frozen seam in the proposal's §4 is agreed (it is — this doc's §7 is copied from it verbatim).
- **Read-first inventory** (every existing file a unit touches):
  - `client-frontend/lib/mock/data.ts`, `lib/mock/store.ts` — the entire mock layer being retired; every `MOCK_*` const and the `STORE_KEYS` registry.
  - `client-frontend/lib/hooks/useSubscriptions.ts`, `lib/hooks/useOnboardingEvents.ts`, `lib/api/onboarding.ts` — the established hook/API-module pattern (`useX()` → `useEffect` + `getIdToken()` + `fetch`) every new hook in this layer must match.
  - `client-frontend/lib/hooks/useLatestEvents.ts`, `useEventItems.ts`, `useAllotmentRequests.ts` — pure `localStorage` readers, deleted in FE-14.
  - `client-frontend/app/(dashboard)/overview/page.tsx`, `portfolio/page.tsx`, `profile/page.tsx`, `events/page.tsx`, `documents/legal-reports/page.tsx`, `documents/monthly-reports/page.tsx` — every page rebound in this layer.
  - `client-frontend/components/ui/RaiseTicketModal.tsx`, `components/header/HeaderActions.tsx`, `components/ui/FloatingActionButton.tsx`, `components/KycProvider.tsx`, `components/MockStoreInit.tsx`, `app/(dashboard)/layout.tsx` (mounts `MockStoreInit`).
  - `client-frontend/types/portal.ts`, `public/locales/en/translation.json`, `public/locales/zh-TW/translation.json`.
  - `client-frontend/app/(dashboard)/support/page.tsx` — dead route deleted in FE-13.
- **Hand-off / exit signal:** all FE-* units committed; `rg "MOCK_"` and `rg "localStorage"` (outside theme/locale prefs) return nothing in `client-frontend/{app,components,lib}`; `npm run lint`, `tsc --noEmit`, `npm run test`, `npm run build` all green; PR opened against `client-portal-integration`.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions

- **Data-access layering:** `page.tsx → lib/hooks/useX.ts → lib/api/<module>.ts → fetch(getApiBase() + path, Bearer <token>)`. No page calls `fetch` directly (established by 013 and already true of `useSubscriptions`/`useOnboardingEvents`). A page may call more than one hook (e.g. `portfolio/page.tsx` uses both `usePortfolio()` and `useRecommendedModels()`); a hook never imports another hook.
- **Hook shape (the pattern every new hook matches):** `lib/hooks/useSubscriptions.ts` establishes it — `useState` for `data`/`loading`/`error`, a `useEffect` that awaits `useAuth().getIdToken()`, calls one `lib/api/*` function, and sets state, with a `cancelled` flag to avoid a post-unmount `setState`. Every new hook in this layer (`usePortfolio`, `usePortfolioHistory`, `useRecommendedModels`, `useProfile`, `useKyc`, `useDocuments`, `useRequests`) follows this exact shape; none introduces a different one (no SWR/React Query — not an installed dependency, and one hand-rolled shape already covers every case here).
- **API module shape:** one file per resource under `lib/api/`, each exporting typed `fetch*`/`patch*`/`submit*` functions built on the existing `authedGet<T>` helper in `lib/api/onboarding.ts` (or a POST/PATCH sibling of it) — same error-unwrapping (`detail` field), same `Bearer` header convention. New modules add a `authedPost`/`authedPatch`/`authedUpload` helper alongside `authedGet` in the same file rather than duplicating the fetch/error-parsing logic per module.
- **DTO naming:** wire fields are consumed verbatim (snake_case) in the `lib/api/*` DTO interfaces; a hook may map a DTO to a camelCase view-model only where the existing component already expects one (e.g. `SubscribedModelView`) — new work should prefer binding to the DTO shape directly and let JSX read `model_limit`/`ib_account` etc., since nothing here needs a stable view-model layer the DTO doesn't already provide.
- **Money/formatting:** DTOs carry money as `number`; every render site formats with `Intl.NumberFormat` or the existing `mask()`/currency helpers already in each page. No arithmetic in a page beyond what the seam's Field-map documents as FE-side (formatting only) — total/change/amount/notional are Backend-derived per §7.
- **`null` rendering:** any DTO field typed `T | null` renders the existing `"—"` placeholder already used throughout the mock era — never a fabricated default.
- **i18n:** every new/changed label goes through `useTranslation()`'s `t()`; both `public/locales/en/translation.json` and `public/locales/zh-TW/translation.json` are edited together, never one alone.
- **Component structure:** per the proposal's top-level constraint, no unit in this layer changes page composition, spacing, or component tree shape — only data bindings, column sets (A-3), and the specific dormant/removed cards named in A-4/C-1.

### 3.2 CI/CD & engineering discipline

- **Trunk-friendly, small units.** Each FE-* unit is its own commit; the branch stays green (lint + type-check + test + build) after every commit.
- **Every unit is independently revertible**, with one documented exception: FE-14 (mock-layer deletion) depends on every other unit having already removed its own `MOCK_*`/`lib/mock/*` import — it cannot land first, and reverting it before its dependents are reverted would break the branch.
- **Additive-first ordering:** each page adds its new hook/data binding in the same commit that removes the mock import it replaces (no unit leaves a page half-migrated); the mock *files* themselves are the one contraction step, scheduled last.
- **Gates before merge** (this layer, run from `client-frontend/`):
  ```bash
  npm run lint            # next lint
  npx tsc --noEmit         # type-check (no dedicated script; project has no separate "type-check" script)
  npm run test             # vitest run
  npm run build            # next build
  ```
  Confirmed present: `client-frontend/package.json` has `"lint": "next lint"`, `"test": "vitest run"`, `"build": "next build"`, and a `client-frontend/vitest.config.ts` (jsdom, `@vitejs/plugin-react`, `@/` alias) — the `test` script is real and backed by a real config, not assumed.
- **No secrets, no manual steps in the merge path.** Nothing in this layer touches infra; the only human gate is the visual-confirmation gate the proposal names for step 3 (Execution & verification), which is scheduling metadata, not a unit here.
- **Reversibility:** every unit is a pure frontend change with no persisted state of its own (see §9) — the branch reverts cleanly except for the FE-14 ordering note above.

---

## 4. Architecture

**Target layout:**
```
client-frontend/
  lib/
    api/
      onboarding.ts        # existing — subscriptions + events, untouched
      portfolio.ts          # NEW — FE-1
      models.ts             # NEW — FE-3
      profile.ts             # NEW — FE-4
      kyc.ts                 # NEW — FE-5
      documents.ts           # NEW — FE-6
      tickets.ts              # NEW — FE-8
      requests.ts             # NEW — FE-9
    hooks/
      useSubscriptions.ts     # DELETED — FE-1 (superseded by usePortfolio)
      useOnboardingEvents.ts  # RENAMED useClientEvents — FE-11
      useLatestEvents.ts      # DELETED — FE-14
      useEventItems.ts        # DELETED — FE-14
      useAllotmentRequests.ts # DELETED — FE-14
      usePortfolio.ts          # NEW — FE-1
      usePortfolioHistory.ts   # NEW — FE-1
      useRecommendedModels.ts  # NEW — FE-3
      useProfile.ts             # NEW — FE-4
      useKyc.ts                  # NEW — FE-5
      useDocuments.ts             # NEW — FE-6
      useRequests.ts               # NEW — FE-9
    mock/
      data.ts, store.ts          # DELETED — FE-14
  components/
    MockStoreInit.tsx             # DELETED — FE-14
    KycProvider.tsx                # DELETED — FE-5
    ui/RaiseTicketModal.tsx         # MODIFIED — FE-8
    ui/FloatingActionButton.tsx      # MODIFIED — FE-7
    header/HeaderActions.tsx          # MODIFIED — FE-12
  app/(dashboard)/
    overview/page.tsx                  # MODIFIED — FE-9, FE-10
    portfolio/page.tsx                  # MODIFIED — FE-2, FE-3, FE-9
    profile/page.tsx                     # MODIFIED — FE-4, FE-5
    events/page.tsx                       # MODIFIED — FE-11
    documents/legal-reports/page.tsx       # MODIFIED — FE-6
    documents/monthly-reports/page.tsx      # MODIFIED — FE-7
    support/page.tsx                         # DELETED — FE-13
    layout.tsx                                 # MODIFIED — FE-14 (drop <MockStoreInit/>)
  types/portal.ts                              # MODIFIED — FE-13
  public/locales/{en,zh-TW}/translation.json     # MODIFIED — FE-3, FE-13
```

**Dependency direction:** `page.tsx → hooks → api modules → fetch`. `lib/api/*` may import only `lib/auth-api.ts` (`getApiBase`) and shared error-unwrap helpers; it never imports a hook or a component. `lib/hooks/*` may import `components/auth/AuthProvider.tsx` (`useAuth`) and one `lib/api/*` module; never another hook, never `lib/mock/*` after FE-14.

**External seams:** consumes every `/api/client/*` route in §7.1; consumes no `/api/rm/*` route (that is the admin-frontend layer's surface). Depends on no DB table directly — all data crosses the Backend layer's DTOs.

---

## 5. Modules

### 5.1 `lib/api/*` — typed fetch layer
- **Responsibility:** one authenticated GET/POST/PATCH/upload per backend route in §7.1, with typed request/response shapes and the existing `detail`-unwrapping error convention.
- **Files:** `lib/api/portfolio.ts`, `models.ts`, `profile.ts`, `kyc.ts`, `documents.ts`, `tickets.ts`, `requests.ts` (all new); `lib/api/onboarding.ts` (existing, untouched — still serves `/client/subscriptions` retirement-adjacent `/client/events`).
- **Public surface:** typed `fetch*`/`patch*`/`submit*`/`upload*` functions, one per route.
- **Owns features:** FE-1, FE-3, FE-4, FE-5, FE-6, FE-8, FE-9.

### 5.2 `lib/hooks/*` — data hooks
- **Responsibility:** bridge a page to one `lib/api/*` module using the `useSubscriptions`-established shape; own loading/error state.
- **Files:** `lib/hooks/usePortfolio.ts`, `usePortfolioHistory.ts`, `useRecommendedModels.ts`, `useProfile.ts`, `useKyc.ts`, `useDocuments.ts`, `useRequests.ts` (all new); `useOnboardingEvents.ts` (renamed `useClientEvents`, FE-11); `useSubscriptions.ts`, `useLatestEvents.ts`, `useEventItems.ts`, `useAllotmentRequests.ts` (deleted, FE-1/FE-14).
- **Public surface:** `useX(): { data, loading, error }` (or a narrower shape where a page needs no loading UI, e.g. `useClientEvents(): EventEntry[]`, matching `useOnboardingEvents`'s existing fail-silent contract).
- **Owns features:** FE-1, FE-3, FE-4, FE-5, FE-6, FE-9, FE-11.

### 5.3 Page components
- **Responsibility:** bind hooks to the existing, unchanged JSX structure; own no data-fetching logic itself.
- **Files:** `app/(dashboard)/{overview,portfolio,profile,events}/page.tsx`, `documents/{legal-reports,monthly-reports}/page.tsx`.
- **Public surface:** none (leaf pages).
- **Owns features:** FE-2, FE-3, FE-4, FE-5, FE-6, FE-7, FE-9, FE-10, FE-11.

### 5.4 Ticket flow
- **Responsibility:** the three raise-ticket forms and the floating quick-action that opens them.
- **Files:** `components/ui/RaiseTicketModal.tsx`, `components/ui/FloatingActionButton.tsx`.
- **Public surface:** `RaiseTicketModal({ onClose, onConfirm })` (signature unchanged; `onConfirm`'s payload type changes from the mock `AllotmentRequest` to the new `ClientRequestDTO`).
- **Owns features:** FE-7 (FAB's download-latest-statement action only), FE-8.

### 5.5 Header
- **Responsibility:** RM contact popup, sourced from the profile DTO instead of a mock contact.
- **Files:** `components/header/HeaderActions.tsx`.
- **Public surface:** none (leaf component).
- **Owns features:** FE-12.

### 5.6 Cleanup
- **Responsibility:** remove everything that has no importer once FE-1…FE-12 land — dead route, dead i18n namespace, stale type file, and finally the mock layer itself.
- **Files:** `app/(dashboard)/support/page.tsx`, `types/portal.ts`, `public/locales/{en,zh-TW}/translation.json`, `lib/mock/{data,store}.ts`, `components/MockStoreInit.tsx`, `app/(dashboard)/layout.tsx`.
- **Owns features:** FE-13, FE-14.

---

## 6. Features

### FE-1 — Portfolio data-access + hooks (Yes — user req.)

- **Proposal ref:** § Layer 3 A-2
- **Module:** 5.1, 5.2
- **Files:** `create: lib/api/portfolio.ts`, `create: lib/hooks/usePortfolio.ts`, `create: lib/hooks/usePortfolioHistory.ts`, `delete: lib/hooks/useSubscriptions.ts`
- **Dependencies:** none — parallel-safe with FE-3 through FE-13; must land before FE-2, FE-9, FE-10, FE-12 (which consume `usePortfolio`).

**Contract:**

```ts
// lib/api/portfolio.ts
export interface PositionDTO {
  model_id: string;
  model_name: string;
  units: number;
  amount: number;
  model_limit: number | null;
  ib_account: string | null;
}

export interface PortfolioDTO {
  cash_deposit: number;
  amount_in_trade: number;
  previous_amount_in_trade: number;
  total_value: number;
  change_amount: number;
  change_pct: number | null;
  updated_at: string | null;
  positions: PositionDTO[];
}

export interface HistoryPointDTO {
  month: string;                     // "YYYY-MM"
  total: number;
  per_model: Record<string, number>; // model_name -> cumulative
}

export async function fetchPortfolio(token: string | null): Promise<PortfolioDTO>;
export async function fetchPortfolioHistory(token: string | null, months?: number): Promise<HistoryPointDTO[]>;
// GET /api/client/portfolio ; GET /api/client/portfolio/history?months=<months>  (default 6)
```

```ts
// lib/hooks/usePortfolio.ts — same useEffect+getIdToken+fetch shape as useSubscriptions
export function usePortfolio(): { data: PortfolioDTO | null; loading: boolean; error: string | null };

// lib/hooks/usePortfolioHistory.ts
export function usePortfolioHistory(months?: number): { data: HistoryPointDTO[]; loading: boolean; error: string | null };
```

**Behavior / invariants:** `usePortfolio` returns `data: null` (not a zeroed object) while loading/erroring, so callers must null-check — mirrors the "missing `client_portfolios` row = zeros" invariant being a *Backend* guarantee (DB B-3 / Backend §B), not something the FE re-derives. `usePortfolioHistory` re-fetches when `months` changes. `useSubscriptions.ts` and its `SubscribedModelView`/`mapSubscription` are deleted in this unit (not FE-14) because A-2/A-3 fully supersede it — the mock-layer deletion unit only removes files that still have zero importers at that point.

**Done when:** `usePortfolio()`/`usePortfolioHistory()` compile against the DTOs above; no file still imports `useSubscriptions`.

---

### FE-2 — Portfolio charts and stat cards on real data (Yes — user req.)

- **Proposal ref:** § Layer 3 A-2
- **Module:** 5.3
- **Files:** `modify: app/(dashboard)/portfolio/page.tsx`
- **Dependencies:** FE-1

**Contract:**

```tsx
// portfolio/page.tsx — module-level BAR_DATA/LINE_DATA/DONUT_DATA constants deleted;
// replaced by derivations from the two hooks, computed once per render:
const { data: portfolio } = usePortfolio();
const { data: history }   = usePortfolioHistory(6);

const donutData = [
  ...(portfolio?.positions ?? []).map((p, i) => ({ name: p.model_name, value: p.amount, color: PALETTE[i % PALETTE.length] })),
  { name: "Cash", value: portfolio?.cash_deposit ?? 0, color: CASH_COLOR },
];

const modelKeys = history.length ? Object.keys(history[history.length - 1].per_model) : [];
const lineData  = history.map((h) => ({ month: h.month, total: h.total, ...h.per_model }));

const barData = modelKeys.map((k) => ({
  name: k,
  value: history.length ? history[history.length - 1].per_model[k] - history[0].per_model[k] : 0,
}));
const totalBarValue = history.length ? history[history.length - 1].total - history[0].total : 0;
```

**Behavior / invariants:** the donut's Cash slice always renders even at `0`. The line chart plots `total` (replacing "YTD Avg") plus one series per `per_model` key — the key set is stable across all points per the seam's guarantee (§7.1 `HistoryPointDTO`), so `LINE_SERIES` is now computed from `modelKeys`, not hardcoded. The bar chart's "YTD Avg" bar becomes a `total` net-change bar; `ReferenceLine y={0}` keeps its existing meaning (net positive/negative flow) unchanged (D-1: relabelled, not recomputed into a fabricated return). Stat cards: Card 1 = `total_value`; Card 2 = `cash_deposit`; Card 3 relabels "YTD Returns" → Amount in Trade, sub-line = `change_amount`/`change_pct` (render `—` when `change_pct` is `null`); Card 4 relabels "Portfolio Health" → Subscribed Models, value = `positions.length`, sub-line = sum of non-null `model_limit`s. Chart/card component structure, sizing, and layout are unchanged — only bindings and titles where the current title names data that doesn't exist.

**Done when:** all four stat cards and all three charts render from `usePortfolio()`/`usePortfolioHistory()` with zero references to `BAR_DATA`/`LINE_DATA`/`DONUT_DATA`/`MOCK_PORTFOLIO_STATS`; a 6-month window with a gap month still renders an unbroken line (Backend's carry-forward, asserted visually).

---

### FE-3 — Model attribute rework: Subscribed + Recommended tables (Yes — user req.)

- **Proposal ref:** § Layer 3 A-3
- **Module:** 5.1, 5.2, 5.3
- **Files:** `create: lib/api/models.ts`, `create: lib/hooks/useRecommendedModels.ts`, `modify: app/(dashboard)/portfolio/page.tsx`, `modify: public/locales/en/translation.json`, `modify: public/locales/zh-TW/translation.json`
- **Dependencies:** FE-1 (Subscribed Models reads `usePortfolio().positions`)

**Contract:**

```ts
// lib/api/models.ts
export interface RecommendedModelDTO {
  model_id: string;
  name: string;
  category: string[] | null;
  model_limit: number | null;
  subscription_redemption: string | null;
  description: string | null;
  has_material: boolean;
}
export async function fetchRecommendedModels(token: string | null): Promise<RecommendedModelDTO[]>;
export function modelMaterialDownloadUrl(modelId: string): string;
// GET /api/client/models/recommended ; GET /api/client/models/{model_id}/material
```

```tsx
// portfolio/page.tsx
// Subscribed Models — 5 columns: Model Name | Amount | Multiplier | Model Limit | IB Account
<ModelTable columns={[...]} gridTemplate="15rem repeat(4, 1fr)">
  {portfolio?.positions.map((p) => (
    <ModelRow key={p.model_id} gridTemplate="15rem repeat(4, 1fr)">
      <Cell>{p.model_name}</Cell>
      <Cell>{fmtMoney(p.amount)}</Cell>
      <Cell>{`${p.units.toFixed(1)}x`}</Cell>
      <Cell>{p.model_limit != null ? fmtMoney(p.model_limit) : "—"}</Cell>
      <Cell>{p.ib_account ?? "—"}</Cell>
    </ModelRow>
  ))}
</ModelTable>

// Recommended Models — 5 columns: Model Name | Category | Model Limit | Subscription/Redemption | Market Material
{recommended.map((m) => (
  <ModelRow key={m.model_id} gridTemplate="15rem repeat(4, 1fr)">
    <Cell>{m.name}</Cell>
    <Cell>{m.category?.join(", ") ?? "—"}</Cell>
    <Cell>{m.model_limit != null ? fmtMoney(m.model_limit) : "—"}</Cell>
    <Cell>{m.subscription_redemption ?? "—"}</Cell>
    <Cell>{m.has_material && <DownloadButton href={modelMaterialDownloadUrl(m.model_id)} />}</Cell>
  </ModelRow>
))}
```

**Behavior / invariants:** `RiskBadge` component and its `risk.*` i18n namespace are deleted — no remaining caller. `SUBSCRIBED_COL_KEYS`/`RECOMMENDED_COL_KEYS` shrink to 5 entries each; the removed keys (`country`, `sector`, `symbol`, `min_investment`, `risk_level`) are deleted from both `en` and `zh-TW` under `portfolio.subscribed_columns.*`/`portfolio.recommended_columns.*`. Market Material button hidden (not disabled) when `has_material === false`; clicking it streams from `GET /api/client/models/{model_id}/material` via the existing `downloadAs`-style flow, 404 never reachable in practice because the button is hidden on `false`.

**Done when:** both tables render exactly 5 columns with the mapping above; `rg "RiskBadge|MOCK_RECOMMENDED_MODELS|MOCK_SUBSCRIBED_MODELS"` in `portfolio/page.tsx` returns nothing; `en`/`zh-TW` `risk.*` namespace and the 3 dropped column keys per table are gone from both locale files.

---

### FE-4 — Profile: personal info + PATCH (Yes — user req.)

- **Proposal ref:** § Layer 3 A-4
- **Module:** 5.1, 5.2, 5.3
- **Files:** `create: lib/api/profile.ts`, `create: lib/hooks/useProfile.ts`, `modify: app/(dashboard)/profile/page.tsx`, `modify: public/locales/en/translation.json`, `modify: public/locales/zh-TW/translation.json`
- **Dependencies:** none — parallel-safe with FE-1/FE-3; FE-5 shares the same page file so the two should land as adjacent commits, not concurrent branches.

**Contract:**

```ts
// lib/api/profile.ts
export interface RmContactDTO { name: string | null; email: string | null; phone: string | null; }
export interface ClientProfileDTO {
  name: string | null;
  email: string | null;
  phone: string | null;
  occupation: string | null;
  date_of_birth: string | null; // "YYYY-MM-DD"; read-only — never sent in ClientProfilePatch
  address: string | null;
  country_of_residence: string | null;
  ib_account: string | null;
  client_ref: string;
  assigned_rm: RmContactDTO | null;
}
export interface ClientProfilePatch {
  name?: string; occupation?: string; address?: string; country_of_residence?: string;
  // date_of_birth is deliberately NOT a member of this type — the backend
  // 422s if it's sent (D-11); there is no code path in this unit that could
  // construct a patch object containing it.
}
export async function fetchProfile(token: string | null): Promise<ClientProfileDTO>;
export async function patchProfile(token: string | null, patch: ClientProfilePatch): Promise<ClientProfileDTO>;
// GET/PATCH /api/client/profile
```

```ts
// lib/hooks/useProfile.ts
export function useProfile(): {
  data: ClientProfileDTO | null; loading: boolean; error: string | null;
  save: (patch: ClientProfilePatch) => Promise<{ ok: true } | { ok: false; error: string }>;
};
```

**Behavior / invariants:** `commitEdit` becomes `await save({ name, occupation, address, country_of_residence })` — optimistic: the draft is applied to local state immediately, and on failure the page reverts to `saved` and shows the `error` string inline (no silent success, per the seam's stated `422` case for an unsettable field). The **Company field is removed entirely** — no input, no `t("profile.company")` label, no `ProfileInfo.company` — this proposal explicitly dropped it (DB B-2, D-nothing-adds-it-back); Occupation takes its cell in the existing two-column grid, and **Date of Birth now fills the adjacent cell** (previously left empty) as a read-only value — the page's existing `ReadOnlyField`/`ProfileField` display component, no input, no "edit in Settings" link, formatted via the standard locale date formatter already used elsewhere on this page (`toLocaleDateString`). `date_of_birth` is read from `ClientProfileDTO` only; it is never part of `draft`, `patchDraft`, or the object passed to `save()` — there is no code path by which editing occupation/name/address could accidentally include it. The avatar initial guard becomes `(saved.name ?? user?.displayName ?? "?")[0]?.toUpperCase() ?? "?"` so an empty name never throws. Phone/Email stay read-only, sourced from the DTO's `phone`/`email` fields, with the existing "edit in Settings" affordance untouched.

**Done when:** editing and saving Full Name/Occupation/Address/Country-of-Residence round-trips through `PATCH /api/client/profile`; no `company` field exists anywhere in the page, its i18n keys, or its type; Date of Birth renders as a formatted date (or `—` when `null`) with no edit affordance and is absent from every `save()` call's payload; an empty `name` renders `"?"` instead of throwing.

---

### FE-5 — Profile: renewal document card, AML deletion, Supporting Documents shelved (Yes — user req.)

- **Proposal ref:** § Layer 3 A-4
- **Module:** 5.1, 5.2, 5.3
- **Files:** `create: lib/api/kyc.ts`, `create: lib/hooks/useKyc.ts`, `modify: app/(dashboard)/profile/page.tsx`, `delete: components/KycProvider.tsx`
- **Dependencies:** none — parallel-safe with FE-4 (adjacent commits on the same file, see FE-4's note).

**Contract:**

```ts
// lib/api/kyc.ts — DocumentDTO reused verbatim from the Backend's onboarding schemas (D-8);
// this module does not redefine it, it imports the shape as documented by the seam (§7.1).
export interface DocumentDTO {
  doc_type: string; status: "not_started" | "uploaded" | "in_review" | "verified" | "rejected" | "expired";
  uploaded_by: string | null; uploaded_at: string | null; reviewed_at: string | null;
  expires_at: string | null; issue_note: string | null; version_no: number;
}
export interface KycPanelDTO {
  overall: "due" | "processing" | "verified";
  documents: DocumentDTO[];
  next_review_at: string | null;
  renewal_doc_type: string | null;
  upload_opens_at: string | null;
  can_upload: boolean;
  upload_blocked_reason: "window_not_open" | "in_review" | "cycle_not_editable" | "no_cycle" | null;
}
export async function fetchKycPanel(token: string | null): Promise<KycPanelDTO>;
export async function uploadKycDocument(token: string | null, docType: string, file: File): Promise<DocumentDTO>;
// GET /api/client/kyc ; POST /api/client/kyc/{doc_type}  (multipart)
```

```ts
// lib/hooks/useKyc.ts
export function useKyc(): {
  data: KycPanelDTO | null; loading: boolean; error: string | null;
  upload: (file: File) => Promise<{ ok: true } | { ok: false; error: string }>;
  refetch: () => void;
};
```

**Behavior / invariants:** the existing tri-state card markup (`kycStatus === "verified"|"processing"|"due"`) is retargeted 1:1 to `overall` — no markup change, only the source. Badge/date line reads `next_review_at`; "View document" downloads through `lib/api/documents.ts` (FE-6) instead of `/dummy-KYC-Report.pdf`. `applyKycStatus` and the `STORE_KEYS.kycStatus` write are deleted. The **Upload button's enabled state binds to `can_upload` only** — the FE never computes the 14-day window itself; when disabled, the caption reads `t("profile.upload_available_from", { date: upload_opens_at })`. The upload modal's document-type `<select>` is removed (exactly one uploadable document — `renewal_doc_type`); `handleSubmit` calls `upload(file)` and surfaces `403`/`409`/`413`/`415` `detail` strings inline instead of the current unconditional `onSuccess()`. **AML card is deleted outright** (the block at `profile/page.tsx:541-558` in the pre-change file) — no DocSpec or column backs it anywhere in the repo (D-5). The Document Verification row reflows from 3 cards to 2 under the existing `flex-wrap` + `min-w-[260px]` — no new layout rule. **Supporting Documents card is commented out, not deleted**, together with `SupportingDocModal`, its `supportingDocs` state, and the `SUPPORTING_DOC_CATEGORIES`/`SupportingDoc` types (which move into the comment block rather than dying with `lib/mock/data.ts` in FE-14):

```tsx
// ponytail: Supporting Documents shelved (D-5) — reviving needs either a DocSpec
// key per category, or a relaxed UniqueConstraint(onboarding_id, doc_type) if a
// client must hold several files of one kind. JSX/state kept below, commented,
// so a future proposal restores rather than rewrites this.
// <div className="flex-1 min-w-[260px] ...">
//   ...
// </div>
```

`components/KycProvider.tsx` is deleted — nothing reads its context once `applyKycStatus`'s caller is gone.

**Done when:** the KYC card renders `overall`/`next_review_at` from `useKyc()`; the Upload button's disabled state matches `can_upload` exactly with no local date math; the AML card no longer exists in the DOM or the codebase; the Supporting Documents block exists only inside a comment with the `ponytail:` note above it; `KycProvider.tsx` is deleted.

---

### FE-6 — Legal reports from the directory listing (Yes — user req.)

- **Proposal ref:** § Layer 3 A-5
- **Module:** 5.1, 5.2, 5.3
- **Files:** `create: lib/api/documents.ts`, `create: lib/hooks/useDocuments.ts`, `modify: app/(dashboard)/documents/legal-reports/page.tsx`
- **Dependencies:** none — parallel-safe.

**Contract:**

```ts
// lib/api/documents.ts
export interface StoredFileDTO {
  key: string; filename: string; size_bytes: number | null;
  modified_at: string | null; category: string | null; period: string | null;
}
export type DocumentScope = "legal" | "statements";
export async function fetchDocuments(token: string | null, scope: DocumentScope): Promise<StoredFileDTO[]>;
export async function downloadDocument(token: string | null, scope: DocumentScope, key: string): Promise<Blob>;
// GET /api/client/documents/{scope} ; GET /api/client/documents/{scope}/download?key=<key>
```

```ts
// lib/hooks/useDocuments.ts
export function useDocuments(scope: DocumentScope): { data: StoredFileDTO[]; loading: boolean; error: string | null };
```

**Behavior / invariants:** `legal-reports/page.tsx` groups by `StoredFileDTO.category` (the immediate sub-folder name) using the existing `CATEGORY_KEYS` map as a known-folder lookup, falling through to the raw folder name for anything unmapped — never dropping a row for an unrecognised category. `StoredFileDTO` carries no `description`; the description cell renders the filename stem (`doc.filename.replace(/\.[^.]+$/, "")`) instead of a fabricated string, and the column itself is not removed (no layout change). `key` is treated as **fully opaque** end-to-end: it is read from the DTO and passed straight to `downloadDocument`/the download URL — never parsed, sliced, or reconstructed by this layer (Backend C-4's allow-list is the only thing that interprets it). Empty directory renders the existing empty-state row.

**Done when:** the legal reports page renders `useDocuments("legal")` grouped by category with zero references to `MOCK_LEGAL_DOCUMENTS`; download hits `/api/client/documents/legal/download?key=...` with the DTO's own `key`, unmodified.

---

### FE-7 — Monthly reports + FAB on the same documents hook (Yes)

- **Proposal ref:** § Layer 3 A-6
- **Module:** 5.1, 5.2, 5.3, 5.4
- **Files:** `modify: app/(dashboard)/documents/monthly-reports/page.tsx`, `modify: components/ui/FloatingActionButton.tsx`
- **Dependencies:** FE-6 (reuses `useDocuments`)

**Contract:**

```tsx
// monthly-reports/page.tsx
const { data: statements, loading } = useDocuments("statements");
// Period column: statements[i].period ?? formatDate(statements[i].modified_at)
// Generated column: formatDate(statements[i].modified_at)
```

```tsx
// FloatingActionButton.tsx — "download latest statement" action
const { data: statements } = useDocuments("statements");
const latest = statements[0]; // server-sorted, newest first
<button disabled={!latest} onClick={() => latest && downloadDocument(token, "statements", latest.key)}>...
```

**Behavior / invariants:** **this page and the FAB are expected to render their empty state on day one and stay that way** until a future EoM-generator proposal ships (D-7) — this is the correct end state for this layer, not a wiring gap, and is stated explicitly here so nobody "fixes" it by re-adding mock rows. Pagination logic in `monthly-reports/page.tsx` is untouched structurally; it just operates over `statements` instead of `MOCK_EOM_REPORTS`.

**Done when:** with an empty `statements` directory, the page renders its existing empty-state row (not "0 of 0" pagination chrome implying data exists) and the FAB's download action is disabled; with one manually-staged file (the seeded walkthrough in Execution step 4), the row and the FAB both resolve and download it correctly.

---

### FE-8 — RaiseTicketModal posts to the server (Yes — user req.)

- **Proposal ref:** § Layer 3 A-7
- **Module:** 5.1, 5.4
- **Files:** `create: lib/api/tickets.ts`, `modify: components/ui/RaiseTicketModal.tsx`
- **Dependencies:** FE-1 (Redemption picker → `usePortfolio().positions`), FE-3 (Allotment picker → `useRecommendedModels()`)

**Contract:**

```ts
// lib/api/tickets.ts
export type TicketKind = "allotment" | "redemption" | "other";
export type TicketStatus = "new" | "in_progress" | "replied" | "closed" | "declined";
export interface RaiseTicketReq {
  kind: TicketKind; model_id?: string; subject?: string; category?: string;
  amount?: number; multiplier?: number; currency?: string; message: string;
}
export interface ClientRequestDTO {
  source: "ticket" | "allotment"; ref: string; kind: TicketKind; subject: string;
  model_name: string | null; amount: number | null; created_at: string; status: TicketStatus;
}
export async function submitTicket(token: string | null, req: RaiseTicketReq): Promise<ClientRequestDTO>;
// POST /api/client/tickets
```

```tsx
// RaiseTicketModal.tsx
export function RaiseTicketModal({ onClose, onConfirm }: {
  onClose: () => void;
  onConfirm: (req: ClientRequestDTO) => void;   // was AllotmentRequest
}) { ... }

// AllotmentForm — model picker now reads useRecommendedModels() instead of MOCK_RECOMMENDED_MODELS
// RedemptionForm — model picker now reads usePortfolio().positions instead of MOCK_SUBSCRIBED_MODELS;
//   selectedModel.amount is now a real number from PositionDTO.amount (resolves the 013-era blocker
//   documented in lib/mock/data.ts's SubscribedModel comment: SubscriptionDTO had no amount, so a
//   redemption's "amount" could never be anything but a display string — PositionDTO fixes that).
```

**Behavior / invariants:** all three forms call one `submitTicket()`; `kind`/`subject`/`category`/`amount`/`multiplier` map directly from each form's fields (`kind: "other"` requires `subject`, others require `model_id` — client-side validation mirrors this before submit, but the 422 is still the source of truth per the seam). The Allotment form's `minInvestment` validation rule is removed — no such column exists; the hint line naming it is removed too, per the proposal (the check becomes an RM judgement call downstream, not an FE gate). On `201`, the modal closes via `onConfirm(dto)` and the caller (portfolio page) triggers `useRequests()`'s refetch; on error, the footer renders the response's `detail` string instead of closing.

**Done when:** all three forms POST to `/api/client/tickets` and never import `lib/mock/store.ts`; the Redemption picker's amounts come from `PositionDTO.amount`, not a placeholder string; a `422` response keeps the modal open with the server's message visible.

---

### FE-9 — Request history + overview recent requests (Yes)

- **Proposal ref:** § Layer 3 A-8
- **Module:** 5.1, 5.2, 5.3
- **Files:** `create: lib/api/requests.ts` *(re-exports `ClientRequestDTO`/`fetchRequests` — see note below)*, `create: lib/hooks/useRequests.ts`, `modify: app/(dashboard)/portfolio/page.tsx`, `modify: app/(dashboard)/overview/page.tsx`, `delete: lib/hooks/useAllotmentRequests.ts` *(superseded here, not FE-14 — same rationale as FE-1/useSubscriptions)*
- **Dependencies:** FE-8 (shares `ClientRequestDTO`/`TicketStatus` from `lib/api/tickets.ts`)

**Contract:**

```ts
// lib/api/requests.ts
export { type ClientRequestDTO, type TicketStatus, type TicketKind } from "./tickets";
export async function fetchRequests(token: string | null): Promise<ClientRequestDTO[]>;
// GET /api/client/requests
```

```ts
// lib/hooks/useRequests.ts
export function useRequests(): { data: ClientRequestDTO[]; loading: boolean; error: string | null; refetch: () => void };
```

**Behavior / invariants:** `portfolio/page.tsx`'s Ticket History table and `overview/page.tsx`'s Recent Requests (`.slice(0, 3)`) both read `useRequests()` in place of `useAllotmentRequests()` + `MOCK_ALLOTMENT_REQUESTS`; existing search + 7-per-page pagination logic operates over the returned array unchanged. `TicketStatusBadge`/`STATUS_BADGE` gain a 5th entry for `"declined"` (existing `badge-warning` styling reused — no new visual style introduced); `TypeBadge` maps `TicketKind` (`allotment`/`redemption`/`other`) directly instead of the mock's `"Allotment"`/`"Redemption"`/`"Others"` strings, with matching i18n keys under `request_type.*` (already present for allotment/redemption; `other` reuses the existing "Others" copy).

**Done when:** both tables render from `useRequests()`; a `declined` row renders a badge (not a crash on an unmapped key); FE-8's `onConfirm` triggers this hook's `refetch`.

---

### FE-10 — Overview stat cards + latest-events panel (Yes)

- **Proposal ref:** § Layer 3 A-9
- **Module:** 5.2, 5.3
- **Files:** `modify: app/(dashboard)/overview/page.tsx`
- **Dependencies:** FE-1, FE-11 (consumes `useClientEvents`)

**Contract:**

```tsx
// overview/page.tsx
const { data: portfolio } = usePortfolio();
const latestEvents = useClientEvents().slice(0, 3);
// Card 1: portfolio?.total_value ; Card 2 relabels "YTD Returns" → Amount in Trade, sub-line change_pct
```

**Behavior / invariants:** every event surfaced here renders at the fixed `info`/`Account Notification` treatment already established by `useOnboardingEvents`'s `mapEvent` (the DTO carries no icon/level metadata — same compromise, not a new one). `useLatestEvents()`/`localStorage` reads are removed from this page (the hook itself is deleted in FE-14, once this is its last importer).

**Done when:** both overview stat cards read `usePortfolio()`; the Latest Events panel shows the 3 newest server events via `useClientEvents()` with zero `localStorage` reads on this page.

---

### FE-11 — Events page on the server feed alone (Yes)

- **Proposal ref:** § Layer 3 A-10
- **Module:** 5.2, 5.3
- **Files:** `modify: lib/hooks/useOnboardingEvents.ts` *(rename export to `useClientEvents`)*, `modify: app/(dashboard)/events/page.tsx`, `delete: lib/hooks/useEventItems.ts` *(superseded here, not FE-14)*
- **Dependencies:** none — parallel-safe; FE-9/FE-10 depend on the renamed export landing here first.

**Contract:**

```ts
// lib/hooks/useOnboardingEvents.ts → renamed export, same file, same endpoint (GET /api/client/events)
export function useClientEvents(): EventEntry[];
```

```tsx
// events/page.tsx
const items = useClientEvents(); // was [...useEventItems(), ...onboardingItems, ...MOCK_EVENT_ITEMS]
// mapEvent's category now reads dto.category directly (a real column) instead of a
// hardcoded "Account Notification"; an unrecognised category value falls into "Others".
```

**Behavior / invariants:** `mapEvent` (inside the renamed hook) is updated so `category: dto.category as EventCategory` replaces the hardcoded string, with a fallback: `FILTER_CATEGORIES.includes(dto.category) ? dto.category : "Others"`. `time` renders `created_at` through the page's existing relative-time formatting rather than the raw ISO string. Category filter pills continue to work unchanged since `EventCategory` values are unchanged.

**Done when:** the Events page's only data source is `useClientEvents()`; filtering by category still works against real `category` values; `MOCK_EVENT_ITEMS` and `useEventItems` have no remaining importer.

---

### FE-12 — Header RM contact (Yes)

- **Proposal ref:** § Layer 3 A-11
- **Module:** 5.5
- **Files:** `modify: components/header/HeaderActions.tsx`
- **Dependencies:** FE-4 (consumes `useProfile().assigned_rm`)

**Contract:**

```tsx
// HeaderActions.tsx
const { data: profile } = useProfile();
const rm = profile?.assigned_rm ?? null;
// email row: rm?.email ?? "—" ; phone row (was "WhatsApp"): rm?.phone ?? "—"
```

**Behavior / invariants:** the WhatsApp row and its icon/label are replaced by a phone row bound to `RmContactDTO.phone` (`admin_profiles.phone_number` — the number the firm actually stores; there is no WhatsApp-specific field anywhere in the schema). When `assigned_rm` is `null` (no RM assigned), the popup renders the existing empty-state treatment instead of a fabricated name — no card is hidden, no crash on a missing field.

**Done when:** the RM contact popup shows `assigned_rm.name`/`.email`/`.phone` from `useProfile()`; `MOCK_RM_CONTACT` has no remaining importer; a `null` `assigned_rm` renders the empty state, not an error.

---

### FE-13 — Dead route, dead i18n namespace, stale type cleanup (Yes / Recommend)

- **Proposal ref:** § Layer 3 C-1, C-2, C-3
- **Module:** 5.6
- **Files:** `delete: app/(dashboard)/support/page.tsx`, `modify: public/locales/en/translation.json`, `modify: public/locales/zh-TW/translation.json`, `modify: types/portal.ts`
- **Dependencies:** FE-1 through FE-11 (i18n cleanup for `mock.*` requires `overview/page.tsx` and `events/page.tsx` to have already dropped their `t("mock.*", { defaultValue: ... })` lookups — otherwise deleting the namespace has no visible effect but is still safe, since `defaultValue` always wins when the key is missing).

**Contract:**

```ts
// types/portal.ts — before: 5 lines, just PortalUser.
// after: folds in the surviving view-model types from FE-1's mock retirement
// (EventEntry, EventIconType, ActionLevel, ActionVariant, EventCategory —
// moved here per proposal A-1, not left in a deleted lib/mock/data.ts).
export type PortalUser = { firebase_uid: string; email: string | null; role: string; };
export type ActionLevel = "urgent" | "caution" | "primary" | "info" | "neutral";
export type ActionVariant = "filled" | "outline";
export type EventCategory = "Market News" | "Account Notification" | "Requests Status" | "Others";
export type EventIconType = "trending-up" | "alarm-clock" | "file-text" | "bar-chart" | "shield" | "briefcase";
export interface EventEntry {
  id: string; iconType: EventIconType; level: ActionLevel; title: string; time: string;
  description: string; category: EventCategory; primaryLabel: string;
  primaryVariant: ActionVariant; secondaryLabel: string;
}
```

**Behavior / invariants:** `app/(dashboard)/support/page.tsx` is deleted along with its `support.*` i18n keys — it was never in `SidebarNav`'s `NAV_ITEMS` and is unreachable in the shipped nav; the ticket flow (FE-8) is where "support" actually lives. The `mock.*` namespace (`mock.latest_events.*`, `mock.event_items.*`) is deleted from both locale files; every `t("mock.*.*", { defaultValue: ... })` call site was already replaced by FE-9/FE-10/FE-11 to render the server string directly, so this is a pure deletion with no runtime effect by the time it lands. `types/portal.ts`'s shape is confirmed against the Backend's `UserOut`/`ClientProfileDTO` — no speculative fields added.

**Done when:** `/support` 404s (route gone); `rg "mock\."` in both locale files returns nothing; `types/portal.ts` compiles as the sole home of `EventEntry`/`EventIconType`/`ActionLevel`/`ActionVariant`/`EventCategory` with no duplicate definition left in `lib/mock/data.ts`.

---

### FE-14 — Delete the mock layer (Yes — user req.)

- **Proposal ref:** § Layer 3 A-1
- **Module:** 5.6
- **Files:** `delete: lib/mock/data.ts`, `delete: lib/mock/store.ts`, `delete: components/MockStoreInit.tsx`, `modify: app/(dashboard)/layout.tsx` (drop `<MockStoreInit />` mount)
- **Dependencies:** **every other FE-* unit** — this is the contraction step and must be the last commit on this branch. `useLatestEvents.ts`, `useEventItems.ts`, and `useAllotmentRequests.ts` are already deleted by FE-10/FE-11/FE-9 respectively (removed at the point they lost their last caller, per those units' notes) — this unit's job is only the two mock files and `MockStoreInit`, which by construction have zero remaining importers once FE-1 through FE-13 are committed.

**Contract:** no new code — a deletion-only unit. Verification is `rg`-based:

```bash
rg "from \"@/lib/mock/(data|store)\"" client-frontend/{app,components,lib}
rg "MockStoreInit" client-frontend/app
```
Both must return zero matches before this unit's files are removed; both must still return zero matches afterward (i.e. nothing depended on them being present after all).

**Behavior / invariants:** deleting a file with a live importer is a build break, not a silent no-op — `next build`/`tsc --noEmit` in the CI gate (§3.2) is the actual enforcement, the `rg` check above is a fast pre-check. `app/(dashboard)/layout.tsx` drops its `<MockStoreInit />` line; `AuthGuard`/`DashboardShell` are untouched.

**Done when:** `lib/mock/`, `components/MockStoreInit.tsx` no longer exist; `rg "MOCK_"` and `rg "localStorage"` (outside theme/locale prefs) return nothing under `client-frontend/{app,components,lib}`; `next build` succeeds.

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal § 4. Cross-layer seam (frozen here))

#### 4.1 The wire contract

All routes are mounted under `/api`. All `/client/*` routes take **no subject id** — the subject is `get_current_client_user`. All `/rm/*` routes require `Action.CLIENT_VIEW` (existing dependency) and are scoped to `client_profiles.assigned_rm_uid == caller.firebase_uid`, except `ADMIN`, which sees all.

```python
# ---------- Profile ----------
GET   /api/client/profile                       -> ClientProfileDTO          {200, 401, 404}
PATCH /api/client/profile                       -> ClientProfileDTO          {200, 401, 422}

class RmContactDTO(BaseModel):
    name: str | None
    email: str | None
    phone: str | None                 # admin_profiles.phone_number

class ClientProfileDTO(BaseModel):
    name: str | None                  # client_profiles.name
    email: str | None                 # users.email          (read-only)
    phone: str | None                 # client_profiles.primary_phone (read-only)
    occupation: str | None            # client_profiles.occupation  (NEW, DB B-2)
    date_of_birth: date | None        # client_profiles.date_of_birth (NEW, DB B-2, read-only — see D-11)
    address: str | None               # client_profiles.address
    country_of_residence: str | None
    ib_account: str | None
    client_ref: str                   # "MEGA-0481", formatted from user_id (existing helper)
    assigned_rm: RmContactDTO | None

class ClientProfilePatch(BaseModel):  # every field optional; unset = unchanged
    name: str | None = None
    occupation: str | None = None
    address: str | None = None
    country_of_residence: str | None = None
    # email / phone / date_of_birth are NOT patchable here — 422 if present.

# ---------- Portfolio ----------
GET /api/client/portfolio                       -> PortfolioDTO              {200, 401}
GET /api/client/portfolio/history?months=6      -> list[HistoryPointDTO]     {200, 401, 422}

class PositionDTO(BaseModel):
    model_id: uuid.UUID
    model_name: str                   # models.name
    units: float                      # client_subscriptions.multiplier
    amount: float                     # units * models.model_size
    model_limit: float | None         # models.model_limit  (NEW column, DB B-5)
    #                                 ^ a DISTINCT attribute, not model_size:
    #                                   model_size prices a unit, model_limit caps the model.
    ib_account: str | None            # client_profiles.ib_account (per-client, NOT per-model)

class PortfolioDTO(BaseModel):
    cash_deposit: float               # client_portfolios.cash_deposit        (0 if no row)
    amount_in_trade: float            # client_portfolios.amount_in_trade
    previous_amount_in_trade: float
    total_value: float                # cash_deposit + amount_in_trade
    change_amount: float              # amount_in_trade - previous_amount_in_trade
    change_pct: float | None          # None when previous == 0 (no divide-by-zero)
    updated_at: datetime | None
    positions: list[PositionDTO]      # one per client_subscriptions row, name-sorted

class HistoryPointDTO(BaseModel):
    month: str                        # "YYYY-MM" — one point per CALENDAR MONTH, not per run
    total: float                      # cumulative amount_in_trade at month end
    per_model: dict[str, float]       # model_name -> cumulative allocated at month end
    # Every month in the window is present, including months with no allocation
    # run: those carry the previous month's cumulative forward (a flat segment,
    # never a gap). Same key set in `per_model` on every point, so the chart's
    # series count is stable across the window.

# ---------- Models ----------
GET /api/client/models/recommended              -> list[RecommendedModelDTO] {200, 401}
GET /api/client/models/{model_id}/material      -> file stream               {200, 401, 404}

class RecommendedModelDTO(BaseModel):
    model_id: uuid.UUID
    name: str
    category: list[str] | None        # models.category (JSON) — kept: a real model attribute
    model_limit: float | None         # models.model_limit (NEW column, DB B-5)
    subscription_redemption: str | None
    description: str | None
    has_material: bool                # a model_materials row exists
    # NOTE: no country, no sector, no risk_level, no min_investment — none exist as columns.

# ---------- Documents (KYC + firm-issued files) ----------
GET  /api/client/kyc                            -> KycPanelDTO               {200, 401}
POST /api/client/kyc/{doc_type}   (multipart)   -> DocumentDTO               {200, 401, 403, 409, 413, 415}
# 403 = upload window not yet open (Backend C-8). 409 = the existing
# OnboardingService guards (cycle not editable / doc not re-uploadable), raised
# by the shared method, not re-implemented here.
GET  /api/client/documents/{scope}              -> list[StoredFileDTO]       {200, 401, 422}
GET  /api/client/documents/{scope}/download?key=-> file stream               {200, 401, 403, 404}
# scope ∈ {"legal", "statements"}; 422 on any other value.

class KycPanelDTO(BaseModel):
    overall: Literal["due", "processing", "verified"]   # derived, see Backend C-9
    documents: list[DocumentDTO]      # REUSED VERBATIM from app/libs/onboarding/schemas.py
    next_review_at: datetime | None   # the periodic doc's expires_at; None if never verified
    # --- renewal upload window (panel-level, not per-document: exactly one doc
    # --- is periodic today, so this does not need to be a per-row shape) -------
    renewal_doc_type: str | None      # "investment_policy_statement", or None if no periodic doc
    upload_opens_at: datetime | None  # expires_at - CLIENT_UPLOAD_WINDOW_DAYS
    can_upload: bool                  # server-computed; the FE never recomputes this
    upload_blocked_reason: Literal[
        "window_not_open", "in_review", "cycle_not_editable", "no_cycle"
    ] | None                          # None iff can_upload is True

class StoredFileDTO(BaseModel):
    key: str                          # opaque storage key; the ONLY thing the FE echoes back
    filename: str
    size_bytes: int | None
    modified_at: datetime | None
    category: str | None              # legal scope: immediate sub-folder name; statements: None
    period: str | None                # statements scope: "YYYY-MM" parsed from a leading
    #                                   date token in the filename, else None -> the FE falls
    #                                   back to `modified_at`. This is the ONLY contract the
    #                                   future EoM generator has to honour (D-7).

# ---------- Requests & tickets (client side) ----------
GET  /api/client/requests                       -> list[ClientRequestDTO]    {200, 401}
POST /api/client/tickets                        -> ClientRequestDTO          {201, 401, 422}

class TicketKind(str, Enum):      ALLOTMENT="allotment"; REDEMPTION="redemption"; OTHER="other"
class TicketStatus(str, Enum):    NEW="new"; IN_PROGRESS="in_progress"; REPLIED="replied"; \
                                  CLOSED="closed"; DECLINED="declined"

class RaiseTicketReq(BaseModel):
    kind: TicketKind
    model_id: uuid.UUID | None = None     # required when kind != OTHER (422 otherwise)
    subject: str | None = None            # required when kind == OTHER (422 otherwise)
    category: str | None = None           # free text, OTHER only
    amount: Decimal | None = None
    multiplier: Decimal | None = None
    currency: str = "USD"
    message: str

class ClientRequestDTO(BaseModel):
    """One merged row for the client's request history. `source` tells the FE
    which table it came from; both render in the same table."""
    source: Literal["ticket", "allotment"]
    ref: str                          # tickets: "REQ-3F9A2C"; allotments: existing `reference`
    kind: TicketKind                  # allotment rows map AllotRdmpKind -> TicketKind
    subject: str                      # tickets: subject or model_name; allotments: model_name
    model_name: str | None
    amount: float | None              # None renders as the existing "—"
    created_at: datetime
    status: TicketStatus              # allotment rows map via Backend C-12's table

# ---------- Tickets (RM side) ----------
GET  /api/rm/tickets                            -> list[RmTicketDTO]         {200, 401, 403}
GET  /api/rm/tickets/{ref}                      -> RmTicketDTO               {200, 401, 403, 404}
POST /api/rm/tickets/{ref}/status               -> RmTicketDTO               {200, 401, 403, 404, 409}

class RmTicketStatusReq(BaseModel):
    status: TicketStatus
    note: str | None = None           # persisted to client_tickets.response_note

class RmTicketDTO(BaseModel):
    ref: str
    client_id: uuid.UUID
    client: str                       # client_profiles.name
    contact: str | None               # client_profiles.authorized_person
    email: str | None                 # users.email
    account: str | None               # client_profiles.ib_account
    model: str | None
    kind: TicketKind
    currency: str
    amount: float | None
    multiplier: float | None
    notional: float | None            # amount * multiplier; None when either is None
    subject: str | None
    message: str
    status: TicketStatus
    created_at: datetime
    responded_by: str | None
    responded_at: datetime | None
    response_note: str | None
```

**Field-name ↔ column-name map (non-obvious pairs only)**

| Wire | Column |
|---|---|
| `units` | `client_subscriptions.multiplier` |
| `model_limit` | `models.model_limit` (**not** `model_size` — see DB B-5) |
| `amount` (position) | *derived* `client_subscriptions.multiplier * models.model_size` |
| `total_value` | *derived* `client_portfolios.cash_deposit + .amount_in_trade` |
| `ref` (ticket) | `client_tickets.reference` |
| `client_ref` | *derived* from `users.id` (existing onboarding formatter) |

**Error envelope:** unchanged — FastAPI `{"detail": "..."}`; `client-frontend/lib/api/*` already unwraps `detail`.

#### 4.2 Per-layer obligations against the seam

| Layer | Contributes | Assumes |
|---|---|---|
| Database | `client_tickets` with the exact `TicketKind`/`TicketStatus` value sets in §4.1; `client_profiles.occupation`/`.date_of_birth` and `models.model_limit` nullable columns | Backend never writes a status outside the 5 values; a ticket's `assigned_rm_uid` is a snapshot and may go stale |
| Backend | Every route above at its exact path, DTO, and status codes; all derivations (`total_value`, `amount`, `notional`, status maps) computed server-side | DB B-1/B-2 present; `client_portfolios` row may be **absent** for pre-014 clients → serve zeros, never 404 |
| Frontend (client) | Consumes the DTOs verbatim; renders `None`/`null` as the existing `—`; performs no arithmetic beyond formatting | Backend returns DTOs exactly as in §4.1; money arrives as a `float`, formatting is FE-side |
| Frontend (admin) | `RequestTickets.tsx` and its detail page consume `RmTicketDTO`; status actions POST `RmTicketStatusReq` | Backend enforces RM scoping; `ref` is URL-safe and stable |

#### 4.3 Change protocol (post-freeze)

- Any edit to §4 requires a new proposal revision or a dated, initialled addendum in this file.
- Every impl doc's §7 is re-copied in the same change set — the seam never lives in only one place.

### 7.2 How this layer honours the seam

- **What this layer contributes to the seam:** consumes every `/api/client/*` DTO listed in §7.1 verbatim; renders every `None`/`null` field as the existing `"—"` placeholder; performs no arithmetic beyond display formatting (currency/percent/date string formatting only — `total_value`, `amount`, `change_pct`, `notional`, and every status map are Backend-derived, per the "Frontend (client)" row of §7.1's obligations table). This layer contributes nothing to `/api/rm/*` — that surface belongs entirely to the admin-frontend layer.
- **What this layer assumes from the other side:** the Backend layer serves every route in §7.1 at its exact path, DTO shape, and status code set; money crosses the wire as a JSON number (`float`), never a pre-formatted string; a missing `client_portfolios` row serves as zeros (never a 404) so `usePortfolio()` never needs a special "no portfolio yet" branch; `HistoryPointDTO.per_model` carries the same key set on every point in a response so the line chart's series count never has to be recomputed mid-render.
- **Change protocol:** any edit to §7 requires editing the proposal's §4 first; this section is then re-copied verbatim. Never edited in isolation from the proposal.

---

## 8. Internal unit testing

### 8.1 Test setup

- **Framework / runner:** vitest — command: `npm run test` (= `vitest run`), run from `client-frontend/`.
- **Fixtures / seed:** mocked `fetch` (via `vi.fn()`/`vi.spyOn(global, "fetch")`) returning canned JSON bodies shaped exactly like §7.1's DTOs; `useAuth().getIdToken` mocked via `vi.mock("@/components/auth/AuthProvider")`.
- **Isolation:** hermetic — no real network call, no real Firebase; safe to run in parallel.
- **Layer isolation:** tests import only from `client-frontend`'s own code plus test doubles for the seam (§7) — never a real Backend response, never admin-frontend code.
- **Test location:** `client-frontend/tests/`, mirroring source path (e.g. `tests/lib/hooks/FE-1.usePortfolio.test.ts`), never co-located next to source.
- **Commit policy:** `tests/` is git-ignored; tests are generated locally by `test-gen` and run as a pre-hand-off gate, never committed.
- **Code generation:** `test-gen` (arg `lite`/`standard`/`thorough`) writes concrete vitest files from §8.2/§8.3 below.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| FE-1 | `usePortfolio`/`usePortfolioHistory` map DTOs correctly; `null` while loading | `PortfolioDTO`, `HistoryPointDTO[]` |
| FE-2 | Donut includes Cash slice at 0; line series count matches `per_model` keys; bar reflects net change over window | `HistoryPointDTO[]` (multi-point, incl. a flat/no-run month) |
| FE-3 | Both tables render exactly 5 columns; `model_limit`/`category` render `—` on `null` | `PortfolioDTO.positions`, `RecommendedModelDTO[]` |
| FE-4 | `save()` round-trips a patch; failure reverts to `saved` and surfaces `error`; empty-name avatar guard | `ClientProfileDTO`, 422 error body |
| FE-5 | Upload button disabled state matches `can_upload`; blocked reason renders inline; AML card absent; Supporting Documents block is comment-only (static code check) | `KycPanelDTO` (each `upload_blocked_reason` value) |
| FE-6 | Grouping by `category` incl. unknown-category fallthrough; opaque `key` round-trip | `StoredFileDTO[]` |
| FE-7 | Empty statements → empty state + disabled FAB; one statement → FAB downloads `[0]` | `StoredFileDTO[]` (empty and 1-item cases) |
| FE-8 | Each of 3 forms posts correct `RaiseTicketReq`; 422 keeps modal open with server message; Redemption amount sourced from `PositionDTO.amount` | `ClientRequestDTO`, 422 error body |
| FE-9 | `declined` status renders a badge; `TypeBadge` maps all 3 `TicketKind` values | `ClientRequestDTO[]` (incl. `declined`) |
| FE-10 | Stat cards bind to `PortfolioDTO`; events panel shows top-3 with fixed `info` treatment | `PortfolioDTO`, `ClientEventDTO[]` |
| FE-11 | Category fallback to "Others" on unrecognised value; filter pills still partition correctly | `ClientEventDTO[]` (incl. unknown category) |
| FE-12 | `null` `assigned_rm` renders empty state, not a crash | `ClientProfileDTO` (`assigned_rm: null` and populated) |
| FE-13 | `/support` unreachable; no `mock.*` key resolves; `types/portal.ts` exports the 5 types | none |
| FE-14 | Build fails if any file still imports `lib/mock/*` (negative/static check) | none |

### 8.3 Test goals (per unit)

#### FE-1
- **Positive:** `usePortfolio()` returns the mapped `PortfolioDTO` once the mocked fetch resolves; `usePortfolioHistory(3)` requests `?months=3`.
- **Negative:** a non-2xx response sets `error` and leaves `data: null`.
- **Invariants:** unmounting mid-fetch never calls `setState` (the `cancelled` guard fires).
- **Seam mocks:** `PortfolioDTO`, `HistoryPointDTO[]` per §7.1.

#### FE-2
- **Positive:** with a 3-point history where one month is a flat carry-forward, the line chart's per-model series has no gap and the same key set at every point.
- **Negative:** an empty `positions` array still renders the Cash slice and a `0` total.
- **Invariants:** the bar chart's values equal `last.per_model[k] - first.per_model[k]` for every model key, computed once, not per-render drift.
- **Seam mocks:** `HistoryPointDTO[]`.

#### FE-3
- **Positive:** a position with `model_limit: null` renders `—`; one with a value renders formatted currency.
- **Negative:** `has_material: false` hides (not disables) the Market Material control.
- **Invariants:** column count is exactly 5 for both tables regardless of data.
- **Seam mocks:** `PositionDTO[]`, `RecommendedModelDTO[]`.

#### FE-4
- **Positive:** editing Occupation and saving sends `{ occupation: <value> }` only (unset fields omitted); a `ClientProfileDTO` with a non-null `date_of_birth` renders it as a formatted, read-only date string; one with `date_of_birth: null` renders `—`.
- **Negative:** a 422 response reverts the draft to `saved` and shows the error inline.
- **Invariants:** no code path renders or submits a `company` field; no `save()` call's payload ever contains a `date_of_birth` key, regardless of which other fields are being edited.
- **Seam mocks:** `ClientProfileDTO`, 422 error.

#### FE-5
- **Positive:** `can_upload: true` enables the Upload button; each `upload_blocked_reason` value renders its own copy.
- **Negative:** a 409 from the upload call surfaces inline without closing the modal.
- **Invariants:** the AML card never renders under any `KycPanelDTO` input; the Supporting Documents JSX is unreachable (static: no non-commented render path).
- **Seam mocks:** `KycPanelDTO` (all 4 `upload_blocked_reason` values + `null`).

#### FE-6
- **Positive:** documents group correctly by known and unknown `category` values.
- **Negative:** an empty list renders the existing empty-state row, not an error.
- **Invariants:** the `key` value passed to `downloadDocument` is byte-identical to the one received in the DTO.
- **Seam mocks:** `StoredFileDTO[]`.

#### FE-7
- **Positive:** a single statement resolves in both the table and the FAB.
- **Negative:** an empty list disables the FAB and shows the empty state — this is asserted as the PASSING case, not a failure.
- **Invariants:** `period` falls back to `modified_at`-derived formatting when `null`.
- **Seam mocks:** `StoredFileDTO[]` (0 and 1 item).

#### FE-8
- **Positive:** each form builds the `RaiseTicketReq` its `kind` requires (model_id vs subject).
- **Negative:** validation blocks submit locally for the same cases the backend 422s on (missing model/subject); a real 422 keeps the modal open.
- **Invariants:** Redemption's amount field is always a number sourced from `PositionDTO.amount`, never a display string.
- **Seam mocks:** `ClientRequestDTO`, 422 error.

#### FE-9
- **Positive:** a `declined` row renders the existing warning-style badge.
- **Negative:** an unmapped `TicketKind` never reaches this code path (type-level, not runtime — documented as a static guarantee).
- **Invariants:** overview's 3-item slice and portfolio's full paginated table read the same underlying array.
- **Seam mocks:** `ClientRequestDTO[]`.

#### FE-10
- **Positive:** `change_pct: null` renders `—` on the sub-line.
- **Negative:** a `usePortfolio` error leaves stat cards in a loading/placeholder state, not a crash.
- **Invariants:** the events panel never shows more than 3 items regardless of feed size.
- **Seam mocks:** `PortfolioDTO`, `ClientEventDTO[]`.

#### FE-11
- **Positive:** a known category filters correctly.
- **Negative:** an unrecognised category still renders under "Others" rather than being dropped.
- **Invariants:** filter pill counts always sum to the total item count.
- **Seam mocks:** `ClientEventDTO[]`.

#### FE-12
- **Positive:** a populated `assigned_rm` renders name/email/phone.
- **Negative:** `assigned_rm: null` renders the empty state.
- **Invariants:** no WhatsApp-labelled field remains anywhere in the component.
- **Seam mocks:** `ClientProfileDTO`.

#### FE-13
- **Positive:** `types/portal.ts` exports all 5 types with the exact shapes above.
- **Negative:** navigating to `/support` 404s.
- **Invariants:** no `t("mock....")` call resolves to a real translation in either locale file.
- **Seam mocks:** none.

#### FE-14
- **Positive:** `next build` succeeds after deletion.
- **Negative:** (this is the unit's own negative case) a build would fail if any importer remained — proven by the `rg` pre-check being empty before deletion is attempted.
- **Invariants:** no `localStorage` domain-data read remains under `client-frontend/app`.
- **Seam mocks:** none.

### 8.4 Aggregate gate

- All unit tests green is a local gate before commit/PR hand-off; a red test blocks the unit, but `tests/` is never committed.
- Target coverage for changed lines: ≥ 90% of new/changed statements in `lib/api/*`, `lib/hooks/*`, and the modified page/component logic (JSX layout itself is not a coverage target).
- Chosen `test-gen` level for this layer: **standard** (happy path + main negative + the null/error-rendering cases named above per unit) — set by the orchestrator; escalate to `thorough` only if the visual-confirmation gate (Execution step 3/human gate) surfaces edge cases this misses.

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] Every FE-1…FE-14 unit committed on `client-portal-integration-fe`; each commit left the branch green.
- [ ] §8 unit tests all pass (standard depth); `npm run lint && npx tsc --noEmit && npm run test && npm run build` green.
- [ ] §7 matches the proposal's frozen §4 verbatim (checked against the proposal, not against the Backend/admin-frontend branches, which are not visible here).
- [ ] `rg "MOCK_"` and `rg "localStorage"` (outside theme/locale prefs) return nothing under `client-frontend/{app,components,lib}` (Objectives — "No mock left").
- [ ] No money/status arithmetic exists in any `.tsx` beyond formatting (Objectives — "Logic lives once").
- [ ] A side-by-side of every touched page shows identical structure/spacing to before, with only removed columns (FE-3), relabelled cards/charts (FE-2, D-1), and real values differing (Objectives — "Design parity") — verified at the proposal's named human gate (Execution step 3), not by this layer alone.
- [ ] PR opened against `client-portal-integration`; human owns the merge to `main`.

**Rollback:** this layer has no persisted state of its own — every FE-* unit is pure frontend code, so the branch reverts cleanly with a straight `git revert`/branch discard (per the proposal's Rollback section: "Layers 2/3/4 revert cleanly with a branch revert — no persisted state of their own"). The one ordering constraint is FE-14: it must be the last unit committed and the first one reverted if a rollback is needed mid-layer, since every earlier unit still assumes `lib/mock/*` may exist until it lands. Files staged in `STORAGE_ROOT` for the FE-7 walkthrough are not owned by this layer and are never touched by any rollback here.
