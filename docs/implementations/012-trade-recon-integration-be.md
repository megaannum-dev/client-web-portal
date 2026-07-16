# 012 — Trade Reconciliation · Implementation Details — Backend

> Status: **DRAFT — pending implementation.**
> Implements: `docs/proposals/012-2026-07-15-trade-recon-integration.md` § Layer 2 — Backend
> Layer: Backend — **one layer per file.**
> Sibling layer docs: [`012-trade-recon-integration-db.md`](012-trade-recon-integration-db.md), [`012-trade-recon-integration-fe.md`](012-trade-recon-integration-fe.md)
> Execution schedule: `docs/execution-schedules/012-trade-recon-integration-be.md`
> Branch: `trade-reconciliation-integration-be` — cut from `trade-reconciliation-integration`. Merges back into the parent; the human owns that merge.
> Builds on / prerequisites: DB layer's three tables (`recon_sessions`, `algotrade_orders`, `algotrade_executions` — see `012-trade-recon-integration-db.md`) migrated/available on the working DB; `app/libs/auth/actions.py` (`Action`, `ROLE_ACTIONS`); `app/libs/post_trade_allocation/service.py` (`PostTradeAllocationService.run()` — the transaction this layer's synthesizer hooks into).

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/012-2026-07-15-trade-recon-integration.md` § Layer 2 — Backend, § 4 (Cross-layer seam) |
| Execution schedule | `docs/execution-schedules/012-trade-recon-integration-be.md` |
| Sibling layer impl docs | `docs/implementations/012-trade-recon-integration-db.md`, `docs/implementations/012-trade-recon-integration-fe.md` |
| Builds on | DB layer tables (see above); `app/libs/post_trade_allocation/` (proposal 011, merged) |

**A stale directory this layer reclaims.** `api-backend/app/libs/reconciliation/` already exists on disk today but holds **only unreferenced `__pycache__` files** (`sources/base.py`, `ib_live.py`, `stored.py`, `trader.py`, `cursor.py`, `repository.py`, `router.py`, `service.py` compiled artifacts, no `.py` source, nothing tracked in git — confirmed via `git ls-tree`). This is dead scaffolding from an earlier, abandoned attempt at this same feature. This layer's BE-* units create fresh `.py` sources at this path; no code from the stale attempt is reused or needs deleting (there is no source to delete, only bytecode cache that Python will overwrite naturally).

**Naming correction vs. the proposal.** The proposal's engine narrative references `ib_trades`/`ib_activity`. The live tables are `orders`/`trades` (`api-backend/app/models/reconciliation.py`, `Order`/`Trade` classes). `Order.tradeDate` is a `String(8)` `"YYYYMMDD"` token (not a `DATE`) and `Order.model` is a free-text label (not a `model_id` FK) — both are accounted for in BE-5/BE-7 below.

---

## 2. Branch & session contract

- **Branch:** `trade-reconciliation-integration-be`, cut from `trade-reconciliation-integration`.
- **Isolation:** implementable independently of the FE layer; depends only on the DB layer's tables existing (a migration, not a merged PR — the schema can be applied to a local/dev DB without waiting on the DB layer's branch to merge).
- **Preconditions:**
  - [ ] `recon_sessions`/`algotrade_orders`/`algotrade_executions` tables applied to the working DB (via the DB layer's migration).
  - [ ] The frozen seam (§ 7) is agreed and matches the proposal § 4 verbatim.
- **Read-first inventory:**
  - `api-backend/app/models/recon.py` — the three new ORM classes this layer's adapters query.
  - `api-backend/app/models/reconciliation.py` — `Order`/`Trade` (IB side).
  - `api-backend/app/models/pc.py` — `Model`, `ClientSubscription`, `AllocationModelSnapshot`.
  - `api-backend/app/models/post_trade_allocation.py` — `PostTradeAllocation`, `ClientPortfolio`, `PostTradeAllocationRun`.
  - `api-backend/app/models/users.py` — `ClientProfile`.
  - `api-backend/app/libs/auth/actions.py`, `api-backend/app/libs/auth/deps.py` — `Action` enum + `require_action()` dependency pattern.
  - `api-backend/app/libs/post_trade_allocation/service.py` (`run()`, lines ~43-137) — the exact transaction (`with self.db.begin_nested(): ... self.db.commit()`) the synthesizer (BE-8) hooks into; also `_format_settle_day`/`_format_date` for formatter parity.
  - `api-backend/app/libs/post_trade_allocation/router.py`, `api-backend/app/schemas/post_trade_allocation.py` — the router/schema/service layering convention this layer mirrors exactly.
  - `api-backend/app/main.py` (~line 47-52) — `app.include_router(...)` registration site.
- **Hand-off / exit signal:** all BE-* units committed, `GET /api/mobo/reconciliation` reachable and gated, pytest suite green, PR opened.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- **Layering:** `router.py` (thin HTTP boundary, `Depends(require_action(...))`) → `service.py` (business logic, one class taking `db: Session`) → `repository.py` (pure DB access, no `HTTPException`, no aggregation) → `models`. This exactly mirrors `app/libs/post_trade_allocation/{router,service,repository}.py` and `app/libs/allocation_matrix/`.
- **Module layout:** one directory per feature area under `app/libs/`; this layer's directory is `app/libs/reconciliation/` (see the stale-directory note above — this reclaims that path).
- **Schemas:** Pydantic `BaseModel` with `ConfigDict(from_attributes=True)` under `app/schemas/<feature>.py`, one class per DTO, mirroring `app/schemas/post_trade_allocation.py`.
- **Routes:** `router = APIRouter(prefix="/mobo", tags=["mobo"])`; route functions take a service via a small `_get_service()` dependency plus `Depends(require_action(Action.X))`, mirroring `post_trade_allocation/router.py`.
- **Actions:** new gate values append to the `Action(str, enum.Enum)` block in `app/libs/auth/actions.py`, with a comment noting the owning feature (see the existing `# Post-Trade Allocation — feature 011 (BE-4)` comment style), and a `ROLE_ACTIONS` entry for `AdminRole.MOBO` (the only role with reconciliation actions today, alongside its existing `POST_TRADE_ALLOCATION_VIEW`/`_RUN`).
- **Error envelope:** bare `HTTPException(status_code, detail=<string>)` — no new envelope shape (proposal Q-9, resolved).

### 3.2 CI/CD & engineering discipline
- **Trunk-friendly, small units.** Each BE-* unit below is a self-contained, revertible commit.
- **Every unit is independently revertible**, except BE-9 (router) which depends on BE-2 through BE-8 being present to import.
- **Additive & backward-compatible first.** Zero changes to existing routes/services; one new route, one new `Action` member, one new hook call inside `PostTradeAllocationService.run()`.
- **Gates before merge:**
  ```bash
  cd api-backend
  ruff check . && ruff format --check . && mypy app && pytest -q
  ```
- **No secrets, no manual steps in the merge path.** Wiring the synthesizer into a *production* Flex-import run is a human gate (see the proposal's Execution & verification § and this doc's § 9), not silently baked into a commit.
- **Reversibility documented:** see § 9.

---

## 4. Architecture

**Target layout:**
```
api-backend/app/libs/reconciliation/
├── __init__.py
├── engine.py                  # BE-7 — pure reconcile(session_id) → ReconciliationResult
├── dtos.py                    # BE-2 — internal result DTOs (dataclasses)
├── formatting.py              # BE-3 — fmtUsd / pctOf parity with flow-types.ts
├── adapters/
│   ├── __init__.py            # BE-4 — SourceAdapter protocols
│   ├── algotrade.py           # BE-4 — AlgoTradeAdapter (reads algotrade_orders/executions)
│   ├── ib.py                  # BE-5 — IBAdapter (reads orders/trades/post_trade_allocations)
│   └── crm.py                 # BE-6 — CRMAdapter (reads client_portfolios)
├── algotrade/
│   ├── __init__.py
│   └── synth.py                # BE-8 — PLUGGABLE, writes SYNTHESIZED rows during PTA run()
├── presenter.py                 # BE-9 — assembles ReconciliationFlowViewOut from a ReconciliationResult
└── router.py                   # BE-9 — GET /api/mobo/reconciliation

api-backend/app/schemas/reconciliation.py   # BE-9 — wire-facing Pydantic DTOs (mirrors § 7 exactly)
api-backend/app/libs/auth/actions.py        # BE-1 — + Action.RECON_VIEW (modified, not new)
api-backend/app/libs/post_trade_allocation/service.py  # BE-8 — + synth hook call (modified, not new)
api-backend/app/main.py                     # BE-9 — + app.include_router(...) (modified, not new)
```

**Dependency direction:** `router → engine → adapters → models`. `synth.py` imports `models` (DB layer) and is imported by exactly one call site (`post_trade_allocation/service.py`'s `run()`); nothing in `engine.py`/`adapters/` imports `synth.py`. Deleting `synth.py` on real-API day touches only that one import line (proposal's "purgeable synthesizer" objective).

**External seams:** reads `algotrade_orders`/`algotrade_executions`/`recon_sessions` (new, DB layer), `orders`/`trades` (existing IB tables), `post_trade_allocations`/`client_portfolios`/`post_trade_allocation_runs` (existing, proposal 011), `models`/`client_subscriptions`/`allocation_model_snapshots` (existing, proposal 006), `client_profiles` (existing). Exposes `GET /api/mobo/reconciliation` to the Frontend layer per § 7.

---

## 5. Modules

### 5.1 `app/libs/auth/actions.py` (modified)
- **Responsibility:** add the `RECON_VIEW` gate.
- **Files:** `api-backend/app/libs/auth/actions.py`.
- **Public surface:** `Action.RECON_VIEW`.
- **Owns features:** BE-1.

### 5.2 `app/libs/reconciliation/dtos.py` + `formatting.py`
- **Responsibility:** internal (non-wire) result shapes the engine produces, and backend-side numeric→string formatters matching `flow-types.ts`'s `fmtUsd`/`pctOf`.
- **Files:** `api-backend/app/libs/reconciliation/dtos.py`, `api-backend/app/libs/reconciliation/formatting.py`.
- **Public surface:** `ReconciliationResult`, `OrderBreak`, `ClientModelBreak`, `CrmBreak`, `CrmAlgoBreak` dataclasses; `fmt_usd(v: Decimal) -> str`, `pct_of(a: Decimal, b: Decimal) -> str`.
- **Owns features:** BE-2, BE-3.

### 5.3 `app/libs/reconciliation/adapters/`
- **Responsibility:** one adapter per source system, each returning plain DTOs — no cross-adapter imports, no business logic.
- **Files:** `api-backend/app/libs/reconciliation/adapters/{__init__,algotrade,ib,crm}.py`.
- **Public surface:** `SourceAdapter` protocol; `AlgoTradeAdapter`, `IBAdapter`, `CRMAdapter` classes, each `__init__(self, db: Session)`.
- **Owns features:** BE-4, BE-5, BE-6.

### 5.4 `app/libs/reconciliation/engine.py`
- **Responsibility:** the pure, notional-anchored `reconcile(session_id)` function — coarse aggregate check first, fixed-sequence fine-grained checks only on mismatch.
- **Files:** `api-backend/app/libs/reconciliation/engine.py`.
- **Public surface:** `def reconcile(db: Session, session_id: uuid.UUID) -> ReconciliationResult`.
- **Owns features:** BE-7.

### 5.5 `app/libs/reconciliation/algotrade/synth.py`
- **Responsibility:** materialize `algotrade_orders`/`algotrade_executions`/`recon_sessions` rows from IB data, hooked into `PostTradeAllocationService.run()`'s transaction.
- **Files:** `api-backend/app/libs/reconciliation/algotrade/synth.py`; `modify: api-backend/app/libs/post_trade_allocation/service.py`.
- **Public surface:** `def synthesize_from_run(db: Session, run: PostTradeAllocationRun, period: AllocationPeriod, orders: list[Order]) -> ReconSession`.
- **Owns features:** BE-8.

### 5.6 `app/schemas/reconciliation.py` + `app/libs/reconciliation/router.py`
- **Responsibility:** the wire-facing Pydantic DTOs (verbatim § 7 shape) and the one route.
- **Files:** `api-backend/app/schemas/reconciliation.py`, `api-backend/app/libs/reconciliation/router.py`; `modify: api-backend/app/main.py`.
- **Public surface:** `router: APIRouter`; `ReconciliationFlowViewOut` + row DTOs.
- **Owns features:** BE-9.

---

## 6. Features

### BE-1 — `Action.RECON_VIEW` (MANDATORY)

- **Proposal ref:** § 4.2, § Layer 2 Route surface
- **Module:** 5.1
- **Files:** `modify: api-backend/app/libs/auth/actions.py`
- **Dependencies:** none — parallel-safe

**Contract:**
```python
class Action(str, enum.Enum):
    ...
    POST_TRADE_ALLOCATION_VIEW = "mobo:pta_view"
    POST_TRADE_ALLOCATION_RUN = "mobo:pta_run"
    # Trade Reconciliation — feature 012 (BE-1)
    RECON_VIEW = "mobo:recon_view"


ROLE_ACTIONS: dict[AdminRole, set[Action]] = {
    ...
    AdminRole.MOBO: {
        Action.POST_TRADE_ALLOCATION_VIEW,
        Action.POST_TRADE_ALLOCATION_RUN,
        Action.RECON_VIEW,
    },
    ...
}
```

**Behavior / invariants:** `AdminRole.ADMIN` already carries `set(Action)` (every action) — no change needed there. Only `AdminRole.MOBO`'s explicit set gains the new member.

**Done when:** `get_actions_for_role(AdminRole.MOBO)` includes `Action.RECON_VIEW`; every other role's action set is unchanged.

---

### BE-2 — Internal result DTOs (MANDATORY)

- **Proposal ref:** § Layer 2 §B (Core logic)
- **Module:** 5.2
- **Files:** `create: api-backend/app/libs/reconciliation/dtos.py`
- **Dependencies:** none — parallel-safe

**Contract:**
```python
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from decimal import Decimal


@dataclass(frozen=True)
class OrderBreak:
    order_id: uuid.UUID
    field: str  # 'qty' | 'price' | 'notional'
    expected: Decimal
    actual: Decimal
    delta: Decimal


@dataclass(frozen=True)
class ClientModelBreak:
    client_id: int
    model_id: uuid.UUID
    expected: Decimal
    actual: Decimal
    delta: Decimal


@dataclass(frozen=True)
class CrmBreak:
    client_id: int
    expected: Decimal
    actual: Decimal
    delta: Decimal


@dataclass(frozen=True)
class CrmAlgoBreak:
    client_id: int
    model_id: uuid.UUID
    reason: str  # 'ib_crm' | 'ib_algo' | 'both' — which upstream check(s) failed


@dataclass
class ReconciliationResult:
    coarse_ok: bool
    algo_total: Decimal
    ib_total: Decimal
    crm_total: Decimal
    order_breaks: list[OrderBreak] = field(default_factory=list)
    client_model_breaks: list[ClientModelBreak] = field(default_factory=list)
    crm_breaks: list[CrmBreak] = field(default_factory=list)
    crm_algo_breaks: list[CrmAlgoBreak] = field(default_factory=list)
```

**Behavior / invariants:** `coarse_ok=True` implies every break list is empty (BE-7's stage-1 short-circuit). These are internal engine types, never returned directly from a route — BE-9's schemas translate them to the wire shape.

**Done when:** the module imports cleanly with no dependency beyond the stdlib; `mypy` passes.

---

### BE-3 — `formatting.py` (Yes)

- **Proposal ref:** § 4.1 ("backend formats")
- **Module:** 5.2
- **Files:** `create: api-backend/app/libs/reconciliation/formatting.py`
- **Dependencies:** none — parallel-safe

**Contract:**
```python
from decimal import Decimal


def fmt_usd(v: Decimal) -> str:
    """Mirrors flow-types.ts fmtUsd: '$X.XXM' at/above 1e6, else '$X,XXX'."""
    abs_v = abs(v)
    if abs_v >= 1_000_000:
        return f"${v / Decimal(1_000_000):.2f}M"
    return f"${v:,.0f}"


def pct_of(part: Decimal, whole: Decimal) -> str:
    """Mirrors flow-types.ts pctOf: '0%' when whole is zero, else rounded integer percent."""
    if whole == 0:
        return "0%"
    return f"{round(part / whole * 100)}%"
```

**Behavior / invariants:** exact parity with `admin-frontend/lib/mobo/flow-types.ts`'s `fmtUsd`/`pctOf` — the Frontend layer stops formatting these fields once the backend supplies them (proposal D-1).

**Done when:** unit tests confirm identical output to the FE functions for a shared table of sample inputs (documented in § 8.3).

---

### BE-4 — `AlgoTradeAdapter` (MANDATORY)

- **Proposal ref:** § Layer 2 §A, § 4.1 field-map
- **Module:** 5.3
- **Files:** `create: api-backend/app/libs/reconciliation/adapters/__init__.py`, `create: api-backend/app/libs/reconciliation/adapters/algotrade.py`
- **Dependencies:** none — parallel-safe with BE-5/BE-6

**Contract:**
```python
# adapters/__init__.py
from typing import Protocol
import uuid


class SourceAdapter(Protocol):
    def __init__(self, db) -> None: ...
```
```python
# adapters/algotrade.py
from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.recon import AlgoTradeExecution, AlgoTradeOrder


class AlgoTradeAdapter:
    def __init__(self, db: Session) -> None:
        self.db = db

    def orders_for_session(self, session_id: uuid.UUID) -> list[AlgoTradeOrder]:
        return self.db.query(AlgoTradeOrder).filter(AlgoTradeOrder.session_id == session_id).all()

    def executions_for_order(self, order_id: uuid.UUID) -> list[AlgoTradeExecution]:
        return (
            self.db.query(AlgoTradeExecution)
            .filter(AlgoTradeExecution.order_id == order_id)
            .order_by(AlgoTradeExecution.executed_at)
            .all()
        )

    def total_notional(self, session_id: uuid.UUID) -> Decimal:
        return sum((o.notional for o in self.orders_for_session(session_id)), Decimal("0"))
```

**Behavior / invariants:** read-only, no SQL leaks past this class — the engine sees `AlgoTradeOrder`/`AlgoTradeExecution` ORM instances (acceptable per this codebase's existing convention of adapters/repositories returning ORM rows, e.g. `PostTradeAllocationRepository.unallocated_orders()`), never raw rows.

**Done when:** `total_notional` matches `SUM(algotrade_orders.notional)` for a seeded session; `orders_for_session`/`executions_for_order` return rows scoped correctly.

---

### BE-5 — `IBAdapter` (MANDATORY)

- **Proposal ref:** § Layer 2 §B step 1/2/3, § 4.1
- **Module:** 5.3
- **Files:** `create: api-backend/app/libs/reconciliation/adapters/ib.py`
- **Dependencies:** none — parallel-safe with BE-4/BE-6

**Contract:**
```python
from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.post_trade_allocation import PostTradeAllocation
from app.models.reconciliation import Order


class IBAdapter:
    def __init__(self, db: Session) -> None:
        self.db = db

    def total_allocated(self, run_id: uuid.UUID) -> Decimal:
        total = (
            self.db.query(func.sum(PostTradeAllocation.allocated))
            .filter(PostTradeAllocation.run_id == run_id)
            .scalar()
        )
        return total or Decimal("0")

    def allocated_for_client_model(self, run_id: uuid.UUID, client_id: int, model_id: uuid.UUID) -> Decimal:
        total = (
            self.db.query(func.sum(PostTradeAllocation.allocated))
            .filter(
                PostTradeAllocation.run_id == run_id,
                PostTradeAllocation.client_id == client_id,
                PostTradeAllocation.model_id == model_id,
            )
            .scalar()
        )
        return total or Decimal("0")

    def matching_order(self, *, symbol: str, buy_sell: str, trade_date_yyyymmdd: str, model_name: str) -> Order | None:
        """Join key: (symbol, side, trade_date, model) — implicit attribute join
        (proposal Q-3, resolved: keep this for now; revisit once a real
        AlgoTrade API sample exists). `orders.tradeDate` is 'YYYYMMDD'; the
        caller (engine, BE-7) is responsible for formatting `AlgoTradeOrder
        .trade_date` (a real DATE) into that token before calling this."""
        return (
            self.db.query(Order)
            .filter(
                Order.symbol == symbol,
                Order.buySell == buy_sell,
                Order.tradeDate == trade_date_yyyymmdd,
                Order.model == model_name,
            )
            .one_or_none()
        )
```

**Behavior / invariants:** exact column names verified against `PostTradeAllocation` (`api-backend/app/models/post_trade_allocation.py:79-114` — confirm `run_id`/`client_id`/`model_id`/`allocated` column names when writing the real code; this contract states the intended shape). `matching_order` performs the string-format conversion described inline — this is the one place IB's `String(8)` date token meets the new schema's real `DATE` column.

**Done when:** `total_allocated`/`allocated_for_client_model` match hand-computed sums against seeded `post_trade_allocations` rows; `matching_order` finds the seeded IB `Order` for a synthesized `AlgoTradeOrder`'s `(symbol, buy_sell, trade_date, model)` tuple and returns `None` for a symbol with no IB counterpart.

---

### BE-6 — `CRMAdapter` (MANDATORY)

- **Proposal ref:** § Layer 2 §B step 1, § 4.1
- **Module:** 5.3
- **Files:** `create: api-backend/app/libs/reconciliation/adapters/crm.py`
- **Dependencies:** none — parallel-safe with BE-4/BE-5

**Contract:**
```python
from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.post_trade_allocation import ClientPortfolio


class CRMAdapter:
    def __init__(self, db: Session) -> None:
        self.db = db

    def total_amount_in_trade(self) -> Decimal:
        total = self.db.query(func.sum(ClientPortfolio.amount_in_trade)).scalar()
        return total or Decimal("0")

    def portfolio_delta(self, user_id: uuid.UUID) -> Decimal:
        row = self.db.get(ClientPortfolio, user_id)
        if row is None:
            return Decimal("0")
        return row.amount_in_trade - row.previous_amount_in_trade
```

**Behavior / invariants:** `crmTotal` (proposal § 4.1) is the sum of `amount_in_trade` across all client portfolios at the session boundary; `portfolio_delta` is the per-client version used by BE-7 stage-2 step 1 (IB↔CRM).

**Done when:** `total_amount_in_trade` matches `SUM(client_portfolios.amount_in_trade)`; `portfolio_delta` matches `amount_in_trade - previous_amount_in_trade` for a seeded portfolio row.

---

### BE-7 — `reconcile()` engine: coarse + fine-grained, fixed sequence (MANDATORY)

- **Proposal ref:** § Layer 2 §B (both stages, all four steps), § Design decision D-5
- **Module:** 5.4
- **Files:** `create: api-backend/app/libs/reconciliation/engine.py`
- **Dependencies:** BE-2, BE-3, BE-4, BE-5, BE-6

**Contract:**
```python
from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.libs.reconciliation.adapters.algotrade import AlgoTradeAdapter
from app.libs.reconciliation.adapters.crm import CRMAdapter
from app.libs.reconciliation.adapters.ib import IBAdapter
from app.libs.reconciliation.dtos import (
    ClientModelBreak,
    CrmAlgoBreak,
    CrmBreak,
    OrderBreak,
    ReconciliationResult,
)
from app.models.recon import ReconSession


def _epsilon() -> Decimal:
    return Decimal(str(get_settings().recon_notional_epsilon))  # default "0.01" (BE-D2 / Q-4)


def reconcile(db: Session, session_id: uuid.UUID) -> ReconciliationResult:
    """Pure, notional-anchored, two-stage. See proposal § Layer 2 §B for the
    full narrative; this docstring states only the acceptance shape."""
    session = db.get(ReconSession, session_id)
    if session is None:
        raise ValueError(f"unknown recon session {session_id}")

    algo = AlgoTradeAdapter(db)
    ib = IBAdapter(db)
    crm = CRMAdapter(db)
    eps = _epsilon()

    # --- Stage 1: coarse (row-level aggregate) ---------------------------
    algo_total = algo.total_notional(session_id)
    ib_total = ib.total_allocated(session.ib_run_id)
    crm_total = crm.total_amount_in_trade()

    coarse_ok = (
        abs(algo_total - ib_total) <= eps
        and abs(ib_total - crm_total) <= eps
        and abs(algo_total - crm_total) <= eps
    )

    result = ReconciliationResult(
        coarse_ok=coarse_ok, algo_total=algo_total, ib_total=ib_total, crm_total=crm_total
    )
    if coarse_ok:
        return result  # O(3 sums) — no fine-grained queries run

    # --- Stage 2: fine-grained, fixed sequence ---------------------------
    # Step 1 — IB <-> CRM, per client
    crm_ok_by_client: dict[int, bool] = {}
    for client_id, user_id in _client_user_pairs(db):
        expected = ib.allocated_for_client_model_total(client_id)  # sum across models for this client
        actual = crm.portfolio_delta(user_id)
        ok = abs(expected - actual) <= eps
        crm_ok_by_client[client_id] = ok
        if not ok:
            result.crm_breaks.append(CrmBreak(client_id=client_id, expected=expected, actual=actual, delta=actual - expected))

    # Step 2 — IB <-> AlgoTrade, per (client, model)
    algo_ok_by_client_model: dict[tuple[int, uuid.UUID], bool] = {}
    for client_id, model_id, expected, actual in _client_model_expected_actual(db, session, algo, ib):
        ok = abs(expected - actual) <= eps
        algo_ok_by_client_model[(client_id, model_id)] = ok
        if not ok:
            result.client_model_breaks.append(
                ClientModelBreak(client_id=client_id, model_id=model_id, expected=expected, actual=actual, delta=actual - expected)
            )

    # Step 3 — AlgoTrade <-> IB, per order
    for order in algo.orders_for_session(session_id):
        ib_order = ib.matching_order(
            symbol=order.symbol,
            buy_sell=order.buy_sell,
            trade_date_yyyymmdd=order.trade_date.strftime("%Y%m%d"),
            model_name=_model_name(db, order.model_id),
        )
        for field_name, expected, actual in _order_field_comparisons(order, ib_order):
            if abs(expected - actual) > eps:
                result.order_breaks.append(
                    OrderBreak(order_id=order.id, field=field_name, expected=expected, actual=actual, delta=actual - expected)
                )

    # Step 4 — CRM <-> AlgoTrade, DERIVED (not independently computed)
    for (client_id, model_id), algo_ok in algo_ok_by_client_model.items():
        crm_ok = crm_ok_by_client.get(client_id, True)
        if not (crm_ok and algo_ok):
            reason = "both" if not crm_ok and not algo_ok else ("ib_crm" if not crm_ok else "ib_algo")
            result.crm_algo_breaks.append(CrmAlgoBreak(client_id=client_id, model_id=model_id, reason=reason))

    return result
```

*(Helper functions `_client_user_pairs`, `_client_model_expected_actual`, `_model_name`, `_order_field_comparisons`, and `IBAdapter.allocated_for_client_model_total` are `<TODO from proposal § Layer 2 §B>` — the proposal states the aggregation intent precisely enough to implement but does not pin exact join SQL for every helper; fill during implementation, keeping the four-step sequence and the single shared `eps` exactly as shown.)*

**Behavior / invariants:**
- **Sequence is fixed**: IB↔CRM → IB↔AlgoTrade → AlgoTrade↔IB → CRM↔AlgoTrade (derived) — never reordered, per proposal D-5.
- **Coarse-pass short-circuit**: when `coarse_ok`, zero fine-grained queries run (verified in § 8 by asserting the adapters' fine-grained methods are never called — a mock-call-count test, not a query-count test).
- **CRM↔AlgoTrade is never independently queried** — `CrmAlgoBreak` is emitted purely from the two upstream verdicts computed in steps 1 and 2.
- Same `eps` (`RECON_NOTIONAL_EPSILON`, default `0.01`) applies to the coarse check and every fine-grained notional comparison; `qty`/`price` comparisons (inside `_order_field_comparisons`) are exact, no epsilon (proposal D-2, Q-4 resolved).

**Done when:** a seeded matched session returns `coarse_ok=True` with all break lists empty; a seeded MSFT-partial-fill session returns `coarse_ok=False` with exactly the expected `OrderBreak`; a seeded CRM-drift session produces a `CrmBreak` and a derived `CrmAlgoBreak` with `reason="ib_crm"`.

---

### BE-8 — `synth.py`: synthesizer wired into IB Flex-import (MANDATORY)

- **Proposal ref:** § Layer 2 §A, § Findings D-1
- **Module:** 5.5
- **Files:** `create: api-backend/app/libs/reconciliation/algotrade/__init__.py`, `create: api-backend/app/libs/reconciliation/algotrade/synth.py`, `modify: api-backend/app/libs/post_trade_allocation/service.py`
- **Dependencies:** BE-2 (uses `SourceKind` from DB layer's `app/models/recon.py`, not from `dtos.py` — no dependency on BE-2 in practice; listed for module-grouping clarity only)

**Contract:**
```python
# algotrade/synth.py
from __future__ import annotations

import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.pc import AllocationModelSnapshot, AllocationPeriod, Model
from app.models.post_trade_allocation import PostTradeAllocationRun
from app.models.reconciliation import Order
from app.models.recon import AlgoTradeExecution, AlgoTradeOrder, ReconSession, SourceKind


def synthesize_from_run(
    db: Session,
    *,
    run: PostTradeAllocationRun,
    period: AllocationPeriod,
    snapshot: AllocationModelSnapshot,
    orders: list[Order],
) -> ReconSession:
    """Called from PostTradeAllocationService.run(), inside its existing
    `with self.db.begin_nested(): ...` transaction (same commit boundary —
    no separate transaction here). One AlgoTradeOrder + N AlgoTradeExecution
    rows per IB order-equivalent, stripping IB-only fields (commissions,
    TCF metadata) per proposal § Layer 2 §A."""
    session = ReconSession(
        id=uuid.uuid4(),
        trade_date=_parse_yyyymmdd(orders[0].tradeDate) if orders else run.created_at.date(),
        ib_run_id=run.id,
        allocation_period_id=snapshot.period_id,
        allocation_user_id=snapshot.user_id,
        allocation_model_id=snapshot.model_id,
    )
    db.add(session)
    db.flush()

    model = db.query(Model).filter(Model.id == snapshot.model_id).one()
    for o in orders:
        algo_order = AlgoTradeOrder(
            id=uuid.uuid4(),
            session_id=session.id,
            model_id=model.id,
            symbol=o.symbol or "",
            buy_sell=o.buySell or "",
            qty_ordered=Decimal(o.quantity or 0),
            price=Decimal(o.price or 0),
            notional=Decimal(o.amount or 0),
            trade_date=_parse_yyyymmdd(o.tradeDate),
            currency=o.currency or "USD",
            source_kind=SourceKind.SYNTHESIZED,
            derived_from_ib_run_id=run.id,
        )
        db.add(algo_order)
        db.flush()
        db.add(
            AlgoTradeExecution(
                id=uuid.uuid4(),
                order_id=algo_order.id,
                qty_filled=Decimal(o.quantity or 0),
                fill_price=Decimal(o.price or 0),
                fill_notional=Decimal(o.amount or 0),
                executed_at=run.created_at,
            )
        )
    db.flush()
    return session


def _parse_yyyymmdd(v: str | None):
    from datetime import date
    if not v:
        raise ValueError("order has no tradeDate; cannot synthesize a session")
    return date(int(v[0:4]), int(v[4:6]), int(v[6:8]))
```
```python
# post_trade_allocation/service.py — BE-8's one hook call, inside run()
# (illustrative diff against the existing method; exact insertion point is
# right after `newest_run` is created / orders are aggregated per
# (trade_date, model) — same loop body around line ~99-103)
from app.libs.reconciliation.algotrade.synth import synthesize_from_run
...
    for (trade_date, model_name), traded in agg.items():
        model = self.repo.model_by_name(model_name)
        run = self.repo.create_run(...)
        # BE-8: materialize the AlgoTrade side for this run, same transaction.
        snapshot = by_model[model.id][0]  # <TODO: confirm snapshot selection rule with period/user scoping>
        synthesize_from_run(
            self.db, run=run, period=period, snapshot=snapshot, orders=orders_by_key[(trade_date, model_name)]
        )
```

**Behavior / invariants:**
- Runs **inside** `PostTradeAllocationService.run()`'s existing `begin_nested()`/`commit()` transaction — no separate commit, so a rollback of the PTA run also rolls back the synthesized AlgoTrade rows.
- One `ReconSession` per `(trade_date, model)` group the PTA run already produces (matches `PostTradeAllocationRun` granularity — one run per `(trade_date, model)` per the existing `run()` loop).
- Strips IB-only fields (commissions, TCF metadata columns on `Order`) — only `symbol`/`buySell`/`quantity`/`price`/`amount`/`tradeDate`/`currency` cross into `algotrade_orders`.
- `git grep synth` after this unit returns exactly one production import site (`post_trade_allocation/service.py`) — the proposal's "purgeable synthesizer" acceptance criterion.

**Done when:** running `PostTradeAllocationService.run()` against seeded unallocated `orders` rows produces both a `PostTradeAllocationRun` (existing behavior, unchanged) and a matching `ReconSession` + `AlgoTradeOrder`/`AlgoTradeExecution` rows in the same transaction; rolling back the transaction leaves no orphaned recon rows.

---

### BE-9 — `GET /api/mobo/reconciliation` route + schemas (MANDATORY)

- **Proposal ref:** § Layer 2 §C (Route surface), § 4.1 (wire contract, error envelope)
- **Module:** 5.6
- **Files:** `create: api-backend/app/schemas/reconciliation.py`, `create: api-backend/app/libs/reconciliation/router.py`, `create: api-backend/app/libs/reconciliation/presenter.py`, `modify: api-backend/app/main.py`
- **Dependencies:** BE-1 (gate), BE-4, BE-5, BE-6 (adapters — presenter re-queries client/model/portfolio rows for display), BE-7 (engine)

**Contract:**
```python
# app/schemas/reconciliation.py — verbatim § 7 shape
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class RcExecOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str; qty: str; px: str; t: str; st: str


class RcOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str; m: str; inst: str; cat: str; side: str
    qty: str; px: str; not_: str; notVal: float
    ref: str; ib: str; st: str
    execs: list[RcExecOut]; brk: str | None = None

    class Config:
        fields = {"not_": "not"}  # 'not' is a Python keyword; alias to the wire name


class RcAllocModelLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    m: str; units: float; amt: str; amtVal: float; st: str; note: str | None = None


class RcAllocOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    cid: str; client: str; st: str; total: str; totalVal: float
    models: list[RcAllocModelLineOut]


class RcPortOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    cid: str; client: str; st: str; pre: str; post: str; chg: str; pct: str
    inTrade: float; cash: float; total: float


class RcBreakCountsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    algIbBrk: int; ibCrmBrk: int; algCrmBrk: int; totalBrk: int


class ReconciliationFlowViewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    settleDay: str
    orders: list[RcOrderOut]; allocs: list[RcAllocOut]; ports: list[RcPortOut]
    algoTotal: str; ibTotal: str; crmTotal: str
    counts: RcBreakCountsOut
```
```python
# app/libs/reconciliation/router.py
from __future__ import annotations
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.libs.auth.actions import Action
from app.libs.auth.deps import require_action
from app.libs.reconciliation.engine import reconcile
from app.models.recon import ReconSession
from app.models.users import User
from app.schemas.reconciliation import ReconciliationFlowViewOut

router = APIRouter(prefix="/mobo", tags=["mobo"])


def _resolve_session(db: Session, session_id: uuid.UUID | None) -> ReconSession:
    if session_id is not None:
        session = db.get(ReconSession, session_id)
        if session is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown reconciliation session")
        return session
    session = (
        db.query(ReconSession)
        .order_by(ReconSession.trade_date.desc(), ReconSession.created_at.desc())
        .first()
    )
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No reconciliation sessions exist yet")
    return session


@router.get("/reconciliation", response_model=ReconciliationFlowViewOut)
def get_reconciliation(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_action(Action.RECON_VIEW))],
    session_id: uuid.UUID | None = None,
) -> object:
    session = _resolve_session(db, session_id)
    try:
        result = reconcile(db, session.id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return to_wire(db, session, result)
```
```python
# app/libs/reconciliation/presenter.py
# Assembles ReconciliationFlowViewOut from a ReconciliationResult + the three
# adapters. Colocated queries here (client roster, portfolio pre/post) are
# presentation-only lookups, not reusable reconciliation logic — that's why
# they live here rather than as new AlgoTradeAdapter/IBAdapter/CRMAdapter
# methods: a future real-AlgoTrade-API swap only ever touches the adapters,
# never this file's row-shaping.
from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy.orm import Session

from app.libs.reconciliation.adapters.algotrade import AlgoTradeAdapter
from app.libs.reconciliation.adapters.crm import CRMAdapter
from app.libs.reconciliation.adapters.ib import IBAdapter
from app.libs.reconciliation.dtos import ReconciliationResult
from app.libs.reconciliation.formatting import fmt_usd, pct_of
from app.models.pc import ClientSubscription, Model
from app.models.post_trade_allocation import ClientPortfolio, PostTradeAllocation
from app.models.recon import ReconSession
from app.models.users import ClientProfile
from app.schemas.reconciliation import (
    RcAllocModelLineOut,
    RcAllocOut,
    RcBreakCountsOut,
    RcExecOut,
    RcOrderOut,
    RcPortOut,
    ReconciliationFlowViewOut,
)


def to_wire(db: Session, session: ReconSession, result: ReconciliationResult) -> ReconciliationFlowViewOut:
    algo = AlgoTradeAdapter(db)
    ib = IBAdapter(db)

    order_breaks_by_id = {b.order_id: b for b in result.order_breaks}
    client_model_breaks = {(b.client_id, b.model_id): b for b in result.client_model_breaks}
    crm_breaks_by_client = {b.client_id: b for b in result.crm_breaks}
    crm_algo_breaks = {(b.client_id, b.model_id) for b in result.crm_algo_breaks}

    orders_out = [
        _build_order(db, algo, ib, o, order_breaks_by_id) for o in algo.orders_for_session(session.id)
    ]
    allocs_out = [
        _build_alloc(row, client_model_breaks)
        for row in _client_model_rows(db, session)
    ]
    ports_out = [
        _build_port(row, crm_breaks_by_client) for row in _portfolio_rows(db, session)
    ]

    counts = RcBreakCountsOut(
        algIbBrk=len(result.order_breaks) + len(result.client_model_breaks),
        ibCrmBrk=len(result.crm_breaks),
        algCrmBrk=len(result.crm_algo_breaks),
        totalBrk=len(result.order_breaks) + len(result.client_model_breaks) + len(result.crm_breaks) + len(result.crm_algo_breaks),
    )

    return ReconciliationFlowViewOut(
        settleDay=session.trade_date.strftime("%d %b %Y"),
        orders=orders_out,
        allocs=allocs_out,
        ports=ports_out,
        algoTotal=fmt_usd(result.algo_total),
        ibTotal=fmt_usd(result.ib_total),
        crmTotal=fmt_usd(result.crm_total),
        counts=counts,
    )


def _build_order(db: Session, algo: AlgoTradeAdapter, ib: IBAdapter, o, order_breaks_by_id: dict) -> RcOrderOut:
    model = db.query(Model).filter(Model.id == o.model_id).one()
    ib_order = ib.matching_order(
        symbol=o.symbol, buy_sell=o.buy_sell,
        trade_date_yyyymmdd=o.trade_date.strftime("%Y%m%d"), model_name=model.name,
    )
    brk = order_breaks_by_id.get(o.id)
    execs = [
        RcExecOut(
            id=str(e.id), qty=str(e.qty_filled), px=str(e.fill_price),
            t=e.executed_at.isoformat(), st="ok",  # execution-level break detail is not tracked separately (OrderBreak is order-scoped); see proposal § Layer 2 §B step 3
        )
        for e in algo.executions_for_order(o.id)
    ]
    return RcOrderOut(
        id=str(o.id), m=model.name, inst=o.symbol, cat=o.asset_class, side=o.buy_sell,
        qty=str(o.qty_ordered), px=str(o.price), not_=fmt_usd(o.notional), notVal=float(o.notional),
        ref=str(o.id),  # Q-3 resolved: implicit join, no client_order_id column yet
        ib=str(ib_order.id) if ib_order is not None else "",
        st="brk" if brk is not None else "ok",
        execs=execs,
        brk=f"{brk.field}: expected {brk.expected} actual {brk.actual}" if brk is not None else None,
    )


def _client_model_rows(db: Session, session: ReconSession):
    """One row per (client, model, subscription) touching this session's model."""
    return (
        db.query(ClientProfile, ClientSubscription, Model)
        .join(ClientSubscription, ClientSubscription.model_id == Model.id)
        .join(ClientProfile, ClientProfile.user_id == ClientSubscription.user_id)
        .filter(Model.id == session.allocation_model_id)
        .all()
    )


def _build_alloc(row, client_model_breaks: dict) -> RcAllocOut:
    client, sub, model = row
    brk = client_model_breaks.get((client.id, model.id))
    amt_val = float(sub.multiplier)  # <TODO: replace with the real PostTradeAllocation sum for (client, model, session) once BE-7's helper query lands — see BE-7's `<TODO from proposal § Layer 2 §B>` note>
    line = RcAllocModelLineOut(
        m=model.name, units=float(sub.multiplier), amt=fmt_usd(Decimal(amt_val)), amtVal=amt_val,
        st="brk" if brk is not None else "ok",
        note=f"expected {brk.expected} actual {brk.actual}" if brk is not None else None,
    )
    return RcAllocOut(
        cid=str(client.id), client=client.name or "", st=line.st,
        total=line.amt, totalVal=line.amtVal, models=[line],
    )


def _portfolio_rows(db: Session, session: ReconSession):
    return (
        db.query(ClientProfile, ClientPortfolio)
        .join(ClientPortfolio, ClientPortfolio.user_id == ClientProfile.user_id)
        .all()
    )


def _build_port(row, crm_breaks_by_client: dict) -> RcPortOut:
    client, portfolio = row
    brk = crm_breaks_by_client.get(client.id)
    chg = portfolio.amount_in_trade - portfolio.previous_amount_in_trade
    return RcPortOut(
        cid=str(client.id), client=client.name or "",
        st="brk" if brk is not None else "ok",
        pre=fmt_usd(portfolio.previous_amount_in_trade), post=fmt_usd(portfolio.amount_in_trade),
        chg=fmt_usd(chg), pct=pct_of(chg, portfolio.previous_amount_in_trade),
        inTrade=float(portfolio.amount_in_trade), cash=float(portfolio.cash_deposit),
        total=float(portfolio.amount_in_trade + portfolio.cash_deposit),
    )
```
```python
# app/main.py — one new line alongside the existing include_router calls
from app.libs.reconciliation.router import router as reconciliation_router
...
app.include_router(reconciliation_router, prefix="/api")
```

**Behavior / invariants:**
- `session_id` optional; omitted → most recent `recon_sessions` row by `(trade_date DESC, created_at DESC)` (proposal Q-8, resolved).
- Status codes: `200` (success), `400` (engine `ValueError`, e.g. malformed state), `403` (via `require_action`'s own exception, unwrapped), `404` (unknown `session_id`, or no sessions exist), `500` (uncaught adapter/engine failure — FastAPI's default handler, no special-casing needed).
- `RcOrder.not` — the wire field name is a Python keyword; the schema aliases `not_` → `"not"` via `Config.fields` (Pydantic v1-style field alias; if this codebase's Pydantic version is v2, use `Field(alias="not")` + `model_config = ConfigDict(populate_by_name=True)` instead — confirm the installed Pydantic major version during implementation).

**Done when:** `GET /api/mobo/reconciliation` (no `session_id`) against a seeded DB returns `200` with a body that validates against `ReconciliationFlowViewOut`; a request without `RECON_VIEW` returns `403`; a bogus `session_id` returns `404`; an empty DB (no sessions) returns `404`.

---

## 7. Frozen seam (from the proposal — verbatim)

*(identical to `012-trade-recon-integration-db.md` § 7.1 — reproduced here per the isolation rule, not linked, so this branch's session has it without opening a sibling doc)*

### 7.1 The seam (verbatim from proposal § 4)

```ts
type FlowState = "ok" | "brk";
// m is the model's display name (e.g. "Model A") — plain string, not a token or a UUID.
// Backend never serializes model_id (UUID) to the wire; it's an internal join key only.

interface RcExec { id: string; qty: string; px: string; t: string; st: FlowState; }
interface RcOrder {
  id: string; m: string; inst: string; cat: string; side: string;
  qty: string; px: string; not: string; notVal: number;
  ref: string; ib: string;
  st: FlowState; execs: RcExec[]; brk?: string;
}
interface RcAllocModelLine { m: string; units: number; amt: string; amtVal: number; st: FlowState; note?: string; }
interface RcAlloc { cid: string; client: string; st: FlowState; total: string; totalVal: number; models: RcAllocModelLine[]; }
interface RcPort  { cid: string; client: string; st: FlowState; pre: string; post: string; chg: string; pct: string; inTrade: number; cash: number; total: number; }
interface RcBreakCounts { algIbBrk: number; ibCrmBrk: number; algCrmBrk: number; totalBrk: number; }

interface ReconciliationFlowView {
  settleDay: string;
  orders: RcOrder[]; allocs: RcAlloc[]; ports: RcPort[];
  algoTotal: string; ibTotal: string; crmTotal: string;
  counts: RcBreakCounts;
}
```

**Error envelope:** bare `HTTPException(status_code, detail=<string>)`. `400` bad session state, `403` missing `RECON_VIEW`, `404` unknown/absent session, `500` adapter/engine failure.

### 7.2 How this layer honours the seam
- **What this layer contributes:** serves `ReconciliationFlowViewOut` at `GET /api/mobo/reconciliation`, gated by `RECON_VIEW`; joins `model_id` to `models.name`; formats currency strings (BE-3); supplies `counts` authoritatively (BE-9, from the engine's break lists).
- **What this layer assumes from the other side:** DB layer's three tables exist with the columns in the field-map; `post_trade_allocations` is populated by proposal 011's pipeline; an `allocation_model_snapshots` row exists for the session's `(period, user, model)` triple; `models.name` values are unique enough for display.
- **Change protocol:** any edit here requires editing the proposal § 4 first; this section is then re-copied.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Framework / runner:** pytest — `pytest -q` from `api-backend/`.
- **Fixtures / seed:** scratch DB seeded with one `models` row, one `client_profiles`/`users` pair, one `allocation_model_snapshots` row, one `post_trade_allocation_runs` row, and hand-built `algotrade_orders`/`orders`/`post_trade_allocations`/`client_portfolios` rows per scenario (matched, MSFT-partial-fill, CRM-drift) mirroring the current mock's two scenarios.
- **Isolation:** hermetic, one transaction per test, rolled back after.
- **Layer isolation:** BE tests import only `app.libs.reconciliation.*`, `app.models.*`, `app.schemas.reconciliation`, plus test doubles — never FE code, never a live HTTP client hitting a running server (route tests use FastAPI's `TestClient` against the in-process app, which is still "this layer" per this codebase's existing route-test convention).
- **Test location:** `api-backend/tests/libs/reconciliation/` (mirrors `tests/libs/post_trade_allocation/`).
- **Commit policy:** never committed — `/tests/` is git-ignored.
- **Code generation:** `test-gen` skill writes the concrete tests from § 8.2/8.3.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| BE-1 | `RECON_VIEW` present for MOBO, absent for other non-ADMIN roles | none |
| BE-2 | dataclasses construct and are immutable where declared frozen | none |
| BE-3 | `fmt_usd`/`pct_of` match FE `fmtUsd`/`pctOf` for a shared input table | none (pure function) |
| BE-4 | `total_notional` / `orders_for_session` / `executions_for_order` correct against seeded rows | none |
| BE-5 | `total_allocated` / `allocated_for_client_model` / `matching_order` correct, including the date-format join | none |
| BE-6 | `total_amount_in_trade` / `portfolio_delta` correct | none |
| BE-7 | coarse-pass shortcut (fine-grained adapter methods never called); MSFT partial-fill produces the exact `OrderBreak`; CRM drift produces `CrmBreak` + derived `CrmAlgoBreak`; fixed sequence honoured | none (adapters are the real DB-backed classes against the seeded scratch DB — "seam mock" here means mocking `IBAdapter`/`CRMAdapter`/`AlgoTradeAdapter` methods with `unittest.mock.patch.object` for the shortcut-count assertion specifically) |
| BE-8 | synth produces session+order+execution rows inside the same transaction as a PTA run; rollback leaves no orphans | mocks `PostTradeAllocationRun`/`AllocationPeriod`/`AllocationModelSnapshot` inputs as plain seeded ORM rows, not a call into `PostTradeAllocationService` itself |
| BE-9 | 200/400/403/404 status codes; response validates against `ReconciliationFlowViewOut`; `session_id` omitted resolves to latest | mocks `reconcile()` to return a canned `ReconciliationResult` for the presenter-assembly test; uses `TestClient` with a `require_action` override for the 403 case |

### 8.3 Test goals

#### BE-1
- **Positive:** `Action.RECON_VIEW in get_actions_for_role(AdminRole.MOBO)`.
- **Negative:** `Action.RECON_VIEW not in get_actions_for_role(AdminRole.PM)` (and RM, COMPLIANCE).
- **Invariants:** `AdminRole.ADMIN`'s set still equals `set(Action)` after the new member is added.
- **Seam mocks:** none.

#### BE-2
- **Positive:** each dataclass constructs with its declared fields; `ReconciliationResult`'s list fields default to empty lists independently (no shared mutable default across instances).
- **Negative:** n/a (plain data containers).
- **Invariants:** frozen dataclasses reject attribute mutation.
- **Seam mocks:** none.

#### BE-3
- **Positive:** `fmt_usd(Decimal("1234567.89"))` and boundary values around `1e6`/`1e3` match the FE table; `pct_of` matches for a range of `(part, whole)` pairs including `whole=0`.
- **Negative:** negative `Decimal` inputs format with a leading `-` consistent with FE behavior.
- **Invariants:** `pct_of(x, x) == "100%"` for any nonzero `x`.
- **Seam mocks:** none.

#### BE-4
- **Positive:** seeded session with 3 orders → `total_notional` equals the hand-summed value; `executions_for_order` returns rows ordered by `executed_at`.
- **Negative:** an unknown `session_id` returns an empty list, not an error.
- **Invariants:** `total_notional` is additive and order-independent.
- **Seam mocks:** none.

#### BE-5
- **Positive:** `matching_order` finds the seeded `orders` row for a synthesized order's `(symbol, buy_sell, trade_date, model)`; `total_allocated`/`allocated_for_client_model` match hand-computed sums.
- **Negative:** `matching_order` returns `None` when no IB order shares the tuple; a `run_id` with zero allocations returns `Decimal("0")`, not an error.
- **Invariants:** the date-token conversion (`DATE` → `"YYYYMMDD"`) round-trips exactly for a range of dates including single-digit months/days (zero-padding).
- **Seam mocks:** none.

#### BE-6
- **Positive:** `total_amount_in_trade` matches a hand-summed value across 3 seeded portfolios; `portfolio_delta` matches `amount_in_trade - previous_amount_in_trade`.
- **Negative:** `portfolio_delta` for a `user_id` with no portfolio row returns `Decimal("0")`.
- **Invariants:** n/a beyond the above.
- **Seam mocks:** none.

#### BE-7
- **Positive:** matched-scenario seed → `coarse_ok=True`, all break lists empty, and (via mock patching) zero calls to any fine-grained adapter method. MSFT-partial-fill seed → `coarse_ok=False`, exactly one `OrderBreak` with `field="qty"` (or the seeded mismatched field) and correct `delta`. CRM-drift seed → `coarse_ok=False`, a `CrmBreak` for the affected client, and a `CrmAlgoBreak` with `reason="ib_crm"` for every `(client, model)` pair touching that client — even though that client/model pair's own AlgoTrade↔IB check passed.
- **Negative:** an unknown `session_id` raises `ValueError`.
- **Invariants:** the four stage-2 steps always execute in the order IB↔CRM → IB↔AlgoTrade → AlgoTrade↔IB → CRM↔AlgoTrade (assert via call-order tracking on the mocked adapters in one dedicated ordering test); the shared `eps` is used identically in the coarse check and every fine-grained notional comparison (parametrize the same seed at `eps` values just above/below the seeded delta and assert the flip).
- **Seam mocks:** `AlgoTradeAdapter`/`IBAdapter`/`CRMAdapter` are the real classes against the seeded scratch DB for the scenario tests; `unittest.mock.patch.object` on their fine-grained methods specifically for the coarse-pass shortcut and step-ordering assertions.

#### BE-8
- **Positive:** given seeded unallocated `orders` rows, a confirmed period, and a snapshot, `synthesize_from_run` produces one `ReconSession` and one `AlgoTradeOrder`+`AlgoTradeExecution` pair per input order, with IB-only fields absent from the synthesized row.
- **Negative:** an order with no `tradeDate` raises `ValueError` (via `_parse_yyyymmdd`) rather than silently defaulting.
- **Invariants:** calling `synthesize_from_run` inside a transaction that is later rolled back leaves zero `recon_sessions`/`algotrade_orders`/`algotrade_executions` rows (transactional atomicity with the PTA run).
- **Seam mocks:** `PostTradeAllocationRun`/`AllocationPeriod`/`AllocationModelSnapshot` are seeded plain ORM instances, not mocks of `PostTradeAllocationService` — this unit does not call into that service, only the reverse (documented as the caller's responsibility in BE-8's own "Files" list).

#### BE-9
- **Positive:** `GET /api/mobo/reconciliation` (no `session_id`) on a seeded DB with ≥1 session returns `200` and a body that round-trips through `ReconciliationFlowViewOut.model_validate`. Passing an existing `session_id` returns that specific session's view.
- **Negative:** missing `RECON_VIEW` → `403`; unknown `session_id` → `404`; empty DB (zero sessions) with `session_id` omitted → `404`; engine `ValueError` → `400`.
- **Invariants:** the response's `counts` always equals the sum of the engine result's break-list lengths (`algIbBrk`/`ibCrmBrk`/`algCrmBrk` individually, `totalBrk` as their sum) — never independently re-derived in the presenter.
- **Seam mocks:** `reconcile()` is mocked (via `unittest.mock.patch`) to return a canned `ReconciliationResult` for the presenter-assembly and status-code tests, isolating BE-9 from BE-7's own correctness (covered separately in BE-7's tests); the FastAPI `TestClient` overrides `require_action` via FastAPI's dependency-override mechanism for the 403 case, following whatever pattern `tests/libs/auth/` already uses for this.

### 8.4 Aggregate gate
- All unit tests green is a local gate before commit/PR hand-off.
- Target coverage: ≥ 90% of new/changed statements in `app/libs/reconciliation/`, `app/schemas/reconciliation.py`, and the touched lines in `app/libs/auth/actions.py` / `post_trade_allocation/service.py`.
- Chosen `test-gen` level for this layer: `thorough` (the engine's coarse/fine branching and fixed sequencing are exactly the kind of edge/ordering logic `thorough` is meant to cover).

---

## 9. Definition of done & rollback

**Definition of done:**
- [ ] BE-1 through BE-9 committed on `trade-reconciliation-integration-be`; each commit left the branch green.
- [ ] § 8 unit tests all pass; CI gate (§ 3.2) green.
- [ ] § 7 matches the proposal's frozen seam verbatim.
- [ ] `git grep synth` (production code only, excluding tests) returns exactly one import site.
- [ ] PR opened; human owns the merge to `trade-reconciliation-integration`.

**Rollback:**
- Reverting the branch removes the route, the engine, the adapters, and the `Action.RECON_VIEW` gate cleanly (additive-only against existing code).
- **If the synthesizer (BE-8) has already run against production data** (i.e. `PostTradeAllocationService.run()` has executed with the hook wired in), rolled-back backend code leaves orphaned `algotrade_*`/`recon_sessions` rows behind — those are then removed by the DB layer's `alembic downgrade -1` (DB doc § 9). Safe order: **BE revert → DB downgrade**, never the reverse, matching the proposal's Rollback section.
- No data loss: nothing this layer touches is destructive to `orders`/`trades`/`post_trade_allocations`/`client_portfolios` — it only reads them and writes new rows into the new tables.
