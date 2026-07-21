# 013 — Client Onboarding Integration · Implementation Details — Backend

> Status: **DRAFT — pending implementation.**
> Implements: `docs/proposals/013-2026-07-19-client-onboarding-integration.md` § Layer 2 — Backend
> Layer: Backend — **one layer per file.**
> Sibling layer docs: `docs/implementations/013-client-onboarding-integration-db.md`, `docs/implementations/013-client-onboarding-integration-fe.md` (not yet written at the time of this doc — this layer builds against the proposal's frozen § 4 seam, not against sibling code)
> Execution schedule: `docs/execution-schedules/013-client-onboarding-integration-be.md`
> Branch: `client-onboarding-integration-be` — cut from `client-onboarding-integration`. Merges back into the parent; the human owns that merge.
> Builds on / prerequisites: DB layer's four new tables (`client_onboardings`, `onboarding_documents`, `client_allotment_redemptions`, `client_events`) + the two `client_subscriptions.*_override` columns, migration `0018` (see `013-client-onboarding-integration-db.md`) applied/available on the working DB; `app/libs/clients/{service,repository}.py` (existing onboard path this layer delegates client-creation to); `app/libs/auth/{actions,deps}.py`; `app/libs/trade_models/storage.py` (`FileStorage`/`get_storage()`); `app/libs/allocation_matrix/scheduler.py` (scheduler shape template).

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/013-2026-07-19-client-onboarding-integration.md` § Layer 2 — Backend, § 4 (Cross-layer seam) |
| Execution schedule | `docs/execution-schedules/013-client-onboarding-integration-be.md` |
| Sibling layer impl docs | `docs/implementations/013-client-onboarding-integration-db.md`, `docs/implementations/013-client-onboarding-integration-fe.md` |
| Builds on | DB layer migration `0018` (see above); `app/libs/clients/` (existing, merged); `app/libs/auth/` (existing, merged) |

---

## 2. Branch & session contract

- **Branch:** `client-onboarding-integration-be`, cut from `client-onboarding-integration`.
- **Isolation:** implementable independently of the Frontend layer; depends only on the DB layer's tables existing on the working DB (a migration, not a merged PR — schema can be applied to a local/dev DB without waiting on the DB branch to merge).
- **Preconditions:**
  - [ ] `client_onboardings`, `onboarding_documents`, `client_allotment_redemptions`, `client_events` tables + `client_subscriptions.mgmt_fee_override`/`incentive_fee_override` columns applied to the working DB (DB layer's `0018`).
  - [ ] The frozen seam (§ 7) is agreed and matches the proposal § 4 verbatim.
- **Read-first inventory:**
  - `api-backend/app/libs/clients/service.py` (`ClientService.onboard`, lines 38-77) — the existing user+profile creation path `StartOnboarding` delegates to (identity provisioning, compensation-on-failure pattern).
  - `api-backend/app/libs/clients/repository.py` (`ClientRepository.create_with_profile`) — inserts `users`(`DISABLED`)+`client_profiles`; this layer's repository calls it directly rather than duplicating it.
  - `api-backend/app/libs/identity/service.py` (`FirebaseIdentityService.ensure_identity`/`generate_invite_link`/`delete_user`) — identity provisioning used by `StartOnboarding`.
  - `api-backend/app/libs/auth/actions.py` — `Action` enum + `ROLE_ACTIONS` dict; `COMPLIANCE`/`PC` are currently empty sets, this layer populates them.
  - `api-backend/app/libs/auth/deps.py` — `require_action()`, `get_current_client_user`, `get_current_admin_user` patterns this layer reuses verbatim.
  - `api-backend/app/libs/allocation_matrix/scheduler.py` — the asyncio-tick scheduler shape (`_TICK_SECONDS` loop, `try/except Exception`, `start_scheduler() -> asyncio.Task`) this layer's `scheduler.py` mirrors exactly.
  - `api-backend/app/libs/trade_models/storage.py` (`FileStorage` protocol, `get_storage()`) — reused verbatim for document upload/download, no new storage code.
  - `api-backend/app/models/pc.py` — `Model` (`id`, `model_size`, `mgmt_fee`, `incentive_fee`), `ClientSubscription` (`user_id`, `model_id`, `multiplier` — composite PK).
  - `api-backend/app/models/users.py` — `User` (`id`, `status: AccountStatus`, `authorized_by`), `AccountStatus` (`ACTIVE`/`DISABLED`), `ClientProfile`, `AdminRole`, `Portal`.
  - `api-backend/app/models/onboarding.py` *(DB layer, new)* — `ClientOnboarding`, `OnboardingDocument`, `ClientAllotment`, `ClientEvent` ORM classes this layer's repository queries; exact column names per `013-client-onboarding-integration-db.md`.
  - `api-backend/app/core/database.py` — `SessionLocal`, `get_db`.
  - `api-backend/app/main.py` (lines 1-70) — router `include_router` block + `lifespan` scheduler registration this layer extends.
- **Hand-off / exit signal:** all BE-* units committed, all 14 routes reachable and RBAC-gated, `client_onboardings`/`onboarding_documents`/`client_allotment_redemptions`/`client_events` writable through the service, pytest suite green, PR opened.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- **Layering:** `router.py` (thin HTTP boundary, `Depends(require_action(...))` / `Depends(get_current_client_user)`) → `service.py` (one class per feature, `db: Session` in `__init__`, owns the single-commit transaction boundary, rollback on exception) → `repository.py` (pure DB access, `@dataclass(frozen=True)` row shapes decoupled from Pydantic schemas, `_base_query()` pattern, never commits) → `models`. Mirrors `app/libs/clients/{service,repository}.py` exactly.
- **Module layout:** one directory per feature area under `app/libs/`; this layer's directory is `app/libs/onboarding/`.
- **Schemas:** `pydantic.BaseModel`, `In`/`Out` suffix naming per DTO, docstrings noting the DB column each field maps to where the name diverges (per § 4.1's field-name ↔ column-name map).
- **Actions:** new gate values append to the `Action(str, enum.Enum)` block in `app/libs/auth/actions.py` with a `# Client Onboarding — feature 013 (BE-1)` comment, and `ROLE_ACTIONS` entries for `RM`/`COMPLIANCE`/`PC` (the latter two currently empty sets).
- **Error envelope:** bare `HTTPException(status_code, detail=<string>)` — matches the proposal § 4.1's stated envelope. No new error shape.
- **Client-facing routes:** `Depends(get_current_client_user)`, scoped to `user.id` — never accept a client-supplied `user_id`/`client_id` query param.
- **Precision:** `units`/`multiplier` is `Decimal`, column `Numeric(28,10)`; `mgmt_fee`/`incentive_fee` is `Decimal`, column `Numeric(9,6)` — matches `Model.mgmt_fee`/`Model.incentive_fee` precision exactly so the compare-and-set (BE-5's fee override, C-5) never trips on a spurious scale mismatch.

### 3.2 CI/CD & engineering discipline
- **Trunk-friendly, small units.** Each BE-* unit below is a self-contained, revertible commit that leaves the branch green.
- **Every unit is independently revertible**, except BE-6 (router) which depends on BE-1 through BE-5 being present to import, and BE-8 (main.py wiring) which depends on BE-6/BE-7.
- **Additive & backward-compatible first.** Zero changes to existing routes/services; one new package, three new `Action` members, one new scheduler, 14 new routes.
- **Gates before merge:**
  ```bash
  cd api-backend
  ruff check . && ruff format --check . && mypy app && pytest -q
  ```
- **No secrets, no manual steps in the merge path.** Running the `0018` migration against a live DB, and any run of the renewal scheduler against production data, are human gates called out in the execution schedule — not silently baked into a unit.
- **Reversibility documented:** see § 9.

---

## 4. Architecture

**Target layout:**
```
api-backend/app/libs/onboarding/
├── __init__.py
├── schemas.py                  # BE-1 — all wire-facing DTOs (§ 4.1, verbatim)
├── compliance_doc_config.py    # BE-2 — frozen DocSpec list (required-doc config)
├── repository.py               # BE-3 — OnboardingRepository (CRUD, no HTTPException)
├── service.py                  # BE-5 — OnboardingService (state machine + atomic approve)
├── router.py                   # BE-6 — 14 role-prefixed routes
└── scheduler.py                # BE-7 — renewal-trigger background job

api-backend/app/libs/auth/actions.py       # BE-4 — + ONBOARDING_MANAGE/ONBOARDING_REVIEW/ALLOTMENT_ACKNOWLEDGE (modified)
api-backend/app/main.py                    # BE-8 — + include_router + scheduler registration (modified)
```

**Dependency direction:** `router → service → repository → models`. `service.py` additionally imports `app.libs.identity.service.FirebaseIdentityService` and `app.libs.clients.repository.ClientRepository` (client-creation delegation, per proposal § Layer 2 §A) and `app.libs.trade_models.storage.get_storage` (document bytes). `compliance_doc_config.py` has no dependency on any of the above — it is imported by `repository.py` (seeding) and `service.py` (guard checks) but imports nothing from either.

**External seams:** reads/writes `client_onboardings`, `onboarding_documents`, `client_allotment_redemptions`, `client_events` (new, DB layer); reads/writes `client_subscriptions` (existing, gains two override columns); reads `models` (existing); reads/writes `users`/`client_profiles` via the existing `clients` package. Exposes the 14 routes in § 6 (BE-6) to the Frontend layer per § 7.

---

## 5. Modules

### 5.1 `app/libs/onboarding/schemas.py`
- **Responsibility:** every wire-facing Pydantic DTO from proposal § 4.1, verbatim field names/types.
- **Files:** `api-backend/app/libs/onboarding/schemas.py`.
- **Public surface:** `StartOnboardingReq`, `DocumentDTO`, `OnboardingDTO`, `BoardDTO`, `VerdictReq`, `RejectReq`, `AllotRdmptDTO`, `SubscriptionDTO`, `ClientEventDTO`.
- **Owns features:** BE-1.

### 5.2 `app/libs/onboarding/compliance_doc_config.py`
- **Responsibility:** the required-document set as a frozen, extensible-without-migration config list.
- **Files:** `api-backend/app/libs/onboarding/compliance_doc_config.py`.
- **Public surface:** `DocSpec` dataclass, `REQUIRED_DOCS: tuple[DocSpec, ...]`.
- **Owns features:** BE-2.

### 5.3 `app/libs/onboarding/repository.py`
- **Responsibility:** all CRUD/query access to `client_onboardings`, `onboarding_documents`, `client_allotment_redemptions`, `client_events`, plus the `client_subscriptions` upsert — no `HTTPException`, no cross-row business logic.
- **Files:** `api-backend/app/libs/onboarding/repository.py`.
- **Public surface:** `OnboardingRepository` class, `OnboardingRow`/`DocumentRow`/`AllotmentRow`/`EventRow`/`OnboardingDisplayRow` frozen dataclasses.
- **Owns features:** BE-3.

### 5.4 `app/libs/auth/actions.py` (modified)
- **Responsibility:** add the three onboarding-domain gates and grant them per role.
- **Files:** `api-backend/app/libs/auth/actions.py`.
- **Public surface:** `Action.ONBOARDING_MANAGE`, `Action.ONBOARDING_REVIEW`, `Action.ALLOTMENT_ACKNOWLEDGE`.
- **Owns features:** BE-4.

### 5.5 `app/libs/onboarding/service.py`
- **Responsibility:** the sole owner of every onboarding transition, including the atomic, `kind`-branched approve.
- **Files:** `api-backend/app/libs/onboarding/service.py`.
- **Public surface:** `OnboardingService` class (`db: Session` in `__init__`).
- **Owns features:** BE-5.

### 5.6 `app/libs/onboarding/router.py`
- **Responsibility:** the 14 role-prefixed HTTP routes; thin — auth + delegate to service + return DTO.
- **Files:** `api-backend/app/libs/onboarding/router.py`; `modify: api-backend/app/main.py`.
- **Public surface:** `router: APIRouter`.
- **Owns features:** BE-6, BE-8.

### 5.7 `app/libs/onboarding/scheduler.py`
- **Responsibility:** hourly asyncio tick that reopens a client's onboarding row for renewal when a periodic-review document nears `expires_at`.
- **Files:** `api-backend/app/libs/onboarding/scheduler.py`; `modify: api-backend/app/main.py`.
- **Public surface:** `start_scheduler() -> asyncio.Task`.
- **Owns features:** BE-7, BE-8.

---

## 6. Features

### BE-1 — `schemas.py`: wire-facing DTOs (MANDATORY)

- **Proposal ref:** § 4.1
- **Module:** 5.1
- **Files:** `create: api-backend/app/libs/onboarding/schemas.py`
- **Dependencies:** none — parallel-safe

**Contract:**
```python
# api-backend/app/libs/onboarding/schemas.py
from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, EmailStr

OnboardingStatus = Literal["initial", "reviewing", "pending_review", "active"]
OnboardingKind = Literal["initial", "renewal"]
DocStatus = Literal["not_started", "uploaded", "in_review", "verified", "rejected", "expired"]
AllotRdmpStatus = Literal["pending", "acknowledged"]
AllotRdmpKind = Literal["allotment", "redemption"]


class StartOnboardingReq(BaseModel):
    """POST /api/rm/onboardings body. `mgmt_fee`/`incentive_fee` are fractions
    (e.g. 0.015) -- the FE converts its '1.5%' display string before sending."""

    client_name: str
    email: EmailStr
    primary_phone: str
    address: str
    country_of_residence: str
    id_type: str
    id_number: str
    ibhk_account: str
    sw_account: str
    model_id: uuid.UUID
    units: Decimal  # -> onboarding.multiplier
    mgmt_fee: Decimal
    incentive_fee: Decimal
    kind: OnboardingKind = "initial"


class DocumentDTO(BaseModel):
    doc_type: str
    label: str
    status: DocStatus
    filename: str | None
    required: bool
    periodic_review: bool
    issue_note: str | None
    reviewed_at: datetime | None
    expires_at: datetime | None
    can_reupload: bool  # server-computed: status in {not_started, uploaded, rejected, expired}


class OnboardingDTO(BaseModel):
    """Widened 2026-07-20 (D-9/C-7) -- several fields are not 1:1 row
    projections: primary_phone/address/country_of_residence are joined from
    ClientProfile, assigned_rm is resolved from assigned_rm_uid, client_ref is
    formatted server-side from user_id. See service.py's _to_dto (BE-5)."""

    id: uuid.UUID
    user_id: uuid.UUID
    client_name: str
    email: str
    assigned_rm: str  # resolved display name, not the raw uid
    client_ref: str  # e.g. "MEGA-0481" -- formatted from user_id, never stored
    primary_phone: str  # joined from ClientProfile
    address: str  # joined from ClientProfile
    country_of_residence: str  # joined from ClientProfile
    id_type: str  # -> client_onboardings.id_type
    id_number: str  # -> client_onboardings.id_number
    ibhk_account: str  # -> client_onboardings.ibhk_account
    sw_account: str  # -> client_onboardings.sw_account
    status: OnboardingStatus
    kind: OnboardingKind
    model_id: uuid.UUID
    model_name: str
    units: Decimal
    mgmt_fee: Decimal  # the agreed fee as captured at onboarding, echoed back
    incentive_fee: Decimal
    verified_count: int
    required_count: int
    reject_reason: str | None
    submitted_at: datetime | None
    created_at: datetime
    documents: list[DocumentDTO] = []  # present on detail, omitted (empty) on board list


class BoardDTO(BaseModel):
    initial: list[OnboardingDTO]
    reviewing: list[OnboardingDTO]
    pending_review: list[OnboardingDTO]
    active: list[OnboardingDTO]


class VerdictReq(BaseModel):
    verdict: Literal["valid", "issue"]
    note: str | None = None


class RejectReq(BaseModel):
    reason: str | None = None


class AllotRdmptDTO(BaseModel):
    """agg_before/agg_after/expected_cash_in are snapshotted at insert time
    (DB B-3, Backend C-2), never recomputed live -- widened 2026-07-20 (D-9)."""

    id: uuid.UUID
    reference: str  # "AL-3F9A2C" -- UUID-derived, no sequence
    model_id: uuid.UUID
    model_name: str
    units: Decimal
    amount: Decimal  # units * model.model_size
    kind: AllotRdmpKind
    status: AllotRdmpStatus
    note: str | None
    agg_before: Decimal  # snapshot: sum(client_subscriptions.multiplier) for this model_id, before this row
    agg_after: Decimal  # snapshot: agg_before + units
    expected_cash_in: datetime | None  # snapshot: created_at + ONBOARDING_SETTLEMENT_DAYS
    rm: str
    created_at: datetime
    acknowledged_at: datetime | None


class SubscriptionDTO(BaseModel):
    model_id: uuid.UUID
    model_name: str
    units: Decimal
    ib_account: str | None


class ClientEventDTO(BaseModel):
    id: uuid.UUID
    category: str
    title: str
    body: str
    created_at: datetime
```

**Behavior / invariants:** every field name and type matches proposal § 4.1 verbatim — this file IS the wire contract, not a paraphrase of it. `OnboardingDTO.documents` defaults to `[]` so the board-list route (which omits documents per § 4.1) doesn't need a separate schema. **`SubscriptionDTO` and `ClientEventDTO` are unchanged by the 2026-07-20 widening (D-9)** — client-frontend Portfolio/Events stay on their original, unwidened shape; only `OnboardingDTO` and `AllotRdmptDTO` (admin-portal-facing) gained fields.

**Done when:** `mypy` passes; a round-trip `BoardDTO.model_validate(...)` / `.model_dump()` against a hand-built fixture matching § 4.1's shape succeeds.

---

### BE-2 — `compliance_doc_config.py`: required-doc config (MANDATORY)

- **Proposal ref:** § Layer 2 §C-4
- **Module:** 5.2
- **Files:** `create: api-backend/app/libs/onboarding/compliance_doc_config.py`
- **Dependencies:** none — parallel-safe

**Contract:**
```python
# api-backend/app/libs/onboarding/compliance_doc_config.py
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DocSpec:
    key: str  # stable config KEY -> onboarding_documents.doc_type; never renamed once shipped
    label: str  # display label (server-authoritative -- FE renders this, never a local label)
    required: bool
    periodic_review: bool
    review_interval_days: int | None = None  # only meaningful when periodic_review=True


# The 7 seed docs. `identity_proof` unifies the RM's "Other -- ID / Passport /
# Proof of Address" and Compliance's "ID / Passport / Proof of Address" labels
# (proposal § Layer 3 A-1 / Additional findings) -- both pages now render this
# one canonical label from the server.
REQUIRED_DOCS: tuple[DocSpec, ...] = (
    DocSpec(key="identity_proof", label="ID / Passport / Proof of Address", required=True, periodic_review=False),
    DocSpec(key="account_opening_form", label="Account Opening Form", required=True, periodic_review=False),
    DocSpec(key="risk_disclosure", label="Risk Disclosure Statement", required=True, periodic_review=False),
    DocSpec(key="fatca_crs", label="FATCA / CRS Declaration", required=True, periodic_review=False),
    DocSpec(key="source_of_wealth", label="Source of Wealth Declaration", required=True, periodic_review=False),
    DocSpec(key="bank_reference", label="Bank Reference Letter", required=True, periodic_review=False),
    DocSpec(key="signed_agreement", label="Signed Client Agreement", required=True, periodic_review=False),
)

REQUIRED_COUNT: int = sum(1 for d in REQUIRED_DOCS if d.required)


def get_doc_spec(doc_type: str) -> DocSpec:
    for spec in REQUIRED_DOCS:
        if spec.key == doc_type:
            return spec
    raise KeyError(f"unknown doc_type: {doc_type!r}")
```

**Behavior / invariants:** adding a doc type is a one-entry addition to this tuple — no migration, existing cycles' `onboarding_documents` rows are unaffected, only cycles created *after* the change get the new row (per proposal § Layer 2 §C-4). `key` values are never renamed once a cycle references them (renaming would orphan existing `onboarding_documents.doc_type` values).

**Done when:** `REQUIRED_COUNT == 7`; `get_doc_spec` raises `KeyError` for an unknown key.

---

### BE-3 — `repository.py`: `OnboardingRepository` (MANDATORY)

- **Proposal ref:** § Layer 2 §A, §B, § 4.1 field-map
- **Module:** 5.3
- **Files:** `create: api-backend/app/libs/onboarding/repository.py`
- **Dependencies:** BE-2 (seeds rows from `REQUIRED_DOCS`)

**Contract:**
```python
# api-backend/app/libs/onboarding/repository.py
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.libs.onboarding.compliance_doc_config import REQUIRED_DOCS
from app.models.onboarding import (
    ClientAllotment,
    ClientEvent,
    ClientOnboarding,
    OnboardingDocument,
)
from app.models.pc import ClientSubscription, Model
from app.models.users import ClientProfile, User


@dataclass(frozen=True)
class OnboardingDisplayRow:
    """Widened 2026-07-20 (C-7): display_fields()'s return shape -- the joined
    + resolved fields OnboardingDTO assembly needs beyond the raw
    ClientOnboarding row (client_name/email/assigned_rm/model_name plus the
    ClientProfile-sourced phone/address/country added by D-9)."""

    client_name: str
    email: str
    assigned_rm: str
    model_name: str
    primary_phone: str
    address: str
    country_of_residence: str


@dataclass(frozen=True)
class OnboardingRow:
    """Repository return shape for one cycle joined to its client/model display
    fields. Service maps this + its DocumentRow list into OnboardingDTO."""

    onboarding: ClientOnboarding
    client_name: str
    email: str
    assigned_rm: str
    model_name: str


class OnboardingRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ---- create ----------------------------------------------------------
    def create_cycle(
        self,
        *,
        user_id: uuid.UUID,
        model_id: uuid.UUID,
        units: Decimal,
        mgmt_fee: Decimal,
        incentive_fee: Decimal,
        ibhk_account: str,
        sw_account: str,
    ) -> ClientOnboarding:
        """Inserts the one client_onboardings row (unique per user_id) plus one
        onboarding_documents row per REQUIRED_DOCS entry, all not_started. No
        commit here -- caller's txn boundary (OnboardingService.start)."""
        onboarding = ClientOnboarding(
            id=uuid.uuid4(),
            user_id=user_id,
            model_id=model_id,
            multiplier=units,
            mgmt_fee=mgmt_fee,
            incentive_fee=incentive_fee,
            ibhk_account=ibhk_account,
            sw_account=sw_account,
        )
        self.db.add(onboarding)
        self.db.flush()
        for spec in REQUIRED_DOCS:
            self.db.add(
                OnboardingDocument(
                    id=uuid.uuid4(),
                    onboarding_id=onboarding.id,
                    doc_type=spec.key,
                )
            )
        return onboarding

    # ---- read --------------------------------------------------------
    def get_by_id(self, onboarding_id: uuid.UUID) -> ClientOnboarding | None:
        return self.db.get(ClientOnboarding, onboarding_id)

    def get_by_user_id(self, user_id: uuid.UUID) -> ClientOnboarding | None:
        return self.db.query(ClientOnboarding).filter(ClientOnboarding.user_id == user_id).one_or_none()

    def board(self) -> dict[str, list[ClientOnboarding]]:
        """Grouped by status for GET /api/rm/onboardings. Ordering within a
        column: created_at ascending (oldest first), matching kanban convention."""
        rows = self.db.query(ClientOnboarding).order_by(ClientOnboarding.created_at.asc()).all()
        buckets: dict[str, list[ClientOnboarding]] = {
            "initial": [], "reviewing": [], "pending_review": [], "active": [],
        }
        for row in rows:
            buckets[row.status].append(row)
        return buckets

    def compliance_queue(self) -> list[ClientOnboarding]:
        """reviewing + decided history, per GET /api/compliance/onboardings."""
        return (
            self.db.query(ClientOnboarding)
            .filter(ClientOnboarding.status.in_(["reviewing", "pending_review", "active"]))
            .order_by(ClientOnboarding.created_at.desc())
            .all()
        )

    def documents_for(self, onboarding_id: uuid.UUID) -> list[OnboardingDocument]:
        return (
            self.db.query(OnboardingDocument)
            .filter(OnboardingDocument.onboarding_id == onboarding_id)
            .all()
        )

    def get_document(self, onboarding_id: uuid.UUID, doc_type: str) -> OnboardingDocument | None:
        return (
            self.db.query(OnboardingDocument)
            .filter(OnboardingDocument.onboarding_id == onboarding_id, OnboardingDocument.doc_type == doc_type)
            .one_or_none()
        )

    def display_fields(self, onboarding: ClientOnboarding) -> "OnboardingDisplayRow":
        """Widened 2026-07-20 (C-7): joins ClientProfile + User + Model + the
        assigned RM's own User/AdminProfile row to resolve assigned_rm_uid to a
        display name -- the EXACT same pattern app/libs/clients/repository.py's
        _base_query() already uses (RM = aliased(User) joined on
        RM.firebase_uid == ClientProfile.assigned_rm_uid, RMProfile =
        aliased(AdminProfile), coalesce(RMProfile.name, RM.email,
        assigned_rm_uid)) -- reused, not reinvented. No caching; called
        per-row on list/detail."""
        from sqlalchemy.orm import aliased

        from app.models.users import AdminProfile

        RM = aliased(User)
        RMProfile = aliased(AdminProfile)
        rm_name_expr = func.coalesce(RMProfile.name, RM.email, ClientProfile.assigned_rm_uid)

        profile = self.db.query(ClientProfile).filter(ClientProfile.user_id == onboarding.user_id).one()
        user = self.db.get(User, onboarding.user_id)
        model = self.db.get(Model, onboarding.model_id)
        assert user is not None and model is not None
        rm_name = (
            self.db.query(rm_name_expr)
            .select_from(ClientProfile)
            .outerjoin(RM, RM.firebase_uid == ClientProfile.assigned_rm_uid)
            .outerjoin(RMProfile, RMProfile.user_id == RM.id)
            .filter(ClientProfile.user_id == onboarding.user_id)
            .scalar()
        )
        return OnboardingDisplayRow(
            client_name=profile.name or "",
            email=user.email or "",
            assigned_rm=rm_name or "",
            model_name=model.name,
            primary_phone=profile.primary_phone or "",
            address=profile.address or "",
            country_of_residence=profile.country_of_residence or "",
        )

    # ---- mutate: documents ------------------------------------------------
    def upload_document(
        self, doc: OnboardingDocument, *, storage_key: str, filename: str, content_type: str | None
    ) -> None:
        doc.storage_key = storage_key
        doc.filename = filename
        doc.content_type = content_type
        doc.status = "uploaded"
        doc.version_no = (doc.version_no or 0) + 1
        doc.issue_note = None

    def set_verdict(self, doc: OnboardingDocument, *, status: str, reviewed_by: str, note: str | None) -> None:
        doc.status = status
        doc.reviewed_by = reviewed_by
        doc.reviewed_at = datetime.utcnow()
        doc.issue_note = note

    def reset_for_reupload(self, doc: OnboardingDocument) -> None:
        """Renewal-scheduler path (BE-7): clears a periodic-review doc back to
        not_started without touching storage_key (RM re-uploads over it)."""
        doc.status = "not_started"
        doc.reviewed_by = None
        doc.reviewed_at = None
        doc.issue_note = None

    def bump_all_to_in_review(self, onboarding_id: uuid.UUID) -> None:
        for doc in self.documents_for(onboarding_id):
            if doc.status != "verified":
                doc.status = "in_review"

    def counts(self, onboarding_id: uuid.UUID) -> tuple[int, int]:
        """(verified_count, required_count) computed from real rows, never a
        lookup table."""
        docs = self.documents_for(onboarding_id)
        verified = sum(1 for d in docs if d.status == "verified")
        required = sum(1 for d in docs if get_doc_spec_required(d.doc_type))
        return verified, required

    # ---- mutate: subscriptions / allotments / events ----------------------
    def upsert_subscription(
        self,
        *,
        user_id: uuid.UUID,
        model_id: uuid.UUID,
        multiplier: Decimal,
        mgmt_fee_override: Decimal | None,
        incentive_fee_override: Decimal | None,
    ) -> None:
        """INSERT .. ON DUPLICATE KEY UPDATE semantics via SQLAlchemy merge-style
        get-then-set (composite PK user_id+model_id) -- no raw SQL, portable
        across the MariaDB/SQLite test path."""
        sub = self.db.get(ClientSubscription, (user_id, model_id))
        if sub is None:
            sub = ClientSubscription(user_id=user_id, model_id=model_id)
            self.db.add(sub)
        sub.multiplier = multiplier
        sub.mgmt_fee_override = mgmt_fee_override
        sub.incentive_fee_override = incentive_fee_override

    def sum_subscription_multiplier(self, model_id: uuid.UUID) -> Decimal:
        """Widened 2026-07-20 (C-7/D-9): SUM(client_subscriptions.multiplier)
        WHERE model_id = X, for computing agg_before at approve. MUST be called
        before this client's own upsert_subscription() runs for the same
        model_id -- otherwise the sum double-counts this client's new row
        (Backend C-2's ordering constraint). Returns Decimal("0") if no rows."""
        from sqlalchemy import func

        total = (
            self.db.query(func.sum(ClientSubscription.multiplier))
            .filter(ClientSubscription.model_id == model_id)
            .scalar()
        )
        return total if total is not None else Decimal("0")

    def create_allotment(
        self,
        *,
        user_id: uuid.UUID,
        model_id: uuid.UUID,
        multiplier: Decimal,
        source_onboarding_id: uuid.UUID,
        agg_before: Decimal,
        agg_after: Decimal,
        expected_cash_in: datetime,
    ) -> ClientAllotment:
        allotment = ClientAllotment(
            id=uuid.uuid4(),
            user_id=user_id,
            model_id=model_id,
            multiplier=multiplier,
            kind="allotment",
            status="pending",
            note="initial allotment",
            source_onboarding_id=source_onboarding_id,
            reference=f"AL-{uuid.uuid4().hex[:6].upper()}",
            agg_before=agg_before,
            agg_after=agg_after,
            expected_cash_in=expected_cash_in,
        )
        self.db.add(allotment)
        return allotment

    def list_allotments(self) -> list[ClientAllotment]:
        return self.db.query(ClientAllotment).order_by(ClientAllotment.created_at.desc()).all()

    def get_allotment(self, allotment_id: uuid.UUID) -> ClientAllotment | None:
        return self.db.get(ClientAllotment, allotment_id)

    def create_event(self, *, user_id: uuid.UUID, category: str, title: str, body: str) -> None:
        self.db.add(ClientEvent(id=uuid.uuid4(), user_id=user_id, category=category, title=title, body=body))

    def list_subscriptions_for_client(self, user_id: uuid.UUID) -> list[tuple[ClientSubscription, Model]]:
        return (
            self.db.query(ClientSubscription, Model)
            .join(Model, Model.id == ClientSubscription.model_id)
            .filter(ClientSubscription.user_id == user_id)
            .all()
        )

    def list_events_for_client(self, user_id: uuid.UUID) -> list[ClientEvent]:
        return (
            self.db.query(ClientEvent)
            .filter(ClientEvent.user_id == user_id)
            .order_by(ClientEvent.created_at.desc())
            .all()
        )

    def due_for_renewal(self, lookahead_days: int) -> list[OnboardingDocument]:
        """BE-7 scheduler support: periodic_review docs whose expires_at falls
        inside the lookahead window, owned by a currently-active cycle."""
        from datetime import timedelta

        cutoff = datetime.utcnow() + timedelta(days=lookahead_days)
        return (
            self.db.query(OnboardingDocument)
            .join(ClientOnboarding, ClientOnboarding.id == OnboardingDocument.onboarding_id)
            .filter(
                ClientOnboarding.status == "active",
                OnboardingDocument.expires_at.isnot(None),
                OnboardingDocument.expires_at <= cutoff,
            )
            .all()
        )


def get_doc_spec_required(doc_type: str) -> bool:
    from app.libs.onboarding.compliance_doc_config import get_doc_spec

    return get_doc_spec(doc_type).required
```

**Behavior / invariants:** no method commits or raises `HTTPException` — every guard/404/409 decision lives in `service.py`. `counts()` and `board()`/`compliance_queue()` are always derived from live rows, never a cached count (kills the two-source drift called out in proposal B-2). `create_allotment`'s `source_onboarding_id` relies on the DB's `UNIQUE` constraint (DB B-3) as the actual safety net — this method does not itself guard against a duplicate call; a second call for the same `source_onboarding_id` is expected to raise `IntegrityError` at flush/commit time, which `service.py` lets propagate. **`sum_subscription_multiplier` (widened 2026-07-20, C-7) is read-only and does not itself enforce call order** — the ordering guarantee (call it before this client's `upsert_subscription`) is the caller's (`service.py`'s `_approve_initial`) responsibility, documented at BE-5.

**Done when:** `create_cycle` produces exactly 7 `OnboardingDocument` rows (`REQUIRED_COUNT`); `counts()` matches a hand-seeded mix of statuses; `upsert_subscription` updates in place on a second call rather than duplicating the composite-PK row; `due_for_renewal` returns only `active`-status, periodic-review, in-window rows; `sum_subscription_multiplier` returns `Decimal("0")` for a model with no subscriptions and the correct sum for a model with several seeded `client_subscriptions` rows; `display_fields` resolves `assigned_rm` to the RM's `AdminProfile.name` when set, falling back to `User.email` then the raw uid, matching `clients/repository.py`'s existing coalesce precedent.

---

### BE-4 — RBAC actions (MANDATORY)

- **Proposal ref:** § Layer 2 §C-1
- **Module:** 5.4
- **Files:** `modify: api-backend/app/libs/auth/actions.py`
- **Dependencies:** none — parallel-safe

**Contract:**
```python
class Action(str, enum.Enum):
    ...
    RECON_VIEW = "mobo:recon_view"
    # Client Onboarding — feature 013 (BE-4)
    ONBOARDING_MANAGE = "onboarding:manage"        # RM: start / upload / submit
    ONBOARDING_REVIEW = "onboarding:review"        # COMPLIANCE: verdict / approve / reject / download
    ALLOTMENT_ACKNOWLEDGE = "allotment:acknowledge"  # PC: view + acknowledge allotments


ROLE_ACTIONS: dict[AdminRole, set[Action]] = {
    AdminRole.RM: {Action.CLIENT_VIEW, Action.CLIENT_MANAGE, Action.ONBOARDING_MANAGE},
    AdminRole.MOBO: {
        Action.POST_TRADE_ALLOCATION_VIEW,
        Action.POST_TRADE_ALLOCATION_RUN,
        Action.RECON_VIEW,
    },
    AdminRole.PM: set(),
    AdminRole.PC: {
        Action.MODEL_VIEW,
        Action.MODEL_MANAGE,
        Action.ALLOCATION_VIEW,
        Action.ALLOCATION_MANAGE,
        Action.ALLOTMENT_ACKNOWLEDGE,
    },
    AdminRole.COMPLIANCE: {Action.ONBOARDING_REVIEW},
    AdminRole.ADMIN: set(Action),
}
```

**Behavior / invariants:** `AdminRole.ADMIN` already carries `set(Action)` (every action) — no change needed there. `COMPLIANCE`'s set moves from empty to exactly `{ONBOARDING_REVIEW}` — this is the gap flagged in the proposal's context (§ 1: "The `COMPLIANCE` role has an empty action set"). Client-facing routes are NOT gated by `Action`/`require_action` at all — they use `get_current_client_user` + own-`user_id` scoping (no admin action applies to a client-portal request).

**Done when:** `get_actions_for_role(AdminRole.RM)` includes `ONBOARDING_MANAGE`; `get_actions_for_role(AdminRole.COMPLIANCE)` includes `ONBOARDING_REVIEW` and nothing else; `get_actions_for_role(AdminRole.PC)` includes `ALLOTMENT_ACKNOWLEDGE`; every other role's prior action set is unchanged.

---

### BE-5 — `service.py`: `OnboardingService` — state machine + atomic approve (MANDATORY)

- **Proposal ref:** § Layer 2 §A, §B, §C-2, §C-3, §C-5, §C-7 (widened 2026-07-20, D-9)
- **Module:** 5.5
- **Files:** `create: api-backend/app/libs/onboarding/service.py`
- **Dependencies:** BE-1, BE-2, BE-3

**Contract:**
```python
# api-backend/app/libs/onboarding/service.py
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from typing import BinaryIO

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.libs.clients.repository import ClientRepository
from app.libs.clients.service import ClientService
from app.libs.identity.service import FirebaseIdentityService
from app.libs.onboarding.compliance_doc_config import REQUIRED_DOCS, get_doc_spec
from app.libs.onboarding.repository import OnboardingRepository
from app.libs.onboarding.schemas import (
    AllotRdmptDTO,
    BoardDTO,
    ClientEventDTO,
    DocumentDTO,
    OnboardingDTO,
    RejectReq,
    StartOnboardingReq,
    SubscriptionDTO,
    VerdictReq,
)
from app.libs.trade_models.storage import get_storage
from app.models.onboarding import ClientOnboarding, OnboardingDocument
from app.models.pc import Model
from app.models.users import AccountStatus, ClientProfile, User

_CAN_REUPLOAD_STATUSES = {"not_started", "uploaded", "rejected", "expired"}

# Widened 2026-07-20 (D-9/C-7): settlement lag used to compute
# client_allotment_redemptions.expected_cash_in at approve. Same os.getenv(...)
# convention as onboarding/scheduler.py's _RENEWAL_LOOKAHEAD_DAYS.
ONBOARDING_SETTLEMENT_DAYS = max(0, int(os.getenv("ONBOARDING_SETTLEMENT_DAYS", "5")))


class OnboardingService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = OnboardingRepository(db)

    # ---- RM: start / documents / submit -----------------------------------
    def start(
        self, req: StartOnboardingReq, *, caller_uid: str, identity: FirebaseIdentityService, settings
    ) -> OnboardingDTO:
        """Delegates client(user+profile) creation to the EXISTING ClientService.onboard
        path (proposal § Layer 2 §A) -- this method adds only the onboarding
        cycle + 7 doc rows on top, inside its own commit."""
        client_service = ClientService(self.db)
        staged_user, _invite_link = client_service.onboard(
            caller_uid=caller_uid,
            email=req.email,
            name=req.client_name,
            assigned_rm_uid=caller_uid,
            identity=identity,
            settings=settings,
            primary_phone=req.primary_phone,
            address=req.address,
            country_of_residence=req.country_of_residence,
            ib_account=req.ibhk_account,
        )
        model = self.db.get(Model, req.model_id)
        if model is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown model_id")
        try:
            onboarding = self.repo.create_cycle(
                user_id=staged_user.id,
                model_id=req.model_id,
                units=req.units,
                mgmt_fee=req.mgmt_fee,
                incentive_fee=req.incentive_fee,
                ibhk_account=req.ibhk_account,
                sw_account=req.sw_account,
            )
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return self._to_dto(onboarding, with_documents=True)

    def upload_document(
        self, onboarding_id: uuid.UUID, doc_type: str, *, stream: BinaryIO, filename: str, content_type: str | None
    ) -> DocumentDTO:
        doc = self._require_document(onboarding_id, doc_type)
        if doc.status not in _CAN_REUPLOAD_STATUSES:
            raise HTTPException(status.HTTP_409_CONFLICT, "Document cannot be reuploaded in its current status")
        storage_key = get_storage().save(stream, suggested_name=filename, content_type=content_type)
        self.repo.upload_document(doc, storage_key=storage_key, filename=filename, content_type=content_type)
        self.db.commit()
        return self._doc_to_dto(doc)

    def submit(self, onboarding_id: uuid.UUID) -> OnboardingDTO:
        onboarding = self._require_onboarding(onboarding_id)
        docs = self.repo.documents_for(onboarding_id)
        missing = [d for d in docs if get_doc_spec(d.doc_type).required and d.status == "not_started"]
        if missing:
            raise HTTPException(status.HTTP_409_CONFLICT, "All required documents must be uploaded before submitting")
        from datetime import datetime

        onboarding.status = "reviewing"
        onboarding.submitted_at = datetime.utcnow()
        self.repo.bump_all_to_in_review(onboarding_id)
        self.db.commit()
        return self._to_dto(onboarding, with_documents=True)

    # ---- Compliance: verdict / approve / reject ----------------------------
    def verdict(self, onboarding_id: uuid.UUID, doc_type: str, req: VerdictReq, *, reviewer_uid: str) -> DocumentDTO:
        onboarding = self._require_onboarding(onboarding_id)
        if onboarding.status != "reviewing":
            raise HTTPException(status.HTTP_409_CONFLICT, "Cycle is not under review")
        doc = self._require_document(onboarding_id, doc_type)
        new_status = "verified" if req.verdict == "valid" else "rejected"
        self.repo.set_verdict(doc, status=new_status, reviewed_by=reviewer_uid, note=req.note)
        self.db.commit()
        return self._doc_to_dto(doc)

    def approve(self, onboarding_id: uuid.UUID, *, compliance_uid: str) -> OnboardingDTO:
        """Atomic, kind-branched. See § Layer 2 §B / §C-2. Single commit for the
        whole branch; any failure rolls back the entire set of writes."""
        onboarding = self._require_onboarding(onboarding_id)
        if onboarding.status != "reviewing":
            raise HTTPException(status.HTTP_409_CONFLICT, "Cycle is not under review")
        docs = self.repo.documents_for(onboarding_id)
        unverified = [d for d in docs if get_doc_spec(d.doc_type).required and d.status != "verified"]
        if unverified:
            raise HTTPException(status.HTTP_409_CONFLICT, "Every required document must be verified before approval")

        from datetime import datetime

        try:
            if onboarding.kind == "initial":
                self._approve_initial(onboarding, compliance_uid=compliance_uid)
            else:  # "renewal"
                self._approve_renewal(onboarding)
            onboarding.status = "active"
            onboarding.decided_at = datetime.utcnow()
            onboarding.reject_reason = None
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return self._to_dto(onboarding, with_documents=True)

    def _approve_initial(self, onboarding: ClientOnboarding, *, compliance_uid: str) -> None:
        """(1) READ agg_before -- MUST happen before the client_subscriptions
        upsert below (widened 2026-07-20, C-2/C-7): reading it after would
        double-count this client's own new row; (2) upsert client_subscriptions
        w/ fee-override compare-and-set (C-5); (3) insert
        client_allotment_redemptions (pending, kind=allotment,
        agg_before/agg_after/expected_cash_in snapshotted here); (4)
        users.status -> active; (5) insert client_events row.
        source_onboarding_id UNIQUE is the DB-enforced guarantee (DB B-3) --
        this method does not itself re-check for a prior allotment; a bug here
        surfaces as an IntegrityError, not a silent duplicate."""
        model = self.db.get(Model, onboarding.model_id)
        assert model is not None
        mgmt_override = None if model.mgmt_fee == onboarding.mgmt_fee else onboarding.mgmt_fee
        incentive_override = None if model.incentive_fee == onboarding.incentive_fee else onboarding.incentive_fee

        # ORDERING: read before upsert -- see docstring.
        agg_before = self.repo.sum_subscription_multiplier(onboarding.model_id)
        agg_after = agg_before + onboarding.multiplier
        expected_cash_in = datetime.utcnow() + timedelta(days=ONBOARDING_SETTLEMENT_DAYS)

        self.repo.upsert_subscription(
            user_id=onboarding.user_id,
            model_id=onboarding.model_id,
            multiplier=onboarding.multiplier,
            mgmt_fee_override=mgmt_override,
            incentive_fee_override=incentive_override,
        )
        self.repo.create_allotment(
            user_id=onboarding.user_id,
            model_id=onboarding.model_id,
            multiplier=onboarding.multiplier,
            source_onboarding_id=onboarding.id,
            agg_before=agg_before,
            agg_after=agg_after,
            expected_cash_in=expected_cash_in,
        )
        user = self.db.get(User, onboarding.user_id)
        assert user is not None
        user.status = AccountStatus.ACTIVE
        user.authorized_by = compliance_uid
        self.repo.create_event(
            user_id=onboarding.user_id,
            category="Account Notification",
            title="Subscription active",
            body=f"Your subscription to {model.name} is now active.",
        )

    def _approve_renewal(self, onboarding: ClientOnboarding) -> None:
        """No subscription/allotment/users.status writes -- see § Layer 2 §B:
        a renewal re-verifies documents, it does not re-allot or re-activate."""
        self.repo.create_event(
            user_id=onboarding.user_id,
            category="Account Notification",
            title="Periodic review complete",
            body="Your periodic KYC review is complete.",
        )

    def reject(self, onboarding_id: uuid.UUID, req: RejectReq) -> OnboardingDTO:
        onboarding = self._require_onboarding(onboarding_id)
        if onboarding.status != "reviewing":
            raise HTTPException(status.HTTP_409_CONFLICT, "Cycle is not under review")
        from datetime import datetime

        onboarding.status = "pending_review"
        onboarding.decided_at = datetime.utcnow()
        onboarding.reject_reason = req.reason
        self.db.commit()
        return self._to_dto(onboarding, with_documents=True)

    # ---- Scheduler hook (BE-7 calls this) ----------------------------------
    def reopen_for_renewal(self, user_id: uuid.UUID, *, due_docs: list[OnboardingDocument], reason: str) -> None:
        onboarding = self.repo.get_by_user_id(user_id)
        if onboarding is None or onboarding.status != "active":
            return  # duplicate guard -- a row already off "active" has a renewal in flight
        onboarding.kind = "renewal"
        onboarding.status = "pending_review"
        onboarding.reject_reason = reason
        for doc in due_docs:
            self.repo.reset_for_reupload(doc)
        self.db.commit()

    # ---- Board / list reads -------------------------------------------------
    def board(self) -> BoardDTO:
        buckets = self.repo.board()
        return BoardDTO(**{k: [self._to_dto(o) for o in v] for k, v in buckets.items()})

    def compliance_queue(self) -> list[OnboardingDTO]:
        return [self._to_dto(o, with_documents=True) for o in self.repo.compliance_queue()]

    def detail(self, onboarding_id: uuid.UUID) -> OnboardingDTO:
        return self._to_dto(self._require_onboarding(onboarding_id), with_documents=True)

    def download_document(self, onboarding_id: uuid.UUID, doc_type: str) -> tuple[BinaryIO, str, str | None]:
        doc = self._require_document(onboarding_id, doc_type)
        if doc.storage_key is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No file uploaded for this document")
        stream = get_storage().open(doc.storage_key)
        return stream, doc.filename or doc.doc_type, doc.content_type

    # ---- PC: allotments -----------------------------------------------------
    def list_allotments(self) -> list[AllotRdmptDTO]:
        return [self._allotment_to_dto(a) for a in self.repo.list_allotments()]

    def acknowledge_allotment(self, allotment_id: uuid.UUID, *, acked_by: str) -> AllotRdmptDTO:
        allotment = self.repo.get_allotment(allotment_id)
        if allotment is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown allotment")
        if allotment.status != "pending":
            raise HTTPException(status.HTTP_409_CONFLICT, "Allotment already acknowledged")
        from datetime import datetime

        allotment.status = "acknowledged"
        allotment.acknowledged_by = acked_by
        allotment.acknowledged_at = datetime.utcnow()
        self.db.commit()
        return self._allotment_to_dto(allotment)

    # ---- Client: subscriptions / events --------------------------------------
    def client_subscriptions(self, user_id: uuid.UUID) -> list[SubscriptionDTO]:
        from app.models.users import ClientProfile

        profile = self.db.query(ClientProfile).filter(ClientProfile.user_id == user_id).one_or_none()
        ib_account = profile.ib_account if profile else None
        return [
            SubscriptionDTO(model_id=model.id, model_name=model.name, units=sub.multiplier, ib_account=ib_account)
            for sub, model in self.repo.list_subscriptions_for_client(user_id)
        ]

    def client_events(self, user_id: uuid.UUID) -> list[ClientEventDTO]:
        return [
            ClientEventDTO(id=e.id, category=e.category, title=e.title, body=e.body, created_at=e.created_at)
            for e in self.repo.list_events_for_client(user_id)
        ]

    # ---- internal helpers -----------------------------------------------
    def _require_onboarding(self, onboarding_id: uuid.UUID) -> ClientOnboarding:
        onboarding = self.repo.get_by_id(onboarding_id)
        if onboarding is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown onboarding cycle")
        return onboarding

    def _require_document(self, onboarding_id: uuid.UUID, doc_type: str) -> OnboardingDocument:
        doc = self.repo.get_document(onboarding_id, doc_type)
        if doc is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown document")
        return doc

    def _doc_to_dto(self, doc: OnboardingDocument) -> DocumentDTO:
        spec = get_doc_spec(doc.doc_type)
        return DocumentDTO(
            doc_type=doc.doc_type,
            label=spec.label,
            status=doc.status,
            filename=doc.filename,
            required=spec.required,
            periodic_review=spec.periodic_review,
            issue_note=doc.issue_note,
            reviewed_at=doc.reviewed_at,
            expires_at=doc.expires_at,
            can_reupload=doc.status in _CAN_REUPLOAD_STATUSES,
        )

    @staticmethod
    def _client_ref(user_id: uuid.UUID) -> str:
        """Widened 2026-07-20 (C-7): display convention only, never stored --
        derived from a UUID already unique per user, so two clients never
        collide."""
        return f"MEGA-{str(user_id).split('-')[0][:4].upper()}"

    def _to_dto(self, onboarding: ClientOnboarding, *, with_documents: bool = False) -> OnboardingDTO:
        display = self.repo.display_fields(onboarding)
        verified, required = self.repo.counts(onboarding.id)
        return OnboardingDTO(
            id=onboarding.id,
            user_id=onboarding.user_id,
            client_name=display.client_name,
            email=display.email,
            assigned_rm=display.assigned_rm,
            client_ref=self._client_ref(onboarding.user_id),
            primary_phone=display.primary_phone,
            address=display.address,
            country_of_residence=display.country_of_residence,
            id_type=onboarding.id_type,
            id_number=onboarding.id_number,
            ibhk_account=onboarding.ibhk_account or "",
            sw_account=onboarding.sw_account or "",
            status=onboarding.status,
            kind=onboarding.kind,
            model_id=onboarding.model_id,
            model_name=display.model_name,
            units=onboarding.multiplier,
            mgmt_fee=onboarding.mgmt_fee,
            incentive_fee=onboarding.incentive_fee,
            verified_count=verified,
            required_count=required,
            reject_reason=onboarding.reject_reason,
            submitted_at=onboarding.submitted_at,
            created_at=onboarding.created_at,
            documents=[self._doc_to_dto(d) for d in self.repo.documents_for(onboarding.id)] if with_documents else [],
        )

    def _allotment_to_dto(self, allotment) -> AllotRdmptDTO:
        model = self.db.get(Model, allotment.model_id)
        assert model is not None
        amount = allotment.multiplier * (model.model_size or Decimal("0"))
        source_onboarding = self.repo.get_by_user_id(allotment.user_id)
        assigned_rm = self.repo.display_fields(source_onboarding).assigned_rm if source_onboarding else ""
        return AllotRdmptDTO(
            id=allotment.id,
            reference=allotment.reference,
            model_id=model.id,
            model_name=model.name,
            units=allotment.multiplier,
            amount=amount,
            kind=allotment.kind,
            status=allotment.status,
            note=allotment.note,
            agg_before=allotment.agg_before,
            agg_after=allotment.agg_after,
            expected_cash_in=allotment.expected_cash_in,
            rm=assigned_rm,
            created_at=allotment.created_at,
            acknowledged_at=allotment.acknowledged_at,
        )
```

**Behavior / invariants:**
- **Guards return 409** (all four): submit-before-all-docs, reupload-while-in-review/verified, approve-before-all-verified, acknowledge-an-already-acknowledged-allotment. **404** for unknown onboarding/document/allotment ids.
- **Approve is one commit per branch.** `_approve_initial`/`_approve_renewal` perform all their writes against `self.db` without an intermediate commit; `approve()` wraps both the branch call and the final three field-sets in one `try/except` with a single `self.db.commit()` / `self.db.rollback()` pair — matching the compensation pattern in `clients/service.py:38-77`.
- **Fee-override compare-and-set (C-5):** `_approve_initial` never computes a fee — it only decides whether `onboarding.mgmt_fee`/`incentive_fee` equals `model.mgmt_fee`/`incentive_fee` at that instant; equal → `None` (inherit default), different → the captured value. No rounding/tolerance logic beyond the columns' shared `Numeric(9,6)` precision (both sides already round to that scale at the DB boundary).
- **Renewal reopens the one existing row** — `reopen_for_renewal` looks up by `user_id` (unique per DB B-1), never inserts a second `client_onboardings` row. The duplicate-in-flight guard is a single `status != "active"` check (a client with a renewal already underway is never `"active"`).
- **`OnboardingService.start` delegates, never duplicates, client creation** — `ClientService.onboard` (existing) does the Firebase identity + `users`/`client_profiles` insert + its own commit; `start()` then adds the cycle in a *second* commit. This is two transactions, not one — if the second (cycle creation) fails, the client row from the first commit remains (a client with no onboarding cycle yet, a recoverable state distinct from a half-applied approve). This is an intentional two-phase split (client creation is a proven, independently-tested existing path; wrapping it in a single mega-transaction with new code would risk regressing that path) — noted here, not hidden.
- **`agg_before`/`agg_after`/`expected_cash_in` ordering (widened 2026-07-20, C-2/C-7):** `_approve_initial` calls `repo.sum_subscription_multiplier(model_id)` for `agg_before` **before** calling `repo.upsert_subscription(...)` for this client — reversing that order would double-count this client's own new row in `agg_before`, since `upsert_subscription` writes directly into the same `client_subscriptions` table the sum reads from. `agg_after` is `agg_before + onboarding.multiplier`, computed in Python, not a second query. `expected_cash_in` is `datetime.utcnow() + timedelta(days=ONBOARDING_SETTLEMENT_DAYS)`; `ONBOARDING_SETTLEMENT_DAYS` defaults to `5`, overridable via `ONBOARDING_SETTLEMENT_DAYS` env var, following the exact `os.getenv(...)` convention `scheduler.py`'s `_RENEWAL_LOOKAHEAD_DAYS` already uses. Both values are snapshotted once into the `client_allotment_redemptions` insert and never recomputed later.
- **`OnboardingDTO` assembly is a join + resolve + format, not a row select (widened 2026-07-20, C-7):** `_to_dto` sources `primary_phone`/`address`/`country_of_residence` from `repo.display_fields(...)`'s `ClientProfile` join (never duplicated onto `client_onboardings`); `assigned_rm` from the same call's RM-name resolution (`aliased(User)`/`aliased(AdminProfile)` joined on `firebase_uid == assigned_rm_uid`, coalesced to email then the raw uid — the identical pattern `app/libs/clients/repository.py`'s `_base_query()` already uses, reused rather than reinvented); `client_ref` is formatted in-process by `_client_ref(user_id)` (`f"MEGA-{...}"`), never stored. None of these three are extra writes — all read-side, at DTO-assembly time.

**Done when:** a full walkthrough (`start` → `upload_document` × 7 → `submit` → `verdict` × 7 → `approve`) leaves `client_subscriptions`, `client_allotment_redemptions`, `users.status`, and `client_events` each with exactly the one expected row; each of the four guard violations raises `HTTPException(409, ...)`; a `kind="renewal"` approve leaves `client_allotment_redemptions` row count unchanged from before the approve call; the resulting `client_allotment_redemptions` row's `agg_before`/`agg_after` equal the pre/post `SUM(client_subscriptions.multiplier)` for that `model_id` and `expected_cash_in` equals `created_at + ONBOARDING_SETTLEMENT_DAYS`; overriding the `ONBOARDING_SETTLEMENT_DAYS` env var changes `expected_cash_in` accordingly; the returned `OnboardingDTO`'s `primary_phone`/`address`/`country_of_residence`/`assigned_rm`/`client_ref` populate correctly against a seeded `ClientProfile` + RM `AdminProfile`.

---

### BE-6 — `router.py`: 14 role-prefixed routes (MANDATORY)

- **Proposal ref:** § Layer 2 §D
- **Module:** 5.6
- **Files:** `create: api-backend/app/libs/onboarding/router.py`
- **Dependencies:** BE-1, BE-4, BE-5

**Contract:**
```python
# api-backend/app/libs/onboarding/router.py
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import Settings, get_settings
from app.libs.auth.actions import Action
from app.libs.auth.deps import get_current_admin_user, get_current_client_user, require_action
from app.libs.identity.service import FirebaseIdentityService
from app.libs.onboarding.schemas import (
    AllotRdmptDTO,
    BoardDTO,
    ClientEventDTO,
    DocumentDTO,
    OnboardingDTO,
    RejectReq,
    StartOnboardingReq,
    SubscriptionDTO,
    VerdictReq,
)
from app.libs.onboarding.service import OnboardingService
from app.models.users import User

router = APIRouter(tags=["onboarding"])


def _service(db: Annotated[Session, Depends(get_db)]) -> OnboardingService:
    return OnboardingService(db)


# ---- RM ---------------------------------------------------------------
@router.post("/rm/onboardings", response_model=OnboardingDTO, status_code=201)
def start_onboarding(
    req: StartOnboardingReq,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.ONBOARDING_MANAGE))],
    settings: Annotated[Settings, Depends(get_settings)],
) -> OnboardingDTO:
    identity = FirebaseIdentityService(settings)
    return svc.start(req, caller_uid=user.firebase_uid, identity=identity, settings=settings)


@router.get("/rm/onboardings", response_model=BoardDTO)
def get_board(
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ONBOARDING_MANAGE))],
) -> BoardDTO:
    return svc.board()


@router.get("/rm/onboardings/{onboarding_id}", response_model=OnboardingDTO)
def get_onboarding_detail(
    onboarding_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ONBOARDING_MANAGE))],
) -> OnboardingDTO:
    return svc.detail(onboarding_id)


@router.post("/rm/onboardings/{onboarding_id}/documents/{doc_type}", response_model=DocumentDTO)
async def upload_document(
    onboarding_id: uuid.UUID,
    doc_type: str,
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ONBOARDING_MANAGE))],
    file: UploadFile = File(...),
) -> DocumentDTO:
    return svc.upload_document(
        onboarding_id, doc_type, stream=file.file, filename=file.filename or doc_type, content_type=file.content_type
    )


@router.post("/rm/onboardings/{onboarding_id}/submit", response_model=OnboardingDTO)
def submit_onboarding(
    onboarding_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ONBOARDING_MANAGE))],
) -> OnboardingDTO:
    return svc.submit(onboarding_id)


# ---- Compliance ---------------------------------------------------------
@router.get("/compliance/onboardings", response_model=list[OnboardingDTO])
def get_compliance_queue(
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ONBOARDING_REVIEW))],
) -> list[OnboardingDTO]:
    return svc.compliance_queue()


@router.get("/compliance/onboardings/{onboarding_id}/documents/{doc_type}/download")
def download_document(
    onboarding_id: uuid.UUID,
    doc_type: str,
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ONBOARDING_REVIEW))],
) -> StreamingResponse:
    stream, filename, content_type = svc.download_document(onboarding_id, doc_type)
    return StreamingResponse(
        stream,
        media_type=content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/compliance/onboardings/{onboarding_id}/documents/{doc_type}/verdict", response_model=DocumentDTO)
def submit_verdict(
    onboarding_id: uuid.UUID,
    doc_type: str,
    req: VerdictReq,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.ONBOARDING_REVIEW))],
) -> DocumentDTO:
    return svc.verdict(onboarding_id, doc_type, req, reviewer_uid=user.firebase_uid)


@router.post("/compliance/onboardings/{onboarding_id}/approve", response_model=OnboardingDTO)
def approve_onboarding(
    onboarding_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.ONBOARDING_REVIEW))],
) -> OnboardingDTO:
    return svc.approve(onboarding_id, compliance_uid=user.firebase_uid)


@router.post("/compliance/onboardings/{onboarding_id}/reject", response_model=OnboardingDTO)
def reject_onboarding(
    onboarding_id: uuid.UUID,
    req: RejectReq,
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ONBOARDING_REVIEW))],
) -> OnboardingDTO:
    return svc.reject(onboarding_id, req)


# ---- PC ------------------------------------------------------------------
@router.get("/pc/allotments", response_model=list[AllotRdmptDTO])
def get_allotments(
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ALLOTMENT_ACKNOWLEDGE))],
) -> list[AllotRdmptDTO]:
    return svc.list_allotments()


@router.post("/pc/allotments/{allotment_id}/acknowledge", response_model=AllotRdmptDTO)
def acknowledge_allotment(
    allotment_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.ALLOTMENT_ACKNOWLEDGE))],
) -> AllotRdmptDTO:
    return svc.acknowledge_allotment(allotment_id, acked_by=user.firebase_uid)


# ---- Client ---------------------------------------------------------------
@router.get("/client/subscriptions", response_model=list[SubscriptionDTO])
def get_client_subscriptions(
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(get_current_client_user)],
) -> list[SubscriptionDTO]:
    return svc.client_subscriptions(user.id)


@router.get("/client/events", response_model=list[ClientEventDTO])
def get_client_events(
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(get_current_client_user)],
) -> list[ClientEventDTO]:
    return svc.client_events(user.id)
```

**Behavior / invariants:** exactly the 14 routes listed in proposal § Layer 2 §D — no route prefix declared at the `APIRouter` level (unlike `reconciliation`'s single-prefix router) because this package spans four different role prefixes (`/rm`, `/compliance`, `/pc`, `/client`); each route's own path carries its prefix, and `main.py` mounts the whole router under the shared `/api` prefix only. Upload uses `multipart/form-data` (`UploadFile`) per proposal § 4.1 ("form may submit with 0..7 docs" — one call per doc, matching the existing `trade_models` upload convention). Client routes take no path/query `user_id` — always `get_current_client_user`-scoped.

**Done when:** all 14 routes appear in `app.routes`; an unauthenticated request to any RM/Compliance/PC route returns `401`/`403` (via `require_action`'s own chain); an unauthenticated request to a client route returns `403` (via `get_current_client_user`); a client user (`Portal.CLIENT`) hitting an RM route returns `403` (via `get_current_admin_user`'s portal check).

---

### BE-7 — `scheduler.py`: renewal-trigger background job (Accepted)

- **Proposal ref:** § Layer 2 §C-6, § Design decision D-7
- **Module:** 5.7
- **Files:** `create: api-backend/app/libs/onboarding/scheduler.py`
- **Dependencies:** BE-3, BE-5

**Contract:**
```python
# api-backend/app/libs/onboarding/scheduler.py
"""BE-7 -- asyncio background scheduler that reopens a client's onboarding row
for renewal when a periodic-review document nears expires_at. Mirrors
app/libs/allocation_matrix/scheduler.py's shape exactly: pure asyncio, no
apscheduler dependency, hourly tick wrapped in try/except Exception."""

from __future__ import annotations

import asyncio
import logging
import os
from collections import defaultdict

logger = logging.getLogger(__name__)

_TICK_SECONDS = 3600  # hourly, matching the sibling schedulers
_RENEWAL_LOOKAHEAD_DAYS = max(0, int(os.getenv("ONBOARDING_RENEWAL_LOOKAHEAD_DAYS", "30")))


async def _renewal_check_job() -> None:
    while True:
        await asyncio.sleep(_TICK_SECONDS)
        try:
            await _trigger_due_renewals()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Onboarding scheduler: unexpected error in tick")


async def _trigger_due_renewals() -> None:
    from app.core.database import SessionLocal
    from app.libs.onboarding.repository import OnboardingRepository
    from app.libs.onboarding.service import OnboardingService

    db = SessionLocal()
    try:
        repo = OnboardingRepository(db)
        due_docs = repo.due_for_renewal(_RENEWAL_LOOKAHEAD_DAYS)
        by_onboarding = defaultdict(list)
        for doc in due_docs:
            by_onboarding[doc.onboarding_id].append(doc)

        svc = OnboardingService(db)
        for onboarding_id, docs in by_onboarding.items():
            onboarding = repo.get_by_id(onboarding_id)
            if onboarding is None:
                continue
            labels = ", ".join(sorted({d.doc_type for d in docs}))
            svc.reopen_for_renewal(
                onboarding.user_id, due_docs=docs, reason=f"Periodic review due: {labels}"
            )
            logger.info(
                "Onboarding scheduler: reopened user %s for renewal (%s)", onboarding.user_id, labels
            )
    finally:
        db.close()


def start_scheduler() -> asyncio.Task:  # type: ignore[type-arg]
    task = asyncio.create_task(_renewal_check_job(), name="onboarding_renewal_scheduler")
    logger.info("Onboarding renewal scheduler started (tick every %d s)", _TICK_SECONDS)
    return task
```

**Behavior / invariants:**
- `reopen_for_renewal` (BE-5) is the single write path — the scheduler never mutates `client_onboardings`/`onboarding_documents` directly, keeping the state machine's sole ownership rule (§ Layer 2 §B) intact even for the one non-route transition.
- Duplicate guard is the `status != "active"` check inside `reopen_for_renewal` itself — a client with a renewal already in flight is skipped silently (logged at `info`, not `warning`; this is expected steady-state behavior on subsequent ticks before that renewal is approved).
- Does **not** touch `users.status`, `client_subscriptions`, or `client_allotment_redemptions` — those three columns/tables are untouched by any code path in this file (verified by BE-5's `reopen_for_renewal` body, which this file calls, containing no such writes).
- Never sets a document's `status` to `"expired"` — resets to `"not_started"` only, per proposal Non-Goals (expiry *status* enforcement is explicitly deferred).

**Done when:** calling `_trigger_due_renewals()` directly (bypassing the tick loop) against a seeded `expires_at` inside the lookahead window reopens exactly that client's row (`kind="renewal"`, `status="pending_review"`); a seeded `expires_at` outside the window is untouched; calling it twice in a row for the same due document reopens the row once (second call is a no-op via the `status != "active"` guard).

---

### BE-8 — Wire into `main.py` (MANDATORY)

- **Proposal ref:** § Layer 2 §D, §C-6
- **Module:** 5.6, 5.7
- **Files:** `modify: api-backend/app/main.py`
- **Dependencies:** BE-6, BE-7

**Contract:**
```python
# api-backend/app/main.py — additive lines only
from app.libs.onboarding.router import router as onboarding_router
from app.libs.onboarding.scheduler import start_scheduler as start_onboarding_scheduler
import app.models.onboarding as _models_onboarding  # noqa: F401 — registers onboarding tables with Base.metadata

...

@asynccontextmanager
async def lifespan(_: FastAPI):
    ...
    scheduler_task = start_scheduler()
    pta_scheduler_task = start_pta_scheduler()
    onboarding_scheduler_task = start_onboarding_scheduler()
    yield
    scheduler_task.cancel()
    if pta_scheduler_task is not None:
        pta_scheduler_task.cancel()
    onboarding_scheduler_task.cancel()

...

app.include_router(clients_router, prefix="/api")  # /api/rm/…
app.include_router(staff_router, prefix="/api")  # /api/admin/staff/…
app.include_router(reconciliation_router, prefix="/api")
app.include_router(onboarding_router, prefix="/api")  # /api/rm|compliance|pc|client onboarding routes
```

**Behavior / invariants:** matches the existing two-scheduler registration/cancellation pattern exactly (`allocation_matrix` + `post_trade_allocation`) — a third `cancel()` call on shutdown, no special-casing. The model import (`app.models.onboarding`) is required so `Base.metadata.create_all(bind=engine)` (line 34, unchanged) picks up the four new tables in the SQLite test path, mirroring the existing `app.models.pc`/`app.models.users` import-for-registration lines at the top of the file.

**Done when:** `GET /health` still returns `200` after the change (app boots cleanly); all 14 onboarding routes appear in `app.openapi()["paths"]`; app shutdown cancels three scheduler tasks, not two.

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal § 4.1 / § 4.2)

```python
# ---- Shared enums (persisted lowercase; see native_enum=False convention) --------
OnboardingStatus = Literal["initial", "reviewing", "pending_review", "active"]
OnboardingKind   = Literal["initial", "renewal"]
DocStatus        = Literal["not_started", "uploaded", "in_review", "verified", "rejected", "expired"]
AllotRdmpStatus  = Literal["pending", "acknowledged"]
AllotRdmpKind    = Literal["allotment", "redemption"] # this proposal only ever writes "allotment"

# ---- Field-name ↔ column-name map (the ones that differ) ------------------------
#  API/DTO field         DB column                       Notes
#  units | multiplier    onboarding.multiplier /         FE forms call it modelUnit/mult/units;
#                        client_allotment_redemptions.multiplier /   persisted as `multiplier` Numeric(28,10)
#                        client_subscriptions.multiplier
#  docType               onboarding_documents.doc_type    stable config KEY, not the display label
#  verdict "valid"       doc status -> "verified"         Compliance verdict maps to a status
#  verdict "issue"       doc status -> "rejected"
#  verdict null          doc status stays "in_review"     unreviewed
#  mgmt_fee/incentive_fee onboarding.mgmt_fee/incentive_fee -> compared at approve against Model.mgmt_fee/incentive_fee;
#                        client_subscriptions.*_override      only written to *_override if it diverges, else stays NULL
#                        (NULL == "inherit the model default", never a calculated value)
#  --- widened 2026-07-20 (D-9): full field parity with the pre-existing mocks ---
#  primary_phone/address/  ClientProfile.primary_phone/        NOT duplicated onto client_onboardings — OnboardingDTO
#  country_of_residence    address/country_of_residence        assembly joins ClientProfile, already captured at client creation
#  assigned_rm (display)   users.name via ClientProfile.assigned_rm_uid -> AdminProfile lookup, resolved server-side
#  agg_before/agg_after    client_allotment_redemptions.        snapshotted once at insert (Backend C-2), never recomputed later —
#                          agg_before/agg_after                 preserves historical accuracy as more clients subscribe afterward
#  expected_cash_in        client_allotment_redemptions.        snapshotted at insert = created_at + ONBOARDING_SETTLEMENT_DAYS (config)
#                          expected_cash_in
#  (client-frontend / SubscriptionDTO / ClientEventDTO are explicitly OUT of scope for this widening — see D-9)

# ---- RM: start / board / documents / submit ------------------------------------
class StartOnboardingReq(BaseModel):          # POST /api/rm/onboardings  -> 201
    client_name: str; email: EmailStr; primary_phone: str
    address: str; country_of_residence: str
    id_type: str; id_number: str
    ibhk_account: str; sw_account: str
    model_id: UUID; units: Decimal            # "Initial Model to Subscribe" + "Model Unit"
    mgmt_fee: Decimal; incentive_fee: Decimal # the agreed fee (fraction, e.g. 0.015); FE converts its "1.5%" display string before sending
    kind: OnboardingKind = "initial"
    # docs uploaded separately via the document route (form may submit with 0..7 docs)

class DocumentDTO(BaseModel):
    doc_type: str; label: str; status: DocStatus
    filename: str | None; required: bool; periodic_review: bool
    issue_note: str | None; reviewed_at: datetime | None; expires_at: datetime | None
    can_reupload: bool                        # server-computed: status in {not_started,uploaded,rejected,expired}

class OnboardingDTO(BaseModel):               # widened 2026-07-20 for full field parity with the pre-existing RM/Compliance mocks — see D-9
    id: UUID; user_id: UUID
    client_name: str; email: str; assigned_rm: str   # assigned_rm: display name, service resolves ClientProfile.assigned_rm_uid -> AdminProfile/User.name
    client_ref: str                            # display code e.g. "MEGA-0481" — server-formatted from user_id, not stored
    primary_phone: str; address: str; country_of_residence: str   # sourced from ClientProfile (already captured at client creation) via join — NOT duplicated onto client_onboardings
    id_type: str; id_number: str               # sourced from client_onboardings (DB B-1) — the one genuinely new pair of columns this widening adds
    ibhk_account: str; sw_account: str         # sourced from client_onboardings — these columns already existed in DB B-1; this widening only adds them to the DTO
    status: OnboardingStatus; kind: OnboardingKind
    model_id: UUID; model_name: str; units: Decimal
    mgmt_fee: Decimal; incentive_fee: Decimal  # the agreed fee as captured at onboarding — same fields StartOnboardingReq sent in; echoed back for the RM/Compliance detail panels
    verified_count: int; required_count: int   # e.g. 6 / 7 — computed from documents
    reject_reason: str | None
    submitted_at: datetime | None; created_at: datetime
    documents: list[DocumentDTO]               # present on detail, omitted on board list

class BoardDTO(BaseModel):                      # GET /api/rm/onboardings -> 200
    initial: list[OnboardingDTO]; reviewing: list[OnboardingDTO]
    pending_review: list[OnboardingDTO]; active: list[OnboardingDTO]

# POST /api/rm/onboardings/{id}/documents/{doc_type}   multipart file -> 200 DocumentDTO
#   409 if the doc's can_reupload is false (in_review | verified)
# POST /api/rm/onboardings/{id}/submit                 -> 200 OnboardingDTO
#   409 if any required doc is not uploaded; sets status reviewing, docs -> in_review

# ---- Compliance: review / verdict / decide -------------------------------------
# GET  /api/compliance/onboardings                     -> 200 list[OnboardingDTO] (reviewing + decided history)
# GET  /api/compliance/onboardings/{id}/documents/{doc_type}/download -> 200 file stream
class VerdictReq(BaseModel):                    # POST .../documents/{doc_type}/verdict -> 200 DocumentDTO
    verdict: Literal["valid", "issue"]; note: str | None = None
# POST /api/compliance/onboardings/{id}/approve        -> 200 OnboardingDTO
#   409 unless every required doc is "verified"; runs §4.2 side-effects atomically
class RejectReq(BaseModel):                     # POST /api/compliance/onboardings/{id}/reject -> 200
    reason: str | None = None                  # flagged docs already marked "issue" via verdict route

# ---- PC: allotments ------------------------------------------------------------
class AllotRdmptDTO(BaseModel):                  # GET /api/pc/allotments -> 200
    id: UUID; reference: str                    # "Client anonymized · {reference}"; UUID-derived e.g. "AL-3F9A2C" — no sequence, no client identity crosses this seam
    model_id: UUID; model_name: str; units: Decimal; amount: Decimal   # amount = units * model.model_size
    kind: AllotRdmpKind; status: AllotRdmpStatus; note: str | None    # note e.g. "initial allotment"
    agg_before: Decimal; agg_after: Decimal     # widened 2026-07-20 — snapshotted at insert time (DB B-3), NOT recomputed live; = sum(client_subscriptions.multiplier) for this model_id, before/after this row's `units`
    expected_cash_in: datetime | None           # widened 2026-07-20 — settlement date, snapshotted at insert time as created_at + a fixed settlement lag (Backend C-2)
    rm: str; created_at: datetime; acknowledged_at: datetime | None
# POST /api/pc/allotments/{id}/acknowledge             -> 200 AllotRdmptDTO  (pending -> acknowledged)

# ---- Client (own records only, scoped to the authenticated client user) --------
class SubscriptionDTO(BaseModel):              # GET /api/client/subscriptions -> 200 list
    model_id: UUID; model_name: str; units: Decimal; ib_account: str | None
    # Not widened — client-frontend (Portfolio/Events) is explicitly OUT of scope for the
    # 2026-07-20 seam-widening pass (D-9); it stays as originally specified. See D-9's note.
class ClientEventDTO(BaseModel):               # GET /api/client/events -> 200 list
    id: UUID; category: str; title: str; body: str; created_at: datetime
    # icon/level/action-label chrome the client Event page renders is NOT part of this DTO — see D-9:
    # it is a static category -> {icon, level, primaryLabel, secondaryLabel, href} lookup table owned by the
    # Frontend layer, keyed on `category` (a closed, small set: "Account Notification" today). No backend
    # field is added for this — it would be speculative storage for what is, today, a pure styling constant.
    # (Portfolio/SubscriptionDTO is NOT widened this way — see D-9's scope note; this Events treatment is
    # an explicit exception because it needs zero new storage of any kind, unlike Portfolio's gaps.)
```

**Status projection (verbatim from proposal § 4.2):**

| DB `client_onboardings.status` | RM board column | Compliance `ObStatus` | Client can log in? |
|---|---|---|---|
| `initial` | Initial Onboarding | (not shown) | no (`users.status` still `DISABLED`) |
| `reviewing` | Reviewing | `pending` | depends on `kind` — see proposal § 4.2 note |
| `pending_review` | Pending for Review | `rejected` | depends on `kind` — see proposal § 4.2 note |
| `active` | Active | `approved` | yes (`users.status` is `ACTIVE`) |

### 7.2 How this layer honours the seam
- **What this layer contributes:** serves every DTO/route above with the stated codes (BE-6); owns every transition + the atomic approve side-effects (BE-5); computes `can_reupload`, `verified_count`/`required_count`, `amount` server-side, never trusting a client-sent value for any of the three. **Widened 2026-07-20 (C-7):** `OnboardingDTO` assembly additionally joins `ClientProfile` for `primary_phone`/`address`/`country_of_residence`, resolves `assigned_rm_uid` to a display name, and formats `client_ref` server-side from `user_id`; the `kind="initial"` approve branch additionally computes `agg_before`/`agg_after`/`expected_cash_in` and snapshots them into the `client_allotment_redemptions` insert (C-2).
- **What this layer assumes from the other side:** the DB layer's four tables + two override columns exist with the column names/types in the field-map (`client_onboardings.multiplier` is `Numeric(28,10)`, `client_onboardings.mgmt_fee`/`incentive_fee` and `client_subscriptions.*_override` are `Numeric(9,6)`, matching `Model.mgmt_fee`/`incentive_fee`); `client_allotment_redemptions.source_onboarding_id` is `UNIQUE` (the actual duplicate-allotment guarantee, not this layer's `kind` branch); `client_allotment_redemptions.agg_before`/`agg_after`/`expected_cash_in` columns exist per DB B-3 (widened 2026-07-20); `ClientProfile` carries `primary_phone`/`address`/`country_of_residence`/`assigned_rm_uid` already populated by the existing client-creation path; `get_storage()` and the `models` table are present.
- **Change protocol:** any edit to § 7 requires editing the proposal § 4 first; this section is then re-copied verbatim. The seam is never renegotiated between this doc and a sibling layer doc directly.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Framework / runner:** pytest — `pytest -q` from `api-backend/`.
- **Fixtures / seed:** scratch SQLite/MariaDB DB seeded with one `models` row (with `mgmt_fee`/`incentive_fee` set), one RM `User`+`AdminProfile`, one COMPLIANCE `User`+`AdminProfile`, one PC `User`+`AdminProfile`; onboarding cycles built through `OnboardingService.start`/`upload_document`/`submit` rather than hand-inserted rows wherever the test needs a realistic state.
- **Isolation:** hermetic, one transaction per test, rolled back after; safe to run in parallel.
- **Layer isolation:** BE tests import only `app.libs.onboarding.*`, `app.libs.auth.*`, `app.models.*`, `app.libs.clients.*` (existing, this layer's own dependency), plus test doubles — never Frontend code. Route tests use FastAPI's `TestClient` against the in-process app (this codebase's existing route-test convention, per `012-trade-recon-integration-be.md` § 8.1).
- **Test location:** `api-backend/tests/libs/onboarding/`.
- **Commit policy:** never committed — `tests/` is git-ignored.
- **Code generation:** `test-gen` skill writes the concrete tests from § 8.2/8.3.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| BE-1 | DTOs construct/round-trip against the § 7 shape | none |
| BE-2 | `REQUIRED_DOCS` has 7 entries, all required; `get_doc_spec` raises on unknown key | none |
| BE-3 | `create_cycle` seeds 7 doc rows; `counts()`/`board()`/`compliance_queue()` derive from live rows; `upsert_subscription` updates in place; `due_for_renewal` window filtering | none |
| BE-4 | RM/COMPLIANCE/PC gain exactly the intended action(s); other roles unchanged | none |
| BE-5 | Full cycle walkthrough; all four guard violations return 409; kind-branching (initial vs renewal approve side-effects); fee-override compare-and-set; renewal duplicate-in-flight guard | none — service is tested against the real (test) DB, not a faked seam; Frontend/DB layer code is never imported |
| BE-6 | All 14 routes reachable; RBAC denies cross-role (RM route from a COMPLIANCE token, etc.); client routes reject an admin-portal user and vice versa | none |
| BE-7 | `_trigger_due_renewals` reopens exactly the due client(s); a client already off `"active"` is skipped; non-periodic docs are untouched | mocks `OnboardingService.reopen_for_renewal` is NOT mocked (this unit tests the real call chain) — only the tick's `asyncio.sleep` loop is bypassed by calling `_trigger_due_renewals()` directly |
| BE-8 | App boots with the router mounted and scheduler registered; `/health` unaffected | none |

### 8.3 Test goals

#### BE-1
- **Positive:** each DTO constructs from a hand-built dict matching § 7's field names/types; `model_dump()` round-trips.
- **Negative:** a missing required field raises a Pydantic `ValidationError`.
- **Invariants:** field names never drift from § 7 (a renamed field is a broken contract, caught by the round-trip test itself failing to construct).
- **Seam mocks:** none.

#### BE-2
- **Positive:** `len(REQUIRED_DOCS) == 7`; `REQUIRED_COUNT == 7`; `get_doc_spec("identity_proof").label == "ID / Passport / Proof of Address"`.
- **Negative:** `get_doc_spec("nonexistent")` raises `KeyError`.
- **Invariants:** every `DocSpec.key` is unique across the tuple.
- **Seam mocks:** none.

#### BE-3
- **Positive:** `create_cycle` produces one `ClientOnboarding` + 7 `OnboardingDocument` rows, all `not_started`; `counts()` returns `(verified, required)` matching a hand-seeded mix; `upsert_subscription` called twice for the same `(user_id, model_id)` results in one row with the second call's values; `due_for_renewal(30)` returns a doc with `expires_at` 10 days out and excludes one 60 days out.
- **Negative:** `get_document` for an unknown `doc_type` returns `None`, not an exception (guard logic lives in the service, per layering).
- **Invariants:** `board()`'s four buckets partition every row exactly once (no row in two buckets, no row dropped).
- **Seam mocks:** none.

#### BE-4
- **Positive:** `Action.ONBOARDING_MANAGE in get_actions_for_role(AdminRole.RM)`; `Action.ONBOARDING_REVIEW in get_actions_for_role(AdminRole.COMPLIANCE)`; `Action.ALLOTMENT_ACKNOWLEDGE in get_actions_for_role(AdminRole.PC)`.
- **Negative:** `Action.ONBOARDING_REVIEW not in get_actions_for_role(AdminRole.RM)`; `Action.ONBOARDING_MANAGE not in get_actions_for_role(AdminRole.COMPLIANCE)`.
- **Invariants:** `AdminRole.ADMIN`'s set still equals `set(Action)` after the three new members are added; `AdminRole.MOBO`/`AdminRole.PM`'s existing sets are byte-identical to before this change.
- **Seam mocks:** none.

#### BE-5
- **Positive:** full cycle (`start` → upload × 7 → `submit` → `verdict` × 7 valid → `approve`) leaves exactly one `client_subscriptions` row (correct `multiplier`), one `pending` `client_allotment_redemptions` row (`note="initial allotment"`), `users.status == ACTIVE`, one `client_events` row. Fee-override case: onboarding's `mgmt_fee` differs from `Model.mgmt_fee` → `client_subscriptions.mgmt_fee_override` set to the onboarding's value; matching case → stays `NULL`. **Full-cycle-twice case (proposal Execution & verification § 2):** approve the initial cycle, then call `reopen_for_renewal` directly with a due doc, then approve the resulting `kind="renewal"` cycle — assert `client_allotment_redemptions` still has exactly **one** row for that client (not two), and that `users.status` was never touched by the second approve.
  - **Widened 2026-07-20 (C-2/C-7) — `agg_before`/`agg_after` ordering invariant:** seed two *other* clients already subscribed to the same model (`multiplier` 10 and 15, so a pre-existing `SUM = 25`), then approve a third client's `kind="initial"` onboarding with `units=5` — assert the resulting `client_allotment_redemptions` row has `agg_before == 25` (not `30`) and `agg_after == 30`. This specifically proves the read-before-upsert ordering: a service that (incorrectly) read `agg_before` *after* `upsert_subscription` would get `agg_before == 30`, double-counting the new client's own row — the test must fail against that ordering bug, not just pass against the correct one.
  - **Widened 2026-07-20 (C-7) — `ONBOARDING_SETTLEMENT_DAYS` config override:** with the env var unset, `expected_cash_in` on the approve-produced allotment equals `created_at + timedelta(days=5)` (the default); with `ONBOARDING_SETTLEMENT_DAYS=10` set (via `monkeypatch.setenv` + reloading the module-level constant, or by monkeypatching the constant directly), a fresh approve's `expected_cash_in` equals `created_at + timedelta(days=10)`.
  - **Widened 2026-07-20 (C-7) — `OnboardingDTO` joined/resolved fields:** seed a `ClientProfile` with distinct `primary_phone`/`address`/`country_of_residence` and an RM with an `AdminProfile.name` set; assert `detail(onboarding_id)`'s returned DTO has those three fields plus `assigned_rm` (the RM's `AdminProfile.name`, not the raw `firebase_uid`) and `client_ref` (matches `f"MEGA-{str(user_id).split('-')[0][:4].upper()}"`) populated correctly. A second case with the RM's `AdminProfile.name` unset asserts `assigned_rm` falls back to `User.email`.
- **Negative:** `submit` before all required docs uploaded → 409; `upload_document` on a `verified` doc → 409; `approve` with ≥1 required doc not `verified` → 409; `acknowledge_allotment` on an already-`acknowledged` row → 409; any unknown id (`onboarding_id`/`doc_type`/`allotment_id`) → 404. Directly inserting a second `client_allotment_redemptions` row with the same `source_onboarding_id` at the repository/DB layer raises an `IntegrityError` (proving the DB-enforced guarantee independent of the `kind` branch's own correctness). **Widened 2026-07-20 (C-7) — missing `ClientProfile`:** this should not normally occur, since `start()` delegates client creation to the existing `ClientService.onboard` path which always creates a `ClientProfile` alongside the `User` in the same call — there is no code path in this layer that creates a `client_onboardings` row without one. Treat this as an **invariant**, not a new guard: `display_fields`' `.one()` call (not `.one_or_none()`) is intentionally strict here, matching the existing convention elsewhere in this file (e.g. `_require_onboarding`/`_require_document` raise `HTTPException` for caller-facing lookups, but `display_fields` assumes its own layer's data integrity and lets a `NoResultFound` propagate as a 500 rather than silently returning blank strings) — no new try/except is added for this case.
- **Invariants:** a failed approve (forced exception mid-`_approve_initial`, e.g. via a monkeypatched `Model` lookup raising) leaves `client_subscriptions`, `client_allotment_redemptions`, `users.status`, and `client_events` all unchanged from before the call (rollback is total, not partial).
- **Seam mocks:** none — `OnboardingService` is tested against the real (test) DB and its own real dependencies within this layer; no Frontend/DB-layer code is imported.

#### BE-6
- **Positive:** each of the 14 routes returns its documented success status for a correctly-authorized, correctly-shaped request.
- **Negative:** an RM-token request to a `/compliance/*` route → 403; a COMPLIANCE-token request to a `/rm/*` route → 403; a PC-token request to `/rm/*`/`/compliance/*` → 403; a client-portal user hitting any admin route → 403 (portal check); an admin user hitting `/client/*` → 403 (portal check, reversed).
- **Invariants:** route count is exactly 14 (a route accidentally duplicated or dropped fails this).
- **Seam mocks:** none — uses FastAPI's `TestClient` + dependency-override for auth, following the pattern `tests/libs/auth/` already uses (per `012-trade-recon-integration-be.md` § 8.3 BE-9 precedent).

#### BE-7
- **Positive:** a seeded `active` cycle with a periodic-review doc `expires_at` 10 days out (lookahead 30) → after `_trigger_due_renewals()`, that cycle is `kind="renewal"`, `status="pending_review"`, the doc is `not_started`; a non-periodic doc on the same cycle stays `verified`.
- **Negative:** a doc `expires_at` 60 days out (outside the 30-day lookahead) → cycle untouched; a cycle already `pending_review` (renewal already in flight) → `_trigger_due_renewals()` a second time is a no-op (still exactly one `pending_review` transition logged, not two).
- **Invariants:** `users.status`, `client_subscriptions`, `client_allotment_redemptions` are byte-identical before/after any `_trigger_due_renewals()` call.
- **Seam mocks:** none.

#### BE-8
- **Positive:** importing `app.main` succeeds; `app.openapi()["paths"]` contains all 14 onboarding paths; `GET /health` still returns `{"status": "ok"}`.
- **Negative:** n/a (wiring-only unit).
- **Invariants:** lifespan startup/shutdown cancels exactly three scheduler tasks (allocation_matrix, post_trade_allocation, onboarding) with no exception.
- **Seam mocks:** none.

### 8.4 Aggregate gate
- All unit tests green is a local gate run before commit/PR hand-off.
- Target coverage: ≥ 90% of new/changed statements in `app/libs/onboarding/` and the touched lines in `app/libs/auth/actions.py` / `app/main.py`.
- Chosen `test-gen` level for this layer: `thorough` (the approve state machine's kind-branching, guard combinations, and the duplicate-allotment DB invariant are exactly the edge/ordering logic `thorough` is meant to cover).

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] BE-1 through BE-8 committed on `client-onboarding-integration-be`; each commit left the branch green.
- [ ] § 8 unit tests all pass; CI gate (§ 3.2) green: `ruff check . && ruff format --check . && mypy app && pytest -q`.
- [ ] § 7 matches the proposal's frozen seam verbatim. Checked against the proposal on the parent branch, **not** against the DB/Frontend layers' branches (not visible here).
- [ ] All 14 routes reachable and RBAC-gated per § 6/BE-6.
- [ ] PR opened; human owns the merge to `client-onboarding-integration`.

**Rollback:** reverting the branch removes the entire `app/libs/onboarding/` package, the three new `Action` members, and the router/scheduler wiring in `main.py` — cleanly, since nothing here mutates existing tables' schemas (only new rows in tables the DB layer owns) and no existing route/service is modified. This layer has no persisted state of its own beyond what the DB layer's tables hold — if a client was actually onboarded and activated through this flow before a revert, that data (the `client_subscriptions`/`users.status='active'` rows) is not touched by reverting this layer's code; it remains live data governed by the DB layer's own rollback story (see `013-client-onboarding-integration-db.md` § 9).
