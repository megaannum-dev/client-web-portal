# 019 — Admin Access Control & Staff Enrollment · Implementation Details — Backend

> Status: **DRAFT — pending implementation.**
> Implements: proposal `docs/proposals/019-2026-07-29-admin-access-control-and-staff-enrollment.md` § "Layer 2 — Backend" (structural change A, logic change B, findings C-1…C-11, route-surface decision D, summary table E), plus § 4 Cross-layer seam, Design decisions D-1/D-2/D-3/D-6/D-6a/D-7/D-8/D-9, the Backend rows of § "Dead code purged", § "Execution & verification" step 2 and § Rollback.
> Layer: Backend — **one layer per file.**
> Sibling layer docs:
> - Database — `docs/implementations/019-admin-access-control-and-staff-enrollment-db.md`
> - Frontend — `docs/implementations/019-admin-access-control-and-staff-enrollment-fe.md`
> Execution schedule: `docs/execution-schedules/019-admin-access-control-and-staff-enrollment-be.md`
> Branch: `claude/admin-pages-backend-proposal-f0c9fc-be` — cut from the parent branch `claude/admin-pages-backend-proposal-f0c9fc`, merges back into it; **the human owns that merge.**
> Builds on / prerequisites: Alembic revision **`0028_admin_access_control`** (four tables + four columns + the **55-row** `page_access` seed — 30 `edit` + 25 `view`, derived from the System Config catalog's level matrix, **not** a parity copy of today's grants (D-11); `0026`/`0027` are already taken by `client_portal_integration` and `ticket_status_consolidation`, so its parent is the current head `b34f8c1a9d27`) must be **applied to the target database**. This is a hard precondition, not a soft one: proposal C-2 deletes the `ROLE_ACTIONS` fallback deliberately, so this layer **fails closed** — every guarded admin route returns 403 — against an un-migrated DB.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/019-2026-07-29-admin-access-control-and-staff-enrollment.md` § "Layer 2 — Backend" |
| Execution schedule | `docs/execution-schedules/019-admin-access-control-and-staff-enrollment-be.md` (predicted — does not exist yet) |
| Sibling layer impl docs | `docs/implementations/019-admin-access-control-and-staff-enrollment-db.md`, `docs/implementations/019-admin-access-control-and-staff-enrollment-fe.md` |
| Builds on | Alembic revision `0028_admin_access_control` applied (`down_revision = "b34f8c1a9d27"`, the current head — `0026_client_portal_integration` and `0027_ticket_status_consolidation` sit between it and `fa66b2f3aee6`). Prior proposals this layer edits the output of: 004 (`auth` module, `Action`, `require_action`), 013/014 (`onboarding` approve pipeline), 018 (`client_tickets.assigned_rm_uid` snapshot semantics — preserved for closed tickets by C-11) |
| Frozen seam | proposal § 4 — copied verbatim into § 7 below |

---

## 2. Branch & session contract

- **Branch:** `claude/admin-pages-backend-proposal-f0c9fc-be`, cut from `claude/admin-pages-backend-proposal-f0c9fc`. Every BE-* unit in this doc lands on this one branch.
- **Isolation:** implementable in a separate session on this branch, in parallel with the DB and Frontend layers. It shares state with them **only** through the frozen contract in § 7. No sibling-layer file is imported, stood up, or waited on; the DB layer's four tables and four columns are consumed as a *contract* (names + types from § 7's field map), and the Frontend is a consumer of § 7's DTOs, never a dependency.
- **Preconditions (must be true before starting):**
  - [ ] The frozen seam (proposal § 4) is agreed — § 7 below is a verbatim copy of it, not a negotiation with a sibling layer.
  - [ ] **Alembic revision `0028_admin_access_control` is applied to the working database** (four tables, four columns, and the 55-row catalog-derived seed of D-11 — 30 `edit` + 25 `view`, per-role RM 7 / MOBO 10 / PM 0 / PC 10 / COMPLIANCE 12 / ADMIN 16). Every unit from BE-3 onward reads or writes `page_access`, `page_access_overrides`, `page_access_publications`, `admin_audit_events`, `users.last_sign_in_at` or one of the three new `admin_profiles` columns (`department`, `start_date`, `address`). This is the one hard precondition of the layer: because BE-5 deletes `ROLE_ACTIONS` outright (C-2), a backend running against an un-migrated DB resolves an empty action set for every admin and answers **403 on every guarded route**. That is the intended failure mode (fail-closed authorisation, D-9) — it is not a bug to work around by re-adding a fallback.
  - [ ] Firebase Trigger Email extension configured **and** the service-account key rotated (proposal § Execution phase 0). Required only to exercise BE-13/BE-14/BE-17/BE-20 end to end against real Firebase; every other unit and all § 8 unit tests run without it (`firebase_auth_disabled` bypass).
  - [ ] Python env: `api-backend\.venv\` (the system Python has no dependencies — run `.\.venv\Scripts\python.exe`, `.\.venv\Scripts\alembic.exe`, `.\.venv\Scripts\pytest.exe`).
- **Read-first inventory** (every existing file a unit touches — no discovery phase needed):
  - `app/libs/auth/actions.py` — `Action` (16 members; 5 renamed by BE-1), `ROLE_ACTIONS` + `get_actions_for_role` (deleted by BE-5).
  - `app/libs/auth/deps.py` — `_resolve_user`, `get_current_user`, `get_current_admin_user`, `require_action` (rewritten by BE-5, lines 66-82).
  - `app/libs/auth/service.py` — `login_and_bind` (BE-7 adds one timestamp write; the `set_portal_claims` block and `assert_can_authenticate` call stay).
  - `app/libs/auth/router.py` — `client_login` / `admin_login` / `auth_me` (BE-6 changes what they serialise, not their paths).
  - `app/libs/auth/status.py` — `assert_can_authenticate`; read-only reference, **not changed** (D-4: `INITIATED` is derived, so no status gate learns a third value).
  - `app/libs/staff/service.py` — `StaffService.enroll` (saga, lines 34-69), `StaffService.update` (last-active-ADMIN TOCTOU guard, lines 71-120), `StaffUpdatePatch` Protocol.
  - `app/libs/staff/repository.py` — `create_with_profile`, `count_active_admins(for_update=True)`.
  - `app/libs/staff/router.py` — `POST ""`, `PATCH "/{uid}"`.
  - `app/schemas/staff.py` — `StaffEnrollIn`, `StaffUpdateIn`, `StaffOut` (incl. `invite_link`, deleted by BE-15).
  - `app/schemas/users.py` — `UserOut` (BE-6 adds `grants`).
  - `app/libs/identity/service.py` — `_DEFAULT_PASSWORD` (line 8, deleted), `create_user` (line 17), `generate_invite_link` (line 44), `ensure_identity`, `get_user_by_email`, `delete_user`.
  - `app/libs/identity/deps.py` — `get_identity_service`.
  - `app/libs/clients/service.py` — `ClientService.assert_is_rm` (line 22, reused by BE-19), `ClientService.onboard` (line 38 — the second `ensure_identity` caller, fixed for free by BE-12).
  - `app/libs/clients/repository.py` — `FULL_VISIBILITY_ROLES` (line 19), `_scoped` (line 103) — the reason C-11 exists; read-only, unchanged.
  - `app/libs/onboarding/service.py` — `approve` (line 269), `_approve_initial` (line 298), `_approve_renewal` (line 348), `rm_options` (line 186), `start` (line 112 — the existing `identity`/`settings` parameter convention BE-20 copies).
  - `app/libs/onboarding/router.py` — `_service` dep (line 40), `approve_onboarding` (line 289), and the four `require_action(Action.CLIENT_VIEW/ALLOTMENT_ACKNOWLEDGE)` guard sites BE-22 repoints: `submit_allotment` (:211), `submit_redemption` (:220), the transaction-detail route (:234), `list_allotments` (:312).
  - `app/models/onboarding.py` — `TicketStatus` (line 352 — values `new`/`in_progress`/`resolved`/`declined`), `ClientTicket.assigned_rm_uid` + its snapshot comment (lines 368-375).
  - `app/models/users.py` — `AdminRole`, `AccountStatus`, `User.role`/`User.name` derived properties, `AdminProfile`.
  - `app/libs/users/repository.py` — `UserRepository`, `AdminProfileRepository.get_by_user_id`.
  - `app/libs/dev/router.py`, `app/libs/dev/service.py`, `app/schemas/dev.py` — deleted by BE-21.
  - `app/core/config.py` — `Settings.dev_mode` (lines 16-18, deleted by BE-21).
  - `app/core/security.py` — `_init_firebase`, `set_portal_claims` (read-only: BE-14's Firestore client reuses `_init_firebase`; D-2 keeps claims carrying only portal+role).
  - `app/main.py` — router mounts (line 64-77), the dev conditional mount (lines 79-83) and the production fail-closed check (line 35), both edited by BE-21.
  - `app/cli/bootstrap_admin.py` — line 55 calls `generate_invite_link`; renamed by BE-13.
  - `app/libs/{allocation_matrix,clients,onboarding,staff,trade_models}/router.py` + `app/libs/trade_models/test_router_symbols.py` — the `*_MANAGE` call sites renamed by BE-1.
  - `admin-frontend/lib/pages-config.ts` — **read-only, never imported.** Its `PAGES` keys (16 `PageId` literals, lines 62-179) and `ROLE_PAGES` (lines 196-225) are the source `app/libs/access/pages.py` mirrors by hand (D-8).
- **Hand-off / exit signal:** all BE-* units committed on the layer branch, each commit green; § 3.2's gate command passes; every § "Dead code purged" backend grep returns nothing (`ROLE_ACTIONS`, `get_actions_for_role`, `12345678`, `dev_mode`, `dev_register`, `invite_link`, `_MANAGE`); the Q-5 link-type outcome (BE-13) is recorded in this file's § 6 BE-13 block **before** the Frontend layer is scheduled; PR opened against the parent branch.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions

- **Layering:** `router → service → repository → app/models/*`, exactly as `app/libs/onboarding/`, `app/libs/client_portal/` and `app/libs/staff/` already do. A router does dependency resolution and response-model wiring only; a service owns every derivation, every guard **and the transaction boundary** (`self.repo.db.commit()` / `.rollback()` live in the service, never in the repository — see `StaffRepository.create_with_profile`'s docstring); a repository issues one query shape and returns ORM rows or plain row tuples, never a DTO.
- **Dependency injection:** `Annotated[X, Depends(...)]` throughout — `Annotated[Session, Depends(get_db)]`, `Annotated[Settings, Depends(get_settings)]`, `Annotated[User, Depends(require_action(Action.X))]`, plus a local `_get_service` / `_service` factory per router module.
- **Module dependency direction (proposal § Layer 2 A, binding):** `auth.deps → access.resolver → access.repository`. `access` must **not** import `staff`; `staff` **may** import `access` (to write enrollment-time overrides). **Nothing inside `access` imports `auth.deps`** — that would cycle. The resolver therefore takes a `User` and a `Session` as plain arguments, never a FastAPI dependency.
- **Error envelope:** unchanged — `HTTPException(status_code, "message")` → FastAPI's `{"detail": "..."}`. The one structured body in this layer is C-5's 409, which passes a dict as `detail` (`{"detail": {"detail": "matrix_changed_since_read", "published": {...}}}` on the wire) exactly as § 7.1 specifies.
- **Enums on the wire:** `str, Enum` for new value sets (`AccessLevel`), matching `TicketKind`/`TicketStatus`; `AdminRole`/`AccountStatus` cross the wire by **value** (`values_callable` convention in `app/models/users.py`).
- **Case convention:** `AccessLevel` is **UPPERCASE on the wire and in Python code**, lowercase in the DB column (§ 7's field map). The mapping lives in exactly one place — `access.repository` — so no service or router ever spells a lowercase level.
- **Naming:** DTOs `...Out` for responses and `...In` for request bodies in the admin surface (matching `StaffOut`/`StaffEnrollIn`, § 7.1's own names), not the `...DTO`/`...Req` pair used inside `onboarding`/`client_portal`.
- **Package layout:** the proposal's tree for `app/libs/access/` lists `repository.py` / `resolver.py` / `service.py` / `router.py` / `pages.py`. This doc adds `schemas.py` for the six § 7.1 DTOs — every other feature package in the repo (`onboarding`, `client_portal`) keeps its DTOs in a `schemas.py`, and inlining them in `router.py` would be the only such case in the codebase. Recorded here as a convention-consistent addition, not a scope change.
- **Ports/adapters:** the mailer is a plain module-level function with an injected `Settings` (`send_set_password_email(*, ..., settings)`), not a class — one function, one caller shape, no interface with one implementation.

### 3.2 CI/CD & engineering discipline

- **Trunk-friendly, small units.** Each BE-* unit is one atomic, self-reviewable commit that leaves the branch green (lint, format, type-check, tests). No unit depends on an uncommitted sibling unless its "Dependencies" line says so.
- **Every unit is independently revertible**, with two stated exceptions: BE-5 (`require_action` DB-backed) cannot be reverted without BE-2/BE-3/BE-4 still present, and BE-1 (the `*_MANAGE` → `*_WRITE` rename) is a whole-branch vocabulary change that every later unit is written in — reverting it alone breaks BE-2's `PAGE_ACTIONS`.
- **Additive & backward-compatible first.** All new routes are added alongside the existing two staff routes; `UserOut.grants` is an added field; the only removals (`ROLE_ACTIONS`, `_DEFAULT_PASSWORD`, `app/libs/dev/`, `Settings.dev_mode`, `StaffOut.invite_link`) are scheduled as their own late units so the branch is deployable at every commit — **with the single deliberate exception** that BE-5 flips authorisation to the DB and therefore requires the migration from the first commit that lands it (D-9's fail-closed rule).
- **Gates before merge** (must pass in CI, in this order: lint → format → type-check → unit tests → build). Verified present in `api-backend/pyproject.toml`: `[tool.ruff]` (`line-length = 100`, `lint.select = ["E","F","I"]`, `exclude = ["alembic",".venv","pc_storage"]`), `[tool.pytest.ini_options]` (`testpaths = ["app","tests"]`), `[tool.mypy]` (`files = ["app"]`). Run from `api-backend/`:
  ```bash
  ruff check . && ruff format --check . && mypy app && pytest -q
  ```
  There is no formatter config section, so `ruff format` runs on its built-in defaults. Use the repo's venv (`api-backend\.venv\Scripts\`) — the system Python has no dependencies installed.
- **No secrets, no manual steps in the merge path.** Applying `0028_admin_access_control` to a shared/live DB, configuring the Trigger Email extension and rotating the Firebase key are **human gates** owned by the execution schedule (proposal § Execution phases 0 and 4). Nothing in this doc bakes them into a unit.
- **Reversibility documented** — see § 9, including the two Firebase-side asymmetries the proposal's § Rollback names.

---

## 4. Architecture (level 1 of 3)

**Target layout:**
```
app/libs/access/                 (NEW package)
  __init__.py
  pages.py        # PAGE_META (16 entries, wire order) · PAGE_IDS · PAGE_ACTIONS · PAGELESS_ACTIONS
  repository.py   # page_access / page_access_overrides / page_access_publications /
                  #   admin_audit_events reads+writes; the ONLY place level case is folded
  resolver.py     # effective level per page for a User; the ONLY place the
                  #   override-vs-role precedence rule lives. No cache.
  service.py      # matrix publish (atomic) · override grant/revoke · audit composition
  schemas.py      # MatrixOut / MatrixPublishIn / OverrideOut / OverrideIn / AuditOut
  router.py       # /api/admin/access/{matrix,overrides,overrides/{id}} + /api/admin/audit

app/libs/identity/
  mailer.py       (NEW) # send_set_password_email() — the only email sender in the codebase
  service.py      # create_user(email) mints a PASSWORDLESS identity; _DEFAULT_PASSWORD deleted;
                  #   generate_invite_link → generate_set_password_link (kept, 3 callers)

app/libs/auth/
  actions.py      # 5 members renamed *_MANAGE → *_WRITE; ROLE_ACTIONS + get_actions_for_role DELETED
  deps.py         # require_action resolves via access.resolver.actions_for(user, db)
  service.py      # login_and_bind writes users.last_sign_in_at
  router.py       # /auth/me + both logins now serialise UserOut.grants

app/libs/staff/
  schemas → app/schemas/staff.py   # StaffEnrollIn(+domain validator, send_link, overrides,
                  #   department, start_date, address) · StaffUpdateIn(+status, department,
                  #   deactivate_reason, reassign_book_to) · StaffOut(rebuilt) ·
                  #   StaffCreatedOut · LinkSentOut ; invite_link DELETED
  repository.py   # + list_directory() one grouped-subquery pass · count_book() ·
                  #   reassign_book() · reassign_open_tickets()
  service.py      # enroll() extended (department, overrides, link + mail after commit);
                  #   update() gains the ONE RM-handover guard beside the surviving
                  #   last-active-ADMIN TOCTOU guard
  router.py       # + GET "" · + POST "/{uid}/set-password-link"

app/libs/onboarding/
  service.py      # _approve_initial sends the client's set-password email AFTER commit;
                  #   _approve_renewal sends nothing
  router.py       # approve_onboarding passes identity + settings into svc.approve

app/libs/dev/     -- DELETED IN FULL (router.py, service.py, __init__.py)
app/schemas/dev.py -- DELETED
app/core/config.py # Settings.dev_mode DELETED
app/main.py        # + access router mount; − dev conditional mount; the production
                   #   fail-closed check KEEPS its firebase_auth_disabled half
app/schemas/users.py # UserOut + grants
```

**Dependency direction:**
```
auth.deps ──► access.resolver ──► access.repository ──► app/models/{access,users}
access.router ──► access.service ──► access.repository
                        └────────► access.pages   (pure constants, no imports but Action/AdminRole)
staff.service ──► access.repository (enrollment-time overrides)   [staff → access, one way]
staff.service ──► clients.service.assert_is_rm  (C-11 receiver validation, reused not reimplemented)
staff.service ──► identity.{service,mailer}
onboarding.service ──► identity.{service,mailer}
```
`access` imports **nothing** from `staff`, `clients`, `onboarding` or `auth.deps`. `access.pages` imports only `Action` and `AdminRole`.

**External seams:**
- **Tables read:** `page_access`, `page_access_overrides`, `page_access_publications`, `admin_audit_events`, `users`, `admin_profiles`, `client_profiles`, `client_tickets`.
- **Tables written:** `page_access` (upsert/delete), `page_access_overrides`, `page_access_publications`, `admin_audit_events`, `users` (`status`, `email`, `last_sign_in_at`), `admin_profiles` (`role`, `name`, `phone_number`, `department`), `client_profiles.assigned_rm_uid` (C-11), `client_tickets.assigned_rm_uid` (C-11, open tickets only).
- **Routes exposed:** the 10 admin routes of § 7.1 § D, plus the extended `GET /api/auth/me` and `POST /api/auth/{client,admin}/login`. One route removed: `POST /api/dev/register`.
- **External services:** Firebase Auth (identity mint, action links) and Firestore (`mail` collection for the Trigger Email extension) — both through `app/core/security._init_firebase`, no new dependency and no SMTP credential in `Settings`.
- **Depends on (contract only):** the DB layer's four tables + `users.last_sign_in_at` + `admin_profiles.department`, per § 7's field map.

---

## 5. Modules (level 2 of 3)

### 5.1 `access.pages`
- **Responsibility:** the one place the backend learns what pages exist and which actions each level unlocks.
- **Files:** `app/libs/access/pages.py`.
- **Public surface:** `PageMeta`, `PAGE_META`, `PAGE_IDS`, `PAGE_ACTIONS`, `PAGELESS_ACTIONS`.
- **Owns features:** BE-2.

### 5.2 `access.repository`
- **Responsibility:** every query and DML statement against the four new tables; the sole place the wire's UPPERCASE level is folded to/from the DB's lowercase enum. Never commits.
- **Files:** `app/libs/access/repository.py`.
- **Public surface:** `AccessRepository`.
- **Owns features:** BE-3.

### 5.3 `access.resolver`
- **Responsibility:** effective level per page for one `User` (unexpired override else role standing level), and the derived action set / wire grant map. The only place the precedence rule lives. No caching.
- **Files:** `app/libs/access/resolver.py`.
- **Public surface:** `levels_for`, `grants_for`, `actions_for`.
- **Owns features:** BE-4.

### 5.4 `access.service` + `access.schemas` + `access.router`
- **Responsibility:** the admin-facing access surface — read the matrix, publish it atomically under a concurrency token, grant/revoke overrides, read the audit trail; compose audit detail strings. Owns the transaction boundary.
- **Files:** `app/libs/access/service.py`, `app/libs/access/schemas.py`, `app/libs/access/router.py`.
- **Public surface:** `AccessService`, the six DTOs, `router`.
- **Owns features:** BE-8, BE-9, BE-10, BE-11.

### 5.5 `auth` (modified)
- **Responsibility:** unchanged — token → user, portal assertion, action guard, login binding. What changes is *where the action set comes from* and *what login records*.
- **Files:** `app/libs/auth/actions.py`, `deps.py`, `service.py`, `router.py`; `app/schemas/users.py`.
- **Public surface:** `Action` (5 members renamed), `require_action`, `get_current_admin_user`, `login_and_bind`, `UserOut`.
- **Owns features:** BE-1, BE-5, BE-6, BE-7, BE-22 (a small cross-cutting fix spanning `auth.actions` and `access.pages` — no module of its own).

### 5.6 `identity` (modified + extended)
- **Responsibility:** the only module that mutates Firebase Auth identities, now also the only module that queues email.
- **Files:** `app/libs/identity/service.py`, `app/libs/identity/mailer.py` (new).
- **Public surface:** `FirebaseIdentityService.{create_user, get_user_by_email, delete_user, ensure_identity, generate_set_password_link}`, `send_set_password_email`.
- **Owns features:** BE-12, BE-13, BE-14.

### 5.7 `staff` (extended)
- **Responsibility:** the staff directory and lifecycle — enroll, list, edit, re-send link, RM book handover.
- **Files:** `app/schemas/staff.py`, `app/libs/staff/{repository,service,router}.py`.
- **Public surface:** the four staff routes, `StaffService.{enroll, update, send_set_password_link, list_directory}`.
- **Owns features:** BE-15, BE-16, BE-17, BE-18, BE-19.

### 5.8 `onboarding` (extended)
- **Responsibility:** unchanged pipeline; gains exactly one post-commit email on initial approval.
- **Files:** `app/libs/onboarding/service.py`, `app/libs/onboarding/router.py`.
- **Owns features:** BE-20.

### 5.9 `core` + `main` (contraction)
- **Responsibility:** delete the self-signup capability and its flag; mount the new router; keep the production fail-closed check honest.
- **Files:** `app/main.py`, `app/core/config.py`, `app/libs/dev/**`, `app/schemas/dev.py`.
- **Owns features:** BE-21.

---

## 6. Features (level 3 of 3 — the work units)

### BE-1 — `Action.*_MANAGE` → `*_WRITE` (Yes — user req.)

- **Proposal ref:** § Layer 2 C-10, D-1
- **Module:** 5.5
- **Files:** modify `app/libs/auth/actions.py`; modify `app/libs/clients/router.py`, `app/libs/allocation_matrix/router.py`, `app/libs/staff/router.py`, `app/libs/onboarding/router.py`, `app/libs/trade_models/router.py`, `app/libs/trade_models/test_router_symbols.py`.
- **Dependencies:** none — first unit, so every later unit is written in the new vocabulary.

**Verified call-site census** (`rg "_MANAGE|_manage" api-backend/`, counted against the tree before writing this doc). The proposal's C-10 now quotes these same numbers and marks its earlier "30 call sites + 2 test references" estimate as superseded, so this table and the proposal agree:

| File | Matching lines | What they are |
|---|---|---|
| `app/libs/auth/actions.py` | 9 | 5 enum members (+ their string values), 1 comment (line 31), 3 `ROLE_ACTIONS` lines (line 35 holds two references) |
| `app/libs/onboarding/router.py` | 10 | `require_action(Action.ONBOARDING_MANAGE)` guards |
| `app/libs/trade_models/router.py` | 6 | `require_action(Action.MODEL_MANAGE)` guards |
| `app/libs/allocation_matrix/router.py` | 2 | `require_action(Action.ALLOCATION_MANAGE)` guards |
| `app/libs/staff/router.py` | 2 | `require_action(Action.USER_MANAGE)` guards |
| `app/libs/clients/router.py` | 1 | `require_action(Action.CLIENT_MANAGE)` guard |
| `app/libs/trade_models/test_router_symbols.py` | 2 | two comments naming `MODEL_MANAGE` |
| **Total** | **32 lines across 7 files** | of which **21 are real `require_action(...)` guard sites** in 5 files, 9 are inside `actions.py` (3 of those disappear with `ROLE_ACTIONS` in BE-5), and 2 are test comments |

**Contract:**
```python
# app/libs/auth/actions.py — the 5 renamed members (names AND string values)
class Action(str, enum.Enum):
    USER_VIEW = "admin:user_view"
    USER_WRITE = "admin:user_write"                     # was USER_MANAGE / "admin:user_manage"
    CLIENT_VIEW = "clients:view"
    CLIENT_WRITE = "clients:write"                      # was CLIENT_MANAGE / "clients:manage"
    MODEL_VIEW = "pc:model_view"
    MODEL_WRITE = "pc:model_write"                      # was MODEL_MANAGE / "pc:model_manage"
    ALLOCATION_VIEW = "pc:allocation_view"
    ALLOCATION_WRITE = "pc:allocation_write"            # was ALLOCATION_MANAGE
    POST_TRADE_ALLOCATION_VIEW = "mobo:pta_view"        # unchanged
    POST_TRADE_ALLOCATION_RUN = "mobo:pta_run"          # unchanged
    RECON_VIEW = "mobo:recon_view"                      # unchanged
    EOD_SIGNOFF = "mobo:eod_signoff"                    # unchanged
    ONBOARDING_WRITE = "onboarding:write"               # was ONBOARDING_MANAGE
    ONBOARDING_REVIEW = "onboarding:review"             # unchanged
    ALLOTMENT_ACKNOWLEDGE = "allotment:acknowledge"     # unchanged
```

**Behavior / invariants:** purely mechanical. `Action` values are not persisted in any table and cross no wire contract — they appear only as `require_action` arguments and inside 403 `detail` strings — so there is no migration and no frontend change (proposal § Layer 3 B). Non-`MANAGE` members keep their names deliberately: they denote specific operations (`_RUN`, `EOD_SIGNOFF`, `ONBOARDING_REVIEW`, `ALLOTMENT_ACKNOWLEDGE`, `RECON_VIEW`), and flattening them into `_WRITE` would lose that. `ROLE_ACTIONS` is updated in place here (still valid, still the authority until BE-5) — it is deleted, not edited, by BE-5.

**Done when:** `rg -i "_MANAGE|:.*_manage" api-backend/app` returns nothing; `pytest -q` green; `mypy app` clean.

---

### BE-2 — `app/libs/access/pages.py`: the page registry and the level→action map (MANDATORY)

- **Proposal ref:** § Layer 2 A, § Layer 2 B, D-1, D-8
- **Module:** 5.1
- **Files:** create `app/libs/access/__init__.py`, `app/libs/access/pages.py`.
- **Dependencies:** BE-1 (the map is written in `*_WRITE` vocabulary).

**Contract (the full 16-entry map — the proposal shows a partial example; this is the complete one, cross-read from `admin-frontend/lib/pages-config.ts`'s `PAGES` keys against the `Action` enum):**
```python
# app/libs/access/pages.py
from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from app.libs.auth.actions import Action
from app.models.users import AdminRole


def fs(*actions: Action) -> frozenset[Action]:
    return frozenset(actions)


@dataclass(frozen=True)
class PageMeta:
    """Display metadata served to the FE in MatrixOut.pages. Hand-maintained
    mirror of admin-frontend/lib/pages-config.ts PAGES (D-8) — kept honest by a
    test, not by a foreign key or a code generator."""

    page_id: str
    group: str
    label: str
    path: str


# Insertion order IS the wire order of MatrixOut.pages — the FE does not re-sort
# or re-label (§ 7.2). Groups mirror pages-config.ts `subgroup`; the two pages
# with `hideFromNav: true` and no subgroup are grouped "Other", matching the FE's
# `p.subgroup ?? "Other"` fallback (proposal § Layer 3 A-1).
PAGE_META: Final[dict[str, PageMeta]] = {
    "rm.client-info":             PageMeta("rm.client-info", "Client Management", "Client Information", "/rm/client-info"),
    "rm.onboarding-renewal":      PageMeta("rm.onboarding-renewal", "Client Management", "Onboarding & Renewal", "/rm/onboarding-renewal"),
    "rm.model-subscription":      PageMeta("rm.model-subscription", "Client Management", "Model Subscription", "/rm/model-subscription"),
    "rm.request-tickets":         PageMeta("rm.request-tickets", "Client Management", "Request Tickets", "/rm/requests"),
    "compliance.review":          PageMeta("compliance.review", "Compliance", "Compliance Review", "/compliance/review"),
    "pc.allotment-redemption":    PageMeta("pc.allotment-redemption", "Client Management", "Allotment & Redemption", "/pc/allotment-redemption"),
    "pc.allocation-matrix":       PageMeta("pc.allocation-matrix", "Trade Management", "Allocation Matrix", "/pc/allocation-matrix"),
    "mobo.post-trade-allocation": PageMeta("mobo.post-trade-allocation", "Trade Management", "Post-Trade Allocation", "/mobo/post-trade-allocation"),
    "mobo.trade-reconciliation":  PageMeta("mobo.trade-reconciliation", "Trade Management", "Trade Reconciliation", "/mobo/trade-reconciliation"),
    "mobo.commission-tracking":   PageMeta("mobo.commission-tracking", "Trade Management", "Commission Tracking", "/mobo/commission-tracking"),
    "shared.monthly-reports":     PageMeta("shared.monthly-reports", "Trade Management", "Monthly Reports (Models)", "/monthly-reports"),
    "pc.model-management":        PageMeta("pc.model-management", "System", "Model Management", "/pc/model-management"),
    "admin.enroll-user":          PageMeta("admin.enroll-user", "System", "Enroll User", "/admin/enroll-user"),
    "admin.system-config":        PageMeta("admin.system-config", "System", "System Config", "/admin/system-config"),
    "mobo.recon-overview":        PageMeta("mobo.recon-overview", "Other", "Reconciliation Overview", "/mobo/recon-overview"),
    "compliance.overview":        PageMeta("compliance.overview", "Other", "Compliance Overview", "/compliance/overview"),
}

PAGE_IDS: Final[frozenset[str]] = frozenset(PAGE_META)   # 16 members


# (granted at VIEW, ADDED at EDIT). EDIT is a superset: a user at EDIT holds
# VIEW's bucket ∪ EDIT's bucket. An EMPTY EDIT bucket is a deliberate record that
# the page's backend surface has no read/write split — NOT a placeholder to fill
# in. Every action below was verified against the actual `require_action(...)`
# guard on the route(s) that page calls.
PAGE_ACTIONS: Final[dict[str, tuple[frozenset[Action], frozenset[Action]]]] = {
    # ---- RM ----
    # CLIENT_VIEW is safe in a VIEW bucket ONLY after BE-22 moves the ticket-status
    # write (POST /rm/tickets/{ref}/status) onto CLIENT_WRITE — before that fix
    # CLIENT_VIEW guarded that mutation too, and D-11's seed grants `view` here to
    # roles that never held it. See BE-22.
    "rm.client-info":             (fs(Action.CLIENT_VIEW),                    fs(Action.CLIENT_WRITE)),
    # /rm/onboardings* — every route, read AND write, is guarded by ONBOARDING_WRITE
    # today, so a VIEW grant unlocks nothing. Pinned by the proposal's own example.
    "rm.onboarding-renewal":      (fs(),                                      fs(Action.ONBOARDING_WRITE)),
    # /rm/subscriptions*, /rm/allotment, /rm/redemption, /rm/…/transaction-detail
    # are ALL guarded by CLIENT_VIEW — reads and writes alike. No write sibling exists.
    "rm.model-subscription":      (fs(Action.CLIENT_VIEW),                    fs()),
    # /rm/tickets, /rm/tickets/{ref}, POST /rm/tickets/{ref}/status — all CLIENT_VIEW.
    "rm.request-tickets":         (fs(Action.CLIENT_VIEW),                    fs()),
    # ---- MOBO ----
    "mobo.recon-overview":        (fs(Action.RECON_VIEW),                     fs()),
    "mobo.trade-reconciliation":  (fs(Action.RECON_VIEW),                     fs()),
    "mobo.commission-tracking":   (fs(Action.RECON_VIEW),                     fs()),
    "mobo.post-trade-allocation": (fs(Action.POST_TRADE_ALLOCATION_VIEW),     fs(Action.POST_TRADE_ALLOCATION_RUN)),
    # ---- PC ----
    "pc.model-management":        (fs(Action.MODEL_VIEW),                     fs(Action.MODEL_WRITE)),
    "pc.allocation-matrix":       (fs(Action.ALLOCATION_VIEW),                fs(Action.ALLOCATION_WRITE)),
    # The page's only action IS acknowledging, and PC holds it unconditionally today;
    # placing it at EDIT would silently downgrade a VIEW-granted PC (proposal § B).
    # AMENDED BY BE-22 (C-12/D-16) to (fs(ALLOTMENT_VIEW), fs(ALLOTMENT_ACKNOWLEDGE)) --
    # D-11's seed grants `view` here to RM/MOBO/COMPLIANCE too, and ALLOTMENT_ACKNOWLEDGE
    # guards the mutating routes as well as the read, so a VIEW bucket built from it was
    # a real read/write conflation once those roles could reach it. Left in its original
    # pinned form here; see BE-22 for the fix.
    "pc.allotment-redemption":    (fs(Action.ALLOTMENT_ACKNOWLEDGE),          fs()),
    # ---- COMPLIANCE ----
    # Every /compliance/* route (board read, download, verdict, approve, reject) is
    # guarded by ONBOARDING_REVIEW, so the review page's EDIT bucket carries it and
    # the overview — a read-only dashboard over the same board — carries no action of
    # its own. Empty/empty also means a `view` cell on compliance.review (which the
    # seed gives PC) grants NOTHING -- no role gains verdict/approve rights from a
    # read grant. COMPLIANCE's board reads arrive via its own `edit` on that page.
    "compliance.review":          (fs(),                                      fs(Action.ONBOARDING_REVIEW)),
    "compliance.overview":        (fs(),                                      fs()),
    # ---- SHARED ----
    # Deliberately empty: this page has no endpoint of its own, so there is no action
    # to map. Mapping it to MODEL_VIEW would grant a read nobody asked for. Consequence
    # to know: D-13's narrowing (RM/MOBO edit -> view, PC keeps edit) therefore has NO
    # backend effect -- it is enforced by the frontend gate alone.
    "shared.monthly-reports":     (fs(),                                      fs()),
    # ---- ADMIN ----
    "admin.enroll-user":          (fs(Action.USER_VIEW),                      fs(Action.USER_WRITE)),
    "admin.system-config":        (fs(Action.USER_VIEW),                      fs(Action.USER_WRITE)),
}


# Action.EOD_SIGNOFF is the one declared action with NO page in the registry — the
# EoD exception-report route was never added to PAGES. It is granted by role, not by
# page, so the resolver cannot silently drop it (proposal § Layer 2 B). ADMIN is
# listed because today's ROLE_ACTIONS[ADMIN] == set(Action); MOBO because it is the
# role that signs off. This constant is the ONLY role→action hardcoding that
# survives C-2, and it exists because a pageless action cannot be expressed by the
# page matrix at all.
PAGELESS_ACTIONS: Final[dict[AdminRole, frozenset[Action]]] = {
    AdminRole.MOBO: fs(Action.EOD_SIGNOFF),
    AdminRole.ADMIN: fs(Action.EOD_SIGNOFF),
}
```

**Behavior / invariants:**
- `PAGE_IDS` must equal `PAGES`' keys in `admin-frontend/lib/pages-config.ts` — asserted by a test (§ 8, D-8), never by an import across the language boundary.
- `PAGE_ACTIONS` keys must equal `PAGE_IDS` exactly (no page without a bucket pair, no bucket pair without a page).
- **Day one is a stated policy, not parity (D-11).** The seed is **not** derived from `ROLE_PAGES` and is **not** all-`edit`: it is the System Config catalog's own per-page-per-role level matrix re-keyed onto real `PageId`s — **55 rows, 30 `edit` + 25 `view`** (RM 7, MOBO 10, PM 0, PC 10, COMPLIANCE 12, ADMIN 16). So `VIEW` is a **normal, common** level from the first request, not an exotic one. The checkable standard is the proposal's (§ Objectives, DB B-1's change table), not "nothing changed": every difference appears on B-1's change table, **no role loses a page** it owns today, **PM gains nothing** (D-12), and **no role gains a write it did not already have**.
- **Resolved day-one action set per role** (seed × the map above, plus `PAGELESS_ACTIONS`) — this is what BE-4/BE-5 will actually enforce, and it is the table a reviewer checks against B-1's change list. Stated **post-BE-22** (`ALLOTMENT_VIEW` split out, `CLIENT_WRITE` guarding ticket-status) — that is the shape that actually ships, since BE-22 lands in the same layer as this map:

  | Role | Resolves to | vs. today's `ROLE_ACTIONS` |
  |---|---|---|
  | RM | `CLIENT_VIEW`, `CLIENT_WRITE`, `ONBOARDING_WRITE`, `MODEL_VIEW`, `ALLOTMENT_VIEW` | keeps all 3; **+`MODEL_VIEW`** (read, from `pc.model-management: view`); **+`ALLOTMENT_VIEW`** (read-only, from `pc.allotment-redemption: view` — safe post-BE-22) |
  | MOBO | `RECON_VIEW`, `PTA_VIEW`, `PTA_RUN`, `EOD_SIGNOFF`, `CLIENT_VIEW`, `MODEL_VIEW`, `ALLOCATION_VIEW`, `ALLOTMENT_VIEW` | keeps all 4 (`EOD_SIGNOFF` via `PAGELESS_ACTIONS`); **+`CLIENT_VIEW`** and **+`ALLOTMENT_VIEW`**, both read-only post-BE-22; `MODEL_VIEW`/`ALLOCATION_VIEW` are pure reads |
  | PC | `MODEL_VIEW`, `MODEL_WRITE`, `ALLOCATION_VIEW`, `ALLOCATION_WRITE`, `ALLOTMENT_ACKNOWLEDGE`, `PTA_VIEW`, `RECON_VIEW`, `CLIENT_VIEW` | keeps all 5 (PC's own page is still `edit`, so it keeps the mutating `ALLOTMENT_ACKNOWLEDGE`); **+`PTA_VIEW`** (D-10, the intended fix — `PTA_RUN` correctly absent); `RECON_VIEW` read; **+`CLIENT_VIEW`**, read-only post-BE-22 |
  | COMPLIANCE | `ONBOARDING_REVIEW`, `CLIENT_VIEW`, `RECON_VIEW`, `PTA_VIEW`, `MODEL_VIEW`, `ALLOCATION_VIEW`, `ALLOTMENT_VIEW` | keeps `ONBOARDING_REVIEW`; the rest are the catalog's new cross-domain reads, all read-only post-BE-22 |
  | PM | `∅` | unchanged — zero rows seeded (D-12) |
  | ADMIN | every member of `Action` | unchanged (16 `edit` rows + `PAGELESS_ACTIONS[ADMIN]`) |

  **"No role gains a write it did not already have" is true of this table because BE-22 lands with it, not before it** — see BE-22. Without BE-22, the resolved sets above would read `ALLOTMENT_ACKNOWLEDGE` (not `ALLOTMENT_VIEW`) for RM/MOBO/COMPLIANCE, and the old `CLIENT_VIEW` would still guard all **four** writes it conflated with a read — `POST /rm/tickets/{ref}/status`, `POST /rm/allotment`, `POST /rm/redemption`, `POST /rm/.../transaction-detail` — two of which (016/017) were a deliberate, on-the-record call that was correct only while `CLIENT_VIEW` never reached a role without the matching write, a precondition this seed removes. All six are real mutations those roles do not hold today, and this unit's original finding (C-12) is what fixed all six at the source rather than papering over any of them in this map.

  Two further properties worth naming because they are load-bearing and easy to break: a `view` cell on `compliance.review` (PC, per the seed) grants **nothing** — `ONBOARDING_REVIEW` sits in that page's EDIT bucket, so no role gains verdict/approve rights from a read grant. And `shared.monthly-reports` has empty buckets both sides, so **D-13's narrowing (RM/MOBO `edit`→`view`) has no backend effect at all** — that page has no endpoint of its own, and its level is enforced by the frontend gate only.
- **The intended day-one delta (D-10): PC × `mobo.post-trade-allocation` is seeded `view`.** `ROLE_PAGES.PC` grants that page as `OPERATE` (`pages-config.ts:215`) while `ROLE_ACTIONS[PC]` holds no PTA action (`actions.py:43-49`) — so today PC sees the page in its sidebar and every PTA endpoint 403s, *including the read*. The user ruled PC access is a requirement but **read-only**: the seed writes that one cell as `view`, so PC gains `POST_TRADE_ALLOCATION_VIEW` and **not** `POST_TRADE_ALLOCATION_RUN`. **Running allocations stays MOBO's.** This is a correction in *both* directions, not a widening — the frontend's `OPERATE` was too broad and the backend's empty set too narrow; PC gains a working read and loses a write it could never actually perform.
  - **The `PAGE_ACTIONS` entry above is unchanged by this ruling** and must stay that way: the map says what each *level* grants on that page (`VIEW` → `_VIEW`, `EDIT` adds `_RUN`), which is correct independently of who is granted which level. The ruling lives in the seed's level for one `(page, role)` cell, in the DB layer — there is no PC-specific branch, flag or exception anywhere in this layer's code.
  - It is also the system's **first live instance of the `VIEW` level** (declared in proposal 009, never instantiated), which is why § 8 points the level-enforcement integration test at this exact pair rather than only at a synthetic grant.

**Done when:** `PAGE_IDS` has 16 members and equals the frontend's `PAGES` keys; `set(PAGE_ACTIONS) == PAGE_IDS`; the union of every bucket plus `PAGELESS_ACTIONS`' values covers every `Action` member (no action is unreachable); `mypy app` clean.

---

### BE-3 — `access.repository`: the four tables (MANDATORY)

- **Proposal ref:** § Layer 2 A, C-5, DB B-1/B-2/B-3
- **Module:** 5.2
- **Files:** create `app/libs/access/repository.py`.
- **Dependencies:** BE-2. DB migration `0028_admin_access_control` (precondition) and the ORM models it ships (`app/models/access.py`, DB layer).

**Contract:**
```python
# app/libs/access/repository.py
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.access import (
    AccessLevelEnum,       # ('none','view','edit') on overrides; ('view','edit') on page_access
    AdminAuditEvent,
    PageAccess,
    PageAccessOverride,
    PageAccessPublication,
)
from app.models.users import AdminProfile, AdminRole, User

WireLevel = Literal["NONE", "VIEW", "EDIT"]


def to_wire(level: AccessLevelEnum) -> WireLevel:
    """DB lowercase → wire UPPERCASE. The ONLY case fold in the backend (§ 3.1)."""
    return level.value.upper()  # type: ignore[return-value]


def from_wire(level: WireLevel) -> AccessLevelEnum:
    return AccessLevelEnum(level.lower())


class AccessRepository:
    """One query shape per method. NEVER commits — AccessService owns the txn (§ 3.1)."""

    def __init__(self, db: Session) -> None:
        self.db = db

    # --- resolver reads (2 queries per guarded request, both indexed) ---
    def levels_for_role(self, role: AdminRole) -> dict[str, AccessLevelEnum]:
        """page_id → level for one role. Uses INDEX (role)."""

    def overrides_for_user(
        self, user_id: uuid.UUID, *, now: datetime | None = None
    ) -> dict[str, AccessLevelEnum]:
        """page_id → level for one user, EXPIRED ROWS EXCLUDED
        (expires_at IS NULL OR expires_at > now). `now` defaults to utcnow()."""

    # --- matrix ---
    def all_levels(self) -> list[PageAccess]: ...
    def user_counts_by_role(self) -> dict[AdminRole, int]:
        """One GROUP BY over admin_profiles ⨝ users — MatrixOut.roles[].user_count."""
    def upsert_level(self, *, page_id: str, role: AdminRole, level: AccessLevelEnum) -> None: ...
    def delete_level(self, *, page_id: str, role: AdminRole) -> None:
        """NONE is the absence of a row (D-3) — this is how NONE is 'stored'."""
    def latest_publication(self) -> PageAccessPublication | None:
        """ORDER BY published_at DESC LIMIT 1 — also the concurrency token (C-5)."""
    def insert_publication(
        self, *, actor_uid: str | None, actor_name: str | None, change_count: int, note: str | None
    ) -> PageAccessPublication: ...

    # --- overrides ---
    def list_overrides(self) -> list[tuple[PageAccessOverride, User, AdminProfile | None]]:
        """Joined once — user_name/user_role come from the join, never a snapshot (§ Layer 3 C)."""
    def get_override(self, override_id: uuid.UUID) -> PageAccessOverride | None: ...
    def find_override(self, *, user_id: uuid.UUID, page_id: str) -> PageAccessOverride | None:
        """UNIQUE (user_id, page_id) pre-check — the 409 path."""
    def insert_override(
        self, *, user_id: uuid.UUID, page_id: str, level: AccessLevelEnum,
        reason: str, granted_by: str | None, expires_at: datetime | None,
    ) -> PageAccessOverride: ...
    def delete_override(self, override: PageAccessOverride) -> None: ...
    def count_overrides_by_user(self) -> dict[uuid.UUID, int]:
        """GROUP BY user_id — feeds StaffOut.override_count without an N+1 (BE-16)."""

    # --- audit ---
    def insert_audit(
        self, *, actor_uid: str | None, actor_name: str | None, event: str, detail: str
    ) -> AdminAuditEvent: ...
    def list_audit(self, *, limit: int, before: datetime | None) -> list[AdminAuditEvent]:
        """ORDER BY at DESC, keyset-paged on `at < before`. Uses INDEX (at)."""
```

**Behavior / invariants:** no method commits or rolls back. `to_wire`/`from_wire` are the only case fold in the layer. `overrides_for_user` never returns an expired row — expiry is applied in SQL, not in Python, so a long-running request cannot observe a row that expired mid-flight inconsistently. `levels_for_role` silently includes rows whose `page_id` is not in `PAGE_IDS` (the DB has no FK, D-8); dropping unknown ids is the **resolver's** job (BE-4), so the repository stays a dumb reader and the "unknown page_id" rule lives in exactly one place. `actor_name` is written denormalised on insert (it must survive the actor's deletion) — the repository takes it as a parameter and never resolves it itself.

**Done when:** every method above exists with these signatures; `rg "commit\(|rollback\(" app/libs/access/repository.py` returns nothing; a seeded scratch DB round-trips an upsert → read → delete for one `(page_id, role)` cell.

---

### BE-4 — `access.resolver`: effective level, grants, action set (MANDATORY)

- **Proposal ref:** § Layer 2 A, B, C-2, D-2, D-3
- **Module:** 5.3
- **Files:** create `app/libs/access/resolver.py`.
- **Dependencies:** BE-2, BE-3.

**Contract:**
```python
# app/libs/access/resolver.py
from __future__ import annotations

from typing import Literal

from sqlalchemy.orm import Session

from app.libs.access.pages import PAGE_ACTIONS, PAGE_IDS, PAGELESS_ACTIONS
from app.libs.access.repository import AccessRepository, to_wire
from app.libs.auth.actions import Action
from app.models.users import AdminRole, Portal, User

GrantLevel = Literal["VIEW", "EDIT"]


def levels_for(user: User, db: Session) -> dict[str, GrantLevel]:
    """Effective level per page_id for ONE user.

    Precedence (the ONLY place this rule lives):
        unexpired override for (user, page)   ->  that level, EVEN IF it is NONE
        else                                  ->  the standing level of the user's role
        else                                  ->  NONE
    The enum asymmetry is load-bearing (§ 7's field map, D-3): page_access.level is
    ('view','edit') — NONE there IS row-absence — while page_access_overrides.level
    is ('none','view','edit'). So an UNEXPIRED override whose level is `none` must
    resolve to NONE and DENY; it must NOT fall through to the role's standing level.
    Falling through would make a deliberate per-user revocation a no-op, which is the
    exact bug the three-value enum exists to prevent.
    A resolved NONE — whether from a NONE override or from an absent page_access
    row — is OMITTED from the returned mapping (absent key === NONE, § 7.1).
    page_ids not in PAGE_IDS are dropped: the DB has no FK to a pages table (D-8),
    so a stale row from a deleted page must not resolve to anything.

    NO CACHING, deliberately (proposal § Layer 2 B): 2 indexed reads per call so a
    published change bites on the caller's very next request, which is what the
    publish flow promises. A cache would need cross-worker invalidation to keep
    that promise; being wrong is more expensive than the two reads.

    Clients (Portal.CLIENT) resolve to {} without touching the DB — they have no
    page matrix at all (§ 3 Non-Goals).
    """


def grants_for(user: User, db: Session) -> dict[str, GrantLevel]:
    """UserOut.grants (§ 7.1): identical to levels_for; named separately because it
    is the wire surface and levels_for is the internal one."""


def actions_for(user: User, db: Session) -> set[Action]:
    """The union over the user's effective levels:
        VIEW  -> PAGE_ACTIONS[page][0]
        EDIT  -> PAGE_ACTIONS[page][0] | PAGE_ACTIONS[page][1]
    plus PAGELESS_ACTIONS.get(role, frozenset()).

    Replaces get_actions_for_role (deleted in BE-5). Returns an EMPTY set for a
    user with no admin_profile, for a client, and — by design — for any admin when
    page_access is empty because the migration has not been applied: fail closed
    (C-2 / D-9), never fall back.
    """
```

**Behavior / invariants:**
- A `NONE` override **wins** over an `EDIT` role level (it is an active revocation, D-3); an *expired* override does not win over anything and is invisible.
- `EDIT` is strictly additive over `VIEW` — there is no page where `EDIT` grants less than `VIEW`.
- `actions_for` performs exactly 2 queries (role levels, user overrides) beyond the profile read `require_action` already does; `grants_for` the same 2. No memoisation, no `lru_cache`, no request-scoped cache.
- Determinism: the same DB state and the same `user` always yield the same set, independent of call order.

**Done when:** the three functions exist with these signatures; unit tests cover every precedence branch (§ 8.3 BE-4); `rg "lru_cache|cachetools|_CACHE" app/libs/access/` returns nothing.

---

### BE-5 — `require_action` resolves from the DB; `ROLE_ACTIONS` deleted (MANDATORY / Yes — user req.)

- **Proposal ref:** § Layer 2 B, C-2, D-1, D-9, § Dead code purged row 1
- **Module:** 5.5
- **Files:** modify `app/libs/auth/deps.py`, `app/libs/auth/actions.py`.
- **Dependencies:** BE-2, BE-3, BE-4. **Requires the migration** — this is the unit that makes the precondition hard.

**Contract:**
```python
# app/libs/auth/deps.py — the rewritten guard. get_current_admin_user,
# get_current_client_user, get_current_user and _resolve_user are UNCHANGED.
from app.libs.access.resolver import actions_for   # access.resolver, never access.router


def require_action(action: Action):  # type: ignore[return]
    def _dep(
        user: Annotated[User, Depends(get_current_admin_user)],
        db: Annotated[Session, Depends(get_db)],
    ) -> User:
        # The admin-profile existence check is KEPT: the resolver needs the role,
        # and "no profile" must stay a distinct 403 rather than becoming an empty
        # action set with a misleading message.
        profile = AdminProfileRepository(db).get_by_user_id(user.id)
        if profile is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No admin profile")
        if action not in actions_for(user, db):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail=f"Action '{action}' not permitted for your role.",
            )
        return user

    return _dep
```
```python
# app/libs/auth/actions.py — DELETED IN FULL (nothing replaces them in this file):
#   ROLE_ACTIONS: dict[AdminRole, set[Action]] = {...}        (lines 29-52 incl. its comment)
#   def get_actions_for_role(role: AdminRole) -> set[Action]  (lines 55-57)
# The module keeps ONLY `class Action` and its `from app.models.users import AdminRole`
# import goes with the dict.
```

**Behavior / invariants:**
- The 403 `detail` string is byte-identical to today's, so no consumer of the message changes (§ Layer 3 B: the FE displays it verbatim).
- **No fallback of any kind.** An empty `page_access` table yields an empty action set and therefore 403 on every guarded route. That is the specified failure mode for a missing migration (C-2): immediate, loud, unmistakable within one page load — not a silent grant of today's full `EDIT` access.
- Query budget per guarded request: 3 (profile + role levels + overrides), up from 1. All three are indexed on values already in hand.
- Every existing `require_action(...)` call site is untouched by this unit — only the closure's body changes.

**Done when:** `rg "ROLE_ACTIONS|get_actions_for_role" api-backend/` returns nothing; with a seeded `VIEW` grant on `pc.model-management`, `GET /api/pc/models` → 200 and `PATCH /api/pc/models/{id}` → 403; with `page_access` truncated, both → 403.

---

### BE-6 — `UserOut.grants` on `/auth/me` and both logins (MANDATORY)

- **Proposal ref:** § 4.1 part 1, § Layer 2 E last row, D-2
- **Module:** 5.5
- **Files:** modify `app/schemas/users.py`, `app/libs/auth/router.py`.
- **Dependencies:** BE-4.

**Contract:**
```python
# app/schemas/users.py
class UserOut(BaseModel):
    firebase_uid: str
    email: str | None
    role: str
    name: str | None
    # NEW (§ 7.1). Absent key === NONE. Always {} for a Portal.CLIENT user — clients
    # have no page matrix (§ 3 Non-Goals). Resolved per request from the DB, NOT
    # carried in Firebase custom claims (D-2: 1000-byte cap + up-to-1h staleness).
    grants: dict[str, Literal["VIEW", "EDIT"]] = {}

    model_config = {"from_attributes": True}
```
```python
# app/libs/auth/router.py — the three routes keep their paths, methods and
# response_model; each now builds the DTO explicitly instead of returning the ORM row.
@router.get("/me", response_model=UserOut)
def auth_me(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> UserOut:
    return _user_out(user, db)


def _user_out(user: User, db: Session) -> UserOut:
    """One composer for all three routes — grants resolved once, here."""
    return UserOut(
        firebase_uid=user.firebase_uid,
        email=user.email,
        role=user.role,
        name=user.name,
        grants=grants_for(user, db),
    )
```

**Behavior / invariants:** `grants` is present on **every** `UserOut` — `{}` rather than omitted or `null`, for a client, for PM, and for an admin whose every cell is `NONE`. The three route paths, methods and status codes are unchanged. `app/libs/users/router.py`'s `GET /users/me` and `GET /users/{firebase_uid}` also serialise `UserOut`; they inherit the default `{}` unless they are given a `db` and the composer — **they are left on the default** (the FE reads grants from `/auth/me` and login only, § 7.1), and that is recorded rather than silently inconsistent.

**Done when:** a login response and `GET /auth/me` for a seeded RM both carry the RM's five granted pages with `"EDIT"`; a client login carries `"grants": {}`.

---

### BE-7 — `login_and_bind` writes `users.last_sign_in_at` (Yes — user req.)

- **Proposal ref:** § Layer 2 C-7, DB B-4, D-4
- **Module:** 5.5
- **Files:** modify `app/libs/auth/service.py`.
- **Dependencies:** none (column is a precondition). Parallel-safe with BE-6.

**Contract:**
```python
# app/libs/auth/service.py — inside login_and_bind, AFTER assert_can_authenticate
# passes and in the same transaction as the existing email-sync write:
    assert_can_authenticate(existing, db)   # DB-layer seam, § 7 — 403 if not active
    existing.last_sign_in_at = datetime.utcnow()   # C-7 / DB B-4
    db.commit()
    return existing
```

**Behavior / invariants:** written on **successful** login only — after the status gate, so a rejected login never records a sign-in. This is the sole writer of the column, and it is what makes the derived `INITIATED` status (`status='active' AND last_sign_in_at IS NULL`) self-correct on first login. No password-expiry gate is added here (C-3 removed the need; there is no server-issued password to expire) and `assert_can_authenticate` is not modified.

**Done when:** a successful `POST /api/auth/admin/login` advances `users.last_sign_in_at`; a login rejected by `assert_can_authenticate` leaves it `NULL`; the same holds for `/api/auth/client/login`.

---

### BE-8 — Access schemas + `GET /api/admin/access/matrix` (Yes)

- **Proposal ref:** § 4.1 part 3, § Layer 2 A, D
- **Module:** 5.4
- **Files:** create `app/libs/access/schemas.py`, `app/libs/access/service.py`, `app/libs/access/router.py`; modify `app/main.py` (mount).
- **Dependencies:** BE-2, BE-3, BE-5.

**Contract:**
```python
# app/libs/access/schemas.py
class AccessLevel(str, Enum):
    NONE = "NONE"
    VIEW = "VIEW"
    EDIT = "EDIT"


class MatrixPageOut(BaseModel):
    page_id: str
    group: str
    label: str
    path: str


class MatrixRoleOut(BaseModel):
    code: AdminRole
    name: str
    user_count: int


class MatrixCellOut(BaseModel):
    page_id: str
    role: AdminRole
    level: Literal["VIEW", "EDIT"]      # NONE cells are omitted, never sent


class PublishedMetaOut(BaseModel):
    at: datetime
    by: str


class MatrixOut(BaseModel):
    pages: list[MatrixPageOut]          # server-authored order == PAGE_META order
    roles: list[MatrixRoleOut]
    levels: list[MatrixCellOut]
    published: PublishedMetaOut | None


class MatrixChangeIn(BaseModel):
    page_id: str
    role: AdminRole
    level: AccessLevel                  # NONE deletes the row

    @field_validator("page_id")
    @classmethod
    def _known_page(cls, v: str) -> str:
        if v not in PAGE_IDS:
            raise ValueError(f"unknown page_id: {v}")
        return v


class MatrixPublishIn(BaseModel):
    changes: list[MatrixChangeIn]
    note: str | None = None
    base_published_at: datetime | None   # None === "no publication exists yet"
```
```python
# app/libs/access/router.py
router = APIRouter(prefix="/admin", tags=["access"])


def _get_service(db: Annotated[Session, Depends(get_db)]) -> AccessService:
    return AccessService(db)


@router.get("/access/matrix", response_model=MatrixOut)
def get_matrix(
    service: Annotated[AccessService, Depends(_get_service)],
    _: Annotated[User, Depends(require_action(Action.USER_VIEW))],
) -> MatrixOut:
    return service.read_matrix()
```
```python
# app/libs/access/service.py
class AccessService:
    def __init__(self, db: Session) -> None:
        self.repo = AccessRepository(db)

    def read_matrix(self) -> MatrixOut:
        """pages from PAGE_META (order preserved); roles from AdminRole ×
        user_counts_by_role(); levels from all_levels() with unknown page_ids
        dropped and every level upper-cased; published from latest_publication()."""
```
```python
# app/main.py
from app.libs.access.router import router as access_router
app.include_router(access_router, prefix="/api")   # /api/admin/access/…, /api/admin/audit
```

**Behavior / invariants:** `pages` is emitted in `PAGE_META` insertion order and is display-ready — the FE does not re-sort or re-label (§ 7.2). `roles` lists all six `AdminRole` values including `PM` with `user_count: 0`. `levels` omits every `NONE` cell and drops any row whose `page_id` is unknown to `PAGE_IDS` (same rule as the resolver). `published` is `null` when no publication row exists yet. `MatrixRoleOut.name` is the role code's display name, composed in the service from a small literal map next to `read_matrix` (there is no roles table).

**Done when:** `GET /api/admin/access/matrix` as an ADMIN returns 16 pages in `PAGE_META` order, 6 roles, the seeded 55 cells with their real mix of `"VIEW"`/`"EDIT"`, `published: null` on a fresh DB; as an RM (no `USER_VIEW`) → 403.

---

### BE-9 — `PUT /api/admin/access/matrix`: atomic publish with concurrency token (Yes)

- **Proposal ref:** § Layer 2 C-5, § 4.1 part 3, D-5, DB B-3
- **Module:** 5.4
- **Files:** modify `app/libs/access/{service,router}.py`.
- **Dependencies:** BE-8.

**Contract:**
```python
@router.put("/access/matrix", response_model=MatrixOut)
def publish_matrix(
    body: MatrixPublishIn,
    service: Annotated[AccessService, Depends(_get_service)],
    user: Annotated[User, Depends(require_action(Action.USER_WRITE))],
) -> MatrixOut:
    return service.publish(body, actor=user)
```
```python
    def publish(self, body: MatrixPublishIn, *, actor: User) -> MatrixOut:
        """ONE transaction, ONE commit (C-5):
          1. optimistic-concurrency check: latest_publication().published_at must
             equal body.base_published_at (both None is a match) — else
             HTTPException(409, detail={"detail": "matrix_changed_since_read",
                                       "published": {"at": ..., "by": ...}})
          2. for each change: upsert_level(VIEW|EDIT) or delete_level(NONE)
          3. insert_publication(change_count=len(changes), note=body.note,
                                actor_uid=actor.firebase_uid, actor_name=actor.name)
          4. insert_audit(event="access.published",
                          detail=f"{len(changes)} cell(s) published")
          5. commit  — then return self.read_matrix()
        Any failure rolls back all of it: no partial matrix, no orphan publication
        row, no audit row for a publish that did not happen."""
```

**Behavior / invariants:**
- `base_published_at` is **required** in the sense that a mismatch — including a client that omits it while a publication exists — is a 409. `None == None` (fresh DB, never published) is the only case where an absent token matches.
- `NONE` is applied as a `DELETE`, never as a stored row (D-3). An empty `changes` list is accepted and still writes a publication + audit row (an administrator may publish "no changes" to bump the token; rejecting it would be a new rule the proposal does not ask for).
- Cells are applied in request order; duplicates for the same `(page_id, role)` are last-write-wins **inside the same transaction**, which is observationally identical to the FE's staged map (one entry per cell).
- No server-side draft/staging table (D-5) — staging stays client-side.

**Done when:** two sequential publishes with the second carrying a stale `base_published_at` → the second is 409 with `detail.detail == "matrix_changed_since_read"` and the matrix is unchanged; a `changes` list containing one `NONE` deletes exactly that row; a forced failure mid-apply leaves zero rows changed and no publication row.

---

### BE-10 — Overrides: list / grant / revoke (Yes)

- **Proposal ref:** § 4.1 part 4, DB B-2, D-3
- **Module:** 5.4
- **Files:** modify `app/libs/access/{schemas,service,router}.py`.
- **Dependencies:** BE-8.

**Contract:**
```python
class OverrideOut(BaseModel):
    id: uuid.UUID
    firebase_uid: str
    user_name: str | None
    user_role: AdminRole
    page_id: str
    page_label: str
    page_path: str
    role_default: AccessLevel     # resolved server-side AT READ TIME, never snapshotted
    level: AccessLevel            # may be NONE — a real value on this table (D-3)
    reason: str
    granted_by: str               # granter's display name
    expires_at: datetime | None
    expiring_soon: bool           # server-computed: expires_at <= now + 30 days


class OverrideIn(BaseModel):
    firebase_uid: str
    page_id: str                  # validated against PAGE_IDS
    level: AccessLevel
    reason: str = Field(min_length=1)     # 422 when blank
    expires_at: datetime | None = None


@router.get("/access/overrides", response_model=list[OverrideOut])
def list_overrides(
    service: Annotated[AccessService, Depends(_get_service)],
    _: Annotated[User, Depends(require_action(Action.USER_VIEW))],
) -> list[OverrideOut]: ...


@router.post("/access/overrides", response_model=OverrideOut, status_code=201)
def grant_override(
    body: OverrideIn,
    service: Annotated[AccessService, Depends(_get_service)],
    user: Annotated[User, Depends(require_action(Action.USER_WRITE))],
) -> OverrideOut: ...


@router.delete("/access/overrides/{override_id}", status_code=204, response_class=Response)
def revoke_override(
    override_id: uuid.UUID,
    service: Annotated[AccessService, Depends(_get_service)],
    user: Annotated[User, Depends(require_action(Action.USER_WRITE))],
) -> Response: ...
```
```python
    def grant_override(self, body: OverrideIn, *, actor: User) -> OverrideOut:
        """404 if firebase_uid is unknown or is not a Portal.ADMIN user;
        409 "An override already exists for this user and page" on the
        UNIQUE (user_id, page_id); 422 on blank reason or unknown page_id.
        One audit row (event="override.granted"), one commit."""

    def revoke_override(self, override_id: uuid.UUID, *, actor: User) -> None:
        """404 if unknown. One audit row (event="override.revoked"), one commit."""
```

**Behavior / invariants:** `role_default` and `user_name`/`user_role` come from the live join, never from a stored snapshot — that is the whole reason § Layer 3 C deletes the FE's `Override.from` field. `expiring_soon` is computed server-side against the same `now` used for the rest of the response. `level` may be `"NONE"` here and only here (3-value enum on this table, 2 on `page_access`, D-3). Overrides for a page id no longer in `PAGE_IDS` are excluded from the listing, matching the resolver.

**Done when:** grant → the row appears in the listing with `role_default` reflecting the *current* matrix (verified by publishing a change and re-reading); a second grant for the same `(user, page)` → 409; blank `reason` → 422; revoke → 204 and the row is gone; both mutations wrote one audit row each.

---

### BE-11 — `GET /api/admin/audit` (Yes)

- **Proposal ref:** § 4.1 part 5, DB B-3
- **Module:** 5.4
- **Files:** modify `app/libs/access/{schemas,service,router}.py`.
- **Dependencies:** BE-8.

**Contract:**
```python
class AuditOut(BaseModel):
    id: uuid.UUID
    at: datetime
    actor_name: str        # denormalised — reads correctly after the actor is deleted
    event: str
    detail: str


@router.get("/audit", response_model=list[AuditOut])
def list_audit(
    service: Annotated[AccessService, Depends(_get_service)],
    _: Annotated[User, Depends(require_action(Action.USER_VIEW))],
    limit: int = Query(50, ge=1, le=200),
    before: datetime | None = Query(None),
) -> list[AuditOut]: ...
```

**Behavior / invariants:** newest first (`ORDER BY at DESC`), keyset-paged on `before` (`at < before`) — not offset-paged, so a concurrent insert cannot duplicate or skip a row across pages. `actor_name` falls back to `"(deleted user)"` when the stored value is `NULL` (pre-existing rows or a NULL-actor write) rather than serialising `null` into a display-only field. `event` and `detail` are free text, display-only, composed at write time by whichever service wrote them — this route never re-composes them.

**Audit events written by this layer** (the complete set, so a reviewer can check coverage of § Objectives "every state-changing admin act is on the record"): `account.created` (BE-17), `account.updated` / `account.deactivated` (BE-19), `account.link_sent` (BE-17, BE-18), `access.published` (BE-9), `override.granted` / `override.revoked` (BE-10).

**Done when:** the route returns rows newest-first; `before` excludes rows at or after it; `limit` is clamped to 200; every event name above appears after exercising its unit.

---

### BE-12 — Passwordless identity: `_DEFAULT_PASSWORD` deleted (MANDATORY)

- **Proposal ref:** § Layer 2 C-1, § Goals 6, § Dead code purged row 2
- **Module:** 5.6
- **Files:** modify `app/libs/identity/service.py`.
- **Dependencies:** none — parallel-safe, one-line change.

**Contract:**
```python
# app/libs/identity/service.py — the constant at line 8 is DELETED.
    def create_user(self, email: str) -> str:
        """Admin SDK create; returns the new uid. Raises on failure (caller catches).

        PASSWORDLESS by construction (C-1): no `password` argument, so the account
        holds no password credential at all until its holder sets one through the
        emailed set-password link. There is no interval in which a credential the
        system chose exists."""
        if self._settings.firebase_auth_disabled:
            return f"dev-{email}"          # unchanged: deterministic synthetic uid
        _init_firebase(self._settings)
        user = auth.create_user(email=email)      # was: password=_DEFAULT_PASSWORD
        return user.uid
```

**Behavior / invariants:** `ensure_identity` still returns `(uid, created)` and neither caller changes shape — which is why this single edit fixes **both** provisioning paths at once: `StaffService.enroll` (`staff/service.py:50`) and `ClientService.onboard` (`clients/service.py:57`). The `created` flag stays load-bearing for the compensating delete (Risk A1). The `firebase_auth_disabled` branch is untouched.

**Done when:** `rg "12345678" api-backend/` returns nothing; `rg "password=" app/libs/identity/service.py` returns nothing; a real-Firebase create yields a user whose `providerData` carries no password provider.

---

### BE-13 — `generate_invite_link` → `generate_set_password_link`, and the Q-5 link-type decision (Accepted)

- **Proposal ref:** § Layer 2 C-1 (Decision — link type), C-3, Q-5, § "Kept, with a reason" row 1
- **Module:** 5.6
- **Files:** modify `app/libs/identity/service.py`, `app/libs/staff/service.py`, `app/libs/clients/service.py`, `app/cli/bootstrap_admin.py`.
- **Dependencies:** BE-12 (the link is generated against a passwordless identity — that is what makes the fallback question real).

**Contract:**
```python
    def generate_set_password_link(self, email: str) -> str:
        """RENAMED from generate_invite_link (3 callers: StaffService.enroll,
        ClientService.onboard, app/cli/bootstrap_admin.py:55). KEPT, not deleted.

        Q-5 order, settled by the integration test below, not by argument:
          1. auth.generate_password_reset_link(email)
          2. on a Firebase rejection for an account with no password provider,
             auth.generate_sign_in_with_email_link(email, action_code_settings)
        The two branches are interchangeable to every caller — this method's
        signature and return type are identical either way (C-3), so no other
        backend module observes the outcome. The FRONTEND does: the email-link
        branch needs a set-password step on the landing page that does not exist
        today, which is why phase 3 is scheduled only after this test reports."""
        if self._settings.firebase_auth_disabled:
            return f"https://dev.invalid/set-password?email={email}"
        _init_firebase(self._settings)
        try:
            return auth.generate_password_reset_link(email)
        except (auth.UserNotFoundError, ValueError, FirebaseError) as exc:
            logger.info("reset link rejected for passwordless %s: %s — using email link", email, exc)
            return auth.generate_sign_in_with_email_link(email, _ACTION_CODE_SETTINGS)
```

**Named deliverable — the deciding integration test.** `api-backend/tests/libs/identity/test_set_password_link_type.py::test_reset_link_over_passwordless_identity`: against a **real Firebase project**, `create_user(email)` a fresh passwordless identity, then call `auth.generate_password_reset_link` on it and record which branch fires. **This test's outcome is a required output of this layer** — it is written back into this block as a dated one-liner before the Frontend layer is scheduled (proposal § Execution phase 2 → 3 ordering), and it is the only test in this layer that is not hermetic (it is therefore marked and excluded from the default `pytest -q` selection; see § 8.1).

> **Q-5 outcome (recorded by BE-13's test run):** `2026-07-30 — decider run against a real Firebase project: test_reset_link_over_passwordless_identity passed. "reset link ACCEPTED directly over a passwordless identity -- FE scope unchanged." FE-17 is dropped; the Frontend layer's scope is exactly FE-1…FE-16.`

**Behavior / invariants:** three call sites are renamed, none removed. `bootstrap_admin.py` deliberately **prints** the link rather than emailing it — at bootstrap no mailbox is trusted and the Trigger Email extension may not be configured yet — and inherits BE-12's passwordless fix for free since it goes through the same `ensure_identity`. `_ACTION_CODE_SETTINGS` is built from existing settings (the portal sign-in URL); no new `Settings` field is added for it if `cors_origins`' first entry already names the portal — if it does not, one nullable setting is added and named here rather than inferred at runtime.

**Done when:** `rg "generate_invite_link" api-backend/` returns nothing; all three callers compile and `mypy app` is clean; the deciding test has run and its outcome line is written above.

---

### BE-14 — `identity/mailer.py`: the set-password email (Yes — user req.)

- **Proposal ref:** § Layer 2 C-3, D-6
- **Module:** 5.6
- **Files:** create `app/libs/identity/mailer.py`.
- **Dependencies:** BE-13 (it sends the link that method returns).

**Contract:**
```python
# app/libs/identity/mailer.py
from __future__ import annotations

import logging

from firebase_admin import firestore

from app.core.config import Settings
from app.core.security import _init_firebase
from app.models.users import Portal

logger = logging.getLogger(__name__)

_MAIL_COLLECTION = "mail"   # the Firebase "Trigger Email from Firestore" extension


def send_set_password_email(
    *, to: str, name: str, link: str, portal: Portal, settings: Settings
) -> bool:
    """Queues one Firestore `mail` doc for the Trigger Email extension.
    Returns queued, not delivered. Never raises: a failed send must not roll back
    an account that Firebase and MariaDB have both already committed.

    Body (fixed by the proposal, not invented here): the account email — stated
    explicitly, because it IS the sign-in identity and the recipient may hold
    several addresses — the set-password link, one prominent line instructing them
    to set their password before signing in, a note that the link expires and that
    a fresh one can be requested from their administrator (staff) or their
    relationship manager (client), and the portal's own sign-in URL.
    ONE template; `portal` selects the wording and the destination sign-in URL.

    Under settings.firebase_auth_disabled the payload is logged at INFO and True is
    returned — the same dev-bypass shape every method in identity/service.py uses.
    """
    if settings.firebase_auth_disabled:
        logger.info("set-password email (dev bypass) to=%s portal=%s link=%s", to, portal.value, link)
        return True
    try:
        _init_firebase(settings)
        firestore.client().collection(_MAIL_COLLECTION).add(
            {"to": [to], "message": {"subject": ..., "html": ..., "text": ...}}
        )
        return True
    except Exception:                      # noqa: BLE001 — never raises, by contract
        logger.exception("set-password email could not be queued for %s", to)
        return False
```

**Behavior / invariants:**
- **Never raises.** Every exception path returns `False`. This is a hard contract, relied on by BE-17, BE-18 and BE-20, all of which call it *after* their commit.
- No SMTP credential enters `Settings` or the container (D-6): transport is the extension, configured in the Firebase console, reached through the SDK `_init_firebase` already initialises. **No new Python dependency.**
- One template, two wordings — not two senders and not two templates.
- It queues; it does not confirm delivery. The returned `bool` is `link_sent` on the wire and is written to the audit trail; the FE renders a `False` as "account created — the invitation email could not be sent, resend it from the row menu".

**Done when:** a monkeypatched Firestore client receives exactly one document per call with the address in `to` and the link in the body; a Firestore client that throws yields `False` and no exception escapes; under `firebase_auth_disabled` it logs once at INFO and returns `True` without touching Firestore.

---

### BE-15 — Staff schemas: domain validation, the new fields, `invite_link` deleted (Yes)

- **Proposal ref:** § 4.1 part 2, C-6, C-11, § Dead code purged row 5
- **Module:** 5.7
- **Files:** modify `app/schemas/staff.py`.
- **Dependencies:** BE-1 (role/action vocabulary). Parallel-safe with BE-16…BE-19, which consume it.

**Contract:**
```python
# app/schemas/staff.py
_ALLOWED_EMAIL_DOMAIN = "megaannum.ai"
_DOMAIN_MESSAGE = "Email must be a @megaannum.ai address"


def _assert_internal_domain(value: str) -> str:
    """C-6: the wizard's /@megaannum\\.ai$/ check is UX; this is the boundary.
    Applied to StaffEnrollIn.email AND StaffUpdateIn.email."""
    if not value.lower().endswith(f"@{_ALLOWED_EMAIL_DOMAIN}"):
        raise ValueError(_DOMAIN_MESSAGE)
    return value


class StaffOverrideIn(BaseModel):
    page_id: str                       # validated against PAGE_IDS
    level: AccessLevel
    reason: str = Field(min_length=1)
    expires_at: datetime | None = None


class StaffEnrollIn(BaseModel):
    email: EmailStr
    first_name: str
    last_name: str
    role: AdminRole
    phone_number: str | None = None
    department: str | None = None
    start_date: date | None = None
    address: str | None = None
    send_link: bool                     # the wizard's "Email the invitation" checkbox
    overrides: list[StaffOverrideIn] = []
    # NOTE: no `password` field, in or out (§ 7.1).

    _domain = field_validator("email")(classmethod(lambda cls, v: _assert_internal_domain(v)))


class StaffUpdateIn(BaseModel):         # all optional; omitted = unchanged
    role: AdminRole | None = None
    name: str | None = None
    email: EmailStr | None = None       # same domain validator
    phone_number: str | None = None
    department: str | None = None
    status: Literal["ACTIVE", "DEACTIVATED"] | None = None   # INITIATED never settable (D-4)
    deactivate_reason: str | None = None
    reassign_book_to: str | None = None                       # C-11


class StaffOut(BaseModel):
    firebase_uid: str
    email: str | None
    name: str | None
    role: AdminRole
    department: str | None
    phone_number: str | None
    status: Literal["ACTIVE", "INITIATED", "DEACTIVATED"]     # INITIATED is DERIVED
    last_sign_in_at: datetime | None
    override_count: int
    client_count: int | None            # RM only; None for every other role
    open_ticket_count: int | None       # RM only; None for every other role
    # invite_link: DELETED (§ Dead code purged) — no consumer ever read it and
    # delivery is the mailer's job now.


class StaffCreatedOut(BaseModel):
    firebase_uid: str
    email: str
    role: AdminRole
    status: Literal["INITIATED"]        # always INITIATED for a fresh enrollment
    link_sent: bool
    override_count: int


class LinkSentOut(BaseModel):
    link_sent: bool
```

**Behavior / invariants:**
- The domain check is a **422** with `_DOMAIN_MESSAGE`, the same text the wizard shows, on both enroll and update. `StaffUpdateIn.email` is the local contact email, not the Firebase credential (the existing comment at `staff/service.py:114`) — the domain rule applies anyway, since an internal user's contact address is an internal address.
- `status` on the way **in** accepts only `ACTIVE`/`DEACTIVATED`; `INITIATED` is derived on the way out (D-4) and is never accepted. The service maps `ACTIVE → AccountStatus.ACTIVE` and `DEACTIVATED → AccountStatus.DISABLED` (§ 7's field map).
- `StaffUpdatePatch` (the `Protocol` in `staff/service.py`) is widened in lockstep — it gains `department`, `deactivate_reason`, `reassign_book_to` and its `status` becomes the wire literal that the service maps, so the service still does not import this schema module.
- `first_name` + `last_name` are joined server-side into the single `admin_profiles.name` column (§ 7's field map) — there is no `first_name` column.

**Done when:** `POST /api/admin/staff` with `alice@gmail.com` → 422 carrying `_DOMAIN_MESSAGE`; `rg "invite_link" api-backend/` returns nothing; `StaffOut` validates against a hand-built row for each of the three statuses.

---

### BE-16 — `GET /api/admin/staff`: the directory, one grouped-subquery pass (Yes)

- **Proposal ref:** § Layer 2 C-4, C-11 step 1, § 4.1 part 2, DB B-4
- **Module:** 5.7
- **Files:** modify `app/libs/staff/repository.py`, `app/libs/staff/service.py`, `app/libs/staff/router.py`.
- **Dependencies:** BE-15. Reads `page_access_overrides` (BE-3's table) directly via its own query — `staff → access` is the permitted direction.

**Contract:**
```python
# app/libs/staff/repository.py
@dataclass(frozen=True)
class StaffDirectoryRow:
    """Repository return shape — one joined row. Plain dataclass, no Pydantic:
    the repo has no dependency on the wire schemas (same rule as ClientRow)."""

    firebase_uid: str
    email: str | None
    name: str | None
    role: AdminRole
    department: str | None
    phone_number: str | None
    status: AccountStatus
    last_sign_in_at: datetime | None
    override_count: int
    client_count: int          # 0 for non-RM roles; the SERVICE nulls them out
    open_ticket_count: int


    def list_directory(self) -> list[StaffDirectoryRow]:
        """ONE query: users ⨝ admin_profiles, LEFT JOIN three grouped subqueries
        (overrides per user_id, client_profiles per assigned_rm_uid, OPEN
        client_tickets per assigned_rm_uid), COALESCEd to 0. Explicitly NOT N+1
        (C-4, C-11 step 1) — the two handover counts ride the same pass as
        override_count, so adding them costs no extra round-trip."""

    def count_book(self, rm_uid: str) -> tuple[int, int]:
        """(client_count, open_ticket_count) for ONE rm uid — the guard's input in
        BE-19. Same predicates as list_directory's subqueries, expressed once in a
        shared module-level constant so the number the admin SEES and the number the
        guard ACTS on can never drift."""
```
```python
# app/libs/staff/router.py
@router.get("", response_model=list[StaffOut])
def list_staff(
    service: Annotated[StaffService, Depends(_get_service)],
    _: Annotated[User, Depends(require_action(Action.USER_VIEW))],
) -> list[StaffOut]:
    return service.list_directory()
```
```python
# app/libs/staff/service.py
    def list_directory(self) -> list[StaffOut]:
        """Derives StaffOut.status:
            DISABLED                                  -> "DEACTIVATED"
            ACTIVE and last_sign_in_at IS NULL        -> "INITIATED"   (derived, D-4)
            ACTIVE and last_sign_in_at IS NOT NULL    -> "ACTIVE"
        and nulls client_count/open_ticket_count for every role except RM — nothing
        else in the system is owned per-person, so there is nothing else to hand
        over (§ 7.1)."""
```

**Contract — the open-ticket predicate:**
```python
# app/libs/staff/repository.py
# `TicketStatus` (app/models/onboarding.py:352) has NO `closed` member — its values
# are new | in_progress | resolved | declined — so "open" is the two non-terminal
# states, exactly as § 7.1 and C-11 now spell it. One constant, used by
# list_directory, count_book and BE-19's UPDATE, so the count and the mutation can
# never disagree.
OPEN_TICKET_STATUSES: Final[frozenset[TicketStatus]] = frozenset(
    {TicketStatus.NEW, TicketStatus.IN_PROGRESS}
)
```
Settled by the proposal (§ 4.1 and C-11 now both read `status IN ('new','in_progress')`): `resolved` and `declined` are terminal and keep their original `assigned_rm_uid`, which is what 018's B-1 history-preservation rule wanted. The constant above is the single spelling of that rule in this layer.

**Behavior / invariants:** exactly one query for the whole directory regardless of row count (assert with a query counter in the test). `client_count`/`open_ticket_count` are `None` — not `0` — for PC, COMPLIANCE, MOBO, PM and ADMIN, so the FE can distinguish "no book" from "not a book-owning role" and hide the handover control accordingly. `status` is derived in the service, never stored; no third `AccountStatus` enum value is added anywhere.

**Done when:** the route returns one row per admin-portal user with correct derived statuses; an RM with 3 clients and 2 open + 1 resolved ticket reports `client_count: 3, open_ticket_count: 2`; a PC user reports both as `null`; the query counter proves one query; an RM caller (no `USER_VIEW`) → 403.

---

### BE-17 — `StaffService.enroll` extended: department, overrides, link + email after commit (Yes — user req.)

- **Proposal ref:** § Layer 2 C-3, C-4, § 4.1 part 2, § Layer 3 A-7
- **Module:** 5.7
- **Files:** modify `app/libs/staff/{service,repository,router}.py`.
- **Dependencies:** BE-13, BE-14, BE-15. Writes `page_access_overrides` via `AccessRepository` (`staff → access`).

**Contract:**
```python
    def enroll(
        self,
        *,
        caller_uid: str,
        caller_name: str | None,
        email: str,
        name: str,                       # first_name + " " + last_name, joined by the router
        role: AdminRole,
        phone_number: str | None,
        department: str | None,
        start_date: date | None,
        address: str | None,
        overrides: list[StaffOverrideIn],
        send_link: bool,
        identity: FirebaseIdentityService,
        settings: Settings,
    ) -> tuple[User, bool, int]:
        """Returns (user, link_sent, override_count).

        Saga, UNCHANGED in shape (parity with BE-12 of proposal 004):
          1. identity.ensure_identity(email)   — Firebase first; a PASSWORDLESS
             identity now (BE-12), so nothing guessable exists at any point
          2. repo.create_with_profile(... department=department,
             start_date=start_date, address=address ...)   -- all three PERSISTED
          3. AccessRepository.insert_override(...) per entry in `overrides`
          4. ONE commit  — on failure: rollback, and delete_user IFF created
             (Risk A1: an ADOPTED identity is never deleted)
          5. set_portal_claims(uid, "admin", role.value, settings)   (Risk A4)
          6. audit row: event="account.created"
          7. AFTER the commit, iff send_link: link = identity.
             generate_set_password_link(email); link_sent = send_set_password_email(
             to=email, name=name, link=link, portal=Portal.ADMIN, settings=settings)
             — never raises (BE-14), never rolls back step 4 (C-3). A False is
             recorded in the audit trail and returned as link_sent.
        """
```
```python
# app/libs/staff/router.py
@router.post("", response_model=StaffCreatedOut, status_code=201)
def enroll_staff(
    body: StaffEnrollIn,
    service: Annotated[StaffService, Depends(_get_service)],
    identity: Annotated[FirebaseIdentityService, Depends(get_identity_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    user: Annotated[User, Depends(require_action(Action.USER_WRITE))],
) -> StaffCreatedOut: ...
```

**Behavior / invariants:**
- **Order is load-bearing:** the email is sent *after* the commit, never inside the transaction. A send failure leaves a fully-created account and `link_sent: false` with a 201 — failing the request would strand an account that Firebase and MariaDB have both already accepted, and it is always recoverable via BE-18.
- `send_link: false` ⇒ no link is generated and no email queued; `link_sent` is `false`. The two reasons for `false` are indistinguishable on the wire by design (§ 7.1's own comment).
- `status` in the 201 is always `"INITIATED"` — the row is inserted `ACTIVE` (existing `create_with_profile` behaviour, deliberately not the column default) with `last_sign_in_at IS NULL`, which derives to `INITIATED`.
- The enrollment-time overrides carry the admin's own `reason` and `expires_at` from the request (§ Layer 3 A-7) — the service invents neither.
- `StaffRepository.create_with_profile` gains **three** parameters — `department`, `start_date`, `address` — passed through to `AdminProfile` exactly the way `name` and `phone_number` already are. All three are **persisted**, not accepted-and-discarded: DB B-4 now adds `admin_profiles.department` (VARCHAR), `.start_date` (DATE) and `.address` (TEXT), and § 7's field map has a row for the latter two. The wizard collects all three, so a contract that swallowed them would lie to its caller and would show an admin their typed address vanishing on the next page load.

**Done when:** enrolling with two overrides creates the user, the profile with `department`/`start_date`/`address` all readable back, exactly two `page_access_overrides` rows and one `account.created` audit row, all in one transaction; a mailer returning `False` still yields 201 with `link_sent: false`; a forced commit failure on a newly-minted identity deletes it in Firebase and leaves zero DB rows; a forced commit failure on an *adopted* identity leaves it alone.

---

### BE-18 — `POST /api/admin/staff/{uid}/set-password-link` (Yes)

- **Proposal ref:** § Layer 2 C-4
- **Module:** 5.7
- **Files:** modify `app/libs/staff/{service,router}.py`.
- **Dependencies:** BE-13, BE-14, BE-15.

**Contract:**
```python
@router.post("/{uid}/set-password-link", response_model=LinkSentOut)
def send_set_password_link(
    uid: str,
    service: Annotated[StaffService, Depends(_get_service)],
    identity: Annotated[FirebaseIdentityService, Depends(get_identity_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    actor: Annotated[User, Depends(require_action(Action.USER_WRITE))],
) -> LinkSentOut: ...
```
```python
    def send_set_password_link(
        self, uid: str, *, actor: User, identity: FirebaseIdentityService, settings: Settings
    ) -> LinkSentOut:
        """The "Reset password" row action. Empty body. Idempotent: each call mints a
        FRESH Firebase link, which invalidates any earlier unused one.

        Does NOT touch the Firebase credential — no auth.update_user(password=...) —
        so an admin cannot lock a user out by "resetting" them, and a password the
        user has already set keeps working until they use the new link (C-4).
        404 if uid is unknown or is not a Portal.ADMIN user.
        One audit row (event="account.link_sent"), written and committed BEFORE the
        send, so the record exists even if the queue call fails."""
```

**Behavior / invariants:** no credential mutation, ever. 404 on unknown/non-admin uid. The mailer's `bool` is the whole response body. Deactivate/reactivate get **no** new route — both are expressible through the existing `PATCH` (`status`), which is what the FE's two modals call (C-4).

**Done when:** two consecutive calls both return `link_sent: true` and generate two distinct links; the target's Firebase password credential is untouched (asserted against a mocked `auth`); an unknown uid → 404; a client-portal uid → 404.

---

### BE-19 — RM book handover: one guard, two triggers, two `UPDATE`s (Yes — user req.)

- **Proposal ref:** § Layer 2 C-11, Q-3, Q-7, § 4.1 part 2 (the 409×2 / 422 messages)
- **Module:** 5.7
- **Files:** modify `app/libs/staff/{service,repository}.py`, `app/libs/staff/router.py` (response model only).
- **Dependencies:** BE-15, BE-16 (`count_book`, `OPEN_TICKET_STATUSES`).

**Contract:**
```python
# app/libs/staff/service.py
def _handover_block(
    *,
    profile_role: AdminRole,
    user_status: AccountStatus,
    patch: StaffUpdatePatch,
    client_count: int,
) -> str | None:
    """THE guard (C-11). ONE condition, evaluated ONCE: "this user is about to stop
    being an active RM". Returns the 409 detail to raise when a handover is required
    and `reassign_book_to` is absent, else None.

    Two triggers, not two checks — deactivation and a role change away from RM do
    the same damage (the book keeps pointing at a uid no active RM holds), so they
    share this function rather than drifting apart as parallel branches.
    A no-op role write (role == RM) is NOT a trigger. A non-RM, or an RM with an
    empty book, is never blocked."""
    if profile_role != AdminRole.RM or client_count == 0:
        return None
    if patch.status == "DEACTIVATED" and user_status == AccountStatus.ACTIVE:
        return "Reassign this RM's client book before deactivating"
    if patch.role is not None and patch.role != AdminRole.RM:
        return "Reassign this RM's client book before changing their role"
    return None


    def _assert_valid_receiver(self, to_uid: str, *, from_uid: str) -> None:
        """422 "reassign_book_to must be an active RM" (§ 7.1's exact message) when
        the receiver is missing, not an admin, not role RM, not ACTIVE, or is the
        user being changed. The RM-role half REUSES ClientService.assert_is_rm
        rather than reimplementing it (C-11 step 3) — its 422 is caught and
        re-raised with this endpoint's message; the ACTIVE and not-self checks are
        this method's own, since assert_is_rm does not make them."""
```
```python
# app/libs/staff/repository.py — two set-based statements, no row-by-row work
    def reassign_book(self, *, from_uid: str, to_uid: str) -> int:
        """UPDATE client_profiles SET assigned_rm_uid = :to
           WHERE assigned_rm_uid = :from            -- returns rowcount"""

    def reassign_open_tickets(self, *, from_uid: str, to_uid: str) -> int:
        """UPDATE client_tickets SET assigned_rm_uid = :to
           WHERE assigned_rm_uid = :from AND status IN OPEN_TICKET_STATUSES
        CLOSED/terminal tickets keep their original assigned_rm_uid — 018's B-1
        snapshot semantics are deliberately preserved (proposal C-11 bullet 2)."""
```
```python
    def update(self, uid: str, patch: StaffUpdatePatch, settings: Settings, *, actor: User) -> StaffOut:
        """Order inside the ONE existing transaction:
          1. resolve user + profile (404 / 409 "User is not an admin-portal user")
          2. EXISTING last-active-ADMIN TOCTOU guard — count_active_admins(
             for_update=True) inside THIS txn, 409 "Cannot demote/disable the last
             active ADMIN". UNCHANGED, and evaluated BEFORE the handover guard.
          3. counts = repo.count_book(uid);  block = _handover_block(...)
             block and patch.reassign_book_to is None      -> 409 block
             block and patch.reassign_book_to is not None   -> _assert_valid_receiver
          4. apply role / status / name / email / phone_number / department
          5. iff block: reassign_book() then reassign_open_tickets() — SAME txn as
             step 4, so there is never a committed state with an orphaned book
          6. audit row: "Deactivated A · book of 23 clients + 4 open tickets → B" /
             "A RM → MOBO · book of 23 clients + 4 open tickets → B"
          7. ONE commit; then set_portal_claims iff role changed (as today)
        Reactivation does NOT un-hand-over, and promoting someone back to RM does
        not restore a book (C-11 closing note)."""
```

**Behavior / invariants:**
- **The existing last-active-ADMIN TOCTOU guard survives intact** — same `count_active_admins(for_update=True)` call, same `SELECT … FOR UPDATE` semantics, same 409 message, still evaluated inside the same transaction, and still *before* the new guard so a last-admin demotion fails for the right reason. This is the one regression risk of the unit and is asserted by its own test.
- Exactly the three seam messages, verbatim: `"Reassign this RM's client book before deactivating"`, `"Reassign this RM's client book before changing their role"`, `"reassign_book_to must be an active RM"`.
- Both `UPDATE`s are set-based and share the transaction with the status/role write — atomic by construction, no per-record migration, no reassignment queue, no generic "open item" abstraction (Q-3).
- Onboardings, allotments/redemptions and client events carry **no** RM column (all keyed on `user_id`), so they follow the book automatically — nothing to migrate for them, deliberately.

**Done when:** deactivating an RM with a book and no `reassign_book_to` → 409 (deactivate message); `PATCH {role: "MOBO"}` on that same RM → 409 (role message); with a valid receiver, `client_profiles` and **open** tickets move while `resolved`/`declined` tickets keep the original uid; a non-RM / inactive / self receiver → 422; `PATCH {role: "RM"}` on an RM needs no receiver; deactivating a PC or COMPLIANCE user needs no receiver; demoting the last active ADMIN still 409s with the ADMIN message.

---

### BE-20 — `_approve_initial` emails the client their set-password link (Yes — user req.)

- **Proposal ref:** § Layer 2 C-8, D-6a
- **Module:** 5.8
- **Files:** modify `app/libs/onboarding/service.py`, `app/libs/onboarding/router.py`.
- **Dependencies:** BE-13, BE-14.

**Contract:**
```python
# app/libs/onboarding/service.py
    def approve(
        self,
        onboarding_id: uuid.UUID,
        *,
        compliance_uid: str,
        identity: FirebaseIdentityService,
        settings: Settings,
    ) -> OnboardingDTO:
        """UNCHANGED pipeline: same guards, same kind branch, same single commit.
        The ONLY addition is after the commit succeeds and only on the `initial`
        branch:

            link = identity.generate_set_password_link(client_email)
            send_set_password_email(to=client_email, name=client_name, link=link,
                                    portal=Portal.CLIENT, settings=settings)

        Same placement and same never-raises contract as the staff path (C-3): the
        client is ACTIVE in MariaDB before the send is attempted, and a failed send
        never rolls back an approval. _approve_renewal sends NOTHING — a renewal
        re-verifies documents on an account that already works.

        `identity` is taken as a parameter, mirroring `start` (service.py:112),
        rather than constructed inside the service — the module already imports
        FirebaseIdentityService."""
```
```python
# app/libs/onboarding/router.py — the approve route gains the two deps `start`
# already takes; its path, method and response_model are unchanged.
@router.post("/compliance/onboardings/{onboarding_id}/approve", response_model=OnboardingDTO)
def approve_onboarding(
    onboarding_id: uuid.UUID,
    svc: Annotated[OnboardingService, Depends(_service)],
    user: Annotated[User, Depends(require_action(Action.ONBOARDING_REVIEW))],
    settings: Annotated[Settings, Depends(get_settings)],
) -> OnboardingDTO:
    identity = FirebaseIdentityService(settings)
    return svc.approve(
        onboarding_id, compliance_uid=user.firebase_uid, identity=identity, settings=settings
    )
```

**Behavior / invariants:**
- Approval is the correct and only moment to send (D-6a): before it, `users.status` is `DISABLED` and `assert_can_authenticate` rejects the login, so an earlier email would hand out a link to a door that is still locked.
- **Exactly one email per initial approval, zero per renewal.** The `initial`/`renewal` branch already exists in `approve`; the send hangs off it, after the commit, not inside `_approve_initial`'s write sequence.
- No stage, guard, verdict rule or status transition moves (§ 3 Non-Goals). The `client_events` "Subscription active" row still gets written.
- `ClientService.onboard` keeps returning its link in the `POST /api/rm/clients` response for now (no contract break); that link simply stops being the delivery mechanism. Dropping the field is out of scope (§ Out of scope, last bullet).

**Done when:** approving an `initial` cycle queues exactly one client email after the commit; approving a `renewal` queues none; a mailer that returns `False` leaves the approval committed and the response unchanged; a failure *inside* the transaction rolls everything back and sends nothing.

---

### BE-21 — Delete `app/libs/dev/`, `app/schemas/dev.py`, the conditional mount and `Settings.dev_mode` (Yes — user req.)

- **Proposal ref:** § Layer 2 C-9, D-7, § Goals 9, § Dead code purged rows 3-4
- **Module:** 5.9
- **Files:** delete `app/libs/dev/router.py`, `app/libs/dev/service.py`, `app/libs/dev/__init__.py`, `app/schemas/dev.py`; modify `app/core/config.py`, `app/main.py`.
- **Dependencies:** none — parallel-safe; scheduled late because it is a pure contraction.

**Contract:**
```python
# app/core/config.py — DELETED (lines 16-18, comment included):
#     # True (dev): register endpoint accepts `role` field for internal users.
#     # False (prod): internal users cannot self-register; ...
#     dev_mode: bool = False
```
```python
# app/main.py — the production fail-closed check KEEPS its firebase_auth_disabled
# half and drops only the dev_mode half:
    if settings.app_env == "production" and settings.firebase_auth_disabled:
        raise RuntimeError(
            "Fail-closed: firebase_auth_disabled cannot be enabled when APP_ENV=production."
        )

# DELETED (lines 79-83):
#     # --- Dev-only (mounted iff dev_mode) ---
#     if get_settings().dev_mode:
#         from app.libs.dev.router import router as dev_router
#         app.include_router(dev_router, prefix="/api")
```

**Behavior / invariants:** `dev_register` has exactly one caller (its own router) and `dev_mode` exactly two readers (the mount and that check) — verified; nothing else imports the module, so this deletes a capability rather than relocating one. Enrollment (`POST /api/admin/staff`) and client onboarding (`POST /api/rm/clients` + Compliance approval) already cover every legitimate provisioning need, both behind `require_action`. `firebase_auth_disabled` is **kept** — it is the dev bypass every `identity` method and `_resolve_user` already honour, and BE-14 honours it too.

**Done when:** `rg "dev_mode|dev_register|libs/dev|schemas/dev" api-backend/` returns nothing; `app/libs/dev/` and `app/schemas/dev.py` do not exist; the app starts and `POST /api/dev/register` → 404; `APP_ENV=production` + `FIREBASE_AUTH_DISABLED=true` still raises at startup.

---

### BE-22 — Split unsafe `VIEW` actions: `ALLOTMENT_VIEW`; all four `CLIENT_VIEW`-guarded writes onto `CLIENT_WRITE` (MANDATORY / proposal C-12, D-16)

- **Proposal ref:** § Layer 2 C-12, D-16, § Layer 2 D (route-guard corrections), § Layer 2 E row C-12
- **Module:** 5.5 (`auth.actions`) + 5.1 (`access.pages`) — a small cross-cutting fix, not a module of its own.
- **Files:** modify `app/libs/auth/actions.py` (add one member), `app/libs/access/pages.py` (amend one `PAGE_ACTIONS` entry), `app/libs/onboarding/router.py` (**four** guard lines: `:211`, `:220`, `:234`, `:312`), `app/libs/client_portal/router.py` (one guard line, `:236`). One new action, **five** route repoints.
- **Dependencies:** BE-1 (needs the `*_WRITE` baseline already in `actions.py`); BE-2 (amends the map BE-2 builds — this unit lands after BE-2, not folded into it).

**Why this unit exists.** D-11's catalog-derived seed (BE-2's day-one table) grants `view` on `pc.allotment-redemption` to RM/MOBO/COMPLIANCE and `view` on `rm.client-info`/`rm.model-subscription` to MOBO/PC/COMPLIANCE. Under `ROLE_ACTIONS` this was invisible — only the roles that already held the matching write ever held these actions at all. Mapped through BE-2's *original* pinned buckets unmodified, each of those `view` grants would silently carry a write: `ALLOTMENT_ACKNOWLEDGE` guards `GET /pc/allotments` *and* `POST /pc/allotments/{id}/acknowledge` *and* `POST /pc/redemptions/{id}/decide`; `CLIENT_VIEW` guards **four** writes as well as its reads. The user's ruling (D-16) is to fix all six affected routes, not deny the seed cells or ship the gap.

**This reopens two prior, on-the-record decisions — deliberately, not by oversight.** Proposal 016 gated `POST /rm/allotment` and `POST /rm/redemption` on `CLIENT_VIEW`, and proposal 017 gated `POST /rm/allotments/{id}/transaction-detail` on it too, stating explicitly that this was "a write gated by a read-named action, accepted as-is rather than silently swapped" (017's impl doc §3.1) and instructing implementers to "reuse `Action.CLIENT_VIEW` — do not add a new `Action` member for this feature" (017's prompt). **That call was correct when it was made**: only RM and ADMIN ever held `CLIENT_VIEW`, and both already held every write action too, so there was no split to lose by reusing it. D-11 removes exactly that precondition — MOBO, PC and COMPLIANCE now hold `CLIENT_VIEW` via `view` on `rm.model-subscription`/`rm.client-info` without holding the write actions RM/ADMIN always had alongside it — so 016/017's "accepted as-is" no longer holds, and this unit is why 019 differs from their record rather than being inconsistent with it. The fourth write, `POST /rm/tickets/{ref}/status`, has no such paper trail and is a plain oversight.

**Contract:**
```python
# app/libs/auth/actions.py — ONE new member, added after ALLOTMENT_ACKNOWLEDGE:
class Action(str, enum.Enum):
    ...
    ALLOTMENT_ACKNOWLEDGE = "allotment:acknowledge"     # unchanged — PC's mutating action
    ALLOTMENT_VIEW = "pc:allotment_view"                # NEW (C-12) — read-only sibling
```
```python
# app/libs/onboarding/router.py — FOUR guard lines repointed.

# :312 — GET /pc/allotments. The two mutating routes at :321 (acknowledge) and
# :331 (decide) are UNCHANGED — still ALLOTMENT_ACKNOWLEDGE.
@router.get("/pc/allotments", response_model=list[AllotRdmptDTO])
def list_allotments(
    ...,
    _: Annotated[User, Depends(require_action(Action.ALLOTMENT_VIEW))],   # was ALLOTMENT_ACKNOWLEDGE
) -> list[AllotRdmptDTO]: ...

# :211 — POST /rm/allotment (proposal 016). Reopens 016's "accepted as-is" call —
# see the note above.
@router.post("/rm/allotment", response_model=AllotRdmptDTO, status_code=201)
def submit_allotment(
    ...,
    _: Annotated[User, Depends(require_action(Action.CLIENT_WRITE))],     # was CLIENT_VIEW
) -> AllotRdmptDTO: ...

# :220 — POST /rm/redemption (proposal 016). Same reopening.
@router.post("/rm/redemption", response_model=AllotRdmptDTO, status_code=201)
def submit_redemption(
    ...,
    _: Annotated[User, Depends(require_action(Action.CLIENT_WRITE))],     # was CLIENT_VIEW
) -> AllotRdmptDTO: ...

# :234 — POST /rm/.../transaction-detail (proposal 017). Same reopening.
@router.post(...)  # file_transaction_detail
def file_transaction_detail(
    ...,
    user: Annotated[User, Depends(require_action(Action.CLIENT_WRITE))],  # was CLIENT_VIEW
) -> TransactionDetailDTO: ...
```
```python
# app/libs/client_portal/router.py:236 — POST /rm/tickets/{ref}/status. The plain
# oversight, no prior "accepted as-is" record.
@router.post("/rm/tickets/{ref}/status", response_model=RmTicketDTO)
def set_ticket_status(
    ...,
    user: Annotated[User, Depends(require_action(Action.CLIENT_WRITE))],   # was CLIENT_VIEW
) -> RmTicketDTO: ...
```
```python
# app/libs/access/pages.py — BE-2's ONE entry AMENDED in place:
    "pc.allotment-redemption":    (fs(Action.ALLOTMENT_VIEW),               fs(Action.ALLOTMENT_ACKNOWLEDGE)),
    # was: (fs(Action.ALLOTMENT_ACKNOWLEDGE), fs())
    # `view` now reads the page and nothing else; `edit` adds acknowledge/decide —
    # exactly what PC (the only role that held this page before D-11) has today.
```
The `PAGE_ACTIONS` entries for `"rm.client-info"` and `"rm.model-subscription"` **do not change shape** — both stay `(fs(Action.CLIENT_VIEW), fs(Action.CLIENT_WRITE))` / `(fs(Action.CLIENT_VIEW), fs())` respectively. The fix is entirely in *what `CLIENT_VIEW` guards*, not in the map: once all four writes move off it, holding `CLIENT_VIEW` alone is genuinely safe. The four matching **reads** stay on `CLIENT_VIEW`, untouched: `GET /rm/clients/{client_id}/events`, `GET /rm/subscriptions`, `GET /rm/subscriptions/{client_id}/allotments`, `GET /rm/allotments/{id}/transaction-detail`, plus `clients/router.py`'s three existing reads.

**Behavior / invariants:**
- **The property this unit establishes:** after it lands, no `Action` that appears in any `PAGE_ACTIONS` **VIEW** bucket guards a state-changing route (`POST`/`PATCH`/`DELETE`) anywhere in the codebase, except where that same route also appears reachable through that page's own **EDIT** bucket for the role that is meant to hold it. Checkable by grep, and stated as such in § 8: search every router for `ALLOTMENT_VIEW` and `CLIENT_VIEW` and confirm neither appears on a `@router.post`/`@router.patch`/`@router.delete` line — this must hold across **all five** repointed routes, not just the previously-fixed one.
- `ALLOTMENT_ACKNOWLEDGE`'s two mutating routes (`:321`, `:331`) are untouched — PC (the role that actually acknowledges/decides) still needs `edit` on `pc.allotment-redemption`, which the seed still gives it.
- `CLIENT_WRITE` already exists (BE-1's rename) and already guards `PATCH /api/rm/clients` (via `clients/router.py`); this unit adds four more guard sites for it, it does not introduce the action.
- This closes **all six** conflations C-12 named — the one `ALLOTMENT_ACKNOWLEDGE` case and all four `CLIENT_VIEW` cases, including the two 016/017 explicitly accepted at the time. Nothing is left out of scope: D-11's own "no role gains a write it did not already have" standard depends on every one of the six being fixed, not a subset.

**Done when:** with `page_access` seeded `view` on `pc.allotment-redemption` for a non-PC role, `GET /pc/allotments` → 200 and `POST /pc/allotments/{id}/acknowledge`/`POST /pc/redemptions/{id}/decide` → 403 for that same caller; with `page_access` seeded `view` on `rm.client-info`/`rm.model-subscription` for a non-RM role, the corresponding reads → 200 while `POST /rm/tickets/{ref}/status`, `POST /rm/allotment`, `POST /rm/redemption` and `POST /rm/.../transaction-detail` all → 403 for that same caller; PC retains both `pc.allotment-redemption` mutating routes via its own `edit` grant, and RM/ADMIN retain all four `CLIENT_WRITE` routes via their own `edit` grant on `rm.client-info`; `rg "ALLOTMENT_VIEW|CLIENT_VIEW" api-backend/app/libs/**/router.py` shows neither on a mutating route line.

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal § 4)

```ts
/* ---------- shared enums ---------- */
// Replaces pages-config.ts `AccessLevel = "OPERATE" | "VIEW"` (Goal 2) and
// lib/admin/types.ts `Level = "none" | "view" | "edit"` — one type, one spelling.
// Wire + code use UPPERCASE; the DB column stores the lowercase value (map below).
type AccessLevel = "NONE" | "VIEW" | "EDIT";

type PageId =            // authoritative list = keys of PAGES in pages-config.ts
  | "rm.client-info" | "rm.onboarding-renewal" | "rm.model-subscription" | "rm.request-tickets"
  | "mobo.recon-overview" | "mobo.trade-reconciliation" | "mobo.commission-tracking"
  | "mobo.post-trade-allocation"
  | "pc.model-management" | "pc.allocation-matrix" | "pc.allotment-redemption"
  | "compliance.overview" | "compliance.review"
  | "shared.monthly-reports" | "admin.enroll-user" | "admin.system-config";

type Role = "ADMIN" | "MOBO" | "RM" | "PM" | "PC" | "COMPLIANCE";
type StaffStatus = "ACTIVE" | "INITIATED" | "DEACTIVATED";   // INITIATED is DERIVED — see map

/* ---------- 1. login / me: the caller's own effective access ---------- */
// GET /api/auth/me  and  POST /api/auth/admin/login  → UserOut (extended)
interface UserOut {
  firebase_uid: string;
  email: string | null;
  role: Role | "CLIENT";
  name: string | null;
  grants: Partial<Record<PageId, "VIEW" | "EDIT">>;  // NEW. absent key === NONE.
}                                                    // clients: always {}

/* ---------- 2. staff directory ---------- */
// GET /api/admin/staff → StaffOut[]        (Action.USER_VIEW)
interface StaffOut {
  firebase_uid: string;
  email: string | null;
  name: string | null;
  role: Role;
  department: string | null;
  phone_number: string | null;
  status: StaffStatus;
  last_sign_in_at: string | null;   // ISO-8601 UTC; null ⇒ status is INITIATED
  override_count: number;
  // Handover preview (Backend C-11). Both null for every role except RM — nothing
  // else in the system is owned per-person, so there is nothing else to hand over.
  client_count: number | null;      // clients whose assigned_rm_uid is this user
  open_ticket_count: number | null; // their tickets in an OPEN status (see map)
}

// POST /api/admin/staff → 201 StaffCreatedOut | 409 | 422   (Action.USER_WRITE)
interface StaffEnrollIn {
  email: string;                 // must end @megaannum.ai — server-enforced, 422 otherwise
  first_name: string;
  last_name: string;
  role: Role;
  phone_number?: string | null;
  department?: string | null;
  start_date?: string | null;    // ISO date
  address?: string | null;
  send_link: boolean;            // the wizard's "Email the invitation" checkbox
  overrides?: Array<{ page_id: PageId; level: AccessLevel; reason: string; expires_at: string | null }>;
}
// NOTE: no `password` field, in or out. The identity is created WITHOUT a password
// and the user sets their own via the emailed link. Nothing to display, copy or store.
interface StaffCreatedOut {
  firebase_uid: string;
  email: string;
  role: Role;
  status: StaffStatus;           // always "INITIATED" for a fresh enrollment
  link_sent: boolean;            // false ⇒ send failed or send_link was false; account still created
  override_count: number;
}

// PATCH /api/admin/staff/{uid} → StaffOut | 404 | 409       (Action.USER_WRITE)
interface StaffUpdateIn {        // all optional; omitted = unchanged
  role?: Role; name?: string; email?: string; phone_number?: string | null;
  department?: string | null;
  status?: "ACTIVE" | "DEACTIVATED";     // INITIATED is never settable — it is derived
  deactivate_reason?: string | null;
  // Book handover (C-11). REQUIRED when the target is an RM with client_count > 0 and
  // this patch makes them stop being an active RM — i.e. status: "DEACTIVATED" OR a
  // role other than "RM". Server-validated: a different, ACTIVE, RM-role uid.
  reassign_book_to?: string | null;      // firebase_uid of the receiving RM
}
// 409 "Cannot demote/disable the last active ADMIN"              (existing, unchanged)
// 409 "Reassign this RM's client book before deactivating"        (C-11)
// 409 "Reassign this RM's client book before changing their role" (C-11)
// 422 "reassign_book_to must be an active RM"                     (C-11)

// POST /api/admin/staff/{uid}/set-password-link → LinkSentOut  (Action.USER_WRITE)
// The "Reset password" row action. Body is empty. Idempotent: each call generates a
// fresh Firebase link, which invalidates any earlier unused one.
interface LinkSentOut { link_sent: boolean }

/* ---------- 3. access matrix ---------- */
// GET /api/admin/access/matrix → MatrixOut                  (Action.USER_VIEW)
interface MatrixOut {
  pages: Array<{ page_id: PageId; group: string; label: string; path: string }>;  // server-authored order
  roles: Array<{ code: Role; name: string; user_count: number }>;
  levels: Array<{ page_id: PageId; role: Role; level: "VIEW" | "EDIT" }>;  // NONE cells omitted
  published: { at: string; by: string } | null;
}

// PUT /api/admin/access/matrix → MatrixOut | 409             (Action.USER_WRITE)
// Atomic: all cells applied in one transaction + one audit row, or none.
interface MatrixPublishIn {
  changes: Array<{ page_id: PageId; role: Role; level: AccessLevel }>;  // NONE deletes the row
  note?: string | null;
}
// 409 { detail: "matrix_changed_since_read", published: {at, by} } when If-Unmodified-Since-style
// guard trips: the request MUST carry `base_published_at` matching the server's current value.

/* ---------- 4. per-account overrides ---------- */
// GET /api/admin/access/overrides → OverrideOut[]            (Action.USER_VIEW)
interface OverrideOut {
  id: string;                    // UUID
  firebase_uid: string; user_name: string; user_role: Role;
  page_id: PageId; page_label: string; page_path: string;
  role_default: AccessLevel;     // resolved server-side at read time
  level: AccessLevel;            // the granted level
  reason: string;
  granted_by: string;            // granter's display name
  expires_at: string | null;     // null ⇒ no expiry
  expiring_soon: boolean;        // server-computed: expires_at within 30 days
}
// POST   /api/admin/access/overrides  { firebase_uid, page_id, level, reason, expires_at }
//        → 201 OverrideOut | 409 (one override per (user, page)) | 422 (reason required)
// DELETE /api/admin/access/overrides/{id} → 204               (Action.USER_WRITE)

/* ---------- 5. audit ---------- */
// GET /api/admin/audit?limit=&before= → AuditOut[]           (Action.USER_VIEW)
interface AuditOut { id: string; at: string; actor_name: string; event: string; detail: string }
```

**Field-name ↔ column-name map** (anything not listed is same-named):

| Wire | DB | Note |
|---|---|---|
| `AccessLevel` `"VIEW"`/`"EDIT"` | `page_access.level` enum `('view','edit')` | lowercase in DB, uppercase on the wire. On **this** table `"NONE"` is never stored — it is the absence of a row |
| `AccessLevel` `"NONE"`/`"VIEW"`/`"EDIT"` | `page_access_overrides.level` enum `('none','view','edit')` | **three** values here, deliberately (D-3): a `NONE` override is an active statement ("revoke this page for this one person"), which row-absence cannot express — absence already means "fall back to the role default" |
| `page_id` | `page_access.page_id` `VARCHAR(64)` | the `PageId` literal, e.g. `"pc.allocation-matrix"` |
| `StaffOut.name` | `admin_profiles.name` | `first_name`+`last_name` are joined server-side on enroll; there is one `name` column |
| `StaffOut.department` | `admin_profiles.department` | new column |
| `StaffEnrollIn.start_date` / `.address` | `admin_profiles.start_date` (DATE) / `.address` (TEXT) | new columns — the wizard collects both, so they are persisted, not discarded |
| `StaffOut.status` `"ACTIVE"`/`"DEACTIVATED"` | `users.status` enum `('active','disabled')` | `DEACTIVATED` ↔ `disabled` |
| `StaffOut.status` `"INITIATED"` | *(derived)* | `users.status = 'active' AND users.last_sign_in_at IS NULL` — **no `initiated` enum value is added** |
| `last_sign_in_at` | `users.last_sign_in_at` | new column, written by `login_and_bind` |
| `expiring_soon` | *(derived)* | `expires_at <= NOW() + INTERVAL 30 DAY` |
| `MatrixOut.published` | `page_access_publications.published_at / actor_name` | latest row |
| `AuditOut.event` / `.detail` | `admin_audit_events.event` / `.detail` | free text, display-only |

### 4.2 Per-layer obligations against the seam

| Layer | What this layer contributes | What this layer assumes from the other side |
|---|---|---|
| Database | `page_access`, `page_access_overrides`, `page_access_publications`, `admin_audit_events`; `admin_profiles.{department,start_date,address}`; `users.last_sign_in_at`. Seeds `page_access` with the 55-row matrix in B-1, derived from the System Config catalog's own levels (D-11) — a stated policy, not a copy of today's grants. Uniqueness: `(page_id, role)` and `(user_id, page_id)`. | Backend only ever writes `page_id` values that are `PageId` literals and `level ∈ {view, edit}`; `NONE` arrives as a DELETE, never as a row. |
| Backend | Serves §4.1's 10 admin routes plus the extended `/auth/me` and `/auth/*/login`; resolves effective level = override (unexpired) **else** role standing level; derives the action set from that level via a code-side `PAGE_ACTIONS` map; returns `grants` on `UserOut`; mints passwordless identities and sends the set-password email for both portals. | The four tables and four columns exist with the §4.1 types; the FE never sends `"NONE"` as a stored level and always sends `base_published_at` on `PUT /matrix`. |
| Frontend | Consumes `grants` from login/me into `usePageAccess(pageId)`; gates all 32 marker sites; replaces `AdminStoreContext`'s mock seed with the §4.1 endpoints; keeps staging client-side and publishes one `MatrixPublishIn`. | `grants` is present on every `UserOut` (`{}` for a client); `page_id`/`group`/`label`/`path` in `MatrixOut.pages` are display-ready and ordered — the FE does not re-sort or re-label. |

### 7.2 How this layer honours the seam

- **What this layer contributes to the seam:** all 10 admin routes at their exact paths with the exact DTOs, status codes and error messages of § 7.1 — `GET /api/admin/staff` (BE-16), `POST /api/admin/staff` (BE-17), `PATCH /api/admin/staff/{uid}` (BE-19), `POST /api/admin/staff/{uid}/set-password-link` (BE-18), `GET`/`PUT /api/admin/access/matrix` (BE-8, BE-9), `GET`/`POST /api/admin/access/overrides` + `DELETE /{id}` (BE-10), `GET /api/admin/audit` (BE-11) — plus the extended `GET /api/auth/me` and both `POST /api/auth/{client,admin}/login` carrying `grants` (BE-6). Effective level is resolved as *unexpired override else role standing level* in exactly one function (BE-4); the action set is derived from that level through the code-side `PAGE_ACTIONS` map (BE-2) and enforced by `require_action` (BE-5). Identities are minted passwordless (BE-12) and the set-password email is sent for **both** portals — staff at enrollment (BE-17), clients at Compliance approval (BE-20). `MatrixOut.pages` is emitted display-ready and in a server-authored order, and `client_count`/`open_ticket_count` are `null` for every non-RM role.
- **What this layer assumes from the other side:** the four tables and four columns exist with § 7.1's types and both uniqueness constraints, and `page_access` carries B-1's **55-row seed — 30 `edit` + 25 `view`** (RM 7, MOBO 10, PM 0, PC 10, COMPLIANCE 12, ADMIN 16), which is a **policy statement, not a parity copy** (D-11). The substantive consequence for this layer: **`view` is a normal, common case from the very first request, not an exotic one.** BE-4's precedence logic and BE-5's denial path are exercised by ordinary traffic on day one — 25 seeded cells' worth — so neither may be treated as a rarely-hit branch. (Note D-14: the frontend *hides* mutating controls at `VIEW` rather than disabling them, which means this layer's 403 is a backstop for direct API calls and stale clients rather than something a normal user will ever see. That is a reason to test it deliberately, not a reason to relax it.) The FE never sends `"NONE"` as a stored level (it arrives only inside `MatrixPublishIn.changes`, where the service turns it into a `DELETE`) and always sends `base_published_at` on `PUT /matrix` (a request without it is treated as a stale token, i.e. 409, whenever a publication exists — this layer does not trust the assumption, it enforces it). No sibling code is imported: § 8's tests fake the DB layer's rows against the field map above, never against a sibling branch.
- **Change protocol:** any edit to § 7 requires editing the proposal first; this section is then re-copied. Never edit § 7 in isolation.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Framework / runner:** `pytest` — command: `pytest -q`, run from `api-backend/` with the repo venv (`.\.venv\Scripts\pytest.exe`). Matches `[tool.pytest.ini_options]` (`testpaths = ["app","tests"]`, `python_files = ["test_*.py"]`).
- **Test location:** `api-backend/tests/`, mirroring source paths — `tests/libs/access/`, `tests/libs/auth/`, `tests/libs/identity/`, `tests/libs/staff/`, `tests/libs/onboarding/`. Never co-located with source.
- **Fixtures / seed:** a scratch DB (the same harness the `onboarding`/`client_portal` suites use) with the `0028` tables created, seeded with: B-1's real 55-row `page_access` seed (30 `edit` + 25 `view`) — **not** a synthetic all-`edit` one, so the fixture itself carries a `view` and an `edit` row for the same role (e.g. PC: `pc.model-management` `edit`, `mobo.post-trade-allocation` `view`) and a role with **zero** rows (PM), putting the mixed-level and the "no grants ⇒ deny, no fallback" paths under every test rather than only under their own targeted ones; one ADMIN, one RM holding 3 clients + 2 open and 1 resolved ticket, one RM with an empty book, a second ACTIVE RM (handover receiver), one DEACTIVATED RM, one PC, one COMPLIANCE, one PM; one client whose onboarding is `reviewing` (`initial`) and one `renewal`; one unexpired and one expired override; one `page_access_overrides` row with `level='none'`.
- **Doubles:** `FirebaseIdentityService` and `send_set_password_email` are faked with `unittest.mock` / `monkeypatch` — no test calls real Firebase or Firestore, with the one marked exception below.
- **Isolation:** hermetic, no shared external state, safe to run in parallel. **Exception:** BE-13's deciding integration test (`test_set_password_link_type.py`) talks to a real Firebase project by design; it carries a `@pytest.mark.firebase` marker and is deselected from the default run (`-m "not firebase"`). It is run once, deliberately, as the phase-2 → phase-3 gate, and its outcome is recorded in § 6 BE-13.
- **Layer isolation (critical):** tests import only from `api-backend/app/**` and standard libs. No test imports TypeScript, starts a frontend dev server, or asserts against a sibling branch's file. Where the other side of the seam is needed, it is faked from § 7's shapes: BE-2's `PAGE_IDS == PAGES` check compares against a **checked-in literal list of the 16 ids copied from § 7.1's `PageId` union**, not against `pages-config.ts` on disk (that file belongs to the Frontend layer's tree and its presence is not this layer's assumption).
- **Commit policy:** tests are **never committed** — `tests/` is git-ignored on every layer. They are generated and run locally / in CI as a pre-commit, pre-hand-off gate, never staged.
- **Code generation:** the concrete test code is written by the `test-gen` skill (arg per § 8.4) from the goals below. This doc contains **no test code**.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| BE-1 | All 5 members renamed incl. string values; every guard site still resolves; no `_MANAGE` spelling survives | none |
| BE-2 | 16 page ids matching § 7.1's `PageId` union; `PAGE_ACTIONS` keys == `PAGE_IDS`; per-role day-one action set matches § 6 BE-2's resolved table (not parity — D-11; that table is stated post-BE-22), PC's D-10 delta asserted in both directions (`_VIEW` present, `_RUN` absent) | the FE's `PAGES` key set, as a checked-in literal from § 7.1 |
| BE-3 | Level case fold both ways; expired overrides excluded in SQL; `NONE` stored as row-absence on `page_access`; no commit inside the repository | DB rows per § 7's field map |
| BE-4 | Full precedence table incl. `NONE` override beating `EDIT` role; expired override ignored; unknown `page_id` dropped; empty `page_access` → empty action set; no cache | DB rows |
| BE-5 | **PC × PTA at `view` (the individually-ruled shipping cell, D-10): PTA reads 200, `POST /run` 403** — one of 25 live `view` cells in the seed; plus a synthetic `VIEW` grant behaving the same; un-migrated (empty) table → 403 everywhere; `detail` string byte-identical; `ROLE_ACTIONS` gone | DB rows |
| BE-6 | `grants` present on every `UserOut` incl. `{}` for a client and for PM | DB rows |
| BE-7 | Timestamp written on success only, never on a rejected login, both portals | none |
| BE-8 | Page order == `PAGE_META` order; `NONE` cells omitted; unknown ids dropped; `published: null` on a fresh DB; 403 without `USER_VIEW` | DB rows |
| BE-9 | Atomicity (all-or-nothing); stale `base_published_at` → 409 with the exact detail; `NONE` deletes; publication + audit row written exactly once | DB rows |
| BE-10 | `role_default` reflects the *current* matrix after a publish; duplicate `(user,page)` → 409; blank reason → 422; revoke → 204 | DB rows |
| BE-11 | Newest-first ordering; keyset paging correctness; `actor_name` fallback for a NULL actor | DB rows |
| BE-12 | `create_user` passes no password; both `ensure_identity` callers unchanged in shape; `created` flag still correct | faked `firebase_admin.auth` |
| BE-13 | Rename applied at all 3 call sites; fallback fires on a Firebase rejection and not otherwise; **the marked real-Firebase decider** | faked `auth` (hermetic tests); real Firebase (the one marked test) |
| BE-14 | Exactly one Firestore doc per call with address + link; exception → `False`, never raises; dev bypass logs and returns `True` | faked Firestore client |
| BE-15 | Non-`@megaannum.ai` → 422 with the UI's message, on enroll AND update; `INITIATED` not settable; `invite_link` gone | none |
| BE-16 | Derived status for all three cases; RM counts correct with a resolved ticket excluded; non-RM counts `null`; **exactly one query** (counter-asserted) | DB rows |
| BE-17 | Overrides + department persisted in the same txn; email after commit; `link_sent: false` still 201; compensating delete only when `created` | faked identity + mailer |
| BE-18 | Idempotent fresh links; no credential mutation; 404 on unknown/non-admin | faked identity + mailer |
| BE-19 | Both 409 triggers; 422 receiver classes; open vs closed ticket split; no-op role write exempt; non-RM exempt; **last-active-ADMIN guard not regressed** | DB rows |
| BE-20 | Exactly one email on `initial`, zero on `renewal`; failed send leaves the approval committed; in-txn failure sends nothing | faked identity + mailer |
| BE-21 | Route 404s; `dev_mode` unreadable; production fail-closed still trips on `firebase_auth_disabled` | none |
| BE-22 | RM × `pc.allotment-redemption` at `view` → read 200, both mutating routes 403; COMPLIANCE × `rm.client-info`/`rm.model-subscription` at `view` → reads 200, all **four** `CLIENT_VIEW`-conflated writes (ticket-status, allotment, redemption, transaction-detail) 403; PC keeps both allotment mutations, RM/ADMIN keep all four client-write mutations, each via their own `edit`; grep-style sweep finds `ALLOTMENT_VIEW`/`CLIENT_VIEW` on no mutating route | none |

### 8.3 Test goals (per unit)

#### BE-1
- **Positive:** every `require_action` guard site imports and resolves after the rename; `Action("admin:user_write")` and the other four new values construct.
- **Negative:** no attribute named `*_MANAGE` exists on `Action`; no string value contains `manage`.
- **Invariants:** the member count of `Action` is unchanged (16); every non-renamed member keeps its exact name and value.
- **Seam mocks:** none.

#### BE-2
- **Positive:** `PAGE_IDS` has 16 members equal to § 7.1's `PageId` union; `PAGE_META` preserves its declared order; `PAGE_ACTIONS` keys equal `PAGE_IDS`.
- **Negative:** a page id absent from `PAGE_ACTIONS`, or an action referenced that is not an `Action` member, fails the test rather than being tolerated.
- **Invariants:** for every role, the union of `PAGE_ACTIONS` buckets over that role's seeded cells plus `PAGELESS_ACTIONS` equals **§ 6 BE-2's resolved day-one table** — asserted per role against that table, *not* against the pre-019 `ROLE_ACTIONS` entry, since D-11's seed is deliberately not parity. Two assertions carry the policy: **no role's set loses an action it holds today** (nobody loses a page), and **PM's set is empty** (D-12). PC's D-10 delta is asserted explicitly and in both directions: with `mobo.post-trade-allocation` at `view`, PC's set **contains `POST_TRADE_ALLOCATION_VIEW`** and **does not contain `POST_TRADE_ALLOCATION_RUN`**. The negative half is the load-bearing one — a seed cell drifting to `edit`, or the map's buckets being merged, would hand PC the ability to trigger allocation runs, and only this assertion catches it. Every `Action` member is reachable from some bucket or from `PAGELESS_ACTIONS` — no orphan action.
- **Seam mocks:** the FE's page-id set, as a literal copied from § 7.1.

#### BE-4
- **Positive:** an `EDIT` role level with no override resolves `EDIT`; an unexpired `VIEW` override over an `EDIT` role level resolves `VIEW`; `actions_for` unions correctly across several pages.
- **Negative:** an unexpired `NONE` override over an `EDIT` role level resolves to the page being absent from the map and its actions being absent from the set; an **expired** `NONE` override does not suppress the role level; a `page_access` row for an unknown `page_id` contributes nothing; a client resolves `{}` with zero queries.
- **Invariants:** idempotent and order-independent — repeated calls with unchanged DB state return equal results; `EDIT` ⊇ `VIEW` for every page; no memoisation (a level changed between two calls in the same session is observed by the second call).
- **Seam mocks:** `page_access` / `page_access_overrides` rows built to § 7's field map.

#### BE-5
- **The shipping `VIEW` case (name it explicitly):** PC × `mobo.post-trade-allocation`, seeded `view` per D-10. `GET /api/post-trade-allocation`, `/runs` and `/history` → **200** for a PC caller, while `POST /api/post-trade-allocation/run` → **403**. This is not a synthetic fixture: it is the seed value that ships. It is no longer the *lone* `view` cell either — D-11's seed carries **25** of them, so `VIEW` is live for real users on day one — but it stays the named test case because it is the one cell whose level was ruled on individually (D-10) and the one where a drift to `edit` would hand PC the ability to trigger allocation runs. This test is what proves the level *works end to end* — that a level short of full access actually gates a real endpoint — not merely that the resolver compiles and returns the right set. It is the one BE-5 test whose failure means the whole `NONE|VIEW|EDIT` vocabulary is unproven.
- **Positive:** with `page_access` seeded, a PC caller reaches `PATCH /api/pc/models/{id}` (that cell is `edit`); with a synthetic `view` grant on `pc.model-management`, `GET /api/pc/models` → 200 — kept alongside the PC × PTA pair as the second, hand-constructed `VIEW` case.
- **Negative:** with the synthetic `pc.model-management` cell at `view`, `PATCH /api/pc/models/{id}` → 403; with `page_access` **empty** (un-migrated simulation), every guarded route → 403 for every role including ADMIN — the fail-closed assertion; a user with no `admin_profile` → 403 `"No admin profile"`.
- **Invariants:** the 403 `detail` string is byte-identical to the pre-019 text for the same action; `ROLE_ACTIONS` / `get_actions_for_role` are not importable.
- **Seam mocks:** DB rows.

#### BE-3
- **Positive:** `to_wire`/`from_wire` round-trip all three values; `upsert_level` then `levels_for_role` returns the cell; `insert_audit` then `list_audit` returns it.
- **Negative:** an override whose `expires_at` is in the past is absent from `overrides_for_user`; `delete_level` on a missing cell is a no-op, not an error.
- **Invariants:** no method commits or rolls back (assert by leaving the session dirty and rolling back in the fixture); `count_overrides_by_user` and `list_overrides` agree on totals.
- **Seam mocks:** DB rows.

#### BE-6
- **Positive:** an RM login and `GET /auth/me` both return the RM's granted pages at their effective level.
- **Negative:** a client login returns `grants == {}`, not `null` and not omitted; a PM admin returns `{}`.
- **Invariants:** `grants` is present in every serialisation of `UserOut` produced by the three auth routes; the routes' paths and status codes are unchanged.
- **Seam mocks:** DB rows.

#### BE-7
- **Positive:** a successful admin login advances `users.last_sign_in_at`; a successful client login does the same.
- **Negative:** a login rejected by `assert_can_authenticate` (disabled account, missing profile) leaves the column untouched; a login rejected for the wrong portal likewise.
- **Invariants:** the column is monotonic across successive logins; no other code path writes it.
- **Seam mocks:** none.

#### BE-8
- **Positive:** the response carries 16 pages in `PAGE_META` order, 6 roles with correct `user_count`, the seeded cells, and `published: null` on a fresh DB; after a publish, `published` reflects it.
- **Negative:** a caller without `USER_VIEW` → 403; a stale `page_access` row for an unknown page id does not appear in `levels`.
- **Invariants:** `levels` never contains `"NONE"`; `pages` is stable across calls.
- **Seam mocks:** DB rows.

#### BE-9
- **Positive:** a publish of N cells applies all N, writes exactly one publication and one audit row, and returns the fresh matrix.
- **Negative:** a second publish carrying the first's `base_published_at` → 409 with `detail.detail == "matrix_changed_since_read"` and zero rows changed; an injected failure part-way through applies nothing; an unknown `page_id` in `changes` → 422.
- **Invariants:** atomicity under a forced exception at each of the four write steps; a `NONE` change deletes exactly one row and never inserts one; an empty `changes` list still bumps the token.
- **Seam mocks:** DB rows.

#### BE-10
- **Positive:** grant → listed with `role_default` equal to the current matrix value and `expiring_soon` correct at the 30-day boundary; revoke → 204 and gone.
- **Negative:** duplicate `(user, page)` → 409; blank `reason` → 422; unknown `page_id` → 422; unknown `firebase_uid` → 404; revoking an unknown id → 404.
- **Invariants:** `role_default` is recomputed at read time — publishing a matrix change between two reads changes it, proving it is not a snapshot; an override on an unknown page id is excluded from the listing.
- **Seam mocks:** DB rows.

#### BE-11
- **Positive:** rows return newest-first; each mutation unit's event name appears after exercising it.
- **Negative:** `limit` above 200 → 422; `before` equal to a row's `at` excludes that row.
- **Invariants:** keyset paging over the full set visits every row exactly once, even with an insert between pages; a `NULL` `actor_name` serialises as the fallback display string, never `null`.
- **Seam mocks:** DB rows.

#### BE-12
- **Positive:** `create_user` calls `auth.create_user` with `email` only and returns the uid; `ensure_identity` still returns `(uid, True)` for a new address and `(uid, False)` for an adopted one.
- **Negative:** no code path passes a `password` kwarg; the `firebase_auth_disabled` branch still returns the synthetic `dev-` uid without touching Firebase.
- **Invariants:** both callers (`StaffService.enroll`, `ClientService.onboard`) are unchanged in signature and still receive a 2-tuple.
- **Seam mocks:** faked `firebase_admin.auth`.

#### BE-13
- **Positive:** `generate_set_password_link` returns the reset link when Firebase accepts it; all three call sites use the new name.
- **Negative:** when the faked `auth.generate_password_reset_link` raises the passwordless-account error, the email-link branch is called exactly once and its URL is returned; when it raises something else, that is also handled (fallback, never a 500 out of a provisioning path).
- **Invariants:** the return type and signature are identical in both branches, so no caller branches on the outcome; the dev-bypass URL is unchanged.
- **The marked decider:** one real-Firebase test creates a fresh passwordless identity and records which branch fires. Its outcome is the phase-2 → phase-3 gate and must be written into § 6 BE-13 before the Frontend layer is dispatched.
- **Seam mocks:** faked `auth` for the hermetic cases; nothing mocked in the marked test, by design.

#### BE-14
- **Positive:** one Firestore document is added per call, into the `mail` collection, containing the recipient address and the link; `Portal.ADMIN` and `Portal.CLIENT` produce different wording from the one template.
- **Negative:** a Firestore client that raises yields `False` and no exception escapes — asserted for an exception at `_init_firebase`, at `client()` and at `add()`; `firebase_auth_disabled` logs once at INFO, returns `True`, and touches no Firestore.
- **Invariants:** the function never raises for any input, including an empty link or an odd address; it is called nowhere inside a transaction (asserted by its callers' tests).
- **Seam mocks:** faked `firebase_admin.firestore`.

#### BE-15
- **Positive:** a valid `@megaannum.ai` enroll body validates; `StaffOut` accepts each of the three statuses and `null` handover counts.
- **Negative:** `alice@gmail.com`, `alice@megaannum.ai.evil.com` and `alice@MEGAANNUM.AI.co` → 422 with the UI's message (case-insensitive suffix match must not be fooled by a suffix-lookalike); `status: "INITIATED"` in `StaffUpdateIn` → 422; blank override `reason` → 422.
- **Invariants:** `StaffOut` has no `invite_link` field; `StaffEnrollIn` has no `password` field; the domain rule is applied on both enroll and update.
- **Seam mocks:** none.

#### BE-16
- **Positive:** each seeded user's derived status is correct; the RM with 3 clients and 2 open + 1 resolved ticket reports `3`/`2`; the empty-book RM reports `0`/`0`.
- **Negative:** every non-RM role reports `null`/`null`, not `0`/`0`; a caller without `USER_VIEW` → 403.
- **Invariants:** one query total regardless of directory size (asserted with a query counter at 1 and at 50 users); `count_book` and `list_directory` return the same numbers for the same RM, since they share the open-ticket constant.
- **Seam mocks:** DB rows (`users.last_sign_in_at`, `admin_profiles.department`, `page_access_overrides`).

#### BE-17
- **Positive:** enrolling with `send_link: true` and two overrides creates user + profile (with `department`) + two override rows + one `account.created` audit row in one transaction, then queues exactly one email; the 201 body reports `status: "INITIATED"`, `link_sent: true`, `override_count: 2`.
- **Negative:** a mailer returning `False` still yields 201 with `link_sent: false` and a committed account; `send_link: false` queues nothing and reports `link_sent: false`; a commit failure on a newly-minted identity triggers `delete_user` and leaves zero rows; a commit failure on an **adopted** identity never calls `delete_user`; a non-`megaannum.ai` address never reaches Firebase at all.
- **Invariants:** the email is attempted strictly after the commit — asserted by ordering, not just by outcome; no override row exists if the commit failed.
- **Seam mocks:** faked identity service and mailer.

#### BE-18
- **Positive:** two consecutive calls both return `link_sent: true` and request two distinct links; one audit row per call.
- **Negative:** unknown uid → 404; a client-portal uid → 404; a mailer failure → `link_sent: false` with the audit row still present.
- **Invariants:** `auth.update_user` is never called (asserted on the mock) — an admin cannot lock a user out through this route.
- **Seam mocks:** faked identity service and mailer.

#### BE-19
- **Positive:** deactivating a booked RM with a valid receiver moves all 3 `client_profiles` rows and both open tickets, writes one audit row naming both parties and the counts, and commits once; the same for `PATCH {role: "MOBO"}`.
- **Negative:** the same two patches without `reassign_book_to` → 409 with each trigger's exact message and zero rows changed; a receiver that is inactive, not an RM, not an admin, unknown, or the user being changed → 422 `"reassign_book_to must be an active RM"`; **demoting the last active ADMIN → 409 `"Cannot demote/disable the last active ADMIN"`, evaluated before any handover logic** (the non-regression case).
- **Invariants:** the resolved/declined ticket keeps its original `assigned_rm_uid` in every passing case (018 B-1 preserved); a booked RM patched with `role: "RM"` or with only `name`/`phone_number` needs no receiver; a booked RM being *reactivated* does not un-hand-over; the handover's two `UPDATE`s and the status/role write share one commit (asserted by forcing a failure after the first `UPDATE` and observing zero changes).
- **Seam mocks:** DB rows.

#### BE-20
- **Positive:** approving an `initial` cycle activates the client, writes the `client_events` row, commits, and then queues exactly one `Portal.CLIENT` email carrying the client's own address.
- **Negative:** approving a `renewal` queues zero emails; a mailer returning `False` leaves the approval committed and the DTO unchanged; a failure inside the approval transaction rolls back and queues nothing; approving a cycle not in `reviewing`, or with unverified required docs, still 409s and sends nothing.
- **Invariants:** exactly one email per initial approval — re-approving is already blocked by the existing status guard, so no second send is reachable; the send happens strictly after the commit.
- **Seam mocks:** faked identity service and mailer.

#### BE-21
- **Positive:** the app starts with the `access` router mounted and no `dev` router; `POST /api/dev/register` → 404.
- **Negative:** `Settings` has no `dev_mode` attribute (an `AttributeError`/model-field assertion); importing `app.libs.dev` or `app.schemas.dev` raises `ModuleNotFoundError`.
- **Invariants:** `APP_ENV=production` with `FIREBASE_AUTH_DISABLED=true` still raises at startup — the fail-closed check keeps working with only its surviving half.
- **Seam mocks:** none.

#### BE-22
- **Positive:** with `pc.allotment-redemption` seeded `view` for RM, `GET /pc/allotments` → 200; with `rm.client-info` (and separately `rm.model-subscription`) seeded `view` for COMPLIANCE, every `CLIENT_VIEW`-guarded **read** → 200 (`GET /rm/clients`, `GET /rm/clients/{id}/events`, `GET /rm/subscriptions`, `GET /rm/subscriptions/{id}/allotments`, `GET /rm/allotments/{id}/transaction-detail`); PC with its own `edit` grant on `pc.allotment-redemption` still reaches both `POST /pc/allotments/{id}/acknowledge` and `POST /pc/redemptions/{id}/decide`; RM/ADMIN with their own `edit` grant on `rm.client-info` still reach all four `CLIENT_WRITE` routes.
- **Negative:** the same `view`-only RM caller → `POST /pc/allotments/{id}/acknowledge` and `POST /pc/redemptions/{id}/decide` both 403; the same `view`-only COMPLIANCE caller → **all four** repointed writes 403: `POST /rm/tickets/{ref}/status`, `POST /rm/allotment`, `POST /rm/redemption`, `POST /rm/.../transaction-detail`; a caller holding only `CLIENT_VIEW` (no `CLIENT_WRITE`) cannot reach `PATCH /api/rm/clients` either (existing guard, unaffected — confirms the split didn't loosen the other `CLIENT_WRITE` site); the 016/017 routes specifically re-tested under a `view`-only MOBO/PC caller, since those are the two reopened "accepted as-is" cases, not just the plain-oversight ticket-status one.
- **Invariants (the property, checked mechanically):** a static sweep over every `app/libs/**/router.py` finds `Action.ALLOTMENT_VIEW` and `Action.CLIENT_VIEW` on no `@router.post`/`@router.patch`/`@router.delete` line — the grep-style check named in § 6 BE-22, run across **all five** repointed routes, not just one. `ALLOTMENT_ACKNOWLEDGE`'s own two mutating routes are unaffected by the rename (they still name `ALLOTMENT_ACKNOWLEDGE`, not the new member).
- **Seam mocks:** none.

### 8.4 Aggregate gate
- All unit tests green is a **local gate** run before commit / PR hand-off (§ 3.2). A red test blocks the unit. The tests themselves are never committed (git-ignored `tests/`), so this gate runs on the implementer's / orchestrator's machine, not from repo-committed CI.
- Target coverage for changed lines: **≥ 95%** of new/changed statements in `app/libs/access/**`, `app/libs/auth/deps.py`, `app/libs/identity/**` and `app/libs/staff/**`; ≥ 90% elsewhere in the layer.
- **Chosen `test-gen` level for this layer: `thorough`.** Justification: this is the authorisation component of the whole product — a wrong `PAGE_ACTIONS` cell or a missed precedence branch silently grants or silently revokes access — and it additionally carries a compensating-delete saga (BE-17) and a money-adjacent, irreversible ownership handover (BE-19, which re-points a client book and open tickets and is explicitly not undone on reactivation). Both classes of bug are invisible on the happy path, which is exactly what `lite`/`standard` cover; the edge, boundary and parametrized classes `thorough` adds (expired-vs-unexpired overrides, `NONE`-override precedence, receiver-validation classes, open-vs-terminal ticket split, empty-table fail-closed) are where the risk actually lives.

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] Every § 6 unit (BE-1 … BE-22) committed on `claude/admin-pages-backend-proposal-f0c9fc-be`; each commit left the branch green.
- [ ] § 3.2's gate passes from `api-backend/`: `ruff check . && ruff format --check . && mypy app && pytest -q`.
- [ ] § 8 unit tests all pass at `thorough`; the marked real-Firebase decider (BE-13) has been run once and **its outcome line is written into § 6 BE-13** — the Frontend layer is not dispatched before that.
- [ ] Every § "Dead code purged" backend grep returns nothing: `ROLE_ACTIONS`, `get_actions_for_role`, `12345678`, `dev_mode`, `dev_register`, `invite_link`, `_MANAGE`.
- [ ] A deploy against an un-migrated DB is *asserted* to 403 rather than fall back (BE-5's negative test), and the migration precondition is stated in the PR description.
- [ ] **BE-13's Q-5 outcome `<TODO>` is explicitly exempt from any "no TODOs" check** — it is a slot for a test result, not an unresolved ambiguity, and it is closed by running that test and writing the outcome line. The three original ambiguity TODOs are resolved by the proposal: PC × PTA is seeded `view` (D-10 — `POST_TRADE_ALLOCATION_VIEW` only, **not** `_RUN`; running allocations stays MOBO's), open tickets are `status IN ('new','in_progress')` (§ 4.1 / C-11), and `start_date`/`address` are persisted into the two new `admin_profiles` columns (DB B-4).
- [ ] **BE-22 lands in full** (`ALLOTMENT_VIEW` split; **all four** `CLIENT_VIEW`-conflated writes — `POST /rm/tickets/{ref}/status`, `POST /rm/allotment`, `POST /rm/redemption`, `POST /rm/.../transaction-detail` — repointed onto `CLIENT_WRITE`) — this is what makes "no role gains a write it did not already have" true of the shipped system rather than merely of the map's original intent (C-12/D-16). Two of the four reopen proposal 016/017's explicit "accepted as-is" call, correctly, since D-11 removes the precondition that made accepting them safe. Verified by the grep-style sweep in BE-22's own contract, not left as an open ruling.
- [ ] Day-one access matches § 6 BE-2's resolved table against DB B-1's change list — the standard is **not** "nothing changed" (D-11): every difference is on B-1's table, no role loses a page, PM gains nothing (D-12), no role gains a write it did not already have (subject to the BE-2 ruling above).
- [ ] The PC × `mobo.post-trade-allocation` `VIEW` case passes end to end (PTA reads 200, `POST /run` 403 for PC) — the individually-ruled cell (D-10) and the layer's proof that the `VIEW` level gates a real endpoint, now one of 25 live `view` cells. Confirmed again by a human at the § Execution phase-4 gate.
- [ ] § 7 matches the proposal's frozen seam verbatim — checked against the proposal on the parent branch, **not** against sibling layers' branches.
- [ ] PR opened against `claude/admin-pages-backend-proposal-f0c9fc`; the human owns that merge (standing rule).

**Rollback:** clean at the code level — revert the branch. There is no migration in this layer, so nothing needs a down-step here, and a reverted backend against a still-migrated DB behaves exactly as it did pre-019 (the four new tables simply go unread). Three honest caveats, all from the proposal's § Rollback:

1. **There is one safe order, and it is the same rule in both directions: the code that reads `page_access` must never be live while `page_access` is absent.** Because C-2 left no fallback, there is nothing to "fall back to" in either direction — only an ordering discipline:
   - **Forward:** apply `0028_admin_access_control`, *then* deploy this backend. Deploying the backend first yields 403 for every admin on every guarded route.
   - **Backward:** revert **the backend first**, then downgrade the DB. Downgrading first, while this backend is still live, yields the identical 403 outage.
   Either wrong order is the intended fail-closed behaviour and *also* a full outage of the admin portal — loud and immediate within one page load, recoverable by completing the order, but not something to discover in production. The DB downgrade is a standalone operation only while this layer's code is not deployed.
2. **Accounts provisioned while this code was live are passwordless.** Reverting removes `POST /api/admin/staff/{uid}/set-password-link`, so those users depend on the Firebase console's own reset-password action for a fresh link. Nobody is permanently locked out; the in-app re-send is gone.
3. **Reverting re-introduces `_DEFAULT_PASSWORD`.** Any account provisioned *after* a revert is back on the shared constant `12345678`. **A revert of this branch is a security regression, not a neutral rollback** — pair it with re-applying BE-12 alone.

Nothing in this layer is lossy on its own; the lossy down-step (dropping four tables and four columns, taking every published grant, override, audit row and sign-in time with them) belongs to the DB layer and is a security-relevant event there, not a routine revert.
