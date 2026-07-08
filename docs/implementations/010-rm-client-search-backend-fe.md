# 010 — RM Client Book: Live Search Against `client_profiles` · Implementation Details — Frontend

> Status: **DRAFT — pending implementation.**
> Implements: `docs/proposals/010-2026-07-08-rm-client-search-backend.md` § Layer 2 — Frontend
> Layer: Frontend — **one layer per file.**
> Sibling layer docs: `docs/implementations/010-rm-client-search-backend-be.md`
> Execution schedule: `docs/execution-schedules/010-rm-client-search-backend-fe.md`
> Branch: `searchbar-client-book-fe` — cut from parent `searchbar-client-book`, merges back into it (human owns the merge).
> Builds on / prerequisites: current Client Book UI at commit `655b625` on `searchbar-client-book` (`admin-frontend/app/(roles)/rm/client-info/page.tsx`, `admin-frontend/lib/mock/rm-data.ts`); `AuthProvider` + `useAuth()` at `admin-frontend/components/auth/AuthProvider.tsx` yielding a `portalUser` with `firebase_uid`; the PC-page fetch chain (`server/api-client.ts`, `server/pc/*`, `hooks/api/*`) as the reference pattern.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/010-2026-07-08-rm-client-search-backend.md` § Layer 2 — Frontend |
| Execution schedule | `docs/execution-schedules/010-rm-client-search-backend-fe.md` |
| Sibling layer impl docs | `docs/implementations/010-rm-client-search-backend-be.md` |
| Builds on | `searchbar-client-book` @ `655b625` (search UI landed against mock data). |

---

## 2. Branch & session contract

- **Branch:** `searchbar-client-book-fe` — cut from parent `searchbar-client-book`. All FE-* units land on this one branch.
- **Isolation:** implementable in a separate session on its own layer branch, in parallel with the Backend layer. The seam in §7 is the contract; **do not** import from or stand up backend code here. Tests either mock `fetch` or stub the server-action modules with `{ success: true, data: … }` shapes matching §7.
- **Preconditions (must be true before starting):**
  - [ ] Parent branch `searchbar-client-book` at commit `655b625` or later — the current search UI + `assignedRm` field on `RmClient` are present.
  - [ ] `AuthProvider` exposes `portalUser.firebase_uid` via `useAuth()` (verify at `admin-frontend/components/auth/AuthProvider.tsx`). If not present today, add it as part of FE-4 rather than as a separate unit.
  - [ ] §7 seam is a verbatim copy of the proposal's §4 — no drift.
- **Read-first inventory:**
  - `admin-frontend/app/(roles)/rm/client-info/page.tsx` — currently the whole Client Book UI + inline `ADV_FIELDS` + `matchClient`/`matchAdv`. Refactored by FE-6; its `openClient` push target also fixed by FE-9.
  - `admin-frontend/app/(roles)/rm/client-detail/[id]/page.tsx` — calls `getClientDetail(params.id)` synchronously. **Moved** to `client-info/[id]/page.tsx` by FE-9 (pure move, no data change); live-data-wired by FE-7; restructured into Basic Info/Subscription Info by FE-10.
  - `admin-frontend/lib/mock/rm-data.ts` — `RM_CLIENTS`, `CLIENT_EXTRA`, `getClientDetail`, `KNOWN_CLIENT_IDS`. Re-keyed by FE-8; `clientId` dropped by FE-10.
  - `admin-frontend/lib/pages-config.ts` — `PAGES`/`ROLE_PAGES` route registry; the `rm.client-detail` PageId is deleted by FE-9 (dead once `/rm/client-info`'s existing prefix-match covers the sub-path).
  - `admin-frontend/lib/pages.check.ts` — assertion script for `pages-config.ts`; two `/rm/client-detail` assertions updated by FE-9.
  - `admin-frontend/components/rm/OnboardingBoard.tsx` — `openProfile()` hardcodes `/rm/client-detail/${id}`; fixed by FE-9.
  - `admin-frontend/server/api-client.ts` — `apiClient<T>` fetch wrapper + `APIResult` shape. Reused, not modified.
  - `admin-frontend/server/endpoints.ts` — `ENDPOINTS` const. Extended by FE-2.
  - `admin-frontend/server/pc/index.ts` — reference for the new `server/rm/index.ts`.
  - `admin-frontend/app/(roles)/pc/allocation-matrix/actions.ts` — reference for the new `client-info/actions.ts` and `client-info/[id]/actions.ts` (the latter is a brand-new file created directly at the post-move location by FE-3 — there is no old `client-detail/[id]/actions.ts` to relocate, since it doesn't exist before this proposal).
  - `admin-frontend/hooks/api/useModels.ts`, `useAllocation.ts` — reference for the new `useClientBook`/`useClient` hooks (module-scope cache, inFlight ref, mount-triggered fetch).
  - `admin-frontend/components/auth/AuthProvider.tsx` — `useAuth()` returning `{ portalUser }`.
  - `admin-frontend/types/portal.ts` — extend if needed to expose `firebase_uid` on `PortalUser`.
- **Hand-off / exit signal:** all FE-* units committed on `searchbar-client-book-fe`, `npx tsc --noEmit` + `next lint` green, Client Book renders live data end-to-end against a mocked `getClients()`, PR opened against `searchbar-client-book`.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- **4-piece fetch chain (mirror PC):** `server/api-client.ts` (shared, `import "server-only"`) → per-domain fetchers `server/rm/index.ts` (`"use server"`) → route-local actions `app/(roles)/rm/**/actions.ts` (`"use server"`) → client hooks `hooks/api/*.ts` (`"use client"`). Each layer does exactly one thing.
- **DTO ↔ UI shapes are separate.** DTOs (`ClientListItemDTO`, `ClientListDTO`) match the wire contract character-for-character; UI shapes (`ClientRow`) are what components consume. A mapper in `lib/rm/clients.ts` bridges them — mirrors `lib/pc/models.ts`.
- **`APIResult<T>` return envelope.** Server fetchers return `{ success: true, data: T } | { success: false, error, code }`. Hooks translate `success: false` to their `error` state.
- **Module-scope cache in hooks.** Use a `Map<string, …>` at module scope keyed by the current caller's `firebase_uid`, matching `hooks/api/useAllocation.ts:15-25`. Works identically for any role — an RM's key holds their own book, an ADMIN's key holds the full roster (D-4).
- **Config lives in `lib/`, not in components.** Extract UI options into `lib/rm/*.ts` — matches the `lib/pages-config.ts` idiom.
- **Client-side matching stays inline in `page.tsx`.** `matchClient` and `matchAdv` are runtime predicates, not data — they belong in the page's own module. The config drives the *fields* they consult, not the predicates themselves.

### 3.2 CI/CD & engineering discipline
- **Trunk-friendly, small units.** Each FE-* unit leaves `searchbar-client-book-fe` green (tsc + lint pass).
- **Every unit is independently revertible.** FE-6/FE-7 (the page refactors) are the only units with user-visible impact; every other unit is a new file the app doesn't import until FE-6/FE-7 wires it in.
- **Additive-first ordering.** FE-1..FE-5 land new files/exports without changing any existing behaviour. FE-6..FE-8 are the "flip" commits.
- **Gates before merge:**
  ```bash
  npx tsc --noEmit -p tsconfig.json && npx next lint
  ```
  (No frontend test runner is configured in this repo today — CI gate is types + lint; component behaviour is verified by driving the UI in a preview browser per the repo's verification skill.)
- **No secrets, no manual steps.** All work is local file edits + one PR.
- **Reversibility documented** (§9).

---

## 4. Architecture

**Target layout (new/modified files only):**
```
admin-frontend/
├── server/
│   ├── endpoints.ts                          # MODIFY: add ENDPOINTS.RM.CLIENTS + CLIENT(id)
│   └── rm/
│       └── index.ts                          # NEW ("use server"): getClients(), getClient(id)
├── app/(roles)/rm/
│   ├── client-info/
│   │   ├── actions.ts                        # NEW ("use server"): re-exports getClients
│   │   ├── page.tsx                          # MODIFY: consume useClientBook + shared config;
│   │   │                                     #   push target fixed by FE-9
│   │   └── [id]/                             # NEW dir (FE-9 — relocated from client-detail/[id]/)
│   │       ├── actions.ts                    # NEW ("use server"): re-exports getClient
│   │       └── page.tsx                      # MOVED (FE-9) then MODIFY (FE-7 live data, FE-10 layout)
│   └── client-detail/[id]/                   # DELETED entirely by FE-9
├── lib/
│   ├── rm/
│   │   ├── client-search-fields.ts           # NEW: ADV_FIELDS config, single source of truth
│   │   └── clients.ts                        # NEW: DTO ↔ UI mapper
│   ├── mock/
│   │   └── rm-data.ts                        # MODIFY: hash-based overlay, drop slug ids + clientId
│   └── pages-config.ts                       # MODIFY (FE-9): delete rm.client-detail PageId
├── hooks/api/
│   ├── useClientBook.ts                      # NEW ("use client"): once-per-session list fetch
│   └── useClient.ts                          # NEW ("use client"): cache-first, sibling-endpoint fallback
├── components/rm/
│   └── OnboardingBoard.tsx                   # MODIFY (FE-9): fix hardcoded nav push target
└── types/
    └── portal.ts                              # MODIFY (if needed): expose firebase_uid on PortalUser
```

**Dependency direction:**
- `hooks/api/*` → `app/(roles)/rm/**/actions.ts` → `server/rm/index.ts` → `server/api-client.ts`.
- `hooks/api/*` may also read `lib/rm/clients.ts` for the DTO → UI mapper.
- `app/(roles)/rm/**/page.tsx` → `hooks/api/*` + `lib/rm/client-search-fields.ts` + `lib/mock/rm-data.ts` (for the overlay only).
- No file in `lib/`, `hooks/api/`, or `server/` imports from `app/(roles)/…` — one-way dependency out.
- `lib/pages-config.ts` and `components/rm/OnboardingBoard.tsx` are edited only by FE-9 (one line / one config entry each) — neither is otherwise part of this proposal's dependency chain.

**External seams:** Backend routes `GET /api/rm/clients` and `GET /api/rm/clients/{id}` per §7; Firebase-issued `id_token` cookie for auth (already handled by `server/api-client.ts`).

---

## 5. Modules

### 5.1 `lib/rm/client-search-fields.ts`
- **Responsibility:** the single source of truth for advanced-search fields (label, placeholder, and the UI-side accessor that reads a field off `ClientRow`). Consumed by the popover *and* by `matchAdv`.
- **Files:** `admin-frontend/lib/rm/client-search-fields.ts`.
- **Public surface:** `ADV_FIELDS: readonly AdvField[]`, `AdvField` type.
- **Owns features:** FE-1.

### 5.2 `lib/rm/clients.ts` — DTO types + mapper
- **Responsibility:** wire types (`ClientListItemDTO`, `ClientListDTO`) matching §7 exactly; a mapper `dtoToRow(dto): ClientRow` producing the UI shape.
- **Files:** `admin-frontend/lib/rm/clients.ts`.
- **Public surface:** the two DTO types, `ClientRow` type, `dtoToRow`, `dtoListToRows`.
- **Owns features:** FE-2.

### 5.3 `server/rm/*` + `app/(roles)/rm/**/actions.ts` — fetch chain
- **Responsibility:** call the backend routes with the auth cookie, translate to `APIResult`.
- **Files:** `admin-frontend/server/rm/index.ts`, `admin-frontend/app/(roles)/rm/client-info/actions.ts`, `admin-frontend/app/(roles)/rm/client-info/[id]/actions.ts` (created directly at the post-move location — see FE-3), plus one entry added to `admin-frontend/server/endpoints.ts`.
- **Public surface:** `getClients()`, `getClient(id)` — server actions consumable from client components.
- **Owns features:** FE-3.

### 5.4 `hooks/api/useClientBook.ts`
- **Responsibility:** one-shot fetch of the caller's visible client set on mount (an RM's own book, or the full roster for ADMIN — D-4); module-scope `Map<firebase_uid, ClientRow[]>` cache; `inFlight` guard against strict-mode double-mount; expose `{ data, loading, error, refetch }`.
- **Files:** `admin-frontend/hooks/api/useClientBook.ts`.
- **Public surface:** `useClientBook()` hook; `getCachedById(id)` helper (used by `useClient`).
- **Owns features:** FE-4.

### 5.5 `hooks/api/useClient.ts`
- **Responsibility:** resolve one client by id — cache hit from `useClientBook`'s cache first; fallback to `getClient(id)` (BE-4) on miss. Expose `{ data, loading, error }`.
- **Files:** `admin-frontend/hooks/api/useClient.ts`.
- **Public surface:** `useClient(id)`.
- **Owns features:** FE-5.

### 5.6 Client Book page & detail sub-page refactors
- **Responsibility:** consume the hooks + shared config in place of `RM_CLIENTS`/`getClientDetail`; keep every visible behaviour identical (beyond the route move and field-grouping this proposal explicitly calls for).
- **Files:** `admin-frontend/app/(roles)/rm/client-info/page.tsx`, `admin-frontend/app/(roles)/rm/client-info/[id]/page.tsx` (post-move).
- **Owns features:** FE-6 (list), FE-7 (detail, live data).

### 5.7 Mock overlay
- **Responsibility:** hash-based lookup of the non-DB fields (status, mandate, aum, renewal, kyc, since, models, contact, title, cashValue, portfolioValue) off the real backend id. `clientId` is dropped (FE-10) — nothing renders it once "ID Info" is a hardcoded blank.
- **Files:** `admin-frontend/lib/mock/rm-data.ts`.
- **Public surface:** `getMockOverlay(id): OverlayShape`.
- **Owns features:** FE-8 (initial overlay), FE-10 (drops `clientId`).

### 5.8 Route consolidation
- **Responsibility:** relocate the detail page under `client-info/`, fix every hardcoded nav-push target, and delete the now-dead `rm.client-detail` page-access entry. A pure move — no data-source change.
- **Files:** `admin-frontend/app/(roles)/rm/client-detail/[id]/page.tsx` (delete), `admin-frontend/app/(roles)/rm/client-info/[id]/page.tsx` (create, content = the deleted file verbatim), `admin-frontend/app/(roles)/rm/client-info/page.tsx` (one-line push-target fix), `admin-frontend/components/rm/OnboardingBoard.tsx` (one-line push-target fix), `admin-frontend/lib/pages-config.ts` (delete `rm.client-detail`), `admin-frontend/lib/pages.check.ts` (update two assertions).
- **Owns features:** FE-9.

### 5.9 Detail sub-page field presentation
- **Responsibility:** restructure the "Client Information" card into explicit **Basic Info** / **Subscription Info** groups per the proposal's Goal 8 / D-7.
- **Files:** `admin-frontend/app/(roles)/rm/client-info/[id]/page.tsx` (same file as FE-7, later commit).
- **Owns features:** FE-10.

---

## 6. Features

### FE-1 — `client-search-fields.ts` config module (Yes — user req.)

- **Proposal ref:** § Layer 2 A-1
- **Module:** §5.1
- **Files:** `create: admin-frontend/lib/rm/client-search-fields.ts`
- **Dependencies:** none — parallel-safe.

**Contract:**
```ts
// admin-frontend/lib/rm/client-search-fields.ts
import type { ClientRow } from "@/lib/rm/clients";

export type AdvField = {
  key: string;
  label: string;
  placeholder: string;
  /** UI-side accessor: reads the searchable string off a ClientRow. */
  get: (c: ClientRow) => string;
};

/** Advanced-search fields for the RM Client Book — exactly the §7 wire fields
 *  minus the opaque `id`. Adding a searchable field is a one-line addition here. */
export const ADV_FIELDS: readonly AdvField[] = [
  { key: "name",                 label: "Name",             placeholder: "e.g. Ardent Capital",     get: (c) => c.name ?? "" },
  { key: "phone",                label: "Phone",            placeholder: "e.g. +44 20 7946",         get: (c) => c.phone ?? "" },
  { key: "assigned_rm",          label: "Assigned RM",      placeholder: "e.g. Dana Okafor",         get: (c) => c.assignedRm ?? "" },
  { key: "address",              label: "Address",          placeholder: "e.g. Battery Street",      get: (c) => c.address ?? "" },
  { key: "country_of_residence", label: "Country",          placeholder: "e.g. United States",       get: (c) => c.countryOfResidence ?? "" },
  { key: "authorized_person",    label: "Authorized Person", placeholder: "e.g. Helena Voss",        get: (c) => c.authorizedPerson ?? "" },
  { key: "initiate_method",      label: "Initiate Method",  placeholder: "e.g. Referral",            get: (c) => c.initiateMethod ?? "" },
  { key: "ib_account",           label: "IB Account",       placeholder: "e.g. IB-4471",             get: (c) => c.ibAccount ?? "" },
  { key: "email",                label: "Email",            placeholder: "e.g. @harlowfo.com",       get: (c) => c.email ?? "" },
] as const;
```

**Behavior / invariants:**
- Field `key`s match the §7 wire contract's field-name-map left column (`snake_case`). The FE consumer maps them to camelCase `ClientRow` properties in `get`.
- Order in the array is the order they appear in the popover's "Add another field" chips.
- The array is `readonly`; no runtime mutation.

**Done when:** the module imports clean; every `get` returns a string (never undefined) for a fully-populated `ClientRow`; every key is unique.

---

### FE-2 — DTO types, `ClientRow`, mapper, endpoints entry (Yes)

- **Proposal ref:** § Layer 2 A-2
- **Module:** §5.2, §5.3 (endpoints entry only)
- **Files:** `create: admin-frontend/lib/rm/clients.ts`, `modify: admin-frontend/server/endpoints.ts`
- **Dependencies:** none — parallel-safe.

**Contract:**
```ts
// admin-frontend/lib/rm/clients.ts
export interface ClientListItemDTO {
  id: string;
  name: string | null;
  phone: string | null;
  assigned_rm: string | null;
  address: string | null;
  country_of_residence: string | null;
  authorized_person: string | null;
  initiate_method: string | null;
  ib_account: string | null;
  email: string | null;
}

export interface ClientListDTO {
  items: ClientListItemDTO[];
}

/** UI-facing shape — camelCase, used by client-info/page.tsx + client-info/[id]/page.tsx. */
export interface ClientRow {
  id: string;
  name: string | null;
  phone: string | null;
  assignedRm: string | null;
  address: string | null;
  countryOfResidence: string | null;
  authorizedPerson: string | null;
  initiateMethod: string | null;
  ibAccount: string | null;
  email: string | null;
}

export function dtoToRow(d: ClientListItemDTO): ClientRow {
  return {
    id: d.id,
    name: d.name,
    phone: d.phone,
    assignedRm: d.assigned_rm,
    address: d.address,
    countryOfResidence: d.country_of_residence,
    authorizedPerson: d.authorized_person,
    initiateMethod: d.initiate_method,
    ibAccount: d.ib_account,
    email: d.email,
  };
}

export const dtoListToRows = (dto: ClientListDTO): ClientRow[] => dto.items.map(dtoToRow);
```

```ts
// admin-frontend/server/endpoints.ts — add RM section
const RM = "/api/rm";

export const ENDPOINTS = {
  PC: { /* … unchanged … */ },
  RM: {
    CLIENTS: `${RM}/clients`,
    CLIENT:  (id: string) => `${RM}/clients/${encodeURIComponent(id)}`,
  },
} as const;
```

**Behavior / invariants:**
- DTO field names are **verbatim** from §7 — do not rename.
- `ClientRow` mirrors the DTO shape but camelCased. Nothing else in the frontend touches the raw DTO.
- `id` is a `string` (UUID); never parsed as a number.

**Done when:** `tsc --noEmit` passes; `dtoToRow` is exhaustive over `ClientListItemDTO` fields (TypeScript catches missing ones).

---

### FE-3 — Server fetchers + action wrappers (Yes)

- **Proposal ref:** § Layer 2 A-2
- **Module:** §5.3
- **Files:** `create: admin-frontend/server/rm/index.ts`, `create: admin-frontend/app/(roles)/rm/client-info/actions.ts`, `create: admin-frontend/app/(roles)/rm/client-info/[id]/actions.ts`
- **Dependencies:** FE-2 (DTO types, endpoints). **Not** dependent on FE-9: this file is brand-new (nothing pre-existing to relocate), so it is created directly at the final `client-info/[id]/` location from the start — it and FE-9's `page.tsx` move are two different files landing in the same new directory, with no ordering constraint between them.

**Contract:**
```ts
// admin-frontend/server/rm/index.ts
"use server";

import { apiClient, type APIResult } from "@/server/api-client";
import { ENDPOINTS } from "@/server/endpoints";
import type { ClientListDTO, ClientListItemDTO } from "@/lib/rm/clients";

export async function getClients(): Promise<APIResult<ClientListDTO>> {
  return apiClient<ClientListDTO>(ENDPOINTS.RM.CLIENTS);
}

export async function getClient(id: string): Promise<APIResult<ClientListItemDTO>> {
  return apiClient<ClientListItemDTO>(ENDPOINTS.RM.CLIENT(id));
}
```

```ts
// admin-frontend/app/(roles)/rm/client-info/actions.ts
"use server";

import { logger } from "@/lib/logger";
import { getClients as _getClients } from "@/server/rm";
import { toErrorResult } from "@/server/errors";

export async function getClients() {
  try {
    const r = await _getClients();
    logger.json("rm.getClients", r.success ? { count: r.data.items.length } : r);
    return r;
  } catch (e) {
    return toErrorResult(e);
  }
}
```

```ts
// admin-frontend/app/(roles)/rm/client-info/[id]/actions.ts
"use server";

import { logger } from "@/lib/logger";
import { getClient as _getClient } from "@/server/rm";
import { toErrorResult } from "@/server/errors";

export async function getClient(id: string) {
  try {
    const r = await _getClient(id);
    logger.json("rm.getClient", r.success ? { id: r.data.id, name: r.data.name } : r);
    return r;
  } catch (e) {
    return toErrorResult(e);
  }
}
```

**Behavior / invariants:**
- Both action files re-export the server fetchers wrapped in `try/catch → toErrorResult` — the shape used by `allocation-matrix/actions.ts`. If `logger` / `toErrorResult` module paths differ in this repo, mirror whatever `allocation-matrix/actions.ts` imports.
- No caching happens in the server layer; the hook is where the cache lives.
- The route-local actions files exist only to satisfy Next.js's `"use server"` boundary (server actions must live in a `"use server"` file separate from the shared server module).

**Done when:** both action files can be imported from client components; `tsc --noEmit` passes; a manual `fetch('/api/rm/clients')` mocked in a Jest-style test returns the expected `APIResult<ClientListDTO>` shape (or verified inline via `page.tsx` once FE-6 lands).

---

### FE-4 — `useClientBook` hook with module-scope cache (Yes — user req.)

- **Proposal ref:** § Layer 2 A-5, § D-3
- **Module:** §5.4
- **Files:** `create: admin-frontend/hooks/api/useClientBook.ts`, `modify (if needed): admin-frontend/types/portal.ts`
- **Dependencies:** FE-2, FE-3.

**Contract:**
```ts
// admin-frontend/hooks/api/useClientBook.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getClients } from "@/app/(roles)/rm/client-info/actions";
import { dtoListToRows, type ClientRow } from "@/lib/rm/clients";

/** Module-scope cache — one entry per caller's firebase_uid, lives for the tab's
 *  lifetime. The backend already scoped the response by role (D-4):
 *  RM -> their own book; ADMIN -> every client. This cache doesn't need to know
 *  which — it just caches whatever the endpoint returned. */
const cache = new Map<string, ClientRow[]>();

export function getCachedById(uid: string | null, id: string): ClientRow | null {
  if (!uid) return null;
  return cache.get(uid)?.find((c) => c.id === id) ?? null;
}

export interface UseClientBookResult {
  data: ClientRow[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useClientBook(): UseClientBookResult {
  const uid = useAuth().portalUser?.firebase_uid ?? null;

  const [data, setData] = useState<ClientRow[] | null>(() =>
    uid ? cache.get(uid) ?? null : null,
  );
  const [loading, setLoading] = useState<boolean>(() => !!uid && !cache.has(uid));
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const doFetch = useCallback(async (forceRefresh = false) => {
    if (!uid || inFlight.current) return;
    if (!forceRefresh && cache.has(uid)) {
      setData(cache.get(uid) ?? null);
      setLoading(false);
      return;
    }
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const r = await getClients();
      if (r.success) {
        const rows = dtoListToRows(r.data);
        cache.set(uid, rows);
        setData(rows);
      } else {
        setError(r.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load clients");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [uid]);

  useEffect(() => { doFetch(false); }, [doFetch]);

  return { data, loading, error, refetch: () => doFetch(true) };
}
```

**Behavior / invariants:**
- `cache` is module-scope — survives page navigations within the same tab; cleared on hard reload (matches the D-3 "one-shot per session" contract).
- Strict-mode double-mount is idempotent: the `inFlight` ref suppresses the duplicate call; the cache hit on the second mount is what causes it to short-circuit anyway.
- No refetch on window focus / visibility change in this proposal — see D-3 ("more elegant scheme deferred").
- If `useAuth().portalUser` is null (still loading or logged out), the hook returns `{ data: null, loading: false, error: null }` and does not fetch. `page.tsx` should render its normal loading state while auth is pending.
- **If `PortalUser` does not currently expose `firebase_uid`**, add it in this unit's diff: extend the type in `admin-frontend/types/portal.ts` and confirm `AuthProvider` already carries it from `postBackendLogin` (`lib/auth-api.ts:47-58`).

**Done when:** the hook returns cached rows on the 2nd+ mount without a network call; `useAuth()` transitions from `portalUser = null` to a real user cause exactly one fetch; a `success: false` return sets `error` and leaves `data` at its prior value.

---

### FE-5 — `useClient(id)` hook with cache-hit-first + sibling-endpoint fallback (Yes)

- **Proposal ref:** § Layer 2 A-2, § D-5
- **Module:** §5.5
- **Files:** `create: admin-frontend/hooks/api/useClient.ts`
- **Dependencies:** FE-2, FE-3, FE-4.

**Contract:**
```ts
// admin-frontend/hooks/api/useClient.ts
"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getClient } from "@/app/(roles)/rm/client-info/[id]/actions";
import { getCachedById } from "@/hooks/api/useClientBook";
import { dtoToRow, type ClientRow } from "@/lib/rm/clients";

export interface UseClientResult {
  data: ClientRow | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;   // separates 404 from network/other errors
}

export function useClient(id: string): UseClientResult {
  const uid = useAuth().portalUser?.firebase_uid ?? null;
  const cacheHit = getCachedById(uid, id);

  const [data, setData] = useState<ClientRow | null>(cacheHit);
  const [loading, setLoading] = useState<boolean>(!cacheHit);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (cacheHit) { setData(cacheHit); setLoading(false); return; }
    if (!uid || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    setNotFound(false);
    (async () => {
      try {
        const r = await getClient(id);
        if (r.success) {
          setData(dtoToRow(r.data));
        } else if (r.code === "HTTP_404") {
          setNotFound(true);
        } else {
          setError(r.error);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load client");
      } finally {
        setLoading(false);
        inFlight.current = false;
      }
    })();
  }, [id, uid, cacheHit]);

  return { data, loading, error, notFound };
}
```

**Behavior / invariants:**
- **Cache-first:** if `getCachedById` returns a row, no network call is made. This is the zero-network path for in-app navigation from Client Book → the `client-info/[id]` detail sub-page.
- **Sibling-endpoint fallback:** on cache miss (hard refresh / deep link), one call to `getClient(id)` fires. A 404 is recorded as `notFound: true`, not as a generic error — `page.tsx` uses that to render Next.js's `notFound()`.
- The hook does **not** populate `useClientBook`'s cache from its own fetch — the two caches remain independent (one client from `useClient` doesn't imply we have the whole book).

**Done when:** in-app navigation from list → detail fires zero `getClient` calls; a hard refresh on `/rm/client-info/<uuid>` fires exactly one; a 404 sets `notFound = true` with `error = null`.

---

### FE-6 — Refactor `client-info/page.tsx` to consume live data (Yes)

- **Proposal ref:** § Layer 2 A-1, A-2, A-4, B
- **Module:** §5.6
- **Files:** `modify: admin-frontend/app/(roles)/rm/client-info/page.tsx`
- **Dependencies:** FE-1, FE-4, FE-9 (the `openClient` push target below is `/rm/client-info/${id}` — FE-9 must have already moved the detail page there, or this unit would be committing a link to a route that doesn't exist yet).

**Contract:**
```tsx
// admin-frontend/app/(roles)/rm/client-info/page.tsx — key changes only
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useClientBook } from "@/hooks/api/useClientBook";
import { ADV_FIELDS } from "@/lib/rm/client-search-fields";
import type { ClientRow } from "@/lib/rm/clients";
// … existing UI imports (icons, Button, Chip, RailAccordion, etc.) unchanged

const norm = (s: string) => s.toLowerCase();

function matchClient(c: ClientRow, needle: string): boolean {
  if (!needle) return true;
  const hay = ADV_FIELDS.map((f) => f.get(c)).join(" | ");
  return norm(hay).includes(needle);
}

function matchAdv(c: ClientRow, active: Record<string, string>): boolean {
  return Object.entries(active).every(([k, v]) => {
    if (!v) return true;
    const f = ADV_FIELDS.find((x) => x.key === k);
    return f ? norm(f.get(c)).includes(norm(v.trim())) : true;
  });
}

export default function RmDashboardPage() {
  const router = useRouter();
  const { data, loading, error } = useClientBook();

  const [q, setQ] = useState("");
  const [advActive, setAdvActive] = useState<Record<string, string>>({});
  // … existing advDraft / draftFields / popover state unchanged

  const activeAdvKeys = Object.keys(advActive).filter((k) => norm(advActive[k] ?? "").trim());
  const hasAdv = activeAdvKeys.length > 0;
  const needle = norm(q).trim();

  const filtered: ClientRow[] = useMemo(() => {
    if (!data) return [];
    if (!needle && !hasAdv) return [];
    return data.filter((c) => matchClient(c, needle) && matchAdv(c, advActive));
  }, [data, needle, advActive, hasAdv]);

  const openClient = (id: string) => router.push(`/rm/client-info/${id}`);
  // KNOWN_CLIENT_IDS gate removed — every returned row is real and openable.
  // Path is /rm/client-info/${id}, NOT /rm/client-detail/${id} — see FE-9 (route consolidation).

  // … render (unchanged markup); replace "142 active mandates" with `${data?.length ?? 0} clients`
  // (role-agnostic wording — see Behavior/invariants: "your book" would misdescribe
  // the ADMIN full-roster case per D-4)
  // … loading / error states rendered above the table
}
```

**Behavior / invariants:**
- All existing markup (search bar, popover, chips, empty states, table columns, pagination) stays exactly as-is; only the data source changes.
- `RM_NAME` in the header stays hardcoded to "Dana Okafor" for now — auth-derived RM name is out of scope for this proposal (still-mock overlay per D-1).
- The "142 active mandates" subtitle at `header` becomes `${data?.length ?? 0} clients` — deliberately role-agnostic wording, not "clients in your book": for an RM that count is their own book, but for ADMIN (D-4) it's the entire firm-wide roster, so "your book" would misdescribe what they're looking at.
- `KNOWN_CLIENT_IDS`-based gating in `openClient` is dropped (also see FE-8).
- Loading state: a skeleton or "Loading…" indicator above the table while `loading && !data`. Error state: render the error above the empty-state block.
- The `RM_CLIENTS` / `getClientDetail` / `KNOWN_CLIENT_IDS` imports from `@/lib/mock/rm-data` are removed from this file.

**Done when:** the page renders live data end-to-end against a mocked `getClients`; both empty states still fire (`data && filtered.length === 0` behaviour unchanged); no unused mock imports remain in this file; `tsc --noEmit` + `next lint` pass.

---

### FE-7 — Wire live data into `client-info/[id]/page.tsx` via `useClient` (Yes)

- **Proposal ref:** § Layer 2 A-3, A-6; § D-1, D-5
- **Module:** §5.6
- **Files:** `modify: admin-frontend/app/(roles)/rm/client-info/[id]/page.tsx` (the file FE-9 already relocated here)
- **Dependencies:** FE-5, FE-8 (overlay), FE-9 (the file must already exist at this path — this unit does not itself move anything).

**Contract:**
```tsx
// admin-frontend/app/(roles)/rm/client-info/[id]/page.tsx — key changes only
"use client";

import { notFound, useParams } from "next/navigation";
import { useClient } from "@/hooks/api/useClient";
import { getMockOverlay } from "@/lib/mock/rm-data";

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, notFound: nf, error } = useClient(id);

  if (nf) notFound();  // Next.js 404
  if (loading || !data) return <DetailSkeleton />;
  if (error) return <DetailError message={error} />;

  const overlay = getMockOverlay(data.id);   // status, mandate, aum, renewal, kyc, since, models, contact, title, cashValue, portfolioValue

  // Render — real fields (`data.name`, `data.email`, `data.phone`, `data.address`,
  // `data.countryOfResidence`, `data.assignedRm`, `data.authorizedPerson`, `data.ibAccount`)
  // + overlay fields (everything else). "RM:" line reads `data.assignedRm ?? "Unassigned"`.
  // This unit wires the DATA; the Basic Info/Subscription Info LAYOUT is FE-10's job —
  // this unit may keep the existing info-grid markup temporarily, sourcing it from `data`
  // instead of mock, without yet restructuring it into the two named groups.
}
```

**Behavior / invariants:**
- `params.id` is treated as an opaque UUID string; no slug lookups.
- 404 from the sibling endpoint routes to Next.js's `notFound()`.
- Real fields come from `data`; overlay fields come from `getMockOverlay(data.id)` — a stable per-id lookup (FE-8).
- The KYC checklist and history sections keep their existing rendering, but their source data now comes from the overlay's `docs`/`history` (still synthesized from mock; unchanged by this proposal).
- `Dana Okafor` hardcoded RM label on the current file is replaced with `data.assignedRm ?? "Unassigned"`.
- This unit does **not** yet restructure the info card into Basic Info / Subscription Info — that's FE-10, landing after this unit on the same file. Keeping them separate means live-data wiring can be verified (does the right data arrive?) independently of layout (is it grouped correctly?).

**Done when:** in-app navigation from Client Book to any row loads the detail page without a network call; a hard refresh loads it via `GET /api/rm/clients/{id}` exactly once; a foreign-RM's client uuid returns a Next.js 404 page; every overlay field renders identically to today for the same client.

---

### FE-8 — Mock overlay: hash-based lookup by real id (Yes)

- **Proposal ref:** § Layer 2 A-3, § D-1
- **Module:** §5.7
- **Files:** `modify: admin-frontend/lib/mock/rm-data.ts`
- **Dependencies:** none — parallel-safe (FE-6/FE-7 consume its output but this can be written first).

**Contract:**
```ts
// admin-frontend/lib/mock/rm-data.ts — new + modified
export interface MockOverlay {
  status: string;
  tone: ChipTone;
  mandate: string;
  aum: string;
  renewal: string;
  kyc: string;
  kycTone: ChipTone;
  since: string;
  models: ClientModel[];
  cashValue: string;
  portfolioValue?: string;
  clientId: string;
  contact: string;
  title: string;
  docs: ClientDoc[];       // synthesized from status/kyc/tone as before
  history: HistoryEntry[];  // synthesized as before
}

/** The 8 canned overlay entries — same content as today's RM_CLIENTS + CLIENT_EXTRA,
 *  minus the DB-backed fields (name/phone/etc). Order is stable — the hash indexes into it. */
const OVERLAY_ROTATION: readonly OverlayCore[] = [ /* … 8 entries, existing content … */ ];

function hashString(s: string): number {
  // FNV-1a 32-bit — deterministic, browser-safe, no dependency.
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function getMockOverlay(id: string): MockOverlay {
  const core = OVERLAY_ROTATION[hashString(id) % OVERLAY_ROTATION.length];
  return {
    ...core,
    docs: synthesizeDocs(core),      // existing clientDocs() logic, driven by core.kyc/tone
    history: synthesizeHistory(core), // existing clientHistory() logic
  };
}

// EXPORTS TO REMOVE (unused after FE-6/FE-7):
//   RM_CLIENTS, CLIENT_EXTRA, KNOWN_CLIENT_IDS, getClientDetail
// The other RM-page exports (RENEWALS_DUE, ONBOARDING_QUEUE, REQUEST_TICKETS,
// KYC_DOCS, KYC_COLS, VERIFIED_COUNT, TONE_FOR, SUB_CLIENTS) STAY — they drive
// sibling pages that this proposal does not touch.
```

**Behavior / invariants:**
- **Determinism:** the same `id` always maps to the same overlay entry — for a given `OVERLAY_ROTATION`, `hashString(id) % ROTATION.length` is stable.
- **Same content as today:** the 8 rotation entries are literally today's `RM_CLIENTS` + `CLIENT_EXTRA` combined, minus the DB-backed columns (name/phone/address/country/authorizedPerson/initiateMethod/ibAccount/email/assignedRm). The overlay records the *rest*: status/tone/mandate/aum/renewal/kyc/since/models/cashValue/portfolioValue/clientId/contact/title, plus the synthesized docs+history.
- `RM_CLIENTS`, `CLIENT_EXTRA`, `KNOWN_CLIENT_IDS`, `getClientDetail` are **removed** from exports at the end of this unit — every consumer either uses `useClientBook`/`useClient` (real data) or `getMockOverlay` (mock data).
- Non-Client-Book exports (`RENEWALS_DUE`, `ONBOARDING_QUEUE`, `REQUEST_TICKETS`, KYC pipeline, subscription mock) stay intact.

**Done when:** `getMockOverlay(someUuid)` returns a stable value on repeated calls; `RM_CLIENTS`/`getClientDetail`/`KNOWN_CLIENT_IDS` no longer exported (or grep clean of unused-export warnings); `tsc --noEmit` passes with the sibling RM pages unchanged.

---

### FE-9 — Route consolidation: `client-detail/[id]` → `client-info/[id]` (Yes — user req.)

- **Proposal ref:** § Layer 2 A-6, § D-6
- **Module:** §5.8
- **Files:**
  - `delete: admin-frontend/app/(roles)/rm/client-detail/[id]/page.tsx`
  - `create: admin-frontend/app/(roles)/rm/client-info/[id]/page.tsx` (byte-identical content to the deleted file — this unit does not change what the page reads or renders, only where it lives)
  - `modify: admin-frontend/app/(roles)/rm/client-info/page.tsx` (one line — `openClient`'s push target)
  - `modify: admin-frontend/components/rm/OnboardingBoard.tsx` (one line — `openProfile`'s push target)
  - `modify: admin-frontend/lib/pages-config.ts` (delete the `rm.client-detail` PageId, its `PageId` union member, and its `ROLE_PAGES.RM` grant)
  - `modify: admin-frontend/lib/pages.check.ts` (update two assertions)
- **Dependencies:** none — parallel-safe, and deliberately dispatched in the **first** wave (before FE-6/FE-7's live-data wiring), per the explicit user instruction that the route split gets fixed before the data-wiring work. This unit makes **no** data-source change — the relocated page still calls the old mock `getClientDetail()` at the end of this unit; FE-7 wires live data afterward, on the new path.

**Contract:**
```tsx
// admin-frontend/app/(roles)/rm/client-info/[id]/page.tsx
// — identical to the deleted client-detail/[id]/page.tsx. No import, no render
// logic changes in this unit. Only the file's location changes.
```

```diff
--- admin-frontend/app/(roles)/rm/client-info/page.tsx
-  const openClient = (id: string) => router.push(`/rm/client-detail/${id}`);
+  const openClient = (id: string) => router.push(`/rm/client-info/${id}`);
```

```diff
--- admin-frontend/components/rm/OnboardingBoard.tsx
   const openProfile = (id: string) => {
     if (KNOWN_CLIENT_IDS.has(id)) {
       setSelected(null);
-      router.push(`/rm/client-detail/${id}`);
+      router.push(`/rm/client-info/${id}`);
     }
   };
```

```diff
--- admin-frontend/lib/pages-config.ts
 export type PageId =
   | "rm.client-info"
   | "rm.onboarding-renewal"
   | "rm.model-subscription"
-  | "rm.client-detail"
   | "mobo.recon-overview"
   ...

 export const PAGES: Record<PageId, PageDef> = {
   ...
-  "rm.client-detail": {
-    id: "rm.client-detail",
-    path: "/rm/client-detail",
-    label: "Client Detail",
-    icon: Users,
-    hideFromNav: true,
-  },
   ...
 };

 export const ROLE_PAGES: Record<Role, Partial<Record<PageId, AccessLevel>>> = {
   RM: {
     "rm.client-info": "OPERATE",
     "rm.onboarding-renewal": "OPERATE",
     "rm.model-subscription": "OPERATE",
-    "rm.client-detail": "OPERATE",
     "shared.monthly-reports": "OPERATE",
   },
   ...
 };
```

```diff
--- admin-frontend/lib/pages.check.ts
 assert.deepEqual(rolesForPath("/rm/client-info").sort(),               ["ADMIN", "RM"].sort());
-assert.deepEqual(rolesForPath("/rm/client-detail").sort(),             ["ADMIN", "RM"].sort());
+// rm.client-detail PageId removed (010, A-6/D-6) — /rm/client-info/{id} now resolves
+// via the prefix-match rule against rm.client-info itself, not a dedicated PageId.
+assert.deepEqual(rolesForPath("/rm/client-info/some-uuid").sort(),     ["ADMIN", "RM"].sort());
 ...
 // hideFromNav pages never appear as a nav child, even for ADMIN.
-assert.ok(!groupsFor("ADMIN")[0].pages.some((p) => p.href === "/rm/client-detail" || p.href === "/monthly-reports"));
+assert.ok(!groupsFor("ADMIN")[0].pages.some((p) => p.href === "/monthly-reports"));
```

**Behavior / invariants:**
- This is a **pure move + link fix** — no data source, no rendering logic, no auth-guard behavior changes anywhere in this unit's diff. It is independently revertible from FE-7/FE-10.
- Next.js App Router supports a route segment having both its own `page.tsx` and a `[id]/page.tsx` child in the same directory — `/rm/client-info` and `/rm/client-info/{id}` coexist without conflict; no `next.config.js` change is needed.
- Deleting `rm.client-detail` from `pages-config.ts` is safe because `rolesForPath()`'s existing `pathname.startsWith(p.path + "/")` rule (`lib/pages-config.ts:194`) already matches `/rm/client-info/{id}` against the pre-existing `rm.client-info` PageDef — no replacement PageId is needed.
- After this unit, `/rm/client-detail/<anything>` is a genuine 404 (the route no longer exists on disk) — this is intended, not a regression to patch.

**Done when:** `npx tsx admin-frontend/lib/pages.check.ts` passes; `/rm/client-info/<any-mock-id>` renders the (still-mock) detail page exactly as `/rm/client-detail/<any-mock-id>` did before this unit; both hardcoded push call sites updated; `tsc --noEmit` + `next lint` pass.

---

### FE-10 — Detail sub-page: explicit Basic Info / Subscription Info groups (Yes — user req.)

- **Proposal ref:** § Layer 2 A-7, § D-7
- **Module:** §5.9
- **Files:** `modify: admin-frontend/app/(roles)/rm/client-info/[id]/page.tsx`, `modify: admin-frontend/lib/mock/rm-data.ts` (drop `clientId` from `MockOverlay`/`OVERLAY_ROTATION` — nothing renders it after this unit)
- **Dependencies:** FE-7 (live `ClientRow` data must already be wired into this page).

**Contract:**
```tsx
// admin-frontend/app/(roles)/rm/client-info/[id]/page.tsx — replaces the old
// 6-cell info-grid with two explicit, labeled groups.

<InfoCard title="Basic Info">
  <Field label="Name" value={data.name} />
  <Field label="Primary Phone" value={data.phone} />
  <Field label="Email" value={data.email} />
  <Field label="Registered Address" value={data.address} />
  <Field label="Country of Residence" value={data.countryOfResidence} />
  <Field label="ID Info" value={undefined} placeholder="—" />  {/* always blank — Non-Goals */}
  <Field label="Initiate Method" value={data.initiateMethod} />
  <Field label="Assigned RM" value={data.assignedRm ?? "Unassigned"} />
  <Field label="Authorized Person" value={data.authorizedPerson} />
</InfoCard>

<InfoCard title="Subscription Info">
  <Field label="IB Account" value={data.ibAccount} />
  <SubscribedModelsTable models={overlay.models} />  {/* unchanged mock table, relocated here */}
</InfoCard>
```

**Behavior / invariants:**
- **"ID Info" is always blank** — it is not wired to `overlay.clientId` or any other source. `MockOverlay.clientId` is deleted from `lib/mock/rm-data.ts` in this same unit since nothing reads it anymore (dead field, not dead-but-kept).
- **"Assigned RM"** renders only the resolved display name already on `ClientRow.assignedRm` — no RM phone/email field exists in this DTO; do not fabricate one.
- **"Subscribed Models"** keeps reading from `getMockOverlay(data.id).models` exactly as before — this unit only *relocates* the table under the "Subscription Info" heading, it does not change its data source, columns, or behavior.
- The old "Primary Contact" field (mock `contact` + `title`) is **removed**, not relocated — `authorized_person` is the real-data field covering similar ground; the user's field list did not ask for a separate contact/title pair (see proposal D-7 for the explicit call-out of this judgment).
- Account Balance, KYC & Documents, and History cards are **untouched** by this unit — only the "Client Information" card is restructured.

**Done when:** the Basic Info group renders all 9 named fields in order, with "ID Info" always showing the blank placeholder regardless of client; the Subscription Info group shows `ib_account` + the unchanged Subscribed Models table; `lib/mock/rm-data.ts` no longer exports or references `clientId` anywhere; `tsc --noEmit` + `next lint` pass.

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal § 4.1)

```
GET /api/rm/clients
  Guard: Depends(require_action(Action.CLIENT_VIEW))
         # already granted to AdminRole.RM; AdminRole.ADMIN already has every Action
         # via ROLE_ACTIONS[ADMIN] = set(Action) — no permission change needed for either role
  Scope (role-based — D-4):
    RM    -> WHERE client_profiles.assigned_rm_uid = current_user.firebase_uid
    ADMIN -> no WHERE clause — every client_profiles row, unfiltered

Query params: none. All filtering happens client-side against the fetched set (D-3).

200 response body (ClientListOut):
{
  "items": [
    {
      "id": "b3f1c2a4-...-uuid",        // client_profiles.user_id, stringified
      "name": "Ardent Capital",
      "phone": "+1 (415) 555-0142",     // client_profiles.primary_phone
      "assigned_rm": "Dana Okafor",     // resolved: admin_profiles.name -> users.email -> raw uid -> null
      "address": "120 Battery Street, Suite 1400\nSan Francisco, CA 94111",
      "country_of_residence": "United States",
      "authorized_person": "Helena Voss",
      "initiate_method": "Referral",
      "ib_account": "IB-4471",
      "email": "h.voss@ardentcap.com"    // users.email, joined via client_profiles.user_id
    }
  ]
}

Errors: standard APIResult envelope on the frontend side (401 -> UNAUTHORIZED via require_action,
403 if caller's role lacks CLIENT_VIEW, network/HTTP_* on transport failure). A caller with an
empty visible set (e.g. an RM with no assigned clients) is a normal 200 with items: [] — never a 404.


GET /api/rm/clients/{id}
  Guard: same as above (require_action(Action.CLIENT_VIEW))
  Scope: same role-based rule as above (RM: assigned_rm_uid match; ADMIN: unfiltered)
  Path param: id — the ClientListItemOut.id (== client_profiles.user_id, UUID)

200 response body: ONE ClientListItemOut (same shape as an items[] element above), NOT wrapped.
404: id is outside the caller's visible set — for an RM this means "doesn't exist OR not assigned
     to them" (indistinguishable, to avoid leaking existence across RMs); for ADMIN it means the
     client genuinely doesn't exist, since its visible set is everything.
Errors: same envelope as the list endpoint.
```

**Field-name ↔ column-name map** (also the exact key set both layers must use verbatim):

| Wire field | `client_profiles` column | Notes |
|---|---|---|
| `id` | `user_id` | Stringified UUID; replaces today's mock slug ids |
| `name` | `name` | |
| `phone` | `primary_phone` | |
| `assigned_rm` | `assigned_rm_uid` (resolved) | Joined to `users.firebase_uid` → `admin_profiles.name`, fallback `users.email`, fallback raw uid, `null` if unset |
| `address` | `address` | |
| `country_of_residence` | `country_of_residence` | |
| `authorized_person` | `authorized_person` | |
| `initiate_method` | `initiate_method` | |
| `ib_account` | `ib_account` | |
| `email` | `users.email` | Joined via `client_profiles.user_id = users.id` (the *client's* user row, not the RM's) |

### 7.2 How this layer honours the seam
- **What this layer contributes:** exactly one `getClients()` call per session per caller — RM or ADMIN alike (module-scope cache); at most one `getClient(id)` call per cold entry to a detail page (cache-hit-first); no query params ever sent; a 404 on `/rm/clients/{id}` is rendered as Next.js's `notFound()` regardless of role, without the frontend needing to know *why* it was 404'd.
- **What this layer assumes from the other side:** the two routes exist per §7.1 exactly, guarded by `require_action(Action.CLIENT_VIEW)`, role-based scoping per D-4 already applied server-side (the frontend never re-derives or second-guesses which rows it's allowed to see), `assigned_rm` and `email` already resolved server-side, `id` is a UUID string, an empty visible set is `{"items":[]}` and never 404. COMPLIANCE is not a consumer of this endpoint — it 403s, unchanged from today.
- **Change protocol:** any edit to §7 requires editing the proposal first; this section is then re-copied. Never edit §7 in isolation.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Framework / runner:** this repo has no configured frontend test runner today. The gate is `tsc --noEmit -p tsconfig.json && next lint`; behavioural verification is done by driving the running app in a preview browser per `.claude/skills/verify`.
- **Manual verification (per unit):** below, in place of automated tests. If a runner is added later (Vitest / Jest), the "asserts" column of the matrix becomes the test names verbatim.
- **Isolation:** any future automated tests may mock `@/app/(roles)/rm/**/actions` at the module boundary with `{ success: true, data: … }` shapes matching §7. Do **not** stand up the backend in these tests — seam mocking only.
- **Layer isolation (critical):** future automated tests may import only from `@/lib/rm/*`, `@/hooks/api/*`, `@/app/(roles)/rm/**/actions` (mocked), and the two page files. They must **not** hit the backend or expect it to be running.

### 8.2 Coverage matrix

| Unit | Test / manual verification | Asserts |
|---|---|---|
| FE-1 | `ADV_FIELDS` accessor sweep (mental / compile-time) | 9 fields; each `get` returns `string` given a fully-populated `ClientRow`; keys are unique. |
| FE-2 | `dtoToRow` compile-check + one runtime example in dev console | Every DTO field maps to a `ClientRow` field of the same nullability; snake_case → camelCase. |
| FE-3 | Preview: watch network tab | `GET /api/rm/clients` fires once when the page mounts; `GET /api/rm/clients/{id}` fires once on cold detail-page entry. |
| FE-4 | Preview: navigate away and back | Second mount of Client Book fires zero network calls (cache hit). |
| FE-5 | Preview: click a row vs. hard refresh | In-app row click → zero network; hard refresh on `/rm/client-info/<uuid>` → exactly one `GET .../clients/{id}`. |
| FE-6 | Preview: type in search, add advanced filter chips; also log in as ADMIN vs. RM | All filtering is client-side (no network calls per keystroke); both empty states fire; the "N clients" subtitle updates from `data.length`; an ADMIN login shows the full roster, an RM login shows only their own book; row click navigates to `/rm/client-info/<id>`. |
| FE-7 | Preview: navigate list → detail; also hard-refresh a foreign RM's uuid as that RM vs. as ADMIN | Detail renders at `/rm/client-info/<uuid>`; foreign uuid as the non-owning RM → Next.js 404 page; the same uuid as ADMIN → 200 (D-4). |
| FE-8 | Preview: same client id renders same overlay across reloads | `getMockOverlay(id)` is stable; no `RM_CLIENTS` import warnings from tsc. |
| FE-9 | Preview: visit `/rm/client-detail/<any-id>` and `/rm/client-info/<any-id>`; click a Client Book row; click an OnboardingBoard card; run `pages.check.ts` | Old route 404s; new route renders the (still-mock) detail page; both nav call sites land on `/rm/client-info/...`; `npx tsx admin-frontend/lib/pages.check.ts` exits 0. |
| FE-10 | Preview: open any client's detail sub-page | Basic Info shows all 9 fields with "ID Info" always blank; Subscription Info shows IB Account + the unchanged Subscribed Models table; no "Primary Contact" field remains. |

### 8.3 Tests

*(No runner configured — see §8.1. If/when Vitest is added, the below are the intended shapes.)*

#### FE-1
```ts
import { ADV_FIELDS } from "@/lib/rm/client-search-fields";
test("ADV_FIELDS keys are unique", () => {
  const keys = ADV_FIELDS.map((f) => f.key);
  expect(new Set(keys).size).toBe(keys.length);
});
test("every get returns a string", () => {
  const c: ClientRow = /* fully populated */;
  ADV_FIELDS.forEach((f) => expect(typeof f.get(c)).toBe("string"));
});
```

#### FE-4
```ts
import { renderHook, act } from "@testing-library/react";
import { useClientBook } from "@/hooks/api/useClientBook";
vi.mock("@/app/(roles)/rm/client-info/actions", () => ({
  getClients: vi.fn().mockResolvedValue({ success: true, data: { items: [/* … */] } }),
}));

test("second mount does not re-fetch", async () => {
  const first = renderHook(() => useClientBook());
  await act(async () => {});
  first.unmount();

  const { result } = renderHook(() => useClientBook());
  // Same auth uid across mounts → cache hit → data present immediately, loading false
  expect(result.current.loading).toBe(false);
  expect(result.current.data).toHaveLength(/* … */);
});
```

#### FE-5
```ts
test("cache hit avoids network call", async () => {
  // Seed useClientBook's cache first (via a preceding useClientBook mount)
  // Then mount useClient(existingId)
  const spy = vi.spyOn(actions, "getClient");
  const { result } = renderHook(() => useClient(existingId));
  await act(async () => {});
  expect(spy).not.toHaveBeenCalled();
  expect(result.current.data).toBeTruthy();
});

test("404 sets notFound, not error", async () => {
  vi.mocked(getClient).mockResolvedValue({ success: false, code: "HTTP_404", error: "not found" });
  const { result } = renderHook(() => useClient("missing-uuid"));
  await act(async () => {});
  expect(result.current.notFound).toBe(true);
  expect(result.current.error).toBeNull();
});
```

#### FE-8
```ts
import { getMockOverlay } from "@/lib/mock/rm-data";
test("overlay lookup is deterministic per id", () => {
  const a = getMockOverlay("uuid-1");
  const b = getMockOverlay("uuid-1");
  expect(a).toEqual(b);
});
test("different ids map into the rotation without crashing", () => {
  for (let i = 0; i < 50; i++) {
    expect(getMockOverlay(`uuid-${i}`).status).toBeTruthy();
  }
});
```

### 8.4 Aggregate gate
- `npx tsc --noEmit -p tsconfig.json && npx next lint` green is a merge gate.
- Manual verification per §8.2 done before opening the PR.

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] FE-1..FE-10 committed on `searchbar-client-book-fe`; each commit left the branch green.
- [ ] FE-9 committed and gate-passed **before** FE-6/FE-7 dispatch — see the execution schedule's wave ordering.
- [ ] `/rm/client-detail/*` no longer exists as a route (genuine 404); `/rm/client-info/[id]` is the only detail route.
- [ ] `npx tsx admin-frontend/lib/pages.check.ts` passes with no `rm.client-detail` references remaining.
- [ ] `tsc --noEmit` + `next lint` pass.
- [ ] Manual verification per §8.2 passes end-to-end against a running (real or mocked) backend serving §7.
- [ ] §7 matches the proposal's frozen seam verbatim.
- [ ] PR opened against `searchbar-client-book`; human owns the merge.

**Rollback:** additive on all new files; page-file edits (`client-info/page.tsx`, the relocated `client-info/[id]/page.tsx`) and `lib/mock/rm-data.ts` are edited in-place, but reverting the branch restores the mock-only Client Book **and** the original `/rm/client-detail/[id]` route from `655b625` — Next.js route files are just files, so a branch revert naturally un-deletes `client-detail/[id]/page.tsx` and un-creates `client-info/[id]/page.tsx`. `lib/pages-config.ts`/`pages.check.ts` revert the same way. Clean rollback — no persisted state, no cache pollution across sessions (module-scope cache dies with the tab).
