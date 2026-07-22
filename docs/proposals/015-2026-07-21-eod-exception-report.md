# 015 — End-of-Day Exception Report (persist, sign-off, PDF)

> Status: **DRAFT — pending implementation approval.**
> Scope: The MOBO Daily Exception Report becomes a real, signed, downloadable artifact — a persisted EoD record per settlement day, a "Sign Off & Lock" mutation that freezes the day's breaks and generates a PDF, and an "Export" download. Touches DB + Backend + Frontend. **EoM (monthly aggregation) is explicitly out of frame** — deferred pending further discussion.
> Constraint: EoD business logic is derived from the SAME reconciliation engine the Trade Reconciliation screen uses (`app/libs/reconciliation/engine.py`) — this proposal adds persistence/sign-off/rendering around that engine and must not fork or re-implement its break logic. A signed EoD is immutable.

<!--
Cross-layer proposal: DB → Backend → Frontend, §4 seam frozen. Layers may be
built in any order against §4 after approval.
-->

---

## 1. Context and Motivation

Today the Daily Exception Report page (`admin-frontend/app/(roles)/mobo/daily-exception-report/page.tsx`) is a **read-only view backed by mock data**: it calls `loadReconciliationFlow("breaks")` and `loadReconciliation()` (both mock loaders) and derives its three break legs client-side (`buildL1`/`buildL2`/`buildL3`). Its **"Sign Off & Lock"** and **"Export"** buttons are inert — no record is written, no file is produced.

The reconciliation engine, however, is real. `app/libs/reconciliation/engine.py::reconcile()` computes exactly the three break categories the report needs, one per leg, all off persisted data:

| EoD leg (report label) | Engine step | Break dataclass | Keyed by |
|---|---|---|---|
| 1 · IB Source ↔ AlgoTrade | Step 3 — per order | `OrderBreak` | `order_id` + `field` |
| 2 · AlgoTrade ↔ IB Client | Step 2 — per client/model | `ClientModelBreak` | `client_id` + `model_id` |
| 3 · IB Client ↔ CRM | Step 1 — per client | `CrmBreak` | `client_id` |

(`CrmAlgoBreak`, engine Step 4, is a *derived* diagnostic — the AND of legs 2+3 — **not** an EoD leg; EoD ignores it.) Leg 1's AlgoTrade side is currently synthesized from the matching real IB order (`app/libs/reconciliation/algotrade/synth.py`, `source_kind=SYNTHESIZED`), so it reconciles clean by construction today; the comparison is real and starts surfacing genuine breaks the moment an independent AlgoTrade feed lands — no EoD-side change needed then.

What's missing is everything *around* the engine: a place to persist the signed day, a completeness gate, a break snapshot frozen at sign-off, and a generated document. This proposal adds those.

> **Why now / why this order.** Proposal 012 deliberately scoped the recon integration to a single latest session with "no picker" and marked the daily-exception-report screen "untouched; owned by prior recon proposals". EoD is the first consumer that needs a true **day-level** rollup (a day with N models trading produces N `ReconSession` rows sharing one `trade_date`). The engine and the PTA materialize-at-import pipeline are now complete and stable, so the remaining work is purely additive persistence + rendering on top.

---

## 2. Goals

1. Persist one **`eod_records`** header row per settlement day (date, status, signer, four overall-stat columns, file reference), auto-opened when the day's first `ReconSession` is created.
2. On **Sign Off & Lock**: re-run `reconcile()` across **every** `ReconSession` for the date, **merge** the three break lists, **snapshot** them into frozen `eod_break_records` rows, flip status to `SIGNED`, attribute the signing admin, and generate a PDF stored under a month-segmented (`YYYY-MM`) key.
3. Gate sign-off on **day completeness** (zero unallocated IB orders for the `trade_date`) — robust to however many PTA runs happened that day. Breaks are **recorded, not blocking**.
4. Enable **Export** (PDF download) only once the day is `SIGNED` and its file exists.
5. Render the PDF through a **plug-and-play `PdfRenderer` seam** (default: headless-Chromium against the live print page) so the rendering backend can be swapped via config if Chromium is unavailable in production — mirroring the existing `FileStorage` `storage_backend` pattern.
6. Cut the frontend page over from mock loaders to the real backend, and wire both buttons.

## 3. Non-Goals

- **EoM / monthly aggregation / monthly-reports wiring** — deferred pending discussion; owned by a future proposal. `admin-frontend/app/(shared)/monthly-reports/page.tsx` stays on its mock (`MOCK_EOM_REPORTS`) untouched.
- **Client-portal monthly-report download** — untouched.
- **Changing the reconciliation engine, its break math, or the flow-view DTO** — consumed as-is; owned by proposal 012.
- **Break resolution / investigation workflow** (assign, escalate, carry-forward) — the old mock `EXCEPTIONS` register model is not revived; EoD records breaks, it does not manage their lifecycle.
- **Building a second concrete PDF renderer** — only the swappable seam + the Chromium default ship now; a fallback renderer is a reserved slot (see B-Backend-C-4), built if/when Chromium actually fails in prod.
- **A day/session picker on the report page** — EoD resolves "latest signable day" or an explicit `trade_date`; no calendar UI this round.

---

## 4. Cross-layer seam (frozen here)

### 4.1 The wire contract

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
# (a) is the EXISTING flow shape (schemas/reconciliation.py), MERGED across every
#     ReconSession whose trade_date == the resolved day. Field names unchanged so
#     the frontend's buildL1/L2/L3 derivation is reused verbatim.
class EodReportViewOut(BaseModel):
    # --- (a) day-aggregated flow view (reused sub-DTOs, verbatim) ---
    settleDay: str
    tradeDate: str                     # "YYYY-MM-DD"
    orders:  list[RcOrderOut]          # from schemas/reconciliation.py — unchanged
    allocs:  list[RcAllocOut]          # "
    ports:   list[RcPortOut]           # "
    algoTotal: str
    ibTotal: str
    crmTotal: str
    counts: RcBreakCountsOut           # "
    # --- (b) EoD header ---
    status: EodStatus
    signedOffBy: str | None            # display name of signer, null while OPEN
    signedOffAt: str | None            # ISO-8601, null while OPEN
    generated: str | None              # signedOffAt rendered for the band, else null
    orderCount: int                    # overall stat 1
    executionCount: int                # overall stat 2
    notionalTraded: str                # overall stat 3 (display, USD) — == ibTotal
    breakTotal: int                    # overall stat 4 (legs 1+2+3, excl. derived)
    outcome: EodOutcome                # "CLEAR" if breakTotal == 0 else "EXCEPTIONS"
    canSignOff: bool                   # zero unallocated IB orders for tradeDate
    exportReady: bool                  # status == "SIGNED" AND file present

# ===== POST /api/mobo/eod/sign-off =====
#   body: EodSignOffReq   |   gated by Action.EOD_SIGNOFF
#   200 -> EodReportViewOut (now status=SIGNED, exportReady=true)
#   409 -> {detail} if already SIGNED, or canSignOff is false (day incomplete)
#   404 -> {detail} if no eod_records row for tradeDate
class EodSignOffReq(BaseModel):
    tradeDate: str                     # "YYYY-MM-DD"

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

**Field-name ↔ column-name map**

| Wire (API) | DB column | Note |
|---|---|---|
| `tradeDate` `"YYYY-MM-DD"` | `eod_records.trade_date` (`Date`) | orders/PTA store raw `YYYYMMDD`; strip/insert dashes exactly as `PostTradeAllocationService._format_date` does |
| `status` | `eod_records.status` (`EodStatus` enum) | |
| `signedOffBy` (display name) | `eod_records.signed_off_by` (`firebase_uid` str) | resolved to a name in the presenter, like PTA `_client_names` |
| `signedOffAt` / `generated` | `eod_records.signed_off_at` (`DateTime`) | |
| `orderCount` | `eod_records.order_count` (`int`) | |
| `executionCount` | `eod_records.execution_count` (`int`) | |
| `notionalTraded` (display) | `eod_records.notional_total` (`Numeric(20,4)`) | formatted via `fmt_usd` |
| `breakTotal` | `eod_records.break_total` (`int`) | |
| `outcome` | `eod_records.outcome` (`EodOutcome` enum, NULL while OPEN) | Written once at sign-off from that transaction's `break_total` (compliance: stored fact, not recomputed on read). While `OPEN`, the DTO derives it live (`breakTotal == 0`) since the column is still `NULL` |
| (file) | `eod_records.file_storage_key` (str, null until signed) | opaque `FileStorage` key, `subdir="YYYY-MM"` |
| `EodLeg` | `eod_break_records.leg` (enum) | |

### 4.2 Per-layer obligations against the seam

| Layer | Contributes | Assumes from the other side |
|---|---|---|
| Database | `eod_records` (header) + `eod_break_records` (frozen snapshot) with the columns above; a `trade_date`-filtered "unallocated orders exist?" query path | Backend writes `status` only within `{OPEN, SIGNED}`, `leg` within the 3 enum values; never mutates a `SIGNED` row |
| Backend | Serves `EodReportViewOut` at the 3 routes with the codes in §4.1; snapshots breaks + renders PDF at sign-off; auto-opens the header from PTA `run()` | DB columns/enums present as in §4.1; `FileStorage.save(subdir=...)` and the reconciliation engine result lists (`order_breaks`/`client_model_breaks`/`crm_breaks`) unchanged |
| Frontend | Consumes `EodReportViewOut`; renders the existing report layout from it; wires Sign-off (POST) + Export (download) with the enable gates | Backend returns `EodReportViewOut` exactly as §4.1; `orders/allocs/ports/counts` keep the current flow-view field names |

### 4.3 Change protocol (post-freeze)

- Any edit to §4 comes back to this section first (dated addendum or new revision); every impl doc's §7 is re-copied in the same change set. The seam is never renegotiated between two impl docs directly.

---

## Layer 1 — Database

### A. Tables / objects in scope

| File | Tables / objects |
|---|---|
| `app/models/eod.py` (**new**) | `EodRecord`, `EodBreakRecord`, `EodStatus`, `EodLeg` |
| `alembic/versions/<rev>_eod_records.py` (**new**) | additive migration — two new tables, no existing-row changes |
| `app/models/recon.py` (read) | `ReconSession` — `trade_date` is the day key EoD groups on |
| `app/models/reconciliation.py` (read) | `Order.tradeDate`, `Order.allocated_run_id` — the completeness gate |

### B. Findings

#### B-1. No persisted EoD header exists (Yes — user req.)

Reconciliation breaks are computed in-memory per request (`ReconciliationResult`, `app/libs/reconciliation/dtos.py`) and never written. There is nowhere to record "day X was signed off by user Y at time Z with these stats and this file". A signed EoD must be an immutable artifact.

**Refactor:** new **`eod_records`** header table (mirrors the lightweight-header half of the established `AllocationPeriod` header + `AllocationModelSnapshot` frozen-rows pattern):

```
eod_records
  id               Uuid  pk
  trade_date       Date  NOT NULL  UNIQUE            -- one EoD per settlement day
  status           Enum(EodStatus) NOT NULL default OPEN
  signed_off_by    String(255) NULL                  -- firebase_uid, set at sign-off
  signed_off_at    DateTime(tz) NULL
  order_count      Integer NOT NULL default 0        -- overall stat 1
  execution_count  Integer NOT NULL default 0        -- overall stat 2
  notional_total   Numeric(20,4) NOT NULL default 0  -- overall stat 3
  break_total      Integer NOT NULL default 0        -- overall stat 4
  outcome          Enum(EodOutcome) NULL             -- frozen verdict, set at sign-off (compliance)
  file_storage_key String(512) NULL                  -- opaque FileStorage key, null until signed
  created_at       DateTime(tz) server_default now()
```

Stat columns are `0` while `OPEN` (live figures come from the recompute in the read path); they are **frozen with real values at sign-off**. `outcome` is `NULL` while `OPEN` (the read path derives a live verdict from the live `break_total`) and **written with the frozen verdict at sign-off**, so the signed day's `CLEAR`/`EXCEPTIONS` determination is a persisted, auditable fact — not something a later reader recomputes (B-3, D-5).

#### B-2. No frozen break-detail rows (Yes — user req.)

The three engine break lists vanish after each request; a signed report needs its exact broken records preserved even if live data later changes (same rationale the engine's own `_client_model_expected_actual` gives for reading the *frozen* `AllocationModelSnapshot`).

**Refactor:** new **`eod_break_records`** table — one shared table with a `leg` discriminator (simpler than three near-identical tables; the three break dataclasses share `expected`/`actual`/`delta` and differ only in which reference keys apply):

```
eod_break_records
  id             Uuid pk
  eod_record_id  Uuid  FK -> eod_records.id  ON DELETE CASCADE  NOT NULL
  leg            Enum(EodLeg) NOT NULL         -- IB_ALGO | ALGO_CLIENT | CLIENT_CRM
  subject_ref    String(255) NOT NULL          -- display anchor: ib_order_id / client name / client+model
  break_type     String(64)  NOT NULL          -- display label ("Fill break" / "Allocation break" / "Account break")
  field          String(32)  NULL              -- leg1 only: 'qty' | 'price'; null elsewhere
  expected       Numeric(28,10) NULL
  actual         Numeric(28,10) NULL
  delta          Numeric(28,10) NULL
  order_id       Uuid   NULL                    -- raw key, leg1 (traceability only)
  client_id      Integer NULL                   -- raw key, legs 2/3
  model_id       Uuid   NULL                    -- raw key, leg2
  created_at     DateTime(tz) server_default now()
  INDEX (eod_record_id, leg)
```

Rows are written **once**, at sign-off, by copying the engine's `OrderBreak` / `ClientModelBreak` / `CrmBreak` fields. Never updated.

**Column set (Q-1, settled): keep the current UI's set** — Record / Reference / Mismatch / Break type, unchanged from the existing Daily Exception Report page and Trade Reconciliation's row shape. No new design work; this schema already carries what those four columns need: Record = `subject_ref` (+ model pill via `model_id`), Reference = `order_id`→IB order (leg 1) or client+model (legs 2/3), Mismatch = `field` + `expected`→`actual`, Break type = `break_type`.

#### B-3. `outcome` (CLEAR / EXCEPTIONS) persisted as a column (Yes — user req.)

Originally scoped as a derived DTO field only (pure function of `break_total`). Per explicit requirement, the day's verdict must be **persisted**, not merely computed on read — for security & compliance: an auditor reading the row directly (DB query, backup, export) must see the signed verdict as a stored fact, and it must be immune to any future change in how "clear" is derived (e.g. if `breakTotal`'s definition ever changes, a signed day's historical verdict must not silently change with it).

**Refactor:** `eod_records.outcome` (`Enum(EodOutcome)`, nullable) — `NULL` while `OPEN`; written once at sign-off alongside the other frozen stats (Backend C-3 step 4), from the same `break_total` computed in that same transaction. Never updated after. The read-path DTO's `outcome` field (§4.1) is populated from this column when `SIGNED`, and derived live (`breakTotal == 0`) only while `OPEN` — matching how the other stat columns already behave.

### C. Summary of DB-layer changes

| # | Change | Required? | Effort | Data migration? |
|---|---|---|---|---|
| B-1 | `eod_records` header table | Yes — user req. | S | No (additive) |
| B-2 | `eod_break_records` frozen-snapshot table | Yes — user req. | S | No (additive) |
| B-3 | `eod_records.outcome` persisted verdict column | Yes — user req. | XS | No (additive) |

One Alembic revision creates both tables. Purely additive — down-migration drops both tables; nothing else touched. Rollback is clean (loses only signed EoD rows + their break snapshots, which are regenerable by re-signing).

---

## Layer 2 — Backend

### A. Structural change — new `app/libs/eod/` package

```
app/libs/eod/
  __init__.py
  service.py        # EodService — open / can_sign_off / sign_off / read-view / export
  repository.py     # EodRepository — eod_records + eod_break_records queries; day-level session + unallocated-order queries
  presenter.py      # ReconciliationResult(s) merged across sessions -> EodReportViewOut
  router.py         # GET /mobo/eod, POST /mobo/eod/sign-off, GET /mobo/eod/export
  pdf/
    __init__.py     # get_renderer() factory (config-selected)  <-- plug-and-play seam
    base.py         # PdfRenderer Protocol
    chromium.py     # ChromiumRenderer (Playwright) — DEFAULT
```

Dependency direction: `router` → `service` → (`repository`, `presenter`, `pdf.get_renderer`, `app/libs/reconciliation/engine.reconcile`, `app/libs/trade_models/storage.get_storage`). The engine and storage are imported, never modified.

### B. Logic — day-level aggregation across sessions (Yes)

`reconcile()` and `GET /api/mobo/reconciliation` operate on **one** `ReconSession`. A settlement day has N sessions (one per model group per PTA run). EoD is the first consumer needing the whole day.

**Refactor:** `EodService.build_day_view(trade_date)`:
1. `sessions = repo.sessions_for_trade_date(trade_date)` (**new** query — no equivalent today).
2. For each session, run `reconcile(db, session.id)` and collect the raw result lists.
3. **Merge**: concatenate `orders`/`allocs`/`ports` across sessions (each already carries a model pill, so multi-model rows coexist in one leg table with no FE change) and sum `algo_total`/`ib_total`/`crm_total`; map `OrderBreak→IB_ALGO`, `ClientModelBreak→ALGO_CLIENT`, `CrmBreak→CLIENT_CRM` (ignore `CrmAlgoBreak`).
4. When the day is `SIGNED`, the break detail + stats come from the **frozen snapshot** (`eod_break_records` + `eod_records`), not a live recompute — the DTO shape is identical either way, so the frontend never branches on status.

> Note the presenter's existing `RcBreakCountsOut.algIbBrk` conflates order + client-model breaks — that is the *flow view's* 3-count model, not EoD's 3 legs. EoD reads the engine result's **raw** `order_breaks` / `client_model_breaks` / `crm_breaks` lists directly to keep the three legs separate.

**Default-day resolution (Q-3, settled):** `EodRepository.resolve_default_day()` — `SELECT ... WHERE status = 'OPEN' ORDER BY trade_date DESC LIMIT 1`; if no row, fall back to `SELECT ... WHERE status = 'SIGNED' ORDER BY trade_date DESC LIMIT 1`. Used only when `GET /mobo/eod` omits `trade_date`. Prioritizes the day still awaiting sign-off (the actionable one) over one already closed out.

### C. Other backend findings

#### C-1. Auto-open the EoD header from the PTA run (Yes — user req.)

**Refactor:** inside `PostTradeAllocationService.run()` — same `with self.db.begin_nested()` transaction that already calls `synthesize_from_run()` (`app/libs/post_trade_allocation/service.py:151`) — call `EodService(db).ensure_open(trade_date)` for each group's `trade_date`. Idempotent upsert: first session of a day creates an `OPEN` `eod_records` row; every later run that date folds into the same header (the `trade_date` UNIQUE constraint enforces one). No break snapshot yet — that's sign-off's job.

#### C-2. Completeness gate — "zero unallocated orders for the day" (Yes — user req.)

The gate is **day-completeness, not zero-breaks**: an exception report must be able to record a day *with* breaks. `PostTradeAllocationRepository.unallocated_orders(after=)` filters by `ingested_at`, not `trade_date` (`repository.py:34`).

**Refactor:** `EodRepository.has_unallocated_orders(trade_date) -> bool` — `Order.allocated_run_id IS NULL AND Order.tradeDate == raw_yyyymmdd`. `canSignOff = not has_unallocated_orders(trade_date)`. Robust to 1 or 5 PTA runs, manual or scheduled (the weekday scheduler at `app/libs/post_trade_allocation/scheduler.py` needs nothing new — just its existing `PTA_SCHEDULER_ENABLED` flag).

#### C-3. Sign-off mutation (Yes — user req.)

**Refactor:** `EodService.sign_off(trade_date, signed_off_by)`, following the settled onboarding-approval precedent (`app/libs/onboarding/router.py:240` — POST gated by a dedicated `Action`, acting `firebase_uid` passed to a service method that does state-mutation + record-creation):
1. Load the `OPEN` header (404 if none; 409 if already `SIGNED`).
2. `can_sign_off` guard (409 if the day is incomplete).
3. Re-run the day aggregation (§B) once, final.
4. Snapshot breaks → `eod_break_records`; write the four stats **and `outcome`** (`CLEAR` iff `break_total == 0`, computed from this same transaction's tally, else `EXCEPTIONS`) onto the header; set `signed_off_by`/`signed_off_at`; `status = SIGNED`.
5. Render PDF via `pdf.get_renderer().render(trade_date)`; `storage.save(pdf, suggested_name="EoD-<date>.pdf", subdir="<YYYY-MM>")`; store `file_storage_key`.
6. All in one transaction.

New `Action.EOD_SIGNOFF = "mobo:eod_signoff"` (`app/libs/auth/actions.py`), added to `AdminRole.MOBO`'s set (alongside the existing `RECON_VIEW`). Export/read stay on `RECON_VIEW`.

#### C-4. Plug-and-play PDF renderer (Yes — user req.)

The document must "closely resemble the UI". The only zero-drift way is to rasterize the **real page**, but headless Chromium can be fragile in some production/container environments — so the rendering backend must be swappable without touching call sites, exactly like `FileStorage`.

**Refactor:** a `PdfRenderer` seam mirroring `app/libs/trade_models/storage.py::get_storage()`:

```python
# app/libs/eod/pdf/base.py
class PdfRenderer(Protocol):
    def render(self, trade_date: str) -> bytes: ...   # returns PDF bytes

# app/libs/eod/pdf/__init__.py
def get_renderer() -> PdfRenderer:
    backend = get_settings().pdf_renderer.lower()     # "chromium" (default) | "weasyprint"
    if backend == "weasyprint":
        return WeasyPrintRenderer()                    # reserved slot — see below
    return ChromiumRenderer()
```

- **`ChromiumRenderer` (default, shipped)** — Playwright (Python API, in-process; no separate Node service). Launches headless Chromium, navigates to a **new print-only Next.js route** `admin-frontend/app/(roles)/mobo/daily-exception-report/print/page.tsx` (the real report components, nav/sidebar chrome stripped), then `page.pdf()`. The route renders the same data from the same backend, so the PDF is a direct rasterization of the live UI. **Auth (Q-2, settled): a static shared token.** The backend sends `PDF_RENDER_TOKEN`'s value as an `X-Eod-Render-Token` request header on the Playwright navigation; the print route checks it against the same env var server-side (not client-visible) and 401s otherwise. No expiry/signing logic — same single-secret shape as the existing `storage_backend`/`STORAGE_ROOT` config pattern. It is not a user-facing page and carries no session.
- **`WeasyPrintRenderer` (reserved slot, NOT built now)** — a documented stub that raises `NotImplementedError` until configured, exactly like `NasStorage`. Flipping `PDF_RENDERER=weasyprint` is the escape hatch if Chromium proves unworkable in prod; implementing it (Jinja+CSS twin of the report) is a follow-up, built only if needed. *(ponytail: swappability is the requirement; a second full renderer is speculative until Chromium actually fails.)*

New settings (`app/core/config.py`, defaults keep prod safe): `pdf_renderer: str = "chromium"`, `pdf_render_base_url: str = "http://localhost:3001"`, `pdf_render_token: str = ""`. New dep: `playwright` in `api-backend/pyproject.toml` (+ a `playwright install chromium` step in the deploy/image build — flagged as a deployment gate).

#### C-5. Export download (Yes — user req.)

**Refactor:** `GET /mobo/eod/export` returns a `StreamingResponse` off `storage.open(file_storage_key)`, following the onboarding document-download pattern verbatim (`app/libs/onboarding/router.py:212` — `StreamingResponse`, `media_type="application/pdf"`, `Content-Disposition: attachment`). 409 if not yet `SIGNED`.

### D. Route / contract simplification

> **Decision (settled):** three new routes, no changes to existing recon/PTA routes.
>
> Final MOBO route surface added by this layer:
> ```
> GET  /api/mobo/eod?trade_date=            day-aggregated report view + EoD header   (RECON_VIEW)
> POST /api/mobo/eod/sign-off               freeze breaks + generate PDF + lock       (EOD_SIGNOFF)
> GET  /api/mobo/eod/export?trade_date=     download the signed PDF                    (RECON_VIEW)
> ```
> Net: **+3 routes**; `/api/mobo/reconciliation` and the PTA routes unchanged.

### E. Summary of Backend-layer changes

| # | Change | Required? | Effort |
|---|---|---|---|
| A | New `app/libs/eod/` package (service/repo/presenter/router/pdf) | Yes — user req. | M |
| B | Day-level merge across all `ReconSession`s for a `trade_date` | Yes | M |
| C-1 | Auto-open `eod_records` from PTA `run()` (same txn) | Yes — user req. | S |
| C-2 | `has_unallocated_orders(trade_date)` completeness gate | Yes — user req. | S |
| C-3 | `sign_off` mutation + `Action.EOD_SIGNOFF` | Yes — user req. | M |
| C-4 | `PdfRenderer` seam + `ChromiumRenderer` default + reserved stub | Yes — user req. | L |
| C-5 | `GET /export` StreamingResponse | Yes — user req. | S |

---

## Layer 3 — Frontend

| File | LOC | Role |
|---|---|---|
| `app/(roles)/mobo/daily-exception-report/page.tsx` | ~430 | The report UI (currently mock-backed; buttons inert) |
| `app/(roles)/mobo/daily-exception-report/print/page.tsx` | new | Chrome-stripped print target for `ChromiumRenderer` |
| `app/(roles)/mobo/daily-exception-report/actions.ts` | new | server actions: `getEod`, `signOff` |
| `hooks/api/useEodReport.ts` | new | fetch hook (mirrors `useReconciliationFlow`) |
| `server/mobo/index.ts` | +~30 | `getEod`, `signOffEod`, export helper |
| `server/endpoints.ts` | +3 | `MOBO.EOD`, `EOD_SIGNOFF`, `EOD_EXPORT` |
| `lib/mobo/flow-types.ts` (or new `eod-types.ts`) | +~20 | `EodReportViewDTO` type |

### A. Findings

#### A-1. Page is mock-backed; buttons inert (Yes — user req.)

`page.tsx` calls `loadReconciliationFlow("breaks")` + `loadReconciliation()` (mock) and renders a permanently-disabled "Sign off & lock" plus an inert "Export".

**Refactor:**
- Replace both mock loaders with `useEodReport(tradeDate?)` → `EodReportViewDTO`. The existing `buildL1`/`buildL2`/`buildL3` derivations operate unchanged on the returned `orders`/`allocs`/`ports` (field names are frozen identical in §4.1).
- Stats band reads `orderCount` / `executionCount` / `notionalTraded` / `breakTotal` from the DTO instead of recomputing client-side.
- The **all-clear-vs-exceptions verdict** switch (the existing `AllClear` component vs. the three break tables) keys off the DTO's `outcome` (`"CLEAR"` → `AllClear`, `"EXCEPTIONS"` → break tables), replacing the current client-side `open === 0` check — so the frontend renders the same verdict the backend froze into the signed report and the PDF.
- **Sign off & lock**: enabled when `status === "OPEN" && canSignOff`; on click → `signOff({tradeDate})` server action → refetch. (This changes the button's gate from the prototype's "zero open breaks" to backend `canSignOff` — see D-1.)
- **Export**: enabled when `exportReady`; on click → download the PDF from `GET /mobo/eod/export` (authenticated fetch → blob → `downloadAs`, reusing `lib/downloadFile`).

#### A-2. Print route for zero-drift rendering (Yes — user req.)

**Refactor:** new `.../daily-exception-report/print/page.tsx` — the same report `<section>` with no sidebar/`PageHeader`/nav, white background, print-friendly widths. Fetches the same `EodReportViewDTO` server-side. Gated by the internal `PDF_RENDER_TOKEN` sent as an `X-Eod-Render-Token` header (Q-2, settled — matches Backend C-4), checked server-side in the route before rendering; a request missing/mismatching the header 401s. Not a user-navigable page. This is what `ChromiumRenderer` screenshots to PDF.

### B. Adapting to changes in other layers

| Upstream change | Frontend change | Files touched |
|---|---|---|
| Backend D — `GET /mobo/eod` | new `getEod` action + `useEodReport` hook + `EodReportViewDTO` | `actions.ts`, `hooks/api/useEodReport.ts`, `flow-types.ts`, `server/mobo/index.ts`, `server/endpoints.ts` |
| Backend C-3 — `POST /mobo/eod/sign-off` | `signOff` action wired to the button | `actions.ts`, `page.tsx`, `server/mobo/index.ts` |
| Backend C-5 — `GET /mobo/eod/export` | authenticated blob download on Export | `page.tsx`, `server/mobo/index.ts` |

### C. Additional findings

None beyond A/B.

### D. Summary of Frontend-layer changes

| # | Change | Required? | Effort |
|---|---|---|---|
| A-1 | Cut page over to real backend; wire both buttons | Yes — user req. | M |
| A-2 | Chrome-stripped print route | Yes — user req. | S |
| B | New action/hook/type/endpoint plumbing | Yes | S |

---

## Design decisions (settled)

- **D-1 — Sign-off gate is day-completeness, not zero-breaks.** The prototype disabled "Sign off & lock" while any break was open. That is wrong for an *exception* report — a day with breaks must still be signable so its exceptions are recorded. The gate is now `canSignOff` = zero unallocated IB orders for the `trade_date` (the day's work is done); breaks are snapshotted and reported, never blocking. Supersedes the prototype's button semantics.
- **D-2 — One shared break-snapshot table with a `leg` discriminator**, not three tables. The three engine break shapes share `expected/actual/delta` and differ only in reference keys; a discriminator + nullable key columns is the smaller schema.
- **D-3 — Signed EoD is frozen from the snapshot, not recomputed.** While `OPEN` the read path recomputes live; once `SIGNED` it serves the frozen `eod_break_records` + stat columns. DTO shape is identical both ways, so the frontend never branches on status, and a later change to live data cannot alter a signed report.
- **D-4 — PDF rendering is a config-selected seam; only the Chromium default ships.** Per user requirement: default = headless-Chromium rasterizing the real print page (zero drift); the swap point (`PDF_RENDERER`) exists so an alternate backend can replace it if Chromium is unworkable in prod, without touching call sites. The alternate itself is a reserved stub until needed.
- **D-5 — The day's verdict (`outcome`: `CLEAR` / `EXCEPTIONS`) is a persisted column, written once at sign-off.** Revised from an earlier draft that derived it live from `break_total`: per explicit security/compliance requirement, the verdict must be a stored, auditable fact on the signed row itself — immune to any later change in how "clear" is computed, and readable directly off the DB without recomputation. `eod_records.outcome` is `NULL` while `OPEN` (DTO derives it live from the live `break_total` in that state) and frozen `CLEAR`/`EXCEPTIONS` at sign-off (B-3), surfaced verbatim as `EodReportViewOut.outcome` (§4.1) and thus in the PDF and any future EoM aggregation.
- **D-6 — Per-leg break-table columns (was Q-1): keep the current UI's set.** Record / Reference / Mismatch / Break type — unchanged from the existing Daily Exception Report page and Trade Reconciliation's row shape. No new design work; `eod_break_records` (B-2) already carries what these four columns need.
- **D-7 — Print-route auth (was Q-2): a static shared token.** `PDF_RENDER_TOKEN`, sent as an `X-Eod-Render-Token` header on the Playwright navigation and checked server-side by the print route. No expiry/signing logic — matches the existing single-secret config pattern (`storage_backend`/`STORAGE_ROOT`).
- **D-8 — Default day when `trade_date` is omitted (was Q-3): latest OPEN, falling back to latest SIGNED.** `GET /mobo/eod` prioritizes the day still awaiting sign-off — the one a MOBO analyst actually needs to act on — over a day that's already closed out.

---

## Execution & verification

1. **DB** — author + run the additive Alembic revision (two tables). Verify: tables exist, `eod_records.trade_date` UNIQUE, FK cascade on `eod_break_records`. **Human gate: migration runs against the live DB — requires sign-off before applying.**
2. **Backend, read + open path** — `ensure_open` from PTA `run()`; `GET /mobo/eod` day-merge. Verify against a seeded multi-model day: one `OPEN` header, merged orders/allocs/ports across sessions, `breakTotal` = sum of the three raw break lists, `canSignOff` reflects unallocated orders.
3. **Backend, sign-off + render** — `POST /mobo/eod/sign-off` on a complete day: header flips `SIGNED`, `eod_break_records` populated, stats frozen, PDF written under `YYYY-MM/…`; 409 on re-sign and on an incomplete day. Verify `ChromiumRenderer` produces a PDF that visually matches the print route.
4. **Backend, export** — `GET /mobo/eod/export` streams the PDF for a signed day, 409 before sign-off.
5. **Frontend** — page renders from the real DTO; Sign-off enabled only when `OPEN && canSignOff`, Export only when `exportReady`; both round-trip against the backend.

**Human gate(s):** (a) the live-DB migration (step 1); (b) confirming `playwright install chromium` is present in the deployment image / runtime before enabling `ChromiumRenderer` in prod (step 3) — the `PdfRenderer` seam is the fallback if this gate can't be met.

---

## Rollback

Additive throughout. Branch revert removes all backend/frontend code. The Alembic down-migration drops `eod_break_records` then `eod_records`; nothing else is touched. Rollback is **clean** — it loses only signed EoD headers, their break snapshots, and generated files (all regenerable by re-signing the affected days). No existing table, row, or route is modified.

---

## Open questions

### Out of scope (tracked elsewhere)

- **EoM aggregation, monthly rollup, monthly-reports wiring (both portals)** — deferred pending discussion; a future proposal owns it. This proposal's `eod_records` is deliberately shaped so an EoM table can later reference a month's EoD rows by id.
