# 020 — Schema / Format Cleanup Refactor

> Status: **DRAFT — pending implementation approval.**
> Scope: The cross-cutting debt branch that proposal 012 §"Out of scope" reserved, expanded with three further items found in an 2026-08-03 audit. Touches fee-unit semantics, file-storage segmentation, HTTP error shape, frontend build/loading UX, and the test baseline. Explicitly **not** a feature branch — no new user-facing capability is added.
> Constraint: No business logic changes beyond correcting the fee scale. No design/layout change to any existing screen — the frontend work is build configuration and loading states only. Every persisted-state change must be reversible or explicitly flagged as lossy.

---

## 1. Context and Motivation

Proposal `012-2026-07-15-trade-recon-integration.md:428` deferred three schema/format cleanups into "one dedicated branch rather than scope-creeping this proposal":

1. a surrogate PK on `allocation_model_snapshots`, simplifying the `recon_sessions` composite FK,
2. error-envelope unification,
3. `client_profiles.id` → UUID.

A 2026-08-03 audit across the repo and prior session history confirmed those three and surfaced three more that belong on the same branch — one of them actively corrupting data:

| Item | Evidence |
|---|---|
| **Fee-scale collision** | `admin-frontend/components/pc/model-management/CreateModelForm.tsx:215` persists `models.mgmt_fee` as whole percent (`2.0`); `docs/proposals/007-2026-06-30-pc-workspace-refactor.md:84-85`, the 013 onboarding seam, and every other producer treat fees as decimal fractions (`0.02`). `api-backend/app/libs/onboarding/service.py:362-365` compares the two directly, so **every onboarding approval writes a spurious `mgmt_fee_override`**. |
| **Single shared filesystem** | `api-backend/app/libs/trade_models/storage.py` — one adapter, one root, a free-text `subdir` string. Four unrelated packages import it across feature boundaries; each invented its own convention. EoD writes `{YYYY-MM}/` at the storage **root**, a sibling of the category directories. |
| **Incoherent HTTP shape** | 117 `raise HTTPException` sites emit three mutually incompatible `detail` types (string ×116, Pydantic's list-of-objects on every un-overridden 422, one dict at `api-backend/app/libs/access/service.py:95` that double-nests `detail`). `api-backend/app/main.py` registers **zero** exception handlers, so any non-`HTTPException` escapes as Starlette's plain-text `Internal Server Error` — which both frontends' `res.json()` cannot parse. |
| **Frontend build + loading** | Both apps run `next dev` on webpack with no `optimizePackageImports`; `admin-frontend/lib/icons.ts` re-exports ~145 lucide icons and is imported by 62 files. `admin-frontend` has **zero** `loading.tsx` files and no skeleton primitive, against 8 in `client-frontend`. |
| **Test baseline** | `pytest -q` **aborts at collection** (6 import errors). With `--continue-on-collection-errors`: 1249 passed / 255 failed. `client-frontend` 65/5, `admin-frontend` 371/117. ~360 of 377 failures are stale tests; two are real bugs. `admin-frontend/.gitignore:11` ignores `tests/`, so that suite has never been enforced against a commit. |

> **Why now / why this order.** These items block each other. The fee migration cannot be validated while the test suite is un-runnable; the storage split needs a data migration in the same Alembic sequence as the fee correction; and the error-envelope change is the one that makes admin-frontend failures legible enough to verify any of it. Doing them as one branch means one migration review and one regression pass instead of five.

### 1.1 Correction to 012's premise: the reconciliation *flow* is dead, the *library* is not

012 deferred the surrogate PK **because `recon_sessions` needed to reference `allocation_model_snapshots`**. That premise no longer holds in the way 012 meant it. The user-facing trade-reconciliation flow is a **dead feature** — it has no live data source (only stored IB data exists; there is no trader feed), and the reconciliation logic will be reworked from scratch in a later proposal.

**But the code is not dead.** A dependency scan on 2026-08-03 found `app/libs/reconciliation/` imported by two live packages:

```
app/libs/eod/presenter.py   -> adapters.{algotrade,crm,ib}, dtos, formatting,
                               presenter.*, models.recon.ReconSession
app/libs/eod/repository.py  -> models.recon.ReconSession  (sessions_for_trade_date)
app/libs/eod/service.py     -> engine.reconcile, dtos, formatting
app/libs/post_trade_allocation/service.py:19
                            -> reconciliation.algotrade.synth.{synthesize_from_run,
                                                               _parse_yyyymmdd}
```

`app/libs/eod` calls `reconcile()` once per session; post-trade allocation is unambiguously live and consumed by the admin UI. Deleting either package, or dropping `recon_sessions`, breaks the import graph.

**A later scan corrected a claim made in an earlier draft of this section.** EoD's own three routes (`/eod`, `/eod/sign-off`, `/eod/export`) have **no frontend consumer** — `admin-frontend/server/endpoints.ts` has no `EOD` entry — and the EoD report is confirmed part of the same deprecated auto-reconciliation feature. So the argument for retention is **purely the import graph**, not liveness: `post_trade_allocation` needs `algotrade/synth.py`, and the reworked subsystem will want the rest. Liveness was the wrong test and is not relied on anywhere in this proposal.

Consequences for this branch:

- **Do not add a surrogate PK to `allocation_model_snapshots`.** Its composite PK `(period_id, user_id, model_id)` is a legitimate natural key, and the consumer that made it awkward is not being normalized either way. The 012 item is closed as withdrawn (D-2).
- **Delete every route with no frontend consumer; keep every module.** That is `GET /api/mobo/reconciliation` plus all three EoD routes (D-12). `GET /api/mobo/trade-records` is the deprecated feature's **replacement**, built for the rework to grow from, and is not touched.
- **`recon_sessions` is not dropped.** It is live storage for the EoD path. The composite FK at `app/models/recon.py:54-62` therefore survives this branch, as does the write-only `allocation_user_id` column — both are the recon rework's to remove, not this branch's.
- The composite-FK item is thus **neither normalized nor deleted here**; it is handed to the rework with its context recorded. That is a smaller and more honest outcome than either alternative, and it is the direct consequence of discovering that "dead feature" described the flow, not the code.

---

## 2. Goals

1. `models.mgmt_fee`, `models.incentive_fee`, `client_onboardings.*`, and `client_subscriptions.*_override` all hold **decimal fractions** (`0.020000` = 2%); a repo-wide grep for `parseFeePercent` returns exactly one definition.
2. `_approve_initial` leaves `mgmt_fee_override` `NULL` when the captured fee equals the model default — verifiable by approving an onboarding at the default fee and asserting the column is `NULL`.
3. Each document group writes to its **own configured storage root**, independently relocatable; `get_storage()` cannot be called without naming a bucket.
4. Every error response from the API is `application/json` with a `detail` field that is **always a string**, for every failure class including unhandled exceptions and validation errors.
5. `admin-frontend` renders the server's message, not raw JSON, at every `toast.error` / `setError` site.
6. `pytest -q` runs to completion without `--continue-on-collection-errors`; all three suites are green or have a named, tracked exception.
7. `admin-frontend/tests/` is tracked in git.
8. Cold `next dev` compile of the admin dashboard route measurably improves against a recorded baseline; every admin route shows a skeleton from navigation until its data is on screen.
9. `alembic downgrade base` runs to completion on MySQL from this branch's head.

## 3. Non-Goals

- **Reworking trade reconciliation and the EoD report, or deleting either library** — owned by a future proposal. This branch removes only the four unconsumed routes (§Layer 2 C-5, D-12). `recon_sessions`, `eod_records`, and every module in both packages survive intact, by explicit instruction, so the rework inherits the logic rather than having to rebuild it.
- **Adding a surrogate PK to `allocation_model_snapshots`** — withdrawn; see §1.1. The 012 out-of-scope item is closed as "no longer required", not deferred again.
- **Implementing `NasStorage`** — the bucket registry makes it a per-bucket swap later; the placeholder stays a placeholder.
- **Rewriting the 117 `raise HTTPException` call sites** — the envelope is normalized at the handler layer precisely so the call sites need no edit.
- **The post-trade-allocation 3× over-allocation** (`tests/libs/post_trade_allocation/test_be3_service_run.py:365`) — a money-path logic bug needing its own diagnosis; owned by a separate proposal (D-7). The failing test stays failing and is **not** silenced by this branch.
- **Any visual redesign.** Loading skeletons mirror existing page structure; they introduce no new visual language.

---

## 4. Cross-layer seam (frozen here)

### 4.1 The wire contract

**(a) Fee unit — canonical form is the decimal fraction.**

```
Everywhere, at every layer, in every DTO and every column:
    0.020000  means 2%
    0.200000  means 20%

DB      : Numeric(9, 6)              -- unchanged type, corrected scale
API DTO : float | Decimal            -- raw fraction, never pre-multiplied
UI input: user types "2.0" in a field labelled "%"  -> divide by 100 before send
UI output: value * 100, then format  -> "2.00%"

Rationale for fraction over percent: it is what docs/proposals/007:84-85
specifies, what the 013 onboarding seam froze, and what Numeric(9,6) was
sized for (percent scale wastes 2 digits of the 3-digit integer part).
```

**(b) Storage bucket — a closed enum, one root per bucket.**

```python
# app/core/storage.py
class Bucket(StrEnum):
    MARKETING   = "marketing"      # model_materials.storage_key
    KYC         = "kyc"            # onboarding_documents.storage_key
    CONTACT_LOG = "contact_log"    # client_contact_logs.doc_storage_key
    REPORTS     = "reports"        # eod_records.file_storage_key  (EoD + EoM)
    LEGAL       = "legal"          # read-only drop zone, no metadata table
    STATEMENTS  = "statements"     # read-only drop zone, no metadata table

def get_storage(bucket: Bucket) -> FileStorage: ...

# storage_key is BUCKET-RELATIVE. It never contains the bucket name.
#   before:  "client_kyc_docs/Cathy_Client_ke-uid-1/ab12..._passport.pdf"
#   after:   "Cathy_Client_ke-uid-1/ab12..._passport.pdf"   (in the KYC bucket)
# The bucket is derived from the calling context (each column belongs to
# exactly one bucket), never parsed from the key.
```

**(c) Error envelope — one shape, `detail` always a string.**

```jsonc
// EVERY non-2xx response, without exception:
{
  "detail": "Human-readable message.",   // ALWAYS a string
  "code":   "matrix_changed_since_read", // optional; machine-readable slug
  "errors": [                            // optional; 422 field errors only
    { "loc": ["body", "mgmt_fee"], "msg": "...", "type": "..." }
  ]
}
```

Status-code conventions, applied to the outliers listed in Layer 2 C-3:

| Class of failure | Code |
|---|---|
| Malformed / out-of-range request input | `422` |
| Missing or invalid credentials | `401` |
| Authenticated but not permitted | `403` |
| Named resource does not exist | `404` |
| "No data for this date/period" on a **collection** endpoint | `200` + empty collection |
| Illegal state transition / conflicting write | `409` |
| Unexpected server fault | `500`, `detail` is a fixed generic string — never `str(exc)` |

### 4.2 Per-layer obligations against the seam

| Layer | What this layer contributes | What this layer assumes from the other side |
|---|---|---|
| Database | Stores fees as fractions in `Numeric(9,6)`; migrates existing rows; strips bucket prefixes from **three** of the four `*storage_key` columns (`eod_records.file_storage_key` is already bucket-relative and is untouched); promotes `client_profiles.user_id` to PK. **Does not touch any recon table** — B-3's drop was withdrawn (D-12) | Backend never writes a percent-scale fee; Backend derives the bucket from context, not from the key |
| Backend | Serves and accepts fractions verbatim (no scaling); calls `get_storage(bucket)` with a literal `Bucket` member; emits the §4.1(c) envelope for every non-2xx | DB columns hold fractions; bucket roots exist and are writable |
| Frontend | Divides by 100 on input, multiplies by 100 on display; reads `detail` as a string from every error response | Backend returns fractions and the §4.1(c) envelope |

### 4.3 Change protocol (post-freeze)

- Any edit to §4 requires a new proposal revision or a dated addendum in this file.
- Every impl doc's §7 is updated in the same change set — the seam never lives in only one place.

---

## Layer 1 — Database

### A. Tables / objects in scope

| File | Tables / objects |
|---|---|
| `app/models/pc.py` | `models`, `client_subscriptions` |
| `app/models/onboarding.py` | `client_onboardings`, `onboarding_documents`, `client_contact_logs` |
| `app/models/eod.py` | `eod_records` |
| `app/models/recon.py` | `recon_sessions` *(dropped)* |
| `app/models/users.py` | `client_profiles` |
| `api-backend/alembic/versions/` | one new revision, `down_revision = c72e91a4f6b3` |

### B. Findings

#### B-1. Fee columns hold two different scales (Yes)

`models.mgmt_fee` / `incentive_fee` (`app/models/pc.py:102-103`) are `Numeric(9,6)` with no unit recorded on the column. `docs/proposals/007-2026-06-30-pc-workspace-refactor.md:84-85` specifies "Decimal rate: `0.020000` = 2 %", but the only writer — the PC model editor — persists whole percent. Meanwhile `client_onboardings.mgmt_fee` (`app/models/onboarding.py:92-93`) is populated from `StartOnboardingReq`, whose docstring at `app/libs/onboarding/schemas.py:23-24` states "fractions (e.g. 0.015)". `Numeric(9,6)` accepts both, so the DB never rejects the mismatch.

`client_subscriptions.mgmt_fee_override` / `incentive_fee_override` (`app/models/pc.py:224-225`) is the collision point: it receives fractions from the onboarding-approval path and whole percent from the RM allotment path (`app/libs/onboarding/service.py:503-506`), with no discriminator column.

**Refactor:** No type change. Add a unit statement to each column's comment (`-- decimal fraction: 0.020000 = 2%`) and migrate existing rows to the fraction scale.

**Migration plan (data-preserving, with one heuristic):**

1. `models`: `UPDATE models SET mgmt_fee = mgmt_fee / 100, incentive_fee = incentive_fee / 100` — unconditional. Every row in this table was written by the PC editor, which is percent-scale without exception.
2. `client_onboardings`: **no change.** Already fractions.
3. `client_subscriptions`, percent-scale strays: `UPDATE ... SET mgmt_fee_override = mgmt_fee_override / 100 WHERE mgmt_fee_override >= 1` (same for `incentive_fee_override`). A fee stored as a fraction is `< 1` by definition (100%); a value `>= 1` can only have come from the percent-scale RM path. **Ceiling of this heuristic:** it misclassifies a genuine fee of 100% or more, which does not occur in this business. Recorded, not defended further.
4. `client_subscriptions`, spurious overrides: `UPDATE client_subscriptions cs JOIN models m ON m.id = cs.model_id SET cs.mgmt_fee_override = NULL WHERE cs.mgmt_fee_override = m.mgmt_fee` (and likewise for incentive). Restores the `NULL = inherit` invariant documented at `app/models/pc.py:220-223`, which the broken compare-and-set has been violating on every approval. Runs **after** steps 1 and 3, so both sides are on the same scale.
5. Emit row counts for steps 1, 3 and 4 into the migration log — these are the numbers the human gate reviews.

**Down-migration:** steps 1 and 3 reverse by multiplication. Step 4 is **lossy** — a nulled override cannot be distinguished from one that was always `NULL`. See §Rollback.

#### B-2. `storage_key` columns embed the document group in the value (Yes — user req.)

The four key-bearing columns — `model_materials.storage_key` (`app/models/pc.py:152`), `onboarding_documents.storage_key` (`app/models/onboarding.py:154`), `client_contact_logs.doc_storage_key` (`app/models/onboarding.py:363`), `eod_records.file_storage_key` (`app/models/eod.py:62`) — store root-relative paths whose first segment is the document group (`client_kyc_docs/…`, `models_mrkt_materials/…`). With one root per bucket (Layer 2 A), that prefix becomes wrong: `root_kyc / "client_kyc_docs/..."` double-nests.

`eod_records.file_storage_key` is the exception — it has **no** prefix, because EoD writes `{YYYY-MM}/` directly at the shared root. Its values are already bucket-relative and need no edit.

**Refactor:** Strip the leading group segment from the three prefixed columns. Keys become bucket-relative per §4.1(b).

**Migration plan (data-preserving):**
1. `UPDATE model_materials SET storage_key = SUBSTRING(storage_key, LENGTH('models_mrkt_materials/') + 1) WHERE storage_key LIKE 'models_mrkt_materials/%'`
2. `UPDATE onboarding_documents SET storage_key = SUBSTRING(storage_key, LENGTH('client_kyc_docs/') + 1) WHERE storage_key LIKE 'client_kyc_docs/%'`
3. `UPDATE client_contact_logs SET doc_storage_key = SUBSTRING(doc_storage_key, LENGTH('client_contact_logs/') + 1) WHERE doc_storage_key LIKE 'client_contact_logs/%'`
4. `eod_records` — untouched.
5. The `LIKE` guards make each statement idempotent and make a re-run after a partial failure safe.

Paired with a **deploy-time directory move** (not part of the migration — see §Execution): `crm_filesystem/models_mrkt_materials/*` → the marketing bucket root, and so on. The migration must not run before the move, or downloads 500 in the window between.

#### B-3. `recon_sessions` carries the repo's only composite FK — **withdrawn from this branch** (Accepted)

`app/models/recon.py:54-62` declares `fk_recon_sessions_allocation_model_snapshot`, a 3-column FK into `allocation_model_snapshots`' composite PK — the only `ForeignKeyConstraint` in the entire models package. Its third column, `allocation_user_id`, is written by `app/libs/reconciliation/algotrade/synth.py:43-50` and read by nothing: both `engine.py:54-61` and `presenter.py:127-137` join on `period_id` + `model_id` only.

This proposal originally planned to drop the table. **That is withdrawn** — `recon_sessions` is queried by `app/libs/eod/repository.py:24-25` (`sessions_for_trade_date`), and the EoD module is retained in full for the reconciliation rework (D-12). Dropping the table would leave that retained logic pointing at a table that no longer exists.

**Refactor: none. No DDL, no data change.** The table, its composite FK, and the write-only `allocation_user_id` column all survive this branch untouched.

**Handed to the recon rework, with context:** when reconciliation is redesigned, that proposal owns (a) whether `recon_sessions` survives at all, (b) the surrogate PK on `allocation_model_snapshots` if it still wants one, and (c) `allocation_user_id`, which is dead weight today and should not be carried into a new design without a reason. Recording it here means the rework starts from evidence rather than rediscovering it.

> **Why this is the right call and not a dodge.** The alternative — extracting `adapters`, `dtos`, `formatting`, `engine.reconcile` and `synth` out of `reconciliation/` and into `eod/` and `post_trade_allocation/` so the package could be deleted — is a refactor of live code inside a branch whose whole purpose is schema and format cleanup. It would add the largest and riskiest diff in 020 to remove a table that the rework may want to keep. Doing less here is not deferral for its own sake; it is declining to make an irreversible structural decision on behalf of a proposal that hasn't been written.

#### B-4. `client_profiles.id` is `int`, alone among the portal tables (Accepted)

`app/models/users.py:146` — `id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)`, while `user_id` immediately below it is `Uuid(native_uuid=False)` and every other table established by the 005 database-foundation work uses UUID keys. This is the third item from 012's deferred bundle.

Note that `client_profiles.id` is **not referenced by any FK** — `user_id` is the column everything joins on, and it already carries a `unique=True` index. The `id` column is therefore an unused surrogate on a table that already has a natural unique key.

**Refactor (settled — D-9): drop `id`, promote `user_id` to primary key.** Smaller diff than a UUID conversion, removes a column instead of migrating one, and matches the table's 1:1 relationship with `users`. Nothing references `id`, so no FK rewiring. The 012 item asked for a UUID conversion; deleting the column satisfies the underlying intent (no `int` keys left in the portal schema) while doing strictly less.

**Migration plan:**
1. Verify `client_profiles.id` has no inbound FK in the live schema before dropping — the model shows none, but the check is cheap and the drop is not reversible without data.
2. Drop the `PRIMARY KEY` on `id`, drop the column, promote the existing `unique=True` index on `user_id` to `PRIMARY KEY`.
3. Confirm the stale frontend `PortalUser.id` reference recorded in `FRONTEND_FOLLOWUP_005.md` is gone first — if any client still reads it, this fails at runtime rather than at migration time.

#### B-5. A migration downgrade is broken on MySQL (Yes)

> **Corrected 2026-08-03 against source.** The defect is in **`0027`**, not `0026`, and the offending call is `drop_constraint(type_="unique")`, not `drop_index`. `a9317a31b484_0026_client_portal_integration.py` has no ordering hazard. The test names are misleading — they fail *downstream* of `0027`, which is why the original audit attributed it to `0026`.

`b34f8c1a9d27_0027_ticket_status_consolidation.py:61-68`:

```python
def downgrade() -> None:
    op.drop_constraint(
        "uq_client_tickets_linked_allotment_id", "client_tickets", type_="unique"
    )
    op.drop_constraint(
        "fk_client_tickets_linked_allotment_id", "client_tickets", type_="foreignkey"
    )
```

The unique constraint is dropped **before** the foreign key that depends on its backing index. MySQL refuses with `OperationalError (1553) Cannot drop index … needed in a foreign key constraint`, so `alembic downgrade` past `0027` fails outright. 19 failures/errors in the current suite reproduce it (`test_migration_0026…`, `test_db1_transaction_details_migration`, `test_db2_allotment_redemption_migration`, `test_db2_auth_status_migration`, `test_eod_migration`, `test_recon_migration`, plus 6 setup errors in `test_db4_onboarding_documents_backfill_migration.py`).

This is a genuine pre-existing defect, not test drift, and it is **a prerequisite for this proposal rather than an adjacent nice-to-have**: every rollback claim in §Rollback is theoretical until a downgrade can actually run.

**Refactor:** Swap the two `drop_constraint` calls — foreign key first, unique second. Editing a historical revision in place is acceptable here because the current `downgrade()` has never successfully executed anywhere, so no environment's state depends on its present ordering. Audit every other revision's `downgrade()` for the same constraint-before-FK pattern while in there; fix any found.

**One honest caveat.** `0027`'s `upgrade()` creates the FK *before* the unique constraint, so MySQL will have auto-created its own backing index for the FK — meaning error 1553 may not fire on every MySQL version or storage-engine configuration. The reorder is correct and free regardless, so **the acceptance criterion is empirical, not the diff**: `alembic downgrade base && alembic upgrade head` must succeed against a scratch database. If it already passes on some environment before the fix, that does not make the ordering right.

**Migration plan:** None — this changes migration *code*, not data.

---

### C. Summary of DB-layer changes

| # | Change | Required? | Effort | Data migration? |
|---|---|---|---|---|
| B-5 | Fix `0027`'s downgrade constraint/FK ordering — **prerequisite for all of the below** | Yes | XS | No |
| B-1 | Migrate fee columns to the fraction scale; null spurious overrides | Yes | M | Yes — **partially lossy** |
| B-2 | Strip bucket prefixes from three `storage_key` columns | Yes — user req. | S | Yes |
| B-3 | ~~Drop `recon_sessions`~~ — **withdrawn**, table is live storage for the EoD path | Accepted | — | No |
| B-4 | `client_profiles`: drop `id`, promote `user_id` to PK | Accepted | S | Yes |

B-5 is a standalone edit to an existing revision and lands **first**, on its own. B-1, B-2 and B-4 land in **one new Alembic revision**, `down_revision = c72e91a4f6b3`. That revision's downgrade restores B-2 and B-4 cleanly, reverses B-1's scale arithmetic, and **cannot restore** B-1 step 4 — see §Rollback. B-3 contributes no DDL.

---

## Layer 2 — Backend

### A. Per-bucket storage (Yes — user req.)

**Target layout.** `storage.py` moves out of the `trade_models` feature package — four unrelated packages already import it across a boundary that should not exist.

```
app/core/storage.py           # Bucket enum, FileStorage protocol, LocalStorage,
                              # NasStorage placeholder, get_storage(bucket)
```

Dependency direction: `app/core/storage.py` imports only `app/core/config.py`. No feature package may be imported by it; every feature package may import it.

**Config.** One root per bucket, each independently overridable, each defaulting to a sibling directory so a fresh install needs zero configuration:

```python
storage_backend: str = "local"
storage_root: str = "./crm_filesystem"          # base for the defaults below only
storage_root_marketing:   str | None = None     # default: {storage_root}/marketing
storage_root_kyc:         str | None = None     # default: {storage_root}/kyc
storage_root_contact_log: str | None = None     # default: {storage_root}/contact_log
storage_root_reports:     str | None = None     # default: {storage_root}/reports
storage_root_legal:       str | None = None     # default: {storage_root}/legal
storage_root_statements:  str | None = None     # default: {storage_root}/statements
```

This is what "one designated filesystem per document group" buys concretely: the KYC bucket can be pointed at an encrypted share with tighter mount permissions, reports at bulk storage, and marketing at something web-servable — each without touching the others, and each able to move to NAS on its own schedule. A single central root cannot express any of that.

`get_storage(bucket)` is `@lru_cache`d per bucket. `legal_docs_subdir` and `client_statements_subdir` are **deleted** — those two groups become buckets, so their roots are the config, and the `subdir` argument to `save()` drops from the call sites that only used it to name a group.

`save(..., subdir=...)` is retained but narrows in meaning: it is now the **within-bucket** path only (the per-client folder, the `YYYY-MM` month folder). `open()` and `list()` take bucket-relative keys.

**Path containment.** `LocalStorage.open()` (`storage.py:75-77`) does `self._root / storage_key` with no containment check. With one root the only mitigation was that keys came from the DB; with six roots the blast radius of a traversal changes shape. Add a resolved-path check that the target is under the bucket root, and reject otherwise. This is a trust boundary — it is not simplified away.

**Call-site changes:**

| Caller | Bucket |
|---|---|
| `app/libs/trade_models/service.py:345` | `Bucket.MARKETING` |
| `app/libs/onboarding/service.py:243` (KYC upload) | `Bucket.KYC` |
| `app/libs/onboarding/service.py:893` (contact-log attachment) | `Bucket.CONTACT_LOG` |
| `app/libs/eod/service.py:131` | `Bucket.REPORTS` |
| `app/libs/client_portal/service.py:263,279,285,289` | `MARKETING` / `LEGAL` / `STATEMENTS` per scope |

#### A-1. EoD writes `{YYYY-MM}/` at the storage root (Yes)

`app/libs/eod/service.py:130-137` passes a bare month string as `subdir`, so signed EoD PDFs land in `crm_filesystem/2026-07/` — a sibling of `client_kyc_docs/` and `legal_docs/`, in the same flat namespace. Any future date-keyed group collides with it.

**Refactor:** Falls out of A — `Bucket.REPORTS` gives the month folders their own root. No key migration needed (B-2 step 4); the keys were already bucket-relative by accident.

#### A-2. Two folder conventions for the same client (Accepted)

KYC uses a human slug, `client_kyc_docs/Cathy_Client_ke-uid-1/` (`app/libs/onboarding/repository.py:265-277`); contact-log attachments use the raw client UUID, `client_contact_logs/{uuid}/`. The same client has two folders that cannot be joined on the filesystem.

**Refactor (settled — D-10): standardize both buckets on the slug form `{Slug_Name}_{uid[-8:]}`.** Extract the builder into `app/core/storage.py` as `client_folder(name, uid)` so there is exactly one definition, and have both the KYC and contact-log paths call it.

**Known ceiling of the slug form.** A slug embeds the client's name, so renaming a client makes the existing folder name stale — new uploads would land in a second folder. The `_{uid[-8:]}` suffix keeps both folders unambiguously attributable to the same client, so nothing is *lost*, but a renamed client can end up with two directories. Two mitigations, in order of laziness:

1. **Resolve the folder by uid suffix, not by full name.** `client_folder()` glob-matches `*_{uid[-8:]}` in the bucket first and reuses the existing directory if one is found; only when none exists does it create `{Slug_Name}_{uid[-8:]}`. One `glob` call, and a rename never splits a client's folder. **This is the recommended implementation** — it makes the ceiling disappear rather than documenting it.
2. Do nothing and accept occasional split folders. Acceptable only if client renames are genuinely rare.

**Migration:** the contact-log bucket's directories are renamed from UUID to slug form at deploy time, paired with the same `SUBSTRING`-style key update as B-2, in the Phase-3 maintenance window.

#### A-3. `client_statements` bucket has no directory (Yes)

`client_statements_subdir` is configured (`app/core/config.py:21`) but the directory does not exist on disk, so `GET /client/documents/statements` lists empty for every client. Under A, each bucket root is `mkdir(parents=True, exist_ok=True)`-ed on first `get_storage()` — the class already does this at `storage.py:56`, so the fix is a consequence of per-bucket instantiation rather than a separate change.

### B. Unified error envelope (Yes)

`app/main.py:57-82` registers one middleware (CORS) and **no exception handlers**. Three consequences, all fixed at the handler layer so that none of the 117 raise sites need editing:

**Refactor:** Add three handlers in `app/main.py`:

```python
@app.exception_handler(HTTPException)          # normalize detail -> str, lift code
@app.exception_handler(RequestValidationError) # flatten list -> str + errors[]
@app.exception_handler(Exception)              # JSON 500, fixed generic message
```

Behaviour against §4.1(c):

| Input | `detail` | `code` | `errors` |
|---|---|---|---|
| `HTTPException(404, "Model not found")` — 116 sites | unchanged string | — | — |
| `HTTPException(409, {"detail": ..., "published": ...})` — `access/service.py:95` | the inner string | `matrix_changed_since_read` | — |
| Pydantic `RequestValidationError` | `"mgmt_fee: value is not a valid float"` | `validation_error` | the raw list |
| Any unhandled `ValueError` / `KeyError` | `"Internal server error."` | — | — |

The string-detail case is byte-for-byte unchanged on the wire, so `client-frontend`'s six existing parsers keep working untouched — the fix reaches them for free on the two shapes they previously mishandled.

#### B-1. `detail=str(exc)` leaks internals at 500 (Yes)

`app/core/security.py:134` and `:163` return raw Firebase exception text to unauthenticated callers.

**Refactor:** Log the exception, return the fixed generic 500 string. Covered by the generic handler once these two sites stop constructing the message themselves.

#### B-2. The one dict `detail` is never read (Recommend)

`app/libs/access/service.py:95` ships `published` alongside the message for conflict recovery; `admin-frontend/lib/admin/AdminStoreContext.tsx:223-226` sees `HTTP_409` and just calls `refreshMatrix()`. It is dead weight on the wire.

**Refactor:** Under B the message moves to `detail` and the slug to `code`. Drop the `published` payload unless Layer 3 chooses to use it; if kept, it belongs in a named field, not inside `detail`.

> **Do not break the working half of this while tidying the dead half.** `admin-frontend/lib/admin/AdminStoreContext.tsx:223-226` branches on `code === "HTTP_409"` — a synthetic code the current api-client fabricates from the status — and calls `refreshMatrix()`. The moment B starts sending a real slug in `code`, that comparison stops matching and **conflict recovery silently stops firing**. The dead payload and the live branch are two halves of the same feature; the frontend's comparison must be widened in the same change set (Layer 3 A-3/A-7). Recorded because a cleanup that quietly disables working error recovery is precisely the failure mode this branch exists to stop producing.

### C. Other backend findings

#### C-1. Fee compare-and-set spans two scales (Yes)

`app/libs/onboarding/service.py:362-365`:

```python
mgmt_override = None if model.mgmt_fee == onboarding.mgmt_fee else onboarding.mgmt_fee
```

compares `2` against `0.02`. They can never be equal, so a non-`NULL` override is written on **every** approval, defeating the `NULL = inherit` design at `app/models/pc.py:220-223`. The same comparison appears at `:503-506` in `submit_allotment`.

**Refactor:** No code change is needed at either site once B-1 (DB) and Layer 3 A-1 put both operands on the fraction scale — the comparison was always correct, its inputs were not. Add a `Decimal` equality guard (compare quantized to 6 dp) so float representation does not reintroduce the same symptom, and one regression test per site asserting `NULL` at the default fee.

#### C-2. Fee schemas carry no unit contract (Yes)

`app/libs/trade_models/schemas.py:72-73, 90-91, 114-115` — the only public write surface for `models.mgmt_fee` — types the fields as bare `float | None` with no docstring and no range.

**Refactor:** Add `Field(ge=0, lt=1)` and the unit in the description. This is the trust boundary that would have caught the original divergence, so it is not simplified away: with it in place, the percent-scale write that started this whole item is rejected at the door.

#### C-3. Status-code drift across equivalent failures (Yes)

| Failure | Today | Per §4.1(c) |
|---|---|---|
| Malformed query param | `400` at `reconciliation/router.py:65`, `422` at `client_portal/router.py:90` | `422` |
| Missing required field | `400` at `core/security.py:128` | `422` |
| Illegal state transition | `422` at `trade_models/router.py:148` and `allocation_matrix/router.py:71`, `409` at `onboarding/service.py:289` | `409` |
| No data for date | `404` at `post_trade_allocation/router.py:46`, empty list at `reconciliation/router.py:52` | `200` + empty collection |
| Unauthenticated | `403` at `auth/deps.py:32,40` and `auth/status.py:14,17,20` | `401` |
| Failed write | `500` at `access/service.py:125,237,266` | `409` |

**Refactor:** Change the status on each listed site. The `401` correction matters beyond tidiness: `admin-frontend/server/api-client.ts:37` only triggers re-auth on `401`, so today those five `403`s dead-end in a generic toast instead of prompting a re-login.

#### C-4. Two endpoints have no `response_model` (Recommend)

`trade_models/router.py:82` (`GET /pc/models/{id}`) and `allocation_matrix/router.py:77` (`GET /pc/allocation`) return JSON undeclared, so they are absent from OpenAPI. The latter is additionally polymorphic — model **or** a bare `Response(304)`.

**Refactor:** Declare `response_model` on both. For the 304 path, declare the model and let FastAPI's `responses={304: {}}` document the conditional branch.

#### C-5. Dead reconciliation *routes* — narrowed (Accepted)

Per the corrected §1.1. This proposal originally said "delete `app/libs/reconciliation/`". **That is narrowed to the routes only** (D-12): `app/libs/eod/` and `app/libs/post_trade_allocation/` import the package's internals, so deleting it breaks three live EoD routes and the PTA run path at import time.

**Scoped by one rule: delete a route iff no frontend consumer calls it. Keep every module.** The auto-reconciliation feature — including its end-of-day report — is deprecated; `GET /api/mobo/trade-records` is its **replacement**, newly built for the rework to grow from, and is explicitly out of this unit's reach.

A consumer scan over `admin-frontend/{server,hooks,lib,app}` (excluding `tests/`) gives:

| Route | Frontend consumer | Verdict |
|---|---|---|
| `GET /api/mobo/reconciliation` | none — the 012 FE units that would have consumed it never landed | **delete** |
| `GET /api/eod` | none — `server/endpoints.ts` has no `EOD` entry at all | **delete** |
| `POST /api/eod/sign-off` | none | **delete** |
| `GET /api/eod/export` | none | **delete** |
| `GET /api/mobo/trade-records` | `hooks/api/useTradeRecords` → `server/mobo/index.ts:12` → `ENDPOINTS.MOBO.TRADE_RECORDS`, rendering `app/(roles)/mobo/trade-reconciliation/page.tsx`, nav-visible at `lib/pages-config.ts:130-136` | **KEEP — do not touch** |

Every `EOD`-named symbol in admin (`lib/mobo/types.ts:408`, `lib/mock/mobo-data.ts:521`, `lib/mobo/reconciliation.ts:55`) is a local type or mock fixture, not a call to the backend.

**Refactor — delete exactly this:**

| Delete | Note |
|---|---|
| `get_reconciliation` handler, `reconciliation/router.py:38-51` | Leaves `get_trade_records` as the file's only route |
| `_resolve_session`, `router.py:22-36` | Verified: its sole caller is `get_reconciliation:44`; `get_trade_records` calls only `build_view(db, date)` |
| `app/libs/eod/router.py` — the whole file (3 routes) | All three unconsumed |
| The eod import + `include_router` at `app/main.py:21,76` | |

**Retained in full — this unit deletes no logic.** `app/libs/reconciliation/` below `router.py` (engine, presenter, adapters, dtos, formatting, `algotrade/synth.py`, `records.py`), **all of `app/libs/eod/` except `router.py`** (service, repository, presenter, the `pdf` package), `app/models/recon.py`, the `eod_records` table, `recon_notional_epsilon`, and `reconciliation/router.py` itself with its surviving `/trade-records` handler.

`RECON_VIEW` stays and remains **load-bearing**: it gates the surviving `/trade-records` (`reconciliation/router.py:55`) and three pages in `app/libs/access/pages.py:129-131`.

Net route change: **94 → 90.** No module is orphaned; verify with an import scan before committing, not after.

#### C-6. Missing entitlement check on client material download (Yes)

`app/libs/client_portal/router.py:104-115` → `service.py:257-263`: gated only by `get_current_client_user`. Any authenticated client can fetch any model's marketing material by id, subscribed or not.

**Refactor:** Check for a `ClientSubscription` on `(user.id, model_id)` before serving; `404` if absent. Security boundary — not simplified away.

### D. Route / contract simplification

> **Decision (settled):** C-5 is accepted **as scoped by D-12** — the four unconsumed routes (`GET /api/mobo/reconciliation`, `GET /api/eod`, `POST /api/eod/sign-off`, `GET /api/eod/export`) are removed. `GET /api/mobo/trade-records` is retained untouched as the rework's foundation, along with every module in both packages. No other route is added or removed by this branch.
>
> Net: **94 → 90 routes.** Every surviving route keeps its path, method and success shape byte-for-byte; only error bodies and the status codes listed in C-3 change.

### E. Summary of Backend-layer changes

| # | Change | Required? | Effort |
|---|---|---|---|
| A | Move `storage.py` to `app/core/`, add `Bucket`, per-bucket roots, path containment | Yes — user req. | M |
| A-1 | EoD reports get their own bucket root | Yes | XS |
| A-2 | Slug-form per-client folder in both buckets, resolved by uid suffix | Accepted | S |
| A-3 | Statements bucket root auto-created | Yes | XS |
| B | Three exception handlers; one error envelope | Yes | S |
| B-1 | Stop returning `str(exc)` at 500 | Yes | XS |
| B-2 | Move `access` conflict payload out of `detail` | Recommend | XS |
| C-1 | `Decimal` equality guard + regression tests on compare-and-set | Yes | S |
| C-2 | `Field(ge=0, lt=1)` + unit docstring on fee schemas | Yes | XS |
| C-3 | Status-code corrections at 13 sites | Yes | S |
| C-4 | Declare `response_model` on two endpoints | Recommend | XS |
| C-5 | Delete the 4 unconsumed routes (`/reconciliation` + 3 EoD); keep every module, and `/trade-records` untouched (D-12) | Accepted | XS |
| C-6 | Entitlement check on client material download | Yes | XS |

---

## Layer 3 — Frontend

| File | LOC | Role |
|---|---|---|
| `admin-frontend/lib/icons.ts` | 162 | Barrel re-exporting ~145 lucide icons; imported by 62 files |
| `admin-frontend/server/api-client.ts` | ~110 | Shared fetch wrapper; builds every `APIResult` error |
| `client-frontend/components/ui/skeleton.tsx` | 8 | The skeleton primitive to be ported |
| `client-frontend/app/(dashboard)/**/loading.tsx` | 578 total, 8 files | The loading pattern to be replicated |
| `admin-frontend/components/pc/model-management/CreateModelForm.tsx` | 471 | Percent-scale `parseFeePercent` — the fee root divergence |
| `admin-frontend/lib/onboarding/fee.ts` | ~14 | Fraction-scale `parseFeePercent` — same name, opposite semantics |

### A. Findings

#### A-1. Two functions named `parseFeePercent` with opposite semantics (Yes)

`admin-frontend/lib/onboarding/fee.ts:8-14` returns `n / 100`. `admin-frontend/components/pc/model-management/CreateModelForm.tsx:215-220` returns `Number(trimmed)` with no division, and its docstring at `:209-214` *codifies* the percent convention as deliberate. Importing the wrong one is a silent 100× error with no type-level warning, since both are `(string) => number`.

**Refactor:** Delete the `CreateModelForm` copy. Keep the `fee.ts` definition, move it to `admin-frontend/lib/fee.ts` (it is no longer onboarding-specific), and import it at both call sites. Add its inverse, `formatFeePercent(fraction)`, in the same file — `admin-frontend/lib/rm/subscriptions.ts:38-40` already has one, so this is a move, not a new function.

#### A-2. Display sites assume percent scale (Yes)

Once A-1 and DB B-1 land, four sites read a fraction while formatting for percent:

| Site | Today | After |
|---|---|---|
| `components/pc/model-management/OverviewTab.tsx:26-27` | `` `${m.mgmt_fee.toFixed(2)}%` `` | `formatFeePercent(m.mgmt_fee)` |
| `lib/pc/format.ts:50,52` | `m.mgmt / 100` | `m.mgmt` (already a fraction) |
| `lib/pc/models.ts:21-22,69-70` | `DEFAULT_MGMT_PCT = 2` | `0.02` / `0.2` |
| `components/rm/SubscriptionFormModal.tsx:154-155` | `parseFloat("1.0%")` → `1.0` | `parseFeePercent(mgmtFee)` → `0.01` |

**This is the trap in the fee fix:** these four are correct *only because* of A-1's bug. Fixing the parse alone breaks all four by 100×, so A-1 and A-2 must land in the same commit. `lib/pc/models.ts:81-82`, `lib/pc/types.ts:96-97` and `components/rm/SubscriptionAccordion.tsx:193-194` are read-through and need no change once the sources are right.

`client-frontend` has **zero** fee references and is untouched by this item.

#### A-3. admin-frontend renders raw JSON as the error message (Yes)

`admin-frontend/server/api-client.ts:38-42`, `:64-68`, `:99-103` build the error with `msg = (await res.text()).slice(0, 200)` — the body is never parsed. So a 409 from `access/service.py:216` reaches the user as the literal string `{"detail":"An override already exists for this user and page"}` at ~29 sites (`lib/admin/AdminStoreContext.tsx:184,195,…` and ~19 `setError(r.error)` calls across `hooks/api/*`).

**Refactor:** Parse the §4.1(c) envelope in the three sites, falling back to `res.statusText` when the body is not JSON. `client-frontend/lib/auth-api.ts:9-30` is the working model. Three more conventions exist inside admin and collapse into this one: `server/pc/index.ts:117-122` (parses, but only in `downloadMaterial`), `lib/auth-api.ts:9-29` (login only), and `server/onboarding/index.ts:71,89,109,146` (never reads the body at all — discards e.g. "No file uploaded for this document").

#### A-4. Six duplicated error-unwrap helpers in client-frontend (Recommend)

The same 8-line string-only unwrap is copy-pasted across `lib/api/{onboarding,documents,kyc×2,portfolio,tickets}.ts`, all diverged from the one correct copy at `lib/auth-api.ts:9-30` (the only one handling the 422 array).

**Refactor:** Export `parseApiError` from `lib/auth-api.ts` and have the six import it. Backend B makes the array case moot, but the duplication is what let them diverge in the first place.

#### A-5. No `optimizePackageImports`; icon barrel × 62 importers (Yes — user req.)

`admin-frontend/lib/icons.ts` re-exports ~145 icons from `lucide-react` and is imported by 62 files; `client-frontend/lib/icons.ts` is ~60 icons × 19 files. Neither `next.config.mjs` sets `experimental.optimizePackageImports` or `modularizeImports`, so in Next 14's webpack dev build every importer pulls the whole barrel's module graph. The 62 × 145 product is the single clearest explanation for admin compiling markedly slower than client.

**Refactor:**
```js
// next.config.mjs, both apps
experimental: { optimizePackageImports: ["lucide-react"] }
```
plus `next dev --turbo` in both `package.json` dev scripts. Two lines and a flag, applied before anything structural — the structural items below are only worth their diff if this does not close the gap.

**Measure first, then decide.** Record a cold-start and a warm-recompile timing for the admin dashboard route before the change and after. The remaining candidates are ordered by cost, to be taken only as far as the measurement justifies:

| # | Candidate | Cost |
|---|---|---|
| i | Remove the unused `"lucide": "^1.3.0"` dep from `client-frontend/package.json:17` (zero imports repo-wide) | XS |
| ii | Set `"target": "ES2017"` in `admin-frontend/tsconfig.json` (absent → defaults to ES5, more downlevel work than client) | XS |
| iii | ~~Move `lib/mock/*-data.ts` out of the build graph~~ — **resolved directly, not as a build-speed candidate.** `mobo-data.ts` is deleted by C-0/FE-10; `rm-data.ts` is deleted outright by C-0c. Only `eom-reports.ts` remains in `lib/mock/`, and it is small enough that moving it is not worth a separate effort. | — |
| iv | `next/dynamic` around recharts (`StackedBarChart.tsx`, `portfolio/page.tsx`) — zero dynamic imports exist in either app today | S |
| v | Reduce `"use client"` sprawl — 112/182 admin files, including all 20 `page.tsx` | L |

(v) is the largest and least certain; it is listed for completeness and should not be attempted on this branch without a measurement that implicates it.

#### A-6. admin-frontend has no loading states (Yes — user req.)

Zero `loading.tsx` files across the whole `admin-frontend/app` tree, no skeleton primitive, no `animate-pulse` anywhere. 18 of 20 pages show nothing during navigation; the two exceptions are an inline spinner at `mobo/trade-reconciliation/page.tsx:201` and a conditional at `rm/client-info/page.tsx:353`. The four `Suspense` boundaries are all `fallback={null}` wrapping `useSearchParams` — a Next requirement, not loading UX.

`client-frontend` already has the pattern, applied consistently across 8 files: server component named `<Route>Loading`, single `Skeleton` import, outer wrapper mirroring the real page's wrapper exactly, matching grid column counts, real chrome (borders, `bg-surface-lowest`, `rounded-lg`) rendered for real with only text/data slots skeletonized.

**Refactor (settled — D-11): skeleton from navigation until data is on screen, in admin.** Three parts:

1. Copy `client-frontend/components/ui/skeleton.tsx` verbatim to `admin-frontend/components/ui/skeleton.tsx` — its `bg-surface-highest` token already exists at `admin-frontend/tailwind.config.ts:35`.
2. For each admin route, write **one** skeleton component — `app/(roles)/<role>/<route>/Skeleton.tsx` — mirroring that page's grid structure, per the client-frontend rules above.
3. Render it from **both** ends of the gap: the route's `loading.tsx` returns `<RouteSkeleton />`, and the page component returns the same `<RouteSkeleton />` while its hook's `loading` flag is true.

`loading.tsx` alone would cover only the RSC-payload/chunk fetch and unmount the moment the client component mounts — *before* the hook's data arrives — which is the gap users actually perceive. Rendering the same component at both ends closes it with no visual seam, because it is literally the same markup on both sides of the mount.

**Why one component, not two copies.** The naive version writes the skeleton markup twice per route — once in `loading.tsx`, once inline in the page. Extracting it means each route has one skeleton definition, `loading.tsx` is a two-line file, and the two ends can never drift apart. `rm/client-info/page.tsx:353` is the only place the hook-flag half currently exists and should be folded into this pattern rather than left as a one-off.

**Scope note.** This is admin-only. `client-frontend` keeps its current `loading.tsx`-only behaviour and is not retrofitted — it is otherwise barely touched by this branch, and expanding into it would widen the regression surface for no requested benefit. The two portals will therefore differ: admin's loading coverage becomes strictly better than client's. Recorded deliberately (D-11) so a future reader does not mistake it for drift.

### B. Adapting to changes in other layers

| Upstream change | Frontend change | Files touched |
|---|---|---|
| DB B-1 + Backend C-2 (fees are fractions) | A-1, A-2 | `lib/fee.ts`, `CreateModelForm.tsx`, `EditModelForm.tsx`, `OverviewTab.tsx`, `lib/pc/{format,models}.ts`, `SubscriptionFormModal.tsx` |
| Backend B (error envelope) | A-3, A-4 | `admin-frontend/server/api-client.ts`, `server/onboarding/index.ts`, `server/pc/index.ts`; `client-frontend/lib/api/*.ts` |
| Backend C-3 (401 for unauthenticated) | Verify `api-client.ts:37`'s re-auth branch now fires on the five previously-403 paths | `admin-frontend/server/api-client.ts` |
| Backend C-5 (recon deleted) | Delete `hooks/api/useReconciliationFlow`, `app/(roles)/mobo/trade-reconciliation/actions.ts`, and the stale tests importing them | `admin-frontend/app/(roles)/mobo/trade-reconciliation/**` |

### C. Additional findings

#### C-0. The deprecated auto-reconciliation mock still ships in the admin bundle (Yes — user req.)

`admin-frontend/lib/mock/mobo-data.ts` is marked in its own header "THROWAWAY MOCK — delete on API integration," and it has exactly one consumer: `admin-frontend/lib/mobo/reconciliation.ts`, whose sole export `loadReconciliation()` exists only to wrap that mock. `loadReconciliation()` in turn has exactly one consumer: `app/(roles)/mobo/recon-overview/page.tsx` (the MOBO dashboard) — which stays: it is nav-reachable via `ROLE_DEFAULT_PAGE.MOBO` (`lib/pages-config.ts:200`, the MOBO role's post-login redirect target), and neither the page nor its route is being removed.

`reconciliation.ts`'s own header comment specs exactly this swap in advance, verbatim: *"When the backend API arrives, only the body of `loadReconciliation` changes (fetch → deserialize into `Order` / `Execution` → `mapOrdersToReconTrade`)... PURGE TEST (acceptance): deleting `lib/mock` and pointing the provider at a real API must require ZERO edits here or in any component — only the body of `loadReconciliation`."* The API to point at is already live: `GET /api/mobo/trade-records`, the same endpoint `trade-reconciliation/page.tsx` uses via `useTradeRecords`.

**The shape gap, and why it degrades honestly rather than needing a redesign.** `TradeRecordRowDTO` (the wire shape of `/trade-records`) is flat and single-source — its own comment: *"There is no reconciliation behind these rows: `sys` is always 'CRM' and `status` always 'Confirmed' until a second source is wired."* `ReconView`/`ReconTrade` (what `loadReconciliation()` returns today) is a richer per-field-break domain model. Mapping one to the other is not lossy in a way that hides anything: with only one source, every trade is genuinely clean, so a mapper that emits `matched=100%, breaks=0, unmatched=0` for every row is reporting the real data state, the same state `trade-reconciliation/page.tsx` already reports today (*"every break counter is 0 and the verdict is always clean"*). `exceptions: []` and `feeds: []` render honestly empty — nothing today has ever populated them beyond the mock.

**Refactor:**
1. Write a mapper `mapTradeRecordToReconTrade(row: TradeRecordRowDTO): ReconTrade` in `lib/mobo/reconciliation.ts`, alongside the existing `mapOrdersToReconTrade` — degenerate by construction (system `CRM`, every compare field clean) because that is what the data actually is.
2. Convert `loadReconciliation()` from a synchronous function into a hook, `useReconciliation()`, that calls the existing `useTradeRecords()` internally, maps its `TradeRecordRowDTO[]` through the new mapper, and derives `counters`/`eod.byType` via the existing `deriveCounters`/`deriveEodByType` — unchanged, since they only consume `ReconTrade[]`.
3. Update `recon-overview/page.tsx` to call `useReconciliation()` instead of `loadReconciliation()`, and render a loading state while it resolves — a state the page does not have today, because the mock made every read synchronous.
4. Delete `lib/mock/mobo-data.ts`. Nothing imports it after step 2.

`BreakType`, `CompareField`, `ReconTrade`, `ReconView` and the rest of `lib/mobo/types.ts` are **shared** with the live `trade-reconciliation` page and `components/mobo/Shared.tsx` — none of them are removed; `ReconView` keeps being the bundle shape, now populated from a real source.

`tests/lib/mobo/FE-4.reconciliation-mapper.test.ts` tests `reconciliation.ts`'s existing mapper and needs new cases for `mapTradeRecordToReconTrade`, not deletion.

**`lib/mock/rm-data.ts` and `lib/mock/eom-reports.ts` are explicitly NOT touched by this finding.** Both are live data sources for shipped RM and monthly-reports pages — `rm-data.ts` alone is imported by 12 files for real types (`SubClient`, `SubModel`, `TxnRow`, `RequestTicket`, `ClientDoc`, `HistoryEntry`, `SummaryItem`, `CountItem`) and runtime constants (`OB_MODEL_CATALOG`, `MODEL_SIZES`). Neither carries a "delete on integration" marker, and deleting either would break live pages. "Purge the mock module" in this proposal means the one file that is genuinely dead as data, not the directory, and not the page it feeds.

#### C-0b. `lib/mock/rm-data.ts` mixes dead code, real types, and genuine mock content in one file (Yes — user req.)

Following C-0's audit further: `lib/mock/rm-data.ts` is not one thing. A consumer trace of every export — checked for internal use within the file as well as external imports, since an earlier pass in this same audit almost misclassified `RM_CLIENTS`/`CLIENT_EXTRA` as dead before finding they feed the still-live `getMockOverlay()` — separates into three categories:

**Dead — zero consumers, internal or external:**

| Export | Only used by |
|---|---|
| `getClientDetail()` | nothing calls it |
| `ClientDetail` (type) | only `getClientDetail`'s own return shape |
| `ClientPreferences` (type), `EMPTY_PREFERENCES` | only `getClientDetail`'s body |
| `clientContactLog()` | only called from `getClientDetail` |
| `ContactLogEntry` (type — the mock one, distinct from the real `ContactLogEntryDTO` in `lib/onboarding/types.ts`) | only `clientContactLog`/`getClientDetail` |
| `KNOWN_CLIENT_IDS` | nothing |
| `SUB_CLIENTS` | nothing |

`getMockOverlay()`'s own `OVERLAY_ROTATION` mapping (`rm-data.ts:527-543`) touches only `status/tone/mandate/aum/renewal/kyc/kycTone/since/models/cashValue/portfolioValue/contact/title` off `RM_CLIENTS`/`CLIENT_EXTRA` — never `.preferences` — confirming the whole `getClientDetail` cluster is an orphaned branch, not a live dependency.

**Types only — already backend-driven, `lib/mock` is just their historical address:**

| Type | External consumers |
|---|---|
| `SubClient`, `SubModel`, `TxnRow` | `lib/rm/subscriptions.ts`, `components/rm/SubscriptionAccordion.tsx`, `SubscriptionFormModal.tsx`, `hooks/api/useSubscriptions.ts`, `app/(roles)/rm/model-subscription/page.tsx`, `app/(roles)/rm/client-info/page.tsx` |
| `SummaryItem`, `CountItem` | `components/rm/SummaryCard.tsx` |
| `ClientDoc`, `HistoryEntry` | `app/(roles)/rm/client-info/[id]/page.tsx` — **and** internally, `clientDocs()`/`clientHistory()`, which `getMockOverlay()` still calls |
| `RequestTicket` | already migrated — `rm-data.ts:500` is a bare re-export of `lib/rm/tickets.ts`'s real definition; exactly one straggling import, `hooks/api/useRmTickets.ts:6`, still points at the old address |

`RequestTicket`'s move (recorded in `lib/rm/tickets.ts:3-4`'s own comment, "ADM-5") is the precedent this finding follows: define the real type at its natural home, leave nothing behind.

**Still genuinely mock, still rendered on a live page — out of scope for this finding, tracked for a future decision:** `RENEWALS_DUE`, `getMockOverlay()` (and its `RM_CLIENTS`/`CLIENT_EXTRA` inputs), `MODEL_SIZES`/`MODEL_SIZE_LIST`, `OB_MODEL_CATALOG` — all rendered today with no backend behind them. `lib/mock/eom-reports.ts`'s `MOCK_EOM_REPORTS` is the same class: the report *list* has no backend, though `server/eom-comments/` + `useEomComments` already provide a real comment thread layered on top of it. **`lib/mock/rm-data.ts` and `lib/mock/eom-reports.ts` are not deleted by this finding — they keep existing, holding only what genuinely has no other home yet.**

**Refactor:**
1. Delete the whole dead cluster: `getClientDetail`, `ClientDetail`, `ClientPreferences`, `EMPTY_PREFERENCES`, `clientContactLog`, the mock `ContactLogEntry` type, `KNOWN_CLIENT_IDS`, `SUB_CLIENTS`.
2. Move `SubClient`/`SubModel`/`TxnRow` into `lib/rm/subscriptions.ts` — its own header comment already says it "reuses the EXISTING ... types from `lib/mock/rm-data.ts` verbatim"; after this move it defines them instead, matching how `lib/rm/tickets.ts` defines `RequestTicket`.
3. Move `SummaryItem`/`CountItem`/`ClientDoc`/`HistoryEntry` into a new `lib/rm/types.ts` — none has one obvious single mapper file the way the `Sub*` types have `subscriptions.ts`, so they get one shared, properly-named home. `rm-data.ts` imports them back for `clientDocs()`/`clientHistory()`'s internal use.
4. Delete the `RequestTicket` re-export at `rm-data.ts:500`; repoint `hooks/api/useRmTickets.ts:6` to `@/lib/rm/tickets` directly.
5. Update the 8 external import sites listed above to their new paths.

#### C-0c. The remaining "still-mock" content in `rm-data.ts` resolves to real data or honest placeholders — the whole file becomes deletable (Yes — user req.)

C-0b left four exports as "genuinely still mock, no backend, out of scope": `RENEWALS_DUE`, `getMockOverlay()`, `MODEL_SIZES`/`MODEL_SIZE_LIST`, `OB_MODEL_CATALOG`. Tracing each further:

**Model catalog — a real backend already exists.** `hooks/api/useModels.ts` / `lib/pc/types.ts`'s `Model` interface already carries `size`, `mgmt_fee`, `incentive_fee` — exactly what `MODEL_SIZES` and `OB_MODEL_CATALOG` fake. Both call sites already carry a comment anticipating this: `model-subscription/page.tsx:79-80`, *"swap for a real models-list hook when that endpoint lands"* — it has. `SubscriptionFormModal.tsx:97-99` additionally admits a live bug: its `MODEL_SIZES[model]` lookup is by **name**, and the comment says outright *"the new-subscription mock catalog... names don't cover live model names."* The fix is small: `availableModels` (already a prop on the modal, already keyed by real `id`, already used for `mgmtFee`/`incentiveFee` at `SubscriptionFormModal.tsx:125-126`) gains a `size` field, and the buggy name-keyed lookup becomes an `id`-keyed one against data already in scope.

**`getMockOverlay()` computes 15 fields; its one call site (`client-info/page.tsx:405`) reads 3.** Verified by grep for every `overlay.` access on that page — only `.tone`, `.status`, `.renewal` are ever read. `mandate`, `aum`, `kyc`, `kycTone`, `since`, `contact`, `title`, `models`, `cashValue`, `portfolioValue`, `docs`, `history` are computed and discarded. (`docs`/`history` are a red herring in the type sense too — the *real* KYC-document and activity data are already wired on `client-info/[id]/page.tsx` via `docFromDto()`; `getMockOverlay`'s versions of those two fields are pure duplication of a feature that already works for real, elsewhere.)

Of the 3 fields actually read:
- `status`/`tone` — already correctly resolved from real onboarding data when it exists: `client-info/page.tsx:407-409` overrides both from `ob.status` via `COLUMN_LABELS`/`ONBOARDING_TONE`. The mock only supplies a fallback for the (rare/never) case with no onboarding record.
- `renewal` — no backend field exists anywhere for a subscription renewal date. Nothing to resolve to.

**Resolution:** `status`/`tone` fall back to an honest placeholder (`"—"` / `"neutral"`) instead of a fabricated rotating value when no onboarding record exists; `renewal` is always `"—"`. Once those three are honest rather than fabricated, `RM_CLIENTS`, `CLIENT_EXTRA`, `OVERLAY_ROTATION`, `hashString()`, `EMPTY_OVERLAY`, `clientDocs()`, `clientHistory()`, `ClientModel`, `MockOverlay`/`OverlayCore`, and `getMockOverlay()` itself all become dead — nothing else reads any of them. `RENEWALS_DUE` (`SummaryItem[]` derived from `RM_CLIENTS`) collapses to a literal `[]` at its one use site (`client-info/page.tsx:461-464` — the KPI tile shows `0`/`"0 overdue"` and an empty drill-down list, the same honest-empty pattern already established by `loadSettlement()` on the trade-reconciliation page).

**Net effect: `lib/mock/rm-data.ts` has nothing left in it after C-0b + this finding, and is deleted outright** — not trimmed, not left as an empty shell. `lib/mock/eom-reports.ts` is untouched; it is a separate, smaller case (only its report-list data is mock; the comment thread built on top is real) and is not part of this finding.

**Refactor:**
1. `model-subscription/page.tsx`: replace `OB_MODEL_CATALOG.map(...)` with real `useModels()` data mapped to `{id, name, mgmtFee, incentiveFee, size}`.
2. `SubscriptionFormModal.tsx`: widen the `availableModels` prop type to include `size`; replace `MODEL_SIZES[model]` with `availableModels.find(m => m.id === modelId)?.size ?? 0`.
3. `client-info/page.tsx`: delete the `getMockOverlay(r.id)` call; replace with an inline fallback object `{ status: "—", tone: "neutral" as ChipTone, renewal: "—" }`, still overridden by `ob.status`/`ob.tone` when an onboarding record exists (unchanged logic, just a different fallback source). Replace the `RENEWALS_DUE` import with a local `const renewalsDue: SummaryItem[] = []`.
4. Delete `lib/mock/rm-data.ts` in full.
5. Update the `.gitignore`/build-graph note in Layer 3 A-5 (iii) accordingly — `lib/mock/*-data.ts` is no longer a compile-graph concern once both files it names are gone.

#### C-1. `admin-frontend/tests/` is gitignored (Yes)

`admin-frontend/.gitignore:11` ignores `tests/`. All 80 files / 488 tests are untracked, so no commit has ever been gated on them — which is why that suite holds the worst drift of the three (117 failures).

**Refactor:** Remove line 11, commit the suite. This is the root cause of Layer 4's admin cluster, and fixing the tests without fixing this just restarts the clock.

#### C-2. Two download helpers in admin (Recommend)

`lib/download.ts` (`saveBase64File`) and `lib/downloadFile.ts` (`downloadAs`) coexist; `app/(shared)/monthly-reports/page.tsx:6` uses the latter, everything else the former.

**Refactor:** Keep `saveBase64File` for the server-action-proxied downloads, delete `downloadFile.ts`, point `monthly-reports` at the shared one. Note for a future branch, not this one: admin round-trips every file through a Node server action as base64 (~33% inflation, full buffering — the zip-all path is the worst case) while the client portal streams directly. Unifying on streaming is a separate proposal.

### D. Summary of Frontend-layer changes

| # | Change | Required? | Effort |
|---|---|---|---|
| A-1 | One `parseFeePercent`, in `lib/fee.ts` | Yes | XS |
| A-2 | Four display/input sites onto the fraction scale — same commit as A-1 | Yes | S |
| A-3 | Parse the error envelope in `api-client.ts` (3 sites) | Yes | S |
| A-4 | De-duplicate client-frontend's six unwrap helpers | Recommend | XS |
| A-5 | `optimizePackageImports` + `--turbo`; measure; then (i)–(iv) as justified | Yes — user req. | S–M |
| A-6 | Port `skeleton.tsx`; one `Skeleton.tsx` per admin route, rendered from both `loading.tsx` and the page's `loading` flag | Yes — user req. | L |
| C-0 | Rewire the MOBO dashboard onto `/trade-records` via a new degenerate mapper + a `useReconciliation()` hook; delete the mock file | Yes — user req. | M |
| C-0b | Delete `lib/mock/rm-data.ts`'s dead `getClientDetail` cluster; relocate its still-real types to `lib/rm/{subscriptions,types}.ts` | Yes — user req. | S |
| C-0c | Wire model catalog to real `useModels()` (fixing a live name-lookup bug); resolve `getMockOverlay`'s 3 live fields to honest placeholders; delete `lib/mock/rm-data.ts` entirely | Yes — user req. | M |
| C-1 | Un-gitignore `admin-frontend/tests/` | Yes | XS |
| C-2 | Single download helper | Recommend | XS |

---

## Layer 4 — Test baseline

<!-- Not a code layer, but it has its own findings, its own gate, and it is the
     thing that proves the other three landed. Treated as a layer for scheduling. -->

### A. Current baseline (measured 2026-08-03, `main`, clean)

| Suite | Passed | Failed | Errors |
|---|---|---|---|
| api-backend | 1249 | 255 | 12 (6 collection + 6 setup) |
| client-frontend | 65 | 5 | 2 unhandled |
| admin-frontend | 371 | 117 | 0 |

`pytest -q` **aborts at collection**; the suite is unrunnable without `--continue-on-collection-errors`. **Zero environment failures** — MySQL, alembic and both jsdom runners are all reachable. Every failure is drift or a genuine defect.

### B. Findings

#### B-1. Six collection errors block the entire backend suite (Yes)

| Test | Cause |
|---|---|
| `tests/libs/auth/test_be4_pta_actions.py:25`, `onboarding/test_be4_actions.py:16`, `eod/test_be6_pta_hook_and_action.py:19`, `reconciliation/test_be1_action.py:15` | `ROLE_ACTIONS` / `get_actions_for_role` deleted by `ab1823a` (BE-5 moved authorization to the DB resolver) |
| `client_portal/test_be12_tickets.py:123` | `TicketStatus.CLOSED` → `RESOLVED` (migration `0027`) |
| `dev/test_be23_dev_register_service.py:18` | `app.libs.dev.service` deleted |

**Refactor:** Delete the four `ROLE_ACTIONS` tests (they test a deleted mechanism; the DB resolver has its own coverage) and the two `dev` tests. Update the ticket-status test to the current enum. `reconciliation/test_be1_action.py` is deleted with Backend C-5 regardless.

#### B-2. 255 backend failures, five drift clusters (Yes)

| n | Cluster | Fix |
|---|---|---|
| 138 | `DetachedInstanceError` lazy-loading `admin_profile` — auth-override fixtures build a **detached** `User` (e.g. `tests/libs/reconciliation/conftest.py:66`), fine when authorization was a role→constant lookup, broken now that `app/libs/access/resolver.py:72` touches the relationship | Attach or eager-load the user in the shared fixture. **One fixture fix, ~138 tests.** Do this first. |
| 126 | `FakeIdentityService` doubles lack `generate_set_password_link` (added at `app/libs/identity/service.py:66`) — `tests/cli/conftest.py:56`, `tests/libs/clients/conftest.py:32`, `tests/libs/staff/conftest.py:47` | Add the method to all three. Better: one shared double. |
| 13 + 6 | `0026` downgrade FK-ordering defect | **Real bug, fixed in-branch** by DB B-5 (Phase 0). These 19 go green as a side effect, with no test edited. |
| 9 | `StaffService.enroll()` grew 7 kwargs (`app/libs/staff/service.py:108-122`) | Update the four call sites |
| ~20 | Renames: `dev_mode`→`app_env`, `WeasyPrintRenderer` moved into the `pdf` package, `generate_invite_link`→`generate_set_password_link`, `not_started`→`pending`, alembic head pin, removed default-password behaviour | Mechanical; one per rename |
| 1 | PTA allocation `150` vs `50` (`test_be3_service_run.py:365`) | **Real bug, out of scope** (D-7). Left failing and explicitly not skipped — a silenced test is how this baseline formed. |

The first two clusters are 264 of 255 failures + setup errors between them and are each a **single shared-fixture edit**. The long tail is genuinely one-by-one.

#### B-3. client-frontend: 5 failures, all the FE-16 purge (Yes)

Commit `3c562d9` removed `postBackendRegister` and `signUpWithEmailPassword`; three test files still import them. One of the three is the *new* `FE-16.auth-surface.test.tsx:96`, which asserts the export is `undefined` but uses a non-partial `vi.mock` factory that throws on unknown-property access instead of returning `undefined` — a test bug in a test written to verify the purge.

**Refactor:** Delete the two stale files. Rewrite the FE-16 negative assertion using `importOriginal` or a source-text check.

#### B-4. admin-frontend: 117 failures (Yes)

| n | Cluster | Fix |
|---|---|---|
| 23 | `useAuth must be used within AuthProvider` — components gained a `useCanEdit` permission gate; tests render bare | Wrap in a test `AuthProvider`, or mock `usePageAccess` — one shared helper |
| 17 | `next/navigation` mock missing `useSearchParams`, now called by `OnboardingBoard.tsx:4` | Extend the shared navigation mock |
| 15 | Exhaustive `vi.mock` factories missing newly-added hook exports (`useContactLogs`, `usePostTradeAllocationHistory`) | Add the exports; prefer partial mocks with `importOriginal` so this stops recurring |
| 18 | **Spec-ahead tests** — generated from 012/015 impl docs for code that never landed on `main` (`getEod`, `getReconciliation`, `getFlow`, `lib/mobo/flow-types.ts`) | Delete. The 012/015 FE units are not on `main` and reconciliation is being deleted outright. |
| 3 | `ptaMoney` formatting — `'$6.800M'` vs `'$6.80M'`, `'$250.000k'` vs `'$250k'` after `4825f10` changed it to `toFixed(3)` | **Look before updating the assertion** — `$250.000k` reads like an unintended side effect of that commit, not an intended format |
| ~38 | UI copy / DOM / module-boundary drift across `FE-11`–`FE-15`, `ADM-5`, role-guard nav | Mechanical, one by one |
| 3 | `FE-7.index.test.ts:197`, `FE-10.publish.test.tsx:81`, `FE-9.store.test.tsx:109` | **Diagnose each before touching its assertion** — see B-5 |

#### B-5. Three failures of unknown class must be diagnosed, not re-asserted (Yes)

Settled per D-8: all three get a real diagnosis on this branch before any assertion moves. Blind-updating assertions is the mechanism that produced the current 377-failure baseline, and two of these three sit on paths this branch is actively changing.

| Test | Hypothesis | What "diagnosed" means |
|---|---|---|
| `FE-7.index.test.ts:197` — error not funneled to `{success:false}` | **Most likely a real bug** — a swallowed error path in `app/(roles)/admin/actions.ts` | Trace the throw. If the error is genuinely swallowed, it is a product fix, and it must land **before** Phase 4 — the error-envelope work would otherwise paper over it by making the swallowed case look well-formed. |
| `FE-10.publish.test.tsx:81` — 3 staged cells produce 2 changes | Plausibly correct behaviour: a stage equal to the published value is dropped as a no-op, with a fixture that doesn't reflect that | Confirm the no-op-drop is intended. If yes, fix the fixture and add a comment naming the rule; if no, it is a product fix. |
| `FE-9.store.test.tsx:109` — staged `VIEW` doesn't beat published `EDIT` | Likely a test bug: `eff` is called on a context object captured before `act`, i.e. a stale closure | Re-read through a fresh render. If it passes, the test is rewritten; if it still fails, precedence logic is wrong and it is a product fix. |

**Refactor:** One of {product fix, fixture fix, test rewrite} per row, chosen from the diagnosis rather than assumed. Whichever way each lands, record the verdict in the impl doc — the next person to see these should not have to re-derive it.

### C. Summary of Layer-4 changes

| # | Change | Required? | Effort |
|---|---|---|---|
| B-1 | Clear the six collection errors | Yes | S |
| B-2 | Two shared-fixture fixes (≈264 tests) + long tail | Yes | M |
| B-3 | Delete two stale client-frontend files; fix the FE-16 mock | Yes | XS |
| B-4 | Four shared-mock fixes + delete 18 spec-ahead tests + tail | Yes | M |
| B-5 | Diagnose the three unknown-class failures; fix per verdict | Yes | S |

---

## Design decisions (settled)

- **D-1 — Fraction is the canonical fee unit.** It is what `docs/proposals/007:84-85` specifies, what the 013 onboarding seam froze, and what `Numeric(9,6)` was sized for. Percent-scale would require reversing the 013 seam, the onboarding path, the RM subscription path and four documents; fraction requires six frontend edits and one migration. Fraction is both correct and the smaller diff.

- **D-2 — The surrogate PK on `allocation_model_snapshots` is withdrawn, not deferred.** 012 deferred it to serve `recon_sessions`. With reconciliation dead (§1.1), the composite PK `(period_id, user_id, model_id)` has no awkward consumer and is a sound natural key. Closing the item is a smaller and more honest outcome than executing it.

- **D-3 — One storage root per document group, not one root with subdirectories.** Requested by the user; the technical case is that per-group roots are independently mountable — the KYC bucket can sit on an encrypted share with tighter permissions, reports on bulk storage, marketing on something web-servable — and each can move to NAS on its own schedule. A single root cannot express any of that. The implementation stays one `LocalStorage` class instantiated per bucket rather than six classes; the segmentation lives in configuration, which is where it can actually be changed per deployment.

- **D-4 — `storage_key` is bucket-relative and the bucket is derived from context, never parsed from the key.** Each key-bearing column belongs to exactly one bucket, so the bucket is always statically known at the call site. Encoding it in the key would recreate the shared-namespace problem in string form.

- **D-5 — The error envelope is normalized at the handler layer, not the call sites.** Three handlers in `app/main.py` versus editing 117 `raise` statements. The string-detail case stays byte-for-byte identical on the wire, so `client-frontend`'s existing parsers need no change and the fix reaches them for free.

- **D-6 — Measure the frontend build before doing structural work.** `optimizePackageImports` + `--turbo` is two lines against a 62 × 145 barrel product. The structural candidates (mock extraction, dynamic imports, `"use client"` reduction) are only worth their diff if a recorded measurement still shows a gap.

- **D-7 — The `0026` downgrade fix comes into this branch; the PTA over-allocation does not.** The downgrade defect (DB B-5) is a prerequisite, not an adjacent bug: every rollback claim this proposal makes is unverifiable until a downgrade can run, so fixing it elsewhere would leave 020 unable to prove its own safety. The post-trade-allocation 3× discrepancy is a money-path logic bug with no diagnosis yet and no relationship to schema or format — it gets its own proposal, and its test stays failing here rather than being silenced.

- **D-8 — The three unknown-class test failures are diagnosed, not re-asserted.** Updating an assertion to match observed behaviour is how a 377-failure baseline accumulates. Two of the three sit on paths this branch changes, and `FE-7` in particular could be a swallowed-error path that the Phase-4 envelope work would disguise. Three tests is a cheap diagnosis against that risk.

- **D-9 — `client_profiles` drops `id` rather than converting it to UUID.** 012 asked for a UUID conversion; the underlying intent is "no `int` keys left in the portal schema", and deleting an unreferenced column satisfies that while doing strictly less. `user_id` already carries a unique index and is what every join uses.

- **D-10 — Per-client folders standardize on the slug form, resolved by uid suffix.** The slug is human-legible when browsing the filesystem, which is the point of segmenting by client at all. Its one weakness — a rename stranding the old directory — is closed by having `client_folder()` glob for `*_{uid[-8:]}` and reuse an existing directory before creating one, rather than by documenting the weakness and living with it.

- **D-12 — Delete routes with no frontend consumer; keep all modules and logic.** Auto-reconciliation and its end-of-day report are both deprecated, but the code is not disposable: `app/libs/eod` and `app/libs/post_trade_allocation` import the reconciliation package's internals (§1.1), and PTA is live. The instruction is to purge the dead HTTP surface while leaving the logic wholly intact, so the rework inherits a working subsystem instead of a blank page. The alternative — extracting `adapters`, `dtos`, `formatting`, `engine.reconcile` and `synth` into their consumers so the packages could be deleted — would put the largest and riskiest diff in 020 into code that is about to be redesigned anyway. The operative rule is therefore: **a route goes iff nothing in the frontend calls it, and no module is deleted at all.** That removes `/reconciliation` and the three EoD routes, and preserves every line of logic for the rework to build on. `GET /api/mobo/trade-records` is retained on its own merit — it is the deprecated feature's replacement, not a survivor of it. The structural decisions belong to the proposal that redesigns the subsystem. `recon_sessions`, its composite FK, and the write-only `allocation_user_id` are handed to that proposal with the evidence recorded rather than resolved on its behalf.

- **D-11 — Admin gets skeleton-until-data; client-frontend keeps `loading.tsx`-only.** `loading.tsx` alone unmounts before hook data arrives, which is precisely the gap users perceive as "nothing is happening". Rendering one per-route skeleton component from both `loading.tsx` and the page's `loading` flag closes it seamlessly. Retrofitting `client-frontend` is deliberately excluded — it would widen the regression surface of an already-large branch for a benefit nobody asked for. The portals will differ, and that asymmetry is intentional, not drift.

- **D-13 — "Purge the mock" is resolved per-export, not per-file, and only after checking internal as well as external consumers.** `lib/mock/rm-data.ts` and `lib/mock/eom-reports.ts` are not deleted, renamed away from, or otherwise treated as one unit — each export is individually dead, a relocatable real type, or genuinely still-mock content with no backend, and each gets the treatment that classification earns. The internal-consumer check specifically caught a near-miss: `RM_CLIENTS`/`CLIENT_EXTRA` have zero *external* importers, which would read as dead by a surface grep, but both feed `getMockOverlay()`'s `OVERLAY_ROTATION` internally and are live. Any future pass over these two files must repeat that same internal check before deleting anything, not just grep the rest of the repo.

---

## Objectives & standard of the expected outcome

- **No behaviour change beyond the fee scale.** Every surviving endpoint returns the same success body, byte-for-byte. Only error bodies, the 13 status codes in C-3, and fee values change.
- **Logic lives once.** One `parseFeePercent`, one `client_folder()`, one error parser per frontend, one storage module.
- **Additive and reversible where it can be.** Every migration step reverses except B-1 step 4 and B-3, both of which are named as lossy up front rather than discovered at rollback.
- **The suite is the proof.** "Done" means all three suites green from a clean checkout with no `--continue-on-collection-errors` and no `grep -v "^tests/"` — with exactly one documented failure, the PTA over-allocation test owned by another proposal (D-7). One named exception is a baseline; an unnamed set of them is the state this branch exists to end.
- **Rollback is executed, not asserted.** `alembic downgrade base && alembic upgrade head` runs green against a scratch DB in Phase 0 and again in Phase 7.
- **The trust boundaries got stricter, not looser.** Path containment in `LocalStorage.open()`, `Field(ge=0, lt=1)` on the fee schemas, and the entitlement check on client material download are all additions this branch must not trade away for a smaller diff.

---

## Execution & verification

Layers 1–3 fan out to independent branches per the standing `<parent>-{db,be,fe}` convention. Layer 4 is not independent — it runs first, then again last.

1. **Phase 0 — Layer 4 triage + DB B-5 (blocking).** Clear the six collection errors and the two shared-fixture clusters; fix `0026`'s downgrade ordering. *Proves:* `pytest -q` runs to completion; `alembic downgrade base && alembic upgrade head` succeeds on a scratch DB; backend failures drop from 255 to roughly a dozen. Nothing downstream has a trustworthy signal until this lands.
2. **Phase 0b — record the frontend baseline.** Cold `next dev` + warm recompile timings for the admin dashboard route, written into the impl doc. *Proves:* A-5's later claim is measurable rather than asserted.
3. **Phase 0c — diagnose the three unknown-class failures** (Layer 4 B-5). *Proves:* each has a recorded verdict. If `FE-7` turns out to be a real swallowed-error path, its fix lands here — **before** Phase 4, which would otherwise disguise it.
4. **Phase 1 — deletions.** Backend C-5 (the four unconsumed routes — `/reconciliation` and the three EoD routes — and no modules, per D-12), Frontend B-table row 4 (admin's recon FE surface + its stale tests), Frontend C-1 (un-gitignore). *Proves:* suites still green; route count 94 → 90; an import scan shows no module orphaned; **`/api/mobo/trade-records` and its admin page still work byte-for-byte, and the PTA run path still works** — those two regression checks are the whole point of the scoping. DB B-3 contributes nothing to this phase. Deletions first, so everything downstream is smaller.
5. **Phase 2 — the fee correction, as one atomic change set.** DB B-1 + Backend C-1/C-2 + Frontend A-1/A-2 land together; they are individually wrong. *Proves:* approve an onboarding at the model default → `mgmt_fee_override IS NULL`; approve at a negotiated fee → the override stores the fraction; the PC editor round-trips `2.0` → `0.020000` → `"2.00%"`; a percent-scale write is rejected by `Field(lt=1)`.
6. **Phase 3 — storage buckets.** Backend A + A-2 + DB B-2, plus the deploy-time directory move and the contact-log slug rename. *Proves:* every existing document downloads through its new bucket; a file written to each of the six buckets lands under that bucket's root and nowhere else; a renamed client reuses its existing folder rather than creating a second.
7. **Phase 4 — error envelope.** Backend B + C-3 + Frontend A-3/A-4. *Proves:* every non-2xx across all 92 routes returns JSON with a string `detail`; a deliberately-raised `ValueError` returns JSON, not plain text; no admin toast contains a `{`; the five corrected `401`s trigger admin's re-auth branch.
8. **Phase 5 — frontend build + loading.** A-5, A-6. *Proves:* recorded timings beat Phase 0b; every admin route shows a skeleton continuously from navigation until data renders, with no flash of empty page at the mount boundary.
9. **Phase 6 — DB B-4 and the Recommend tier**, as far as the reviewer wants them.
10. **Phase 7 — Layer 4 again.** Full green from a clean checkout, with one documented exception: the PTA over-allocation test (D-7), which stays failing and is owned by its own proposal.

**Human gate(s):**

- **Before Phase 2's migration touches the live DB.** The migration prints the row counts for B-1 steps 1, 3 and 4. A human reviews them — in particular how many overrides step 4 nulls, and how many rows step 3 classified as percent-scale — before the transaction is committed. Step 4 is not reversible.
- **Before Phase 3's directory move.** The `mv` and the `UPDATE` must be adjacent; downloads 500 in the window between them. Needs a maintenance slot, not a rolling deploy.
- **Merge to `main`** — per the standing rule, the human alone opens and merges the PR.

---

## Rollback

**Reverts cleanly with the branch:** all of Layer 2 and Layer 3 (code only), DB B-2 (re-prepend the prefixes), DB B-4 (re-add the column).

**Needs `alembic downgrade`:** DB B-1 steps 1 and 3 reverse by multiplying by 100.

**Does not revert — lossy:**
- **DB B-1 step 4, and it is now the only lossy item in the branch.** A nulled `mgmt_fee_override` is indistinguishable from one that was always `NULL`. Mitigation: the pre-migration table is snapshotted as the first statement of the revision, and the row counts go through the human gate.

(B-3's destructive drop was withdrawn per D-12, which removes the branch's other irreversible step. Backend C-5's route deletion reverts with the branch like any code change.)

**Prerequisite, now in scope.** The down-migration path below revision `0026` did not execute at all before this branch — the FK/index ordering defect made `alembic downgrade` fail outright. **DB B-5 fixes that in Phase 0**, which is what makes everything above a real rollback plan rather than a written one. Verification is explicit: `alembic downgrade base && alembic upgrade head` against a scratch database, run in Phase 0 and again in Phase 7.

---

## Open questions

### Resolved (2026-08-03)

- **Q-1 — where the two real bugs land.** → **D-7.** The `0026` downgrade fix comes into this branch as DB B-5, Phase 0, because the rollback plan depends on it. The PTA 3× over-allocation gets its own proposal; its test stays failing here rather than being silenced.
- **Q-2 — anything worth keeping in `recon_sessions`?** → **Superseded before it could be executed.** The answer was "export, then drop", but a dependency scan during impl-doc generation found the table is live storage for the EoD path and the reconciliation library is imported by two live packages (§1.1). The drop is withdrawn entirely (**D-12**); no export is needed because nothing is destroyed. Recorded rather than deleted, because the sequence — a question answered, then the answer invalidated by evidence found one artifact later — is exactly why the impl stage reads source instead of trusting the proposal's line refs.
- **Q-3 — the three unknown-class test failures.** → **D-8.** All three diagnosed in-branch (Layer 4 B-5, Phase 0c) before any assertion moves. `FE-7`'s verdict must land before Phase 4.
- **Q-4 — how far admin's loading states go.** → **D-11.** Full skeleton-until-data in admin: one per-route `Skeleton.tsx` rendered from both `loading.tsx` and the page's hook `loading` flag. `client-frontend` is not retrofitted.
- **Q-5 — `client_profiles` PK shape.** → **D-9.** Drop `id`, promote `user_id` to primary key. The 012 UUID-conversion wording is satisfied by deleting the column.
- **Q-6 — per-client folder convention.** → **D-10.** Slug form `{Slug_Name}_{uid[-8:]}` in both buckets, with `client_folder()` resolving by uid suffix so a client rename reuses the existing directory instead of stranding it.

### Provisionally resolved — confirm in Phase 0c

- **Q-7 — does the `FE-7` diagnosis change Phase 4's scope?** → **Almost certainly not.** Reproduced during impl-doc generation: `FE-7.index.test.ts:197` receives `{success:true,data:[]}`, which is *the previous test's* mock return — two back-to-back `vi.doMock`s with no `vi.resetModules()`, so the second factory never applies. `app/(roles)/admin/actions.ts:35-44` does genuinely wrap in try/catch, so there is no swallowed-error path and Phase 4 is unaffected. **Still gated:** Phase 0c must confirm it empirically — the test goes green with **no source edit**. If it does not, the swallowed-error hypothesis is back and Phase 4 must be resequenced behind the fix.

### Out of scope (tracked elsewhere)

- **Trade reconciliation + EoD report rework** — a future proposal. Both are deprecated; this branch deletes only their four unconsumed routes (D-12) and hands over every module intact, with `GET /api/mobo/trade-records` as the replacement surface already in place to build on. That proposal inherits three things this one deliberately did not decide: whether `recon_sessions` survives, whether `allocation_model_snapshots` gets the surrogate PK 012 wanted, and `allocation_user_id` — written by `algotrade/synth.py:43-50`, read by nothing, and not worth carrying into a new design without a reason.
- **Untangling `app/libs/reconciliation` from `app/libs/eod` and `post_trade_allocation`** — the extraction that would make the package deletable. Owned by the rework, per D-12.
- **Post-trade-allocation 3× over-allocation** — its own proposal, per D-7. `tests/libs/post_trade_allocation/test_be3_service_run.py:365` remains a known failure at the end of this branch.
- **Admin's base64 download proxy** — admin buffers every file through a Node server action as base64 while the client portal streams; unifying on streaming is its own proposal (Layer 3 C-2 note).
- **`NasStorage` implementation** — the bucket registry makes it a per-bucket swap; the placeholder stays.
- **`client-frontend` skeleton-until-data** — deliberately excluded per D-11; a candidate for a later branch if the asymmetry becomes annoying.
- **Rotating the invalid Firebase service-account key** — long-standing, tracked separately; causes `register` to 500 on `Invalid JWT Signature`.
