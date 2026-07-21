# 013 — Client Onboarding Integration (RM → Compliance → PC → Client)

> Status: **DRAFT — pending implementation approval.**
> Scope: Wire the four hardcoded onboarding surfaces (RM onboarding kanban, Compliance review, PC allotments tab, Client Event/Portfolio) to a single backend-owned onboarding state machine — new DB tables, a new `onboarding` backend package, and frontend data-access replacing the mock seeds. Out of frame: the redemption/large-redemption workflow, the general (non-onboarding) events feed, document expiry *enforcement*, and any design/layout change to the existing pages.
> Constraint: **No design or layout change** to any of the four pages — this proposal replaces their data source, not their appearance. The onboarding record is the **single source of truth**: every role endpoint is a *projection* of the same `client_onboardings` + `onboarding_documents` rows, so a client that RM sees in "Reviewing" is byte-identically the record Compliance reviews.

---

## 1. Context and Motivation

Four pages implement the end-to-end onboarding flow described in the spec, and **all four are 100% hardcoded** — no `fetch`, no API client, no persistence. Each reads a local mock module and mutates React `useState`; nothing survives a reload and the four pages share no data, so an "approval" on the Compliance page is invisible to the RM board.

Concrete surfaces today:

| Role | Page | Mock source | State machine today |
|---|---|---|---|
| RM | `admin-frontend/app/(roles)/rm/onboarding-renewal/page.tsx` | `lib/mock/rm-data.ts` (`KYC_COLS`, `KYC_DOCS`) | 4 kanban columns keyed off a static `preset` string per card |
| Compliance | `admin-frontend/app/(roles)/compliance/review/page.tsx` | `lib/compliance/mock.ts` (`CO_ONBOARDING`, `DOC_NAMES`) | per-doc verdicts live only in ephemeral page state |
| PC | `admin-frontend/app/(roles)/pc/allotment-redemption/page.tsx` | `lib/pc/allotment-redemption-mock.ts` (`AR_ALLOTMENTS_SEED`) | `pending → acknowledged`, in-memory |
| Client | `client-frontend/app/(dashboard)/{events,portfolio}/page.tsx` | `lib/mock/data.ts` (`MOCK_EVENT_ITEMS`, `MOCK_SUBSCRIBED_MODELS`) | localStorage + hardcoded array |

The backend has an onboarding *seed* but not the flow: `POST /api/rm/clients` + `ClientService.onboard` (`app/libs/clients/service.py:38`) create a client `User` (staged `AccountStatus.DISABLED`) + `ClientProfile`, and stop there. There is **no** onboarding-status table, **no** compliance-document table, **no** activation step, and `client_subscriptions` (`app/models/pc.py:192`) is never written by onboarding. The `COMPLIANCE` role has an **empty** action set (`app/libs/auth/actions.py`), so no compliance endpoint can be authorized today.

The spec ("The specification for the entire client onboarding workflow") defines one onboarding lifecycle owned jointly by RM, Compliance, and the Client (create → review → approve → activate), with PC as a downstream, decoupled consumer of only the lifecycle's side effect — the initial allotment — and requires the state to be *sustained* (statuses, per-doc approval, allotment history). This proposal builds that lifecycle once, in the backend, and re-points all four pages (the three lifecycle participants plus PC's allotment consumer) at it.

> **Why now / why this order.** The frontend for all four pages already exists and is stable; the only missing piece is the shared backend state machine. Building it as one cross-layer proposal (rather than one proposal per page) is what guarantees the RM/Compliance/Client lifecycle coheres — the user's key requirement is that "a client in RM's Reviewing queue is visible to Compliance," which is only true if there is exactly one record and one status field behind both views. PC stays correctly decoupled: it never joins that state machine, it only reads the anonymized allotment row the machine produces on approve.

---

## 2. Goals

1. Persist one onboarding **cycle** per client with a single authoritative `status ∈ {initial, reviewing, pending_review, active}`, so the RM, Compliance, and Client views each project the same row (PC is deliberately outside the onboarding state machine — see Goal 4/D-1).
2. Persist every compliance document as its own row with an authoritative `status ∈ {not_started, uploaded, in_review, verified, rejected, expired}` + reviewer + issue note, replacing the ephemeral per-doc verdict state.
3. Enforce the spec's transition rules server-side: **Submit All** requires all required docs uploaded; **reupload is forbidden** while a doc is `in_review` or `verified`; Compliance **approve** requires every doc `verified`.
4. On approve, run the follow-up side-effects atomically: write `client_subscriptions`, create an **allotment** row (`note="initial allotment"`, pending PC ack), flip the client `User` to `ACTIVE`, and emit a client onboarding **event**.
5. Retain **allotment history** (append-only), including the initial allotment.
6. Make the required-document set + which docs need periodic review a **config file**, extensible to future doc types without a migration (per spec technical §).
7. Replace the mock seeds on all four pages with live data — **no layout change**.
8. Persist a **per-client fee override** on `client_subscriptions` when the onboarding-captured mgmt/incentive fee diverges from the model's own default (`Model.mgmt_fee`/`Model.incentive_fee`); leave it unset when it matches, so the model default is inherited.
9. **Auto-reopen a client's onboarding record for renewal** (`status: active → pending_review`, `kind → "renewal"`) via a background scheduler when a periodic-review document approaches `expires_at`, following the existing `app/libs/*/scheduler.py` asyncio-tick pattern (`allocation_matrix/scheduler.py`, `post_trade_allocation/scheduler.py`) — see Backend C-6. The client's login/portfolio access is untouched throughout.

## 3. Non-Goals

- **Redemption / large-redemption workflow** (Compliance "Redemptions" tab, PC "Redemptions" tab, the US$300K compliance gate) — pre-existing, separate flow; not touched here.
- **Document expiry enforcement** — the schema carries `expires_at` + a `periodic_review` config flag, but the "expire a document after N days" job is explicitly deferred (spec: "No need to implement the logic to 'expire' a document; just ensure one can be added").
- **General events feed** (Market News, etc.) — only the onboarding-generated event is written; the broader Event page content stays mock — owned by a future client-events proposal.
- **Fee calculation / billing engine** — no computation of amounts owed, no invoicing, no fee-schedule versioning history. What IS in scope: persisting the mgmt/incentive fee **actually agreed for a given client's subscription** when it diverges from the model's own default (e.g. a negotiated discount) — see Goal 8 / DB B-5. That is storage of an agreed value, not a calculation engine (consistent with the spirit of [[pc-workspace-006-decisions]]: no fee *computation* is modeled here either).
- **Document expiry *status* enforcement** — no job flips a verified document's own `status` to `expired`; `DocStatus.expired` stays a reserved-but-unused enum value (per spec: "no need to implement the logic to 'expire' a document; just ensure one can be added"). This is distinct from the renewal-cycle *trigger* below, which reads `expires_at` directly and does not depend on the document's `status` column — see Goal 9 / Backend C-6.

---

## 4. Cross-layer seam (frozen here)

### 4.1 The wire contract

All routes are under `/api`. Auth: admin routes carry a Firebase bearer token resolved to a `User` + admin profile; client routes use `get_current_client_user`. Errors use the existing FastAPI envelope `{"detail": "<message>"}` with the codes noted per route.

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

### 4.2 Per-layer obligations against the seam

| Layer | What this layer contributes | What this layer assumes from the other side |
|---|---|---|
| Database | `client_onboardings`, `onboarding_documents`, `client_allotment_redemptions` tables; writes `client_subscriptions` + `users.status='active'` inside the approve transaction | Backend never writes an enum value outside the §4.1 ranges; `multiplier` fits `Numeric(28,10)` |
| Backend | Serves every DTO/route in §4.1 with the stated codes; owns all transitions + the atomic approve side-effects; computes `can_reupload`, `verified_count`, `amount` server-side | DB tables exist per Layer 1; `get_storage()` + `models` table present; RBAC actions registered |
| Frontend | Consumes the DTOs, maps them onto the existing mock-shaped types (no layout change), sends the mutation calls | Backend returns DTOs exactly as in §4.1; status strings match the enum literals verbatim |

**Status projection (how one row feeds every view) — frozen mapping:**

| DB `client_onboardings.status` | RM board column | Compliance `ObStatus` | Client can log in? |
|---|---|---|---|
| `initial` | Initial Onboarding | (not shown) | no (`users.status` still `DISABLED`) |
| `reviewing` | Reviewing | `pending` | **depends on `kind`** — see note |
| `pending_review` | Pending for Review | `rejected` | **depends on `kind`** — see note |
| `active` | Active | `approved` | yes (`users.status` is `ACTIVE`) |

> **Note — login access is driven by `users.status`, not `client_onboardings.status`, and the two only move together on the *first* cycle.** `users.status` flips `DISABLED → ACTIVE` exactly once, at a `kind="initial"` approve (D-4), and is never flipped back by anything in this proposal. So for a `kind="initial"` row still in `reviewing`/`pending_review` (the client has never been approved yet), the client cannot log in. But once a client has been activated, a later renewal (`kind="renewal"`, D-7) can push the **same row** back to `reviewing`/`pending_review` without touching `users.status` at all — that client keeps logging in and using the portal throughout the entire renewal review. Reading "Client can log in?" off `client_onboardings.status` alone is therefore wrong; a reader must check `users.status` directly.

### 4.3 Change protocol (post-freeze)

- Any edit to §4 requires a new proposal revision or a dated addendum here. Every impl doc's §7 is a verbatim copy of §4.1 and is re-copied on any change.
- The seam is never renegotiated between two impl docs directly.

---

## Layer 1 — Database

### A. Tables / objects in scope

| File | Tables / objects |
|---|---|
| `app/models/onboarding.py` *(new)* | `ClientOnboarding`, `OnboardingDocument`, `ClientAllotment`, `ClientEvent` |
| `app/models/pc.py` *(read/write)* | `ClientSubscription` (written on approve; gains `mgmt_fee_override`/`incentive_fee_override` columns — B-5), `Model` (read for `model_id`/`size`/`mgmt_fee`/`incentive_fee` defaults) |
| `app/models/users.py` *(read/write)* | `User.status` → `active`, `User.authorized_by`; `ClientProfile` (created via existing path; read-only thereafter for `primary_phone`/`address`/`country_of_residence`/`ib_account`/`assigned_rm_uid` — widened 2026-07-20, D-9) |
| `alembic/versions/….._0018_client_onboarding.py` *(new)* | one revision, `down_revision="817926e7604a"` |

### B. Findings

#### B-1. No onboarding-cycle record exists (MANDATORY)

Onboarding today is only user+profile creation (`clients/service.py:38`); there is nowhere to store the spec's four statuses, the initial model/units, the submit/decision timestamps, or the reject reason. The RM board fakes status with a per-card `preset` string in mock data.

**Refactor:** New `client_onboardings` table — **one row per client**, not per cycle. A renewal reopens this same row in place (see D-7) rather than inserting a second one; `kind` records which flow produced the row's current state, `status` is always the client's one current onboarding status:

```
id              Uuid(native_uuid=False) PK  default uuid4
user_id         Uuid FK users.id (ondelete CASCADE), unique, index   # one row per client — renewals reopen it, never insert a second
kind            SAEnum(OnboardingKind, native_enum=False) default "initial"   # "initial" until a renewal reopens the row, then "renewal" (stays "renewal" after)
status          SAEnum(OnboardingStatus, native_enum=False) default "initial", index
model_id        Uuid FK models.id                               # initial model to subscribe
multiplier      Numeric(28,10) not null                         # "Model Unit"
mgmt_fee        Numeric(9,6) nullable                           # as agreed at Trade Info step; same precision as Model.mgmt_fee
incentive_fee   Numeric(9,6) nullable                           # as agreed at Trade Info step; same precision as Model.incentive_fee
ibhk_account    String(255) nullable
sw_account      String(255) nullable
id_type         String(64) not null                             # e.g. "Hong Kong ID Card" | "Passport" — widened 2026-07-20 (D-9); genuinely new, no prior column anywhere carried this
id_number       String(128) not null                            # widened 2026-07-20 (D-9)
submitted_at    DateTime(tz) nullable                           # set on Submit All
decided_at      DateTime(tz) nullable                           # set on approve/reject
reject_reason   Text nullable
created_at / updated_at   server_default func.now() / onupdate func.now()
Index("ix_client_onboardings_status", "status")
```
`ClientProfile` stays the client's identity/KYC home (it already has `assigned_rm_uid`, `ib_account`, `primary_phone`, `address`, `country_of_residence` — all read via join for `OnboardingDTO`, never duplicated here); the onboarding record is the *cycle* on top of it. **Widened 2026-07-20 (D-9):** `id_type`/`id_number` are added to this table — the RM's Start Onboarding form already collects them (`OnboardingModal.tsx`) but the original DDL omitted them; they are cycle-specific (an ID can change between onboarding cycles) so they belong here, not on `ClientProfile`.

#### B-2. No compliance-document table; per-doc verdict is ephemeral (MANDATORY)

The Compliance page stores per-doc verdicts in `docVerdicts: Record<obId, DocVerdict[]>` **page state only** (`compliance/review/page.tsx`), and the RM board derives a `count/7` from a hardcoded `VERIFIED_COUNT` lookup, not from real docs. Nothing persists which document passed, who reviewed it, or why one was flagged.

**Refactor:** New `onboarding_documents` table — one row per (cycle, doc_type), modeled on `ModelMaterial` (`app/models/pc.py:121`):

```
id              Uuid PK default uuid4
onboarding_id   Uuid FK client_onboardings.id (ondelete CASCADE), index
doc_type        String(64) not null                             # stable config KEY
status          SAEnum(DocStatus, native_enum=False) default "not_started"
storage_key     String(512) nullable                            # opaque key from FileStorage.save
filename        String(255) nullable
content_type    String(128) nullable
size_bytes      BigInteger nullable
version_no      Integer server_default "0"                      # bumped on each reupload
reviewed_by     String(128) nullable                            # compliance firebase_uid
reviewed_at     DateTime(tz) nullable
issue_note      Text nullable                                   # per-doc rejection reason
expires_at      DateTime(tz) nullable                           # periodic review; not enforced now
created_at / updated_at
UniqueConstraint("onboarding_id", "doc_type", name="uq_onboarding_documents_cycle_type")
```
The `verified_count`/`required_count` the two boards show is computed from these rows, not a lookup — killing the two-source drift the RM explorer flagged. DB stores only `storage_key`; bytes go through `get_storage()` (Backend C-3).

#### B-3. No allotment/redemption ledger (MANDATORY)

Spec §4.1 requires an allotment record to appear for PC to confirm after onboarding, and the technical § requires **allotment history including the initial one**. `AllocationModelSnapshot` (`pc.py:270`) is period-scoped, not an onboarding-triggered per-client event, and has no pending/ack state.

The PC page's existing (separate, out-of-scope) Redemptions tab already models a near-identical shape — `Redemption { ref, mid, mult, status, gateLimit, liquidity, emergent }` — heading toward its own future backend proposal. Rather than pre-committing to two tables that would both need `(model_id, multiplier, reference, status, timestamps)`, `client_allotment_redemptions` is designed **now** as the single capital-movement ledger both allotment and redemption records live in — one row per movement, `kind ∈ {allotment, redemption}` as the sole discriminator. **This proposal only populates `kind="allotment"` rows and only builds the allotment/acknowledge flow.** Redemption logic is explicitly out of scope (§3) and gets its own future proposal; when it lands, it writes `kind="redemption"` rows to this same table plus whatever redemption-only columns it needs (e.g. `gate_limit`, `liquidity`, `emergent`) as a nullable, additive migration — not a new table. No redemption columns are added here to avoid speculative schema for a flow not yet designed. A free-text `note` column (nullable) carries a human-readable label per row — the onboarding-produced row is written with `note="initial allotment"` — without needing a formal sub-kind enum. `source_onboarding_id` is additionally `UNIQUE`: since a renewal reopens the client's existing `client_onboardings` row rather than creating a new one (D-7), the only thing standing between "one initial allotment ever" and "a renewal approve accidentally creates a second one" would otherwise be application code — the constraint makes it a schema-enforced invariant instead.

**Refactor:** New append-only `client_allotment_redemptions` table:

```
id                  Uuid PK default uuid4
user_id             Uuid FK users.id, index
model_id            Uuid FK models.id
multiplier          Numeric(28,10) not null                     # units allotted (or, for a redemption row, units redeemed)
kind                SAEnum(AllotRdmpKind, native_enum=False) not null   # {"allotment", "redemption"} — only "allotment" is written today
status              SAEnum(AllotRdmpStatus, native_enum=False) default "pending" # {pending, acknowledged} only, today
note                String(255) nullable                         # e.g. "initial allotment"; free-text label, not a sub-kind enum
source_onboarding_id Uuid FK client_onboardings.id nullable, UNIQUE  # links an onboarding-produced allotment to its cycle; null for non-onboarding rows.
                                                                 # UNIQUE is load-bearing: since client_onboardings is one row PER CLIENT (B-1) and
                                                                 # is reopened, not re-inserted, for a renewal (D-7), this constraint makes it a DB-level
                                                                 # guarantee — not just an app-code branch — that a given client's onboarding row can
                                                                 # ever be cited as the source of at most one allotment. A second attempt (a bug in the
                                                                 # kind="renewal" approve branch, a retried request, anything) hits a DB constraint
                                                                 # violation instead of silently creating a duplicate "initial allotment".
reference           String(32) not null                         # UUID-derived, e.g. "AL-3F9A2C" — f"AL-{uuid4().hex[:6].upper()}", no sequence/counter table
agg_before          Numeric(28,10) not null                      # widened 2026-07-20 (D-9); SNAPSHOT at insert time = sum(client_subscriptions.multiplier) for this model_id, taken before this row's own effect
agg_after           Numeric(28,10) not null                      # = agg_before + multiplier, computed and stored at the same insert — never recomputed later (see prose below)
expected_cash_in    DateTime(tz) nullable                        # widened 2026-07-20 (D-9); SNAPSHOT at insert time = created_at + a fixed settlement lag (Backend C-2 config constant)
acknowledged_by     String(128) nullable
acknowledged_at     DateTime(tz) nullable
created_at          server_default func.now()
Index("ix_client_allotment_redemptions_status", "status")
Index("ix_client_allotment_redemptions_kind", "kind")
```
**Widened 2026-07-20 (D-9) — `agg_before`/`agg_after` are a snapshot, not a live aggregate.** The PC allotments table/detail panel show a per-model "aggregate multiplier before → after" bar. Computing this live at read time (`SUM(client_subscriptions.multiplier) WHERE model_id=X`) would make an *old* allotment's displayed aggregate silently drift upward every time a new client subscribes to that model afterward — the history would lie about what the aggregate actually was at the moment this allotment was granted. Storing it once, at insert time, inside the same approve transaction that writes this row (Backend C-2), keeps the ledger's history accurate. `expected_cash_in` is likewise a snapshot (`created_at` + a fixed settlement-lag config constant), not a value anyone edits later.

Read model: `client_allotment_redemptions` = the full movement ledger (history + PC ack workflow), scoped today to `kind="allotment"`; `client_subscriptions` = current-state projection (multiplier per (user, model)), written at approve. PC ack is informational and does not block (matches the PC page footer "PC acknowledges but does not block"). A future redemption proposal will need to widen `AllotRdmpStatus` (redemption has its own richer status set — `pending_pc | approved | rejected | pending_compliance` per the existing mock) — that is an additive enum-value change to this table, not a schema redesign.

#### B-4. No onboarding event sink for the client Event page (Yes)

Spec §4.3 requires a message in the client Event page conveying the initial subscription. There is no events table (client events are localStorage mock).

**Refactor:** Minimal append-only `client_events` table — scoped to onboarding notifications only:

```
id          Uuid PK default uuid4
user_id     Uuid FK users.id, index
category    String(64) not null          # "Account Notification"
title       String(255) not null
body        Text not null
created_at  server_default func.now()
```
One row written inside the approve transaction. The general events feed (Market News etc.) stays out of scope (§3).

#### B-5. `client_subscriptions` is never written by onboarding, and has no room for a per-client fee override (MANDATORY)

`ClientSubscription` (composite PK `(user_id, model_id)`, `multiplier`) exists but onboarding never populates it, and it carries no fee columns at all. Spec §4.2 requires `client_subscriptions` be updated on successful onboarding; separately, a client's agreed mgmt/incentive fee can diverge from the model's own default (`Model.mgmt_fee`/`Model.incentive_fee`, `pc.py:91-92`) — e.g. a negotiated discount — and that divergence must be persisted per (client, model), not just captured once on the onboarding cycle.

**Refactor:** Two nullable columns added to the existing `client_subscriptions` table (additive migration, no data backfill — existing rows get `NULL`, meaning "inherit the model default"):
```
mgmt_fee_override       Numeric(9,6) nullable   # NULL = inherit Model.mgmt_fee; set only when it diverges
incentive_fee_override  Numeric(9,6) nullable   # NULL = inherit Model.incentive_fee; set only when it diverges
```
The approve transaction (Backend C-2) `INSERT … ON DUPLICATE KEY UPDATE`s the `(user_id, model_id)` row with the onboarding's `multiplier`, and additionally sets `mgmt_fee_override`/`incentive_fee_override` **only if** the onboarding's captured `mgmt_fee`/`incentive_fee` differs from that model's current default — otherwise those columns are left `NULL` so the model's default is the effective fee. This is a compare-and-set, not a calculation: the "effective fee" for display is always `override ?? model.default`, computed by whichever layer reads it.

> **Considered and rejected — `Model.country`/`Model.sector`.** An earlier draft of this widening pass added two nullable columns to `models` so the client Portfolio page's mock `country`/`sector` columns would have a real backing field. That was reverted: the mock's per-model `country`/`sector`/`symbol` shape is a **stale** schema left over from an earlier prototype of the model catalog, not the current real `Model` schema (`pc.py:65-113` — no country/sector/single-symbol concept; `category` is a JSON list, symbols are a weighted one-to-many `ModelSymbol` relationship). Backfilling the real `models` table to match a stale mock would contaminate the current schema with prototype-era shape rather than the other way around. This is why the seam-widening pass in D-9 is scoped to the **admin-portal only** (RM/Compliance/PC) — the client Portfolio page keeps its original, unwidened `SubscriptionDTO` (see Layer 3 A-4).

### C. Summary of DB-layer changes

| # | Change | Required? | Effort | Data migration? |
|---|---|---|---|---|
| B-1 | `client_onboardings` table (incl. `id_type`/`id_number`, widened 2026-07-20) | MANDATORY | S | No (new table) |
| B-2 | `onboarding_documents` table | MANDATORY | S | No |
| B-3 | `client_allotment_redemptions` table — shared allotment/redemption ledger, `kind="allotment"` only for now (incl. `agg_before`/`agg_after`/`expected_cash_in`, widened 2026-07-20) | MANDATORY | S | No |
| B-4 | `client_events` table | Yes | XS | No |
| B-5 | write `client_subscriptions` on approve; add `mgmt_fee_override`/`incentive_fee_override` (nullable) | MANDATORY | XS | No (additive, NULL default) |

All four tables are **additive** — one Alembic revision `0018`, `down_revision="817926e7604a"`, hand-written MariaDB DDL + `_require` self-assertions following `0017`. `downgrade()` drops the four tables. SQLite test path builds from `Base.metadata.create_all`. Rollback is clean (additive-only) as long as no client has been activated; see Rollback.

---

## Layer 2 — Backend

### A. Structural change — new `onboarding` feature package (MANDATORY)

Follow the existing per-feature layout (`router → service → repository → schemas`, service owns the transaction, repo never commits — per `clients/`). One package owns the whole lifecycle so the state machine lives in exactly one place:

```
app/libs/onboarding/
  router.py        # RM + Compliance + PC + Client routes (or split into rm_router/compliance_router — see D)
  service.py       # OnboardingService: transitions + atomic approve side-effects
  repository.py    # queries for onboardings/documents/allotments/events/subscriptions
  schemas.py       # the DTOs from §4.1
  compliance_doc_config.py   # DOC config (C-4) — the required-doc + periodic-review spec
  scheduler.py     # renewal-trigger background job (C-6) — registered in main.py like sibling schedulers
```
Client-user creation in `StartOnboarding` **delegates to the existing path** (`identity.ensure_identity` + `ClientRepository.create_with_profile`) rather than duplicating it — the new service adds the onboarding cycle + doc rows on top.

### B. Logic — the state machine + atomic approve (MANDATORY)

The service is the sole owner of every transition; the frontend never computes a transition. Guards (all return `409` on violation):

| Transition | Trigger | Guard | Effect |
|---|---|---|---|
| create → `initial` | `POST /rm/onboardings` | RM valid, model exists | create user(DISABLED)+profile+cycle+7 doc rows(`not_started`) |
| upload doc | `POST …/documents/{type}` | doc `can_reupload` (status ∉ {in_review, verified}) | store file, status → `uploaded`, bump `version_no` |
| `initial`/`pending_review` → `reviewing` | `POST …/submit` | **all required docs uploaded** | set `submitted_at`; every non-`verified` doc → `in_review` |
| doc verdict | `POST …/verdict` | cycle `reviewing` | `valid`→`verified`, `issue`→`rejected`+`issue_note`, set `reviewed_by/at` |
| `reviewing` → `active` | `POST …/approve` | **every required doc `verified`** | atomic side-effects ↓ (branch on `kind`) |
| `reviewing` → `pending_review` | `POST …/reject` | ≥1 doc `rejected` | set `decided_at`, `reject_reason`; flagged docs stay `rejected` for RM reupload |
| `active` → `pending_review` | scheduler tick (C-6), not a route | a periodic-review doc's `expires_at` inside lookahead window | `kind → "renewal"`; that doc's status → `not_started`; `reject_reason` set; **does not touch `users.status`, `client_subscriptions`, or `client_allotment_redemptions`** |

**Atomic approve side-effects (one `db.commit()`), branched by `kind`:**
- **`kind="initial"`:** (1) upsert `client_subscriptions (user_id, model_id, multiplier, mgmt_fee_override, incentive_fee_override)` — the two `*_override` columns are set from the onboarding's captured `mgmt_fee`/`incentive_fee` **only if** they differ from `Model.mgmt_fee`/`Model.incentive_fee` at that `model_id`, else left `NULL` (see C-5); (2) insert `client_allotment_redemptions` row (`kind="allotment"`, `note="initial allotment"`, `status="pending"`, generated `reference`, `source_onboarding_id` set to this onboarding's `id` — enforced-unique, DB B-3; **widened 2026-07-20:** `agg_before` = `SUM(client_subscriptions.multiplier) WHERE model_id=X` computed *before* this upsert runs, `agg_after` = `agg_before + units`, `expected_cash_in` = `now() + ONBOARDING_SETTLEMENT_DAYS` — both snapshotted once, here, never recomputed — see C-2); (3) `users.status = active` + `authorized_by = <compliance uid>` — closes the activation gap flagged in the backend recon; (4) insert `client_events` row ("Your subscription to `<model>` is now active.").
- **`kind="renewal"`:** none of the above four writes run — no new allotment (nothing new was allotted, this was a document re-verification), no `client_subscriptions` change (model/units are unchanged by a renewal), no `users.status` write (already `active`, this is a no-op by construction, not an idempotent re-write). Only (1) `client_onboardings.status = active`, `decided_at` set, `reject_reason` cleared, and (2) insert a `client_events` row with a **different** message ("Your periodic KYC review is complete.") run.

Any failure rolls the whole branch back — a client's row is never left half-updated. `kind` is not reset after a renewal approve; it stays `"renewal"` (this proposal builds no per-cycle history, so `kind` only records "was this row ever reopened by a renewal," not a log of every cycle — see D-7).

On re-submit after `pending_review`, only the `not_started`/`rejected` docs are re-uploadable (the `verified` ones are locked by the `can_reupload` guard), satisfying spec §3.2 — this is the same path whether `pending_review` was reached via Compliance rejection or via the renewal scheduler.

### C. Other backend findings

#### C-1. `COMPLIANCE`/PC roles can't be authorized for these routes (MANDATORY)

`ROLE_ACTIONS[COMPLIANCE]` is empty and there are no onboarding/allotment actions (`auth/actions.py`).

**Refactor:** Add actions `ONBOARDING_MANAGE = "onboarding:manage"`, `ONBOARDING_REVIEW = "onboarding:review"`, `ALLOTMENT_ACKNOWLEDGE = "allotment:acknowledge"`; grant `RM → {ONBOARDING_MANAGE}`, `COMPLIANCE → {ONBOARDING_REVIEW}`, `PC → {ALLOTMENT_ACKNOWLEDGE}` (in addition to existing sets); `ADMIN` inherits all via `set(Action)`. Gate each route with `require_action(...)` (`auth/deps.py:66`). Client routes use `get_current_client_user` + own-`user_id` scoping.

#### C-2. Approve must be transactional, and must branch on `kind` (MANDATORY)

See Layer 2 §B. Stated as its own finding because it's the highest-risk path — for `kind="initial"`, partial application leaves an inconsistent client (active user with no subscription, or an allotment with no active user); for `kind="renewal"`, running the *initial* side-effects unconditionally would wrongly re-activate an already-active user, insert a bogus duplicate allotment, and send a false "now active" event.

**Refactor:** `OnboardingService.approve` reads the row's `kind` first and dispatches to one of two write sets (both §B); do all writes for the chosen branch before a single `commit()`, `rollback()` on any exception, following the compensation pattern in `clients/service.py:38-77`. **This branch is a correctness optimization, not the safety guarantee** — the actual guarantee that a client is never allotted twice is `client_allotment_redemptions.source_onboarding_id UNIQUE` (DB B-3). If the `kind` branch ever has a bug and a renewal approve tries to insert a second allotment row anyway, the DB rejects the insert; the transaction rolls back and the request fails loudly (500/409) instead of silently duplicating the client's allotment.

**Widened 2026-07-20 (D-9) — ordering constraint inside the `kind="initial"` branch.** `agg_before` must be read (a `SUM(...)` query against `client_subscriptions`) **before** the `client_subscriptions` upsert for this client runs, not after — reading it after would double-count this client's own new row. The service does: (a) query `agg_before`, (b) upsert `client_subscriptions`, (c) insert the `client_allotment_redemptions` row with `agg_before`/`agg_after = agg_before + units` and `expected_cash_in = now() + ONBOARDING_SETTLEMENT_DAYS`, all inside the same transaction as the rest of the branch — no extra round trip to the client, no separate commit.

#### C-3. Document upload/download reuses existing storage (Recommend)

**Refactor:** Reuse `FileStorage`/`get_storage()` (`trade_models/storage.py`) verbatim — `save(stream, suggested_name, content_type)` → `storage_key`; download streams `open(storage_key)` with `Content-Disposition`, mirroring `trade_models/router.py:189`. No new storage code.

#### C-4. Required-doc set must be config, not hardcoded (MANDATORY)

Spec technical §: a config file sets which files are required and which need periodic review, so future docs can be added without code churn.

**Refactor:** `app/libs/onboarding/compliance_doc_config.py` — a frozen list of `DocSpec(key, label, required, periodic_review, review_interval_days)`. `StartOnboarding` seeds one `onboarding_documents` row per spec; `required_count` = specs with `required`. Adding a doc type = one list entry (existing cycles are unaffected; new rows appear on the next cycle). The 7 seed docs unify the RM/compliance labels (canonical `identity_proof` = "ID / Passport / Proof of Address").

#### C-5. Fee-override decision is a compare-and-set, not a calculation (Yes — user req.)

The client's agreed mgmt/incentive fee (captured at the Trade Info step) can legitimately diverge from the model's own default (e.g. a negotiated discount) and that divergence must survive per (client, model) — see DB B-5.

**Refactor:** Inside the approve transaction, `OnboardingService` reads `Model.mgmt_fee`/`Model.incentive_fee` for the onboarding's `model_id` and compares them to the onboarding's captured `mgmt_fee`/`incentive_fee`. Equal (within the column's `Numeric(9,6)` precision) → leave `client_subscriptions.mgmt_fee_override`/`incentive_fee_override` `NULL`. Different → write the captured value into the override column. No fee is ever computed — this only decides *whether the client's row needs to remember a number that isn't the model's default*. Any later reader of "the client's effective fee" computes `override ?? model.default`; that read-side coalesce is the only "logic," and it lives wherever the fee is displayed, not in this service.

#### C-6. Renewal-trigger scheduler (Accepted)

Resolves Q-1: a client's periodic-review documents need a renewal onboarding cycle started before their `expires_at`, and this repo already has an established pattern for exactly this shape of job — `app/libs/allocation_matrix/scheduler.py` and `app/libs/post_trade_allocation/scheduler.py`, both: pure `asyncio` (no APScheduler dependency), a module-level `_TICK_SECONDS` loop wrapped in `try/except Exception` (never let one bad tick kill the task), a `start_scheduler() -> asyncio.Task` entry point registered in `main.py`'s lifespan and cancelled on shutdown.

**Refactor:** `app/libs/onboarding/scheduler.py` follows the identical shape:
```python
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
    # For each onboarding_documents row where periodic_review=true and
    # expires_at <= now + _RENEWAL_LOOKAHEAD_DAYS, whose owning
    # client_onboardings row is status="active": skip if that row is already
    # off "active" (duplicate guard — a client with a renewal already in
    # flight has status in {reviewing, pending_review}, never "active", so a
    # single status check is the whole guard; no second row to look for).
    # Otherwise call OnboardingService.reopen_for_renewal(user_id), which,
    # on the client's ONE existing client_onboardings row (not a new row):
    #   - kind        -> "renewal"
    #   - status      -> "pending_review"   (NOT "reviewing" — this is the
    #                    same status Compliance-rejection already uses to mean
    #                    "specific documents need a fresh upload"; the renewal
    #                    rides that existing reject-and-resubmit path instead
    #                    of inventing a parallel "renewal review" UI state)
    #   - reject_reason -> e.g. "Periodic review due: <doc label(s)>"
    #   - for each of THIS client's onboarding_documents rows with
    #     periodic_review=true and expires_at inside the lookahead window:
    #     status -> "not_started" (can_reupload becomes true), clear
    #     reviewed_by/reviewed_at/issue_note. Non-periodic docs (e.g. ID/
    #     Passport) are untouched — still "verified", not reset.
    # users.status, client_subscriptions, and client_allotment_redemptions are
    # NOT touched here — the client keeps full ACTIVE login/portfolio access
    # throughout the renewal review; only the RM/Compliance board reflects the
    # pending_review state (see D-7).

def start_scheduler() -> asyncio.Task:
    return asyncio.create_task(_renewal_check_job(), name="onboarding_renewal_scheduler")
```
Registered in `main.py` alongside the existing two: `from app.libs.onboarding.scheduler import start_scheduler as start_onboarding_scheduler`; `onboarding_scheduler_task = start_onboarding_scheduler()` in the lifespan, cancelled on shutdown like its siblings. It resets a periodic-review doc's `status` to `not_started` (making it reupload-eligible again) — it never sets a doc's `status` to `expired` (that stays deferred, per Non-Goals); the trigger reads `expires_at` directly and is decoupled from that still-unbuilt status.

#### C-7. DTO assembly must join, resolve, and compute — not just select a row (Yes — widened 2026-07-20, D-9)

Full field parity (D-9) means `OnboardingDTO`/`AllotRdmptDTO`/`SubscriptionDTO` are not 1:1 row projections — several fields are joined from `ClientProfile`, resolved from a uid, or computed at read time. Left unstated, an implementer would either invent extra storage or silently drop fields.

**Refactor — assembly rules, all read-side, no extra writes beyond what's already listed in §B/C-2:**
- `OnboardingDTO.primary_phone/address/country_of_residence`: joined from `ClientProfile` by `user_id` (already captured at client creation, per the existing `ClientService.onboard` path — never re-entered or duplicated onto `client_onboardings`).
- `OnboardingDTO.assigned_rm`: `ClientProfile.assigned_rm_uid` resolved to the RM's display name via the existing admin-user lookup (same resolution the RM board's own client list already performs elsewhere — reused, not reinvented).
- `OnboardingDTO.client_ref`: formatted server-side from `user_id`, e.g. `f"MEGA-{str(user_id).split('-')[0][:4].upper()}"` — a display convention, not a stored value; two clients never collide because it's derived from a UUID already unique per user.
- `ONBOARDING_SETTLEMENT_DAYS`: a module-level config constant in `compliance_doc_config.py` (or `service.py` directly — implementer's call, not worth its own file), default `5`, overridable via env var following the same `os.getenv(...)` convention as `_RENEWAL_LOOKAHEAD_DAYS` (C-6). Used only to compute `expected_cash_in` at approve (C-2); not a scheduling job, no tick loop.
- **Out of scope for this finding:** `SubscriptionDTO` (client Portfolio) is not widened — see Layer 3 A-4 and D-9's scope note.

### D. Route / contract simplification

> **Decision (settled):** Routes are grouped by role prefix to match existing convention (`/api/rm`, `/api/compliance`, `/api/pc`, `/api/client`) — a client in "Reviewing" is the same row behind `/rm/onboardings` and `/compliance/onboardings`; the prefix is only an authorization boundary, not a data boundary.
>
> Final route surface after this layer lands:
> ```
> POST   /api/rm/onboardings                                  start a cycle (create client + docs)
> GET    /api/rm/onboardings                                  kanban board (grouped by status)
> GET    /api/rm/onboardings/{id}                             cycle detail + documents
> POST   /api/rm/onboardings/{id}/documents/{doc_type}        upload / reupload one doc
> POST   /api/rm/onboardings/{id}/submit                      Submit All -> reviewing
> GET    /api/compliance/onboardings                          review queue + history
> GET    /api/compliance/onboardings/{id}/documents/{doc_type}/download   fetch a doc
> POST   /api/compliance/onboardings/{id}/documents/{doc_type}/verdict    valid | issue
> POST   /api/compliance/onboardings/{id}/approve            all verified -> active (+ side-effects)
> POST   /api/compliance/onboardings/{id}/reject             -> pending_review
> POST   /api/pc/allotments/{id}/acknowledge                 pending -> acknowledged
> GET    /api/pc/allotments                                  allotments tab (pending + history)
> GET    /api/client/subscriptions                           client's subscribed models
> GET    /api/client/events                                  client's onboarding event(s)
> ```
> Net: **0 → 14 routes** (all new; no existing route changes).

### E. Summary of Backend-layer changes

| # | Change | Required? | Effort |
|---|---|---|---|
| A | new `app/libs/onboarding/` package | MANDATORY | M |
| B | state machine + atomic approve | MANDATORY | M |
| C-1 | RBAC actions for RM/Compliance/PC | MANDATORY | XS |
| C-2 | transactional approve across 4 tables | MANDATORY | S |
| C-3 | reuse `FileStorage` for docs | Recommend | XS |
| C-4 | `compliance_doc_config.py` config | MANDATORY | XS |
| C-5 | fee-override compare-and-set at approve | Yes — user req. | XS |
| C-6 | renewal-trigger scheduler (`scheduler.py`) | Accepted | S |
| C-7 | DTO assembly — joins/resolution/computation for widened fields (widened 2026-07-20) | Yes | S |
| D | mount 14 role-prefixed routes in `main.py` | MANDATORY | S |

---

## Layer 3 — Frontend

All four pages keep their components and layout; only the data source changes (mock module → data-access layer following the existing `hooks/api/useModels.ts` + `lib/pc/*.ts` pattern). New `admin-frontend/lib/onboarding/*` (+ `client-frontend/lib/api/*`) provide fetch/mutation functions; the pages' existing types are populated from the DTOs.

| File | LOC (approx) | Role |
|---|---|---|
| `admin-frontend/app/(roles)/rm/onboarding-renewal/page.tsx` (+ `components/rm/OnboardingBoard.tsx`, `OnboardingModal.tsx`) | ~600 | RM kanban + Start Onboarding modal + KYC panel |
| `admin-frontend/app/(roles)/compliance/review/page.tsx` (+ `components/compliance/review/*`) | ~500 | Compliance review + verdict + approve/reject |
| `admin-frontend/app/(roles)/pc/allotment-redemption/page.tsx` (+ `components/pc/allotment-redemption/*`) | ~400 | PC allotments tab (acknowledge) |
| `client-frontend/app/(dashboard)/{portfolio,events}/page.tsx` | ~300 | Client subscriptions + event stream |

### A. Findings

#### A-1. RM board reads static presets; mutations are no-ops (MANDATORY)

`KYC_COLS`/`KYC_DOCS` are hardcoded; "Onboard Client", "Submit All", and doc "Upload" have no handlers ("no submit target yet").

**Refactor:** `GET /api/rm/onboardings` → `BoardDTO`, mapped onto the four columns (`initial|reviewing|pending_review|active` per §4.2). Wire: Start Onboarding modal → `POST /rm/onboardings` (the modal's `mgmt_fee`/`incentive_fee` display strings, e.g. `"1.5%"`, are parsed to a decimal fraction, e.g. `0.015`, before sending — matching `StartOnboardingReq`'s `Decimal` fields in §4.1; `id_type`/`id_number` are sent as-is, both now real request fields per D-9); doc Upload/Reupload → `POST …/documents/{type}` (hide/disable the affordance when `DocumentDTO.can_reupload` is false — enforces spec §2/§3.2 in the UI, backend enforces authoritatively); Submit All → `POST …/submit` (button already gates on all-docs-present; server re-checks). Compute the `count/7` chip from `verified_count`/`required_count`, not the old lookup. **Widened 2026-07-20 (D-9):** every detail-panel field the RM/Compliance KYC panel renders today (phone, address, country, ID type/number, IBHK/SW account, assigned RM name, client ref code) is now populated from the widened `OnboardingDTO` — none is dropped.

#### A-2. Compliance verdicts live only in page state (MANDATORY)

`docVerdicts` never persists; the download button is a no-op.

**Refactor:** `GET /api/compliance/onboardings` → rows, `ObStatus` derived per §4.2. Per-doc Valid/Issue → `POST …/verdict`; Approve → `POST …/approve` (button already gates on all-reviewed-no-issues; server re-checks all `verified`); Reject modal → `POST …/reject`; download button → `GET …/download`.

#### A-3. PC allotments seeded from mock (MANDATORY)

`AR_ALLOTMENTS_SEED` + in-memory `acknowledge`.

**Refactor:** `GET /api/pc/allotments` → `AllotRdmptDTO[]`; Acknowledge → `POST …/acknowledge`. `amount` comes from the DTO (`units * model.model_size`), so the page drops its local `arAllotAmt` derivation. **Widened 2026-07-20 (D-9):** the table's "Agg. multiplier" column and the detail panel's aggregate bar (before/after) and "Expected cash-in" fact now come straight from `AllotRdmptDTO.agg_before`/`agg_after`/`expected_cash_in` — snapshotted server-side at insert (DB B-3, Backend C-2), not computed or guessed in the frontend.

#### A-4. Client Portfolio/Event read mock arrays (Yes)

`MOCK_SUBSCRIBED_MODELS`, `MOCK_EVENT_ITEMS`.

**Refactor:** Portfolio → `GET /api/client/subscriptions`, unchanged from the original seam (`model_id`, `model_name`, `units`, `ib_account`). **Not widened** — the mock's `symbol`/`country`/`sector`/`amount`/`model_limit` columns describe a model-catalog schema that is stale against the real `Model` table (`app/models/pc.py`), and this proposal will not backfill the real schema to match a stale mock; that reconciliation belongs to whichever proposal owns the model catalog, not to onboarding-integration. Event stream merges `GET /api/client/events` (onboarding notification) with whatever mock/localStorage remains for out-of-scope categories. Both gated by the existing `AuthGuard` — the client can only reach these once `users.status='active'` lets `postBackendLogin` succeed.

**Widened 2026-07-20 (D-9) — event card chrome (`iconType`/`level`/`primaryLabel`/`secondaryLabel`) is a Frontend-owned static lookup, not a backend field.** `ClientEventDTO` carries only `id`/`category`/`title`/`body`/`created_at` (unchanged from the original seam). The Event page's icon/color/action-button styling is derived client-side from `category` via a small constant map (today a single entry: `"Account Notification" -> {icon: "shield", level: "info", primaryLabel: "Acknowledge", secondaryLabel: "Mark as Read"}`) — reusing the exact same visual output the mock already hardcodes for this category, with zero new backend storage. `time` is formatted client-side from `created_at` (relative/absolute), matching the mock's display convention.

### B. Adapting to changes in other layers

| Upstream change | Frontend change | Files touched |
|---|---|---|
| B-1/B-2 (status + doc rows) | map `OnboardingStatus` → RM columns and → `ObStatus` per §4.2 | RM `page.tsx`, compliance `page.tsx` |
| Backend B (`can_reupload`) | disable Upload affordance when false | `OnboardingBoard.tsx` (KYC panel) |
| Backend C-2 (approve side-effects) | after approve, PC allotments + client pages reflect new rows on next fetch | PC + client pages |
| Field map (`units`↔`multiplier`) | send `units`, read `units` from DTOs | all four data-access modules |

### C. Additional findings

- The RM KYC panel currently exposes a reupload affordance on **every** doc row on hover, including `Verified`/`In review` — this must be gated on `can_reupload` (A-1) to honour spec §2 and §3.2.
- The RM 7th doc label ("Other — ID / Passport / Proof of Address") and Compliance's ("ID / Passport / Proof of Address") converge on the canonical `identity_proof` config entry; both pages render `DocumentDTO.label` from the server, ending the divergence.

### D. Summary of Frontend-layer changes

| # | Change | Required? | Effort |
|---|---|---|---|
| A-1 | wire RM board + modal + submit + doc upload | MANDATORY | M |
| A-2 | wire Compliance review + verdict + decide + download | MANDATORY | M |
| A-3 | wire PC allotments + acknowledge | MANDATORY | S |
| A-4 | wire client subscriptions + events | Yes | S |
| C | gate reupload on `can_reupload`; render server labels | MANDATORY | XS |

---

## Design decisions (settled)

- **D-1 — Single source of truth; RM/Compliance/Client are projections, PC is a side-effect consumer.** There is exactly one `client_onboardings` row + its `onboarding_documents` per **client** (D-7). `/rm/onboardings`, `/compliance/onboardings`, and `/client/*` are all read *projections* over the **same** rows (§4.2 mapping) — this is what makes "a client in RM's Reviewing queue is visible to Compliance" true by construction. **PC is intentionally not part of this projection.** PC never reads `client_onboardings` and the onboarding cycle's client identity never crosses into PC's world — PC only ever sees a `client_allotment_redemptions` row, born as a side effect of a successful approve (Backend §B), and that row is deliberately anonymized (`AllotDetailPanel.tsx:37`: `"Client anonymized · {ref}"` — no client name, no client id in the DTO; see §4.1 `AllotRdmptDTO`). PC manages aggregate model exposure, not client relationships — that boundary is existing product design, not something this proposal introduces, and this proposal preserves it exactly. Future role integrations lay on top by adding a new projection over `client_onboardings` (if they need onboarding-cycle visibility, like RM/Compliance/Client) or a new anonymized side-effect consumer (if they only need aggregate outcomes, like PC) — never a new status field or a new store.
- **D-2 — Transitions are server-owned.** The frontend never sets a status; it calls a transition endpoint and re-reads. UI gates (Submit All disabled, Approve disabled) are UX affordances; the backend re-checks every guard and is authoritative (defense against a stale client).
- **D-3 — One shared movement ledger, separate from the subscription projection.** `client_allotment_redemptions` is designed as the single append-only ledger for every capital movement PC must act on — `kind ∈ {allotment, redemption}` — rather than a table that would need to be re-cloned when redemption is built. It's distinct from `client_subscriptions`, which is a current-state projection (multiplier per (user, model)), not a history. Both are required by the spec (§4.1 vs §4.2) and serve different reads; only the `kind="allotment"` slice of the ledger is populated by this proposal, with the onboarding-produced row tagged `note="initial allotment"`.
- **D-4 — Activation happens at approve.** New clients stay `DISABLED` from creation (existing behavior) until Compliance approves, which flips them to `ACTIVE` with `authorized_by` provenance — this is the missing step that lets the client log in (spec §4.3).
- **D-5 — Doc set is config-driven.** Per spec technical §; `compliance_doc_config.py` carries `required` + `periodic_review` flags. Expiry *enforcement* is deferred (§3) but the `expires_at` column + flag make it addable without a migration.
- **D-6 — Fee override is persisted state, not a fee engine.** `client_subscriptions.mgmt_fee_override`/`incentive_fee_override` store the agreed fee only when it diverges from the model's own default; a calculation/billing engine (computing amounts owed, invoicing, fee-schedule history) stays explicitly out of scope (§3). The only "logic" is a compare-and-set at approve (Backend C-5) and a `override ?? model.default` read-side coalesce wherever the effective fee is displayed.
- **D-7 — Renewal reopens the client's one onboarding row; it does not create a second one (resolves Q-1).** `client_onboardings` is one row **per client**, not per cycle (B-1: `user_id` is unique). A background job (Backend C-6, `app/libs/onboarding/scheduler.py`) follows the existing `allocation_matrix`/`post_trade_allocation` scheduler pattern — hourly `asyncio` tick, no new dependency — and, when a periodic-review document's `expires_at` falls within a configurable lookahead window, reopens that client's row **in place**: `status: active → pending_review` (not `reviewing` — `pending_review` is already the status meaning "specific documents need a fresh upload," so the renewal rides the existing reject-and-resubmit path instead of a new one), `kind → "renewal"`, the expiring doc(s) reset to `not_started`. Because there is only ever one row per client, the RM/Compliance board never shows a client twice, and no new board state or query change was needed. Crucially, this does **not** touch `users.status`, `client_subscriptions`, or `client_allotment_redemptions` — the client keeps full active login/portfolio access through the entire renewal review; only a subsequent Compliance **approve** on a `kind="renewal"` row is a no-op for those three (C-2), distinct from an `kind="initial"` approve's full activation. It also does not set any document's `status` to `expired`; that remains explicitly deferred (§3) and fully decoupled from this trigger, which reads `expires_at` directly.
- **D-8 — Allotment reference is UUID-derived, no sequence (resolves Q-2).** `client_allotment_redemptions.reference` is generated as `f"AL-{uuid4().hex[:6].upper()}"` at insert time — no per-year counter, no shared sequence table, no concurrency handling needed. This departs from the PC mock's cosmetic `AL-2026-NNN` seed values; the page's rendering is unaffected (it just displays whatever string is in `reference`), so this is a data-shape choice, not a layout change.
- **D-9 — Seam widened for field parity, scoped to the admin-portal only (2026-07-20 addendum).** After first drafting §4.1, a field-by-field audit against the existing mocks found several fields the RM/Compliance/PC pages render today that the original DTOs would have silently dropped after wiring. Per the user's requirement — "what displayed by the mock today should also be visible after wiring... just that after is actually operatable" — those were resolved, each taking the cheapest correct option rather than defaulting to a new column:
  - **Already stored, just not exposed:** `OnboardingDTO` gains `ibhk_account`/`sw_account` (both already existed as `client_onboardings` columns in the original B-1 — a DTO omission, not a schema gap).
  - **Already stored elsewhere, joined not duplicated:** `OnboardingDTO` gains `primary_phone`/`address`/`country_of_residence` (joined from `ClientProfile`, captured once at client creation) and a resolved `assigned_rm` display name (from `assigned_rm_uid`) — see Backend C-7.
  - **Genuinely new, narrow column:** `client_onboardings.id_type`/`id_number` (B-1) — the RM form collects these today with nowhere to persist them.
  - **Snapshotted at write time, not recomputed:** `client_allotment_redemptions.agg_before`/`agg_after`/`expected_cash_in` (B-3) — a live aggregate would make old allotments' displayed history drift as new clients subscribe later; a snapshot preserves what was true at the moment of that allotment.
  - **Client-frontend is explicitly OUT of scope for this widening, with one narrow exception:** `SubscriptionDTO` (client Portfolio) is **not** widened. Its mock's `symbol`/`country`/`sector`/`amount`/`model_limit` shape describes a stale, prototype-era model-catalog schema that the real `Model` table (`app/models/pc.py`) does not carry (no country/sector concept; symbols are a weighted one-to-many relationship, not a single field) — backfilling the real schema to match a stale mock would contaminate it, so Portfolio keeps its original, unwidened DTO (see DB layer B, Layer 3 A-4). The one exception is `ClientEventDTO`'s icon/level/action-label chrome, which stays a Frontend-owned static `category -> styling` lookup (Frontend A-4, zero new backend storage) rather than being dropped — accepted because, unlike Portfolio's gaps, it needs no schema decision of any kind to preserve exactly.
  This is the one section of the proposal edited after the initial freeze; per the §4.3 change protocol, all three impl docs' §7 are re-copied from this widened seam in the same change set that introduces this decision.

---

## Objectives & standard of the expected outcome

- **One record, four views.** A single onboarding row drives all four pages; changing its status on one page is visible on the others after a re-fetch. Verified against a seeded cycle walked end-to-end (start → upload ×7 → submit → verdict ×7 → approve).
- **Guards enforced server-side.** Submit-before-all-docs, reupload-while-in-review/verified, and approve-before-all-verified each return `409` when attempted via a raw API call, not just a disabled button.
- **Atomic activation.** After approve: exactly one `client_subscriptions` upsert, one `client_allotment_redemptions` (pending) row, `users.status='active'`, one `client_events` row — or, on failure, none of them.
- **Exactly one initial allotment, ever, DB-enforced.** No client accumulates a second "initial allotment" row through any number of renewal cycles — guaranteed by `client_allotment_redemptions.source_onboarding_id UNIQUE` (DB B-3), not just by the `kind` branch in application code (Backend C-2).
- **Additive & reversible.** Four new tables, no changes to existing columns; `alembic downgrade` restores the prior schema (clean unless a client was activated — see Rollback).
- **No layout change.** The four pages render identically to today; only their data is live.

---

## Execution & verification

Layers fan out into independent impl docs/branches (`013-…-db`, `-be`, `-fe`) built against §4. Suggested dependency order for *verification* (not a hard build order):

1. **DB (`0018`)** — create the four tables. Verify: `alembic upgrade head` on a scratch DB; `_require` assertions pass; `Base.metadata.create_all` builds them for tests.
2. **Backend** — package + routes + RBAC + config + scheduler. Verify: pytest walks a full cycle (start → docs → submit → verdicts → approve) and asserts the four approve side-effects landed in one transaction (including the fee-override compare-and-set, C-5); guard violations return `409`; RBAC denies cross-role calls; the renewal scheduler's `_trigger_due_renewals` is unit-tested directly (bypassing the tick loop) against a seeded `expires_at` inside/outside the lookahead window, and against the duplicate-renewal guard. **Specifically test the full cycle twice** — approve the initial cycle, trigger a renewal, approve the renewal — and assert `client_allotment_redemptions` has exactly **one** row for that client afterward (not two), and that inserting a second row with the same `source_onboarding_id` at the DB layer raises an integrity error.
3. **Frontend** — re-point the four pages. Verify (browser): start a client on the RM board, upload 7 docs, Submit All → card moves to Reviewing → appears on Compliance page; approve → card moves to Active on RM, allotment appears (pending) on PC, client can log in and sees the subscription + event. Reject path → card falls to Pending for Review with only flagged docs reuploadable.

**Human gate(s):** The `0018` migration and any run against the **live DB** require sign-off before applying (per [[git_workflow_human_owns_main]] — the human owns migrations to shared data). Merges to `main` and PRs are human-owned; agents stop at "branch pushed + PR drafted."

---

## Rollback

- **Backend/Frontend:** revert the branch — no persisted state of their own.
- **Database:** `alembic downgrade -1` drops `client_onboardings`, `onboarding_documents`, `client_allotment_redemptions`, `client_events`, and the two `client_subscriptions.*_override` columns. **Clean (additive-only) rollback iff no client has been activated through this flow.** Dropping the `*_override` columns is always clean (they're nullable, additive, and their loss only means "no client's fee override is remembered" — the model default still applies to everyone). If a client *was* activated, the down-migration still drops the onboarding tables and the override columns cleanly, but the side-effect rows already written to the pre-existing `client_subscriptions.multiplier` (and the `users.status='active'` / `authorized_by` flips) are **not** auto-reverted — they are legitimate live data by then. Reverting an activated client is a manual data decision, not part of the schema rollback.

---

## Open questions

Both prior open questions are now resolved — see D-7 (renewal trigger) and D-8 (allotment reference generation) in Design decisions.

### Out of scope (tracked elsewhere)

- **General events feed** (Market News, non-onboarding categories) — future client-events proposal; only the onboarding notification is written here.
- **Document expiry *status* job** — future proposal; a document's own `status` never becomes `expired` under this proposal (only the renewal-cycle *trigger*, D-7, is built). Schema is ready (`expires_at` + `periodic_review` config) for that future job.
- **Redemption / large-redemption workflow** — separate existing flow on the Compliance/PC pages; reuses `client_allotment_redemptions` via `kind="redemption"` when it lands (D-3).
