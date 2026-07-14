# 011 — Post-Trade Allocation · Implementation Details — Backend

> Status: **DRAFT — pending implementation.**
> Implements: proposal `docs/proposals/011-2026-07-13-post-trade-allocation.md` § "Layer 2 — Backend" (A/B/C/D/E) and § "Design decisions (settled)" D-1 through D-10 (backend-relevant subset).
> Layer: Backend — **one layer per file.**
> Sibling layer docs: `docs/implementations/011-2026-07-13-post-trade-allocation-db.md` (Database), `docs/implementations/011-2026-07-13-post-trade-allocation-fe.md` (Frontend).
> Execution schedule: `docs/execution-schedules/011-2026-07-13-post-trade-allocation-be.md` (not yet created).
> Branch: `post-trade-allocation-integration-be` (parent: `post-trade-allocation-integration`).
> Builds on / prerequisites: the DB-layer objects and columns listed in § 2 below exist on the target database (created by the sibling `-db` layer's additive migration `0014_post_trade_allocation`, `down_revision = "350ce48e2f4d"`); `app/libs/allocation_matrix/` (006/007) as the structural precedent; `app/libs/auth/actions.py` (`Action`, `ROLE_ACTIONS`, `require_action`) already wired.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/011-2026-07-13-post-trade-allocation.md` § "Layer 2 — Backend", § "4. Cross-layer seam", § "Design decisions (settled)" |
| Execution schedule | `docs/execution-schedules/011-2026-07-13-post-trade-allocation-be.md` |
| Sibling layer impl docs | `docs/implementations/011-2026-07-13-post-trade-allocation-db.md`, `docs/implementations/011-2026-07-13-post-trade-allocation-fe.md` |
| Builds on | DB migration `0014_post_trade_allocation` (additive, head `350ce48e2f4d` → new head); `app/libs/allocation_matrix/*` (006/007) |

---

## 2. Branch & session contract (req 4 — independently executable)

- **Branch:** `post-trade-allocation-integration-be` — all `BE-*` units land on this one branch, cut from the parent `post-trade-allocation-integration`.
- **Isolation:** this layer is implementable in a separate session, in parallel with the `-db` and `-fe` layer sessions, provided the preconditions below hold. It shares state with the other layers **only** through the pinned seam in § 7.
- **Preconditions (must be true before starting — DB *objects*, not DB *branch state*):**
  - [ ] The following tables/columns exist on the target database (created by the DB layer's migration; this layer builds against the frozen schema, not against the sibling branch):
    - `post_trade_allocation_runs` (`id`, `trade_date`, `period_id`, `status`, `trigger`, `grand_total`, `run_by`, `created_at`)
    - `post_trade_allocations` (composite PK `(run_id, model_id, user_id)`, `model_traded`, `units`, `units_total`, `allocated`, `pct`, `ib_account`, `model_name`, `model_acct`)
    - `client_portfolios` (`user_id` PK, `cash_deposit`, `amount_in_trade`, `previous_amount_in_trade`, `last_run_id`, `updated_at`)
    - `orders.allocated_run_id` (nullable FK → `post_trade_allocation_runs.id`, indexed)
  - [ ] `app/models/post_trade_allocation.py` (or equivalent) exposes SQLAlchemy model classes for the four objects above, importable from `app/models/`.
  - [ ] `allocation_periods` / `allocation_model_snapshots` / `allocation_period_models` (006/007) already hold at least one confirmed period — needed for a non-trivial split (an empty snapshot set degrades gracefully per BE-2, not a hard precondition).
  - [ ] `app/libs/auth/actions.py` exists with `Action(str, enum.Enum)` and `ROLE_ACTIONS: dict[AdminRole, set[Action]]` in their current shape (this doc extends both).
- **Read-first inventory:**
  - `api-backend/app/libs/allocation_matrix/router.py`, `service.py`, `repository.py`, `scheduler.py`, `schemas.py` — the structural precedent this package mirrors (router→service→repository split, ETag-free simple GETs here, scheduler registered in `main.py` lifespan).
  - `api-backend/app/libs/auth/actions.py` — exact `Action` enum / `ROLE_ACTIONS` shape being extended (BE-4).
  - `api-backend/app/models/reconciliation.py` — `Order` (`orders` table): `proceeds`, `amount`, `netCash`, `tradeDate` (`String(8)` `YYYYMMDD`), `model` (free text), `accountId`, `orderID`.
  - `api-backend/app/models/pc.py` — `Model` (`models`: `id`, `name`, `model_size`, `status`), `AllocationPeriod` (`allocation_periods`: `id`, `label`, `status`, `confirmed_at`), `AllocationModelSnapshot` (`allocation_model_snapshots`: `period_id`, `user_id`, `model_id`, `multiplier`, `ib_account`), `AllocationPeriodModel` (`allocation_period_models`: `period_id`, `model_id`, `model_name`, `model_size`).
  - `api-backend/app/models/post_trade_allocation.py` — the DB layer's new models this layer reads/writes (`PostTradeAllocationRun`, `PostTradeAllocation`, `ClientPortfolio`, enums `RunStatus`/`RunTrigger`); precondition, read but not authored here.
  - `api-backend/app/main.py` — router mount + lifespan scheduler registration pattern (`app.include_router(allocation_matrix_router, prefix="/api")`, `start_scheduler()` in `lifespan`).
- **Hand-off / exit signal:** all `BE-1`…`BE-7` units committed; `pytest -q` green for `app/libs/post_trade_allocation/`; the three routes resolve under `/api/mobo/post-trade-allocation*` in OpenAPI; PR opened against `post-trade-allocation-integration`.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- **Layering:** `router.py` → `service.py` → `repository.py`, strictly one-directional (router may import service; service may import repository; repository never imports service/router). Mirrors `app/libs/allocation_matrix/`.
- **Naming & module layout:** new package `app/libs/post_trade_allocation/` with `router.py`, `service.py`, `repository.py`, `scheduler.py`; response schemas in `app/schemas/post_trade_allocation.py` (sibling convention to `app/schemas/pc.py`, not inside the feature package).
- **Money:** all arithmetic in `Decimal` (`Numeric(28, 10)` columns); the DTO serializes to **JSON numbers in major units** (§ 7), not `DecimalString` — contrast the reconciliation DTOs.
- **IDs:** UUIDs serialize to `str` at the schema boundary (`str(model.id)`), matching `allocation_matrix/schemas.py`.
- **Errors:** FastAPI default envelope `{"detail": "<msg>"}`; `401` unauthenticated, `403` forbidden (wrong role), `404` no run for the requested date.
- **Transactions:** `PostTradeAllocationService.run()` is one DB transaction (`self.db.begin_nested()` / commit at the end) — never partial-commit across steps 1–5.

### 3.2 CI/CD & engineering discipline (req 6)
- **Trunk-friendly, small units.** Each `BE-*` unit below is one atomic, self-reviewable commit that leaves the branch green.
- **Every unit is independently revertible.** `BE-4` (actions) has no code dependency on `BE-1..3`/`BE-5..7` and can be reverted alone (it only grants access; removing it just re-empties `MOBO`'s action set as it is today).
- **Additive & backward-compatible first.** This layer adds a new package and two new enum members; it edits no existing route or existing `Action` value — nothing existing changes shape.
- **Gates before merge** (in order): `lint → format → type-check → unit tests (§8) → build`.
  ```bash
  cd api-backend
  ruff check app/libs/post_trade_allocation app/schemas/post_trade_allocation.py
  ruff format --check app/libs/post_trade_allocation app/schemas/post_trade_allocation.py
  mypy app/libs/post_trade_allocation app/schemas/post_trade_allocation.py
  pytest -q tests/libs/post_trade_allocation
  ```
- **No secrets, no manual steps in the merge path.** The live-DB migration is the sibling DB layer's human gate, not this layer's — this layer only requires the objects to already exist (§ 2 preconditions).
- **Reversibility documented** (§ 9): purely additive at the code level; reverting the branch removes the package, the two `Action` members, and the router mount/scheduler registration lines in `main.py`.

---

## 4. Architecture (level 1 of 3)

**Target layout:**
```
app/libs/post_trade_allocation/
  __init__.py
  router.py       # APIRouter(prefix="/mobo", tags=["mobo"]) — the 3 routes
  service.py       # PostTradeAllocationService — ALL business logic (aggregate, split, persist, portfolio)
  repository.py    # read: order aggregates + confirmed-snapshot rows; write: run + cells + portfolio + order marking
  scheduler.py      # weekday auto-run job (start_scheduler), env-var-gated
app/schemas/post_trade_allocation.py   # Pydantic response models (PtaModelOut, PtaClientShareOut, PtaViewOut, PtaRunListOut, PtaRunOut)
```

**Dependency direction:** `router.py` depends on `service.py`; `service.py` depends on `repository.py`; `repository.py` depends only on `app/models/post_trade_allocation.py`, `app/models/reconciliation.py` (`Order`), and `app/models/pc.py` (`Model`, `AllocationPeriod`, `AllocationModelSnapshot`, `AllocationPeriodModel`). `scheduler.py` depends only on `service.py` (same pattern as `allocation_matrix/scheduler.py` → `AllocationService`).

**External seams:**
- **Reads:** `orders` (unallocated rows), `models`, `allocation_periods` (latest confirmed), `allocation_model_snapshots`, `allocation_period_models`.
- **Writes:** `post_trade_allocation_runs`, `post_trade_allocations`, `client_portfolios`, `orders.allocated_run_id`.
- **Exposes:** `/api/mobo/post-trade-allocation`, `/api/mobo/post-trade-allocation/runs`, `/api/mobo/post-trade-allocation/run` — depends on the frozen wire contract in § 7.

---

## 5. Modules (level 2 of 3)

### 5.1 `post_trade_allocation.repository`
- **Responsibility:** pure DB access — no aggregation, no split math, no portfolio math.
- **Files:** `app/libs/post_trade_allocation/repository.py`.
- **Public surface:** `PostTradeAllocationRepository` — see `BE-2` for the required method list.
- **Owns features:** `BE-2` (methods), part of `BE-3` (persistence calls).

### 5.2 `post_trade_allocation.service`
- **Responsibility:** owns *all* business logic per proposal § "Layer 2 — Backend" B — the 5-step `run()`, view assembly for GET, idempotency.
- **Files:** `app/libs/post_trade_allocation/service.py`.
- **Public surface:** `PostTradeAllocationService(db)` with `.run(trigger, actor) -> PostTradeAllocationRun`, `.get_view(date=None) -> PtaViewOut | None`, `.list_runs(include_empty=False) -> list[PtaRunOut]`.
- **Owns features:** `BE-3` (the run), `BE-6` (GET assembly).

### 5.3 `post_trade_allocation.router` + `app/schemas/post_trade_allocation.py`
- **Responsibility:** thin HTTP boundary — request parsing, `require_action` guards, response models; owns no logic.
- **Files:** `app/libs/post_trade_allocation/router.py`, `app/schemas/post_trade_allocation.py`.
- **Public surface:** `router: APIRouter` mounted in `app/main.py`.
- **Owns features:** `BE-5` (schemas), `BE-7` (routes + mount).

### 5.4 `post_trade_allocation.scheduler`
- **Responsibility:** env-gated weekday auto-run, isolated from the always-live manual route.
- **Files:** `app/libs/post_trade_allocation/scheduler.py`.
- **Public surface:** `start_scheduler() -> asyncio.Task`.
- **Owns features:** `BE-8`.

### 5.5 `auth.actions` (extended, not owned)
- **Responsibility:** authorization vocabulary — this layer adds two enum members and a role grant, does not restructure the module.
- **Files:** `app/libs/auth/actions.py` (edit).
- **Owns features:** `BE-4`.

---

## 6. Features (level 3 of 3 — the work units)

### BE-1 — Package layout + mount points (Yes — user req.)

- **Proposal ref:** § "Layer 2 — Backend" A
- **Module:** 5.1–5.4
- **Files:** `create: app/libs/post_trade_allocation/__init__.py`, `create: app/libs/post_trade_allocation/router.py`, `create: app/libs/post_trade_allocation/service.py`, `create: app/libs/post_trade_allocation/repository.py`, `create: app/libs/post_trade_allocation/scheduler.py`, `create: app/schemas/post_trade_allocation.py`, `modify: app/main.py`
- **Dependencies:** none — parallel-safe (scaffolding only; bodies land in later units)

**Contract (required code — req 2):**

```python
# app/main.py — additions, mirroring allocation_matrix's mount + lifespan registration
from app.libs.post_trade_allocation.router import router as post_trade_allocation_router
from app.libs.post_trade_allocation.scheduler import start_scheduler as start_pta_scheduler

@asynccontextmanager
async def lifespan(_: FastAPI):
    scheduler_task = start_scheduler()          # existing: allocation_matrix
    pta_scheduler_task = start_pta_scheduler()  # new
    yield
    scheduler_task.cancel()
    pta_scheduler_task.cancel()

app.include_router(post_trade_allocation_router, prefix="/api")
```

**Behavior / invariants:** the package imports cleanly with empty method bodies (`NotImplementedError` placeholders are acceptable at this stage); `app.main` still starts; no existing router/route changes shape.

**Done when:** `uvicorn`/`pytest` collection succeeds with the new package present; `GET /openapi.json` lists no new paths yet (routes land in `BE-7`) but the module imports without error.

---

### BE-2 — `PostTradeAllocationRepository` (Yes — user req.)

- **Proposal ref:** § "Layer 2 — Backend" B steps 1–4
- **Module:** 5.1
- **Files:** `modify: app/libs/post_trade_allocation/repository.py`
- **Dependencies:** `BE-1`

**Contract (required code — req 2):**

```python
# app/libs/post_trade_allocation/repository.py
from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import select, func, text
from sqlalchemy.orm import Session

from app.models.reconciliation import Order
from app.models.pc import Model, AllocationPeriod, AllocationModelSnapshot, AllocationPeriodModel, PeriodStatus
from app.models.post_trade_allocation import (
    PostTradeAllocationRun,
    PostTradeAllocation,
    ClientPortfolio,
)


class PostTradeAllocationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # --- Step 1: pick up new orders --------------------------------------
    def unallocated_orders(self) -> list[Order]:
        """SELECT * FROM orders WHERE allocated_run_id IS NULL."""
        return (
            self.db.query(Order)
            .filter(Order.allocated_run_id.is_(None))
            .all()
        )

    # --- Step 3: split basis ----------------------------------------------
    def latest_confirmed_period(self) -> AllocationPeriod | None:
        return (
            self.db.query(AllocationPeriod)
            .filter(AllocationPeriod.status == PeriodStatus.CONFIRMED)
            .order_by(AllocationPeriod.confirmed_at.desc())
            .first()
        )

    def snapshots_for_period(self, period_id: uuid.UUID) -> list[AllocationModelSnapshot]:
        return (
            self.db.query(AllocationModelSnapshot)
            .filter(AllocationModelSnapshot.period_id == period_id)
            .all()
        )

    def model_by_name(self, name: str) -> Model | None:
        return (
            self.db.query(Model)
            .filter(func.lower(Model.name) == name.lower())
            .one_or_none()
        )

    # --- Step 4: persist ----------------------------------------------------
    def create_run(
        self, *, trade_date: str, period_id: uuid.UUID, status: str,
        trigger: str, grand_total: Decimal | None, run_by: str | None,
    ) -> PostTradeAllocationRun: ...

    def write_cells(self, rows: list[dict]) -> None:
        """Bulk-insert PostTradeAllocation rows (one per run/model/client cell)."""
        ...

    def mark_orders_allocated(self, order_ids: list[uuid.UUID], run_id: uuid.UUID) -> None:
        """UPDATE orders SET allocated_run_id = :run_id WHERE id IN :order_ids."""
        ...

    # --- Step 5: portfolios --------------------------------------------------
    def get_or_create_portfolio(self, user_id: uuid.UUID) -> ClientPortfolio: ...

    def upsert_portfolio_deltas(
        self, deltas: dict[uuid.UUID, Decimal], run_id: uuid.UUID
    ) -> None:
        """Per user_id: previous_amount_in_trade = amount_in_trade;
        amount_in_trade += deltas[user_id]; last_run_id = run_id.
        cash_deposit is never touched here."""
        ...

    # --- GET path ------------------------------------------------------------
    def runs_for_trade_date(self, trade_date: str) -> list[PostTradeAllocationRun]: ...

    def list_run_dates(self, include_empty: bool = False) -> list[PostTradeAllocationRun]: ...

    def cells_for_runs(self, run_ids: list[uuid.UUID]) -> list[PostTradeAllocation]: ...
```

**Behavior / invariants:** every method is pure SQL access — no `Decimal` math beyond what SQL itself returns, no HTTP exceptions raised here (that is the service's job, per the `allocation_matrix` precedent where `AllocationRepository` never raises `HTTPException`). `unallocated_orders()` and `model_by_name()` are read-only; `create_run`/`write_cells`/`mark_orders_allocated`/`upsert_portfolio_deltas` only `flush()`, never `commit()` — the service owns the transaction boundary.

**Done when:** each method returns the documented shape against a seeded row set; `unallocated_orders()` excludes any order with a non-null `allocated_run_id`.

---

### BE-3 — `PostTradeAllocationService.run()` — the 5-step run (Yes — user req.)

- **Proposal ref:** § "Layer 2 — Backend" B; D-3, D-4, D-5, D-9, D-10
- **Module:** 5.2
- **Files:** `modify: app/libs/post_trade_allocation/service.py`
- **Dependencies:** `BE-2`

**Contract (required code — req 2):**

```python
# app/libs/post_trade_allocation/service.py
from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.libs.post_trade_allocation.repository import PostTradeAllocationRepository
from app.models.post_trade_allocation import PostTradeAllocationRun, RunStatus, RunTrigger

ZERO = Decimal("0")


class PostTradeAllocationService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = PostTradeAllocationRepository(db)

    def run(self, *, trigger: RunTrigger, actor: str | None) -> PostTradeAllocationRun:
        """Implements requirement steps 1-5, exactly, in ONE transaction.

        D-3 (safety-critical): the net traded amount per (tradeDate, model) is
        Σ orders.proceeds, SIGNED. Never abs(); never Σ|amount|. A losing day
        must produce a negative `traded`, which flows unmodified through the
        pro-rata split into every client's `allocated` and into
        client_portfolios.amount_in_trade (which can therefore DECREASE).

        Corrected during BE-2 implementation (2026-07-14): `post_trade_allocation_runs.period_id`
        is NOT NULL at the DB layer (DB-1/DB-5) — a run row, empty or not, cannot be written
        without a resolved period. The split-basis lookup therefore happens FIRST, before the
        empty-order short-circuit; if no confirmed period exists at all, `run()` raises instead
        of writing a run with a null period_id. This is a stricter reading of D-5/D-10, not a
        contradiction — § 2's own precondition already assumes a confirmed period exists in any
        real environment.
        """
        with self.db.begin_nested():
            # --- Step 0: resolve split basis (latest confirmed, D-5) — required ---
            period = self.repo.latest_confirmed_period()
            if period is None:
                raise RuntimeError(
                    "No confirmed allocation period exists; cannot create a run "
                    "(post_trade_allocation_runs.period_id is NOT NULL)"
                )
            snapshots = self.repo.snapshots_for_period(period.id)
            by_model: dict[uuid.UUID, list] = defaultdict(list)
            for s in snapshots:
                by_model[s.model_id].append(s)

            # --- Step 1: pick up new orders ---------------------------------
            orders = self.repo.unallocated_orders()
            if not orders:
                run = self.repo.create_run(
                    trade_date=datetime.now(timezone.utc).strftime("%Y%m%d"),
                    period_id=period.id,
                    status=RunStatus.EMPTY.value,
                    trigger=trigger.value,
                    grand_total=ZERO,
                    run_by=actor,
                )
                self.db.commit()
                self.db.refresh(run)
                return run

            # --- Step 2: aggregate per (tradeDate, model) — SIGNED (D-3) -----
            agg: dict[tuple[str, str], Decimal] = defaultdict(lambda: ZERO)
            model_acct: dict[str, str | None] = {}
            orders_by_key: dict[tuple[str, str], list] = defaultdict(list)
            for o in orders:
                key = (o.tradeDate, (o.model or "").strip())
                agg[key] += o.proceeds or ZERO   # signed — no abs(), no |amount|
                model_acct.setdefault(key[1], o.accountId)
                orders_by_key[key].append(o)

            newest_run: PostTradeAllocationRun | None = None
            for (trade_date, model_name), traded in agg.items():
                model = self.repo.model_by_name(model_name)
                run = self.repo.create_run(
                    trade_date=trade_date,
                    period_id=period.id,
                    status=RunStatus.COMPLETED.value,
                    trigger=trigger.value,
                    grand_total=traded,
                    run_by=actor,
                )
                if model is None:
                    # unresolvable model name — logged, orders still marked so
                    # they don't jam the queue forever; no cells, no portfolio delta
                    self.repo.mark_orders_allocated(
                        [o.id for o in orders_by_key[(trade_date, model_name)]], run.id,
                    )
                    newest_run = run
                    continue

                cells = by_model.get(model.id, [])
                units_total = sum((c.multiplier for c in cells), ZERO)
                cell_rows, portfolio_deltas = self._split(
                    traded=traded, units_total=units_total, cells=cells,
                    model=model, model_acct=model_acct[model_name],
                )
                self.repo.write_cells(cell_rows)
                self.repo.mark_orders_allocated(
                    [o.id for o in orders_by_key[(trade_date, model_name)]], run.id,
                )

                # --- Step 5: update portfolios (signed; D-1/D-3) -------------
                self.repo.upsert_portfolio_deltas(portfolio_deltas, run.id)
                newest_run = run

            self.db.commit()
        self.db.refresh(newest_run)
        return newest_run

    def _split(self, *, traded: Decimal, units_total: Decimal, cells, model, model_acct):
        """Step 3/4 math: pro-rata split, SIGNED. No abs() anywhere."""
        cell_rows: list[dict] = []
        deltas: dict[uuid.UUID, Decimal] = {}
        for c in cells:
            allocated = (
                traded * c.multiplier / units_total if units_total else ZERO
            )
            pct = (
                (c.multiplier / units_total * 100).quantize(Decimal("0.001"), ROUND_HALF_UP)
                if units_total else ZERO
            )
            cell_rows.append({
                "model_id": model.id, "user_id": c.user_id,
                "model_traded": traded, "units": c.multiplier,
                "units_total": units_total, "allocated": allocated, "pct": pct,
                "ib_account": c.ib_account, "model_name": model.name,
                "model_acct": model_acct,
            })
            deltas[c.user_id] = deltas.get(c.user_id, ZERO) + allocated  # signed
        return cell_rows, deltas
```

**Behavior / invariants:**
- **D-3 (safety-critical):** the aggregation is `Σ orders.proceeds`, never `abs()`'d, never `Σ|amount|`. A negative `traded` must survive unmodified through `allocated` and into the portfolio delta.
- **D-5:** the split basis is the *latest confirmed* `allocation_periods` row — never the live/open `client_subscriptions` used by the PC workspace (006). Resolved **first**, before the empty-order check (see correction note above) — `period_id` is required on every `post_trade_allocation_runs` row, empty or not.
- **D-9:** `trade_date` is **not** unique on `post_trade_allocation_runs`; a late-arriving order for an already-processed day produces a fresh run row for that same `tradeDate`.
- **D-10:** an empty unallocated-order set writes exactly one `status='empty'` run row (with `period_id` = the resolved confirmed period), no cells, no portfolio touch, and returns immediately — steps 2–5 are skipped entirely.
- **No confirmed period exists at all:** `run()` raises (`RuntimeError`) before writing anything — this is a harder precondition failure than the old "period_id nullable" design, consistent with § 2's own precondition that a confirmed period already exists in any real environment. The router (BE-7) and scheduler (BE-8) are responsible for translating/logging this, not the service.
- A model name with no live `models` row is logged and its orders are still marked (so they don't block future runs), but it contributes no cells and no portfolio delta.
- The entire method executes inside one transaction (`self.db.begin_nested()` → single `self.db.commit()` at the end); any exception before the commit leaves every order's `allocated_run_id` untouched (rollback), making retry safe (C-2 idempotency).

**Done when:** running against a seeded day reproduces the mock's numbers for an identical dataset; a losing-day fixture produces a negative `traded`/`allocated`/portfolio delta; a re-run immediately after finds `unallocated_orders() == []` and writes an empty run (with a valid `period_id`), touching no existing cell or portfolio row; calling `run()` with zero confirmed periods in the DB raises instead of writing a row with a null `period_id`.

---

### BE-4 — `MOBO` authorization actions (MANDATORY)

- **Proposal ref:** § "Layer 2 — Backend" C-1
- **Module:** 5.5
- **Files:** `modify: app/libs/auth/actions.py`
- **Dependencies:** none — parallel-safe

**Contract (required code — req 2):**

```python
# app/libs/auth/actions.py — diff
class Action(str, enum.Enum):
    USER_VIEW = "admin:user_view"
    USER_MANAGE = "admin:user_manage"
    CLIENT_VIEW = "clients:view"
    CLIENT_MANAGE = "clients:manage"
    MODEL_VIEW = "pc:model_view"
    MODEL_MANAGE = "pc:model_manage"
    ALLOCATION_VIEW = "pc:allocation_view"
    ALLOCATION_MANAGE = "pc:allocation_manage"
    # Post-Trade Allocation — feature 011 (BE-4)
    POST_TRADE_ALLOCATION_VIEW = "mobo:pta_view"
    POST_TRADE_ALLOCATION_RUN = "mobo:pta_run"


ROLE_ACTIONS: dict[AdminRole, set[Action]] = {
    AdminRole.RM: {Action.CLIENT_VIEW, Action.CLIENT_MANAGE},
    AdminRole.MOBO: {
        Action.POST_TRADE_ALLOCATION_VIEW,
        Action.POST_TRADE_ALLOCATION_RUN,
    },
    AdminRole.PM: set(),
    AdminRole.PC: {
        Action.MODEL_VIEW,
        Action.MODEL_MANAGE,
        Action.ALLOCATION_VIEW,
        Action.ALLOCATION_MANAGE,
    },
    AdminRole.COMPLIANCE: set(),
    AdminRole.ADMIN: set(Action),   # already grants everything, no edit needed
}
```

**Behavior / invariants:** `AdminRole.ADMIN` continues to be `set(Action)` — adding new enum members automatically grants them to `ADMIN` with no further edit. Every other role's existing grants are untouched (only `MOBO`'s empty set changes).

**Done when:** a `MOBO`-role token passes `require_action(Action.POST_TRADE_ALLOCATION_VIEW)` and `require_action(Action.POST_TRADE_ALLOCATION_RUN)`; an `RM`/`PC`/`PM`/`COMPLIANCE` token gets `403` on both; `ADMIN` passes both without an explicit grant edit.

---

### BE-5 — Response schemas (`PostTradeAllocationView` DTO) (Yes — user req.)

- **Proposal ref:** § "4.1 The wire contract"
- **Module:** 5.3
- **Files:** `create: app/schemas/post_trade_allocation.py`
- **Dependencies:** none — parallel-safe

**Contract (required code — req 2):**

```python
# app/schemas/post_trade_allocation.py
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class PtaClientShareOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    clientId: str
    name: str
    units: float          # DB `units` (frozen allocation_model_snapshots.multiplier at run time)
    allocated: float       # signed — inherits sign from the model's `traded` (D-3)
    pct: int                # round(units / unitsTotal * 100)


class PtaModelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    acct: str               # orders.accountId via model_acct, or "—" if none (D-4)
    traded: float           # Σ proceeds, SIGNED — negative on a losing day (D-3)
    unitsTotal: float
    clientShares: list[PtaClientShareOut]


class PostTradeAllocationView(BaseModel):
    """The frozen wire contract — see § 7. Money crosses as JSON numbers in
    MAJOR units, not Decimal strings (contrast the reconciliation DTOs)."""

    tradeDate: str          # YYYY-MM-DD, ET token (D-6)
    settleDay: str          # display label; == tradeDate formatted today (Q-3)
    grandTotal: float
    models: list[PtaModelOut]


class PtaRunListEntryOut(BaseModel):
    date: str                # YYYY-MM-DD
    label: str
    grandTotal: float


class PtaRunListOut(BaseModel):
    runs: list[PtaRunListEntryOut]


class PtaRunResultOut(BaseModel):
    """POST /run response — always returns a view, real or empty (D-10)."""

    newRuns: list[PtaRunListEntryOut]
    latest: PostTradeAllocationView
```

**Behavior / invariants:** every money field (`traded`, `unitsTotal`, `allocated`, `grandTotal`) is `float` at the schema boundary — the service/repository hold `Decimal` internally and cast only here, at serialization. `units ↔ multiplier` field-name remap (D-4) happens in the service→schema mapping, never in the DB layer. An empty run maps to `PostTradeAllocationView(tradeDate=..., settleDay=..., grandTotal=0.0, models=[])`.

**Done when:** `PostTradeAllocationView.model_validate(...)` round-trips the example payload in proposal § 4.1 byte-for-shape (field names, nesting, types).

---

### BE-6 — `PostTradeAllocationService` GET-path assembly (Yes — user req.)

- **Proposal ref:** § "Layer 2 — Backend" D
- **Module:** 5.2
- **Files:** `modify: app/libs/post_trade_allocation/service.py`
- **Dependencies:** `BE-2`, `BE-5`

**Contract (required code — req 2):**

```python
# app/libs/post_trade_allocation/service.py — additions
from app.schemas.post_trade_allocation import (
    PostTradeAllocationView, PtaModelOut, PtaClientShareOut,
    PtaRunListOut, PtaRunListEntryOut,
)

class PostTradeAllocationService:
    ...

    def get_view(self, trade_date: str | None = None) -> PostTradeAllocationView | None:
        """GET /post-trade-allocation?date=. No `date` -> most recent
        tradeDate with a non-empty run. Aggregates ALL post_trade_allocations
        rows whose run's trade_date matches (multiple runs per date sum, D-9);
        `empty` runs contribute nothing. Never recomputes from `orders`."""
        ...

    def list_runs(self, include_empty: bool = False) -> PtaRunListOut:
        """GET /post-trade-allocation/runs — feeds the DateControl dropdown."""
        ...
```

**Behavior / invariants:** `get_view` reads exclusively from `post_trade_allocations` / `post_trade_allocation_runs` — never re-derives from `orders` (the run already froze the split). When multiple runs exist for one `trade_date` (D-9, a late-arriving order), the GET sums `post_trade_allocations` across every run of that date so totals stay correct; `empty` runs are excluded from the sum by construction (they have no cells). Returns `None` (→ router raises `404`) when no run exists for the requested date.

**Done when:** GET with no `?date` returns the latest non-empty `tradeDate`'s view; GET with an explicit date that has two runs (simulating a late order) sums correctly; GET for a date with only an empty run raises `404`.

---

### BE-7 — Router + route table + mount (Yes — user req.)

- **Proposal ref:** § "Layer 2 — Backend" D
- **Module:** 5.3
- **Files:** `modify: app/libs/post_trade_allocation/router.py`, `modify: app/main.py`
- **Dependencies:** `BE-3`, `BE-4`, `BE-5`, `BE-6`

**Contract (required code — req 2):**

```python
# app/libs/post_trade_allocation/router.py
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.libs.auth.actions import Action
from app.libs.auth.deps import require_action
from app.libs.post_trade_allocation.service import PostTradeAllocationService
from app.models.post_trade_allocation import RunTrigger
from app.models.users import User
from app.schemas.post_trade_allocation import (
    PostTradeAllocationView, PtaRunListOut, PtaRunResultOut,
)

router = APIRouter(prefix="/mobo", tags=["mobo"])


def _get_service(db: Annotated[Session, Depends(get_db)]) -> PostTradeAllocationService:
    return PostTradeAllocationService(db)


@router.get("/post-trade-allocation", response_model=PostTradeAllocationView)
def get_post_trade_allocation(
    service: Annotated[PostTradeAllocationService, Depends(_get_service)],
    _: Annotated[User, Depends(require_action(Action.POST_TRADE_ALLOCATION_VIEW))],
    date: str | None = None,
) -> PostTradeAllocationView:
    view = service.get_view(date)
    if view is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No run for that date")
    return view


@router.get("/post-trade-allocation/runs", response_model=PtaRunListOut)
def list_post_trade_allocation_runs(
    service: Annotated[PostTradeAllocationService, Depends(_get_service)],
    _: Annotated[User, Depends(require_action(Action.POST_TRADE_ALLOCATION_VIEW))],
    includeEmpty: bool = False,
) -> PtaRunListOut:
    return service.list_runs(include_empty=includeEmpty)


@router.post("/post-trade-allocation/run", response_model=PtaRunResultOut)
def run_post_trade_allocation(
    service: Annotated[PostTradeAllocationService, Depends(_get_service)],
    actor: Annotated[User, Depends(require_action(Action.POST_TRADE_ALLOCATION_RUN))],
) -> PtaRunResultOut:
    run = service.run(trigger=RunTrigger.MANUAL, actor=actor.email or actor.firebase_uid)
    latest = service.get_view(run.trade_date)
    return PtaRunResultOut(
        newRuns=[...],  # one entry per distinct tradeDate consumed
        latest=latest,
    )
```

Final route surface:

| Method | Path | Action | Unit |
|---|---|---|---|
| GET | `/api/mobo/post-trade-allocation?date=YYYY-MM-DD` | `POST_TRADE_ALLOCATION_VIEW` | BE-6 |
| GET | `/api/mobo/post-trade-allocation/runs` | `POST_TRADE_ALLOCATION_VIEW` | BE-6 |
| POST | `/api/mobo/post-trade-allocation/run` | `POST_TRADE_ALLOCATION_RUN` | BE-3 |

```python
# app/main.py — additions
from app.libs.post_trade_allocation.router import router as post_trade_allocation_router
app.include_router(post_trade_allocation_router, prefix="/api")
```

**Behavior / invariants:** every route guards with `require_action(...)` exactly as `allocation_matrix/router.py` does; the POST route is always live regardless of the scheduler's env-gate (C-3/BE-8) — it never checks `PTA_SCHEDULER_ENABLED`. POST always returns a `PtaRunResultOut` — for a trade-less batch, `latest` is the empty-run view (`grandTotal=0`, `models=[]`), never a `404`.

**Done when:** all three routes resolve under `/api/mobo/…` in OpenAPI; a non-MOBO/non-ADMIN token gets `403` on all three; re-clicking POST twice in a row with no new orders is a safe no-op (asserted via BE-3's idempotency, observed here as "second POST also returns 200 with an empty-run `latest`").

---

### BE-8 — Env-var-gated scheduler (Yes — user req.)

- **Proposal ref:** § "Layer 2 — Backend" C-3; D-2, D-8
- **Module:** 5.4
- **Files:** `modify: app/libs/post_trade_allocation/scheduler.py`, `modify: app/main.py`
- **Dependencies:** `BE-3`

**Contract (required code — req 2):**

```python
# app/libs/post_trade_allocation/scheduler.py
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

_TICK_SECONDS = 60  # check every minute for the target HH:MM

def _env_bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes")

PTA_SCHEDULER_ENABLED = _env_bool("PTA_SCHEDULER_ENABLED", False)
PTA_SCHEDULER_TIME = os.getenv("PTA_SCHEDULER_TIME", "18:00")
PTA_SCHEDULER_TZ = os.getenv("PTA_SCHEDULER_TZ", "America/New_York")
PTA_SCHEDULER_DAYS = {
    d.strip().upper()
    for d in os.getenv("PTA_SCHEDULER_DAYS", "MON,TUE,WED,THU,FRI").split(",")
}
_WEEKDAY_TOKENS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]


async def _scheduled_job() -> None:
    tz = ZoneInfo(PTA_SCHEDULER_TZ)
    fired_today: str | None = None  # YYYY-MM-DD guard against double-fire within the same minute window
    target_h, target_m = (int(x) for x in PTA_SCHEDULER_TIME.split(":"))
    while True:
        await asyncio.sleep(_TICK_SECONDS)
        try:
            now = datetime.now(tz=tz)
            today_token = _WEEKDAY_TOKENS[now.weekday()]
            today_str = now.strftime("%Y-%m-%d")
            if (
                today_token in PTA_SCHEDULER_DAYS
                and now.hour == target_h and now.minute == target_m
                and fired_today != today_str
            ):
                await _run_scheduled()
                fired_today = today_str
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("PTA scheduler: unexpected error in tick")


async def _run_scheduled() -> None:
    from app.core.database import SessionLocal
    from app.libs.post_trade_allocation.service import PostTradeAllocationService
    from app.models.post_trade_allocation import RunTrigger

    db = SessionLocal()
    try:
        PostTradeAllocationService(db).run(trigger=RunTrigger.SCHEDULED, actor=None)
        logger.info("PTA scheduler: run completed")
    except Exception:
        db.rollback()
        logger.exception("PTA scheduler: run failed")
    finally:
        db.close()


def start_scheduler() -> asyncio.Task | None:
    """Registered from app/main.py lifespan. No-ops (returns None) unless
    PTA_SCHEDULER_ENABLED — the manual POST route is NEVER gated by this flag."""
    if not PTA_SCHEDULER_ENABLED:
        logger.info("PTA scheduler disabled (PTA_SCHEDULER_ENABLED=false)")
        return None
    task = asyncio.create_task(_scheduled_job(), name="pta_scheduler")
    logger.info(
        "PTA scheduler started: %s %s on %s",
        PTA_SCHEDULER_TIME, PTA_SCHEDULER_TZ, sorted(PTA_SCHEDULER_DAYS),
    )
    return task
```

| Var | Type | Default | Notes |
|---|---|---|---|
| `PTA_SCHEDULER_ENABLED` | bool | `false` | if false, `start_scheduler()` returns `None`; POST route unaffected |
| `PTA_SCHEDULER_TIME` | `HH:MM` | `"18:00"` | fire time in `PTA_SCHEDULER_TZ` |
| `PTA_SCHEDULER_TZ` | IANA zone | `"America/New_York"` | ET, aligned with `orders.tradeDate` |
| `PTA_SCHEDULER_DAYS` | comma set | `"MON,TUE,WED,THU,FRI"` | trading-calendar/holiday feed out of scope (Q-2) |

**Behavior / invariants:** `start_scheduler()` called with the flag off must return `None` and register no task — `app/main.py`'s lifespan handles a `None` return by skipping cancellation at shutdown. `PostTradeAllocationRouter`'s POST route (`BE-7`) never imports from or checks this module's env state — the manual button's availability is unconditional (D-8).

**Done when:** with `PTA_SCHEDULER_ENABLED=false` (default), `start_scheduler()` returns `None` and no background task exists; with it `=true` and the clock at the configured `HH:MM` on a configured weekday, `service.run(trigger=SCHEDULED, ...)` fires exactly once for that minute (no double-fire within the same tick window); the manual POST route works identically in both configurations. On a no-trade day (market holiday, trader inactive, or any other reason `orders` has nothing unallocated for that tick) the fired `service.run(trigger=SCHEDULED, ...)` call still returns normally — it hits the D-10 empty-run path inside `_run_scheduled()`, writes one `status='empty'` run row, touches zero cells and zero `client_portfolios` rows, and the `_scheduled_job()` loop keeps ticking (no exception propagates, `fired_today` is still set so it does not re-fire within the same day).

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal § 4.1)

```jsonc
// GET /api/mobo/post-trade-allocation?date=YYYY-MM-DD   (200)
// date optional; defaults to the most recent run. YYYY-MM-DD is the ET trade day.
{
  "tradeDate": "2026-06-03",                // orders.tradeDate ET token this run aggregated (Q-3) — unambiguous, machine-usable
  "settleDay": "Tue 03 Jun 2026",          // display label; currently == tradeDate formatted (Q-3) — kept as a distinct field so a future switch to true T+2 settleDate is a one-line backend change, no DTO shape change
  "grandTotal": 11450000.0,                 // Σ of every model.traded (number, major units)
  "models": [
    {
      "id": "9f2c…",                        // models.id (UUID string)
      "name": "Zero",                       // models.name
      "acct": "U-1234567",                  // IB master account the model traded through
                                            //   (orders.accountId); "—" if none — see D-4
      "traded": 6800000.0,                  // Σ proceeds over the model's orders that day (SIGNED — negative on a losing day; D-3)
      "unitsTotal": 25.0,                   // Σ multiplier across subscribing clients (snapshot)
      "clientShares": [
        {
          "clientId": "3a11…",              // users.id (UUID string)
          "name": "Strathmore Fund",        // client_profiles.name
          "units": 5.0,                     // API field ← DB allocation_model_snapshots.multiplier
          "allocated": 1360000.0,           // traded × multiplier / unitsTotal  (backend-computed; signed — inherits sign from `traded`)
          "pct": 20                         // round(multiplier / unitsTotal × 100)  (backend-computed)
        }
      ]
    }
  ]
}

// GET /api/mobo/post-trade-allocation/runs   (200) — feeds the page's DateControl dropdown
{ "runs": [ { "date": "2026-06-03", "label": "Tue 03 Jun 2026", "grandTotal": 11450000.0 } ] }

// POST /api/mobo/post-trade-allocation/run   (200) — manual "Sync" button (always available)
// body: {}   — no date; the run consumes ALL unallocated orders (D-8) regardless of when they were traded
// 200 → always returns { "newRuns": [...], "latest": PostTradeAllocationView }
//   - unallocated orders found  → one run row per distinct tradeDate consumed, "latest" = the assembled view
//   - none found (D-10)         → one "empty" run row (grandTotal 0, models []), "latest" = that empty view
//   Re-clicking the button is always safe (idempotent no-op on the data; a fresh empty-run row is the only new state)

// Error envelope: FastAPI default { "detail": "<msg>" }; 401 → UNAUTHORIZED, 403 → forbidden,
// 404 → no run for that date. Numeric money fields cross the wire as JSON numbers in MAJOR units
// (the mock already uses e.g. 6_800_000), NOT Numeric(28,10) strings — the page's ptaMoney() and
// Recharts consume numbers. (Contrast the recon DTOs, which carry DecimalStrings.)
```

Per-layer obligations table (verbatim from proposal § 4.2):

| Layer | What this layer contributes | What this layer assumes from the other side |
|---|---|---|
| Database | Persists runs, per-cell allocation records (frozen `units`/`allocated`/`pct`/`ib_account`), and per-client portfolio balances (`cash_deposit` static + signed `amount_in_trade` + `previous_amount_in_trade`). | Backend writes only within one run transaction; `orders.model` resolves to a `models` row; a confirmed period exists. |
| Backend | Serves the `PostTradeAllocationView` above at the three routes with codes {200, 202, 401, 403, 404}; owns all aggregation/split/portfolio math; maps `multiplier → units`. | DB objects exist per Layer 1; `allocation_model_snapshots` holds the confirmed matrix; `orders.netCash/proceeds/amount` populated. |
| Frontend | Consumes the DTO verbatim; `lib/mobo/allocation.ts` becomes a DTO→view mapper (formatting only, no math); page uses a hook. | Backend returns the DTO exactly as § 4.1, money as numbers in major units, `units` already remapped. |

### 7.2 How this layer honours the seam
- **What this layer contributes to the seam:** serves `PostTradeAllocationView` at `GET /api/mobo/post-trade-allocation`, the run list at `GET /api/mobo/post-trade-allocation/runs`, and the manual trigger at `POST /api/mobo/post-trade-allocation/run` (§ 6, `BE-5`/`BE-6`/`BE-7`); owns 100% of the aggregation, pro-rata split, and portfolio math server-side (`BE-3`); performs the `multiplier → units` field rename at the schema boundary (`BE-5`).
- **What this layer assumes from the other side:** the DB-layer objects listed in § 2 preconditions exist with the exact columns named there; `orders.proceeds`/`amount`/`netCash`/`model`/`accountId`/`tradeDate` are populated by the ingest pipeline (out of scope here); `allocation_model_snapshots` holds a genuinely confirmed period's matrix (006/007, already merged).
- **Change protocol:** any edit to § 7 requires editing the proposal first; this section is then re-copied verbatim. Never edit § 7 in isolation.

---

## 8. Internal unit testing (req 5)

### 8.1 Test setup
- **Framework / runner:** `pytest` — command: `pytest -q tests/libs/post_trade_allocation`.
- **Fixtures / seed:** an in-memory/SQLite (or test-Postgres) session with the DB-layer tables created via `Base.metadata.create_all`; factory helpers seeding `Order` rows, a confirmed `AllocationPeriod` + `AllocationModelSnapshot` rows, and a `Model` row (mirrors `allocation_matrix`'s test seed pattern of "four mock models, five clients").
- **Isolation:** each test gets a fresh transaction/session; no shared external state; safe to run in parallel in CI.
- **Layer isolation (critical):** tests import only from `app/libs/post_trade_allocation/`, `app/models/`, `app/schemas/post_trade_allocation.py`, and stdlib/test doubles. They do not import DB-layer migration code or frontend code, and do not assume the sibling `-db`/`-fe` branches are checked out — they build the schema locally via the DB models (already a precondition per § 2) and mock nothing about the seam itself since the seam here *is* this layer's own output (there is no upstream service to fake for BE tests; the "seam mock" concept in § 8.2 below applies to the frontend/DB read assumptions listed in § 7.2, faked via seeded rows rather than a network mock).
- **Code generation:** the concrete test code is written by the `test-gen` skill (arg: `lite | standard | thorough`) into `tests/libs/post_trade_allocation/`, from the goals in § 8.3.

### 8.2 Coverage matrix (every feature has ≥ 1 goal)

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| BE-1 | package imports; app starts with new mount points present (routes empty until BE-7) | none |
| BE-2 | each repository method returns the documented shape; `unallocated_orders()` excludes marked rows | none — direct DB seed |
| BE-3 | 5-step run correctness incl. the signed-Σ-proceeds rule (D-3), empty-run path (D-10), idempotency (marks orders in-tx) | none — direct DB seed (orders, confirmed snapshot) |
| BE-4 | `MOBO` passes both new actions; other non-ADMIN roles get 403; `ADMIN` passes without an explicit edit | none |
| BE-5 | `PostTradeAllocationView` round-trips the proposal's example payload; money fields are `float` | none |
| BE-6 | GET assembly sums across multiple runs per `trade_date` (D-9); excludes empty runs; 404 on no run | none — direct DB seed |
| BE-7 | all 3 routes resolve under `/api/mobo/…`; guarded by the right action; POST always returns 200 with a view | mocks `PostTradeAllocationService` via `app.dependency_overrides` (FastAPI's own DI, not a sibling-layer fake) |
| BE-8 | scheduler no-ops when disabled; fires once per matching minute/day when enabled; independent of the manual route; **a scheduled fire on a day with zero unallocated orders (holiday, no trading, feed down) completes cleanly via the D-10 empty-run path** | none — clock/env faked via `monkeypatch`; DB seeded with zero unallocated `orders` rows for the no-trade case |

### 8.3 Test goals (per unit)

#### BE-1
- **Positive:** `app.main` imports and starts with the new lifespan registration and router import present.
- **Negative:** n/a (scaffolding).
- **Invariants:** no existing route's path or response shape changes.
- **Seam mocks:** none.

#### BE-2
- **Positive:** `unallocated_orders()` returns only rows with `allocated_run_id IS NULL`; `latest_confirmed_period()` returns the most-recently-confirmed row when several exist; `model_by_name()` matches case-insensitively.
- **Negative:** `model_by_name()` returns `None` for an unknown name (no exception raised — the service decides what to do).
- **Invariants:** no method calls `commit()` — only `flush()`/plain `SELECT`.
- **Seam mocks:** none.

#### BE-3
- **Positive:** given seeded orders for one `(tradeDate, model)` with `Σ proceeds = +100`, a confirmed snapshot with two clients at multiplier 3/2, the run produces `allocated = 60 / 40` and marks both orders with the new `run_id`; `client_portfolios.amount_in_trade` increases by each client's `allocated`, `previous_amount_in_trade` captures the pre-run value.
- **Negative:** a losing day (`Σ proceeds = -100`) produces negative `allocated` for every client and *decreases* `amount_in_trade`; an order whose `model` matches no `Model` row is still marked allocated but produces no cell and no portfolio delta; calling `run()` with zero confirmed `allocation_periods` rows raises (`RuntimeError`) and writes no row at all (`period_id` is NOT NULL — corrected 2026-07-14, see BE-3 contract note).
- **Invariants:** empty unallocated-order set ⇒ exactly one `status='empty'` run (with a valid `period_id`), zero cells, zero portfolio writes; calling `run()` twice with no new orders between calls is a no-op on cells/portfolios (idempotency, C-2); the whole method never calls `abs()` on `proceeds` or sums `amount` instead of `proceeds`.
- **Seam mocks:** none — direct DB fixtures stand in for the DB layer's schema (already a precondition).

#### BE-4
- **Positive:** a `MOBO` role token passes `require_action(POST_TRADE_ALLOCATION_VIEW)` and `require_action(POST_TRADE_ALLOCATION_RUN)`.
- **Negative:** `RM`/`PC`/`PM`/`COMPLIANCE` tokens get `403` on both new actions.
- **Invariants:** `ADMIN` passes both without `ROLE_ACTIONS[ADMIN]` being edited (it stays `set(Action)`).
- **Seam mocks:** none.

#### BE-5
- **Positive:** constructing `PostTradeAllocationView` from the proposal's example dict validates and re-serializes with identical field names/nesting; `PtaClientShareOut.pct` is `int`, all money fields are `float`.
- **Negative:** a missing required field (`tradeDate`) raises a `ValidationError`.
- **Invariants:** no `Decimal`/`DecimalString` ever appears in the serialized JSON.
- **Seam mocks:** none.

#### BE-6
- **Positive:** two runs on the same `trade_date` (simulating a late order, D-9) sum correctly in `get_view`; `list_runs()` returns one entry per distinct `trade_date`.
- **Negative:** requesting a date with only an `empty` run raises the router-level `404` (service returns `None`).
- **Invariants:** `get_view` never issues a query against `orders` — only `post_trade_allocation_runs`/`post_trade_allocations`.
- **Seam mocks:** none — direct DB fixtures.

#### BE-7
- **Positive:** `GET /api/mobo/post-trade-allocation`, `.../runs`, and `POST .../run` all resolve and return `200` for a `MOBO` token with seeded data.
- **Negative:** any of the three routes return `403` for a non-`MOBO`/non-`ADMIN` token; the GET view route returns `404` for a date with no run.
- **Invariants:** POST never returns a non-`PtaRunResultOut` shape, even on the empty-run path.
- **Seam mocks:** `PostTradeAllocationService` swapped via `app.dependency_overrides[_get_service]` returning a stub with canned `run()`/`get_view()`/`list_runs()` — FastAPI's own DI override, not a cross-layer fake.

#### BE-8
- **Positive:** with `PTA_SCHEDULER_ENABLED=true`, `PTA_SCHEDULER_TIME` set to the (mocked) current minute and today's weekday in `PTA_SCHEDULER_DAYS`, the job invokes `service.run(trigger=SCHEDULED, ...)` exactly once.
- **Positive — no-trade day (holiday / trader out / feed empty):** seed the DB with zero rows in `orders` (or only already-`allocated_run_id`-marked rows) for the mocked tick, then fire `_run_scheduled()` directly (bypassing the minute-polling loop, same as BE-3's empty-run case but invoked through the scheduler's own entry point, `trigger=RunTrigger.SCHEDULED`). Assert: (a) it returns without raising; (b) exactly one new `post_trade_allocation_runs` row exists with `status='empty'`, `trigger='scheduled'`, `grand_total=0`; (c) `post_trade_allocations` gains zero rows and every existing `client_portfolios` row is byte-for-byte unchanged (no `amount_in_trade`/`previous_amount_in_trade` write — D-10 skips steps 2–5 entirely, not just zeroes them out); (d) the log records completion (`"PTA scheduler: run completed"`), not the failure path — an empty day is not an error; (e) calling `_scheduled_job()`'s tick loop again on the *same* `fired_today` date does not invoke `run()` a second time (the day-guard is independent of whether the prior run was empty or real).
- **Negative:** with the flag unset/false, `start_scheduler()` returns `None` and no task is created; outside the configured day/time, the job does not fire.
- **Invariants:** the manual POST route's behavior (BE-7) is identical whether or not the scheduler is enabled; a no-trade scheduled run is indistinguishable in outcome from a no-trade *manual* run (BE-3's empty-run invariant) — only `post_trade_allocation_runs.trigger` differs (`'scheduled'` vs `'manual'`).
- **Seam mocks:** clock and env vars faked via `monkeypatch`; the no-trade case needs no seam mock either — it's an empty local `orders` table, which is exactly what a real holiday looks like.

### 8.4 Aggregate gate
- All unit tests green is a merge gate (§ 3.2). A red test blocks the branch.
- Target coverage for changed lines: ≥ 90% of new/changed statements in `app/libs/post_trade_allocation/` and `app/schemas/post_trade_allocation.py`.
- Chosen `test-gen` level for this layer: `standard` (happy path + main negative + role/permission per unit) — the signed-Σ-proceeds correctness of `BE-3` (D-3) warrants at minimum the negative losing-day case, already included at `standard`.

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] Every § 6 unit (`BE-1`…`BE-8`) committed on `post-trade-allocation-integration-be`; each commit left the branch green.
- [ ] § 8 unit tests all pass; CI gate (§ 3.2) green.
- [ ] § 7 matches the proposal's frozen seam verbatim. Checked against the proposal on the parent branch, not against the `-db`/`-fe` branches (not visible here).
- [ ] All three routes resolve under `/api/mobo/post-trade-allocation*` in OpenAPI with the documented action guards.
- [ ] PR opened against `post-trade-allocation-integration`; human owns the merge.

**Rollback:** purely additive at the code level — reverting this branch removes the `app/libs/post_trade_allocation/` package, `app/schemas/post_trade_allocation.py`, the two new `Action` enum members + `MOBO` grant in `app/libs/auth/actions.py`, and the router-mount/scheduler-registration lines in `app/main.py`. No existing route, schema, or action changes shape, so no downstream code depends on this layer's additions except the sibling `-fe` layer's seam consumption (§ 7) — reverting this branch before the frontend layer lands is lossless. This layer performs no schema migration itself (that is the `-db` layer's `alembic downgrade -1`); it only reads/writes rows in tables the DB layer owns.
