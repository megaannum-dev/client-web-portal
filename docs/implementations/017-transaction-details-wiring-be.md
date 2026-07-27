# 017 — Transaction Details Wiring · Implementation Details — Backend

> Status: **DRAFT — pending implementation.**
> Implements: proposal `docs/proposals/017-2026-07-24-transaction-details-wiring.md` § "Layer 2 — Backend" (§A–§A-3)
> Layer: **Backend** — one layer per file.
> Sibling layer docs: `docs/implementations/017-transaction-details-wiring-db.md` (Database), `docs/implementations/017-transaction-details-wiring-fe.md` (Frontend)
> Execution schedule: `docs/execution-schedules/017-transaction-details-wiring-be.md`
> Builds on / prerequisites: the DB layer's migration (`down_revision = "a4d8e2f6b391"`) — creates `transaction_details` — must be merged/applied before this layer's units are executable. This doc treats that schema as a precondition and does not re-derive it.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/017-2026-07-24-transaction-details-wiring.md` § "Layer 2 — Backend" |
| Execution schedule | `docs/execution-schedules/017-transaction-details-wiring-be.md` |
| Sibling layer impl docs | `docs/implementations/017-transaction-details-wiring-db.md`, `docs/implementations/017-transaction-details-wiring-fe.md` |
| Builds on | DB layer migration (`down_revision = "a4d8e2f6b391"`) merged/applied — `transaction_details` table present |

---

## 2. Branch & session contract

- **Branch:** `transaction-details-wiring-be`, cut from parent `transaction-details-wiring`. All BE-* units land on this one branch.
- **Isolation:** implementable in a separate session in parallel with the DB and FE layer branches, provided the preconditions below hold. Shares state with sibling layers only through the frozen seam in §7.
- **Preconditions (must be true before starting):**
  - [ ] DB migration creating `transaction_details` (1:1 FK+UNIQUE to `client_allotment_redemptions`) is applied to the target DB (or merged to the parent branch this layer branches from).
  - [ ] The seam in §7 (proposal §4.1/§4.2) is agreed and frozen — this doc does not renegotiate it.
- **Read-first inventory:**
  - `api-backend/app/models/onboarding.py` — `TransactionDetail` (DB layer's new model), `ClientAllotmentRedemption`, `AllotRdmpStatus`, `AllotRdmpKind`.
  - `api-backend/app/libs/onboarding/router.py` — existing route registration order, the `Depends(require_action(Action.X))` RBAC pattern, the `_service()` factory; specifically `submit_allotment`/`submit_redemption` (lines 206-221) as the closest precedent for an RM-write route on this same router.
  - `api-backend/app/libs/onboarding/service.py` — `submit_allotment`/`submit_redemption`/`pc_decide_redemption` (the single-commit-with-rollback pattern this layer's new method follows); `_allotment_to_dto` (the DTO-assembly method this layer widens).
  - `api-backend/app/libs/onboarding/repository.py` — `create_allotment`, `get_allotment`, `create_event` (the repository-method style: no commit inside, caller's txn boundary).
  - `api-backend/app/libs/onboarding/schemas.py` — `AllotRdmptDTO`, `SubmitAllotmentReq`/`SubmitRedemptionReq` (the request-DTO style this layer's `TransactionDetailRequest` follows).
  - `api-backend/app/libs/auth/actions.py` — `Action` enum, `ROLE_ACTIONS`. `Action.CLIENT_VIEW` is the existing action gating every other RM-write route on this router (`submit_allotment`, `submit_redemption`) — reused here for consistency, per the same rationale already documented in 016's BE impl doc §3.1 (a write gated by a read-named action, accepted as-is rather than silently swapped).
  - `api-backend/tests/libs/onboarding/conftest.py` — existing in-memory-SQLite fixture (`session`, `make_admin`, `make_client`, `make_model`) this layer's own tests extend.
- **Hand-off / exit signal:** all BE-* units committed on the branch; `ruff check . && ruff format --check . && mypy app && pytest -q` green; PR opened against `transaction-details-wiring`.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- **Layering:** router → service → repository. `router.py` depends only on `OnboardingService` via `Depends`; `OnboardingService` depends only on `OnboardingRepository` (plus `self.db` for the rare direct read). No new module — everything extends the existing `app/libs/onboarding` package, since it already owns `ClientAllotmentRedemption` and now its `TransactionDetail` child.
- **Single-commit-with-rollback:** the transaction-detail filing write path follows the existing pattern verbatim:
  ```python
  try:
      ...  # all repo writes for this unit of work
      self.db.commit()
  except Exception:
      self.db.rollback()
      raise
  ```
- **Decimal precision:** `settlement_amount` uses `Decimal` end-to-end in the service/repository, matching the existing `Numeric(28, 10)` convention (`ClientAllotmentRedemption.multiplier`/`agg_before`/`agg_after`); `float` only appears at the DTO boundary (`TransactionDetailDTO.settlement_amount`), same as `AllotRdmptDTO.units`/`amount`.
- **RBAC action reuse (no new `Action` added):** the proposal's seam (§4.2) pins the RM filing route to the RM role. This doc reuses `Action.CLIENT_VIEW` — the same action already gating `POST /rm/allotment` and `POST /rm/redemption` on this router — rather than adding a new `Action` member for a single new route family.
- **Idempotency via DB constraint + explicit check:** the service checks for an existing `transaction_details` row before inserting (returns 409 early with a clear message) rather than relying solely on the DB's UNIQUE constraint to surface an opaque `IntegrityError` — the constraint is the backstop, the explicit check is the primary UX.

### 3.2 CI/CD & engineering discipline
- **Trunk-friendly, small units.** Each BE-* feature below is one atomic, self-reviewable commit that leaves the branch green. No unit depends on an uncommitted sibling within this layer.
- **Every unit is independently revertible.** BE-1 (routes + schemas) and BE-2 (service/repository logic) touch disjoint files in principle, but ship together in practice (a route with no service method is not shippable green) — noted, not a real ordering hazard.
- **Additive & backward-compatible first.** Both new routes are new; no existing route's request/response shape changes except `AllotRdmptDTO`, which gains one new field (`has_transaction_detail: bool = False`) with a default that keeps every existing caller/test compiling.
- **Gates before merge** (in order):
  ```bash
  ruff check . && ruff format --check . && mypy app && pytest -q
  ```
  (verified configured in `api-backend/pyproject.toml`: ruff, mypy over `app`, pytest `testpaths = ["app","tests"]`.)
- **No secrets, no manual steps in the merge path.** No human gate exists in this layer alone — the DB migration's live-DB apply is the schedule's gate, not this doc's.
- **Reversibility documented** — see §9.

---

## 4. Architecture (level 1 of 3)

**Target layout (extends the existing package, no new modules):**
```
app/libs/onboarding/
  router.py     # +2 routes (BE-1)
  service.py    # +2 methods on OnboardingService (BE-2, BE-3); widened _allotment_to_dto (BE-4)
  repository.py # +2 methods: create_transaction_detail, get_transaction_detail
  schemas.py    # +2 DTOs (TransactionDetailRequest, TransactionDetailDTO); widened AllotRdmptDTO
```

**Dependency direction:** `router.py` → `service.py` → `repository.py`, unchanged. `repository.py` imports `TransactionDetail` from `app.models.onboarding` directly, alongside its existing `ClientAllotmentRedemption` import.

**External seams:**
- **Tables written:** `transaction_details` (insert only, once per `allotment_id` — enforced by the service's own check plus the DB's UNIQUE constraint).
- **Tables read:** `transaction_details` (existence check for `has_transaction_detail`, and the GET-by-`allotment_id` lookup), `client_allotment_redemptions` (status/kind guard on POST).
- **Routes exposed:** the 2 routes in §7.1.
- **Depends on sibling contract:** §7 (frozen seam) — the DB layer's `transaction_details` table.

---

## 5. Modules (level 2 of 3)

### 5.1 `onboarding` (extended)
- **Responsibility:** serve RM-initiated transaction-detail filing and retrieval, on top of the existing allotment/redemption submission and PC/CO approval responsibilities already owned here.
- **Files:** `api-backend/app/libs/onboarding/router.py`, `service.py`, `repository.py`, `schemas.py`.
- **Public surface:** 2 new routes (§7.1); `OnboardingService.file_transaction_detail`, `.get_transaction_detail`.
- **Owns features:** BE-1, BE-2, BE-3, BE-4.

---

## 6. Features (level 3 of 3 — the work units)

### BE-1 — New routes + request/response DTOs (Yes — user req.)

- **Proposal ref:** § "Layer 2 — Backend" A-1, A-2; §4.1 (seam)
- **Module:** `onboarding` (5.1)
- **Files:** `modify: api-backend/app/libs/onboarding/router.py`, `modify: api-backend/app/libs/onboarding/schemas.py`
- **Dependencies:** none — parallel-safe with BE-2/BE-3's internals (routes can be committed with methods stubbed, but land together with BE-2/BE-3 in practice since a route with no service method is not shippable green).

**Contract (required code):**

```python
# schemas.py — new request/response DTOs, pinned verbatim from proposal §4.1
class TransactionDetailRequest(BaseModel):
    bank_account: str
    settlement_amount: Decimal
    transaction_date: date
    transaction_time: time
    currency: str
    reference_no: str | None = None


class TransactionDetailDTO(BaseModel):
    id: uuid.UUID
    allotment_id: uuid.UUID
    bank_account: str
    settlement_amount: float
    transaction_date: date
    transaction_time: time
    currency: str
    reference_no: str | None
    filed_by: str
    filed_at: datetime
```

```python
# router.py — 2 new routes, placed next to submit_allotment/submit_redemption
@router.post(
    "/rm/allotments/{allotment_id}/transaction-detail",
    response_model=TransactionDetailDTO,
    status_code=201,
)
def file_transaction_detail(
    allotment_id: uuid.UUID,
    req: TransactionDetailRequest,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
) -> TransactionDetailDTO:
    return svc.file_transaction_detail(allotment_id, req, filed_by=user.firebase_uid)


@router.get(
    "/rm/allotments/{allotment_id}/transaction-detail",
    response_model=TransactionDetailDTO,
)
def get_transaction_detail(
    allotment_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
) -> TransactionDetailDTO:
    return svc.get_transaction_detail(allotment_id)
```

**Behavior / invariants:**
- Routes are registered under the existing `router` (prefix applied at app-mount time, same as every other route in this file) — no new `APIRouter`.
- `currency` is validated against the fixed 7-member set (`USD`, `CHF`, `AUD`, `GBP`, `EUR`, `CAD`, `HKD`) in the **service** layer (BE-2), not via a Pydantic `Literal`/enum on the request DTO — kept as a plain `str` field so the currency list can widen later without a schema migration, matching the proposal's non-goal of not over-specifying the wire type; the validation still produces the same 422 either way.
- Error codes match §4.1 exactly: 404 (unknown `allotment_id`, or GET with no settlement row filed yet), 409 (already filed), 422 (validation — bad currency, non-positive amount), 403 (wrong role — enforced by `require_action` itself).

**Done when:** both routes are mounted, return the pinned response model, and reject an unauthenticated/wrong-role caller with 403 (existing `require_action` behavior, unchanged).

---

### BE-2 — Transaction-detail filing service method (Yes — user req.)

- **Proposal ref:** § "Layer 2 — Backend" A-1
- **Module:** `onboarding` (5.1)
- **Files:** `modify: api-backend/app/libs/onboarding/service.py`, `modify: api-backend/app/libs/onboarding/repository.py`
- **Dependencies:** BE-1 (schemas/route exist).

**Contract (required code):**

```python
# repository.py — new
def create_transaction_detail(
    self,
    *,
    allotment_id: uuid.UUID,
    bank_account: str,
    settlement_amount: Decimal,
    transaction_date: date,
    transaction_time: time,
    currency: str,
    reference_no: str | None,
    filed_by: str,
) -> TransactionDetail:
    detail = TransactionDetail(
        id=uuid.uuid4(),
        allotment_id=allotment_id,
        bank_account=bank_account,
        settlement_amount=settlement_amount,
        transaction_date=transaction_date,
        transaction_time=transaction_time,
        currency=currency,
        reference_no=reference_no,
        filed_by=filed_by,
    )
    self.db.add(detail)
    return detail

def get_transaction_detail(self, allotment_id: uuid.UUID) -> TransactionDetail | None:
    return (
        self.db.query(TransactionDetail)
        .filter(TransactionDetail.allotment_id == allotment_id)
        .one_or_none()
    )
```

```python
# service.py
_VALID_CURRENCIES = {"USD", "CHF", "AUD", "GBP", "EUR", "CAD", "HKD"}
_SETTLEMENT_ELIGIBLE_STATUS = {
    AllotRdmpKind.ALLOTMENT: AllotRdmpStatus.ACKNOWLEDGED,
    AllotRdmpKind.REDEMPTION: AllotRdmpStatus.APPROVED,
}

def file_transaction_detail(
    self, allotment_id: uuid.UUID, req: TransactionDetailRequest, *, filed_by: str
) -> TransactionDetailDTO:
    row = self.repo.get_allotment(allotment_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown allotment/redemption")
    if row.status != _SETTLEMENT_ELIGIBLE_STATUS[row.kind]:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Transaction details can only be filed for a confirmed allotment "
            "or an approved redemption",
        )
    if self.repo.get_transaction_detail(allotment_id) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Transaction details already filed")
    if req.currency not in _VALID_CURRENCIES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unsupported currency")
    if req.settlement_amount <= 0:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Settlement amount must be positive"
        )

    try:
        detail = self.repo.create_transaction_detail(
            allotment_id=allotment_id,
            bank_account=req.bank_account,
            settlement_amount=req.settlement_amount,
            transaction_date=req.transaction_date,
            transaction_time=req.transaction_time,
            currency=req.currency,
            reference_no=req.reference_no,
            filed_by=filed_by,
        )
        self.db.commit()
    except Exception:
        self.db.rollback()
        raise
    return self._transaction_detail_to_dto(detail)
```

**Behavior / invariants:**
- Eligibility is looked up per `AllotRdmpKind` — `ALLOTMENT` rows must be `ACKNOWLEDGED` (PC-confirmed), `REDEMPTION` rows must be `APPROVED` (fully approved). Any other status → 403, matching the proposal's status-guard wording ("caller lacks RM role **or row is not in an eligible status**" → 403, not 409, since the row's existence and identity are not in question, only its readiness).
- The 409 idempotency check runs strictly before the insert attempt, giving a clear message; the DB's own UNIQUE constraint (DB layer) is the backstop against a race between two concurrent filing attempts for the same row.
- Currency/amount validation happens in the service, not the router — `TransactionDetailRequest` deliberately keeps `currency: str` (not a `Literal`) per BE-1's note, so this is where the fixed set is enforced.
- The single insert is wrapped in the existing commit/rollback pattern even though it is a single-table write, for consistency with every other mutating method on this service.

**Done when:** filing transaction details for an `ACKNOWLEDGED` allotment (or `APPROVED` redemption) inserts exactly one `transaction_details` row and returns it as `TransactionDetailDTO` with status 201; filing again for the same `allotment_id` returns 409 without touching the DB; filing for a row in any other status returns 403; filing with an unsupported currency or non-positive amount returns 422; filing for an unknown `allotment_id` returns 404.

---

### BE-3 — Transaction-detail retrieval service method (Yes — user req.)

- **Proposal ref:** § "Layer 2 — Backend" A-2
- **Module:** `onboarding` (5.1)
- **Files:** `modify: api-backend/app/libs/onboarding/service.py`
- **Dependencies:** BE-1 (route exists), BE-2 (reuses `repo.get_transaction_detail` and `_transaction_detail_to_dto`).

**Contract (required code):**

```python
# service.py
def get_transaction_detail(self, allotment_id: uuid.UUID) -> TransactionDetailDTO:
    row = self.repo.get_allotment(allotment_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown allotment/redemption")
    detail = self.repo.get_transaction_detail(allotment_id)
    if detail is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No transaction details filed yet")
    return self._transaction_detail_to_dto(detail)
```

**Behavior / invariants:**
- No role/status guard beyond the existing `Action.CLIENT_VIEW` gate on the route itself — reading an already-filed, immutable audit record carries none of BE-2's write-time eligibility concerns.
- Returns 404 (not an empty/null body) when no settlement row exists yet, so the frontend can distinguish "not filed" from a real error without inspecting response shape.

**Done when:** `GET .../transaction-detail` for a row with a filed settlement returns 200 + the exact stored values as `TransactionDetailDTO`; for a row with no settlement filed, returns 404; for an unknown `allotment_id`, returns 404.

---

### BE-4 — Widen `AllotRdmptDTO` with `has_transaction_detail` (Yes)

- **Proposal ref:** § "Layer 2 — Backend" A-3
- **Module:** `onboarding` (5.1)
- **Files:** `modify: api-backend/app/libs/onboarding/schemas.py`, `modify: api-backend/app/libs/onboarding/service.py`
- **Dependencies:** none (purely additive on top of BE-1..BE-3's committed state; touches only the response DTO and its mapper).

**Contract (required code):**

```python
# schemas.py — AllotRdmptDTO gains one field
class AllotRdmptDTO(BaseModel):
    ...  # existing fields unchanged
    has_transaction_detail: bool = False
```

```python
# service.py — _allotment_to_dto: add the field, sourced from an EXISTS-style
# lookup via the same repository method BE-2/BE-3 already use.
def _allotment_to_dto(self, allotment: ClientAllotmentRedemption) -> AllotRdmptDTO:
    ...  # existing body unchanged
    return AllotRdmptDTO(
        ...,  # existing kwargs unchanged
        has_transaction_detail=self.repo.get_transaction_detail(allotment.id) is not None,
    )
```

**Behavior / invariants:**
- Purely additive — every existing field/shape is unchanged; `has_transaction_detail` defaults to `False` so any caller that constructs `AllotRdmptDTO` directly (rather than through `_allotment_to_dto`) keeps compiling.
- One extra query per allotment row when converting to DTO — the same N+1 pattern this method already has for `self.repo.get_by_user_id(allotment.user_id)` (assigned-RM lookup) a few lines above; not optimized further, since this proposal does not target list-endpoint performance.

**Done when:** every endpoint returning `AllotRdmptDTO` (`GET /rm/subscriptions/{client_id}/allotments`, `GET /pc/allotments`, `GET /co/redemptions`) includes `has_transaction_detail: true` for a row with a filed settlement and `has_transaction_detail: false` for one without.

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal §4.1)

```python
# ─── New table ───────────────────────────────────────────────
# transaction_details  (1:1 with client_allotment_redemptions)
#   id               UUID PK
#   allotment_id     UUID FK → client_allotment_redemptions.id, UNIQUE
#   bank_account     String(64)      NOT NULL
#   settlement_amount Numeric(28,10) NOT NULL
#   transaction_date Date            NOT NULL
#   transaction_time Time            NOT NULL
#   currency         String(3)       NOT NULL  (ISO 4217)
#   reference_no     String(64)      NULL
#   filed_by         String(128)     NOT NULL  (firebase_uid of RM)
#   filed_at         DateTime(tz)    NOT NULL  (server-set)

# ─── POST /api/onboarding/rm/allotments/{allotment_id}/transaction-detail ───
class TransactionDetailRequest(BaseModel):
    bank_account: str              # max 64 chars, required
    settlement_amount: Decimal     # required, positive
    transaction_date: date         # required (ISO 8601 date)
    transaction_time: time         # required (HH:MM or HH:MM:SS)
    currency: str                  # required, one of: USD, CHF, AUD, GBP, EUR, CAD, HKD
    reference_no: str | None       # optional, max 64 chars

# Response: 201 Created → TransactionDetailDTO

class TransactionDetailDTO(BaseModel):
    id: uuid.UUID
    allotment_id: uuid.UUID
    bank_account: str
    settlement_amount: float
    transaction_date: date
    transaction_time: time
    currency: str
    reference_no: str | None
    filed_by: str
    filed_at: datetime

# ─── GET /api/onboarding/rm/allotments/{allotment_id}/transaction-detail ───
# Response: 200 → TransactionDetailDTO
# Response: 404 → no settlement filed yet

# ─── AllotRdmptDTO widened ───
class AllotRdmptDTO(BaseModel):
    # ... existing fields ...
    has_transaction_detail: bool = False    # True when a transaction_details row exists

# ─── Errors (POST) ───
# 404  — allotment_id not found or not owned by requesting RM's clients
# 409  — transaction details already filed (immutable — file once)
# 422  — validation failure (bad currency, negative amount, etc.)
# 403  — caller lacks RM role or row is not in an eligible status
```

**Per-layer obligations (verbatim from proposal §4.2):**

| Layer | What this layer contributes | What this layer assumes from the other side |
|---|---|---|
| Database | `transaction_details` table with UNIQUE FK to `client_allotment_redemptions.id`; all detail columns NOT NULL except `reference_no` | Backend only writes validated values (currency in enum range, amount positive, date/time valid) |
| Backend | Serves POST + GET at `/rm/allotments/{allotment_id}/transaction-detail` with role guard (RM) and status guard (confirmed/approved on POST). Returns `TransactionDetailDTO`. Adds `has_transaction_detail` to `AllotRdmptDTO`. | DB table exists. Frontend sends `TransactionDetailRequest` shape exactly. |
| Frontend | Calls POST on Save, calls GET on click when `has_transaction_detail` is true, renders view-only panel for filed records. | Backend returns `has_transaction_detail` on `AllotRdmptDTO` and `TransactionDetailDTO` on the GET endpoint. |

### 7.2 How this layer honours the seam
- **What this layer contributes:** the 2 routes (BE-1), each returning the pinned DTO with the exact status codes in §4.1's error table; filing eligibility gated on kind-specific status (BE-2); the `has_transaction_detail` flag on every `AllotRdmptDTO` (BE-4).
- **What this layer assumes from the other side:** the DB layer's `transaction_details` table (with its UNIQUE FK) exists before this layer's code runs (precondition, §2); the Frontend sends `TransactionDetailRequest` exactly as shaped in §7.1.
- **Change protocol:** any edit to §7 requires editing the proposal first; this section is then re-copied. Never edited in isolation.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Framework / runner:** pytest — command `pytest -q` (from `api-backend/`).
- **Fixtures / seed:** the existing in-memory SQLite pattern in `api-backend/tests/libs/onboarding/conftest.py` (`session`, `make_admin`, `make_client`, `make_model`), extended with a `make_allotment(session, user, model, kind=..., status=...)` helper (new, mirroring the plain `session.add`+`commit` style of the existing factories) to seed a `ClientAllotmentRedemption` row in an arbitrary status for the eligibility tests.
- **Isolation:** hermetic, one fresh in-memory DB per test function — safe to run in parallel.
- **Layer isolation:** tests import only `app/` code, stdlib, pytest, and the existing test doubles in `tests/libs/onboarding/conftest.py`. No sibling layer (DB migration tooling, Frontend) is imported or assumed present beyond the already-applied schema (real SQLAlchemy metadata in this same repo, not a mock).
- **Test location:** `api-backend/tests/libs/onboarding/`, e.g. `test_be2_file_transaction_detail.py`, `test_be3_get_transaction_detail.py`, `test_be4_has_transaction_detail.py`.
- **Commit policy:** tests are **never committed** — `tests/` is git-ignored; generated by `test-gen` and run locally/pre-hand-off.
- **Code generation:** concrete test code is written by the `test-gen` skill (`lite`/`standard`/`thorough`) from §8.2/§8.3 below.
- **Isolated test DB, never live:** every test uses the in-memory SQLite engine — no test may point at the live `portal` DB under any circumstance.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| BE-1 | Routes reject wrong role with 403; correct role reaches the service method | none |
| BE-2 | Filing on an eligible row (allotment=acknowledged, redemption=approved) inserts one `transaction_details` row and returns it; ineligible status → 403; already-filed → 409; bad currency/non-positive amount → 422; unknown `allotment_id` → 404 | none |
| BE-3 | Filed row → 200 + exact stored values; unfiled row → 404; unknown `allotment_id` → 404 | none |
| BE-4 | `has_transaction_detail` is `true` after BE-2 files a row for that allotment, `false` before | none |

### 8.3 Test goals (per unit)

#### BE-1
- **Positive:** each of the 2 routes, called by a user carrying `Action.CLIENT_VIEW`, reaches the corresponding service method and returns its DTO.
- **Negative:** each route called by a user role that lacks `Action.CLIENT_VIEW` returns 403.
- **Invariants:** route registration doesn't collide with an existing `/rm/*` path.
- **Seam mocks:** none — pure in-process FastAPI dependency wiring.

#### BE-2
- **Positive:** filing on an `ALLOTMENT` row with `status=ACKNOWLEDGED` inserts one `transaction_details` row with all 7 submitted fields plus `filed_by`/`filed_at` populated, and returns it as `TransactionDetailDTO`; filing on a `REDEMPTION` row with `status=APPROVED` behaves identically for that kind.
- **Negative:** filing on an `ALLOTMENT` row with `status=PENDING` (not yet acknowledged) → 403; filing on a `REDEMPTION` row with `status=AWAITING_PC` → 403; filing a second time for a row already carrying a `transaction_details` row → 409, and the pre-existing row's fields are unchanged; filing with `currency="XYZ"` → 422; filing with `settlement_amount=0` or negative → 422; filing for a non-existent `allotment_id` → 404.
- **Invariants:** the 409 check and the insert happen inside the same try/except — a forced exception after the eligibility/idempotency checks (e.g. monkeypatched `create_transaction_detail` to raise) leaves no `transaction_details` row behind after rollback.
- **Seam mocks:** none.

#### BE-3
- **Positive:** `GET` for a row with a previously-filed settlement returns 200 with every field matching what was filed (round-trip fidelity, including `Decimal`→`float` for `settlement_amount`).
- **Negative:** `GET` for a row with no settlement filed → 404; `GET` for an unknown `allotment_id` → 404.
- **Invariants:** none beyond round-trip fidelity.
- **Seam mocks:** none.

#### BE-4
- **Positive:** `_allotment_to_dto` on a row with a filed settlement (seeded via `create_transaction_detail`) returns `has_transaction_detail=True`; on a row with none, `has_transaction_detail=False`.
- **Negative:** n/a — this is a pure derived-field check.
- **Invariants:** `has_transaction_detail` is independent of the row's `kind`/`status` — it reflects only whether a `transaction_details` row exists.
- **Seam mocks:** none.

### 8.4 Aggregate gate
- All unit tests green is a local gate run before commit/PR hand-off. Never committed (git-ignored `tests/` dir).
- Target coverage for changed lines: ≥ 90% of new/changed statements in `service.py`/`repository.py`/`router.py`/`schemas.py` for this feature.
- Chosen `test-gen` level for this layer: **standard** (happy path + main negative + role/status-guard per unit) — a small, single-endpoint-family layer with no money-moving side effects (unlike 016's BE layer, this unit never touches `client_subscriptions`/`client_portfolios`); `thorough` is not warranted.

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] BE-1 through BE-4 committed on `transaction-details-wiring-be`; each commit left the branch green.
- [ ] §8 unit tests all pass; `ruff check . && ruff format --check . && mypy app && pytest -q` green.
- [ ] §7 matches the proposal's frozen seam verbatim. Checked against the proposal on the parent branch, not against the DB/FE layers' branches.
- [ ] PR opened against `transaction-details-wiring`; human owns the merge.

**Rollback:** additive-only at the code level — reverting this branch removes 2 routes, 3 service methods, 2 repository methods, 2 request/response DTOs, and 1 DTO field, cleanly, with no effect on any other route. Data already written by the POST route (rows in `transaction_details`) is not destructive to revert at the code level — it simply becomes unreachable via API until the branch is reinstated; the row itself survives until the DB layer's migration is separately downgraded (a distinct, human-owned step per the DB layer's own rollback note).
