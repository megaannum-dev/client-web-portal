# 018 — Client Portal ↔ Backend Integration · Implementation Details — Backend

> Status: **DRAFT — pending implementation.**
> Implements: proposal `docs/proposals/018-2026-07-28-client-portal-integration.md` § Layer 2 — Backend (structural change A, derivations B, findings C-1…C-14, route-surface decision D, summary table E), plus the Backend-relevant parts of § 3 Non-Goals (including "No `model_limit` authoring logic, API, or admin UI"), § 4 Cross-layer seam, Design decisions D-1…D-10, and § Execution & verification step 2.
> Layer: Backend — **one layer per file.**
> Sibling layer docs:
> - Database — `docs/implementations/018-client-portal-integration-db.md`
> - Frontend (client-frontend) — `docs/implementations/018-client-portal-integration-fe.md`
> - Frontend (admin-frontend) — `docs/implementations/018-client-portal-integration-admin-fe.md`
> Execution schedule: `docs/execution-schedules/018-client-portal-integration-be.md`
> Branch: `client-portal-integration-be` — cut from `client-portal-integration` (the confirmed current branch), merges back into it; the human owns that merge.
> Builds on / prerequisites: the Database layer's migration — new `client_tickets` table, `client_profiles.occupation`, `models.model_limit`, and the `onboarding_documents.expires_at` backfill — revision `a9317a31b484` (`down_revision="fa66b2f3aee6"`), per `docs/implementations/018-client-portal-integration-db.md`. Must be applied to the target DB / merged to `client-portal-integration` before this branch merges.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/018-2026-07-28-client-portal-integration.md` § Layer 2 — Backend, § 3, § 4, Design decisions D-1…D-10, § Execution & verification step 2 |
| Execution schedule | `docs/execution-schedules/018-client-portal-integration-be.md` |
| Sibling layer impl docs | `docs/implementations/018-client-portal-integration-db.md`, `docs/implementations/018-client-portal-integration-fe.md`, `docs/implementations/018-client-portal-integration-admin-fe.md` |
| Builds on | DB layer migration `a9317a31b484` (`down_revision="fa66b2f3aee6"`) — must be applied to the target DB / merged to `client-portal-integration` before this branch's routes can be exercised end-to-end; individual BE-* units that don't touch the new columns/table can still be coded and unit-tested against a mocked repository beforehand |

---

## 2. Branch & session contract

- **Branch:** `client-portal-integration-be`, cut from `client-portal-integration`. All BE-* units in this doc land on this one branch.
- **Isolation:** implementable in a separate session on this branch, in parallel with the DB and both Frontend layers. It shares state with them **only** through the frozen contract in § 7. This layer does not import or wait on any sibling layer's code — DB's ORM/migration additions are consumed as a contract (column names + types from § 7's field-map), never as an actually-present column until the precondition below is met in a real run.
- **Preconditions (must be true before starting):**
  - [ ] The frozen seam in the proposal (§ 4) is agreed — § 7 below is a verbatim copy of it, not a negotiation with a sibling layer.
  - [ ] DB layer migration `a9317a31b484` is applied to the working DB before any unit that reads/writes `client_tickets`, `client_profiles.occupation`, `models.model_limit` (read-only), or a backfilled `onboarding_documents.expires_at` is exercised against a real database (BE-2, BE-3, BE-5, BE-9, BE-10, BE-12, BE-13). Units that only touch existing tables/files (BE-6, BE-7, BE-8, BE-11, BE-14) have no such dependency.
- **Read-first inventory** (every existing file a unit touches — no discovery phase needed):
  - `app/libs/onboarding/service.py` — `OnboardingService.upload_document` (~line 170), `_EDITABLE_STATUSES`/`_CAN_REUPLOAD_STATUSES` (~line 55), `verdict`, `detail`, `_doc_to_dto` (~line 774), `client_subscriptions`/`client_events`, `_client_ref` (~line 792), `ONBOARDING_SETTLEMENT_DAYS` os.getenv convention.
  - `app/libs/onboarding/repository.py` — `set_verdict` (~line 297), `upload_document`, `get_document`, `documents_for`, `get_by_user_id`, `client_folder_name` (~line 264), `_resolve_uid_to_display_name_with_role` (~line 243), `due_for_renewal`, `list_allotments_for_client`, `create_event`.
  - `app/libs/onboarding/schemas.py` — `DocumentDTO` (reused verbatim per D-8), `AllotRdmpStatus`.
  - `app/libs/onboarding/compliance_doc_config.py` — `DocSpec`, `REQUIRED_DOCS`, `get_doc_spec`.
  - `app/libs/onboarding/scheduler.py` — `ONBOARDING_RENEWAL_LOOKAHEAD_DAYS` os.getenv convention (C-8's invariant partner).
  - `app/libs/onboarding/router.py` — existing `/client/subscriptions`, `/client/events` (relocated by BE-1).
  - `app/libs/trade_models/storage.py` — `FileStorage` protocol, `LocalStorage`, `NasStorage`, `get_storage()` (whole file, it's short).
  - `app/libs/trade_models/repository.py`, `router.py` — house per-feature layout (router → service → repository), `ModelRepository`.
  - `app/libs/auth/deps.py` — `get_current_client_user`, `require_action`.
  - `app/libs/auth/actions.py` — `Action.CLIENT_VIEW`, `ROLE_ACTIONS` (RM + ADMIN both carry `CLIENT_VIEW`; ADMIN carries every action).
  - `app/libs/clients/repository.py` — `FULL_VISIBILITY_ROLES = {AdminRole.ADMIN}` scoping pattern (mirrored for `/rm/tickets*`).
  - `app/models/users.py` — `ClientProfile`, `AdminProfile`, `User`.
  - `app/models/pc.py` — `Model`, `ClientSubscription`, `ModelMaterial`, `ModelStatus`.
  - `app/models/post_trade_allocation.py` — `ClientPortfolio`, `ClientPortfolioRunDelta`, `PostTradeAllocationRun`, `PostTradeAllocation`.
  - `app/models/onboarding.py` — `ClientOnboarding`, `OnboardingDocument`, `DocStatus`, `ClientAllotmentRedemption`, `AllotRdmpKind`, `AllotRdmpStatus`, `ClientEvent` (and, once the DB layer lands, `client_tickets`'s ORM class — assumed named `ClientTicket` with `TicketKind`/`TicketStatus` SQLAlchemy enums, following the exact naming convention `ClientOnboarding`/`ClientAllotmentRedemption`/`ClientEvent` already set in this file).
  - `app/core/config.py` — `Settings` (storage settings live here).
  - `app/main.py` — router mounting order, `lifespan()` startup checks (fail-closed pattern already used for `dev_mode`/`firebase_auth_disabled`).
- **Hand-off / exit signal:** all BE-1…BE-14 committed on `client-portal-integration-be`; each commit leaves the branch green (`ruff check`, `ruff format --check`, `mypy app`, `pytest -q`); PR opened against `client-portal-integration`. `app/libs/trade_models/schemas.py` should be untouched by any commit on this branch — per Non-Goals, no `model_limit` field is added to `ModelCreate`/`ModelUpdate`/`ModelOut`.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions

- **Layering:** `router → service → repository → app/models/*`, exactly as `app/libs/onboarding/` and `app/libs/trade_models/` already do. A router function does dependency resolution and response-model wiring only; a service function does every derivation and every cross-cutting guard; a repository function issues exactly one query shape and returns ORM rows or lightweight row tuples, never a DTO.
- **Package layout:** one package per feature area — `router.py` / `service.py` / `repository.py` / `schemas.py` — never a single god-module. New package: `app/libs/client_portal/`.
- **Dependency direction across packages:** `client_portal.service` may import `app.libs.onboarding.service.OnboardingService` and `app.libs.onboarding.repository.OnboardingRepository` (read/delegate, never subclass) and `app.libs.trade_models.storage.get_storage`. Nothing in `app.libs.onboarding` or `app.libs.trade_models` imports `client_portal` — the dependency arrow points one way, same rule the proposal states in § Layer 2 A.
- **DTO naming:** `...DTO` for responses, `...Req`/`...Patch` for request bodies — matches `OnboardingDTO`/`StartOnboardingReq`/`VerdictReq` etc.
- **Enums on the wire:** a `str, Enum` class when the value set is genuinely new to this proposal (`TicketKind`, `TicketStatus`, per proposal § 4.1 — not a `Literal`, matching the proposal's own schema text verbatim); a `Literal[...]` when mirroring an existing SQLAlchemy-enum's value set inline (`KycPanelDTO.overall`, `upload_blocked_reason`), matching `OnboardingStatus`/`DocStatus`'s existing `Literal` convention in `onboarding/schemas.py`.
- **Money/precision:** `Decimal` end-to-end in repository/service; float only at the Pydantic DTO boundary — same convention as `AllotRdmptDTO`/`TransactionDetailDTO`.
- **Settings vs. `os.getenv` constants:** a value that genuinely varies per deployment and has a natural home next to sibling settings goes on `Settings` (`legal_docs_subdir`, `client_statements_subdir`, alongside `storage_root`). A tunable that gates one feature's own runtime behavior and has no other consumer follows the existing bare-module-constant convention (`ONBOARDING_SETTLEMENT_DAYS` in `onboarding/service.py`, `ONBOARDING_RENEWAL_LOOKAHEAD_DAYS` in `onboarding/scheduler.py`) — `CLIENT_UPLOAD_WINDOW_DAYS` follows this second pattern, as a module constant in `client_portal/service.py`.
- **Error envelope:** unchanged — `HTTPException(status_code, "message")`, FastAPI's default `{"detail": "..."}` JSON.
- **Subject resolution:** every `/client/*` route depends on `get_current_client_user` and passes `user.id` into the service; **no route parameter ever names a client, onboarding, or storage path** (C-14). Every `/rm/tickets*` route depends on `require_action(Action.CLIENT_VIEW)` (existing action, already granted to RM and ADMIN) plus a local role lookup, then the service filters by the `assigned_rm_uid` snapshot unless the caller's role is in `FULL_VISIBILITY_ROLES`.

### 3.2 CI/CD & engineering discipline

- **Trunk-friendly, small units.** Each BE-* unit below is one atomic, self-reviewable commit that leaves the branch green. No unit depends on an uncommitted sibling unit landing first unless its "Dependencies" line says so.
- **Every unit is independently revertible.** Reverting BE-12 (tickets) does not break BE-3 (portfolio) — they touch disjoint files apart from the shared `router.py`/`schemas.py`, where each unit's diff is additive.
- **Additive & backward-compatible first.** BE-9 (writing `expires_at` in `set_verdict`) and BE-11 (resolving `uploaded_by`) are value-level changes to existing methods, deployable independently of any new route; the new `client_portal` package is entirely additive alongside the existing `onboarding` and `trade_models` packages.
- **Gates before merge** (must pass in CI, in this order). This repo's `pyproject.toml` configures `[tool.ruff]` (`select = ["E","F","I"]`, line-length 100), `[tool.pytest.ini_options]` (`testpaths = ["app","tests"]`), and `[tool.mypy]` (`files = ["app"]`) — no `[tool.black]`/formatter section, so `ruff format` runs on its built-in defaults:
  ```bash
  ruff check . && ruff format --check . && mypy app && pytest -q
  ```
- **No secrets, no manual steps in the merge path.** Applying the DB migration to a shared DB is a human gate owned by the execution schedule, not baked into a unit here.
- **Reversibility documented** (§ 9): every unit here is additive; nothing in this layer has a lossy down-step of its own (the DB layer's migration is where lossiness lives).

---

## 4. Architecture

**Target layout:**
```
app/libs/client_portal/
  __init__.py
  router.py        # every /client/* route + the 3 /rm/tickets/* routes
  service.py       # all derivations (total_value, amount, notional, monthly bucketing,
                    # KYC-window logic, ticket lifecycle, status maps)
  repository.py     # all SQLAlchemy queries this package owns
  schemas.py        # every DTO in § 7.1

app/libs/onboarding/         # EXTENDED, not restructured
  repository.py     # + set_verdict now writes expires_at (BE-9)
  service.py        # + _doc_to_dto resolves uploaded_by to a display name (BE-11)
  compliance_doc_config.py   # + investment_policy_statement becomes periodic_review=True (BE-8)
  router.py          # − /client/subscriptions, /client/events (relocated to client_portal, BE-1)

app/libs/trade_models/       # EXTENDED, not restructured
  storage.py         # + FileStorage.list() / StoredFile (BE-6)

app/core/config.py   # + legal_docs_subdir, client_statements_subdir (BE-6)
app/main.py           # + mount client_portal router; + startup assertion CLIENT_UPLOAD_WINDOW_DAYS
                       #   <= ONBOARDING_RENEWAL_LOOKAHEAD_DAYS (BE-10)
```

**Dependency direction:** `client_portal.router → client_portal.service → client_portal.repository → app/models/*`. `client_portal.service` additionally calls into `onboarding.service.OnboardingService` (document upload delegation, BE-10) and `onboarding.repository.OnboardingRepository` (reads: `get_by_user_id`, `documents_for`, `get_document`, `client_folder_name`, `list_allotments_for_client`, `create_event`) and `trade_models.storage.get_storage()`. Nothing in `onboarding` or `trade_models` imports `client_portal` — verified by `BE-14`'s import-direction check.

**External seams:**
- **Reads:** `client_portfolios`, `client_portfolio_run_deltas`, `post_trade_allocation_runs`, `post_trade_allocations`, `client_subscriptions`, `models`, `model_materials`, `client_profiles`, `users`, `admin_profiles`, `onboarding_documents` (via `OnboardingRepository`), `client_allotment_redemptions`.
- **Writes:** `client_profiles` (PATCH), `onboarding_documents` (via the unmodified `OnboardingService.upload_document`, plus `expires_at` in the extended `set_verdict`), `client_tickets` (new), `client_events` (one row per ticket raised).
- **Routes exposed:** every route in § 7.1.
- **Depends on:** the DB layer's contract for `client_tickets`, `client_profiles.occupation`, `models.model_limit` (read-only, always `NULL` — see Non-Goals), and a non-`NULL` `onboarding_documents.expires_at` on periodic docs once BE-9 + the DB backfill have both run.

---

## 5. Modules

### 5.1 `client_portal.schemas`
- **Responsibility:** every DTO/request body in § 7.1, verbatim.
- **Files:** `app/libs/client_portal/schemas.py`.
- **Public surface:** all classes in § 7.1 — imported by `router.py`, `service.py`, and by the sibling Frontend layers' type-generation (out of scope here) only as a wire contract, never as a Python import.
- **Owns features:** BE-1 (skeleton), and every DTO referenced by BE-2…BE-13.

### 5.2 `client_portal.repository`
- **Responsibility:** every SQLAlchemy query this package owns — no derivation, no HTTPException.
- **Files:** `app/libs/client_portal/repository.py`.
- **Public surface:** `ClientPortalRepository(db: Session)` — one query method per data shape (positions, portfolio row, history rows, recommended models, material lookup, ticket CRUD, RM contact lookup).
- **Owns features:** BE-3, BE-4 (query halves), BE-5, BE-12, BE-13 (query halves).

### 5.3 `client_portal.service`
- **Responsibility:** every derivation (§ Layer 2 B), every guard, all monthly bucketing, the KYC-window logic, ticket lifecycle, and the delegation into `OnboardingService`/`FileStorage`.
- **Files:** `app/libs/client_portal/service.py`.
- **Public surface:** `ClientPortalService(db: Session)` with one method per route (see § 6).
- **Owns features:** BE-2, BE-3, BE-4, BE-5, BE-7, BE-10, BE-12, BE-13, BE-14.

### 5.4 `client_portal.router`
- **Responsibility:** every route in § 7.1's `/client/*` and `/rm/tickets*` set, plus the two relocated `/client/subscriptions`/`/client/events` routes.
- **Files:** `app/libs/client_portal/router.py`.
- **Public surface:** `router: APIRouter`, mounted in `app/main.py` with `prefix="/api"` (matches every sibling router).
- **Owns features:** BE-1 and the route decorator half of every other unit.

### 5.5 `onboarding` (extended)
- **Responsibility:** unchanged responsibility (client onboarding/renewal state machine); two narrow additions consumed by `client_portal`.
- **Files:** `app/libs/onboarding/repository.py`, `app/libs/onboarding/service.py`, `app/libs/onboarding/compliance_doc_config.py`.
- **Public surface:** unchanged method signatures; `set_verdict` and `_doc_to_dto` change only their internal write/read of `expires_at`/`uploaded_by`.
- **Owns features:** BE-8, BE-9, BE-11.

### 5.6 `trade_models` (extended)
- **Responsibility:** unchanged responsibility (PC model authoring, file storage adapter); one additive surface (`FileStorage.list()`). **`schemas.py` is NOT touched by this layer** — per proposal Non-Goals, `ModelCreate`/`ModelUpdate`/`ModelOut` gain no `model_limit` field; PC model authoring is untouched end to end.
- **Files:** `app/libs/trade_models/storage.py`.
- **Owns features:** BE-6.

### 5.7 `core.config` (extended)
- **Responsibility:** unchanged; two new fields.
- **Files:** `app/core/config.py`.
- **Owns features:** BE-6 (settings half).

---

## 6. Features

### BE-1 — `client_portal` package skeleton + route relocation (Yes / Recommend)

- **Proposal ref:** § Layer 2 A, A′
- **Module:** 5.4 `client_portal.router` (+ 5.1–5.3 skeletons)
- **Files:** create `app/libs/client_portal/{__init__.py,router.py,service.py,repository.py,schemas.py}`; modify `app/libs/onboarding/router.py` (remove the two `/client/*` handlers), `app/main.py` (mount `client_portal_router`, remove nothing else).
- **Dependencies:** none — parallel-safe; every other BE unit adds to the files this unit creates.

**Contract:**
```python
# app/libs/client_portal/router.py
from __future__ import annotations
from typing import Annotated
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.libs.auth.deps import get_current_client_user
from app.libs.client_portal.service import ClientPortalService
from app.libs.onboarding.schemas import ClientEventDTO, SubscriptionDTO
from app.models.users import User

router = APIRouter(tags=["client_portal"])


def _service(db: Annotated[Session, Depends(get_db)]) -> ClientPortalService:
    return ClientPortalService(db)


# ---- relocated unchanged from onboarding/router.py (A'): identical paths ----
@router.get("/client/subscriptions", response_model=list[SubscriptionDTO])
def get_client_subscriptions(
    svc: Annotated[ClientPortalService, Depends(_service)],
    user: Annotated[User, Depends(get_current_client_user)],
) -> list[SubscriptionDTO]:
    return svc.onboarding.client_subscriptions(user.id)


@router.get("/client/events", response_model=list[ClientEventDTO])
def get_client_events(
    svc: Annotated[ClientPortalService, Depends(_service)],
    user: Annotated[User, Depends(get_current_client_user)],
) -> list[ClientEventDTO]:
    return svc.onboarding.client_events(user.id)
```
```python
# app/libs/client_portal/service.py (skeleton — every later unit adds a method)
from __future__ import annotations
from sqlalchemy.orm import Session
from app.libs.client_portal.repository import ClientPortalRepository
from app.libs.onboarding.repository import OnboardingRepository
from app.libs.onboarding.service import OnboardingService


class ClientPortalService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = ClientPortalRepository(db)
        self.onboarding_repo = OnboardingRepository(db)
        self.onboarding = OnboardingService(db)  # C-6/C-7 delegation target
```
```python
# app/main.py — additive lines only
from app.libs.client_portal.router import router as client_portal_router
...
app.include_router(client_portal_router, prefix="/api")
```

**Behavior / invariants:**
- The two relocated routes keep identical paths, response models, and behavior — `client-frontend/lib/api/onboarding.ts` needs no change (proposal's stated "zero wire change" goal).
- `onboarding/router.py` no longer defines `/client/subscriptions`/`/client/events`; the underlying `OnboardingService.client_subscriptions`/`client_events` methods are untouched and still public — `client_portal.service` calls them via `self.onboarding`.
- Registration order in `app/main.py`: `client_portal_router` mounted after `onboarding_router` is irrelevant (disjoint path prefixes going forward), but keep it adjacent to `onboarding_router` in the import block for readability, matching the existing grouping comment style.

**Done when:** `GET /api/client/subscriptions` and `GET /api/client/events` both 200 for a seeded client through the new package; `rg "client/subscriptions|client/events" app/libs/onboarding/router.py` returns nothing.

---

### BE-2 — Client profile GET/PATCH + RM contact (Yes / Yes)

- **Proposal ref:** § 4.1 Profile, C-13; § "Design decisions (settled)" D-11 (why `date_of_birth` is read-only)
- **Module:** 5.1–5.4
- **Files:** modify `app/libs/client_portal/{schemas.py,service.py,repository.py,router.py}`.
- **Dependencies:** BE-1. DB layer's `client_profiles.occupation`/`.date_of_birth` columns (precondition).

**Contract:**
```python
# schemas.py
class RmContactDTO(BaseModel):
    name: str | None
    email: str | None
    phone: str | None


class ClientProfileDTO(BaseModel):
    name: str | None
    email: str | None
    phone: str | None
    occupation: str | None
    date_of_birth: date | None  # read-only — deliberately absent from ClientProfilePatch (D-11)
    address: str | None
    country_of_residence: str | None
    ib_account: str | None
    client_ref: str
    assigned_rm: RmContactDTO | None


class ClientProfilePatch(BaseModel):
    model_config = {"extra": "forbid"}  # 422 if `email`/`phone`/any unknown field is sent
    name: str | None = None
    occupation: str | None = None
    address: str | None = None
    country_of_residence: str | None = None
```
```python
# repository.py
def rm_contact_row(self, rm_uid: str) -> Row | None:
    return (
        self.db.query(User.email, AdminProfile.name, AdminProfile.phone_number)
        .join(AdminProfile, AdminProfile.user_id == User.id)
        .filter(User.firebase_uid == rm_uid)
        .one_or_none()
    )
```
```python
# service.py
def profile(self, user_id: uuid.UUID) -> ClientProfileDTO:
    profile = self.onboarding_repo.db.get(ClientProfile, ...)  # see note below
    ...
    return ClientProfileDTO(
        name=profile.name, email=user.email, phone=profile.primary_phone,
        occupation=profile.occupation, date_of_birth=profile.date_of_birth,
        address=profile.address,
        country_of_residence=profile.country_of_residence, ib_account=profile.ib_account,
        client_ref=OnboardingService._client_ref(user_id),
        assigned_rm=self._rm_contact(profile.assigned_rm_uid),
    )

def update_profile(self, user_id: uuid.UUID, patch: ClientProfilePatch) -> ClientProfileDTO:
    profile = self._require_profile(user_id)
    for field, value in patch.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    self.db.commit()
    return self.profile(user_id)
```
```python
# router.py
@router.get("/client/profile", response_model=ClientProfileDTO)
def get_profile(svc: Annotated[ClientPortalService, Depends(_service)],
                 user: Annotated[User, Depends(get_current_client_user)]) -> ClientProfileDTO:
    return svc.profile(user.id)


@router.patch("/client/profile", response_model=ClientProfileDTO)
def patch_profile(patch: ClientProfilePatch,
                   svc: Annotated[ClientPortalService, Depends(_service)],
                   user: Annotated[User, Depends(get_current_client_user)]) -> ClientProfileDTO:
    return svc.update_profile(user.id, patch)
```

**Behavior / invariants:**
- `email`/`phone`/`date_of_birth` are read-only on the wire; `ClientProfilePatch`'s `extra="forbid"` turns any attempt to send them (or any other unknown key) into a 422 — this is the one deliberate departure from the repo's usual "extra ignored" default, justified because the seam's own comment (§ 4.1) requires it. `date_of_birth`'s read-only-ness is a deliberate compliance decision (D-11), not an oversight: it is the one *new* field in this proposal that joins the read-only set rather than the editable one, because it's an identity fact already verified against a KYC document — letting a client self-edit it after that would bypass re-verification.
- `client_ref` reuses `OnboardingService._client_ref` (a pure `@staticmethod` formatter, no side effects) rather than duplicating the `"MEGA-XXXX"` derivation — a leading-underscore cross-module call, deliberately made because the alternative is copy-pasting the same one-liner into a second package.
- No `company` field anywhere in `ClientProfileDTO`/`ClientProfilePatch` — dropped per DB B-2/D-nothing; there is nothing to migrate away from at the Backend layer because no prior DTO ever carried it.
- `assigned_rm` is `None` (not an empty-string `RmContactDTO`) when `client_profiles.assigned_rm_uid` is `NULL` or the referenced admin row can't be found — the FE renders its existing empty state, per Frontend A-11.

**Done when:** `GET /client/profile` returns real values including `date_of_birth` and a resolved `assigned_rm` for a seeded client with an RM, and `None` for one without; `PATCH` with `{"email": "x"}` or `{"date_of_birth": "1990-01-01"}` both return 422; a successful `PATCH` of the editable fields persists and round-trips, and never alters `date_of_birth`.

---

### BE-3 — Portfolio GET (Yes — user req.)

- **Proposal ref:** § 4.1 Portfolio, § Layer 2 B (rows 1–3), C-1
- **Module:** 5.1–5.4
- **Files:** modify `app/libs/client_portal/{schemas.py,service.py,repository.py,router.py}`.
- **Dependencies:** BE-1. DB layer's `models.model_limit` column (precondition — `PositionDTO.model_limit` reads `NULL` until then, not an error).

**Contract:**
```python
# schemas.py
class PositionDTO(BaseModel):
    model_id: uuid.UUID
    model_name: str
    units: float
    amount: float
    model_limit: float | None
    ib_account: str | None


class PortfolioDTO(BaseModel):
    cash_deposit: float
    amount_in_trade: float
    previous_amount_in_trade: float
    total_value: float
    change_amount: float
    change_pct: float | None
    updated_at: datetime | None
    positions: list[PositionDTO]
```
```python
# repository.py
def get_portfolio(self, user_id: uuid.UUID) -> ClientPortfolio | None:
    return self.db.get(ClientPortfolio, user_id)  # DB B-3: may be None


def positions_for_client(self, user_id: uuid.UUID) -> list[tuple[ClientSubscription, Model]]:
    return (
        self.db.query(ClientSubscription, Model)
        .join(Model, Model.id == ClientSubscription.model_id)
        .filter(ClientSubscription.user_id == user_id)
        .order_by(Model.name)  # § 4.1: "name-sorted"
        .all()
    )
```
```python
# service.py
def portfolio(self, user_id: uuid.UUID) -> PortfolioDTO:
    row = self.repo.get_portfolio(user_id)
    profile = self._require_profile(user_id)
    ib_account = profile.ib_account

    cash_deposit = row.cash_deposit if row else Decimal("0")
    amount_in_trade = row.amount_in_trade if row else Decimal("0")
    previous = row.previous_amount_in_trade if row else Decimal("0")
    change_amount = amount_in_trade - previous
    change_pct = float(change_amount / previous) if previous != 0 else None

    positions = [
        PositionDTO(
            model_id=model.id,
            model_name=model.name,
            units=float(sub.multiplier),
            amount=float(sub.multiplier * (model.model_size or Decimal("0"))),
            model_limit=float(model.model_limit) if model.model_limit is not None else None,
            ib_account=ib_account,
        )
        for sub, model in self.repo.positions_for_client(user_id)
    ]
    return PortfolioDTO(
        cash_deposit=float(cash_deposit),
        amount_in_trade=float(amount_in_trade),
        previous_amount_in_trade=float(previous),
        total_value=float(cash_deposit + amount_in_trade),
        change_amount=float(change_amount),
        change_pct=change_pct,
        updated_at=row.updated_at if row else None,
        positions=positions,
    )
```

**Behavior / invariants:**
- A missing `client_portfolios` row (DB B-3 — pre-014 clients) **never 404s**: every balance field reads as `0`, `updated_at` as `None`, `change_pct` as `None` (division guarded the same way a genuine `previous == 0` would be). This is the one invariant every unit touching `ClientPortfolio` must uphold.
- `amount` is derived, never stored: `multiplier * model_size`, matching `AllotRdmptDTO.amount`'s existing formula exactly (same Decimal precision, `Numeric(28,10)` both sides).
- `ib_account` repeats the same per-client value on every `PositionDTO` row (memory `pc-ib-account-per-client`) — not a bug, an intentional per-row echo of a per-client fact.

**Done when:** a client with a portfolio row and 2 subscriptions gets a `PortfolioDTO` with 2 name-sorted positions and correct `total_value`/`change_pct`; a client with no portfolio row gets all-zero balances and an empty-or-populated `positions` list with no exception.

---

### BE-4 — Portfolio history GET (calendar-month bucketing) (Yes — user req. / D-10)

- **Proposal ref:** § 4.1 Portfolio, § Layer 2 B (rows 4–5), D-10
- **Module:** 5.1–5.4
- **Files:** modify `app/libs/client_portal/{schemas.py,service.py,repository.py,router.py}`.
- **Dependencies:** BE-1, BE-3 (shares `positions_for_client`'s model-join pattern, not code).

**Contract:**
```python
# schemas.py
class HistoryPointDTO(BaseModel):
    month: str  # "YYYY-MM"
    total: float
    per_model: dict[str, float]
```
```python
# repository.py
def history_delta_rows(self, user_id: uuid.UUID) -> list[tuple[str, Decimal]]:
    """(month "YYYYMM", delta) for every client_portfolio_run_deltas row of this
    client, oldest first. No date parsing: substr() on the existing YYYYMMDD token."""
    month = func.substr(PostTradeAllocationRun.trade_date, 1, 6)
    rows = (
        self.db.query(month.label("month"), ClientPortfolioRunDelta.delta)
        .join(PostTradeAllocationRun, PostTradeAllocationRun.id == ClientPortfolioRunDelta.run_id)
        .filter(ClientPortfolioRunDelta.user_id == user_id)
        .order_by(PostTradeAllocationRun.trade_date.asc())
        .all()
    )
    return [(r.month, r.delta) for r in rows]


def history_per_model_rows(self, user_id: uuid.UUID) -> list[tuple[str, str, Decimal]]:
    """(month, model_name, allocated) for every post_trade_allocations row of
    this client, oldest first."""
    month = func.substr(PostTradeAllocationRun.trade_date, 1, 6)
    rows = (
        self.db.query(month.label("month"), PostTradeAllocation.model_name, PostTradeAllocation.allocated)
        .join(PostTradeAllocationRun, PostTradeAllocationRun.id == PostTradeAllocation.run_id)
        .filter(PostTradeAllocation.user_id == user_id)
        .order_by(PostTradeAllocationRun.trade_date.asc())
        .all()
    )
    return [(r.month, r.model_name, r.allocated) for r in rows]
```
```python
# service.py
def _month_key(dt: date) -> str:
    return dt.strftime("%Y%m")


def _month_range(end: str, count: int) -> list[str]:
    """`count` calendar-month keys ("YYYYMM") ending at `end` inclusive, oldest first."""
    y, m = int(end[:4]), int(end[4:6])
    months = []
    for _ in range(count):
        months.append(f"{y:04d}{m:02d}")
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    return list(reversed(months))


def portfolio_history(self, user_id: uuid.UUID, months: int) -> list[HistoryPointDTO]:
    window = _month_range(_month_key(datetime.utcnow().date()), months)
    window_start = window[0]

    total_rows = self.repo.history_delta_rows(user_id)
    model_rows = self.repo.history_per_model_rows(user_id)
    model_names = sorted({name for _, name, _ in model_rows})

    # cumulative BEFORE the window — makes the first point's total correct,
    # not a partial sum starting from zero (proposal § Layer 2 B).
    total_before = sum((d for mo, d in total_rows if mo < window_start), Decimal("0"))
    per_model_before: dict[str, Decimal] = {n: Decimal("0") for n in model_names}
    for mo, name, amt in model_rows:
        if mo < window_start:
            per_model_before[name] += amt

    by_month_total: dict[str, Decimal] = defaultdict(Decimal)
    for mo, d in total_rows:
        if mo in window:
            by_month_total[mo] += d
    by_month_model: dict[str, dict[str, Decimal]] = defaultdict(lambda: defaultdict(Decimal))
    for mo, name, amt in model_rows:
        if mo in window:
            by_month_model[mo][name] += amt

    points: list[HistoryPointDTO] = []
    running_total = total_before
    running_model = dict(per_model_before)
    for mo in window:
        running_total += by_month_total.get(mo, Decimal("0"))
        for name in model_names:
            running_model[name] += by_month_model.get(mo, {}).get(name, Decimal("0"))
        points.append(
            HistoryPointDTO(
                month=f"{mo[:4]}-{mo[4:]}",
                total=float(running_total),
                per_model={n: float(v) for n, v in running_model.items()},
            )
        )
    return points
```
```python
# router.py
@router.get("/client/portfolio/history", response_model=list[HistoryPointDTO])
def get_portfolio_history(
    svc: Annotated[ClientPortalService, Depends(_service)],
    user: Annotated[User, Depends(get_current_client_user)],
    months: int = 6,
) -> list[HistoryPointDTO]:
    if not (1 <= months <= 24):
        raise HTTPException(422, "months must be between 1 and 24")
    return svc.portfolio_history(user.id, months)
```

**Behavior / invariants:**
- Bucket key is `substr(trade_date, 1, 6)` — no date parsing, no timezone question, sorts lexically in calendar order, per D-10.
- Two runs landing in the same calendar month collapse into one point (`GROUP BY` happens in Python over the pre-sorted rows via the `by_month_*` dict accumulation, which is equivalent to a SQL `GROUP BY month`).
- A month inside the window with zero rows still appears as one point, carrying the previous cumulative forward (the `.get(mo, Decimal("0"))` default adds nothing, so `running_total`/`running_model` don't change that iteration but the point is still emitted).
- The first point's cumulative includes every run *before* the window (`total_before`/`per_model_before`), not a partial sum starting at zero.
- `months=1` and `months=24` both return exactly that many points — `_month_range` always returns `count` entries by construction.
- `ponytail:` the `GROUP BY substr(...)` will not use `ix_post_trade_allocation_runs_trade_date`; a single client's row count is in the hundreds at most today, so this is an acceptably small full scan. Upgrade path if it ever shows up in a trace: a `month` column or a materialised monthly rollup — not before then.

**Done when:** the coverage matrix's monthly-bucketing edge cases (§ 8.2) all pass against a seeded fixture with runs spanning >6 months, including one month with two runs and one month with zero runs inside the window.

---

### BE-5 — Recommended models GET + material download (Yes)

- **Proposal ref:** § 4.1 Models, C-2
- **Module:** 5.1–5.4
- **Files:** modify `app/libs/client_portal/{schemas.py,service.py,repository.py,router.py}`.
- **Dependencies:** BE-1, BE-3 (`positions_for_client` supplies the subscribed-id exclusion set). DB layer's `models.model_limit` column.

**Contract:**
```python
# schemas.py
class RecommendedModelDTO(BaseModel):
    model_id: uuid.UUID
    name: str
    category: list[str] | None
    model_limit: float | None
    subscription_redemption: str | None
    description: str | None
    has_material: bool
```
```python
# repository.py
def recommended_models(self, exclude_ids: set[uuid.UUID]) -> list[Model]:
    q = self.db.query(Model).filter(Model.status == ModelStatus.LIVE)
    if exclude_ids:
        q = q.filter(~Model.id.in_(exclude_ids))
    return q.order_by(Model.name).all()


def has_material(self, model_id: uuid.UUID) -> bool:
    return self.db.query(
        exists().where(ModelMaterial.model_id == model_id)
    ).scalar()


def latest_material(self, model_id: uuid.UUID) -> ModelMaterial | None:
    return (
        self.db.query(ModelMaterial)
        .filter(ModelMaterial.model_id == model_id)
        .order_by(ModelMaterial.version_no.desc())
        .first()
    )
```
```python
# service.py
def recommended_models(self, user_id: uuid.UUID) -> list[RecommendedModelDTO]:
    subscribed_ids = {m.id for _, m in self.repo.positions_for_client(user_id)}
    return [
        RecommendedModelDTO(
            model_id=m.id, name=m.name, category=m.category,
            model_limit=float(m.model_limit) if m.model_limit is not None else None,
            subscription_redemption=m.subscription_redemption,
            description=m.description,
            has_material=self.repo.has_material(m.id),
        )
        for m in self.repo.recommended_models(subscribed_ids)
    ]


def model_material_stream(self, model_id: uuid.UUID) -> tuple[BinaryIO, str, str | None]:
    material = self.repo.latest_material(model_id)
    if material is None or material.storage_key is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No material uploaded for this model")
    return get_storage().open(material.storage_key), material.filename, material.content_type
```
```python
# router.py
@router.get("/client/models/recommended", response_model=list[RecommendedModelDTO])
def get_recommended_models(svc: Annotated[ClientPortalService, Depends(_service)],
                            user: Annotated[User, Depends(get_current_client_user)]) -> list[RecommendedModelDTO]:
    return svc.recommended_models(user.id)


@router.get("/client/models/{model_id}/material")
def download_model_material(model_id: uuid.UUID,
                              svc: Annotated[ClientPortalService, Depends(_service)],
                              _: Annotated[User, Depends(get_current_client_user)]) -> StreamingResponse:
    stream, filename, content_type = svc.model_material_stream(model_id)
    return StreamingResponse(stream, media_type=content_type or "application/octet-stream",
                              headers={"Content-Disposition": f'attachment; filename="{filename}"'})
```

**Behavior / invariants:**
- `category` is carried through as-is (`models.category`, a real JSON column) — no `country`/`sector`/`risk_level`/`min_investment` field exists anywhere on this DTO.
- `model_limit` reads `models.model_limit` directly, never derives it from `model_size` — the two are unrelated columns (D-9).
- `has_material` is a correlated `EXISTS`, not a count — cheap regardless of how many material versions a model accumulates.
- Material download streams the **highest `version_no`** row; a model with zero materials 404s and the FE hides the download affordance (`has_material == false`).

**Done when:** a client subscribed to model A sees every LIVE model except A in the recommended list; a model with an uploaded material downloads its latest version; a model with none 404s.

---

### BE-6 — `FileStorage.list()` + storage settings (Yes)

- **Proposal ref:** § Layer 2 C-3, D-7
- **Module:** 5.6 `trade_models` (extended)
- **Files:** modify `app/libs/trade_models/storage.py`, `app/core/config.py`.
- **Dependencies:** none — parallel-safe with every other unit; consumed by BE-7.

**Contract:**
```python
# app/libs/trade_models/storage.py
from typing import NamedTuple


class StoredFile(NamedTuple):
    key: str
    filename: str
    size_bytes: int | None
    modified_at: datetime | None
    category: str | None  # immediate sub-folder name; None at the listed dir's own root


class FileStorage(Protocol):
    def save(self, stream: BinaryIO, *, suggested_name: str,
              content_type: str | None = None, subdir: str | None = None) -> str: ...
    def open(self, storage_key: str) -> BinaryIO: ...
    def list(self, subdir: str) -> list[StoredFile]:
        """Enumerate files under `subdir`, one level deep. Never raises for a
        missing directory — returns []."""
        ...


class LocalStorage:
    ...
    def list(self, subdir: str) -> list[StoredFile]:
        base = self._root / subdir
        if not base.is_dir():
            return []
        out: list[StoredFile] = []
        for entry in base.iterdir():
            if entry.is_file():
                stat = entry.stat()
                out.append(StoredFile(
                    key=f"{subdir}/{entry.name}", filename=entry.name,
                    size_bytes=stat.st_size,
                    modified_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
                    category=None,
                ))
            elif entry.is_dir():
                for child in entry.iterdir():
                    if child.is_file():
                        stat = child.stat()
                        out.append(StoredFile(
                            key=f"{subdir}/{entry.name}/{child.name}", filename=child.name,
                            size_bytes=stat.st_size,
                            modified_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
                            category=entry.name,
                        ))
        return sorted(out, key=lambda f: f.modified_at or datetime.min.replace(tzinfo=timezone.utc), reverse=True)


class NasStorage:
    ...
    def list(self, subdir: str) -> list[StoredFile]:
        raise NotImplementedError("NasStorage is not yet configured")
```
```python
# app/core/config.py — additive fields on Settings, alongside storage_root
legal_docs_subdir: str = "legal_docs"
client_statements_subdir: str = "client_statements"
```

**Behavior / invariants:**
- `list()` never raises for a not-yet-created directory (empty statements folder on day one, per D-7) — returns `[]`.
- One level deep only: a file directly under `subdir` gets `category=None`; a file under one immediate child folder gets `category=<folder name>`; nothing deeper is walked (matches the legal-docs "grouped by category" shape and the statements "flat per client" shape).
- Newest-first by `modified_at` — the FAB's "download latest statement" (Frontend A-6) is `list[0]`.
- `NasStorage.list()` raises `NotImplementedError`, same as its siblings — no NAS work happens in this proposal.

**Done when:** `LocalStorage(...).list("legal_docs")` against a directory with 2 sub-folders and 3 files returns 3 `StoredFile`s with correct `category`; `list("nonexistent")` returns `[]`, not an exception.

---

### BE-7 — Document listing + allow-listed download (Yes / MANDATORY)

- **Proposal ref:** § 4.1 Documents, C-3, C-4, D-7
- **Module:** 5.1–5.4
- **Files:** modify `app/libs/client_portal/{schemas.py,service.py,router.py}`.
- **Dependencies:** BE-6.

**Contract:**
```python
# schemas.py
class StoredFileDTO(BaseModel):
    key: str
    filename: str
    size_bytes: int | None
    modified_at: datetime | None
    category: str | None
    period: str | None
```
```python
# service.py
_PERIOD_RE = re.compile(r"^(\d{4}-\d{2})[_-]")
_SCOPES = {"legal", "statements"}


def _scope_subdir(self, scope: str, user_id: uuid.UUID) -> str:
    if scope not in _SCOPES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown scope: {scope!r}")
    if scope == "legal":
        return self._settings.legal_docs_subdir
    onboarding = self.onboarding_repo.get_by_user_id(user_id)
    if onboarding is None:
        return f"{self._settings.client_statements_subdir}/__no_cycle__"  # lists as empty
    folder = self.onboarding_repo.client_folder_name(onboarding)
    return f"{self._settings.client_statements_subdir}/{folder}"


def list_documents(self, scope: str, *, user_id: uuid.UUID) -> list[StoredFileDTO]:
    subdir = self._scope_subdir(scope, user_id)
    return [self._to_stored_file_dto(f, scope) for f in get_storage().list(subdir)]


def download_document(self, scope: str, key: str, *, user_id: uuid.UUID) -> tuple[BinaryIO, str, str | None]:
    subdir = self._scope_subdir(scope, user_id)
    listing = get_storage().list(subdir)  # MANDATORY (C-4): re-list, don't trust the key string
    match = next((f for f in listing if f.key == key), None)
    if match is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized for this document")
    return get_storage().open(match.key), match.filename, None


def _to_stored_file_dto(self, f: StoredFile, scope: str) -> StoredFileDTO:
    period = None
    if scope == "statements":
        m = _PERIOD_RE.match(f.filename)
        period = m.group(1) if m else None
    return StoredFileDTO(key=f.key, filename=f.filename, size_bytes=f.size_bytes,
                          modified_at=f.modified_at,
                          category=f.category if scope == "legal" else None, period=period)
```
```python
# router.py
@router.get("/client/documents/{scope}", response_model=list[StoredFileDTO])
def list_client_documents(scope: str, svc: Annotated[ClientPortalService, Depends(_service)],
                            user: Annotated[User, Depends(get_current_client_user)]) -> list[StoredFileDTO]:
    return svc.list_documents(scope, user_id=user.id)


@router.get("/client/documents/{scope}/download")
def download_client_document(scope: str, key: str,
                               svc: Annotated[ClientPortalService, Depends(_service)],
                               user: Annotated[User, Depends(get_current_client_user)]) -> StreamingResponse:
    stream, filename, content_type = svc.download_document(scope, key, user_id=user.id)
    return StreamingResponse(stream, media_type=content_type or "application/octet-stream",
                              headers={"Content-Disposition": f'attachment; filename="{filename}"'})
```

**Behavior / invariants:**
- **C-4 (MANDATORY): the download route never opens `key` directly.** It re-lists the resolved directory *for this caller* and requires `key` to be a literal member of that listing. A `../../etc/passwd`-shaped key is not a member of any real listing → 403. A key that names a real file in a **different** client's statements folder is not a member of *this* caller's resolved subdir (which is scoped to `client_folder_name(this caller's onboarding)`) → 403, even though the same key string might be a valid member of the other client's own listing.
- `scope` outside `{"legal", "statements"}` → 422 on both routes.
- `statements` for a client with no onboarding cycle at all resolves to a subdir that never exists on disk → `list()` returns `[]` (BE-6's empty-directory guarantee), not an error; this is a deliberately degenerate but safe path, not expected to occur in practice (every client has an onboarding cycle by construction of `start()`).
- `period` is parsed only for `scope="statements"`; `category` only for `scope="legal"` — the two scopes never populate each other's optional field.

**Done when:** legal listing groups by immediate sub-folder via `category`; statements listing parses a leading `YYYY-MM` token when present and `None` otherwise; a download with a path-traversal key or another client's real key both return 403; a valid key streams the file.

---

### BE-8 — IPS becomes a periodic-review document (Yes — user req.)

- **Proposal ref:** § Layer 2 C-5
- **Module:** 5.5 `onboarding` (extended)
- **Files:** modify `app/libs/onboarding/compliance_doc_config.py`.
- **Dependencies:** none — parallel-safe. BE-9 depends on this (there is nothing to write `expires_at` for otherwise).

**Contract:**
```python
DocSpec(
    key="investment_policy_statement",
    label="Investment Policy Statement",
    required=True,
    periodic_review=True,       # was False
    review_interval_days=365,   # was unset
),
```

**Behavior / invariants:**
- The other six `DocSpec` entries are byte-for-byte unchanged — `required` is unchanged for all seven, so `REQUIRED_COUNT` does not move and no onboarding cycle changes shape.
- No `client_supporting` (or any new) `DocSpec` is added — the Supporting Documents surface is shelved (D-5), not built here.

**Done when:** `get_doc_spec("investment_policy_statement").periodic_review is True` and `.review_interval_days == 365`; `REQUIRED_COUNT` is unchanged from before this unit.

---

### BE-9 — `set_verdict` writes `expires_at` for periodic docs (MANDATORY)

- **Proposal ref:** § Layer 2 C-6
- **Module:** 5.5 `onboarding` (extended)
- **Files:** modify `app/libs/onboarding/repository.py` (`set_verdict`, ~line 297).
- **Dependencies:** BE-8 (there must be a `periodic_review=True` spec for this to ever fire in practice, though the code is generically correct for any such spec).

**Contract — the existing method, current body:**
```python
def set_verdict(
    self, doc: OnboardingDocument, *, status: DocStatus, reviewed_by: str, note: str | None
) -> None:
    doc.status = status
    doc.reviewed_by = reviewed_by
    doc.reviewed_at = datetime.utcnow()
    doc.issue_note = note
```
**New body (the only change in this unit):**
```python
def set_verdict(
    self, doc: OnboardingDocument, *, status: DocStatus, reviewed_by: str, note: str | None
) -> None:
    doc.status = status
    doc.reviewed_by = reviewed_by
    doc.reviewed_at = datetime.utcnow()
    doc.issue_note = note
    if status == DocStatus.VERIFIED:
        spec = get_doc_spec(doc.doc_type)
        if spec.periodic_review:
            assert spec.review_interval_days is not None  # DocSpec invariant, not runtime input
            doc.expires_at = doc.reviewed_at + timedelta(days=spec.review_interval_days)
    # REJECTED (or any other non-VERIFIED verdict): expires_at is left untouched —
    # a rejection is not a review clock (Backend C-6).
```
(Requires `from app.libs.onboarding.compliance_doc_config import get_doc_spec` added to this file's imports — it is already imported by `service.py`, not yet by `repository.py`.)

**Behavior / invariants:**
- Fires only on `status == VERIFIED`. A `REJECTED` verdict never sets or clears `expires_at`.
- Every other line of `set_verdict`, every caller (`OnboardingService.verdict`), and every route that reaches it (`POST /compliance/onboardings/{id}/documents/{doc_type}/verdict`) is unchanged — this is a 4-line addition to one existing method, not a new code path.
- This fills a column that is `NULL` on 100% of rows before this unit ships (per DB B-4's own audit), so no existing behavior can depend on its prior value — safe to deploy ahead of, with, or after the DB layer's one-off backfill.

**Done when:** verifying a periodic doc sets `expires_at` to exactly `reviewed_at + review_interval_days`; verifying a non-periodic doc leaves `expires_at` `NULL`; rejecting any doc leaves `expires_at` untouched in either direction; the existing `tests/libs/onboarding/` suite (§ 8.2's mandatory regression goal) passes unchanged.

---

### BE-10 — Client KYC panel GET + renewal upload POST + 14-day window (Yes — user req. / MANDATORY invariant)

- **Proposal ref:** § 4.1 Documents, C-7, C-8, C-9, D-6, D-8
- **Module:** 5.1–5.4 (calls into 5.5 `onboarding`, unmodified)
- **Files:** modify `app/libs/client_portal/{schemas.py,service.py,router.py}`, `app/main.py` (startup assertion).
- **Dependencies:** BE-8, BE-9 (there must be a periodic doc with a real `expires_at` for the window to ever open).

**Contract:**
```python
# schemas.py
class KycPanelDTO(BaseModel):
    overall: Literal["due", "processing", "verified"]
    documents: list[DocumentDTO]  # imported from app.libs.onboarding.schemas — D-8, reused verbatim
    next_review_at: datetime | None
    renewal_doc_type: str | None
    upload_opens_at: datetime | None
    can_upload: bool
    upload_blocked_reason: Literal[
        "window_not_open", "in_review", "cycle_not_editable", "no_cycle"
    ] | None
```
```python
# service.py
import os
from app.libs.onboarding.service import _EDITABLE_STATUSES, _CAN_REUPLOAD_STATUSES

# Same os.getenv convention as ONBOARDING_RENEWAL_LOOKAHEAD_DAYS (scheduler.py) /
# ONBOARDING_SETTLEMENT_DAYS (onboarding/service.py).
CLIENT_UPLOAD_WINDOW_DAYS = max(0, int(os.getenv("CLIENT_UPLOAD_WINDOW_DAYS", "14")))

_PERIODIC_DOC_TYPES = {d.key for d in REQUIRED_DOCS if d.periodic_review}  # exactly one today


def assert_upload_window_valid() -> None:
    """Startup check (C-8's invariant): the client window must never exceed the
    scheduler's own reopen lookahead, or a client could be offered an upload
    before the cycle is even reopened for it."""
    from app.libs.onboarding.scheduler import _RENEWAL_LOOKAHEAD_DAYS
    assert CLIENT_UPLOAD_WINDOW_DAYS <= _RENEWAL_LOOKAHEAD_DAYS, (
        f"CLIENT_UPLOAD_WINDOW_DAYS ({CLIENT_UPLOAD_WINDOW_DAYS}) must be <= "
        f"ONBOARDING_RENEWAL_LOOKAHEAD_DAYS ({_RENEWAL_LOOKAHEAD_DAYS})"
    )


class ClientPortalService:
    ...
    def _renewal_window(
        self, onboarding: ClientOnboarding, doc: OnboardingDocument | None
    ) -> tuple[datetime | None, bool, str | None]:
        """Read-only mirror of upload_document's own guards (C-9) — this
        function's answer and that route's 403/409 must never disagree."""
        if doc is None or doc.expires_at is None:
            return None, False, "no_cycle"
        opens_at = doc.expires_at - timedelta(days=CLIENT_UPLOAD_WINDOW_DAYS)
        if onboarding.status not in _EDITABLE_STATUSES:
            return opens_at, False, "cycle_not_editable"
        if doc.status not in _CAN_REUPLOAD_STATUSES:
            return opens_at, False, "in_review"
        if datetime.utcnow() < opens_at:
            return opens_at, False, "window_not_open"
        return opens_at, True, None

    def kyc_panel(self, user_id: uuid.UUID) -> KycPanelDTO:
        onboarding = self.onboarding_repo.get_by_user_id(user_id)
        if onboarding is None:
            return KycPanelDTO(overall="due", documents=[], next_review_at=None,
                                renewal_doc_type=None, upload_opens_at=None,
                                can_upload=False, upload_blocked_reason="no_cycle")
        documents = self.onboarding.detail(onboarding.id).documents  # public method, D-8 reuse
        periodic_doc = next(
            (d for d in self.onboarding_repo.documents_for(onboarding.id)
             if d.doc_type in _PERIODIC_DOC_TYPES), None,
        )
        opens_at, can_upload, reason = self._renewal_window(onboarding, periodic_doc)
        return KycPanelDTO(
            overall=self._overall_status(documents),
            documents=documents,
            next_review_at=periodic_doc.expires_at if periodic_doc else None,
            renewal_doc_type=periodic_doc.doc_type if periodic_doc else None,
            upload_opens_at=opens_at, can_upload=can_upload, upload_blocked_reason=reason,
        )

    @staticmethod
    def _overall_status(documents: list[DocumentDTO]) -> Literal["due", "processing", "verified"]:
        required = [d for d in documents if d.required]
        if required and all(d.status == "verified" for d in required):
            return "verified"
        if any(d.status in ("uploaded", "in_review") for d in required) and not any(
            d.status in ("rejected", "expired") for d in required
        ):
            return "processing"
        return "due"

    def upload_renewal_document(
        self, user_id: uuid.UUID, doc_type: str, *, stream: BinaryIO,
        filename: str, content_type: str | None, caller_uid: str,
    ) -> DocumentDTO:
        if doc_type not in _PERIODIC_DOC_TYPES:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                                 "This document does not accept a client-initiated renewal upload")
        onboarding = self.onboarding_repo.get_by_user_id(user_id)
        if onboarding is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "No onboarding cycle")
        doc = self.onboarding_repo.get_document(onboarding.id, doc_type)
        _, can_upload, reason = self._renewal_window(onboarding, doc)
        if not can_upload:
            raise HTTPException(status.HTTP_403_FORBIDDEN, reason or "window_not_open")
        # Delegates to the EXISTING, UNMODIFIED method — its own 409 guards still
        # apply underneath this route's own 403 (Backend C-7).
        return self.onboarding.upload_document(
            onboarding.id, doc_type, stream=stream, filename=filename,
            content_type=content_type, caller_uid=caller_uid,
        )
```
```python
# router.py
@router.get("/client/kyc", response_model=KycPanelDTO)
def get_kyc_panel(svc: Annotated[ClientPortalService, Depends(_service)],
                    user: Annotated[User, Depends(get_current_client_user)]) -> KycPanelDTO:
    return svc.kyc_panel(user.id)


@router.post("/client/kyc/{doc_type}", response_model=DocumentDTO)
async def upload_kyc_document(doc_type: str, svc: Annotated[ClientPortalService, Depends(_service)],
                                user: Annotated[User, Depends(get_current_client_user)],
                                file: UploadFile = File(...)) -> DocumentDTO:
    return svc.upload_renewal_document(user.id, doc_type, stream=file.file,
                                         filename=file.filename or doc_type,
                                         content_type=file.content_type, caller_uid=user.firebase_uid)
```
```python
# app/main.py — inside lifespan(), alongside the existing dev_mode/firebase_auth_disabled fail-closed check
from app.libs.client_portal.service import assert_upload_window_valid
...
assert_upload_window_valid()
```

**Behavior / invariants:**
- The route adds exactly two guards beyond the delegated method: `doc_type` must name a periodic spec (422), and the window must be open per `_renewal_window` (403). Every other guard — cycle-editable, doc-reuploadable, storage path, row mutation — lives in `OnboardingService.upload_document`/`OnboardingRepository.upload_document`, untouched.
- `_renewal_window` is a read-only evaluation of the **same two predicates** `upload_document` itself checks (`_EDITABLE_STATUSES`, `_CAN_REUPLOAD_STATUSES`), so `can_upload` on the GET and the 403/409 outcome on the POST cannot disagree except under a genuine race between the two calls — in which case the POST's own 409 (from the shared method) still fires correctly.
- `expires_at is None` (never verified) ⇒ `no_cycle`-shaped closed window — the initial onboarding pack stays RM-driven, never client-uploadable, matching C-7's "clients upload renewals, not the initial pack" rule.
- Startup assertion: `CLIENT_UPLOAD_WINDOW_DAYS <= ONBOARDING_RENEWAL_LOOKAHEAD_DAYS`. Raised as a plain `AssertionError` at process start (same fail-closed idiom `app/main.py`'s `lifespan()` already uses for the `dev_mode`/`app_env` check) — never silently discovered in production.

**Done when:** the § 8.2 renewal-path test set (client upload 403 at 15 days, 200 at 13; non-periodic `doc_type` 422; verified row shape identical to an RM upload) all pass; the startup assertion fails fast when `CLIENT_UPLOAD_WINDOW_DAYS` is misconfigured above the lookahead.

---

### BE-11 — `uploaded_by` resolves to a display name (Yes)

- **Proposal ref:** § Layer 2 C-10
- **Module:** 5.5 `onboarding` (extended)
- **Files:** modify `app/libs/onboarding/service.py` (`_doc_to_dto`, ~line 774).
- **Dependencies:** none — parallel-safe. Its "(client)" suffix only becomes visible once BE-10's upload path exists, but the resolution logic itself is correct today for RM uploads too.

**Contract — current line:**
```python
uploaded_by=self.repo._resolve_uid_to_display_name_with_role(doc.uploaded_by),
```
**New:**
```python
def _doc_to_dto(self, doc: OnboardingDocument) -> DocumentDTO:
    spec = get_doc_spec(doc.doc_type)
    onboarding = self.repo.get_by_id(doc.onboarding_id)
    uploaded_by = self.repo._resolve_uid_to_display_name_with_role(doc.uploaded_by)
    if (
        uploaded_by is not None
        and onboarding is not None
        and doc.uploaded_by is not None
    ):
        user = self.db.query(User).filter(User.firebase_uid == doc.uploaded_by).one_or_none()
        if user is not None and user.id == onboarding.user_id:
            uploaded_by = f"{uploaded_by} (client)"
    return DocumentDTO(
        doc_type=doc.doc_type,
        label=spec.label,
        status=doc.status.value,
        filename=doc.filename,
        required=spec.required,
        periodic_review=spec.periodic_review,
        issue_note=doc.issue_note,
        reviewed_at=doc.reviewed_at,
        expires_at=doc.expires_at,
        can_reupload=doc.status in _CAN_REUPLOAD_STATUSES,
        uploaded_by=uploaded_by,
        uploaded_at=doc.uploaded_at,
        approved_at=doc.reviewed_at if doc.status == DocStatus.VERIFIED else None,
    )
```

**Behavior / invariants:**
- Value-only change: `DocumentDTO`'s shape is unchanged, so `OnboardingBoard.tsx`'s and `rm/client-info/[id]/page.tsx`'s existing `Uploaded by {uid}` render sites become correct for free, with no admin-frontend change.
- `_resolve_uid_to_display_name_with_role` already returns `None` for `None`/unknown uids — the `" (client)"` suffix is only appended when a resolved name exists **and** the uploader's `users.id` matches the onboarding's own `user_id`.
- No behavior change for an RM/Compliance-uploaded document: the uploader's `user_id` never equals the onboarding's `user_id` for an admin account, so the suffix never fires there.

**Done when:** a client-uploaded document's `DocumentDTO.uploaded_by` reads `"<name> (client)"`; an RM-uploaded document's reads `"<name> (RM)"` exactly as before (via the existing role-suffix helper); an unresolvable uid still returns the raw uid, never raising.

---

### BE-12 — Ticket create/list/status + RM scoping (Yes — user req.)

- **Proposal ref:** § 4.1 Requests & tickets, C-11, C-14, D-2, D-3
- **Module:** 5.1–5.4
- **Files:** modify `app/libs/client_portal/{schemas.py,service.py,repository.py,router.py}`.
- **Dependencies:** BE-1. DB layer's `client_tickets` table (precondition).

**Contract:**
```python
# schemas.py
class TicketKind(str, Enum):
    ALLOTMENT = "allotment"
    REDEMPTION = "redemption"
    OTHER = "other"


class TicketStatus(str, Enum):
    NEW = "new"
    IN_PROGRESS = "in_progress"
    REPLIED = "replied"
    CLOSED = "closed"
    DECLINED = "declined"


class RaiseTicketReq(BaseModel):
    kind: TicketKind
    model_id: uuid.UUID | None = None
    subject: str | None = None
    category: str | None = None
    amount: Decimal | None = None
    multiplier: Decimal | None = None
    currency: str = "USD"
    message: str

    @model_validator(mode="after")
    def _check_kind_fields(self) -> "RaiseTicketReq":
        if self.kind == TicketKind.OTHER:
            if not self.subject:
                raise ValueError("subject is required when kind is 'other'")
            if self.model_id is not None:
                raise ValueError("model_id must be absent when kind is 'other'")
        elif self.model_id is None:
            raise ValueError("model_id is required unless kind is 'other'")
        return self


class RmTicketStatusReq(BaseModel):
    status: TicketStatus
    note: str | None = None


class RmTicketDTO(BaseModel):
    ref: str
    client_id: uuid.UUID
    client: str
    contact: str | None
    email: str | None
    account: str | None
    model: str | None
    kind: TicketKind
    currency: str
    amount: float | None
    multiplier: float | None
    notional: float | None
    subject: str | None
    message: str
    status: TicketStatus
    created_at: datetime
    responded_by: str | None
    responded_at: datetime | None
    response_note: str | None
```
```python
# repository.py
def create_ticket(self, *, user_id, assigned_rm_uid, kind, model_id, subject, category,
                    amount, multiplier, currency, message) -> ClientTicket:
    ticket = ClientTicket(
        id=uuid.uuid4(), user_id=user_id, assigned_rm_uid=assigned_rm_uid,
        reference=f"REQ-{uuid.uuid4().hex[:6].upper()}",
        kind=kind, status=DbTicketStatus.NEW.value, model_id=model_id, subject=subject,
        category=category, amount=amount, multiplier=multiplier, currency=currency, message=message,
    )
    self.db.add(ticket)
    self.db.flush()
    return ticket


def list_for_rm(self, *, rm_uid: str, full_visibility: bool) -> list[ClientTicket]:
    q = self.db.query(ClientTicket)
    if not full_visibility:
        q = q.filter(ClientTicket.assigned_rm_uid == rm_uid)
    return q.order_by(ClientTicket.created_at.desc()).all()


def get_ticket_by_ref(self, ref: str) -> ClientTicket | None:
    return self.db.query(ClientTicket).filter(ClientTicket.reference == ref).one_or_none()
```
```python
# service.py
_TERMINAL = {TicketStatus.CLOSED, TicketStatus.DECLINED}
_FULL_VISIBILITY_ROLES = {AdminRole.ADMIN}  # mirrors clients/repository.py's FULL_VISIBILITY_ROLES


def create_ticket(self, user_id: uuid.UUID, req: RaiseTicketReq) -> ClientRequestDTO:
    if req.kind != TicketKind.OTHER:
        model = self.db.get(Model, req.model_id)
        if model is None or model.status != ModelStatus.LIVE:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown or non-live model")
    profile = self._require_profile(user_id)
    ticket = self.repo.create_ticket(
        user_id=user_id, assigned_rm_uid=profile.assigned_rm_uid, kind=req.kind.value,
        model_id=req.model_id, subject=req.subject, category=req.category,
        amount=req.amount, multiplier=req.multiplier, currency=req.currency, message=req.message,
    )
    self.onboarding_repo.create_event(
        user_id=user_id, category="Requests Status",
        title=f"Ticket {ticket.reference} submitted", body=req.message,
    )
    self.db.commit()
    return self._ticket_to_request_dto(ticket)


def list_rm_tickets(self, *, rm_uid: str, role: AdminRole) -> list[RmTicketDTO]:
    tickets = self.repo.list_for_rm(rm_uid=rm_uid, full_visibility=role in _FULL_VISIBILITY_ROLES)
    return [self._ticket_to_rm_dto(t) for t in tickets]


def _require_rm_visible_ticket(self, ref: str, *, rm_uid: str, role: AdminRole) -> ClientTicket:
    ticket = self.repo.get_ticket_by_ref(ref)
    if ticket is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown ticket")
    if role not in _FULL_VISIBILITY_ROLES and ticket.assigned_rm_uid != rm_uid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown ticket")  # scoped 404, not 403 leak
    return ticket


def set_rm_ticket_status(self, ref: str, req: RmTicketStatusReq, *, rm_uid: str, role: AdminRole) -> RmTicketDTO:
    ticket = self._require_rm_visible_ticket(ref, rm_uid=rm_uid, role=role)
    if TicketStatus(ticket.status) in _TERMINAL:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ticket is already closed")
    ticket.status = req.status.value
    ticket.response_note = req.note
    ticket.responded_by = rm_uid
    ticket.responded_at = datetime.utcnow()
    self.db.commit()
    return self._ticket_to_rm_dto(ticket)
```
```python
# router.py
def _caller_role(user: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
                   db: Annotated[Session, Depends(get_db)]) -> AdminRole:
    """Same small local role lookup as onboarding/router.py's own
    _get_subscriptions_caller_role — kept local rather than importing a
    private cross-package name (house convention)."""
    profile = AdminProfileRepository(db).get_by_user_id(user.id)
    return AdminRole(profile.role)


@router.post("/client/tickets", response_model=ClientRequestDTO, status_code=201)
def raise_ticket(req: RaiseTicketReq, svc: Annotated[ClientPortalService, Depends(_service)],
                   user: Annotated[User, Depends(get_current_client_user)]) -> ClientRequestDTO:
    return svc.create_ticket(user.id, req)


@router.get("/rm/tickets", response_model=list[RmTicketDTO])
def list_rm_tickets(svc: Annotated[ClientPortalService, Depends(_service)],
                      user: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
                      role: Annotated[AdminRole, Depends(_caller_role)]) -> list[RmTicketDTO]:
    return svc.list_rm_tickets(rm_uid=user.firebase_uid, role=role)


@router.get("/rm/tickets/{ref}", response_model=RmTicketDTO)
def get_rm_ticket(ref: str, svc: Annotated[ClientPortalService, Depends(_service)],
                    user: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
                    role: Annotated[AdminRole, Depends(_caller_role)]) -> RmTicketDTO:
    return svc._require_rm_visible_ticket_dto(ref, rm_uid=user.firebase_uid, role=role)


@router.post("/rm/tickets/{ref}/status", response_model=RmTicketDTO)
def set_rm_ticket_status(ref: str, req: RmTicketStatusReq,
                           svc: Annotated[ClientPortalService, Depends(_service)],
                           user: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
                           role: Annotated[AdminRole, Depends(_caller_role)]) -> RmTicketDTO:
    return svc.set_rm_ticket_status(ref, req, rm_uid=user.firebase_uid, role=role)
```

**Behavior / invariants:**
- **D-2:** `create_ticket` never writes `client_allotment_redemptions` — a ticket is a request, the RM still files the real allotment/redemption through the existing 016/017 flow.
- **D-3:** one stored status vocabulary (`TicketStatus`, 5 values) — no separate client-facing status column; label translation is a Frontend concern (Frontend A-8).
- RM scoping: `role in _FULL_VISIBILITY_ROLES` (ADMIN only, mirroring `clients/repository.py`'s `FULL_VISIBILITY_ROLES`) sees every ticket; any other RM-actioned caller sees only tickets whose `assigned_rm_uid` snapshot matches their own `firebase_uid`. A ticket assigned to a different RM 404s (not 403) for a non-visible caller — consistent with not leaking existence.
- `assigned_rm_uid` is a **snapshot** taken at raise time from `client_profiles.assigned_rm_uid` — reassigning a client to a different RM later does not move historical tickets (DB B-1's own stated invariant; Backend never writes outside the 5 status values or moves this column post-insert).
- Terminal statuses (`closed`, `declined`) reject any further status transition with 409.
- `RaiseTicketReq`'s `model_validator` enforces the `kind`-conditional field requirements entirely at the wire boundary — a 422 before the service layer runs at all.

**Done when:** raising an allotment-kind ticket without `model_id` 422s; raising an other-kind ticket without `subject` 422s; a raised ticket appears in its assigned RM's `/rm/tickets` and not in a different RM's; ADMIN sees all; a status transition on a `closed` ticket 409s; a successful status change stamps `responded_by`/`responded_at`.

---

### BE-13 — Merged request history GET (Yes)

- **Proposal ref:** § 4.1 Requests & tickets, C-12
- **Module:** 5.1–5.4
- **Files:** modify `app/libs/client_portal/{schemas.py,service.py,router.py}`.
- **Dependencies:** BE-12 (shares `TicketKind`/`TicketStatus` and the ticket repository).

**Contract:**
```python
# schemas.py
class ClientRequestDTO(BaseModel):
    source: Literal["ticket", "allotment"]
    ref: str
    kind: TicketKind
    subject: str
    model_name: str | None
    amount: float | None
    created_at: datetime
    status: TicketStatus
```
```python
# service.py
_ALLOT_STATUS_MAP: dict[str, TicketStatus] = {
    "pending": TicketStatus.IN_PROGRESS,
    "awaiting_pc": TicketStatus.IN_PROGRESS,
    "awaiting_co": TicketStatus.IN_PROGRESS,
    "acknowledged": TicketStatus.REPLIED,
    "approved": TicketStatus.CLOSED,
    "rejected": TicketStatus.DECLINED,
}


def list_requests(self, user_id: uuid.UUID) -> list[ClientRequestDTO]:
    tickets = self.repo.list_for_client(user_id)
    allotments = self.onboarding_repo.list_allotments_for_client(user_id)
    rows = [self._ticket_to_request_dto(t) for t in tickets]
    rows += [self._allotment_to_request_dto(a) for a in allotments]
    return sorted(rows, key=lambda r: r.created_at, reverse=True)


def _allotment_to_request_dto(self, a: ClientAllotmentRedemption) -> ClientRequestDTO:
    model = self.db.get(Model, a.model_id)
    assert model is not None
    return ClientRequestDTO(
        source="allotment", ref=a.reference,
        kind=TicketKind.ALLOTMENT if a.kind.value == "allotment" else TicketKind.REDEMPTION,
        subject=model.name, model_name=model.name,
        amount=float(a.multiplier * (model.model_size or Decimal("0"))),
        created_at=a.created_at, status=_ALLOT_STATUS_MAP[a.status.value],
    )
```
```python
# router.py
@router.get("/client/requests", response_model=list[ClientRequestDTO])
def list_requests(svc: Annotated[ClientPortalService, Depends(_service)],
                    user: Annotated[User, Depends(get_current_client_user)]) -> list[ClientRequestDTO]:
    return svc.list_requests(user.id)
```

**Behavior / invariants:**
- `_ALLOT_STATUS_MAP` is exhaustive over every `AllotRdmpStatus` value (6 members) — a status added to that enum without a matching map entry must raise `KeyError` at read time (fail loud), never silently drop a row.
- Sorted by `created_at DESC` across both sources, mixed in one list — matches the existing FE table which already paginates client-side over a merged array.
- `ponytail:` no server-side pagination — a single client's history is small (§ Layer 2 C-12's own ponytail marker). Upgrade path if a client ever crosses ~500 requests: paginate this query.

**Done when:** a client with 1 ticket and 1 allotment sees both in one list, correctly ordered, with the allotment's `AllotRdmpStatus` mapped through `_ALLOT_STATUS_MAP` with no `KeyError` for any of the 6 real status values.

---

### BE-14 — Authorization: token-derived subject, no id parameters (MANDATORY)

- **Proposal ref:** § 4.1, C-14
- **Module:** 5.3 `client_portal.service` / 5.4 `client_portal.router` (cross-cutting, not a new file)
- **Files:** none of its own — this unit is the audit + enforcement pass over every route added by BE-1…BE-13.
- **Dependencies:** BE-1 through BE-13 (this is the final check that runs after every route exists).

**Contract — the invariant, expressed as the shape every `/client/*` handler must have:**
```python
# every /client/* route in client_portal/router.py takes this shape:
def some_client_route(
    ...,  # request body / query params, NEVER a client id / onboarding id / storage path
    svc: Annotated[ClientPortalService, Depends(_service)],
    user: Annotated[User, Depends(get_current_client_user)],  # subject, always resolved here
) -> SomeDTO:
    return svc.some_method(user.id, ...)  # user.id is the ONLY subject identifier passed down


# every /rm/tickets* route takes this shape:
def some_rm_route(
    ref: str,  # a TICKET reference, never a client/user id
    ...,
    svc: Annotated[ClientPortalService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
    role: Annotated[AdminRole, Depends(_caller_role)],
) -> SomeDTO:
    return svc.some_rm_method(ref, rm_uid=user.firebase_uid, role=role)  # scoping happens in the service
```

**Behavior / invariants:**
- No `/client/*` route signature in `client_portal/router.py` declares a path or query parameter typed as a client id or onboarding id. `GET /client/documents/{scope}/download?key=...` takes `key` (an opaque storage key, allow-listed per BE-7) and `scope` (an enum-like literal), neither of which names a client.
- `/rm/tickets/{ref}` and `/rm/tickets/{ref}/status` take a ticket **reference**, not a client/user id — the RM-scoping check (`_require_rm_visible_ticket`) still runs inside the service before any data crosses back.
- Verified mechanically (not just by inspection) via the § 8.2 test that walks `client_portal_router.routes` and asserts no route's `path_params`/`Query` set includes anything whose name matches `{client_id, user_id, onboarding_id}` for any `/client/*` path.
- Import-direction check: `rg -l "client_portal" app/libs/onboarding app/libs/trade_models` returns nothing — the dependency arrow points only one way (§ 3.1).

**Done when:** the router-introspection test (§ 8.3 BE-14) passes for every route registered on `client_portal.router`; the `rg` import-direction check returns no matches.

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal § 4)

> All routes are mounted under `/api`. All `/client/*` routes take **no subject id** — the subject is `get_current_client_user`. All `/rm/*` routes require `Action.CLIENT_VIEW` (existing dependency) and are scoped to `client_profiles.assigned_rm_uid == caller.firebase_uid`, except `ADMIN`, which sees all.

```python
# ---------- Profile ----------
GET   /api/client/profile                       -> ClientProfileDTO          {200, 401, 404}
PATCH /api/client/profile                       -> ClientProfileDTO          {200, 401, 422}

class RmContactDTO(BaseModel):
    name: str | None
    email: str | None
    phone: str | None                 # admin_profiles.phone_number

class ClientProfileDTO(BaseModel):
    name: str | None                  # client_profiles.name
    email: str | None                 # users.email          (read-only)
    phone: str | None                 # client_profiles.primary_phone (read-only)
    occupation: str | None            # client_profiles.occupation  (NEW, DB B-2)
    date_of_birth: date | None        # client_profiles.date_of_birth (NEW, DB B-2, read-only — see D-11)
    address: str | None               # client_profiles.address
    country_of_residence: str | None
    ib_account: str | None
    client_ref: str                   # "MEGA-0481", formatted from user_id (existing helper)
    assigned_rm: RmContactDTO | None

class ClientProfilePatch(BaseModel):  # every field optional; unset = unchanged
    name: str | None = None
    occupation: str | None = None
    address: str | None = None
    country_of_residence: str | None = None
    # email / phone / date_of_birth are NOT patchable here — 422 if present.

# ---------- Portfolio ----------
GET /api/client/portfolio                       -> PortfolioDTO              {200, 401}
GET /api/client/portfolio/history?months=6      -> list[HistoryPointDTO]     {200, 401, 422}

class PositionDTO(BaseModel):
    model_id: uuid.UUID
    model_name: str                   # models.name
    units: float                      # client_subscriptions.multiplier
    amount: float                     # units * models.model_size
    model_limit: float | None         # models.model_limit  (NEW column, DB B-5)
    #                                 ^ a DISTINCT attribute, not model_size:
    #                                   model_size prices a unit, model_limit caps the model.
    ib_account: str | None            # client_profiles.ib_account (per-client, NOT per-model)

class PortfolioDTO(BaseModel):
    cash_deposit: float               # client_portfolios.cash_deposit        (0 if no row)
    amount_in_trade: float            # client_portfolios.amount_in_trade
    previous_amount_in_trade: float
    total_value: float                # cash_deposit + amount_in_trade
    change_amount: float              # amount_in_trade - previous_amount_in_trade
    change_pct: float | None          # None when previous == 0 (no divide-by-zero)
    updated_at: datetime | None
    positions: list[PositionDTO]      # one per client_subscriptions row, name-sorted

class HistoryPointDTO(BaseModel):
    month: str                        # "YYYY-MM" — one point per CALENDAR MONTH, not per run
    total: float                      # cumulative amount_in_trade at month end
    per_model: dict[str, float]       # model_name -> cumulative allocated at month end
    # Every month in the window is present, including months with no allocation
    # run: those carry the previous month's cumulative forward (a flat segment,
    # never a gap). Same key set in `per_model` on every point, so the chart's
    # series count is stable across the window.

# ---------- Models ----------
GET /api/client/models/recommended              -> list[RecommendedModelDTO] {200, 401}
GET /api/client/models/{model_id}/material      -> file stream               {200, 401, 404}

class RecommendedModelDTO(BaseModel):
    model_id: uuid.UUID
    name: str
    category: list[str] | None        # models.category (JSON) — kept: a real model attribute
    model_limit: float | None         # models.model_limit (NEW column, DB B-5)
    subscription_redemption: str | None
    description: str | None
    has_material: bool                # a model_materials row exists
    # NOTE: no country, no sector, no risk_level, no min_investment — none exist as columns.

# ---------- Documents (KYC + firm-issued files) ----------
GET  /api/client/kyc                            -> KycPanelDTO               {200, 401}
POST /api/client/kyc/{doc_type}   (multipart)   -> DocumentDTO               {200, 401, 403, 409, 413, 415}
# 403 = upload window not yet open (Backend C-8). 409 = the existing
# OnboardingService guards (cycle not editable / doc not re-uploadable), raised
# by the shared method, not re-implemented here.
GET  /api/client/documents/{scope}              -> list[StoredFileDTO]       {200, 401, 422}
GET  /api/client/documents/{scope}/download?key=-> file stream               {200, 401, 403, 404}
# scope ∈ {"legal", "statements"}; 422 on any other value.

class KycPanelDTO(BaseModel):
    overall: Literal["due", "processing", "verified"]   # derived, see Backend C-9
    documents: list[DocumentDTO]      # REUSED VERBATIM from app/libs/onboarding/schemas.py
    next_review_at: datetime | None   # the periodic doc's expires_at; None if never verified
    # --- renewal upload window (panel-level, not per-document: exactly one doc
    # --- is periodic today, so this does not need to be a per-row shape) -------
    renewal_doc_type: str | None      # "investment_policy_statement", or None if no periodic doc
    upload_opens_at: datetime | None  # expires_at - CLIENT_UPLOAD_WINDOW_DAYS
    can_upload: bool                  # server-computed; the FE never recomputes this
    upload_blocked_reason: Literal[
        "window_not_open", "in_review", "cycle_not_editable", "no_cycle"
    ] | None                          # None iff can_upload is True

class StoredFileDTO(BaseModel):
    key: str                          # opaque storage key; the ONLY thing the FE echoes back
    filename: str
    size_bytes: int | None
    modified_at: datetime | None
    category: str | None              # legal scope: immediate sub-folder name; statements: None
    period: str | None                # statements scope: "YYYY-MM" parsed from a leading
    #                                   date token in the filename, else None -> the FE falls
    #                                   back to `modified_at`. This is the ONLY contract the
    #                                   future EoM generator has to honour (D-7).

# ---------- Requests & tickets (client side) ----------
GET  /api/client/requests                       -> list[ClientRequestDTO]    {200, 401}
POST /api/client/tickets                        -> ClientRequestDTO          {201, 401, 422}

class TicketKind(str, Enum):      ALLOTMENT="allotment"; REDEMPTION="redemption"; OTHER="other"
class TicketStatus(str, Enum):    NEW="new"; IN_PROGRESS="in_progress"; REPLIED="replied"; \
                                  CLOSED="closed"; DECLINED="declined"

class RaiseTicketReq(BaseModel):
    kind: TicketKind
    model_id: uuid.UUID | None = None     # required when kind != OTHER (422 otherwise)
    subject: str | None = None            # required when kind == OTHER (422 otherwise)
    category: str | None = None           # free text, OTHER only
    amount: Decimal | None = None
    multiplier: Decimal | None = None
    currency: str = "USD"
    message: str

class ClientRequestDTO(BaseModel):
    """One merged row for the client's request history. `source` tells the FE
    which table it came from; both render in the same table."""
    source: Literal["ticket", "allotment"]
    ref: str                          # tickets: "REQ-3F9A2C"; allotments: existing `reference`
    kind: TicketKind                  # allotment rows map AllotRdmpKind -> TicketKind
    subject: str                      # tickets: subject or model_name; allotments: model_name
    model_name: str | None
    amount: float | None              # None renders as the existing "—"
    created_at: datetime
    status: TicketStatus              # allotment rows map via Backend C-12's table

# ---------- Tickets (RM side) ----------
GET  /api/rm/tickets                            -> list[RmTicketDTO]         {200, 401, 403}
GET  /api/rm/tickets/{ref}                      -> RmTicketDTO               {200, 401, 403, 404}
POST /api/rm/tickets/{ref}/status               -> RmTicketDTO               {200, 401, 403, 404, 409}

class RmTicketStatusReq(BaseModel):
    status: TicketStatus
    note: str | None = None           # persisted to client_tickets.response_note

class RmTicketDTO(BaseModel):
    ref: str
    client_id: uuid.UUID
    client: str                       # client_profiles.name
    contact: str | None               # client_profiles.authorized_person
    email: str | None                 # users.email
    account: str | None               # client_profiles.ib_account
    model: str | None
    kind: TicketKind
    currency: str
    amount: float | None
    multiplier: float | None
    notional: float | None            # amount * multiplier; None when either is None
    subject: str | None
    message: str
    status: TicketStatus
    created_at: datetime
    responded_by: str | None
    responded_at: datetime | None
    response_note: str | None
```

**Field-name ↔ column-name map (non-obvious pairs only)**

| Wire | Column |
|---|---|
| `units` | `client_subscriptions.multiplier` |
| `model_limit` | `models.model_limit` (**not** `model_size` — see DB B-5) |
| `amount` (position) | *derived* `client_subscriptions.multiplier * models.model_size` |
| `total_value` | *derived* `client_portfolios.cash_deposit + .amount_in_trade` |
| `ref` (ticket) | `client_tickets.reference` |
| `client_ref` | *derived* from `users.id` (existing onboarding formatter) |

**Error envelope:** unchanged — FastAPI `{"detail": "..."}`; `client-frontend/lib/api/*` already unwraps `detail`.

**Per-layer obligations against the seam**

| Layer | Contributes | Assumes |
|---|---|---|
| Database | `client_tickets` with the exact `TicketKind`/`TicketStatus` value sets in § 4.1; `client_profiles.occupation` and `models.model_limit` nullable columns | Backend never writes a status outside the 5 values; a ticket's `assigned_rm_uid` is a snapshot and may go stale |
| Backend | Every route above at its exact path, DTO, and status codes; all derivations (`total_value`, `amount`, `notional`, status maps) computed server-side | DB B-1/B-2 present; `client_portfolios` row may be **absent** for pre-014 clients → serve zeros, never 404 |
| Frontend (client) | Consumes the DTOs verbatim; renders `None`/`null` as the existing `—`; performs no arithmetic beyond formatting | Backend returns DTOs exactly as in § 4.1; money arrives as a `float`, formatting is FE-side |
| Frontend (admin) | `RequestTickets.tsx` and its detail page consume `RmTicketDTO`; status actions POST `RmTicketStatusReq` | Backend enforces RM scoping; `ref` is URL-safe and stable |

**Change protocol (post-freeze):**
- Any edit to § 4 requires a new proposal revision or a dated, initialled addendum in the proposal file.
- Every impl doc's § 7 is re-copied in the same change set — the seam never lives in only one place.

### 7.2 How this layer honours the seam

- **What this layer contributes to the seam:** every route listed in § 7.1 at its exact path — `GET/PATCH /api/client/profile` (BE-2), `GET /api/client/portfolio` + `/history` (BE-3, BE-4), `GET /api/client/models/recommended` + `/{model_id}/material` (BE-5), `GET /api/client/kyc` + `POST /api/client/kyc/{doc_type}` (BE-10), `GET /api/client/documents/{scope}` + `/download` (BE-7), `GET /api/client/requests` + `POST /api/client/tickets` (BE-12, BE-13), `GET /api/rm/tickets` + `/{ref}` + `POST /{ref}/status` (BE-12), plus the two relocated `GET /api/client/subscriptions` / `/events` (BE-1) — each with the exact DTO shape and status-code set in § 7.1, and every derivation (`total_value`, `change_pct`, position `amount`, monthly running totals, ticket `notional`, the two `AllotRdmp*` → `Ticket*` status maps) computed server-side per the standing "all business logic in the backend" rule (memory `mobo-backend-integration` D-1, restated in the proposal's § Layer 2 B intro).
- **What this layer assumes from the other side:** DB B-1/B-2/B-5 columns and the `client_tickets` table are present with exactly the value sets in § 7.1 (Backend never needs to defend against an out-of-range `TicketStatus`/`TicketKind` value arriving from storage); a `client_portfolios` row **may be absent** for a pre-014 client — every unit that reads it (BE-3, BE-4) treats that as all-zero balances and an empty history, never a 404, per DB B-3's own stated invariant.
- **Change protocol:** any edit to § 7 requires editing the proposal first; this section is then re-copied. Never edit § 7 in isolation.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Framework / runner:** pytest — command: `pytest -q` (matches `[tool.pytest.ini_options]` in `api-backend/pyproject.toml`: `testpaths = ["app", "tests"]`).
- **Fixtures / seed:** a scratch DB (SQLite or the same MariaDB test harness the `onboarding` suite already uses) seeded with: one client with subscriptions + a `client_portfolios` row + an assigned RM; one client **without** a `client_portfolios` row; one client with **no** assigned RM; one RM user; one ADMIN user; a LIVE model with `model_limit` set and one without.
- **Isolation:** hermetic, no shared external state; safe to run in parallel.
- **Layer isolation:** tests import only from `app/libs/client_portal/*`, `app/libs/onboarding/*` (consumed as this layer's own dependency, per § 4's stated import direction — not a "sibling layer"), `app/libs/trade_models/*`, `app/models/*`, and test doubles. No test in this layer stands up a Frontend dev server or imports TypeScript; the Frontend layers are the ones mocking this layer's DTOs, not the reverse.
- **Test location:** `api-backend/tests/libs/client_portal/`, mirroring the source path.
- **Commit policy:** tests are **never committed** — `tests/` is git-ignored; generated and run locally/in CI, never staged.
- **Code generation:** concrete test code is written by the `test-gen` skill (arg: `standard`, see § 8.4) from the goals in § 8.2/§ 8.3.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| BE-1 | Relocated `/client/subscriptions`/`/events` behave identically to before the move | none |
| BE-2 | Profile GET resolves RM contact and `None` when unassigned; PATCH persists editable fields; PATCH with `email`/`phone` 422s | none |
| BE-3 | Portfolio GET derives `total_value`/`change_pct` correctly; missing `client_portfolios` row → all-zero, no 404 (DB B-3) | none |
| BE-4 | Monthly bucketing: same-month collapse, empty-month carry-forward, pre-window cumulative correctness, `months=1`/`months=24` exact counts | none |
| BE-5 | Recommended list excludes own subscriptions; `has_material`/download correctness incl. 404 for no-material | none |
| BE-6 | `LocalStorage.list()` one-level-deep enumeration incl. `category`; missing dir → `[]`; `NasStorage.list()` raises | none |
| BE-7 | Legal/statements listing shape; path-traversal key → 403; sibling client's real key → 403; unknown scope → 422 | none |
| BE-8 | `investment_policy_statement` spec flips to periodic; other 6 specs + `REQUIRED_COUNT` unchanged | none |
| BE-9 | Verifying a periodic doc sets `expires_at = reviewed_at + interval`; verifying non-periodic leaves `NULL`; reject never sets it; **regression: existing `tests/libs/onboarding/` suite passes unchanged** | none |
| BE-10 | Upload 403 at 15 days / 200 at 13; non-periodic `doc_type` 422; `can_upload`/403 agreement; startup assertion fails on misconfiguration; client vs RM upload produce identical row shape | none (onboarding is this layer's own dependency, called directly against the seeded fixture, not mocked) |
| BE-11 | `uploaded_by` resolves to name; `" (client)"` suffix only for self-upload; RM upload keeps the existing `(ROLE)` suffix | none |
| BE-12 | Ticket validator rejects missing `model_id`/`subject`; RM sees only own-scoped tickets, ADMIN sees all; terminal-status transition 409 | none |
| BE-13 | Merged history sorts correctly across sources; `_ALLOT_STATUS_MAP` exhaustive over all 6 `AllotRdmpStatus` values | none |
| BE-14 | Router introspection: no `/client/*` route parameter names a client/onboarding id; import-direction `rg` check | none |

### 8.3 Test goals (per unit)

#### BE-1
- **Positive:** `GET /client/subscriptions` and `/client/events` return the same shape and data as before relocation, for a seeded client.
- **Negative:** neither route is reachable without `get_current_client_user` resolving (401 with no/invalid token).
- **Invariants:** the routes' registered path strings are byte-identical to their pre-move values.
- **Seam mocks:** none — this unit only relocates existing, already-tested behavior.

#### BE-2
- **Positive:** GET returns a fully-populated `ClientProfileDTO` including `date_of_birth` and a resolved `assigned_rm`; PATCH with a valid subset of editable fields (`name`/`occupation`/`address`/`country_of_residence`) persists and the next GET reflects it, with `date_of_birth` unchanged before and after.
- **Negative:** PATCH with `{"email": "..."}`, `{"phone": "..."}`, `{"date_of_birth": "1990-01-01"}`, or any unknown key → 422 (`extra="forbid"`) — `date_of_birth` must be tested explicitly here, not lumped into "any unknown key", since it is the one field in this proposal added specifically to the read-only set rather than the editable one (D-11); GET for a user with no `client_profiles` row → 404.
- **Invariants:** `assigned_rm` is `None` (never a fabricated `RmContactDTO`) whenever `assigned_rm_uid` is `NULL` or unresolvable; `client_ref` is stable and derived only from `user_id`; no code path in this unit ever writes to `client_profiles.date_of_birth`.
- **Seam mocks:** none.

#### BE-3
- **Positive:** for a seeded client with 2 positions, `total_value`, `change_amount`, `change_pct`, and each `PositionDTO.amount` match hand-computed values.
- **Negative:** a client with no `client_portfolios` row gets all-zero balances, `updated_at=None`, and no exception.
- **Invariants:** `change_pct` is `None` whenever `previous_amount_in_trade == 0`, regardless of `amount_in_trade`'s value; positions are always name-sorted; `PositionDTO.model_limit` reads whatever `models.model_limit` holds (`NULL` for every model, since no writer exists in this proposal — see Non-Goals) and is never computed or defaulted to a non-`None` value by this unit.
- **Seam mocks:** none.

#### BE-4
- **Positive:** a fixture with runs across 8 distinct months, requested with `months=6`, returns exactly 6 points whose `total`/`per_model` match a hand-computed running sum.
- **Negative:** `months=0` or `months=25` → 422 from the route's own bound check.
- **Invariants:** two runs in the same month produce one point (not two); a month with zero runs inside the window still appears, with the same cumulative as the prior month; the first emitted point's cumulative includes every run strictly before the window's first month; `months=1` and `months=24` both return exactly that many points.
- **Seam mocks:** none.

#### BE-5
- **Positive:** recommended list for a client subscribed to model A includes every other LIVE model, excludes A; a model with an uploaded material streams its highest-`version_no` file with correct filename/content-type.
- **Negative:** material download for a model with zero `model_materials` rows → 404.
- **Invariants:** `has_material` is `True` iff at least one `model_materials` row exists for that model, independent of version count; `RecommendedModelDTO.model_limit` is read-only from `models.model_limit` and reads `NULL` for every model in this proposal's tests, since no code path anywhere writes it. A static `rg "model_limit" app/libs/trade_models` confirms zero hits — the scope boundary from proposal Non-Goals (no PC authoring surface) holds.
- **Seam mocks:** none.

#### BE-6
- **Positive:** `LocalStorage.list("legal_docs")` against a directory with 2 category sub-folders and 1 root-level file returns 3 entries with correct `category`/`None` split; a `StoredFile.key` round-trips through `open()`.
- **Negative:** `list()` against a directory that doesn't exist returns `[]`, not an exception; `NasStorage.list(...)` raises `NotImplementedError`.
- **Invariants:** result is sorted newest-`modified_at`-first.
- **Seam mocks:** none.

#### BE-7
- **Positive:** legal listing groups correctly by `category`; statements listing parses a `2026-07_*.pdf`-shaped filename's period and falls back to `None` for an unshaped filename; a valid `key` downloads the right bytes.
- **Negative:** a `key` containing `../` → 403; a syntactically valid key belonging to a **different** client's statements folder → 403 (not 404 — the file exists, just not for this caller); `scope="other"` → 422 on both list and download.
- **Invariants:** `category` is always `None` for `scope="statements"`; `period` is always `None` for `scope="legal"`.
- **Seam mocks:** none.

#### BE-8
- **Positive:** `get_doc_spec("investment_policy_statement").periodic_review is True` and `review_interval_days == 365`.
- **Negative:** none (pure config).
- **Invariants:** all other 6 `DocSpec` entries and `REQUIRED_COUNT` are unchanged from their pre-unit values (a snapshot-diff assertion).
- **Seam mocks:** none.

#### BE-9
- **Positive:** verifying a periodic-review doc sets `expires_at` to exactly `reviewed_at + timedelta(days=review_interval_days)`.
- **Negative:** verifying a non-periodic doc leaves `expires_at` `NULL`; rejecting any doc (periodic or not) never sets or clears `expires_at`.
- **Invariants:** **the existing `tests/libs/onboarding/` suite passes with zero edits** — this is a mandatory regression goal, not a footnote; any edit inside that suite to accommodate this change is itself the signal that RM/Compliance logic moved and must be treated as a defect in this unit's implementation, not in the test.
- **Seam mocks:** none — `set_verdict` is exercised directly.

#### BE-10
- **Positive:** upload at 13 days before `expires_at` → 200, row shows `status=uploaded`, `version_no+1`, `uploaded_by=<client uid>`; `GET /client/kyc`'s `can_upload` is `True` in exactly that same window.
- **Negative:** upload at 15 days before `expires_at` → 403 `window_not_open`; upload of a non-`periodic_review` `doc_type` → 422; upload while the cycle is `reviewing`/`active` → 409 (from the delegated, unmodified method); startup assertion raises when `CLIENT_UPLOAD_WINDOW_DAYS` is configured above `ONBOARDING_RENEWAL_LOOKAHEAD_DAYS`.
- **Invariants:** running an RM upload and a client upload against the same fixture/doc produces an identical row shape except `uploaded_by`; `can_upload` and the POST's resulting status code never disagree outside of a deliberately-forced race in the test itself.
- **Seam mocks:** none — `OnboardingService.upload_document` is called directly (this layer's own consumed dependency, not a sibling seam).

#### BE-11
- **Positive:** a client-uploaded doc's `uploaded_by` reads `"<name> (client)"`; an RM-uploaded doc's reads `"<name> (RM)"` (unchanged from before this unit).
- **Negative:** an unresolvable `uploaded_by` uid still returns the raw uid (or `None` if the doc was never uploaded), never raising.
- **Invariants:** the `" (client)"` suffix fires if and only if the uploader's `users.id` equals the onboarding's own `user_id`.
- **Seam mocks:** none.

#### BE-12
- **Positive:** a valid allotment-kind ticket persists, snapshots the client's current `assigned_rm_uid`, and appears in that RM's `/rm/tickets`; a status change from `new` to `in_progress` succeeds and stamps `responded_by`/`responded_at`.
- **Negative:** allotment/redemption-kind ticket with no `model_id` → 422; other-kind ticket with no `subject` → 422; other-kind ticket with a `model_id` present → 422; a status change on a `closed`/`declined` ticket → 409; a non-owning, non-ADMIN RM fetching `/rm/tickets/{ref}` for another RM's ticket → 404.
- **Invariants:** `client_tickets.status` never takes a value outside the 5-member `TicketStatus` set; ADMIN's `list_rm_tickets` result is a superset of any single RM's.
- **Seam mocks:** none.

#### BE-13
- **Positive:** a client with 1 ticket + 1 allotment gets both in one `created_at`-descending list.
- **Negative:** none beyond BE-12's own (this unit has no new failure mode of its own).
- **Invariants:** `_ALLOT_STATUS_MAP` has an entry for every member of `AllotRdmpStatus` (parametrized over all 6) — a `KeyError` here is a test failure, not a silently-dropped row.
- **Seam mocks:** none.

#### BE-14
- **Positive:** the router-introspection test enumerates every route on `client_portal.router` and asserts, for every `/client/*` path, that no path/query parameter name matches `client_id`/`user_id`/`onboarding_id`.
- **Negative:** (this unit is itself a negative-space check — there is no "wrong input" to send, only "wrong signature" to detect statically).
- **Invariants:** `rg -l "client_portal" app/libs/onboarding app/libs/trade_models` returns no files.
- **Seam mocks:** none.

### 8.4 Aggregate gate
- All unit tests green is a local gate run before commit/PR hand-off (§ 3.2). A red test blocks the unit; tests themselves are never committed (git-ignored `tests/` dir).
- Target coverage for changed lines: ≥ 90% of new/changed statements in `app/libs/client_portal/` and the touched lines in `onboarding`/`trade_models`.
- Chosen `test-gen` level for this layer: **standard** — happy path + main negative + role/permission per goal. `thorough` is warranted specifically for BE-4 (monthly bucketing) and BE-7 (path-traversal allow-list) given their edge-case density; the orchestrator may re-run `test-gen thorough` scoped to just those two units if the standard pass leaves gaps.

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] Every § 6 unit (BE-1…BE-14) committed on `client-portal-integration-be`; each commit left the branch green.
- [ ] `app/libs/trade_models/schemas.py` diff is empty — no `model_limit` field was added to `ModelCreate`/`ModelUpdate`/`ModelOut` (proposal Non-Goals).
- [ ] § 8 unit tests all pass locally; CI gate (§ 3.2: `ruff check`, `ruff format --check`, `mypy app`, `pytest -q`) green.
- [ ] § 7 matches the proposal's frozen seam verbatim. Checked against the proposal on the parent branch, **not** against the DB or Frontend layers' branches (not visible here).
- [ ] The mandatory regression goal holds: `tests/libs/onboarding/` passes with zero edits (BE-9's own done-condition, restated at the layer level because it's the one place this layer touches shipped RM/Compliance behavior).
- [ ] PR opened against `client-portal-integration`; human owns the merge to `main`.

**Rollback:** every unit in this layer is additive or a narrow value-level change to an existing method (BE-9, BE-11) — reverting the whole `client-portal-integration-be` branch removes the new package and restores `onboarding/repository.py`/`service.py`/`compliance_doc_config.py` to their prior bodies with no persisted state of its own to unwind. The one thing that does **not** revert with the branch: once BE-9 has been live long enough for Compliance to verify a real periodic document, that document's `expires_at` value was written under this branch's logic; reverting the code does not retroactively clear it (the DB layer's own down-migration, not this layer's, is what nulls `expires_at` — see the DB layer's rollback section). Files placed under `STORAGE_ROOT` by any client upload during this branch's lifetime are never deleted by a code revert (BE-6/BE-7 only read/list/open; only `OnboardingService.upload_document`, unmodified, ever writes there, and its own lifecycle already survives an onboarding rollback in the base system).
