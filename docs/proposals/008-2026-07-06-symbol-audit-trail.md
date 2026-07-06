# 008 — Distinctive Symbols Column: Per-Symbol Audit Trail & Symbols Tab

> Status: **DRAFT — pending implementation approval.**
> Scope: PC / Portfolio Commander → Model Management → model **detail panel**. Adds a per-symbol audit trail, an `active`/`inactive` state per symbol, a dedicated **Symbols** tab rendering the "symbol book", and clickable symbol chips that deep-link to a symbol's history. Out of frame: allocation matrix, materials, fee math, client subscriptions.
> Constraint: **data-preserving** — existing symbols migrate to `active`; existing model/allocation endpoints keep their current behaviour; the new audit table is append-only.

---

## 1. Context and Motivation

Today a model's symbol universe is a flat, replaceable list:

- **DB** (`api-backend/app/models/pc.py`): `model_symbols(model_id, symbol, weight)` — current universe only. No history, no active/inactive state.
- **Backend** (`api-backend/app/libs/trade_models/service.py`): `edit_model` **replaces the whole relationship** on every save and logs nothing. Two explicit debt markers sit on the exact seam this proposal closes:
  - `service.py:103` — `# ponytail: symbol diff not tracked in changelog, add when audit requires`
  - `service.py:142` — same, in `edit_model`.
- **Frontend** (`admin-frontend/components/pc/model-management/`): tabs are Overview / Materials / Changes — **no Symbols tab**. Symbols render as read-only `<Ticks>` pills (`OverviewTab.tsx:22`, `ModelTable.tsx:33`, `CardGrid.tsx:35`). The only way to change symbols is the Create/Edit form's chip input, which round-trips the whole list.

The design prototype (`scratch-crm/megaannum-crm/project/pc/pc-app/ModelManagement.jsx`, data in `PCData.jsx`) promotes each symbol to a **first-class, audited, stateful asset**:

- A **symbol book** — one row per asset: `Symbol · Input date · Updated by · Status (Active/Inactive)`.
- Each row expands to a **per-symbol audit trail**: `Added / Edited / Removed` ops with weight `from → to`, a note, date, user, version.
- **Deactivating** a symbol keeps its row in the book (state → Inactive) but drops it from the live universe; **activating** flips it back. This is distinct from **hard-removing** a symbol, which deletes it from the model entirely.
- Symbol chips in the table/cards are **clickable** and deep-link into the Symbols tab at that symbol's trail; Overview shows an "N changes →" link.

> **Why now / why this order.** The audit requirement the two `ponytail:` markers were waiting for has arrived. DB is listed first because it introduces a migration (a new audit table + an `active` column) that the backend diff writes into; after approval the three layers build independently against §4.

---

## 2. Goals

1. Each `model_symbols` row carries an **`active`** state; deactivate/activate flips it without deleting the row, and a distinct hard-delete removes it entirely — verifiable in the Symbols tab and via the symbol write endpoints.
2. Every symbol add / weight-edit / deactivate / activate / hard-delete appends a row to a dedicated **`model_symbol_audit`** table (append-only) — verifiable by exercising each op and reading the model detail.
3. The model detail panel gains a **Symbols** tab rendering the symbol book (active + inactive rows) with expandable per-symbol audit trails.
4. Symbol chips in `ModelTable` and `CardGrid` are clickable and open the detail panel on the Symbols tab at the chosen symbol; Overview shows an "N changes →" link.
5. The two `ponytail:` markers in `service.py` are removed (debt closed, not re-deferred).

## 3. Non-Goals

- **User-authored free-text notes** — notes are auto-generated from the op ("Added to universe", "Deactivated", "Activated", "Removed from model"). Custom notes are a future track.
- **Editing/back-dating audit rows** — the audit table is append-only; no update/delete API.
- Allocation matrix, materials, fee calculator, client subscriptions — untouched.
- `client-frontend` — this feature is admin/PC only.

---

## 4. Cross-layer seam (frozen here)

### 4.1 The wire contract

```python
# ── DB ─────────────────────────────────────────────────────────────────────
# model_symbols gains a nullable-false boolean:
#   active BOOLEAN NOT NULL DEFAULT true      # existing rows migrate to true
# The relationship now holds BOTH active and inactive rows.

# New append-only table:
#   model_symbol_audit(
#     id           UUID  pk,
#     model_id     UUID  fk models.id ON DELETE CASCADE,   # NOT fk to model_symbols
#     symbol       VARCHAR(32)  not null,
#     op           VARCHAR      not null,   # 'added' | 'deactivated'
#                                           # | 'activated' | 'removed'
#     note         VARCHAR(255) null,       # auto-generated
#     actor        VARCHAR(255) null,
#     version      VARCHAR(32)  null,
#     created_at   TIMESTAMPTZ  not null default now(),
#     INDEX (model_id, symbol)
#   )
# FK targets models (not model_symbols) so a hard-deleted symbol keeps its trail.
# NOTE: symbol WEIGHT is not tracked in the audit (D-4) — the prototype never
# covered weight. model_symbols.weight stays as a DB column, unused by this feature.

# ── API DTOs ────────────────────────────────────────────────────────────────
class SymbolOut(BaseModel):
    symbol: str
    weight: float | None = None             # existing; not surfaced by this feature
    active: bool = True                      # NEW

class SymbolAuditOut(BaseModel):            # NEW
    symbol: str
    op: str                                 # added|deactivated|activated|removed
    note: str | None
    actor: str | None
    version: str | None
    created_at: datetime

# ModelOut.symbols now returns ALL rows (active + inactive), each with `active`.
#   Universe consumers (table/card/overview pills) filter to active === true.
# ModelDetailOut gains:
#   symbol_audit: list[SymbolAuditOut] = []   # full trail for the model

# ── Routes ───────────────────────────────────────────────────────────────────
# Existing PATCH /api/pc/models/{id} (Create/Edit form bulk set) keeps working:
#   sets the ACTIVE universe; new symbols → added, dropped symbols → DEACTIVATED
#   (never hard-deleted). Emits audit rows. Weight is not audited (D-4).
# New symbol-scoped sub-resource for the Symbols tab's fine-grained ops:
POST   /api/pc/models/{id}/symbols            body {symbol}               -> 201  # add (active=true) → op 'added'
PATCH  /api/pc/models/{id}/symbols/{symbol}   body {active}               -> 200  # active:false → 'deactivated'; active:true → 'activated'
DELETE /api/pc/models/{id}/symbols/{symbol}                               -> 204  # hard delete row → op 'removed'
# All four write paths return the updated ModelDetailOut (or 204 for DELETE).
```

**Field-name ↔ column map:** API `symbols[].weight` ↔ `model_symbols.weight`; API `symbols[].active` ↔ `model_symbols.active`; book "input date" ↔ latest `model_symbol_audit.created_at`; book "updated by" ↔ latest `model_symbol_audit.actor`.

### 4.2 Per-layer obligations against the seam

| Layer | What this layer contributes | What this layer assumes from the other side |
|---|---|---|
| Database | `model_symbols.active` (NOT NULL, default true); `model_symbol_audit` append-only, FK→`models`. | Backend writes `op` ∈ the 4 values. |
| Backend | Toggles `active`, hard-deletes rows, appends `model_symbol_audit` per op; serves `SymbolOut.active` + `ModelDetailOut.symbol_audit`; the 3 new routes + the bulk PATCH. | DB has `active` column + audit table per §4.1. |
| Frontend | Builds the book from `symbols` (state) + `symbol_audit` (trail); universe pills filter `active`; calls the sub-resource routes for add/edit/activate/deactivate/delete. | Backend returns `symbols` incl. inactive + `active` flag, and `symbol_audit`, per §4.1. |

### 4.3 Change protocol (post-freeze)

- Any edit to the DTOs, the `op` value set, or the routes comes back to this section first, then re-flows to each impl doc's §7.

---

## Layer 1 — Database

### A. Tables / objects in scope

| File | Tables / objects |
|---|---|
| `api-backend/app/models/pc.py` | `model_symbols` (add `active`), `model_symbol_audit` (**new**), `SymbolAuditOp` (new enum) |
| `api-backend/alembic/versions/` | one new revision |

### B. Findings

#### B-1. Symbols have no active/inactive state (Yes — user req.)

The prototype toggles each symbol between Active and Inactive independently of hard removal (`ModelManagement.jsx` `symStatusMeta`, `SymStatusChip`, "Disable/Enable symbol"). `model_symbols` has no such column, so the state has nowhere to live and deactivate cannot be distinguished from delete.

**Refactor:** Add `active BOOLEAN NOT NULL DEFAULT true` to `model_symbols`. The `Model.symbols` relationship now holds active *and* inactive rows; the live universe is the `active = true` subset.

**Migration plan (data-preserving):**
1. `ALTER TABLE model_symbols ADD COLUMN active BOOLEAN NOT NULL DEFAULT 1` (all existing symbols → active).

#### B-2. Symbol history has nowhere to live (Yes — user req.)

Per-symbol history (`symbolChanges` in the prototype) must be an isolated, append-only record — separate from the model-level `model_changes` log so the two streams don't intermix.

**Refactor:** Create `model_symbol_audit` per §4.1. FK is to `models.id` (`ON DELETE CASCADE`), **not** to `model_symbols`, so hard-deleting a symbol leaves its audit trail intact; the trail is only ever removed when the whole model is deleted. `op` is a small non-native enum (`SymbolAuditOp`: added / deactivated / activated / removed). No weight columns (D-4). Index `(model_id, symbol)` for per-symbol lookups.

**Migration plan (data-preserving):**
1. `CREATE TABLE model_symbol_audit (...)` with the index.
2. **Backfill (required):** insert one `added` row per existing `model_symbols` row — `op='added'`, `note='Initial universe'`, `actor=NULL`, `version=` the model's current `version`, `created_at=` the model's `created_at` (best available "input date"). This seeds every current symbol's book with a first history entry so no row shows an empty trail.

---

### C. Summary of DB-layer changes

| # | Change | Required? | Effort | Data migration? |
|---|---|---|---|---|
| B-1 | Add `active` (NOT NULL, default true) to `model_symbols` | Yes — user req. | S | Yes (additive, default) |
| B-2 | Create append-only `model_symbol_audit` (FK→models, no weight cols) + `SymbolAuditOp` enum | Yes — user req. | S | Yes (new table) |
| B-2b | Backfill one `added` row per existing symbol | Yes — user req. | XS | Yes (data insert) |

All land in **one Alembic revision**. Down-migration drops `model_symbol_audit` and the `active` column (rollback loses recorded symbol history and the active/inactive distinction — additive otherwise).

---

## Layer 2 — Backend

### A. Structural change

None. Work lands in the existing `TradeModelsService` (`service.py`) and `router.py`; new schemas in `schemas.py`.

### B. Logic change — audit on every symbol op (closes the ponytail debt)

Baseline: `create_model` (`service.py:85`) and `edit_model` (`service.py:130`) set/replace `model.symbols` and log nothing — the markers at `service.py:103`, `:142`.

New service methods, each appending one `model_symbol_audit` row in the same transaction:

| Method | Effect | Audit op | note |
|---|---|---|---|
| `add_symbol(model, symbol)` | insert row `active=true` | `added` | "Added to universe" |
| `set_symbol_active(model, symbol, False)` | `active=false` | `deactivated` | "Deactivated" |
| `set_symbol_active(model, symbol, True)` | `active=true` | `activated` | "Activated" |
| `remove_symbol(model, symbol)` | **delete** row | `removed` | "Removed from model" |

`create_model` emits one `added` per initial symbol ("Initial universe"). The bulk `edit_model` path diffs old vs new active set: new→`add_symbol`, dropped→`set_symbol_active(False)` (**deactivate, never hard-delete**). `actor` = current user; `version` = model's current version. **Weight is not tracked** (D-4) — no weight-edit op; if the form still sends weights they update `model_symbols.weight` silently without an audit row.

### C. Other backend findings

#### C-1. Serve the new fields (Yes)

`SymbolOut` gains `active`; `ModelOut.symbols` returns all rows (active + inactive); `ModelDetailOut` gains `symbol_audit: list[SymbolAuditOut]` assembled from `model_symbol_audit` for the model (newest-first).

#### C-2. Remove the debt markers (Yes)

Delete the two `# ponytail: symbol diff not tracked in changelog` comments once the audit is implemented.

### D. Route / contract changes

> **Decision (settled):** the Create/Edit **form** keeps the bulk `PATCH /api/pc/models/{id}` (sets the active universe, deactivates drops — never hard-deletes). The **Symbols tab** uses a fine-grained symbol sub-resource so activate ≠ delete is expressible.
>
> Final route surface after this layer lands:
> ```
> GET    /api/pc/models/{id}                    detail incl. symbols (+active) + symbol_audit
> PATCH  /api/pc/models/{id}                     bulk set active universe (form)   [existing]
> POST   /api/pc/models/{id}/symbols            add symbol                         [new]
> PATCH  /api/pc/models/{id}/symbols/{symbol}   activate / deactivate              [new]
> DELETE /api/pc/models/{id}/symbols/{symbol}   hard-delete symbol                 [new]
> ```
> Net: **+3 routes** (one per fine-grained op).

### E. Summary of Backend-layer changes

| # | Change | Required? | Effort |
|---|---|---|---|
| B | Symbol service methods + bulk diff, each appending `model_symbol_audit`; `create_model` seeds "Initial universe" | Yes — user req. | M |
| C-1 | `SymbolOut.active`, `ModelOut.symbols` = all rows, `ModelDetailOut.symbol_audit` | Yes | S |
| C-2 | Delete the two `ponytail:` markers | Yes | XS |
| D | Add 3 symbol sub-resource routes | Yes — user req. | S |

---

## Layer 3 — Frontend

| File | Role |
|---|---|
| `admin-frontend/components/pc/model-management/ModelDetailPanel.tsx` | tab host; add "Symbols" tab (deep-link target) |
| `admin-frontend/components/pc/model-management/SymbolsTab.tsx` | **NEW** — symbol book + audit trail + add/edit/activate/deactivate/remove |
| `admin-frontend/components/pc/model-management/OverviewTab.tsx` | "N changes →" link into Symbols tab |
| `admin-frontend/components/pc/model-management/ModelTable.tsx`, `CardGrid.tsx` | clickable symbol chips (deep-link); pills filter `active` |
| `admin-frontend/components/pc/Shared.tsx` | `Ticks` gains optional `onSymbol` handler; filters `active` where it shows the universe |
| `admin-frontend/lib/pc/*`, `admin-frontend/server/pc/*` | DTO types (`active`, `symbol_audit`), api-client + server actions for the 3 sub-resource routes |

Reference to port (visual + interaction fidelity): `ModelManagement.jsx` — `SymbolsTab`, `SymbolBookRow`, `SymAuditTrail`, `buildSymbolBook`, `SymStatusChip`, `TickChip`/`Ticks`, Overview "N changes" link (`:216-224`).

### A. Findings

#### A-1. No Symbols tab in the detail panel (Yes — user req.)

`ModelDetailPanel.tsx` hosts Overview / Materials / Changes. Prototype tab list is `Overview · Symbols · Materials · Changes` (`ModelManagement.jsx:522`).

**Refactor:** Add `SymbolsTab.tsx`, registered between Overview and Materials. Port `buildSymbolBook`: rows = `model.symbols` (active + inactive), status from `active`; per-row trail = `model.symbol_audit` filtered by `symbol`, newest-first; sort active-first then by latest audit date. Render the book table (`Symbol · Input date · Updated by · Status`), expandable rows (op badge, note, date · actor · version — **no weight**, D-4), summary pills (`N assets`, `N active`, `N inactive`), inline add-symbol input, and per-row "Disable/Enable symbol" + hover-to-remove. Accept `initialOpenSym` for deep-linking.

#### A-2. Fine-grained symbol writes (Yes — user req.)

Each interaction maps to one sub-resource call, then refetch model detail:
- **Add** → `POST /models/{id}/symbols`
- **Deactivate / Activate** → `PATCH …/{symbol}` `{active:false|true}`
- **Remove (hard)** → `DELETE …/{symbol}`

**Refactor:** Add api-client methods + server actions for the 3 routes alongside the existing model update path in `lib/pc` / `server/pc`.

#### A-3. Symbol chips are not clickable; pills must show active only (Yes — user req.)

`Ticks` (`Shared.tsx:43`) renders static pills over the whole list. With inactive rows now in `symbols`, universe pills must filter `active`, and chips should deep-link (prototype `TickChip`, `ModelManagement.jsx:21`).

**Refactor:** `Ticks` filters to `active` where it shows the universe (table/card/overview) and gains optional `onSymbol?: (sym) => void`. Wire `ModelTable.tsx`/`CardGrid.tsx` to open the detail panel on the Symbols tab with `initialOpenSym`. Add the Overview "N changes →" link (count from `symbol_audit`).

### B. Adapting to changes in other layers

| Upstream change | Frontend change | Files touched |
|---|---|---|
| `symbols` now includes inactive + `active` flag | universe pills filter `active`; book uses all | `Shared.tsx`, `ModelTable.tsx`, `CardGrid.tsx`, `OverviewTab.tsx` |
| `ModelDetailOut.symbol_audit` | build per-symbol trails from it | `SymbolsTab.tsx` |
| 3 new symbol routes | api-client + server actions | `lib/pc`, `server/pc` |

### C. Additional findings

DTO types in `admin-frontend/lib/pc` gain `SymbolDTO.active` and a `SymbolAuditDTO`; `ModelDetailDTO` gains `symbol_audit`.

### D. Summary of Frontend-layer changes

| # | Change | Required? | Effort |
|---|---|---|---|
| A-1 | New `SymbolsTab.tsx` (book + trail); register in panel | Yes — user req. | L |
| A-2 | api-client + server actions for the 3 sub-resource routes; refetch on success | Yes — user req. | M |
| A-3 | `Ticks` filters active + clickable deep-link; Overview "N changes →" | Yes — user req. | M |
| C | DTO types: `active`, `SymbolAuditDTO`, `symbol_audit` | Yes | XS |

---

## Design decisions (settled)

- **D-1 — Dedicated `model_symbol_audit` table.** Per user requirement, symbol history lives in its own append-only table (FK→`models`, not `model_symbols`), keeping it isolated from the model-level `model_changes` log and surviving a symbol's hard delete.
- **D-2 — `active` is a stored column.** Per user requirement, `model_symbols.active` distinguishes **deactivate** (row stays, state flips) from **hard-remove** (row deleted). The live universe is `active = true`.
- **D-3 — Two write surfaces.** The Create/Edit form keeps the bulk `PATCH` (sets active universe; drops → deactivate). The Symbols tab uses a fine-grained sub-resource (`POST`/`PATCH`/`DELETE` on `…/symbols/{symbol}`) because activate-vs-delete cannot be expressed by a set-replace alone.
- **D-4 — Symbol weight is out of scope.** The prototype never covered weight, and the user has confirmed it is irrelevant at this stage: it is not displayed, not shown in the audit trail, and not required in any request. The existing `model_symbols.weight` column is left in place (unused by this feature); no weight fields exist on the audit table or `SymbolAuditOut`.
- **D-5 — Backfill on migration.** The migration seeds one `added` audit row per existing symbol (note "Initial universe", dated the model's `created_at`) so every current symbol has a non-empty trail from day one.

---

## Objectives & standard of the expected outcome

- **Data-preserving.** Existing symbols migrate to `active=true`; existing endpoints keep behaviour (`ModelOut.symbols` gains a field + inactive rows, universe UI filters them).
- **Audit isolated & append-only.** All symbol ops land in `model_symbol_audit`; no update/delete of audit rows; trail survives hard delete.
- **Prototype parity.** Symbols tab matches `ModelManagement.jsx` book/trail visually and in interaction (expand, activate/deactivate, add, hard-remove, deep-link).
- **Debt closed.** Both `ponytail:` markers in `service.py` are gone.

---

## Execution & verification

1. **DB** — one Alembic revision: add `model_symbols.active`, create `model_symbol_audit`. Verify `alembic upgrade head` against a copy of the dev DB; existing symbols read back `active=true`.
2. **Backend** — symbol service methods + routes + schema fields; delete the debt markers. Verify each op writes the right `model_symbol_audit` row and `GET /models/{id}` returns `symbols` (incl. inactive) + `symbol_audit`. Existing model tests stay green.
3. **Frontend** — port `SymbolsTab`, wire tab + deep-links + the 3 actions; universe pills filter active. Verify in the running admin app: Symbols tab shows active + inactive rows; expand → trail; deactivate → moves to Inactive + `deactivated` entry; hard-remove → row gone, but re-adding shows prior trail is retained in the model's audit; click a chip → panel opens on that symbol.

**Human gate(s):** the migration runs against the live DB — requires sign-off before applying. Branch review before merge to `main` (human owns `main`).

---

## Rollback

Branch revert restores all code. The Alembic **down-migration** drops `model_symbol_audit` and the `model_symbols.active` column: rollback is **lossy** — recorded symbol history and the active/inactive distinction are lost; the current symbol set (weights) is unaffected. Additive otherwise.

---

## Open questions

### Resolved

- **Q-1 — Backfill?** Yes → D-5 (one `added` row per existing symbol, in the migration).
- **Q-2 — Weight?** Out of scope → D-4 (not displayed/stored beyond the existing column).

### Out of scope (tracked elsewhere)

- **User-authored change notes** — future track; notes auto-generated here (§3).
- **Allocation matrix symbol usage** — proposal 006/007 territory.
