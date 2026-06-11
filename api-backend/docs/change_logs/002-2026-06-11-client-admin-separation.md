# Change Log — 002 Client / Admin Separation

**Date:** 2026-06-11
**Branch:** `client-admin-separation`
**Scope:** `api-backend/` (FastAPI + SQLAlchemy 2.0 + MariaDB, single Firebase project)
**Status:** Implemented and validated (V1–V4 green); live dev DB migrated in place.
**Drove from:** Proposal / Implementation / Prompt 002 (the doc trio).

Separates client-portal and admin-portal user handling at three layers — database, API, and Firebase identity claims — without adding any new Firebase project or application.

---

## 1. Data model (`app/models/users.py`, `app/models/__init__.py`)

- **`UserRole` enum split** into two enums:
  - `Portal(str, Enum)` → `CLIENT = "client"`, `ADMIN = "admin"`.
  - `AdminRole(str, Enum)` → `RM, MOBO, PM, PC, COMPLIANCE, ADMIN`.
  - There is no longer a `CLIENT` *role* — client identity = having a `client_profiles` row + `portal = client`.
- **`users` is now an identity anchor:** added a `portal` column; **removed** the old `role` column (it moves into `admin_profiles`).
- **New profile tables (1:1 with `users`):**
  - `client_profiles` — `user_id` (FK→`users.id`), `name`, `primary_phone`, `assigned_rm_uid` (FK→`users.firebase_uid`), `address`, `country_of_residence`, `authorized_person`, `initiate_method`.
  - `admin_profiles` — `user_id` (FK→`users.id`), `name`, `role` (`AdminRole`), `phone_number`.
- **Computed `User.role` property** (typed `-> str`) returns `"CLIENT"` for client users or the admin's role string — this preserves the frozen `UserOut` wire contract without a per-call-site helper.
- **`viewonly` relationships** `User.admin_profile` / `User.client_profile`; `client_profile` is disambiguated with an explicit `primaryjoin` + `foreign_keys="ClientProfile.user_id"` (it has two FKs into `users`).
- **String-enum storage fix:** both `users.portal` and `admin_profiles.role` use `SAEnum(..., native_enum=False, values_callable=lambda e: [m.value for m in e])` so the ORM persists/reads by enum **value** (lowercase), matching the migration's writes and the Firebase-claim convention. (Without this, ORM reads of migration-written rows raised `LookupError`.)
- Re-exports in `app/models/__init__.py` updated: removed `UserRole`; added `Portal`, `AdminRole`, `User`, `ClientProfile`, `AdminProfile`.

## 2. API / auth (`app/libs/auth/*`, `app/libs/users/*`, `app/libs/documents/router.py`)

- **Portal-gating dependencies** (`deps.py`): `get_current_user`, `get_current_client_user` (403 unless `portal == CLIENT`), `get_current_admin_user` (403 unless `portal == ADMIN`), plus a shared `_resolve_user` (unknown token auto-provisions a client; dev bypass yields the dev-user admin).
- **`require_action`** now layers on the admin gate and reads the role from `admin_profiles` (via `AdminProfileRepository`).
- **Action map** (`actions.py`): `ROLE_ACTIONS` re-keyed on `AdminRole`; the former `CLIENT` entry removed; client capabilities moved to a `CLIENT_ACTIONS` set. **MOBO** added with back-office-operational actions: `FINANCIAL_VIEW_ALL, DOCUMENT_VIEW_ALL, CLIENT_VIEW, ANALYTICS_VIEW, USER_VIEW` (no manage / submit-on-behalf / compliance-review / financial-manage).
- **Repositories** (`users/repository.py`): replaced `create`/`update_role` with `create_client` / `create_admin`; added `AdminProfileRepository` (incl. `upsert_role`) and `ClientProfileRepository`. Role strings are coerced to `AdminRole` at the boundary.
- **Portal-aware login/register** (`auth/service.py`): `login_or_register` takes `portal`, creates the matching profile for new users, trusts the persisted portal for existing users, and **lazily refreshes** the Firebase claim when it is absent. Added a `_uid_email` helper.
- **Provisioning** (`users/router.py`): `PATCH /api/users/{firebase_uid}/role` upserts the admin profile, sets the portal claim, and returns the user.
- **Request schema** (`schemas/auth.py`): register/login gains `portal`; `role` is now `AdminRole | None`.
- **Response contract** (`schemas/users.py`): `UserOut.role: str` (from the computed property) — wire shape unchanged: `{id, firebase_uid, email, role}`.
- **Documents router**: client endpoints `GET /me` / `POST /me` now gate on `get_current_client_user`; the admin all-docs `GET ""` stays on `require_action(DOCUMENT_VIEW_ALL)`.

## 3. Firebase custom claims (`app/core/security.py`)

- Added `set_portal_claims(uid, portal, role, settings)` (no-op when `firebase_auth_disabled`) and `portal_from_claims(claims)`.
- The DB column is the **source of truth**; the claim is a fast-path mirror, refreshed lazily on login. No proactive backfill.

## 4. Migration tooling — Alembic adopted (`alembic/`, `alembic.ini`, `requirements.txt`)

- Added `alembic>=1.13.0`; initialized `alembic/` with `env.py` wired to `Base.metadata` and the runtime `DATABASE_URL`.
- **`0001` baseline** (`6405e823862b`) — captures the current schema (`users` with the old `role`).
- **`0002` separation** (`79729eec2af4`) — three-phase, reversible:
  1. add nullable `users.portal` + create `client_profiles` / `admin_profiles`;
  2. backfill — old `CLIENT` → `portal=client` + a client profile; everything else → `portal=admin` + an admin profile carrying the old role;
  3. set `portal` NOT NULL, then drop `users.role`.
- DDL uses plain `String` (not native ENUM), consistent with the model.
- **Adopting Alembic on a pre-existing `create_all()` DB** requires a one-time `alembic stamp 0001` before `alembic upgrade head` (which then applies only `0002`). A fresh volume runs the full chain automatically.

## 5. Docker (`Dockerfile`)

- Image now `COPY`s `alembic/` + `alembic.ini`, and the entrypoint runs migrations before serving:
  `CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]`.
- Only `requirements.txt` is installed in the image (now includes Alembic).

---

## Validation performed

| Gate | What | Result |
|---|---|---|
| **V1** | `ruff check` + `ruff format` + `mypy` (41 source files) | clean |
| **V2** | pytest logic/contract tests on in-memory SQLite, Firebase mocked | 33/33 pass |
| **V3** | `0001→0002` on a disposable MariaDB with a synthetic ~18-row fixture; reversibility; seed uniqueness/idempotency | pass |
| **Real-data** | Loaded the live 15-row dump → `stamp 0001` → `upgrade head` → asserted backfill + ORM reads (incl. MOBO) | pass |
| **V4** | Full in-container rebuild of the inner stack; entrypoint applied `0002` in place; `/health`, auth gate, live ORM read | pass |

**Live dev DB outcome (migrated in place, no data loss):** 15 users preserved → 2 client + 13 admin profiles; roles intact (`ADMIN×8, COMPLIANCE×2, MOBO×1, PM×1, RM×1`); `users.role` dropped; `UserOut` contract verified for both portals. Dummy profile fields were populated once via the (now-removed) dev seed, so all 15 profiles carry unique names/phones.

---

## Notable decisions & findings

- **MOBO is a first-class role.** Live data contained a `role=MOBO` row absent from both the old and the originally-specified new enum (it exists in the frontend per the "RM and MOBO roles" work). Added to `AdminRole` + the action matrix per decision.
- **Enum storage mismatch** (caught by the real-migration path, not the ORM-only unit tests) → fixed with `values_callable`.
- **Collation assumption (open):** the `client_profiles.assigned_rm_uid → users.firebase_uid` FK requires both columns to share a collation. It holds on the standard compose (`utf8mb4_unicode_ci` everywhere) but would fail (`errno 150`) under collation divergence. Candidate hardening: pin collation on those columns.
- **Two compose files:** the live dev stack is the **inner** `api-backend/docker-compose.yml` (mariadb + api, mounts real Firebase creds, project `api-backend`, volume `api-backend_mariadb_data`) — not the root 4-service compose. They collide on container names/ports.
- **Pre-existing exposure (out of scope):** `api-backend/firebase-client-web-portal.json` is tracked in git — recommend rotating the key and removing it from version control.

## Cleanup in this change

- **Removed test-only artifacts** (deliberate, per decision): the `tests/` pytest suite, the `scripts/seed_profiles/` dev seeding package (already run against the dev DB), and `requirements-dev.txt`. The Dockerfile's `COPY scripts ./scripts` line was removed accordingly.
- Purged regenerable caches (`.mypy_cache/`, `.pytest_cache/`, `.ruff_cache/`, `__pycache__/`).
- Identified but **left in place** (per decision) some unused app symbols: `ClientProfileRepository`, `get_admin_profile_repo`, `get_client_profile_repo`, `CLIENT_ACTIONS`.

---

## Files changed

**Modified (15):**
`Dockerfile` · `requirements.txt` · `app/core/security.py` · `app/models/__init__.py` · `app/models/users.py` · `app/schemas/auth.py` · `app/schemas/users.py` · `app/libs/auth/actions.py` · `app/libs/auth/deps.py` · `app/libs/auth/router.py` · `app/libs/auth/service.py` · `app/libs/documents/router.py` · `app/libs/users/repository.py` · `app/libs/users/router.py` · `app/libs/users/service.py`

**Added:**
`alembic.ini` · `alembic/` (env.py, script.py.mako, README, `versions/6405e823862b_0001_baseline_current_schema.py`, `versions/79729eec2af4_0002_client_admin_separation.py`) · `docs/proposals/002-2026-06-10-client-admin-separation.md`

**Removed (during cleanup):**
`tests/` · `scripts/` · `requirements-dev.txt`

## Follow-ups (not done here)

1. Harden the profile FK against collation divergence (pin collation).
2. Rotate + untrack `firebase-client-web-portal.json`.
3. FR-1: tighten auto-provisioning to require `/register` (currently unknown tokens auto-create as client).
4. FR-2: remove the `FIREBASE_AUTH_DISABLED` dev bypass.
5. Optional: prune unused app symbols listed above; build the production admin-creation endpoint.
