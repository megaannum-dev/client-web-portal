# 016 — Allotment & Redemption Integration · Implementation Details — Backend

> Status: **DRAFT — pending implementation.**
> Implements: proposal `docs/proposals/016-2026-07-22-allotment-redemption-integration.md` § "Layer 2 — Backend" (§A–§E) + Design decisions D-1–D-4.
> Layer: **Backend** — one layer per file.
> Sibling layer docs: `docs/implementations/016-allotment-redemption-integration-db.md` (Database), `docs/implementations/016-allotment-redemption-integration-fe.md` (Frontend)
> Execution schedule: `docs/execution-schedules/016-allotment-redemption-integration-be.md`
> Builds on / prerequisites: the DB layer's migration (`down_revision = "deb8fd8a60b6"`) — widens `AllotRdmpStatus` with `awaiting_pc` / `awaiting_co` / `approved` / `rejected`, and adds `reject_reason`, `decided_by`, `decided_at`, `emergent` columns to `client_allotment_redemptions` — must be merged/applied before this layer's units are executable. This doc treats that schema as a precondition and does not re-derive it.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/016-2026-07-22-allotment-redemption-integration.md` § "Layer 2 — Backend" + Design decisions D-1–D-4 |
| Execution schedule | `docs/execution-schedules/016-allotment-redemption-integration-be.md` |
| Sibling layer impl docs | `docs/implementations/016-allotment-redemption-integration-db.md`, `docs/implementations/016-allotment-redemption-integration-fe.md` |
| Builds on | DB layer migration (`down_revision = "deb8fd8a60b6"`) merged/applied — new enum values + 4 columns present on `client_allotment_redemptions` |

---

## 2. Branch & session contract

- **Branch:** `allotment-redemption-integration-be`, cut from parent `allotment-redemption-integration`. All BE-* units land on this one branch.
- **Isolation:** implementable in a separate session in parallel with the DB and FE layer branches, provided the preconditions below hold. Shares state with sibling layers only through the frozen seam in §7.
- **Preconditions (must be true before starting):**
  - [ ] DB migration widening `AllotRdmpStatus` (+ `awaiting_pc`/`awaiting_co`/`approved`/`rejected`) and adding `reject_reason` / `decided_by` / `decided_at` / `emergent` to `client_allotment_redemptions` is applied to the target DB (or merged to the parent branch this layer branches from).
  - [ ] The seam in §7 (proposal §4.1/§4.2) is agreed and frozen — this doc does not renegotiate it.
- **Read-first inventory:**
  - `api-backend/app/models/onboarding.py` — `ClientAllotmentRedemption`, `AllotRdmpStatus`, `AllotRdmpKind` (DB layer widens these; BE reads the widened shape).
  - `api-backend/app/models/pc.py:192-229` — `ClientSubscription` (composite PK `user_id`+`model_id`, `multiplier`, `mgmt_fee_override`/`incentive_fee_override`).
  - `api-backend/app/models/post_trade_allocation.py:117-144` — `ClientPortfolio` (`cash_deposit`, `amount_in_trade`, `previous_amount_in_trade` — the paired-shift fields).
  - `api-backend/app/libs/onboarding/service.py:242-273` — `OnboardingService._approve_initial`, the pattern BE-2 mirrors (read `agg_before` before upsert, `upsert_subscription`, `create_allotment`, insert `client_events`, single commit/rollback).
  - `api-backend/app/libs/onboarding/repository.py:308-367` — `upsert_subscription`, `sum_subscription_multiplier`, `create_allotment`; also `set_initial_portfolio` (:103-122) as the existing precedent for `OnboardingRepository` writing directly to `ClientPortfolio`.
  - `api-backend/app/libs/onboarding/router.py` — existing route registration order, the `Depends(require_action(Action.X))` RBAC pattern, the `_service()` factory.
  - `api-backend/app/libs/onboarding/schemas.py` — `AllotRdmptDTO`, `AllotRdmpStatus`/`AllotRdmpKind` Literal aliases, `ClientSubscriptionRowDTO`, `ClientSubscriptionsDTO`.
  - `api-backend/app/libs/auth/actions.py` — `Action` enum, `ROLE_ACTIONS`.
  - `api-backend/app/libs/post_trade_allocation/repository.py:101-123` — `get_or_create_portfolio`, `upsert_portfolio_deltas` (the existing convention for touching `ClientPortfolio`; this layer must **not** write `client_portfolio_run_deltas`, which belongs exclusively to that module's runs).
  - `api-backend/tests/libs/onboarding/conftest.py` — existing in-memory-SQLite fixture (`session`, `make_admin`, `make_client`, `make_model`) this layer's own tests extend.
- **Hand-off / exit signal:** all BE-* units committed on the branch; `ruff check . && ruff format --check . && mypy app && pytest -q` green; PR opened against `allotment-redemption-integration`.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- **Layering:** router → service → repository. `router.py` depends only on `OnboardingService` via `Depends`; `OnboardingService` depends only on `OnboardingRepository` (plus `self.db` for the rare direct read, matching existing `_approve_initial`/`_allotment_to_dto` style). No unit adds a new module — everything extends the existing `app/libs/onboarding` package, since it already owns `ClientAllotmentRedemption`, `ClientSubscription` writes (via `upsert_subscription`), and `ClientPortfolio` writes (via `set_initial_portfolio`).
- **Single-commit-with-rollback:** every write path that spans more than one table follows the existing pattern verbatim:
  ```python
  try:
      ...  # all repo writes for this unit of work
      self.db.commit()
  except Exception:
      self.db.rollback()
      raise
  ```
- **Decimal precision:** every amount/multiplier column and DTO field uses `Decimal`, matching the existing `Numeric(28, 10)` columns (`ClientSubscription.multiplier`, `ClientAllotmentRedemption.multiplier`/`agg_before`/`agg_after`, `ClientPortfolio.cash_deposit`/`amount_in_trade`/`previous_amount_in_trade`). The $300,000 threshold comparison and the `multiplier × model.model_size` amount computation are done in `Decimal` arithmetic, never `float` — `float` only appears at the DTO boundary (`AllotRdmptDTO.units`/`amount`), same as the existing `_allotment_to_dto`.
- **RBAC action reuse (no new `Action` added):** the proposal's seam (§4.2) pins RM submit to `CLIENT_VIEW`, PC decide to `ALLOTMENT_ACKNOWLEDGE`, CO decide to `ONBOARDING_REVIEW` — all three already exist in `ROLE_ACTIONS` and are already granted to the roles that need them (RM has `CLIENT_VIEW`; PC has `ALLOTMENT_ACKNOWLEDGE`; COMPLIANCE has `ONBOARDING_REVIEW`). **Flag, not silently fixed:** gating a *write* route (`POST /rm/allotment`, `POST /rm/redemption`) behind `CLIENT_VIEW` — an action named for a read capability — is semantically loose; the existing RM router already has `ONBOARDING_MANAGE` and `CLIENT_MANAGE` actions that read more naturally for an RM-initiated write. This doc follows the proposal's frozen seam as written (`CLIENT_VIEW`, functionally sufficient since every RM role carries it) rather than substituting a different existing action or adding a new one — a genuine change here would require a proposal addendum per §4.3, not a unilateral swap in this doc.

### 3.2 CI/CD & engineering discipline
- **Trunk-friendly, small units.** Each BE-* feature below is one atomic, self-reviewable commit that leaves the branch green. No unit depends on an uncommitted sibling within this layer.
- **Every unit is independently revertible.** BE-2/BE-3 (submit paths) and BE-4/BE-5 (decide paths) touch disjoint code paths (submit only ever creates rows in `pending`/`awaiting_pc`/`awaiting_co`; decide only ever transitions an existing row) — reverting one does not corrupt the other's invariants, beyond leaving decide routes unreachable if submit is reverted first (schedule's concern, not this doc's).
- **Additive & backward-compatible first.** All 4 routes are new (§4.1); no existing route's request/response shape changes. `AllotRdmpStatus`/`AllotRdmpKind` Literal widening in `schemas.py` is additive (existing values `pending`/`acknowledged`/`allotment` untouched).
- **Gates before merge** (in order):
  ```bash
  ruff check . && ruff format --check . && mypy app && pytest -q
  ```
  (verified configured in `api-backend/pyproject.toml`: ruff `select = ["E","F","I"]`, mypy over `app`, pytest `testpaths = ["app","tests"]`.)
- **No secrets, no manual steps in the merge path.** No human gate exists in this layer alone — the DB migration's live-DB apply is the schedule's gate, not this doc's.
- **Reversibility documented** — see §9.

---

## 4. Architecture (level 1 of 3)

**Target layout (extends the existing package, no new modules):**
```
app/libs/onboarding/
  router.py     # +4 routes (BE-1)
  service.py    # +4 methods on OnboardingService (BE-2..BE-5)
  repository.py # +1 widened create_allotment, +2 portfolio-shift methods
  schemas.py    # +3 request DTOs, widened AllotRdmpStatus/AllotRdmpKind Literals
```

**Dependency direction:** `router.py` → `service.py` → `repository.py`, unchanged. `repository.py` continues to import `ClientPortfolio` from `app.models.post_trade_allocation` directly (the existing precedent, `set_initial_portfolio`) — it does **not** import `app/libs/post_trade_allocation/repository.py` or `service.py`, and does not touch `client_portfolio_run_deltas` (owned exclusively by that module's runs, per proposal D-1/Non-Goals).

**External seams:**
- **Tables written:** `client_allotment_redemptions` (insert on submit, update on decide), `client_subscriptions` (upsert on allotment submit and on final redemption approval), `client_portfolios` (paired shift on allotment submit and on final redemption approval), `client_events` (insert on submit and on final approval).
- **Tables read:** `models` (for `model_size` → amount computation), `client_subscriptions` (for `sum_subscription_multiplier` and the existing-subscription check).
- **Routes exposed:** the 4 routes in §7.1.
- **Depends on sibling contract:** §7 (frozen seam) — the DB layer's enum/column widening.

---

## 5. Modules (level 2 of 3)

### 5.1 `onboarding` (extended)
- **Responsibility:** serve RM-initiated allotment/redemption submission and PC/CO redemption approval, on top of the existing onboarding-cycle and PC-acknowledge responsibilities already owned here.
- **Files:** `api-backend/app/libs/onboarding/router.py`, `service.py`, `repository.py`, `schemas.py`.
- **Public surface:** 4 new routes (§7.1); `OnboardingService.submit_allotment`, `.submit_redemption`, `.pc_decide_redemption`, `.co_decide_redemption`.
- **Owns features:** BE-1, BE-2, BE-3, BE-4, BE-5.

---

## 6. Features (level 3 of 3 — the work units)

### BE-1 — New routes + RBAC gates + request/response DTOs (MANDATORY)

- **Proposal ref:** § "Layer 2 — Backend" §A; §4.1 (seam)
- **Module:** `onboarding` (5.1)
- **Files:** `modify: api-backend/app/libs/onboarding/router.py`, `modify: api-backend/app/libs/onboarding/schemas.py`
- **Dependencies:** none — parallel-safe with BE-2..BE-5's internals (routes can be committed with methods stubbed, but land together with BE-2..BE-5 in practice since a route with no service method is not shippable green).

**Contract (required code):**

```python
# schemas.py — widen the existing Literal aliases (additive)
AllotRdmpStatus = Literal[
    "pending", "acknowledged", "awaiting_pc", "awaiting_co", "approved", "rejected"
]
AllotRdmpKind = Literal["allotment", "redemption"]  # unchanged, already includes redemption

# schemas.py — new request DTOs, pinned verbatim from proposal §4.1
class SubmitAllotmentReq(BaseModel):
    client_id: uuid.UUID
    model_id: uuid.UUID
    multiplier: Decimal
    expected_cash_in: date | None = None
    mgmt_fee: Decimal | None = None
    incentive_fee: Decimal | None = None

class SubmitRedemptionReq(BaseModel):
    client_id: uuid.UUID
    model_id: uuid.UUID
    multiplier: Decimal
    expected_cash_out: date | None = None
    emergent: bool = False

class RedemptionDecisionReq(BaseModel):
    verdict: Literal["approve", "reject"]
    reason: str | None = None
```

```python
# router.py — 4 new routes
@router.post("/rm/allotment", response_model=AllotRdmptDTO, status_code=201)
def submit_allotment(
    req: SubmitAllotmentReq,
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
) -> AllotRdmptDTO:
    return svc.submit_allotment(req)


@router.post("/rm/redemption", response_model=AllotRdmptDTO, status_code=201)
def submit_redemption(
    req: SubmitRedemptionReq,
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.CLIENT_VIEW))],
) -> AllotRdmptDTO:
    return svc.submit_redemption(req)


@router.post("/pc/redemptions/{allotment_id}/decide", response_model=AllotRdmptDTO)
def pc_decide_redemption(
    allotment_id: uuid.UUID,
    req: RedemptionDecisionReq,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.ALLOTMENT_ACKNOWLEDGE))],
) -> AllotRdmptDTO:
    return svc.pc_decide_redemption(allotment_id, req, decided_by=user.firebase_uid)


@router.post("/co/redemptions/{allotment_id}/decide", response_model=AllotRdmptDTO)
def co_decide_redemption(
    allotment_id: uuid.UUID,
    req: RedemptionDecisionReq,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.ONBOARDING_REVIEW))],
) -> AllotRdmptDTO:
    return svc.co_decide_redemption(allotment_id, req, decided_by=user.firebase_uid)
```

**Behavior / invariants:**
- Routes are registered under the existing `router` (prefix applied at app-mount time, same as every other route in this file) — no new `APIRouter`.
- Error codes match §4.1 exactly: 404 (unknown `allotment_id`), 409 (wrong status for the attempted transition), 422 (Pydantic validation — e.g. `reason` missing when `verdict == "reject"`, enforced in the service since Pydantic alone can't express the cross-field rule cheaply here, matching how `RejectReq` is handled loosely elsewhere in this file today).
- `mgmt_fee`/`incentive_fee` on `SubmitAllotmentReq` are only meaningful in new-subscription mode (mirrors the existing onboarding fee-override convention); for add-allotment mode the service ignores them if a subscription already exists (D-4).

**Done when:** all 4 routes are mounted, return the pinned response model, and reject unauthenticated/wrong-role callers with 403 (existing `require_action` behavior, unchanged).

---

### BE-2 — Allotment submit service method (MANDATORY)

- **Proposal ref:** § "Layer 2 — Backend" §B; D-1, D-4
- **Module:** `onboarding` (5.1)
- **Files:** `modify: api-backend/app/libs/onboarding/service.py`, `modify: api-backend/app/libs/onboarding/repository.py`
- **Dependencies:** BE-1 (schemas/route exist); none from BE-3/4/5.

**Contract (required code):**

```python
# repository.py — widen create_allotment to cover both kinds (backward-compatible:
# existing onboarding call site keeps working with its current keyword set since
# kind/status/note/emergent/source_onboarding_id all default to today's behavior)
def create_allotment(
    self,
    *,
    user_id: uuid.UUID,
    model_id: uuid.UUID,
    multiplier: Decimal,
    agg_before: Decimal,
    agg_after: Decimal,
    kind: AllotRdmpKind = AllotRdmpKind.ALLOTMENT,
    status: AllotRdmpStatus = AllotRdmpStatus.PENDING,
    note: str | None = "initial allotment",
    source_onboarding_id: uuid.UUID | None = None,
    expected_cash_in: datetime | None = None,
    expected_cash_out: datetime | None = None,
    emergent: bool = False,
) -> ClientAllotmentRedemption: ...

# repository.py — new: paired portfolio shift (mirrors set_initial_portfolio's
# get-then-mutate style; no commit here, caller's txn boundary)
def shift_portfolio_for_allotment(self, user_id: uuid.UUID, amount: Decimal) -> None:
    """D-1: cash_deposit -= amount, amount_in_trade += amount,
    previous_amount_in_trade += amount. Preserves the trading delta
    (amount_in_trade - previous_amount_in_trade) and total portfolio value
    (cash_deposit + amount_in_trade) is shifted by zero net, since this moves
    cash INTO trade, not new money in. Does NOT touch client_portfolio_run_deltas
    (proposal D-1 / Non-Goals — that ledger is post-trade-allocation-run only)."""
    portfolio = self.db.get(ClientPortfolio, user_id)
    assert portfolio is not None  # every subscribed client has one, seeded at onboarding
    portfolio.cash_deposit -= amount
    portfolio.amount_in_trade += amount
    portfolio.previous_amount_in_trade += amount
```

```python
# service.py
def submit_allotment(self, req: SubmitAllotmentReq) -> AllotRdmptDTO:
    """Mirrors _approve_initial (service.py:242) without the onboarding
    ceremony: no compliance gate, no users.status change, no document checks."""
    model = self.db.get(Model, req.model_id)
    if model is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown model_id")
    client = self.db.get(User, req.client_id)
    if client is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown client")

    existing = self.db.get(ClientSubscription, (req.client_id, req.model_id))
    # ORDERING: read agg_before BEFORE the upsert -- same constraint as
    # _approve_initial (double-counts this client's own row otherwise).
    agg_before = self.repo.sum_subscription_multiplier(req.model_id)

    if existing is None:
        new_multiplier = req.multiplier                    # new-subscription mode
        mgmt_override = req.mgmt_fee if req.mgmt_fee != model.mgmt_fee else None
        incentive_override = (
            req.incentive_fee if req.incentive_fee != model.incentive_fee else None
        )
    else:
        new_multiplier = existing.multiplier + req.multiplier   # D-4: additive
        mgmt_override = existing.mgmt_fee_override
        incentive_override = existing.incentive_fee_override

    agg_after = agg_before + req.multiplier
    amount = req.multiplier * (model.model_size or Decimal("0"))

    try:
        self.repo.upsert_subscription(
            user_id=req.client_id,
            model_id=req.model_id,
            multiplier=new_multiplier,
            mgmt_fee_override=mgmt_override,
            incentive_fee_override=incentive_override,
        )
        allotment = self.repo.create_allotment(
            user_id=req.client_id,
            model_id=req.model_id,
            multiplier=req.multiplier,          # the submitted delta, not new_multiplier
            agg_before=agg_before,
            agg_after=agg_after,
            kind=AllotRdmpKind.ALLOTMENT,
            status=AllotRdmpStatus.PENDING,
            note="allotment",
            expected_cash_in=(
                datetime.combine(req.expected_cash_in, datetime.min.time())
                if req.expected_cash_in else None
            ),
        )
        self.repo.shift_portfolio_for_allotment(req.client_id, amount)
        self.repo.create_event(
            user_id=req.client_id,
            category="Account Notification",
            title="Allotment submitted",
            body=f"An allotment of {req.multiplier} unit(s) in {model.name} was submitted.",
        )
        self.db.commit()
    except Exception:
        self.db.rollback()
        raise
    return self._allotment_to_dto(allotment)
```

**Behavior / invariants:**
- `agg_before` is read via `sum_subscription_multiplier` strictly before `upsert_subscription` runs for this `(client_id, model_id)` — same ordering constraint as `_approve_initial`.
- New-subscription mode (`existing is None`) applies the fee-override compare-and-set (mirrors 013's C-5); add-allotment mode (`existing is not None`) preserves the existing overrides untouched and increments `multiplier` additively (D-4).
- `create_allotment`'s `multiplier` field stores the submitted delta (the unit's own contribution), consistent with the existing onboarding call site's semantics (`agg_after - agg_before == multiplier`).
- Portfolio shift is D-1's paired shift for the allotment direction: `cash_deposit -= amount`, `amount_in_trade += amount`, `previous_amount_in_trade += amount`.
- All writes (subscription upsert, allotment insert, portfolio shift, event insert) share one commit; any exception rolls back the entire set.

**Done when:** submitting an allotment for an existing subscription increments `multiplier` additively, inserts one `client_allotment_redemptions` row (`kind=allotment`, `status=pending`), shifts the 3 portfolio fields per D-1, inserts one `client_events` row, and all four writes land atomically.

---

### BE-3 — Redemption submit service method (MANDATORY)

- **Proposal ref:** § "Layer 2 — Backend" §C; D-2, D-3
- **Module:** `onboarding` (5.1)
- **Files:** `modify: api-backend/app/libs/onboarding/service.py`
- **Dependencies:** BE-1, BE-2 (reuses `create_allotment`'s widened signature).

**Contract (required code):**

```python
# service.py
_REDEMPTION_CO_THRESHOLD = Decimal("300000")

def _needs_co(self, amount: Decimal) -> bool:
    return amount > _REDEMPTION_CO_THRESHOLD

def submit_redemption(self, req: SubmitRedemptionReq) -> AllotRdmptDTO:
    model = self.db.get(Model, req.model_id)
    if model is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown model_id")
    sub = self.db.get(ClientSubscription, (req.client_id, req.model_id))
    multiplier = req.multiplier
    if sub is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No subscription to redeem from")
    if req.emergent:
        multiplier = sub.multiplier    # D-3: emergent redeems the FULL current holding
    if multiplier > sub.multiplier:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Redemption exceeds current subscription"
        )

    amount = multiplier * (model.model_size or Decimal("0"))
    status_ = AllotRdmpStatus.AWAITING_CO if self._needs_co(amount) else AllotRdmpStatus.AWAITING_PC
    agg_before = self.repo.sum_subscription_multiplier(req.model_id)
    agg_after = agg_before - multiplier   # preview snapshot; not applied until final approval

    expected_cash_out = req.expected_cash_out
    if req.emergent:
        expected_cash_out = date.today() + timedelta(days=1)   # D-3: forced T+1

    try:
        allotment = self.repo.create_allotment(
            user_id=req.client_id,
            model_id=req.model_id,
            multiplier=multiplier,
            agg_before=agg_before,
            agg_after=agg_after,
            kind=AllotRdmpKind.REDEMPTION,
            status=status_,
            note="emergent redemption" if req.emergent else "redemption",
            expected_cash_out=(
                datetime.combine(expected_cash_out, datetime.min.time())
                if expected_cash_out else None
            ),
            emergent=req.emergent,
        )
        self.repo.create_event(
            user_id=req.client_id,
            category="Account Notification",
            title="Redemption submitted",
            body=f"A redemption of {multiplier} unit(s) in {model.name} was submitted for approval.",
        )
        self.db.commit()
    except Exception:
        self.db.rollback()
        raise
    return self._allotment_to_dto(allotment)
```

**Behavior / invariants:**
- Does **not** call `upsert_subscription` or any portfolio-shift method — `client_subscriptions` and `client_portfolios` are untouched until final approval (§ "Redemption approval logic").
- Routing: `amount > $300,000` → `awaiting_co` (needs both CO then PC, D-2's sequential machine); else → `awaiting_pc` (PC only).
- D-3 (emergent): no bypass — routing and both approval gates apply identically whether `emergent` is set or not; the flag only forces `multiplier = sub.multiplier` (full redemption) and `expected_cash_out = T+1`, both recorded on the row for audit (`emergent` column, `note`).
- `agg_after` here is a **preview** (`agg_before - multiplier`), matching the existing convention that `agg_before`/`agg_after` are snapshotted once at insert and never recomputed (onboarding.py's `ClientAllotmentRedemption` docstring) — the actual subscription decrement happens later, at final approval, independently.

**Done when:** submitting a redemption ≤ $300k lands in `awaiting_pc`; > $300k lands in `awaiting_co`; `client_subscriptions`/`client_portfolios` are unchanged by this call; one `client_allotment_redemptions` row and one `client_events` row are inserted atomically.

---

### BE-4 — PC decide service method (MANDATORY)

- **Proposal ref:** § "Layer 2 — Backend" §D (PC decide); D-2
- **Module:** `onboarding` (5.1)
- **Files:** `modify: api-backend/app/libs/onboarding/service.py`, `modify: api-backend/app/libs/onboarding/repository.py`
- **Dependencies:** BE-3 (operates on rows BE-3 creates). **Self-contained:** this unit defines and owns `_execute_redemption_approval`/`shift_portfolio_for_redemption` (moved here from an earlier draft that placed them under BE-5 — that draft had BE-4's own code forward-referencing a BE-5 symbol, which would fail `mypy` if BE-4 were committed before BE-5; keeping the sole caller and the callee in the same unit removes that ordering hazard entirely, with zero cross-unit code dependency left between BE-4 and BE-5).

**Contract (required code):**

```python
# repository.py — the D-1 redemption-direction paired shift, symmetric to BE-2's
def shift_portfolio_for_redemption(self, user_id: uuid.UUID, amount: Decimal) -> None:
    """D-1: amount_in_trade -= amount, previous_amount_in_trade -= amount,
    cash_deposit += amount. Does NOT touch client_portfolio_run_deltas."""
    portfolio = self.db.get(ClientPortfolio, user_id)
    assert portfolio is not None
    portfolio.amount_in_trade -= amount
    portfolio.previous_amount_in_trade -= amount
    portfolio.cash_deposit += amount
```

```python
# service.py
def pc_decide_redemption(
    self, allotment_id: uuid.UUID, req: RedemptionDecisionReq, *, decided_by: str
) -> AllotRdmptDTO:
    row = self.repo.get_allotment(allotment_id)
    if row is None or row.kind != AllotRdmpKind.REDEMPTION:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown redemption")
    if row.status == AllotRdmpStatus.AWAITING_CO:
        raise HTTPException(status.HTTP_409_CONFLICT, "Awaiting Compliance decision first")
    if row.status != AllotRdmpStatus.AWAITING_PC:
        raise HTTPException(status.HTTP_409_CONFLICT, "Redemption already decided")

    try:
        if req.verdict == "reject":
            if not req.reason:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "reason is required")
            row.status = AllotRdmpStatus.REJECTED
            row.reject_reason = req.reason
            row.decided_by = decided_by
            row.decided_at = datetime.utcnow()
        else:  # approve -- awaiting_pc is always the LAST gate (D-2's sequential
               # machine: awaiting_co -> awaiting_pc -> approved), so this is final.
            self._execute_redemption_approval(row, decided_by=decided_by)
        self.db.commit()
    except Exception:
        self.db.rollback()
        raise
    return self._allotment_to_dto(row)


def _execute_redemption_approval(
    self, row: ClientAllotmentRedemption, *, decided_by: str
) -> None:
    """Terminal step, called only from pc_decide_redemption above (this same
    unit) once a row reaches its final PC gate. (1) read agg_before, (2)
    decrement client_subscriptions.multiplier (delete the row if it reaches
    0), (3) agg_after = agg_before - row.multiplier, (4) paired portfolio
    shift (D-1 redemption direction), (5) status=approved + decided_by/
    decided_at, (6) insert client_events. No commit here -- caller's txn
    boundary. Defined in this unit (not BE-5) because pc_decide_redemption,
    its only caller, lives here."""
    model = self.db.get(Model, row.model_id)
    assert model is not None
    agg_before = self.repo.sum_subscription_multiplier(row.model_id)

    sub = self.db.get(ClientSubscription, (row.user_id, row.model_id))
    assert sub is not None
    remaining = sub.multiplier - row.multiplier
    if remaining <= 0:
        self.db.delete(sub)
    else:
        sub.multiplier = remaining

    agg_after = agg_before - row.multiplier
    amount = row.multiplier * (model.model_size or Decimal("0"))
    self.repo.shift_portfolio_for_redemption(row.user_id, amount)

    row.status = AllotRdmpStatus.APPROVED
    row.decided_by = decided_by
    row.decided_at = datetime.utcnow()
    row.agg_before = agg_before      # re-snapshotted at the point of real effect
    row.agg_after = agg_after

    self.repo.create_event(
        user_id=row.user_id,
        category="Account Notification",
        title="Redemption approved",
        body=f"Your redemption of {row.multiplier} unit(s) in {model.name} has been approved.",
    )
```

**Behavior / invariants:**
- `awaiting_co` → 409 ("this is the CO endpoint's job", per proposal §D) — PC cannot pre-empt Compliance on a >$300k row.
- Reject requires a `reason` (422 if missing), matching §4.1's error-code table.
- Approve while `status == awaiting_pc` is always the **final** gate under D-2's strict sequential machine (`awaiting_co → awaiting_pc → approved`): a row only ever reaches `awaiting_pc` either because it started there (≤$300k, PC-only) or because CO already approved and handed off (BE-5, which only ever sets `status = awaiting_pc` and touches nothing else). Either way, PC approval here is terminal — it always calls `_execute_redemption_approval` (defined in this same unit, immediately above), never a partial transition.
- `_execute_redemption_approval` re-reads `agg_before` at the point of real effect (not reusing BE-3's submit-time preview), matching `_approve_initial`'s ordering rule (read the aggregate before mutating `client_subscriptions` for this same model).
- If the redemption fully closes the subscription (`remaining <= 0`), the `client_subscriptions` row is deleted, mirroring how `upsert_subscription` treats "no row" as "no subscription."

**Done when:** PC reject sets `status=rejected`, `reject_reason`, `decided_by`, `decided_at`, leaves `client_subscriptions`/`client_portfolios` untouched. PC approve on an `awaiting_pc` row decrements the subscription, shifts the portfolio (D-1 redemption direction), and sets `status=approved`. This unit compiles and type-checks standalone — `_execute_redemption_approval` is defined here, not forward-referenced from BE-5.

---

### BE-5 — CO decide service method (MANDATORY)

- **Proposal ref:** § "Layer 2 — Backend" §D (CO decide); D-2
- **Module:** `onboarding` (5.1)
- **Files:** `modify: api-backend/app/libs/onboarding/service.py`
- **Dependencies:** BE-3 only. **No code dependency on BE-4:** `co_decide_redemption` never calls `_execute_redemption_approval` (that call lives entirely inside BE-4's `pc_decide_redemption`) — CO-approve only ever sets `status = awaiting_pc` and returns. BE-4 and BE-5 may be implemented/committed in either order or in parallel; neither references a symbol the other defines.

**Contract (required code):**

```python
# service.py
def co_decide_redemption(
    self, allotment_id: uuid.UUID, req: RedemptionDecisionReq, *, decided_by: str
) -> AllotRdmptDTO:
    row = self.repo.get_allotment(allotment_id)
    if row is None or row.kind != AllotRdmpKind.REDEMPTION:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown redemption")
    if row.status != AllotRdmpStatus.AWAITING_CO:
        raise HTTPException(status.HTTP_409_CONFLICT, "Not awaiting Compliance decision")

    try:
        if req.verdict == "reject":
            if not req.reason:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "reason is required")
            row.status = AllotRdmpStatus.REJECTED
            row.reject_reason = req.reason
            row.decided_by = decided_by
            row.decided_at = datetime.utcnow()
        else:  # approve -- D-2: CO is the FIRST gate for a >$300k row; hand off
               # to PC. Never transitions straight to approved -- PC still owes
               # the terminal decision (BE-4's _execute_redemption_approval),
               # so decided_by/decided_at/execute are NOT stamped here.
            row.status = AllotRdmpStatus.AWAITING_PC
        self.db.commit()
    except Exception:
        self.db.rollback()
        raise
    return self._allotment_to_dto(row)
```

**Behavior / invariants:**
- CO decide is only valid when `status == awaiting_co` — 409 otherwise (covers both "already `awaiting_pc`" and "already terminal").
- CO reject is a full terminal decision (stamps `reject_reason`/`decided_by`/`decided_at` immediately, same as PC reject).
- CO approve is **not** terminal — under D-2's `awaiting_co → awaiting_pc → approved` sequential machine, CO is always the first of the two required gates for a >$300k row, so approval only ever hands off to `awaiting_pc`; the single `decided_by`/`decided_at`/`agg_before`/`agg_after` column set is reserved for whichever decision is actually final (reject at either gate, or PC's terminal approve in BE-4), so CO's approve does not overwrite them and does not call BE-4's helper.

**Done when:** CO reject on an `awaiting_co` row sets `rejected` + decision fields, no subscription/portfolio change. CO approve on an `awaiting_co` row transitions to `awaiting_pc` only, no subscription/portfolio change. This unit compiles and type-checks standalone, with or without BE-4 present. A subsequent PC approve (BE-4) on that `awaiting_pc` row then decrements the subscription, shifts the portfolio, and sets `approved`.

---

### BE-6 — Widen `AllotRdmptDTO` with approval/emergent fields (MANDATORY, addendum 2026-07-23)

- **Proposal ref:** § "Layer 2 — Backend" §F (addendum), F-1
- **Module:** `onboarding` (5.1)
- **Files:** `modify: api-backend/app/libs/onboarding/schemas.py`, `modify: api-backend/app/libs/onboarding/service.py`
- **Dependencies:** none (purely additive on top of BE-1..BE-5's committed state; touches only the response DTO and its mapper).

**Contract (required code):**

```python
# schemas.py — AllotRdmptDTO gains 5 optional-in-practice fields, all backed
# by columns that already exist on ClientAllotmentRedemption (DB-2 + the
# 016 gap-fix migration) but were never serialized.
class AllotRdmptDTO(BaseModel):
    ...  # existing fields unchanged
    emergent: bool
    expected_cash_out: datetime | None
    decided_by: str | None
    decided_at: datetime | None
    reject_reason: str | None
```

```python
# service.py — _allotment_to_dto: add the 5 fields to the constructed DTO
def _allotment_to_dto(self, allotment: ClientAllotmentRedemption) -> AllotRdmptDTO:
    ...  # existing body unchanged
    return AllotRdmptDTO(
        ...,  # existing kwargs unchanged
        emergent=allotment.emergent,
        expected_cash_out=allotment.expected_cash_out,
        decided_by=allotment.decided_by,
        decided_at=allotment.decided_at,
        reject_reason=allotment.reject_reason,
    )
```

**Behavior / invariants:**
- Purely additive — every existing field/shape is unchanged; every new field reads directly off the ORM row, no derived logic.
- `emergent` defaults to `False` at the DB level (`server_default=text("false")`), so it's never `None`; the other 4 are legitimately nullable (unset until a decision/emergent-flagged submit happens).

**Done when:** `GET /pc/allotments` and `GET /co/redemptions` (BE-7) both return the 5 new fields with real values for rows that have them set, and `False`/`None` for rows that don't.

---

### BE-7 — `GET /co/redemptions` read route (MANDATORY, addendum 2026-07-23)

- **Proposal ref:** § "Layer 2 — Backend" §F (addendum), F-2
- **Module:** `onboarding` (5.1)
- **Files:** `modify: api-backend/app/libs/onboarding/router.py`
- **Dependencies:** none — reuses `OnboardingService.list_allotments()` (already committed, BE-... predates this addendum) verbatim, zero new service/repository code.

**Contract (required code):**

```python
# router.py — new route, placed next to the existing CO decide route.
# Mirrors GET /pc/allotments exactly (same service call, same unfiltered
# list[AllotRdmptDTO] shape) but gated by ONBOARDING_REVIEW instead of
# ALLOTMENT_ACKNOWLEDGE, since this is the Compliance/CO role's read path.
@router.get("/co/redemptions", response_model=list[AllotRdmptDTO])
def get_co_redemptions(
    svc: Annotated[OnboardingService, Depends(_service)],
    _: Annotated[User, Depends(require_action(Action.ONBOARDING_REVIEW))],
) -> list[AllotRdmptDTO]:
    return svc.list_allotments()
```

**Behavior / invariants:**
- No new service method — `list_allotments()` already returns every `client_allotment_redemptions` row (both `kind`s) unfiltered, same as `GET /pc/allotments`. The Frontend layer is expected to filter `kind === "redemption"` client-side, the same convention the PC page already uses.
- Path is `/co/redemptions`, not `/compliance/redemptions` — intentionally mirrors the existing (frozen, already-shipped) `/co/redemptions/{id}/decide` route's prefix rather than this router's broader `/compliance/*` convention used elsewhere. See proposal §F-2 "Path note" for the full rationale; not silently reconciled.
- RBAC: `Action.ONBOARDING_REVIEW` — the same action already gating `co_decide_redemption`, already granted to the COMPLIANCE role.

**Done when:** a user carrying `ONBOARDING_REVIEW` calling `GET /co/redemptions` receives every allotment/redemption row (both kinds) with status codes matching `GET /pc/allotments`'s existing behavior; a user lacking that action gets 403.

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal §4.1)

```python
# --- Enums (DB layer, consumed by all) ---

class AllotRdmpStatus(str, Enum):
    PENDING      = "pending"       # existing
    ACKNOWLEDGED = "acknowledged"  # existing
    # NEW:
    AWAITING_PC  = "awaiting_pc"   # redemption submitted, needs PC approval
    AWAITING_CO  = "awaiting_co"   # redemption submitted, needs Compliance approval (amount > $300k)
    APPROVED     = "approved"      # redemption fully approved, took effect
    REJECTED     = "rejected"      # redemption rejected by PC or CO

# --- Request DTOs (Frontend → Backend) ---

class SubmitAllotmentReq(BaseModel):
    client_id: uuid.UUID
    model_id: uuid.UUID
    multiplier: Decimal            # number of units
    expected_cash_in: date | None  # settlement date (nullable)
    # fee overrides — only populated for new-subscription mode
    mgmt_fee: Decimal | None = None
    incentive_fee: Decimal | None = None

class SubmitRedemptionReq(BaseModel):
    client_id: uuid.UUID
    model_id: uuid.UUID
    multiplier: Decimal            # units to redeem
    expected_cash_out: date | None # settlement date
    emergent: bool = False         # emergent big redemption flag

# --- Response DTOs (Backend → Frontend) ---
# Reuses existing AllotRdmptDTO (onboarding/schemas.py) — no new shape needed.
# The `status` field now includes the new enum values above.

# --- Approval request DTO ---
class RedemptionDecisionReq(BaseModel):
    verdict: Literal["approve", "reject"]
    reason: str | None = None      # required when verdict == "reject"

# --- Routes ---
# POST /api/onboarding/rm/allotment          → AllotRdmptDTO   (201)
# POST /api/onboarding/rm/redemption         → AllotRdmptDTO   (201)
# POST /api/onboarding/pc/redemptions/{id}/decide   → AllotRdmptDTO   (200)
# POST /api/onboarding/co/redemptions/{id}/decide   → AllotRdmptDTO   (200)
#
# Error codes: 404 (not found), 409 (wrong status), 422 (validation)
```

**Per-layer obligations (verbatim from proposal §4.2):**

| Layer | What this layer contributes | What this layer assumes from the other side |
|---|---|---|
| Database | Widens `AllotRdmpStatus` enum with 4 new values; adds `reject_reason`, `decided_by`, `decided_at` columns to `client_allotment_redemptions`; adds `emergent` boolean column | Backend only writes valid enum values |
| Backend | Serves the 4 routes above; allotment immediately upserts `client_subscriptions` + inserts `client_allotment_redemptions` (status=`pending`); redemption inserts with status=`awaiting_pc` (or `awaiting_co` if amount > $300k); approval endpoints transition status and (on final approve) upsert `client_subscriptions` | DB columns from §4.1 are present; Frontend sends DTOs exactly as specified |
| Frontend | Calls POST endpoints on modal submit; renders new statuses in TxnTable with appropriate chips; disables modal submit while in-flight | Backend returns AllotRdmptDTO exactly as in §4.1 with the new status values |

### 7.2 How this layer honours the seam
- **What this layer contributes:** the 4 routes (BE-1), each returning `AllotRdmptDTO` with the exact status codes in §4.1's route table; allotment submit's immediate `client_subscriptions` upsert (BE-2); redemption submit's `awaiting_pc`/`awaiting_co` routing with no subscription/portfolio write (BE-3); PC/CO decide transitioning status and, only on final approval, upserting `client_subscriptions` (BE-4/BE-5).
- **What this layer assumes from the other side:** the DB layer's 4 new enum values and 4 new columns exist on `client_allotment_redemptions` before this layer's code runs (precondition, §2); the Frontend sends `SubmitAllotmentReq`/`SubmitRedemptionReq`/`RedemptionDecisionReq` exactly as shaped in §7.1.
- **Change protocol:** any edit to §7 requires editing the proposal first; this section is then re-copied. Never edited in isolation.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Framework / runner:** pytest — command `pytest -q` (from `api-backend/`).
- **Fixtures / seed:** the existing in-memory SQLite pattern in `api-backend/tests/libs/onboarding/conftest.py` — a `session` fixture (`sqlite:///:memory:`, `StaticPool`, `Base.metadata.create_all`), plus `make_admin`/`make_client`/`make_model` factory helpers. This layer's tests extend that conftest with a `make_subscription(session, user, model, multiplier=...)` helper and a `make_portfolio(session, user, cash_deposit=..., amount_in_trade=..., previous_amount_in_trade=...)` helper (new, following the same plain-`session.add`+`commit` style as `make_client`).
- **Isolation:** hermetic, one fresh in-memory DB per test function (function-scoped `session` fixture, matching the existing convention) — safe to run in parallel.
- **Layer isolation:** tests import only `app/` code, stdlib, pytest, and the existing test doubles in `tests/libs/onboarding/conftest.py` / `tests/libs/clients/conftest.py`. No sibling layer (DB migration tooling, Frontend) is imported or assumed present beyond the already-applied schema (which is real SQLAlchemy metadata in this same repo, not a mock — the DB layer's model changes are code, not a separate service to fake).
- **Test location:** `api-backend/tests/libs/onboarding/` (mirrors source path), e.g. `test_be2_submit_allotment.py`, `test_be3_submit_redemption.py`, `test_be4_pc_decide.py`, `test_be5_co_decide.py`.
- **Commit policy:** tests are **never committed** — `tests/` is git-ignored; generated by `test-gen` and run locally/pre-hand-off.
- **Code generation:** concrete test code is written by the `test-gen` skill (`lite`/`standard`/`thorough`) from §8.2/§8.3 below.
- **Isolated test DB, never live:** every test uses the in-memory SQLite engine created by the `session` fixture — no test may point at the live `portal` MariaDB/Postgres instance under any circumstance.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| BE-1 | Routes reject wrong role with 403; correct role reaches the service method | none |
| BE-2 | Add-allotment increments `multiplier` additively (D-4); new-subscription mode sets fee overrides via compare-and-set; inserts `client_allotment_redemptions` (`kind=allotment`, `status=pending`); inserts `client_events`; shifts portfolio (`cash_deposit` down, `amount_in_trade` up, `previous_amount_in_trade` up, by the same amount) | none |
| BE-3 | Does not touch `client_subscriptions`/`client_portfolios`; routes to `awaiting_pc` at/below $300k, `awaiting_co` above; emergent flag forces full-multiplier redemption + T+1 `expected_cash_out` but does NOT bypass either gate (D-3) | none |
| BE-4 | Reject sets `rejected`+decision fields, no side effects on subscription/portfolio; approve on `awaiting_pc` executes the terminal update (decrement multiplier, delete row at 0, paired portfolio shift, `approved`); approve/reject on `awaiting_co` is rejected (409) | none |
| BE-5 | Reject sets `rejected`+decision fields; approve on `awaiting_co` hands off to `awaiting_pc` only (no subscription/portfolio/decision-field write); decide on any other status is rejected (409); full two-gate sequence (CO approve → PC approve) reaches `approved` with correct final multiplier/portfolio state | none |
| BE-2/BE-4/BE-5 (cross-cutting) | Allotment submit and redemption final-approval's paired `client_portfolios` shift (D-1) does not register as a trade-reconciliation break — see dedicated invariant below | none — exercises the existing `app/libs/reconciliation` engine directly, no sibling-layer mock needed (same layer, same repo) |

### 8.3 Test goals (per unit)

#### BE-1
- **Positive:** each of the 4 routes, called by a user carrying the required action, reaches the corresponding service method and returns its `AllotRdmptDTO`.
- **Negative:** each route called by a user role that lacks the required action (`Action.CLIENT_VIEW` / `ALLOTMENT_ACKNOWLEDGE` / `ONBOARDING_REVIEW`) returns 403.
- **Invariants:** route registration doesn't shadow or get shadowed by an existing `/rm/*`, `/pc/*`, `/compliance/*` path (no path-prefix collision).
- **Seam mocks:** none — this is pure in-process FastAPI dependency wiring, no sibling layer involved.

#### BE-2
- **Positive:** add-allotment on an existing subscription (`multiplier=3`) submitting `multiplier=2` results in `client_subscriptions.multiplier == 5` (D-4); a fresh new-subscription submit with `mgmt_fee`/`incentive_fee` differing from the model's defaults sets `mgmt_fee_override`/`incentive_fee_override`, and submitting the model's own default fees leaves both `None`; the inserted `client_allotment_redemptions` row has `kind=allotment`, `status=pending`, `agg_after - agg_before == multiplier`; exactly one `client_events` row is inserted; `client_portfolios` shows `cash_deposit` decreased by `amount`, `amount_in_trade` increased by `amount`, `previous_amount_in_trade` increased by the same `amount` (D-1).
- **Negative:** unknown `model_id` → 422; unknown `client_id` → 404.
- **Invariants:** `agg_before` read happens before the subscription upsert regardless of add-allotment vs. new-subscription mode (assert via a second concurrent-style call ordering check, or by asserting `agg_after == agg_before + multiplier` holds even when two allotments for the same model are submitted in sequence). All 4 writes (subscription, allotment row, portfolio, event) commit atomically — a forced exception after the subscription upsert (e.g. monkeypatched `create_event` to raise) leaves the subscription's `multiplier` unchanged after rollback.
- **Seam mocks:** none.

#### BE-3
- **Positive:** redemption of `multiplier` whose `amount = multiplier * model.model_size` is exactly `$300,000` → `awaiting_pc` (boundary is "> $300k", not "≥"); one dollar above → `awaiting_co`; `emergent=True` ignores the requested `multiplier` and redeems the full current subscription multiplier, and sets `expected_cash_out` to tomorrow regardless of the requested date.
- **Negative:** redemption `multiplier` greater than the current subscription's `multiplier` (non-emergent) → 422; redemption against a client with no subscription for that model → 404.
- **Invariants:** after a successful submit, `client_subscriptions.multiplier` and every `client_portfolios` field are byte-for-byte unchanged from before the call, regardless of routing outcome or emergent flag.
- **Seam mocks:** none.

#### BE-4
- **Positive:** reject on `awaiting_pc` sets `status=rejected`, `reject_reason`, `decided_by`, `decided_at`, and leaves `client_subscriptions`/`client_portfolios` untouched; approve on `awaiting_pc` (row that started there directly, ≤$300k) decrements `client_subscriptions.multiplier` by the row's `multiplier`, deletes the subscription row if the result is ≤ 0, shifts `client_portfolios` per D-1's redemption direction (`amount_in_trade` down, `previous_amount_in_trade` down, `cash_deposit` up, all by `amount`), and sets `status=approved` + `decided_by`/`decided_at`.
- **Negative:** reject/approve on a row whose `status == awaiting_co` → 409 ("Compliance decision first"); reject/approve on a row already `approved`/`rejected` → 409; reject without a `reason` → 422.
- **Invariants:** the terminal approval's `agg_before`/`agg_after` re-snapshot on the row reflects the aggregate at the moment of real effect, not the submit-time preview from BE-3 (they may legitimately differ if other allotments/redemptions landed in between).
- **Seam mocks:** none.

#### BE-5
- **Positive:** reject on `awaiting_co` sets `status=rejected` + decision fields, no subscription/portfolio change; approve on `awaiting_co` sets `status=awaiting_pc` only — `decided_by`/`decided_at`/`client_subscriptions`/`client_portfolios` all unchanged by this call alone; a full sequence (CO approve → PC approve via BE-4) ends with `status=approved`, correct decremented `multiplier`, correct shifted portfolio, and `decided_by`/`decided_at` reflecting the **PC** user's uid (the final decider), not CO's.
- **Negative:** decide (either verdict) on a row whose `status` is `awaiting_pc`/`approved`/`rejected` → 409; reject without a `reason` → 422.
- **Invariants:** CO approve is idempotently non-terminal — calling CO-decide a second time on the same row (now `awaiting_pc`) is rejected 409 rather than silently re-approving.
- **Seam mocks:** none.

#### BE-2/BE-4/BE-5 — Reconciliation non-interference (cross-cutting invariant, D-1)

This is the concrete test of D-1's safety claim: allotment/redemption must be invisible to `app/libs/reconciliation`, not just "believed" to be. The engine's per-client and coarse checks (`app/libs/reconciliation/engine.py:104-133`) read `client_portfolio_run_deltas` exclusively (via `CRMAdapter.total_portfolio_delta_for_run`/`portfolio_delta_for_run`, `adapters/crm.py`) — post-`d598615`, neither ever queries `client_portfolios` directly. Since `shift_portfolio_for_allotment`/`shift_portfolio_for_redemption` (BE-2/BE-4/BE-5) mutate only `client_portfolios` and never insert a row into `client_portfolio_run_deltas`, the reconciliation engine has no code path through which an allotment/redemption shift can be seen at all — this test proves that, rather than assuming it.

- **Positive:** seed one `PostTradeAllocationRun`/`ReconSession` + a `ClientPortfolioRunDelta` row for a client/run (representing a settled trading day), plus matching `AlgoTradeOrder`/`Order`/allocation-snapshot rows so `reconcile()` returns a deterministic **baseline** `ReconciliationResult` (assert `coarse_ok` and the exact `algo_total`/`ib_total`/`crm_total` values, or the exact `crm_breaks`/`client_model_breaks` if the fixture is intentionally broken). Then, for that **same client**, execute BE-2 (allotment submit) and separately BE-4/BE-5's terminal redemption approval — each of which shifts `client_portfolios.cash_deposit`/`amount_in_trade`/`previous_amount_in_trade` per D-1. Re-run `reconcile()` for the **same session** afterward: `crm_total` (`CRMAdapter.total_portfolio_delta_for_run`, summed over `client_portfolio_run_deltas` filtered by that `run_id`), every per-client `crm_ok_by_client` entry (`CRMAdapter.portfolio_delta_for_run`), and the full `ReconciliationResult` (`coarse_ok`, `crm_breaks`, `client_model_breaks`, `crm_algo_breaks`) must be **byte-for-byte identical** to the baseline — the allotment/redemption must not flip a previously-clean run into a break, nor mask a previously-broken one.
- **Negative:** assert directly (not just by absence of a break) that after BE-2/BE-4/BE-5 run, `db.query(ClientPortfolioRunDelta).filter_by(user_id=<client>).count()` is unchanged from before the call — i.e. the shift genuinely never touches the delta ledger, so the "no break" result isn't a coincidence of the epsilon tolerance (`get_settings().recon_notional_epsilon`) swallowing a real discrepancy. Also assert `ClientPortfolio.amount_in_trade` for that client *does* change (the shift itself really happened) while `ClientPortfolioRunDelta` rows for that client/run are untouched — proving the invariant holds because of the code path (no ledger write), not because the shift happened to be zero.
- **Invariants:** this must hold for both directions (allotment increases `amount_in_trade`, redemption decreases it) and regardless of shift magnitude — parametrize the shift amount (small, large, larger than the seeded run's own delta) to rule out an epsilon-masking false negative.
- **Seam mocks:** none — `app/libs/reconciliation` is same-layer code, exercised directly against the same in-memory test DB as the rest of this layer's fixtures.

### 8.4 Aggregate gate
- All unit tests green is a local gate run before commit/PR hand-off. Never committed (git-ignored `tests/` dir).
- Target coverage for changed lines: ≥ 90% of new/changed statements in `service.py`/`repository.py`/`router.py`/`schemas.py` for this feature.
- Chosen `test-gen` level for this layer: **thorough** (money-moving logic — subscription multiplier and portfolio balances — warrants edge/boundary cases beyond the happy path, matching the existing `013`/`014` onboarding tests' own `thorough` provenance visible in their conftest header).

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] BE-1 through BE-5 committed on `allotment-redemption-integration-be`; each commit left the branch green.
- [ ] BE-6, BE-7 (addendum 2026-07-23) committed — on the parent branch directly, per the same precedent as the Frontend layer's FE-6/FE-7 addendum (a small, already-integrated-layer patch, not a fresh layer-branch run).
- [ ] §8 unit tests all pass; `ruff check . && ruff format --check . && mypy app && pytest -q` green.
- [ ] §7 matches the proposal's frozen seam verbatim. Checked against the proposal on the parent branch, not against the DB/FE layers' branches.
- [ ] PR opened against `allotment-redemption-integration`; human owns the merge.

**Rollback:** additive-only at the code level — reverting this branch removes 4 routes, 4 service methods, 2 repository methods, and 3 request DTOs cleanly, with no effect on any other route. Data already written by these routes (rows in `client_allotment_redemptions`, upserted `client_subscriptions`, shifted `client_portfolios`, inserted `client_events`) is not destructive — every write here is additive (new rows) or a reversible arithmetic shift (the exact inverse of D-1's paired shift undoes a portfolio change; decrementing/incrementing `client_subscriptions.multiplier` back is likewise invertible). This proposal does not implement an undo endpoint — reversing already-approved redemptions/allotments after the fact would require a manual DB correction, not a code rollback.
