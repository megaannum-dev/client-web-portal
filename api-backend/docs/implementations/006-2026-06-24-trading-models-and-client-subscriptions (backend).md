# 006 · Backend — Implementation details

System-level technical specification for the FastAPI layer of the PC workspace. **Single source of
truth** for backend content. Organised into work units `BE-1 … BE-8`; the
[execution schedule](<../execution-schedules/006-2026-06-24-trading-models-and-client-subscriptions (backend).md>) and [prompts](<../prompts/006-2026-06-24-trading-models-and-client-subscriptions (backend).md>) reference these IDs only.

**Conventions.** Mirror `app/libs/users/` and `app/libs/auth/`: a feature package with
`router.py` / `service.py` / `repository.py`, schemas in `app/schemas/`, routes guarded by
`require_action(...)`. Services own all business logic; repositories do DB access only; routers are thin.

Proposal cross-refs (e.g. *prop §5.3*) point at
[../proposals/006-2026-06-24-trading-models-and-client-subscriptions.md](../proposals/006-2026-06-24-trading-models-and-client-subscriptions.md).
Database work units referenced here (`DB-n`) are in
[database.md](<006-2026-06-24-trading-models-and-client-subscriptions (database).md>).

---

## BE-1 — Package layout + storage adapter

*prop §5.1, D-13.* Create `app/libs/pc/` with `router.py`, `service.py`, `repository.py`,
`storage.py`, `scheduler.py`; and `app/schemas/pc.py`.

`storage.py` — a `FileStorage` protocol with two implementations:

```python
class FileStorage(Protocol):
    def save(self, stream: BinaryIO, *, suggested_name: str, content_type: str | None) -> str: ...  # returns storage_key
    def open(self, storage_key: str) -> BinaryIO: ...

class LocalStorage(FileStorage):   # active now — configured filesystem mount
    ...
class NasStorage(FileStorage):     # placeholder — swap-in once NAS share/credentials confirmed
    ...
```

- The active implementation is chosen by config (`PC_STORAGE_BACKEND`, default `local`;
  `PC_STORAGE_ROOT` for the local mount).
- The DB stores only the opaque `storage_key` (`DB-1a.storage_key`); the table layer is
  storage-agnostic. Swapping to NAS later changes **only** `storage.py`.

## BE-2 — Authorization actions

*prop §5.2.* Extend `app/libs/auth/actions.py` (today `AdminRole.PC` has an empty set):

```python
MODEL_VIEW        = "pc:model_view"
MODEL_MANAGE      = "pc:model_manage"
ALLOCATION_VIEW   = "pc:allocation_view"
ALLOCATION_MANAGE = "pc:allocation_manage"
# ROLE_ACTIONS[AdminRole.PC] = {MODEL_VIEW, MODEL_MANAGE, ALLOCATION_VIEW, ALLOCATION_MANAGE}
# AdminRole.ADMIN already = set(Action)
```

Every route uses `require_action(...)` exactly as `app/libs/users/router.py` does — the server-side
counterpart to the frontend `RoleGuard allowedRoles={["PC","ADMIN"]}`.

## BE-3 — Repositories (DB access only)

`repository.py` — `ModelRepository`, `AllocationRepository`, `SubscriptionRepository`. Pure queries,
no business logic. Required methods (signatures are the contract; bodies are plain SQLAlchemy):

- **ModelRepository:** `list_models()`, `get_model(id)`, `create(...)`, `update(id, ...)`,
  `list_materials(model_id)`, `add_material(...)`, `get_material(mid)`, `list_changes(model_id)`,
  `add_change(model_id, kind, detail, actor, version)`, `set_version(model_id, ver)`,
  `set_status(model_id, status)`.
- **SubscriptionRepository:** `list_active_subscriptions()` (joined to live models + client profile),
  `roster()` (all client-portal users with `ib_account`), and the **watermark probes** for `BE-6`:
  `subscriptions_watermark()`, `models_watermark()`, `clients_watermark()` returning
  `(max_updated_at, row_count)` each (backed by `DB-6` indexes).
- **AllocationRepository:** `list_periods()`, `get_period(id)`, `get_open_period()`, `create_period(...)`,
  `confirm_period(id, actor)`, `write_snapshots(period_id, rows)`, `read_snapshots(period_id)`.

## BE-4 — `ModelService` (book, materials, changelog, publish)

*prop §5.3 model routes, §5.4.* Owns:

- **Create** → always `draft`; record a `created` change (M4).
- **Edit** → update fields, then **diff the tracked fields** (`name`, `manager`, `model_size`, `intro`,
  `symbols`) and record one `edited` change whose `detail.fields` lists `{name, before, after}` for each
  changed field (M5 "versioned + logged").
- **Materials versioning (M7)** — atomically: compute next `v{n+1}` (first upload = `v1`), persist the
  file via `FileStorage.save` (`BE-1`), insert the `model_materials` row with its `storage_key`, bump
  `models.version`, record a `material_uploaded` change with `detail = {filename, version}`. All in one
  transaction.
- **Download (M6)** — resolve `storage_key` → `FileStorage.open` → stream.
- **Publish state machine (M10, D-9)** — `draft → live` is the only forward transition. Validate
  publishability per **D-11**: `model_size` set **and** ≥ v1 materials. Flip `status`, record a
  `published` change. Re-publishing a live model is a no-op (idempotent).
- The **fee calculator is NOT here** (D-7) — frontend-only over hardcoded rates.

**Structured change log (D-19).** The service records **what changed**, not a sentence: each mutating
action writes a `model_changes` row carrying a `kind` (`ModelChangeKind`) and a structured `detail`
(before/after values) per the shapes in `DB-1b`. It does **not** render display text — the frontend
renders each entry from per-`kind` templates (`FE-5`). For `edited`, `detail` holds the raw before/after
per field (no formatting); for `material_uploaded`, the filename + version; `created`/`published` carry
no `detail`.

**Invariants:** the change log is append-only and written by the service, never the client; `version`
always equals the max material version.

## BE-5 — `AllocationService` (derivation + confirm snapshot)

*prop §5.3 allocation routes, §5.4, D-8/D-10.* The matrix is **read-only**; no cell-write path.

- **Open-matrix derivation** — build the fully-derived `AllocationViewOut` from
  `SubscriptionRepository.list_active_subscriptions()` × live models, joined to each client's
  `ib_account`. Compute server-side (frontend recomputes nothing):
  - `cellFund = multiplier × model.model_size`
  - `colUnits(m) = Σ multiplier`, `colFund(m) = Σ cellFund`
  - `totalFund = Σ colFund` over live models
  - `count = #(client, live-model)` cells present
  - each cell's `% share` within its column
  - **client row total** = Σ of the client's cell funds (their single IB account's total fund — a
    natural aggregate exposed because of the per-client account, D-3).
  This derivation is the cached payload (`BE-6`).
- **Confirmed-matrix read** — same `AllocationViewOut` shape rebuilt from `read_snapshots(period_id)` using
  the **frozen** `model_size`/`ib_account` (so history stays correct).
- **Snapshot-on-confirm (D-10)** — `confirm_period`: assert the period is `open`; derive the current matrix
  once; `write_snapshots` one row per non-empty cell freezing `model_size` + `ib_account`; set
  `confirmed_at`/`confirmed_by`; flip to `confirmed`. One-way, irreversible; snapshot rows immutable.
- **Open-period creation (admin override)** — `create_period`: enforce the single-open invariant
  (D-15) — reject if an open period exists; normal opening is the scheduler (`BE-7`).
- **Validation invariants:** `multiplier ≥ 1`; `fund ≥ model_size` (one unit); `user_id` is a
  client-portal user; ≤ 1 open period.

## BE-6 — Open-matrix cache + ETag (the caching mechanism)

The open-matrix derivation (`BE-5`) is the workspace's most expensive, most frequent read. Cache it,
keyed by a **version token (ETag)** computed from the freshness of its inputs, so it is always fresh
without recomputing on every request.

**ETag computation.** From the three watermark probes (`BE-3`, backed by `DB-6`):

```
etag = sha1( f"{subs.max_updated_at}:{subs.count}|"
             f"{models.max_updated_at}:{models.live_count}|"
             f"{clients.max_updated_at}:{clients.count}" )[:16]
```

Including counts catches deletes (a removed subscription lowers the count even if `max_updated_at` is
unchanged). The token changes iff some input that affects the open matrix changed — **most importantly,
a new client subscribing to a model** advances `client_subscriptions.updated_at`/count, so the ETag
moves and the cache is invalidated automatically.

**Cache store.** An in-process TTL cache (`cachetools.TTLCache` or equiv.) keyed `("open", etag)` →
`AllocationViewOut`. TTL is a safety net (e.g. 300 s), **not** the correctness mechanism — correctness
comes from the ETag. Lookup flow on `GET open matrix`:

1. Compute `etag` from watermarks (cheap, index-backed).
2. If the request carries `If-None-Match: <etag>` → return **`304 Not Modified`** (no body, no
   derivation).
3. Else if `("open", etag)` is cached → return it with header `ETag: <etag>`.
4. Else derive via `BE-5`, store under `("open", etag)`, return with `ETag: <etag>`.

**Invalidation is implicit** — no manual purge. Any mutation moving a watermark yields a new ETag; old
entries age out by TTL. This means a write in the (out-of-scope) subscription flow, or any
publish/`model_size`/`ib_account` change here, is reflected on the very next read.

**Confirmed periods** are immutable: cache keyed `("confirmed", period_id)` with a long TTL and response
header `Cache-Control: immutable`; ETag = `period_id`. No watermark needed.

**Contract handed to the frontend (`FE-4`):** every allocation GET returns an `ETag` header; the
endpoint honours `If-None-Match` with `304`. This is the only coupling point and it is stable regardless
of how the cache is implemented internally.

> Implementation may start with no cache (derive every time) and add this unit without changing any
> route signature — the ETag header + `304` are the externally visible contract; the store behind them
> is swappable (in-process now, Redis later) under this same `BE-6` ID.

## BE-7 — Period scheduler

*prop §4.6, D-16, D-18.* `scheduler.py` — a job that **auto-opens** a period at each boundary, registered
at app startup in `app/main.py`. The open path is **guarded by the single-open invariant** (`BE-5`): if
the prior period is still unconfirmed, the scheduled open **fails safe** — skip + log/alert — rather than
creating a second open period or corrupting state. For the first cut we assume the PM always confirms on
time (D-18); the boundary trigger is isolated here so a future policy (auto-confirm/defer/notify) drops in
without touching the confirm/snapshot logic. Manual open (`BE-5.create_period`) remains as admin override.

## BE-8 — Router, schemas, mount

*prop §5.3, §5.5.*

**`app/schemas/pc.py`:** `ModelOut`, `ModelCreate`, `ModelUpdate`, `MaterialOut`, `ChangeOut`,
`PeriodOut`, `AllocationViewOut` (clients incl. IB account + row total; live models incl. model size;
cells with derived fund + % share; `totals` block; `etag`). `ChangeOut` exposes `kind` + structured
`detail` (before/after) + `actor`/`version`/`created_at` — **not** a rendered message (D-19; the frontend
renders it). No fee schema; no cell-write schema. Field names match the permanent frontend types; the
only remap is `units ↔ multiplier` (D-4) — done at this schema boundary.

**`router.py`** — `APIRouter(prefix="/pc")` mounting all routes from *prop §5.3*, each guarded by the
`BE-2` action. Allocation GETs read/write the `ETag`/`If-None-Match` headers per `BE-6`.

| Method | Path | Action | Unit |
|---|---|---|---|
| GET | `/api/pc/models` | MODEL_VIEW | BE-4 |
| GET | `/api/pc/models/{id}` | MODEL_VIEW | BE-4 |
| POST | `/api/pc/models` | MODEL_MANAGE | BE-4 |
| PATCH | `/api/pc/models/{id}` | MODEL_MANAGE | BE-4 |
| POST | `/api/pc/models/{id}/publish` | MODEL_MANAGE | BE-4 |
| GET | `/api/pc/models/{id}/materials` | MODEL_VIEW | BE-4 |
| POST | `/api/pc/models/{id}/materials` | MODEL_MANAGE | BE-4 |
| GET | `/api/pc/models/{id}/materials/{mid}/download` | MODEL_VIEW | BE-4 |
| GET | `/api/pc/models/{id}/changes` | MODEL_VIEW | BE-4 |
| GET | `/api/pc/allocation/periods` | ALLOCATION_VIEW | BE-5 |
| GET | `/api/pc/allocation?period={label}` | ALLOCATION_VIEW | BE-5/BE-6 (ETag) |
| POST | `/api/pc/allocation/periods` | ALLOCATION_MANAGE | BE-5 |
| POST | `/api/pc/allocation/periods/{id}/confirm` | ALLOCATION_MANAGE | BE-5 |

**`app/main.py`:** `app.include_router(pc_router, prefix="/api")` and register the `BE-7` scheduler at
startup.

---

## Verification (throwaway — seed a scratch DB, run once, then purge)

The precise one-off check **per work unit**. Not a committed suite: the seed (the four mock models, five
clients, the `ALLOC` cells as `client_subscriptions`) and any smoke script are deleted after. The
execution schedule's verify wave (`B-W7`) references this section by ID.

| Unit | Precise check (assert true) |
|---|---|
| `BE-1` | `LocalStorage.save(stream)` then `open(key)` round-trips bytes under `PC_STORAGE_ROOT`; `NasStorage` is a marked placeholder; the backend is config-selected (`PC_STORAGE_BACKEND`). |
| `BE-2` | a `PC`-role token passes `require_action(MODEL_VIEW)`; a non-PC/non-ADMIN token → `403`; `ADMIN` passes all four actions. |
| `BE-3` | each listed repository method returns the documented shape; the three `*_watermark()` return `(max_updated_at, count)`; no derivation/validation in the repo. |
| `BE-4` | create → one `created` change; an edit of model_size+manager → one `edited` change whose `detail.fields` carries both raw before/after; upload → `v{n+1}` + `material_uploaded` change + `models.version` bumped; publish a draft with `<v1` materials → rejected, with `≥v1` → `live` + `published` change, re-publish → no-op. |
| `BE-5` | open `GET /api/pc/allocation` over the seed returns `cellFund = units×model_size` and correct `colUnits`/`colFund`/`totalFund`/`count`/`%share`/row-total; `confirm` writes one snapshot row per cell (frozen `model_size`/`ib_account`), flips to `confirmed`, second confirm → blocked; a confirmed `GET` rebuilds from snapshots using the frozen sizes. |
| `BE-6` | two identical open GETs ⇒ **one** derivation (counter/log); inserting a `client_subscriptions` row changes the `ETag` ⇒ next GET recomputes; `If-None-Match: <current>` ⇒ `304` no body; deleting a subscription also moves the ETag (count term). |
| `BE-7` | a scheduled tick with no open period opens one; with an open (unconfirmed) period it skips + logs (no 2nd open row); manual `create_period` still works. |
| `BE-8` | every route resolves under `/api/pc/…` in OpenAPI; the allocation GET emits `ETag` + honours `If-None-Match`; `ChangeOut` serializes `kind`+`detail` (no rendered string). |
| `BE-IV` (integration) | over the seed, the derived matrix totals **equal the frontend mock's numbers** (regression anchor, *prop §7*). |
