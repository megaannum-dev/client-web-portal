# 020 — Schema / Format Cleanup Refactor · Implementation Details — Backend

> Status: **DRAFT — pending implementation.**
> Implements: `docs/proposals/020-2026-08-03-schema-format-cleanup-refactor.md` § **Layer 2 — Backend** (A, A-1, A-2, A-3, B, B-1, B-2, C-1 … C-6) and the **backend half of § Layer 4 — Test baseline** (B-1, B-2).
> Layer: **Backend** — one layer per file. Layer 4's frontend items (B-3, B-4, B-5) belong to the sibling FE doc and are **not** specified here.
> Sibling layer docs: `docs/implementations/020-schema-format-cleanup-refactor-db.md`, `docs/implementations/020-schema-format-cleanup-refactor-fe.md`
> Execution schedule: `docs/execution-schedules/020-schema-format-cleanup-refactor-be.md`
> Branch: `schema-repository-refactor-bugfix-be`
> Builds on / prerequisites: proposal 020 §4 (the frozen seam) is agreed and copied verbatim into §7.1. Working directory for every command in this doc is `api-backend/`, using the checked-in virtualenv at `api-backend/.venv/` — the system Python has none of the dependencies installed.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/020-2026-08-03-schema-format-cleanup-refactor.md` § Layer 2 — Backend, and § Layer 4 B-1 / B-2 |
| Execution schedule | `docs/execution-schedules/020-schema-format-cleanup-refactor-be.md` |
| Sibling layer impl docs | `docs/implementations/020-schema-format-cleanup-refactor-db.md`, `docs/implementations/020-schema-format-cleanup-refactor-fe.md` |
| Frozen seam | proposal § 4.1 (a) fee unit, (b) storage bucket enum, (c) error envelope — reproduced verbatim in §7.1 |
| Builds on | current `main` (`f76d0a4`); alembic head `c72e91a4f6b3`; commit `ab1823a` (deleted `ROLE_ACTIONS` / `get_actions_for_role`); migration `0027` (`TicketStatus.CLOSED` → `RESOLVED`) |
| Settled decisions consumed | D-3 (one root per group), D-4 (bucket derived from context), D-5 (envelope at the handler layer), D-7 (PTA over-allocation stays failing), D-10 (slug folder resolved by uid suffix), **D-12** (routes only: the reconciliation internals and `recon_sessions` are retained) |

---

## 2. Branch & session contract

- **Branch:** `schema-repository-refactor-bugfix-be` — every unit in this doc lands on this one branch.
  - Convention: parent branch + `-be`. The parent is captured at session start (`git rev-parse --abbrev-ref HEAD`); this layer branch is cut from it and merges back into it. **The human owns that merge** — agents stop at "PR opened".
- **Isolation:** this layer is implementable in a fresh session on its own branch, in parallel with the DB and FE layers. It shares state with them **only** through the frozen seam in §7.

- **Preconditions (must be true before starting):**
  - [ ] The §7 seam is agreed at proposal level (proposal §4.1 is frozen). §7.1 here is a verbatim copy of it, not a negotiation with a sibling layer.
  - [ ] `api-backend/.venv/` exists and resolves `ruff`, `mypy`, `pytest`, FastAPI and SQLAlchemy (`.\.venv\Scripts\python.exe -c "import fastapi, sqlalchemy"`).
  - [ ] A MySQL instance reachable at `DATABASE_URL` for the tests that need one (creds `portal/portalsecret`); alembic head is `c72e91a4f6b3`.
  - [ ] `git status` clean on the parent branch.

  **Not preconditions, deliberately.** The DB layer's fee migration is **not** a precondition. BE-13 and BE-14 are written against the seam's statement that fees are decimal fractions (§7.1(a)); on this branch that is an **assumption**, mocked in tests (§8.3 BE-13/BE-14), never a runtime dependency on the DB branch. Likewise the bucket directories on disk are created by `LocalStorage.__init__` (`mkdir(parents=True, exist_ok=True)`), so no deploy step gates this layer either. Sibling branches are not visible here and no unit may wait on one.

- **Read-first inventory** (every existing file a unit touches):
  - `app/main.py` — router mounts (:26, :75), no exception handlers today (:59-82). BE-4, BE-9.
  - `app/core/config.py` — `storage_root` (:19), `legal_docs_subdir` (:20), `client_statements_subdir` (:21), `recon_notional_epsilon` (:27). BE-4, BE-5.
  - `app/core/security.py` — `detail=str(exc)` at :134-136 and :163-165; `400` at :128-130. BE-10, BE-11.
  - `app/libs/trade_models/storage.py` — the module being moved; `LocalStorage.open()` at :75-77; `get_storage()` at :136-143. BE-5, BE-6.
  - `app/libs/trade_models/service.py` — `subdir="models_mrkt_materials"` at :345-350; `FileStorage` injected at :73. BE-7.
  - `app/libs/trade_models/router.py` — `Depends(get_storage)` at :44 (imports at :19); undeclared `GET /models/{model_id}` at :82; `422` at :148-151. BE-7, BE-10, BE-16.
  - `app/libs/trade_models/schemas.py` — fee fields at :72-73 (`ModelCreate`), :90-91 (`ModelUpdate`), :114-115 (`ModelOut`). BE-14.
  - `app/libs/onboarding/service.py` — KYC save at :243-248; compare-and-set at :362-365 and :503-506; contact-log save at :893-898. BE-7, BE-13.
  - `app/libs/onboarding/repository.py` — `client_folder_name()` at :265-277 (the builder to extract). BE-8.
  - `app/libs/eod/service.py` — `subdir=month_subdir` at :130-136. BE-7.
  - `app/libs/client_portal/service.py` — `model_material_stream` at :257-263; `_scope_subdir` at :266-275; `list`/`open` at :279, :285, :289. BE-7, BE-15.
  - `app/libs/client_portal/router.py` — `GET /client/models/{model_id}/material` at :104-115. BE-15.
  - `app/libs/client_portal/repository.py` — `positions_for_client` at :46-54 (sibling of the new `has_subscription`). BE-15.
  - `app/libs/access/service.py` — dict `detail` at :95-98; `500` at :125, :237, :266. BE-10, BE-12.
  - `app/libs/auth/deps.py` — `403` at :32 and :40. BE-10.
  - `app/libs/auth/status.py` — `403` at :14, :17, :20. BE-10.
  - `app/libs/auth/actions.py` — `RECON_VIEW = "mobo:recon_view"` at :18. **Kept** by BE-4.
  - `app/libs/allocation_matrix/router.py` — `422` at :71-74; undeclared `GET /allocation` at :77. BE-10, BE-16.
  - `app/libs/post_trade_allocation/router.py` — `404` at :46. BE-10.
  - `app/libs/reconciliation/**` — `router.py` (66 lines; `_resolve_session` :22-36, `get_reconciliation` :38-51, `get_trade_records` :52-66), `records.py` (205), `engine.py` (184), `presenter.py` (201), `dtos.py` (50), `formatting.py` (16), `adapters/`, `algotrade/synth.py` (91). **Read the import graph before deleting anything** — only ONE handler goes; see BE-4.
  - `app/libs/eod/{service,presenter,repository}.py`, `app/libs/post_trade_allocation/service.py` — live consumers of the reconciliation package. BE-4.
  - `tests/cli/conftest.py:56`, `tests/libs/clients/conftest.py:32`, `tests/libs/staff/conftest.py:47` — the three `FakeIdentityService` doubles. BE-2.
  - `tests/libs/eod/test_be10_router.py:74-91` — the canonical detached-`User` override pattern. BE-2.
  - `tests/libs/{auth/test_be4_pta_actions.py, onboarding/test_be4_actions.py, eod/test_be6_pta_hook_and_action.py, reconciliation/test_be1_action.py, client_portal/test_be12_tickets.py, dev/test_be23_dev_register_service.py, dev/test_be24_dev_router_mount.py}` — the collection errors. BE-1.

- **Hand-off / exit signal:** all `BE-*` units committed on the layer branch; the §3.2 gate green from `api-backend/`; exactly one known-failing test remains (`tests/libs/post_trade_allocation/test_be3_service_run.py:365`, D-7, unskipped); PR opened against the parent branch.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions

Observed from the repo, not assumed:

- **Layering: `router → service → repository`.** `router.py` owns the FastAPI decorators, the `Depends` wiring and request-shape validation; `service.py` owns business logic, holds the `Session`, and is where the bulk of `raise HTTPException` lives (e.g. `onboarding/service.py:234`, `access/service.py:95`); `repository.py` owns SQLAlchemy queries and nothing else (`client_portal/repository.py:46-54`). A router may import its service; a service may import its repository; **never the reverse**.
- **`app/core/*` is the floor.** `config.py`, `database.py`, `security.py` are imported by everything and import **no** feature package. That is exactly why BE-5 moves `storage.py` there — four feature packages currently reach across a boundary into `app/libs/trade_models/storage.py` (`client_portal/service.py:42`, `eod/service.py:17`, `onboarding/service.py:42`, plus `trade_models`' own router/service).
- **Feature packages should not import each other.** Today two violations exist: the storage import above (BE-5 fixes it) and `eod` + `post_trade_allocation` importing `app.libs.reconciliation.*` (BE-4 documents it; it is *not* fixed on this branch).
- **Authorization seam:** `auth/deps.py` imports `app.libs.access.resolver` — never `access.router` (comment at `deps.py:11`). Route guards are `Depends(require_action(Action.X))`.
- **Models & DTOs:** ORM in `app/models/*`; cross-feature DTOs in `app/schemas/*`; feature-local DTOs in `app/libs/<pkg>/schemas.py`. Pydantic v2 (`model_config = {"from_attributes": True}`).
- **Errors:** `raise HTTPException(status.HTTP_XXX, "message")` with a plain string `detail`, positionally. 116 of 117 sites already do this; BE-9 normalizes the wire shape without touching them.
- **Typing:** full annotations; `from __future__ import annotations` in most modules; `mypy app` must be clean.
- **Money / rates:** `Decimal` on the DB side (`Numeric(9,6)`), `float` in the Pydantic DTOs. Fee comparisons must be done in `Decimal` (BE-13).

### 3.2 CI/CD & engineering discipline

- **Trunk-friendly, small units.** Each §6 unit is one atomic, self-reviewable commit that leaves the branch green.
- **Independently revertible.** Reverting one unit must not break another; the two exceptions are named in the units' **Dependencies** (BE-7 depends on BE-5; BE-12 depends on BE-9).
- **Additive first.** BE-5 lands the new `app/core/storage.py` and BE-7 repoints the call sites; the old module is deleted in the same unit as the move only because Python has no two-module ambiguity worth keeping — no shim, no deprecation window (nothing outside this repo imports it).
- **Gate before merge** — run from `api-backend/`, using the venv (`python` / `pytest` / `ruff` / `mypy` on PATH are the dependency-free system Python and **will fail**):

  ```
  .\.venv\Scripts\ruff.exe check . && .\.venv\Scripts\ruff.exe format --check . && .\.venv\Scripts\mypy.exe app && .\.venv\Scripts\python.exe -m pytest -q
  ```

  All three tools are configured in `api-backend/pyproject.toml`. **On `main` this gate fails at every stage** — 29 `ruff check` errors, 22 files unformatted, 18 `mypy` errors, and `pytest` aborts at collection (6 import errors) before running anything. **BE-1 is the unit that makes the gate runnable at all**; BE-2 and BE-3 are what make its last stage meaningful. Nothing downstream has a trustworthy signal until those three land.
- **The one permitted red test.** `tests/libs/post_trade_allocation/test_be3_service_run.py:365` (PTA 3× over-allocation) stays **failing and unskipped** per D-7. The gate is "green except this one named test". No `@pytest.mark.skip`, no `xfail`, no assertion edit.
- **No secrets, no manual steps in the merge path.** This layer has no live-DB or filesystem-move step; those belong to the DB layer and the deploy schedule.
- **Reversibility:** this layer is code-only. Everything reverts with the branch (§9).

---

## 4. Architecture (level 1 of 3)

**Target layout** (— = unchanged, + = new, ✗ = deleted):

```
app/
  main.py                       ~ router mounts (recon mount removed) + 3 exception handlers
  core/
    config.py                   ~ +6 storage_root_* ; −legal_docs_subdir, −client_statements_subdir
    security.py                 ~ 500 detail no longer str(exc); 400 -> 422
  + core/storage.py             + Bucket, FileStorage, LocalStorage(+containment), NasStorage,
                                  get_storage(bucket), client_folder(name, uid, *, bucket)
  ✗ libs/trade_models/storage.py
  libs/
    trade_models/   {router,service,schemas}.py   ~ bucket call sites, fee Field(), response_model, 409
    onboarding/     {service,repository}.py       ~ bucket call sites, Decimal guard, client_folder reuse
    eod/            service.py                    ~ Bucket.REPORTS
    client_portal/  {router,service,repository}.py ~ buckets, entitlement check
    access/         service.py                    ~ conflict payload, 500 -> 409
    auth/           {deps,status}.py              ~ 403 -> 401     (actions.py untouched: RECON_VIEW stays)
    allocation_matrix/router.py                   ~ response_model, 422 -> 409
    post_trade_allocation/router.py               ~ 404 -> 200 empty
    reconciliation/ router.py ~ (one handler removed; the file, its /trade-records
                                 route and records.py all SURVIVE — see BE-4)
tests/                                            ~ BE-1/BE-2/BE-3 repairs (this tree IS tracked in git)
```

**Dependency direction.** `app/core/storage.py` imports only `app/core/config.py` and the standard library. No feature package may be imported by it; every feature package may import it. This inverts today's arrangement, where `client_portal`, `onboarding` and `eod` reach into `trade_models`.

**External seams.**
- *Consumes* (per §7): DB columns holding fees as decimal fractions and `*storage_key` values that are **bucket-relative** (no group prefix). Both are assumptions on this branch, mocked in tests.
- *Exposes*: 90 routes (94 − 4 unconsumed: `/mobo/reconciliation` + the three EoD routes), every success body byte-for-byte unchanged; every non-2xx body in the §7.1(c) envelope; the 13 status codes of BE-10.
- *Filesystem*: six bucket roots, each `mkdir`-ed on first `get_storage(bucket)`.

---

## 5. Modules (level 2 of 3)

### 5.1 `tests/` — backend test baseline

- **Responsibility:** make `pytest -q` run to completion and reflect the code as it is on `main`, so every later unit has a real signal.
- **Files:** the collection-error test files listed in §2; the three `FakeIdentityService` conftests; a new shared `tests/conftest.py`; the rename/signature tail.
- **Public surface:** `tests/conftest.py` gains two shared helpers — an attached/eager-loaded admin stub and one `FakeIdentityService`.
- **Owns features:** BE-1, BE-2, BE-3.
- **Note on commit policy:** `api-backend/tests/` **is tracked in git** (unlike `admin-frontend/tests/`, which is the FE layer's C-1). These three units edit committed files and their edits **are** committed. That is distinct from the §8 `test-gen` output, which is generated locally and never staged.

### 5.2 `app/libs/reconciliation` — dead surface

- **Responsibility:** after BE-4, one live route (`GET /mobo/trade-records`, a read-only orders+executions projection) plus import-only internals consumed by `eod` and `post_trade_allocation`. The *reconciliation* half — matching, sessions, the flow view — is what becomes unreachable.
- **Files:** `router.py` (**retained** — hosts `get_trade_records`; only `get_reconciliation` and `_resolve_session` are removed), `records.py` (**retained** — backs `/trade-records`); `engine.py`, `presenter.py`, `dtos.py`, `formatting.py`, `adapters/*`, `algotrade/synth.py`, `app/models/recon.py`, `recon_notional_epsilon` (**retained per D-12** — live EoD/PTA dependencies; the `recon_sessions` table is retained too).
- **Public surface after BE-4:** `GET /api/mobo/trade-records` (unchanged), plus import-only modules for `eod` and `post_trade_allocation`.
- **Owns features:** BE-4.

### 5.3 `app/core/storage` — the bucket registry

- **Responsibility:** one place that knows what document groups exist, where each one's root is, and how a per-client folder is named.
- **Files:** `app/core/storage.py` (new), `app/core/config.py` (roots).
- **Public surface:** `Bucket`, `StoredFile`, `FileStorage`, `LocalStorage`, `NasStorage`, `get_storage(bucket)`, `client_folder(name, uid, *, bucket)`.
- **Owns features:** BE-5, BE-6, BE-7, BE-8.

### 5.4 `app/main` — error envelope

- **Responsibility:** turn every escaping exception into the §7.1(c) JSON shape, so no call site needs editing.
- **Files:** `app/main.py`, plus the two sites that currently build their own 500 message (`app/core/security.py`) and the one dict `detail` (`app/libs/access/service.py`).
- **Public surface:** three `@app.exception_handler` registrations and one module-level constant `GENERIC_500`.
- **Owns features:** BE-9, BE-11, BE-12.

### 5.5 Status codes & route contracts

- **Responsibility:** align the outlier failures with the seam's status-code table, and declare the two undeclared responses.
- **Files:** `core/security.py`, `auth/deps.py`, `auth/status.py`, `access/service.py`, `trade_models/router.py`, `allocation_matrix/router.py`, `post_trade_allocation/router.py`.
- **Owns features:** BE-10, BE-16.

### 5.6 Fee unit & entitlement

- **Responsibility:** the two remaining correctness items — the fee compare-and-set and the missing entitlement gate.
- **Files:** `onboarding/service.py`, `trade_models/schemas.py`, `client_portal/{router,service,repository}.py`.
- **Owns features:** BE-13, BE-14, BE-15.

---

## 6. Features (level 3 of 3 — the work units)

### BE-1 — Clear the six pytest collection errors (Yes)

- **Proposal ref:** § Layer 4 B-1
- **Module:** §5.1
- **Files:** `delete: tests/libs/auth/test_be4_pta_actions.py`, `delete: tests/libs/onboarding/test_be4_actions.py`, `delete: tests/libs/eod/test_be6_pta_hook_and_action.py`, `delete: tests/libs/reconciliation/test_be1_action.py`, `delete: tests/libs/dev/test_be23_dev_register_service.py`, `delete: tests/libs/dev/test_be24_dev_router_mount.py`, `modify: tests/libs/client_portal/test_be12_tickets.py`
- **Dependencies:** none — must land first; everything else is unmeasurable until it does.

**Contract (required code):**

```
# Before:  .\.venv\Scripts\python.exe -m pytest -q   -> aborts, 6 collection errors
# After :  .\.venv\Scripts\python.exe -m pytest -q   -> runs to completion, 0 collection errors
#          (--continue-on-collection-errors must NOT be needed, now or ever again)
```

| File | Cause | Action |
|---|---|---|
| `tests/libs/auth/test_be4_pta_actions.py:25` | imports `ROLE_ACTIONS` / `get_actions_for_role`, deleted by `ab1823a` | **delete file** |
| `tests/libs/onboarding/test_be4_actions.py:16` | same | **delete file** |
| `tests/libs/eod/test_be6_pta_hook_and_action.py:19` | same | **delete file** |
| `tests/libs/reconciliation/test_be1_action.py:15` | same | **delete file** (BE-4 would delete it regardless) |
| `tests/libs/client_portal/test_be12_tickets.py:123` | `TicketStatus.CLOSED` removed by migration `0027` | **edit**: `CLOSED` → `RESOLVED` |
| `tests/libs/dev/test_be23_dev_register_service.py:18` | `app.libs.dev.service` deleted (`app/libs/dev/` now holds no module) | **delete file** |
| `tests/libs/dev/test_be24_dev_router_mount.py` | same package, same dead import | **delete file** |

**Behavior / invariants:**
- The four `ROLE_ACTIONS` tests exercise a mechanism that no longer exists; its replacement (`app/libs/access/resolver.py`) has its own coverage in `tests/libs/auth/test_be5_access_control_resolves_from_db.py`. Deleting them loses nothing.
- The ticket test is an **edit**, not a delete — the behaviour it asserts is still live, only the enum member was renamed.
- If `tests/libs/dev/` is left with only `__init__.py` and `conftest.py`, delete the directory.
- No `--continue-on-collection-errors`, no `-p no:cacheprovider` workaround, no `collect_ignore`.

**Done when:** `.\.venv\Scripts\python.exe -m pytest -q --collect-only` exits 0 with zero errors, from `api-backend/`.

---

### BE-2 — The two shared-fixture fixes (~264 failures) (Yes)

- **Proposal ref:** § Layer 4 B-2, clusters 1 (138) and 2 (126)
- **Module:** §5.1
- **Files:** `create: tests/conftest.py`; `modify: tests/cli/conftest.py`, `tests/libs/clients/conftest.py`, `tests/libs/staff/conftest.py`; `modify:` the auth-override fixtures across `tests/libs/{access,auth,clients,eod,onboarding,post_trade_allocation,reconciliation,staff,users}/`
- **Dependencies:** BE-1 (the suite must collect before failures can be counted).

**(a) The detached-`User` auth fixture — ~138 `DetachedInstanceError`s.**

Root cause, verified at `tests/libs/eod/test_be10_router.py:74-91`: the fixture constructs a `User`, adds it plus an `AdminProfile` through a **seed session**, commits, then **closes that session** and overrides `get_current_admin_user` with `lambda: stub_user`. The user is now detached. Fine when authorization was a role→constant lookup; broken since `app/libs/access/resolver.py:72` reads `user.admin_profile`:

```python
# app/libs/access/resolver.py:72
if user.portal != Portal.ADMIN or user.admin_profile is None:
```

Lazy-loading a relationship on a detached instance raises `DetachedInstanceError`.

**Contract (required code) — one shared helper, in a new root `tests/conftest.py`:**

```python
# tests/conftest.py  (new — repo-root of the backend test tree)
def make_admin_stub(db_factory, *, role: AdminRole = AdminRole.MOBO,
                    firebase_uid: str = "uid-admin", email: str = "admin@example.com") -> User:
    """Committed admin User whose `admin_profile` is ALREADY LOADED on the
    instance, so `access.resolver.actions_for` never triggers a lazy load.
    Returns a detached-but-safe stub for `app.dependency_overrides[...] = lambda: user`."""
```

The fix is to populate the relationship **on the instance** (assign the `AdminProfile` to `user.admin_profile` before the seed session closes) rather than only inserting the FK row — an already-loaded attribute is never lazy-loaded, so detachment stops mattering. Every auth-override fixture calls this one helper instead of hand-rolling the stub.

**(b) `FakeIdentityService` missing `generate_set_password_link` — ~126 failures.**

`app/libs/identity/service.py:66` renamed `generate_invite_link` → `generate_set_password_link`. All three doubles still expose the old name only: `tests/cli/conftest.py:73`, `tests/libs/clients/conftest.py:60`, `tests/libs/staff/conftest.py:86`.

**Spec: ONE shared double, not three patches.** Move it to `tests/conftest.py` and have the three package conftests import it:

```python
# tests/conftest.py
class FakeIdentityService:
    """The single test double for app.libs.identity.service.FirebaseIdentityService.
    Superset of the three former per-package copies:
      __init__(self, settings=None, *, existing=None, fail_ensure=False, fail_ensure_exc=None)
      ensure_identity(email) -> tuple[str, bool]     # adopt (created=False) vs mint (created=True)
      delete_user(uid) -> None
      generate_set_password_link(email) -> str       # NEW — mirrors identity/service.py:66
      fail_next_ensure(exc) -> None                  # from the staff copy
    Call-tracking lists kept for every method; `generate_invite_link` is NOT re-exposed."""
```

The uid-minting prefix differs between the copies today (`fake-uid-N` vs `fake-staff-uid-N`); keep `fake-uid-N` and fix the handful of assertions that pin the staff prefix, rather than parameterizing the double.

**Behavior / invariants:**
- No production code changes in this unit. If a fix appears to need one, it belongs to a different unit.
- After (a), no test may construct an admin `User` for a `dependency_overrides` entry by hand.
- After (b), `grep -rn "generate_invite_link" tests/` returns nothing.

**Done when:** backend failures drop from 255 to roughly a dozen, and `grep -c DetachedInstanceError` over a fresh `pytest -q` run is 0.

---

### BE-3 — The mechanical rename / signature tail (Yes)

- **Proposal ref:** § Layer 4 B-2, clusters 4 (9) and 5 (~20)
- **Module:** §5.1
- **Files:** `modify:` the four `StaffService.enroll()` call sites in `tests/libs/staff/`; the `dev_mode` / `WeasyPrintRenderer` / `generate_invite_link` / `not_started` / alembic-head / default-password tests; the two grep-guard tests.
- **Dependencies:** BE-2 (its `FakeIdentityService` consolidation is what the `generate_invite_link` rename lands on).

**Contract (required code) — the tail, one item per row:**

| Drift | Current test expectation | Truth on `main` |
|---|---|---|
| `StaffService.enroll()` | old positional/kwarg set | 7 new kwargs — `phone_number`, `department`, `start_date`, `address`, `overrides`, `notify`, `password` (`app/libs/staff/service.py:108-122`); 4 call sites to update |
| `dev_mode` | `settings.dev_mode` | `settings.app_env` (`app/core/config.py:15`) |
| `WeasyPrintRenderer` | old import path | moved into the `pdf` package |
| `generate_invite_link` | old name | `generate_set_password_link` (`app/libs/identity/service.py:66`) |
| `not_started` | doc status `"not_started"` | `"pending"` |
| alembic head pin | stale revision id | `c72e91a4f6b3` |
| default password | enroll auto-assigns a default password | behaviour removed; `password` is a required kwarg |
| grep-guard tests (×2) | grep for a symbol that has since moved/renamed | update the pattern, keep the guard |

**Behavior / invariants:**
- Every row is a **test-side** edit. If any row turns out to need a production change, stop and raise it — that is a finding, not a rename.
- The two grep-guard tests are **kept**, not deleted: their whole point is to fail when a symbol reappears. Only their pattern is refreshed.
- **`tests/libs/post_trade_allocation/test_be3_service_run.py:365` is explicitly OUT OF SCOPE (proposal D-7 / § Non-Goals).** It asserts `50` and gets `150` — a real money-path over-allocation bug owned by its own proposal. It **must be left failing and must NOT be skipped, xfailed, or have its assertion updated.** A silenced test is precisely how the 377-failure baseline formed. It is the one named, tracked exception in §3.2's gate.

**Done when:** `pytest -q` reports exactly one failure — `test_be3_service_run.py:365` — and zero errors.

---

### BE-4 — Delete the four unconsumed routes; keep every module (Accepted)

- **Proposal ref:** § Layer 2 C-5 (as narrowed), § 1.1, D-12
- **Module:** §5.2
- **Files:** `modify: app/libs/reconciliation/router.py` (delete `get_reconciliation` and `_resolve_session` + their now-unused imports); `delete: app/libs/eod/router.py` (whole file, 3 unconsumed routes); `modify: app/main.py` (drop the eod import at :21 and its `include_router` at :76 — the reconciliation mount at :26,75 **stays**)
- **Dependencies:** BE-1 (which deletes `tests/libs/reconciliation/test_be1_action.py`).
- **NOT touched:** `app/main.py` — the import at `:26` and the `include_router` at `:75` **stay**; `app/libs/reconciliation/records.py` **stays**. Deleting either would 404 a live admin page (see below).

**Contract (required code):**

```python
# app/libs/reconciliation/router.py — DELETE these two blocks:
def _resolve_session(db: Session, session_id: uuid.UUID | None) -> ReconSession:   # :22-36
    ...
@router.get("/reconciliation", response_model=ReconciliationFlowViewOut)           # :38-51
def get_reconciliation(...): ...

# ...and the imports that only they used (:12, :13, :14-as-needed, :15, :17-partial):
#   engine.reconcile · presenter.to_wire · models.recon.ReconSession
#   · schemas.reconciliation.ReconciliationFlowViewOut
# KEEP the imports get_trade_records needs: APIRouter/Depends/HTTPException/status,
#   get_db, Action, require_action, records.build_view, User, TradeRecordsViewOut.

# RETAINED, unchanged — this route is LIVE:
@router.get("/trade-records", response_model=TradeRecordsViewOut)                  # :52-66
def get_trade_records(...): ...

# app/main.py:26 and :75 — UNCHANGED. The router still mounts.

# Route removed (1):
#   GET /api/mobo/reconciliation     (router.py:38)
# Route count: 94 -> 93. No other route changes path, method or success shape.

# app/libs/auth/actions.py:18 — UNCHANGED, deliberately:
RECON_VIEW = "mobo:recon_view"
```

`_resolve_session` is deleted **only because `get_trade_records` does not call it** — verified: `get_trade_records` (`router.py:52-66`) calls `build_view(db, date)` and nothing else; `_resolve_session`'s sole caller is `get_reconciliation` at `:44`. If that ever stops being true, keep the helper.

**Scope — one route, per D-12. Verified import graph and FE consumers on `main`:**

An earlier draft of the proposal's C-5 listed the whole package for deletion; a later one, the two routes. Both over-reached, both were found here or by the coordinator, escalated, independently verified, and **resolved into D-12**. The proposal now says exactly what this unit says. The tables below are the evidence that produced D-12, kept as the durable record of *why* each piece survives. **This unit agrees with the proposal — it is not a deviation, and no §4.3 change protocol is invoked.**

*Frontend consumers (verified in `admin-frontend/`):*

| Route | Consumer | Verdict |
|---|---|---|
| `GET /api/mobo/reconciliation` | **none** — no `server/`, `hooks/`, `lib/` or `app/` reference. `recon-overview/page.tsx:17` imports `loadReconciliation` from `lib/mobo/reconciliation.ts`, which reads `lib/mock/mobo-data.ts` (a throwaway mock), not this endpoint. The 012 FE units that would have consumed it never landed. | **DEAD → delete** |
| `GET /api/eod` | **none** — `admin-frontend/server/endpoints.ts` has no `EOD` entry at all. Every `EOD` symbol in admin (`lib/mobo/types.ts:408`, `lib/mock/mobo-data.ts:521`, `lib/mobo/reconciliation.ts:55`) is a local type or throwaway mock fixture, not a call to this backend. | **DEAD → delete** |
| `POST /api/eod/sign-off` | **none** — same scan | **DEAD → delete** |
| `GET /api/eod/export` | **none** — same scan | **DEAD → delete** |
| `GET /api/mobo/trade-records` | **live, and the rework's foundation** — `server/endpoints.ts:54` (`TRADE_RECORDS`, under `MOBO = "/api/mobo"`, matching the router's `/mobo` prefix at `router.py:19` mounted at `/api`) → `server/mobo/index.ts:12-13` → `hooks/api/useTradeRecords` → `app/(roles)/mobo/trade-reconciliation/page.tsx:16,44`; nav-visible via `lib/pages-config.ts:130-136` with no `hideFromNav`. Wire shape documented at `lib/mobo/types.ts:342`. **Human instruction: this route is the replacement for the deprecated auto-reconciliation flow *and* the end-of-day report — do not touch it.** | **LIVE → KEEP, untouched** |

*Backend import graph:*

| Module | Reality | Verdict (D-12) |
|---|---|---|
| `reconciliation/router.py` | hosts the live `get_trade_records`; mounted by `main.py:26,75` | **KEEP the file** — remove only `get_reconciliation` + `_resolve_session` |
| `reconciliation/records.py` | `build_view` imported by `router.py:14`, called by the **live** `get_trade_records` at `:66` | **KEEP** |
| `reconciliation/engine.py` | `reconcile` imported by `eod/service.py:15`, called at `eod/service.py:35` and `:105` | **KEEP** |
| `reconciliation/presenter.py` | imported by `eod/presenter.py:12` | **KEEP** |
| `reconciliation/algotrade/synth.py` | `synthesize_from_run`, `_parse_yyyymmdd` imported by `post_trade_allocation/service.py:19`, called at `:155`, `:163` | **KEEP** |
| `reconciliation/{dtos,formatting}.py`, `adapters/*` | imported by `eod/{service,presenter}.py` | **KEEP** |
| `app/models/recon.py` | `ReconSession` imported by `eod/repository.py:15` (`sessions_for_trade_date`) and `eod/presenter.py:19` | **KEEP** |
| `recon_notional_epsilon` (`config.py:27`) | read by `engine.py:27`, which EoD calls | **KEEP** |
| `app/libs/eod/router.py` | 3 routes, **all unconsumed**; imported only by `main.py:21,76` | **DELETE the file** |
| `app/libs/eod/{service,repository,presenter}.py`, `eod/pdf/` | the deprecated EoD report's logic — retained wholesale by human instruction for the reconciliation rework | **KEEP** |
| `eod_records` table | never touched by the DB layer; retained with the module | **KEEP** |

**This unit deletes zero logic — only HTTP surface.** Auto-reconciliation and its end-of-day report are both deprecated, but the human instruction is explicit: *"purge the route, but keep the module functionality and logic intact so it belongs to the reconciliation rework."* So every "KEEP" row above survives, including all of `app/libs/eod/` below `router.py`. Deleting a "KEEP" row would break the PTA run path or the MOBO trade-reconciliation page, or would destroy logic the rework is meant to inherit.

**Correction to an earlier draft of this doc.** It described EoD as serving "three live routes". That was wrong — it read *mounted + action-gated* as *consumed*. The EoD routes have no frontend consumer, which is exactly why they are now deleted. The argument for retaining the EoD **modules** rests solely on the import graph plus the explicit hand-off instruction, never on liveness.

**Cross-layer risk — RAISED AND RESOLVED.** This layer flagged that proposal Layer 1 B-3 would drop `recon_sessions` while `eod/repository.py:25` queries `ReconSession` on every EoD day-view (and `post_trade_allocation/service.py:19` imports `algotrade.synth`, so two live packages depend on the internals, not one). The human decision is **D-12: `recon_sessions` is not dropped.** Proposal Layer 1 B-3 is now an explicit no-op — no DDL, no data change — and the DB layer keeps `DB-4` only as a withdrawn stub so its unit IDs stay stable. **No DB-layer unit does any reconciliation work, and nothing in this doc depends on one.** No action remains for this layer beyond the deletions specced above.

**Behavior / invariants:**
- `GET /api/mobo/reconciliation`, `GET /api/eod`, `POST /api/eod/sign-off` and `GET /api/eod/export` all return 404 (no route) after this unit.
- **`app/libs/eod/service.py` and its siblings remain importable and callable** — they simply have no HTTP entry point on this branch. `EodService` can still be constructed and exercised in tests; that is the point of retaining them. **`GET /api/mobo/trade-records` keeps working, byte-for-byte** — same path, method, query param, success body and its existing "a day with no orders is an empty `rows` list, not a 404" contract (`router.py:58-63`). A test that asserts this route is gone is wrong.
- `Action.RECON_VIEW` stays and remains **load-bearing**: it gates the surviving `/trade-records` (`reconciliation/router.py:55`) and three page grants at `access/pages.py:129-131`. Deleting `eod/router.py` removes two of its usages (`eod/router.py:26,44`) but not its last — verify the remaining ones still resolve.
- `app.schemas.reconciliation` stays: `RcAllocOut` / `RcBreakCountsOut` / `RcOrderOut` / `RcPortOut` are imported by `app/schemas/eod.py:7`, and `TradeRecordsViewOut` is the surviving route's `response_model`. Only `ReconciliationFlowViewOut` becomes unreferenced; leaving it costs nothing and deleting it is safe — either is acceptable, do not spend time on it.
- `import app.main` succeeds; `len(app.routes)` drops by exactly **4**.

**Done when:** the app boots, the route count is **90**, `GET /api/mobo/trade-records` still serves the MOBO page unchanged, `app.libs.eod.service` still imports and its service class still constructs, `pytest -q` is no worse than after BE-3, and both `grep -rn "get_reconciliation\|_resolve_session" app/` and `grep -rn "eod_router" app/` are empty.

---

### BE-5 — `app/core/storage.py` + the `Bucket` registry (Yes — user req.)

- **Proposal ref:** § Layer 2 A, A-3
- **Module:** §5.3
- **Files:** `create: app/core/storage.py`; `delete: app/libs/trade_models/storage.py`; `modify: app/core/config.py`
- **Dependencies:** none — parallel-safe. (BE-7 repoints the call sites; land BE-5 and BE-7 adjacently so the branch stays green, or fold the import rewrite into BE-5's commit.)

**Contract (required code):**

```python
# app/core/storage.py
from enum import StrEnum
from functools import lru_cache
from pathlib import Path

class Bucket(StrEnum):
    MARKETING   = "marketing"      # model_materials.storage_key
    KYC         = "kyc"            # onboarding_documents.storage_key
    CONTACT_LOG = "contact_log"    # client_contact_logs.doc_storage_key
    REPORTS     = "reports"        # eod_records.file_storage_key  (EoD + EoM)
    LEGAL       = "legal"          # read-only drop zone, no metadata table
    STATEMENTS  = "statements"     # read-only drop zone, no metadata table


def _bucket_root(bucket: Bucket) -> Path:
    """Per-bucket override if set, else `{storage_root}/{bucket.value}`.
    The setting name is `storage_root_{bucket.value}` for all six — no mapping table."""
    s = get_settings()
    override = getattr(s, f"storage_root_{bucket.value}")
    return Path(override) if override else Path(s.storage_root) / bucket.value


@lru_cache(maxsize=None)
def get_storage(bucket: Bucket) -> FileStorage:
    """The active FileStorage for one bucket. Cached per bucket, so each root is
    mkdir-ed exactly once per process (LocalStorage.__init__)."""
    if get_settings().storage_backend.lower() == "nas":
        return NasStorage()
    return LocalStorage(_bucket_root(bucket))
```

```python
# app/core/config.py — replacing lines 20-21
    storage_backend: str = "local"                  # "local" | "nas"   (unchanged, :18)
    storage_root: str = "./crm_filesystem"          # base for the defaults below ONLY (:19)
    storage_root_marketing:   str | None = None     # default: {storage_root}/marketing
    storage_root_kyc:         str | None = None     # default: {storage_root}/kyc
    storage_root_contact_log: str | None = None     # default: {storage_root}/contact_log
    storage_root_reports:     str | None = None     # default: {storage_root}/reports
    storage_root_legal:       str | None = None     # default: {storage_root}/legal
    storage_root_statements:  str | None = None     # default: {storage_root}/statements
    # DELETED: legal_docs_subdir (:20), client_statements_subdir (:21)
```

`StoredFile`, `FileStorage`, `LocalStorage`, `NasStorage` move over **unchanged in shape** (`save`/`open`/`list`, same signatures) apart from BE-6's containment check. `NasStorage` stays a `NotImplementedError` placeholder (proposal § Non-Goals).

**Behavior / invariants:**
- `get_storage()` with no argument is a `TypeError` — goal 3 of the proposal ("`get_storage()` cannot be called without naming a bucket") is enforced by the signature, not by a runtime check.
- `save(..., subdir=...)` is retained but **narrows**: `subdir` is now the within-bucket path only (a per-client folder, a `YYYY-MM` month folder). It never names a document group.
- `open()` / `list()` take **bucket-relative** keys. A key never contains the bucket name (§7.1(b)).
- Six roots, six `LocalStorage` instances, one class. The segmentation lives in configuration (D-3).
- A-3 falls out: the statements root is `mkdir(parents=True, exist_ok=True)`-ed by `LocalStorage.__init__` on first `get_storage(Bucket.STATEMENTS)`, so `GET /client/documents/statements` stops listing empty because the directory is missing. No separate change.
- `app/core/storage.py` imports **only** `app/core/config.py` + stdlib. A `from app.libs...` import in this file is a review reject.
- `lru_cache` is keyed on the `Bucket` member; tests that repoint a root must clear it (`get_storage.cache_clear()`), same as `get_settings.cache_clear()`.

**Done when:** `grep -rn "trade_models.storage" app/` is empty; `get_storage(Bucket.X)` for each of the six returns a `LocalStorage` whose root is the configured/derived path and whose directory exists.

---

### BE-6 — Path containment in `LocalStorage.open()` (Yes)

- **Proposal ref:** § Layer 2 A, "Path containment"
- **Module:** §5.3
- **Files:** `modify: app/core/storage.py`
- **Dependencies:** BE-5.

Today (`app/libs/trade_models/storage.py:75-77`):

```python
def open(self, storage_key: str) -> BinaryIO:
    path = self._root / storage_key      # no containment check whatsoever
    return path.open("rb")
```

`self._root / "../../etc/passwd"` resolves straight out of the mount. With one root the only mitigation was that keys came from the DB; with six roots — one of which may be an encrypted KYC share with different mount permissions — the blast radius changes shape.

**Contract (required code):**

```python
class LocalStorage:
    def _resolve(self, storage_key: str) -> Path:
        """Resolve a bucket-relative key to an absolute path, refusing anything
        that escapes the bucket root. TRUST BOUNDARY — not simplified away."""
        root = self._root.resolve()
        target = (root / storage_key).resolve()
        if target != root and root not in target.parents:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown storage key")
        return target

    def open(self, storage_key: str) -> BinaryIO:
        return self._resolve(storage_key).open("rb")  # caller closes
```

**Behavior / invariants:**
- Resolution happens **after** `.resolve()` on both sides, so `..` segments, absolute keys (`/etc/passwd`), symlinks pointing outside the root, and Windows drive-absolute keys (`C:\…`) are all rejected by the same check. Do not implement this as a string `startswith` on the unresolved path — that is the version this check exists to avoid.
- `404`, not `403`: a rejected key is indistinguishable to the caller from a key that does not exist, which is the correct disclosure posture and matches the existing 404 at `client_portal/service.py:260-262`.
- `save()` and `list()` are **not** in scope here — their `subdir` comes from server-side code, never from a request body. If a future unit lets a client name a subdir, it routes through `_resolve` too.
- Legitimate nested keys (`Cathy_Client_ke-uid-1/ab12..._passport.pdf`, `2026-07/EoD-2026-07-31.pdf`) must still resolve.

**Done when:** every traversal class above raises 404 and every real key still opens.

---

### BE-7 — Repoint every call site to its bucket (Yes)

- **Proposal ref:** § Layer 2 A "Call-site changes", A-1
- **Module:** §5.3
- **Files:** `modify: app/libs/trade_models/{service,router}.py`, `app/libs/onboarding/service.py`, `app/libs/eod/service.py`, `app/libs/client_portal/service.py`
- **Dependencies:** BE-5. **Not independently revertible from BE-5** — reverting BE-5 alone leaves these imports dangling. Noted per §3.2.

**Contract (required code) — one row per site, verified:**

| Site | Today | After |
|---|---|---|
| `trade_models/service.py:345-350` | `self.storage.save(..., subdir="models_mrkt_materials")` | `subdir=None` — the bucket **is** the group |
| `trade_models/router.py:44` | `storage: Annotated[FileStorage, Depends(get_storage)]` | `Depends(_marketing_storage)` (see below) |
| `onboarding/service.py:243-248` | `get_storage().save(..., subdir=f"client_kyc_docs/{self.repo.client_folder_name(onboarding)}")` | `get_storage(Bucket.KYC).save(..., subdir=client_folder(name, uid, bucket=Bucket.KYC))` — BE-8 |
| `onboarding/service.py:893-898` | `get_storage().save(..., subdir=f"client_contact_logs/{client_id}")` | `get_storage(Bucket.CONTACT_LOG).save(..., subdir=client_folder(name, uid, bucket=Bucket.CONTACT_LOG))` — BE-8 |
| `eod/service.py:131-136` | `get_storage().save(..., subdir=month_subdir)` | `get_storage(Bucket.REPORTS).save(..., subdir=month_subdir)` — `subdir` unchanged, root changes (A-1) |
| `client_portal/service.py:263` | `get_storage().open(material.storage_key)` | `get_storage(Bucket.MARKETING).open(...)` |
| `client_portal/service.py:279` | `get_storage().list(subdir)` | `get_storage(bucket).list(subdir)` — bucket from scope |
| `client_portal/service.py:285, :289` | `get_storage().list(subdir)` / `.open(match.key)` | same, scope-derived bucket |

`trade_models/router.py:44` needs a zero-arg provider because FastAPI's `Depends` cannot pass the bucket:

```python
# app/libs/trade_models/router.py
def _marketing_storage() -> FileStorage:
    return get_storage(Bucket.MARKETING)

# ... storage: Annotated[FileStorage, Depends(_marketing_storage)]
```

`client_portal/service.py:266-275` (`_scope_subdir`) is rewritten — the two `*_subdir` settings it reads are deleted by BE-5:

```python
_SCOPE_BUCKET = {"legal": Bucket.LEGAL, "statements": Bucket.STATEMENTS}

def _scope_target(self, scope: str, user_id: uuid.UUID) -> tuple[Bucket, str]:
    """(bucket, within-bucket subdir) for a document scope.
    legal      -> (LEGAL, "")                      # the bucket root IS the drop zone
    statements -> (STATEMENTS, "<client folder>")  # or "__no_cycle__" -> lists empty
    """
```

**Behavior / invariants:**
- Every `get_storage(...)` call passes a **literal** `Bucket` member derived from the calling context, never parsed from a key (D-4). A `Bucket(some_string)` in a service is a review reject.
- The `list()`/`open()` re-list guard at `client_portal/service.py:285-288` (MANDATORY C-4 from proposal 014 — "re-list, don't trust the key string") is **preserved verbatim**. It is a separate trust boundary from BE-6 and neither replaces the other.
- Success bodies do not change. `StoredFileDTO.key` values change shape (no group prefix) — that is the seam, and the DB layer's B-2 migration is what makes stored keys match. On this branch it is an assumption (§7.3).
- `eod`'s keys were already bucket-relative by accident (`2026-07/…`), so A-1 is a pure root change with no key migration.

**Done when:** `grep -rn "get_storage()" app/` is empty; a file written through each of the six buckets lands under that bucket's root and nowhere else.

---

### BE-8 — `client_folder(name, uid, *, bucket)` — one definition, resolved by uid suffix (Accepted)

- **Proposal ref:** § Layer 2 A-2, D-10
- **Module:** §5.3
- **Files:** `modify: app/core/storage.py`, `app/libs/onboarding/service.py`; `modify/delete: app/libs/onboarding/repository.py:265-277`
- **Dependencies:** BE-5, BE-7.

Two conventions exist for the same client today: KYC uses a human slug built at `onboarding/repository.py:265-277` (`Cathy_Client_ke-uid-1`), contact-log attachments use the raw client UUID (`onboarding/service.py:897`). The same client has two folders that cannot be joined on the filesystem.

**Contract (required code):**

```python
# app/core/storage.py
def client_folder(name: str, uid: str, *, bucket: Bucket) -> str:
    """The per-client directory name inside *bucket*: `{Slug_Name}_{uid[-8:]}`.

    RESOLVE-THEN-CREATE (D-10): glob `*_{uid[-8:]}` in the bucket root first and
    reuse an existing directory if one is found. A client rename therefore never
    strands the old folder or splits a client across two directories; only a
    client with no folder yet gets a freshly-slugged name.

    The uid suffix is the TRAILING 8 chars: real firebase uids are random
    throughout, but any sequential/test uid scheme is distinguished at the end
    (the reason recorded at onboarding/repository.py:274-276).
    """
    suffix = uid[-8:]
    root = _bucket_root(bucket)
    for existing in sorted(root.glob(f"*_{suffix}")):
        if existing.is_dir():
            return existing.name
    slug = re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_") or "client"
    return f"{slug}_{suffix}"
```

The slug regex, the `or "client"` fallback and the trailing-slice rationale are lifted **unchanged** from `onboarding/repository.py:273-277`. That method is then deleted (or reduced to a one-line delegation if other callers surface during implementation — `grep -rn "client_folder_name" app/ tests/` first).

**Behavior / invariants:**
- **Both** KYC (`onboarding/service.py:243-248`) and contact-log (`:893-898`) call this one function. The contact-log path stops using the bare `{client_id}` UUID.
- Exactly one definition of the slug form exists repo-wide afterwards (proposal § "Logic lives once").
- The `bucket` keyword is required because the glob needs a root — that is D-10's own recommended implementation, not a widening of the proposal's `client_folder(name, uid)` sketch.
- Deterministic when no directory exists; **idempotent** when one does (repeated calls return the same name).
- Two directories matching `*_{suffix}` in one bucket should not happen; `sorted()` makes the pick deterministic if it ever does. Do not add reconciliation logic for it.
- Directory renames for existing contact-log folders are a **deploy-time** step (proposal Layer 2 A-2 "Migration"), not part of this unit.

**Done when:** both buckets produce `{Slug_Name}_{uid[-8:]}`; renaming a client and re-uploading reuses the existing directory instead of creating a second.

---

### BE-9 — Three exception handlers in `app/main.py` (Yes)

- **Proposal ref:** § Layer 2 B, § 4.1(c), D-5
- **Module:** §5.4
- **Files:** `modify: app/main.py`
- **Dependencies:** none — parallel-safe.

`app/main.py:59-82` registers one middleware (CORS) and **zero** exception handlers. Consequently any non-`HTTPException` escapes as Starlette's plain-text `Internal Server Error`, which neither frontend's `res.json()` can parse; and every un-overridden 422 ships Pydantic's list-of-objects as `detail`.

**Contract (required code) — the three handler bodies:**

```python
from typing import Any

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

GENERIC_500 = "Internal server error."


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Normalize `detail` to a string; lift a dict's slug into `code`.
    The string case (116 of 117 raise sites) is passed through UNTOUCHED."""
    detail: Any = exc.detail
    body: dict[str, Any]
    if isinstance(detail, str):
        body = {"detail": detail}
    elif isinstance(detail, dict):
        inner = detail.get("detail")
        body = {"detail": str(inner) if inner is not None else GENERIC_500}
        code = detail.get("code") or (inner if isinstance(inner, str) else None)
        if code:
            body["code"] = str(code)
    else:
        body = {"detail": str(detail)}
    return JSONResponse(body, status_code=exc.status_code, headers=getattr(exc, "headers", None))


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Flatten Pydantic's list-of-objects into a one-line string; keep the raw
    list under `errors` for any client that wants field-level detail."""
    errors = jsonable_encoder(exc.errors())
    first = errors[0] if errors else None
    if first is not None:
        loc = ".".join(str(p) for p in first.get("loc", [])[1:]) or "request"
        detail = f"{loc}: {first.get('msg', 'invalid value')}"
    else:
        detail = "Invalid request."
    return JSONResponse(
        {"detail": detail, "code": "validation_error", "errors": errors}, status_code=422
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Fixed generic message — never str(exc) (§4.1(c), and B-1)."""
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse({"detail": GENERIC_500}, status_code=500)
```

**Input → output (from the proposal's table, verified against the code):**

| Input | `detail` | `code` | `errors` |
|---|---|---|---|
| `HTTPException(404, "Model not found")` — 116 sites | unchanged string | — | — |
| `HTTPException(409, {"detail": …, "published": …})` — `access/service.py:95` | the inner string | `matrix_changed_since_read` | — |
| Pydantic `RequestValidationError` | `"mgmt_fee: value is not a valid float"` | `validation_error` | the raw list |
| Any unhandled `ValueError` / `KeyError` | `"Internal server error."` | — | — |

**Behavior / invariants:**
- **BYTE-FOR-BYTE unchanged wire output for the string-`detail` case.** This is the entire reason the work is done at the handler layer instead of at the 117 raise sites (D-5): `client-frontend`'s six existing parsers keep working untouched, and the fix reaches them for free on the two shapes they previously mishandled. A change to that case — reordering keys, adding a `code`, wrapping — invalidates the unit.
- Register on **`starlette.exceptions.HTTPException`**, not `fastapi.HTTPException`. FastAPI's is a subclass; registering the base covers both, plus the 404/405 Starlette raises itself for unrouted paths.
- Handlers are `async def` and return `JSONResponse` — never `PlainTextResponse`.
- `headers` (e.g. `WWW-Authenticate`) must be forwarded, or auth responses lose their challenge header.
- Every response is `application/json`. Goal 4 of the proposal is "every failure class, without exception".
- `TestClient` re-raises unhandled exceptions by default; the 500 handler is exercised with `TestClient(app, raise_server_exceptions=False)`.
- No `raise HTTPException` site is edited by this unit.

**Done when:** every non-2xx across all 90 routes returns JSON with a string `detail`; a deliberately-raised `ValueError` in a route returns `{"detail": "Internal server error."}` at 500, not plain text.

---

### BE-10 — The status-code corrections (Yes)

- **Proposal ref:** § Layer 2 C-3, § 4.1(c) status-code table
- **Module:** §5.5
- **Files:** `modify: app/core/security.py`, `app/libs/auth/deps.py`, `app/libs/auth/status.py`, `app/libs/access/service.py`, `app/libs/trade_models/router.py`, `app/libs/allocation_matrix/router.py`, `app/libs/post_trade_allocation/router.py`, `app/libs/reconciliation/router.py`
- **Dependencies:** BE-4 (row 13 sits in a file BE-4 edits; land BE-4 first so the line numbers are settled). **All 13 of the proposal's sites are in scope** — see the note under row 13.

**Contract (required code) — file:line → old → new, every line verified on `main`:**

| # | Site | Failure class | Old | New |
|---|---|---|---|---|
| 1 | `app/core/security.py:128-130` — `"id_token is required"` | missing required field | `400` | **`422`** |
| 2 | `app/libs/auth/deps.py:32` — `"No account staged for you"` (dev path) | unauthenticated | `403` | **`401`** |
| 3 | `app/libs/auth/deps.py:40` — `"No account staged for you"` | unauthenticated | `403` | **`401`** |
| 4 | `app/libs/auth/status.py:14` — `"Account disabled"` (status ≠ ACTIVE) | unauthenticated | `403` | **`401`** |
| 5 | `app/libs/auth/status.py:17` — `"Account disabled"` (client, no profile) | unauthenticated | `403` | **`401`** |
| 6 | `app/libs/auth/status.py:20` — `"Account disabled"` (admin, no profile) | unauthenticated | `403` | **`401`** |
| 7 | `app/libs/trade_models/router.py:148-151` — `"Invalid status transition"` | illegal state transition | `422` | **`409`** |
| 8 | `app/libs/allocation_matrix/router.py:71-74` — `"Unsupported period status transition"` | illegal state transition | `422` | **`409`** |
| 9 | `app/libs/post_trade_allocation/router.py:46` — `"No run for that date"` | no data for date | `404` | **`200` + empty view** |
| 10 | `app/libs/access/service.py:125` — `"Failed to publish access matrix"` | failed write | `500` | **`409`** |
| 11 | `app/libs/access/service.py:237` — `"Failed to grant override"` | failed write | `500` | **`409`** |
| 12 | `app/libs/access/service.py:266` — `"Failed to revoke override"` | failed write | `500` | **`409`** |
| 13 | `app/libs/reconciliation/router.py:64-65` — `"date must be a YYYYMMDD token"` | malformed query param | `400` | **`422`** |

**Row 13 is IN SCOPE — re-verified.** An earlier revision of this doc dropped it on the assumption that BE-4 deleted `reconciliation/router.py`. It does not: BE-4 now deletes only the `get_reconciliation` handler (`:38-51`), and **line 65 sits inside the surviving `get_trade_records` handler (`:52-66`)** — it is the `if date is not None and (len(date) != 8 or not date.isdigit())` guard at `:64-65`, which serves the live MOBO trade-reconciliation page. So the count is **13 sites, not 12.** Apply the change after BE-4 (the handler above it shrinks, so re-locate the guard by its message string rather than by line number).

Sites the proposal lists that already comply and must **not** be touched: `client_portal/router.py:90` (already `422`), `onboarding/service.py:289` (already `409`), `reconciliation/router.py:52-63` — `get_trade_records` already returns an empty `rows` list for a day with no orders, and its docstring says so explicitly; that route survives BE-4 and this behaviour is already what the seam asks for.

**Row 9 needs a decision, recorded here.** `GET /post-trade-allocation` returns `PostTradeAllocationView`, an object, not a collection — the seam's `200` + empty rule is written for collection endpoints. Implement it as **`200` with an empty-shaped `PostTradeAllocationView`** (empty row lists, zeroed totals, the requested `date` echoed), produced by the service, so the frontend's "no data for this date" state is a normal render rather than an error path. If the view type cannot express "empty" without a schema change, **stop and raise it** — a schema change is outside this branch's "no behaviour change beyond the fee scale" constraint.

**Behavior / invariants:**
- **The five `403` → `401` changes (rows 2-6) are the load-bearing ones.** `admin-frontend/server/api-client.ts:37` triggers its re-auth branch only on `401`; today those five dead-end in a generic toast instead of prompting a re-login. Getting the code right is the whole point of the row.
- `403` is retained where it is genuinely "authenticated but not permitted": `deps.py:53` and `:62` (wrong portal), `deps.py:74` and `:76-79` (`require_action` denials). Do **not** sweep those to `401`.
- Message strings are unchanged everywhere. Only the numeric code moves.
- Every affected test's expected code is updated in the same commit (BE-1/BE-2/BE-3 already made the suite legible).

**Done when:** each row's endpoint returns the new code, and the four intentionally-untouched `403`s still return `403`.

---

### BE-11 — Stop leaking `str(exc)` at 500 (Yes)

- **Proposal ref:** § Layer 2 B-1
- **Module:** §5.4
- **Files:** `modify: app/core/security.py`
- **Dependencies:** BE-9 (which defines `GENERIC_500` and the fallback handler).

`app/core/security.py:134-136` and `:163-165` return raw Firebase Admin SDK exception text — configuration paths, credential filenames, SDK internals — to an **unauthenticated** caller:

```python
except RuntimeError as exc:
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)   # :135 and :164
    ) from exc
```

**Contract (required code) — both sites, identically:**

```python
except RuntimeError as exc:
    logger.exception("Firebase Admin SDK initialization failed")
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=GENERIC_500
    ) from exc
```

**Behavior / invariants:**
- The information is **logged, not dropped** — `logger.exception` (the module already has a `logger`, used at `:142` and `:171`) records the full traceback server-side. Operators keep the diagnostic; the anonymous caller does not.
- `GENERIC_500` is imported from where BE-9 defines it, so there is exactly one 500 string. If importing from `app.main` would create a cycle, move the constant to `app/core/config.py` or a two-line `app/core/errors.py` — do not duplicate the literal.
- The status stays `500`: this genuinely is an unexpected server fault (misconfigured service account), matching the seam's last row.
- The two `401` sites at `:143-146` and `:172-174` keep their specific messages ("Invalid or expired id_token" / "Invalid or expired token") — those are caller-actionable and leak nothing.

**Done when:** neither site's response body contains any substring of the underlying exception, and the exception appears in the log.

---

### BE-12 — Move the `access` conflict payload out of `detail` (Recommend)

- **Proposal ref:** § Layer 2 B-2
- **Module:** §5.4
- **Files:** `modify: app/libs/access/service.py`
- **Dependencies:** BE-9. **Not independently revertible from BE-9** — reverting BE-9 alone leaves this site emitting a bare string where a dict was expected. Noted per §3.2.

`app/libs/access/service.py:95-98` is the one raise site in the repo whose `detail` is a dict, and it double-nests:

```python
raise HTTPException(
    status_code=409,
    detail={"detail": "matrix_changed_since_read", "published": published},
)
```

`admin-frontend/lib/admin/AdminStoreContext.tsx:223-226` sees `HTTP_409` and just calls `refreshMatrix()` — `published` is never read. It is dead weight on the wire.

**Contract (required code):**

```python
raise HTTPException(
    status_code=409,
    detail={
        "detail": "The access matrix changed since you loaded it. Refresh and retry.",
        "code": "matrix_changed_since_read",
    },
)
# -> BE-9's handler emits:
#    {"detail": "The access matrix changed since you loaded it. Refresh and retry.",
#     "code": "matrix_changed_since_read"}
```

**Behavior / invariants:**
- `published` is **dropped** (proposal: "Drop the `published` payload unless Layer 3 chooses to use it"). If the FE layer decides it wants it, it comes back as a **named top-level field**, never inside `detail`.
- `detail` becomes a human-readable sentence; the machine-readable slug moves to `code`. Both halves of §7.1(c) are then used exactly as intended.
- The status stays `409`, and the message string in `access/service.py:85-86`'s docstring should be updated if it now misdescribes the shape.
- This is the only site BE-9's dict branch exists for; keep that branch anyway — it is three lines and makes the handler total.

**Done when:** no `HTTPException` in `app/` carries a nested `detail` key, and the 409 body matches the shape above.

---

### BE-13 — `Decimal` equality guard on the fee compare-and-set (Yes)

- **Proposal ref:** § Layer 2 C-1
- **Module:** §5.6
- **Files:** `modify: app/libs/onboarding/service.py`
- **Dependencies:** none — parallel-safe.

Two sites decide whether to persist a fee override by comparing the captured fee against the model default:

```python
# app/libs/onboarding/service.py:362-365  (_approve_initial)
mgmt_override = None if model.mgmt_fee == onboarding.mgmt_fee else onboarding.mgmt_fee
incentive_override = (
    None if model.incentive_fee == onboarding.incentive_fee else onboarding.incentive_fee
)

# app/libs/onboarding/service.py:503-506  (submit_allotment, new-subscription branch)
mgmt_override = req.mgmt_fee if req.mgmt_fee != model.mgmt_fee else None
incentive_override = (
    req.incentive_fee if req.incentive_fee != model.incentive_fee else None
)
```

`model.mgmt_fee` is `2` (percent scale, from the PC editor) while `onboarding.mgmt_fee` is `0.02` (fraction). They can never be equal, so a non-`NULL` override is written on **every** approval, defeating the `NULL = inherit` design documented at `app/models/pc.py:220-223`.

**Contract (required code) — one helper, used at both sites:**

```python
from decimal import Decimal

_FEE_Q = Decimal("0.000001")  # Numeric(9, 6) — the DB's own scale

def _same_fee(a: Decimal | float | None, b: Decimal | float | None) -> bool:
    """True when two fees are the same at the column's 6-dp scale.
    Both operands are DECIMAL FRACTIONS (§7.1(a)); mixing a float DTO value with
    a Decimal column value is what makes the naive `==` unreliable."""
    if a is None or b is None:
        return a is b
    return Decimal(str(a)).quantize(_FEE_Q) == Decimal(str(b)).quantize(_FEE_Q)

# :362-365 becomes
mgmt_override = None if _same_fee(model.mgmt_fee, onboarding.mgmt_fee) else onboarding.mgmt_fee
# :503-506 becomes
mgmt_override = None if _same_fee(model.mgmt_fee, req.mgmt_fee) else req.mgmt_fee
```

**Behavior / invariants:**
- **No logic change.** The comparison was always correct; its inputs were not. Once the DB layer's B-1 and the FE layer's A-1 put both operands on the fraction scale, this unit only stops `Decimal(0.02) != 0.02` float-representation drift from reintroducing the same symptom.
- `Decimal(str(x))`, not `Decimal(x)` — the latter carries binary float noise into the quantize.
- `None` handling: `None == None` inherits (`True`), `None` vs a value is a difference. Match the existing behaviour of both call sites exactly; if they differ, keep each site's behaviour and say so in the commit.
- The `else` branch at `:507-510` (existing subscription reuses `existing.*_override`) is untouched.
- **Regression goals** (§8.3): approve an onboarding at the model's default fee ⇒ `mgmt_fee_override IS NULL`; approve at a negotiated fee ⇒ the override stores the **fraction**. One per site.
- This unit assumes fractions on both sides — an assumption from §7.1(a), faked in tests, **not** a dependency on the DB branch.

**Done when:** both sites route through `_same_fee`, and the two regression goals hold with fraction-scale inputs.

---

### BE-14 — `Field(ge=0, lt=1)` on the fee schemas (Yes)

- **Proposal ref:** § Layer 2 C-2
- **Module:** §5.6
- **Files:** `modify: app/libs/trade_models/schemas.py`
- **Dependencies:** none — parallel-safe.

`app/libs/trade_models/schemas.py` is the only public write surface for `models.mgmt_fee`, and it types the fields as bare `float | None` with no docstring and no range at three places: `:72-73` (`ModelCreate`), `:90-91` (`ModelUpdate`), `:114-115` (`ModelOut`).

**Contract (required code) — all three classes, identically:**

```python
from pydantic import Field

_FEE_DESC = "Decimal fraction, not percent: 0.020000 means 2%. Must satisfy 0 <= fee < 1."

class ModelCreate(BaseModel):
    ...
    mgmt_fee: float | None = Field(default=None, ge=0, lt=1, description=_FEE_DESC)
    incentive_fee: float | None = Field(default=None, ge=0, lt=1, description=_FEE_DESC)

class ModelUpdate(BaseModel):
    ...
    mgmt_fee: float | None = Field(default=None, ge=0, lt=1, description=_FEE_DESC)
    incentive_fee: float | None = Field(default=None, ge=0, lt=1, description=_FEE_DESC)

class ModelOut(BaseModel):
    ...
    mgmt_fee: float | None = Field(default=None, ge=0, lt=1, description=_FEE_DESC)
    incentive_fee: float | None = Field(default=None, ge=0, lt=1, description=_FEE_DESC)
```

**Behavior / invariants:**
- **This is the trust boundary that would have caught the original divergence** and it is not simplified away: with it in place, the percent-scale write (`mgmt_fee: 2.0`) that started this whole item is rejected at the door with a 422 rather than silently persisted.
- The 422 body is BE-9's envelope: `{"detail": "mgmt_fee: Input should be less than 1", "code": "validation_error", "errors": [...]}`.
- `lt=1`, not `le=1`: a 100% fee does not occur in this business, and `1` is the exact value that distinguishes the two scales.
- `ge=0` admits a zero fee, which is legitimate.
- `ModelOut` gets the same bound deliberately — it turns any percent-scale row still in the DB into a loud serialization failure rather than a quiet 100× display error. If that proves too strict during the DB migration window, relax **`ModelOut` only**, and record it.
- The `description` reaches OpenAPI, so the contract is visible to both frontends.

**Done when:** `POST /pc/models` with `mgmt_fee: 2.0` returns 422; with `mgmt_fee: 0.02` it succeeds and round-trips unchanged.

---

### BE-15 — Entitlement check on client material download (Yes)

- **Proposal ref:** § Layer 2 C-6
- **Module:** §5.6
- **Files:** `modify: app/libs/client_portal/{router,service,repository}.py`
- **Dependencies:** none — parallel-safe. (Touches the same function as BE-7's `:263`; sequence them adjacently.)

`app/libs/client_portal/router.py:104-115` gates `GET /client/models/{model_id}/material` on `get_current_client_user` only — and binds the user to `_user`, i.e. it is explicitly unused. `service.py:257-263` then streams the material for **any** `model_id`. Any authenticated client can fetch any model's marketing material, subscribed or not.

**Contract (required code):**

```python
# app/libs/client_portal/repository.py  — queries belong here (§3.1)
def has_subscription(self, user_id: uuid.UUID, model_id: uuid.UUID) -> bool:
    """True iff this client holds a client_subscriptions row for this model."""
    return (
        self.db.query(ClientSubscription.user_id)
        .filter(
            ClientSubscription.user_id == user_id,
            ClientSubscription.model_id == model_id,
        )
        .first()
        is not None
    )

# app/libs/client_portal/service.py:257
def model_material_stream(
    self, model_id: uuid.UUID, *, user_id: uuid.UUID
) -> tuple[BinaryIO, str, str | None]:
    if not self.repo.has_subscription(user_id, model_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No material uploaded for this model")
    material = self.repo.latest_material(model_id)
    ...

# app/libs/client_portal/router.py:104-110
def download_model_material(
    model_id: UUID,
    svc: Annotated[ClientPortalService, Depends(_service)],
    user: Annotated[User, Depends(get_current_client_user)],   # was `_user`
) -> StreamingResponse:
    stream, filename, content_type = svc.model_material_stream(model_id, user_id=user.id)
```

**Behavior / invariants:**
- **Security boundary — not simplified away.** The gate lives in the service, not the router, so any future caller inherits it.
- **`404`, byte-for-byte the same message as the existing not-found at `:260-262`.** A `403` would confirm the model exists to a client with no entitlement; an identical 404 leaks nothing about which model ids are real. This is deliberate, not laziness.
- The check runs **before** `latest_material`, so an unentitled request never touches the materials table or the filesystem.
- The `ClientSubscription` PK order is `(user_id, model_id)` — matching `onboarding/service.py:496`'s `db.get(ClientSubscription, (req.client_id, req.model_id))`.
- `positions_for_client` (`repository.py:46-54`) already selects the same rows joined to `Model`; the new method is a cheaper single-row existence check for the hot path. Do not reuse the join here.
- No other client-portal route changes.

**Done when:** a subscribed client downloads successfully; a non-subscribed authenticated client gets 404 with the identical body as an unknown model.

---

### BE-16 — Declare `response_model` on the two undeclared endpoints (Recommend)

- **Proposal ref:** § Layer 2 C-4
- **Module:** §5.5
- **Files:** `modify: app/libs/trade_models/router.py`, `app/libs/allocation_matrix/router.py`
- **Dependencies:** none — parallel-safe.

Both routes return JSON that OpenAPI does not describe, so they are absent from the generated schema and from any client generated off it.

**Contract (required code):**

```python
# app/libs/trade_models/router.py:82 — GET /pc/models/{model_id}
@router.get("/models/{model_id}", response_model=ModelDetailOut)
def get_model(...) -> object:
    ...   # body unchanged; it already returns a ModelDetailOut (:91)

# app/libs/allocation_matrix/router.py:77 — GET /pc/allocation
@router.get("/allocation", response_model=AllocationMatrixOut, responses={304: {}})
def get_allocation(...) -> object:
    ...   # body unchanged; the bare Response(304) branch stays as-is
```

**Behavior / invariants:**
- **The success body must not change.** `get_model` assembles `ModelDetailOut` with conditional `materials` / `changes` / `symbol_audit` fields depending on `?include=` (`router.py:90-98`). If `response_model` filtering would strip an optional field that is currently emitted, use `response_model_exclude_unset=True` — or, failing that, leave the route undeclared and record why. This unit is `Recommend`; a byte-changed body is not an acceptable price for an OpenAPI entry.
- `responses={304: {}}` documents the conditional branch without making FastAPI validate the bare `Response(304)` (`allocation_matrix/router.py:91-95`'s ETag contract). The 304 must still carry **no body**.
- Confirm the exact response-model names against the routers' existing imports before writing them; `AllocationMatrixOut` above is the placeholder for whatever `allocation_matrix/schemas.py` actually calls it.
- `/health` (`main.py:85-87`) is already typed by its return annotation and is out of scope.

**Done when:** both routes appear in `/openapi.json` with their schema, and a byte-comparison of each success body before/after is identical.

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal § 4.1)

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

- **Fee unit (a).** Serves and accepts fractions **verbatim — no scaling anywhere in the backend.** BE-14 makes the contract enforceable (`ge=0, lt=1` + the unit in the OpenAPI description); BE-13 makes the compare-and-set correct at the column's own 6-dp scale. The backend never multiplies or divides a fee.
- **Storage bucket (b).** BE-5 defines `Bucket` and `get_storage(bucket)` exactly as the seam declares them, including the six enum members and their column mapping. BE-7 passes a **literal** `Bucket` member at every call site, derived from the calling context — never parsed from a key (D-4). BE-8 supplies the single within-bucket per-client folder name. Every `storage_key` the backend writes after this branch is bucket-relative and carries no group prefix.
- **Error envelope (c).** BE-9's three handlers are the single place the envelope is produced; BE-10 applies the status-code table to all 13 outliers; BE-11 makes the `500` message a fixed generic string; BE-12 removes the last nested `detail`.

### 7.3 What this layer assumes from the other side

These are **assumptions, mocked in tests** (§8.3) — never runtime dependencies on a sibling branch, which is not visible here.

| Assumption | From | How it is faked in this layer's tests |
|---|---|---|
| `models.mgmt_fee` / `incentive_fee`, `client_onboardings.*`, `client_subscriptions.*_override` hold **decimal fractions** | DB layer B-1 | Fixtures seed `Decimal("0.02")` / `Decimal("0.2")` directly into the in-memory ORM rows. BE-13's tests never run the migration. |
| The three prefixed `*storage_key` columns hold **bucket-relative** values (no `client_kyc_docs/` etc.) | DB layer B-2 | Fixtures write keys without a group segment; `LocalStorage` is pointed at a `tmp_path` bucket root. |
| The six bucket roots exist and are writable | deploy | `LocalStorage.__init__` `mkdir`s them; tests use `tmp_path`. |
| The frontend divides by 100 on input and multiplies by 100 on display | FE layer A-1/A-2 | Not exercised here at all — this layer never scales a fee, so there is nothing to fake. |
| `admin-frontend/server/api-client.ts:37` re-auths on `401` | FE layer | Not exercised here; BE-10 rows 2-6 only assert the emitted code. |

**Change protocol:** any edit to §7.1 requires editing the proposal (§4.3) first; this section is then re-copied from it. §7.1 is never edited in isolation, and the seam is never renegotiated directly between two impl docs.

---

## 8. Internal unit testing

### 8.1 Test setup

- **Framework / runner:** `pytest` — command `.\.venv\Scripts\python.exe -m pytest -q`, run from `api-backend/`. (Bare `pytest` resolves the dependency-free system Python and will fail.)
- **Fixtures / seed:** in-memory SQLite via `Base.metadata.create_all` + `sessionmaker` (the established pattern, e.g. `tests/libs/reconciliation/conftest.py:44-62`); `TestClient(app)` with `app.dependency_overrides` for `get_db` and the auth dependency; `tmp_path` for every filesystem test.
- **Isolation:** hermetic, parallel-safe. Any test that changes a setting must call `get_settings.cache_clear()` **and** `get_storage.cache_clear()` — both are `lru_cache`d.
- **Layer isolation (critical):** tests import only from `app/*` on this branch plus stdlib and test doubles. No sibling-layer code, no migration run, no live DB for the units below, no frontend fixture. Where a test needs the other side of the seam, it **mocks the seam** with `unittest.mock` / `monkeypatch`, shaped by §7.1.
- **Test location:** `api-backend/tests/`, mirroring the source path.
- **Commit policy:** the `test-gen` output is generated locally and **never committed**. Note the distinction from BE-1/BE-2/BE-3, which edit the **existing, tracked** `api-backend/tests/` tree — those edits are part of the units and are committed.
- **Code generation:** concrete test code is written by the `test-gen` skill (`lite` | `standard` | `thorough`) from the goals below. This doc embeds **no test code**.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| BE-1 | `pytest --collect-only` exits 0; zero collection errors; the ticket test asserts `RESOLVED` | none |
| BE-2 | An admin stub used via `dependency_overrides` survives `actions_for` with no `DetachedInstanceError`; the shared `FakeIdentityService` satisfies every consumer of `generate_set_password_link` | none |
| BE-3 | Each renamed symbol / new kwarg is exercised at its current name; the grep guards still fail on reintroduction; the PTA test still fails and is not skipped | none |
| BE-4 | `/mobo/reconciliation` and the three EoD routes are gone (404) and the route count drops by exactly 4; **`/mobo/trade-records` still serves its normal body**; `app.libs.eod.*` and PTA still import and run; `RECON_VIEW` still exists | none |
| BE-5 | Each `Bucket` maps to its own root; overrides win over the default; roots are created; `get_storage()` with no arg is a `TypeError`; the cache returns one instance per bucket | none |
| BE-6 | Traversal, absolute-path and symlink-escape keys are refused with 404; legitimate nested keys still open | none |
| BE-7 | Each of the 8 call sites writes/reads under its own bucket root and nowhere else; the re-list guard survives | bucket-relative `storage_key` values (§7.3) |
| BE-8 | Slug form for a new client; reuse of an existing `*_{uid[-8:]}` directory after a rename; both buckets use the same function | none |
| BE-9 | String `detail` passes through byte-for-byte; dict `detail` flattens with `code`; 422 flattens with `errors`; an unhandled `ValueError` returns JSON 500 with the fixed message; headers are forwarded | none |
| BE-10 | Each of the 13 rows returns its new code; the intentionally-untouched `403`s are unchanged | none |
| BE-11 | Neither 500 body contains any part of the underlying exception; the exception is logged | Firebase init forced to raise `RuntimeError` |
| BE-12 | The 409 body is `{detail: <sentence>, code: "matrix_changed_since_read"}` with no `published` and no nesting | none |
| BE-13 | Default fee ⇒ override `NULL`; negotiated fee ⇒ override stores the fraction; both sites | fee fractions in the DB (§7.3) |
| BE-14 | `mgmt_fee: 2.0` rejected 422; `0.02` accepted and round-tripped; the bound applies to all three schemas | none |
| BE-15 | Subscribed client succeeds; unsubscribed client gets 404 identical to unknown-model; the materials table is not touched on rejection | none |
| BE-16 | Both routes appear in `/openapi.json`; success bodies byte-identical before/after; 304 still has no body | none |

### 8.3 Test goals (per unit)

#### BE-1
- **Positive:** the whole suite collects — `--collect-only` exits 0 with no error lines. The ticket test asserts against the current `TicketStatus` member and passes.
- **Negative:** none applicable; this unit removes tests rather than adding behaviour.
- **Invariants:** `--continue-on-collection-errors` is never required, on this branch or later. No `collect_ignore` / `--ignore` flag is introduced to hide a file instead of deleting it.
- **Seam mocks:** none.

#### BE-2
- **Positive:** an admin stub built by the shared helper, passed through `dependency_overrides` and consumed by `require_action`, reaches `actions_for` and reads `admin_profile` without error, on a **closed** seed session. The shared `FakeIdentityService` returns a link from `generate_set_password_link` and tracks the call.
- **Negative:** the double's failure mode still works — a seeded `fail_ensure` / `fail_next_ensure` raises from `ensure_identity`, and the caller's compensation path (`delete_user`) is observed.
- **Invariants:** adopt-vs-create semantics are preserved exactly (`created=False` for a seeded email, `True` for a fresh one). No test constructs its own admin stub. `generate_invite_link` is nowhere in `tests/`.
- **Seam mocks:** none — both fixes are internal to the test tree.

#### BE-3
- **Positive:** each renamed symbol is referenced at its current name and the referencing test passes; `StaffService.enroll()` is called with the full 7-kwarg set at all four sites; the alembic-head assertion matches `c72e91a4f6b3`.
- **Negative:** the two grep guards still fail when their forbidden symbol is reintroduced — prove the guard by temporarily reintroducing it, not by trusting the pattern.
- **Invariants:** no production file is modified by this unit. **`tests/libs/post_trade_allocation/test_be3_service_run.py:365` still runs and still fails** — assert its presence in the run's failure list, not its absence; it must not be skipped, xfailed, or re-asserted.
- **Seam mocks:** none.

#### BE-4
- **Positive:** the app imports and boots; `GET /api/mobo/reconciliation` returns 404; the total route count is exactly **1** lower than before.
- **Negative:** `GET /api/mobo/trade-records` must **still work** — with a valid `date`, with `date` omitted (latest day), and with a day that has no orders (empty `rows`, `200`, not 404). Assert its success body against a pre-change capture. A test asserting this route is gone is itself the regression; the goal here is a guard against over-deletion.
- **Invariants:** importing `app.libs.reconciliation.{router,records,engine,presenter,dtos,formatting}`, `...algotrade.synth` and `app.models.recon` all still succeed — the retained set is asserted explicitly by name, so a later over-eager deletion breaks a test rather than EoD or the MOBO page. `get_reconciliation` and `_resolve_session` are absent from `app.libs.reconciliation.router`. `Action.RECON_VIEW` exists and the `mobo.trade-reconciliation` page grant still resolves (it gates the surviving route). The EoD day-view and the PTA run path still execute end to end against their existing fixtures.
- **Seam mocks:** none.

#### BE-5
- **Positive:** for each of the six members, `get_storage(bucket)` returns a `LocalStorage` rooted at `{storage_root}/{bucket.value}` by default, and at the override when `storage_root_<name>` is set; the directory exists after the call. A second call with the same member returns the **same object**; a different member returns a different one.
- **Negative:** `get_storage()` with no argument raises `TypeError`. `storage_backend="nas"` returns `NasStorage`, whose methods raise `NotImplementedError`. Referencing the deleted `legal_docs_subdir` / `client_statements_subdir` settings raises `AttributeError`.
- **Invariants:** `app/core/storage.py` imports nothing from `app.libs` (assert by reading the module's source or its `__dict__`). Six distinct roots for six distinct members; no two share a directory. `get_storage.cache_clear()` restores a clean state.
- **Seam mocks:** none — §7.1(b) is realized here, not assumed.

#### BE-6
- **Positive:** a key with a legitimate nested path (`Cathy_Client_ke-uid-1/x.pdf`, `2026-07/EoD.pdf`) opens and returns the written bytes.
- **Negative:** each escape class is rejected with 404 — `../` traversal, deep `../../../` traversal, an absolute POSIX path, an absolute Windows path, a key that resolves through a symlink pointing outside the root, and an empty-ish key resolving to the root itself when a file is expected. Nothing outside the bucket root is ever opened.
- **Invariants:** a rejected key produces the **same** 404 body as a missing key — no path, no root, no exception text on the wire. Containment is decided after `.resolve()` on both sides; a test with a symlink proves a string-prefix implementation would pass where this one must fail.
- **Seam mocks:** none. This is a trust boundary; it gets thorough coverage regardless of the chosen `test-gen` level.

#### BE-7
- **Positive:** for each of the eight sites, the file written or read lands under that site's bucket root — marketing material under the marketing root, KYC under KYC, contact-log attachments under contact_log, EoD PDFs under reports, and the client-portal scopes under marketing/legal/statements respectively.
- **Negative:** none of the six roots contains a file belonging to another bucket after the whole set runs. The material route's storage dependency resolves to the marketing bucket, not a default.
- **Invariants:** no `subdir` value contains a document-group name (`client_kyc_docs`, `models_mrkt_materials`, `client_contact_logs`, `legal_docs`, `client_statements`) — assert by grepping the produced keys. The `client_portal/service.py:285-288` re-list guard still rejects a key that is not in the listing.
- **Seam mocks:** DB-side `*storage_key` values are faked as bucket-relative strings (§7.3) — fixtures build ORM rows directly with keys such as `"Cathy_Client_ke-uid-1/ab12_passport.pdf"`, never with a group prefix, and never by running a migration.

#### BE-8
- **Positive:** a client with no existing directory gets `{Slug_Name}_{uid[-8:]}`; the slug is filesystem-safe (non-alphanumerics collapsed to `_`, no leading/trailing `_`); a nameless/unsluggable client gets `client_{uid[-8:]}`. Both the KYC and contact-log paths produce the same name for the same client.
- **Negative:** after the client is **renamed**, the function returns the **pre-existing** directory name, not a newly-slugged one — the D-10 property. A directory whose suffix matches but which is a *file*, not a directory, is ignored.
- **Invariants:** idempotent — repeated calls return the same string. Exactly one slug definition exists repo-wide (`grep -rn "\[^A-Za-z0-9\]+" app/` finds it only in `app/core/storage.py`). Two clients whose names sanitize identically still land in distinct folders (the reason the uid suffix exists).
- **Seam mocks:** none; `tmp_path` bucket roots.

#### BE-9
- **Positive:** a string-`detail` `HTTPException` produces **exactly** `{"detail": "<the same string>"}` at the same status — compare the raw response bytes against a pre-change capture, since byte-for-byte identity is the unit's defining property. A dict `detail` flattens to a string plus `code`. A validation failure produces a one-line `detail`, `code: "validation_error"`, and the raw list under `errors`. An unhandled `ValueError` raised inside a route produces `{"detail": "Internal server error."}` at 500 with `content-type: application/json`.
- **Negative:** no response body is plain text; no `detail` is ever a list or a dict; the 500 body contains no substring of the raised exception's message. A route that raises inside a dependency (not the handler) is covered too.
- **Invariants:** the handler is registered on `starlette.exceptions.HTTPException` so an unrouted path's 404 is also enveloped. `WWW-Authenticate` and any other `exc.headers` survive to the response. Every one of the 90 routes' error paths, when provoked, satisfies "`detail` is a `str`" — a parametrized sweep is the `thorough` form of this goal.
- **Seam mocks:** none. Use `TestClient(app, raise_server_exceptions=False)` for the 500 case.

#### BE-10
- **Positive:** one goal per row of BE-10's table — provoke the failure, assert the new status code and the unchanged message string.
- **Negative:** the deliberately-retained `403`s still return `403`: wrong-portal (`deps.py:53`, `:62`) and `require_action` denial (`deps.py:74`, `:76-79`). A sweep-everything implementation fails these.
- **Invariants:** rows 2-6 all emit `401`, which is what the admin re-auth branch keys on — assert the code, not any header. Row 9 returns `200` with an empty-shaped view whose `date` echoes the request, and no `404` for a date with no run. No success path's status changes.
- **Seam mocks:** none.

#### BE-11
- **Positive:** with Firebase initialization forced to raise, both entry points (`verify_firebase_id_token_string` and `verify_firebase_token`) return 500 with exactly the fixed generic string, and the underlying exception appears in the captured log (`caplog`).
- **Negative:** the response body contains no substring of the raised `RuntimeError`'s message — assert on a distinctive sentinel planted in the raised exception, so a partial leak fails the test.
- **Invariants:** the two `401` paths ("Invalid or expired id_token" / "Invalid or expired token") keep their specific messages. Exactly one generic-500 string constant exists in the codebase.
- **Seam mocks:** `_init_firebase` monkeypatched to raise `RuntimeError("SENTINEL-...")`.

#### BE-12
- **Positive:** a stale-token publish returns 409 whose body is `{"detail": "<human sentence>", "code": "matrix_changed_since_read"}` — a flat object, `detail` a string.
- **Negative:** the body has no `published` key and no nested `detail`. A `json.loads` of `detail` must fail (it is prose, not JSON) — that is the regression this unit exists to prevent.
- **Invariants:** the status stays `409`. No other `HTTPException` in `app/` carries a dict `detail` — assert with a source-level grep guard so a new one cannot creep in.
- **Seam mocks:** none.

#### BE-13
- **Positive:** approving an onboarding whose captured fee **equals** the model default leaves `mgmt_fee_override` and `incentive_fee_override` `NULL` (proposal goal 2). Approving at a negotiated fee stores that fee, as a fraction, in the override. Both properties are asserted separately at `_approve_initial` (`:362-365`) and at `submit_allotment`'s new-subscription branch (`:503-506`).
- **Negative:** values that are equal only after quantization (e.g. `Decimal("0.0200004")` vs `Decimal("0.02")` at 6 dp) are treated as equal ⇒ `NULL`; values differing in the 6th decimal place are treated as different ⇒ an override is stored. A float-vs-`Decimal` pair of the same nominal value does **not** produce a spurious override — that is the guard's entire purpose.
- **Invariants:** the existing-subscription branch (`:507-510`) never recomputes an override. `None` handling is unchanged from the pre-change behaviour at each site.
- **Seam mocks:** the DB-side fraction assumption (§7.3). Fixtures construct `Model` and `ClientOnboarding` rows directly with `Decimal("0.02")` / `Decimal("0.2")`; **no migration is run and the DB branch is not present.** The fake's shape is simply "`Numeric(9,6)` columns already holding fractions".

#### BE-14
- **Positive:** `mgmt_fee: 0.02` and `incentive_fee: 0.2` are accepted by `ModelCreate` and `ModelUpdate` and round-trip unchanged through `ModelOut`; `None` is still accepted (the fields stay optional); `0` is accepted.
- **Negative:** `2.0` (the original percent-scale write) is rejected with 422; so are `1.0` (the exact boundary, `lt` not `le`) and `-0.01`. The 422 body carries `code: "validation_error"` and an `errors` entry whose `loc` names the field — i.e. it composes with BE-9.
- **Invariants:** all three schemas carry the same bound and the same description; the description text names the unit ("decimal fraction … 0.020000 means 2%") and reaches `/openapi.json`.
- **Seam mocks:** none — this unit *is* the enforcement of §7.1(a) at the API boundary.

#### BE-15
- **Positive:** a client with a `ClientSubscription` on `(user.id, model_id)` receives the stream, filename and content type unchanged from today's behaviour.
- **Negative:** an authenticated client **without** a subscription receives 404, with a body identical to the unknown-model 404 — assert the two bodies are equal, so a future divergence that leaks existence fails the test. A client subscribed to a *different* model is also rejected. No `403` is emitted.
- **Invariants:** on rejection, `latest_material` is never called (assert with a spy) and no filesystem read occurs. The subscription lookup uses `(user_id, model_id)` in that order.
- **Seam mocks:** none.

#### BE-16
- **Positive:** both routes appear in `/openapi.json` with a resolved schema reference. `GET /pc/models/{id}` with each `?include=` combination returns a body byte-identical to a capture taken before the change.
- **Negative:** the 304 branch of `GET /pc/allocation` still returns an empty body and does not attempt response-model validation; the `ETag` / `If-None-Match` contract at `allocation_matrix/router.py:91-95` is unaffected.
- **Invariants:** no optional field currently emitted is stripped by `response_model` filtering. If any is, the unit is descoped rather than the body changed — record the reason.
- **Seam mocks:** none.

### 8.4 Aggregate gate

- The §3.2 gate is a **local gate** before commit / PR hand-off. Green means: `ruff check` clean, `ruff format --check` clean, `mypy app` clean, and `pytest -q` with **exactly one** failure — `tests/libs/post_trade_allocation/test_be3_service_run.py:365` (D-7), unskipped and named in the PR body.
- Target coverage for changed lines: ≥ 90% of new/changed statements in `app/`. BE-6, BE-9 and BE-15 are trust boundaries and get `thorough` coverage regardless of the level chosen for the layer.
- Chosen `test-gen` level for this layer: **`standard`**, with `thorough` for BE-6, BE-9, BE-14, BE-15 — set by the orchestrator or the human before dispatch.

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] Every §6 unit (BE-1 … BE-16) committed on the layer branch; each commit left the branch green per §3.2.
- [ ] `pytest -q` runs to completion with no `--continue-on-collection-errors`, and exactly one named failure (D-7's PTA test, unskipped).
- [ ] Route count is 93; every surviving route's success body is byte-for-byte unchanged.
- [ ] Every non-2xx response across all 90 routes carries a string `detail` (§7.1(c)).
- [ ] `grep -rn "get_storage()" app/` and `grep -rn "trade_models.storage" app/` are both empty.
- [ ] The three trust boundaries are in place and tested: path containment (BE-6), `Field(ge=0, lt=1)` (BE-14), the material entitlement check (BE-15). None was traded away for a smaller diff.
- [ ] §7.1 matches proposal §4.1 verbatim — checked against the proposal on the parent branch, **not** against sibling branches.
- [ ] **`GET /api/mobo/trade-records` still works** and the MOBO trade-reconciliation admin page still loads — the single deletion is `get_reconciliation` only.
- [ ] BE-4's retained set matches D-12 exactly — `reconciliation/router.py`, `records.py`, `app/models/recon.py`, `recon_notional_epsilon`, the `engine` / `presenter` / `adapters` / `dtos` / `formatting` / `algotrade.synth` modules, **and all of `app/libs/eod/` except `router.py`** are still present and importable; `app/main.py:26,75` still mount the reconciliation router; `GET /api/mobo/trade-records` is byte-for-byte unchanged; `EodService` still constructs and the PTA path still runs. **This unit deleted zero logic — only HTTP surface.** (The cross-layer risk this layer raised — the DB layer dropping `recon_sessions` under EoD's feet — was escalated and **resolved** by D-12: the table is not dropped. Nothing is left open for the human here; the evidence table in BE-4 stays as the record of why.)
- [ ] PR opened against the parent branch; the human owns the merge.

**Rollback:** this layer is **code-only** — every unit reverts cleanly with the branch or with its own commit. No migration, no data change, nothing lossy.

Two ordering caveats, already noted in the units' **Dependencies**:
- Reverting BE-5 alone leaves BE-7's imports dangling — revert them together.
- Reverting BE-9 alone leaves BE-12 emitting a dict `detail` with no handler to flatten it — revert them together.

Deployment-side, the six bucket directories are created automatically on first use, so a rollback to the pre-branch code simply stops writing to them; existing files under the old single root are untouched by anything in this layer. The directory move and the key migration that make old files reachable through the new roots belong to the DB layer and the deploy schedule, not here.
