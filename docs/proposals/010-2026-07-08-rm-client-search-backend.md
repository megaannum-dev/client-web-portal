# 010 — RM Client Book: Live Search Against `client_profiles`

> Status: **DRAFT — pending implementation approval.**
> Scope: Wire the RM Client Book's general search and advanced-search UI (`admin-frontend/app/(roles)/rm/client-info/page.tsx`) to a new backend search endpoint over the existing `client_profiles` table, consolidate the per-client detail view into that same page as a `/rm/client-info/[id]` sub-route (moving it off the separate `/rm/client-detail/[id]` route), and explicitly present every DB-backed client attribute on that sub-page. Excludes any database schema/migration work — `client_profiles` is consumed exactly as it exists today.
> Constraint: No change to `client_profiles` columns, indexes, or Alembic history. No change to the Client Book's markup/layout/interaction shape landed in commit `655b625` (`searchbar-client-book`) beyond the route consolidation and detail-page field grouping explicitly called for here — only the data source moves from mock to live.

---

## 1. Context and Motivation

The Client Book search UI was just built end-to-end against mock data: `admin-frontend/app/(roles)/rm/client-info/page.tsx` implements a dominating search box plus a field-level advanced-search popover (`ADV_FIELDS`, `matchClient`/`matchAdv`), backed entirely by `admin-frontend/lib/mock/rm-data.ts` (`RM_CLIENTS`, `CLIENT_EXTRA`, `getClientDetail`). No network call exists anywhere in the RM pages today.

Separately, `client_profiles` (`api-backend/app/models/users.py:86-115`) is a real, already-migrated table with per-client attributes: `name`, `primary_phone`, `assigned_rm_uid` (FK → `users.firebase_uid`), `address`, `country_of_residence`, `authorized_person`, `initiate_method`, `ib_account`. It has existed since migration `79729eec2af4` (0002) and been extended through `8f2a1c9d4b6e` (0003, UUID keys), `e5f6a7b8c9d0` (0008, `ib_account`), and `c9e2f4a7b183` (0011, column reorder) — but **no backend route reads it today**. `Action.CLIENT_VIEW` / `Action.CLIENT_MANAGE` are already declared and granted to the RM role (`api-backend/app/libs/auth/actions.py:9-10,24`) with a comment stating they were "pre-kept for 004 (RM client onboarding)" — i.e. this wiring was anticipated but never built.

Several fields the current mock UI displays have **no** column in `client_profiles` — `status`, `mandate`, `aum`, `renewal`, `kyc`, `since`, `models` (count), `contact`, `title`, `email`, `clientId`, `cashValue`/`portfolioValue`. These exist only in the Claude-design prototype's demo data and have no home in the DB yet.

> **Why now / why this order.** The search UI's data contract (`ADV_FIELDS` shape, the `matchClient`/`matchAdv` predicates) is now stable and merged. Swapping its data source for a real endpoint is the natural, lower-risk next step — the UI doesn't need to change, only what feeds it.

---

## 2. Goals

1. A new backend endpoint returns the caller's **visible** client set — scoped by role: an RM sees only `client_profiles` rows where `assigned_rm_uid = current_user.firebase_uid`; an ADMIN caller sees **every** `client_profiles` row, regardless of assignment (Design Decision D-4). `assigned_rm_uid` is resolved to a human-readable name (mirroring the existing `resolve_actor_names` join pattern) so the "Assigned RM" column renders directly from the DTO in both cases.
2. General (dominating) search and advanced-search matching both run **client-side** against the fetched book, using the same substring predicates over every `client_profiles` attribute except id/FK-id/timestamp columns, with `assigned_rm` matched by resolved **name**, not raw Firebase UID. No per-keystroke server call.
3. The advanced-search field list is driven by **one** frontend config module whose field set is exactly the attribute set matched by the general query (Goal 2) — not hand-duplicated between the popover and the client-side matcher.
4. The caller's visible set is fetched **once per session** (module-scope cache keyed by the current user's Firebase UID), so subsequent searches, filter changes, and remounts of the Client Book cost zero network round trips (Design Decision D-3; a more elegant caching scheme is deferred to a follow-up proposal). For an ADMIN caller this means the entire roster is cached client-side, not just one RM's book — see D-4's rationale for why that's still acceptable at current scale.
5. Fields with no `client_profiles` column (status, mandate, AUM, renewal, KYC, since, models, contact, title, email, clientId, cash/portfolio value) keep rendering from a mock overlay, now keyed off the real backend-issued client id instead of today's hardcoded slugs (`"ardent"`, `"vela"`, …).
6. The Client Book's existing markup, styling, and interaction shape (from commit `655b625`) are unchanged — only the data plumbing behind `q`/`advActive`/`filtered` changes.
7. **Route consolidation (Yes — user req.):** the per-client detail view moves from its own top-level route (`/rm/client-detail/[id]`) to a sub-route of the Client Book (`/rm/client-info/[id]`), reflecting that it is one workspace with two views (list + detail), not two independent pages. This lands **before** Goal 8's field-presentation work, per explicit sequencing instruction — a route half-migrated mid-way through a data-wiring change is a worse state than either finished state alone.
8. **Explicit presentation of every DB-backed client attribute (Yes — user req.):** the client detail sub-page groups fields into two labeled sections — **Basic Info** (Name, Primary Phone, Email, Registered Address, Country of Residence, ID Info [blank placeholder — no real client-ID system exists yet], Initiate Method, Assigned RM, Authorized Person) and **Subscription Info** (IB Account, Subscribed Models). All Basic Info fields except "ID Info" and the mock-sourced KYC/history sections are real, backend-sourced data from the DTO already defined in §4.1 — no wire-contract change is needed, only frontend presentation.

## 3. Non-Goals

- No changes to the `client_profiles` table, its indexes, or any Alembic migration — owned by whichever future proposal adds real columns for status/KYC/etc.
- Mock-overlay fields (status, mandate, AUM, renewal, KYC, since, models, contact, title, email, clientId, cash/portfolio value) are **not** made searchable/filterable in this phase. General and advanced search cover only `client_profiles`-backed attributes. Making the overlay fields real data is owned by a future "client lifecycle data" proposal.
- The detail sub-page's KYC checklist and activity history (unaffected by the Basic Info / Subscription Info regrouping in Goal 8) are not touched beyond the re-keying needed for Goal 5 — they keep reading synthesized mock data (`clientDocs()`, `clientHistory()`).
- No cross-RM handoff search for the RM role itself — an RM sees only their own book, full stop; there is no "view all" toggle or colleague-lookup feature for RMs in this proposal. Full-roster visibility is granted only to ADMIN (D-4), as a byproduct of its existing oversight role — not as a search-scope preference RMs can opt into. COMPLIANCE is explicitly **not** touched by this proposal — it keeps its current zero granted actions and gets no special client-visibility treatment here; extending visibility to COMPLIANCE (or any other role) is deferred to a future revision.
- No server-side filtering, ILIKE composition, or pagination. All matching is client-side against the fetched book (D-3); a future scale-driven proposal can reintroduce a filterable endpoint if per-RM books grow past what a browser filters comfortably.
- No new frontend dependency (no React Query, SWR, or a debounce library) and no new backend generic (no `Page[T]`). Both layers reuse patterns already present in this codebase (see Design Decisions D-2).
- No change to `admin-frontend/lib/pages-config.ts`'s `ROLE_PAGES` grants or `ROLE_NAV`/sidebar structure. D-4 grants ADMIN full **data** visibility once it reaches `/rm/client-info`; whether ADMIN can *navigate* there at all is unaffected by this proposal — ADMIN already has `"rm.client-info": "OPERATE"` via `ALL_OPERATE` (`lib/pages-config.ts:157`). The one `pages-config.ts` edit this proposal **does** make — deleting the now-redundant `rm.client-detail` PageId (Goal 7/D-6) — is a deletion of dead config, not a grant/access change.
- "ID Info" in the new Basic Info group (Goal 8) is a hardcoded blank/placeholder — this proposal does not introduce a real client-ID system. The mock `clientId` field (`"MEGA-0481"`-style, synthesized in `lib/mock/rm-data.ts`) is retired, not relocated.
- "Assigned RM" in Basic Info is the resolved display **name** already in the DTO (`assigned_rm`) — no RM contact info (phone/email) is added. If the product needs RM contact details on the detail page, that is a new DTO field for a future proposal, not assumed here.
- "Subscribed Models" in the new Subscription Info group stays exactly what it is today — mock-sourced, unfiltered, unsearchable (per the existing Non-Goal above on overlay fields). Only its on-page grouping changes (co-located with the real `ib_account` field under one "Subscription Info" heading instead of a separate standalone card).

---

## 4. Cross-layer seam (frozen here)

### 4.1 The wire contract

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

Excluded by design (id/FK-id/timestamp columns, per Goal 2): `client_profiles.id`, `client_profiles.user_id` is exposed only as the opaque `id` above (not searchable itself), `created_at`, `updated_at`.

### 4.2 Per-layer obligations against the seam

| Layer | What this layer contributes | What this layer assumes from the other side |
|---|---|---|
| Backend | Serves `GET /api/rm/clients` exactly per §4.1, guarded by `require_action(Action.CLIENT_VIEW)`, scoped by role (RM: `assigned_rm_uid = current_user.firebase_uid`; ADMIN: unfiltered); no `ROLE_ACTIONS` change needed (RM and ADMIN both already have `CLIENT_VIEW`); resolves `assigned_rm_uid` → name via a SQL-level join (mirroring `resolve_actor_names`); returns the full visible set in a single response — no server-side filtering, ILIKE, or pagination | Frontend calls the endpoint at most once per session per caller (D-3); the DB schema of `client_profiles`/`users`/`admin_profiles` stays exactly as documented in Layer 1 §A for the lifetime of this proposal |
| Frontend | Fetches once via the module-scoped hook (Layer 2 A-5); runs all `q`/advanced-filter matching client-side using the shared config (Layer 2 A-1); renders through the existing Client Book table/search markup unchanged; merges each `id` with the mock overlay (Layer 2 D-1) for non-DB display fields | Backend returns the exact field names/types of §4.1 for exactly the caller's role-scoped visible set, `assigned_rm` already resolved to a human name |

### 4.3 Change protocol (post-freeze)

- Any edit to §4.1 (new field, renamed key, pagination shape change) requires a dated addendum here before either layer's implementation doc changes.
- Both impl docs' §7 are updated together — the seam never lives in only one place.

---

## Layer 1 — Backend

### A. Objects in scope

| File | Tables / objects | Change |
|---|---|---|
| `api-backend/app/models/users.py` | `client_profiles`, `users`, `admin_profiles` | Read-only — no column/model changes |
| `api-backend/app/libs/clients/schemas.py` | — | **New**: `ClientListItemOut`, `ClientListOut` |
| `api-backend/app/libs/clients/repository.py` | — | **New**: `ClientRepository.list_for_rm(firebase_uid)` + `get_for_rm(firebase_uid, client_id)` |
| `api-backend/app/libs/clients/service.py` | — | **New**: `ClientService.list_for_rm(firebase_uid)` + `get_for_rm(firebase_uid, client_id)` |
| `api-backend/app/libs/clients/router.py` | — | **New**: `GET /rm/clients`, `GET /rm/clients/{id}` |
| `api-backend/app/main.py` | — | +1 `include_router(clients_router, prefix="/api")` |

### B. Findings

#### B-1. No list/search endpoint exists over `client_profiles` (MANDATORY)

Every existing router was checked (`app/libs/users/router.py`, `app/libs/trade_models/router.py`, `app/libs/allocation_matrix/router.py`) — none exposes a filtered/paginated list; `GET /pc/models` returns the full unpaginated set, `GET /pc/allocation` is a single-object ETag endpoint. `Action.CLIENT_VIEW`/`CLIENT_MANAGE` (`app/libs/auth/actions.py:9-10,24`) are declared and already granted to `AdminRole.RM` but consumed by zero endpoints.

**Refactor:** add a new `app/libs/clients` module (router → service → repository), mirroring the layering already used by `app/libs/users` and `app/libs/trade_models`, exposing `GET /rm/clients` guarded by `Depends(require_action(Action.CLIENT_VIEW))` exactly as `app/libs/users/router.py:76` does for `USER_VIEW`.

#### B-2. `assigned_rm_uid` has no name-resolution path for this table (Yes)

`resolve_actor_names()` (`api-backend/app/libs/trade_models/repository.py:208-219`) already performs the `User.firebase_uid` → `AdminProfile` join this proposal needs, but it is scoped to trade-model actor fields and returns a Python dict, not a SQL-composable predicate — unusable as-is for an ILIKE filter or for keeping `total` correct pre-pagination.

**Refactor:** the new repository builds the resolution as a SQL join (not a post-fetch Python dict), so it can participate in both the `WHERE` clause (general/advanced RM-name matching) and `COUNT`:

```python
from sqlalchemy import func, or_
from sqlalchemy.orm import aliased
from app.models.users import ClientProfile, User, AdminProfile

RM = aliased(User)
RMProfile = aliased(AdminProfile)
ClientUser = aliased(User)  # the client's own user row (for email)
rm_name = func.coalesce(RMProfile.name, RM.email, ClientProfile.assigned_rm_uid)

query = (
    db.query(ClientProfile, rm_name.label("assigned_rm"), ClientUser.email.label("email"))
    .outerjoin(RM, RM.firebase_uid == ClientProfile.assigned_rm_uid)
    .outerjoin(RMProfile, RMProfile.user_id == RM.id)
    .outerjoin(ClientUser, ClientUser.id == ClientProfile.user_id)
)
```

Two aliased joins to `users` — one for the RM's row (resolving `assigned_rm_uid` to a name) and one for the client's own row (pulling `email`). Aliasing is required so SQLAlchemy doesn't merge them into a single join with contradictory ON clauses.

*(Recommend, not required for this proposal):* extract `resolve_actor_names`'s join into a shared helper (e.g. `app/libs/common/rm_names.py`) so `trade_models` and `clients` share one implementation instead of two near-identical joins. Left as a follow-up so this proposal doesn't touch the `trade_models` module.

#### B-3. Role-based scoping — RM restricted, ADMIN unrestricted (MANDATORY — Design Decision D-4)

The endpoint's visible set depends on the caller's role, not a single fixed `WHERE` clause:

- **RM:** `client_profiles.assigned_rm_uid = current_user.firebase_uid` — own book only.
- **ADMIN:** no filter — every `client_profiles` row.

This requires knowing the caller's `AdminRole` in the router, not just their `User`/`firebase_uid`. `require_action(Action.CLIENT_VIEW)` only returns the `User`; the role itself is looked up a second time in the route handler (the same `AdminProfileRepository(db).get_by_user_id(user.id)` call `require_action` already makes internally to check the action — accepted as a small duplicate query rather than changing `require_action`'s return type for every existing consumer):

```python
FULL_VISIBILITY_ROLES = {AdminRole.ADMIN}

def list_visible(self, role: AdminRole, rm_firebase_uid: str) -> list[ClientRow]:
    query = self._base_query()  # joins only, no scoping filter baked in
    if role not in FULL_VISIBILITY_ROLES:
        query = query.filter(ClientProfile.assigned_rm_uid == rm_firebase_uid)
    return [self._row(r) for r in query.all()]
```

No `ROLE_ACTIONS` change is needed — `AdminRole.ADMIN` already carries `Action.CLIENT_VIEW` via `set(Action)` (`app/libs/auth/actions.py:34`), and `AdminRole.RM` already has it too. `AdminRole.COMPLIANCE` remains at its current `ROLE_ACTIONS[COMPLIANCE] = set()` (`app/libs/auth/actions.py:33`) — a Compliance Officer calling this endpoint gets a 403, unchanged from today. `FULL_VISIBILITY_ROLES` is written as an explicit set (not "every role except RM") specifically so that COMPLIANCE is not accidentally swept into full visibility if it's ever granted `CLIENT_VIEW` by an unrelated future change — an explicit allowlist, not a denylist.

#### B-4. No server-side filtering, ILIKE composition, or pagination (Design Decision D-3)

All `q` / advanced-filter matching happens client-side against the fetched book. The endpoint therefore takes **no** query params — no `q`, no per-field ILIKE params, no `page`/`page_size`. The `PaginationParams` model (`app/utils/pagination.py:1-6`) remains unused for this proposal; it stays declared for the future scale-driven proposal that reintroduces server-side filtering (§3 Non-Goals).

The response is a single bespoke envelope `ClientListOut { items: list[ClientListItemOut] }` — mirroring the existing non-generic `ModelsListOut` convention (`app/libs/trade_models/schemas.py:126-129`) rather than introducing an un-asked-for `Page[T]` generic.

### C. Other backend findings

None beyond B-1..B-5 — this is an additive, single-endpoint module with no impact on existing routes.

### D. Route / contract simplification

Net new route only — nothing removed or reshaped.

> Final route surface after this layer lands:
> ```
> GET /api/rm/clients         Caller's client book (§4.1, first block)
> GET /api/rm/clients/{id}    One client from the caller's book (§4.1, second block; D-5)
> ```
> Net: **+2 routes** (all existing routes unchanged).

### E. Summary of Backend-layer changes

| # | Change | Required? | Effort |
|---|---|---|---|
| B-1 | New `app/libs/clients` router/service/repository triad; mount under `/api` | MANDATORY | S |
| B-2 | SQL-level `assigned_rm_uid` → name join (mirrors `resolve_actor_names`) | Yes | XS |
| B-2r | Extract `resolve_actor_names` join into a shared helper | Recommend | S |
| B-3 | Role-based scoping (RM: own book; ADMIN: unfiltered) — no `ROLE_ACTIONS` change needed (D-4) | MANDATORY | XS |
| B-4 | No query params, no pagination — return the scoped book as one `ClientListOut` (D-3) | Accepted | XS |
| B-5 | Sibling `GET /rm/clients/{id}` for direct client-detail fetch (D-5); same join/scope | MANDATORY | XS |

---

## Layer 2 — Frontend

| File | LOC | Role |
|---|---|---|
| `admin-frontend/app/(roles)/rm/client-info/page.tsx` | ~446 | Client Book list/search UI — currently 100% mock |
| `admin-frontend/lib/mock/rm-data.ts` | 461 | `RM_CLIENTS`/`CLIENT_EXTRA` mock + `getClientDetail` |
| `admin-frontend/app/(roles)/rm/client-detail/[id]/page.tsx` | 233 | Per-client detail — also 100% mock, keyed by slug id; **relocates to `client-info/[id]/page.tsx` per Goal 7 (A-6)** |
| `admin-frontend/lib/pages-config.ts` | 225 | `PAGES`/`ROLE_PAGES` route registry — the `rm.client-detail` PageId is deleted per A-6 |
| `admin-frontend/lib/pages.check.ts` | 71 | Assertion script for `pages-config.ts` — two assertions reference `/rm/client-detail` and must be updated |
| `admin-frontend/components/rm/OnboardingBoard.tsx` | — | `openProfile()` pushes to `/rm/client-detail/${id}`; must be updated to the new path (A-6) |

### A. Findings

#### A-1. Advanced-search fields are hand-inlined, not config-driven (Yes — user req.)

`ADV_FIELDS` lives inline in `page.tsx:35-42` as `{ key, label, placeholder, get }[]`, coupling the popover's rendering to the same object that does client-side matching.

**Refactor:** extract to `admin-frontend/lib/rm/client-search-fields.ts`, an array of `{ key, label, placeholder, get: (c: ClientRow) => string }` descriptors covering **exactly** the §4.1 field set (`name`, `phone`, `assigned_rm`, `address`, `country_of_residence`, `authorized_person`, `initiate_method`, `ib_account`, `email`) — dropping `status`, `clientId` from advanced search since they have no backing column in `client_profiles` or `users` (Non-Goal, §3). `page.tsx` imports this one module both to render the popover and to run the client-side `matchAdv` predicate, so the popover's field list and the matcher's field list can never drift apart. The `get` accessor is what makes the config the single source of truth — a new advanced-search field is a one-line addition here, not a two-place change.

#### A-2. No backend-calling layer exists for RM pages (Yes)

Confirmed: no `lib/api/*`, no React Query/SWR (`package.json` has neither dependency), no `fetch` calls anywhere under `app/(roles)/rm/`. The established convention elsewhere (PC pages) is a 4-piece chain: `server/api-client.ts` (shared, `import "server-only"`) → per-domain `"use server"` fetchers (`server/pc/index.ts`) → route-local `"use server"` actions (`app/(roles)/pc/allocation-matrix/actions.ts`) → a client hook with its own loading/error state (`hooks/api/useModels.ts`, `useAllocation.ts`).

**Refactor:** mirror the same chain for RM:
- `admin-frontend/server/endpoints.ts` — add `ENDPOINTS.RM.CLIENTS` (a plain `/api/rm/clients` string; no params).
- `admin-frontend/server/rm/index.ts` (new, `"use server"`) — `getClients(): Promise<APIResult<ClientListDTO>>` and `getClient(id): Promise<APIResult<ClientListItemDTO>>` calling `apiClient`.
- `admin-frontend/app/(roles)/rm/client-info/actions.ts` and `client-detail/[id]/actions.ts` (new, `"use server"`) — thin wrappers re-exporting the server fetchers with logging, matching `allocation-matrix/actions.ts`'s shape.
- `admin-frontend/lib/rm/clients.ts` (new) — DTO → UI-shape mapper (parallel to `lib/pc/models.ts`).
- `admin-frontend/hooks/api/useClientBook.ts` (new, `"use client"`) — the consuming hook for the list page (see A-5 for its caching behavior).
- `admin-frontend/hooks/api/useClient.ts` (new, `"use client"`) — the consuming hook for `client-detail/[id]/page.tsx`. Reads from `useClientBook`'s cache by id first (zero network on in-app navigation from the list); on cache miss (hard refresh, deep link), calls `getClient(id)` via the sibling endpoint (D-5).

#### A-3. Client identity is a hardcoded slug, incompatible with real UUIDs (Yes)

`RM_CLIENTS`/`CLIENT_EXTRA` are keyed by hand-picked slugs (`"ardent"`, `"vela"`, …); the backend will return real `client_profiles.user_id` UUIDs. See **Design Decision D-1** below for the resolution — this finding is resolved there rather than inline to keep the re-keying rationale in one place.

#### A-4. Debounce not needed (Accepted)

Because all filtering is client-side against the once-fetched book (A-5), `q`/`advDraft` keystrokes never trigger a network call. Today's synchronous `Array.filter` inside a `useMemo` remains the interaction path — no debounce, no `setTimeout`, no dependency needed. A future proposal that reintroduces server-side filtering must revisit this.

#### A-5. One-shot fetch + module-scope cache (Yes — Design Decision D-3)

**Refactor:** `useClientBook` fetches the caller's full book once per session and stores it in a module-scope `Map` keyed by the current RM's Firebase UID — same shape as `useAllocation.ts`'s cache but simpler (one entry per RM, no ETag, no periods):

```ts
const cache = new Map<string, ClientRow[]>();  // firebase_uid -> the RM's book

export function useClientBook(): { data: ClientRow[] | null; loading: boolean; error: string | null; refetch: () => void } {
  const uid = useAuth().portalUser?.firebase_uid ?? null;
  // ... on mount: if cache.has(uid) return the cached array; else fetch, seed, return.
  // inFlight ref prevents duplicate fetches on strict-mode double-mount, matching useModels/useAllocation.
}
```

`page.tsx` uses the returned array as the source for its existing `useMemo(() => filtered, [data, q, advActive])` — the client-side `matchClient`/`matchAdv` predicates are unchanged from the mock version (they already work over `RmClient`-shaped rows; the DTO mapper in `lib/rm/clients.ts` produces the same shape). Result: subsequent Client Book remounts, sidebar navigations back to the page, or filter changes cost zero network round trips.

A more elegant caching scheme (narrowing anchor, stale-while-revalidate on focus, cross-tab sync) is tracked for a follow-up proposal — see D-3's rationale.

#### A-6. Client detail is an artificially separate route from the Client Book (Yes — user req. — Design Decision D-6)

`admin-frontend/app/(roles)/rm/client-detail/[id]/page.tsx` is a top-level sibling route to `client-info/page.tsx`, even though it is only ever reached by clicking a row *in* the Client Book — there is no independent entry point to "Client Detail" as its own destination. This wasn't even the original design's intent: the Claude-design prototype's `App.jsx` (`megaannum-crm/project/rm/rm-app/App.jsx`, from the design handoff) renders `<ClientDetail>` as a conditional swap *within the same view* (`if (client) return <ClientDetail .../>`), driven by React state, not a separate route at all — "Client Detail" was never meant to be a URL-addressable page independent of the book it belongs to.

Two consumers currently hardcode the `/rm/client-detail/${id}` path:
- `client-info/page.tsx:103` — `openClient()`, the row-click handler.
- `components/rm/OnboardingBoard.tsx:151` — `openProfile()`, reached from the onboarding pipeline board (out of scope otherwise, but this one navigation call must still be updated).

And one config surface encodes the old path: `lib/pages-config.ts`'s `rm.client-detail` PageId (`path: "/rm/client-detail"`, `hideFromNav: true`), granted to RM in `ROLE_PAGES`.

**Refactor:**
1. Move `app/(roles)/rm/client-detail/[id]/page.tsx` → `app/(roles)/rm/client-info/[id]/page.tsx` (Next.js App Router supports a route segment having both its own `page.tsx` and a `[id]/page.tsx` child — `/rm/client-info` and `/rm/client-info/{id}` coexist with no routing conflict).
2. Update both hardcoded push targets (`client-info/page.tsx`, `OnboardingBoard.tsx`) to `/rm/client-info/${id}`.
3. **Delete** the `rm.client-detail` PageId from `pages-config.ts` entirely — it is now dead, not merely renamed. `rolesForPath()`'s existing `pathname.startsWith(p.path + "/")` check (`lib/pages-config.ts:194`) already makes `/rm/client-info/{id}` resolve correctly against the *existing* `rm.client-info` PageDef, with no new PageId needed. Keeping `rm.client-detail` around pointing at a path that no longer exists on disk would be dead, actively-wrong config, not backward compatibility.
4. Update the two `/rm/client-detail`-referencing assertions in `lib/pages.check.ts` (line 29's exact-path check, line 58's hidden-nav check) — remove them and add one assertion confirming `rolesForPath("/rm/client-info/<uuid>")` resolves to `["ADMIN", "RM"]` via the sub-path rule, so the removed PageId's coverage isn't silently lost.

This finding is **sequenced before A-7 and before the live-data wiring in A-2/A-5's units** — see Execution & Verification. It is a pure move (no data-source change): the relocated page still reads mock `getClientDetail()` at the moment this finding's units land; A-2/A-5's hooks are wired in afterward, on the new path.

#### A-7. DB-backed client attributes exist in the DTO but are never explicitly rendered (Yes — user req. — Design Decision D-7)

The wire contract (§4.1) already carries `name`, `phone`, `email`, `address`, `country_of_residence`, `authorized_person`, `initiate_method`, `ib_account`, and `assigned_rm` — but the current mock-driven detail page (`ClientDetail.jsx`'s prototype layout, carried into the mock port) only ever rendered a subset, and inconsistently: its "Client Information" info-grid shows Registered Address, Country of Residence, "Client Since / ID" (mock `clientId`), "Primary Contact" (mock `contact` + `title`, not `authorized_person`), Email, and Phone — six cells. `authorized_person`, `initiate_method`, and `ib_account` (as a client-level field, distinct from the per-model "Linked Account" in the Subscribed Models table) never appear anywhere on the page, and `assigned_rm` only ever shows as unstructured header text ("RM: Dana Okafor"), never as a labeled field.

**Refactor:** restructure the "Client Information" card into two explicitly labeled groups, replacing the old six-cell info-grid:

- **Basic Info:** Name, Primary Phone, Email, Registered Address, Country of Residence, ID Info (blank placeholder — §3 Non-Goals), Initiate Method, Assigned RM, Authorized Person.
- **Subscription Info:** IB Account, Subscribed Models (the existing mock-sourced models table, relocated under this heading rather than standing alone).

The old mock-only "Primary Contact" (`contact` + `title`) field is dropped — `authorized_person` is real data covering similar ground, and the user's field list does not ask for a separate contact/title pair. This is a judgment call made explicit here rather than silently: if `contact`/`title` need to survive as distinct fields, that's a scope addition for the reviewer to flag, not an oversight.

This finding depends on A-6 (the page must already be at `client-info/[id]/page.tsx`) and on the live-data wiring already specified in A-2/A-5 (the fields being grouped here are the same `ClientRow` fields those units already fetch — this finding is purely a presentation/layout change, not a new data dependency).

### B. Adapting to changes in other layers

| Upstream change | Frontend change | Files touched |
|---|---|---|
| Backend §4.1 route/DTO exists | Add fetcher + action + hook per A-2 | `server/rm/index.ts`, `app/(roles)/rm/client-info/actions.ts`, `server/endpoints.ts`, `hooks/api/useClientBook.ts` |
| Backend resolves `assigned_rm` to a name | "Assigned RM" table column reads `item.assigned_rm` directly — no client-side uid resolution needed | `page.tsx` |
| Backend scopes to caller's book | Drop the hardcoded "142 active mandates" subtitle; render `data.length` (or a fixed label like "Your book") instead | `page.tsx` |

### C. Additional findings

**Mock-overlay re-keying** — see Design Decision D-1. `client-detail/[id]/page.tsx` also switches its route param from a slug to the real `id`, and applies the same overlay-hash lookup for its non-DB fields (KYC docs, history, mandate/status/etc. stay exactly as synthesized today, just re-keyed).

### D. Summary of Frontend-layer changes

| # | Change | Required? | Effort |
|---|---|---|---|
| A-1 | Extract `lib/rm/client-search-fields.ts` config, shared by popover + client-side matcher | Yes — user req. | S |
| A-2 | Add `server/rm/index.ts` + `actions.ts` + `endpoints.ts` entry + `hooks/api/useClientBook.ts` + DTO mapper | Yes | S |
| A-3 / D-1 | Re-key mock overlay off real `id` via deterministic hash; drop `KNOWN_CLIENT_IDS` slug gating | Yes | S |
| A-4 | Debounce not needed (client-side filtering, D-3) | Accepted | — |
| A-5 | One-shot fetch + module-scope `Map<uid, ClientRow[]>` cache in `useClientBook` | Yes — user req. | XS |
| A-6 | Move `client-detail/[id]` → `client-info/[id]`; delete dead `rm.client-detail` PageId; fix 2 hardcoded nav pushes (D-6) | Yes — user req. | S |
| A-7 | Restructure detail page into Basic Info / Subscription Info groups (D-7) | Yes — user req. | S |

---

## Design decisions (settled)

- **D-1 — Mock-overlay re-keyed by deterministic hash, not by slug.** Non-DB fields (status, mandate, AUM, renewal, KYC, since, models, contact, title, email, clientId, cash/portfolio value) have no backend source yet and can't be hand-authored per real UUID as the roster grows. `lib/mock/rm-data.ts` keeps a small fixed rotation of canned overlay records (today's 8 entries, near-verbatim) and looks one up via `ROTATION[hashString(id) % ROTATION.length]` — deterministic per client for the session (the same client always shows the same mock status/renewal/etc.), with zero per-client authoring as new real clients appear. `KNOWN_CLIENT_IDS`-based gating in `openClient()` is dropped — any row returned by a live search is by construction a real client and is always openable. `client-detail/[id]/page.tsx` accepts the real `id` and applies the same hash for its overlay fields.
- **D-2 — No generic `Page[T]` or new dependency.** Both layers reuse the bespoke, single-purpose conventions already present (non-generic `ModelsListOut`-style envelope on the backend; no React Query/SWR/debounce library on the frontend, hand-rolled state matching `useAllocation.ts`) rather than introducing shared infrastructure that nothing else in the codebase yet justifies.
- **D-3 — Caching is one-shot full-list-per-session; a more elegant scheme is deferred.** The endpoint returns the caller's entire scoped book in a single response; the frontend caches it in a module-scope `Map<firebase_uid, ClientRow[]>` for the tab's lifetime, and every keystroke / filter change filters that array locally with the existing `matchClient` / `matchAdv` predicates. Rationale: the caller's visible set is bounded — an RM's own book is small, and even the firm-wide roster ADMIN sees under D-4 is modest at current scale ("142 active mandates" today) — and the browser filters low hundreds of rows in well under a frame — introducing anchor-based narrowing, "biggest filter" masking (the user's original idea in the spec), or a server-side filter API adds surface area none of the current numbers justify. The user explicitly flagged this as a placeholder ("we shall explore a more elegant one later"); reintroducing server-side filtering + a smarter cache is owned by a follow-up proposal that will fire once real per-RM books grow past what a browser filters comfortably or once cross-RM roster search (§3 Non-Goals) is added.
- **D-4 — Client visibility is role-scoped: RM sees their own book; ADMIN sees every client. COMPLIANCE is explicitly excluded from this round.** The endpoint's `WHERE` clause is conditional on the caller's `AdminRole`: RM gets `assigned_rm_uid = current_user.firebase_uid`; ADMIN gets no filter at all. Rationale: the "Assigned RM" column is the right ownership signal for an RM's own working set, but ADMIN is an oversight role by definition — an Admin resolving an operational issue needs the whole roster, not a role-holder's personal book. This was originally drafted to also cover COMPLIANCE, but that grant was reverted at the user's request — COMPLIANCE keeps its current zero granted actions and this endpoint 403s it exactly as it does today, pending a future decision. Consequences flowing from ADMIN's grant: no per-RM scoping toggle in the UI (the role determines it, not a user choice), the "142 active mandates" subtitle in the header becomes stale for everyone and must be dropped or replaced with a role-aware count (Layer 2 §B) — an RM's count is their own book, an ADMIN's count is the firm-wide roster — and D-3's "one-shot full-list-per-session" caching now caches the *entire* roster for ADMIN sessions, not just one RM's book (still small enough at current scale — see D-3 — but the ceiling arrives sooner for ADMIN and is the first thing to revisit if this ever needs to scale).
- **D-5 — A sibling `GET /api/rm/clients/{id}` endpoint backs the detail page.** Rationale: once ids are real UUIDs, a hard refresh / shared link on `/rm/client-info/<uuid>` has nothing in memory to render from. Two alternatives were considered — overloading the list endpoint with a `q=<uuid>` filter (ugly, and `id` isn't in the list endpoint's contract), or passing the row through Next.js router state (breaks on refresh, still needs a cold-load fallback). The sibling endpoint is the smallest amount of additional surface that keeps the contract clean: same DTO shape as a list item, same auth guard, same role-based scope as the list endpoint (D-4) (for an RM, a 404 covers both "not found" and "not yours" without leaking existence; for ADMIN a 404 means the client genuinely doesn't exist). The frontend's `useClient(id)` hook (Layer 2 A-2) reads from `useClientBook`'s cache first so in-app navigation from the list page is still zero-network; the sibling endpoint only fires on cold entry.
- **D-6 — Client detail becomes a sub-route of Client Book: `/rm/client-info/[id]`, not `/rm/client-detail/[id]`.** The two pages are one workspace (list + drill-down), not two independent destinations — confirmed by the original design prototype, which never gave "Client Detail" its own route at all (App.jsx swapped it in as a conditional render, not a navigation). This proposal's own D-5 already needed a real, addressable detail URL for cold-load/deep-link support; nesting it under `client-info` costs nothing extra (Next.js App Router supports a segment having both its own `page.tsx` and a `[id]/page.tsx` child) and removes a redundant `rm.client-detail` PageId from `pages-config.ts` — `rolesForPath`'s existing prefix-match rule already covers the sub-path once it's nested, so deleting that PageId is a pure simplification, not a new access decision. **Sequencing:** this move (A-6) is a pure file/route/link change with no data-source change, and must land **before** A-2/A-5's live-data wiring reaches the detail page — the user was explicit that the "discrepant routes" get fixed first, so the units are ordered/scheduled accordingly (see Execution & Verification and the Frontend execution schedule).
- **D-7 — The detail page's "Client Information" card is restructured into Basic Info / Subscription Info, with two explicit scope limits.** (1) "ID Info" renders a blank placeholder — this proposal does not invent a client-ID scheme, and the old mock `clientId` was already inconsistent with real UUIDs. (2) "Assigned RM" shows only the resolved name already in the wire contract — no RM phone/email is added; that would require a new DTO field, out of scope here. "Subscribed Models" keeps its current mock data source, just regrouped under "Subscription Info" next to the real `ib_account` field instead of standing alone. The old "Primary Contact" (mock `contact`+`title`) field is dropped in favor of the real `authorized_person` — a judgment call flagged explicitly (A-7) rather than silently made.

---

## Execution & verification

1. **Backend phase** — implement `app/libs/clients/{schemas,repository,service,router}.py`, mount in `app/main.py`. No change to `app/libs/auth/actions.py` is needed — RM and ADMIN already have `Action.CLIENT_VIEW`. Verify against ≥2 seeded `client_profiles` rows assigned to different RMs: `GET /api/rm/clients` (authenticated as one row's assigned RM) returns only that row; the same call authenticated as the *other* RM returns only the other row; the same call authenticated as ADMIN returns **both** rows; `GET /api/rm/clients/{id}` returns the row for its assigned RM and for ADMIN, and `404`s for a different RM; `require_action(Action.CLIENT_VIEW)` `403`s a caller with no granted actions (e.g. MOBO or COMPLIANCE) on both routes.
2. **Frontend phase — route consolidation (A-6, runs FIRST, before any live-data wiring)** — move `client-detail/[id]/page.tsx` → `client-info/[id]/page.tsx` (still reading mock data at this point — no behavior change beyond location); update the two hardcoded `/rm/client-detail/${id}` pushes (`client-info/page.tsx`, `OnboardingBoard.tsx`); delete the `rm.client-detail` PageId from `pages-config.ts`; update `pages.check.ts`'s assertions. Verify: `/rm/client-detail/<any-id>` 404s (route no longer exists); `/rm/client-info/<mock-slug-id>` renders the same detail page content as the old route did, byte-for-byte; both nav-push call sites land on the new path; `npx tsx admin-frontend/lib/pages.check.ts` passes.
3. **Frontend phase — live-data wiring** — implement `lib/rm/client-search-fields.ts`, the `server/rm` + `actions.ts` + `hooks/api/{useClientBook,useClient}.ts` chain, and swap `page.tsx`'s `RM_CLIENTS`/`matchClient`/`matchAdv` usage for `useClientBook`; wire the (already-relocated) `client-info/[id]/page.tsx` to `useClient`. Verify: the Client Book renders identically (same markup/classes) with live data; both empty states ("look up a client" / "no matching client") still fire correctly for the live path; typing a query and adding advanced-filter chips both remain fully client-side (no network tab entries after the initial fetch); navigating between the list and the detail page also fires no network calls (cache hit); a hard refresh on `/rm/client-info/<uuid>` triggers exactly one `GET /api/rm/clients/{id}` and renders correctly.
4. **Frontend phase — explicit field presentation (A-7)** — restructure `client-info/[id]/page.tsx`'s "Client Information" card into Basic Info / Subscription Info per D-7. Verify: all 9 Basic Info fields render (with "ID Info" always blank); Subscription Info shows `ib_account` + the (still-mock) Subscribed Models table; no field that was visible before this phase (KYC checklist, history, account balance) regresses.
5. **Overlay phase** — re-key `lib/mock/rm-data.ts` per D-1, drop `KNOWN_CLIENT_IDS` gating. Verify: opening any row from a live Client Book successfully loads the detail sub-page with a stable (same-id-same-overlay) mock profile for the fields still coming from the overlay.

**Human gate:** none strictly required — this is additive on both layers with no DB migration. A manual smoke test against a seeded `client_profiles` row (as both the assigned RM and as a different RM) is recommended before merge, since this is the first time any RM page talks to the real backend.

---

## Rollback

Fully additive on both layers (new backend module, new frontend files; `page.tsx` and `lib/mock/rm-data.ts` are edited but not restructured beyond the re-keying). Reverting the branch removes both new endpoints and restores the mock-only Client Book from before this proposal. No `alembic downgrade` needed — no DB layer is touched.
