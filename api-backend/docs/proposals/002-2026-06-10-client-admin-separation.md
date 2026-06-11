# 002 — Separating Client and Admin Handling (Database + API)

**Date:** 2026-06-10
**Branch:** `client-admin-separation`
**Status:** Draft
**Author:** QinQipeng
**Builds on:** [001 — Modular Backend Architecture](001-2026-05-26-modular-backend-architecture.md)

---

## 1. Context and Motivation

The backend serves **two frontends from one Firebase project and one API**: the external client portal and the internal admin portal. Today both are handled by a single, undifferentiated user model:

- One `users` table (`app/models/users.py`) with a `role` column (`CLIENT | RM | PM | PC | COMPLIANCE | ADMIN`).
- A single `/api/auth/*` flow and a single `get_current_user` dependency that resolves any Firebase token to a row in that table.
- The `portal` field on `FirebaseLoginBody` (`"client" | "admin"`) is **read but never persisted**. `POST /api/auth/register` uses it only to gate admin self-registration and to decide whether to trust a `requested_role`; `POST /api/auth/login` ignores it entirely. Nothing in the database or token records which world a user belongs to.

This produces three concrete problems:

- **No durable portal identity.** After registration, there is no field anywhere that says "this UID is a client" vs. "this UID is internal staff." Separation exists only in the transient request body.
- **Schema pollution is coming.** Client users will accumulate KYC status, account numbers, assigned-RM links, and onboarding state. Admin users will accumulate department, assigned-client scope, and audit fields. Forcing both into one flat `users` row guarantees a wide table full of columns that are null for half the rows.
- **No enforcement boundary between portals.** A token minted for the client portal can call any admin route the user's `role` happens to permit. There is no portal-level gate — only per-role action checks, which were designed for *internal* role granularity, not for *client-vs-staff* isolation.

This proposal separates the two populations at three layers — **identity claim**, **database**, and **API surface** — without creating a second Firebase project, a second backend deployment, or breaking the frozen `client-frontend` contract from proposal 001.

---

## 2. Goals

1. Every user carries a durable, server-controlled `portal` identity (`client` or `admin`) that the backend trusts on every request without a DB round-trip.
2. Client-specific and admin-specific data live in separate tables, each free to evolve without touching the other.
3. A client-portal token cannot reach an admin route (and vice versa) — enforced once, at the dependency layer, before any handler runs.
4. The frozen `UserOut` contract (`id`, `firebase_uid`, `email`, `role`) continues to serialise byte-for-byte for both portals.
5. The dev bypass (`FIREBASE_AUTH_DISABLED=true`) keeps working for local smoke tests.

## 3. Non-Goals

- Creating a second Firebase project or additional Firebase apps. **Confirmed out of scope** — one project, two frontends, one backend.
- Splitting into two deployable services. One FastAPI process remains.
- Implementing the financial or document modules. **Confirmed:** placeholders stay as-is; this proposal only restructures the auth/user/identity layer they will later sit behind.
- Multi-tenancy beyond the client/admin split (e.g. per-organisation isolation).
- Admin-configurable permissions (already deferred in 001 §10).

---

## 4. The Mechanism: Firebase Custom Claims

Firebase's documented answer to "one project, two user populations" is **custom claims** — server-set metadata embedded in the user's ID token. The Admin SDK writes them; every subsequent token the frontend sends carries them in the verified payload, with no extra lookup.

```python
# Set once, server-side, when a user is provisioned into a portal:
from firebase_admin import auth
auth.set_custom_user_claims(uid, {"portal": "client"})            # client registration
auth.set_custom_user_claims(uid, {"portal": "admin", "role": "RM"})  # admin provisioning
```

The verified claims dict returned by `verify_id_token` / `verify_firebase_token` then contains `claims["portal"]`. The backend reads it directly to know which world the request belongs to.

**Why claims and not just a DB column:** the claim is available at token-verification time, before we touch the database, so the portal gate is a pure token check. The DB `portal` column (added in §5) is the persistent source of truth and the thing claims are derived from; the claim is the fast-path mirror. They are kept in sync by the provisioning flow (§7).

**Dev mode caveat.** When `FIREBASE_AUTH_DISABLED=true`, no real Firebase user exists, so `set_custom_user_claims` is a no-op and tokens are decoded unverified. In dev mode the portal must fall back to (a) the `portal` field in the request body for `/register` and `/login`, and (b) the DB `portal` column for authenticated requests. This is handled explicitly in §7.4 so dev and prod paths stay symmetrical in behaviour.

---

## 5. Database Design

### 5.1 Shape: one identity table, two profile tables

```
users  (identity registry — one row per Firebase UID, both portals)
├── id                    PK
├── firebase_uid          unique, indexed
├── email                 Firebase auth email (login identity)
├── portal                NEW  ENUM('client','admin')  NOT NULL, indexed
├── created_at
└── updated_at

client_profiles  (NEW — client-portal domain data)
├── id                    PK
├── user_id               FK → users.id, unique
├── name                  full legal name
├── primary_phone
├── assigned_rm_uid       FK → users.firebase_uid (the assigned RM)
├── address
├── country_of_residence
├── authorized_person     name of authorised representative (single string)
├── initiate_method       how the client was onboarded/initiated
├── created_at
└── updated_at
   (future: kyc_status, account_number, onboarding_state, ...)
   (contact email = users.email; KYC identity docs stored as files, not columns)

admin_profiles  (NEW — admin-portal domain data)
├── id                    PK
├── user_id               FK → users.id, unique
├── name                  full name of the internal user
├── role                  ENUM('RM','PM','PC','COMPLIANCE','ADMIN')  NOT NULL
├── phone_number
├── created_at
└── updated_at
   (future: department, assigned_client_ids, audit_scope, ...)
```

Field types (SQLAlchemy `Mapped` columns): all string fields default to `String(255)` and nullable unless noted. `name` (both profiles), `country_of_residence`, `initiate_method`, `authorized_person` are `String(255)`; `address` as `Text` (longer, multi-line). `assigned_rm_uid` as `String(128)` with a foreign key to `users.firebase_uid` (which is already `unique`). `admin_profiles.phone_number` and `client_profiles.primary_phone` as `String(32)`.

> **Resolved field decisions** (§11 Q6–Q9):
> - **Email = login email.** Neither profile stores a separate email. `users.email` is the single source for both portals; for admins it *is* the listed "email." The new admin profile fields are `name` and `phone_number`.
> - **Assigned RM by Firebase UID.** `assigned_rm_uid` is a foreign key to `users.firebase_uid`, not a free-text email. The RM's email/name is surfaced in API responses by joining through `users` → `admin_profiles`. Guarantees the RM is a real user and survives email changes.
> - **No `id_information` column.** KYC identity documents are stored as files (PDF/PNG) by the documents module, not as profile columns. Dropped.
> - **`authorized_person` is a single name string.** Not a structured child record.

### 5.2 Rationale

- **`users` stays the anchor.** It is the only place that maps a Firebase UID to an internal id. Every auth dependency resolves against it first, regardless of portal. Adding only `portal` here keeps it thin.
- **`role` moves to `admin_profiles`.** A role only has meaning for internal staff. Clients have no role — their identity *is* "client." This removes the awkward situation today where every client row carries `role = CLIENT` as a placeholder. The `UserRole` enum splits accordingly (§6).
- **Profiles diverge freely.** When client KYC fields and admin scoping fields arrive, each lands in its own table. Neither pollutes the other, and neither pollutes `users`.
- **1:1 with `users`.** Each user has exactly one profile, of exactly one kind, determined by `portal`. The split is mutually exclusive — a UID is either a client or an admin, never both (confirmed: no edge cases in current data).

### 5.3 Why not the alternatives

| Option | Verdict |
|--------|---------|
| **Keep one table, add `portal` only** | Simplest migration, but the schema-pollution problem (§1) remains unsolved — defeats the purpose. |
| **Two fully separate `client_users` / `admin_users` tables, no shared `users`** | Duplicates the Firebase-UID-↔-internal-id concern in two places; every cross-cutting query (auth resolution, "find user by UID") must check both. The shared `users` anchor avoids this. |
| **Identity + profile tables (chosen)** | One resolution path, clean domain separation, room to grow. Industry-standard for this product class. |

### 5.4 Migration of existing rows

Confirmed mapping (no edge cases): `role == CLIENT` → `portal = 'client'`; everything else → `portal = 'admin'`.

```
For each existing users row:
  if role == 'CLIENT':
      users.portal = 'client'
      INSERT client_profiles(user_id = users.id)
  else:
      users.portal = 'admin'
      INSERT admin_profiles(user_id = users.id, role = users.role)
Then: drop users.role column.
```

For any existing **real** Firebase users, a one-time backfill script also calls `auth.set_custom_user_claims` to stamp `portal` (and `role` for admins) onto their tokens, so claims and DB agree from day one.

> **Note on tooling:** proposal 001 §13 flags that Alembic is not yet in place (`Base.metadata.create_all()` on startup). This refactor introduces real DDL (new tables, dropped column) and a data migration — it is the natural trigger to adopt Alembic *before* implementing. See §9.

---

## 6. Role Enum Split

The single `UserRole` enum becomes portal-scoped:

```python
# app/models/users.py

class Portal(str, enum.Enum):
    CLIENT = "client"
    ADMIN = "admin"

class AdminRole(str, enum.Enum):   # was the non-CLIENT members of UserRole
    RM = "RM"
    PM = "PM"
    PC = "PC"
    COMPLIANCE = "COMPLIANCE"
    ADMIN = "ADMIN"
```

- `CLIENT` is removed from the role enum entirely — being in `client_profiles` *is* the client identity.
- `app/libs/auth/actions.py`: `ROLE_ACTIONS` is re-keyed on `AdminRole` and the `UserRole.CLIENT` entry is dropped. The client's two document actions (`DOCUMENT_VIEW_OWN`, `DOCUMENT_SUBMIT_OWN`) move to a separate `CLIENT_ACTIONS` constant gated by the client dependency, not the role map. The action enum itself is unchanged.

---

## 7. API Design

### 7.1 Route trees

```
/api/auth/...        shared — portal-aware (register/login set & read portal)
/api/client/...      requires get_current_client_user()   (portal == 'client')
/api/admin/...       requires get_current_admin_user()    (portal == 'admin')
/health              shared, unauthenticated
```

The existing frozen paths (`/api/auth/*`, `/api/users/me`) are preserved (§8). New domain work lands under `/api/client/*` or `/api/admin/*`. The placeholder `financial` and `documents` routers are **left mounted where they are for now** (per non-goal) — they will be re-homed under the appropriate tree when implemented, not in this proposal.

### 7.2 Two dependencies, one gate

In `app/libs/auth/deps.py`, `get_current_user` is split into two portal-scoped dependencies that share the existing token-verification path:

```python
def get_current_client_user(claims=Depends(verify_firebase_token), db=...) -> User:
    user = _resolve_user(claims, db)            # existing resolution logic
    if user.portal != Portal.CLIENT:
        raise HTTPException(403, "Client portal access only")
    return user

def get_current_admin_user(claims=Depends(verify_firebase_token), db=...) -> User:
    user = _resolve_user(claims, db)
    if user.portal != Portal.ADMIN:
        raise HTTPException(403, "Admin portal access only")
    return user
```

A client token hitting `/api/admin/...` is rejected at the dependency, before the handler runs. `require_action(...)` (from 001) is now layered *on top of* `get_current_admin_user` — actions only apply within the admin portal.

Where a route is genuinely shared (e.g. `/api/auth/me`, `/api/users/me`), a thin `get_current_user` remains that resolves the user without a portal assertion.

### 7.3 Portal as the primary gate, role as the secondary

The mental model becomes two-tier:

```
token ──► portal gate (client vs admin)  ──► [admin only] action gate (role → actions)
```

This is the boundary that was missing. Portal isolation is coarse and absolute; role-action checks remain the fine-grained layer *within* the admin portal, exactly as designed in 001 §8.

### 7.4 Auth flow changes (`/register`, `/login`)

`login_or_register` (in `app/libs/auth/service.py`) gains portal awareness:

- **`/register`**
  - `portal='client'`: verify token → create `users` row with `portal='client'` → create `client_profiles` row → (prod) `set_custom_user_claims(uid, {"portal":"client"})`.
  - `portal='admin'`: unchanged gate — still blocked outside `dev_mode` (self-registration of staff stays disabled; admins are pre-provisioned). In `dev_mode`, create with `portal='admin'` + `admin_profiles` row using `requested_role`, and set the claim.
- **`/login`**: resolve the existing `users` row; **trust the persisted `portal` column**, not the request body. (Today login ignores `portal` anyway, so this is a tightening, not a break.) If claims are missing the portal (legacy token pre-backfill), derive it from the DB and refresh the claim opportunistically.
- **Dev mode** (`FIREBASE_AUTH_DISABLED=true`): claims can't be set, so portal comes from the request body on register and from the DB `portal` column on every authenticated call. Behaviour mirrors prod.

### 7.5 Admin provisioning of internal users

The existing `PATCH /api/users/{firebase_uid}/role` (gated by `USER_MANAGE`) is the admin-only path to create/elevate staff. Under the new model it:

1. ensures a `users` row with `portal='admin'`,
2. upserts the `admin_profiles` row with the chosen `AdminRole`,
3. calls `set_custom_user_claims(uid, {"portal":"admin","role":<role>})`.

This keeps the DB and the token claim in lockstep — the one place staff identity is minted.

---

## 8. Preserved Contract

Proposal 001 §4 freezes `UserOut`:

```typescript
type PortalUser = { id: number; firebase_uid: string; email: string | null; role: string; };
```

`role` still must serialise. After the split, `UserOut` is assembled per portal:

- **admin users** → `role = admin_profile.role.value` (e.g. `"RM"`).
- **client users** → `role = "CLIENT"` (synthesised constant — the frontends still receive the same string they do today).

So the wire format is unchanged for both portals even though `role` no longer lives on `users`. `portal` *may* be added to `UserOut` as an additive field (safe per 001 §4) if the frontends want to branch on it explicitly — to be decided with the frontend owners (§11).

All frozen paths — `POST /api/auth/{register,login,logout}`, `GET /api/auth/me`, `GET/PATCH /api/users/me` — keep their methods, request bodies, and response shapes.

---

## 9. Migration Path

Each step is independently reviewable. DDL steps assume Alembic is adopted first (step 0).

| Step | Action | Risk |
|------|--------|------|
| 0 | Introduce Alembic; baseline-migrate the current schema (no behavioural change) | Low |
| 1 | `models/users.py`: add `Portal` enum + `portal` column (nullable for now); add `AdminRole`; add `ClientProfile`, `AdminProfile` models | Low — additive |
| 2 | Alembic migration: create `client_profiles`, `admin_profiles`; add `users.portal` | Medium — DDL |
| 3 | Data migration: backfill `portal` + profile rows per §5.4; backfill custom claims for real users | Medium — data |
| 4 | Make `users.portal` NOT NULL; drop `users.role` | Medium — DDL, after backfill verified |
| 5 | `actions.py`: re-key `ROLE_ACTIONS` on `AdminRole`; extract `CLIENT_ACTIONS`; drop `CLIENT` from role map | Low |
| 6 | `deps.py`: split into `get_current_client_user` / `get_current_admin_user` / shared `get_current_user`; extract `_resolve_user` | Medium |
| 7 | `auth/service.py` + `auth/router.py`: portal-aware register/login; claim-setting; profile creation | Medium |
| 8 | `users/router.py`: portal-aware provisioning in `PATCH /{uid}/role`; `UserOut` assembly per §8 | Medium |
| 9 | `main.py`: introduce `/api/client` and `/api/admin` prefixes for future routers (placeholders stay where they are) | Low |
| 10 | Smoke test matrix (§10) | Verification |

Steps 1–4 (data layer) and steps 5–8 (API layer) can each be reviewed as a unit.

---

## 10. Verification

Smoke matrix to run after migration (extends 001 §11 step 10):

| Scenario | Expected |
|----------|----------|
| Client registers via `/register` (`portal=client`) | 201; `users.portal='client'`; `client_profiles` row exists; claim set |
| `GET /api/auth/me` for that client | 200; `UserOut.role == "CLIENT"` |
| Client token → any `/api/admin/...` route | 403 at dependency |
| Admin provisioned via `PATCH /{uid}/role` | `admin_profiles` row; claim `{portal:admin, role:…}` |
| Admin token → `/api/admin/...` gated route | 200 / 403 per existing action map |
| Admin token → `/api/client/...` route | 403 at dependency |
| `FIREBASE_AUTH_DISABLED=true` dev login both portals | resolves portal from body/DB; no claim calls; no crash |
| Existing pre-migration row (legacy token, no portal claim) logs in | portal derived from DB; claim refreshed; succeeds |

---

## 11. Open Questions

1. **Expose `portal` in `UserOut`?** Additive and safe, but only worth it if a frontend needs to branch on it. Decide with client-frontend / admin-frontend owners.
2. **Custom-claim propagation latency.** A freshly set custom claim only appears after the client refreshes its ID token (Firebase forces refresh within ~1h, or immediately via `getIdToken(true)`). For newly provisioned admins this matters — the provisioning response should signal the frontend to force-refresh. Confirm the admin-frontend does this.
3. **Re-homing placeholders.** When `financial` / `documents` are implemented, which actions belong under `/api/client/*` (client submitting own) vs `/api/admin/*` (staff managing all)? Out of scope here, but the route-tree split in §7.1 should inform their design — cross-reference 001 §8.2.
4. **Demoting/transferring a user between portals.** Current assumption: never happens (a UID is permanently client or admin). If staff could ever also be a client, the 1:1 profile assumption breaks and this needs revisiting before such a case exists.
5. **Alembic ownership.** Adopting Alembic (step 0) is a prerequisite. Confirm no one is mid-flight on a conflicting schema change before baselining.

**Resolved** (folded into §5.1): contact email = login email (no separate column); assigned RM stored as `assigned_rm_uid` FK to `users.firebase_uid`; no `id_information` column (KYC docs stored as files); `authorized_person` is a single name string.
