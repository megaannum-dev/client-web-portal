# 018 — Client Portal ↔ Backend Integration

> Status: **DRAFT — pending implementation approval.**
> Scope: every remaining mocked or non-functional surface of `client-frontend` (overview, portfolio, profile, monthly reports, legal reports, events, raise-ticket), the backend endpoints that feed them, the one new table they need, and the RM-side inbox that receives client tickets. Out of frame: any new pricing/NAV/performance-attribution source, and any redesign of existing layouts.
> Constraint: **no design or layout change.** Columns may be *removed* where the user asked (model attributes) and labels may change where the current label names data that does not exist; component structure, spacing, and page composition stay as-is.

---

## 1. Context and Motivation

`client-frontend` was built against a mock layer that is still the source of truth for most of the portal:

| Surface | Today | Source |
|---|---|---|
| `app/(dashboard)/overview/page.tsx` | stat cards, recent requests, latest-events panel | `MOCK_PORTFOLIO_STATS`, `MOCK_ALLOTMENT_REQUESTS`, `localStorage` |
| `app/(dashboard)/portfolio/page.tsx` | 4 stat cards, 3 charts, recommended models, ticket history | module-level `BAR_DATA` / `LINE_DATA` / `DONUT_DATA` consts + `MOCK_*` |
| `app/(dashboard)/portfolio/page.tsx` | subscribed models table | **real** — `useSubscriptions()` → `GET /api/client/subscriptions` (proposal 013) |
| `app/(dashboard)/profile/page.tsx` | personal info, account balance, KYC / AML / supporting-doc cards | `localStorage` via `lib/mock/store.ts`, `MOCK_PORTFOLIO_STATS`, `/dummy-*.pdf` |
| `app/(dashboard)/documents/legal-reports/page.tsx` | 8 documents | `MOCK_LEGAL_DOCUMENTS`, all downloading `/dummy-EoM-Report.pdf` |
| `app/(dashboard)/documents/monthly-reports/page.tsx` | 6 statements | `MOCK_EOM_REPORTS`, same dummy PDF |
| `app/(dashboard)/events/page.tsx` | event feed | `MOCK_EVENT_ITEMS` + **real** `useOnboardingEvents()` |
| `components/ui/RaiseTicketModal.tsx` | allotment / redemption / other forms | writes to `localStorage`; nothing reaches a server |
| `components/header/HeaderActions.tsx` | RM contact card | `MOCK_RM_CONTACT` |
| `app/(dashboard)/support/page.tsx` | title only, 12 LOC | not linked from `SidebarNav`; dead route |

The data these surfaces need mostly already exists: `models`, `client_profiles`, `client_portfolios`, `client_portfolio_run_deltas`, `post_trade_allocation_runs` / `post_trade_allocations`, `client_subscriptions`, `client_allotment_redemptions`, `onboarding_documents`, `client_events`. The gap is (a) no `/api/client/*` endpoints beyond `subscriptions` and `events`, (b) no table for a client-raised ticket, and (c) no directory-listing path for firm-issued documents.

On the RM side, `admin-frontend/app/(roles)/rm/requests/` already ships a **Request Tickets** inbox and detail page (`components/rm/RequestTickets.tsx`), reading `TICKET_QUEUE` from `lib/mock/rm-data.ts` — a mock array that is currently entirely commented out, i.e. an empty inbox waiting for a real feed. That is exactly where a client-raised ticket must land, so this proposal closes the loop rather than inventing a second inbox.

> **Why now / why this order.** Proposals 011–017 landed the write side (allocation, onboarding, allotment/redemption, transaction details). The read side the client actually sees is the last mocked surface in the repo. DB first (one new table + two nullable columns), then Backend (one new `client_portal` package), then the two frontends in parallel against the frozen §4 seam.

---

## 2. Goals

1. `client-frontend/lib/mock/data.ts`, `lib/mock/store.ts`, and `components/MockStoreInit.tsx` are **deleted**; no page imports a `MOCK_*` symbol or reads `localStorage` for domain data.
2. All three portfolio charts and every stat card render values derived from `client_portfolios`, `client_portfolio_run_deltas`, `post_trade_allocations`, `client_subscriptions` and `models` — no hardcoded series. The time-series charts window by **calendar month** (6 by default), not by allocation run.
3. Model attribute rework: `country`, `sector`, and `risk level` are removed from both the Subscribed Models and Recommended Models tables and from every DTO; `category` stays; every remaining column maps 1:1 to a real `models` column, including a **distinct `model_limit`** that is structurally separate from `model_size` (never derived from it) — but see Non-Goals: authoring it is explicitly out of scope for this proposal.
4. Legal/compliance documents and monthly statements are listed and downloaded from configured storage directories through the existing `FileStorage` adapter — no mock catalogue, no `/dummy-*.pdf`.
5. Profile personal information and account balance come from `client_profiles` / `client_portfolios`; edits persist via `PATCH`.
6. **Document verification** narrows to one annually-renewed document — the Investment Policy Statement. The hardcoded AML card is removed; the Supporting Documents card is commented out (not deleted). A client may upload their renewal **from 14 days before it falls due**, and that upload lands on the *same* `onboarding_documents` row the RM and Compliance already project (013 Goal 1), so the RM's pending item flips to `uploaded` without the RM re-uploading on the client's behalf. No RM or Compliance transition rule changes.
7. A client can raise a ticket (allotment / redemption / other) that persists to `client_tickets`, appears in their own request history, and appears in their **assigned RM's** existing Request Tickets inbox with a working status lifecycle.
8. Every `/api/client/*` route resolves its subject from the caller's token — a client can never read another client's data by id.

## 3. Non-Goals

- **No NAV / P&L / returns engine.** No table in this repo stores a valuation, cost basis, or return. Anything labelled "return %" today is re-based onto derivable data (see D-1) rather than fabricated. A real performance feed is a future proposal.
- **No client-initiated allotment/redemption execution.** A client ticket is a *request to the RM*; the RM still files the real `client_allotment_redemptions` row through the existing 016/017 flow. Client tickets never write that table.
- **No statement generator.** Monthly reports are files placed in the client's directory (by RM or an external process), not rendered by this backend.
- **No redesign of the RM inbox** — Layer 4 swaps its data source only.
- **No change to the onboarding/renewal state machine.** Client upload reuses `OnboardingService.upload_document` as-is: same guards, same statuses, same transitions. The only differences a reviewer will find are (a) `uploaded_by` may now hold a client uid and (b) a new route can reach that method. Cycle status transitions, `_CAN_REUPLOAD_STATUSES`, submit/verdict/approve rules, and every RM- and Compliance-facing route are untouched.
- **No document-expiry job.** 013's Non-Goals deferred flipping a verified document's own `status` to `expired`, and this proposal keeps that deferral. What it does add is the `expires_at` *value* (Backend C-6) — the renewal scheduler already reads it and does not depend on the status column.
- **No `model_limit` authoring logic, API, or admin UI.** DB B-5 adds the `models.model_limit` column only. There is no PC-facing form field, no `ModelCreate`/`ModelUpdate`/`ModelOut` exposure, no PC route change, and no admin-frontend work of any kind for this attribute in this proposal — it stays permanently `NULL` until a future proposal builds it. Model limits are a risk-management control, and the precise rules (per-client override? per-currency? hard cap vs. warning threshold?) have not yet come from stakeholders; scaffolding an authoring surface ahead of that SOP would mean guessing at a compliance-relevant workflow. The column exists now purely as a placeholder so the eventual write path has somewhere to land — see D-9.
- **No RM relationship-management API/UI.** DB B-6 lands seven nullable `client_profiles` columns (anniversary, spouse's name, children, personal interests, communication/gift-hospitality preferences, other relationship notes) — storage only. They are not part of §4.1's seam, not on any DTO, and not rendered anywhere by this proposal. A client must never read or write their own RM's private notes about them; an RM-facing surface for these columns is a future track.
- Settings page (email/phone/password/2FA) — already server-backed or owned by the auth track (004).
- Marketing hero-banner slides on `overview` — static brand content, deliberately not data.

---

## 4. Cross-layer seam (frozen here)

### 4.1 The wire contract

All routes are mounted under `/api`. All `/client/*` routes take **no subject id** — the subject is `get_current_client_user`. All `/rm/*` routes require `Action.CLIENT_VIEW` (existing dependency) and are scoped to `client_profiles.assigned_rm_uid == caller.firebase_uid`, except `ADMIN`, which sees all.

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

### 4.2 Per-layer obligations against the seam

| Layer | Contributes | Assumes |
|---|---|---|
| Database | `client_tickets` with the exact `TicketKind`/`TicketStatus` value sets in §4.1; `client_profiles.occupation`/`.date_of_birth` and `models.model_limit` nullable columns | Backend never writes a status outside the 5 values; a ticket's `assigned_rm_uid` is a snapshot and may go stale |
| Backend | Every route above at its exact path, DTO, and status codes; all derivations (`total_value`, `amount`, `notional`, status maps) computed server-side | DB B-1/B-2 present; `client_portfolios` row may be **absent** for pre-014 clients → serve zeros, never 404 |
| Frontend (client) | Consumes the DTOs verbatim; renders `None`/`null` as the existing `—`; performs no arithmetic beyond formatting | Backend returns DTOs exactly as in §4.1; money arrives as a `float`, formatting is FE-side |
| Frontend (admin) | `RequestTickets.tsx` and its detail page consume `RmTicketDTO`; status actions POST `RmTicketStatusReq` | Backend enforces RM scoping; `ref` is URL-safe and stable |

### 4.3 Change protocol (post-freeze)

- Any edit to §4 requires a new proposal revision or a dated, initialled addendum in this file.
- Every impl doc's §7 is re-copied in the same change set — the seam never lives in only one place.

---

## Layer 1 — Database

### A. Tables / objects in scope

| File | Tables / objects |
|---|---|
| `app/models/users.py` | `client_profiles` (widen), `users`, `admin_profiles` (read-only) |
| `app/models/onboarding.py` | **new** `client_tickets`; `onboarding_documents`, `client_allotment_redemptions`, `client_events` (read-only) |
| `app/models/pc.py` | `models`, `client_subscriptions`, `model_materials` (read-only) |
| `app/models/post_trade_allocation.py` | `client_portfolios`, `client_portfolio_run_deltas`, `post_trade_allocation_runs`, `post_trade_allocations` (read-only) |
| `alembic/versions/` | one new revision covering B-1 + B-2 |

### B. Findings

#### B-1. No table for a client-raised ticket (Yes — user req.)

The client portal's `RaiseTicketModal` writes three request kinds to `localStorage` (`lib/mock/store.ts:submitAllotmentRequest` / `submitRedemptionRequest` / `submitOtherTicket`) and nothing persists. On the RM side, `admin-frontend/lib/mock/rm-data.ts:408` already defines the exact ticket shape the inbox renders (`ref`, `client`, `contact`, `email`, `model`, `account`, `type`, `ccy`, `cash`, `mult`, `notional`, `date`, `status`, `subject`, `message`) with `TICKET_QUEUE` fully commented out. Both ends of the feature exist; the row does not.

`client_allotment_redemptions` is **not** the right home: that table is the RM/PC/CO execution record (016/017), its statuses drive an approval workflow, and a client *asking* for an allotment is not the same event as the RM *filing* one. Overloading it would let an unapproved client request enter the PC queue.

**Refactor:** new table `client_tickets`:

| Column | Type | Notes |
|---|---|---|
| `id` | `Uuid(native_uuid=False)` PK | `default=uuid.uuid4`, house convention |
| `user_id` | FK `users.id`, indexed, not null | the raising client |
| `assigned_rm_uid` | `String(128)` FK `users.firebase_uid`, nullable, indexed | **snapshot** at raise time; NULL if the client had no RM |
| `reference` | `String(32)` unique, not null | `"REQ-" + uuid hex[:6].upper()`, mirrors `ClientAllotmentRedemption.reference` |
| `kind` | `SAEnum(TicketKind, native_enum=False, length=16, values_callable=…)` | `allotment` / `redemption` / `other` |
| `status` | `SAEnum(TicketStatus, …, length=16)` | server_default `new` |
| `model_id` | FK `models.id`, nullable | NULL for `other` |
| `subject` | `String(255)`, nullable | `other` only |
| `category` | `String(64)`, nullable | `other` only, free text |
| `amount` | `Numeric(28, 10)`, nullable | house money precision |
| `multiplier` | `Numeric(28, 10)`, nullable | |
| `currency` | `String(3)`, not null, server_default `'USD'` | ISO 4217, matches `transaction_details.currency` |
| `message` | `Text`, not null | |
| `responded_by` | `String(128)`, nullable | RM `firebase_uid` |
| `responded_at` | `DateTime(timezone=True)`, nullable | |
| `response_note` | `Text`, nullable | |
| `created_at` / `updated_at` | `DateTime(timezone=True)` `server_default=func.now()`, `onupdate` on the latter | |

Indexes: `ix_client_tickets_user_id` (on the FK), `ix_client_tickets_rm_status` on `(assigned_rm_uid, status)` — the RM inbox's only query shape.

`assigned_rm_uid` is denormalised deliberately: `client_profiles.assigned_rm_uid` can be reassigned, and an inbox must not silently move historical tickets between RMs.

Purely additive — no data migration.

#### B-2. `client_profiles` has no home for Occupation or Date of Birth (Accepted)

`profile/page.tsx:462-470` renders and edits Company and Occupation. Neither exists on `client_profiles` (`app/models/users.py:128-158`: `name`, `primary_phone`, `assigned_rm_uid`, `address`, `country_of_residence`, `authorized_person`, `initiate_method`, `ib_account`). Date of birth has no home either, and the client's Profile page has nowhere it currently renders.

**Refactor:** add `occupation: String(255) NULL` and `date_of_birth: Date NULL` to `client_profiles`. Additive; existing rows read `NULL` → the FE renders `—`.

`date_of_birth` is **read-only** on the wire (§4.1: on `ClientProfileDTO`, deliberately absent from `ClientProfilePatch`, in the same "422 if sent" bucket as `email`/`phone`) — see D-11 for why. `occupation` remains client-editable, unchanged from the original B-2.

**Company is dropped entirely** — no column, no DTO field, no form input (Frontend A-4). The firm does not track it and a field nobody fills is a column nobody trusts.

#### B-3. `client_portfolios` rows are not guaranteed to exist (Yes)

`client_portfolios` is seeded at intake by 014 C-9 (`app/libs/onboarding/repository.py:107`). Clients onboarded before that flow have no row, so `GET /api/client/portfolio` would 404 for them and blank the whole page.

**Refactor:** no schema change. Recorded here as a DB-layer *fact* the Backend layer must honour: treat a missing row as `cash_deposit = amount_in_trade = previous_amount_in_trade = 0`, `updated_at = None`. Backfilling zero rows is explicitly rejected — it would write rows the intake flow expects to create.

#### B-4. `onboarding_documents.expires_at` is `NULL` on every existing row (Yes)

The column exists and the renewal scheduler reads it — `OnboardingRepository.due_for_renewal` (`repository.py:530-543`) filters `expires_at.isnot(None)` — but **nothing in the codebase ever writes it**: `rg "expires_at" app/libs/onboarding` returns one read in `_doc_to_dto` (`service.py:785`), the two scheduler reads, and no assignment. 013 Goal 9's auto-renewal is therefore inert today, and making the Investment Policy Statement annual (Backend C-5/C-6) does nothing for clients who are *already* verified unless their clock is started.

**Refactor:** no schema change. A one-off data backfill in the same revision as B-1/B-2 starts the clock for already-verified IPS rows, anchored to each row's **true review date** — `onboarding_documents` was introduced by revision `e183474e6b91` (0018, proposal 013, 2026-07-19), nine days before this proposal, so every currently-verified row was reviewed within that window. There is no pre-existing backlog to reconcile: the backfill and "the scheduler reopens someone tomorrow" are not in tension here, because nothing lands inside the scheduler's 30-day lookahead on day one.

**Migration plan (data-preserving):**
1. Backend C-6 must be deployed with or before this revision, otherwise newly-verified documents still get no `expires_at` and the backfill is a one-time patch over a permanent hole.
2. `UPDATE onboarding_documents SET expires_at = COALESCE(reviewed_at, created_at) + INTERVAL 365 DAY WHERE doc_type = 'investment_policy_statement' AND status = 'verified' AND expires_at IS NULL`.
3. Rows in any other status keep `NULL` — an unverified document has no review clock to start.
4. Down: `UPDATE … SET expires_at = NULL WHERE doc_type = 'investment_policy_statement'` (the column held nothing before this revision, so the down is exact, and `reviewed_at` itself is never touched by this step).

#### B-5. Model limit has no column and cannot be derived (Yes — user req.)

Both model tables show a **Model Limit** (`MOCK_SUBSCRIBED_MODELS`: `"$2,000,000"`; `MOCK_RECOMMENDED_MODELS`: `"$500,000"` … ). The first draft of this proposal derived it from `models.model_size`, which is wrong: `model_size` is the **price of one unit** and is load-bearing arithmetic across the allocation matrix — `COALESCE(SUM(cs.multiplier * m.model_size), 0) AS col_fund` (`allocation_matrix/repository.py:180`), frozen into `allocation_model_snapshots` at confirm time, and the basis of `AllotRdmptDTO.amount`. A cap on the model is a different fact that happens to be denominated in the same currency; reusing one column for both would make any future change to either silently corrupt the other.

It belongs on `models`, not on `client_subscriptions`: the Recommended Models table shows a limit for models the client is **not** subscribed to, so a per-client row could not supply it.

**Refactor:** add `model_limit: Numeric(28, 10) NULL` to `models`, alongside (and independent of) `model_size`. NULL means "no cap recorded" and renders `—`. Additive; no existing row or query changes.

**Deliberately no writer — this is a placeholder column, not an inert one by accident.** Unlike `expires_at` (DB B-4), where an unwritten column is a bug this proposal fixes, `model_limit` staying unwritten here is the correct outcome: model limits are a risk-management control, and the firm has not yet settled the SOP for how a limit is set, by whom, or under what rule. Building `ModelCreate`/`ModelUpdate`/`ModelOut` exposure and a PC form field now would mean encoding a workflow nobody has specified. Per the proposal's Non-Goals, this proposal adds **only** the column — no route, no schema field, no form, no service-layer write path, anywhere. No backfill either, for the same reason B-4 has none: nobody can infer a value nobody has defined the rule for yet.

#### B-6. `client_profiles` has no home for RM relationship-management notes (Yes — user req.)

The RM's relationship with a client carries context that has no column anywhere: anniversary, spouse's name, children's names and ages, personal interests, communication preferences, gift/hospitality preferences, and other relationship notes. This is distinct from every other `client_profiles` field added or discussed elsewhere in this proposal — B-2's `occupation` is **client-editable** (it's on `ClientProfileDTO`/`ClientProfilePatch`, §4.1) and rendered on the client's own Profile page; these seven fields are **RM-facing CRM notes about the client**, not something the client enters or ever sees.

**Refactor:** add seven nullable columns to `client_profiles`:

| Column | Type | Notes |
|---|---|---|
| `anniversary` | `Date NULL` | recurring by month/day, not tied to a specific year's event |
| `spouse_name` | `String(255) NULL` | |
| `children` | `Text NULL` | names and ages together, free text — not a list/relation |
| `personal_interests` | `Text NULL` | |
| `communication_preferences` | `Text NULL` | |
| `gift_hospitality_preferences` | `Text NULL` | |
| `relationship_notes` | `Text NULL` | |

Additive; no backfill (nobody can infer these for existing clients); no index (none is filtered or joined on).

**Non-goal, stated explicitly so a later layer doesn't assume otherwise:** this finding is **DB-only**. None of these seven columns is added to `ClientProfileDTO`, `ClientProfilePatch`, or any other part of the frozen seam in §4.1 — they are not part of the client portal integration this proposal builds, and a client must never be able to read or write their own RM's private notes about them. Exposing them through an RM-facing API/UI (e.g. an admin-frontend client-info panel) is a future track; this proposal only lands the storage.

---

### C. Summary of DB-layer changes

| # | Change | Required? | Effort | Data migration? |
|---|---|---|---|---|
| B-1 | New `client_tickets` table + 2 indexes | Yes — user req. | S | No (additive) |
| B-2 | `client_profiles` += `occupation` (editable) + `date_of_birth` (read-only, nullable); Company dropped entirely | Accepted | XS | No (additive) |
| B-3 | Document "missing `client_portfolios` row = zeros" invariant | Yes | XS | No |
| B-4 | Backfill `expires_at` on verified IPS rows (starts the annual clock) | Yes | S | **Yes** |
| B-5 | `models` += `model_limit` (nullable), distinct from `model_size` | Yes — user req. | XS | No (additive) |
| B-6 | `client_profiles` += 7 nullable RM relationship-management columns (DB-only, no seam change) | Yes — user req. | XS | No (additive) |

B-1, B-2, B-4, B-5 and B-6 land in **one** Alembic revision. Down-migration drops `client_tickets` (losing every ticket raised since upgrade), drops `client_profiles.occupation`/`.date_of_birth`, the seven B-6 columns, and `models.model_limit` (losing any values entered), and nulls the backfilled `expires_at` (exact — the column held nothing before). Additive-up, lossy-down; see Rollback.

---

## Layer 2 — Backend

### A. Structural change: a `client_portal` package (Yes)

Client-facing routes currently live at the bottom of `app/libs/onboarding/router.py:356-370` (`/client/subscriptions`, `/client/events`) because onboarding was the first feature to need them. This proposal adds ~14 more routes spanning portfolio, models, documents and tickets — none of which is onboarding.

**Refactor:** new package mirroring the existing per-feature layout (`router` / `service` / `repository` / `schemas`):

```
app/libs/client_portal/
  __init__.py
  router.py        # every /client/* route + the 3 /rm/tickets/* routes
  service.py       # all derivations (total_value, amount, notional, status maps)
  repository.py    # all SQLAlchemy queries
  schemas.py       # every DTO in §4.1
```

Dependency direction: `router → service → repository → app/models/*`. `service` may import `app.libs.onboarding.service` (document upload reuse, C-6) and `app.libs.trade_models.storage` (C-5); nothing in `onboarding` may import `client_portal`.

**Move (Recommend):** relocate the two existing `/client/*` routes into `client_portal/router.py` **at identical paths**, delegating to `OnboardingService` as they do today. Zero wire change, so `client-frontend/lib/api/onboarding.ts` keeps working untouched; the win is that "everything the client can call" is one file. Decline this and the two routes simply stay put.

### B. Derivations (all business logic server-side)

Per the standing repo rule (proposal `mobo-backend-integration` D-1: *all business logic in the backend, frontend is a pure view*), every number below is computed in `service.py` and crosses the wire finished.

| Value | Derivation | Round-trips |
|---|---|---|
| `PortfolioDTO.total_value` | `cash_deposit + amount_in_trade` | 1 (`client_portfolios` by PK) |
| `PortfolioDTO.change_pct` | `(amount_in_trade - previous)/previous`, `None` when `previous == 0` | — |
| `PositionDTO.amount` | `client_subscriptions.multiplier * models.model_size` | 1 (join `client_subscriptions ⋈ models`) |
| `HistoryPointDTO.total` | sum `client_portfolio_run_deltas.delta` **grouped by calendar month**, then a running total across months | 1 (join deltas ⋈ runs, filtered by `user_id`) |
| `HistoryPointDTO.per_model` | sum `post_trade_allocations.allocated` grouped by (month, `model_name`), then a running total per series | 1 |
| `RmTicketDTO.notional` | `amount * multiplier`, `None` if either is `None` | — |

**Monthly bucketing (settled — D-10).** `post_trade_allocation_runs.trade_date` is a `String(8)` `"YYYYMMDD"` IB token, so the month key is `substr(trade_date, 1, 6)` — no date parsing, no timezone question, and it sorts lexically in calendar order. `months` (default 6, max 24) bounds the window by month, not by run count: the service computes the running total over **all** runs up to the window's end (so the first point's cumulative is correct, not a partial sum), then emits only the last `months` points. Months inside the window with no run are filled by carrying the previous cumulative forward, which is what makes the line chart's x-axis evenly spaced.

> The `GROUP BY substr(...)` will not use `ix_post_trade_allocation_runs_trade_date`. A single client's delta rows number in the hundreds at most, so this is a full scan of a tiny filtered set. `ponytail: a month column or a materialised monthly rollup if a client ever accumulates enough runs for this to show up in a trace.`

### C. Findings

#### C-1. `SubscriptionDTO` carries no amount or limit (Yes — user req.)

`SubscriptionDTO` (`app/libs/onboarding/schemas.py:218`) is `{model_id, model_name, units, ib_account}`. `useSubscriptions.ts:20-22` therefore hardcodes `symbol: "—", country: "—", sector: "—", amount: "—", modelLimit: "—"` — five of the eight Subscribed Models columns are literal em-dashes today. The 013 comment correctly refused to backfill a stale prototype schema; the user's requirement now settles it in the other direction: **drop** country/sector/risk (no column exists, none is wanted) and **add** the two that do exist.

**Refactor:** the Subscribed Models table is fed by `PortfolioDTO.positions` (§4.1 `PositionDTO`), which carries `amount` and `model_limit`. `SubscriptionDTO` itself is left untouched and `useSubscriptions` is retired in favour of `usePortfolio` (Layer 3 A-2) — one endpoint feeds the stat cards, the donut, and the table, instead of two overlapping ones. Note `ib_account` is per-**client** (`client_profiles.ib_account`), not per-model — see memory `pc-ib-account-per-client`; the column repeats the same value on every row, which is correct.

#### C-2. No recommended-models source (Yes)

`MOCK_RECOMMENDED_MODELS` invents `assetClass`, `symbol`, `country`, `sector`, `risk`, `minInvestment`. Of those only a rough analogue of asset class exists (`models.category`, a JSON list).

**Refactor:** `GET /api/client/models/recommended` = all `models` with `status == LIVE` minus the caller's subscribed `model_id`s, ordered by `name`, projected to `RecommendedModelDTO`. `category` is carried through as-is — it is a real, PC-authored model attribute and stays (unlike country/sector/risk, which have no column and no owner). `model_limit` reads the new `models.model_limit` (DB B-5). `has_material` is a `EXISTS(model_materials)` correlated sub-query; `GET /api/client/models/{id}/material` streams the highest `version_no` row through `get_storage().open()` — the same pattern as `OnboardingService`'s document download (`service.py:380-395`). A model with no material returns 404 and the FE hides the download link (`has_material == false`).

#### C-3. `FileStorage` can save and open but not list (Yes)

`app/libs/trade_models/storage.py` exposes `save()` / `open()` only. Legal documents and monthly statements are *pre-existing* files nobody uploads through the app, so there is no `storage_key` in any table to enumerate.

**Refactor:** add `list(subdir: str) -> list[StoredFile]` to the `FileStorage` protocol (`StoredFile = (key, filename, size_bytes, modified_at, category)`), implemented in `LocalStorage` as a one-level-deep `Path.iterdir()` walk (`category` = immediate sub-folder name, `None` at the root); `NasStorage` raises `NotImplementedError` like its siblings. Two settings on `app/core/config.py` alongside `storage_root`:

```python
legal_docs_subdir: str = "legal_docs"          # firm-wide, same for every client
client_statements_subdir: str = "client_statements"   # per-client folder underneath
```

Statements resolve to `f"{client_statements_subdir}/{repo.client_folder_name(onboarding)}"` — the **existing** per-client folder helper already used for KYC uploads (`onboarding/service.py:195`), so a client's files live in one place on disk.

**Statements are a repository for a generator that does not exist yet (D-7).** Nothing in this proposal writes that directory; end-of-month statements are to be *system-generated*, and that generator is a separate track. What lands here is the read side plus the drop-point contract, so that when generation ships it has somewhere to write and the client page lights up with no further frontend or API work. Until then the directory is empty and the page shows its existing empty state — which is the honest rendering of "no statements have been generated yet". The one thing the future generator must honour is the filename convention in §4.1's `StoredFileDTO.period`: a leading `YYYY-MM` token (`2026-07_MEGA-0481.pdf`). Anything else still lists and downloads; it just falls back to `modified_at` for the period column.

#### C-4. Path-traversal risk on download-by-key (MANDATORY)

`StoredFileDTO.key` is echoed back by the FE to `GET /api/client/documents/{scope}/download?key=…`. A raw key is a filesystem path fragment; `../../` would escape the mount, and a client-supplied key naming *another* client's statements folder would leak documents.

**Refactor:** before opening, the service (a) re-lists the resolved scope directory for **this caller** and (b) requires the requested key to be a member of that listing — an allow-list check, not string sanitisation. Anything else → `403`. This is the security control for the whole documents feature; it is not optional and not a frontend concern.

#### C-5. The Investment Policy Statement is not marked as periodically reviewed (Yes — user req.)

All seven specs in `compliance_doc_config.py:19-53` are `periodic_review=False` and none sets `review_interval_days`. The IPS renews annually.

**Refactor:** `investment_policy_statement` becomes `periodic_review=True, review_interval_days=365`. The other six stay `periodic_review=False`. `required` is unchanged for all seven, so `REQUIRED_COUNT` — which gates submit and approve — does not move, and no onboarding cycle changes shape.

`REQUIRED_DOCS` gains no new entries: the Supporting Documents surface is being shelved (Frontend A-4), so the `client_supporting` spec floated in the first draft of this proposal is **not** added.

#### C-6. `expires_at` is never written, so the renewal clock never starts (MANDATORY)

`OnboardingRepository.set_verdict` (`repository.py:297-303`) writes `status`, `reviewed_by`, `reviewed_at`, `issue_note` — not `expires_at`. Nothing else writes it either (see DB B-4). Marking the IPS `periodic_review=True` therefore accomplishes nothing on its own: `due_for_renewal` filters `expires_at.isnot(None)` and would match zero rows forever.

**Refactor:** in `set_verdict`, when the verdict is `VERIFIED` and `get_doc_spec(doc.doc_type).periodic_review` is true, set `doc.expires_at = doc.reviewed_at + timedelta(days=spec.review_interval_days)`. When the verdict is `REJECTED`, leave `expires_at` untouched (a rejection is not a review clock). Six lines in one repository method.

This is a Compliance-side write, not an RM-side one, and it changes no transition: `set_verdict`'s status handling, its callers, and every route that reaches it are unchanged. It fills a column that is `NULL` on 100% of rows today, so no existing behaviour can depend on its prior value.

> This closes the gap 013 left open. 013 Goal 9 shipped the scheduler and Non-Goals deferred *expiring* a document's status — but the `expires_at` **writer** fell between the two and was never built. Deferring it again would leave "the IPS renews annually" as a config flag with no effect.

#### C-7. No client-side document upload path (Yes — user req.)

`profile/page.tsx`'s KYC modal resolves locally (`applyKycStatus` writes `localStorage`). Uploading is RM-only today (`POST /rm/onboardings/{id}/documents/{doc_type}`), so a client with a renewal due must email their RM and have the RM upload on their behalf.

**Refactor:** `POST /api/client/kyc/{doc_type}` resolves the caller's own `client_onboardings` row (never an id from the request) and delegates to the **existing, unmodified** `OnboardingService.upload_document(onboarding_id, doc_type, stream=…, filename=…, content_type=…, caller_uid=caller.firebase_uid)`.

Everything that makes this safe is already in that method and is deliberately *not* re-implemented in the client route:

| Guard | Where it already lives | Effect for a client caller |
|---|---|---|
| cycle must be `initial` or `pending_review` | `service.py:180-184` (`_EDITABLE_STATUSES`) | 409 while the cycle is `reviewing` or `active` |
| doc must be re-uploadable | `service.py:187-190` (`_CAN_REUPLOAD_STATUSES`) | 409 once Compliance has it `in_review` or `verified` — the 013 Goal 3 rule, unchanged |
| storage path | `service.py:191-197` | same `client_kyc_docs/<client folder>` subdir the RM writes to |
| row mutation | `repository.upload_document` | `status → UPLOADED`, `version_no + 1`, `issue_note` cleared, `uploaded_by`/`uploaded_at` stamped |

The client route adds exactly two of its own guards: `doc_type` must name a `periodic_review=True` spec (else **422** — clients upload renewals, not the initial onboarding pack, which stays RM-driven), and the upload window must be open (**403**, C-8).

Because the write lands on the same row, the RM's board and client-info page — which already read `DocumentDTO.status` — show the item as `uploaded` on their next fetch with **no admin-side code change at all**. That is the whole mechanism for "RM doesn't have to upload again"; see D-4.

#### C-8. The 14-day upload window (Yes — user req.)

**Refactor:** a client may upload only once the renewal is within reach of its due date:

```python
CLIENT_UPLOAD_WINDOW_DAYS = max(0, int(os.getenv("CLIENT_UPLOAD_WINDOW_DAYS", "14")))
# same os.getenv convention as ONBOARDING_RENEWAL_LOOKAHEAD_DAYS / ONBOARDING_SETTLEMENT_DAYS

window_open = doc.expires_at is not None and \
              utcnow() >= doc.expires_at - timedelta(days=CLIENT_UPLOAD_WINDOW_DAYS)
```

`expires_at is None` ⇒ closed. That is the correct reading of "2 weeks before due": a document that has never been verified has no due date, and its first upload belongs to the RM-driven initial cycle.

**Interaction with the renewal scheduler (important, and asymmetric):** the scheduler reopens the cycle at `ONBOARDING_RENEWAL_LOOKAHEAD_DAYS` (default **30**) before `expires_at`, flipping it to `pending_review` and resetting the due doc to `not_started`. The client window opens at **14**. So the ordering is: day −30 the cycle reopens and the RM can act → day −14 the client can act too → the first upload of either party wins, and the other sees `uploaded`. The window guard is **necessary but not sufficient**: `upload_document`'s own cycle-status guard still applies, so if the two settings are ever inverted (client window > lookahead) the client simply gets the existing 409 until the scheduler reopens the cycle. Stated as an invariant for the impl doc: `CLIENT_UPLOAD_WINDOW_DAYS ≤ ONBOARDING_RENEWAL_LOOKAHEAD_DAYS`, asserted at startup rather than left to discover in production.

#### C-9. KYC panel state is not derivable client-side (Yes)

The profile page's tri-state badge (`due` / `processing` / `verified`) lives in `localStorage`. The real state is spread across `onboarding_documents.status` for the caller's cycle.

**Refactor:** `GET /api/client/kyc` returns `documents` as the **existing** `DocumentDTO[]` (no new document shape) plus a derived `overall`:

| `overall` | Rule |
|---|---|
| `verified` | every `required` doc is `VERIFIED` |
| `processing` | at least one doc is `UPLOADED` or `IN_REVIEW`, and none is `REJECTED`/`EXPIRED` |
| `due` | otherwise (a required doc is `NOT_STARTED`, `REJECTED`, or `EXPIRED`) |

The renewal fields come from the single `periodic_review` doc: `next_review_at = expires_at`, `upload_opens_at = expires_at - CLIENT_UPLOAD_WINDOW_DAYS`, `can_upload` = C-8's window **and** the two `upload_document` guards evaluated read-only, `upload_blocked_reason` naming whichever failed. Computing `can_upload` server-side means the button's enabled state and the route's 403 can never disagree.

> `ponytail:` panel-level renewal fields, because exactly one doc is periodic. If a second periodic spec is ever added, move these four fields onto a client-side document view-model rather than widening the shared `DocumentDTO`.

#### C-10. `uploaded_by` renders as a raw Firebase uid (Yes)

`DocumentDTO.uploaded_by` carries a raw `firebase_uid`, and the admin frontend prints it verbatim — `OnboardingBoard.tsx:176` and `rm/client-info/[id]/page.tsx:101` both render `Uploaded by {uid}`. That is already poor, and once clients upload it becomes actively misleading: an RM sees an unfamiliar uid on a document they did not upload.

**Refactor:** resolve `uploaded_by` to a display name in `_doc_to_dto` using the same name-resolution helper that already backs `assigned_rm` and `approved_by` (014 C-7), suffixed `" (client)"` when the uid matches the cycle's own `user_id`. A value change on an existing field — no DTO shape change, no admin-frontend change, and both existing render sites become correct for free.

#### C-11. Ticket lifecycle and RM scoping (Yes — user req.)

**Refactor:** `create_ticket` resolves `client_profiles.assigned_rm_uid` and snapshots it onto the row (NULL is allowed and shows in an ADMIN-only bucket), generates `reference`, and inserts with `status = NEW`. It also appends one `client_events` row (`category="Requests Status"`, title `"Ticket {ref} submitted"`) so the client's Events page and overview panel reflect it through the **existing** events endpoint — no second notification mechanism.

RM routes filter on the snapshot: `WHERE assigned_rm_uid = caller.firebase_uid` (ADMIN bypasses). `POST /rm/tickets/{ref}/status` accepts any of the 5 statuses, rejects a transition out of a terminal status (`closed`/`declined` → `409`), and stamps `responded_by`/`responded_at`/`response_note`.

Validation on `RaiseTicketReq` is a Pydantic `model_validator`: `kind != other` ⇒ `model_id` required and must be a LIVE model; `kind == other` ⇒ `subject` required, `model_id` must be absent.

#### C-12. Request history spans two tables (Yes)

The portfolio page's Ticket History and the overview's Recent Requests show allotments, redemptions and "Others" in one table. Allotments/redemptions live in `client_allotment_redemptions`; client tickets will live in `client_tickets`.

**Refactor:** `GET /api/client/requests` returns the union as `ClientRequestDTO[]`, sorted by `created_at DESC`, with `source` distinguishing origin. `AllotRdmpStatus` maps onto `TicketStatus` for display:

| `AllotRdmpStatus` | `TicketStatus` |
|---|---|
| `pending`, `awaiting_pc`, `awaiting_co` | `in_progress` |
| `acknowledged` | `replied` |
| `approved` | `closed` |
| `rejected` | `declined` |

Filtering/pagination stay client-side (the existing page already paginates 7-at-a-time over an in-memory array, and a single client's history is small). `ponytail: server-side pagination when a client crosses ~500 requests.`

#### C-13. RM contact card has no endpoint (Yes)

`HeaderActions.tsx` renders `MOCK_RM_CONTACT`. The data exists: `client_profiles.assigned_rm_uid → users.firebase_uid → admin_profiles.name/.phone_number` + `users.email`.

**Refactor:** carried on `ClientProfileDTO.assigned_rm` — no dedicated endpoint. The `whatsappNumber` field is dropped; `admin_profiles.phone_number` is the phone the firm actually stores.

#### C-14. Authorization (MANDATORY)

Every `/client/*` route depends on `get_current_client_user` and derives its subject from `user.id`; **no `/client/*` route accepts a client id, an onboarding id, or a raw storage path.** `/rm/tickets*` depend on the existing `require_action(...)` guard for the RM client-view action and additionally filter by the `assigned_rm_uid` snapshot — the dependency proves *a* RM, the filter proves *the* RM.

### D. Route / contract simplification

> **Decision (settled):** A-move, C-1 (one portfolio endpoint feeds cards + donut + table) and C-9 (RM contact folded into the profile DTO) are accepted; there is no `/client/rm-contact`, no `/client/stats`, and no `/client/dashboard` aggregate.
>
> Final client-facing route surface after this layer lands:
> ```
> GET   /api/client/profile                        personal info + RM contact
> PATCH /api/client/profile                        editable subset
> GET   /api/client/portfolio                      balances + positions
> GET   /api/client/portfolio/history              allocation series for the line chart
> GET   /api/client/subscriptions                  (existing, moved, unchanged)
> GET   /api/client/events                         (existing, moved, unchanged)
> GET   /api/client/models/recommended             catalogue minus own subscriptions
> GET   /api/client/models/{model_id}/material     market material download
> GET   /api/client/kyc                            doc panel + derived status + upload window
> POST  /api/client/kyc/{doc_type}                 client renewal upload (periodic docs only)
> GET   /api/client/documents/{scope}              legal | statements listing
> GET   /api/client/documents/{scope}/download     allow-listed download
> GET   /api/client/requests                       merged tickets + allotments
> POST  /api/client/tickets                        raise a ticket to the assigned RM
> GET   /api/rm/tickets                            RM inbox
> GET   /api/rm/tickets/{ref}                      RM ticket detail
> POST  /api/rm/tickets/{ref}/status               RM status action
> ```
> Net: **2 → 17 routes** (2 existing relocated unchanged, 15 new).

Note: `app/libs/trade_models/{schemas.py,router.py,service.py}` (`ModelCreate`/`ModelUpdate`/`ModelOut` and the PC model routes) are **untouched** by this layer — no route added, no field added. `model_limit` exists only as the DB column from B-5; nothing in the Backend layer reads or writes it outside the two client-facing DTOs it's projected onto (`PositionDTO`, `RecommendedModelDTO`), both of which will render it as `—` until a future proposal builds a writer.

### E. Summary of Backend-layer changes

| # | Change | Required? | Effort |
|---|---|---|---|
| A | New `app/libs/client_portal/` package (router/service/repository/schemas) | Yes | M |
| A′ | Move existing `/client/subscriptions` + `/client/events` into it, paths unchanged | Recommend | XS |
| B | All derivations server-side (`total_value`, `amount`, `notional`, running sums) | Yes | S |
| C-1 | Portfolio endpoint replaces the em-dash columns; country/sector/risk dropped from the contract | Yes — user req. | S |
| C-2 | `/client/models/recommended` + material download | Yes | S |
| C-3 | `FileStorage.list()` + `legal_docs_subdir` / `client_statements_subdir` settings | Yes | S |
| C-4 | Allow-list check on document download (path-traversal / cross-client) | MANDATORY | S |
| C-5 | IPS spec → `periodic_review=True, review_interval_days=365` | Yes — user req. | XS |
| C-6 | `set_verdict` writes `expires_at` for periodic docs (starts the renewal clock) | MANDATORY | XS |
| C-7 | Client self-upload delegating to the **unmodified** `OnboardingService.upload_document` | Yes — user req. | S |
| C-8 | 14-day upload window (`CLIENT_UPLOAD_WINDOW_DAYS`) + `≤ lookahead` startup assertion | Yes — user req. | XS |
| C-9 | `/client/kyc` with derived `overall` + server-computed `can_upload` | Yes | S |
| C-10 | Resolve `uploaded_by` to a display name, `" (client)"` when self-uploaded | Yes | XS |
| C-11 | Ticket create/list/status + `client_events` append + RM scoping | Yes — user req. | M |
| C-12 | `/client/requests` merged view + status map | Yes | S |
| C-13 | RM contact folded into `ClientProfileDTO` | Yes | XS |
| C-14 | Token-derived subject on every `/client/*` route | MANDATORY | S |

---

## Layer 3 — Frontend (client-frontend)

| File | LOC | Role |
|---|---|---|
| `app/(dashboard)/portfolio/page.tsx` | 573 | stat cards, 3 charts, 2 model tables, ticket history — the largest mock consumer |
| `app/(dashboard)/profile/page.tsx` | 627 | personal info, balance, document-verification cards + 2 upload modals |
| `components/ui/RaiseTicketModal.tsx` | 512 | 3 request forms, all writing to `localStorage` |
| `app/(dashboard)/overview/page.tsx` | 347 | hero, stat cards, recent requests, latest-events panel |
| `app/(dashboard)/documents/monthly-reports/page.tsx` | 142 | statement list + pagination |
| `app/(dashboard)/documents/legal-reports/page.tsx` | 94 | legal docs grouped by category |
| `app/(dashboard)/events/page.tsx` | 152 | event feed with category filters |
| `lib/mock/data.ts` + `lib/mock/store.ts` | 336 + 212 | **to delete** |

Canonical data flow, already established by 013: `page → lib/hooks/useX → lib/api/<module> → fetch(getApiBase() + path, Bearer)`. Every finding below extends that chain; no page calls `fetch` directly.

### A. Findings

#### A-1. Delete the mock layer (Yes — user req.)

`lib/mock/data.ts` and `lib/mock/store.ts` are imported by 8 files (`overview`, `portfolio`, `profile`, `legal-reports`, `monthly-reports`, `events`, `RaiseTicketModal`, `HeaderActions`, `FloatingActionButton`, `MockStoreInit`).

**Refactor:** delete both files and `components/MockStoreInit.tsx` (and its mount in `app/(dashboard)/layout.tsx`) at the **end** of this layer, once A-2…A-11 have removed every importer. Type definitions that survive as view-models (`EventEntry`, `EventIconType`, `ActionLevel`, `EventCategory`) move to `types/portal.ts`; every `MOCK_*` const and the whole `STORE_KEYS` registry die with the file. `lib/hooks/useLatestEvents.ts`, `useEventItems.ts`, and `useAllotmentRequests.ts` — all three pure `localStorage` readers — are deleted, replaced per A-9/A-11.

#### A-2. Portfolio: charts and cards on real data (Yes — user req.)

`BAR_DATA`, `LINE_DATA`, `DONUT_DATA` (`portfolio/page.tsx:49-80`) are module constants; the 4 stat cards read `MOCK_PORTFOLIO_STATS`.

**Refactor:** new `lib/api/portfolio.ts` + `lib/hooks/usePortfolio.ts` / `usePortfolioHistory.ts` (same `useEffect` + `getIdToken` shape as `useSubscriptions`). Bindings, **component structure unchanged**:

| Element | Was | Becomes |
|---|---|---|
| Donut "Asset Distribution" | `DONUT_DATA` | `positions[].{model_name, amount}` + a `Cash` slice = `cash_deposit`; colours from the existing palette by index |
| Line "Historical Track" | `LINE_DATA` (indexed to 100, 6 month labels) | `usePortfolioHistory()` → x = `month` ("YYYY-MM", rendered as the existing short month label), one series per `per_model` key + the `total` series in place of "YTD Avg"; tooltip formats currency, not `%`. Six calendar months by default, so the axis keeps its current shape and spacing |
| Bar "Return / Loss Performance" | `BAR_DATA` (fabricated returns) | net change per model across the 6-month window (`last.per_model[m] − first.per_model[m]`), plus a total bar in place of "YTD Avg"; the `ReferenceLine` at 0 keeps its meaning (positive/negative flow) |
| Card 1 Total Value | `MOCK_PORTFOLIO_STATS.totalValue` | `total_value` |
| Card 2 Cash Balance | mock | `cash_deposit` |
| Card 3 YTD Returns | mock | **relabelled** Amount in Trade → `amount_in_trade`, sub-line `change_amount` / `change_pct` vs previous run |
| Card 4 Portfolio Health "Optimal" | mock string | **relabelled** Subscribed Models → `positions.length`, sub-line = sum of `model_limit` (will read **$0** for every client until a future proposal builds a `model_limit` writer — see Non-Goals; this is a known, accepted day-one state, not a bug to chase) |

Chart titles change only where the current title names data that does not exist (see D-1); i18n keys are updated in-place, both `en` and `zh`.

#### A-3. Model attribute rework (Yes — user req.)

**Refactor:** Subscribed Models drops `country`, `sector`, and the `symbol` column that renders `—` for every row: **Model Name | Amount | Multiplier | Model Limit | IB Account** (5 columns, `gridTemplate="15rem repeat(4, 1fr)"`). Recommended Models drops `country`, `sector`, `risk` (and `RiskBadge`, now unused, is deleted) and `min_investment` (no source): **Model Name | Category | Model Limit | Subscription / Redemption | Market Material** (5 columns). `Category` is kept deliberately — it is a real PC-authored `models.category` value, not a mock leftover. `Model Limit` reads `models.model_limit` (DB B-5) and renders `—` for every model — this proposal deliberately builds no path for PC or anyone else to set it (see Non-Goals), so the column stays `NULL` until a future, separate proposal adds one. The Market Material button hits `/api/client/models/{id}/material` via `downloadAs` and is hidden when `has_material === false`. Dead i18n keys under `portfolio.subscribed_columns.*` / `portfolio.recommended_columns.*` and the whole `risk.*` namespace are removed from both locales.

#### A-4. Profile page (Yes — user req.)

**Refactor:**
- Personal Information reads `useProfile()`; `commitEdit` becomes `PATCH /api/client/profile` (optimistic update, revert + inline error on failure). The **Company field is removed** — input, label, i18n key, and the `ProfileInfo.company` type member; `Occupation` binds to the new column (DB B-2) and now shares its two-column grid row with **Date of Birth** (DB B-2, also new) instead of leaving that cell empty. Date of Birth renders as a plain read-only field (the page's existing `ReadOnlyField`/`ProfileField` pattern, no edit affordance, no "edit in Settings" link — per D-11 there is nowhere in the product a client can change it) formatted as a locale date string; it is never sent in the `PATCH` body. No grid or spacing rule changes. Phone/Email stay read-only with the existing "edit in Settings" affordance. The `displayName[0]` avatar initial guards an empty name (`name?.[0] ?? "?"`) — today it throws on an empty string.
- Account Balance reads `usePortfolio()` (`total_value`, `cash_deposit`), replacing `MOCK_PORTFOLIO_STATS`.
- **Document Verification** section reads `useKyc()`. The existing tri-state card (`due` / `processing` / `verified`, `profile/page.tsx:506-539`) keeps its exact markup and is retitled to the renewal document: badge from `overall`, the date line from `next_review_at`, "View document" downloading through the documents route instead of `/dummy-KYC-Report.pdf`. `applyKycStatus` and the `STORE_KEYS.kycStatus` write are deleted; after a successful upload the hook refetches. The stale `components/KycProvider.tsx` (a context nothing reads) is deleted.
- The **Upload** button binds to `can_upload`: enabled inside the window, otherwise disabled with the existing caption line reading "Available from {upload_opens_at}" — the FE renders the server's decision and never recomputes the 14 days. The upload modal POSTs multipart to `/api/client/kyc/{renewal_doc_type}` and surfaces 403/409/413/415 as inline errors instead of the current silent success. Its document-type `<select>` is removed: there is exactly one uploadable document and letting the client pick a different one only manufactures 422s.
- **AML card deleted** (`profile/page.tsx:541-558`) — see D-5. The row reflows from three cards to two under the existing `flex-wrap` + `min-w-[260px]`; no layout rule changes.
- **Supporting Documents card commented out, not deleted** (`profile/page.tsx:559-607`), together with `SupportingDocModal` (`:215-329`), its `supportingDocs` state, and the `SUPPORTING_DOC_CATEGORIES` / `SupportingDoc` types (which move into the commented block rather than dying with `lib/mock/data.ts` in A-1). One `ponytail:` comment above the block records why it is dormant and what reviving it needs: a `DocSpec` key per category, or a relaxed `UniqueConstraint(onboarding_id, doc_type)` if a client must keep several files of one kind.

#### A-5. Legal reports from the directory listing (Yes — user req.)

`MOCK_LEGAL_DOCUMENTS` (8 entries) groups by a hardcoded `category` and every row downloads the same dummy PDF.

**Refactor:** `useDocuments("legal")` → `StoredFileDTO[]`; group by `category` (the sub-folder name) with the existing `CATEGORY_KEYS` translation map retained as a *known-folder* lookup that falls through to the raw folder name for anything new. Download goes to `/api/client/documents/legal/download?key=…`. `StoredFileDTO` has no `description` field — the description column renders the filename stem when absent rather than being removed (no layout change). Empty directory → the existing empty-state row.

#### A-6. Monthly reports + FAB (Yes)

`MOCK_EOM_REPORTS` feeds both `monthly-reports/page.tsx` and `components/ui/FloatingActionButton.tsx:34` ("download latest statement").

**Refactor:** both read `useDocuments("statements")`. The Period column reads `StoredFileDTO.period` and falls back to `modified_at`; Generated reads `modified_at`; the FAB downloads `list[0]` (newest first, server-sorted) and is disabled when the list is empty. Pagination logic is untouched.

Expect this page to render **empty on day one** and stay that way until the EoM generator ships (D-7) — that is the correct state, not a wiring defect, and the acceptance check for this item is "empty state renders and the FAB is disabled", not "six statements appear". The seeded walkthrough (Execution step 4) drops a hand-made `2026-07_*.pdf` into the directory to prove the read path end-to-end.

#### A-7. Raise-ticket modal posts to the server (Yes — user req.)

All three forms call `lib/mock/store.ts`.

**Refactor:** single `submitTicket()` in `lib/api/tickets.ts` → `POST /api/client/tickets`. The Allotment form's model picker reads `useRecommendedModels()`; the Redemption form's reads `usePortfolio().positions` — which resolves the 013 blocker recorded in `lib/mock/data.ts:134-139` (a redemption could not be wired because `SubscriptionDTO` had no `amount`; `PositionDTO` now does). Client-side validation stays as-is minus the `minInvestment` rule (no such column — the check moves to the RM's judgement, and the hint line is removed). On 201 the modal closes and the request-history hook refetches; on error the footer shows the `detail` string instead of closing.

#### A-8. Request history and overview (Yes)

**Refactor:** `useRequests()` → `GET /api/client/requests` replaces `useAllotmentRequests()` + `MOCK_ALLOTMENT_REQUESTS` in both `portfolio/page.tsx` (full table, existing search + 7-per-page pagination over the returned array) and `overview/page.tsx` (`.slice(0, 3)`). `TicketStatusBadge` and `STATUS_BADGE` gain the 5th status `declined` (existing `badge-warning` style); `TypeBadge` maps `TicketKind` directly.

#### A-9. Overview stat cards and latest-events panel (Yes)

**Refactor:** cards bind to `usePortfolio()` (Total Portfolio Value = `total_value`; the "YTD Returns / benchmark" card becomes Amount in Trade with the `change_pct` sub-line, matching A-2). The Latest Events panel reads the newest 3 from `useClientEvents()` (`GET /api/client/events`, already live) instead of `useLatestEvents()`/`localStorage`; `LatestEvent.level` has no server counterpart, so every server event renders at the `info` treatment — the same fixed-chrome compromise `useOnboardingEvents` already makes.

#### A-10. Events page (Yes)

**Refactor:** drop `MOCK_EVENT_ITEMS` and `useEventItems()`; the feed is `useOnboardingEvents()` alone (rename → `useClientEvents`, same endpoint). Category filters keep working because `ClientEventDTO.category` is a real column — `mapEvent`'s hardcoded `"Account Notification"` is replaced by `dto.category`, with an unknown category falling into `Others`. `time` renders `created_at` through the existing relative-time formatting rather than raw ISO.

#### A-11. Header RM contact (Yes)

**Refactor:** `HeaderActions.tsx` reads `useProfile().assigned_rm`; the WhatsApp row becomes a phone row (`RmContactDTO.phone`). No assigned RM → the card shows the existing empty treatment instead of a fabricated name.

### B. Adapting to changes in other layers

| Upstream change | Frontend change | Files touched |
|---|---|---|
| Backend C-1 (portfolio replaces subscriptions for the table) | `useSubscriptions` deleted; `tests/lib/hooks/FE-7.useSubscriptions.test.ts` retargeted to `usePortfolio` | `lib/hooks/`, `tests/lib/hooks/` |
| Backend C-3/C-4 (opaque keys) | FE treats `key` as opaque: never parses, never constructs, always round-trips verbatim | `lib/api/documents.ts` |
| Backend C-9 (`DocumentDTO` reused) | FE imports the existing document type; no second document shape in `types/portal.ts` | `lib/api/documents.ts`, `profile/page.tsx` |
| Backend C-12 (5-value `TicketStatus`) | Badge maps gain `declined`; `status.*` i18n keys added in `en` + `zh` | `portfolio/page.tsx`, `overview/page.tsx`, locales |
| DB B-2 (`occupation`, `date_of_birth`) | Occupation binds to a real editable value (`—` when `null`); Date of Birth renders read-only in the same row; the Company field is removed | `profile/page.tsx` |
| DB B-5 (`models.model_limit`) | Model Limit column reads the new field; renders `—` for every model — no authoring path exists in this proposal (see Non-Goals) | `portfolio/page.tsx` |

### C. Additional findings

#### C-1. Dead `/support` route (Recommend)

`app/(dashboard)/support/page.tsx` is a 12-line title-only stub, not present in `SidebarNav`'s `NAV_ITEMS`, and unreachable in the shipped nav. **Refactor:** delete the route and its `support.*` i18n keys. Support *is* the ticket flow, which lives on the portfolio page.

#### C-2. `mock.*` i18n namespace (Yes)

`overview/page.tsx:323` and `events/page.tsx:60-67` look up `t("mock.latest_events.*")` / `t("mock.event_items.*")` with `defaultValue` fallbacks — per-mock-row translations that cannot exist for server rows. **Refactor:** delete the `mock.*` namespace from both locales and render server strings directly. Server-authored content is untranslated; that is a known limitation of any DB-sourced feed and is not introduced here.

#### C-3. Stale `PortalUser` type (Recommend)

`types/portal.ts` is 5 lines and predates the UUID migration (see memory `db_foundation_005` follow-up). **Refactor:** fold the surviving view-model types from A-1 into it and confirm the shape against `UserOut`.

### D. Summary of Frontend (client) changes

| # | Change | Required? | Effort |
|---|---|---|---|
| A-1 | Delete `lib/mock/*`, `MockStoreInit`, 3 localStorage hooks | Yes — user req. | S |
| A-2 | Portfolio charts + 4 stat cards on `usePortfolio` / `usePortfolioHistory` | Yes — user req. | L |
| A-3 | Model attribute rework (drop country/sector/risk/symbol/min-investment) | Yes — user req. | M |
| A-4 | Profile: info + PATCH, balance, renewal card + windowed upload, AML card deleted, Supporting Documents commented out | Yes — user req. | L |
| A-5 | Legal reports from `/documents/legal` | Yes — user req. | S |
| A-6 | Monthly reports + FAB from `/documents/statements` | Yes | S |
| A-7 | RaiseTicketModal → `POST /client/tickets`; real model pickers | Yes — user req. | M |
| A-8 | Request history + overview recent requests from `/client/requests` | Yes | M |
| A-9 | Overview stat cards + latest-events panel | Yes | S |
| A-10 | Events page on `/client/events` alone | Yes | S |
| A-11 | Header RM contact from profile DTO | Yes | XS |
| C-1 | Delete dead `/support` route | Recommend | XS |
| C-2 | Delete `mock.*` i18n namespace (en + zh) | Yes | XS |
| C-3 | Tidy `types/portal.ts` | Recommend | XS |

---

## Layer 4 — Frontend (admin-frontend, RM inbox)

The client half of ticketing is worthless if the RM never sees it. `admin-frontend` already has the whole UI — `app/(roles)/rm/requests/page.tsx`, `app/(roles)/rm/requests/[ref]/page.tsx`, and `components/rm/RequestTickets.tsx` (inbox + detail + reply panel + decline action) — reading `TICKET_QUEUE`, an array whose every element is commented out. This layer swaps the data source; **no component is redesigned.**

Scope note: this layer covers **ticketing only**. The client renewal-upload feature deliberately produces no admin-frontend work — see D-4 — because the client writes the row the RM board already reads. `models.model_limit` (DB B-5) also produces **no** admin-frontend work: no field on `EditModelForm`/`ModelDetailPanel`, no change to `lib/pc/types.ts` — per Non-Goals, this attribute has no authoring surface anywhere in this proposal, on either frontend.

### A. Findings

#### A-1. Inbox reads a mock array (Yes — user req.)

`components/rm/RequestTickets.tsx:28` imports `TICKET_QUEUE` and `SUB_CLIENTS`; the status strip counts (`New` / `In Progress` / `Closed`) are computed from it at lines 72-79.

**Refactor:** new `lib/api/tickets.ts` + `useRmTickets()` → `GET /api/rm/tickets`. `RmTicketDTO` was shaped in §4.1 to match the existing `RequestTicket` type field-for-field, so the mapping is one adapter function: `type` from `kind` (`allotment|redemption|other` → `Allotment|Redemption|Other`), `tone` from `status` via the existing `ChipTone` map, and `cash`/`mult`/`notional` formatted from the numeric DTO fields. `isClosed()` keeps its current semantics against the 5-value status.

#### A-2. Detail page resolves from the mock array (Yes)

`app/(roles)/rm/requests/[ref]/page.tsx` does `TICKET_QUEUE.find(t => t.ref === ref)` then `notFound()`.

**Refactor:** `GET /api/rm/tickets/{ref}`; 404 → `notFound()` as today, loading → the existing skeleton pattern used by the sibling RM pages.

#### A-3. Reply / Decline are inert (Yes — user req.)

`RequestTickets.tsx:351` renders a disabled-when-closed **Decline request** button and a `ReplyPanel` with no submit path.

**Refactor:** both POST `/api/rm/tickets/{ref}/status` — Decline sends `{status: "declined", note}`, Reply sends `{status: "replied", note}`, and the inbox's implicit "start work" action sends `{status: "in_progress"}`. On success the detail refetches; a `409` (terminal status) surfaces inline.

#### A-4. Dashboard "Open Requests" counts (Yes)

`lib/mock/rm-data.ts:451` derives `REQUEST_TICKETS` counts from `TICKET_QUEUE`.

**Refactor:** counts derive from `useRmTickets()`; `TICKET_QUEUE`, `REQUEST_TICKETS`, `isOpenTicket` and the `RequestTicket` type are deleted from `rm-data.ts` (the rest of that file's mock overlays stay — they belong to other tracks).

### B. Summary of Frontend (admin) changes

| # | Change | Required? | Effort |
|---|---|---|---|
| A-1 | Inbox + status strip on `GET /api/rm/tickets` | Yes — user req. | M |
| A-2 | Detail page on `GET /api/rm/tickets/{ref}` | Yes | S |
| A-3 | Reply / Decline / In-Progress → status endpoint | Yes — user req. | S |
| A-4 | Dashboard open-request counts; delete `TICKET_QUEUE` + `REQUEST_TICKETS` | Yes | XS |

---

## Design decisions (settled)

- **D-1 — No fabricated returns.** Nothing in this database stores a NAV, a cost basis, or a P&L; `client_portfolios` and `post_trade_allocations` record *flows of capital*, not performance. The two performance charts and the "YTD Returns" / "Portfolio Health" cards are therefore re-based onto allocation and exposure data and relabelled to say what they actually show. The alternative — computing a "return" from allocation deltas — would put a number in front of a client that looks like performance and is not. Layout, component set, and chart types are unchanged.
- **D-2 — A client ticket is a request, not an execution.** `POST /api/client/tickets` never writes `client_allotment_redemptions`. The RM reads the ticket and files the real allotment/redemption through the existing 016/017 flow, which keeps the PC/CO approval chain intact and stops an unapproved client request entering the PC queue.
- **D-3 — One stored status vocabulary, two labels.** `client_tickets.status` stores the RM vocabulary the admin inbox already uses (`new`/`in_progress`/`replied`/`closed`/`declined`); the client portal renders the same five values with client-facing labels (Sent / Processing / Received / Fulfilled / Declined). One enum, two label maps — no dual-write, no derived status column.
- **D-4 — Client upload is a state update on the shared row, not a second pipeline.** 013 Goal 1 fixed one onboarding cycle per client whose single authoritative status the RM, Compliance and Client views each *project*. The client upload honours that literally: it calls the same `OnboardingService.upload_document`, hits the same guards, writes the same row, and lands the document in the same storage folder. Nothing is mirrored, queued, or synced — the RM's pending item flips to `uploaded` because it is reading the row the client just wrote. The only observable differences on the RM side are the document's status (which is the point) and `uploaded_by` now naming the client (Backend C-10). Consequently **Layer 4 has no work for this feature**: the RM board, the client-info page, and the Compliance queue all keep working untouched.
- **D-5 — AML card removed, Supporting Documents shelved.** No AML table, column, or DocSpec exists anywhere in the repo, so the hardcoded "AML — Verified" card was asserting a compliance fact the system cannot back — it is deleted rather than wired. Supporting Documents is commented out with its modal intact: the feature is wanted eventually, and the `DocSpec`-key/unique-constraint work it needs (first-draft C-5, now dropped) is not worth carrying for a surface that is being switched off in the same release.
- **D-6 — The window is 14 days, the reopen stays at 30.** Narrowing `ONBOARDING_RENEWAL_LOOKAHEAD_DAYS` from 30 to 14 would have aligned the two dates with no new setting, but it would change *when the RM's board reopens a cycle* — an RM-side behaviour change the user explicitly ruled out. Instead the reopen keeps its 30-day lead and the client route carries its own 14-day gate, with a startup assertion that the client window never exceeds the lookahead (Backend C-8).
- **D-7 — Firm documents come from a directory, not a table; statements are a repository for a generator that does not exist yet.** Legal documents are files the firm produces outside this system, so a catalogue table would need a second admin UI to keep in sync with the filesystem — a directory listing through the existing `FileStorage` adapter needs neither and swaps to NAS with the adapter (`STORAGE_BACKEND=nas`). End-of-month statements are the same read path but a different story: they are meant to be **system-generated**, that generator is not built, and this proposal deliberately builds only the drop-point and the read side. When generation ships it writes files into `client_statements/<client folder>` following §4.1's `YYYY-MM` filename token and the client page lights up with no further API or frontend work. Until then the page renders empty, which is the truthful state. Cost of the whole approach: no per-document description or ordering metadata beyond the filename and mtime (see Frontend A-5).
- **D-9 — `model_limit` is its own column, not `model_size`, and is a placeholder — not authorable — in this proposal.** `model_size` prices one unit and is load-bearing arithmetic — `SUM(cs.multiplier * m.model_size)` drives the allocation matrix's fund column and is frozen into `allocation_model_snapshots`. A model's limit is an unrelated business fact that merely shares a currency unit. Deriving one from the other would mean any future change to either silently rewrites the other; a nullable column on `models` costs a line of DDL and keeps the two independent. It lives on `models` rather than `client_subscriptions` because the Recommended table shows a limit for models the client has no subscription row for. Unlike every other new column in this proposal, it deliberately ships **without** a writer: model limits are a risk-management control whose SOP hasn't come from stakeholders yet, so no `ModelCreate`/`ModelUpdate`/`ModelOut` field, no PC form input, and no admin-frontend change of any kind exist for it — see Non-Goals. It renders `—` on the client's tables (and the Card 4 sub-line sums to $0) until a future proposal, informed by that SOP, adds the authoring path.
- **D-10 — Time series bucket by calendar month.** An allocation *run* is an operational event whose frequency the client neither sees nor controls; six runs could be six days or six months, so a run-indexed axis is unreadable and unstable. Months are what the design already shows and what a client thinks in. The bucket key is `substr(trade_date, 1, 6)` on the existing `"YYYYMMDD"` token — no date parsing and no timezone question — and months with no run carry the previous cumulative forward so the axis stays evenly spaced.
- **D-8 — Reuse `DocumentDTO`, don't invent a client document shape.** The client KYC panel needs exactly what the RM/Compliance panels need. `KycPanelDTO.documents` is `list[DocumentDTO]` verbatim from `app/libs/onboarding/schemas.py`, so a change to document semantics lands in one place.
- **D-11 — Date of birth is read-only, not a second editable identity field.** `date_of_birth` (DB B-2) is captured once, at onboarding (`client_onboardings.id_type`/`.id_number` already establish identity), and verified by Compliance as part of the KYC document set. Letting a client silently change their own date of birth after that would let them alter an identity fact the firm has already verified against a document, with no re-verification step. It follows the exact pattern already established for `email`/`phone` in this same DTO: present on `ClientProfileDTO`, absent from `ClientProfilePatch`, rejected with 422 if a caller sends it anyway (the seam's existing `extra="forbid"` behavior, not new mechanism). `occupation` stays editable — it carries no identity-verification weight.

---

## Objectives & standard of the expected outcome

- **No mock left.** `rg "MOCK_" client-frontend/{app,components,lib}` returns nothing; `rg "localStorage" client-frontend/app` returns nothing outside theme/locale preferences.
- **Logic lives once.** No money arithmetic, status derivation, or aggregation in either frontend — `rg` for `*` / `+` on DTO fields in `.tsx` finds only formatting.
- **Additive & reversible at the DB.** One Alembic revision, additive-only up; the down-migration's losses are stated in Rollback and accepted before the migration runs.
- **Ownership is provable.** A client bearing a valid token cannot fetch another client's portfolio, documents, or tickets by any parameter the API accepts — there is no such parameter.
- **Design parity.** A side-by-side of every touched page shows identical structure and spacing; the only visible differences are removed columns (A-3), relabelled cards/charts (D-1), and real values.

---

## Execution & verification

1. **DB layer** (`client-portal-integration-db`) — one Alembic revision for B-1 + B-2 + B-4; verified by `alembic upgrade head` then `downgrade -1` then `upgrade head` on a scratch DB, plus model round-trip tests asserting the enum values persist as lowercase strings (the `values_callable` convention). B-4 is additionally verified by seeding three synthetic IPS rows on the scratch DB (verified-recently, verified-over-a-year-ago, not-yet-verified) and asserting the resulting `expires_at` values, including that the third stays `NULL` — this exercises the backfill SQL's edge case even though no over-a-year-ago row exists in the real data today (see B-4). B-5 is verified by asserting the existing allocation-matrix fund query is byte-identical before and after (it must not reference `model_limit`).
2. **Backend layer** (`client-portal-integration-be`) — the `client_portal` package against the frozen §4 seam. Verified by pytest over a seeded fixture (one client with subscriptions + a portfolio row, one client **without** a portfolio row, one client with no RM): every route's shape matches §4.1; C-4's allow-list rejects `../` and a sibling client's key with 403; C-14 has no route accepting a subject id (asserted by inspecting the router's signatures); the C-12 status map is exhaustive over `AllotRdmpStatus`. The monthly bucketing (D-10) gets its own cases: two runs in the same month collapse to one point; a month with no run carries the previous cumulative forward rather than being omitted or zeroed; the first point's cumulative includes every run *before* the window; and `months=1` and `months=24` both return exactly that many points.

   The renewal path gets its own test set, since it is the one place this proposal touches shipped RM/Compliance behaviour: (a) verifying a `periodic_review` doc sets `expires_at` to exactly +365d and verifying a non-periodic one leaves it `NULL`; (b) a rejection never sets it; (c) client upload is 403 at 15 days out and 200 at 13; (d) client upload of a non-periodic `doc_type` is 422; (e) after a client upload the row reads `status=uploaded`, `version_no+1`, `uploaded_by=<client uid>` — i.e. exactly what an RM upload produces, asserted by running both paths against the same fixture and diffing the row; (f) **regression:** the existing onboarding suite (`tests/libs/onboarding/`) passes unchanged — no test may be edited to accommodate this proposal, and an edit there is the signal that RM logic moved.
3. **Frontend layers** (`client-portal-integration-fe`, `client-portal-integration-admin-fe`) — buildable in parallel with each other, both against §4.1. Verified by vitest over mocked `fetch` (hook mapping, empty-list and null-field rendering, error surfacing) plus `tsc --noEmit` and a lint pass; the mock-layer deletion is verified by the `rg` checks in Objectives.
4. **Live-data walkthrough** — with the backend running against the dev DB and files staged in `STORAGE_ROOT/legal_docs` and `STORAGE_ROOT/client_statements/<client>`: log in as a seeded client, confirm every page renders real values, raise one ticket of each kind, then log in as that client's RM and confirm all three appear in the inbox and that a status change round-trips to the client's history.

**Human gate(s):**
- **Before step 1's migration is applied to any shared DB** — additive, but it is a schema change on a live database (repo standing rule). No behavioural sign-off is needed beyond the schema itself: B-4's backfill lands every existing verified row ~356–365 days out, so it triggers zero renewals on the next scheduler tick (see B-4).
- **After step 3, before merge** — visual confirmation of every touched page against the current design, specifically the relabelled charts and cards from D-1 (this is the same gate proposal 012 used, per memory `proposal-012-fe-execution`).
- **Merge to `main`** — the human alone opens and merges the PRs; agents stop at "branch pushed + PR drafted".

Branch naming follows the house convention: `client-portal-integration-{db,be,fe,admin-fe}`, each cut from and merged back into `client-portal-integration`.

---

## Rollback

- **Layers 2/3/4** revert cleanly with a branch revert — no persisted state of their own.
- **Layer 1 is lossy downward.** `alembic downgrade -1` drops `client_tickets` (every ticket raised since the upgrade is lost, including RM responses), drops `client_profiles.occupation`/`.date_of_birth` and the seven B-6 relationship-management columns, and drops `models.model_limit` (any values entered in any of these are lost). Nulling B-4's `expires_at` is exact — the column held nothing beforehand — but any onboarding cycle the scheduler already reopened **stays** reopened (`kind=renewal`, `status=pending_review`); the down-migration does not un-reopen a renewal, and doing so automatically would be worse than leaving it for an RM to resolve. The *upgrade* is additive and touches no existing row apart from B-4's targeted `expires_at` write. If a rollback is needed after tickets exist, dump `client_tickets` first.
- Files written to `STORAGE_ROOT` are never deleted by any rollback — the backend only reads the legal/statements directories, and client uploads follow the existing onboarding-document lifecycle.

---

## Open questions

### Resolved

- **Backfill baseline (was Q-1).** DB B-4 anchors the clock to each row's true review date, `COALESCE(reviewed_at, created_at) + 365d`, with no `NOW()`-based amnesty variant. `onboarding_documents` was introduced by 013 (2026-07-19), nine days before this proposal, so no currently-verified row is old enough to land inside the scheduler's 30-day lookahead — the backfill triggers zero renewals on deploy. An amnesty baseline would exist only to protect against a backlog this system doesn't have yet; it's deferred to whichever future revision first needs to reconcile one, if that ever happens.
- **Statement generation** — settled: statements are system-generated, the generator is a later track, and this proposal builds only the repository + read path (D-7).
- **`models.category`** — settled: kept. It is a genuine PC-authored model attribute, unlike country/sector/risk.
- **History window** — settled: calendar month, six by default (D-10).
- **Model limit** — settled: its own `models.model_limit` column, never derived from `model_size`, and deliberately **not** authorable by anyone in this proposal — a placeholder pending a risk-management SOP from stakeholders (D-9, Non-Goals).
- **Company field** — settled: dropped from all three layers; only Occupation gains a column.

### Out of scope (tracked elsewhere)

- **End-of-month statement generation** — the writer for `client_statements/<client folder>`; future track. This proposal's read path is complete and needs no change when it lands.

- **A real NAV / performance feed** — future proposal; D-1 is the interim honest position.
- **Firebase service-account key rotation** — open since 2026-06-24, blocks registration (`register-firebase-key-bug`); unrelated to this work but will block any end-to-end test that creates a new client.
- **Server-side pagination on `/client/requests`** — deferred with a `ponytail:` marker (Backend C-12).
- **Translating server-authored event/ticket text** — noted in Frontend C-2; needs a content strategy, not a code change.
