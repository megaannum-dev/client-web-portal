# 020 — Schema / Format Cleanup Refactor · Implementation Details — Database

> Status: **DRAFT — pending implementation.**
> Implements: proposal `docs/proposals/020-2026-08-03-schema-format-cleanup-refactor.md` § **Layer 1 — Database** (findings B-1 … B-5)
> Layer: **Database** — one layer per file.
> Sibling layer docs: `docs/implementations/020-schema-format-cleanup-refactor-be.md`, `docs/implementations/020-schema-format-cleanup-refactor-fe.md`
> Execution schedule: `docs/execution-schedules/020-schema-format-cleanup-refactor-db.md`
> Branch: `schema-repository-refactor-bugfix-db`
> Builds on / prerequisites: alembic head **`c72e91a4f6b3`** (`0030_client_contact_logs`) applied to the target DB; MySQL (the whole layer is MySQL-specific DDL).

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/020-2026-08-03-schema-format-cleanup-refactor.md` § Layer 1 — Database |
| Execution schedule | `docs/execution-schedules/020-schema-format-cleanup-refactor-db.md` |
| Sibling layer impl docs | `docs/implementations/020-schema-format-cleanup-refactor-be.md`, `docs/implementations/020-schema-format-cleanup-refactor-fe.md` |
| Builds on | alembic head `c72e91a4f6b3` (`api-backend/alembic/versions/c72e91a4f6b3_0030_client_contact_logs.py`) |

**Unit ↔ proposal map** (IDs are renumbered into execution-sensible logical order; the proposal ref is restated on every unit):

| Unit | Proposal ref | Tag |
|---|---|---|
| DB-1 | § Layer 1 **B-5** | Yes |
| DB-2 | § Layer 1 **B-1** | Yes |
| DB-3 | § Layer 1 **B-2** | Yes — user req. |
| DB-4 | § Layer 1 **B-3** | **WITHDRAWN** — no work unit; see §6 |
| DB-5 | § Layer 1 **B-4** | Accepted |

**DB-4 is withdrawn and its ID is retired, not reused.** DB-5 keeps its number. Unit IDs are stable once published (the sibling `-be` / `-fe` docs and the execution schedule reference them), so renumbering to close the gap would silently repoint every external citation.

### 1.1 Source-verification notes

The first two entries below were discrepancies against the proposal's original text; the proposal has since been corrected and now agrees, so they are restated here as plain facts about the tree rather than as deviations. The third was escalated and changed the layer's scope.

1. **The broken `downgrade()` is in `0027`.** `api-backend/alembic/versions/a9317a31b484_0026_client_portal_integration.py:171-195` contains no index/FK ordering problem at all — its `downgrade()` is column drops and one `drop_table`. The constraint pair is created and dropped by **`0027`**, `api-backend/alembic/versions/b34f8c1a9d27_0027_ticket_status_consolidation.py:47-58` (up) and **`:61-68`** (down). The proposal records this at § Layer 1 B-5's "Corrected 2026-08-03 against source" note, which also explains why the original audit misattributed it: the test names are misleading because those tests fail *downstream* of `0027`. DB-1 targets `0027`.
2. **The offending call is `drop_constraint(type_="unique")`, not `drop_index`.** `b34f8c1a9d27:62-64` releases the unique constraint via `op.drop_constraint(..., type_="unique")`. The reorder is the same idea; the call to move is a `drop_constraint`. Also recorded in the corrected proposal B-5.
3. **`recon_sessions` has live non-recon consumers — escalated, RESOLVED, DB-4 withdrawn.** The dependency is broader than the initial `app/libs/eod` finding:

   ```
   app/libs/eod/presenter.py:7-12,19   -> adapters.{algotrade,crm,ib}, dtos, formatting, presenter.*, ReconSession
   app/libs/eod/repository.py:15,25    -> ReconSession (sessions_for_trade_date)
   app/libs/eod/service.py:15,35,105   -> engine.reconcile
   app/libs/post_trade_allocation/service.py:19,155,163
                                       -> algotrade.synth.{synthesize_from_run,_parse_yyyymmdd}
   ```

   EoD serves three live routes and the PTA run path is live, so `recon_sessions` is live storage, not dead surface. Raised through §7.3's change protocol; the human decision is recorded as proposal **D-12** and the proposal's § Layer 1 B-3 now reads "**Refactor: none. No DDL, no data change.**" Backend C-5 is narrowed from "delete the package" to "delete the two dead routes and the router mount" (proposal `:50`, `:421`). Consequences for this layer: **DB-4 does not exist as a work unit**, `recon_sessions` / its composite FK / the write-only `allocation_user_id` column all survive this branch untouched, and the surrogate-PK question on `allocation_model_snapshots` stays withdrawn per D-2 and goes to the recon rework alongside `allocation_user_id`.

   **Two residual inconsistencies in the amended proposal, flagged not fixed** (this doc does not edit the proposal): its **§4.2** Database row still reads "drops the dead recon tables", which is now false for this layer — §7.2 below states the corrected obligation. And **D-12 is cited at `:50` and `:421` but has no entry in the "Design decisions (settled)" list**, unlike D-1 … D-11. Both are proposal-side edits for whoever owns the next revision.

---

## 2. Branch & session contract

- **Branch:** `schema-repository-refactor-bugfix-db` — all five units land on this one branch.
  - Convention: parent branch + `-db`. The parent is captured at session start; the layer branch is cut from it and merged back into it by the human.
- **Isolation:** implementable in a fresh session on its own branch, in parallel with `-be` and `-fe`. It shares state with them only through the §7 seam, with no exceptions — the one cross-layer deploy-ordering hazard this layer had (DB-4's table drop against the live EoD path) was removed when DB-4 was withdrawn (§1.1(3)).
- **Working directory for every command:** `api-backend/`. The venv at `api-backend\.venv\` is mandatory — the system Python has none of the dependencies.

- **Preconditions (must be true before starting):**
  - [ ] Alembic head on the target/scratch DB is `c72e91a4f6b3`.
  - [ ] A scratch MySQL database is reachable via `DATABASE_URL` and is disposable — DB-1's acceptance is a full `downgrade base` / `upgrade head` cycle against it.
  - [ ] The §7 seam is frozen in the proposal (`§ 4. Cross-layer seam (frozen here)`); §7 below is a verbatim copy, not a negotiation with a sibling layer.

- **Read-first inventory** (every existing file a unit touches):
  - `api-backend/alembic/versions/b34f8c1a9d27_0027_ticket_status_consolidation.py` — DB-1 edits `downgrade()` in place (`:61-68`).
  - `api-backend/alembic/versions/c72e91a4f6b3_0030_client_contact_logs.py` — the head; its `revision` string is the new revision's `down_revision`.
  - `api-backend/alembic/versions/8f2a1c9d4b6e_0003_uuid_keys_and_column_order.py` — the house precedent for MySQL PK surgery (`:37-42` `_require`, `:44-58` `_fk_name`, `:117-124` the AUTO_INCREMENT-then-DROP-PRIMARY-KEY dance, `:140-144` where `ux_client_profiles_user_id` and `fk_client_profiles_user` are named). DB-5 follows it exactly.
  - `api-backend/alembic/versions/a9317a31b484_0026_client_portal_integration.py` — read to confirm §1.1(1); **not modified**.
  - `api-backend/app/models/pc.py` — `Model.mgmt_fee` / `incentive_fee` (`:102-103`), `ModelMaterial.storage_key` (`:152`), `ClientSubscription.mgmt_fee_override` / `incentive_fee_override` (`:224-225`, with the `NULL = inherit` contract documented at `:219-226`).
  - `api-backend/app/models/onboarding.py` — `ClientOnboarding.mgmt_fee` / `incentive_fee` (`:92-93`), `OnboardingDocument.storage_key` (`:154`), `ClientContactLog.doc_storage_key` (`:363`).
  - `api-backend/app/models/eod.py:62` — `EodRecord.file_storage_key`; read to confirm it is **out** of DB-3's scope.
  - `api-backend/app/models/users.py:143-168` — `ClientProfile`; `id` at `:146`, `user_id` at `:147-149`.
  - `api-backend/app/models/recon.py:37-63` — `ReconSession` and its composite `ForeignKeyConstraint` at `:54-62`. Read to confirm §1.1(3); **not modified, and its tables are not dropped.**
  - `api-backend/pyproject.toml` — confirms `[tool.ruff]`, `[tool.pytest.ini_options]`, `[tool.mypy]` are all configured (the §3.2 gate is real, not aspirational).

- **Hand-off / exit signal:** DB-1 committed as its own commit; DB-2, DB-3 and DB-5 committed into the single new revision file; `alembic downgrade base && alembic upgrade head` green against the scratch DB; the §3.2 gate green; PR opened. The human owns the merge.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions (observed, not invented)

Read off `8f2a1c9d4b6e_0003`, `a9317a31b484_0026`, `5cd1cc1948cc_0028` and `c72e91a4f6b3_0030`. The new revision matches all of it.

- **Docstring header.** Every revision opens with a triple-quoted block whose first line is the ordinal name (`0031_schema_format_cleanup`), then `Revision ID:` / `Revises:` / `Create Date:`, then prose explaining *why* each change exists and what `downgrade()` does and does not restore. The prose is substantial and names the proposal and the unit IDs (see `5cd1cc1948cc_0028`'s header for the target density).
- **Imports.** Exactly:
  ```python
  from typing import Sequence, Union

  import sqlalchemy as sa
  from alembic import op
  ```
  followed by the four module-level identifiers `revision` / `down_revision` / `branch_labels` / `depends_on`, all annotated (`revision: str = "..."`, the other three `Union[str, Sequence[str], None]`).
- **`_require` self-assertion helper.** House convention since `e183474e6b91` / `0018`; present verbatim in `a9317a31b484:40-44` and `8f2a1c9d4b6e:37-42`:
  ```python
  def _require(condition: bool, message: str) -> None:
      if not condition:
          raise RuntimeError(f"0031 self-assertion failed: {message}")
  ```
  Pre-conditions are asserted **before any DDL in the revision**, because MySQL DDL auto-commits and will not roll back with a later raise (`a9317a31b484:48-53` states this rule explicitly).
- **Introspection over hard-coded names.** Engine-generated constraint names are looked up in `information_schema`, never guessed (`8f2a1c9d4b6e:44-58`). Names this repo *did* choose (`ux_client_profiles_user_id`, `fk_client_profiles_user`, `uq_client_tickets_linked_allotment_id`) may be used literally.
- **`op.` idioms.** Structural DDL uses the alembic API (`op.create_table`, `op.add_column`, `op.drop_column`, `op.create_index`, `op.drop_constraint`). Anything MySQL cannot express through it — multi-clause `ALTER TABLE`, `DROP PRIMARY KEY`, `CHANGE COLUMN … FIRST/AFTER` — uses `op.execute("ALTER TABLE …")` with raw SQL (`8f2a1c9d4b6e:117-144`). Data statements use `op.execute("UPDATE …")` (`a9317a31b484:111-116`); statements whose result is read back use `conn = op.get_bind()` + `conn.execute(sa.text(...)).scalar()`.
- **Drop order.** `op.drop_table` removes a table's own indexes and FK constraints in one statement — no separate `drop_index` first, and MySQL would reject one that backs an FK (`c72e91a4f6b3:83-87` documents exactly this). Where a constraint must be dropped separately, **the foreign key goes first, then the index/unique constraint that backs it** — `29a586aaf08b_0014:156-157` already does it in the correct order; `b34f8c1a9d27_0027:62-67` does not, which is DB-1.
- **`ruff` excludes `alembic/`** and **`mypy` excludes `alembic`** (`pyproject.toml`). Migration files are therefore not lint- or type-gated; the ORM edits in `app/models/*.py` **are**. Line length is 100.
- **No column comments exist anywhere in the repo today** — `comment=` appears in zero migrations and zero models. DB-2 introduces the first ones; they go on **both** sides (migration `op.alter_column(..., comment=...)` and the ORM `mapped_column(..., comment=...)`) so `alembic revision --autogenerate` does not immediately report drift.
- **No migration logs today** either. DB-2 introduces the first, through the alembic logger (`alembic.ini:136-137` sets `logger_alembic` to `INFO`, so a child logger's `info()` is surfaced on the console handler):
  ```python
  import logging
  logger = logging.getLogger("alembic.runtime.migration")
  ```

### 3.2 CI/CD & engineering discipline

- **Trunk-friendly, small units.** DB-1 is its own commit. DB-2, DB-3 and DB-5 build up one revision file; each is committed as it lands and each leaves the branch green, because a partially-written revision still imports, still lints, and still applies.
- **Every unit independently revertible.** DB-2, DB-3 and DB-5 share a file, so reverting one is an edit to that file rather than a commit revert. Each unit's `upgrade()` and `downgrade()` blocks are self-contained and separated by the `# --- DB-N ---` banner comments the repo already uses (`a9317a31b484:63,100,110,145,151`), so a single block can be removed without touching its neighbours. Noted here rather than claimed away.
- **Additive-and-backward-compatible first.** Not available for this layer: the units are corrections by definition. The compensating discipline is that the destructive steps (DB-5's column drop, DB-2 step 4) are the **last** statements in `upgrade()`, behind the human gate the schedule owns.
- **Gates before merge** — run from `api-backend/`, using the venv (the system Python has no dependencies):
  ```bash
  .\.venv\Scripts\ruff.exe check . && .\.venv\Scripts\ruff.exe format --check . && .\.venv\Scripts\mypy.exe app && .\.venv\Scripts\python.exe -m pytest -q
  ```
  All three tools are configured in `api-backend/pyproject.toml` (`[tool.ruff]` with `line-length = 100` and `exclude = ["alembic", ".venv", "pc_storage"]`; `[tool.pytest.ini_options]` with `testpaths = ["app", "tests"]`; `[tool.mypy]` with `files = ["app"]`, `exclude = "alembic"`). This is a real gate, not a placeholder.

  **Caveat on the last stage.** On `main`, `pytest -q` **aborts at collection** with six import errors and never reaches the assertions, so today the gate's fourth stage reports nothing useful. Two things make it meaningful: **DB-1** (which turns the 19 migration failures/errors green with no test edited) and the **BE layer's collection-error cleanup** (proposal § Layer 4 B-1). Until both have landed, treat a green `pytest -q` on this branch as "collection succeeded and the migration tests passed", and verify DB-1 with its own explicit `alembic` round-trip (§8.3) rather than trusting the aggregate exit code.
- **No secrets, no manual steps in the merge path.** Two things in this layer need a human and are handed to the execution schedule, not baked into a unit: the DB-2 row-count review, and the DB-3 deploy-time directory move. (A third — the recon export artifact — disappeared with DB-4.)
- **Reversibility documented** — §9, including the two places where it is honestly absent.

---

## 4. Architecture (level 1 of 3)

This layer produces **two migration artifacts, deliberately split**, plus ORM edits that keep `app/models/` in step with the resulting schema.

```
api-backend/
  alembic/versions/
    b34f8c1a9d27_0027_ticket_status_consolidation.py   # MODIFY  — DB-1 only, downgrade() reordered
    c72e91a4f6b3_0030_client_contact_logs.py           # (head, untouched — the new revision's parent)
    a3f7c1d9e824_0031_schema_format_cleanup.py         # CREATE  — DB-2, DB-3, DB-5
  app/models/
    pc.py         # MODIFY — DB-2 (fee column comments)
    onboarding.py # MODIFY — DB-2 (fee column comments)
    users.py      # MODIFY — DB-5 (ClientProfile PK shape)
    eod.py        # READ-ONLY — confirms file_storage_key is out of DB-3's scope
    recon.py      # UNTOUCHED — DB-4 withdrawn (§1.1(3), proposal D-12)
```

**Why the split.** DB-1 is a repair to *history*: the revision it fixes has already been applied everywhere, and its `downgrade()` has never successfully executed anywhere, so editing it in place changes no environment's state. Bundling that repair into a new revision would be wrong twice over — a new revision cannot retroactively fix an old one's `downgrade()`, and the whole point of DB-1 is that **the new revision's own rollback claims are unverifiable until the downgrade chain below it can run**. DB-1 is therefore a prerequisite of everything else in this doc, and lands on its own.

DB-2, DB-3 and DB-5 are a single new revision because they are one review, one apply, one rollback against one live database, and because their steps share a set of self-assertions and row-count logs.

**New revision identity (fixed, not autogenerated):**

```python
revision: str = "a3f7c1d9e824"
down_revision: Union[str, Sequence[str], None] = "c72e91a4f6b3"
```

Filename `a3f7c1d9e824_0031_schema_format_cleanup.py`, matching the `{hex}_{NNNN}_{slug}.py` convention every file in `alembic/versions/` uses. `0031` is the next free ordinal after `0030`.

**Dependency direction:** the revision file imports only `sqlalchemy`, `alembic.op`, `logging` and `typing` — never `app.models` or any `app.libs` package. A migration that imports the ORM breaks the moment the ORM moves ahead of it; every existing revision in this repo already respects this.

**External seams:** this layer writes the columns the Backend layer reads — `models.*_fee`, `client_subscriptions.*_override`, and the three `*storage_key` columns — and changes `client_profiles`' primary key. It drops no table. All of it is pinned in §7.

---

## 5. Modules (level 2 of 3)

### 5.1 Migration-history repair

- **Responsibility:** make the existing downgrade chain executable on MySQL, so that every rollback claim in this doc and in the proposal is testable rather than asserted.
- **Files:** `api-backend/alembic/versions/b34f8c1a9d27_0027_ticket_status_consolidation.py` (modify `downgrade()`); a read-only audit pass over every other file in `api-backend/alembic/versions/`.
- **Public surface:** none — the observable surface is that `alembic downgrade base` completes.
- **Owns features:** DB-1.

### 5.2 Revision `0031_schema_format_cleanup`

- **Responsibility:** the single new Alembic revision carrying all three data/schema changes, with `down_revision = c72e91a4f6b3`.
- **Files:** `api-backend/alembic/versions/a3f7c1d9e824_0031_schema_format_cleanup.py` (create).
- **Public surface:** `upgrade()` / `downgrade()`; the module-level `_require` and `logger`.
- **Owns features:** DB-2, DB-3, DB-5.
- **Internal ordering inside `upgrade()`** (this is statement order within one unit of work, not a schedule): all `_require` pre-conditions → DB-2 → DB-3 → DB-5. Data-only corrections first, the one piece of destructive DDL (DB-5's column drop) last, so a self-assertion failure aborts before anything irreversible has auto-committed.

### 5.3 ORM model declarations

- **Responsibility:** keep `app/models/` describing the post-migration schema, so `--autogenerate` sees no drift and mypy types match reality.
- **Files:** `api-backend/app/models/pc.py`, `api-backend/app/models/onboarding.py`, `api-backend/app/models/users.py`.
- **Public surface:** `Model.mgmt_fee` / `.incentive_fee`, `ClientOnboarding.mgmt_fee` / `.incentive_fee`, `ClientSubscription.mgmt_fee_override` / `.incentive_fee_override`, `ClientProfile.user_id`.
- **Owns features:** the ORM half of DB-2 and DB-5.
- **Explicitly NOT touched:** `app/models/recon.py` — DB-4 is withdrawn (§1.1(3)), so the file is neither edited nor deleted on this branch.

---

## 6. Features (level 3 of 3 — the work units)

### DB-1 — Reorder `0027`'s `downgrade()`: FK before unique constraint (Yes)

- **Proposal ref:** § Layer 1 **B-5**
- **Module:** §5.1 Migration-history repair
- **Files:** `modify: api-backend/alembic/versions/b34f8c1a9d27_0027_ticket_status_consolidation.py` (`downgrade()`, `:61-68`); `audit (read-only): api-backend/alembic/versions/*.py`
- **Dependencies:** none — **this is the prerequisite unit.** DB-2, DB-3 and DB-5 are implementable without it but their rollback is unverifiable without it, so nothing else's "Done when" can be signed off first.

**Contract (required code):**

The defect, as it stands at `b34f8c1a9d27_0027_ticket_status_consolidation.py:61-68`:

```python
def downgrade() -> None:
    op.drop_constraint(
        "uq_client_tickets_linked_allotment_id", "client_tickets", type_="unique"
    )
    op.drop_constraint(
        "fk_client_tickets_linked_allotment_id", "client_tickets", type_="foreignkey"
    )
    op.drop_column("client_tickets", "linked_allotment_id")
```

The required body — foreign key first, then the unique constraint that backs it, then the column:

```python
def downgrade() -> None:
    # MySQL refuses to drop an index that a foreign key still depends on
    # (OperationalError 1553, "Cannot drop index ... needed in a foreign key
    # constraint"), so the FK is released before the UNIQUE that backs it.
    # Same ordering as 29a586aaf08b / 0014:156-157.
    op.drop_constraint(
        "fk_client_tickets_linked_allotment_id", "client_tickets", type_="foreignkey"
    )
    op.drop_constraint(
        "uq_client_tickets_linked_allotment_id", "client_tickets", type_="unique"
    )
    op.drop_column("client_tickets", "linked_allotment_id")

    # Note: REPLIED/CLOSED cannot be distinguished from RESOLVED post-backfill;
    # no data reversal is performed.
```

`upgrade()` (`:35-58`) is **not** touched. The trailing comment at `:70-71` is preserved.

**Behavior / invariants:**

- Editing a historical revision in place is legitimate **only** because this `downgrade()` has never executed successfully in any environment, so no environment's state depends on its present ordering. That justification is written into the revision's docstring as part of this unit.
- **Audit obligation.** Every other file in `api-backend/alembic/versions/` is read for the same index-before-FK ordering and fixed if found. The audit has been performed once for this doc and its result is recorded so the implementer verifies rather than re-derives:
  - `b34f8c1a9d27_0027:62-67` — **the only offender.**
  - `29a586aaf08b_0014:156-157` — already correct (`drop_constraint("orders_ibfk_1", type_="foreignkey")` precedes `drop_index("ix_orders_allocated_run_id")`).
  - `c72e91a4f6b3_0030:82-88`, `5cd1cc1948cc_0028:304-318`, `a9317a31b484_0026:171-195`, `6405e823862b_0001`, `79729eec2af4_0002`, `a1b2c3d4e5f6_0004`, `b2c3d4e5f6a7_0005`, `c3d4e5f6a7b8_0006`, `d4e5f6a7b8c9_0007`, `e5f6a7b8c9d0_0008`, `f0e1d2c3b4a5_0009`, `9b76c05d3e2f_0010` — no FK/index ordering hazard: each either drops a whole table (which releases both together) or drops an index no FK depends on.
  If the audit finds an offender this pass missed, fix it in the same commit and extend the list above.
- **Honest note on the mechanism**, carried in the corrected proposal B-5 as "One honest caveat" and restated here because it sets this unit's acceptance criterion. `0027`'s `upgrade()` creates the FK at `:47-53` *before* the unique constraint at `:54-58`, so MySQL will have auto-created its own backing index for the FK at that point, and error 1553 may not fire on every MySQL version or storage-engine configuration. **The reorder is correct and free regardless** — it is the ordering the rest of the repo already uses. But the acceptance criterion is the empirical one below, **not the diff**. If `alembic downgrade base` still fails after the reorder, capture the actual error and re-derive the fix from it; and if it already passed before the fix on some environment, that does not make the original ordering right. Do not declare the unit done on the strength of the diff either way.

**Done when:** from `api-backend/`, against a scratch MySQL database at head `c72e91a4f6b3`:
```
.\.venv\Scripts\alembic.exe downgrade base
.\.venv\Scripts\alembic.exe upgrade head
```
both complete with exit code 0. Secondary signal: the 19 failures/errors the proposal attributes to this defect (`test_migration_0026…`, `test_db1_transaction_details_migration`, `test_db2_allotment_redemption_migration`, `test_db2_auth_status_migration`, `test_eod_migration`, `test_recon_migration`, plus 6 setup errors in `test_db4_onboarding_documents_backfill_migration.py`) go green with **no test file edited**.

---

### DB-2 — Migrate fee columns to the decimal-fraction scale (Yes)

- **Proposal ref:** § Layer 1 **B-1**
- **Module:** §5.2 revision `0031`; §5.3 ORM
- **Files:** `create: api-backend/alembic/versions/a3f7c1d9e824_0031_schema_format_cleanup.py`; `modify: api-backend/app/models/pc.py` (`:102-103`, `:224-225`), `api-backend/app/models/onboarding.py` (`:92-93`)
- **Dependencies:** DB-1 (rollback verifiability). No type change, so nothing else in this doc depends on it.

**Contract (required code):**

Module preamble (shared by DB-2, DB-3 and DB-5):

```python
"""0031_schema_format_cleanup

Revision ID: a3f7c1d9e824
Revises: c72e91a4f6b3
Create Date: <YYYY-MM-DD> 00:00:00.000000

Proposal 020, Layer 1: findings B-1, B-2 and B-4 == impl units DB-2, DB-3
and DB-5. B-3 (drop recon_sessions) is withdrawn per D-12 and contributes
no DDL to this revision. ...
"""

import logging
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a3f7c1d9e824"
down_revision: Union[str, Sequence[str], None] = "c72e91a4f6b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")

_FEE_COMMENT = "decimal fraction: 0.020000 = 2% (proposal 020, DB-2)"


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(f"0031 self-assertion failed: {message}")
```

**Step 0 — the recovery snapshot, first statement of `upgrade()`.** The proposal's Rollback section asks for "the pre-migration table dumped to a timestamped backup as the first statement of the revision". A migration cannot write a file outside the database reproducibly — the path, the filesystem, the credentials and the dump binary all differ between a developer's scratch DB, CI and production, and a migration that succeeds in one and fails in another is worse than no backup at all. (This is the same argument the proposal itself made for keeping the now-cancelled recon export out of Alembic.) The snapshot is therefore taken **inside** the database, where it *is* reproducible across environments, and it becomes both the human-gate evidence and the mechanism `downgrade()` uses:

```python
    op.execute("DROP TABLE IF EXISTS client_subscriptions_pre020_bak")
    op.execute(
        "CREATE TABLE client_subscriptions_pre020_bak AS "
        "SELECT user_id, model_id, mgmt_fee_override, incentive_fee_override "
        "FROM client_subscriptions"
    )
```

**Step 1 — `models`, unconditional ÷ 100.** Every row in this table was written by the PC editor, which is percent-scale without exception.

```python
    step1 = conn.execute(
        sa.text(
            "UPDATE models SET mgmt_fee = mgmt_fee / 100, "
            "incentive_fee = incentive_fee / 100"
        )
    ).rowcount
```

**Step 2 — `client_onboardings`: no change.** Already fractions (`app/libs/onboarding/schemas.py:23-24` states "fractions (e.g. 0.015)"). It appears in this unit only for its column comment, below.

**Step 3 — `client_subscriptions`, percent-scale strays.** A fee held as a fraction is `< 1` by definition; a value `>= 1` can only have come from the percent-scale RM allotment path (`app/libs/onboarding/service.py:503-506`).

```python
    step3_mgmt = conn.execute(
        sa.text(
            "UPDATE client_subscriptions SET mgmt_fee_override = mgmt_fee_override / 100 "
            "WHERE mgmt_fee_override >= 1"
        )
    ).rowcount
    step3_inc = conn.execute(
        sa.text(
            "UPDATE client_subscriptions "
            "SET incentive_fee_override = incentive_fee_override / 100 "
            "WHERE incentive_fee_override >= 1"
        )
    ).rowcount
```

> **Ceiling of the `>= 1` heuristic, as stated by the proposal and carried here unchanged:** it misclassifies a genuine fee of 100% or more, which does not occur in this business. Recorded, not defended further. The step-3 row counts go through the human gate precisely so a surprising number is caught by a person.

**Step 4 — `client_subscriptions`, spurious overrides → `NULL`. LOSSY.** Runs strictly **after** steps 1 and 3, so both sides of the comparison are on the same scale. Restores the `NULL = inherit` invariant documented at `app/models/pc.py:219-226`, which the broken compare-and-set at `app/libs/onboarding/service.py:362-365` has violated on every approval.

```python
    # LOSSY: a nulled override is indistinguishable from one that was always
    # NULL. Recoverable only from client_subscriptions_pre020_bak (step 0),
    # which downgrade() reads. See impl doc section 9.
    step4_mgmt = conn.execute(
        sa.text(
            "UPDATE client_subscriptions cs JOIN models m ON m.id = cs.model_id "
            "SET cs.mgmt_fee_override = NULL "
            "WHERE cs.mgmt_fee_override = m.mgmt_fee"
        )
    ).rowcount
    step4_inc = conn.execute(
        sa.text(
            "UPDATE client_subscriptions cs JOIN models m ON m.id = cs.model_id "
            "SET cs.incentive_fee_override = NULL "
            "WHERE cs.incentive_fee_override = m.incentive_fee"
        )
    ).rowcount
```

**Step 5 — row-count logging.** These are the numbers the human gate reviews:

```python
    logger.info("0031 DB-2 step 1  models rescaled:            %s", step1)
    logger.info("0031 DB-2 step 3  mgmt_fee_override rescaled: %s", step3_mgmt)
    logger.info("0031 DB-2 step 3  incentive_override rescaled: %s", step3_inc)
    logger.info("0031 DB-2 step 4  mgmt_fee_override nulled:   %s", step4_mgmt)
    logger.info("0031 DB-2 step 4  incentive_override nulled:  %s", step4_inc)
```

**Step 6 — the unit comments.** Six columns, the first `comment=` values in the repo:

```python
    for table, column in (
        ("models", "mgmt_fee"),
        ("models", "incentive_fee"),
        ("client_onboardings", "mgmt_fee"),
        ("client_onboardings", "incentive_fee"),
        ("client_subscriptions", "mgmt_fee_override"),
        ("client_subscriptions", "incentive_fee_override"),
    ):
        op.alter_column(
            table,
            column,
            existing_type=sa.Numeric(precision=9, scale=6),
            existing_nullable=True,
            comment=_FEE_COMMENT,
        )
```

**ORM half** — the same comment on the declaration, so `--autogenerate` reports no drift. `app/models/pc.py:102-103`:

```python
    mgmt_fee:      Mapped[Decimal | None]  = mapped_column(
        Numeric(9, 6), nullable=True, comment=_FEE_COMMENT
    )
    incentive_fee: Mapped[Decimal | None]  = mapped_column(
        Numeric(9, 6), nullable=True, comment=_FEE_COMMENT
    )
```

with `_FEE_COMMENT = "decimal fraction: 0.020000 = 2% (proposal 020, DB-2)"` defined once per model module. Identical treatment for `app/models/onboarding.py:92-93` and `app/models/pc.py:224-225`.

**`downgrade()` for DB-2:**

```python
    # Steps 3 and 4 reverse together, exactly, from the step-0 snapshot: it
    # holds the pre-migration override values in their original scale.
    op.execute(
        "UPDATE client_subscriptions cs "
        "JOIN client_subscriptions_pre020_bak b "
        "  ON b.user_id = cs.user_id AND b.model_id = cs.model_id "
        "SET cs.mgmt_fee_override = b.mgmt_fee_override, "
        "    cs.incentive_fee_override = b.incentive_fee_override"
    )
    op.execute("DROP TABLE IF EXISTS client_subscriptions_pre020_bak")
    # Step 1 reverses by multiplication.
    op.execute(
        "UPDATE models SET mgmt_fee = mgmt_fee * 100, incentive_fee = incentive_fee * 100"
    )
    # comments back to NULL
    ...  # op.alter_column(..., comment=None) for the same six columns
```

**Behavior / invariants:**

- **No type change.** All six columns stay `Numeric(9, 6)`.
- Step 4 must never run before steps 1 and 3 — comparing a fraction against a percent yields zero matches and the whole correction silently no-ops.
- `client_onboardings` rows are never rescaled. Any statement in this unit that touches `client_onboardings.mgmt_fee` values is a bug.
- Steps 1 and 3 are **not** idempotent — a second run divides by 100 again. The revision is protected by alembic's own version table, not by a guard; the guard is that the human gate reviews the counts before commit. Named here so nobody "helpfully" re-runs the SQL by hand.
- A pre-condition self-assertion runs before step 0: `client_subscriptions_pre020_bak` must not already exist as a *populated* leftover from an aborted run — the `DROP TABLE IF EXISTS` handles it, and `_require` confirms the snapshot row count equals `client_subscriptions`' row count immediately after creation.

**Done when:** on a scratch DB seeded with a percent-scale `models` row and a mixed-scale `client_subscriptions` pair, `upgrade()` leaves every fee value `< 1`, leaves overrides equal to their model default as `NULL`, logs five non-negative counts, and `downgrade()` restores every override byte-for-byte from the snapshot and every `models` fee to its original value.

---

### DB-3 — Strip bucket prefixes from three `storage_key` columns (Yes — user req.)

- **Proposal ref:** § Layer 1 **B-2**
- **Module:** §5.2 revision `0031`
- **Files:** `modify: api-backend/alembic/versions/a3f7c1d9e824_0031_schema_format_cleanup.py`
- **Dependencies:** DB-1 (rollback verifiability). Independent of DB-2 and DB-5.

**Contract (required code):**

Three columns lose their leading group segment; the fourth is deliberately untouched. Prefixes verified against the writers: `app/libs/trade_models/service.py:349` (`subdir="models_mrkt_materials"`), `app/libs/onboarding/service.py:247` (`subdir=f"client_kyc_docs/{...}"`), `app/libs/onboarding/service.py:897` (`subdir=f"client_contact_logs/{client_id}"`).

```python
    # --- DB-3: bucket-relative storage keys (proposal 020, B-2) --------------
    # Each UPDATE is LIKE-guarded, so it is idempotent and safe to re-run after
    # a partial failure. eod_records.file_storage_key is NOT touched: EoD writes
    # "{YYYY-MM}/" straight at the shared root (app/libs/eod/service.py:130-135),
    # so its values are already bucket-relative.
    db3 = {}
    db3["model_materials"] = conn.execute(
        sa.text(
            "UPDATE model_materials "
            "SET storage_key = SUBSTRING(storage_key, LENGTH('models_mrkt_materials/') + 1) "
            "WHERE storage_key LIKE 'models_mrkt_materials/%'"
        )
    ).rowcount
    db3["onboarding_documents"] = conn.execute(
        sa.text(
            "UPDATE onboarding_documents "
            "SET storage_key = SUBSTRING(storage_key, LENGTH('client_kyc_docs/') + 1) "
            "WHERE storage_key LIKE 'client_kyc_docs/%'"
        )
    ).rowcount
    db3["client_contact_logs"] = conn.execute(
        sa.text(
            "UPDATE client_contact_logs "
            "SET doc_storage_key = SUBSTRING(doc_storage_key, LENGTH('client_contact_logs/') + 1) "
            "WHERE doc_storage_key LIKE 'client_contact_logs/%'"
        )
    ).rowcount
    for table, n in db3.items():
        logger.info("0031 DB-3  %s keys stripped: %s", table, n)

    _require(
        conn.execute(
            sa.text(
                "SELECT COUNT(*) FROM model_materials "
                "WHERE storage_key LIKE 'models_mrkt_materials/%'"
            )
        ).scalar()
        == 0,
        "model_materials still holds prefixed storage_key values",
    )
    # ... same post-condition for the other two columns
```

`downgrade()` re-prepends, equally guarded:

```python
    op.execute(
        "UPDATE model_materials SET storage_key = CONCAT('models_mrkt_materials/', storage_key) "
        "WHERE storage_key IS NOT NULL AND storage_key NOT LIKE 'models_mrkt_materials/%'"
    )
    # ... likewise 'client_kyc_docs/' and 'client_contact_logs/'
```

**Behavior / invariants:**

- **`eod_records.file_storage_key` (`app/models/eod.py:62`) is out of scope and must not appear in any statement of this unit.** It has no prefix to strip; touching it would corrupt the only column that was already correct.
- Every UPDATE is `LIKE`-guarded and therefore idempotent: re-running after a partial failure is a no-op on already-stripped rows. This is the property that makes DB-3 safe in the maintenance window where the directory move may have to be retried.
- `NULL` keys are left `NULL` — `LIKE` does not match `NULL`, and the downgrade's `IS NOT NULL` guard mirrors that.
- The resulting keys are bucket-relative per §7.1(b): the bucket is derived from the calling context, never parsed from the key.
- **Deploy-time pairing (schedule's concern, stated here because it constrains correctness):** the physical directory move (`crm_filesystem/models_mrkt_materials/*` → the marketing bucket root, and so on) and this UPDATE must be adjacent. Downloads 500 in the window between them. The migration must not run before the move.

**Done when:** on a scratch DB seeded with one prefixed and one already-stripped row per column, `upgrade()` strips exactly the prefixed ones, leaves the stripped ones and every `NULL` untouched, leaves `eod_records.file_storage_key` bit-identical, and a second `upgrade()` of the same statements changes zero rows.

---

### DB-4 — WITHDRAWN (no work unit)

- **Proposal ref:** § Layer 1 **B-3** — which now reads "**Refactor: none. No DDL, no data change.**"
- **Status:** withdrawn before implementation. **The ID is retired, not reused** — DB-5 keeps its number so the sibling `-be` / `-fe` docs and the execution schedule keep resolving.

This unit was to export and then drop `recon_sessions`, `algotrade_orders` and `algotrade_executions`. It is withdrawn because `recon_sessions` is **live storage for the EoD path**, not dead surface. The dependency evidence is in §1.1(3): `app/libs/eod/repository.py:15,25` queries `ReconSession` through `sessions_for_trade_date`; `app/libs/eod/presenter.py:7-12,19` and `app/libs/eod/service.py:15,35,105` reach further into the `reconciliation` package's adapters, DTOs, formatting and `engine.reconcile`; and `app/libs/post_trade_allocation/service.py:19,155,163` imports `algotrade.synth`. EoD serves three live routes and the PTA run path is live, so the drop would have broken a feature this branch is not otherwise touching. The human decision is recorded as proposal **D-12**: delete only the two dead recon routes and the router mount, keep everything below the router, do not drop the table. Backend C-5 is narrowed to match.

Consequently **this layer contributes no DDL and no data change for B-3.** `recon_sessions`, its composite `fk_recon_sessions_allocation_model_snapshot` (`app/models/recon.py:54-62` — still the only `ForeignKeyConstraint` in the models package), and the write-only `allocation_user_id` column all survive this branch untouched, as does `app/models/recon.py` itself. Three questions go to the future reconciliation rework rather than being answered here: whether `recon_sessions` survives at all; whether `allocation_model_snapshots` wants the surrogate PK that proposal D-2 withdrew (its composite PK `(period_id, user_id, model_id)` is untouched by this branch, and no statement in the new revision may reference that table); and what becomes of `allocation_user_id`, which is dead weight today and should not be carried into a new design without a reason.

**Done when:** n/a — there is nothing to build. The checkable condition is negative and is carried in §9's definition of done: the new revision contains no `drop_table`, and `app/models/recon.py` is unmodified on this branch.

---

### DB-5 — `client_profiles`: drop `id`, promote `user_id` to primary key (Accepted)

- **Proposal ref:** § Layer 1 **B-4**
- **Module:** §5.2 revision `0031`; §5.3 ORM
- **Files:** `modify: api-backend/alembic/versions/a3f7c1d9e824_0031_schema_format_cleanup.py`, `api-backend/app/models/users.py` (`:143-149`)
- **Dependencies:** DB-1. Independent of DB-2 and DB-3.

**Contract (required code):**

Current shape at `app/models/users.py:146-149`:

```python
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("users.id"), unique=True, index=True
    )
```

Target shape:

```python
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(native_uuid=False), ForeignKey("users.id"), primary_key=True
    )
```

`unique=True` and `index=True` are both dropped from the declaration — a primary key is unique and indexed by definition, and leaving them would make `--autogenerate` propose a redundant index forever. `id` is deleted outright.

**Step 1 — verify no inbound FK before dropping.** The model shows none, and the check is cheap while the drop is not reversible without data. Reuses the `information_schema` introspection idiom from `8f2a1c9d4b6e:44-58`:

```python
    inbound = conn.execute(
        sa.text(
            "SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE "
            "WHERE TABLE_SCHEMA = DATABASE() "
            "AND REFERENCED_TABLE_NAME = 'client_profiles' "
            "AND REFERENCED_COLUMN_NAME = 'id'"
        )
    ).scalar()
    _require(inbound == 0, f"client_profiles.id has {inbound} inbound FK(s); cannot drop")
```

**Step 2 — the MySQL PK swap.** `id` is `INT AUTO_INCREMENT PRIMARY KEY` (`79729eec2af4_0002:39`). An AUTO_INCREMENT column must remain part of a key, so the attribute is stripped in its own statement first — exactly the manoeuvre `8f2a1c9d4b6e:117-124` performs on `users.id`:

```python
    op.execute("ALTER TABLE client_profiles MODIFY COLUMN id INT NOT NULL")
    op.execute(
        "ALTER TABLE client_profiles "
        "DROP PRIMARY KEY, "
        "DROP COLUMN id, "
        "ADD PRIMARY KEY (user_id)"
    )
    # ux_client_profiles_user_id (created at 8f2a1c9d4b6e/0003:142) is now
    # redundant with the PK. Drop it only AFTER the PK exists, so
    # fk_client_profiles_user (0003:143) is never left without a backing index
    # -- the same 1553 hazard DB-1 fixes in 0027.
    op.execute("ALTER TABLE client_profiles DROP INDEX ux_client_profiles_user_id")
```

**Step 3 — post-condition self-assertions:**

```python
    pk_cols = [
        r[0]
        for r in conn.execute(
            sa.text(
                "SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'client_profiles' "
                "AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION"
            )
        ).fetchall()
    ]
    _require(pk_cols == ["user_id"], f"client_profiles PK is {pk_cols}, expected ['user_id']")
```

plus a row-count comparison against a count taken before step 2, and a re-check that `fk_client_profiles_user` still resolves (the `_fk_name`-style lookup from `8f2a1c9d4b6e:44-58`).

`downgrade()`:

```python
    op.execute("ALTER TABLE client_profiles ADD UNIQUE KEY ux_client_profiles_user_id (user_id)")
    op.execute(
        "ALTER TABLE client_profiles "
        "DROP PRIMARY KEY, "
        "ADD COLUMN id INT NOT NULL AUTO_INCREMENT FIRST, "
        "ADD PRIMARY KEY (id)"
    )
```

Order matters in both directions: the unique key is re-added **before** the PK is dropped, so `fk_client_profiles_user` always has an index behind it.

**Behavior / invariants:**

- Per proposal D-9 this is a **drop**, not a UUID conversion: the underlying intent ("no `int` keys left in the portal schema") is satisfied by deleting an unreferenced column, which is strictly less work than migrating one.
- `user_id` is already `NOT NULL` with a unique key (`8f2a1c9d4b6e:140-144`), so promoting it needs no backfill and no null check.
- **Reversible in schema, not in values.** `downgrade()` restores an `INT AUTO_INCREMENT` `id` column, but MySQL renumbers it from 1 in physical row order — the original integers are gone. Nothing reads them: the only site that names the column is a comment at `app/libs/client_portal/service.py:120-124` explaining why `_require_profile` uses `filter_by(user_id=...)` rather than `session.get()`. Named here rather than left for someone to discover at rollback.
- Proposal B-4 step 3 asks that the stale frontend `PortalUser.id` reference recorded in `FRONTEND_FOLLOWUP_005.md` be confirmed gone first. That confirmation is an **FE-layer precondition on the deploy**, not a DB code change, and is handed to the execution schedule; this branch cannot see frontend code.
- The `# ponytail:` comment at `app/libs/client_portal/service.py:120-124` becomes stale once this lands (it asserts `id` is the actual PK). Correcting it is a BE-layer edit, listed in §7.2 as an assumption, not owned here.

**Done when:** on a scratch DB, `upgrade()` leaves `client_profiles` with a single-column primary key on `user_id`, no `id` column, no `ux_client_profiles_user_id` index, an intact `fk_client_profiles_user`, and an unchanged row count; `downgrade()` restores an `INT AUTO_INCREMENT` `id` primary key with `user_id` unique again.

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal § 4. Cross-layer seam (frozen here) § 4.1)

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

### 7.2 How this layer honours the seam

**What this layer contributes:**

- **§7.1(a) — fee unit.** Every fee column stays `Numeric(9, 6)`; DB-2 rescales the rows that were on the percent scale and writes the canonical unit into each of the six columns' `comment`, so the seam is legible from `SHOW FULL COLUMNS` and not only from this document. After DB-2, `models.mgmt_fee = 0.020000` means 2% with no exceptions, and `client_subscriptions.mgmt_fee_override IS NULL` means "inherit the model default" with no exceptions.
- **§7.1(b) — bucket-relative keys.** DB-3 removes the leading group segment from `model_materials.storage_key`, `onboarding_documents.storage_key` and `client_contact_logs.doc_storage_key`, so the stored value contains no bucket name and can be joined to a bucket root by simple concatenation. `eod_records.file_storage_key` already satisfies the seam and is deliberately untouched — the `REPORTS` bucket's keys keep their `{YYYY-MM}/` shape.
- **No dropped tables.** The proposal's **§4.2** obligation row for this layer still reads "drops the dead recon tables"; that clause is **stale and this layer does not honour it**, because proposal D-12 withdrew the drop (§1.1(3)). It is outside the §7.1 text copied above, so correcting it is a proposal-side edit, not a §7.3 seam change — but it is named here so a reviewer comparing the two documents does not read the omission as a miss. None of the three recon tables carries a `*storage_key` column, so the seam's six-bucket map is unaffected either way.
- **§7.1(c) — error envelope.** Nothing. The database layer emits no HTTP responses and contributes nothing to this clause. It is reproduced above because §7 is a verbatim copy, not a filtered one.

**What this layer assumes from the other side** (used as the assumption for §8's tests, never as a runtime dependency on sibling code):

- The **Backend** never writes a percent-scale fee. Once `Field(ge=0, lt=1)` lands (proposal § Layer 2 C-2), a percent-scale value is rejected at the door; until it does, DB-2's correction can be re-broken by the next write. DB-2's rescale is a one-shot correction, not a standing guard — the guard is the Backend's.
- The **Backend** derives the bucket from the calling context and never parses it out of the key. DB-3 removes the only information a key-parsing implementation could have used, so a sibling that still parses will break loudly rather than silently — which is the intended failure mode.
- The **Backend** leaves the `reconciliation` package's internals in place below the router, per D-12, and deletes only the two dead routes. This layer now assumes nothing about that beyond it: with DB-4 withdrawn, no schema object this layer owns depends on what the BE layer does to reconciliation.
- The **Backend** stops asserting that `client_profiles.id` is the primary key — `app/libs/client_portal/service.py:120-124`'s comment goes stale with DB-5, and `_require_profile`'s `filter_by(user_id=...)` becomes a plain PK lookup.
- The **Frontend** no longer reads `PortalUser.id` (`FRONTEND_FOLLOWUP_005.md`), per proposal B-4 step 3.

### 7.3 Change protocol

§7.1 is a verbatim copy of the proposal's frozen seam and is **never edited in this file**. If the seam has to change mid-implementation — and §1.1(3) is a live candidate, since the EoD dependency on `recon_sessions` may force a change to what "the dead recon surface" means — the change goes to `docs/proposals/020-2026-08-03-schema-format-cleanup-refactor.md` § 4 first, as a new revision or a dated addendum per its own § 4.3. Only then is §7.1 re-copied here, and into the `-be` and `-fe` docs' §7 **in the same change set**. The seam is never renegotiated directly between two implementation docs, and never lives in only one place. Verification of this section is against the proposal on the parent branch, not against a sibling layer's branch — sibling branches are not visible here.

---

## 8. Internal unit testing

### 8.1 Test setup

- **Framework / runner:** `pytest` — command `.\.venv\Scripts\python.exe -m pytest -q`, run from `api-backend/`.
- **Fixtures / seed:** migration tests in this repo run **real `alembic` up- and down-grades against a live MySQL database** — that is how the `0027` downgrade defect was found in the first place, and an in-memory SQLite double would not have found it (SQLite has no error 1553, no `DROP PRIMARY KEY` restriction and no AUTO_INCREMENT-must-be-a-key rule). Every goal below therefore assumes a disposable MySQL schema reachable via `DATABASE_URL`, seeded by direct `INSERT` before the revision under test is applied. Row-level goals seed the minimum rows the statement touches; nothing depends on production-shaped data.
- **Isolation:** each test owns its schema state — it stamps or migrates to a known revision, seeds, runs the step, asserts, and leaves the schema at a known revision. Tests that share one MySQL schema are **not** parallel-safe and must be marked as such; this is a property of the fixture, not something to design around.
- **Layer isolation:** tests import only from `app.models.*`, `alembic`, `sqlalchemy` and the standard library. No test imports `app.libs.*`, stands up FastAPI, or asserts anything about an HTTP response — §7.1(c) is not this layer's to prove. Where a goal needs the other side of the seam, it is expressed as a **fact about column values**, not as a call into sibling code, so no seam mock is needed for any unit in this doc (see the matrix).
- **Test location:** `api-backend/tests/`, mirroring the source path. Never co-located next to source.
- **Commit policy:** tests are **never committed** — `api-backend/.gitignore:28` already ignores `/tests/`. They are generated, run locally as a pre-hand-off gate, and never staged.
- **Code generation:** the concrete test code is written by the `test-gen` skill from the goals in §8.2/§8.3. **This document contains no test code by design.**

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| DB-1 | `alembic downgrade base` completes from head `c72e91a4f6b3` with no MySQL error; `alembic upgrade head` then completes; the 19 pre-existing migration failures/errors go green with no test file edited; no other revision in `alembic/versions/` drops an index before the FK that depends on it | none |
| DB-2 | Percent-scale `models` rows become fractions; `client_subscriptions` overrides `>= 1` are rescaled and those `< 1` are not; an override equal to its model default becomes `NULL` **after** the rescale; `client_onboardings` values are unchanged; five row counts are logged; the six columns carry the unit comment; `downgrade()` restores overrides exactly from the snapshot and `models` by multiplication | none |
| DB-3 | Prefixed keys in the three columns lose exactly their group segment; already-stripped keys and `NULL`s are untouched; `eod_records.file_storage_key` is untouched; re-running the statements changes zero rows; `downgrade()` re-prepends exactly the three prefixes | none |
| DB-4 | **Withdrawn — no unit, no tests.** The only assertion carrying its intent is negative and belongs to DB-2/DB-3/DB-5's shared migration fixture: after `upgrade()`, `recon_sessions`, `algotrade_orders` and `algotrade_executions` all still exist | none |
| DB-5 | `client_profiles` ends with a single-column PK on `user_id`, no `id`, no redundant unique key, an intact `fk_client_profiles_user` and an unchanged row count; the inbound-FK pre-check aborts the migration when an inbound FK exists; `downgrade()` restores an `INT AUTO_INCREMENT` `id` PK | none |

### 8.3 Test goals (per unit)

#### DB-1

- **Positive:** from a database at head `c72e91a4f6b3`, a full `alembic downgrade base` runs to completion, and a subsequent `alembic upgrade head` returns the schema to head. This round trip **is** the unit's acceptance criterion; a test that only inspects the ordering of the two `drop_constraint` calls in the source file proves nothing about MySQL and must not be written in its place. Additionally, the round trip crossing revision `b34f8c1a9d27` specifically must be exercisable in isolation (upgrade to `b34f8c1a9d27`, downgrade one step, upgrade one step) so a future regression is attributed to the right revision.
- **Negative:** the failure this unit removes must be characterised, not merely absent. Against the pre-fix ordering, the downgrade across `0027` fails with a MySQL operational error naming the index; after the fix it does not. If the pre-fix ordering turns out **not** to fail on the MySQL version under test (the §6 honest note explains why that is possible — the FK's own auto-created index may satisfy the dependency), the goal is downgraded from "reproduce then fix" to "the round trip is green", and the discrepancy is recorded in this document rather than papered over by an assertion that happens to pass.
- **Invariants:** the fix is code-only — no row in any table changes as a result of DB-1, and `client_tickets` after `upgrade → downgrade → upgrade` is structurally identical to `client_tickets` after a single `upgrade`. Across the whole `alembic/versions/` directory, no `downgrade()` body drops an index or unique constraint before a foreign key defined on the same column.
- **Seam mocks:** none. DB-1 touches no seam clause.

#### DB-2

- **Positive:** seed `models` with a known percent-scale pair (e.g. mgmt 2.0, incentive 20.0) and assert they become 0.020000 and 0.200000. Seed `client_subscriptions` with one percent-scale override (`>= 1`), one fraction-scale override (`< 1`) and one already-`NULL`, and assert only the first is divided. Seed a subscription whose override, after rescaling, exactly equals its model's default and assert it ends `NULL`; seed one that differs and assert it survives. Seed `client_onboardings` and assert its values are bit-identical afterwards. Assert the migration emits five row-count log records at INFO on the `alembic.runtime.migration` logger, and that each count matches the number of rows the corresponding statement actually changed. Assert all six columns report the unit comment through `information_schema.COLUMNS`, and that the ORM declarations carry the same string so `--autogenerate` sees no difference.
- **Negative:** ordering must be observably load-bearing — with step 4 executed before steps 1 and 3, the spurious-override nulling matches nothing, and a test must demonstrate that the shipped order does not exhibit that behaviour. The pre-condition `_require` must abort with a `RuntimeError` when the step-0 snapshot's row count does not equal `client_subscriptions`' row count, and the abort must leave no partially rescaled rows behind. A `downgrade()` run when `client_subscriptions_pre020_bak` is missing must fail loudly rather than silently leaving nulled overrides in place.
- **Invariants:** every fee value in `models`, `client_onboardings` and `client_subscriptions` is `< 1` after `upgrade()`, for any seed. No fee column's type or nullability changes. `upgrade()` followed by `downgrade()` returns every one of the six columns' values to their seeded state — this is a property worth exercising over several seeded scale mixtures, not just one. Conversely, running the raw step-1 and step-3 SQL twice is **not** idempotent and a test should pin that fact, so nobody later "fixes" it by adding a guard that would break the downgrade's arithmetic.
- **Seam mocks:** none. The §7.1(a) fee unit is proven as a fact about column values; no Backend DTO is constructed and no HTTP layer is involved.

#### DB-3

- **Positive:** per column, seed one prefixed key, one key that is already bucket-relative, and one `NULL`; assert exactly the prefixed one is shortened, that what remains is the original key minus exactly the group segment and its trailing slash (not a fixed character count — the assertion should be expressed against the seeded suffix), and that the other two rows are untouched. Assert each column's post-condition `_require` passes, i.e. zero rows still match the prefix pattern. Assert the three log records report the counts actually changed.
- **Negative:** a key that merely *contains* the group name later in the path (e.g. a client folder literally named `client_kyc_docs`) must not be modified — only a leading segment counts. A row whose key is exactly the prefix with nothing after it is a degenerate case and its resulting value must be characterised rather than left to chance. `eod_records.file_storage_key` must be provably untouched: seed it with a `{YYYY-MM}/` key and assert byte equality after `upgrade()`.
- **Invariants:** **idempotency is the headline property** — running the three UPDATEs a second time changes zero rows, for any seed, which is what makes a partial failure in the deploy window safe to retry. `upgrade()` followed by `downgrade()` restores every key byte-for-byte, including the ones that were already stripped before the migration (the downgrade's `NOT LIKE` guard is what makes this true, and it deserves its own case). `NULL` in, `NULL` out.
- **Seam mocks:** none. §7.1(b) is proven as a fact about stored strings; no `Bucket` enum and no `get_storage()` from the Backend layer is imported, and no test may reference them.

#### DB-4

- **Withdrawn — `test-gen` generates nothing for this ID.** Retained as a heading only so the numbering matches §6 and the sibling docs.
- **The one thing worth asserting** is that the withdrawal held, and it costs a single check inside the existing migration fixture rather than a block of its own: after the new revision's `upgrade()`, `recon_sessions`, `algotrade_orders` and `algotrade_executions` all still exist, and `allocation_model_snapshots` still carries its composite primary key `(period_id, user_id, model_id)` with an unchanged row count. That guards both D-12 and the withdrawn surrogate-PK item (D-2) against a future edit that quietly reinstates the drop. Fold it into DB-2's or DB-5's fixture; it does not deserve its own test module.
- **Seam mocks:** none — and explicitly, no test in this layer may import `app.libs.eod`, `app.libs.post_trade_allocation` or `app.libs.reconciliation` to inspect the consumer side of §1.1(3). Those imports are what made the withdrawal necessary; reaching for them here would break layer isolation to re-prove a decision that is already settled in the proposal.

#### DB-5

- **Positive:** seed several `client_profiles` rows; after `upgrade()`, the table's primary key is exactly `["user_id"]`, the `id` column is absent, `ux_client_profiles_user_id` is absent, `fk_client_profiles_user` still resolves against `users.id`, and the row count is unchanged. Every seeded row is still reachable by its `user_id` with all its other column values intact.
- **Negative:** the inbound-FK pre-check must actually guard — with a temporary table carrying a foreign key onto `client_profiles.id`, `upgrade()` raises `RuntimeError` with the assertion message and does **not** drop the column. The post-condition assertion must likewise fire if the PK ends up as anything other than `["user_id"]`. Both aborts must leave the table usable rather than half-altered, which is why the AUTO_INCREMENT strip is a separate statement — a test that seeds and then triggers the pre-check should confirm `id` is still present and still a key afterwards.
- **Invariants:** row count and every non-`id` column value are preserved across `upgrade()`, across `downgrade()`, and across a full `upgrade → downgrade → upgrade` cycle. `user_id` is `NOT NULL` and unique at every point in that cycle, and `fk_client_profiles_user` never exists without a backing index — the ordering property that DB-1 exists to enforce elsewhere applies to this unit's own statements and should be exercised, not assumed. The one thing that is **not** invariant, and must be asserted as such rather than accidentally relied on: `id` values after a `downgrade()` are renumbered from 1 and do not match the originals.
- **Seam mocks:** none.

### 8.4 Aggregate gate

- All unit tests green is a **local gate** run before commit / PR hand-off (§3.2). A red test blocks the unit. The tests themselves are never committed — `api-backend/.gitignore:28` ignores `/tests/` — so this gate runs on the implementer's or orchestrator's machine, not from repo-committed CI.
- Target coverage for changed lines: **100% of the new revision's statements**, which is achievable and meaningful here because the revision is a linear script — every `op.execute` either runs in the up path or it does not. Coverage of the ORM edits is incidental; they are declarations.
- Chosen `test-gen` level for this layer: **`thorough`.** One unit is irreversible in part (DB-2 step 4) and one performs primary-key surgery on a live table (DB-5); the boundary and invalid-input classes that `thorough` adds are exactly where those two fail badly rather than loudly. The withdrawal of DB-4 removed the layer's other destructive unit but does not change this call. The human or orchestrator may lower it before dispatch, but the risk argument should be answered if they do.

---

## 9. Definition of done & rollback

**Definition of done (this layer):**

- [ ] DB-1 committed as its own commit; DB-2, DB-3 and DB-5 committed into `api-backend/alembic/versions/a3f7c1d9e824_0031_schema_format_cleanup.py`. Each commit left the branch green.
- [ ] **DB-4 stayed withdrawn:** the new revision contains no `drop_table`, `recon_sessions` / `algotrade_orders` / `algotrade_executions` all still exist after `upgrade()`, `allocation_model_snapshots` still has its composite PK, and `git diff` shows `api-backend/app/models/recon.py` unmodified.
- [ ] ORM edits in `app/models/pc.py`, `app/models/onboarding.py`, `app/models/users.py` match the post-migration schema — `alembic revision --autogenerate` against a migrated scratch DB produces an empty revision.
- [ ] `alembic downgrade base && alembic upgrade head` completes against a scratch MySQL database from this branch's head. This is proposal Goal 9 and the thing DB-1 exists to make possible.
- [ ] §8 unit tests all pass; the §3.2 gate is green, with the `pytest -q` caveat in §3.2 understood and stated in the PR description.
- [ ] §7.1 is byte-identical to the proposal's § 4.1 on the parent branch. Checked against the proposal, **not** against the sibling layers' branches, which are not visible here.
- [ ] §1.1's three source-verification notes are all closed: (1) and (2) are now stated in the corrected proposal B-5, and (3) resolved to D-12 / DB-4 withdrawn. The two residual proposal-side inconsistencies §1.1(3) names — the stale §4.2 Database row and the missing D-12 entry in the settled-decisions list — are raised with whoever owns the next proposal revision, not silently carried.
- [ ] PR opened. The human owns the merge to the parent branch and to `main`.

**Rollback:**

With DB-4 withdrawn, **DB-2 step 4 is the only lossy item in this layer.** Everything else reverts, with the two value-level caveats named below. That is a materially better rollback story than the proposal originally carried, and it is worth stating plainly rather than leaving a reader to infer it from the absence of a section.

*Reverts cleanly with `alembic downgrade`:*

- **DB-1** — code-only. Reverting the commit restores the broken ordering; no data or schema state depends on it either way.
- **DB-3** — the three `CONCAT` statements in `downgrade()` re-prepend exactly the prefixes that were stripped, guarded by `NOT LIKE` so rows that were already bucket-relative before the migration are not given a prefix they never had. Fully reversible. **Caveat that is not the migration's to solve:** the physical directory move that pairs with this unit is a deploy-time `mv` and must be reversed by hand in the same maintenance window, or downloads break in exactly the way §6 describes.
- **DB-5** — `downgrade()` restores an `INT AUTO_INCREMENT` `id` primary key and the `user_id` unique key. Schema-identical. **Values are not:** MySQL renumbers `id` from 1. Nothing reads the column (§6), so this is recorded as a known, accepted difference rather than as a loss.
- **DB-2 steps 1 and 3** — pure scale arithmetic; step 1 reverses by multiplying `models` fees by 100, and step 3 is subsumed by the snapshot restore below.

*Not applicable:*

- **DB-4** — withdrawn (§1.1(3), proposal D-12). It contributes no DDL, so it has nothing to roll back and no data at risk. The recon export artifact `backups/recon-pre-020-{YYYYMMDD}.sql` and the human gate that guarded it are both **gone from this layer's deploy path** — do not carry them into the execution schedule.

*Lossy — name the data and the artifact:*

- **DB-2 step 4 — nulled `mgmt_fee_override` / `incentive_fee_override`.**
  - **At risk:** for every `client_subscriptions` row whose override happened to equal its model's default, the fact that an override row *existed*. Once nulled, it is indistinguishable from a subscription that always inherited. The values themselves are recoverable; the distinction between "explicitly set to the default" and "never set" is not, from the table alone.
  - **Mitigation artifact:** `client_subscriptions_pre020_bak`, created as the **first statement** of `upgrade()` (`CREATE TABLE … AS SELECT user_id, model_id, mgmt_fee_override, incentive_fee_override FROM client_subscriptions`), and read by `downgrade()` to restore every override exactly, in its original scale. **This is a deliberate deviation from the proposal's wording**, which asks for "the pre-migration table dumped to a timestamped backup"; the reason is the one the proposal itself gave for keeping the (now-cancelled) recon export out of Alembic — a migration that writes a file outside the database is not reproducible across environments. An in-database snapshot is, and it has the additional property that `downgrade()` can actually use it.
  - **Residual loss, stated plainly:** the snapshot makes step 4 recoverable **only through this revision's own `downgrade()`, and only while the snapshot table exists.** If the schema is restored from an external backup, or if the snapshot is dropped by a later cleanup, or if `downgrade()` is skipped in favour of hand-written SQL, the nulled overrides are gone. The proposal is right to call step 4 lossy; this implementation narrows the window rather than closing it. The second mitigation is procedural and non-negotiable: the step-4 row counts (§6 DB-2 step 5) go through the human gate **before the transaction is committed**.
