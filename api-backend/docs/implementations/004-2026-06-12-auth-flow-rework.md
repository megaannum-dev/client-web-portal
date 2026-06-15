# 004 — Implementation Plan (Authentication Flow Rework)

**Date:** 2026-06-12
**Author:** QinQipeng
**Status:** Implementation decomposition (ready to execute)
**Implements:** [004 — Authentication Flow Rework](004-2026-06-11-auth-flow-rework.md) · [Requirements (R1–R7)](../requirements/auth-module.md)
**Builds on (must land first):** 003 (refactor) → 005 (UUID keys, live cutover applied, head `8f2a1c9d4b6e`)

> This document turns the approved 004 design into an **execution plan**: one integration
> branch with eight feature branches, each broken into granular, independently-reviewable steps,
> each carrying an explicit **priority by significance** and a **definition of done**. It does not
> re-argue the design (see 004 §4) — it sequences and grounds it in the current tree.

---

## 0. How to read this plan

### 0.1 Priority scale (by *significance*, not build order)

| Tier | Meaning | Branches |
|---|---|---|
| **P0 — Critical** | Closes a live vulnerability or is the load-bearing seam everything else blocks on. Security-/deployability-critical. | `gateway-core`, `firebase-identity`, the secure-default sub-step of `devmode-flag`, the test harness |
| **P1 — High** | Required for a functioning production system (the birth paths + the live-DB gate). Without these the rework is not shippable. | `schema-status-gate`, `client-onboarding`, `admin-enrollment`, `bootstrap` |
| **P2 — Medium** | Hardening / hygiene. Low severity by construction; valuable but not blocking first prod. | `user-account-sync`, the dev-self-reg + root-seam parts of `devmode-flag` |

> **Priority ≠ merge order.** Significance ranks *what matters most*; the **cutover sequence** (§11)
> ranks *what must land first*. They differ deliberately: `gateway-core` is the most significant
> branch (P0) but merges *late*, because flipping its kill-switch before the birth paths exist
> would brick all account creation.

### 0.2 Step anatomy

Each step is `<branch>.<n>` with: **what** to build, **where** (real files in the current tree),
and **acceptance** (the observable condition that closes it). Steps within a branch are ordered;
cross-branch dependencies are called out explicitly.

### 0.3 Module layout introduced

Following the existing per-feature convention (`app/libs/<feature>/{router,service,repository}.py`
+ central `app/schemas/<feature>.py`):

```
app/libs/identity/      FirebaseIdentityService          (B2)
app/libs/clients/       RM client onboarding             (B4)
app/libs/staff/         internal-admin enrollment/mgmt   (B5)
app/libs/dev/           dev-only self-registration       (B8)
app/libs/sync/          reconciliation sweep             (B7)
app/cli/                bootstrap + sweep entrypoints     (B6, B7)
tests/                  pytest scaffold                  (B0)
```

---

## 1. Global engineering principles (apply to every branch)

These are the industrial standards every step is held to; the per-branch DoDs assume them.

1. **Strict layering.** `router` (HTTP/validation only) → `service` (business rules + cross-system
   orchestration + transaction boundary) → `repository` (persistence only). No business logic in
   routers; no `HTTPException` or Firebase calls in repositories. Matches today's `users` module.
2. **One provisioning chokepoint per portal** (004 Goal 2). Creation is an explicit, named,
   authority-gated service call — never a side effect of authentication, in *any* mode (R1, §4.12).
3. **Secure-by-default & fail-closed.** Defaults deny; dev bypasses cannot survive a prod marker
   (startup assertion, not just a default value). (R7, G2.)
4. **Cross-system writes use the saga/compensation pattern.** No distributed transaction exists
   across Firebase + MariaDB, so: create identity → single DB transaction → on failure, compensate
   (best-effort identity delete). All provisioning is **idempotent** (keyed by email pre-bind).
   (§4.11.)
5. **Migrations are expand/contract with self-assertions and safe backfill**, MariaDB-targeted via
   `op.execute`, mirroring the `0003` migration's `_require()` discipline. The SQLite test path
   builds via `create_all` and never runs MariaDB-only DDL.
6. **Least privilege.** Every mutating endpoint sits behind a `require_action(...)` RBAC gate;
   authority is the route/action, never a request-body field. (R5.)
7. **Frozen public contract.** `UserOut` (`firebase_uid`, `email`, `role`) is unchanged; the public
   key stays `firebase_uid`. New fields (`status`, `is_active`, `authorized_by`) are internal.
8. **Preserve the KEEP list** (audit): Firebase verify core, `extract_uid_email`, value-based enum
   persistence (`values_callable`), RBAC, portal gates, `set_portal_claims`/`portal_from_claims`.
9. **Observability & audit.** Compensation logs at `WARNING` (email + reason); every provisioned
   row records `authorized_by`; the sweep emits an operator report.
10. **No branch merges without tests.** Unit tests for service guards + integration tests for each
    endpoint (TestClient + SQLite + faked identity service). The test harness (B0) is a P0
    prerequisite *because* none exists today.

---

## 2. Branch priority matrix

| # | Branch | Priority | Blocks / enables | Touches live data | Open forks |
|---|---|---|---|---|---|
| B0 | `auth/test-harness` | **P0** | every branch's DoD | no | — |
| B1 | `auth/schema-status-gate` | **P1** | onboarding (status), audit (authorized_by), the gate | **yes** (migration) | — |
| B2 | `auth/firebase-identity` | **P0** | all three provisioning paths (B4/B5/B6) | no | — |
| B3 | `auth/gateway-core` | **P0** | the security fix; defines the bind/gate dependencies | no | — |
| B4 | `auth/client-onboarding` | **P1** | R2 primary business path | no | — |
| B5 | `auth/admin-enrollment` | **P1** | R3 only internal birth path + mutation split | no | — |
| B6 | `auth/bootstrap` | **P1** | prod deployability (root authority) | no | — |
| B7 | `auth/user-account-sync` | **P2** | hygiene/hardening | no | — (scheduler decided: external cron + CLI) |
| B8 | `auth/devmode-flag` | **P2** (P0 sub-step 8.1) | R7; keeps dev UX without the loophole | no | frontend build-arg (deferred) |

---

## B0 — `auth/test-harness` · **P0**

**Why P0:** no test suite exists in the project today (only vendored `.venv` tests). Principle 10
makes a harness a precondition for every other branch, and the rework touches security-critical
control flow — it must be regression-locked from the first branch.

| Step | What | Where | Acceptance |
|---|---|---|---|
| B0.1 | Add `tests/` + `pytest`/`httpx` dev deps; `conftest.py` with a SQLite in-memory engine building schema via `Base.metadata.create_all`, a `Session` fixture, and a `TestClient`. | `tests/conftest.py`, `pyproject`/`requirements-dev` | `pytest` runs green on an empty suite. |
| B0.2 | `FIREBASE_AUTH_DISABLED=true` test profile + a settings-override fixture so tests never hit Firebase. | `tests/conftest.py` | Overriding `get_settings` works via `app.dependency_overrides`. |
| B0.3 | `FakeFirebaseIdentityService` test double (deterministic uids, in-memory identity set, `already-exists`/`delete` semantics). | `tests/fakes.py` | Injectable in place of the real service (B2). |
| B0.4 | Seed fixtures: factory helpers for `users`+`client_profiles`/`admin_profiles` rows (RM, ADMIN, client) at given status. | `tests/factories.py` | Each later branch reuses these. |

**DoD:** `pytest` green; fakes + factories importable; CI step documented.

---

## B1 — `auth/schema-status-gate` · **P1**  *(004 §4.6, §6)*

**Why P1, not P0:** it does not itself close a vulnerability, but it (a) modifies **live data** (the
005 cutover: 5 client / 10 admin rows) so it is the highest-risk *mechanical* change, and (b) is a
hard prerequisite for `client-onboarding` (the `status` field) and the audit trail. The gate
**function** is built here; its **wiring** lands in B3 (which owns the dependencies).

| Step | What | Where | Acceptance |
|---|---|---|---|
| B1.1 | Add `ClientStatus(str, enum)` = `pending`/`active`/`disabled`. | `app/models/users.py` | value-based, matching `Portal`/`AdminRole` convention. |
| B1.2 | Add `ClientProfile.status` (SAEnum value-based, `default=pending`, server_default), `AdminProfile.is_active` (Boolean, default `True`), `User.authorized_by` (`String(128)`, nullable FK→`users.firebase_uid`, **`ondelete="SET NULL"`**). **Each placed *before* `created_at`/`updated_at`.** | `app/models/users.py` | ORM matches the planned physical layout; `authorized_by` self-referential FK declared with explicit `foreign_keys` to avoid relationship ambiguity. |
| B1.3 | Alembic `0004_auth_status_columns` (revises `8f2a1c9d4b6e`): `ADD COLUMN ... AFTER`-placed; the `authorized_by` FK uses **`ON DELETE SET NULL`** (so the B7 sweep can delete a quarantined row without the self-FK wedging cleanup — the default `RESTRICT` would block deleting any user who had authorised another); backfill clients→`active`, admins→`is_active=true`, all→`authorized_by=NULL`; `_require()` self-assertions (row counts unchanged, no NULL status, column positions before timestamps). Downgrade drops the three columns. | `alembic/versions/` | up + down run clean on a MariaDB instance with the 15 live-shaped rows; assertions pass. |
| B1.4 | `assert_can_authenticate(user)` pure gate (client→`status==ACTIVE`, admin→`is_active`), raising `403`. **Not wired yet.** | `app/libs/auth/deps.py` (or `app/libs/auth/status.py`) | unit-tested across all branches (pending/active/disabled, is_active T/F, missing profile). |

**DoD:** migration reversible + assertion-guarded; gate function unit-tested; `UserOut` unchanged;
gate **not enforced** until B3 wires it (per 004 §4.6). **Mandatory rehearsal gate** — because the
SQLite test path (B0.1) builds via `create_all` and **never executes the MariaDB-only migration
DDL**, this branch does not merge until `alembic upgrade` **and** `downgrade` have been run against a
real MariaDB instance loaded with a dump shaped like the live 15 rows, with the `_require()`
assertions green. CI cannot vouch for this migration; the rehearsal is the substitute.

> **Risk control:** the migration is the only branch that can lock out real users.
> - **Grandfather decision (make it consciously):** backfilling existing clients → `active` means
>   the 5 live client rows **permanently bypass the new compliance gate** — the gate only ever
>   protects *newly onboarded* clients. That is the intended call (don't lock out current users),
>   but it is a security decision to record, not an incidental backfill default.
> - Rehearse against a live-shaped dump before applying; reversible downgrade + `_require` assertions.

---

## B2 — `auth/firebase-identity` · **P0**  *(004 §4.7)*

**Why P0:** the single mechanism that mints/deletes Firebase identities. All three birth paths
(B4/B5/B6) and the sweep (B7) block on it; it is the concrete realization of R6.

| Step | What | Where | Acceptance |
|---|---|---|---|
| B2.1 | `FirebaseIdentityService` wrapping `firebase_admin.auth`: `create_user(email) -> uid`, `generate_invite_link(email) -> str` (password-reset/sign-in link), `delete_user(uid)` (treat `UserNotFoundError` as success), `get_user_by_email(email) -> uid \| None`. Reuses `_init_firebase`. | `app/libs/identity/service.py` | the **only** module calling `auth.create_user`/`delete_user`/`generate_*_link`. |
| B2.2 | Idempotency primitive: `ensure_identity(email) -> (uid, created: bool)` — returns existing uid on `EmailAlreadyExistsError`/lookup hit. **The `created` flag is load-bearing:** it is the *only* signal that lets compensation (B4.3/B5.2) distinguish an identity *this request minted* from one it *adopted* — never delete an adopted uid (see Risk A1, §12). | `app/libs/identity/service.py` | covers §4.11 layer-2 adopt-orphan; `created` returned and honored by callers. |
| B2.3 | Dev/offline behavior: under `firebase_auth_disabled`, a no-op/stub implementation returning deterministic synthetic uids + fake links, so provisioning + tests work without Firebase. | `app/libs/identity/service.py` | selected by settings; matches `set_portal_claims` no-op pattern. |
| B2.4 | DI provider `get_identity_service(settings)`. | `app/libs/identity/deps.py` | injectable + overridable with B0.3's fake. |

**DoD:** unit tests against the fake `auth` module for create/delete/idempotency/dev-stub; no other
module imports `firebase_admin.auth` for identity mutation.

---

## B3 — `auth/gateway-core` · **P0**  *(004 §4.1, §4.3, §5)*

**Why P0:** this is the rework's reason for being — it removes the live auth-bypass vulnerabilities
(G3 auto-create, G6 scattered creation, G7 unguarded admin-mint). **Merges late** (§11) despite
top significance: its kill-switch must not precede the birth paths.

| Step | What | Where | Acceptance |
|---|---|---|---|
| B3.1 | Split the auth surface into portal-scoped routes: `POST /api/auth/client/login`, `POST /api/auth/admin/login`; keep shared `GET /api/auth/me`, `POST /api/auth/logout`. Portal is the route, not a body field (R5). | `app/libs/auth/router.py` | old `/auth/register` + `/auth/login` removed from the surface. |
| B3.2 | Replace `login_or_register` with `login_and_bind`: **delete the entire create branch** (kills G7); resolve existing by uid, refresh email + lazy portal claim, apply `assert_can_authenticate`; unknown uid → `403`. | `app/libs/auth/service.py` | no code path inserts a user; admin-portal new token → no ADMIN minted. |
| B3.3 | `_resolve_user`: remove the `create_client` auto-create branch (G3); unknown verified token → `403`; keep email refresh. | `app/libs/auth/deps.py:36-44` | unknown bearer token → `403` on every route. |
| B3.4 | Wire the status gate (B1.4) into a shared **client** dependency that runs on **every authenticated client request** (Q-H), and the admin equivalent (`is_active`). | `app/libs/auth/deps.py` (`get_current_client_user`/`get_current_admin_user`) | a `disabled` client is locked out mid-session on the next call. |
| B3.5 | Retire `POST /api/auth/register` and the old `POST /api/auth/login`; drop `requested_role` body-trust from the prod path (it relocates to B8). Prune now-dead `must_be_new`/`requested_role` params. | `app/libs/auth/router.py`, `app/schemas/auth.py` | `/api/auth/register` → `404`; `FirebaseLoginBody.role` no longer honored in prod. |
| B3.6 | The dev-bypass `_resolve_user` branch (`firebase_auth_disabled`) **also binds-only** — it must not `create_admin`. (Dev creation moves to B8.) **Extra dependency (A3):** today this branch auto-materialises the `dev-user` admin on first call (`deps.py:28-31`). Removing it leaves an offline dev env with **no admin and no way to make one** until *both* B8.4 (`/api/dev/register`) exists *and* a dev seed provides the first admin — and `/api/dev/register` needs a frontend-minted token, which the `firebase_auth_disabled` path does not produce. So B3.6 must land **after B8.4 + a dev seed** (B6 bootstrap also seeds `dev-user` under `firebase_auth_disabled`), not merely after the prod birth paths. | `app/libs/auth/deps.py:25-31` | dev login of an unknown token → `403` (binds only); a seeded `dev-user` admin still resolves. |

**DoD:** verification rows — unknown token `403`; `/register` `404`; admin-create-via-login gone;
portal gate intact; status gate active. Full integration tests. **Sequencing gate:** do not enable
the B3.2/B3.3 removals until **B4+B5+B6** are merged; do not enable the **B3.6** removal until
**B8.4 + a dev seed** are also in place (A3) — B3.6 has a *stricter* predecessor set than the rest of
the kill-switch.

---

## B4 — `auth/client-onboarding` · **P1**  *(004 §4.4, §4.5)*

**Why P1:** the primary production business path (R2) and the most-exercised prod chokepoint.

| Step | What | Where | Acceptance |
|---|---|---|---|
| B4.1 | Re-introduce a real `ClientProfileRepository`: `create_with_profile(...)`, `get_by_user_id`, `assign_rm`, status setters. | `app/libs/clients/repository.py` | persistence only; one flush/commit boundary owned by the service. |
| B4.2 | `assert_is_rm(db, rm_uid)` guard — **RM-literal** (Q-E): target is admin-portal & `admin_profiles.role == RM`, else `422`. | `app/libs/clients/service.py` (shared validator) | unit-tested for non-existent/non-admin/non-RM/RM. |
| B4.3 | `ClientService.onboard(...)`: default `assigned_rm_uid` to caller; `assert_is_rm`; `(uid, created) = identity.ensure_identity(email)`; **txn** insert `users(portal=client)` + `client_profiles(status=pending, authorized_by=caller_uid)`; **stamp the portal claim** (`set_portal_claims(uid, "client", None)`) so the client's first token isn't claimless (A4); **compensate on commit failure only when `created` is True** — `identity.delete_user(uid)` (A1: never delete an *adopted* identity, or a concurrent winner's bind is destroyed); return staged record + invite link. | `app/libs/clients/service.py` | saga (guarded by `created`) + idempotency (adopt orphan) + claim stamped, per §4.11. |
| B4.4 | `POST /api/admin/clients` gated `require_action(CLIENT_MANAGE)`; request/response schemas. Mount under `/api`. | `app/libs/clients/router.py`, `app/schemas/clients.py`, `app/main.py` | RM → `201`; non-RM (e.g. MOBO) → `403`. |

**DoD:** verification rows — RM `201` with `assigned_rm_uid`+`status=pending`; non-RM `403`; PM
target `422`; Firebase-fail → no rows; commit-fail → compensation fires, orphan inert. Tests.

---

## B5 — `auth/admin-enrollment` · **P1**  *(004 §4.9)*

**Why P1:** once B3 lands, this is the **only** production birth path for internal users (R3), plus
the mutation consolidation that retires `PATCH /role`.

| Step | What | Where | Acceptance |
|---|---|---|---|
| B5.1 | Extend `AdminProfileRepository`: `create_with_profile(...)`, partial-update (`role`/`is_active`/`name`/`phone_number`), and `count_active_admins()` for the guard. | `app/libs/users/repository.py` or `app/libs/staff/repository.py` | persistence only. |
| B5.2 | `StaffService.enroll(...)`: `require USER_MANAGE` (at the route); `(uid, created) = identity.ensure_identity(email)`; txn insert `users(portal=admin)` + `admin_profiles(role, is_active=true, authorized_by=caller)`; **stamp the portal+role claim** (`set_portal_claims(uid, "admin", role)`) at enrollment (A4); **compensate on commit failure only when `created` is True** (A1); invite link. `role==ADMIN` permitted (peer super-admin, Q-I). | `app/libs/staff/service.py` | symmetric to B4.3 (compensation `created`-guarded, claim stamped). |
| B5.3 | `StaffService.update(uid, patch)`: partial update; on `role` change re-stamp claim via `set_portal_claims`; `409` if target not admin-portal; `404` if absent; **last-active-ADMIN guard** (refuse demote/disable the final ADMIN → `409`) — the count-then-write must be **one transaction with `SELECT ... FOR UPDATE`** over the active-ADMIN rows, or two concurrent demotions of different ADMINs each see count≥2 and both commit → zero admins (A2 TOCTOU). | `app/libs/staff/service.py` | guard unit-tested at the boundary **and** under a simulated concurrent demotion (exactly-one-ADMIN holds). |
| B5.4 | `POST /api/admin/staff` + `PATCH /api/admin/staff/{uid}`, both `require_action(USER_MANAGE)`. | `app/libs/staff/router.py`, `app/schemas/staff.py`, `app/main.py` | super-admin only. |
| B5.5 | **Remove** `PATCH /api/users/{firebase_uid}/role`; fold its logic into B5.3. | `app/libs/users/router.py:45-69` | route gone; `UserUpsert` retired or repurposed. |
| B5.6 | Extend `PATCH /api/users/me` to own benign fields (`name`/`phone_number`/`email`), **never** `role`/`is_active`. Update self-update schema + `UserService` to write profile contact fields. | `app/libs/users/router.py:34-42`, `app/schemas/users.py`, `app/libs/users/service.py` | role/is_active in body ignored/rejected. |

**DoD:** verification rows — staff `POST` `201`; non-super-admin `403`; `PATCH` partial update +
claim re-stamp; last-ADMIN demote/disable `409`; unknown/ client target `404`/`409`; `/me` cannot
self-promote. `email` edits documented local-only. Tests.

---

## B6 — `auth/bootstrap` · **P1**  *(004 §4.10)*

**Why P1:** a clean deploy has an empty Firebase project + empty `users` table, so **no authority
exists** to call B5 — without bootstrap the system is not deployable. Depends on B2 + B5 primitives.

| Step | What | Where | Acceptance |
|---|---|---|---|
| B6.1 | `BOOTSTRAP_ADMIN_EMAIL` (+ optional name) settings. | `app/core/config.py` | read from env. |
| B6.2 | Idempotent seed command: if any `admin_profiles.role==ADMIN` exists → no-op; else reuse `StaffService` primitives + `identity` to create the first ADMIN's Firebase identity + rows (`authorized_by=NULL`) + set-password link (logged for the operator). | `app/cli/bootstrap_admin.py` (e.g. `python -m app.cli.bootstrap_admin`) | **not** an HTTP route. |
| B6.3 | **Dev seed (unblocks A3 / B3.6):** under `firebase_auth_disabled`, the same idempotent seed provisions the `dev-user` ADMIN (the row the removed `deps.py:28-31` auto-create used to manufacture), so offline dev keeps a working admin once B3.6 lands. | `app/cli/bootstrap_admin.py` | `firebase_auth_disabled` run → `dev-user` admin present; re-run no-op. |
| B6.4 | Document the deploy-time run step. | `docs/` / deploy README | one-line operator instruction. |

**DoD:** empty Firebase + empty DB → seeds exactly one `ADMIN` (identity + rows + link); re-run is a
no-op. Tests with the fake identity service.

---

## B7 — `auth/user-account-sync` · **P2**  *(004 §4.11)*  *(renamed from reconciliation-sync)*

**Why P2:** hardening/hygiene. By construction every inconsistency class is **inert** (the
fail-closed gate `403`s incomplete records), so this is quota/cleanliness, not a security hole.
Layer-1 compensation already ships inside B4/B5; this branch owns layers 2–3 as shared/standalone.

| Step | What | Where | Acceptance |
|---|---|---|---|
| B7.1 | Promote idempotent provisioning (layer 2, adopt-orphan) into a shared helper consumed by B4 + B5 (avoid duplication). | `app/libs/identity/service.py` / `app/libs/sync/` | both services route through it. |
| B7.2 | Reconciliation classifier: enumerate Firebase identities vs `users` rows → classes **A** (Firebase orphan), **B** (missing credential), **C** (incomplete record). | `app/libs/sync/reconcile.py` | unit-tested with the fake identity set + seeded rows. |
| B7.3 | Sweep actions: **A** past grace → **quarantine-before-delete** (`disabled=True`, observe second window, then delete); **B/C** → operator report only (never auto-complete business data). | `app/libs/sync/reconcile.py` | idempotent; A never promoted. |
| B7.4 | Grace-window config + structured report output. | `app/core/config.py`, logs | tunable; report lists B/C. |
| B7.5 | CLI entrypoint `python -m app.cli.reconcile`. | `app/cli/reconcile.py` | runnable standalone. |

**Scheduler — DECIDED (2026-06-12): external cron invoking the idempotent CLI** (B7.5), *not* an
in-app scheduler. Rationale: the API runs behind `restart: unless-stopped` and may scale to multiple
replicas; an in-app scheduler would fire the sweep N× concurrently and the quarantine-before-delete
logic is not parallel-safe without leader election or an advisory lock. External cron fires once
regardless of replica count, is ops-owned, trivially testable, and adds no runtime coupling. The
deploy environment supplies the trigger (k8s `CronJob` / system cron) calling `python -m
app.cli.reconcile`. The CLI must therefore be safe to run on every replica's image but invoked from
exactly one schedule. **Grace-window values** are tunable config (B7.4), not a structural fork —
start conservative (≈24h to quarantine, +24h to delete) and adjust once real provisioning-retry
latency is observed.

**DoD:** classifier + quarantine logic unit-tested; sweep idempotent; A-orphan quarantined then
deleted after grace, never promoted; B/C surfaced; CLI runnable from cron with a documented
schedule.

---

## B8 — `auth/devmode-flag` · **P2** (with a **P0** sub-step)  *(004 §4.8, §4.12)*

**Why mixed:** the branch as a whole is P2 (keeps the legacy dev UX), but **step 8.1 is P0** — a
one-file secure-default + fail-closed assertion that fixes G2 (`dev_mode` defaults `True` today). It
has zero dependencies and should be **fast-tracked** independently of the rest of the branch.

| Step | What | Where | Acceptance | Prio |
|---|---|---|---|---|
| B8.1 | Flip `dev_mode` field default `True` → **`False`**; add `app_env: str = "development"`; **fail-closed startup assertion**: if `app_env=="production"` and (`dev_mode` or `firebase_auth_disabled`) → refuse to boot. | `app/core/config.py:20`, `app/main.py` (lifespan/startup) | prod marker + any bypass → app won't start. | **P0** |
| B8.2 | Confirm both compose files already inject `DEV_MODE=${DEV_MODE:-false}` (verified) and pydantic maps `DEV_MODE`↔`dev_mode`. Document the canonical name. | `app/core/config.py`, compose (no change) | env name authoritative. | P2 |
| B8.3 | Root seam: add root `.env.example` documenting `DEV_MODE`/`APP_ENV` as the eventual single source; add `/.env` to **root** `.gitignore` (today it ignores only `.env*.local`). | `../.env.example`, `../.gitignore` | a real root `.env` with secrets can't be committed. | P2 |
| B8.4 | Dev-only self-registration module: `POST /api/dev/register` (`{id_token, portal, role?}`) — verify token via shared core; must-be-new (`409`); build rows via the **same** `ClientService`/`StaffService` primitives **minus** `identity.create_user`; set `status=active`/`is_active=true` (dashboard-ready). Relocate the legacy `requested_role` body-trust here, where it dies with the module. | `app/libs/dev/router.py`, `app/libs/dev/service.py`, `app/schemas/dev.py` | a third *provisioning* surface, distinct from login. | P2 |
| B8.5 | Mount the dev router in `main.py` **iff `settings.dev_mode`** (physical absence in prod, not a runtime `if` inside a mounted route). | `app/main.py` | route absent (`404`) when `dev_mode` off. | P2 |
| B8.6 | **Deferred:** frontend `DEV_MODE` → `NEXT_PUBLIC_DEV_MODE` build arg (build-time; blocked on root-compose adoption). Record the seam only. | — | noted, not built. | — |

**DoD:** prod-config-with-bypass → startup assertion fails; dev `POST /api/dev/register` → `201` +
dashboard reachable; dev login of unknown token → `403` (binds only); re-register existing uid →
`409`; dev route not mounted in prod. Tests.

---

## 11. Integration & cutover sequence

The eight B-units below are the *units of work*. Per the
[execution-scheduling plan](004-2026-06-12-execution-scheduling-plan.md), they are **realized as
squash commits grouped into five wave git branches** (`wave/0-foundations` … `wave/4-cutover`), each
cut from the current tip of the integration branch **`auth-flow-rework`** (off the `003 → 005` tree)
and PR'd back into it one wave at a time. The integration branch reaches `main` only when the whole
set is coherent and deployable (Gate B). The dependency diagram below drives both the commit order
within a wave and the wave order itself.

**Build/merge order (dependency- and safety-respecting):**

```
B0 test-harness  ─┐
B8.1 secure-default (fast-track, P0, standalone) ─┐
                  │                                │
B1 schema-status-gate ──► B2 firebase-identity ──► ┤
                                                   ├─► B4 client-onboarding ─┐
                                                   ├─► B5 admin-enrollment ──┤
                                                   └─► B6 bootstrap ─────────┤
                                                                             ▼
                                          B3 gateway-core  (KILL-SWITCH — merges LAST of the spine)
                                                                             │
                                                   B7 user-account-sync ◄────┤ (layers 2–3)
                                                   B8.2–B8.5 devmode + dev-reg ◄──┘
```

**The hard rules (two, not one):**
1. B3's prod kill-switch (B3.2/B3.3) must not be active on the integration branch until **B4 + B5 +
   B6** are merged — otherwise there is a window with no account birth path.
2. B3.6 (dev-bypass binds-only) has a **stricter** predecessor: it must not land until **B8.4 +
   a dev seed** exist (A3), or offline dev is bricked — no admin and no way to mint one. Treat B3.6
   as gated on B8, not on the prod birth paths.

Everything else can proceed in parallel once B1+B2 exist.

**Fast-track exception:** B8.1 (secure default + fail-closed assertion) is P0, one file, and
dependency-free — land it early and independently; it hardens every interim state.

---

## 12. Risk register

### 12.1 Latent correctness traps (design-level — fixed in the steps above)

These are not "be careful" risks; they are bugs the obvious implementation would contain. Each is
now pinned into the responsible step.

| # | Trap | Branch | Why it bites | Fix (in-step) |
|---|---|---|---|---|
| **A1** | **Compensation deletes an adopted identity.** Concurrent onboards of the same email: one creates the Firebase identity, the other *adopts* the same uid; the loser's commit fails on the `firebase_uid` UNIQUE constraint and its compensation `delete_user(uid)` destroys the **winner's** credential → a self-manufactured class-B orphan. | B2.2 / B4.3 / B5.2 | the saga's "best-effort delete" is unconditional in the naive version. | compensate **iff `created is True`** (the flag `ensure_identity` returns); never delete an adopted uid. |
| **A2** | **Last-ADMIN guard TOCTOU.** Two `PATCH /staff/{uid}` demoting *different* ADMINs each read `count_active_admins()==2`, both pass, both commit → **zero admins** (R3 invariant broken). | B5.3 | a read-then-write guard looks correct in single-threaded tests. | count-and-write in **one txn with `SELECT … FOR UPDATE`** over the active-ADMIN rows. |
| **A3** | **Kill-switch bricks *dev*.** Removing the `firebase_auth_disabled` auto-create (`deps.py:28-31`) leaves offline dev with no admin and no way to mint one — `/api/dev/register` needs a frontend-minted token the bypass can't produce. | B3.6 | the §11 "after birth paths" rule covers prod, not this. | B3.6 gated on **B8.4 + a dev seed** (B6.3 seeds `dev-user`); stricter than the prod kill-switch. |
| **A4** | **Claimless first login.** Provisioning that creates rows without `set_portal_claims` makes every first token claimless, forcing the `login_and_bind` slow path to re-stamp on each first login. | B4.3 / B5.2 | claims were historically stamped inside `login_or_register`, which B3 removes. | stamp portal (+role) **at provisioning time** in both services. |

### 12.2 Operational / sequencing risks

| Risk | Branch | Mitigation |
|---|---|---|
| Live-DB backfill locks out real users | B1 | clients backfill → `active` (conscious grandfather decision); **mandatory MariaDB rehearsal gate** (CI can't test the MariaDB-only DDL); reversible downgrade + `_require` assertions. |
| `authorized_by` self-FK wedges sweep deletes | B1/B7 | FK declared `ON DELETE SET NULL`, not the default `RESTRICT`. |
| Kill-switch lands before birth paths | B3 | the §11 two hard rules; integration-branch checklist. |
| Orphaned Firebase identities (commit-fail) | B4/B5/B7 | saga compensation (`created`-guarded, A1) + idempotent adopt + sweep; all classes inert via fail-closed gate. |
| In-app sweep fires N× under multiple replicas | B7 | **decided: external cron + idempotent CLI** (not in-app); fires once regardless of replica count; quarantine-before-delete need not be parallel-safe. |
| Frontend still calls `/register` | B3/B8 | coordinate both frontends (004 §6); dev-reg covers the dev UX; prod first-login switches to bind. |
| Bootstrap not run on deploy | B6 | idempotent; documented deploy step; without it admin routes are uncallable (loud failure, not silent). |
| Local email diverges from Firebase credential | B5.6 | documented local-contact-only; **do not let local email become the audit/notification source** until the deferred sync lands. |

---

## 13. Definition of done (whole feature)

- All 8 branches merged to `auth-flow-rework`; §8 of 004's verification table passes as automated
  tests (B0 harness).
- `dev_mode`/`firebase_auth_disabled` provably impossible in prod (assertion test).
- No code path creates a user from a token in any mode; the three named provisioning surfaces are
  the only birth paths; `_resolve_user` binds only.
- The R4 migration applied to the live DB; status gate enforced.
- Bootstrap documented + idempotent; ≥1 ADMIN invariant holdable.
- `UserOut` unchanged; KEEP-list components intact.
- B7 sweep wired to **external cron + the idempotent CLI** (decided); grace windows set in config.
- No open structural forks remain across the eight branches.
