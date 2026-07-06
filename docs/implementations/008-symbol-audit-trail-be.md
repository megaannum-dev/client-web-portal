# 008 — Distinctive Symbols Column · Implementation Details — Backend

> Status: **DRAFT — pending implementation.**
> Implements: `docs/proposals/008-2026-07-06-symbol-audit-trail.md` § Layer 2 — Backend
> Layer: Backend — **one layer per file.**
> Sibling layer docs: `docs/implementations/008-symbol-audit-trail-db.md`, `docs/implementations/008-symbol-audit-trail-fe.md`
> Execution schedule: `docs/execution-schedules/008-symbol-audit-trail-be.md`
> Branch: `distinctive-symbol-sections-be`
> Builds on: DB layer (`model_symbols.active`, `model_symbol_audit`) applied to the target DB; `app/libs/trade_models/{service,router,schemas}.py`.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/008-2026-07-06-symbol-audit-trail.md` § Layer 2 — Backend |
| Execution schedule | `docs/execution-schedules/008-symbol-audit-trail-be.md` |
| Sibling layer impl docs | `…-db.md`, `…-fe.md` |
| Builds on | DB-1..DB-3 migration applied; `ModelService`, `router.py`, `schemas.py` |

Realizes proposal **§Layer 2 B/C/D**, closing the two `ponytail:` markers (`service.py:103`, `:142`). Decisions D-3 (two write surfaces), D-4 (no weight audit), D-5 (create seeds "Initial universe").

---

## 2. Branch & session contract

- **Branch:** `distinctive-symbol-sections-be` — cut from `distinctive-symbol-sections`; merges back (human owns merge).
- **Isolation:** builds against the §7 seam. The DB migration must be **applied to the dev DB** the session runs against (a precondition, not a code dependency on the `-db` branch).
- **Preconditions:**
  - [ ] `model_symbols.active` + `model_symbol_audit` exist in the target DB (DB layer's migration applied).
  - [ ] §7 seam agreed (verbatim from proposal §4).
- **Read-first inventory:**
  - `api-backend/app/libs/trade_models/service.py` — `create_model` (:85), `edit_model` (:130), the two `ponytail:` markers (:103, :142), `resolve_actor_names` (:262).
  - `api-backend/app/libs/trade_models/schemas.py` — `SymbolIn`/`SymbolOut` (:22-36), `ModelOut` (:78), `ModelDetailOut` (:156).
  - `api-backend/app/libs/trade_models/router.py` — model routes, `get_model` `include` mechanism, `require_action` guards.
  - `api-backend/app/models/pc.py` — `ModelSymbol`, `ModelSymbolAudit`, `SymbolAuditOp` (from DB layer).
  - `api-backend/app/libs/auth/actions.py` — `Action.MODEL_MANAGE` / `MODEL_VIEW`.
- **Env:** venv `api-backend/.venv/`; run `.\.venv\Scripts\python.exe`, `uvicorn` via venv.
- **Hand-off / exit signal:** BE-1..BE-5 committed; each symbol op writes the right audit row; `GET /models/{id}?include=symbol_audit` returns `symbols` (incl. inactive) + `symbol_audit`; markers deleted; PR opened.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- Layering: `router → service → ORM`. Routes are thin; logic in `ModelService`. Routes guarded by `require_action(Action.X)` (writes → `MODEL_MANAGE`, reads → `MODEL_VIEW`).
- `actor` passed as `actor.firebase_uid` (string); names resolved later via `resolve_actor_names`.
- Pydantic v2: `model_config = {"from_attributes": True}`; `field_validator(..., mode="before")` for coercion (see `_coerce_symbols`).
- Detail endpoint uses `include=materials,changes` query param to attach optional collections.
- Errors: `HTTPException(status.HTTP_4xx, "msg")` — `get_model` raises 404 already.

### 3.2 CI/CD & engineering discipline
- No committed lint/type config. Gate: app imports + routes register + targeted unit tests.
  ```bash
  cd api-backend
  .venv/Scripts/python.exe -c "import app.main"
  .venv/Scripts/python.exe -m pytest -q app/libs/trade_models  # if tests present
  ```
- Additive: new routes alongside existing; `edit_model` behavior extended (adds audit) without changing its response shape. Each unit is an atomic commit.

---

## 4. Architecture

**Target layout (all existing files, additive):**
```
app/libs/trade_models/
  schemas.py   # + SymbolOut.active, + SymbolAuditOut, + ModelDetailOut.symbol_audit, + SymbolAdd/SymbolPatch bodies
  service.py   # + add_symbol/set_symbol_active/remove_symbol/list_symbol_audit; audit in create/edit; delete markers
  router.py    # + POST/PATCH/DELETE /models/{id}/symbols[/{symbol}]; symbol_audit include
```

**Dependency direction:** `router → service → app.models.pc`. No new module.

**External seams:** consumes DB tables from the DB layer; exposes the routes/DTOs in §7 to FE.

---

## 5. Modules

### 5.1 `app.libs.trade_models.service` (`ModelService`)
- **Responsibility:** all symbol mutations + audit writes.
- **Files:** `service.py`.
- **Public surface:** `add_symbol`, `set_symbol_active`, `remove_symbol`, `list_symbol_audit`; extended `create_model`/`edit_model`.
- **Owns:** BE-1, BE-2, BE-4.

### 5.2 `app.libs.trade_models.schemas`
- **Responsibility:** wire DTOs.
- **Files:** `schemas.py`.
- **Public surface:** `SymbolOut.active`, `SymbolAuditOut`, `ModelDetailOut.symbol_audit`, request bodies.
- **Owns:** BE-3.

### 5.3 `app.libs.trade_models.router`
- **Responsibility:** HTTP surface.
- **Files:** `router.py`.
- **Public surface:** the 3 new symbol routes + `symbol_audit` include.
- **Owns:** BE-5.

---

## 6. Features

### BE-1 — Symbol audit helper + create/edit auditing (Yes — user req.)

- **Proposal ref:** § Layer 2 B
- **Module:** 5.1
- **Files:** modify `service.py`
- **Dependencies:** none (uses DB tables per §7)

**Contract:**
```python
def _log_symbol(self, model_id, symbol, op: SymbolAuditOp, *, note, actor, version) -> None:
    self.db.add(ModelSymbolAudit(model_id=model_id, symbol=symbol, op=op,
                                 note=note, actor=actor, version=version))

# create_model: after symbols are set, emit one 'added' per symbol (note "Initial universe").
# edit_model bulk symbols path: diff old active set vs new (by symbol):
#   added   -> insert ModelSymbol(active=True) + _log_symbol(..., ADDED,       "Added to universe")
#   dropped -> set existing row active=False   + _log_symbol(..., DEACTIVATED, "Deactivated")   # NEVER delete
# Weight is NOT diffed or audited (D-4). Delete the two `ponytail:` markers (:103, :142).
```
**Behavior / invariants:** bulk edit never hard-deletes; a symbol dropped from the form set is deactivated. `actor=actor.firebase_uid`, `version=model.version`. All writes in the same transaction/commit as the mutation.

**Done when:** creating a model logs `added` per symbol; PATCH-ing the form set to drop a symbol flips it to `active=False` and logs `deactivated`; both markers gone.

---

### BE-2 — Fine-grained symbol service methods (Yes — user req.)

- **Proposal ref:** § Layer 2 B, D
- **Module:** 5.1
- **Files:** modify `service.py`
- **Dependencies:** BE-1 (`_log_symbol`)

**Contract:**
```python
def add_symbol(self, model_id: uuid.UUID, symbol: str, *, actor: str) -> Model:
    """Insert active symbol (idempotent-ish: 409 if already present & active). Logs ADDED."""
def set_symbol_active(self, model_id, symbol: str, active: bool, *, actor: str) -> Model:
    """Flip active flag on the row. Logs ACTIVATED/DEACTIVATED. 404 if row absent."""
def remove_symbol(self, model_id, symbol: str, *, actor: str) -> None:
    """Hard-delete the model_symbols row. Logs REMOVED (audit survives). 404 if absent."""
def list_symbol_audit(self, model_id: uuid.UUID) -> list[ModelSymbolAudit]:
    """All audit rows for the model, newest-first."""
```
**Behavior / invariants:** `symbol` uppercased before lookup/insert. `add_symbol` on an existing **inactive** row reactivates it (→ `set_symbol_active(True)`) rather than duplicating. `remove_symbol` logs `REMOVED` *before* deleting the row (so `version`/actor captured). All raise 404 via the router when the symbol/model is missing.

**Done when:** each method mutates the row and writes exactly one audit entry with the correct `op`.

---

### BE-3 — Wire DTOs (Yes)

- **Proposal ref:** § Layer 2 C-1
- **Module:** 5.2
- **Files:** modify `schemas.py`
- **Dependencies:** none

**Contract:**
```python
class SymbolOut(BaseModel):
    symbol: str
    weight: float | None = None
    active: bool = True                       # NEW
    model_config = {"from_attributes": True}

class SymbolAuditOut(BaseModel):             # NEW
    symbol: str
    op: str
    note: str | None
    actor: str | None
    version: str | None
    created_at: datetime
    model_config = {"from_attributes": True}

class ModelDetailOut(ModelOut):
    materials: list[MaterialOut] | None = None
    changes: list[ChangeOut] | None = None
    symbol_audit: list[SymbolAuditOut] | None = None   # NEW

# ModelOut.symbols already list[SymbolOut]; now includes inactive rows (active flag distinguishes).
class SymbolAddIn(BaseModel):   symbol: str            # POST body
class SymbolPatchIn(BaseModel): active: bool           # PATCH body
```
**Behavior / invariants:** `ModelOut.symbols` serializes all `model.symbols` rows (relationship now returns active+inactive). `op` serialized as its string value.

**Done when:** `GET /models/{id}` returns each symbol with `active`; `include=symbol_audit` attaches the trail.

---

### BE-4 — `create_model` seeds initial universe (Yes — user req.)

- **Proposal ref:** § Layer 2 B, D-5
- **Module:** 5.1
- **Files:** modify `service.py`
- **Dependencies:** BE-1

**Contract:** in `create_model`, after `model.symbols` is populated and flushed (so `model.id` exists), call `_log_symbol(model.id, s, ADDED, note="Initial universe", actor=actor, version=model.version)` per symbol.

**Done when:** a freshly created model's `symbol_audit` has one `added` row per initial symbol.

---

### BE-5 — Symbol sub-resource routes + `symbol_audit` include (Yes — user req.)

- **Proposal ref:** § Layer 2 D
- **Module:** 5.3
- **Files:** modify `router.py`
- **Dependencies:** BE-2, BE-3

**Contract:**
```python
@router.post("/models/{model_id}/symbols", response_model=ModelDetailOut, status_code=201)
def add_symbol(model_id: uuid.UUID, body: SymbolAddIn, service=..., actor=Depends(require_action(Action.MODEL_MANAGE))):
    service.add_symbol(model_id, body.symbol, actor=actor.firebase_uid)
    return _detail_with_audit(service, model_id)

@router.patch("/models/{model_id}/symbols/{symbol}", response_model=ModelDetailOut)
def set_symbol(model_id, symbol: str, body: SymbolPatchIn, service=..., actor=Depends(require_action(Action.MODEL_MANAGE))):
    service.set_symbol_active(model_id, symbol, body.active, actor=actor.firebase_uid)
    return _detail_with_audit(service, model_id)

@router.delete("/models/{model_id}/symbols/{symbol}", status_code=204)
def delete_symbol(model_id, symbol: str, service=..., actor=Depends(require_action(Action.MODEL_MANAGE))):
    service.remove_symbol(model_id, symbol, actor=actor.firebase_uid)
    return Response(status_code=204)

# get_model: add "symbol_audit" to the include set →
#   if "symbol_audit" in includes: result.symbol_audit = service.list_symbol_audit(model_id)
```
`_detail_with_audit` builds `ModelDetailOut` with `symbol_audit` attached (mirrors the existing include assembly).

**Behavior / invariants:** all writes guarded by `MODEL_MANAGE`; 404 when model/symbol absent; POST returns 201, DELETE 204. Response is the refreshed detail so FE re-renders the book in one round-trip.

**Done when:** the 3 routes exist, registered, guarded; `include=symbol_audit` works.

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
# ModelDetailOut gains: symbol_audit: list[SymbolAuditOut] = []
# op ∈ 'added' | 'deactivated' | 'activated' | 'removed'   (weight NOT tracked — D-4)

# PATCH /api/pc/models/{id}  (form bulk set): new→added, dropped→DEACTIVATED, emits audit.
POST   /api/pc/models/{id}/symbols          body {symbol}    -> 201  # 'added'
PATCH  /api/pc/models/{id}/symbols/{symbol} body {active}    -> 200  # 'deactivated'|'activated'
DELETE /api/pc/models/{id}/symbols/{symbol}                  -> 204  # 'removed'
# All write paths return the updated ModelDetailOut (204 for DELETE).
```
**Field map:** API `symbols[].active` ↔ `model_symbols.active`; "input date" ↔ latest `model_symbol_audit.created_at`; "updated by" ↔ latest `model_symbol_audit.actor`.

### 7.2 How this layer honours the seam
- **Contributes:** serves `SymbolOut.active`, `ModelDetailOut.symbol_audit`, and the 3 routes; emits audit rows on every op.
- **Assumes from DB:** `model_symbols.active` + `model_symbol_audit` exist per §7.
- **Assumes from FE:** POST sends `{symbol}`, PATCH sends `{active}`; FE filters `active` for universe display.
- **Change protocol:** edit proposal §4 first, then re-copy.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Runner:** `pytest` with FastAPI `TestClient` + in-memory SQLite (`create_all`). Command: `.venv/Scripts/python.exe -m pytest -q app/libs/trade_models`.
- **Fixtures:** a `ModelService` bound to an in-memory session + a fake `FileStorage`; auth dependency overridden to a stub user with `MODEL_MANAGE`.
- **Isolation:** BE only; no FE. DB tables created from `Base.metadata` (DB layer's models are in-repo on this branch via `app.models.pc`).

### 8.2 Coverage matrix

| Unit | Test | Asserts |
|---|---|---|
| BE-1 | `test_edit_drop_symbol_deactivates_and_logs` | dropped symbol → `active=False` + `deactivated` audit; no hard delete |
| BE-2 | `test_add_activate_remove_ops` | each op flips state + writes correct `op`; `remove` deletes row, audit remains |
| BE-3 | `test_symbol_out_has_active` | `GET` returns `active`; `include=symbol_audit` attaches trail |
| BE-4 | `test_create_seeds_initial_universe` | new model → one `added` per symbol |
| BE-5 | `test_symbol_routes_guarded_and_codes` | 201/200/204; 404 on missing; `MODEL_MANAGE` required |

### 8.3 Tests
#### BE-1 / BE-4
```python
def test_create_seeds_initial_universe(service, actor):
    m = service.create_model(name="M", symbols=[{"symbol": "AAPL"}, {"symbol": "MSFT"}], actor=actor)
    audit = service.list_symbol_audit(m.id)
    assert sorted((a.symbol, a.op.value) for a in audit) == [("AAPL","added"), ("MSFT","added")]

def test_edit_drop_symbol_deactivates_and_logs(service, actor):
    m = service.create_model(name="M", symbols=[{"symbol":"AAPL"}], actor=actor)
    service.edit_model(m.id, {"symbols":[]}, actor=actor)
    row = next(s for s in service.get_model(m.id).symbols if s.symbol=="AAPL")
    assert row.active is False
    assert any(a.op.value=="deactivated" for a in service.list_symbol_audit(m.id))
```
#### BE-2 / BE-5
```python
def test_add_activate_remove_ops(service, actor):
    m = service.create_model(name="M", symbols=[], actor=actor)
    service.add_symbol(m.id, "nvda", actor=actor)            # lowercased in → NVDA
    assert any(s.symbol=="NVDA" and s.active for s in service.get_model(m.id).symbols)
    service.set_symbol_active(m.id, "NVDA", False, actor=actor)
    service.remove_symbol(m.id, "NVDA", actor=actor)
    assert all(s.symbol!="NVDA" for s in service.get_model(m.id).symbols)   # row gone
    ops = [a.op.value for a in service.list_symbol_audit(m.id) if a.symbol=="NVDA"]
    assert ops == ["removed","deactivated","added"]  # newest-first
```

### 8.4 Aggregate gate
- All BE tests green + `import app.main` succeeds = merge gate.

---

## 9. Definition of done & rollback

**Definition of done:**
- [ ] BE-1..BE-5 committed on `distinctive-symbol-sections-be`; branch green each commit.
- [ ] Both `ponytail:` markers deleted.
- [ ] §8 tests pass; `import app.main` clean.
- [ ] §7 matches proposal §4 verbatim.
- [ ] PR opened.

**Rollback:** branch revert restores all code (routes, service methods, DTO fields). No new persisted schema owned here (that's the DB layer); no data migration in this layer. Clean revert.
