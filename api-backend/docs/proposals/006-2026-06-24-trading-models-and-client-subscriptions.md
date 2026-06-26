# 006 — Portfolio Commander Workspace: Database, Backend, and Frontend Integration

**Date:** 2026-06-24 · **Revised:** 2026-06-25 (scope widened from table-layer-only to the full workspace)
**Branch:** `pc-workspace-integration`
**Status:** Draft for review — all open questions resolved (§9 D-1…D-19); ready for execution planning
**Author:** QinQipeng
**Builds on:** [005 — Database Foundation Cleanup](005-2026-06-11-database-foundation-cleanup.md)
**Related:** [002 — Separating Client and Admin Handling](002-2026-06-10-client-admin-separation.md) · MOBO backend-integration proposal (`docs/proposals/2026-06-18-mobo-backend-integration.md`)

---

## 0. What changed from the previous revision

The earlier draft of 006 scoped **only the table layer** — a `models` table, a period-agnostic
`client_models` mapping, and a `client_profiles.ib_account` column — and explicitly deferred API
routes, services, the allocation-period model, the per-model IB account, and the per-unit model size.

This revision **supersedes** that draft. It now covers the workspace end-to-end: database, backend,
and the frontend integration. The substantive changes from the old draft are:

1. **Allocations are period-scoped.** The frontend's allocation matrix is one matrix *per allocation
  period*, with an open/confirmed lifecycle. A period-agnostic `client_models(user_id, model_id)` table
   cannot represent it. The mapping is reframed as `allocation_periods` plus period-scoped
   `allocation_model_snapshots`, fed by a `client_subscriptions` source (§4.5–4.7). See D-1, D-10, D-12.
2. **The IB account is per-client, not per-model.** The prototype code currently mis-models the IB
  account as a property of the model (`AllocationModel.acct`, the matrix column header, *"one IB
   account per model"*). The correct business logic — confirmed with the product owner — is **one IB
   account per client**: every client has a single IB account (`client_profiles.ib_account`, already
   present in the mock as `AllocationClient.acct`) and **all** of that client's model allocations trade
   through it. So the model has **no** `ib_account` column; the account is sourced from the client
   (§4.1, §4.4). See D-3 and the correction note below.
3. **Materials and change history become child tables**, not inline JSON. They back file upload,
  versioning, download, and an auto-appended audit trail — all of which want row-level identity and a
   storage key (§4.2, §4.3). The old draft's inline-JSON decision (its D-3) is reversed. See D-2.
4. **A backend and a frontend-integration section** are added (§5, §6), aligning with the MOBO
  precedent: **all business logic lives in the backend; the frontend is a pure view.**

The naming choice from the old draft is kept: the allocation unit multiplier is `multiplier` in the
DB; the frontend calls it `units`; the API seam maps them (D-4).

### Addendum — second correction pass (2026-06-25)

Further product clarifications, folded in throughout:

- **A single model size.** `model_size` and the matrix's per-unit size are the **same figure** — there
is one `model_size` column, no separate `unit_size`. Account fund = `units × model_size`. (The prior
revision's size question is therefore resolved and removed.) See D-6.
- **Fees are not persisted.** Management fee defaults to **2 %** and incentive fee to **20 %** for all
models, and they vary client-to-client. They are hardcoded on the frontend for now and purged later
into a per-client fee config — so `models` carries **no** `mgmt` / `incentive` columns and there is
no backend fee endpoint. See D-7.
- **The allocation matrix is read-only in the PC workspace.** Cells are never assigned or edited here
(the old "assign" empty-cell and "edit allocation" flows are dropped). The PC matrix only *views* and
*confirms*. See D-8.
- **Open = derived, confirm = snapshot.** The open (current) matrix is **derived live by the CRM and not
stored**; only **confirming** writes a permanent, immutable snapshot record. Historical matrices are
those confirmed snapshots, so `allocation_model_snapshots` holds *confirmed* periods only. The open matrix derives
from a `**client_subscriptions`** source table (resolved, D-12). See D-10.
- **Draft → live publishing.** A model is created as a draft and explicitly **published** to `live`;
going live makes it visible to all clients and surfaces it as a column in the allocation matrix.
Publish requires ≥ v1 materials (D-11). See §3.1 M10, §5.3, and D-9.
- **File storage is a modular adapter.** Materials/documents go through a `FileStorage` interface with a
**local-filesystem** implementation active now and a **NAS** implementation swappable in once the
share/credentials are confirmed (resolved, D-13). See §5.1.
- **Periods are scheduled.** Allocation periods auto-open on a schedule (D-16); a manual open remains as
an admin override. Opening a second period is rejected until the current is confirmed (D-15).

> **Correction note — IB account ownership.** The PC prototype code (`lib/pc/types.ts`,
> `allocation-matrix/page.tsx`, `lib/mock/pc-data.ts`) still encodes the *old, incorrect* logic of one
> IB account **per model** (`AllocationModel.acct`, the column header, the cell-detail and edit-modal
> copy "trades 100% of this allocation" / "per model"). This proposal is written against the
> **corrected** logic: the IB account is **per client**. Notably the mock already carries the correct
> per-client account (`AllocationClient.acct` = `U-7101`, `U-7148`, …), currently unused by the matrix.
> Because this revision is scoped to the proposal only, a **follow-up frontend fix** is required to:
> (a) drop `AllocationModel.acct`, (b) render the client's account in the matrix/detail/edit surfaces,
> and (c) reword the per-model copy. That fix is tracked separately and is a precondition for the seam
> flip in §6.

---

## 1. Context and motivation

The admin-frontend ships a fully-typed **Portfolio Commander (PC)** workspace —
`admin-frontend/app/(roles)/pc/` — as a hi-fi demonstration of intended functionality, backed only
by a throwaway mock (`admin-frontend/lib/mock/pc-data.ts`). It has two screens:

- **Model Management** (`model-management/page.tsx`) — the firm's trading-model book: create/edit
models, version marketing materials, view a change history, and a fee calculator.
- **Allocation Matrix** (`allocation-matrix/page.tsx`) — a clients × live-models grid of unit
multipliers per allocation period, with derived account funds, an irreversible period confirm, and
read-only historical previews.

The domain types in `admin-frontend/lib/pc/types.ts` were authored so their *"field names and shapes
mirror the eventual backend columns"*. The data-access **seams** — `lib/pc/models.ts`
(`loadModels`) and `lib/pc/allocation.ts` (`loadAllocation`) — are the only modules that import the
mock; every screen binds to the seam signatures and the permanent types, never to the mock. The seams
are explicitly designed to *"flip to the API later … with ZERO changes to types or components."*

No backend persistence exists. This proposal lands it: a MariaDB schema, a FastAPI feature module that
owns all the business logic the screens demonstrate, and the integration plan that flips the two seams
from the mock to the API.

This is the objective stated in the task: with the UI/UX already proving out *what* the workspace
must do, implement the logic on the backend and persist it on a properly modelled database.

---

## 2. Goals & non-goals

### Goals

1. A MariaDB schema that persists the model book, its versioned materials and change history, the
  client↔model allocations, and the allocation-period lifecycle — modelled faithfully against the
   frontend domain types and screen behaviour.
2. A FastAPI feature module (`app/libs/pc/`) exposing the endpoints the two screens consume, with
  **all derived math, validation, versioning, and the confirm state machine implemented server-side**.
3. PC-scoped authorization actions wired into the existing `Action` / `require_action` machinery, so
  the workspace is reachable only by `PC` and `ADMIN` roles (mirroring the `RoleGuard` on the
   frontend layout).
4. A frontend integration that flips `loadModels()` / `loadAllocation()` from the mock to the API
  with no change to the permanent types or the screen components, then deletes the mock.
5. Hand-written, additive Alembic migration(s) applied and verified, following established
  conventions: UUID PKs via `Uuid(native_uuid=False)`, value-backed string enums
   (`native_enum=False`), `server_default=func.now()` timestamps.

### Non-goals

- **Live trading / IB execution.** The allocation matrix is *pre-trade*; confirming "opens trading" as a
downstream concern. Wiring to Interactive Brokers, order routing, and reconciliation are out of
scope (reconciliation has its own track — see `app/models/reconciliation.py`).
- **A legal fee engine.** The fee calculator is explicitly *"illustrative and does not replace the
legal fee schedule."* We persist the rate inputs and may expose the same illustrative formula; we do
not build a billing system.
- **Client-portal exposure.** This is an admin-portal (PC) workspace. Whether clients ever see their
own allocations is out of scope here.
- **Opening/merging any PR.** Per the standing rule, the human owns `main`; agents stop at a pushed
br**a**nch with a drafted PR.

---

## 3. Inventory of demonstrated functionality (the contract)

Collected by scanning the two screens, the shared primitives (`components/pc/Shared.tsx`), the seams,
and the types. This is the behaviour the backend must fulfil.

### 3.1 Model Management


| #   | Capability                                                                                                                                            | Source of truth today                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| M1  | List all models; grid and table layouts; header counts (total, draft)                                                                                 | `loadModels()`                                                                     |
| M2  | Model card / row: name, manager, status (live/draft), model size, mgmt %, incentive %, symbols, latest version                                        | `Model` (mgmt/incentive are **hardcoded** 2 %/20 % defaults — not stored; see D-7) |
| M3  | Model detail (Overview): model size, manager, mgmt fee, incentive fee, symbols, introduced date                                                       | `Model` (fees hardcoded)                                                           |
| M4  | **Create** model → saves as **draft**; fields: name, manager, model size, symbols (fee fields are display-only, not persisted)                        | `ModelFormModal` (display-only)                                                    |
| M5  | **Edit** model → *"changes are versioned and appended to the model's change history"*                                                                 | `ModelFormModal`                                                                   || M6  | Materials: stored files (file, version, date, size, "latest" badge), **download**                                                                     | `Model.materials`                                                                  |
| M7  | Materials: **upload** a new version → next file *"saves as v{n+1} and logs a change"*; draft's first upload is **v1**                                 | `MaterialsTab`                                                                     |
| M8  | Change history timeline (date, user, change message, version) — message rendered on the frontend from the structured `kind` + `detail` (D-19)          | `Model.changes`                                                                    |
| M9 | **Fee calculator**: pick a model, enter performance % and hurdle %; compute mgmt fee, incentive fee, total — over the **hardcoded** 2 %/20 % rates    | `computeFees` (frontend-only)                                                      |
| M10 | **Publish** a draft → **live**: makes the model visible to all clients and surfaces it as a column in the allocation matrix (resolved logic; see D-9) | new                                                                                |


### 3.2 Allocation Matrix


| #   | Capability                                                                                                                                                | Source of truth today              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| A1  | Stat strip: current period, # clients allocated, # live models, total account fund                                                                        | `AllocationView`                   |
| A2  | Period picker: list periods with open/confirmed status; **preview historical** (read-only); one period **open**                                              | `AllocationView.periods`           |
| A3  | Matrix: rows = clients (name, code, **IB account**), columns = **live** models (name, **model size**)                                                     | `AllocationView`                   |
| A4  | Cell shows the unit multiplier **and** the derived account fund; **× Units / % Share** toggle                                                             | `cell`, `cellFund`, `colUnits`     |
| A5  | Column totals (total units / 100 %, total fund) and grand total fund                                                                                      | `colUnits`, `colFund`, `totalFund` |
| A6  | Cell detail: model units, account fund, model size, min account fund (= 1 unit), **the client's IB account** (the account this allocation trades through) | `DetailPanel`                      |
| A7  | **Confirm** the period → irreversible; freezes the matrix *"so trading can open"*; stays confirmed until the next period opens                                  | `LockModal` (rename → `ConfirmModal`) |
| A8  | Confirmed / historical periods render read-only                                                                                                              | page state                         |


> **The matrix is read-only in the PC workspace (D-8).** There is no empty-cell "assign" and no
> "edit allocation" modal — both demonstrated in the old prototype, both dropped. The PC *views* the
> matrix and *confirms* a period; it never writes a cell. The **open** matrix is **derived live by the
> CRM** from `client_subscriptions` (D-12) and is not stored; **confirming** freezes it into a permanent snapshot
> (D-10). The empty cell is simply an empty cell.

### 3.3 Derived math that must move server-side (per the MOBO "logic in backend" precedent)

- `cellFund(c, m) = units × model.model_size`
- `colUnits(m) = Σ_clients units` ; `colFund(m) = Σ_clients cellFund`
- `totalFund = Σ_live-models colFund`
- `count = #(client, live-model) pairs with a cell`
- `% share` of a cell within its column

The allocation derivations above move server-side. `computeFees` (`mgmtFee = mgmt% × size`;
`excess = max(perf − hurdle, 0)`; `incFee = incentive% × excess% × size`; `total = mgmtFee + incFee`)
**stays on the frontend** over the hardcoded 2 %/20 % rates (D-7) — it is illustrative presentation
math, not persisted business state. Money formatting (`fmtMoney`, `fmtMoneyShort`) also stays on the
frontend.

---

## 4. Section I — Database (MariaDB)

Seven objects (six tables + one added column). All follow the repo conventions in `app/models/users.py` and
`app/models/reconciliation.py`: `Uuid(native_uuid=False)` PKs (`default=uuid.uuid4`), value-backed
`SAEnum(..., native_enum=False, values_callable=…)`, `Numeric(28, 10)` for money/decimals,
`DateTime(timezone=True)` with `server_default=func.now()` (+ `onupdate` on `updated_at`).

New model module: `**app/models/pc.py`**.

### 4.1 `models` — the model book

Mirrors `Model` (book view) and `AllocationModel` (matrix view). A single `model_size` serves both —
it is the model's size **and** the per-unit size (D-6). The model has **no** IB-account column (the
account is per-client, §4.4) and **no** fee columns (fees are hardcoded on the frontend, D-7).


| Column                      | Type                         | Null | Notes                                                                     |
| --------------------------- | ---------------------------- | ---- | ------------------------------------------------------------------------- |
| `id`                        | `Uuid(native_uuid=False)` PK | no   | `default=uuid.uuid4`                                                      |
| `name`                      | `String(255)`                | no   |                                                                           |
| `manager`                   | `String(255)`                | yes  | e.g. `"Wilson Capital"`                                                   |
| `model_size`                | `Numeric(28, 10)`            | yes  | the model's size = the per-unit size; account fund = `units × model_size` |
| `intro`                     | `String(255)`                | yes  | free-text introduced date (`"01 Jan 2020"`, `"—"`)                        |
| `symbols`                   | `JSON`                       | yes  | `["AAPL","MSFT","NVDA","TSLA"]`                                           |
| `status`                    | `String(16)`                 | no   | `ModelStatus` value enum `live`/`draft`; `server_default "draft"`         |
| `version`                   | `String(32)`                 | yes  | latest material version (`"v2"`); derived/cached from `model_materials`   |
| `created_at` / `updated_at` | `DateTime(tz)`               | no   | conventions as above                                                      |


`status` is `ModelStatus(str, Enum)` (`LIVE="live"`, `DRAFT="draft"`), persisted by value with
`native_enum=False`, identical to `Portal` / `AdminRole`. A model is created `draft` and transitions
to `live` only via the **publish** action (§5.3, D-9); only `live` models appear as matrix columns.

> **One size, not two (D-6).** The prototype mock carried two different numbers for the same model
> (`PC_MODELS[mA] = 100_000_000` book size vs `ALLOC_MODELS[mA] = 1_000_000` per-unit). Per the product
> owner these are the same concept; the schema keeps a single `model_size`. The matrix's existing
> per-unit figures are a prototype artifact the follow-up frontend fix will reconcile.

> **No fee columns (D-7).** Management/incentive fees default to 2 %/20 % for all models and vary
> per client. They are hardcoded on the frontend today and will move to a per-client fee config later;
> they are deliberately **not** persisted on `models`.

### 4.2 `model_materials` — versioned documents (child table)

Backs M6/M7. Each upload is a row; the model's `version` is the max.


| Column         | Type                         | Null | Notes                                                                                                                 |
| -------------- | ---------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------- |
| `id`           | `Uuid(native_uuid=False)` PK | no   |                                                                                                                       |
| `model_id`     | `Uuid` FK → `models.id`      | no   | indexed; `ON DELETE CASCADE`                                                                                          |
| `filename`     | `String(255)`                | no   | `Material.file` (e.g. `ModelA_Marketing_v2.pdf`)                                                                      |
| `version`      | `String(32)`                 | no   | `Material.ver` (`"v1"`, `"v2"` …)                                                                                     |
| `size_bytes`   | `BigInteger`                 | yes  | rendered as `Material.size` ("2.4 MB") on the frontend                                                                |
| `storage_key`  | `String(512)`                | yes  | pointer to the stored object (local path / NAS path / object key) resolved by the storage adapter — see §5.1 and D-13 |
| `content_type` | `String(128)`                | yes  | `application/pdf` etc.                                                                                                |
| `uploaded_by`  | `String(255)`                | yes  | actor display name                                                                                                    |
| `created_at`   | `DateTime(tz)`               | no   | rendered as `Material.date`                                                                                           |


Unique index on `(model_id, version)`.

### 4.3 `model_changes` — change-history audit trail (child table)

Backs M8. **Append-only**; written by the service on create/edit/publish/upload, never by the
client. **Structured, not pre-rendered (D-19):** each row stores the *kind* of change and the
*before/after values*; the human-readable message is rendered on the frontend from per-`kind` templates.

| Column       | Type                         | Null | Notes                                                          |
| ------------ | ---------------------------- | ---- | -------------------------------------------------------------- |
| `id`         | `Uuid(native_uuid=False)` PK | no   |                                                                |
| `model_id`   | `Uuid` FK → `models.id`      | no   | indexed; `ON DELETE CASCADE`                                   |
| `kind`       | `String(32)`                 | no   | `ModelChangeKind` value enum (created/edited/published/material_uploaded) |
| `detail`     | `JSON`                       | yes  | structured before/after payload; shape depends on `kind` (§5.4) |
| `actor`      | `String(255)`                | yes  | `ChangeEntry.user`                                             |
| `version`    | `String(32)`                 | yes  | `ChangeEntry.ver` at the time                                  |
| `created_at` | `DateTime(tz)`               | no   | `ChangeEntry.date`                                             |


### 4.4 `client_profiles.ib_account` — client IB account (the single account per client)

Add a nullable, indexed column to `client_profiles` (in `app/models/users.py`), positioned after
`initiate_method` and before the timestamps.


| Column       | Type          | Null | Notes                                                                    |
| ------------ | ------------- | ---- | ------------------------------------------------------------------------ |
| `ib_account` | `String(255)` | yes  | client's IB account — `AllocationClient.acct` (e.g. `"U-7101"`); indexed |


**This is the one and only IB account in the model.** Every allocation a client holds — across all
models — trades through this single account. The allocation matrix sources the account it shows (cell
detail, edit modal, "routes through …") from the **client row**, not the model column. There is no
per-model account anywhere in the schema (see the §0 correction note and D-3).

The matrix row label (`AllocationClient.name` / `.code`) reads from the existing `client_profiles`
columns. The matrix roster is **all client-portal users** (D-14).

### 4.5 `client_subscriptions` — the live source the open matrix derives from (resolved, D-12)

The standing, current-state mapping the CRM cross-tabs against live models to **derive the open matrix
live** (D-12). Period-agnostic: it always holds "the current subscriptions," which the open matrix
reflects until a period is confirmed and snapshotted (§4.7). Written by the **client-subscription flow**
(clients / their RM) — that write UI is its own track; this proposal defines the table and *reads* it
for derivation.


| Column                      | Type                    | Null | Notes                                                                                  |
| --------------------------- | ----------------------- | ---- | -------------------------------------------------------------------------------------- |
| `user_id`                   | `Uuid` FK → `users.id`  | no   | **part of composite PK**; the subscribing client (must be `portal = 'client'`)         |
| `model_id`                  | `Uuid` FK → `models.id` | no   | **part of composite PK**; indexed for reverse lookup                                   |
| `multiplier`                | `Numeric(28, 10)`       | no   | current allocation units (`AllocationCell.units`); `server_default "1"`; invariant ≥ 1 |
| `created_at` / `updated_at` | `DateTime(tz)`          | no   |                                                                                        |


**Primary key:** composite `(user_id, model_id)` — one current subscription per client–model pair (this
is the old `client_models` concept reborn as the *current* source, now distinct from the per-period
frozen `allocation_model_snapshots`). A secondary index on `model_id` covers reverse lookups.

**App-level invariants (service layer):** `users.portal = 'client'`; `multiplier ≥ 1`. The PC
workspace only reads this; mutations come from the subscription flow.

### 4.6 `allocation_periods` — the period lifecycle

Backs A2/A7. The **open** period is the current one whose matrix the CRM **derives live** from
`client_subscriptions` (§4.5); it is *not* persisted as cells. Confirming it **materializes** an immutable
snapshot (§4.7). Exactly one period is open at a time.


| Column                      | Type                         | Null | Notes                                                              |
| --------------------------- | ---------------------------- | ---- | ------------------------------------------------------------------ |
| `id`                        | `Uuid(native_uuid=False)` PK | no   |                                                                    |
| `label`                     | `String(32)`                 | no   | `Period.label` (e.g. `"Aug 2026"`); unique                         |
| `status`                    | `String(16)`                 | no   | `PeriodStatus` value enum `open`/`confirmed`; `server_default "open"` |
| `confirmed_at`                 | `DateTime(tz)`               | yes  | set when confirmed; null while open                                   |
| `confirmed_by`                 | `String(255)`                | yes  | actor who confirmed                                                   |
| `created_at` / `updated_at` | `DateTime(tz)`               | no   |                                                                    |


The open period row is a lightweight marker — it has **no** rows in `allocation_model_snapshots` until it is
confirmed. Its matrix is computed on demand from `client_subscriptions` (§4.5, D-12).

**App-level invariant:** at most one row with `status = 'open'` (D-15). A partial unique index would
express it on engines that support it; MariaDB does not, so the invariant is service-enforced,
consistent with how `assigned_rm_uid`'s RM constraint is handled.

**Period creation is scheduled (D-16).** Periods auto-open at period boundaries via a scheduled job
(not a manual PC action), with a manual open retained as an admin override. The single-open invariant
holds, so the prior period must be confirmed before the next auto-opens; for the first cut we **assume the
PM always confirms on time** (D-18). The scheduler's open path stays guarded by the invariant so a
collision fails safe (skip + log) and a future boundary policy can drop into `scheduler.py` without
touching the confirm/snapshot logic.

### 4.7 `allocation_model_snapshots` — frozen matrix records, written only at confirm

The persisted, immutable record of a **confirmed** period's matrix. **No rows exist for the open
period** — the open matrix is derived live by the CRM and never stored (per the product owner). When a
period is confirmed, the service derives the current matrix once and writes one row per non-empty cell;
those rows are never updated or deleted thereafter.


| Column       | Type                                | Null | Notes                                                                                                                                              |
| ------------ | ----------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `period_id`  | `Uuid` FK → `allocation_periods.id` | no   | **part of composite PK**; a *confirmed* period                                                                                                        |
| `user_id`    | `Uuid` FK → `users.id`              | no   | **part of composite PK**; the client                                                                                                               |
| `model_id`   | `Uuid` FK → `models.id`             | no   | **part of composite PK**; indexed for reverse lookup                                                                                               |
| `multiplier` | `Numeric(28, 10)`                   | no   | the allocation units (`AllocationCell.units`) at confirm time; ≥ 1                                                                                    |
| `model_size` | `Numeric(28, 10)`                   | yes  | **snapshot** of the model's size at confirm — frozen so the historical fund (`multiplier × model_size`) stays correct even if the model changes later |
| `ib_account` | `String(255)`                       | yes  | **snapshot** of the client's IB account at confirm                                                                                                    |
| `created_at` | `DateTime(tz)`                      | no   | = the confirm timestamp; no `updated_at` (rows are immutable)                                                                                         |


**Primary key:** composite `(period_id, user_id, model_id)` — one row per cell per confirmed period; a
secondary index on `model_id` covers reverse ("which clients held this model") lookups.

> **This is where historical matrices live.** Each confirmed period keeps its own complete, self-contained
> set of frozen rows (with the model size and IB account as they were at confirm). "Preview a historical
> matrix" (A2/A8) reads the snapshot rows for that `period_id`. The open period has nothing here until
> it is confirmed. There is no separate "previous matrix" table — the snapshot *is* the history.

**App-level invariants (service layer):**

- Rows are written **only** by the confirm operation; they are append-once and never mutated.
- `period_id` always references a `confirmed` period.
- The referenced user must be a client-portal user (`users.portal = 'client'`).
- `multiplier ≥ 1`.

> **Source vs output.** This snapshot table is the *output* of confirming; the open matrix's *input* is
> `client_subscriptions` (§4.5, resolved per D-12). On confirm the service reads the current subscriptions,
> derives the matrix, and freezes it here.

> **Naming (D-4):** the column is `multiplier`; the frontend's `AllocationCell.units` maps to it at
> the API seam (`units ↔ multiplier`), preserving the old draft's decision.

### 4.8 ORM/migration wiring

- **New** `app/models/pc.py` — `ModelStatus`, `PeriodStatus`, `ModelChangeKind`, `Model`,
`ModelMaterial`, `ModelChange`, `ClientSubscription`, `AllocationPeriod`, `AllocationModelSnapshot`.
- **Edit** `app/models/users.py` — add `ib_account` to `ClientProfile`.
- **Edit** `app/models/__init__.py` — export the new classes (Alembic discovery).
- **Edit** `alembic/env.py` — `import app.models.pc` (env imports each module explicitly).
- **New** `alembic/versions/<rev>_0008_pc_workspace.py` — single additive migration,
`revises = d4e5f6a7b8c9` (current head), full `upgrade()` / `downgrade()`. Additive-only ⇒ clean
rollback.

---

## 5. Section II — Backend (FastAPI)

### 5.1 Module layout

A new feature package mirroring `app/libs/users/` and `app/libs/auth/`:

```
app/libs/pc/
  router.py       # APIRouter(prefix="/pc"), mounts model + allocation routes
  service.py      # ModelService, AllocationService — all business logic
  repository.py   # ModelRepository, AllocationRepository, SubscriptionRepository — DB access only
  storage.py      # FileStorage interface + LocalStorage (active) + NasStorage (swap-in)
  scheduler.py    # period auto-open job (D-16)
app/schemas/pc.py # Pydantic request/response models
```

Mounted in `app/main.py`: `app.include_router(pc_router, prefix="/api")` → routes under `/api/pc/…`.

**Storage adapter — modular, local now, NAS later (D-13).** Material upload/download go through a small
`FileStorage` interface (`save(stream) -> storage_key`, `open(storage_key) -> stream`) so the
persistence target is swappable. A `**LocalStorage`** implementation (configured filesystem mount) is
the active default now; a `**NasStorage**` implementation drops in once the company NAS share/credentials
are confirmed — only `storage.py` changes. The DB only ever stores the opaque `storage_key`, so the
table layer is storage-agnostic.

### 5.2 Authorization

Extend `app/libs/auth/actions.py` (today `PC` has an empty action set):

```python
class Action(str, enum.Enum):
    ...
    MODEL_VIEW       = "pc:model_view"
    MODEL_MANAGE     = "pc:model_manage"
    ALLOCATION_VIEW  = "pc:allocation_view"
    ALLOCATION_MANAGE = "pc:allocation_manage"

ROLE_ACTIONS = {
    ...
    AdminRole.PC: {MODEL_VIEW, MODEL_MANAGE, ALLOCATION_VIEW, ALLOCATION_MANAGE},
    AdminRole.ADMIN: set(Action),   # already grants everything
}
```

Every route guards with `require_action(...)` exactly as `app/libs/users/router.py` does. This is the
server-side counterpart to the frontend `RoleGuard allowedRoles={["PC","ADMIN"]}`.

### 5.3 Endpoints

**Model book** (`ModelService`, actions `MODEL_VIEW` / `MODEL_MANAGE`):


| Method | Path                                           | Action | Behaviour                                                                                                                                                     |
| ------ | ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/pc/models`                               | VIEW   | list models (book shape); `ModelOut[]`                                                                                                                        |
| GET    | `/api/pc/models/{id}`                          | VIEW   | one model incl. materials + changes                                                                                                                           |
| POST   | `/api/pc/models`                               | MANAGE | create as **draft**; append `model_changes` "Model created"                                                                                                   |
| PATCH  | `/api/pc/models/{id}`                          | MANAGE | edit; append a change entry (M5 "versioned + logged")                                                                                                         || POST   | `/api/pc/models/{id}/publish`                  | MANAGE | **draft → live** (M10, D-9): validates publishability (≥ v1 materials — D-11), flips `status`, appends a change "Model published". Idempotent if already live |
| GET    | `/api/pc/models/{id}/materials`                | VIEW   | versioned file list                                                                                                                                           |
| POST   | `/api/pc/models/{id}/materials`                | MANAGE | multipart upload → next `v{n+1}` (first = `v1`); bump `models.version`; append a change (M7)                                                                  |
| GET    | `/api/pc/models/{id}/materials/{mid}/download` | VIEW   | stream the file via the storage adapter                                                                                                                       |
| GET    | `/api/pc/models/{id}/changes`                  | VIEW   | change-history timeline                                                                                                                                       |


The fee calculator (M9) has **no** backend endpoint — it is frontend-only math over hardcoded rates
(D-7).

**Allocation matrix** (`AllocationService`, actions `ALLOCATION_VIEW` / `ALLOCATION_MANAGE`):

The matrix is **read-only** in this workspace (D-8): no cell-write endpoint. The **open** matrix is
derived live (never stored); **confirming** materializes the snapshot record (D-10).


| Method | Path                                   | Action | Behaviour                                                                                                                                                                                                                                                                     |
| ------ | -------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/pc/allocation/periods`           | VIEW   | period list with status (A2)                                                                                                                                                                                                                                                  |
| GET    | `/api/pc/allocation?period={label}`    | VIEW   | **fully-derived view** — clients (w/ IB account), live models (w/ model size), cells, totals, count (A1–A6). For the **open** period, derived live from `client_subscriptions` (D-12); for a **confirmed** period, read from `allocation_model_snapshots`. Defaults to the open period |
| POST   | `/api/pc/allocation/periods`           | MANAGE | open a new period — admin override; normally periods auto-open on a schedule (D-16). Invariant: ≤ 1 open, rejected until the current is confirmed (D-15)                                                                                                                         |
| POST   | `/api/pc/allocation/periods/{id}/confirm` | MANAGE | **irreversible** open→confirmed: derives the current matrix once, **writes the `allocation_model_snapshots` rows** (freezing `model_size` / `ib_account`), sets `confirmed_at`/`confirmed_by` (A7, D-10)                                                                                     |


### 5.4 Business logic owned by the service (not the frontend)

Per the MOBO precedent (*all business logic in the backend, frontend is a pure view*), these are
computed server-side and returned in payloads — the frontend stops recomputing them:

- **Open-matrix derivation** — for the open period the service **computes the matrix live** from the
`client_subscriptions` (D-12) and live models; nothing is persisted. It returns `cellFund`, `colUnits`, `colFund`,
`totalFund`, `count`, and each cell's `% share`, with cells already carrying their derived fund plus
a `totals` block, so `lib/pc/allocation.ts` assembles `AllocationView` without math. For a confirmed
period the same shape is built by **reading `allocation_model_snapshots`** (using the frozen `model_size`).
*Consequence of the per-client IB account (D-3):* a client's whole row trades through one account, so
the **row sum** is that client's total IB-account fund — a natural aggregate the payload can expose.
- **Snapshot-on-confirm (D-10)** — confirming derives the open matrix once and writes the immutable
`allocation_model_snapshots` rows, freezing `model_size` and `ib_account` so the historical record stays
correct if models/clients change later.
- **Materials versioning** — server computes the next `v{n+1}`, persists the file via the storage
adapter, updates `models.version`, and appends a `model_changes` row atomically.
- **Change-log capture (D-19)** — every model create/edit/publish/upload writes an audit row;
clients never write the log directly. The row is **structured**: a `kind` plus a before/after `detail`
(for `edited`, a per-field diff over `name`/`manager`/`model_size`/`intro`/`symbols`; for
`material_uploaded`, `{filename, version}`; `created`/`published` carry none). The service stores **raw**
values and does **not** render a sentence — the frontend renders each entry from per-`kind` templates.
- **Model publish state machine (D-9)** — `draft → live` is the only forward transition and the gate
for client visibility + matrix inclusion. The service validates publishability (D-11 — requires
≥ v1 materials), flips `status`, and logs the change. Re-publishing a live model is a no-op.
- **Period confirm state machine** — open→confirmed is one-way; once confirmed, the period's snapshot rows are
immutable and the period can never re-open.
- **Validation invariants** — `multiplier ≥ 1`, `fund ≥ model_size` (one unit), client-portal
membership of `user_id`, single-open-period.

(The fee calculator is *not* here — it is frontend-only over hardcoded rates, D-7.)

### 5.5 Schemas (`app/schemas/pc.py`)

`ModelOut`, `ModelCreate`, `ModelUpdate`, `MaterialOut`, `ChangeOut`, `PeriodOut`,
`AllocationViewOut` (clients, models, cells-with-fund, totals). No fee schema (frontend-only) and no
allocation-cell-write schema (read-only matrix). Field names match the permanent frontend types so
payloads deserialize straight into them; the only remap is `units ↔ multiplier` (D-4).

---

## 6. Section III — Frontend integration

The integration follows the **established data-fetching pattern** already shipped on the
`trade-reconciliation-integrations` branch for the MOBO workspace (D-17). Its business logic is stale,
but its *layering* is the reference we replicate verbatim. The PC seam stops being a mock loader and
becomes a **pure DTO→view mapper** (matching D-5 / the MOBO D1 "frontend is purely a view" seam).

### 6.1 The layered fetch pattern (replicated from the reference branch)

Six layers, top (browser) to bottom (API):

1. **Screen** (`"use client"`) — calls a hook, renders `{data, loading, error}` + empty/retry states.
  (The matrix already has `EmptyPeriod` + a retry affordance.)
2. `**hooks/api/useModels.ts`, `useAllocation.ts*`* (`"use client"`) — own `{data, loading, error}`
  (and, for the matrix, cursor/`loadMore`/`hasMore` + an in-flight guard + cancellation); call the
   server action, then run the seam mapper. Mirrors `hooks/api/useReconciliation.ts`.
3. `**app/(roles)/pc/**/action.ts**` (`"use server"`) — thin server-action wrappers, the
  client-callable boundary; re-export the `server/pc` functions.
4. `**server/pc/index.ts**` (`"use server"`) — typed per-endpoint functions (build query strings, call
  the client, return `APIResult<DTO>`). Mirrors `server/mobo/index.ts`.
5. `**server/api-client.ts**` (`"server-only"`, **reused as-is**) — the HTTP transport: reads the
  `id_token` cookie, attaches it as a `Bearer` token, `cache: "no-store"`, no retry, returns the
   discriminated union `APIResult<T>` = `{success:true,data}` | `{success:false,error,code}` (401 →
   `UNAUTHORIZED`). Endpoint paths centralised in `**server/endpoints.ts`** (`PC: { MODELS, ALLOCATION,  PERIODS, … }`).
6. `**lib/pc/models.ts`, `lib/pc/allocation.ts**` — repurposed as the **DTO→view mappers**
  (`mapDtoToModels`, `mapDtoToAllocationView`): structural shaping + formatting only, **no derivation**
   (the backend already computed funds/totals, §5.4). Presentation formatters (`fmtMoney`,
   `fmtMoneyShort`, `computeFees` over the hardcoded rates — D-7) move to `lib/pc/format.ts` and are
   re-exported from the seam, exactly as the MOBO seam re-exports `lib/mobo/format.ts`.

**Delete** `lib/mock/pc-data.ts` once the mappers no longer read it.

### 6.2 Async boundary (resolves the former OQ-1)

The synchronous `useMemo(() => loadModels(), [])` calls become hook calls —
`const { data, loading, error } = useModels()` and the matrix's
`const { data, loading, error } = useAllocation(period)`. This is a small, localized change at the top
of each screen (the same edit the MOBO recon page made to adopt `useReconciliation`); the rest of each
component and all `@/lib/pc/types` stay intact. So the earlier "zero component change" aspiration is
relaxed to "one hook swap per screen," which is the reference pattern's actual shape.

### 6.3 Auth & transport (token cookie)

Reuse the reference plumbing verbatim: `lib/mobo-token.ts`'s `writeIdTokenCookie()` (rename/duplicate
to a neutral `lib/id-token.ts`) is driven by `AuthProvider`'s `onIdTokenChanged` to mirror the Firebase
ID token into a non-httpOnly, `SameSite=Strict` `id_token` cookie; the **server-only** `apiClient` reads
that cookie and attaches the `Bearer` token (the MOBO "D2: token in cookie" decision). Base URL from
`NEXT_PUBLIC_API_BASE_URL` via `getApiBase()`. `APIResult`'s `code: "UNAUTHORIZED"` drives the screen's
re-auth path.

### 6.4 Writes the screens imply

Mutations go through the same action→server→api-client layers (POST/PATCH): create/edit
model, **publish draft → live**, upload material (multipart), and confirm period. The allocation matrix is
**read-only** — its cell-edit ("assign" / `EditModal`) path is dropped (D-8), so no cell-write wiring.
The follow-up frontend fix (per the §0 correction notes) removes the dead `EditModal` / assign
affordances along with the per-model IB-account and per-unit-size artifacts, and renames the period
`LockModal` → `ConfirmModal` (with its copy) to match the **confirm** vocabulary.

---

## 7. Objectives & standard of the expected outcome

- **Parity, not redesign.** Every capability in §3 works against real data with the existing UI
unchanged. The frontend's own guidance — *"do not change design/layout"* — holds.
- **Seam-clean.** Flipping to the API changes only the two seam files and removes the mock; types and
components are untouched. This is the explicit success criterion baked into `lib/pc/types.ts`.
- **Logic lives once, server-side.** Derived funds, totals, fee math, versioning, the confirm machine,
and all invariants are enforced in the backend; the frontend renders what it is given (MOBO
precedent). No business rule is duplicated client-side.
- **Convention-faithful.** Models, enums, migrations, routers, services, repositories, and authz
follow the patterns already in `app/models/*`, `app/libs/*`, and `alembic/versions/*`. Reviewers
should find nothing novel in *how* it is built.
- **Additive & reversible.** One additive migration; `alembic downgrade -1` cleanly drops all six
objects and the `ib_account` column.
- **Verified.** Migration applies (`alembic upgrade head`, `alembic current` at the new head, objects
exist); each endpoint exercised against a seeded DB; the matrix's derived totals match the mock's
values for an identical dataset (a regression anchor).

---

## 8. Files touched (planned)

**Database / models**

- New `app/models/pc.py`; edit `app/models/users.py`, `app/models/__init__.py`, `alembic/env.py`;
new `alembic/versions/<rev>_0008_pc_workspace.py`.

**Backend**

- New `app/libs/pc/{router,service,repository,storage,scheduler}.py`, `app/schemas/pc.py`; edit
`app/libs/auth/actions.py` (PC actions), `app/main.py` (mount router + register the period
auto-open scheduler, D-16).

**Frontend** (replicating the `trade-reconciliation-integrations` layering, D-17)

- New `admin-frontend/server/pc/index.ts`; edit `admin-frontend/server/endpoints.ts` (PC paths) and
reuse `admin-frontend/server/api-client.ts`.
- New `admin-frontend/app/(roles)/pc/{model-management,allocation-matrix}/action.ts`,
`admin-frontend/hooks/api/{useModels,useAllocation}.ts`, `admin-frontend/lib/pc/format.ts`.
- Repurpose `admin-frontend/lib/pc/models.ts` + `allocation.ts` as DTO→view mappers; swap each screen's
`useMemo(load…)` for the hook and wire submit handlers in `model-management/page.tsx` /
`allocation-matrix/page.tsx`; ensure `AuthProvider` mirrors the `id_token` cookie (`lib/id-token.ts`).
- **Delete** `admin-frontend/lib/mock/pc-data.ts`.

---

## 9. Design decisions (settled)

These are confirmed for this proposal (the *open* forks are in §12).

- **D-1 — Allocations are period-scoped.** `allocation_periods` + `allocation_model_snapshots(period_id, user_id, model_id, …)` replace the old period-agnostic `client_models`, because each confirmed period is
its own frozen matrix.
- **D-10 — Open = derived, confirm = snapshot.** The open period's matrix is derived live by the CRM and
**never stored**; confirming materializes an **immutable snapshot** (`allocation_model_snapshots`, freezing
`model_size`/`ib_account`) that is the period's permanent record. Historical matrices are exactly
these snapshots. The live source the open matrix derives *from* is `client_subscriptions` (§4.5, D-12).
- **D-2 — Materials and change history are child tables**, not inline JSON on `models` — needed for
file identity, storage keys, download, version-uniqueness, and an append-only audit trail.
- **D-3 — The IB account is per-client, not per-model.** It lives once on `client_profiles.ib_account`
and every allocation a client holds trades through it. The model has no IB-account column. This
corrects the prototype's per-model `AllocationModel.acct` (see the §0 correction note); a follow-up
frontend fix realigns the UI.
- **D-4 — Allocation-unit naming.** DB column `multiplier`; API/UI field `units`; the seam maps
`units ↔ multiplier`. Carried over from the prior draft.
- **D-5 — Business logic server-side.** Derived funds/totals, versioning, the publish and confirm state
machines, and every invariant live in the backend; the frontend is a pure view (MOBO precedent). The
one exception is the fee calculator (D-7).
- **D-6 — One model size.** A single `model_size` column serves both the book and the matrix; there is
no separate per-unit size (they are the same figure). Account fund = `units × model_size`.
- **D-7 — Fees are not persisted.** Management/incentive fees default to 2 %/20 % for all models and
vary per client; they are hardcoded on the frontend now and move to a per-client fee config later.
`models` has no fee columns and there is no backend fee endpoint.
- **D-8 — The allocation matrix is read-only in the PC workspace.** No cell assign/edit; the PC views
the matrix and confirms periods. The open matrix is derived live (source = `client_subscriptions`, D-12); rows persist only at confirm (D-10).
- **D-9 — Draft → live publishing.** Models start as `draft` and are explicitly published to `live`;
only live models are client-visible and appear as matrix columns. Publish validates publishability
(D-11) and logs a change.
- **D-19 — Structured change log, rendered on the frontend.** `model_changes` stores a `kind`
(`ModelChangeKind` enum) plus a before/after `detail` (JSON) — **not** a pre-rendered sentence. The
backend records *what* changed and its raw values; the frontend renders each entry from per-`kind`
templates (`FE-5`). This replaces the old free-text `change` column and adds the `kind` enum + `detail`
column (§4.3, §5.4).

The following were open questions, now resolved (2026-06-25):

- **D-11 — Publish prerequisite (was Q1).** A draft may be published only once it has **≥ v1 materials**
(and `model_size` set). Matches the prototype's "add materials before distribution."
- **D-12 — Open-matrix source (was Q2).** The open matrix derives from a `**client_subscriptions`**
table (client→model→multiplier, §4.5), written by the client-subscription flow (its own track) and
read by the CRM derivation. (Resurrects the old `client_models` as the *current* source.)
- **D-13 — Storage is a modular adapter (was Q3).** A `FileStorage` interface with `**LocalStorage*`*
active now and `**NasStorage**` swappable in once the NAS share/credentials are confirmed.
- **D-14 — Matrix roster (was Q4).** Rows are **all client-portal users**; a cell exists only where the
client is subscribed. No enrolment table.
- **D-15 — One open period (was Q5).** Opening a second period is **rejected until the current is
confirmed**. *(May be revisited later.)*
- **D-16 — Periods are scheduled (was Q7).** Periods **auto-open on a schedule** (`scheduler.py`), with
a manual open as an admin override.
- **D-18 — Assume the PM confirms on time (was OQ-2).** For the first cut we **assume the portfolio
manager always confirms the open period before the next scheduled auto-open**, so the boundary collision
(a scheduled open while the prior is still unconfirmed) cannot occur in practice. The implementation
must still **leave room** for handling it later — keep the scheduler's open path guarded by the
single-open invariant (D-15) so a collision fails safe (skip + log/alert) rather than corrupting
state, and isolate the trigger in `scheduler.py` so a future policy (auto-confirm, defer, or notify) can
drop in without touching the confirm/snapshot logic. Building that policy now is out of scope.
- **D-17 — Frontend fetch pattern (was OQ-1).** Replicate the layered pattern shipped on the
`trade-reconciliation-integrations` branch: `server-only` `api-client` (cookie→Bearer, `APIResult<T>`)
→ `endpoints` map → `server/pc` functions → `"use server"` actions → `hooks/api/*` → a `lib/pc`
DTO→view **mapper** seam (no derivation) + `lib/pc/format.ts`. The branch's business logic is
deprecated; only its structure is adopted.

---

## 10. Execution & verification

1. **DB first** — write `app/models/pc.py` + the `ib_account` column, wire `__init__`/`env.py`, author
  the migration, `alembic upgrade head`, verify `alembic current` and object existence. (Human gate:
   migration runs against the live DB — same posture as 005's cutover.)
2. **Backend** — repository → service (with the §5.4 logic + tests on the derived math and the confirm
  machine) → schemas → router → actions → mount. Exercise every endpoint against a seeded copy of the
   mock dataset; assert derived totals equal the mock's.
3. **Frontend** — build the fetch layers (D-17): `server/pc` + actions + `hooks/api/*`, repurpose the
  `lib/pc` seams as DTO→view mappers, swap each screen to its hook; wire
   the write handlers; delete the mock; smoke-test both screens.
4. Push the branch and draft the PR; stop (human owns `main`).

## 11. Rollback

Backend and frontend changes revert with the branch. The schema reverts with `alembic downgrade -1`,
which drops `allocation_model_snapshots`, `allocation_periods`, `client_subscriptions`, `model_changes`,
`model_materials`, `models`, and the `client_profiles.ib_account` column (with its index).
Additive-only ⇒ clean.

---

## 12. Open questions

### Resolved (2026-06-25) — now design decisions

The original open questions have been settled with the product owner and promoted to §9:


| Was       | Topic                    | Resolution                                                     | Decision |
| --------- | ------------------------ | -------------------------------------------------------------- | -------- |
| Q1        | Publish prerequisite     | Require **≥ v1 materials** (and `model_size`)                  | D-11     |
| Q2        | Open-matrix source       | A `**client_subscriptions`** source table (§4.5)               | D-12     |
| Q3        | File storage             | **Modular adapter** — `LocalStorage` now, `NasStorage` later   | D-13     |
| Q4        | Matrix roster            | **All client-portal users**                                    | D-14     |
| Q5        | Second open period       | **Reject until current is confirmed** (may change later)          | D-15     |
| Q7        | Period cadence           | **Scheduled auto-open** (+ manual override)                    | D-16     |
| Q6 / OQ-1 | Frontend fetch pattern   | **Replicate the `trade-reconciliation-integrations` layering** | D-17     |
| (prior)   | `model_size`/`unit_size` | One size                                                       | D-6      |
| (prior)   | Fee-calc placement       | Frontend, hardcoded rates                                      | D-7      |


### Still open

None. (The former OQ-2 is resolved as D-18 below.)

### Out of scope (tracked elsewhere)

- **The client-subscription write flow** that populates `client_subscriptions` (D-12) — its own track;
this proposal defines the table and reads it.

