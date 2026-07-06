# 008 — Distinctive Symbols Column · Implementation Details — Frontend

> Status: **DRAFT — pending implementation.**
> Implements: `docs/proposals/008-2026-07-06-symbol-audit-trail.md` § Layer 3 — Frontend
> Layer: Frontend (admin-frontend) — **one layer per file.**
> Sibling layer docs: `docs/implementations/008-symbol-audit-trail-db.md`, `docs/implementations/008-symbol-audit-trail-be.md`
> Execution schedule: `docs/execution-schedules/008-symbol-audit-trail-fe.md`
> Branch: `distinctive-symbol-sections-fe`
> Builds on: BE routes/DTOs (`symbols[].active`, `symbol_audit`, symbol sub-resource) available at the API base the app targets.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/008-2026-07-06-symbol-audit-trail.md` § Layer 3 — Frontend |
| Execution schedule | `docs/execution-schedules/008-symbol-audit-trail-fe.md` |
| Sibling layer impl docs | `…-db.md`, `…-be.md` |
| Builds on | BE-3/BE-5 DTOs+routes; prototype `scratch-crm/megaannum-crm/project/pc/pc-app/ModelManagement.jsx` (SymbolsTab reference) |

Realizes proposal **§Layer 3 A-1/A-2/A-3**, decisions D-3 (fine-grained writes) and D-4 (no weight in UI). Note: audit is a **separate** `symbol_audit` field — the Changes tab needs **no** change.

---

## 2. Branch & session contract

- **Branch:** `distinctive-symbol-sections-fe` — cut from `distinctive-symbol-sections`; merges back (human owns merge).
- **Isolation:** builds against the §7 seam; may be developed against a mocked API response shaped per §7 (BE branch not visible here).
- **Preconditions:**
  - [ ] §7 seam agreed (verbatim from proposal §4).
  - [ ] For live verification: a BE with the symbol routes + `symbol_audit` include reachable at the API base.
- **Read-first inventory:**
  - `admin-frontend/lib/pc/types.ts` — `Model`, `ModelDTO`, `ChangeEntry`, `SymbolDTO` shape (`:159`), `ModelChangeKind` (`:141`).
  - `admin-frontend/lib/pc/models.ts` — `mapDtoToModel`, `normalizeSymbols` (drops weight already).
  - `admin-frontend/server/pc/index.ts` — `getModel`, `updateModel` (add symbol actions here).
  - `admin-frontend/server/endpoints.ts` — `ENDPOINTS.PC` (add SYMBOL(S)).
  - `admin-frontend/components/pc/model-management/ModelDetailPanel.tsx` — tab host (`Tab` union, `TABS`).
  - `admin-frontend/components/pc/model-management/{OverviewTab,ModelTable,CardGrid}.tsx` — chip call sites.
  - `admin-frontend/components/pc/Shared.tsx` — `Ticks` (add `onSymbol`).
  - Reference: `scratch-crm/megaannum-crm/project/pc/pc-app/ModelManagement.jsx` — `SymbolsTab`, `SymbolBookRow`, `SymAuditTrail`, `buildSymbolBook`, `SymStatusChip`, `SummaryPill`.
- **Env:** `admin-frontend/` Next.js; `npm run dev` / `npm run build` / `npm run lint`. Tailwind radius remap applies (memory `tailwind_radius_remap`).
- **Hand-off / exit signal:** FE-1..FE-5 committed; Symbols tab renders book + trail; add/activate/deactivate/remove round-trip; chips deep-link; `npm run build` + `lint` green; PR opened.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- Data flow: page/hook → `server/pc` server action → `server/api-client` → BE; DTO→view mapping only in `lib/pc/models.ts` (no derivation in components).
- Server actions are `"use server"`, return `APIResult<T>` (`{success, data}` | `{success:false, error, code}`).
- Components are Tailwind-classed; design tokens via CSS vars (`bg-surface-container`, `text-secondary`, etc.). Radius remap: design `12→rounded-md`, `8→rounded` (memory).
- Icons from `@/lib/icons` (lucide).
- View types stay string-first (`Model.symbols: string[]`); weight is not carried (D-4, matches existing `normalizeSymbols`).

### 3.2 CI/CD & engineering discipline
- Gates:
  ```bash
  cd admin-frontend
  npm run lint
  npm run build      # tsc + next build
  ```
- Additive: existing `Ticks` callers unchanged because the mapper keeps `Model.symbols` = **active** universe. New surface (`symbolBook`, `symbolAudit`, SymbolsTab) is opt-in.

---

## 4. Architecture

**Target layout:**
```
admin-frontend/
  lib/pc/types.ts     # + SymbolDTO.active, SymbolAuditDTO, ModelDTO.symbol_audit; view SymbolBookEntry, SymbolAuditEntry, Model.symbolBook/symbolAudit
  lib/pc/models.ts    # mapper: symbols=active-only; build symbolBook + symbolAudit
  server/endpoints.ts # + PC.SYMBOLS(id), PC.SYMBOL(id, sym)
  server/pc/index.ts  # + addSymbol / setSymbolActive / removeSymbol; getModel includes symbol_audit
  components/pc/
    Shared.tsx                              # Ticks gains onSymbol
    model-management/SymbolsTab.tsx         # NEW
    model-management/ModelDetailPanel.tsx   # + "symbols" tab, initialOpenSym
    model-management/{OverviewTab,ModelTable,CardGrid}.tsx  # clickable chips / N-changes link
```

**Dependency direction:** components → `lib/pc` (view types/mappers) + `server/pc` (actions). Actions → `server/api-client`.

**External seams:** consumes BE DTOs/routes per §7.

---

## 5. Modules

### 5.1 `lib/pc` (types + mapper)
- **Responsibility:** DTO shapes + DTO→view mapping.
- **Files:** `types.ts`, `models.ts`.
- **Owns:** FE-1.

### 5.2 `server/pc` + `server/endpoints`
- **Responsibility:** symbol write actions + endpoint paths + detail fetch include.
- **Files:** `server/pc/index.ts`, `server/endpoints.ts`.
- **Owns:** FE-3.

### 5.3 `components/pc/model-management` + `Shared`
- **Responsibility:** the Symbols tab, panel wiring, clickable chips.
- **Files:** `SymbolsTab.tsx` (new), `ModelDetailPanel.tsx`, `OverviewTab.tsx`, `ModelTable.tsx`, `CardGrid.tsx`, `Shared.tsx`.
- **Owns:** FE-2, FE-4, FE-5.

---

## 6. Features

### FE-1 — DTO + view types & mapper (Yes)

- **Proposal ref:** § Layer 3 A-1/C
- **Module:** 5.1
- **Files:** modify `lib/pc/types.ts`, `lib/pc/models.ts`
- **Dependencies:** none

**Contract:**
```ts
// types.ts — DTO
export interface SymbolDTO { symbol: string; weight: number | null; active: boolean }
export interface SymbolAuditDTO {
  symbol: string; op: "added" | "deactivated" | "activated" | "removed";
  note: string | null; actor: string | null; version: string | null; created_at: string;
}
export interface ModelDTO {
  /* …existing… */ symbols: SymbolDTO[]; symbol_audit?: SymbolAuditDTO[];
}
// types.ts — view
export interface SymbolBookEntry { symbol: string; active: boolean }
export interface SymbolAuditEntry {
  symbol: string; op: SymbolAuditDTO["op"]; note: string | null; user: string; date: string; ver: string;
}
export interface Model {
  /* …existing… */
  symbols: string[];              // ACTIVE universe only (unchanged for existing callers)
  symbolBook: SymbolBookEntry[];  // NEW — all rows, active flag
  symbolAudit: SymbolAuditEntry[];// NEW — full trail, newest-first
}
```
```ts
// models.ts — mapDtoToModel additions
symbols: (dto.symbols ?? []).filter(s => s.active !== false).map(s => s.symbol),
symbolBook: (dto.symbols ?? []).map(s => ({ symbol: s.symbol, active: s.active !== false })),
symbolAudit: (dto.symbol_audit ?? []).map(a => ({
  symbol: a.symbol, op: a.op, note: a.note, user: a.actor ?? "—", date: a.created_at, ver: a.version ?? "—",
})),
```
**Behavior / invariants:** `symbols` stays active-only → every existing `<Ticks symbols={m.symbols}>` caller keeps showing the live universe unchanged. `normalizeSymbols` may be kept for defensive back-compat or folded into the filter above.

**Done when:** `Model` carries `symbolBook` + `symbolAudit`; existing screens compile with no change.

---

### FE-2 — `SymbolsTab.tsx` (Yes — user req.)

- **Proposal ref:** § Layer 3 A-1
- **Module:** 5.3
- **Files:** create `components/pc/model-management/SymbolsTab.tsx`
- **Dependencies:** FE-1, FE-3 (actions)

**Contract:**
```tsx
export function SymbolsTab({ m, initialOpenSym, onMutate }: {
  m: Model;
  initialOpenSym?: string | null;
  onMutate: () => void;            // re-fetch model detail after a write
}): JSX.Element;

// Build the book (port of prototype buildSymbolBook, weight-free):
//   rows: SymbolBookEntry[] from m.symbolBook
//   per-row trail: m.symbolAudit.filter(a => a.symbol === row.symbol)  // already newest-first
//   sort: active first, then by latest trail date desc
// Render: summary pills (N assets / N active / N inactive),
//   table [Symbol · Input date · Updated by · Status], expandable audit trail,
//   inline "Add symbol" input, per-row Disable/Enable + hover-remove (X).
```
**Behavior / invariants:** no weight anywhere (D-4). "Input date"/"Updated by" = latest trail entry's `date`/`user`. Op badge maps `added/activated`=success, `deactivated`=neutral, `removed`=error. Actions call FE-3 then `onMutate()`.

**Done when:** tab renders the book with expandable trails matching the prototype layout; empty state ("No assets recorded yet.") handled.

---

### FE-3 — Symbol write actions + endpoints (Yes — user req.)

- **Proposal ref:** § Layer 3 A-2
- **Module:** 5.2
- **Files:** modify `server/endpoints.ts`, `server/pc/index.ts`
- **Dependencies:** none

**Contract:**
```ts
// endpoints.ts — PC block
SYMBOLS: (id: string) => `${PC}/models/${id}/symbols`,
SYMBOL:  (id: string, sym: string) => `${PC}/models/${id}/symbols/${encodeURIComponent(sym)}`,

// server/pc/index.ts
export async function addSymbol(id: string, symbol: string): Promise<APIResult<ModelDTO>> {
  return apiClient<ModelDTO>(ENDPOINTS.PC.SYMBOLS(id), { method: "POST", body: JSON.stringify({ symbol }) });
}
export async function setSymbolActive(id: string, symbol: string, active: boolean): Promise<APIResult<ModelDTO>> {
  return apiClient<ModelDTO>(ENDPOINTS.PC.SYMBOL(id, symbol), { method: "PATCH", body: JSON.stringify({ active }) });
}
export async function removeSymbol(id: string, symbol: string): Promise<APIResult<void>> {
  return apiClient<void>(ENDPOINTS.PC.SYMBOL(id, symbol), { method: "DELETE" });
}
// getModel: request the audit — append `?include=materials,changes,symbol_audit`
export async function getModel(id: string): Promise<APIResult<ModelDTO>> {
  return apiClient<ModelDTO>(`${ENDPOINTS.PC.MODEL(id)}?include=materials,changes,symbol_audit`);
}
```
**Behavior / invariants:** POST/PATCH return the refreshed `ModelDTO`; DELETE returns 204 (no body). Symbol is `encodeURIComponent`-escaped in the path.

**Done when:** actions exist and hit the §7 routes; detail fetch includes `symbol_audit`.

---

### FE-4 — Wire Symbols tab into the panel (Yes — user req.)

- **Proposal ref:** § Layer 3 A-1
- **Module:** 5.3
- **Files:** modify `ModelDetailPanel.tsx` (+ its caller page/hook)
- **Dependencies:** FE-2

**Contract:**
```tsx
type Tab = "overview" | "symbols" | "materials" | "changes";
const TABS: [Tab, string][] = [["overview","Overview"],["symbols","Symbols"],["materials","Materials"],["changes","Changes"]];
// panel gains: initialOpenSym?: string | null; renders <SymbolsTab m={m} initialOpenSym={initialOpenSym} onMutate={onRefetch}/>
// caller passes onRefetch (re-run getModel) and initialOpenSym (set by a chip deep-link).
```
**Behavior / invariants:** "Symbols" sits between Overview and Materials (prototype order). `onMutate`/`onRefetch` re-fetches so the book/trail reflect the write.

**Done when:** the tab is selectable and renders `SymbolsTab`; opening the panel with `initialOpenSym` lands on the Symbols tab with that row expanded.

---

### FE-5 — Clickable chips + Overview link (Yes — user req.)

- **Proposal ref:** § Layer 3 A-3
- **Module:** 5.3
- **Files:** modify `Shared.tsx` (`Ticks`), `ModelTable.tsx`, `CardGrid.tsx`, `OverviewTab.tsx`
- **Dependencies:** FE-4 (deep-link target)

**Contract:**
```tsx
// Shared.tsx
export function Ticks({ symbols, onRemove, onSymbol }: {
  symbols: string[]; onRemove?: (s: string) => void; onSymbol?: (s: string) => void;
}): JSX.Element;   // when onSymbol set, each pill is a button → onSymbol(s)

// ModelTable.tsx / CardGrid.tsx symbol column:
<Ticks symbols={m.symbols} onSymbol={(s) => onOpenSymbols(m.id, s)} />
// onOpenSymbols opens the detail panel with tab="symbols" + initialOpenSym=s.

// OverviewTab.tsx Symbols block: "N changes →" link (count = m.symbolAudit.length)
//   that switches the panel to the Symbols tab.
```
**Behavior / invariants:** `onSymbol` is optional — read-only callers (e.g. `Ticks symbols={m.category}`) are unaffected. Click stops propagation so it doesn't also trigger row-open into Overview.

**Done when:** clicking a symbol pill in the table/cards opens the panel on the Symbols tab at that symbol; Overview shows the changes link.

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal §4.1)

```python
class SymbolOut(BaseModel):
    symbol: str
    weight: float | None = None   # existing; not surfaced by this feature
    active: bool = True           # NEW
class SymbolAuditOut(BaseModel):  # NEW
    symbol: str; op: str; note: str | None
    actor: str | None; version: str | None; created_at: datetime
# ModelOut.symbols returns ALL rows (active + inactive), each with `active`.
#   Universe consumers (table/card/overview pills) filter to active === true.
# ModelDetailOut gains: symbol_audit: list[SymbolAuditOut] = []
# op ∈ 'added' | 'deactivated' | 'activated' | 'removed'   (weight NOT tracked — D-4)

# PATCH /api/pc/models/{id}  (form bulk set): new→added, dropped→DEACTIVATED, emits audit.
POST   /api/pc/models/{id}/symbols          body {symbol}    -> 201  # 'added'
PATCH  /api/pc/models/{id}/symbols/{symbol} body {active}    -> 200  # 'deactivated'|'activated'
DELETE /api/pc/models/{id}/symbols/{symbol}                  -> 204  # 'removed'
# All write paths return the updated ModelDetailOut (204 for DELETE).
```
**Field map:** API `symbols[].active` ↔ `model_symbols.active`; book "input date" ↔ latest `symbol_audit.created_at`; "updated by" ↔ latest `symbol_audit.actor`.

### 7.2 How this layer honours the seam
- **Contributes:** consumes `symbols[].active` (filters for universe, keeps all for the book) and `symbol_audit`; calls the 3 write routes with `{symbol}` / `{active}` / (none).
- **Assumes from BE:** `GET …?include=symbol_audit` returns `symbols` (incl. inactive) + `symbol_audit`; writes return refreshed `ModelDetailOut`.
- **Change protocol:** edit proposal §4 first, then re-copy.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Runner:** the repo's FE test setup if present (vitest/jest); otherwise the merge gate is `npm run lint` + `npm run build` (type-check) plus a manual preview check. Command: `npm run build`.
- **Fixtures:** a sample `ModelDTO` shaped per §7 (active + inactive symbols, a few `symbol_audit` rows) fed through `mapDtoToModel`.
- **Isolation:** FE only; the seam is mocked (fake DTO in), no live BE.

### 8.2 Coverage matrix

| Unit | Test | Asserts |
|---|---|---|
| FE-1 | `mapDtoToModel.symbols/book/audit` | `symbols` = active only; `symbolBook` = all with flag; `symbolAudit` mapped |
| FE-2 | `SymbolsTab` render | book rows + expandable trail; empty state; no weight shown |
| FE-3 | action URL/method | POST/PATCH/DELETE hit the right paths; symbol URL-encoded |
| FE-4 | panel tab | "symbols" tab selectable; `initialOpenSym` opens it |
| FE-5 | `Ticks onSymbol` | pill click fires `onSymbol`; read-only callers unaffected |

### 8.3 Tests
#### FE-1 (mapper — the one pure-logic unit; runnable without a DOM)
```ts
test("mapper splits active universe from full book", () => {
  const dto = { id:"1", name:"M",
    symbols:[{symbol:"AAPL",weight:null,active:true},{symbol:"INTC",weight:null,active:false}],
    symbol_audit:[{symbol:"INTC",op:"deactivated",note:"Deactivated",actor:"Wilson",version:"v2",created_at:"2026-02-10"}],
  } as any;
  const m = mapDtoToModel(dto);
  expect(m.symbols).toEqual(["AAPL"]);
  expect(m.symbolBook).toEqual([{symbol:"AAPL",active:true},{symbol:"INTC",active:false}]);
  expect(m.symbolAudit[0]).toMatchObject({symbol:"INTC",op:"deactivated",user:"Wilson"});
});
```
#### FE-2..FE-5
```
// If no FE test runner is configured: cover via `npm run build` (types) + preview verification —
// open a model → Symbols tab shows AAPL (Active) + INTC (Inactive, expandable to "Deactivated").
```

### 8.4 Aggregate gate
- `npm run lint` + `npm run build` green = merge gate (plus FE-1 unit test if a runner exists).

---

## 9. Definition of done & rollback

**Definition of done:**
- [ ] FE-1..FE-5 committed on `distinctive-symbol-sections-fe`; branch green each commit.
- [ ] Symbols tab renders book + trail; add/activate/deactivate/remove round-trip and refresh; chips deep-link; Overview link works.
- [ ] `npm run lint` + `npm run build` green.
- [ ] §7 matches proposal §4 verbatim.
- [ ] PR opened.

**Rollback:** branch revert restores all code. No persisted state owned here — clean revert. (New view fields are additive; removing them reverts screens to the pre-feature surface.)
