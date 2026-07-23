# 016 — Allotment & Redemption Integration (Model Subscription page)

> Status: **DRAFT — pending implementation approval.**
> Scope: RM-facing Model Subscription page — submit allotment / submit redemption, backend endpoints, DB schema additions for approval workflow. Excludes: client portal pages, request ticket page (accept/reject), Portfolio Commander UI.
> Constraint: No design/layout change to existing Model Subscription page components (SubscriptionAccordion, SubscriptionFormModal visual structure). Business logic must live in the backend — frontend is a pure view layer.

---

## 1. Context and Motivation

The Model Subscription page (`admin-frontend/app/(roles)/rm/model-subscription/page.tsx`) exists today as a **read + modal-only** surface: the RM can browse their client book's subscriptions, view transaction history, and open a form modal (`SubscriptionFormModal.tsx`) for new-subscription / add-allotment / redemption. But the modal's "Submit" button is **dead** — it fires no API call, writes no row. The entire backend write path is missing.

The onboarding flow (proposal 013) already writes to `client_subscriptions` and `client_allotment_redemptions` at the point of compliance approval (`OnboardingService._approve_initial`, `service.py:242`). This proposal extends that pattern to post-onboarding allotments and redemptions submitted by the RM from the Model Subscription page.

The original process specification identifies an **open risk**: allotment/redemption should move funds between `client_portfolios.cash_deposit` and `amount_in_trade`, but this conflicts with the trade-reconciliation module (`reconciliation/engine.py:106`, `adapters/crm.py:16`) which uses `SUM(client_portfolios.amount_in_trade)` as the CRM-side truth for reconciliation. This proposal resolves that risk.

> **Why now / why this order.** The onboarding integration (013/014) wired the read path and initial-allotment write. The Model Subscription page's submit buttons are the last dead wire blocking live allotment/redemption operations.

---

## 2. Goals

1. Wire the SubscriptionFormModal "Submit" button to a backend endpoint that creates an allotment or redemption record and (for allotments) immediately updates `client_subscriptions`.
2. Implement the redemption approval workflow: RM submit → PC approval required, and if amount > US$300,000, Compliance approval also required.
3. Surface pending-redemption status in the SubscriptionAccordion transaction history so the RM sees whether their submission is awaiting approval.
4. Resolve the `client_portfolios` open risk: allotment/redemption writes a paired shift to `cash_deposit`, `amount_in_trade`, and `previous_amount_in_trade` that preserves the trading delta and total portfolio value, with no impact on the reconciliation engine (which reads only `client_portfolio_run_deltas` post-`d598615`).

## 3. Non-Goals

- Request ticket page (client initiates, RM accepts/rejects) — owned by a future proposal; this proposal assumes the RM is already on the Model Subscription page with the intent to submit.
- Client portal event page updates — downstream consumer of `client_events` rows this proposal inserts; no client-portal code changes here.
- Portfolio Commander allotment/redemption approval **UI** — the PC already has `/pc/allotments` + `/pc/allotments/{id}/acknowledge` endpoints (router.py:260-274); this proposal adds new approval endpoints but the PC page wiring is a separate track.
- Post-trade-allocation delta-ledger writes — allotment/redemption does NOT insert into `client_portfolio_run_deltas`; it only shifts the running totals in `client_portfolios` (see D-1).

---

## 4. Cross-layer seam (frozen here)

### 4.1 The wire contract

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

### 4.2 Per-layer obligations against the seam

| Layer | What this layer contributes | What this layer assumes from the other side |
|---|---|---|
| Database | Widens `AllotRdmpStatus` enum with 4 new values; adds `reject_reason`, `decided_by`, `decided_at` columns to `client_allotment_redemptions`; adds `emergent` boolean column | Backend only writes valid enum values |
| Backend | Serves the 4 routes above; allotment immediately upserts `client_subscriptions` + inserts `client_allotment_redemptions` (status=`pending`); redemption inserts with status=`awaiting_pc` (or `awaiting_co` if amount > $300k); approval endpoints transition status and (on final approve) upsert `client_subscriptions` | DB columns from §4.1 are present; Frontend sends DTOs exactly as specified |
| Frontend | Calls POST endpoints on modal submit; renders new statuses in TxnTable with appropriate chips; disables modal submit while in-flight | Backend returns AllotRdmptDTO exactly as in §4.1 with the new status values |

### 4.3 Change protocol (post-freeze)

- Any edit to §4 requires a new proposal revision or an explicit addendum in this file, dated and initialled.
- Every impl doc's §7 is then updated in the same change set — the seam never lives in only one place.

---

## Layer 1 — Database

### A. Tables / objects in scope

| File | Tables / objects |
|---|---|
| `app/models/onboarding.py` | `client_allotment_redemptions` (widen), `AllotRdmpStatus` (widen) |

### B. Findings

#### B-1. `AllotRdmpStatus missing redemption-workflow values` (MANDATORY)

`AllotRdmpStatus` (`onboarding.py:179-181`) has only `PENDING` and `ACKNOWLEDGED`. The redemption approval workflow requires 4 additional states: `awaiting_pc`, `awaiting_co`, `approved`, `rejected`.

**Refactor:** Add the 4 new enum members. The column uses `native_enum=False` (VARCHAR-backed), so no Postgres enum migration — just an Alembic revision that documents the schema contract.

#### B-2. `client_allotment_redemptions missing approval columns` (MANDATORY)

The table (`onboarding.py:190-252`) has no columns for tracking who decided a redemption or why it was rejected. The `emergent` flag (emergent big redemption) also has no column.

**Refactor:** Add to `client_allotment_redemptions`:
- `reject_reason: String(512), nullable=True`
- `decided_by: String(128), nullable=True` — firebase_uid of the PC/CO who approved/rejected
- `decided_at: DateTime(timezone=True), nullable=True`
- `emergent: Boolean, nullable=False, server_default="false"`

All new columns are nullable or have defaults — purely additive, no data migration.

---

### C. Summary of DB-layer changes

| # | Change | Required? | Effort | Data migration? |
|---|---|---|---|---|
| B-1 | Add 4 enum values to `AllotRdmpStatus` | MANDATORY | XS | No |
| B-2 | Add 4 columns to `client_allotment_redemptions` | MANDATORY | XS | No |

Single Alembic revision. Down-migration drops the 4 columns; enum values are left in place (VARCHAR-backed, no harm).

---

## Layer 2 — Backend

### A. New endpoints

4 new routes on the existing `onboarding` router (`app/libs/onboarding/router.py`):

```
POST /rm/allotment                    Submit allotment (RM)
POST /rm/redemption                   Submit redemption (RM)
POST /pc/redemptions/{id}/decide      PC approves/rejects redemption
POST /co/redemptions/{id}/decide      CO approves/rejects redemption (>$300k only)
```

All routes sit behind existing RBAC actions: `CLIENT_VIEW` for RM submit, `ALLOTMENT_ACKNOWLEDGE` for PC decide, `ONBOARDING_REVIEW` for CO decide.

### B. Allotment submit logic

Mirrors `_approve_initial` (`service.py:242-273`) but without the onboarding ceremony:

1. Validate: client exists, model exists, subscription exists (for add-allotment) or doesn't exist (for new-subscription).
2. Read `agg_before` via `sum_subscription_multiplier` (BEFORE the upsert — same ordering constraint as onboarding).
3. `upsert_subscription` — for new-subscription: compare-and-set fee overrides (same as C-5 in 013). For add-allotment: increment `multiplier` by the submitted amount.
4. `create_allotment` — kind=`allotment`, status=`pending`, agg_before/agg_after snapshotted.
5. Paired portfolio shift (D-1): `cash_deposit -= amount`, `amount_in_trade += amount`, `previous_amount_in_trade += amount`.
6. Insert `client_events` row.
7. Commit.

**Key difference from onboarding:** no compliance gate, no user.status change, no document checks. The subscription already exists (or is being created fresh).

### C. Redemption submit logic

1. Validate: client exists, model exists, subscription exists with sufficient multiplier.
2. Compute amount = multiplier × model.model_size. If emergent, multiplier = full current subscription multiplier.
3. Determine initial status:
   - amount > $300,000 → `awaiting_co` (needs both CO and PC)
   - else → `awaiting_pc` (needs PC only)
4. `create_allotment` with kind=`redemption`, status from step 3, emergent flag.
5. Insert `client_events` row.
6. **Do NOT** update `client_subscriptions` or `client_portfolios` yet — both happen only on final approval.
7. Commit.

### D. Redemption approval logic (PC/CO decide)

**PC decide (`/pc/redemptions/{id}/decide`):**
- If verdict=`approve` and current status=`awaiting_pc`: if the row does NOT also need CO (i.e. amount ≤ $300k), transition to `approved` and execute the subscription update. If it also needs CO, transition to `awaiting_co`.
- If verdict=`approve` and current status=`awaiting_co`: this is the CO endpoint's job → 409.
- If verdict=`reject`: set status=`rejected`, record reason/decided_by/decided_at.

**CO decide (`/co/redemptions/{id}/decide`):**
- Only valid when status=`awaiting_co`. Approve → check if PC already approved; if both approved, transition to `approved` and execute subscription update. Reject → `rejected`.

**"Execute subscription update" on final approval:**
1. Read `agg_before`.
2. Decrement `client_subscriptions.multiplier` by the redeemed amount. If multiplier reaches 0, delete the subscription row.
3. `agg_after` = `agg_before` - redeemed multiplier.
4. Paired portfolio shift (D-1): `amount_in_trade -= amount`, `previous_amount_in_trade -= amount`, `cash_deposit += amount`.
5. Update the allotment_redemption row: status=`approved`, decided_by, decided_at.
6. Insert `client_events`.
7. Commit.

### E. Summary of Backend-layer changes

| # | Change | Required? | Effort |
|---|---|---|---|
| A | 4 new routes (2 RM submit, 2 approval decide) | MANDATORY | M |
| B | Allotment submit service method | MANDATORY | S |
| C | Redemption submit service method | MANDATORY | S |
| D | Redemption approval service methods (PC + CO) | MANDATORY | M |

---

## Layer 3 — Frontend

| File | LOC | Role |
|---|---|---|
| `components/rm/SubscriptionFormModal.tsx` | 278 | Modal form — currently display-only, submit is dead |
| `components/rm/SubscriptionAccordion.tsx` | 251 | Accordion with TxnTable — currently shows mock/confirmed-only rows |
| `app/(roles)/rm/model-subscription/actions.ts` | 32 | Server actions — currently read-only (fetchSubscriptions, fetchClientAllotments) |
| `hooks/api/useSubscriptions.ts` | 45 | Data hook — currently read-only |
| `lib/onboarding/types.ts` | ~110 | DTO types — needs new status values |

### A. Findings

#### A-1. `Modal submit fires no API call` (MANDATORY)

`SubscriptionFormModal.tsx` renders a Submit button (L132-136) but has no `onClick` handler that calls an API. The form state (client, model, multiplier, date, fees, emergent) is local-only.

**Refactor:** On submit, call a new server action (`submitAllotment` or `submitRedemption`) that POSTs to the corresponding backend endpoint. On success, close the modal and trigger a refetch of the subscription/allotment data. On error, show inline validation feedback.

#### A-2. `TxnTable only renders "Confirmed" status` (MANDATORY)

`SubscriptionAccordion.tsx:75` hardcodes `<Chip tone="active" dot={false}>Confirmed</Chip>` for every non-Net row. New redemption rows will have statuses like `awaiting_pc`, `awaiting_co`, `rejected`.

**Refactor:** Map `AllotRdmptDTO.status` to the appropriate `Chip` tone:
- `pending` / `acknowledged` → `active` ("Confirmed")
- `awaiting_pc` / `awaiting_co` → `pending` ("Awaiting Approval")
- `approved` → `active` ("Approved")
- `rejected` → `overdue` ("Rejected")

#### A-3. `AllotRdmpStatus type missing new values` (MANDATORY)

`types.ts:7` defines `AllotRdmpStatus = "pending" | "acknowledged"`. Must add the 4 new values.

**Refactor:** Widen the union type.

### B. Adapting to changes in other layers

| Upstream change | Frontend change | Files touched |
|---|---|---|
| Backend A: new POST endpoints | New server actions `submitAllotment`, `submitRedemption` | `actions.ts`, `server/rm/index.ts` |
| Backend C/D: new status values in AllotRdmptDTO | Widen `AllotRdmpStatus` type, update TxnTable chip rendering | `types.ts`, `SubscriptionAccordion.tsx` |

### C. Additional findings

#### C-1. `Modal reads client/model lists from mock data` (Recommend)

`SubscriptionFormModal.tsx:23` imports `SUB_CLIENTS` and `MODEL_SIZE_LIST` from mock data for the dropdowns. For add-allotment/redemption modes the fields are locked (pre-filled from context), so this only affects new-subscription mode.

**Refactor:** For new-subscription mode, source the client list from the already-fetched `useSubscriptions` data (clients the RM can see), and the model list from a new or existing models endpoint. This is a Recommend — the mock dropdown is functional for the three modal modes that matter most (add-allotment, redemption), where client/model are pre-locked.

### D. Summary of Frontend-layer changes

| # | Change | Required? | Effort |
|---|---|---|---|
| A-1 | Wire modal submit to POST endpoints | MANDATORY | S |
| A-2 | Status-aware chip rendering in TxnTable | MANDATORY | XS |
| A-3 | Widen AllotRdmpStatus type | MANDATORY | XS |
| C-1 | Source modal dropdowns from live data | Recommend | S |

---

## Design decisions (settled)

- **D-1 — Allotment/redemption writes to `client_portfolios` with a paired shift that preserves the trading delta.** The reconciliation engine (post-`d598615`) reads exclusively from `client_portfolio_run_deltas` — it no longer queries `client_portfolios` at all. This makes it safe for allotment/redemption to write to `client_portfolios` without affecting reconciliation. The write shifts `amount_in_trade`, `previous_amount_in_trade`, and `cash_deposit` together so the trading delta (`amount_in_trade - previous_amount_in_trade`) stays constant and total portfolio value (`cash_deposit + amount_in_trade`) stays constant:
  - **Allotment** (cash moves into trade): `cash_deposit -= X`, `amount_in_trade += X`, `previous_amount_in_trade += X`
  - **Redemption** (trade moves back to cash): `amount_in_trade -= X`, `previous_amount_in_trade -= X`, `cash_deposit += X`
  
  The next allocation run snapshots the new `amount_in_trade` as its `previous_amount_in_trade` normally and proceeds unaffected.

- **D-2 — Redemption approval is a two-gate sequential workflow, not parallel.** For amounts > $300k, the redemption goes to CO first (since CO is the higher authority), then PC. This avoids the complexity of parallel-approval tracking. The status machine is: `awaiting_co → (CO approves) → awaiting_pc → (PC approves) → approved`. Either gate can reject at any point.

- **D-3 — Emergent Big Redemption uses the same approval workflow.** No bypass. The emergent flag is recorded on the row for audit, and the expected_cash_out is forced to T+1, but it still requires PC (and CO if > $300k) approval. The UI warns the RM of the severity.

- **D-4 — Allotment multiplier is additive, not replacement.** Submitting multiplier=2 to an existing subscription with multiplier=3 results in multiplier=5 (the RM is adding 2 units). This matches the onboarding pattern where `upsert_subscription` sets/increments the multiplier.

- **D-5 — Rejected redemption display treatment.** A rejected redemption row must never be visually confusable with a completed transaction:
  1. **Not counted in Net — already true, no new guard needed.** The Net row (`netRow()` in `lib/rm/subscriptions.ts`) is built from `ClientSubscriptionsDTO.subscriptions[].amount`/`.units` — i.e. the live `client_subscriptions` table — not from summing ledger rows. Since the Backend's reject branch (`pc_decide_redemption`/`co_decide_redemption`) never writes `client_subscriptions`, a rejected row is already excluded from Net by construction. This is a confirmation, not a new mechanism — stated explicitly so nobody "fixes" it later by switching Net to a ledger-sum approach.
  2. **New visual treatment (Frontend, FE-4 scope):** for a row whose status is `rejected`, only the 3 numeric cells — Cash Amt, Model ×, Notional — render muted (`text-secondary`, reduced opacity) with `text-decoration: overline`. Every other cell in that row (Type, Date, IB Account, Ccy, Expected Cash In/Out) renders normally — it's still a real, dated record of what was requested and refused, just visually marked as "no money moved" on the numeric columns specifically, not hidden or greyed out entirely.

---

## Objectives & standard of the expected outcome

- **Allotment golden path.** RM submits add-allotment → `client_subscriptions.multiplier` incremented, `client_allotment_redemptions` row inserted, `client_events` row inserted, modal closes, accordion refreshes showing the new transaction.
- **Redemption golden path.** RM submits redemption → row inserted with `awaiting_pc` (or `awaiting_co`), accordion shows "Awaiting Approval" chip. PC/CO approve → `client_subscriptions.multiplier` decremented, status → `approved`.
- **No reconciliation breakage.** The paired shift to `client_portfolios` preserves the trading delta (`amount_in_trade - previous_amount_in_trade`). Reconciliation reads only `client_portfolio_run_deltas` and is unaffected.
- **Status visibility.** The RM can see the current approval status of every pending redemption in the transaction history table.

---

## Execution & verification

1. **DB layer** — Alembic migration adding enum values + columns. Verify: `alembic upgrade head` succeeds; new columns visible in the DB.
2. **Backend layer** — 4 new endpoints + service methods. Verify: unit tests for allotment submit, redemption submit, PC/CO decide (approve + reject paths), amount-threshold routing, emergent flag.
3. **Frontend layer** — Modal submit wiring, status chip mapping, type widening. Verify: submit allotment from modal → row appears in accordion; submit redemption → "Awaiting Approval" chip; after backend approval → chip changes to "Approved".

**Human gate(s):** Migration runs against the live DB — requires sign-off before applying.

---

## Rollback

DB changes are additive (new columns + wider VARCHAR enum values). Branch revert removes the backend routes and frontend wiring cleanly. Down-migration drops the 4 new columns; enum values stay in the VARCHAR column (harmless). No data loss on rollback — any rows written with new statuses would have `status` values the old code doesn't render, but they don't corrupt existing data.
