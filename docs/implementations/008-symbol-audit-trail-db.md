# 008 — Distinctive Symbols Column · Implementation Details — Database

> Status: **DRAFT — pending implementation.**
> Implements: `docs/proposals/008-2026-07-06-symbol-audit-trail.md` § Layer 1 — Database
> Layer: Database — **one layer per file.**
> Sibling layer docs: `docs/implementations/008-symbol-audit-trail-be.md`, `docs/implementations/008-symbol-audit-trail-fe.md`
> Execution schedule: `docs/execution-schedules/008-symbol-audit-trail-db.md`
> Branch: `distinctive-symbol-sections-db`
> Builds on: Alembic head `2366f5c2d9bd` (0012_convert_models_category_to_json); models in `app/models/pc.py`.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/008-2026-07-06-symbol-audit-trail.md` § Layer 1 — Database |
| Execution schedule | `docs/execution-schedules/008-symbol-audit-trail-db.md` |
| Sibling layer impl docs | `…-be.md`, `…-fe.md` |
| Builds on | Alembic head `2366f5c2d9bd`; `app/models/pc.py` (`Model`, `ModelSymbol`) |

Realizes proposal decisions **D-1** (dedicated audit table), **D-2** (`active` column), **D-4** (no weight), **D-5** (backfill).

---

## 2. Branch & session contract

- **Branch:** `distinctive-symbol-sections-db` — cut from `distinctive-symbol-sections`; merges back into it (human owns the merge).
- **Isolation:** self-contained; shares state with BE/FE only through the §7 seam.
- **Preconditions:**
  - [ ] Alembic head is `2366f5c2d9bd` on the parent branch.
  - [ ] §7 seam agreed (verbatim from proposal §4).
- **Read-first inventory:**
  - `api-backend/app/models/pc.py` — `ModelSymbol` (add `active`), `ModelChangeKind` (untouched — audit is a *new* table, not `model_changes`), add `ModelSymbolAudit` + `SymbolAuditOp`.
  - `api-backend/alembic/versions/2366f5c2d9bd_0012_convert_models_category_to_json.py` — current head, becomes this revision's `down_revision`.
  - `api-backend/alembic/versions/e5f6a7b8c9d0_0008_pc_workspace.py` — reference for the existing `model_symbols` DDL / style.
- **Env:** venv at `api-backend/.venv/` — run `.\.venv\Scripts\alembic.exe` (see memory `api-backend-dev-env`). DB URL env var `DATABASE_URL`.
- **Hand-off / exit signal:** DB-1..DB-3 committed; `alembic upgrade head` then `downgrade -1` run clean on a dev-DB copy; PR opened.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- ORM: SQLAlchemy 2.0 `Mapped[...]` / `mapped_column`, `Base` from `app.core.database`. UUID PKs use `Uuid(native_uuid=False), default=uuid.uuid4`.
- Enums stored non-native: `SAEnum(E, native_enum=False, values_callable=lambda e: [m.value for m in e])` → VARCHAR (matches `ModelStatus`, `ModelChangeKind`).
- Timestamps: `DateTime(timezone=True), server_default=func.now()`.
- **Column ordering:** audit timestamps (`created_at`, `updated_at`) are always the **last** columns in an ORM class; any new attribute is inserted **before** that timestamp block. `model_symbols` has no timestamps today, so `active` goes after `weight` (its last data column); `model_symbol_audit` keeps `created_at` last after its data columns.
- FKs use `ForeignKey("...", ondelete="CASCADE")`; add indexes via `__table_args__`.
- Migration revisions follow the `<hash>_00NN_<slug>.py` filename pattern; keep the `00NN` sequence (`0013`).

### 3.2 CI/CD & engineering discipline
- No lint/type config committed in `api-backend`; gate is: **migration applies up+down clean** and the model imports without error.
  ```bash
  cd api-backend
  .venv/Scripts/alembic.exe upgrade head
  .venv/Scripts/alembic.exe downgrade -1
  .venv/Scripts/alembic.exe upgrade head
  .venv/Scripts/python.exe -c "import app.models.pc"
  ```
- Additive + reversible: `active` is `NOT NULL DEFAULT true` (existing rows safe); new table is additive. Down-migration is documented (§9) and lossy (drops history).

---

## 4. Architecture

**Target layout (unchanged files, additive):**
```
api-backend/app/models/pc.py            # + ModelSymbol.active, + ModelSymbolAudit, + SymbolAuditOp
api-backend/alembic/versions/<hash>_0013_symbol_audit.py   # NEW revision
```

**Dependency direction:** `ModelSymbolAudit.model_id → models.id` (CASCADE). Audit does **not** FK `model_symbols` — it outlives a hard-deleted symbol.

**External seams:** BE reads/writes these via `ModelService`; FE never touches DB. Contract in §7.

---

## 5. Modules

### 5.1 `app.models.pc` (ORM)
- **Responsibility:** table/column definitions for the PC workspace.
- **Files:** `api-backend/app/models/pc.py`.
- **Public surface:** `ModelSymbol` (now with `active`), new `ModelSymbolAudit`, new `SymbolAuditOp` enum.
- **Owns features:** DB-1, DB-2.

### 5.2 Alembic migration
- **Responsibility:** schema DDL + data backfill.
- **Files:** `api-backend/alembic/versions/<hash>_0013_symbol_audit.py`.
- **Owns features:** DB-3.

---

## 6. Features

### DB-1 — `model_symbols.active` column (Yes — user req.)

- **Proposal ref:** § Layer 1 B-1
- **Module:** 5.1
- **Files:** modify `api-backend/app/models/pc.py`
- **Dependencies:** none — parallel-safe

**Contract:**
```python
class ModelSymbol(Base):
    __tablename__ = "model_symbols"
    model_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("models.id", ondelete="CASCADE"), primary_key=True)
    symbol: Mapped[str] = mapped_column(String(32), nullable=False, primary_key=True)
    weight: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)  # unchanged (D-4)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("1"))  # NEW — last data column
    model: Mapped["Model"] = relationship("Model", back_populates="symbols")
```
(`Boolean`, `text` imported from `sqlalchemy`.)

**Behavior / invariants:** live universe = rows with `active is True`. Existing rows default to active. Relationship `Model.symbols` now returns active **and** inactive rows. Column placement follows §3.1 — `active` sits after `weight` (`model_symbols` has no `created_at`/`updated_at`); had it timestamps, `active` would go immediately before them.

**Done when:** `ModelSymbol.active` exists, defaults true; `import app.models.pc` succeeds.

---

### DB-2 — `model_symbol_audit` table + `SymbolAuditOp` (Yes — user req.)

- **Proposal ref:** § Layer 1 B-2
- **Module:** 5.1
- **Files:** modify `api-backend/app/models/pc.py`
- **Dependencies:** none — parallel-safe

**Contract:**
```python
class SymbolAuditOp(str, enum.Enum):
    ADDED = "added"
    DEACTIVATED = "deactivated"
    ACTIVATED = "activated"
    REMOVED = "removed"

class ModelSymbolAudit(Base):
    __tablename__ = "model_symbol_audit"
    id: Mapped[uuid.UUID] = mapped_column(Uuid(native_uuid=False), primary_key=True, default=uuid.uuid4)
    model_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("models.id", ondelete="CASCADE"), nullable=False)
    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    op: Mapped[SymbolAuditOp] = mapped_column(
        SAEnum(SymbolAuditOp, native_enum=False, values_callable=lambda e: [m.value for m in e]),
        nullable=False)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    actor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now())
    __table_args__ = (Index("ix_model_symbol_audit_model_symbol", "model_id", "symbol"),)
```
**No weight columns** (D-4). FK → `models`, not `model_symbols`.

**Behavior / invariants:** append-only (no update/delete path). Trail survives a symbol row's hard delete; cascades only when the model is deleted.

**Done when:** table + enum defined; `import app.models.pc` succeeds.

---

### DB-3 — Alembic revision `0013` (create + backfill) (Yes — user req.)

- **Proposal ref:** § Layer 1 B-1/B-2/B-2b, D-5
- **Module:** 5.2
- **Files:** create `api-backend/alembic/versions/<hash>_0013_symbol_audit.py`
- **Dependencies:** DB-1, DB-2 (models define the target shape)

**Contract (upgrade):**
```python
down_revision = "2366f5c2d9bd"

def upgrade():
    op.add_column("model_symbols",
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("1")))
    op.create_table("model_symbol_audit",
        sa.Column("id", ...), sa.Column("model_id", ..., sa.ForeignKey("models.id", ondelete="CASCADE"), nullable=False),
        sa.Column("symbol", sa.String(32), nullable=False),
        sa.Column("op", sa.String(), nullable=False),
        sa.Column("note", sa.String(255)), sa.Column("actor", sa.String(255)), sa.Column("version", sa.String(32)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_index("ix_model_symbol_audit_model_symbol", "model_symbol_audit", ["model_id", "symbol"])
    # D-5 backfill: one 'added' row per existing symbol, dated the model's created_at.
    op.execute("""
        INSERT INTO model_symbol_audit (id, model_id, symbol, op, note, actor, version, created_at)
        SELECT <uuid>, ms.model_id, ms.symbol, 'added', 'Initial universe', NULL, m.version, m.created_at
        FROM model_symbols ms JOIN models m ON m.id = ms.model_id
    """)  # <TODO: id generation per dialect — see Behavior below>

def downgrade():
    op.drop_index("ix_model_symbol_audit_model_symbol", table_name="model_symbol_audit")
    op.drop_table("model_symbol_audit")
    op.drop_column("model_symbols", "active")
```

**Behavior / invariants:**
- Backfill inserts exactly one row per existing `model_symbols` row; `created_at = models.created_at`, `version = models.version`, `actor = NULL`.
- **ID generation:** SQLite dev DB has no `gen_random_uuid()`. Simplest portable path — do the backfill in Python inside the migration (iterate a `SELECT` and `bulk_insert` with `uuid.uuid4()`), rather than raw SQL. Prefer that over a dialect-specific UUID function.
- `server_default=text("1")` works for both SQLite and Postgres booleans.

**Done when:** `alembic upgrade head` creates the table + column and backfills; `downgrade -1` cleanly drops both; re-`upgrade` works.

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal §4.1)

```python
# ── DB ─────────────────────────────────────────────────────────────────────
# model_symbols gains a nullable-false boolean:
#   active BOOLEAN NOT NULL DEFAULT true      # existing rows migrate to true
# The relationship now holds BOTH active and inactive rows.

# New append-only table:
#   model_symbol_audit(
#     id UUID pk, model_id UUID fk models.id ON DELETE CASCADE,  # NOT fk to model_symbols
#     symbol VARCHAR(32), op VARCHAR,  # 'added'|'deactivated'|'activated'|'removed'
#     note VARCHAR(255), actor VARCHAR(255), version VARCHAR(32),
#     created_at TIMESTAMPTZ default now(), INDEX (model_id, symbol))
# FK targets models (not model_symbols) so a hard-deleted symbol keeps its trail.
# NOTE: symbol WEIGHT is not tracked (D-4). model_symbols.weight stays, unused here.

# ── API DTOs ─────────────────────────────────────────────────────────────────
class SymbolOut(BaseModel):
    symbol: str
    weight: float | None = None   # existing; not surfaced by this feature
    active: bool = True           # NEW
class SymbolAuditOut(BaseModel):  # NEW
    symbol: str; op: str; note: str | None
    actor: str | None; version: str | None; created_at: datetime
# ModelOut.symbols returns ALL rows (active + inactive), each with `active`.
# ModelDetailOut gains: symbol_audit: list[SymbolAuditOut] = []

# ── Routes ────────────────────────────────────────────────────────────────────
# PATCH /api/pc/models/{id}  (form bulk set): new→added, dropped→DEACTIVATED, emits audit.
POST   /api/pc/models/{id}/symbols          body {symbol}    -> 201  # 'added'
PATCH  /api/pc/models/{id}/symbols/{symbol} body {active}    -> 200  # 'deactivated'|'activated'
DELETE /api/pc/models/{id}/symbols/{symbol}                  -> 204  # 'removed'
```
**Field map:** API `symbols[].weight` ↔ `model_symbols.weight`; `symbols[].active` ↔ `model_symbols.active`; book "input date" ↔ latest `model_symbol_audit.created_at`; "updated by" ↔ latest `model_symbol_audit.actor`.

### 7.2 How this layer honours the seam
- **Contributes:** `model_symbols.active`, `model_symbol_audit` (the storage the DTOs project from).
- **Assumes from BE:** only writes `op` ∈ the 4 values and well-formed rows.
- **Change protocol:** edit the proposal §4 first, then re-copy here.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Runner:** `pytest` if present, else a plain `python` script asserting on an in-memory SQLite `Base.metadata.create_all`. Command: `cd api-backend && .venv/Scripts/python.exe -m pytest -q` (or the script).
- **Fixtures:** in-memory SQLite engine; `Base.metadata.create_all(engine)`.
- **Isolation:** hermetic; DB-layer only — no BE/FE imports.

### 8.2 Coverage matrix

| Unit | Test | Asserts |
|---|---|---|
| DB-1 | `test_model_symbol_active_default` | new `ModelSymbol` is `active=True` |
| DB-2 | `test_symbol_audit_insert` | audit row persists; `op` round-trips as string; survives symbol delete |
| DB-3 | `test_migration_up_down` (manual/CI) | upgrade+downgrade clean; backfill count == symbol count |

### 8.3 Tests
#### DB-1 / DB-2
```python
def test_model_symbol_active_default(session):
    m = Model(name="M"); s = ModelSymbol(symbol="AAPL"); m.symbols.append(s)
    session.add(m); session.commit()
    assert s.active is True

def test_symbol_audit_survives_symbol_delete(session):
    m = Model(name="M"); m.symbols.append(ModelSymbol(symbol="AAPL"))
    session.add(m); session.commit()
    session.add(ModelSymbolAudit(model_id=m.id, symbol="AAPL", op=SymbolAuditOp.ADDED))
    m.symbols.clear(); session.commit()  # hard delete the symbol row
    assert session.query(ModelSymbolAudit).filter_by(symbol="AAPL").count() == 1
```
#### DB-3
```bash
# CI/manual gate — see §3.2 commands; assert backfill count:
# SELECT count(*) FROM model_symbol_audit == SELECT count(*) FROM model_symbols   (op='added')
```

### 8.4 Aggregate gate
- Migration up+down clean and `import app.models.pc` are the merge gates.

---

## 9. Definition of done & rollback

**Definition of done:**
- [ ] DB-1..DB-3 committed on `distinctive-symbol-sections-db`; branch green at each commit.
- [ ] `alembic upgrade head` / `downgrade -1` clean on a dev-DB copy; backfill count verified.
- [ ] §7 matches proposal §4 verbatim.
- [ ] PR opened.

**Rollback:** branch revert restores code. `alembic downgrade -1` drops `model_symbol_audit` and `model_symbols.active` — **lossy**: all recorded symbol history and the active/inactive distinction are lost; current symbols/weights unaffected.
