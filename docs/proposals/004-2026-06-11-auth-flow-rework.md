# 004 — Authentication Flow Rework (Client + Internal Users)

**Date:** 2026-06-11 · **Updated:** 2026-07-18 (R4 status model simplified to a single two-value `users.status` (`AccountStatus{active,disabled}`) column — one column, not per-profile-table — see §4.6/§6/§8; route-branch convention added to §3/§5; prior update 2026-06-12 aligned to approved requirements)
**Branch:** TBD (`auth-flow-rework`, off the cleaned tree from 003)
**Status:** Design complete (all forks resolved) — implementation decomposition pending
**Author:** QinQipeng
**Implements:** [Authentication Module — Requirements (R1–R7)](../requirements/auth-module.md)
**Builds on:** [002 — Separating Client and Admin Handling](002-2026-06-10-client-admin-separation.md)
**Requires first:** [003 — Refactor Basis](003-2026-06-11-refactor-cleanup-placeholders.md) · [005 — Database Foundation Cleanup](005-2026-06-11-database-foundation-cleanup.md)

> **Sequencing:** 005 establishes the UUID keys and seeds `assigned_rm_uid`/RM pool that 004's onboarding writes against. Land **003 → 005 → 004**. 004 re-introduces the real `ClientProfileRepository` (003 deletes the dead one) and re-adds `CLIENT_VIEW`/`CLIENT_MANAGE` (003 trims them out). 004 also adds a small schema migration of its own (§6) for the R4 status columns.

---

## 1. Context and Motivation

002 gave every user a durable `portal` identity and a dependency-layer gate. But a review of the resulting auth flow (oriented around the next business goals) found that **the way users come into existence does not match how the business actually onboards them.** The approved requirements (R1–R7) formalise three target behaviours:

> **R1.** In **production**, neither clients nor internal users may self-register.
> **R2.** An internal user — specifically an **RM** — onboards the client on the client's behalf; first login *binds* to that account.
> **R3.** Internal users are created only by a super-admin (`ADMIN`); the DB always holds ≥1 seeded `ADMIN`.

…plus three architectural requirements the original draft did not cover: a **per-portal login status gate** (R4), **backend-sole Firebase-identity creation** (R6), and a **unified root-level dev-mode flag** with modular, dev-only self-registration (R7).

### 1.1 What the code does today (the gaps)

| # | Finding | Location | Why it violates the requirements |
|---|---|---|---|
| G1 | **Clients can self-register in prod.** The `/register` guard only blocks `portal == "admin"`. | `app/libs/auth/router.py:22` | Violates R1 for clients. |
| G2 | **`dev_mode` defaults to `True`**, so even the admin guard (`not settings.dev_mode`) is off by default. | `app/core/config.py:20` | The one existing guard is disabled out of the box. |
| G3 | **Any valid token auto-creates a user.** `_resolve_user` silently calls `create_client(uid, email)` for unknown tokens on *any* authenticated endpoint — the local DB re-materialises from a Firebase token even after a container teardown. | `app/libs/auth/deps.py:41` | Registration is bypassable entirely — violates R1, R2, R6. |
| G4 | **No RM-onboarding path exists.** Client rows are only ever born implicitly (G3 or the dev bypass), always with an *empty* profile. | `app/libs/users/repository.py:28` | No mechanism for R2. |
| G5 | **`assigned_rm_uid` invariant is unenforceable.** The model comment admits "must be an RM… enforce in the service layer," but no setter or validation exists. | `app/models/users.py:96` | R2's core relationship is unprotected. |
| G6 | **Account creation is decided in three disconnected places** (register guard, `login_or_register` create branch, dev bypass). | `router.py`, `service.py`, `deps.py` | No single chokepoint — every new endpoint can re-open the hole. |
| **G7** | **`/auth/login` is itself an unguarded admin-creation endpoint.** `login_or_register(must_be_new=False)` falls into the *create* branch for any new token and, with `{portal:"admin"}` and no role, mints a full `ADMIN` — with **no `dev_mode` guard** (that guard lives only on `/register`). | `app/libs/auth/service.py:35-44` · `router.py:40-48` | Worst hole: retiring `/register` alone leaves this standing. Violates R1/R3. |
| **G8** | **No account-status gate.** Any resolved user authenticates regardless of activation state; there is no `pending`/`active` concept and no place to enforce one. | `deps.py:_resolve_user` | Violates R4 — an onboarded-but-unreviewed client could log in. |
| **G9** | **No Firebase-identity provisioning.** The backend only ever *reads* Firebase tokens; it never creates Firebase identities, so today the only way to get one is client self-signup. | (absent) | Violates R6 ("both" — no Firebase identity without an RM). |
| **G10** | **No internal-admin enrollment path.** Once G3/G7 are closed, no production code creates an internal user: `PATCH /role` only *updates* existing admins (404 if absent, 409 if not admin-portal), and `POST /api/admin/staff` was left "optional"/unspecified. The `create_admin` primitive's only callers (dev bypass, `login_or_register` create branch) are both removed. | `app/libs/users/router.py:53-64` · proposal §5 | Violates R3 — no working super-admin provisioning path. |
| **G11** | **No bootstrap, and the Firebase project is empty on init.** No migration/seed/CLI creates the first `ADMIN`, and a fresh Firebase project contains no identities at all — so the authority chain has no root and §4.9 is uncallable on a clean deploy. | (absent across all migrations + code) | Violates R3's bootstrap invariant. |

**Root cause (altitude):** user creation is currently an *implicit side effect of authentication*. The business requires it to be an *explicit, authority-gated provisioning operation*. R1–R3 are the same fix viewed from different angles; R4/R6/R7 harden the surface around it.

---

## 2. Goals

1. **No self-registration in production (R1).** No code path may create a user from a token alone — for either portal. This includes killing the `/auth/login` create branch (G7), not just `/register`.
2. **One provisioning chokepoint per portal (R1, NFR).** Exactly one place decides "this identity may become a user," and it requires authority (an existing admin) — never an anonymous token.
3. **RM onboards clients (R2).** A first-class endpoint lets an authorised internal user (RM, or higher) create a client record up front — profile fields + `assigned_rm_uid` + `users.status='disabled'` (not yet activated) — *before* the client ever logs in.
4. **Bind-on-first-login by `uid` (R2, R6).** A client's first authenticated request binds their Firebase UID to the pre-provisioned record; it never creates a new one. Unknown tokens are rejected.
5. **Enforce the RM invariant (G5).** `assigned_rm_uid` may only point at an internal user whose `admin_profiles.role == 'RM'`, validated in the service layer at assignment time.
6. **Admin enrollment is super-admin-only (R3).** A *required* `POST /api/admin/staff` chokepoint (gated `USER_MANAGE`) mints the internal user's Firebase identity (R6) + `users(portal=admin, status='active')` + `admin_profiles(role)`; the old `PATCH /users/{uid}/role` is **replaced** by a super-admin `PATCH /admin/staff/{uid}` (role + `status` + profile, with a last-ADMIN guard) and self-service `PATCH /me`. Provide an out-of-band **bootstrap** that seeds the first `ADMIN` **including its Firebase identity** (the Firebase project is empty on init).
7. **Per-portal login status gate (R4).** Login is denied for non-active accounts even with valid credentials: a single `users.status` column (`AccountStatus{active, disabled}`) is shared by both portals — clients and admins alike are gated on `users.status == active`. Status lives on `users`, not on `client_profiles`/`admin_profiles`, since it is one account-level concept, not two.
8. **Backend is the sole Firebase-identity creator in prod (R6).** Onboarding creates the Firebase identity via the Admin SDK *and* the local rows atomically; remove the auto-create/auto-resync loophole (G3).
9. **Unified, fail-closed dev-mode (R7, G2).** A single root-level flag governs frontend + backend; the dev bypass and self-registration are modular, dev-only, and impossible to leave enabled in prod (startup assertion).
10. Keep the frozen `UserOut` contract intact.

## 3. Non-Goals

- A second Firebase project / second backend (unchanged from 002).
- Portal transitions (a UID stays one portal — 002 §11 Q4 stands).
- **The onboarding business logic itself** — RM intake form, document upload (contracts/ID/legal), and the compliance review workflow. 004 only provides the `users.status` field (the shared two-value `AccountStatus`) these will drive (R4a); it does not implement the review, and does not add a distinct "awaiting review" state — a staged client is simply `disabled` until activated.
- Real `financial` / `documents` business logic (separate proposals).
- Building the full admin-management console UI — backend endpoints only.
- Self-service client *sign-up* as a production feature (excluded by R1; the dev-only self-registration of R7 is the sole exception and is slated to fade out).
- **Client self-service endpoints** (e.g. viewing own trade models, submitting request tickets). 004 establishes the structural convention and extensibility point for client-portal routes (`/api/client/…` prefix, `app/libs/client_portal/` module directory, import-isolation rule — see §5) but does **not** add any client-facing routes beyond login and `/me`. Actual client self-service features are separate proposals that drop into the convention.

---

## 4. Design

### 4.1 Resolved decisions (were the open questions)

The earlier draft's open questions are now settled by the approved requirements:

- **Q-A — Auth surface shape → SEPARATE, portal-scoped surfaces (R5).** `/api/auth/client/*` and `/api/auth/admin/*` over a shared verification core. The portal becomes unforgeable (it's the route, not a body field); per-portal policy (rate-limits, audit, future MFA on the admin surface) attaches cleanly. The token-verification core stays shared (one Firebase project). This portal split extends beyond the auth gateway to the **entire route surface** — see the route-branch convention in §5.
- **Q-B — "register" vs "provisioning" → RETIRE `/register` (R1).** Client creation is **RM onboarding**; admin creation is **super-admin provisioning**. The public `/register` is removed entirely (it survives only as the dev-only self-registration module of R7).
- **Q-C — Firebase identity creation → BOTH (R6), and it extends to admins.** Neither a DB row *nor* a Firebase identity may exist without an authorising actor. RM onboarding creates the client's Firebase identity via the Admin SDK; the super-admin's `POST /api/admin/staff` likewise mints the internal user's Firebase identity (R6's principle applies to admins too — confirmed). "No self-registration" therefore means no Firebase identity without an authority — closing the path that would otherwise be hard to remove later. The sole exception is the **bootstrap** (§4.10), which seeds the first `ADMIN`'s Firebase identity out-of-band because the Firebase project starts empty.
- **Q-D — bind strictness → BIND BY `uid` (R6).** Because the backend mints the identity, it owns the `firebase_uid` from creation; first login matches on `uid`, so email-drift reconciliation is moot.

All earlier open questions are now resolved (§7); no design forks remain outstanding.

### 4.2 Lifecycle model (target)

```
CLIENT
  1. RM calls  POST /api/rm/clients             (authority: CLIENT_MANAGE / RM)
        → Admin SDK: create the Firebase identity (backend owns the uid)   (R6, Q-C)
        → create users(portal=client, status='disabled') + client_profiles(name,
                                                          assigned_rm_uid=<rm>, …)
        → issue an invite / set-password link to the client                (R6)
  2. (out of 004) Compliance approves → users.status = 'active'            (R4a)
  3. Client authenticates for the first time
        → POST /api/auth/client/login  (or first authenticated call)
        → BIND by uid to the pre-provisioned row; never create             (R2, Q-D)
        → STATUS GATE: status != 'active' → 403 (account disabled)          (R4a)
        → unknown/unmatched uid → 403 (no account staged for you)

INTERNAL (admin)
  1. Super-admin calls  POST /api/admin/staff         (authority: USER_MANAGE / ADMIN only)
        → Admin SDK: create the Firebase identity (backend owns the uid)    (R6)
        → create users(portal=admin, status='active') + admin_profiles(role) (R4b)
        → issue an invite / set-password link to the internal user          (R6)
     (PATCH /api/admin/staff/{uid} manages an EXISTING admin's role/status/profile — not enrollment)
  2. Internal user authenticates
        → POST /api/auth/admin/login  → BIND by uid, never create
        → STATUS GATE: users.status != 'active' → 403 (suspended)          (R4b)

BOOTSTRAP (first super-admin)
  - Out-of-band, idempotent seed (CLI / management task, NOT an HTTP route — no authority
    exists yet to gate it): if no ADMIN exists, the Admin SDK creates the first ADMIN's
    Firebase identity (the Firebase project is empty on init) + users(portal=admin,
    status='active') + admin_profiles(role=ADMIN) + a set-password link. Never self-registerable (R3).
```

### 4.3 Kill implicit creation (G3, G6, G7)

- `_resolve_user` **no longer creates users.** Unknown verified token → `403`. It only resolves an *existing* row and refreshes email/claims. This closes the auto-resync loophole (G3, R6).
- `login_or_register` is split: the **entire create branch is removed** (this is what kills G7, not just retiring `/register`). What remains is `login_and_bind` — resolve existing by uid, refresh claim lazily, apply the status gate, never insert.
- All creation funnels through the two provisioning paths in §4.2 — the single chokepoint of Goal 2.

### 4.4 RM client onboarding (R2, R6, G4) — new endpoint

```
POST /api/rm/clients
  auth:  require_action(Action.CLIENT_MANAGE)        # RM and above
  body:  { email, name, primary_phone?, address?, country_of_residence?,
           authorized_person?, initiate_method?, assigned_rm_uid? }
  logic: - assigned_rm_uid defaults to the calling RM's uid
         - VALIDATE assigned_rm_uid → target user is admin & role == 'RM'  (assert_is_rm, §4.5)
         - Admin SDK: create the Firebase identity → obtain firebase_uid   (R6, Q-C)
         - create users(portal=client, firebase_uid=<from SDK>, status='disabled')
                 + client_profiles(...)                                    (R4a)
         - issue invite / set-password link                                (R6)
  returns: the staged client record
  failure: Firebase create fails → no DB rows; DB commit fails → compensating Firebase delete (§4.11)
```

This re-introduces a **proper `ClientProfileRepository`** (003 deleted the dead one) with real create/update/assign methods, and a `ClientService` that owns the RM-validation invariant and the Firebase-identity provisioning call.

### 4.5 Enforce the RM invariant (G5)

A single service-layer guard, called by both onboarding (§4.4) and any future "reassign RM" endpoint:

```python
def assert_is_rm(db, rm_uid: str) -> None:
    user = UserRepository(db).get_by_firebase_uid(rm_uid)
    profile = AdminProfileRepository(db).get_by_user_id(user.id) if user else None
    if not user or user.portal != Portal.ADMIN or profile is None or profile.role != AdminRole.RM:
        raise HTTPException(422, "assigned_rm_uid must reference an RM")
```

The plain FK stays (referential integrity); the role check lives where it can be expressed.

> **Q-E resolved — `assert_is_rm` is RM-literal.** `assigned_rm_uid` must reference a user whose `admin_profiles.role == 'RM'`. The *authority to onboard* is already governed by the role-action matrix (`CLIENT_MANAGE` gates the endpoint), so widening who may own a client relationship is a **matrix adjustment**, not a loosening of this invariant. Keeping the invariant literal avoids encoding policy in two places.

### 4.6 Per-portal login status gate (R4)

A single gate concept, two sources. **Scope (Q-H resolved):** the gate runs on **every authenticated client request**, in the shared client dependency — not only at `client/login` — so a client whose status flips to `disabled` mid-session is locked out on their next call (defence in depth), and it costs nothing extra since the profile is already eager-loaded. Applied **after** the user is resolved:

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

- **Simplified to one shared two-value enum, on `users`, not per-profile-table (revised 2026-07-18):** a single `users.status` column (`AccountStatus{active, disabled}`) replaces both the earlier three-value `client_profiles.status` (`pending`/`active`/`disabled`) and the separate `admin_profiles.is_active` boolean. Account status is an account-level concept (it's the same "can this identity log in" question for both portals), not a per-profile one — so it belongs on `users`, the one table both portals share, not duplicated across `client_profiles` and `admin_profiles`. There is no distinct "awaiting review" state; a newly-onboarded client is simply `disabled` until an admin/RM activates them, the same value that also represents suspension/offboarding for both portals. Profile presence (`client_profile`/`admin_profile is None`) is still checked per-portal — that's role/RM/compliance data the status column doesn't carry — but the status check itself is one column, checked once, before the portal branch.
- Client states: `disabled` (default at onboarding — also covers suspension) → `active` (compliance-approved / activated, set out of 004).
- Admin: `status` defaults `active` on provision; flipping it to `disabled` suspends without deleting the row.
- **Not enforced until the §6 migration lands** (the column doesn't exist on the live DB yet).

### 4.7 Backend-sole Firebase-identity creation & invite (R6, G9)

- A thin `FirebaseIdentityService` wraps the Admin SDK: `create_user(email) -> uid` and `generate_invite_link(email)`. It is the **only** place that creates Firebase identities in prod.
- **Invite *delivery* is deferred (Q-G).** 004 scopes only **link generation**; how the set-password link reaches the user (backend SMTP vs. handing the link to the CRM/RM) is business logic left to a later feature. The provisioning flows return/expose the generated link so a delivery channel can be plugged in without reshaping them.
- **One mechanism, three callers — no special cases:** client onboarding (§4.4), internal-admin enrollment (§4.9), and the bootstrap seed (§4.10) all mint identities through this same service. Admin identities are created exactly like client identities (R6 extends to admins).
- No-op / stubbed under the dev bypass (R7) so local smoke tests don't hit Firebase.
- The auto-create/auto-resync behaviour in `_resolve_user` is removed (§4.3) — a token can no longer materialise a local row, regardless of container state.

### 4.8 Unified dev-mode flag (R7, G2)

R7's "single root-level flag" is treated as a **contract**, not a hard dependency on a specific file — because the only injector that actually runs today is `api-backend/docker-compose.yml` (+ bare `uvicorn`); the root `docker-compose.yml` has **never been exercised** and its adoption is undecided. Three pieces, only the last coupled to the root compose:

- **Canonical name + secure default.** One flag name — `DEV_MODE` — read by both services. The backend's `dev_mode` field default flips from `True` to **`False`** (fixes G2) so *every* launch path is secure-by-default. Pydantic precedence (OS env > `.env` file > field default) makes whichever orchestrator runs authoritative for the container; **where the `.env` physically lives (api-backend vs root) is an ops decision, not an architectural one** — the backend code is identical either way.
- **Fail-closed startup assertion.** A prod marker (`APP_ENV=production`) makes the app refuse to boot when `dev_mode` *or* `firebase_auth_disabled` is on. App-layer, launch-independent.
- **Single physical injector (forward-compatible seam).** The branch keeps the backend compose authoritative and standalone, and adds a root `.env.example` documenting `DEV_MODE`/`APP_ENV` as the *eventual* single source. Both compose files already interpolate the same `${DEV_MODE}` name, so adopting the root compose later completes the single-injector story with **zero backend rework**. Also add `/.env` to the root `.gitignore` (it ignores only `.env*.local` today) so a real root `.env` carrying DB/Firebase secrets is never committed.
- The `FIREBASE_AUTH_DISABLED` dev path may still resolve the `dev-user` admin **only when the flag is on** (the assertion forbids it in prod).

> **Deferred (blocked on the root-compose adoption decision):** the frontend half of the single flag — mapping root `DEV_MODE` → a `NEXT_PUBLIC_DEV_MODE` build arg — is **build-time** (baked at image build), unlike the backend's run-time read. Out of scope here; the seam is the shared flag name. The dev-only self-registration *module* this flag gates is specified in §4.12.

### 4.9 Internal-admin enrollment (R3, R6) — promote `POST /api/admin/staff` to required

Once §4.3 removes implicit creation, this is the **only** production birth path for an internal user, so it is mandatory and specified symmetrically to client onboarding (§4.4):

```
POST /api/admin/staff
  auth:  require_action(Action.USER_MANAGE)          # ADMIN (super-admin) only — RM/others lack it
  body:  { email, name, role, phone_number? }
  logic: - VALIDATE role is a real AdminRole; whether ADMIN may be minted here is policy (Q-I)
         - Admin SDK: create the Firebase identity → obtain firebase_uid     (R6)
         - create users(portal=admin, status='active')
                 + admin_profiles(role)                                       (R4b)
         - issue invite / set-password link                                   (R6)
  returns: the enrolled internal-user record
  failure: Firebase create fails → no DB rows; DB commit fails → compensating Firebase delete (§4.11)
```

`role == ADMIN` **is permitted** here: a super-admin may enroll/promote a peer super-admin (Q-I resolved — symmetric to being able to change roles at all). The last-ADMIN guard (below) prevents removing the final one, so there is always a path to *add* a super-admin but never to drop below one.

There is **no review/approval step**: provisioning by the super-admin *is* the authorization (R4b). No `pending` state is introduced for admins.

**Account mutation is split by authority, not by field** (the old `PATCH /api/users/{uid}/role` is removed — "role" is just one mutable attribute, not a special operation):

```
PATCH /api/admin/staff/{uid}     super-admin manages ANY internal account (USER_MANAGE)
  partial-update: { role?, status?, name?, phone_number?, email? }
  - role change  → re-stamp the Firebase claim; may promote TO ADMIN (peer super-admin, Q-I resolved)
  - status       → suspend / reactivate (R4b), no row deletion
  - cannot flip portal (409 if target not admin-portal); 404 if absent
  - GUARD: refuse to demote or disable the LAST active ADMIN (R3 ≥1-ADMIN invariant)

PATCH /api/users/me              self-service, own BENIGN fields only
  { name?, phone_number?, email? }   — never role, never status
  (extends today's email-only /me; you cannot promote or un-suspend yourself)
```

A super-admin may read and edit every account (including colleagues' benign fields) via the staff endpoint; ordinary internal users edit only their own contact info via `/me`. Neither endpoint enrolls — creation stays in §4.9's `POST /api/admin/staff`.

> **`email` edits are local-only for now:** both endpoints update the local contact email; they do **not** change the Firebase login credential (binding is by `uid`, so the local email is contact/display info). Propagating an email change to the Firebase identity is a deferred later feature (see §7).

### 4.10 Bootstrap the first super-admin (R3, G11) — seeds Firebase + DB

A fresh deployment has an **empty Firebase project and an empty `users` table**, so no authority exists to call §4.9. The bootstrap is therefore an **out-of-band, idempotent seed** — a CLI / management task, **not** an HTTP route (there is no super-admin yet to gate one) — driven by deploy-time config (e.g. `BOOTSTRAP_ADMIN_EMAIL`):

```
1. If any admin_profiles.role == ADMIN already exists → no-op (idempotent).
2. Else: Admin SDK creates the first ADMIN's Firebase identity (the Firebase basis is empty
   on project init, so the seed must create it there too) → obtain firebase_uid.
3. create users(portal=admin, status='active') + admin_profiles(role=ADMIN).
4. issue a set-password / invite link so the human operator can set their credential.
```

Satisfies the R3 bootstrap invariant (≥1 seeded `ADMIN`, never self-registerable) and reuses the same `FirebaseIdentityService` (§4.7) as onboarding/enrollment — one identity-creation mechanism, no special case. After bootstrap, all further internal users come through §4.9.

### 4.11 Cross-system consistency: Firebase ↔ local DB (resolves the atomicity gap)

Provisioning writes to two systems with no shared transaction (Firebase Admin SDK, then the local DB).

**Source of truth, precisely.** "Source of truth" splits in two: **Firebase is authoritative for credential existence / authentication** (it stores the account + password hash and verifies tokens); the **local provisioning record (`users` + profile) is authoritative for authorization** (portal, role, status, assigned RM). Under R6 the backend is the *sole* creator of Firebase identities, and it writes the identity and the local rows in one provisioning operation — so any divergence between the two is the **residue of a failed provisioning, never a legitimate state** (in particular, a bare Firebase identity is *not* "an account awaiting enrichment").

**Inconsistency classes & severity.** All are low-severity by construction, because the §4.6 status gate **fails closed**: a token that does not resolve to an active, fully-profiled account is `403`'d, so a broken record is **inert**, not exploitable.

| Class | State | Repair |
|---|---|---|
| **A — Firebase orphan** | Firebase identity, no `users` row | failed onboard/enroll commit. Quarantine→delete (layer 3); **never promote** (that would be the auto-create R6 forbids). |
| **B — missing credential** | `users` + profile row, no Firebase identity | Firebase create failed, or identity later deleted. Surface for **re-invite** (re-mint credential) — the authority record survives, so it is recoverable. |
| **C — incomplete record** | Firebase identity + `users` row, **no profile row** | a profile row deleted out-of-band. Login already `403`s (the gate sees `profile is None`). Surface to a **super-admin to re-enrich or purge** — the lost business data (role/status/RM) cannot be reconstructed automatically. |

> The inverse of class C (delete the `users` row, keep the profile) is bounded by the profile→`users` foreign key: it either cascades the profile away (→ class A) or is refused, so it is not a separate class.

We handle these in three layers:

1. **Synchronous compensation (primary — class A).** Order: create the Firebase identity → open a DB transaction → insert `users` + profile → commit. If the commit fails, **best-effort `delete_user(uid)`** in the `except` path (treat `UserNotFoundError` as success; log email + reason at `WARNING`). This is a **saga compensation** — there is no cross-system transaction, so we emulate rollback; the local insert is itself one DB transaction, so the *local* side is truly atomic. Collapses the orphan window to "commit failed **and** compensation failed."
2. **Idempotent provisioning (class A retries).** Keyed by **email** (no `uid` exists yet — `uid` is only the *login*-binding key, Q-D). Before creating, `get_user_by_email`: both exist → `409`; **Firebase identity exists but no `users` row → adopt its `uid`** and finish the local insert (the retry *self-heals* a prior class-A orphan — still authority-gated, so not auto-create); neither → normal path. The `users.firebase_uid` UNIQUE constraint backstops the concurrent race (second commit fails → compensation fires).
3. **On-demand drift report (backstop for all three), not a scheduled sweep.** Post-§4.3, a class-A orphan (bare Firebase identity, no `users` row) already cannot authenticate — the gate closes on the missing row, not on a quarantine flag — so there is nothing live to stage-and-observe. One idempotent, run-on-demand tool **classifies and surfaces, never auto-completes business data**:
   - **Class A** past a simple age cutoff → delete directly (no `disabled=True` staging step; the identity was already unreachable without a DB row, so there is no window where deleting it early would revoke a working credential).
   - **Class B / C** → always report-only, for the operator (re-invite for B; re-enrich-or-purge for C). Never reconstructed automatically, since the missing data carries authority/business context the tool cannot infer.

> No scheduler is built. The tool is a CLI an operator runs by hand, or that an existing ops cron can point at — that's an infra decision, not an architectural one, and is out of scope here. Tracked in the `identity-drift-report` branch.

### 4.12 Dev-only self-registration module (R7) — keeps the legacy flow without the loophole

The legacy UX is **kept in dev**: a user self-registers (the frontend creates the Firebase identity via the client SDK → ID token → backend creates the local row), then lands directly on the dashboard rather than bouncing back to a login page. That frontend-minted-token flow is exactly what *justified* the old implicit creation — so the rework keeps the flow but removes the conflation that made it a hole.

**Principle: authentication binds, it never creates — in *every* mode. Creation is always an explicit, named provisioning endpoint.** Dev self-registration is simply a **third provisioning surface** alongside the two prod ones — one that trusts a frontend-minted token instead of minting the identity itself — and it is **physically absent in prod** (its router is not mounted when `dev_mode` is off; the §4.8 assertion makes `dev_mode` impossible in prod). The danger before was a *prod* login path that accepted frontend-minted tokens and created rows; that path is gone.

| Provisioning surface | Mints Firebase identity | Mints local row | Mounted |
|---|---|---|---|
| `POST /api/rm/clients` (§4.4) | backend (Admin SDK) | backend | always |
| `POST /api/admin/staff` (§4.9) | backend (Admin SDK) | backend | always |
| `POST /api/dev/register` | **frontend (client SDK)** | backend | **iff `dev_mode`** |
| `login_and_bind` / `_resolve_user` (§4.3) | — | **never** | always |

```
POST /api/dev/register     (dev-only module app/libs/dev/, mounted iff settings.dev_mode)
  body:  { id_token, portal, role? }       # role trusted for admin portal in DEV ONLY
  logic: - VERIFY id_token via the shared verification core
         - must-be-new: 409 if a row already exists for this uid
         - create users(portal) + profile via the SAME ClientService / staff primitives
           as real onboarding, MINUS the FirebaseIdentityService.create_user call
           (the frontend already minted the identity)
         - dev convenience: users.status='active' at creation, for either portal
           (the user reaches the dashboard immediately — no compliance/enrollment step in dev)
  returns: UserOut → frontend navigates to the dashboard (already holds the token; no re-login)
```

Because `_resolve_user` no longer auto-creates in any mode (§4.3), the dev **login** page *binds only* — an unknown token is `403` even in dev — so `/api/dev/register` is the single dev birth path (the register page provisions; the login page binds). The legacy `requested_role` body-trust (`router.py:29`) moves wholesale into this module and dies with it. Dev rows are built through the onboarding primitives, so they are **fully-formed**, not the degenerate empty-profile rows the old auto-create produced (G4).

**Why this is not the old hole:** creation is *one* named endpoint (not scattered across `_resolve_user` + `/login` + `/register`); *unreachable* in prod (module unmounted + fail-closed assertion, not a runtime `if`); triggered by an explicit register call (not by authenticating). The auth-layer auto-create is removed in **all** modes.

> **Future hardening (not this branch):** running the Firebase Auth Emulator in dev would let the backend mint identities via the Admin SDK even in dev, mirroring prod and removing the frontend/backend asymmetry — at the cost of changing the kept flow. Noted as optional, not adopted.

---

## 5. API Surface (proposed)

```
/api/auth/client/login     bind existing client by uid; 403 if no staged/active account  (was /auth/login)
/api/auth/admin/login      bind existing internal user; 403 if disabled                  (was /auth/login)
/api/auth/me               shared, portal-agnostic                                       (unchanged)
/api/auth/logout           unchanged
POST /api/rm/clients       RM onboards a client (Firebase identity + DB rows + invite)    (NEW, R2/R6)
POST /api/admin/staff      super-admin ENROLLS an internal user                           (NEW, R3/R6)
                           (Firebase identity + users(portal=admin) + admin_profiles + invite)
PATCH /api/admin/staff/{uid} super-admin manages any internal account                      (NEW, replaces /role)
                           (role | status | name | phone | email; last-ADMIN guard)
PATCH /api/users/me        self-service: own benign fields (name | phone | email)          (extends today's /me)
(bootstrap)                first ADMIN seeded out-of-band via CLI, not an HTTP route       (NEW, R3 §4.10)
— REMOVED: PATCH /api/users/{uid}/role  (role is now one field of PATCH /api/admin/staff/{uid})
— DEV-ONLY (mounted iff dev_mode): POST /api/dev/register  self-registration module       (R7)
— REMOVED: POST /api/auth/register
```

Separate `/api/auth/client` · `/api/auth/admin` prefixes are confirmed (R5/Q-A). `/register` is retired from the production surface.

### Route-branch convention (two-branch split)

The backend mirrors the two isolated frontend portals (`admin-frontend`, `client-frontend`). Every HTTP route — except the auth gateway and the shared `/users/me` — belongs to exactly one branch:

| Branch | Prefix convention | Auth dependency | Audience | Modules (004 scope) |
|---|---|---|---|---|
| **Internal** | `/api/rm/…`, `/api/admin/…` | `get_current_admin_user` + admin-scoped actions | admin-frontend operators (RM, MOBO, ADMIN) | `clients/` (prefix `/rm`), `staff/` (prefix `/admin/staff`) |
| **Client** | `/api/client/…` | `get_current_client_user` + client-scoped actions | client-frontend users | convention only in 004 — no routes yet (`app/libs/client_portal/`) |
| **Shared** | `/api/auth/…`, `/api/users/…` | portal-scoped login or `get_current_user` | both portals | `auth/`, `users/` |
| **Dev-only** | `/api/dev/…` | unauthenticated (mounted iff `dev_mode`) | local development | `dev/` |

**Isolation rule:** no internal-branch module may be imported by a client-branch module, and vice versa. Shared modules (`auth`, `users`, `identity`) and read-only repositories are the only cross-branch dependencies. A client-portal route that needs client-record data reads from its own repository or a shared read-only query — never by importing `app.libs.clients.*` (which is the RM's internal write surface into those same tables).

**`main.py` mount grouping:** routers are mounted in named groups (internal / client / shared / dev-only), enforced by code comments and mount ordering. Future proposals adding client-portal routes drop their `include_router` call into the marked "Client" section. See the BE impl doc (§4) for the concrete `main.py` snippet.

**Why this convention lives in 004:** the portal-scoped auth split (Q-A / R5) is only half the separation if the non-auth routes remain ungrouped. Establishing the branch convention now — before client self-service proposals arrive — ensures those proposals inherit a clean extensibility point (`/api/client/…` prefix, `app/libs/client_portal/` directory, import boundary) rather than having to retrofit one.

---

## 6. Migration & Compatibility

- **R4 schema change (NEW, required by this proposal; status model revised 2026-07-18):** add columns to `users` —
  - `users.status` (enum/string; shared `AccountStatus`: `active` | `disabled`; default `disabled`) — **one column on `users`, shared by both portals**, replacing the originally-proposed three-value `client_profiles.status` (`pending`/`active`/`disabled`) *and* the separate `admin_profiles.is_active` boolean. Account status is one account-level concept, not a per-profile one, so it lives on the table both portals share rather than being duplicated across `client_profiles` and `admin_profiles`.
  - `users.authorized_by` (audit trail, Q-F resolved): nullable FK → `users.firebase_uid` recording **who authorised this account** — the onboarding RM for a client, the enrolling super-admin for an internal user, `NULL` for the bootstrap ADMIN and pre-rework rows. (Named `authorized_by`, not `provisioned_by`.)
  - **Column placement:** both new columns are added **before** the two timestamp columns (`created_at`, `updated_at`) on `users`, to match the established layout. `client_profiles` and `admin_profiles` get no new columns from this proposal.
  - **Alembic migration with safe backfill** over the live data (row counts re-queried at migration time, not assumed from any prior figure): all existing users (both portals) → `status = active` (so current users are not locked out — a conscious grandfather decision, since new clients now default to `disabled`), all existing rows → `authorized_by = NULL` (provenance unknown pre-rework).
  - **Dropped from this proposal:** the earlier three-value `pending`/`active`/`disabled` client status. There is no distinguishable "staged, awaiting compliance review" state — a newly-onboarded client is `disabled` (the same value used for suspension/offboarding) until an admin/RM activates them. If a future proposal needs to distinguish "never activated" from "suspended after being active," that is a new column/state, not a revival of `pending`.
  - The status gate (§4.6) **must not be enforced until this migration is applied.**
- Otherwise **no schema change is strictly required** — `users` + `client_profiles` + `admin_profiles` from 002/005 already support the rest. (A future "invite token" column may be wanted; deferred.)
- **Frontend impact:** both frontends stop calling `/register` and rely on provisioned accounts. The client-frontend's first-login flow changes from "register-or-login" to "login-and-bind." Both read the new root-level dev-mode flag (R7). Coordinate before merge.
- **Existing users:** all 15 migrated rows already have a `portal` and a profile, so bind-on-login works immediately; the backfill makes them `active`.
- **The frozen `UserOut` contract is unaffected.**

---

## 7. Open Questions

**Resolved:** **Q-A** separate surfaces · **Q-B** retire `/register` · **Q-C** backend creates Firebase identity ("both", incl. admins) · **Q-D** bind by `uid` (all §4.1) · **Q-E** `assert_is_rm` stays RM-literal; onboarding authority is widened (if ever) via the role-action matrix, not the invariant (§4.5) · **Q-F** add `users.authorized_by` audit column (§6) · **Q-G** 004 generates the invite link; *delivery* is deferred to a later feature (§4.7) · **Q-H** status gate runs on every authenticated client request (§4.6) · **Q-I** a super-admin **may** create/promote a peer `ADMIN`; the last-ADMIN guard prevents dropping below one (§4.9).

No design forks remain open.

**Deferred to later features (out of 004):**

- **Email-change ↔ Firebase sync.** Editing `email` via `PATCH /staff/{uid}` or `/me` updates the **local contact email only**; it does **not** change the Firebase login credential. A mechanism to propagate an email change to the Firebase identity (Admin SDK) is required but is business logic for a later update.
- **Invite delivery channel** (Q-G) and the **frontend half of the dev-mode flag** (§4.8 — root `DEV_MODE` → `NEXT_PUBLIC_DEV_MODE` build arg, blocked on the undecided root-compose adoption) — seams defined here, implementations later. The dev-only self-registration *module* itself is **in scope** and specced in §4.12.
- **Class-C operator repair tooling (§4.11).** 004 specs how the sweep *detects and surfaces* a class-C record (Firebase identity + `users` row, profile deleted out-of-band) and confirms login already fails closed. The **operator-facing repair action itself** — an admin tool/endpoint to either *re-enrich* the missing profile (re-provide role/status/RM) or *purge* the account from both MariaDB and Firebase — is deferred. It cannot be automated (the lost business data carries authority context the system can't infer), so it needs a deliberate operator workflow built later. Keep in mind.

---

## 8. Verification (planned)

| Scenario | Expected |
|---|---|
| Unknown valid token → any authenticated route | `403` (no auto-create) |
| `POST /api/auth/register` (prod) | `404` (route removed) |
| `POST /api/auth/login {portal:"admin"}` for a new token | `404`/`403` — create branch removed (G7) |
| RM `POST /api/rm/clients` | `201`; Firebase identity created; `users(portal=client, status='disabled')` + profile with `assigned_rm_uid` = RM |
| Non-RM (e.g. MOBO) calls `POST /api/rm/clients` | `403` (lacks `CLIENT_MANAGE`) |
| Onboard with `assigned_rm_uid` pointing at a PM | `422` (RM invariant) |
| Firebase create fails mid-onboard | no DB rows committed |
| DB commit fails after Firebase create | compensating Firebase delete fires; orphan (if any) is inert — `403`, no local row (§4.11) |
| Reconciliation sweep finds an orphaned Firebase identity (class A) | quarantined (`disabled`) then deleted after grace; never promoted to an account |
| Profile row deleted out-of-band, `users` + Firebase identity remain (class C) | login `403`s (gate sees `profile is None`); sweep surfaces it for super-admin re-enrich/purge; never auto-reconstructed |
| Retried onboard after a prior failed commit left a class-A orphan | idempotency adopts the existing Firebase `uid`, completes the local insert; no duplicate identity |
| Super-admin promotes an internal user to `ADMIN` via `PATCH /staff/{uid}` | `200`; peer super-admin created (Q-I) |
| Onboarded client's first `client/login` (`status='disabled'`, not yet activated) | `403` (status gate) |
| Same client after admin/RM sets `status='active'` | `200`; binds by uid to staged row, no new row |
| Suspended admin (`status='disabled'`) login | `403` (status gate) |
| Super-admin `POST /api/admin/staff` | `201`; Firebase identity created; `users(portal=admin, status='active')` + `admin_profiles(role)`; invite issued |
| Non-super-admin (e.g. RM) calls `POST /api/admin/staff` | `403` (lacks `USER_MANAGE`) |
| Super-admin `PATCH /api/admin/staff/{uid}` (role / status / profile) | `200`; partial update applied; claim re-stamped on role change |
| `PATCH /api/admin/staff/{uid}` demoting/disabling the last active `ADMIN` | `409` (last-ADMIN guard) |
| `PATCH /api/admin/staff/{uid}` on unknown uid / a client | `404` / `409` (not admin-portal) |
| Non-super-admin calls `PATCH /api/admin/staff/{uid}` | `403` (lacks `USER_MANAGE`) |
| Internal user `PATCH /api/users/me` with `role`/`status` in body | those fields ignored/rejected (self cannot promote or un-suspend) |
| Bootstrap on empty Firebase + empty DB | seeds one `ADMIN` (Firebase identity + rows + link); re-run is a no-op (idempotent) |
| Client token → admin route | `403` (portal gate, unchanged) |
| `FIREBASE_AUTH_DISABLED=true` locally | dev-user admin resolves; prod marker absent |
| Prod config with `dev_mode`/bypass on | startup assertion fails (fail-closed) |
| Dev-only `/api/dev/register` mounted in prod | not mounted (404) |
| Dev `POST /api/dev/register` (`dev_mode` on) for a new frontend-minted token | `201`; fully-formed row (`active`); dashboard reachable, no re-login (§4.12) |
| Dev login with an unknown token (`dev_mode` on) | `403` — auth binds only, even in dev (§4.12) |
| Re-`POST /api/dev/register` for an existing uid | `409` (must-be-new) |

---

## 9. Relationship to 003

003 removes the dead `ClientProfileRepository`, `CLIENT_ACTIONS`, and duplicated extraction helpers. 004 **re-introduces** a real `ClientProfileRepository` + `ClientService` (with the RM invariant, status field, and Firebase-identity provisioning) and consolidates onto the single extraction helper 003 leaves behind. Do 003 first so 004 starts from a clean, honest tree.
