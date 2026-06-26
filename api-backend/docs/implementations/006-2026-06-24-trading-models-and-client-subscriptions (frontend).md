# 006 · Frontend — Implementation details

System-level technical specification for the `admin-frontend` integration of the PC workspace. **Single
source of truth** for frontend content. Organised into work units `FE-1 … FE-7`; the
[execution schedule](<../execution-schedules/006-2026-06-24-trading-models-and-client-subscriptions (frontend).md>) and [prompts](<../prompts/006-2026-06-24-trading-models-and-client-subscriptions (frontend).md>) reference these IDs only.

**Pattern.** A standard layered Next.js App Router data-fetch stack (*prop §6*): a `server-only` HTTP
client → a central endpoints map → typed per-endpoint server functions → `"use server"` action
wrappers → `"use client"` hooks → a pure **DTO→view mapper** seam (no derivation — the backend already
computed everything, `BE-5`). Every layer below is **created in this repo as part of this work**; none
are assumed to pre-exist.

Proposal cross-refs (*prop §6*) point at
[../proposals/006-2026-06-24-trading-models-and-client-subscriptions.md](../proposals/006-2026-06-24-trading-models-and-client-subscriptions.md).
Backend contract (`BE-n`) is in [backend.md](<006-2026-06-24-trading-models-and-client-subscriptions (backend).md>).

**Permanent vs disposable.** `admin-frontend/lib/pc/types.ts` is permanent (payloads deserialize into
it). `admin-frontend/lib/mock/pc-data.ts` is deleted at the end (`FE-6`). Screens depend on types +
seam signatures only.

---

## FE-1 — Transport: api-client, endpoints, id-token cookie

*prop §6.3.*
- **Create `admin-frontend/server/api-client.ts`** (`"server-only"`): reads the `id_token` cookie,
  attaches `Authorization: Bearer`, `cache: "no-store"`, returns `APIResult<T>` =
  `{success:true,data}` | `{success:false,error,code}` (401 → `UNAUTHORIZED`). Base URL via
  `getApiBase()` / `NEXT_PUBLIC_API_BASE_URL`.
- **Create `admin-frontend/server/endpoints.ts`** — a central path map with a `PC` group:
  `PC: { MODELS, MODEL(id), MATERIALS(id), DOWNLOAD(id, mid), CHANGES(id), PUBLISH(id),
  ALLOCATION, PERIODS, CONFIRM(id) }`.
- **id-token cookie:** add `admin-frontend/lib/id-token.ts` exporting `writeIdTokenCookie(token)`, and
  drive it from `AuthProvider`'s `onIdTokenChanged` so the Firebase ID token is mirrored into a
  non-httpOnly, `SameSite=Strict` `id_token` cookie that the server-only `apiClient` reads.
  *(`AuthProvider` does not do this mirroring today — it is new wiring.)*

## FE-2 — `server/pc/index.ts` (`"use server"`)

*prop §6.1 layer 4.* Typed per-endpoint functions that build query strings, call `apiClient`, return
`APIResult<DTO>`. Functions: `getModels`, `getModel(id)`,
`createModel(body)`, `updateModel(id, body)`, `publishModel(id)`,
`getMaterials(id)`, `uploadMaterial(id, formData)`, `getChanges(id)`, `getPeriods`,
`getAllocation(period?, etag?)`, `confirmPeriod(id)`.

**ETag plumbing (`FE-4` depends on this):** `getAllocation` accepts an optional `etag` and forwards it
as `If-None-Match`; it returns both the DTO **and** the response `ETag`, plus a `notModified` flag when
the backend answers `304` (`BE-6`). This is the only PC-specific addition to the transport surface.

## FE-3 — Server-action wrappers (`app/(roles)/pc/**/action.ts`)

*prop §6.1 layer 3.* Thin `"use server"` wrappers re-exporting the `server/pc` functions, one
`action.ts` per screen folder (`model-management/`, `allocation-matrix/`). The client-callable boundary;
no logic.

## FE-4 — Hooks with client-side caching (`hooks/api/{useModels,useAllocation}.ts`)

*prop §6.1 layer 2, §6.2.* `"use client"` hooks owning `{data, loading, error}`. They call the action,
then run the `FE-5` mapper. Each carries an in-flight guard and cancels stale requests.

**`useAllocation(period)` — the caching consumer (this is the frontend half of the cache mechanism):**
- Keep an in-hook cache: `Map<periodKey, { view, etag }>` (module-scoped or `useRef`, optionally
  mirrored to `sessionStorage`).
- On fetch, pass the cached `etag` for that period to `getAllocation(period, etag)`.
- If the response is `notModified` (`304`) → **keep the cached `view`** (no re-map, no re-render churn).
- If `200` → map the fresh DTO, store `{ view, etag }`, render it.
- Refetch triggers: mount, period change, window refocus, and an optional light poll. Because the
  backend ETag changes whenever an input changes — **e.g. a new client subscribes to Model A** advances
  `client_subscriptions.updated_at` (`DB-6`) → new ETag (`BE-6`) — the next conditional refetch returns
  the recomputed matrix and the screen updates. When nothing changed, the `304` path keeps everything
  cached and cheap.
- Confirmed periods: the backend marks them immutable; once cached they never refetch (their ETag =
  `period_id` never changes).

`useModels()` is the simple case — `{data, loading, error}`, no ETag needed (small payload).

## FE-5 — Seam mappers (`lib/pc/models.ts`, `lib/pc/allocation.ts`) + `lib/pc/format.ts`

*prop §6.1 layer 6.* Repurpose the two existing seam files from mock-loaders into **pure DTO→view
mappers**:
- `mapDtoToModels(dto) → Model[]` / `mapDtoToModel(dto) → Model`.
- `mapDtoToAllocationView(dto) → AllocationView` — **structural shaping + formatting only, NO
  derivation.** Funds, `colUnits`, `colFund`, `totalFund`, `count`, `% share`, and the per-client row
  total all arrive precomputed from `BE-5`; the mapper just assembles them into the `AllocationView`
  shape the screen already consumes. Apply the `multiplier → units` rename here (D-4) if not already
  done at the API boundary.
- **New `lib/pc/format.ts`** — move `fmtMoney`, `fmtMoneyShort`, and `computeFees` (the
  frontend-only fee math over the **hardcoded 2 %/20 %** rates, D-7) here; re-export them from the seam
  so screens keep importing presentation helpers from `lib/pc/*`.
- **Change-log rendering (D-19) — the frontend formulates the message.** The API returns each change
  entry as `{kind, detail, actor, version, date}` with **no rendered text** (`BE-4`/`DB-1b`). So:
  - Evolve `ChangeEntry` in `lib/pc/types.ts` to `{ kind: ModelChangeKind; detail: …; user; ver; date }`
    (replacing the old free-text `change: string`).
  - Add a presentation helper `lib/pc/change-log.ts` (re-exported from the seam, like `format.ts`) with a
    **per-`kind` template** that renders the display string from `kind` + `detail`, formatting raw values
    there (money via `fmtMoney`, symbol diffs as +X/−Y). Templates:
    - `created` → "Model created"; `published` → "Published to live";
    - `material_uploaded` → "Uploaded {filename} ({version})";
    - `edited` → one line per `detail.fields[]`, e.g. "Model size {before} → {after}".
  - The M8 change-history timeline calls this renderer; the mapper does shaping only (no message text).

## FE-6 — Screen wiring + delete mock

*prop §6.2, §6.4.*
- **Model Management** (`model-management/page.tsx`): swap `useMemo(() => loadModels(), [])` for
  `const { data, loading, error } = useModels()`; wire submit handlers for create / edit /
  **publish** / material upload through the `FE-3` actions.
- **Allocation Matrix** (`allocation-matrix/page.tsx`): swap the load for
  `const { data, loading, error } = useAllocation(period)`; wire the **confirm** handler. The matrix is
  read-only — no cell-write wiring.
- **Delete `admin-frontend/lib/mock/pc-data.ts`** once the mappers no longer import it.

## FE-7 — Correct the stale prototype logic (precondition for the seam flip)

*prop §0 correction note, D-3/D-6/D-8.* The prototype still encodes the old logic; correct it as part of
the integration (the proposal was proposal-only, so this code fix lands here):
- **Drop per-model IB account:** remove `AllocationModel.acct` (`lib/pc/types.ts`), the matrix column
  header account, and the "one IB account per model" / "trades 100% of this allocation" copy. Source the
  account from the **client row** (`AllocationClient.acct`, already in the data).
- **Reconcile single model size (D-6):** the matrix per-unit size and the book size are one
  `model_size`; remove the dual-number artifact.
- **Drop assign/edit cell (D-8):** remove the empty-cell "assign" affordance and the `EditModal` /
  edit-allocation path — the matrix is read-only.
- Reword cell-detail / "routes through …" copy to the per-client account.
- **Apply the confirm vocabulary (lock → confirm naming):** rename the period-lock component
  `LockModal` → `ConfirmModal`, and rename the screen's trigger/handler/state from `lock*` to
  `confirm*`. Reword all UI copy from "lock"/"locked" to "confirm"/"confirmed" (button label, modal
  title, warning) — the matrix action reads **Confirm** and is still irreversible. This aligns the
  frontend with the backend term (`POST …/periods/{id}/confirm`, status `confirmed`).

> `FE-7` may be done **before** the seam flip (against the mock, as a pure UI correction) or **together
> with** `FE-6`. Doing it first keeps the flip a clean data-source swap. Either way it must be complete
> before the mock is deleted, because the corrected UI is what binds to the new payload shape.

---

## Verification (throwaway — manual smoke + build, run once, then purge)

The precise one-off check **per work unit** — mostly `next build` + a browser smoke (no committed test
suite; nothing added to CI). The execution schedule's verify wave (`F-W6`) references this section by ID.

| Unit | Precise check (assert true) |
|---|---|
| `FE-7` | against the mock: no `AllocationModel.acct` or per-model-account copy; matrix has no assign/edit affordance; one `model_size` per model; no `LockModal`/"lock" wording (action reads "Confirm"); both screens render; `next build` passes. |
| `FE-1` | signed in, the `id_token` cookie is set (`SameSite=Strict`, non-httpOnly) and a `server/pc` request carries `Authorization: Bearer` (Network tab). |
| `FE-2` | each `server/pc` fn returns `APIResult<DTO>`; `getAllocation(period, etag)` sends `If-None-Match` and surfaces `notModified` on a `304`. |
| `FE-3` | the `"use server"` actions are callable from a client component and re-export the `server/pc` fns. |
| `FE-5` | mappers produce `Model[]` / `AllocationView` with **no** recomputation (funds/totals come from the payload); `lib/pc/change-log.ts` renders each `kind` from `detail` (e.g. `edited` → "{Field} {before}→{after}"). |
| `FE-4` | revisit a period with no upstream change → conditional request returns `304`, cached view kept; after a new subscription upstream, refocus → `200` + new ETag and the matrix updates; confirmed periods never refetch. |
| `FE-6` | both screens run on live API data, layout unchanged; create/edit/publish/upload + confirm work end-to-end; `lib/mock/pc-data.ts` deleted with no dangling imports; `next build` passes. |
| `FE-IV` (integration) | end-to-end against the backend, the rendered matrix totals match the backend's payload (and the `BE-IV` regression numbers). |
