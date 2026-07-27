# 017 — Wire Transaction Details Form End-to-End

> Status: **DRAFT — pending implementation approval.**
> Scope: Persist the "Filling in Transaction Details" modal data for allotments and redemptions — new DB table, backend POST/GET endpoints, frontend API call + view-only panel for already-filed records.
> Constraint: No design/layout change to the modal's form fields. Business logic for allotment/redemption status workflows must not change.

---

## 1. Context and Motivation

The RM post-trade allocation flow includes a **TransactionDetailModal** (`admin-frontend/components/rm/TransactionDetailModal.tsx`) that collects transaction details (bank account, amount, date, time, currency, reference number) for confirmed allotments and approved redemptions. The modal was ported faithfully from the design handoff but is currently no-op:

- **Frontend:** `SubscriptionAccordion` (`admin-frontend/components/rm/SubscriptionAccordion.tsx:307`) keeps `filled` state in a React `useState` — resets on reload, never calls the backend.
- **Backend:** No endpoint exists for recording or retrieving transaction details.
- **Database:** No table or columns exist for transaction detail storage. `client_allotment_redemptions` (`api-backend/app/models/onboarding.py:199`) tracks allotment/redemption lifecycle only.

Transaction details are a separate audit concern from the allotment/redemption record itself — they document *how money moved* after a trade decision was made. A dedicated table keeps the audit trail clean and avoids widening an already-wide parent row with nullable columns that are only populated once.

> **Why now / why this order.** The allotment and redemption flows (proposals 011, 013, 016) are committed and live. Transaction-detail recording is the last no-op piece in the RM subscription view — wiring it completes the audit trail for post-trade follow-ups.

---

## 2. Goals

1. Persist transaction details in a dedicated `transaction_details` table, linked 1:1 to `client_allotment_redemptions` via FK.
2. Expose a POST endpoint for filing transaction details and a GET endpoint for retrieving them, both guarded to the RM role.
3. Connect the frontend modal's Save button to the POST endpoint; replace the client-side-only `filled` state with real persistence.
4. When clicking an allotment/redemption that already has transaction details filed, show a **view-only panel** displaying the recorded details (no editable fields, no Save button).
5. Return a `has_transaction_detail` boolean on `AllotRdmptDTO` so the transaction table's check icon reflects persisted reality.

## 3. Non-Goals

- Changing the modal's form field set — the current fields match the approved design handoff.
- Adding new statuses (e.g. "settled") to `AllotRdmpStatus` — transaction-detail filing is an audit/bookkeeping action, not a status transition.
- Editing or deleting previously filed transaction details — out of scope; immutable for audit integrity.
- Transaction details for PC or CO roles — this is RM-only for now.

---

## 4. Cross-layer seam (frozen here)

### 4.1 The wire contract

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

### 4.2 Per-layer obligations against the seam

| Layer | What this layer contributes | What this layer assumes from the other side |
|---|---|---|
| Database | `transaction_details` table with UNIQUE FK to `client_allotment_redemptions.id`; all detail columns NOT NULL except `reference_no` | Backend only writes validated values (currency in enum range, amount positive, date/time valid) |
| Backend | Serves POST + GET at `/rm/allotments/{allotment_id}/transaction-detail` with role guard (RM) and status guard (confirmed/approved on POST). Returns `TransactionDetailDTO`. Adds `has_transaction_detail` to `AllotRdmptDTO`. | DB table exists. Frontend sends `TransactionDetailRequest` shape exactly. |
| Frontend | Calls POST on Save, calls GET on click when `has_transaction_detail` is true, renders view-only panel for filed records. | Backend returns `has_transaction_detail` on `AllotRdmptDTO` and `TransactionDetailDTO` on the GET endpoint. |

### 4.3 Change protocol (post-freeze)

- Any edit to §4 requires a new proposal revision or an explicit addendum in this file, dated and initialled.
- Every impl doc's §7 is then updated in the same change set — the seam never lives in only one place.

---

## Layer 1 — Database

### A. Tables / objects in scope

| File | Tables / objects |
|---|---|
| `app/models/onboarding.py` | New: `transaction_details`. Existing (FK target): `client_allotment_redemptions` |

### B. Findings

#### B-1. `No transaction-detail storage exists` (Yes — user req.)

Settlement data has no persistence layer. For audit purposes, transaction details must live in a dedicated table rather than as nullable columns on the parent allotment/redemption row.

**Refactor:** Create a new `transaction_details` table:

| Column | Type | Nullable | Constraint | Notes |
|---|---|---|---|---|
| `id` | `UUID` | No | PK | |
| `allotment_id` | `UUID` | No | FK → `client_allotment_redemptions.id`, UNIQUE | 1:1 relationship; UNIQUE enforces file-once |
| `bank_account` | `String(64)` | No | | |
| `settlement_amount` | `Numeric(28, 10)` | No | | Decimal — money |
| `transaction_date` | `Date` | No | | |
| `transaction_time` | `Time` | No | | |
| `currency` | `String(3)` | No | | ISO 4217 code |
| `reference_no` | `String(64)` | Yes | | Optional |
| `filed_by` | `String(128)` | No | | firebase_uid of the RM who filed |
| `filed_at` | `DateTime(timezone=True)` | No | `server_default=func.now()` | |

The UNIQUE constraint on `allotment_id` is load-bearing: it is the DB-level guarantee that transaction details are immutable (one record per allotment/redemption, no updates).

### C. Summary of DB-layer changes

| # | Change | Required? | Effort | Data migration? |
|---|---|---|---|---|
| B-1 | Create `transaction_details` table | Yes — user req. | XS | No |

Single Alembic revision, additive only. Down-migration drops the table.

---

## Layer 2 — Backend

### A. New endpoints

#### A-1. `POST /rm/allotments/{allotment_id}/transaction-detail` (Yes — user req.)

No endpoint exists for recording transaction details.

**Refactor:** Add a new route in `app/libs/onboarding/router.py`:

```
POST /rm/allotments/{allotment_id}/transaction-detail    File transaction details (once)
```

Guards:
- **Role:** RM only (existing `require_role("rm")` pattern).
- **Status:** Parent row must be in an eligible status — `AllotRdmpStatus.ACKNOWLEDGED` for allotments (confirmed), `AllotRdmpStatus.APPROVED` for redemptions. Return 403 otherwise.
- **Idempotency:** If a `transaction_details` row already exists for this `allotment_id`, return 409. (Immutable — file once.)

Logic:
1. Look up `ClientAllotmentRedemption` by id, filtered to the RM's clients.
2. Validate request body (`TransactionDetailRequest`).
3. Insert a `TransactionDetail` row with `filed_by` = current user's firebase_uid.
4. Commit and return the row as `TransactionDetailDTO` with status 201.

#### A-2. `GET /rm/allotments/{allotment_id}/transaction-detail` (Yes — user req.)

The frontend needs to fetch filed transaction details to display the view-only panel.

**Refactor:** Add a GET route:

```
GET /rm/allotments/{allotment_id}/transaction-detail    Retrieve filed transaction details
```

Guards: RM role, parent row must belong to RM's clients. Returns 404 if no settlement row exists.

#### A-3. `Add has_transaction_detail to AllotRdmptDTO` (Yes)

`AllotRdmptDTO` (`app/libs/onboarding/schemas.py:155`) has no indicator of whether transaction details have been filed. The frontend needs this to decide whether to open the form or the view-only panel.

**Refactor:** Add `has_transaction_detail: bool = False` to `AllotRdmptDTO`. In the row→DTO mapper, set it to `True` when a `transaction_details` row exists for the allotment. Use a subquery or `EXISTS` check — avoid eager-loading the full settlement row on list queries.

### B. Summary of Backend-layer changes

| # | Change | Required? | Effort |
|---|---|---|---|
| A-1 | New POST endpoint for filing transaction details | Yes — user req. | S |
| A-2 | New GET endpoint for retrieving transaction details | Yes — user req. | XS |
| A-3 | Add `has_transaction_detail` to AllotRdmptDTO + mapper | Yes | XS |

---

## Layer 3 — Frontend

| File | Role |
|---|---|
| `admin-frontend/components/rm/TransactionDetailModal.tsx` | Modal UI — currently edit-only; needs a view-only mode |
| `admin-frontend/components/rm/SubscriptionAccordion.tsx` | Renders transaction table, manages filled state, opens modal |
| `admin-frontend/lib/rm/subscriptions.ts` | API client + types for RM subscription view |

### A. Findings

#### A-1. `Save button is no-op — needs API call` (Yes — user req.)

`TransactionDetailModal` calls `onSave(details)` which the parent (`SubscriptionAccordion.tsx:335`) stores in React state only. No `fetch` / API call is made.

**Refactor:**
1. Add `postTransactionDetails(allotmentId, body)` and `getTransactionDetail(allotmentId)` functions to `admin-frontend/lib/rm/subscriptions.ts`.
2. In `SubscriptionAccordion`, change the `onSave` handler to call `postTransactionDetails`, then update local state from the response (or invalidate/refetch).

#### A-2. `Filled state is ephemeral React state` (Yes)

`SubscriptionAccordion` (`line 307`) tracks `filled` as `Record<string, TransactionDetails>` in `useState` — resets on reload.

**Refactor:** Derive the `filled` set from `AllotRdmptDTO.has_transaction_detail` on the allotment DTOs already fetched for the transaction table. Remove the local `useState<Record<string, TransactionDetails>>`.

#### A-3. `No view-only mode for already-filed transaction details` (Yes — user req.)

Currently clicking a filled row re-opens the editable form. For auditing, already-filed records should show a **view-only panel** — same modal shell, but all fields rendered as read-only text (not inputs) and the footer shows only a Close button (no Save).

**Refactor:** Add a `mode: "edit" | "view"` prop (or similar) to `TransactionDetailModal`:
- **edit mode** (existing): form inputs + Save/Cancel buttons. Used when `has_transaction_detail` is false.
- **view mode** (new): fetch transaction details via `getTransactionDetail(allotmentId)`, display each field as static text in the same grid layout. Footer has only a Close button. The info banner text changes to "Transaction details recorded on {filed_at}." or similar.

In `SubscriptionAccordion`, when the user clicks an eligible row:
- If `has_transaction_detail` is false → open modal in edit mode (current behavior).
- If `has_transaction_detail` is true → open modal in view mode.

### B. Adapting to changes in other layers

| Upstream change | Frontend change | Files touched |
|---|---|---|
| Backend A-1 (POST endpoint) | Call it from Save handler | `SubscriptionAccordion.tsx`, `subscriptions.ts` |
| Backend A-2 (GET endpoint) | Fetch details for view-only panel | `TransactionDetailModal.tsx`, `subscriptions.ts` |
| Backend A-3 (`has_transaction_detail` on DTO) | Use it to decide edit vs view mode | `SubscriptionAccordion.tsx` |

### C. Summary of Frontend-layer changes

| # | Change | Required? | Effort |
|---|---|---|---|
| A-1 | Wire Save to POST endpoint | Yes — user req. | XS |
| A-2 | Derive filled state from DTO | Yes | XS |
| A-3 | View-only mode for already-filed records | Yes — user req. | S |

---

## Execution & verification

1. **DB migration** — Run the Alembic revision, verify `transaction_details` table exists with the UNIQUE FK constraint. Down-migration drops it cleanly.
2. **Backend endpoints** — POST with a confirmed allotment returns 201 + `TransactionDetailDTO`. GET returns 200 with the filed data. Test 403 (wrong role / wrong status), 404, 409 (already filed), 422 (bad input).
3. **Frontend wiring** — Open the modal for a confirmed allotment, fill details, click Save → row shows the green check. Reload → check persists. Click the row again → view-only panel shows the filed details.

**Human gate(s):** Migration runs against the live DB — requires sign-off before applying.

---

## Rollback

Additive-only. Branch revert + `alembic downgrade` drops the `transaction_details` table. No changes to `client_allotment_redemptions`. Any transaction details already filed are lost on rollback (acceptable — they don't gate any status transition).
