# 015 — End-of-Day Exception Report · Implementation Details — Backend

> Status: **DRAFT — pending implementation.**
> Implements: `docs/proposals/015-2026-07-21-eod-exception-report.md` § Layer 2 — Backend
> Layer: Backend — **one layer per file.**
> Sibling layer docs: [`015-eod-exception-report-db.md`](015-eod-exception-report-db.md), [`015-eod-exception-report-fe.md`](015-eod-exception-report-fe.md)
> Execution schedule: `docs/execution-schedules/015-eod-exception-report-be.md`
> Branch: `<TODO: parent-branch>-be` — cut from the parent branch.
> Builds on / prerequisites: DB layer's `eod_records`/`eod_break_records` tables (see `015-eod-exception-report-db.md`) migrated/available on the working DB; `app/libs/reconciliation/engine.py::reconcile()` + adapters (proposal 012, merged); `app/libs/post_trade_allocation/service.py::PostTradeAllocationService.run()` (proposal 011, merged — the transaction this layer's `ensure_open` hook joins); `app/libs/trade_models/storage.py::get_storage()` (proposal 006, merged); `app/libs/auth/actions.py` (`Action`, `ROLE_ACTIONS`).

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/015-2026-07-21-eod-exception-report.md` § Layer 2 — Backend, § 4 (Cross-layer seam) |
| Execution schedule | `docs/execution-schedules/015-eod-exception-report-be.md` |
| Sibling layer impl docs | `docs/implementations/015-eod-exception-report-db.md`, `docs/implementations/015-eod-exception-report-fe.md` |
| Builds on | DB layer tables (see above); `app/libs/reconciliation/` (proposal 012, merged); `app/libs/post_trade_allocation/` (proposal 011, merged); `app/libs/trade_models/storage.py` (proposal 006, merged) |

**Naming note vs. the proposal.** The proposal's § Layer 2 §B calls out that `RcBreakCountsOut.algIbBrk` (the existing flow-view DTO, proposal 012) conflates order + client-model breaks under one name — that is the *flow view's* 3-count model, unrelated to and not reused by EoD's 3-leg model. This layer reads the engine's **raw** `result.order_breaks` / `result.client_model_breaks` / `result.crm_breaks` lists directly (never `RcBreakCountsOut`) to keep the three legs cleanly separate, per BE-3 below.

---

## 2. Branch & session contract

- **Branch:** `<TODO: parent-branch>-be`, cut from the parent.
- **Isolation:** implementable independently of the DB/FE layers, provided the DB layer's migration (not its merged PR) is applied to the working DB — a local/dev DB can have the migration applied without waiting on that branch to merge.
- **Preconditions:**
  - [ ] `eod_records`/`eod_break_records` tables applied to the working DB (via the DB layer's migration).
  - [ ] The frozen seam (§ 7) is agreed and matches the proposal § 4 verbatim.
  - [ ] `playwright install chromium` has been run in the local/dev environment before BE-9's `ChromiumRenderer` is exercised (not required for BE-1 through BE-8's unit tests, which mock the renderer — see § 8).
- **Read-first inventory:**
  - `api-backend/app/models/eod.py` (DB layer) — `EodRecord`, `EodBreakRecord`, `EodStatus`, `EodLeg`, `EodOutcome` this layer's repository/service query and write.
  - `api-backend/app/libs/reconciliation/engine.py` (`reconcile()`), `api-backend/app/libs/reconciliation/dtos.py` (`ReconciliationResult`, `OrderBreak`, `ClientModelBreak`, `CrmBreak`) — the pure function this layer calls per `ReconSession`, never modified.
  - `api-backend/app/libs/reconciliation/adapters/{algotrade,ib,crm}.py`, `api-backend/app/libs/reconciliation/presenter.py` (`to_wire`, `_build_order`/`_build_alloc`/`_build_port`) — reused as-is to assemble the `orders`/`allocs`/`ports` sub-DTOs for a merged day.
  - `api-backend/app/models/recon.py` (`ReconSession.trade_date`), `api-backend/app/models/reconciliation.py` (`Order.tradeDate` `String(8)`, `Order.allocated_run_id`) — the day-resolution and completeness-gate queries.
  - `api-backend/app/libs/post_trade_allocation/service.py` (`PostTradeAllocationService.run()`, lines ~65-163, the `with self.db.begin_nested(): ... self.db.commit()` transaction) — the exact hook point for `ensure_open`.
  - `api-backend/app/libs/trade_models/storage.py` (`FileStorage`, `get_storage()`) — reused verbatim for PDF storage; `subdir` param is the month-segmentation hook.
  - `api-backend/app/libs/auth/actions.py`, `api-backend/app/libs/auth/deps.py` (`Action`, `require_action`) — the gate pattern.
  - `api-backend/app/libs/onboarding/router.py` (`download_document_rm`, lines ~142-154), `api-backend/app/libs/onboarding/service.py` (`download_document`, lines ~347-352) — the `StreamingResponse` download pattern this layer's export route mirrors.
  - `api-backend/app/libs/onboarding/router.py` (`approve_onboarding`, lines ~240-246) — the sign-off/mutation pattern (POST, `Depends(require_action(...))`, acting `firebase_uid` into a service method).
  - `api-backend/app/core/config.py` (`Settings`) — where the new `pdf_renderer`/`pdf_render_base_url`/`pdf_render_token` settings are added.
  - `api-backend/app/main.py` (~lines 12-23, 60-68) — `app.include_router(...)` registration site.
- **Hand-off / exit signal:** all BE-* units committed, `GET /api/mobo/eod`, `POST /api/mobo/eod/sign-off`, `GET /api/mobo/eod/export` all reachable and gated, pytest suite green, PR opened.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- **Layering:** `router.py` (thin HTTP boundary, `Depends(require_action(...))`) → `service.py` (business logic, one class taking `db: Session`) → `repository.py` (pure DB access, no `HTTPException`, no aggregation) → `models`. Mirrors `app/libs/onboarding/{router,service,repository}.py` and `app/libs/reconciliation/{router,engine,adapters}.py`.
- **Module layout:** one directory per feature area under `app/libs/`; this layer's directory is `app/libs/eod/`, brand new (no stale/reclaimed path, unlike proposal 012's `reconciliation/`).
- **Schemas:** Pydantic `BaseModel` with `ConfigDict(from_attributes=True)` under `app/schemas/eod.py`, one class per DTO, mirroring `app/schemas/reconciliation.py`.
- **Routes:** `router = APIRouter(prefix="/mobo", tags=["mobo"])` — same prefix as the existing reconciliation/PTA routers (all under `/api/mobo/...`); route functions take a service via a small `_service()` dependency plus `Depends(require_action(Action.X))`.
- **Actions:** new gate value appends to the `Action(str, enum.Enum)` block in `app/libs/auth/actions.py`, with a comment noting the owning feature (matching the existing `# Trade Reconciliation — feature 012 (BE-1)` comment style), and a `ROLE_ACTIONS` entry for `AdminRole.MOBO` (alongside its existing `RECON_VIEW`/`POST_TRADE_ALLOCATION_*`).
- **Error envelope:** bare `HTTPException(status_code, detail=<string>)` — no new envelope shape, matching proposal 012's resolved convention.
- **Config:** new settings append to `app/core/config.py`'s `Settings` class with an inline comment naming the owning feature/unit, matching every existing entry there.

### 3.2 CI/CD & engineering discipline
- **Trunk-friendly, small units.** Each BE-* unit below is a self-contained, revertible commit.
- **Every unit is independently revertible**, except BE-10 (router) which depends on BE-2 through BE-9 being present to import, and BE-6 (the PTA-service hook) which is a one-line-call modification to an existing, already-tested method.
- **Additive & backward-compatible first.** Zero changes to existing routes/services beyond BE-6's one hook call; three new routes, one new `Action` member, three new settings.
- **Gates before merge:**
  ```bash
  cd api-backend
  ruff check . && ruff format --check . && mypy app && pytest -q
  ```
- **No secrets, no manual steps in the merge path.** Confirming `playwright install chromium` is present in the deployment image is a human gate (proposal's Execution & verification § and this doc's § 9), not silently baked into a commit. `PDF_RENDER_TOKEN` is read from environment/settings, never hardcoded.
- **Reversibility documented:** see § 9.

---

## 4. Architecture

**Target layout:**
```
api-backend/app/libs/eod/
├── __init__.py
├── repository.py        # BE-2 — EodRepository: eod_records/eod_break_records queries + day-level session/order queries
├── presenter.py          # BE-3 — merge N ReconciliationResults + reconciliation.presenter row-builders -> day-aggregated sub-DTOs
├── service.py            # BE-4/BE-5/BE-7 — EodService: ensure_open / can_sign_off / build_day_view / sign_off / export
├── router.py             # BE-10 — GET /mobo/eod, POST /mobo/eod/sign-off, GET /mobo/eod/export
└── pdf/
    ├── __init__.py        # BE-9 — get_renderer() factory (config-selected)  <-- plug-and-play seam
    ├── base.py            # BE-8 — PdfRenderer Protocol
    ├── chromium.py         # BE-9 — ChromiumRenderer (Playwright) — DEFAULT
    └── weasyprint.py       # BE-9 — WeasyPrintRenderer — reserved NotImplementedError stub

api-backend/app/schemas/eod.py               # BE-1 — wire-facing Pydantic DTOs (mirrors § 7 exactly)
api-backend/app/libs/auth/actions.py         # BE-6a — + Action.EOD_SIGNOFF (modified, not new)
api-backend/app/libs/post_trade_allocation/service.py  # BE-6 — + ensure_open hook call (modified, not new)
api-backend/app/core/config.py               # BE-8 — + pdf_renderer/pdf_render_base_url/pdf_render_token (modified, not new)
api-backend/app/main.py                      # BE-10 — + app.include_router(...) (modified, not new)
api-backend/pyproject.toml                   # BE-9 — + playwright dependency (modified, not new)
```

**Dependency direction:** `router → service → (repository, presenter, pdf.get_renderer, reconciliation.engine.reconcile, trade_models.storage.get_storage)`. `presenter.py` also calls `reconciliation.presenter`'s existing `_build_order`/`_build_alloc`/`_build_port` row-builders (imported, not duplicated) to assemble each session's rows before this layer merges them across sessions. Nothing in `app/libs/reconciliation/` imports from `app/libs/eod/` — the dependency is one-directional.

**External seams:** reads `recon_sessions` (existing, proposal 012) to resolve every session for a `trade_date`; calls `reconcile()` (existing, unmodified) per session; reads `orders.allocated_run_id`/`orders.tradeDate` (existing, proposal 005) for the completeness gate; writes/reads `eod_records`/`eod_break_records` (new, DB layer); writes files via `get_storage()` (existing, proposal 006). Exposes `GET /api/mobo/eod`, `POST /api/mobo/eod/sign-off`, `GET /api/mobo/eod/export` to the Frontend layer per § 7.

---

## 5. Modules

### 5.1 `app/schemas/eod.py`
- **Responsibility:** the wire-facing Pydantic DTOs (verbatim § 7 shape).
- **Files:** `api-backend/app/schemas/eod.py` (new).
- **Public surface:** `EodStatus`, `EodOutcome` (str enums, wire-facing — distinct from but value-identical to the DB layer's `app.models.eod.EodStatus`/`EodOutcome`, per this codebase's existing wire/domain-enum separation, e.g. `RunStatus`/`RunTrigger` in `schemas/post_trade_allocation.py` vs. `models/post_trade_allocation.py`), `EodReportViewOut`, `EodSignOffReq`.
- **Owns features:** BE-1.

### 5.2 `app/libs/eod/repository.py`
- **Responsibility:** all direct `eod_records`/`eod_break_records` reads/writes, plus the two cross-feature queries (sessions for a day; unallocated-orders-for-a-day) this layer needs but no existing repository exposes.
- **Files:** `api-backend/app/libs/eod/repository.py` (new).
- **Public surface:** `EodRepository` class — `sessions_for_trade_date`, `has_unallocated_orders`, `get_by_trade_date`, `resolve_default_day`, `ensure_open`, `write_snapshot_and_sign`.
- **Owns features:** BE-2.

### 5.3 `app/libs/eod/presenter.py`
- **Responsibility:** merge N `ReconciliationResult`s (one per session on a day) into the day-aggregated `orders`/`allocs`/`ports`/`algoTotal`/`ibTotal`/`crmTotal` sub-DTOs, reusing `reconciliation.presenter`'s row-builders per session.
- **Files:** `api-backend/app/libs/eod/presenter.py` (new).
- **Public surface:** `merge_day_view(db, sessions, results) -> tuple[list[RcOrderOut], list[RcAllocOut], list[RcPortOut], str, str, str]`.
- **Owns features:** BE-3.

### 5.4 `app/libs/eod/service.py`
- **Responsibility:** all EoD business logic — day aggregation, completeness gate, sign-off mutation, export.
- **Files:** `api-backend/app/libs/eod/service.py` (new).
- **Public surface:** `EodService` class — `build_day_view(trade_date=None) -> EodReportViewOut`, `sign_off(trade_date, signed_off_by) -> EodReportViewOut`, `export(trade_date) -> tuple[BinaryIO, str]`.
- **Owns features:** BE-4, BE-5, BE-7.

### 5.5 `app/libs/eod/pdf/`
- **Responsibility:** the plug-and-play PDF rendering seam.
- **Files:** `api-backend/app/libs/eod/pdf/{__init__,base,chromium,weasyprint}.py` (new).
- **Public surface:** `PdfRenderer` protocol; `get_renderer() -> PdfRenderer`.
- **Owns features:** BE-8, BE-9.

### 5.6 `app/libs/auth/actions.py` (modified) + `app/libs/post_trade_allocation/service.py` (modified)
- **Responsibility:** add the `EOD_SIGNOFF` gate; hook `ensure_open` into the existing PTA transaction.
- **Files:** `api-backend/app/libs/auth/actions.py`, `api-backend/app/libs/post_trade_allocation/service.py`.
- **Public surface:** `Action.EOD_SIGNOFF`; no new public surface on `PostTradeAllocationService` (internal call only).
- **Owns features:** BE-6.

### 5.7 `app/libs/eod/router.py`
- **Responsibility:** the three HTTP routes.
- **Files:** `api-backend/app/libs/eod/router.py`; `modify: api-backend/app/main.py`.
- **Public surface:** `router: APIRouter`.
- **Owns features:** BE-10.

---

## 6. Features

### BE-1 — Wire schemas (MANDATORY)

- **Proposal ref:** § 4.1
- **Module:** 5.1
- **Files:** `create: api-backend/app/schemas/eod.py`
- **Dependencies:** none — parallel-safe

**Contract:**
```python
from __future__ import annotations

import enum

from pydantic import BaseModel, ConfigDict

from app.schemas.reconciliation import RcAllocOut, RcBreakCountsOut, RcOrderOut, RcPortOut


class EodStatus(str, enum.Enum):
    OPEN = "OPEN"
    SIGNED = "SIGNED"


class EodOutcome(str, enum.Enum):
    CLEAR = "CLEAR"
    EXCEPTIONS = "EXCEPTIONS"


class EodReportViewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    settleDay: str
    tradeDate: str
    orders: list[RcOrderOut]
    allocs: list[RcAllocOut]
    ports: list[RcPortOut]
    algoTotal: str
    ibTotal: str
    crmTotal: str
    counts: RcBreakCountsOut
    status: EodStatus
    signedOffBy: str | None = None
    signedOffAt: str | None = None
    generated: str | None = None
    orderCount: int
    executionCount: int
    notionalTraded: str
    breakTotal: int
    outcome: EodOutcome
    canSignOff: bool
    exportReady: bool


class EodSignOffReq(BaseModel):
    tradeDate: str
```

**Behavior / invariants:** `EodReportViewOut` reuses `RcOrderOut`/`RcAllocOut`/`RcPortOut`/`RcBreakCountsOut` from `app/schemas/reconciliation.py` verbatim (proposal § 4.1's "field names unchanged") — no duplicate row-shape definitions. `EodStatus`/`EodOutcome` here are the wire-facing enums; the DB layer's `app.models.eod.EodStatus`/`EodOutcome` are value-identical but a distinct Python type (matches `RunStatus` wire/domain separation elsewhere in this codebase).

**Done when:** the module imports cleanly; `EodReportViewOut.model_validate(...)` round-trips a hand-built dict matching § 7's shape.

---

### BE-2 — `EodRepository` (MANDATORY)

- **Proposal ref:** § Layer 2 §B, §C-1, §C-2
- **Module:** 5.2
- **Files:** `create: api-backend/app/libs/eod/repository.py`
- **Dependencies:** none — parallel-safe

**Contract:**
```python
from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy.orm import Session

from app.models.eod import EodBreakRecord, EodLeg, EodOutcome, EodRecord, EodStatus
from app.models.recon import ReconSession
from app.models.reconciliation import Order


class EodRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # --- day-level session resolution (§B) ---------------------------------
    def sessions_for_trade_date(self, trade_date: date) -> list[ReconSession]:
        return self.db.query(ReconSession).filter(ReconSession.trade_date == trade_date).all()

    # --- completeness gate (§C-2) --------------------------------------------
    def has_unallocated_orders(self, trade_date_yyyymmdd: str) -> bool:
        return (
            self.db.query(Order)
            .filter(Order.allocated_run_id.is_(None), Order.tradeDate == trade_date_yyyymmdd)
            .limit(1)
            .count()
            > 0
        )

    # --- header CRUD ----------------------------------------------------------
    def get_by_trade_date(self, trade_date: date) -> EodRecord | None:
        return self.db.query(EodRecord).filter(EodRecord.trade_date == trade_date).one_or_none()

    def resolve_default_day(self) -> EodRecord | None:
        """Q-3, settled: latest OPEN row, falling back to latest SIGNED."""
        open_row = (
            self.db.query(EodRecord)
            .filter(EodRecord.status == EodStatus.OPEN)
            .order_by(EodRecord.trade_date.desc())
            .first()
        )
        if open_row is not None:
            return open_row
        return (
            self.db.query(EodRecord)
            .filter(EodRecord.status == EodStatus.SIGNED)
            .order_by(EodRecord.trade_date.desc())
            .first()
        )

    def ensure_open(self, trade_date: date) -> EodRecord:
        """Idempotent upsert (§C-1): first session of a day creates an OPEN
        header; every later call for the same date is a no-op. Relies on
        eod_records' UNIQUE(trade_date) — callers run inside the same
        transaction as the caller's own commit boundary (PTA's run())."""
        existing = self.get_by_trade_date(trade_date)
        if existing is not None:
            return existing
        record = EodRecord(id=uuid.uuid4(), trade_date=trade_date, status=EodStatus.OPEN)
        self.db.add(record)
        self.db.flush()
        return record

    # --- sign-off write (§C-3) -------------------------------------------------
    def write_snapshot_and_sign(
        self,
        record: EodRecord,
        *,
        signed_off_by: str,
        signed_off_at: datetime,
        order_count: int,
        execution_count: int,
        notional_total: str,
        break_rows: list[dict],
        file_storage_key: str,
    ) -> EodRecord:
        break_total = len(break_rows)
        record.status = EodStatus.SIGNED
        record.signed_off_by = signed_off_by
        record.signed_off_at = signed_off_at
        record.order_count = order_count
        record.execution_count = execution_count
        record.notional_total = notional_total  # type: ignore[assignment]  # Decimal-compatible str/Decimal accepted by the column
        record.break_total = break_total
        record.outcome = EodOutcome.CLEAR if break_total == 0 else EodOutcome.EXCEPTIONS
        record.file_storage_key = file_storage_key
        self.db.add_all([EodBreakRecord(id=uuid.uuid4(), eod_record_id=record.id, **row) for row in break_rows])
        self.db.flush()
        return record

    def break_rows_for(self, record: EodRecord) -> list[EodBreakRecord]:
        return self.db.query(EodBreakRecord).filter(EodBreakRecord.eod_record_id == record.id).all()
```

**Behavior / invariants:**
- `has_unallocated_orders` mirrors `PostTradeAllocationRepository.unallocated_orders` (`allocated_run_id IS NULL`) but filters by `Order.tradeDate` (the day) rather than `ingested_at` (a timestamp cutoff) — proposal C-2's stated distinction.
- `ensure_open` and `write_snapshot_and_sign` do **not** call `db.commit()` themselves — the caller (BE-4/BE-6) owns the transaction boundary, matching `PostTradeAllocationRepository`'s convention of pure DB access with commit left to the service/caller.
- `write_snapshot_and_sign` is the **only** place `eod_records` columns are updated after creation, and the only place `eod_break_records` rows are ever inserted.

**Done when:** `ensure_open` called twice for the same `trade_date` returns the same row both times with exactly one `eod_records` row created; `has_unallocated_orders` matches a hand-seeded `orders` table; `write_snapshot_and_sign` leaves `status=SIGNED`, `outcome` correctly `CLEAR`/`EXCEPTIONS`, and exactly `len(break_rows)` new `EodBreakRecord` rows.

---

### BE-3 — Day-level merge presenter (Yes)

- **Proposal ref:** § Layer 2 §B
- **Module:** 5.3
- **Files:** `create: api-backend/app/libs/eod/presenter.py`
- **Dependencies:** none at import time (calls into `app/libs/reconciliation/presenter.py`'s existing functions, not modified)

**Contract:**
```python
from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from app.libs.reconciliation.dtos import ReconciliationResult
from app.libs.reconciliation.formatting import fmt_usd
from app.libs.reconciliation.presenter import _build_alloc, _build_order, _build_port, _client_model_rows, _portfolio_rows
from app.libs.reconciliation.adapters.algotrade import AlgoTradeAdapter
from app.libs.reconciliation.adapters.crm import CRMAdapter
from app.libs.reconciliation.adapters.ib import IBAdapter
from app.models.recon import ReconSession
from app.schemas.reconciliation import RcAllocOut, RcOrderOut, RcPortOut


def merge_day_view(
    db: Session, sessions: list[ReconSession], results: list[ReconciliationResult]
) -> tuple[list[RcOrderOut], list[RcAllocOut], list[RcPortOut], str, str, str]:
    """One (session, result) pair per model group traded that day (§B) — concatenate
    every session's rows rather than picking "the latest", since a day with N
    models produces N sessions that all belong in one EoD report."""
    algo = AlgoTradeAdapter(db)
    ib = IBAdapter(db)
    crm = CRMAdapter(db)

    orders_out: list[RcOrderOut] = []
    allocs_out: list[RcAllocOut] = []
    ports_out: list[RcPortOut] = []
    algo_total = ib_total = crm_total = Decimal("0")

    for session, result in zip(sessions, results, strict=True):
        order_breaks_by_id = {b.order_id: b for b in result.order_breaks}
        client_model_breaks = {(b.client_id, b.model_id): b for b in result.client_model_breaks}
        crm_breaks_by_client = {b.client_id: b for b in result.crm_breaks}

        orders_out += [
            _build_order(db, algo, ib, o, order_breaks_by_id) for o in algo.orders_for_session(session.id)
        ]
        allocs_out += [
            _build_alloc(ib, session, row, client_model_breaks) for row in _client_model_rows(db, session)
        ]
        ports_out += [
            _build_port(crm, session, row, crm_breaks_by_client) for row in _portfolio_rows(db, session)
        ]
        algo_total += result.algo_total
        ib_total += result.ib_total
        crm_total += result.crm_total

    return orders_out, allocs_out, ports_out, fmt_usd(algo_total), fmt_usd(ib_total), fmt_usd(crm_total)
```

**Behavior / invariants:**
- Reuses `reconciliation.presenter`'s private row-builders (`_build_order`/`_build_alloc`/`_build_port`/`_client_model_rows`/`_portfolio_rows`) rather than re-implementing row assembly — a leading-underscore cross-module import, acceptable here because both modules are in the same `app/libs/` tree and this is exactly the "day aggregates N single-session views" extension the existing presenter wasn't built for; if this friction proves awkward in practice, promoting those five names to non-private is a same-PR call, not a design change. `<TODO: confirm during implementation whether app/libs/reconciliation/presenter.py's maintainer prefers promoting these to public names instead of the leading-underscore import — either is acceptable, this doc states the import as the default>`.
- Sums (`algo_total`/`ib_total`/`crm_total`) are additive across sessions before formatting — never sum the already-formatted display strings.
- Each model already carries a model pill in its row DTO (`RcOrderOut.m`, etc.), so multi-model rows from different sessions coexist in one leg table with zero FE change (proposal § Layer 3, confirmed).

**Done when:** given 2 seeded sessions for the same `trade_date` (different models), `merge_day_view` returns a concatenated `orders`/`allocs`/`ports` list spanning both sessions' rows, and `algoTotal`/`ibTotal`/`crmTotal` equal the sum of both sessions' totals, formatted once.

---

### BE-4 — `EodService.build_day_view` (MANDATORY)

- **Proposal ref:** § Layer 2 §B, §C-2
- **Module:** 5.4
- **Files:** `create: api-backend/app/libs/eod/service.py`
- **Dependencies:** BE-1, BE-2, BE-3

**Contract:**
```python
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.libs.eod.presenter import merge_day_view
from app.libs.eod.repository import EodRepository
from app.libs.reconciliation.engine import reconcile
from app.libs.reconciliation.formatting import fmt_usd
from app.models.eod import EodOutcome as DbEodOutcome, EodRecord, EodStatus as DbEodStatus
from app.schemas.eod import EodOutcome, EodReportViewOut, EodStatus
from app.schemas.reconciliation import RcBreakCountsOut


class EodService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = EodRepository(db)

    def _raw_yyyymmdd(self, trade_date: date) -> str:
        return trade_date.strftime("%Y%m%d")

    def build_day_view(self, trade_date_iso: str | None = None) -> EodReportViewOut:
        record = self._resolve_record(trade_date_iso)
        sessions = self.repo.sessions_for_trade_date(record.trade_date)
        results = [reconcile(self.db, s.id) for s in sessions]
        orders, allocs, ports, algo_total, ib_total, crm_total = merge_day_view(self.db, sessions, results)

        order_breaks = sum(len(r.order_breaks) for r in results)
        client_model_breaks = sum(len(r.client_model_breaks) for r in results)
        crm_breaks = sum(len(r.crm_breaks) for r in results)
        crm_algo_breaks = sum(len(r.crm_algo_breaks) for r in results)

        can_sign_off = not self.repo.has_unallocated_orders(self._raw_yyyymmdd(record.trade_date))

        if record.status == DbEodStatus.SIGNED:
            # frozen path — serve the snapshot, never recompute (proposal D-3)
            order_count, execution_count = record.order_count, record.execution_count
            notional_total = fmt_usd(Decimal(record.notional_total))
            break_total = record.break_total
            outcome = EodOutcome(record.outcome.value) if record.outcome else EodOutcome.CLEAR
        else:
            order_count = len(orders)
            execution_count = sum(len(o.execs) for o in orders)
            notional_total = ib_total
            break_total = order_breaks + client_model_breaks + crm_breaks
            outcome = EodOutcome.CLEAR if break_total == 0 else EodOutcome.EXCEPTIONS

        return EodReportViewOut(
            settleDay=record.trade_date.strftime("%d %b %Y"),
            tradeDate=record.trade_date.isoformat(),
            orders=orders, allocs=allocs, ports=ports,
            algoTotal=algo_total, ibTotal=ib_total, crmTotal=crm_total,
            counts=RcBreakCountsOut(
                algIbBrk=order_breaks + client_model_breaks,
                ibCrmBrk=crm_breaks,
                algCrmBrk=crm_algo_breaks,
                totalBrk=order_breaks + client_model_breaks + crm_breaks + crm_algo_breaks,
            ),
            status=EodStatus(record.status.value),
            signedOffBy=record.signed_off_by,
            signedOffAt=record.signed_off_at.isoformat() if record.signed_off_at else None,
            generated=record.signed_off_at.strftime("%H:%M GMT") if record.signed_off_at else None,
            orderCount=order_count, executionCount=execution_count,
            notionalTraded=notional_total, breakTotal=break_total, outcome=outcome,
            canSignOff=can_sign_off,
            exportReady=(record.status == DbEodStatus.SIGNED and record.file_storage_key is not None),
        )

    def _resolve_record(self, trade_date_iso: str | None) -> EodRecord:
        from fastapi import HTTPException, status
        if trade_date_iso is not None:
            record = self.repo.get_by_trade_date(date.fromisoformat(trade_date_iso))
        else:
            record = self.repo.resolve_default_day()
        if record is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No EoD day exists yet")
        return record
```

**Behavior / invariants:**
- **Two distinct code paths by status** (proposal D-3): `OPEN` recomputes stats live from a fresh `reconcile()` per session; `SIGNED` serves the frozen `EodRecord` columns — the `EodReportViewOut` shape is identical either way, so the Frontend layer never branches on `status` to decide which fields are trustworthy.
- `counts` (the existing `RcBreakCountsOut` 3-count shape) is populated for backward-shape-compatibility with `reconciliation.presenter`'s convention, but EoD's `breakTotal`/`outcome` are the authoritative 3-leg figures (`order_breaks + client_model_breaks + crm_breaks`, **excluding** `crm_algo_breaks`, the derived Step-4 diagnostic) — never conflated with `counts.totalBrk` (which does include it).
- `can_sign_off` is always computed live (even for an already-`SIGNED` day, where it's inert/unused by the caller) — cheap, and avoids a second code path.

**Done when:** against a seeded `OPEN` day with 2 sessions (one clean, one with a seeded order break), `build_day_view()` returns `status="OPEN"`, `breakTotal` equal to the seeded break count, `outcome="EXCEPTIONS"`, and `canSignOff` reflecting whether all that day's orders are allocated. Against a seeded `SIGNED` day, the same call returns the frozen stat/outcome values unchanged even if the underlying `orders`/`recon_sessions` rows are mutated afterward (proven by mutating a session's order post-sign and asserting the view is unaffected).

---

### BE-5 — `EodService.sign_off` (Yes — user req.)

- **Proposal ref:** § Layer 2 §C-3
- **Module:** 5.4
- **Files:** `modify: api-backend/app/libs/eod/service.py`
- **Dependencies:** BE-2, BE-4, BE-8/BE-9 (renderer), `app/libs/trade_models/storage.py::get_storage` (existing)

**Contract:**
```python
from fastapi import HTTPException, status

from app.libs.eod.pdf import get_renderer
from app.libs.trade_models.storage import get_storage


class EodService:
    ...

    def sign_off(self, trade_date_iso: str, signed_off_by: str) -> EodReportViewOut:
        trade_date = date.fromisoformat(trade_date_iso)
        record = self.repo.get_by_trade_date(trade_date)
        if record is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No EoD day exists yet")
        if record.status == DbEodStatus.SIGNED:
            raise HTTPException(status.HTTP_409_CONFLICT, "This day is already signed off")

        raw = self._raw_yyyymmdd(trade_date)
        if self.repo.has_unallocated_orders(raw):
            raise HTTPException(status.HTTP_409_CONFLICT, "This day is not yet complete — unallocated orders remain")

        sessions = self.repo.sessions_for_trade_date(trade_date)
        results = [reconcile(self.db, s.id) for s in sessions]
        orders, _, _, _, ib_total, _ = merge_day_view(self.db, sessions, results)

        break_rows = _flatten_break_rows(results)  # <TODO from proposal § Layer 1 B-2: exact subject_ref/break_type string formatting per leg — see BE-3's row-builders for the display strings to reuse>
        execution_count = sum(len(o.execs) for o in orders)

        self.repo.write_snapshot_and_sign(
            record,
            signed_off_by=signed_off_by,
            signed_off_at=datetime.now(timezone.utc),
            order_count=len(orders),
            execution_count=execution_count,
            notional_total=ib_total.replace("$", "").replace(",", ""),  # <TODO: store the raw Decimal from merge_day_view instead of re-parsing the formatted string — presenter should return both>
            break_rows=break_rows,
            file_storage_key="",  # placeholder — replaced below once the PDF is rendered
        )
        self.db.flush()

        pdf_bytes = get_renderer().render(trade_date_iso)
        month_subdir = trade_date.strftime("%Y-%m")
        storage_key = get_storage().save(
            _bytes_io(pdf_bytes), suggested_name=f"EoD-{trade_date_iso}.pdf",
            content_type="application/pdf", subdir=month_subdir,
        )
        record.file_storage_key = storage_key
        self.db.commit()
        self.db.refresh(record)

        return self.build_day_view(trade_date_iso)
```

**Behavior / invariants:**
- Guard order (proposal C-3 steps 1-2): 404 if no header row exists, 409 if already `SIGNED`, 409 if the completeness gate fails — in that order, before any recomputation happens.
- **All in one transaction** (proposal step 6): the snapshot write, the header mutation, and the `file_storage_key` write all land in the same `db.commit()` — if PDF rendering raises, nothing is committed and the day stays `OPEN` (safe to retry).
- `break_rows` construction (`_flatten_break_rows`, a private helper — TODO-marked above) copies each engine break's fields into the `eod_break_records` row shape (`leg`, `subject_ref`, `break_type`, `field`, `expected`, `actual`, `delta`, `order_id`/`client_id`/`model_id`) per proposal § Layer 1 B-2 — the exact display-string formatting (e.g. what `subject_ref` reads for an `OrderBreak` vs. a `CrmBreak`) is deferred to implementation, reusing the same display conventions `reconciliation.presenter`'s row-builders already establish.
- Re-signing an already-`SIGNED` day is rejected (409), not idempotent-overwritten — a signed EoD is immutable per the proposal's Constraint.

**Done when:** signing off a complete `OPEN` day flips `status` to `SIGNED`, writes exactly `order_breaks + client_model_breaks + crm_breaks` rows to `eod_break_records`, sets `outcome` correctly, and produces a non-empty `file_storage_key`; re-calling `sign_off` on the same day returns 409; calling it on a day with unallocated orders returns 409 without writing anything.

---

### BE-6 — Auto-open hook + `Action.EOD_SIGNOFF` (Yes — user req.)

- **Proposal ref:** § Layer 2 §C-1
- **Module:** 5.6
- **Files:** `modify: api-backend/app/libs/post_trade_allocation/service.py`, `modify: api-backend/app/libs/auth/actions.py`
- **Dependencies:** BE-2

**Contract:**
```python
# app/libs/auth/actions.py
class Action(str, enum.Enum):
    ...
    RECON_VIEW = "mobo:recon_view"
    # EoD Exception Report — feature 015 (BE-6)
    EOD_SIGNOFF = "mobo:eod_signoff"
    ...


ROLE_ACTIONS: dict[AdminRole, set[Action]] = {
    ...
    AdminRole.MOBO: {
        Action.POST_TRADE_ALLOCATION_VIEW,
        Action.POST_TRADE_ALLOCATION_RUN,
        Action.RECON_VIEW,
        Action.EOD_SIGNOFF,
    },
    ...
}
```
```python
# app/libs/post_trade_allocation/service.py — inside run(), same begin_nested() transaction
from app.libs.eod.repository import EodRepository
...
    for (trade_date, model_name), traded in agg.items():
        model = self.repo.model_by_name(model_name)
        ...
        run = self.repo.create_run(...)
        ...
        if cells:
            synthesize_from_run(self.db, run=run, period=period, snapshot=cells[0], orders=orders_by_key[(trade_date, model_name)])
        # BE-6: open (or no-op if already open) the day's EoD header, same transaction.
        EodRepository(self.db).ensure_open(_parse_yyyymmdd(trade_date))
```

**Behavior / invariants:** the `ensure_open` call lands inside the **same** `with self.db.begin_nested(): ... self.db.commit()` block `synthesize_from_run` already uses (`post_trade_allocation/service.py:65-163`) — a rollback of the PTA run also rolls back the EoD header creation, so no orphaned `OPEN` header can exist for a day whose PTA run never actually committed. `trade_date` here is the loop's raw `"YYYYMMDD"` string key — `EodRepository.ensure_open` takes a real `date`, so the call site converts it (`_parse_yyyymmdd`, mirroring `algotrade/synth.py`'s existing helper of the same name — reuse that one rather than writing a second copy, or promote it to a shared util if it isn't already importable across modules; `<TODO: confirm during implementation whether to import synth.py's _parse_yyyymmdd or duplicate the 3-line helper — either is fine, this is not a design decision>`).

**Done when:** running `PostTradeAllocationService.run()` against a seeded unallocated-orders fixture for a new `trade_date` produces exactly one `OPEN` `eod_records` row for that date, in the same transaction as the existing `PostTradeAllocationRun`/`ReconSession` rows; running it again for a later model on the *same* date does not create a second `eod_records` row (the existing one is returned unchanged); `get_actions_for_role(AdminRole.MOBO)` includes `Action.EOD_SIGNOFF`.

---

### BE-7 — `EodService.export` (Yes — user req.)

- **Proposal ref:** § Layer 2 §C-5
- **Module:** 5.4
- **Files:** `modify: api-backend/app/libs/eod/service.py`
- **Dependencies:** BE-2, BE-4 (extends the `EodService` class BE-4 creates — same file, must land after it)

**Contract:**
```python
from typing import BinaryIO

class EodService:
    ...

    def export(self, trade_date_iso: str | None) -> tuple[BinaryIO, str]:
        record = self._resolve_record(trade_date_iso)
        if record.status != DbEodStatus.SIGNED or record.file_storage_key is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "This day has not been signed off yet")
        stream = get_storage().open(record.file_storage_key)
        filename = f"EoD-{record.trade_date.isoformat()}.pdf"
        return stream, filename
```

**Behavior / invariants:** mirrors `OnboardingService.download_document`'s exact shape (`(stream, filename[, content_type])` returned to the router, which wraps it in `StreamingResponse`) — `content_type` is always `"application/pdf"` here so it's fixed at the router, not threaded through this tuple.

**Done when:** exporting a signed day streams the exact bytes written at sign-off; exporting an `OPEN` day (or one with no `eod_records` row) raises `409`/`404` respectively, without touching storage.

---

### BE-8 — `PdfRenderer` Protocol (Yes — user req.)

- **Proposal ref:** § Layer 2 §C-4
- **Module:** 5.5
- **Files:** `create: api-backend/app/libs/eod/pdf/base.py`
- **Dependencies:** none — parallel-safe

**Contract:**
```python
from typing import Protocol


class PdfRenderer(Protocol):
    def render(self, trade_date_iso: str) -> bytes:
        """Return PDF bytes for the signed-off day identified by trade_date_iso
        ('YYYY-MM-DD'). Implementations may assume the day's EoD record is
        already the frozen SIGNED state by the time this is called (BE-5 calls
        this AFTER write_snapshot_and_sign)."""
        ...
```

**Behavior / invariants:** mirrors `app/libs/trade_models/storage.py::FileStorage`'s exact shape (a `Protocol`, one method, config-selected implementation) — the established swappable-backend convention in this codebase.

**Done when:** the module imports cleanly with no dependency beyond `typing`; `mypy` confirms both `ChromiumRenderer` and `WeasyPrintRenderer` (BE-9) structurally satisfy this Protocol.

---

### BE-9 — `ChromiumRenderer` (default) + `get_renderer()` + reserved `WeasyPrintRenderer` stub (Yes — user req.)

- **Proposal ref:** § Layer 2 §C-4, § Design decision D-4
- **Module:** 5.5
- **Files:** `create: api-backend/app/libs/eod/pdf/chromium.py`, `create: api-backend/app/libs/eod/pdf/weasyprint.py`, `create: api-backend/app/libs/eod/pdf/__init__.py`, `modify: api-backend/app/core/config.py`, `modify: api-backend/pyproject.toml`
- **Dependencies:** BE-8

**Contract:**
```python
# app/core/config.py — new settings, inline comment per existing convention
    # EoD PDF rendering — feature 015 (BE-9)
    pdf_renderer: str = "chromium"  # "chromium" (default) | "weasyprint" (reserved, not yet implemented)
    pdf_render_base_url: str = "http://localhost:3001"
    pdf_render_token: str = ""
```
```python
# app/libs/eod/pdf/chromium.py
from __future__ import annotations

from app.core.config import get_settings


class ChromiumRenderer:
    """Playwright (Python API, in-process — no separate Node service). Navigates
    headless Chromium to the print-only Next.js route and rasterizes it."""

    def render(self, trade_date_iso: str) -> bytes:
        from playwright.sync_api import sync_playwright  # local import: heavy, optional-at-runtime dep

        settings = get_settings()
        url = f"{settings.pdf_render_base_url}/mobo/daily-exception-report/print?trade_date={trade_date_iso}"
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(extra_http_headers={"X-Eod-Render-Token": settings.pdf_render_token})
            page.goto(url, wait_until="networkidle")
            pdf_bytes = page.pdf(format="A4", print_background=True)
            browser.close()
            return pdf_bytes
```
```python
# app/libs/eod/pdf/weasyprint.py — reserved slot, NOT built now (proposal Non-Goals)
class WeasyPrintRenderer:
    """Escape hatch if ChromiumRenderer proves unworkable in production
    (e.g. no Chromium binary available in the deployment image). Flip
    PDF_RENDERER=weasyprint to select this — but it must be implemented
    first; this stub intentionally fails loudly rather than silently
    producing an empty/broken PDF."""

    def render(self, trade_date_iso: str) -> bytes:
        raise NotImplementedError("WeasyPrintRenderer is not yet configured")
```
```python
# app/libs/eod/pdf/__init__.py
from __future__ import annotations

from app.core.config import get_settings
from app.libs.eod.pdf.base import PdfRenderer
from app.libs.eod.pdf.chromium import ChromiumRenderer
from app.libs.eod.pdf.weasyprint import WeasyPrintRenderer


def get_renderer() -> PdfRenderer:
    backend = get_settings().pdf_renderer.lower()
    if backend == "weasyprint":
        return WeasyPrintRenderer()
    return ChromiumRenderer()
```
```toml
# pyproject.toml — new dependency
[tool.poetry.dependencies]  # <TODO: confirm actual dependency-management section name/format used by this project's pyproject.toml — playwright ^1.x>
playwright = "^1.47"
```

**Behavior / invariants:**
- `ChromiumRenderer` is the default (`pdf_renderer="chromium"`) and the only one that actually renders — matches proposal D-4 exactly.
- `WeasyPrintRenderer` always raises `NotImplementedError` — selecting `PDF_RENDERER=weasyprint` before it's implemented is a loud, immediate failure at sign-off time, not a silent broken PDF (mirrors `NasStorage`'s exact stub behavior in `trade_models/storage.py`).
- The Playwright import is local to `ChromiumRenderer.render()`, not module-level — so importing `app.libs.eod.pdf` doesn't hard-fail in an environment where `playwright`'s browser binaries haven't been installed yet (only calling `.render()` does); this lets BE-1 through BE-8's tests run without Chromium present (see § 8).
- Deployment gate (not a unit, called out in § 9): `playwright install chromium` must run in the image/runtime before `ChromiumRenderer` is exercised in production.

**Done when:** `get_renderer()` returns a `ChromiumRenderer` instance by default and a `WeasyPrintRenderer` instance when `PDF_RENDERER=weasyprint`; calling `.render()` on the latter raises `NotImplementedError` immediately; `ChromiumRenderer.render()` against a running local Next.js dev server + a valid `PDF_RENDER_TOKEN` returns non-empty PDF bytes (manual/integration verification, not a unit test per § 8's layer-isolation rule — see § 8.1).

---

### BE-10 — Routes (MANDATORY)

- **Proposal ref:** § Layer 2 §D (Route surface), § 4.1 (wire contract, error envelope)
- **Module:** 5.7
- **Files:** `create: api-backend/app/libs/eod/router.py`; `modify: api-backend/app/main.py`
- **Dependencies:** BE-1, BE-4, BE-5, BE-6 (gate), BE-7

**Contract:**
```python
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.libs.auth.actions import Action
from app.libs.auth.deps import require_action
from app.libs.eod.service import EodService
from app.models.users import User
from app.schemas.eod import EodReportViewOut, EodSignOffReq

router = APIRouter(prefix="/mobo", tags=["mobo"])


def _service(db: Annotated[Session, Depends(get_db)]) -> EodService:
    return EodService(db)


@router.get("/eod", response_model=EodReportViewOut)
def get_eod(
    svc: Annotated[EodService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.RECON_VIEW))],
    trade_date: str | None = None,
) -> EodReportViewOut:
    return svc.build_day_view(trade_date)


@router.post("/eod/sign-off", response_model=EodReportViewOut)
def sign_off_eod(
    req: EodSignOffReq,
    svc: Annotated[EodService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.EOD_SIGNOFF))],
) -> EodReportViewOut:
    return svc.sign_off(req.tradeDate, signed_off_by=user.firebase_uid)


@router.get("/eod/export")
def export_eod(
    svc: Annotated[EodService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.RECON_VIEW))],
    trade_date: str | None = None,
) -> StreamingResponse:
    stream, filename = svc.export(trade_date)
    return StreamingResponse(
        stream, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
```
```python
# app/main.py — one new line alongside the existing include_router calls
from app.libs.eod.router import router as eod_router
...
app.include_router(eod_router, prefix="/api")
```

**Behavior / invariants:**
- `GET /eod` and `GET /eod/export` are gated by `RECON_VIEW` (read-only, same gate as the existing reconciliation view route); only `POST /eod/sign-off` requires the new `EOD_SIGNOFF` action — matching proposal § Layer 2 §C-3's "Export/read stay on RECON_VIEW".
- Status codes exactly as proposal § 4.1: `200` success; `sign-off` `409` (already signed / incomplete day), `404` (no header for that date); `export` `409` (not yet signed), `404` (no header).

**Done when:** `GET /api/mobo/eod` (no `trade_date`) against a seeded DB returns `200` with a body validating against `EodReportViewOut`; `POST /api/mobo/eod/sign-off` on a complete `OPEN` day returns `200` with `status="SIGNED"`; a request without `RECON_VIEW`/`EOD_SIGNOFF` returns `403`; an unknown `trade_date` returns `404` on all three routes; re-signing returns `409`.

---

## 7. Frozen seam (from the proposal — verbatim)

*(identical to `015-eod-exception-report-db.md` § 7.1 — reproduced here per the isolation rule, not linked, so this branch's session has it without opening a sibling doc)*

### 7.1 The seam (verbatim from proposal § 4)

```python
# ===== Enums =====
EodStatus  = Literal["OPEN", "SIGNED"]
EodLeg     = Literal["IB_ALGO", "ALGO_CLIENT", "CLIENT_CRM"]   # legs 1 / 2 / 3
EodOutcome = Literal["CLEAR", "EXCEPTIONS"]                     # the day's verdict

# ===== GET /api/mobo/eod?trade_date=YYYY-MM-DD =====
#   trade_date optional; omitted => the latest OPEN eod_records row (the day
#   still awaiting sign-off — the actionable one), falling back to the latest
#   SIGNED row if no OPEN day exists (Q-3, settled).
#   200 -> EodReportViewOut   |   404 -> {detail} if no EoD day exists
#
# EodReportViewOut =  (a) the day-aggregated flow view  +  (b) the EoD header.
class EodReportViewOut(BaseModel):
    settleDay: str
    tradeDate: str
    orders:  list[RcOrderOut]
    allocs:  list[RcAllocOut]
    ports:   list[RcPortOut]
    algoTotal: str
    ibTotal: str
    crmTotal: str
    counts: RcBreakCountsOut
    status: EodStatus
    signedOffBy: str | None
    signedOffAt: str | None
    generated: str | None
    orderCount: int
    executionCount: int
    notionalTraded: str
    breakTotal: int
    outcome: EodOutcome
    canSignOff: bool
    exportReady: bool

# ===== POST /api/mobo/eod/sign-off =====
#   body: EodSignOffReq   |   gated by Action.EOD_SIGNOFF
#   200 -> EodReportViewOut (now status=SIGNED, exportReady=true)
#   409 -> {detail} if already SIGNED, or canSignOff is false (day incomplete)
#   404 -> {detail} if no eod_records row for tradeDate
class EodSignOffReq(BaseModel):
    tradeDate: str

# ===== GET /api/mobo/eod/export?trade_date=YYYY-MM-DD =====
#   gated by Action.RECON_VIEW
#   200 -> application/pdf (StreamingResponse,
#          Content-Disposition: attachment; filename="EoD-YYYY-MM-DD.pdf")
#   409 -> {detail} if status != SIGNED (no file yet)
#   404 -> {detail} if no eod_records row

# ===== Error envelope =====
#   FastAPI default {"detail": str}. Frontend server layer wraps every call in the
#   existing APIResult<T> = {success:true,data} | {success:false,error,code}.
```

**Field-name ↔ column-name map:** identical to `015-eod-exception-report-db.md` § 7.1's table — reproduced there, not duplicated here a third time (both docs derive it from the same proposal § 4.1).

### 7.2 How this layer honours the seam
- **What this layer contributes:** serves `EodReportViewOut` at the three routes above, gated as shown; computes `breakTotal`/`outcome` authoritatively from the engine's raw break lists (never from `counts`); writes `eod_records`/`eod_break_records` exactly per the field-map; renders and stores the PDF at sign-off.
- **What this layer assumes from the other side:** DB layer's two tables exist with the columns/constraints in the field-map (in particular `UNIQUE(trade_date)`, which `ensure_open` relies on); `recon_sessions`/`orders` (proposal 012/005) are populated as today; `app/libs/reconciliation/engine.reconcile()` and `app/libs/trade_models/storage.get_storage()` are unmodified.
- **Change protocol:** any edit here requires editing the proposal § 4 first; this section is then re-copied.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Framework / runner:** pytest — `pytest -q` from `api-backend/`.
- **Fixtures / seed:** scratch DB seeded with the existing reconciliation fixtures (one or two `recon_sessions` + `algotrade_orders`/`orders`/`post_trade_allocations`/`client_portfolios` rows per scenario, reusing proposal 012's seed shapes) plus hand-built `eod_records`/`eod_break_records` rows for the sign-off/export/status-transition tests.
- **Isolation:** hermetic, one transaction per test, rolled back after.
- **Layer isolation:** BE tests import only `app.libs.eod.*`, `app.models.*`, `app.schemas.eod`, plus test doubles — `app.libs.reconciliation.engine.reconcile` is called as the real function against the seeded scratch DB (it is an existing, already-tested unit from proposal 012, not re-verified here) except where a specific test needs to isolate `EodService` from engine correctness, in which case `reconcile` is mocked via `unittest.mock.patch`. `ChromiumRenderer`/`WeasyPrintRenderer` are **always** mocked (`unittest.mock.patch.object(EodService's imported get_renderer, ...)` or dependency-injecting a fake `PdfRenderer`) — no test in this layer launches a real headless browser or hits a real Next.js print route (proposal's Human gate (b) governs that verification path, not this local test suite).
- **Test location:** `api-backend/tests/libs/eod/` (mirrors `tests/libs/reconciliation/`).
- **Commit policy:** never committed — `/tests/` is git-ignored.
- **Code generation:** `test-gen` skill writes the concrete tests from § 8.2/8.3.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| BE-1 | `EodReportViewOut` validates a hand-built dict matching § 7 | none |
| BE-2 | `ensure_open` idempotency; `has_unallocated_orders` correctness; `write_snapshot_and_sign` freezes stats + writes break rows | none |
| BE-3 | `merge_day_view` concatenates rows + sums totals across 2 sessions | none (real adapters against seeded DB) |
| BE-4 | `OPEN` day recomputes live; `SIGNED` day serves frozen snapshot unaffected by later mutation; `canSignOff` reflects unallocated orders | none |
| BE-5 | sign-off happy path (status flip, snapshot write, file key set); 409 on re-sign; 409 on incomplete day; all-or-nothing on renderer failure | mocks `get_renderer()` to return a fake `PdfRenderer` |
| BE-6 | `ensure_open` called exactly once per new trade_date inside PTA's `run()` transaction; rollback leaves no orphan; `EOD_SIGNOFF` present for MOBO | none (calls the real `PostTradeAllocationService.run()` against seeded unallocated orders, per proposal 011's own test convention) |
| BE-7 | export streams the exact stored bytes; 409 before sign-off | none (fake `FileStorage` via a temp-dir `LocalStorage`, or the real one against a scratch dir) |
| BE-8 | `ChromiumRenderer`/`WeasyPrintRenderer` structurally satisfy `PdfRenderer` (mypy-level) | none |
| BE-9 | `get_renderer()` selects by config; `WeasyPrintRenderer.render()` raises `NotImplementedError` | none — `ChromiumRenderer.render()` itself is NOT exercised in this layer's automated suite (would require a real browser + real Next.js route; see § 8.1) |
| BE-10 | 200/403/404/409 status codes across all 3 routes; response validates against `EodReportViewOut` | mocks `EodService` methods for the router-level status-code tests; `TestClient` with `require_action` dependency override for the 403 case |

### 8.3 Test goals

#### BE-1
- **Positive:** a dict matching every field in § 7's `EodReportViewOut` validates via `.model_validate()`.
- **Negative:** a dict missing a required field (e.g. `breakTotal`) raises a `ValidationError`.
- **Invariants:** `status`/`outcome` only accept their two enum members each.
- **Seam mocks:** none.

#### BE-2
- **Positive:** `ensure_open(d)` called twice for the same date returns the identical row both times, with exactly one row in `eod_records`; `has_unallocated_orders` returns `True`/`False` matching hand-seeded `orders` rows with/without `allocated_run_id`; `write_snapshot_and_sign` sets `status=SIGNED`, `outcome` correctly for both a zero-break and a nonzero-break input, and inserts exactly `len(break_rows)` `EodBreakRecord`s.
- **Negative:** `get_by_trade_date` for a date with no row returns `None`, not an error.
- **Invariants:** `resolve_default_day` prefers an `OPEN` row over a `SIGNED` row regardless of which is more recent by `trade_date` (seed a `SIGNED` day later than an `OPEN` day and assert the `OPEN` one wins — the settled Q-3/D-8 behavior).
- **Seam mocks:** none.

#### BE-3
- **Positive:** given 2 seeded sessions (different models) for one `trade_date`, `merge_day_view` returns `len(orders) == session1_orders + session2_orders`, and `algoTotal`/`ibTotal`/`crmTotal` equal the formatted sum of both sessions' raw totals.
- **Negative:** an empty `sessions`/`results` pair returns empty lists and `fmt_usd(Decimal("0"))` totals, not an error.
- **Invariants:** row order is stable (session order preserved, each session's own row order preserved within it) — not re-sorted.
- **Seam mocks:** none (real adapters/presenter functions against the seeded scratch DB).

#### BE-4
- **Positive:** an `OPEN` day with a seeded break returns `outcome="EXCEPTIONS"` and `breakTotal` matching the seeded count, recomputed fresh; a `SIGNED` day returns the exact frozen header values even after mutating the underlying `orders`/`recon_sessions` rows post-sign (prove the two are decoupled).
- **Negative:** an unknown `trade_date` (explicit, not omitted) raises `404`.
- **Invariants:** `canSignOff` is `False` whenever any `orders` row for that date has `allocated_run_id IS NULL`, regardless of `status`.
- **Seam mocks:** none.

#### BE-5
- **Positive:** signing off a complete `OPEN` day with a mocked `PdfRenderer` returning canned bytes: `status` flips to `SIGNED`, `eod_break_records` row count equals the day's total breaks, `outcome` set correctly, `file_storage_key` non-empty and openable via `get_storage()`.
- **Negative:** signing off an already-`SIGNED` day raises `409` without writing; signing off a day with an unallocated order raises `409` without writing; a mocked `PdfRenderer.render()` that raises leaves the day still `OPEN` with no snapshot rows written (transaction rollback).
- **Invariants:** re-running `build_day_view` immediately after a successful sign-off returns `exportReady=True`.
- **Seam mocks:** `get_renderer()` mocked to a fake `PdfRenderer` returning fixed bytes (never a real Chromium launch).

#### BE-6
- **Positive:** calling `PostTradeAllocationService.run()` against seeded unallocated orders for a brand-new `trade_date` creates exactly one `OPEN` `eod_records` row alongside the existing `PostTradeAllocationRun`/`ReconSession` rows, all in one transaction; a second `run()` call for a different model on the same date does not create a second header row.
- **Negative:** if the surrounding PTA transaction is rolled back (e.g. via a forced exception before `commit()`), no `eod_records` row persists.
- **Invariants:** `Action.EOD_SIGNOFF in get_actions_for_role(AdminRole.MOBO)`; every other role's action set is unchanged.
- **Seam mocks:** none.

#### BE-7
- **Positive:** exporting a signed day (seeded `EodRecord` with a real `file_storage_key` pointing at a temp-dir-backed `LocalStorage` file) streams back byte-identical content with the correct filename.
- **Negative:** exporting an `OPEN` day, or a day with `file_storage_key=None`, raises `409`; an unknown date raises `404`.
- **Invariants:** the returned filename always matches `EoD-<trade_date>.pdf`.
- **Seam mocks:** none (real `LocalStorage` against a temp directory).

#### BE-8
- **Positive:** `ChromiumRenderer()` and `WeasyPrintRenderer()` both type-check as `PdfRenderer` under `mypy` (a static check, not a runtime test — documented as such, matching how BE-2 of proposal 012's `dtos.py` unit states "mypy passes" as its acceptance criterion for a structural property).
- **Negative:** n/a.
- **Invariants:** n/a.
- **Seam mocks:** none.

#### BE-9
- **Positive:** `get_renderer()` returns a `ChromiumRenderer` when `pdf_renderer="chromium"` (the default) and a `WeasyPrintRenderer` when set to `"weasyprint"`.
- **Negative:** calling `.render()` on the `WeasyPrintRenderer` instance always raises `NotImplementedError`, regardless of input.
- **Invariants:** importing `app.libs.eod.pdf` does not itself attempt to import/launch Playwright (the import is local to `ChromiumRenderer.render()`) — verified by confirming the module imports cleanly in an environment/test process without Playwright's browser binaries installed.
- **Seam mocks:** none.

#### BE-10
- **Positive:** `GET /api/mobo/eod` (no `trade_date`) on a seeded DB returns `200` and a body that round-trips through `EodReportViewOut.model_validate`; `POST /api/mobo/eod/sign-off` on a complete day returns `200` with `status="SIGNED"`; `GET /api/mobo/eod/export` on a signed day returns `200` with `Content-Disposition` set.
- **Negative:** missing `RECON_VIEW`/`EOD_SIGNOFF` → `403`; unknown `trade_date` → `404` on all three routes; sign-off on an already-signed or incomplete day → `409`; export before sign-off → `409`.
- **Invariants:** the response body's `breakTotal` always equals `orders-leg + allocs-leg + ports-leg` break counts, never re-derived independently by the router.
- **Seam mocks:** `EodService.build_day_view`/`sign_off`/`export` are mocked via `unittest.mock.patch.object` for the router-level status-code tests, isolating BE-10 from BE-4/BE-5/BE-7's own correctness (covered separately in their own tests); `TestClient` overrides `require_action` via FastAPI's dependency-override mechanism for the 403 case, following whatever pattern `tests/libs/auth/` already uses.

### 8.4 Aggregate gate
- All unit tests green is a local gate before commit/PR hand-off.
- Target coverage: ≥ 90% of new/changed statements in `app/libs/eod/`, `app/schemas/eod.py`, and the touched lines in `app/libs/auth/actions.py` / `post_trade_allocation/service.py` / `app/core/config.py`.
- Chosen `test-gen` level for this layer: `thorough` (sign-off's guard ordering, the frozen-vs-live status branching, and the completeness gate are exactly the kind of edge/ordering logic `thorough` is meant to cover).

---

## 9. Definition of done & rollback

**Definition of done:**
- [ ] BE-1 through BE-10 committed on `<parent-branch>-be`; each commit left the branch green.
- [ ] § 8 unit tests all pass; CI gate (§ 3.2) green.
- [ ] § 7 matches the proposal's frozen seam verbatim.
- [ ] PR opened; human owns the merge to the parent branch.

**Rollback:**
- Reverting the branch removes the three routes, the service/repository/presenter/pdf package, and the `Action.EOD_SIGNOFF` gate cleanly (additive-only against existing code).
- **BE-6's hook is the one line that touches an existing, already-shipped method** (`PostTradeAllocationService.run()`) — reverting it removes the `ensure_open` call; any `OPEN` `eod_records` rows already created by it become orphaned (no longer auto-created for new days, but existing rows are untouched and harmless) until the DB layer's `alembic downgrade -1` removes the tables entirely (DB doc § 9). Safe order: **BE revert → DB downgrade**, never the reverse.
- No data loss: nothing this layer touches is destructive to `orders`/`recon_sessions`/`algotrade_orders`/`post_trade_allocations`/`client_portfolios` — it only reads them and writes new rows into the new `eod_*` tables plus files into `FileStorage`.
- **Deployment gate:** if `ChromiumRenderer` cannot run in a given environment (Chromium binaries unavailable), flipping `PDF_RENDERER=weasyprint` without first implementing `WeasyPrintRenderer` makes every sign-off attempt fail loudly (`NotImplementedError`, surfaced as a `500`) rather than silently — this is the intended fail-safe behavior of the reserved stub, not a bug to work around.
