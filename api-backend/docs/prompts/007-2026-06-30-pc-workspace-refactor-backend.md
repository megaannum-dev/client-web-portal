# 007 PC Workspace Refactor — Backend Layer Implementation

> **Orchestration prompt — write this to a fresh Claude Code session.**
> The session that reads this prompt acts as the **orchestrator** and must not
> implement any feature directly; it delegates every feature to a sub-agent via
> the Agent tool.

---

## Preamble

### What this prompt covers

Layer 2 (Backend) of proposal
`api-backend/docs/proposals/007-2026-06-30-pc-workspace-refactor.md`.

**Out of scope here:**
- DB migrations (Layer 1) — must be applied first; this layer assumes the
  `allocation_period_models` table and `model_materials.version_no` column from
  revision `0009_pc_workspace_db_refactor.py` already exist in the database.
  If they do not, features C-3 and B will note the gap but must still implement
  the logic so it is ready for the migration.
- Frontend changes (Layer 3).

### Branch constraint

All work stays on the **current git branch**.
Before spawning any sub-agent, run `git rev-parse --abbrev-ref HEAD` to capture
the working branch name (`WORKING_BRANCH`) and pass it to every sub-agent.
Sub-agents must never touch `main` and must not push or open PRs.

### Dependency on DB Layer 1

Feature B (matrix query optimization) references `AllocationPeriodModel`
(the `allocation_period_models` table added in migration 0009). If this table
does not yet exist in the live DB, the feature must still add the
`AllocationPeriodModel` ORM model import and write the N+1 fix using it — the
code will be correct once the migration runs.

### Environment

| Item | Value |
|---|---|
| Repo root | `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal\` |
| Backend root | `api-backend\` |
| Python venv | `api-backend\.venv\` |
| Activate venv (PowerShell) | `api-backend\.venv\Scripts\Activate.ps1` |
| Activate venv (Bash) | `source api-backend/.venv/Scripts/activate` |
| Shell | PowerShell primary; Bash also available |
| OS | Windows 11 |

When running Python checks, always `cd api-backend` first and activate the venv.

---

## Role

You are the **orchestrator** for this backend refactor. You:

1. **First:** run `git rev-parse --abbrev-ref HEAD` to capture `WORKING_BRANCH`.
   Include this in every sub-agent prompt.
2. Read this prompt top-to-bottom.
3. Execute the phase graph in the "Execution plan" section.
4. For each feature, spawn exactly one sub-agent via the Agent tool with a
   self-contained prompt (the sub-agent has no memory of this session).
5. Wait for Phase 1 before starting Phase 2; wait for feature B within Phase 2
   before starting Phase 3.
6. After all feature agents complete, spawn the validation agent and testing
   agent in **parallel** (Phase 4 — see "Validation & testing" section at the end).
7. Report final status. Do not push.

You do **not** write or edit any source files yourself.

---

## Features

### Feature A — Module split (Phase 1, sequential foundation)

**Proposal ref:** Layer 2 § A

**What to create:**

```
api-backend/app/libs/trade_models/
    __init__.py
    router.py       # /api/pc/models/* + /api/pc/subscriptions/*
    service.py      # ModelService, SubscriptionService
    repository.py   # ModelRepository, MaterialRepository, SubscriptionRepository
    storage.py      # verbatim move from app/libs/pc/storage.py
    schemas.py      # ModelCreate, ModelUpdate, ModelOut, ModelsListOut,
                    # MaterialOut, ChangeOut, SubscriptionOut

api-backend/app/libs/allocation_matrix/
    __init__.py
    router.py       # /api/pc/allocation/*
    service.py      # AllocationService
    repository.py   # AllocationRepository, MatrixReadRepository
                    # (rename _SubscriptionCell → AllocationCellRow publicly)
    cache.py        # verbatim move from app/libs/pc/cache.py
    scheduler.py    # verbatim move from app/libs/pc/scheduler.py
    schemas.py      # PeriodCreate, PeriodOut, PeriodLiteOut,
                    # AllocationViewOut, AllocationCellOut,
                    # AllocationClientOut, AllocationModelOut
```

**Source files to read first:**
- `api-backend/app/libs/pc/service.py`
- `api-backend/app/libs/pc/repository.py`
- `api-backend/app/libs/pc/router.py`
- `api-backend/app/libs/pc/cache.py`
- `api-backend/app/libs/pc/scheduler.py`
- `api-backend/app/libs/pc/storage.py`
- `api-backend/app/schemas/pc.py`
- `api-backend/app/main.py`

**Exact changes:**

1. **Create `app/libs/trade_models/__init__.py`** — empty.

2. **Create `app/libs/trade_models/schemas.py`** — move all model/material/change
   schemas from `app/schemas/pc.py`:
   - `ModelCreate`, `ModelUpdate`, `ModelOut`, `ModelsListOut`
   - `MaterialOut`
   - `ChangeOut`
   - Add `ModelStatusUpdate` schema (for D-1, used by PATCH):
     ```python
     class ModelStatusUpdate(BaseModel):
         status: ModelStatus
     ```
   - Keep all existing fields verbatim. Add the 8 new DB B-1b fields to
     `ModelCreate`, `ModelUpdate`, `ModelOut` (all nullable):
     `description: str | None = None`, `underlyings: str | None = None`,
     `risk: str | None = None`, `liquidity: str | None = None`,
     `reporting: str | None = None`, `nav_perf: str | None = None`,
     `mgmt_fee: float | None = None`, `incentive_fee: float | None = None`.

3. **Create `app/libs/allocation_matrix/schemas.py`** — move allocation schemas
   from `app/schemas/pc.py`:
   - `PeriodCreate`, `PeriodOut`
   - Extend `PeriodLiteOut` to add `confirmed_at: datetime | None = None` and
     `confirmed_by: str | None = None` (D-2 fold).
   - `AllocationCellOut`, `AllocationClientOut`, `AllocationModelOut`
   - `AllocationViewOut` (keep `from_dict` classmethod verbatim)
   - Add `PeriodStatusUpdate` schema (for D-3):
     ```python
     class PeriodStatusUpdate(BaseModel):
         status: PeriodStatus
     ```

4. **Create `app/libs/trade_models/repository.py`** — move `ModelRepository`,
   `MaterialRepository` (new name; split from existing `ModelRepository`
   material methods), `SubscriptionRepository` from
   `app/libs/pc/repository.py`. Rename private `_SubscriptionCell`,
   `_RosterRow`, `_WatermarkResult` — keep names as-is in `trade_models`
   (they are internal). `SubscriptionRepository` moves entirely here.

5. **Create `app/libs/allocation_matrix/repository.py`** — move
   `AllocationRepository` from `app/libs/pc/repository.py`.
   - Rename `_SubscriptionCell` (imported from trade_models) to
     `AllocationCellRow` in this module — export it publicly.
   - Add a stub `MatrixReadRepository` class (empty for now; features B and
     C-1 will populate it):
     ```python
     class MatrixReadRepository:
         def __init__(self, db: Session) -> None:
             self.db = db
     ```

6. **Create `app/libs/trade_models/service.py`** — move `ModelService` from
   `app/libs/pc/service.py`. Update imports to use
   `app.libs.trade_models.repository` and `app.libs.trade_models.schemas`.
   Keep `_TRACKED_FIELDS = ("name", "manager", "model_size", "intro", "symbols")`.

7. **Create `app/libs/allocation_matrix/service.py`** — move `AllocationService`
   and `_build_matrix` from `app/libs/pc/service.py`. Update imports.
   Replace `from app.libs.pc.repository import _SubscriptionCell` with
   `from app.libs.allocation_matrix.repository import AllocationCellRow`.
   Replace `_SubscriptionCell(...)` with `AllocationCellRow(...)`.

8. **Create `app/libs/trade_models/storage.py`** — verbatim copy of
   `app/libs/pc/storage.py` with no changes.

9. **Create `app/libs/allocation_matrix/cache.py`** — verbatim copy of
   `app/libs/pc/cache.py` with no changes.

10. **Create `app/libs/allocation_matrix/scheduler.py`** — copy
    `app/libs/pc/scheduler.py`; update the internal import:
    ```python
    # BEFORE:
    from app.libs.pc.repository import AllocationRepository
    # AFTER:
    from app.libs.allocation_matrix.repository import AllocationRepository
    ```
    Also update `_try_open_period` to call `AllocationService.create_period`
    instead of `repo.create_period + db.commit`:
    ```python
    async def _try_open_period(label: str) -> None:
        from app.core.database import SessionLocal
        from app.libs.allocation_matrix.service import AllocationService

        db = SessionLocal()
        try:
            svc = AllocationService(db)
            svc.create_period(label)
            logger.info("PC scheduler: auto-opened allocation period '%s'", label)
        except Exception as exc:
            if "already exists" in str(exc) or getattr(exc, "status_code", None) == 409:
                logger.info("PC scheduler: skipping — open period already exists")
            else:
                db.rollback()
                logger.exception("PC scheduler: failed to auto-open period '%s'", label)
        finally:
            db.close()
    ```

11. **Create `app/libs/trade_models/router.py`** — move all model routes from
    `app/libs/pc/router.py`. Keep the router prefix `/pc` and tags `["pc"]`.
    Update all imports to `app.libs.trade_models.*`. Import schemas from
    `app.libs.trade_models.schemas`.

12. **Create `app/libs/allocation_matrix/router.py`** — move all allocation
    routes from `app/libs/pc/router.py`. Keep router prefix `/pc` and tags
    `["pc"]`. Update all imports to `app.libs.allocation_matrix.*`. Import
    schemas from `app.libs.allocation_matrix.schemas`.
    Replace inline `AllocationRepository(db)` usage (the direct `db.query`
    block in `get_allocation`) with `service.list_periods()` and a local
    period-label lookup — this is a stub; feature C-1 will clean it properly.

13. **Update `app/main.py`**:
    - Replace:
      ```python
      from app.libs.pc.router import router as pc_router
      from app.libs.pc.scheduler import start_scheduler
      ```
      With:
      ```python
      from app.libs.trade_models.router import router as trade_models_router
      from app.libs.allocation_matrix.router import router as allocation_matrix_router
      from app.libs.allocation_matrix.scheduler import start_scheduler
      ```
    - Replace `app.include_router(pc_router, prefix="/api")` with:
      ```python
      app.include_router(trade_models_router, prefix="/api")
      app.include_router(allocation_matrix_router, prefix="/api")
      ```
    - Keep `import app.models.pc` line unchanged.

14. **Delete `app/libs/pc/`** — remove the entire directory after all new files
    are created and verified.

15. **Delete `app/schemas/pc.py`** — after schemas are split into the two new
    `schemas.py` files.

**Dependency direction:** `allocation_matrix` imports from `trade_models` for
`AllocationCellRow` (formerly `_SubscriptionCell`). `trade_models` must **not**
import from `allocation_matrix`.

**Sub-agent commit instruction:** After completing all file operations, run:
```
git add api-backend/app/libs/trade_models/ api-backend/app/libs/allocation_matrix/ api-backend/app/main.py
git add -u api-backend/app/libs/pc/ api-backend/app/schemas/pc.py
git commit -m "feat(pc): split app/libs/pc into trade_models + allocation_matrix modules (007-A)"
```
on branch `WORKING_BRANCH`.

---

### Feature B — Matrix query optimization (Phase 2, parallel)

**Proposal ref:** Layer 2 § B

**Files to touch:**
- `api-backend/app/libs/allocation_matrix/service.py`
- `api-backend/app/libs/allocation_matrix/repository.py`

**Read first:** Both files above after Feature A completes.

**Exact changes:**

#### B-1. `MatrixReadRepository` — two-query cell read

In `allocation_matrix/repository.py`, add these two methods to
`MatrixReadRepository`:

```python
from sqlalchemy import text

def cell_and_roster_stream(self) -> list:
    """
    UNION ALL: subscription cells (LIVE models only) + client roster.
    Returns raw Row objects with fields:
      row_kind, user_id, model_id, multiplier, model_size, ib_account,
      name, email, firebase_uid
    """
    sql = text("""
        SELECT 'cell'   AS row_kind,
               cs.user_id, cs.model_id, cs.multiplier, m.model_size,
               cp.ib_account, NULL AS name, NULL AS email, NULL AS firebase_uid
          FROM client_subscriptions cs
          JOIN models          m  ON m.id = cs.model_id AND m.status = 'live'
          JOIN client_profiles cp ON cp.user_id = cs.user_id
        UNION ALL
        SELECT 'client' AS row_kind,
               u.id     AS user_id, NULL AS model_id, NULL AS multiplier,
               NULL     AS model_size, cp.ib_account, cp.name, u.email,
               u.firebase_uid
          FROM users u
          JOIN client_profiles cp ON cp.user_id = u.id
         WHERE u.portal = 'client'
    """)
    return self.db.execute(sql).fetchall()

def live_models_with_aggregates(self) -> list:
    """
    LIVE models with pre-aggregated col_units / col_fund.
    Returns raw Row objects with fields:
      id, name, model_size, col_units, col_fund
    """
    sql = text("""
        SELECT m.id, m.name, m.model_size,
               COALESCE(SUM(cs.multiplier), 0)                AS col_units,
               COALESCE(SUM(cs.multiplier * m.model_size), 0) AS col_fund
          FROM models m
          LEFT JOIN client_subscriptions cs ON cs.model_id = m.id
         WHERE m.status = 'live'
         GROUP BY m.id, m.name, m.model_size
    """)
    return self.db.execute(sql).fetchall()
```

#### B-2. Single watermark query

In `MatrixReadRepository`, add:

```python
def combined_watermarks(self) -> dict:
    """
    Three (max_updated_at, count) probes in one round-trip.
    Returns dict with keys: subs, models, clients — each a _WatermarkResult.
    """
    sql = text("""
        SELECT
          (SELECT MAX(updated_at) FROM client_subscriptions) AS subs_max,
          (SELECT COUNT(*)        FROM client_subscriptions) AS subs_cnt,
          (SELECT MAX(updated_at) FROM models WHERE status = 'live') AS models_max,
          (SELECT COUNT(*)        FROM models WHERE status = 'live') AS models_cnt,
          (SELECT MAX(updated_at) FROM client_profiles)      AS clients_max,
          (SELECT COUNT(*)        FROM client_profiles)      AS clients_cnt
    """)
    row = self.db.execute(sql).one()
    return {
        "subs":    _WatermarkResult(row.subs_max,    row.subs_cnt    or 0),
        "models":  _WatermarkResult(row.models_max,  row.models_cnt  or 0),
        "clients": _WatermarkResult(row.clients_max, row.clients_cnt or 0),
    }
```

Import `_WatermarkResult` from `app.libs.trade_models.repository` (it lives
there after the split; if trade_models doesn't export it, move it to
`allocation_matrix/repository.py`).

#### B-3. Rewrite `_build_matrix`

In `allocation_matrix/service.py`, replace `_build_matrix` with a version that:
- Accepts the raw rows from `cell_and_roster_stream()` and the live-model rows
  from `live_models_with_aggregates()` (types: `list` of SQLAlchemy Row).
- Splits the UNION ALL rows by `row_kind` into cell rows and roster rows.
- Reads `col_units`/`col_fund` directly from the model aggregate rows — **no
  Python accumulation loop** for those aggregates.
- Drops `Decimal(str(x))` casts — SQLAlchemy already returns `Decimal` for
  `Numeric` columns (just use `x or Decimal("0")` null guard).
- Emits the same output dict shape as before:
  `{"models": [...], "clients": [...], "cells": {...}, "total_fund": float,
   "count": int, "is_open": bool}`.

#### B-4. Fix confirmed N+1

In `AllocationService.derive_confirmed_matrix`, replace the per-snapshot
`self.model_repo.get_model(snap.model_id)` loop (N+1) with:
- Read snapshots via `AllocationRepository.read_snapshots(period_id)`.
- Build model stubs directly from snapshot data (`snap.model_size`,
  `snap.model_name` if `allocation_period_models` exists — see DB B-4).
  If `AllocationPeriodModel` ORM is not yet available, fall back to a
  single `ModelRepository.bulk_get(model_ids: list[UUID]) -> dict[UUID, Model]`
  call (add this method to `trade_models/repository.py`).

`ModelRepository.bulk_get` signature:
```python
def bulk_get(self, model_ids: list[uuid.UUID]) -> dict[uuid.UUID, Model]:
    rows = self.db.query(Model).filter(Model.id.in_(model_ids)).all()
    return {m.id: m for m in rows}
```

#### B-5. Wire `AllocationService` to new `MatrixReadRepository`

Update `AllocationService.__init__` to instantiate `MatrixReadRepository`:
```python
def __init__(self, db: Session) -> None:
    self.db = db
    self.sub_repo = SubscriptionRepository(db)
    self.alloc_repo = AllocationRepository(db)
    self.model_repo = ModelRepository(db)
    self.matrix_repo = MatrixReadRepository(db)
```

Update `derive_open_matrix` to call:
```python
rows = self.matrix_repo.cell_and_roster_stream()
model_rows = self.matrix_repo.live_models_with_aggregates()
return _build_matrix(rows, model_rows, is_open=True)
```

Update `compute_etag_components` to call:
```python
wm = self.matrix_repo.combined_watermarks()
return wm["subs"], wm["models"], wm["clients"]
```

**Sub-agent commit instruction:**
```
git add api-backend/app/libs/allocation_matrix/service.py api-backend/app/libs/allocation_matrix/repository.py api-backend/app/libs/trade_models/repository.py
git commit -m "perf(pc): two-query UNION ALL matrix read, single watermark query, fix confirmed N+1 (007-B)"
```

---

### Feature C-1 — Router service delegation (Phase 2, parallel)

**Proposal ref:** Layer 2 § C-1

**Files to touch:**
- `api-backend/app/libs/allocation_matrix/service.py`
- `api-backend/app/libs/allocation_matrix/router.py`

**Read first:** Both files above after Feature A.

**Exact changes:**

1. Add to `AllocationService` in `allocation_matrix/service.py`:
   ```python
   def find_period_by_label(self, label: str) -> AllocationPeriod | None:
       return self.alloc_repo.find_by_label(label)
   ```

2. Add to `AllocationRepository` in `allocation_matrix/repository.py`:
   ```python
   def find_by_label(self, label: str) -> AllocationPeriod | None:
       return (
           self.db.query(AllocationPeriod)
           .filter(AllocationPeriod.label == label)
           .one_or_none()
       )
   ```

3. In `allocation_matrix/router.py` `get_allocation` handler, remove the inline
   `db.query(AllocationPeriod).filter(AllocationPeriod.label == period)` block
   (and its direct `AllocationPeriod`, `PeriodStatus`, `HTTPException` imports
   within the handler body). Replace with:
   ```python
   matched = service.find_period_by_label(period)
   if matched is None:
       raise HTTPException(status.HTTP_404_NOT_FOUND, f"Period '{period}' not found")
   ```
   Remove the `db: Annotated[Session, Depends(get_db)]` parameter from
   `get_allocation` if it is no longer used for anything else (check the handler
   body — `alloc_repo = AllocationRepository(db)` also needs to be removed
   and replaced with `service.list_periods()` for the periods list).

**Sub-agent commit instruction:**
```
git add api-backend/app/libs/allocation_matrix/service.py api-backend/app/libs/allocation_matrix/repository.py api-backend/app/libs/allocation_matrix/router.py
git commit -m "refactor(pc): router delegates period lookup to AllocationService (007-C1)"
```

---

### Feature C-2 — Delete model 409 (Phase 2, parallel)

**Proposal ref:** Layer 2 § C-2

**Files to touch:**
- `api-backend/app/libs/trade_models/service.py`

**Read first:** `api-backend/app/libs/trade_models/service.py` after Feature A.

**Exact change:**

In `ModelService.delete_model`, replace:
```python
if model.status == ModelStatus.LIVE:
    return model      # caller has no idea the delete was rejected
```
with:
```python
if model.status == ModelStatus.LIVE:
    raise HTTPException(
        status.HTTP_409_CONFLICT,
        "Cannot delete a live model — unpublish it first",
    )
```

**Sub-agent commit instruction:**
```
git add api-backend/app/libs/trade_models/service.py
git commit -m "fix(pc): delete_model raises 409 on LIVE instead of silent no-op (007-C2)"
```

---

### Feature C-3 — Race-safe material version (Phase 2, parallel)

**Proposal ref:** Layer 2 § C-3

**Files to touch:**
- `api-backend/app/libs/trade_models/repository.py`
- `api-backend/app/libs/trade_models/service.py`

**Read first:** Both files above after Feature A.

**Exact changes:**

1. In `trade_models/repository.py`, add a `MaterialRepository` class (or add
   this method to the existing material section of `ModelRepository`):
   ```python
   def next_version_no(self, model_id: uuid.UUID) -> int:
       """
       Lock-safe next version number.
       Uses SELECT ... FOR UPDATE to prevent concurrent uploads racing past
       the same Python count.
       """
       from sqlalchemy import text
       row = self.db.execute(
           text(
               "SELECT COALESCE(MAX(version_no), 0) + 1 AS next_n "
               "FROM model_materials WHERE model_id = :mid FOR UPDATE"
           ),
           {"mid": str(model_id)},
       ).one()
       return row.next_n
   ```
   Note: `version_no` column is added by DB migration 0009. If it does not
   exist yet, this method will fail at runtime — add it but note the dependency.

2. In `ModelService.upload_material`, replace:
   ```python
   existing = self.repo.list_materials(model_id)
   next_n = len(existing) + 1
   version_tag = f"v{next_n}"
   ```
   with:
   ```python
   next_n = self.repo.next_version_no(model_id)
   version_tag = f"v{next_n}"
   ```

**Sub-agent commit instruction:**
```
git add api-backend/app/libs/trade_models/repository.py api-backend/app/libs/trade_models/service.py
git commit -m "fix(pc): race-safe material version_no via SELECT FOR UPDATE (007-C3)"
```

---

### Feature C-4 — Confirm transaction safety (Phase 2, parallel)

**Proposal ref:** Layer 2 § C-4

**Files to touch:**
- `api-backend/app/libs/allocation_matrix/service.py`
- `api-backend/app/libs/allocation_matrix/repository.py`

**Read first:** Both files above after Feature A.

**Exact changes:**

1. In `AllocationRepository.write_snapshots`, replace the per-row loop + flush:
   ```python
   # BEFORE
   for row in rows:
       snap = AllocationModelSnapshot(...)
       self.db.add(snap)
   self.db.flush()

   # AFTER
   snaps = [
       AllocationModelSnapshot(
           period_id=period_id,
           user_id=row["user_id"],
           model_id=row["model_id"],
           multiplier=row["multiplier"],
           model_size=row.get("model_size"),
           ib_account=row.get("ib_account"),
       )
       for row in rows
   ]
   self.db.add_all(snaps)
   self.db.flush()
   ```

2. In `AllocationService.confirm_period`, wrap the snapshot write + confirm in
   a nested transaction:
   ```python
   with self.db.begin_nested():
       self.alloc_repo.write_snapshots(period_id, snapshot_rows)
       confirmed_at = datetime.now(tz=timezone.utc)
       updated = self.alloc_repo.confirm_period(period_id, actor, confirmed_at)
   self.db.commit()
   ```
   Remove the standalone `self.db.commit()` that was after the old
   `write_snapshots` + `confirm_period` calls.

**Sub-agent commit instruction:**
```
git add api-backend/app/libs/allocation_matrix/service.py api-backend/app/libs/allocation_matrix/repository.py
git commit -m "refactor(pc): begin_nested + add_all for confirm_period snapshot writes (007-C4)"
```

---

### Feature C-5 — Service dependency narrowing (Phase 2, parallel)

**Proposal ref:** Layer 2 § C-5

**Files to touch:**
- `api-backend/app/libs/allocation_matrix/service.py`

**Read first:** File above after Feature A.

**Exact changes:**

1. Define a `ModelLookup` Protocol at the top of
   `allocation_matrix/service.py`:
   ```python
   from typing import Protocol
   import uuid as _uuid

   class ModelLookup(Protocol):
       def bulk_get(self, model_ids: list[_uuid.UUID]) -> dict[_uuid.UUID, object]:
           ...
   ```

2. Update `AllocationService.__init__` signature: replace the
   `ModelRepository(db)` instantiation with acceptance of a `ModelLookup`
   instance, defaulting to `ModelRepository(db)` for backward compat:
   ```python
   def __init__(
       self,
       db: Session,
       model_lookup: ModelLookup | None = None,
   ) -> None:
       self.db = db
       self.sub_repo = SubscriptionRepository(db)
       self.alloc_repo = AllocationRepository(db)
       self.model_repo: ModelLookup = (
           model_lookup if model_lookup is not None else ModelRepository(db)
       )
       self.matrix_repo = MatrixReadRepository(db)
   ```

**Sub-agent commit instruction:**
```
git add api-backend/app/libs/allocation_matrix/service.py
git commit -m "refactor(pc): AllocationService depends on ModelLookup Protocol not full ModelRepository (007-C5)"
```

---

### Feature C-6 — Cache class (Phase 2, parallel)

**Proposal ref:** Layer 2 § C-6

**Files to touch:**
- `api-backend/app/libs/allocation_matrix/cache.py`

**Read first:** File above after Feature A.

**Exact changes:**

Replace the module-level `_store` / `_lock` globals with an `AllocationCache`
class:

```python
class AllocationCache:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._store: dict[tuple, tuple[Any, float]] = {}

    def _get(self, key: tuple) -> Any | None:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return None
            value, expiry = entry
            if time.monotonic() > expiry:
                del self._store[key]
                return None
            return value

    def _put(self, key: tuple, value: Any, ttl: float) -> None:
        with self._lock:
            self._store[key] = (value, time.monotonic() + ttl)

    def get_open(self, etag: str) -> Any | None:
        return self._get(("open", etag))

    def put_open(self, etag: str, value: Any) -> None:
        self._put(("open", etag), value, _OPEN_TTL)

    def get_confirmed(self, period_id: str) -> Any | None:
        return self._get(("confirmed", period_id))

    def put_confirmed(self, period_id: str, value: Any) -> None:
        self._put(("confirmed", period_id), value, _CONFIRMED_TTL)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    @staticmethod
    def compute_open_etag(subs: Any, models: Any, clients: Any) -> str:
        raw = (
            f"{subs.max_updated_at}:{subs.count}|"
            f"{models.max_updated_at}:{models.count}|"
            f"{clients.max_updated_at}:{clients.count}"
        )
        return hashlib.sha1(raw.encode()).hexdigest()[:16]


# Module-level singleton — thin wrappers keep callers unchanged.
_cache = AllocationCache()


def get_open(etag: str) -> Any | None:
    return _cache.get_open(etag)


def put_open(etag: str, value: Any) -> None:
    _cache.put_open(etag, value)


def get_confirmed(period_id: str) -> Any | None:
    return _cache.get_confirmed(period_id)


def put_confirmed(period_id: str, value: Any) -> None:
    _cache.put_confirmed(period_id, value)


def compute_open_etag(subs: Any, models: Any, clients: Any) -> str:
    return _cache.compute_open_etag(subs, models, clients)
```

Keep `_OPEN_TTL` and `_CONFIRMED_TTL` module-level constants unchanged.
Remove the old `_lock` and `_store` globals and the old `_get`/`_put`
module-level functions.

**Sub-agent commit instruction:**
```
git add api-backend/app/libs/allocation_matrix/cache.py
git commit -m "refactor(pc): wrap cache globals in AllocationCache class with clear() method (007-C6)"
```

---

### Feature C-8 — Field differ (Phase 2, parallel)

**Proposal ref:** Layer 2 § C-8

**Files to touch:**
- `api-backend/app/libs/trade_models/service.py`

**Read first:** File above after Feature A.

**Exact changes:**

1. Extend `_TRACKED_FIELDS` to include all 8 new DB B-1b fields:
   ```python
   _TRACKED_FIELDS = (
       "name", "manager", "model_size", "intro", "symbols",
       "description", "underlyings", "risk",
       "liquidity", "reporting", "nav_perf",
       "mgmt_fee", "incentive_fee",
   )
   ```

2. Define a `FieldDiffer` protocol + per-field handlers above `edit_model`:
   ```python
   from typing import Callable

   # Long-text fields: emit "changed" sentinel instead of dumping both blobs.
   _LONG_TEXT_FIELDS = frozenset({"description", "underlyings", "risk"})

   def _diff_field(field: str, before: Any, after: Any) -> dict | None:
       """
       Return a diff entry dict or None if unchanged.
       - Decimal fields: compare as float (precision-normalized).
       - Long-text fields: emit sentinel {"changed": True} when different.
       - All others: emit {"before": before, "after": after}.
       """
       if isinstance(before, Decimal) or isinstance(after, Decimal):
           norm_b = float(before) if before is not None else None
           norm_a = float(after)  if after  is not None else None
           if norm_b == norm_a:
               return None
           return {"name": field, "before": norm_b, "after": norm_a}

       if field in _LONG_TEXT_FIELDS:
           if before == after:
               return None
           return {"name": field, "changed": True}

       if before == after:
           return None
       return {"name": field, "before": before, "after": after}
   ```

3. Replace the diff loop in `edit_model`:
   ```python
   # BEFORE
   changed_fields = []
   for field in _TRACKED_FIELDS:
       if field not in updates:
           continue
       before = getattr(model, field)
       after = updates[field]
       norm_before = float(before) if isinstance(before, Decimal) else before
       norm_after = float(after) if isinstance(after, Decimal) else after
       if norm_before != norm_after:
           changed_fields.append({"name": field, "before": norm_before, "after": norm_after})

   # AFTER
   changed_fields = []
   for field in _TRACKED_FIELDS:
       if field not in updates:
           continue
       entry = _diff_field(field, getattr(model, field), updates[field])
       if entry is not None:
           changed_fields.append(entry)
   ```

**Sub-agent commit instruction:**
```
git add api-backend/app/libs/trade_models/service.py
git commit -m "feat(pc): FieldDiffer handles long-text + Decimal fields in change log (007-C8)"
```

---

### Feature D — Route changes (Phase 3, after Feature B)

**Proposal ref:** Layer 2 § D (D-1 through D-4)

**Files to touch:**
- `api-backend/app/libs/trade_models/router.py`
- `api-backend/app/libs/trade_models/service.py`
- `api-backend/app/libs/trade_models/schemas.py`
- `api-backend/app/libs/allocation_matrix/router.py`
- `api-backend/app/libs/allocation_matrix/schemas.py`

**Read first:** All five files above.

**Final route surface after this feature:**

```
GET    /api/pc/models                                   list (status filter optional)
POST   /api/pc/models                                   create (draft)
GET    /api/pc/models/{id}[?include=materials,changes]  detail (D-4)
PATCH  /api/pc/models/{id}                              edit + status transitions (D-1)
GET    /api/pc/models/{id}/materials                    standalone list
POST   /api/pc/models/{id}/materials                    upload
GET    /api/pc/models/{id}/materials/{mid}/download     download
GET    /api/pc/models/{id}/changes                      standalone change log

GET    /api/pc/allocation                               matrix + embedded full PeriodOut[]
POST   /api/pc/allocation/periods                       create open period
PATCH  /api/pc/allocation/periods/{id}                  confirm via {status:'confirmed'} (D-3)
```

**Exact changes:**

#### D-1. PATCH /models/{id} subsumes publish + delete

In `trade_models/router.py`:
1. Remove `POST /models/{model_id}/publish` handler (`publish_model`).
2. Remove `DELETE /models/{model_id}` handler (`delete_model`).
3. Update `PATCH /models/{model_id}` (`edit_model`) to handle `status`
   transitions in addition to field edits:

   ```python
   from app.libs.trade_models.schemas import ModelUpdate, ModelStatusUpdate

   @router.patch("/models/{model_id}", response_model=ModelOut)
   def edit_model(
       model_id: uuid.UUID,
       body: ModelUpdate,
       service: Annotated[ModelService, Depends(_get_model_service)],
       actor: Annotated[User, Depends(require_action(Action.MODEL_MANAGE))],
   ) -> object:
       updates = body.model_dump(exclude_unset=True)

       # Status transition dispatch (D-1)
       if "status" in updates:
           new_status = updates.pop("status")
           if new_status == "live":
               model = service.publish_model(model_id, actor=actor.firebase_uid)
           elif new_status == "deleted":
               model = service.delete_model(model_id, actor=actor.firebase_uid)
           else:
               raise HTTPException(
                   status.HTTP_422_UNPROCESSABLE_ENTITY,
                   f"Invalid status transition: {new_status!r}",
               )
           # If there are also field updates, apply them too.
           if updates:
               model = service.edit_model(model_id, actor=actor.firebase_uid, **updates)
           return model

       return service.edit_model(model_id, actor=actor.firebase_uid, **updates)
   ```

   Update `ModelUpdate` in `trade_models/schemas.py` to allow `status` field:
   ```python
   class ModelUpdate(BaseModel):
       name: str | None = None
       manager: str | None = None
       model_size: float | None = None
       intro: str | None = None
       symbols: Any = None
       description: str | None = None
       underlyings: str | None = None
       risk: str | None = None
       liquidity: str | None = None
       reporting: str | None = None
       nav_perf: str | None = None
       mgmt_fee: float | None = None
       incentive_fee: float | None = None
       status: str | None = None   # "live" | "deleted" — triggers state machine
   ```

#### D-2. Drop GET /allocation/periods; fold full PeriodOut columns into embedded list

In `allocation_matrix/router.py`:
1. Remove the `GET /allocation/periods` route handler (`list_periods`).

In `allocation_matrix/schemas.py`:
1. Extend `PeriodLiteOut` to carry full period fields (already done in Feature A
   — verify `confirmed_at` and `confirmed_by` are present; if not, add them).

In `allocation_matrix/router.py`, `get_allocation` handler:
1. Build `periods_out` using `PeriodLiteOut` (now full-featured) and populate
   `confirmed_at` and `confirmed_by` from `AllocationPeriod` ORM attributes.

#### D-3. PATCH /allocation/periods/{id} subsumes POST /confirm

In `allocation_matrix/router.py`:
1. Remove the `POST /allocation/periods/{period_id}/confirm` handler.
2. Add a new `PATCH /allocation/periods/{period_id}` handler:

   ```python
   from app.libs.allocation_matrix.schemas import PeriodStatusUpdate, PeriodOut

   @router.patch("/allocation/periods/{period_id}", response_model=PeriodOut)
   def update_period(
       period_id: uuid.UUID,
       body: PeriodStatusUpdate,
       service: Annotated[AllocationService, Depends(_get_alloc_service)],
       actor: Annotated[User, Depends(require_action(Action.ALLOCATION_MANAGE))],
   ) -> object:
       if body.status == PeriodStatus.CONFIRMED:
           return service.confirm_period(period_id, actor=actor.firebase_uid)
       raise HTTPException(
           status.HTTP_422_UNPROCESSABLE_ENTITY,
           f"Unsupported period status transition: {body.status!r}",
       )
   ```

#### D-4. Compound GET /models/{id}?include=materials,changes

In `trade_models/router.py`, update `get_model`:

```python
from app.libs.trade_models.schemas import ModelOut, MaterialOut, ChangeOut

class ModelDetailOut(ModelOut):
    materials: list[MaterialOut] | None = None
    changes: list[ChangeOut] | None = None

@router.get("/models/{model_id}")
def get_model(
    model_id: uuid.UUID,
    service: Annotated[ModelService, Depends(_get_model_service)],
    _: Annotated[User, Depends(require_action(Action.MODEL_VIEW))],
    include: str | None = None,
) -> object:
    model = service.get_model(model_id)
    includes = {s.strip() for s in include.split(",")} if include else set()
    result = ModelDetailOut.model_validate(model)
    if "materials" in includes:
        result.materials = service.list_materials(model_id)
    if "changes" in includes:
        result.changes = service.list_changes(model_id)
    return result
```

Add `ModelDetailOut` to `trade_models/schemas.py` (can be defined inline in
the router or in schemas — prefer schemas).

**Sub-agent commit instruction:**
```
git add api-backend/app/libs/trade_models/router.py api-backend/app/libs/trade_models/schemas.py api-backend/app/libs/trade_models/service.py api-backend/app/libs/allocation_matrix/router.py api-backend/app/libs/allocation_matrix/schemas.py
git commit -m "feat(pc): D-1 PATCH status transitions, D-2 drop GET periods, D-3 PATCH confirm, D-4 compound GET model detail (007-D)"
```

---

## Execution plan

```
Phase 1 (sequential — must complete before anything else):
  └── Feature A: Module split
        Creates all new modules; deletes app/libs/pc/ and app/schemas/pc.py

Phase 2 (all run in parallel — single Agent tool message with 6 Agent calls):
  ├── Feature B:   Matrix query optimization
  ├── Feature C-1: Router service delegation
  ├── Feature C-2: Delete model 409
  ├── Feature C-3: Race-safe material version
  ├── Feature C-4: Confirm transaction safety
  ├── Feature C-5: Service dependency narrowing
  ├── Feature C-6: Cache class
  └── Feature C-8: Field differ

Phase 3 (after Phase 2 Feature B is complete):
  └── Feature D: Route changes D-1 through D-4

Phase 4 (run validation + testing agents in parallel):
  ├── Validation agent
  └── Testing agent
```

**Parallelism rules:**
- Phase 1 must complete and its commit must exist on
  `WORKING_BRANCH` before Phase 2 begins.
- All 7 Phase 2 features are independent of each other and run in a single
  message with 7 parallel Agent tool calls.
- Phase 3 must wait for Phase 2 Feature B because D-2 and D-4 touch endpoints
  whose underlying `_build_matrix` / `derive_confirmed_matrix` implementations
  change in B.

---

## Sub-agent commit protocol

Every sub-agent must follow this protocol exactly:

1. **Read every file it will modify** before writing anything.
2. **Write/edit files** per the feature spec.
3. **Verify Python syntax** by running (from `api-backend/` with venv active):
   ```powershell
   .\.venv\Scripts\python.exe -c "import ast, pathlib; [ast.parse(p.read_text()) for p in pathlib.Path('app/libs/trade_models').rglob('*.py')]"
   .\.venv\Scripts\python.exe -c "import ast, pathlib; [ast.parse(p.read_text()) for p in pathlib.Path('app/libs/allocation_matrix').rglob('*.py')]"
   ```
4. **Stage and commit** only the files touched by this feature (list them
   explicitly in `git add` — do not use `git add .` or `git add -A`).
5. Commit on branch `WORKING_BRANCH`. The commit message must
   match the one specified in each feature's "Sub-agent commit instruction"
   section exactly.
6. Do **not** push to remote.

---

## Validation & testing

### Validation agent

Run after all Phase 3 features complete (in parallel with testing agent).

The validation agent must (from `api-backend/` with venv active):

1. Verify `app/libs/pc/` no longer exists:
   ```powershell
   Test-Path app\libs\pc
   # Expected: False
   ```

2. Verify `app/schemas/pc.py` no longer exists:
   ```powershell
   Test-Path app\schemas\pc.py
   # Expected: False
   ```

3. Verify import of both routers:
   ```powershell
   .\.venv\Scripts\python.exe -c "
   from app.libs.trade_models.router import router as tr
   from app.libs.allocation_matrix.router import router as ar
   print('router imports OK')
   print('trade_models routes:')
   for r in tr.routes: print(' ', r.methods, r.path)
   print('allocation_matrix routes:')
   for r in ar.routes: print(' ', r.methods, r.path)
   "
   ```

4. Verify FastAPI app loads:
   ```powershell
   .\.venv\Scripts\python.exe -c "from app.main import app; print('FastAPI app loads OK')"
   ```

5. Confirm exactly 10 routes are registered on the two routers combined.
   The expected routes are:
   - `GET    /pc/models`
   - `POST   /pc/models`
   - `GET    /pc/models/{model_id}`
   - `PATCH  /pc/models/{model_id}`
   - `GET    /pc/models/{model_id}/materials`
   - `POST   /pc/models/{model_id}/materials`
   - `GET    /pc/models/{model_id}/materials/{mid}/download`
   - `GET    /pc/models/{model_id}/changes`
   - `GET    /pc/allocation`
   - `POST   /pc/allocation/periods`
   - `PATCH  /pc/allocation/periods/{period_id}`

   (That is 11 total — the proposal table says "14 → 10" counting from the
   pre-split `/api/pc/*` surface; count carefully and reconcile against the
   routes actually registered.)

6. Verify no `app.libs.pc` references remain in any Python file:
   ```powershell
   Select-String -Path "app\**\*.py" -Pattern "app\.libs\.pc" -Recurse
   # Expected: no matches
   ```

7. Verify no `app.schemas.pc` references remain:
   ```powershell
   Select-String -Path "app\**\*.py" -Pattern "app\.schemas\.pc" -Recurse
   # Expected: no matches
   ```

Report: "PASS" or list every failure with the exact error output.

### Testing agent

Run in parallel with the validation agent.

The testing agent must (read-only — do **not** modify any test files):

1. Find all test files referencing the old module paths:
   ```powershell
   Select-String -Path "tests\**\*.py" -Pattern "app\.libs\.pc|app\.schemas\.pc" -Recurse
   ```
   List each file and line found.

2. Verify no circular imports between the two new modules:
   ```powershell
   .\.venv\Scripts\python.exe -c "
   import importlib, sys
   # trade_models must not import allocation_matrix
   import app.libs.trade_models.service
   found = [k for k in sys.modules if 'allocation_matrix' in k]
   assert not found, f'trade_models imported allocation_matrix: {found}'
   print('No circular import: trade_models does not load allocation_matrix')
   "
   ```

3. Run any existing PC-related tests (do not fix failures — report them):
   ```powershell
   .\.venv\Scripts\python.exe -m pytest tests/ -k "pc or model or allocation" -x --tb=short 2>&1 | Select-Object -First 80
   ```

Report:
- List of test files with stale `app.libs.pc` / `app.schemas.pc` imports that
  need updating (the implementer will fix these in a follow-up).
- Whether the circular-import check passed.
- Pytest output summary (pass/fail count, first failure if any).
