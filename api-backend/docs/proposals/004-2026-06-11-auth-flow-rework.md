# 004 — Authentication Flow Rework (Client + Internal Users)

**Date:** 2026-06-11
**Branch:** TBD (`auth-flow-rework`, off the cleaned tree from 003)
**Status:** Draft
**Author:** QinQipeng
**Builds on:** [002 — Separating Client and Admin Handling](002-2026-06-10-client-admin-separation.md)
**Requires first:** [003 — Refactor Basis](003-2026-06-11-refactor-cleanup-placeholders.md) · [005 — Database Foundation Cleanup](005-2026-06-11-database-foundation-cleanup.md)

> **Sequencing:** 005 establishes the UUID keys and seeds `assigned_rm_uid`/RM pool that 004's onboarding writes against. Land **003 → 005 → 004**. 004 re-introduces the real `ClientProfileRepository` (003 deletes the dead one) and re-adds `CLIENT_VIEW`/`CLIENT_MANAGE` (003 trims them out).

---

## 1. Context and Motivation

002 gave every user a durable `portal` identity and a dependency-layer gate. But a review of the resulting auth flow (oriented around the next business goals) found that **the way users come into existence does not match how the business actually onboards them.** Three target requirements are not satisfied today:

> **R1.** In **production**, neither clients nor internal users may self-register.
> **R2.** An internal user — specifically an **RM** — onboards the client on the client's behalf.
> **R3.** A client's first authentication should *bind* them to the account their RM already created, not mint a new one.

### 1.1 What the code does today (the gaps)

| # | Finding | Location | Why it violates R1–R3 |
|---|---|---|---|
| G1 | **Clients can self-register in prod.** The `/register` guard only blocks `portal == "admin"`. | `app/libs/auth/router.py:22` | Violates R1 for clients. |
| G2 | **`dev_mode` defaults to `True`**, so even the admin guard (`not settings.dev_mode`) is off by default. | `app/core/config.py:20` | The one existing guard is disabled out of the box. |
| G3 | **Any valid token auto-creates a user.** `_resolve_user` silently calls `create_client(uid, email)` for unknown tokens on *any* authenticated endpoint. | `app/libs/auth/deps.py:47` | Registration is bypassable entirely — violates R1 and R3. |
| G4 | **No RM-onboarding path exists.** Client rows are only ever born implicitly (G3 or the dev bypass), always with an *empty* profile. | `app/libs/users/repository.py:28` | No mechanism for R2. |
| G5 | **`assigned_rm_uid` invariant is unenforceable.** The model comment admits "must be an RM… enforce in the service layer," but no setter or validation exists. | `app/models/users.py:96` | R2's core relationship is unprotected. |
| G6 | **Account creation is decided in three disconnected places** (register guard, auto-provision, dev bypass). | `router.py`, `deps.py` ×2 | No single chokepoint — every new endpoint can re-open the hole. |

**Root cause (altitude):** user creation is currently an *implicit side effect of authentication*. The business requires it to be an *explicit, authority-gated provisioning operation*. R1–R3 are all the same fix viewed from different angles.

---

## 2. Goals

1. **No self-registration in production.** No code path may create a user from a token alone — for either portal.
2. **One provisioning chokepoint.** Exactly one place decides "this identity may become a user," and it requires authority (an existing admin) — never an anonymous token.
3. **RM onboards clients (R2).** A first-class endpoint lets an authorised internal user (RM, or higher) create a client record up front — setting profile fields and `assigned_rm_uid` — *before* the client ever logs in.
4. **Bind-on-first-login (R3).** A client's first authenticated request binds their Firebase UID to the pre-provisioned record; it never creates a new one. Unknown tokens are rejected.
5. **Enforce the RM invariant (G5).** `assigned_rm_uid` may only point at an internal user whose `admin_profiles.role == 'RM'`, validated in the service layer at assignment time.
6. **Admin provisioning stays super-admin-only**, building on the existing `PATCH /users/{uid}/role` (`USER_MANAGE`) path.
7. Preserve the dev bypass for local smoke tests, but behind a flag that is **off in production** (fixes G2; addresses FR-2).
8. Keep the frozen `UserOut` contract intact.

## 3. Non-Goals

- A second Firebase project / second backend (unchanged from 002).
- Portal transitions (a UID stays one portal — 002 §11 Q4 stands).
- Real `financial` / `documents` business logic (separate proposals).
- Building the full admin-management console UI — backend endpoints only.
- Self-service client *sign-up* as a product feature (explicitly excluded by R1; if ever wanted, it returns as its own proposal).

---

## 4. Design

### 4.1 The two open questions this draft must settle

Both are carried over from the earlier design discussion and gate the rest of §4:

- **Q-A — Auth surface shape.** Separate, portal-scoped auth routes (`/api/auth/client/*`, `/api/auth/admin/*`) over a shared verification core, **vs.** one shared route set with a `portal` parameter (today's shape). Recommendation: **separate surfaces** — the portal becomes unforgeable (it's the route, not a body field), and per-portal policy (rate-limits, audit, future MFA on the higher-value admin surface) attaches cleanly. The token-verification core stays shared (one Firebase project).
- **Q-B — "Registration" vs "provisioning" naming.** Client and admin account creation are *different operations with different authority*, so they should not share a `register` endpoint. Recommendation: model client creation as **RM onboarding** and admin creation as **super-admin provisioning**; retire the public `/register` entirely.

### 4.2 Lifecycle model (target)

```
CLIENT
  1. RM calls  POST /api/admin/clients          (authority: CLIENT_MANAGE / RM)
        → creates users(portal=client) + client_profiles(name, assigned_rm_uid=<rm>, …)
        → optionally pre-creates the Firebase user / sends an invite (see Q-C)
  2. Client authenticates for the first time
        → POST /api/auth/client/login  (or first authenticated call)
        → BIND: match the token's uid/email to the pre-provisioned row; never create
        → unknown/unmatched token → 403 (no account staged for you)

INTERNAL (admin)
  1. Super-admin calls  PATCH /api/users/{uid}/role   (existing, USER_MANAGE)
        → upserts admin_profiles(role); stamps portal=admin claim
     (or a new POST /api/admin/staff that also creates the users row up front)
  2. Internal user authenticates
        → POST /api/auth/admin/login  → BIND only, never create
```

### 4.3 Kill implicit creation (G3, G6)

- `_resolve_user` **no longer creates users.** Unknown verified token → `401`/`403`. It only resolves an *existing* row and refreshes email/claims.
- `login_or_register` is split: the "register" half is removed; what remains is `login_and_bind` (resolve existing, refresh claim lazily, never insert).
- All creation funnels through the two provisioning endpoints in §4.2 — the single chokepoint of Goal 2.

### 4.4 RM client onboarding (R2, G4) — new endpoint

```
POST /api/admin/clients
  auth:  require_action(Action.CLIENT_MANAGE)        # RM and above
  body:  { email, name, primary_phone?, address?, country_of_residence?,
           authorized_person?, initiate_method?, assigned_rm_uid? }
  logic: - assigned_rm_uid defaults to the calling RM's uid
         - VALIDATE assigned_rm_uid → target user is admin & role == 'RM'  (fixes G5)
         - create users(portal=client) + client_profiles(...)
         - (Q-C) provision/invite the Firebase identity
  returns: the staged client record
```

This re-introduces a **proper `ClientProfileRepository`** (003 deleted the dead one) with real create/update/assign methods, and a `ClientService` that owns the RM-validation invariant.

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

### 4.6 Dev bypass behind a prod-off flag (G2, FR-2)

- `dev_mode` default flips to `False` (or the bypass is gated solely on `firebase_auth_disabled`, which must be `False` in prod config).
- The `FIREBASE_AUTH_DISABLED` dev path may still resolve/create the `dev-user` admin **only when the flag is on** — documented as never-in-prod and asserted at startup if a prod marker is set.

---

## 5. API Surface (proposed)

```
/api/auth/client/login     bind existing client; 403 if no staged account     (was /auth/login)
/api/auth/admin/login      bind existing internal user                         (was /auth/login)
/api/auth/me               shared, portal-agnostic                             (unchanged)
/api/auth/logout           unchanged
POST /api/admin/clients    RM onboards a client                                (NEW, R2)
PATCH /api/users/{uid}/role super-admin provisions/updates an admin            (exists; keep)
POST /api/admin/staff      (optional) create internal user up front            (NEW, optional)
— REMOVED: POST /api/auth/register
```

Whether the trees use `/api/auth/client` · `/api/auth/admin` prefixes (Q-A) or stay flat is the main structural decision. Either way, `/register` is retired.

---

## 6. Migration & Compatibility

- **No schema change is strictly required** — `users` + `client_profiles` + `admin_profiles` from 002 already support this. (A future "invite token" column may be wanted for Q-C; deferred.)
- **Frontend impact:** both frontends must stop calling `/register` and rely on provisioned accounts. The client-frontend's first-login flow changes from "register-or-login" to "login-and-bind." Coordinate before merge.
- **Existing users:** all 15 migrated rows already have a `portal` and a profile, so bind-on-login works for them immediately.
- **The frozen `UserOut` contract is unaffected.**

---

## 7. Open Questions

- **Q-A** — separate `/api/auth/client` · `/api/auth/admin` surfaces vs. flat shared routes. *(Recommend separate.)*
- **Q-B** — retire `/register` entirely vs. keep it admin-only as a thin alias. *(Recommend retire.)*
- **Q-C — Firebase identity creation.** When an RM onboards a client who has no Firebase account yet, does the backend (a) create the Firebase user via Admin SDK + send an invite/reset link, or (b) only stage the DB row and let the client self-create their Firebase credential, then bind on first login by email match? This is the biggest behavioural decision — it determines whether "no self-registration" means "no DB row without an RM" (b) or also "no Firebase identity without an RM" (a).
- **Q-D** — how strict is bind-by-email? If a client signs into Firebase with a different email than the RM entered, does binding fail closed (safer) or fall back to manual reconciliation?
- **Q-E** — should `assert_is_rm` allow higher roles (PM/PC/ADMIN) to also be assignable as a client's relationship owner, or is "RM only" literal?
- **Q-F** — audit trail: do we record who provisioned/onboarded each user (R1/R2 compliance)? Likely yes — a `provisioned_by` column is a small add worth deciding now.

---

## 8. Verification (planned)

| Scenario | Expected |
|---|---|
| Unknown valid token → any authenticated route | `403` (no auto-create) |
| `POST /api/auth/register` | `404` (route removed) |
| RM `POST /api/admin/clients` | `201`; `users(portal=client)` + profile with `assigned_rm_uid` = RM |
| Non-RM (e.g. MOBO) calls `POST /api/admin/clients` | `403` (lacks `CLIENT_MANAGE`) |
| Onboard with `assigned_rm_uid` pointing at a PM | `422` (RM invariant) |
| Onboarded client's first `client/login` | `200`; binds to staged row, no new row |
| Client token → admin route | `403` (portal gate, unchanged) |
| `FIREBASE_AUTH_DISABLED=true` locally | dev-user admin resolves; prod marker absent |
| Prod config with `dev_mode`/bypass on | startup assertion fails (fail-closed) |

---

## 9. Relationship to 003

003 removes the dead `ClientProfileRepository`, `CLIENT_ACTIONS`, and duplicated extraction helpers. 004 **re-introduces** a real `ClientProfileRepository` + `ClientService` (with the RM invariant) and consolidates onto the single extraction helper 003 leaves behind. Do 003 first so 004 starts from a clean, honest tree.
