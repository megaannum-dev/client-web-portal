# 004 — Authentication Flow Rework · Implementation Details — Backend

> Status: **DRAFT — pending implementation.**
> Implements: proposal `docs/proposals/004-2026-06-11-auth-flow-rework.md` § 4.1–4.12 (design), § 5 (API surface), § 7 (open questions — resolved), § 8 (verification table)
> Layer: Backend — one layer per file.
> Sibling layer docs: `docs/implementations/004-auth-flow-rework-db.md` (Database — status/audit columns + the pure `assert_can_authenticate` gate function this layer wires in)
> **Proposal revision (2026-07-18):** the R4 status model is a single shared two-value `users.status` (`AccountStatus{active, disabled}`) column — **one column on `users`, not per-profile-table** — replacing the original three-value `client_profiles.status` (`pending`/`active`/`disabled`) and separate `admin_profiles.is_active` boolean. New clients are staged `disabled` (not `pending`) by onboarding and must be explicitly activated; new admins are created `active` directly on `users`. `client_profiles`/`admin_profiles` carry no status field at all — role/RM/compliance data only. This doc has been updated throughout (BE-6, BE-9, BE-11–BE-19, BE-23, § 7, § 8) to match the DB layer's `docs/implementations/004-auth-flow-rework-db.md` and the proposal's 2026-07-18 revision.
> Execution schedule: `docs/execution-schedules/004-auth-flow-rework-be.md` (does not exist yet — unit ordering/wave grouping belongs there, not here)
> Branch: `rework-authentication-module-be` — cut from the current branch `rework-authentication-module` (the real parent branch; not a placeholder)
> Builds on / prerequisites: proposals 003 (refactor cleanup) and 005 (UUID keys + portal reorder) already merged — live DB is on Alembic head **`d06ece9f47be`** (`0016_recon_order_fields_and_run_delta_`), confirmed by walking the `down_revision` chain in `api-backend/alembic/versions/` (there is no migration file that lists any *other* file's revision as its own `down_revision`, i.e. `d06ece9f47be` is the only head). The DB layer's new migration (`users.status`, `users.authorized_by`) must be authored on top of this head and applied before this layer's status-gate-wiring unit (BE-9) can be exercised end-to-end — the columns are an upstream precondition, not something this layer creates.

<!-- Internal note (not for the template's benefit — for this doc's own honesty):
     the OLD doc `docs/implementations/004-2026-06-12-auth-flow-rework.md` assumed head
     8f2a1c9d4b6e (migration 0003). Thirteen more migrations have landed since (0004-0016),
     none of them touching users/client_profiles/admin_profiles, so nothing in the design
     is invalidated — only the "builds on" baseline above changes. -->

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/004-2026-06-11-auth-flow-rework.md` § 4 (all subsections), § 5, § 7, § 8 |
| Execution schedule | `docs/execution-schedules/004-auth-flow-rework-be.md` (path reserved, not yet authored) |
| Sibling layer impl docs | `docs/implementations/004-auth-flow-rework-db.md` (Database — provides the schema in § 7.1 below) |
| Builds on | Alembic head `d06ece9f47be` (0016); DB layer's status/audit-column migration (upstream of BE-9 only); proposals 003 + 005 already merged |

---

## 2. Branch & session contract

- **Branch:** `rework-authentication-module-be`, cut from `rework-authentication-module`. All BE-* units in this doc land on this one branch.
- **Isolation:** implementable in a separate session, in parallel with a DB-layer session on `rework-authentication-module-db` and a frontend session on `rework-authentication-module-fe`, provided the preconditions below hold. This layer shares state with the DB layer **only** through the frozen seam in § 7 — it does not import, wait on, or inspect the DB layer's branch.
- **Preconditions (must be true before starting):**
  - [ ] Alembic head is `d06ece9f47be` (0016) on the branch this is cut from.
  - [ ] The DB layer's migration adding `users.status` (the shared `AccountStatus` enum) and `users.authorized_by` is merged (or its ORM column definitions are at least stubbed/mocked in tests) before BE-9 (status-gate wiring) is exercised against a real DB — BE-1 through BE-8 and BE-11 onward do **not** require it to be merged first, since they either don't touch those columns or can be developed against the § 7 frozen seam.
  - [ ] The frozen seam in § 7 is agreed (verbatim copy from the proposal) — not renegotiated with the DB-layer session.
- **Read-first inventory** (every existing file a unit touches):
  - `api-backend/app/libs/auth/router.py` — current `/auth/register`, `/auth/login`, `/auth/me`, `/auth/logout`; BE-5/BE-8 rewrite this.
  - `api-backend/app/libs/auth/service.py` — current `login_or_register` (the create branch BE-6 deletes).
  - `api-backend/app/libs/auth/deps.py` — current `_resolve_user` (auto-create branch BE-7 deletes), `get_current_user`/`get_current_client_user`/`get_current_admin_user`, `require_action`.
  - `api-backend/app/libs/auth/actions.py` — `Action` enum (`USER_VIEW`, `USER_MANAGE`, `CLIENT_VIEW`, `CLIENT_MANAGE`, plus unrelated `MODEL_*`/`ALLOCATION_*`/`POST_TRADE_ALLOCATION_*`/`RECON_VIEW` from later features) and `ROLE_ACTIONS`.
  - `api-backend/app/libs/clients/router.py`, `repository.py`, `service.py`, `schemas.py` — the **existing, live** RM read-only module (`prefix="/rm"`, `GET /clients`, `GET /clients/{id}`). BE-11–BE-14 extend this module; they do not recreate it.
  - `api-backend/app/libs/users/router.py`, `repository.py`, `service.py` — `PATCH /{firebase_uid}/role` (BE-18 removes it), `PATCH /me` (BE-19 extends it), `UserRepository.create_client`/`create_admin` (reused by BE-12/BE-16).
  - `api-backend/app/core/config.py` — `Settings.dev_mode` (currently defaults `True` — the G2 vulnerability), `firebase_auth_disabled`.
  - `api-backend/app/core/security.py` — `_init_firebase`, `verify_firebase_id_token_string`, `verify_firebase_token`, `extract_uid_email`, `set_portal_claims`, `portal_from_claims`. Unchanged by this layer except as consumed.
  - `api-backend/app/schemas/auth.py` — `FirebaseLoginBody` (its `role`/body-trust dies with BE-8/moves to BE-24).
  - `api-backend/app/schemas/users.py` — `UserOut` (frozen, unchanged), `UserSelfUpdate`, `UserUpsert` (retired by BE-18).
  - `api-backend/app/main.py` — router mounts; BE-13/BE-17/BE-24 add mounts (grouped by route branch — internal / client / shared / dev-only per § 4), BE-24 mounts conditionally.
  - `api-backend/app/models/users.py` — `User`, `ClientProfile`, `AdminProfile`, `Portal`, `AdminRole`. This layer does not alter columns (that's the DB layer); it reads the DB layer's added `User.status`/`User.authorized_by` fields once merged. `ClientProfile`/`AdminProfile` carry no status field — this layer never reads `client_profile.status` or `admin_profile.is_active`.
- **Hand-off / exit signal:** all BE-* units committed on `rework-authentication-module-be`; `ruff check . && ruff format --check . && mypy app` green at every commit; `pytest -q` green (once `test-gen` has generated tests from § 8); PR opened against `rework-authentication-module`.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- **Layering:** `router` (HTTP/validation, `require_action` gating) → `service` (business rules, cross-system orchestration, the one transaction boundary) → `repository` (persistence only, no `HTTPException`, no Firebase calls). Matches the existing `app/libs/users/` and `app/libs/clients/` split.
- **Module layout:** `app/libs/<feature>/{router,service,repository}.py` + `app/schemas/<feature>.py`, mounted in `main.py` under `/api`. New modules this layer introduces: `app/libs/identity/`, `app/libs/staff/`, `app/libs/dev/`, `app/cli/`.
- **Value-based enum persistence:** any new enum (e.g. a status enum used in service logic) follows the existing `SAEnum(..., values_callable=lambda enum_cls: [m.value for m in enum_cls])` convention seen on `User.portal` / `AdminProfile.role` — but the enum *definition* and *column* are DB-layer property; this layer only consumes `AccountStatus` values via `User.status` (one column, shared by both portals) once the DB layer defines them.
- **`UserOut` is frozen** (`firebase_uid`, `email`, `role`) — no unit in this layer changes its shape.
- **RBAC is action-based, never role-string-based at the route:** every new mutating route is gated with `require_action(Action.<X>)` from `app/libs/auth/deps.py`; authority is the route, never a request-body field (mirrors the existing `require_action(Action.CLIENT_VIEW)` pattern in `app/libs/clients/router.py`).
- **Coercion convention:** tolerate `str` at the boundary and coerce to the enum member before persistence (see existing "E-2 coercion" comments in `app/libs/users/repository.py`); this layer's new services follow the same pattern for `AdminRole`.

### 3.2 CI/CD & engineering discipline
- **Trunk-friendly, small units.** Each BE-* feature below is one atomic, self-reviewable commit that leaves the branch green.
- **Every unit is independently revertible**; exceptions are called out in that unit's "Dependencies".
- **Additive & backward-compatible first.** BE-11–BE-24 (the new provisioning surfaces) land *before* BE-6/BE-7/BE-8 (the kill-switch that deletes the old create branches) so the branch is deployable at every commit — this ordering detail is stated here only as a dependency fact per unit; the actual merge/wave sequencing is the execution schedule's job, not this doc's.
- **Gates before merge** (verified against the real toolchain in `api-backend/pyproject.toml`, which has `[tool.ruff]`, `[tool.ruff.lint]`, `[tool.pytest.ini_options]`, and `[tool.mypy]` configured — the gate is real, not aspirational):
  ```bash
  ruff check . && ruff format --check . && mypy app && pytest -q
  ```
- **No secrets, no manual steps in the merge path.** The bootstrap CLI run (BE-20/BE-21) and the live-DB migration apply (DB layer) are deploy-time human steps, called out as gates for the execution schedule — never silently baked into a unit here.
- **Reversibility documented** per unit and in § 9.

---

## 4. Architecture

**Target layout:**
```
app/libs/identity/         FirebaseIdentityService — the sole Firebase-identity mutator (NEW)
  service.py                 create_user / ensure_identity / delete_user / get_user_by_email / generate_invite_link
  deps.py                     DI provider, overridable with a fake in tests
  drift.py                    on-demand drift classifier (Recommend-tier, optional — BE-25)

app/libs/auth/              gateway-core (MODIFIED — kill-switch)
  router.py                   split into /api/auth/client/login, /api/auth/admin/login, shared /me, /logout
  service.py                  login_and_bind (replaces login_or_register's create branch)
  deps.py                     _resolve_user binds-only; status-gate wiring; require_action unchanged

app/libs/clients/            RM client onboarding (MODIFIED — EXTENDS existing /rm read-only module)
  repository.py                + create_with_profile / assign_rm / status setters
  service.py                    + ClientService.onboard (assert_is_rm, identity provisioning, saga)
  router.py                     + POST /api/rm/clients (mounts on the existing /rm router, alongside GET /rm/clients)
  schemas.py                    + ClientOnboardIn / ClientOnboardOut

app/libs/staff/              internal-admin enrollment (NEW)
  repository.py                 AdminProfile create/partial-update/count_active_admins
  service.py                    StaffService.enroll / StaffService.update (last-ADMIN TOCTOU guard)
  router.py                     POST /api/admin/staff, PATCH /api/admin/staff/{uid}
  schemas.py                    StaffEnrollIn / StaffUpdateIn / StaffOut

app/libs/users/              (MODIFIED — trim + extend)
  router.py                     PATCH /{firebase_uid}/role REMOVED; PATCH /me extended to name/phone/email
  service.py                     UserService gains update_self(user, patch)

app/libs/client_portal/      ── client-portal route branch (NEW — convention only in 004; modules added
                                by later proposals as client self-service features land)
  (no files in 004)             future examples: GET /api/client/models, POST /api/client/tickets
                                every route gated on get_current_client_user + client-scoped actions,
                                never imports from clients/ (RM-internal) or staff/

app/libs/dev/                dev-only self-registration (NEW, mounted iff dev_mode)
  router.py                     POST /api/dev/register
  service.py                     builds rows via ClientService/StaffService primitives minus identity.create_user

app/cli/                     out-of-band entry points (NEW)
  bootstrap_admin.py            idempotent first-ADMIN + dev-user seed
  identity_drift.py              Recommend-tier CLI wrapper around app/libs/identity/drift.py

app/core/config.py            (MODIFIED) dev_mode default False; app_env; BOOTSTRAP_ADMIN_EMAIL
app/main.py                   (MODIFIED) grouped router mounts (internal / client / shared / dev-only); conditional dev router mount; startup assertion
```

**Dependency direction:** `identity` is a leaf module (no dependency on `clients`/`staff`/`auth`). `clients` and `staff` both depend on `identity` (via its DI provider) and on `auth.actions`/`auth.deps` (for `require_action`), never the reverse. `dev` depends on `clients`/`staff` service primitives (reuse, not duplication) and is the only module gated on a runtime mount condition. `auth` (gateway-core) depends on nothing new introduced here except the DB layer's `assert_can_authenticate` (§ 7) and the existing `users` repository — it must not import `clients`/`staff`/`dev`. Future `client_portal` modules depend on `auth.deps` (`get_current_client_user`, client-scoped `require_action`) and on read-only repositories — they must **never** import from `clients/` (RM-internal), `staff/`, or `dev/`.

**Route-branch convention (two-branch split):** the backend mirrors the two isolated frontend portals. Every HTTP route (except `auth` gateway and `users/me` shared routes) belongs to exactly one branch:

| Branch | Prefix convention | Auth dependency | Audience | Modules (004) |
|---|---|---|---|---|
| **Internal** | `/api/rm/…`, `/api/admin/…` | `get_current_admin_user` + admin-scoped actions | admin-frontend operators (RM, MOBO, ADMIN) | `clients/` (prefix `/rm`), `staff/` (prefix `/admin/staff`) |
| **Client** | `/api/client/…` | `get_current_client_user` + client-scoped actions | client-frontend users | `client_portal/` (convention only in 004 — no routes yet) |
| **Shared** | `/api/auth/…`, `/api/users/…` | portal-scoped login or `get_current_user` | both portals | `auth/`, `users/` |
| **Dev-only** | `/api/dev/…` | unauthenticated (mounted iff `dev_mode`) | local development | `dev/` |

**Isolation rule:** no internal-branch module may be imported by a client-branch module, and vice versa. Shared modules (`auth`, `users`, `identity`) and read-only repositories are the only cross-branch dependencies. This separation is structural (directory + import boundary), not just prefix-based — a client-portal route that needs client-record data reads from its own repository or from a shared read-only query, never by importing `app.libs.clients.*` (which is the RM's write surface into those same tables).

**`main.py` mount grouping (target state after 004):**
```python
# --- Internal (admin-portal) routes ---
app.include_router(clients_router, prefix="/api")    # /api/rm/…
app.include_router(staff_router, prefix="/api")      # /api/admin/staff/…

# --- Client (client-portal) routes ---
# (future proposals mount client_portal routers here, same prefix="/api")

# --- Shared routes ---
app.include_router(auth_router, prefix="/api")       # /api/auth/…
app.include_router(users_router, prefix="/api")      # /api/users/…

# --- Dev-only (mounted iff dev_mode) ---
if get_settings().dev_mode:
    app.include_router(dev_router, prefix="/api")    # /api/dev/…
```
The grouping is enforced by code comments and mount ordering in `main.py` — no framework-level router nesting is introduced (that would be a structural change beyond 004's scope). Later proposals adding client-portal routes drop their `include_router` call into the marked section.

**External seams:** tables read/written — `users`, `client_profiles`, `admin_profiles` (all three existing; the DB layer's new columns are consumed, not created, here). Routes exposed — see § 5's API surface in the proposal; enumerated per-unit in § 6. Sibling-layer contract consumed — the DB layer's `assert_can_authenticate(user, db)` pure function and the three new columns, frozen verbatim in § 7.

---

## 5. Modules

### 5.1 `app/libs/identity/`
- **Responsibility:** the single mechanism in the codebase that creates or deletes Firebase Auth identities (Admin SDK) and generates invite links. No other module may call `firebase_admin.auth.create_user`/`delete_user`/`generate_*_link` directly.
- **Files:** `app/libs/identity/service.py`, `app/libs/identity/deps.py`, `app/libs/identity/drift.py` (Recommend-tier).
- **Public surface:** `FirebaseIdentityService.create_user(email) -> str`, `.ensure_identity(email) -> tuple[str, bool]`, `.delete_user(uid) -> None`, `.get_user_by_email(email) -> str | None`, `.generate_invite_link(email) -> str`; `get_identity_service(settings) -> FirebaseIdentityService` (DI provider).
- **Owns features:** BE-1, BE-2, BE-3, BE-4, BE-25 (optional).

### 5.2 `app/libs/auth/` (gateway-core)
- **Responsibility:** verify Firebase tokens, bind them to an existing local user by uid (never create), apply the per-portal login status gate, expose the portal-scoped login routes + shared `/me`/`/logout`.
- **Files:** `app/libs/auth/router.py`, `app/libs/auth/service.py`, `app/libs/auth/deps.py`, `app/schemas/auth.py`.
- **Public surface:** `login_and_bind(id_token, portal, repo, settings) -> User`; `get_current_user`/`get_current_client_user`/`get_current_admin_user`/`require_action(action)` dependencies (the latter three unchanged in signature, changed in behavior via `_resolve_user`).
- **Owns features:** BE-5, BE-6, BE-7, BE-8, BE-9, BE-10.

### 5.3 `app/libs/clients/` — internal / RM-facing (extended)
- **Responsibility:** **internal-branch** management of client records — the existing RM read-only listing **plus** RM-driven client onboarding (this proposal's new scope). Every route in this module is mounted under prefix `/rm` and gated on admin-portal actions (`CLIENT_VIEW`/`CLIENT_MANAGE`). This module is **not** the client-portal's own route surface; clients never call these routes directly. See § 5.9 for the client-portal branch convention.
- **Files:** `app/libs/clients/repository.py`, `app/libs/clients/service.py`, `app/libs/clients/router.py`, `app/libs/clients/schemas.py` (all four already exist and are extended, not created).
- **Public surface (new):** `ClientRepository.create_with_profile(...)`, `.assign_rm(...)`; `ClientService.assert_is_rm(db, rm_uid)`, `.onboard(...)`; `POST /api/rm/clients`.
- **Import boundary:** future `client_portal` modules must **not** import from this module — they read client data through their own repository or shared read-only queries, never through RM-internal write surfaces.
- **Owns features:** BE-11, BE-12, BE-13, BE-14.

### 5.4 `app/libs/staff/` (new)
- **Responsibility:** the sole production birth path for internal (admin-portal) users, plus the account-mutation split that retires `PATCH /users/{uid}/role`.
- **Files:** `app/libs/staff/repository.py`, `app/libs/staff/service.py`, `app/libs/staff/router.py`, `app/schemas/staff.py`.
- **Public surface:** `StaffService.enroll(...)`, `.update(uid, patch)`; `POST /api/admin/staff`, `PATCH /api/admin/staff/{uid}`.
- **Owns features:** BE-15, BE-16, BE-17.

### 5.5 `app/libs/users/` (modified)
- **Responsibility:** self-service account management (`/me`) only, once `staff` owns admin-account mutation and `PATCH /{uid}/role` is retired.
- **Files:** `app/libs/users/router.py`, `app/libs/users/service.py`, `app/schemas/users.py`.
- **Owns features:** BE-18, BE-19.

### 5.6 `app/cli/` (new, bootstrap only — drift CLI is under identity's ownership)
- **Responsibility:** out-of-band, non-HTTP entry point that seeds the first `ADMIN` (and, under `firebase_auth_disabled`, the `dev-user` admin) when no authority yet exists to call `POST /api/admin/staff`.
- **Files:** `app/cli/bootstrap_admin.py`.
- **Owns features:** BE-20, BE-21.

### 5.7 `app/core/config.py` + `app/main.py` (modified — dev-mode flag)
- **Responsibility:** secure-by-default dev-mode flag with a fail-closed startup assertion; the seam that gates the dev router mount.
- **Owns features:** BE-22.

### 5.8 `app/libs/dev/` (new, mounted iff `dev_mode`)
- **Responsibility:** keeps the legacy "self-register then land on dashboard" UX in dev only, as a third named provisioning surface — never mounted in prod.
- **Files:** `app/libs/dev/router.py`, `app/libs/dev/service.py`, `app/schemas/dev.py`.
- **Owns features:** BE-23, BE-24.

### 5.9 `app/libs/client_portal/` — client-portal route branch (convention only — no files in 004)
- **Responsibility:** the **client-branch** counterpart to the internal modules (`clients/`, `staff/`). Every module under this directory serves the client-frontend portal: client self-service reads (e.g. viewing their own trade models, portfolio summaries) and client-initiated writes (e.g. submitting request tickets). All routes are mounted under prefix `/client` and gated on `get_current_client_user` + client-scoped `Action.*` values.
- **Files (004):** none — this section establishes the convention. Later proposals create `app/libs/client_portal/<feature>/router.py`, `service.py`, `repository.py` per feature, mirroring the per-module layout of the internal branch.
- **Import boundary (enforced from 004 onward):**
  - **MAY** import: `app.libs.auth.deps` (`get_current_client_user`, `require_action`), `app.libs.auth.actions` (client-scoped `Action` values), `app.libs.identity.deps`, shared ORM models, shared read-only repositories.
  - **MUST NOT** import: `app.libs.clients.*` (RM-internal write surface), `app.libs.staff.*`, `app.libs.dev.*`. If a client-portal feature needs to read from `client_profiles` or `users`, it queries through its own repository or a shared read-only query — never through the RM's `ClientRepository`/`ClientService`, which carry RM-specific write methods and authority assertions.
- **Scalability intent:** each client-portal feature (models, tickets, documents, etc.) gets its own sub-module under `client_portal/`, with its own router mounted in `main.py`'s "Client (client-portal) routes" section. The branch grows independently of the internal branch — no merge conflicts, no shared mutable state, no cross-branch imports.
- **Owns features:** none in 004 (convention-only). First consumer is whichever proposal adds client self-service endpoints.

---

## 6. Features

### BE-1 — `FirebaseIdentityService` core (create/delete/lookup/invite) (MANDATORY)

- **Proposal ref:** § 4.7
- **Module:** `app/libs/identity/`
- **Files:** `create: app/libs/identity/service.py`
- **Dependencies:** none — parallel-safe (reuses `app.core.security._init_firebase`)

**Contract:**

```python
# app/libs/identity/service.py
from __future__ import annotations

from firebase_admin import auth

from app.core.config import Settings
from app.core.security import _init_firebase


class FirebaseIdentityService:
    """The ONLY module in the codebase that mutates Firebase Auth identities."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def create_user(self, email: str) -> str:
        """Admin SDK create; returns the new uid. Raises on failure (caller catches)."""
        _init_firebase(self._settings)
        user = auth.create_user(email=email)
        return user.uid

    def get_user_by_email(self, email: str) -> str | None:
        _init_firebase(self._settings)
        try:
            return auth.get_user_by_email(email).uid
        except auth.UserNotFoundError:
            return None

    def delete_user(self, uid: str) -> None:
        """Best-effort compensation. UserNotFoundError is treated as success."""
        _init_firebase(self._settings)
        try:
            auth.delete_user(uid)
        except auth.UserNotFoundError:
            return

    def generate_invite_link(self, email: str) -> str:
        _init_firebase(self._settings)
        return auth.generate_password_reset_link(email)
```

**Behavior / invariants:** raises the underlying `firebase_admin` exception on `create_user` failure (caller — BE-12/BE-16 — decides no-DB-rows-on-failure); `delete_user` never raises for a not-found uid (idempotent compensation primitive).

**Done when:** unit tests (against a faked `auth` module, per § 8) cover create/lookup/delete/invite in isolation, with no other module importing `firebase_admin.auth` for mutation.

---

### BE-2 — `ensure_identity` idempotency primitive (MANDATORY)

- **Proposal ref:** § 4.11 (layer 2 — idempotent provisioning)
- **Module:** `app/libs/identity/`
- **Files:** `modify: app/libs/identity/service.py`
- **Dependencies:** BE-1

**Contract:**

```python
# app/libs/identity/service.py (addition to FirebaseIdentityService)
def ensure_identity(self, email: str) -> tuple[str, bool]:
    """Returns (uid, created). If an identity already exists for `email`
    (a prior failed commit left a class-A orphan), ADOPTS its uid instead
    of creating a new one — `created=False` in that case.

    The `created` flag is load-bearing: it is the ONLY signal that lets a
    caller's compensation step distinguish "this request minted the identity"
    from "this request adopted someone else's" — an adopted identity must
    NEVER be deleted on compensation (Risk A1).
    """
    existing_uid = self.get_user_by_email(email)
    if existing_uid is not None:
        return existing_uid, False
    return self.create_user(email), True
```

**Behavior / invariants:** the `users.firebase_uid` UNIQUE constraint (existing, `app/models/users.py:31`) backstops the concurrent race — if two requests race to adopt the same orphan, the second's local insert fails and its compensation must still respect `created` (it adopted, so it must NOT delete).

**Done when:** unit test proves adopt-path returns `created=False` and does not call `create_user`; create-path returns `created=True`.

---

### BE-3 — Dev/offline stub behavior (MANDATORY)

- **Proposal ref:** § 4.7 ("no-op / stubbed under the dev bypass")
- **Module:** `app/libs/identity/`
- **Files:** `modify: app/libs/identity/service.py`
- **Dependencies:** BE-1, BE-2

**Contract:**

```python
# app/libs/identity/service.py
class FirebaseIdentityService:
    def create_user(self, email: str) -> str:
        if self._settings.firebase_auth_disabled:
            return f"dev-{email}"  # deterministic synthetic uid, no Firebase call
        ...  # BE-1 real path

    def generate_invite_link(self, email: str) -> str:
        if self._settings.firebase_auth_disabled:
            return f"https://dev.invalid/set-password?email={email}"
        ...  # BE-1 real path
```

**Behavior / invariants:** under `firebase_auth_disabled`, no network call to Firebase occurs anywhere in this service — matches the existing `set_portal_claims` no-op pattern in `app/core/security.py:169-183`.

**Done when:** running the full onboarding/enrollment flow with `firebase_auth_disabled=true` and no Firebase credentials configured succeeds end-to-end.

---

### BE-4 — DI provider + fake seam (MANDATORY)

- **Proposal ref:** § 4.7
- **Module:** `app/libs/identity/`
- **Files:** `create: app/libs/identity/deps.py`
- **Dependencies:** BE-1

**Contract:**

```python
# app/libs/identity/deps.py
from typing import Annotated

from fastapi import Depends

from app.core.config import Settings, get_settings
from app.libs.identity.service import FirebaseIdentityService


def get_identity_service(
    settings: Annotated[Settings, Depends(get_settings)],
) -> FirebaseIdentityService:
    return FirebaseIdentityService(settings)
```

**Behavior / invariants:** overridable via `app.dependency_overrides[get_identity_service]` in tests (mirrors the existing `get_user_repo` DI pattern in `app/libs/users/repository.py:74-75`).

**Done when:** `app/libs/clients/router.py` and `app/libs/staff/router.py` (BE-13, BE-17) both inject via this provider — no direct instantiation.

---

### BE-5 — Split portal-scoped auth routes (MANDATORY)

- **Proposal ref:** § 4.1 (Q-A), § 4.3, § 5
- **Module:** `app/libs/auth/`
- **Files:** `modify: app/libs/auth/router.py`
- **Dependencies:** BE-6 (routes call `login_and_bind`, not the old `login_or_register`)

**Contract:**

```python
# app/libs/auth/router.py — replaces the single POST /login (router.py:40-48)
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/client/login", response_model=UserOut)
def client_login(
    body: FirebaseLoginBody,
    settings: Annotated[Settings, Depends(get_settings)],
    repo: Annotated[UserRepository, Depends(get_user_repo)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    return login_and_bind(body.id_token, "client", repo, settings, db)


@router.post("/admin/login", response_model=UserOut)
def admin_login(
    body: FirebaseLoginBody,
    settings: Annotated[Settings, Depends(get_settings)],
    repo: Annotated[UserRepository, Depends(get_user_repo)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    return login_and_bind(body.id_token, "admin", repo, settings, db)


@router.get("/me", response_model=UserOut)
def auth_me(user: Annotated[User, Depends(get_current_user)]) -> User:
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def logout() -> Response:
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

**Behavior / invariants:** portal is now the route, not a body field (R5) — `body.portal` is no longer read by these two routes (kept on `FirebaseLoginBody` only for backward wire-compat with any caller still sending it; ignored). `POST /auth/register` (`router.py:16-37`) and the old unified `POST /auth/login` (`router.py:40-48`) are both removed from this file entirely by this unit — not deprecated in place.

**Done when:** `POST /api/auth/register` → `404`; `POST /api/auth/login` → `404`; `POST /api/auth/client/login` and `POST /api/auth/admin/login` exist and route to `login_and_bind`.

---

### BE-6 — `login_and_bind` replaces `login_or_register` (MANDATORY)

- **Proposal ref:** § 4.3, § 4.6
- **Module:** `app/libs/auth/`
- **Files:** `modify: app/libs/auth/service.py`
- **Dependencies:** BE-9 (calls `assert_can_authenticate`, the DB layer's seam function)

**Contract:**

```python
# app/libs/auth/service.py — replaces login_or_register (service.py:15-59) entirely;
# the whole "if existing is None: ... create_admin/create_client ..." branch (G7) is deleted.
def login_and_bind(
    id_token: str | None,
    portal: PortalKind,
    repo: UserRepository,
    settings: Settings,
    db: Session,
) -> User:
    claims = verify_firebase_id_token_string(id_token, settings)
    uid, email = extract_uid_email(claims, settings)

    existing = repo.get_by_firebase_uid(uid)
    if existing is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No account staged for you")
    if existing.portal.value != portal:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Wrong portal for this account")

    if email and existing.email != email:
        existing = repo.update_email(existing, email)

    if portal_from_claims(claims) is None:
        profile = AdminProfileRepository(repo.db).get_by_user_id(existing.id)
        set_portal_claims(
            existing.firebase_uid,
            existing.portal.value,
            profile.role.value if profile else None,
            settings,
        )

    assert_can_authenticate(existing, db)  # DB-layer seam, § 7 — 403 if not active
    return existing
```

**Behavior / invariants:** no branch of this function ever calls `repo.create_client`/`repo.create_admin`. Unknown uid → `403` (never `404` — do not leak whether an email is staged). Wrong-portal-for-account → `403` (mirrors the existing `get_current_client_user`/`get_current_admin_user` portal gate).

**Done when:** an unknown token against either login route → `403`; a token for an existing `disabled` account → `403` (via `assert_can_authenticate`); a token for an existing `active` account → `200` with `UserOut`.

---

### BE-7 — `_resolve_user` binds only, no auto-create (MANDATORY)

- **Proposal ref:** § 4.3 (G3)
- **Module:** `app/libs/auth/`
- **Files:** `modify: app/libs/auth/deps.py`
- **Dependencies:** BE-20/BE-21 (the bootstrap CLI's dev seed) and BE-24 (`/api/dev/register`) must exist first if the dev-bypass branch below (the `firebase_auth_disabled` auto-create at `deps.py:28-31`) is to be removed without bricking offline dev — see Risk A3 in § 8. This unit's *prod* half (removing the real-token auto-create at `deps.py:36-41`) has no such dependency and may land independently.

**Contract:**

```python
# app/libs/auth/deps.py — replaces _resolve_user (deps.py:16-44)
def _resolve_user(
    claims: Annotated[dict, Depends(verify_firebase_token)],
    db: Annotated[Session, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> User:
    repo = UserRepository(db)

    if settings.firebase_auth_disabled:
        user = repo.get_by_firebase_uid("dev-user")
        if user is None:
            # No auto-create here anymore (Risk A3): dev-user must be seeded by
            # `python -m app.cli.bootstrap_admin` (BE-21) before first use.
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No account staged for you")
        return user

    uid, email = extract_uid_email(claims, settings)
    user = repo.get_by_firebase_uid(uid)
    if user is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No account staged for you")
    if email and user.email != email:
        user = repo.update_email(user, email)
    return user
```

**Behavior / invariants:** a verified-but-unknown token → `403` on **every** authenticated route in the app (this is the single chokepoint all `get_current_user`/`get_current_client_user`/`get_current_admin_user`/`require_action` dependencies route through). No code path in this function inserts a row.

**Done when:** every authenticated route (not just `/auth/*`) returns `403` for an unknown-but-valid token; the `firebase_auth_disabled` path returns `403` until `dev-user` has been seeded by BE-21.

---

### BE-8 — Retire `/auth/register` + prune body-trust (MANDATORY)

- **Proposal ref:** § 4.3, § 5
- **Module:** `app/libs/auth/`
- **Files:** `modify: app/libs/auth/router.py`, `modify: app/schemas/auth.py`
- **Dependencies:** BE-5 (same file, same commit is fine — both are router.py edits)

**Contract:**

```python
# app/schemas/auth.py — FirebaseLoginBody loses `role` (its only reader was
# the deleted /register route); `portal` stays for now (harmless, ignored by
# the new routes — kept only so any stale client payload still parses).
class FirebaseLoginBody(BaseModel):
    id_token: str | None = Field(default=None, ...)
    portal: PortalKind = Field(default="client")
```

**Behavior / invariants:** `must_be_new`/`requested_role` parameters (present on the old `login_or_register` signature, `service.py:15-22`) have no equivalent on `login_and_bind` — they are not carried forward, since creation no longer happens on this path at all.

**Done when:** `POST /api/auth/register` → `404`; `AdminRole` import removed from `app/schemas/auth.py` if no longer referenced.

---

### BE-9 — Wire the status gate into the shared dependencies (MANDATORY)

- **Proposal ref:** § 4.6 (Q-H)
- **Module:** `app/libs/auth/`
- **Files:** `modify: app/libs/auth/deps.py`
- **Dependencies:** the DB layer's migration (adds `users.status`, the shared `AccountStatus` enum) must be merged before this unit is exercised against a real DB — see § 7.2. `assert_can_authenticate` itself (the pure function) is the DB layer's to define and export; this unit only calls it.

**Contract:**

```python
# app/libs/auth/deps.py
from app.libs.auth.status import assert_can_authenticate  # DB-layer seam, § 7


def get_current_client_user(user: Annotated[User, Depends(_resolve_user)]) -> User:
    if user.portal != Portal.CLIENT:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Client portal access only")
    assert_can_authenticate(user, ...)  # runs on EVERY authenticated client request (Q-H)
    return user


def get_current_admin_user(user: Annotated[User, Depends(_resolve_user)]) -> User:
    if user.portal != Portal.ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin portal access only")
    assert_can_authenticate(user, ...)
    return user
```

**Behavior / invariants:** the gate runs on **every** authenticated client/admin request (not only at login) — a client whose status flips to `disabled` mid-session is locked out on the very next call. Per proposal § 4.6: "**Not enforced until the § 6 migration lands**" — this unit's code may merge ahead of the migration, but must not be *activated* (i.e., this import/call wiring) until the DB layer's columns exist, or every request 500s on a missing attribute.

**Done when:** a `disabled` client's authenticated request (post-login, i.e. token already issued) → `403` on the very next call after status is set to non-active; a `disabled` admin's next call → `403`.

---

### BE-10 — Dev-bypass binds-only (gated on BE-24 + a dev seed) (MANDATORY)

- **Proposal ref:** § 4.3 (B3.6 in the prior plan), § 4.12 note on Risk A3
- **Module:** `app/libs/auth/`
- **Files:** `modify: app/libs/auth/deps.py` (same function as BE-7 — listed separately here because it has a **stricter** dependency set)
- **Dependencies:** BE-24 (`POST /api/dev/register` must exist) **and** BE-21 (the bootstrap CLI's dev seed must provision the first `dev-user` admin) — both required, or an offline dev environment has no admin and no way to mint one (Risk A3). This is the same code edit as BE-7's dev-bypass branch; BE-7 is stated as "no-op until this unit's predecessors exist" rather than as two separate diffs.

**Behavior / invariants:** identical to BE-7's `firebase_auth_disabled` branch — restated as its own unit only to carry its own, stricter dependency list for the execution schedule to sequence against.

**Done when:** same as BE-7's dev-bypass acceptance, verified only after BE-21 + BE-24 are both present.

---

### BE-11 — Extend `ClientRepository` with onboarding writes (MANDATORY)

- **Proposal ref:** § 4.4
- **Module:** `app/libs/clients/` (existing module — extend, do not recreate)
- **Files:** `modify: api-backend/app/libs/clients/repository.py`
- **Dependencies:** none — parallel-safe; additive to the existing `ClientRepository` (today: `_base_query`, `_scoped`, `list_visible`, `get_visible`, `list_subscriptions`, `_row` — see `repository.py:48-129`)

**Contract:**

```python
# app/libs/clients/repository.py — new methods on the existing ClientRepository class
def create_with_profile(
    self,
    *,
    user_id: uuid.UUID,
    firebase_uid: str,
    email: str | None,
    name: str | None,
    assigned_rm_uid: str,
    authorized_by: str,
    **profile_fields: str | None,  # primary_phone, address, country_of_residence,
                                    # authorized_person, initiate_method
) -> None:
    """Inserts users(portal=client, status=AccountStatus.DISABLED) + client_profiles(...)
    in the CALLER's transaction (no commit here — the service owns the txn boundary,
    per § 3.1 layering; ClientService.onboard, BE-12, commits once). status is not
    passed explicitly — the column's own default (AccountStatus.DISABLED, per the DB
    layer's DB-1) is what stages new clients as not-yet-activated."""
    user = User(id=user_id, firebase_uid=firebase_uid, email=email, portal=Portal.CLIENT,
                authorized_by=authorized_by)
    self.db.add(user)
    self.db.flush()
    self.db.add(ClientProfile(
        user_id=user.id, name=name, assigned_rm_uid=assigned_rm_uid, **profile_fields,
    ))
```

**Behavior / invariants:** no `commit()` inside this method — unlike today's `UserRepository.create_client` (`users/repository.py:28-35`), which commits internally. `ClientService.onboard` (BE-12) owns the single transaction boundary so the Firebase-create-then-DB-insert saga (§ 4.11) can catch a commit failure and compensate. `User.status`/`User.authorized_by` are the DB layer's columns (§ 7) — this method assumes they exist on the ORM model. `ClientProfile` carries no status field — the account-status gate is entirely a `User`-level concern.

**Done when:** calling this method followed by the caller's own `db.commit()` produces a fully-formed `users` + `client_profiles` row; calling it without a subsequent commit leaves no row (rollback-safe).

---

### BE-12 — `assert_is_rm` + `ClientService.onboard` (MANDATORY)

- **Proposal ref:** § 4.4, § 4.5 (Q-E), § 4.11 (saga + idempotency), § 4.1 (Q-D, claim stamping)
- **Module:** `app/libs/clients/`
- **Files:** `modify: api-backend/app/libs/clients/service.py`
- **Dependencies:** BE-2 (`ensure_identity`), BE-4 (identity DI), BE-11

**Contract:**

```python
# app/libs/clients/service.py — new methods on the existing ClientService class
def assert_is_rm(self, rm_uid: str) -> None:
    user = UserRepository(self.repo.db).get_by_firebase_uid(rm_uid)
    profile = AdminProfileRepository(self.repo.db).get_by_user_id(user.id) if user else None
    if not user or user.portal != Portal.ADMIN or profile is None or profile.role != AdminRole.RM:
        raise HTTPException(422, "assigned_rm_uid must reference an RM")


def onboard(
    self, *, caller_uid: str, email: str, name: str, assigned_rm_uid: str | None,
    identity: FirebaseIdentityService, settings: Settings, **profile_fields: str | None,
) -> tuple[User, str]:  # (staged user row, invite link)
    rm_uid = assigned_rm_uid or caller_uid
    self.assert_is_rm(rm_uid)

    uid, created = identity.ensure_identity(email)
    try:
        self.repo.create_with_profile(
            user_id=uuid.uuid4(), firebase_uid=uid, email=email, name=name,
            assigned_rm_uid=rm_uid, authorized_by=caller_uid, **profile_fields,
        )
        self.repo.db.commit()
    except Exception:
        self.repo.db.rollback()
        if created:  # Risk A1: NEVER delete an identity this call adopted
            identity.delete_user(uid)
        raise

    set_portal_claims(uid, "client", None, settings)  # Risk A4: stamp at provisioning, not first login
    return self.repo.db.query(User).filter(User.firebase_uid == uid).one(), identity.generate_invite_link(email)
```

**Behavior / invariants:** `assert_is_rm` is RM-literal (Q-E) — widening who may onboard is a `require_action`/role-matrix change at the route, never a loosening of this check. Compensation fires **iff `created is True`** (Risk A1). Portal claim is stamped at provisioning time, not deferred to first login (Risk A4, closes the "claimless first login" gap left by removing `login_or_register`'s claim-stamping).

**Done when:** RM onboarding a client with a valid RM target → row created, `user.status='disabled'`, claim stamped, invite link returned; target not an RM → `422`, no rows, no Firebase identity created (if `assert_is_rm` runs before `ensure_identity`, no Firebase call is even made); Firebase create fails → no DB rows; DB commit fails after a **newly created** identity → compensating delete fires; DB commit fails after an **adopted** identity → no delete (idempotent retry succeeds next time).

---

### BE-13 — `POST /api/rm/clients` route (MANDATORY)

- **Proposal ref:** § 4.4, § 5
- **Module:** `app/libs/clients/`
- **Files:** `modify: api-backend/app/libs/clients/router.py`, `modify: api-backend/app/libs/clients/schemas.py`, `modify: api-backend/app/main.py`
- **Dependencies:** BE-12

**Contract:**

```python
# app/libs/clients/schemas.py — new
class ClientOnboardIn(BaseModel):
    email: EmailStr
    name: str
    primary_phone: str | None = None
    address: str | None = None
    country_of_residence: str | None = None
    authorized_person: str | None = None
    initiate_method: str | None = None
    assigned_rm_uid: str | None = None


class ClientOnboardOut(BaseModel):
    firebase_uid: str
    status: str
    invite_link: str


# app/libs/clients/router.py — added to the EXISTING router (router.py:19, prefix="/rm")
@router.post("/clients", response_model=ClientOnboardOut, status_code=201)
def onboard_client(
    body: ClientOnboardIn,
    service: Annotated[ClientService, Depends(_get_service)],
    identity: Annotated[FirebaseIdentityService, Depends(get_identity_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    user: Annotated[User, Depends(require_action(Action.CLIENT_MANAGE))],
) -> ClientOnboardOut:
    staged, link = service.onboard(
        caller_uid=user.firebase_uid, email=body.email, name=body.name,
        assigned_rm_uid=body.assigned_rm_uid, identity=identity, settings=settings,
        primary_phone=body.primary_phone, address=body.address,
        country_of_residence=body.country_of_residence,
        authorized_person=body.authorized_person, initiate_method=body.initiate_method,
    )
    return ClientOnboardOut(firebase_uid=staged.firebase_uid, status=staged.status.value, invite_link=link)
```

**Behavior / invariants:** gated on `Action.CLIENT_MANAGE` — this action already exists (`app/libs/auth/actions.py`, granted to `AdminRole.RM`) and is currently unconsumed by any route ("pre-kept for 004", per its own comment) — this unit is the first consumer. **Resolved (2026-07-17):** the proposal's endpoint is `POST /api/rm/clients`, not `/api/admin/clients` — the existing module's router prefix is `/rm` (`clients/router.py:19`), and this unit mounts the new route on the **same router object** that already carries `GET /rm/clients`, rather than renaming the live prefix (which would break its existing frontend callers) or dual-mounting under a second prefix. The proposal (§4.2, §4.4, §5, §8) has been updated to match.

**Done when:** RM → `201` with invite link; non-RM (e.g. MOBO) → `403` (lacks `CLIENT_MANAGE`).

---

### BE-14 — `assigned_rm_uid` reassignment helper (Recommend)

- **Proposal ref:** § 4.5 ("called by both onboarding and any future 'reassign RM' endpoint")
- **Module:** `app/libs/clients/`
- **Files:** `modify: api-backend/app/libs/clients/repository.py`
- **Dependencies:** BE-12

**Contract:**

```python
# app/libs/clients/repository.py
def assign_rm(self, client_user_id: uuid.UUID, rm_uid: str) -> None:
    profile = self.db.query(ClientProfile).filter(ClientProfile.user_id == client_user_id).one()
    profile.assigned_rm_uid = rm_uid
```

**Behavior / invariants:** no route consumes this in 004 — it exists so `assert_is_rm` has a second caller per the proposal's stated intent, without speculatively building a reassignment endpoint 004 doesn't need.

**Done when:** the method exists and is unit-tested in isolation; no route wired (correctly, per YAGNI — 004 does not require the endpoint).

---

### BE-15 — `StaffService.enroll` (MANDATORY)

- **Proposal ref:** § 4.9, § 4.11, § 4.1 (Q-D/Q-I, Risk A1/A4)
- **Module:** `app/libs/staff/` (new)
- **Files:** `create: app/libs/staff/repository.py`, `create: app/libs/staff/service.py`
- **Dependencies:** BE-2, BE-4

**Contract:**

```python
# app/libs/staff/repository.py
class StaffRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create_with_profile(
        self, *, user_id: uuid.UUID, firebase_uid: str, email: str | None,
        role: AdminRole, authorized_by: str, name: str | None = None,
        phone_number: str | None = None,
    ) -> None:
        # status=ACTIVE is explicit here, not relied on as a default — the column
        # default (DB layer's DB-1) is DISABLED (it exists for new clients); admin
        # enrollment always overrides it, since there is no "pending admin" state.
        user = User(id=user_id, firebase_uid=firebase_uid, email=email,
                    portal=Portal.ADMIN, authorized_by=authorized_by,
                    status=AccountStatus.ACTIVE)
        self.db.add(user)
        self.db.flush()
        self.db.add(AdminProfile(user_id=user.id, role=role,
                                  name=name, phone_number=phone_number))

    def count_active_admins(self, *, for_update: bool = False) -> int:
        q = (
            self.db.query(AdminProfile)
            .join(User, User.id == AdminProfile.user_id)
            .filter(AdminProfile.role == AdminRole.ADMIN, User.status == AccountStatus.ACTIVE)
        )
        if for_update:
            q = q.with_for_update()
        return q.count()


# app/libs/staff/service.py
class StaffService:
    def __init__(self, db: Session) -> None:
        self.repo = StaffRepository(db)

    def enroll(
        self, *, caller_uid: str, email: str, name: str, role: AdminRole,
        phone_number: str | None, identity: FirebaseIdentityService, settings: Settings,
    ) -> tuple[User, str]:
        uid, created = identity.ensure_identity(email)
        try:
            self.repo.create_with_profile(
                user_id=uuid.uuid4(), firebase_uid=uid, email=email, role=role,
                authorized_by=caller_uid, name=name, phone_number=phone_number,
            )
            self.repo.db.commit()
        except Exception:
            self.repo.db.rollback()
            if created:  # Risk A1
                identity.delete_user(uid)
            raise
        set_portal_claims(uid, "admin", role.value, settings)  # Risk A4
        return self.repo.db.query(User).filter(User.firebase_uid == uid).one(), identity.generate_invite_link(email)
```

**Behavior / invariants:** `role == AdminRole.ADMIN` is permitted (Q-I resolved — a super-admin may enroll a peer). No `pending`/staged state for admins — `user.status=AccountStatus.ACTIVE` at creation (explicitly passed, overriding the column's `DISABLED` default), unlike client onboarding which relies on that same default to land `disabled`.

**Done when:** enroll with `role=ADMIN` → a second active ADMIN exists (`user.status='active'`); Firebase-fail → no DB rows; commit-fail on a newly-created identity → compensating delete; commit-fail on an adopted identity → no delete.

---

### BE-16 — `StaffService.update` with last-ADMIN TOCTOU guard (MANDATORY)

- **Proposal ref:** § 4.9, Risk A2
- **Module:** `app/libs/staff/`
- **Files:** `modify: app/libs/staff/repository.py`, `modify: app/libs/staff/service.py`
- **Dependencies:** BE-15

**Contract:**

```python
# app/libs/staff/service.py
def update(self, uid: str, patch: StaffUpdatePatch, settings: Settings) -> User:
    user = UserRepository(self.repo.db).get_by_firebase_uid(uid)
    if user is None:
        raise HTTPException(404, "User not found")
    if user.portal != Portal.ADMIN:
        raise HTTPException(409, "User is not an admin-portal user")

    profile = AdminProfileRepository(self.repo.db).get_by_user_id(user.id)
    demoting_or_disabling = (
        (patch.role is not None and patch.role != AdminRole.ADMIN and profile.role == AdminRole.ADMIN)
        or (patch.status == AccountStatus.DISABLED and user.status == AccountStatus.ACTIVE)
    )
    if demoting_or_disabling:
        # Risk A2: count-and-write MUST be one transaction with SELECT ... FOR UPDATE
        # over the active-ADMIN rows, or two concurrent demotions of DIFFERENT admins
        # each observe count>=2 and both commit -> zero admins.
        active_admins = self.repo.count_active_admins(for_update=True)
        if profile.role == AdminRole.ADMIN and user.status == AccountStatus.ACTIVE and active_admins <= 1:
            self.repo.db.rollback()
            raise HTTPException(409, "Cannot demote/disable the last active ADMIN")

    if patch.role is not None:
        profile.role = patch.role
    if patch.status is not None:
        user.status = patch.status
    if patch.name is not None:
        profile.name = patch.name
    if patch.phone_number is not None:
        profile.phone_number = patch.phone_number
    if patch.email is not None:
        user.email = patch.email  # local contact email only — NOT the Firebase credential

    self.repo.db.commit()
    if patch.role is not None:
        set_portal_claims(uid, "admin", patch.role.value, settings)
    self.repo.db.refresh(user)
    return user
```

**Behavior / invariants:** the `SELECT ... FOR UPDATE` must be issued **inside the same DB transaction** that performs the write — `count_active_admins` (BE-15) now joins `AdminProfile` to `User` (status moved off `AdminProfile`), so the lock spans both tables' rows for the duration; this is what closes Risk A2 (two concurrent demotions of *different* admins each seeing `count==2` and both committing, leaving zero admins). `status` lives on `User`, not `AdminProfile` — `StaffUpdateIn.status` (BE-17) is applied to `user.status`, not `profile.is_active` (retired). `email` edits are local-only (per proposal § 4.9 note) — they never call `identity.*`.

**Done when:** demoting/disabling the sole active ADMIN → `409`; a simulated concurrent demotion of two *different* ADMINs (both starting from count=2) results in exactly one succeeding and one `409` — never both succeeding; unknown uid → `404`; client-portal target → `409`.

---

### BE-17 — Staff router: enroll + update (MANDATORY)

- **Proposal ref:** § 4.9, § 5
- **Module:** `app/libs/staff/`
- **Files:** `create: app/libs/staff/router.py`, `create: app/schemas/staff.py`, `modify: app/main.py`
- **Dependencies:** BE-15, BE-16

**Contract:**

```python
# app/schemas/staff.py
class StaffEnrollIn(BaseModel):
    email: EmailStr
    name: str
    role: AdminRole
    phone_number: str | None = None


class StaffUpdateIn(BaseModel):
    role: AdminRole | None = None
    status: AccountStatus | None = None
    name: str | None = None
    phone_number: str | None = None
    email: EmailStr | None = None


class StaffOut(BaseModel):
    firebase_uid: str
    role: str
    status: str
    invite_link: str | None = None


# app/libs/staff/router.py
router = APIRouter(prefix="/admin/staff", tags=["staff"])


@router.post("", response_model=StaffOut, status_code=201)
def enroll_staff(
    body: StaffEnrollIn,
    service: Annotated[StaffService, Depends(_get_service)],
    identity: Annotated[FirebaseIdentityService, Depends(get_identity_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    user: Annotated[User, Depends(require_action(Action.USER_MANAGE))],
) -> StaffOut: ...


@router.patch("/{uid}", response_model=StaffOut)
def update_staff(
    uid: str,
    body: StaffUpdateIn,
    service: Annotated[StaffService, Depends(_get_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    _: Annotated[User, Depends(require_action(Action.USER_MANAGE))],
) -> StaffOut: ...
```

**Behavior / invariants:** both routes gated `Action.USER_MANAGE` (existing action, currently only consumed by the route BE-18 removes). Mounted at `/api/admin/staff` per proposal § 5 — this module is new, so (unlike BE-13) there is no existing-prefix conflict to reconcile.

**Done when:** `POST /api/admin/staff` → `201` for a super-admin caller, `403` for e.g. an RM; `PATCH /api/admin/staff/{uid}` → `200` with partial update + claim re-stamp on role change.

---

### BE-18 — Remove `PATCH /users/{uid}/role` (MANDATORY)

- **Proposal ref:** § 4.9, § 5 ("REMOVED: PATCH /api/users/{uid}/role")
- **Module:** `app/libs/users/`
- **Files:** `modify: api-backend/app/libs/users/router.py`
- **Dependencies:** BE-16 (its logic is folded into `StaffService.update`)

**Contract:**

```python
# app/libs/users/router.py — DELETE this entire route (router.py:45-69):
# @router.patch("/{firebase_uid}/role", ...)
# def update_user_role(...): ...
```

**Behavior / invariants:** `UserUpsert` schema (`app/schemas/users.py:20-22`) becomes unused by this router once removed — retire it if BE-17's `StaffUpdateIn` fully replaces its role, or leave it only if some other caller still references it (grep before deleting).

**Done when:** `PATCH /api/users/{firebase_uid}/role` → `404` (route gone); its logic is provably reachable via `PATCH /api/admin/staff/{uid}` (BE-17) instead.

---

### BE-19 — Extend `PATCH /users/me` to benign fields only (MANDATORY)

- **Proposal ref:** § 4.9 ("self-service, own BENIGN fields only")
- **Module:** `app/libs/users/`
- **Files:** `modify: app/libs/users/router.py`, `modify: app/libs/users/service.py`, `modify: app/schemas/users.py`
- **Dependencies:** none

**Contract:**

```python
# app/schemas/users.py
class UserSelfUpdate(BaseModel):
    name: str | None = None
    phone_number: str | None = None
    email: EmailStr | None = None
    # role / status deliberately absent — never accepted from this endpoint,
    # not merely ignored: adding them to the model would silently start accepting
    # (and Pydantic-validating) fields this endpoint must always reject.


# app/libs/users/service.py
def update_self(self, user: User, patch: UserSelfUpdate) -> User:
    if patch.email is not None:
        user = self.repo.update_email(user, str(patch.email))
    # name/phone_number: profile fields, written to admin_profiles or
    # client_profiles depending on user.portal — repository method TBD by
    # whichever profile-write helper BE-15/BE-11 introduce; reuse, don't duplicate.
    return user
```

**Behavior / invariants:** today's `update_me` (`users/router.py:34-42`) only ever handled `email`; this unit extends it to `name`/`phone_number` while explicitly excluding `role`/`status` at the schema level (not just the handler level) — a body containing `role` is rejected by FastAPI/Pydantic at request parsing (`extra="forbid"` or simply absent field, per project convention) rather than silently dropped, whichever this codebase's existing schemas do (check `UserSelfUpdate`'s current `model_config`, none set today — inherits `BaseModel` default of ignoring unknown fields; document this in the PR since it means an internal user sending `{"role": "ADMIN"}` to `/me` gets a `200` with the role silently unchanged, not a `422` — matches proposal § 8's expectation "those fields ignored/rejected").

**Done when:** `PATCH /api/users/me {"name": "...", "phone_number": "..."}` → `200`, fields updated; `PATCH /api/users/me {"role": "ADMIN"}` → `200`, role unchanged (field ignored, self cannot promote).

---

### BE-20 — Bootstrap CLI settings (MANDATORY)

- **Proposal ref:** § 4.10
- **Module:** `app/cli/`
- **Files:** `modify: api-backend/app/core/config.py`
- **Dependencies:** none

**Contract:**

```python
# app/core/config.py — new fields on Settings
bootstrap_admin_email: str | None = None
bootstrap_admin_name: str = "Bootstrap Admin"
```

**Behavior / invariants:** read via the existing `pydantic_settings` env-file precedence (`.env` / OS env), same as every other `Settings` field.

**Done when:** `BOOTSTRAP_ADMIN_EMAIL` env var is readable via `get_settings().bootstrap_admin_email`.

---

### BE-21 — Idempotent bootstrap seed (incl. dev-user) (MANDATORY)

- **Proposal ref:** § 4.10, Risk A3
- **Module:** `app/cli/`
- **Files:** `create: app/cli/bootstrap_admin.py`
- **Dependencies:** BE-15 (reuses `StaffRepository.create_with_profile`/`count_active_admins`), BE-20

**Contract:**

```python
# app/cli/bootstrap_admin.py — run as `python -m app.cli.bootstrap_admin`
def run() -> None:
    settings = get_settings()
    db = SessionLocal()
    try:
        staff_repo = StaffRepository(db)
        if staff_repo.count_active_admins() > 0:
            print("Bootstrap: an ADMIN already exists, no-op.")
            return

        identity = FirebaseIdentityService(settings)
        if settings.firebase_auth_disabled:
            # Risk A3: seed the dev-user admin the removed deps.py auto-create used
            # to manufacture, so offline dev keeps a working admin once BE-7/BE-10 land.
            uid = "dev-user"
        else:
            if not settings.bootstrap_admin_email:
                raise SystemExit("BOOTSTRAP_ADMIN_EMAIL is not set.")
            uid, _created = identity.ensure_identity(settings.bootstrap_admin_email)

        staff_repo.create_with_profile(
            user_id=uuid.uuid4(), firebase_uid=uid,
            email=settings.bootstrap_admin_email or "dev@example.com",
            role=AdminRole.ADMIN, authorized_by=None,  # NULL: no authorizer for the root admin
            name=settings.bootstrap_admin_name,
        )
        db.commit()
        link = identity.generate_invite_link(settings.bootstrap_admin_email or "dev@example.com")
        print(f"Bootstrap: seeded first ADMIN ({uid}). Invite link: {link}")
    finally:
        db.close()


if __name__ == "__main__":
    run()
```

**Behavior / invariants:** idempotent — re-running when an ADMIN already exists is a no-op, not an error. `authorized_by=NULL` for the bootstrap row (no authorizing actor exists yet — matches the DB layer's backfill convention for pre-rework rows). Not an HTTP route (no authority exists yet to gate one).

**Done when:** run against an empty Firebase project + empty `users` table → exactly one ADMIN seeded (identity + rows + link printed); re-run → no-op, no duplicate; run with `firebase_auth_disabled=true` → seeds `dev-user` admin, unblocking BE-7/BE-10's dev-bypass.

---

### BE-22 — Dev-mode secure default + fail-closed startup assertion (MANDATORY)

- **Proposal ref:** § 4.8 (R7, G2) — the fast-track, standalone P0 sub-step
- **Module:** `app/core/config.py` / `app/main.py`
- **Files:** `modify: api-backend/app/core/config.py`, `modify: api-backend/app/main.py`
- **Dependencies:** none — parallel-safe, zero dependencies, may land ahead of everything else in this doc

**Contract:**

```python
# app/core/config.py — flips the line at config.py:20
dev_mode: bool = False  # was: True (G2 — secure-by-default fix)
app_env: str = "development"


# app/main.py — added to the lifespan/startup path
@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    if settings.app_env == "production" and (settings.dev_mode or settings.firebase_auth_disabled):
        raise RuntimeError(
            "Fail-closed: dev_mode/firebase_auth_disabled cannot be enabled when APP_ENV=production."
        )
    Base.metadata.create_all(bind=engine)
    ...
```

**Behavior / invariants:** app-layer assertion, launch-independent — it fires regardless of which compose file or bare `uvicorn` invocation started the process, unlike the current situation where the only guard (`not settings.dev_mode` on `/register`, `router.py:22`) is bypassable by anything upstream of that one route.

**Done when:** `APP_ENV=production` + `DEV_MODE=true` (or `FIREBASE_AUTH_DISABLED=true`) → app refuses to boot (raises before serving traffic); `APP_ENV=production` with both off → boots normally; default config (no env vars set) → `dev_mode=False` (was `True`).

---

### BE-23 — Dev-only self-registration service (MANDATORY)

- **Proposal ref:** § 4.12
- **Module:** `app/libs/dev/` (new)
- **Files:** `create: app/libs/dev/service.py`, `create: app/schemas/dev.py`
- **Dependencies:** BE-12 (`ClientService` primitives), BE-15 (`StaffService`/`StaffRepository` primitives)

**Contract:**

```python
# app/schemas/dev.py
class DevRegisterIn(BaseModel):
    id_token: str
    portal: PortalKind
    role: AdminRole | None = None  # trusted for admin portal in DEV ONLY


# app/libs/dev/service.py
def dev_register(body: DevRegisterIn, db: Session, settings: Settings) -> User:
    claims = verify_firebase_id_token_string(body.id_token, settings)
    uid, email = extract_uid_email(claims, settings)

    if UserRepository(db).get_by_firebase_uid(uid) is not None:
        raise HTTPException(409, "Already registered")

    # Builds rows via the SAME ClientService/StaffService primitives as real
    # onboarding, MINUS identity.create_user (the frontend already minted the
    # identity via the client SDK) — dev convenience: dashboard-ready immediately.
    if body.portal == "client":
        ClientRepository(db).create_with_profile(
            user_id=uuid.uuid4(), firebase_uid=uid, email=email, name=email or uid,
            assigned_rm_uid=uid, authorized_by=uid,  # dev: self-authorized, no real RM
        )
        # dev convenience: flip to ACTIVE immediately — BE-11's create_with_profile
        # relies on the column default (DISABLED) for real onboarding, but dev
        # self-reg skips the activation step entirely (no compliance review in dev).
        UserRepository(db).get_by_firebase_uid(uid).status = AccountStatus.ACTIVE
    else:
        StaffRepository(db).create_with_profile(
            user_id=uuid.uuid4(), firebase_uid=uid, email=email, name=email or uid,
            role=body.role or AdminRole.ADMIN, authorized_by=uid,
        )
    db.commit()
    set_portal_claims(uid, body.portal, (body.role.value if body.role else None), settings)
    return UserRepository(db).get_by_firebase_uid(uid)
```

**Behavior / invariants:** must-be-new semantics (`409` if a row already exists for this uid) — matches proposal § 4.12's table. Dev convenience: `user.status='active'` at creation for **both** portals — admins already land `active` via `StaffRepository.create_with_profile`'s explicit override (BE-15); clients need an explicit post-create flip here, since `ClientRepository.create_with_profile` (BE-11) relies on the column's `DISABLED` default for real onboarding and dev self-reg has no compliance-review step to wait for. No `identity.create_user`/`ensure_identity` call anywhere in this function — the frontend already minted the Firebase identity via the client SDK before calling this endpoint.

**Done when:** a fresh frontend-minted token → `201`, fully-formed active row, no re-login required; re-`POST` for the same uid → `409`.

---

### BE-24 — `POST /api/dev/register` route, mounted iff `dev_mode` (MANDATORY)

- **Proposal ref:** § 4.12
- **Module:** `app/libs/dev/`
- **Files:** `create: app/libs/dev/router.py`, `modify: api-backend/app/main.py`
- **Dependencies:** BE-23, BE-22 (reads `settings.dev_mode` to decide the mount)

**Contract:**

```python
# app/libs/dev/router.py
router = APIRouter(prefix="/dev", tags=["dev"])


@router.post("/register", response_model=UserOut, status_code=201)
def register(body: DevRegisterIn, db: Annotated[Session, Depends(get_db)],
             settings: Annotated[Settings, Depends(get_settings)]) -> User:
    return dev_register(body, db, settings)


# app/main.py — grouped mounts per the route-branch convention (§ 4)
# --- Internal (admin-portal) routes ---
app.include_router(clients_router, prefix="/api")    # /api/rm/…  (existing, unchanged)
app.include_router(staff_router, prefix="/api")      # /api/admin/staff/…  (BE-17)

# --- Client (client-portal) routes ---
# (future proposals mount client_portal routers here)

# --- Shared routes ---
app.include_router(auth_router, prefix="/api")       # /api/auth/…  (existing, modified by BE-5)
app.include_router(users_router, prefix="/api")      # /api/users/…  (existing)

# --- Dev-only (CONDITIONAL mount, not a runtime `if` inside a mounted route) ---
if get_settings().dev_mode:
    from app.libs.dev.router import router as dev_router
    app.include_router(dev_router, prefix="/api")    # /api/dev/…
```

**Behavior / invariants:** the module is **physically absent** from the route table when `dev_mode` is off (a 404 from FastAPI's router, not a guarded `403` inside a mounted handler) — matches proposal § 4.12's "unreachable in prod (module unmounted + fail-closed assertion, not a runtime `if`)".

**Done when:** `dev_mode=true` → `POST /api/dev/register` reachable; `dev_mode=false` → `404` (route doesn't exist in the OpenAPI schema either).

---

### BE-25 — On-demand identity-drift report (Recommend)

- **Proposal ref:** § 4.11 point 3 ("On-demand drift report", **not** a scheduled sweep — downgraded from the earlier plan's heavyweight quarantine-before-delete sweep)
- **Module:** `app/libs/identity/` (classifier) + `app/cli/` (entrypoint)
- **Files:** `create: app/libs/identity/drift.py`, `create: app/cli/identity_drift.py`
- **Dependencies:** BE-1, BE-2 — otherwise standalone; explicitly **not** required for the core deliverable (§ 9 Definition of Done does not gate on this unit)

**Contract:**

```python
# app/libs/identity/drift.py
class DriftClass(str, enum.Enum):
    A_FIREBASE_ORPHAN = "A"      # Firebase identity, no users row
    B_MISSING_CREDENTIAL = "B"   # users+profile row, no Firebase identity
    C_INCOMPLETE_RECORD = "C"    # Firebase identity + users row, no profile row


@dataclass(frozen=True)
class DriftFinding:
    email: str
    uid: str | None
    drift_class: DriftClass


def classify(db: Session, identity: FirebaseIdentityService) -> list[DriftFinding]:
    """Read-only. Enumerates Firebase identities vs `users` rows."""
    ...


def fix(db: Session, identity: FirebaseIdentityService, findings: list[DriftFinding],
        *, orphan_age_hours: int = 24) -> None:
    """Class A past `orphan_age_hours` -> delete directly (no staging step — an
    orphan is already unreachable without a users row, per § 4.11). Class B/C:
    ALWAYS report-only, never auto-completed — the missing data carries
    authority context this tool cannot infer."""
    ...


# app/cli/identity_drift.py — python -m app.cli.identity_drift [--fix] [--orphan-age-hours N]
```

**Behavior / invariants:** a manual/on-demand tool, never a scheduler — no cron, no leader election, no quarantine/`disabled`-staging step (the old plan's heavier design). `--fix` only ever deletes class-A orphans past the age cutoff; class B/C are always surfaced for a human operator, never auto-touched.

**Done when:** classifier correctly buckets a synthetic fixture set into A/B/C against a faked identity service; `--fix` deletes only aged class-A rows; running with no `--fix` is fully read-only.

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal § 4.6 and § 6, as revised 2026-07-18)

```python
def assert_can_authenticate(user, db) -> None:
    if user.status != AccountStatus.ACTIVE:
        raise HTTPException(403, "Account disabled")            # not yet activated | suspended
    if user.portal == Portal.CLIENT:
        if user.client_profile is None:
            raise HTTPException(403, "Account disabled")        # incomplete record (§4.11 class C)
    else:  # ADMIN
        if user.admin_profile is None:
            raise HTTPException(403, "Account disabled")        # incomplete record (§4.11 class C)
```

```
R4 schema change (columns the DB layer adds, verbatim from proposal § 6, revised 2026-07-18):
  - users.status         (enum/string; shared AccountStatus: `active` | `disabled`;
                           default `disabled`) -- ONE column on users, shared by both
                           portals, not a per-profile-table column. client_profiles
                           and admin_profiles get no status field.
  - users.authorized_by   (audit trail): nullable FK -> users.firebase_uid recording
                           who authorised this account -- the onboarding RM for a
                           client, the enrolling super-admin for an internal user,
                           NULL for the bootstrap ADMIN and pre-rework rows.
  Column placement: both new columns are added BEFORE the two timestamp columns
  (created_at, updated_at) on users, to match the established layout.
```

### 7.2 How this layer honours the seam
- **What this layer contributes to the seam:** calls `assert_can_authenticate(user, db)` from the shared `get_current_client_user`/`get_current_admin_user` dependencies (BE-9) and from `login_and_bind` (BE-6) — it never redefines or reimplements the function; it consumes it from wherever the DB layer exports it (`app.libs.auth.status.assert_can_authenticate`, per the DB layer's impl doc `004-auth-flow-rework-db.md` § 5.3/§ 6).
- **What this layer assumes from the other side:** before BE-9 is exercised against a real database, `users.status` and `users.authorized_by` must exist with the stated types/defaults, and the DB layer's migration backfill must have run (all existing users → `status='active'`, all existing rows → `authorized_by=NULL`) so that no currently-migrated user is locked out the moment the gate activates. This layer's own units read/write `user.status` directly — never `client_profile.status` or `admin_profile.is_active`, neither of which exist. This layer's own tests fake `assert_can_authenticate` (per § 8) precisely so BE-1 through BE-8 and BE-11 through BE-25 can be developed and tested without the DB layer's migration being merged yet — only BE-9's *integration* exercise needs the real columns.
- **Change protocol:** any edit to § 7 requires editing the proposal first; this section is then re-copied. Never edit § 7 in isolation from the proposal.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Framework / runner:** pytest — confirmed configured via `api-backend/pyproject.toml`'s `[tool.pytest.ini_options]` (`testpaths = ["app", "tests"]`). Command: `pytest -q`.
- **Fixtures / seed:** a real pytest suite already exists under `api-backend/tests/` (e.g. `tests/libs/reconciliation/`, `tests/libs/post_trade_allocation/`, `tests/models/`) — this is not a from-scratch harness. What's missing, and what this layer's units need `test-gen` to add, are auth-flow-specific fixtures: a `FakeFirebaseIdentityService` test double (deterministic uids, in-memory identity set, `create`/`already-exists`/`delete` semantics matching the real `FirebaseIdentityService`'s surface) and seed factories for RM/ADMIN/client rows at a given status. `tests/libs/auth/test_be4_pta_actions.py` already exists but is **not** an auth-flow test — its docstring states it was generated from proposal 011 (post-trade-allocation) §BE-4 and only covers the `Action` enum's MOBO/PTA grants; it happens to live under `tests/libs/auth/` because it edits `app/libs/auth/actions.py` in place. New BE-* tests for this doc add further files under `tests/libs/auth/`, `tests/libs/identity/`, `tests/libs/clients/`, `tests/libs/staff/`, `tests/libs/dev/`, `tests/cli/` alongside it — they do not replace it.
- **Isolation:** hermetic, parallel-safe — an in-memory SQLite engine via `Base.metadata.create_all` (existing convention, see `tests/models/conftest.py`), no shared external state, no real Firebase calls (the fake identity service, above).
- **Layer isolation (critical):** these tests import only from `api-backend/app/` and test doubles. `assert_can_authenticate` (§ 7) is faked with a bare stub (`lambda user, db: None` for the "active" case, `lambda user, db: (_ for _ in ()).throw(HTTPException(403))` for the "not active" case) rather than importing the DB layer's real implementation — the DB layer's branch is not visible here.
- **Test location:** `api-backend/tests/`, mirroring source path (e.g. `app/libs/identity/service.py` → `tests/libs/identity/test_*.py`).
- **Commit policy:** tests are never committed — `tests/` behaves as a local/CI-only, git-ignored working set for this feature, consistent with the template's stated policy for every layer.
- **Code generation:** concrete test code for every unit below is written by the `test-gen` skill from these goals — this doc states goals only.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| BE-1 | create/lookup/delete/invite against a faked `auth` module | none (identity is the seam's provider, not consumer, here) |
| BE-2 | adopt vs. create branch of `ensure_identity`, `created` flag correctness | none |
| BE-3 | dev-stub returns deterministic values, makes no network call | none |
| BE-4 | DI provider overridable with the fake | none |
| BE-5 | old routes 404, new routes exist and delegate correctly | none |
| BE-6 | unknown uid → 403; wrong portal → 403; active user → 200; no create branch reachable | `assert_can_authenticate` faked as pass-through |
| BE-7 | every authenticated route 403s an unknown token; no row inserted | none |
| BE-8 | `/register` 404; `role` no longer read from `FirebaseLoginBody` | none |
| BE-9 | gate runs on every request, not just login; disabled mid-session locks out next call | `assert_can_authenticate` faked both ways (pass / raise) |
| BE-10 | dev-bypass binds only, once its predecessors exist | none |
| BE-11 | insert without commit is rollback-safe; full insert produces both rows | none |
| BE-12 | RM-valid onboard succeeds; non-RM target 422; Firebase-fail → no rows; commit-fail(created) → compensating delete; commit-fail(adopted) → no delete; claim stamped | fake identity service |
| BE-13 | RM caller 201; non-RM 403 | fake identity service |
| BE-14 | reassignment method updates `assigned_rm_uid` in isolation | none |
| BE-15 | enroll succeeds incl. `role=ADMIN`; Firebase-fail/commit-fail parity with BE-12 | fake identity service |
| BE-16 | last-ADMIN demote/disable 409; concurrent-demotion-of-different-admins race resolves to exactly one 409; unknown/client-target 404/409 | none (pure DB-layer concurrency test against SQLite/threaded session) |
| BE-17 | enroll/update routes gate on `USER_MANAGE`; non-super-admin 403 | fake identity service |
| BE-18 | old role route 404; equivalent behavior reachable via staff PATCH | none |
| BE-19 | benign fields update; role/status in body ignored, no promotion | none |
| BE-20 | env var readable via Settings | none |
| BE-21 | empty-state seeds one ADMIN; re-run no-op; dev seed produces `dev-user` under `firebase_auth_disabled` | fake identity service |
| BE-22 | prod+bypass → refuses to boot; prod without bypass → boots; default `dev_mode` is False | none |
| BE-23 | fresh token → active row, no identity.create_user call; duplicate uid → 409 | fake identity service (asserting it is NEVER called for create) |
| BE-24 | route reachable iff `dev_mode`; absent (404, not just 403) when off | none |
| BE-25 | classifier buckets A/B/C correctly; `--fix` touches only aged class-A; B/C never touched | fake identity service |

### 8.3 Test goals (per unit)

#### BE-1
- **Positive:** `create_user` returns a uid from the faked `auth.create_user`; `delete_user` calls the fake's delete; `get_user_by_email` returns `None` for a fake `UserNotFoundError`; `generate_invite_link` returns the faked link string.
- **Negative:** `create_user` propagates the faked SDK's raised exception (e.g. `EmailAlreadyExistsError`) rather than swallowing it.
- **Invariants:** `delete_user` never raises for a not-found uid (idempotent), regardless of how many times called.
- **Seam mocks:** none — this unit fakes the Firebase Admin SDK itself (`firebase_admin.auth`), not a sibling layer.

#### BE-2
- **Positive:** email with no existing identity → `create_user` called once, `created=True`; email with an existing identity → `get_user_by_email` hit, `create_user` never called, `created=False`.
- **Negative:** none beyond BE-1's (delegates to it).
- **Invariants:** calling `ensure_identity` twice for the same not-yet-created email is NOT idempotent by itself (second call creates a second identity) — idempotency is a property of the caller's retry-after-orphan pattern (BE-12/BE-15), not of this primitive alone; the test goal is to confirm this primitive's contract, not to over-claim idempotency it doesn't provide.
- **Seam mocks:** none.

#### BE-3
- **Positive:** `firebase_auth_disabled=True` → `create_user`/`generate_invite_link` return deterministic values with zero calls into `firebase_admin`.
- **Negative:** n/a.
- **Invariants:** the same email always yields the same synthetic uid (deterministic, not random) so repeated dev runs are reproducible.
- **Seam mocks:** none.

#### BE-4
- **Positive:** `app.dependency_overrides[get_identity_service]` successfully substitutes the fake in a `TestClient` request.
- **Negative:** n/a.
- **Invariants:** n/a.
- **Seam mocks:** none — this unit *is* the seam mock's injection point.

#### BE-5
- **Positive:** `POST /api/auth/client/login` and `/admin/login` reach `login_and_bind` with the correct portal argument; `GET /api/auth/me`/`POST /api/auth/logout` unaffected.
- **Negative:** `POST /api/auth/register` → 404; `POST /api/auth/login` (old unified route) → 404.
- **Invariants:** n/a.
- **Seam mocks:** `assert_can_authenticate` faked pass-through (via BE-6's dependency).

#### BE-6
- **Positive:** existing active user, matching portal → 200 `UserOut`; email drift on an existing user → email updated; missing portal claim → claim refreshed from DB.
- **Negative:** unknown uid → 403 (not 404); portal mismatch (client token hitting admin/login) → 403; no row is ever inserted by this function under any input.
- **Invariants:** calling this function twice with the same valid input is idempotent (no side effect beyond the claim refresh, which itself is idempotent).
- **Seam mocks:** `assert_can_authenticate` faked to raise 403 for a "not active" fixture user and to no-op for an "active" one.

#### BE-7
- **Positive:** known uid → resolves the existing row; email drift → row's email updated.
- **Negative:** unknown-but-verified token on ANY authenticated route (not just `/auth/*`) → 403; `firebase_auth_disabled` with no seeded `dev-user` → 403 (not an auto-create).
- **Invariants:** no invocation of this function, under any settings combination, calls `repo.create_client` or `repo.create_admin`.
- **Seam mocks:** none.

#### BE-8
- **Positive:** `FirebaseLoginBody` still parses `{id_token, portal}` payloads (backward wire-compat).
- **Negative:** a body containing `role` no longer influences any code path (since `/register` is gone, nothing reads it).
- **Invariants:** n/a.
- **Seam mocks:** none.

#### BE-9
- **Positive:** an `active` client's authenticated request passes through; a `disabled`→`active` flip on `user.status` for an admin re-enables their next request.
- **Negative:** a `disabled` client's request → 403 on the very next call after status changes (not only at login); a suspended admin (`user.status='disabled'`) → 403.
- **Invariants:** the gate is evaluated fresh on every request (not cached from a prior request/token) — a status flip takes effect on the immediately following call.
- **Seam mocks:** `assert_can_authenticate` faked both ways (raising and pass-through) to isolate this unit from the DB layer's real implementation/migration.

#### BE-10
- **Positive:** once BE-21's dev seed has run, `firebase_auth_disabled` resolves the seeded `dev-user` admin.
- **Negative:** before BE-21 has run (no `dev-user` row), the dev-bypass path → 403, not an auto-create.
- **Invariants:** identical to BE-7's — restated because this unit's test only runs once its stricter predecessor set (BE-21, BE-24) is satisfied in the test fixture setup.
- **Seam mocks:** none.

#### BE-11
- **Positive:** `create_with_profile` followed by the caller's `commit()` produces one `users` row (portal=client, `status` defaulted per the DB layer's column default — `DISABLED`) and one `client_profiles` row with `assigned_rm_uid` set as passed.
- **Negative:** raising inside the caller's transaction before commit (e.g. a simulated failure) leaves zero rows after rollback.
- **Invariants:** never calls `commit()` itself — a test asserts the session is still "dirty"/uncommitted immediately after calling this method.
- **Seam mocks:** none.

#### BE-12
- **Positive:** RM-valid onboard → row created with `user.status='disabled'`, invite link returned, portal claim stamped exactly once.
- **Negative:** `assigned_rm_uid` pointing at a non-RM (e.g. a PM) → 422, and — since `assert_is_rm` runs before any identity call — zero Firebase interactions and zero DB rows; Firebase identity creation raising → no DB rows exist afterward.
- **Invariants:** compensation (`identity.delete_user`) is called if and only if `created is True` from `ensure_identity` — a fixture that forces `created=False` (adopted identity) followed by a forced commit failure must show `delete_user` NEVER called.
- **Seam mocks:** fake `FirebaseIdentityService` with both a "fresh email" and a "pre-existing orphan email" fixture case.

#### BE-13
- **Positive:** caller with `CLIENT_MANAGE` → 201, response includes `invite_link`.
- **Negative:** caller without `CLIENT_MANAGE` (e.g. MOBO) → 403.
- **Invariants:** n/a.
- **Seam mocks:** fake identity service (never hits real Firebase in tests).

#### BE-14
- **Positive:** calling `assign_rm` updates `assigned_rm_uid` on the target profile.
- **Negative:** n/a (no route wired, so no auth/validation surface to test here beyond the repository method itself).
- **Invariants:** n/a.
- **Seam mocks:** none.

#### BE-15
- **Positive:** enroll with `role=RM` → new active internal user; enroll with `role=ADMIN` → a second active ADMIN exists (Q-I).
- **Negative:** Firebase-fail → no DB rows; commit-fail on a newly-created identity → compensating delete fires; commit-fail on an adopted identity → no delete.
- **Invariants:** claim stamped exactly once, matching the enrolled role.
- **Seam mocks:** fake identity service, both "fresh" and "adopted" fixture cases (parity with BE-12).

#### BE-16
- **Positive:** partial update of `name`/`phone_number` on a non-ADMIN target succeeds without touching the guard path at all.
- **Negative:** attempting to demote/disable the sole active ADMIN → 409, no write applied; target uid not found → 404; target is a client-portal user → 409.
- **Invariants:** simulate two "concurrent" demotions of two *different* ADMIN rows starting from `count_active_admins()==2` (e.g. via two DB sessions/threads against the same SQLite file, or an explicit interleaving test using `with_for_update` semantics) — exactly one must succeed and the other must observe the now-reduced count and 409, never both succeeding (Risk A2 closed).
- **Seam mocks:** none — this is a pure concurrency/DB-locking test internal to this layer.

#### BE-17
- **Positive:** super-admin caller → `POST` 201 / `PATCH` 200.
- **Negative:** non-super-admin caller (lacks `USER_MANAGE`) → 403 on both routes.
- **Invariants:** n/a.
- **Seam mocks:** fake identity service for the enroll route.

#### BE-18
- **Positive:** n/a (deletion unit).
- **Negative:** `PATCH /api/users/{uid}/role` → 404 (route no longer exists in the app's route table).
- **Invariants:** the same role-change capability is provably reachable via `PATCH /api/admin/staff/{uid}` (cross-check against BE-16's test).
- **Seam mocks:** none.

#### BE-19
- **Positive:** `PATCH /me {"name": ..., "phone_number": ...}` → 200, fields persisted.
- **Negative:** `PATCH /me {"role": "ADMIN"}` from a non-ADMIN caller → 200 but role unchanged (field silently ignored, not applied) — confirms self cannot promote or un-suspend.
- **Invariants:** `email` change via `/me` never triggers any `identity.*` call (local-only, per proposal note).
- **Seam mocks:** none.

#### BE-20
- **Positive:** setting `BOOTSTRAP_ADMIN_EMAIL` in the test env/`.env` override makes it readable via `get_settings()`.
- **Negative:** n/a.
- **Invariants:** n/a.
- **Seam mocks:** none.

#### BE-21
- **Positive:** empty DB + empty fake identity set → exactly one ADMIN row seeded, `authorized_by=NULL`, invite link printed; re-run → no-op (still exactly one ADMIN, no duplicate identity created).
- **Negative:** production settings (`firebase_auth_disabled=False`) with `BOOTSTRAP_ADMIN_EMAIL` unset → the CLI exits with an error rather than silently seeding a bogus identity.
- **Invariants:** running the seed N times never produces more than one ADMIN.
- **Seam mocks:** fake identity service.

#### BE-22
- **Positive:** `app_env="development"` (default) with `dev_mode=True` boots normally.
- **Negative:** `app_env="production"` + `dev_mode=True` → raises before serving; `app_env="production"` + `firebase_auth_disabled=True` → raises before serving.
- **Invariants:** with no environment overrides at all, `Settings().dev_mode is False` (confirms the default flip from the current `True`).
- **Seam mocks:** none.

#### BE-23
- **Positive:** a fresh, previously-unseen uid + `portal="client"` → row created with active/default-active status, `UserOut` returned.
- **Negative:** re-`POST` for an already-registered uid → 409.
- **Invariants:** this function never calls `identity.create_user`/`ensure_identity` for any input — assert the fake identity service's create method has zero call count throughout.
- **Seam mocks:** fake identity service, asserted un-called (not merely present).

#### BE-24
- **Positive:** `dev_mode=True` → the route appears in the OpenAPI schema and responds; a call succeeds end-to-end.
- **Negative:** `dev_mode=False` → the route is absent from the OpenAPI schema and any request to the path → 404 (not a guarded 403 from inside a still-mounted handler).
- **Invariants:** n/a.
- **Seam mocks:** none.

#### BE-25
- **Positive:** a fixture set with one true class-A, one class-B, one class-C entry is classified into exactly those three buckets; `--fix` with a short `--orphan-age-hours` deletes only the aged class-A entry.
- **Negative:** class-B/C entries are never deleted or modified by `--fix`, regardless of age.
- **Invariants:** running `classify` twice without any state change between calls yields identical results (read-only, no side effects).
- **Seam mocks:** fake identity service providing a controllable set of "Firebase-side" identities to diff against seeded DB rows.

### 8.4 Aggregate gate
- All unit tests green is a local gate run before commit/PR hand-off. Red tests block the unit; tests themselves are never committed.
- Target coverage for changed lines: ≥ 90% of new/changed statements in this layer, with BE-12/BE-15/BE-16 (the saga + TOCTOU units) held to 100% branch coverage on their guard logic specifically, given their security weight.
- Chosen `test-gen` level for this layer: **thorough** — the density of edge-case traps (A1–A4) in this rework warrants the edge/boundary/parametrized tier, not just happy-path.

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] BE-1 through BE-24 committed on `rework-authentication-module-be`; each commit left the branch green. BE-25 (identity-drift-report) is Recommend-tier and **not required** for this layer's DoD — build it only if drift is observed in practice, per proposal § 4.11.
- [ ] § 8 unit tests all pass at the `thorough` `test-gen` level; CI gate (§ 3.2) green.
- [ ] § 7 matches the proposal's frozen seam verbatim, checked against the proposal directly — not against the DB layer's branch (not visible here).
- [ ] No code path in this layer creates a `users` row from a bearer token alone, in any settings combination — the three named provisioning surfaces (`POST /api/rm/clients`, `POST /api/admin/staff`, bootstrap CLI, plus dev-only `POST /api/dev/register`) are the only birth paths.
- [ ] `UserOut` unchanged.
- [ ] PR opened against `rework-authentication-module`; human owns the merge.

**Rollback:** every BE-* unit is additive-or-replace on backend code only (no schema ownership in this layer) — reverting this layer's branch entirely leaves the DB layer's migration and columns untouched (they're a sibling layer's concern) and simply restores the old `login_or_register`/`_resolve_user` auto-create behavior if the branch is reverted before the kill-switch units (BE-6, BE-7, BE-10) are activated. Once BE-6/BE-7/BE-10 are live, reverting this layer without also reverting to a build that still has `POST /api/rm/clients`/`POST /api/admin/staff` mounted would leave the system with no birth path at all — the execution schedule (not this doc) is responsible for sequencing so that never happens mid-rollout. No unit in this layer performs a destructive data operation; BE-25's `--fix` is the only destructive action anywhere in this doc, and it is opt-in, on-demand, and scoped to already-unreachable class-A orphans only.
