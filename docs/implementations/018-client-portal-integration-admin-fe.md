# 018 — Client Portal ↔ Backend Integration · Implementation Details — Frontend (admin-frontend)

> **Deviation note:** the template's unit-ID convention only defines `DB-`/`BE-`/`FE-` because it assumes one frontend per proposal. This proposal has two, so work units in this doc are prefixed `ADM-` (admin-frontend) instead of `FE-`, keeping IDs globally unique against the sibling client-frontend doc's `FE-*` IDs. Everything else about the convention is unchanged.

> Status: **DRAFT — pending implementation.**
> Implements: proposal `docs/proposals/018-2026-07-28-client-portal-integration.md` § Layer 4 — Frontend (admin-frontend, RM inbox), § 4 (seam), § Design decisions D-4, § Execution & verification (step 3), § Rollback.
> Layer: Frontend (admin-frontend) — one layer per file.
> Sibling layer docs: `docs/implementations/018-client-portal-integration-db.md` (Database), `docs/implementations/018-client-portal-integration-be.md` (Backend), `docs/implementations/018-client-portal-integration-fe.md` (Frontend — client-frontend; owns the raise-ticket flow that is the other end of this layer's inbox).
> Execution schedule: `docs/execution-schedules/018-client-portal-integration-admin-fe.md`
> Branch: `client-portal-integration-admin-fe` — cut from parent `client-portal-integration` (confirmed current branch), merged back into it; human owns the merge to `main`.
> Builds on / prerequisites: this layer builds against the Backend layer's §4/§7 seam (the DTOs and routes below), **not** against the Backend layer's actual implementation. Precondition: Backend layer's `/api/rm/tickets*` routes are deployed/reachable at the configured API base, matching §7 exactly. `<TODO: Backend layer's PR/branch merged>`. DB layer's migration (B-1) must also be applied wherever the backend is running against — a Backend-layer concern, not something verified directly in this layer. This layer does **not** touch `models.model_limit` or any PC model-management surface — per the proposal's Non-Goals, that attribute has no authoring path anywhere, on either frontend.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/018-2026-07-28-client-portal-integration.md` § Layer 4 — Frontend (admin-frontend, RM inbox), § 4, § Design decisions D-4 |
| Execution schedule | `docs/execution-schedules/018-client-portal-integration-admin-fe.md` |
| Sibling layer impl docs | `docs/implementations/018-client-portal-integration-db.md`, `docs/implementations/018-client-portal-integration-be.md`, `docs/implementations/018-client-portal-integration-fe.md` |
| Builds on | Backend layer's §4.1 wire contract (`/api/rm/tickets*` routes, `RmTicketDTO`), reproduced verbatim in §7 below; DB layer's migration (indirectly, via the Backend layer) |

**Scope reminder (from the proposal's Layer 4 scope note, restated here so a reader of this doc alone has it):** this layer covers exactly one thing — the RM ticket inbox (ADM-1 through ADM-3, plus the dashboard-count cleanup in ADM-5). It has **zero work for the client renewal-upload feature** (D-4: the client writes the same `onboarding_documents` row the RM board already reads, so nothing here needs wiring) and **zero work for `models.model_limit`** — per the proposal's Non-Goals, that attribute has no authoring path anywhere, and this layer must not add an `EditModelForm`/`ModelDetailPanel`/`lib/pc/types.ts` field for it. It adds **no new admin-frontend surface** beyond the one named item — no new page, no new role, no new nav entry. (Unit ID `ADM-4` is retired, not reused — it belonged to the now-removed PC model-form field.)

---

## 2. Branch & session contract

- **Branch:** `client-portal-integration-admin-fe` — all ADM-* units in this doc land on this one branch.
  - Cut from `client-portal-integration` (parent, captured at session start via `git rev-parse --abbrev-ref HEAD`); merges back into it. The human owns that merge.
- **Isolation:** implementable in its own session, in parallel with the DB, Backend, and client-frontend sessions, provided the preconditions below hold. Shares state with other layers only through §7.
- **Preconditions:**
  - [ ] Backend layer's `/api/rm/tickets`, `/api/rm/tickets/{ref}`, `/api/rm/tickets/{ref}/status` routes are reachable at `NEXT_PUBLIC_API_BASE_URL` and match §7.1 exactly (status codes included).
  - [ ] The frozen seam in the proposal's §4 is agreed (it is — this doc's §7 is copied from it verbatim).
- **Read-first inventory** (every existing file a unit touches):
  - `admin-frontend/components/rm/RequestTickets.tsx` — the inbox, detail, and both action panels; currently reads `TICKET_QUEUE`/`SUB_CLIENTS` from the mock file.
  - `admin-frontend/app/(roles)/rm/requests/page.tsx`, `app/(roles)/rm/requests/[ref]/page.tsx` — the two routes that render the above.
  - `admin-frontend/lib/mock/rm-data.ts` — specifically the `RequestTicket` type, `TICKET_QUEUE`, `REQUEST_TICKETS`, `isOpenTicket` (all four deleted in ADM-5); the rest of the file (`RM_CLIENTS`, `SUB_CLIENTS`, `getMockOverlay`, etc.) belongs to other tracks and is untouched.
  - `admin-frontend/app/(roles)/rm/client-info/page.tsx` — the only other consumer of `REQUEST_TICKETS` (the "Requests Tickets" rail card, `ticketsTotal` count).
  - `admin-frontend/server/rm/index.ts`, `server/api-client.ts`, `server/endpoints.ts` — the established server-only fetch layer this layer's new server functions extend.
  - `admin-frontend/lib/rm/clients.ts` — the sibling DTO+mapper file pattern this layer's new `lib/rm/tickets.ts` follows.
  - `admin-frontend/hooks/api/useReconciliationFlow.ts`, `hooks/api/useModels.ts` — the established client hook shape (Server Action → `"use client"` hook with `useState`/`useEffect`/`useCallback`/`useRef` in-flight guard/`refetch`) this layer's `useRmTickets` hook matches.
- **Hand-off / exit signal:** all ADM-* units committed; `rg "TICKET_QUEUE|REQUEST_TICKETS|isOpenTicket"` under `admin-frontend/` returns nothing outside a deleted mock file's git history; `npm run lint`, `tsc --noEmit`, `npm run test`, `npm run build` all green; PR opened against `client-portal-integration`.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions

- **The real established data-access shape in admin-frontend is Server Actions, not a direct client-side `fetch`** — this differs from client-frontend's `useX()` → `useEffect` + `getIdToken()` + `fetch` pattern (`client-frontend/lib/hooks/useSubscriptions.ts`), and this layer follows admin-frontend's own real convention rather than importing the client-frontend shape wholesale, per the codebase's existing precedent (`hooks/api/useModels.ts`, `hooks/api/useReconciliationFlow.ts`):
  1. **`server/rm/index.ts`** (server-only, `import "server-only"` transitively via `server/api-client.ts`) — one `apiClient<T>(ENDPOINTS.RM.X)` call per route. The auth token is never touched by hand here; `server/api-client.ts` reads it from the `id_token` cookie (`lib/id-token.ts` writes it on sign-in) via `cookies()`.
  2. **`app/(roles)/rm/requests/actions.ts`** (new file, `"use server"`) — thin try/catch + `logger` wrapper around the `server/rm` functions, returning `APIResult<T>` (`{success:true,data}` | `{success:false,error,code}`), matching every sibling `actions.ts` (`pc/model-management/actions.ts`, `mobo/trade-reconciliation/actions.ts`, `rm/client-info/actions.ts`).
  3. **`hooks/api/useRmTickets.ts`** (new file, `"use client"`) — `useState` for `data`/`loading`/`error`, a `useCallback` fetch function guarded by a `useRef` in-flight flag (prevents overlapping calls), a `useEffect` that calls it once, and an exposed `refetch`. This is the exact shape of `useReconciliationFlow`/`useModels` — no new hook shape is introduced.
- **DTO + mapper file:** one `lib/rm/tickets.ts` holding the raw `RmTicketDTO` (snake_case, matches the wire) plus a `mapDtoToRequestTicket` function that reshapes it into the **existing** `RequestTicket` view type `RequestTickets.tsx` already renders — mirrors `lib/rm/clients.ts` (`ClientListItemDTO` → `ClientRow`) and `lib/pc/models.ts` (`ModelDTO` → `Model`). Components are never handed a raw DTO to destructure inline.
- **Endpoints:** new paths are added to the existing `ENDPOINTS.RM` object in `server/endpoints.ts`, not inlined as string literals in `server/rm/index.ts`.
- **Money/formatting:** `RmTicketDTO`'s `amount`/`multiplier`/`notional` are numbers; the mapper formats them into the display strings (`cash`, `mult`, `notional` as already-formatted strings) `RequestTickets.tsx` expects, since that component was built against pre-formatted mock strings and this layer does not restructure its JSX (no design/layout change, per the proposal's standing constraint).
- **Status → chip tone:** `TicketStatus` (`new`/`in_progress`/`replied`/`closed`/`declined`) maps to the existing `ChipTone` values the mock data already used for equivalent display statuses (`New`→`warm`, `In Progress`→`review`, `Replied`→`active`, `Closed`→`neutral`, `Declined`→`overdue`) — the same tones `TICKET_QUEUE`'s commented-out rows already encoded, so no new tone is invented.
- **`null` rendering:** any DTO field typed `T | None` on the wire renders the existing `"—"` placeholder `RequestTickets.tsx` already uses for absent `model`/`account`/`subject`.
- **Component structure:** no unit in this layer changes page composition, spacing, or the component tree of `RequestTickets.tsx` or its detail page — only data bindings.

### 3.2 CI/CD & engineering discipline

- **Trunk-friendly, small units.** Each ADM-* unit is its own commit; the branch stays green after every commit.
- **Every unit is independently revertible.** ADM-5's dashboard-count rebind must land no earlier than ADM-1 (it consumes the same `useRmTickets` data), but reverting ADM-5 alone does not break ADM-1..ADM-3.
- **Additive-first ordering:** ADM-1 introduces the new data layer and rebinds the inbox in the same commit that removes its `TICKET_QUEUE` import; the mock *symbols* (`TICKET_QUEUE`, `REQUEST_TICKETS`, `isOpenTicket`, `RequestTicket` type) are the one contraction step, scheduled last (ADM-5), once every other consumer has moved off them.
- **Gates before merge** (this layer, run from `admin-frontend/`):
  ```bash
  npm run lint            # next lint
  npx tsc --noEmit         # type-check (no dedicated script; project has no separate "type-check" script)
  npm run test             # vitest run
  npm run build            # next build
  ```
  Confirmed present: `admin-frontend/package.json` has `"lint": "next lint"`, `"test": "vitest run"`, `"build": "next build"`, and a `admin-frontend/vitest.config.ts` (jsdom, `@vitejs/plugin-react`, `@/` alias) — a real, independently-verified config, not assumed identical to client-frontend's (checked separately; it happens to be the same shape here, but that was confirmed, not presumed).
- **No secrets, no manual steps in the merge path.** The only human gate this layer participates in is the proposal's step-3 visual-confirmation gate (scheduling metadata, not a unit here).
- **Reversibility:** every unit is a pure frontend change with no persisted state of its own (see §9).

---

## 4. Architecture

**Target layout:**
```
admin-frontend/
  server/
    rm/index.ts                          # MODIFIED — ADM-1..ADM-3 (add getTickets/getTicket/setTicketStatus)
    endpoints.ts                          # MODIFIED — ADM-1 (add ENDPOINTS.RM.TICKETS*)
  app/(roles)/rm/
    requests/
      actions.ts                           # NEW — ADM-1..ADM-3
      page.tsx                              # MODIFIED — ADM-1 (no data-shape change, same component)
      [ref]/page.tsx                         # MODIFIED — ADM-2
    client-info/page.tsx                     # MODIFIED — ADM-5 (REQUEST_TICKETS -> useRmTickets counts)
  hooks/api/
    useRmTickets.ts                          # NEW — ADM-1
  lib/rm/
    tickets.ts                                # NEW — ADM-1 (RmTicketDTO + mapper)
  components/rm/
    RequestTickets.tsx                         # MODIFIED — ADM-1, ADM-2, ADM-3
  lib/mock/rm-data.ts                          # MODIFIED — ADM-5 (delete TICKET_QUEUE, REQUEST_TICKETS, isOpenTicket, RequestTicket)
```

`admin-frontend/lib/pc/*` and `admin-frontend/components/pc/model-management/*` are **untouched** by this layer — no file in them is listed above, and none should be, per the proposal's Non-Goals (no `model_limit` authoring anywhere).

**Dependency direction:** `page.tsx → component → hook → "use server" action → server/rm (apiClient) → Backend`. `lib/rm/tickets.ts` (DTO + mapper) sits between the server layer and the hook, imported by both; it never imports a component or a hook.

**External seams:** consumes `GET /api/rm/tickets`, `GET /api/rm/tickets/{ref}`, `POST /api/rm/tickets/{ref}/status`, all per §7.1. Consumes no `/api/client/*` route — that surface belongs entirely to the client-frontend layer. Consumes no PC model route or field — `model_limit` is out of scope for this layer (Non-Goals).

---

## 5. Modules

### 5.1 `server/rm` + `lib/rm/tickets.ts` — ticket data-access layer
- **Responsibility:** typed server-only fetch + DTO + mapper for the three ticket routes.
- **Files:** `server/rm/index.ts` (extended), `server/endpoints.ts` (extended), `lib/rm/tickets.ts` (new).
- **Public surface:** `getTickets()`, `getTicket(ref)`, `setTicketStatus(ref, req)` (server-only); `RmTicketDTO`, `mapDtoToRequestTicket`.
- **Owns features:** ADM-1, ADM-2, ADM-3.

### 5.2 `app/(roles)/rm/requests/actions.ts` + `hooks/api/useRmTickets.ts` — client-facing data layer
- **Responsibility:** bridge the server-only layer to `"use client"` components via the established Server Action + hook pattern.
- **Files:** `app/(roles)/rm/requests/actions.ts` (new), `hooks/api/useRmTickets.ts` (new).
- **Public surface:** `useRmTickets(): { data, loading, error, refetch }`; `useRmTicket(ref)`; `setStatus(ref, req)` action.
- **Owns features:** ADM-1, ADM-2, ADM-3.

### 5.3 RM ticket UI
- **Responsibility:** inbox, status strip, detail page, action panels — component tree unchanged, data source swapped.
- **Files:** `components/rm/RequestTickets.tsx`, `app/(roles)/rm/requests/page.tsx`, `app/(roles)/rm/requests/[ref]/page.tsx`, `app/(roles)/rm/client-info/page.tsx` (counts only).
- **Owns features:** ADM-1, ADM-2, ADM-3, ADM-5.

### 5.4 Cleanup
- **Responsibility:** delete the mock ticket data once nothing imports it.
- **Files:** `lib/mock/rm-data.ts`.
- **Owns features:** ADM-5.

---

## 6. Features

### ADM-1 — Inbox reads the real ticket feed (Yes — user req.)

- **Proposal ref:** § Layer 4 A-1
- **Module:** 5.1, 5.2, 5.3
- **Files:** `create: lib/rm/tickets.ts`, `create: hooks/api/useRmTickets.ts`, `create: app/(roles)/rm/requests/actions.ts`, `modify: server/rm/index.ts`, `modify: server/endpoints.ts`, `modify: components/rm/RequestTickets.tsx`
- **Dependencies:** none — parallel-safe with everything else in this doc; ADM-2/ADM-3/ADM-5 build on this unit.

**Contract:**

```ts
// server/endpoints.ts — added under RM
RM: {
  // ...existing entries unchanged...
  TICKETS:        `${RM}/tickets`,
  TICKET:         (ref: string) => `${RM}/tickets/${encodeURIComponent(ref)}`,
  TICKET_STATUS:  (ref: string) => `${RM}/tickets/${encodeURIComponent(ref)}/status`,
}
```

```ts
// lib/rm/tickets.ts
export type TicketKind = "allotment" | "redemption" | "other";
export type TicketStatus = "new" | "in_progress" | "replied" | "closed" | "declined";

export interface RmTicketDTO {
  ref: string;
  client_id: string;
  client: string;
  contact: string | null;
  email: string | null;
  account: string | null;
  model: string | null;
  kind: TicketKind;
  currency: string;
  amount: number | null;
  multiplier: number | null;
  notional: number | null;
  subject: string | null;
  message: string;
  status: TicketStatus;
  created_at: string;
  responded_by: string | null;
  responded_at: string | null;
  response_note: string | null;
}

const KIND_LABEL: Record<TicketKind, "Allotment" | "Redemption" | "Other"> = {
  allotment: "Allotment", redemption: "Redemption", other: "Other",
};
const STATUS_LABEL: Record<TicketStatus, string> = {
  new: "New", in_progress: "In Progress", replied: "Replied", closed: "Closed", declined: "Declined",
};
const STATUS_TONE: Record<TicketStatus, import("@/components/ui/Chip").ChipTone> = {
  new: "warm", in_progress: "review", replied: "active", closed: "neutral", declined: "overdue",
};

/** Reshapes the wire DTO into the existing `RequestTicket` view type
 *  RequestTickets.tsx already renders — no component-side destructuring
 *  of a raw DTO, matching lib/rm/clients.ts's / lib/pc/models.ts's mapper pattern. */
export function mapDtoToRequestTicket(dto: RmTicketDTO): import("@/lib/mock/rm-data").RequestTicket;
```

```ts
// server/rm/index.ts — added
export async function getTickets(): Promise<APIResult<RmTicketDTO[]>> {
  return apiClient<RmTicketDTO[]>(ENDPOINTS.RM.TICKETS);
}
export async function getTicket(ref: string): Promise<APIResult<RmTicketDTO>> {
  return apiClient<RmTicketDTO>(ENDPOINTS.RM.TICKET(ref));
}
export async function setTicketStatus(
  ref: string, body: { status: TicketStatus; note?: string },
): Promise<APIResult<RmTicketDTO>> {
  return apiClient<RmTicketDTO>(ENDPOINTS.RM.TICKET_STATUS(ref), { method: "POST", body: JSON.stringify(body) });
}
```

```ts
// app/(roles)/rm/requests/actions.ts — "use server", try/catch + logger, mirrors
// app/(roles)/pc/model-management/actions.ts's shape exactly
export async function getTickets(): Promise<APIResult<RmTicketDTO[]>>;
export async function getTicket(ref: string): Promise<APIResult<RmTicketDTO>>;
export async function setTicketStatus(ref: string, body: { status: TicketStatus; note?: string }): Promise<APIResult<RmTicketDTO>>;
```

```ts
// hooks/api/useRmTickets.ts — "use client", same shape as useReconciliationFlow/useModels
export interface UseRmTicketsResult {
  data: RequestTicket[] | null; loading: boolean; error: string | null; refetch: () => void;
}
export function useRmTickets(): UseRmTicketsResult;
```

**Behavior / invariants:** `RequestTicketsInbox` (in `RequestTickets.tsx`) replaces its `TICKET_QUEUE` import with `useRmTickets().data ?? []`; the status-strip counts (`New`/`In Progress`/`Closed`) and the filter-pill counts (`Allotment`/`Redemption`/`Other`) are computed the same way as today but over the hook's data, not the mock array. `isClosed()`'s semantics (`status === "Closed" || status === "Declined" || status === "Replied"`) are unchanged — the 5-value status set already covers exactly these cases via `STATUS_LABEL`. `SUB_CLIENTS` import (used only by `resolveActTarget`, unrelated to this proposal) is left untouched.

**Done when:** the inbox renders from `useRmTickets()` with zero references to `TICKET_QUEUE`; loading/error states render sensibly (existing empty-state pattern, not a blank table); the 3 status-strip counts and 4 filter-pill counts match the underlying data exactly.

---

### ADM-2 — Detail page resolves from the real endpoint (Yes)

- **Proposal ref:** § Layer 4 A-2
- **Module:** 5.1, 5.2, 5.3
- **Files:** `modify: app/(roles)/rm/requests/[ref]/page.tsx`, `modify: hooks/api/useRmTickets.ts` (add a single-ticket variant)
- **Dependencies:** ADM-1

**Contract:**

```ts
// hooks/api/useRmTickets.ts — added alongside useRmTickets
export function useRmTicket(ref: string): { data: RequestTicket | null; loading: boolean; error: string | null };
```

```tsx
// app/(roles)/rm/requests/[ref]/page.tsx
export default function RequestTicketDetailPage() {
  const { ref } = useParams<{ ref: string }>();
  const { data: ticket, loading, error } = useRmTicket(ref);
  if (!loading && !ticket && !error) notFound();          // 404 case, same as today
  if (loading) return <DetailSkeleton />;                   // existing RM-page skeleton pattern
  if (error || !ticket) return <ErrorState message={error ?? "Not found"} />;
  return <div className="mx-auto"><RequestTicketDetail ticket={ticket} /></div>;
}
```

**Behavior / invariants:** a `404` from `GET /api/rm/tickets/{ref}` maps to `notFound()`, matching today's `TICKET_QUEUE.find(...) ?? notFound()` behavior exactly. The loading state uses the same skeleton pattern already established by sibling RM pages (e.g. `rm/client-info/[id]/page.tsx`) rather than inventing a new one.

**Done when:** navigating to `/rm/requests/{ref}` for a real ref renders `RequestTicketDetail`; an unknown ref 404s; a slow response shows the existing skeleton, not a blank page.

---

### ADM-3 — Reply / Decline / In-Progress wired to the status endpoint (Yes — user req.)

- **Proposal ref:** § Layer 4 A-3
- **Module:** 5.1, 5.2, 5.3
- **Files:** `modify: components/rm/RequestTickets.tsx` (`ActOnTradePanel`, `ReplyPanel`)
- **Dependencies:** ADM-1, ADM-2

**Contract:**

```ts
// RmTicketStatusReq — from the seam (§7.1), constructed inline at each call site:
interface RmTicketStatusReq { status: TicketStatus; note?: string; }
```

```tsx
// ActOnTradePanel — "Decline request" button
async function handleDecline() {
  const result = await setTicketStatus(ticket.ref, { status: "declined", note: reason ?? undefined });
  if (result.success) refetchDetail();
  else setInlineError(result.error);       // surfaces the 409 (terminal-status) case inline
}

// ReplyPanel — "Send email" button
async function handleSendReply() {
  const result = await setTicketStatus(ticket.ref, { status: "replied", note: replyBody });
  if (result.success) refetchDetail();
  else setInlineError(result.error);
}

// Inbox row click / "Act on Request" open still routes to /rm/model-subscription unchanged
// (resolveActTarget is unrelated to this proposal); the ONE new implicit transition this
// unit adds is the inbox's "start work" action sending {status: "in_progress"} — wired to
// whichever existing control currently has no handler (per the proposal, RequestTickets.tsx
// today ships the button disabled-when-closed with no submit path).
```

**Behavior / invariants:** Decline sends `{status: "declined", note}`; Reply sends `{status: "replied", note}`; the in-progress transition sends `{status: "in_progress"}` with no note. On success, the detail page refetches (`useRmTicket`'s hook exposes the same `refetch` shape as `useRmTickets`). A `409` (attempting a transition out of a terminal status — `closed`/`declined`) surfaces inline via the existing error-rendering convention on the panel, not a toast or an unhandled rejection; the button itself stays enabled (the seam does not require the FE to pre-block based on status — the Backend's 409 is the actual guard, matching Backend C-11's "rejects a transition out of a terminal status" being server-enforced).

**Done when:** Reply, Decline, and the in-progress action each POST the correct `RmTicketStatusReq` and refetch on success; a `409` from any of the three renders inline without crashing or silently no-opping.

---

### ADM-5 — Dashboard "Open Requests" counts + mock deletion (Yes)

- **Proposal ref:** § Layer 4 A-4 (proposal's A-4 — the finding was renumbered from A-5 when the PC-model-limit finding, formerly A-4, was removed; this doc keeps unit ID `ADM-5` unchanged, per the "retire, don't renumber" note at §1)
- **Module:** 5.3, 5.4
- **Files:** `modify: app/(roles)/rm/client-info/page.tsx`, `modify: lib/mock/rm-data.ts` (delete `TICKET_QUEUE`, `REQUEST_TICKETS`, `isOpenTicket`, `RequestTicket` type only)
- **Dependencies:** ADM-1 through ADM-3 (every consumer of the mock ticket symbols must have moved off them first).

**Contract:**

```tsx
// app/(roles)/rm/client-info/page.tsx — before: REQUEST_TICKETS (CountItem[]) from the mock file.
// after: derived from the same useRmTickets() data ADM-1 introduced.
const { data: tickets } = useRmTickets();
const openTickets = (tickets ?? []).filter((t) => !isTerminal(t.status)); // "New"/"In Progress" only
const ticketCounts: CountItem[] = [
  { id: "allotment",  c: "Allotment",  n: openTickets.filter((t) => t.type === "Allotment").length,  t: "primary" },
  { id: "redemption", c: "Redemption", n: openTickets.filter((t) => t.type === "Redemption").length, t: "primary" },
  { id: "others",     c: "Others",     n: openTickets.filter((t) => t.type === "Other").length,      t: "muted"   },
];
const ticketsTotal = ticketCounts.reduce((sum, i) => sum + i.n, 0);
```

```ts
// lib/mock/rm-data.ts — deleted: TICKET_QUEUE, REQUEST_TICKETS, isOpenTicket, `export type RequestTicket`.
// KEPT, unrelated to this proposal: RM_CLIENTS, CLIENT_EXTRA, SUB_CLIENTS, MODEL_SIZES,
// OB_MODEL_CATALOG, getMockOverlay, and everything else in the file.
```

**Behavior / invariants:** `isTerminal` reuses the same 3-terminal-status semantics as `RequestTickets.tsx`'s `isClosed` (`closed`/`declined`/`replied`) so "open" means the same thing in both places — no second definition of "open" is introduced. `RequestTicket` (the view type) itself is **not** deleted from the codebase — it moves to `lib/rm/tickets.ts` as the mapper's output type (ADM-1); only its *definition inside the mock file*, plus the three mock-data symbols named above, are removed here. `SUB_CLIENTS`, `RM_CLIENTS`, and the rest of `lib/mock/rm-data.ts` are explicitly out of scope — they belong to other, unrelated tracks and this unit must not touch them.

**Done when:** the "Requests Tickets" rail card on `rm/client-info/page.tsx` renders live counts from `useRmTickets()`; `rg "TICKET_QUEUE|REQUEST_TICKETS|isOpenTicket"` under `admin-frontend/` returns zero matches; `lib/mock/rm-data.ts` still exports `RM_CLIENTS`/`SUB_CLIENTS`/`getMockOverlay` unchanged.

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

- **What this layer contributes to the seam:** consumes `RmTicketDTO` and the three `/api/rm/tickets*` routes only, per the "Frontend (admin)" row of §7.1's obligations table — `RequestTickets.tsx` and its detail page render `RmTicketDTO` verbatim (via the `mapDtoToRequestTicket` reshape into the existing view type), and its status actions POST `RmTicketStatusReq` exactly as specified. This layer also contributes the one `model_limit` field on the PC model form/detail panel, consuming `ModelOut.model_limit`/emitting it on `ModelUpdate` per Backend C-15. This layer contributes nothing to `/api/client/*` — that surface belongs entirely to the client-frontend layer, and no client-renewal-upload wiring exists here at all (D-4).
- **What this layer assumes from the other side:** the Backend layer enforces RM scoping on every `/rm/tickets*` route (`assigned_rm_uid == caller.firebase_uid`, `ADMIN` bypasses) so this layer never needs its own client-side filter; `ref` is URL-safe and stable so it can be used directly in a Next.js dynatic route param and in `ENDPOINTS.RM.TICKET(ref)`; money crosses the wire as a JSON number, never a pre-formatted string; a `409` on `POST .../status` is the actual enforcement of "no transition out of a terminal status" — this layer's UI does not need to independently derive which transitions are legal.
- **Change protocol:** any edit to §7 requires editing the proposal's §4 first; this section is then re-copied verbatim. Never edited in isolation from the proposal.

---

## 8. Internal unit testing

### 8.1 Test setup

- **Framework / runner:** vitest — command: `npm run test` (= `vitest run`), run from `admin-frontend/`.
- **Fixtures / seed:** the Server Action layer (`app/(roles)/rm/requests/actions.ts`) is mocked with `vi.mock(...)` returning canned `APIResult<RmTicketDTO[]>`/`APIResult<RmTicketDTO>` shapes per §7.1 — hooks and components are tested against the mocked action, never a real `fetch` or a real cookie-backed `apiClient` (that boundary is exactly where the seam mock sits, matching the established pattern in `tests/hooks/api/FE-3.use-reconciliation-flow.test.tsx` and `tests/app/(roles)/mobo/trade-reconciliation/FE-2.actions.test.ts`).
- **Isolation:** hermetic — no real network call, no real Next.js `cookies()`; safe to run in parallel.
- **Layer isolation:** tests import only from `admin-frontend`'s own code plus test doubles for the seam (§7) — never a real Backend response, never client-frontend code.
- **Test location:** `admin-frontend/tests/`, mirroring source path (e.g. `tests/hooks/api/ADM-1.use-rm-tickets.test.tsx`, `tests/app/(roles)/rm/requests/ADM-3.actions.test.ts`), matching the existing `FE-*` test-file naming precedent already in this repo's `tests/` tree (this layer's own units use the `ADM-` prefix per this doc's header note).
- **Commit policy:** `tests/` is git-ignored; tests are generated locally by `test-gen` and run as a pre-hand-off gate, never committed.
- **Code generation:** `test-gen` (arg `lite`/`standard`/`thorough`) writes concrete vitest files from §8.2/§8.3 below.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| ADM-1 | Inbox renders from `useRmTickets()`; status-strip and filter-pill counts match data; mapper reshapes `RmTicketDTO` → `RequestTicket` correctly incl. all 5 statuses' tones | `RmTicketDTO[]` (all 5 statuses, all 3 kinds, incl. `null` `model`/`account`/`subject`) |
| ADM-2 | Detail page resolves a known ref; unknown ref → `notFound()`; loading shows skeleton | `RmTicketDTO`, a 404 `APIResult` |
| ADM-3 | Decline/Reply/in-progress each POST the correct `RmTicketStatusReq`; a 409 renders inline without crashing | `APIResult<RmTicketDTO>` success + a `success:false` 409-shaped result |
| ADM-5 | Dashboard counts derive from `useRmTickets()`; mock symbols fully removed; `lib/mock/rm-data.ts`'s unrelated exports untouched; static check confirms no `model_limit` reference exists anywhere under `admin-frontend/` | `RmTicketDTO[]` |

### 8.3 Test goals (per unit)

#### ADM-1
- **Positive:** with a mixed-status, mixed-kind `RmTicketDTO[]`, the inbox table row count, status-strip counts, and filter-pill counts are all internally consistent (strip totals sum to `data.length`; pill totals sum to `data.length`).
- **Negative:** a `success:false` result renders the existing empty/error treatment, not a thrown error.
- **Invariants:** every `TicketStatus` value maps to exactly one `ChipTone`, and that mapping matches the tones the mock data previously encoded (`new`→`warm`, `in_progress`→`review`, `replied`→`active`, `closed`→`neutral`, `declined`→`overdue`).
- **Seam mocks:** `RmTicketDTO[]` covering all 5 statuses and all 3 kinds, plus at least one row with `model: null`/`account: null` to prove the `"—"` fallback.

#### ADM-2
- **Positive:** a matching `ref` renders `RequestTicketDetail` with the mapped ticket.
- **Negative:** a 404 `APIResult` triggers Next's `notFound()`, not a rendered error page.
- **Invariants:** the loading state never flashes an empty/"not found" state before the real result resolves (i.e. `loading` is checked before the `!ticket` branch).
- **Seam mocks:** `RmTicketDTO`, a 404-shaped `APIResult`.

#### ADM-3
- **Positive:** clicking Decline with a reason selected posts `{status:"declined", note: reason}`; Reply posts `{status:"replied", note: replyBody}`.
- **Negative:** a `success:false` (409) result from any of the three actions leaves the modal/panel open and renders the error inline, without advancing the local status.
- **Invariants:** a successful status change always triggers a refetch of the same ticket (no stale detail view after an action).
- **Seam mocks:** `APIResult<RmTicketDTO>` success for each of the 3 transitions, plus one `success:false` case shaped like the Backend's 409.

#### ADM-5
- **Positive:** `ticketCounts`/`ticketsTotal` on the client-info page match a hand-computed expectation over a given `RmTicketDTO[]` fixture.
- **Negative:** an empty ticket list renders `0` counts, not a crash from an empty-array reduce.
- **Invariants:** `RM_CLIENTS`/`SUB_CLIENTS`/`getMockOverlay` continue to import and behave exactly as before this unit (a static/negative check that this unit did not touch unrelated exports). A static `rg "model_limit"` sweep of `admin-frontend/` returns zero hits — confirming this layer added no PC model-management authoring surface, per the proposal's Non-Goals.
- **Seam mocks:** `RmTicketDTO[]` (including an empty array case).

### 8.4 Aggregate gate

- All unit tests green is a local gate before commit/PR hand-off; a red test blocks the unit, but `tests/` is never committed.
- Target coverage for changed lines: ≥ 90% of new/changed statements in `server/rm/*`, `lib/rm/tickets.ts`, `hooks/api/useRmTickets.ts`, `app/(roles)/rm/requests/actions.ts`.
- Chosen `test-gen` level for this layer: **standard** (happy path + main negative + the null/409/empty-vs-zero cases named above per unit) — set by the orchestrator; escalate to `thorough` only if the visual-confirmation gate surfaces edge cases this misses.

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] Every ADM-1…ADM-3, ADM-5 unit committed on `client-portal-integration-admin-fe`; each commit left the branch green.
- [ ] `admin-frontend/lib/pc/*` and `admin-frontend/components/pc/model-management/*` are untouched — `git diff` against parent shows no file in either directory (proposal Non-Goals: no `model_limit` authoring surface).
- [ ] §8 unit tests all pass (standard depth); `npm run lint && npx tsc --noEmit && npm run test && npm run build` green.
- [ ] §7 matches the proposal's frozen §4 verbatim (checked against the proposal, not against the Backend/client-frontend branches, which are not visible here).
- [ ] `rg "TICKET_QUEUE|REQUEST_TICKETS|isOpenTicket"` under `admin-frontend/` returns nothing.
- [ ] No money/status arithmetic exists beyond formatting in `RequestTickets.tsx` or the PC model components (Objectives — "Logic lives once").
- [ ] A side-by-side of the inbox and detail page shows identical structure/spacing to before — the only visible difference is real ticket data replacing mock data (Objectives — "Design parity") — verified at the proposal's named human gate (Execution step 3), not by this layer alone. The PC model form/detail panel is untouched by this layer (ADM-4 retired — see line 620) and is out of scope for this side-by-side.
- [ ] Confirmed: no client-renewal-upload code exists anywhere in this layer (D-4) — no new `/client/*` consumption, no new upload UI.
- [ ] PR opened against `client-portal-integration`; human owns the merge to `main`.

**Rollback:** this layer has no persisted state of its own — every ADM-* unit is pure frontend code, so the branch reverts cleanly with a straight `git revert`/branch discard (per the proposal's Rollback section: "Layers 2/3/4 revert cleanly with a branch revert — no persisted state of their own"). ADM-5 must be the last unit committed and the first reverted if a rollback is needed mid-layer, since ADM-1 through ADM-3 still assume the mock ticket symbols may exist as a fallback until ADM-5 removes them. No files in `STORAGE_ROOT` or any other persisted store are touched by this layer. There is no `model_limit`-related rollback concern — no file in `lib/pc/*` or `components/pc/model-management/*` is touched by this layer at all.
