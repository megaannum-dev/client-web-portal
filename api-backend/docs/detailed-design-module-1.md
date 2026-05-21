# Detailed System Design — Module 1: Authentication & User Management

> **Status:** Draft for implementation — v2 (registration flow corrected)  
> **Last updated:** 2026-05-21  
> **Source requirement:** `docs/proposal.md` — Module 1  
> **Prerequisite reading:** `docs/proposal.md` Sections 4, 8, 9

---

## Table of Contents

1. [Overview and Scope](#1-overview-and-scope)
2. [Gap Analysis — Skeleton vs. Required](#2-gap-analysis--skeleton-vs-required)
3. [Known Inconsistency in proposal.md to Resolve](#3-known-inconsistency-in-proposalmd-to-resolve)
4. [Data Model Changes](#4-data-model-changes)
5. [Module Access Map (role → accessible modules)](#5-module-access-map-role--accessible-modules)
6. [API Endpoint Specifications](#6-api-endpoint-specifications)
7. [File-Level Change Inventory](#7-file-level-change-inventory)
8. [Database Migration (Alembic)](#8-database-migration-alembic)
9. [Dependencies](#9-dependencies)
10. [Test Plan (Independent)](#10-test-plan-independent)
11. [Temporary Design Decisions](#11-temporary-design-decisions)

---

## 1. Overview and Scope

### What Module 1 delivers

Module 1 is the foundation that all other modules build on. It does two things:

1. **Identity and access** — register a new user, verify who they are on every request, enforce their role, and let ADMIN manage other users.
2. **Role-aware module list** — after login, the server returns a description of every module the authenticated user is allowed to access. This is the primary deliverable of this implementation phase. No real business data or logic from other modules is required.

### Scope of this implementation phase

| In scope | Out of scope |
|----------|-------------|
| All 8 roles defined and enforced | Business logic of any other module |
| Registration flow (backend creates Firebase user) | Feature-flag configuration (Module 8) |
| Login response includes role + module list | Any PostgreSQL or MongoDB connections |
| ADMIN user management (list, role change, deactivate) | Email notifications |
| Own-profile view and display name update | Password reset flow |
| Independent test suite | Deployment or Docker setup |

### Authoritative source for module access

This document uses the **Permission Matrix in Section 7 of `proposal.md`** as the authoritative source for which roles access which modules. Section 5 (Use Case Summary) in `proposal.md` contains inconsistencies that are flagged in [Section 3](#3-known-inconsistency-in-proposalmd-to-resolve) of this document.

---

## 2. Gap Analysis — Skeleton vs. Required

This section documents every deviation between what the skeleton currently does and what Module 1 requires. This is the direct work list for the developer.

### 2.1 `UserRole` enum (`app/models.py`)

| Current skeleton | Required | Action |
|-----------------|----------|--------|
| `PM`, `COMPLIANCE`, `CLIENT`, `ADMIN`, `OPS` | `CLIENT`, `ADMIN`, `PC`, `PM`, `COMPLIANCE`, `RISK`, `RM`, `MOBO` | Add `PC`, `RISK`, `RM`, `MOBO`; remove `OPS` |

> **Migration implication:** The `role` column is stored as a plain string (`native_enum=False`), so no MySQL `ALTER TABLE` is needed for the enum values themselves. However, any existing rows with `role = 'OPS'` must be handled before removing `OPS` from the enum (see [Section 8](#8-database-migration-alembic)).

### 2.2 `User` model (`app/models.py`)

| Current column | Status | Action |
|----------------|--------|--------|
| `id` | Keep | — |
| `firebase_uid` | Keep | — |
| `email` | Keep | — |
| `role` | Keep, update enum | See above |
| `created_at` | Keep | — |
| `updated_at` | Keep | — |
| `display_name` | **Missing** | Add `VARCHAR(128) NULL` |
| `is_active` | **Missing** | Add `BOOLEAN NOT NULL DEFAULT TRUE` |

### 2.3 Registration flow (`app/routers/auth.py`, `app/deps/auth.py`)

| Current skeleton | Required | Action |
|-----------------|----------|--------|
| Frontend creates Firebase user, sends ID token → backend validates token and creates MariaDB row | Same correct pattern — no change to the flow | Extend `RegisterBody` to also accept `display_name` and optional `role` (admin portal only) |

The existing skeleton registration flow is already correct. The only change needed is to the request body schema (see [Section 6.1](#61-post-apiauthregister)).

### 2.4 Default role on registration (`app/deps/auth.py`)

| Current skeleton | Required |
|-----------------|----------|
| Admin portal → `ADMIN`; Client portal → `CLIENT` | Client portal → always `CLIENT`; Admin portal → **caller-supplied role** (temporary; see [Section 11](#11-temporary-design-decisions)) |

### 2.5 Login/me response — module list missing

| Current skeleton | Required |
|-----------------|----------|
| Returns `UserOut` (id, firebase_uid, email, role) | Returns `UserOut` + `accessible_modules` list |

This affects `POST /auth/login`, `GET /auth/me`, and `GET /users/me`.

### 2.6 `GET /users/{firebase_uid}` — role access too broad

| Current skeleton | Required |
|-----------------|----------|
| Accessible by `ADMIN`, `COMPLIANCE`, `PM` | **ADMIN only** (proposal Section 7: only ADMIN manages all users) |

### 2.7 Missing ADMIN user management endpoints

The following endpoints do not exist in the skeleton and must be added:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/users/` | List all users (ADMIN only) |
| `PATCH /api/users/{firebase_uid}/deactivate` | Deactivate a user account (ADMIN only) |
| `PATCH /api/users/{firebase_uid}/reactivate` | Reactivate a deactivated user (ADMIN only) |

### 2.8 Own-profile update — `display_name` not updatable

| Current skeleton | Required |
|-----------------|----------|
| `PATCH /users/me` only updates `email` | Also update `display_name` |

### 2.9 `schemas/user.py` — missing fields

| Current `UserOut` | Required |
|------------------|----------|
| `id`, `firebase_uid`, `email`, `role` | Add `display_name`, `is_active` |

### 2.10 `schemas/auth.py` — register body needs replacement

The current `FirebaseLoginBody` carries an `id_token` (for the old flow). The new register endpoint needs a completely different body (see [Section 6.1](#61-post-apiauthregister)).

---

## 3. Known Inconsistency in proposal.md to Resolve

During design, the following contradictions were found between **Section 5 (Use Case Summary)** and **Section 7 (Permission Matrix)** of `proposal.md`. **The Permission Matrix (Section 7) is used as the authoritative source in this document.** Section 5 should be corrected in a future proposal revision.

| Role | Section 5 claims | Section 7 says | Which is correct |
|------|-----------------|----------------|-----------------|
| CLIENT | Includes "Submit Compliance Documents (KYC/AML) for Renewal" under Module 2 | CLIENT has no access to M2 whatsoever | Section 7 — per the original UML diagram, CLIENT only has EOM Report and allotment/redemption submission |
| CLIENT | Missing "Submit Allotment Request" and "Submit Redemption Request" use cases | CLIENT has W access to M5 | Section 7 |
| RISK | Listed as having "View EOD Report" and "View EOM Report" (M7) | RISK only has Post-trade Risk Report | Section 7 — per UML, Wilson (RISK) only monitors post-trade risk |
| MOBO | Listed as having "View EOM Report" | MOBO only has EOD Report access | Section 7 — per UML, MOBO only views EOD report |
| PC | Listed as having "View EOM Report" | EOM Report is CLIENT-only | Section 7 |
| COMPLIANCE | Missing "Portfolio & Exposure Limits Report" and "Monitor Model Client Assignment" use cases | COMPLIANCE has R access to both M4 exposure report and M6 | Section 7 |

> **Action required on `proposal.md`:** Section 5 should be updated to match Section 7. This is outside the scope of this implementation document.

---

## 4. Data Model Changes

### 4.1 Updated `UserRole` enum

```python
# app/models/mariadb/user.py  (moved from app/models.py per proposed structure)

class UserRole(str, enum.Enum):
    CLIENT     = "CLIENT"
    ADMIN      = "ADMIN"
    PC         = "PC"
    PM         = "PM"
    COMPLIANCE = "COMPLIANCE"
    RISK       = "RISK"
    RM         = "RM"
    MOBO       = "MOBO"
```

### 4.2 Updated `User` model

```python
class User(Base):
    __tablename__ = "users"

    id:           Mapped[int]           = mapped_column(primary_key=True, autoincrement=True)
    firebase_uid: Mapped[str]           = mapped_column(String(128), unique=True, index=True)
    email:        Mapped[str | None]    = mapped_column(String(255), nullable=True)
    display_name: Mapped[str | None]    = mapped_column(String(128), nullable=True)   # NEW
    role:         Mapped[UserRole]      = mapped_column(
                                            SAEnum(UserRole, native_enum=False, length=32),
                                            nullable=False, default=UserRole.CLIENT
                                         )
    is_active:    Mapped[bool]          = mapped_column(Boolean, nullable=False, default=True)  # NEW
    created_at:   Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:   Mapped[datetime]      = mapped_column(
                                            DateTime(timezone=True),
                                            server_default=func.now(), onupdate=func.now()
                                         )
```

### 4.3 Migration summary

Two columns are added to the existing `users` table:

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `display_name` | `VARCHAR(128)` | YES | NULL |
| `is_active` | `TINYINT(1)` (MySQL boolean) | NO | `1` (true) |

No column is dropped. The `OPS` role value becomes unreachable in code — existing `OPS` rows should be reviewed (see [Section 8](#8-database-migration-alembic)).

---

## 5. Module Access Map (role → accessible modules)

This is the **static data** that the login/me response uses to populate the `accessible_modules` field. It is defined in a new service file `app/services/module_access.py` and never reads from any database.

All modules are currently marked `"coming_soon"` except Module 1, which is `"available"`. When a future module is implemented, its status changes to `"available"` in this file — no database or endpoint change needed.

### 5.1 Module catalogue

The full list of modules and their descriptions:

| Module ID | Name | Short description |
|-----------|------|------------------|
| `M1` | Authentication & User Management | Register, log in, manage your profile, and (ADMIN) manage all users |
| `M2` | Client Onboarding & KYC/AML | Onboard new clients, manage profiles, and handle identity verification documents |
| `M3` | Trading Models | Create and manage the trading model information table |
| `M4` | Pre-Trade Check & Allocation | Review portfolio exposure limits and sign pre-trade allocation matrices |
| `M5` | Allotment & Redemption | Submit, review, and execute client investment and withdrawal requests |
| `M6` | Model Client Assignment | View the live record of which trading models each client is currently invested in |
| `M7` | Reporting | Access end-of-day, end-of-month, and post-trade risk reports |
| `M8` | Role & Feature Configuration | (ADMIN) Configure which features are accessible to which roles |
| `M9` | KYC/AML Document Audit | Compliance-grade audit log of all regulated approval actions |
| `M10` | IB API Integration | (Placeholder) Future integration with Interactive Brokers data |

### 5.2 Role-to-module mapping

Derived strictly from the Permission Matrix (Section 7 of `proposal.md`).

#### `CLIENT`
| Module | Access | Status |
|--------|--------|--------|
| M5 — Allotment & Redemption | Submit allotment and redemption requests | `coming_soon` |
| M7 — Reporting | View your end-of-month portfolio report | `coming_soon` |

#### `RISK`
| Module | Access | Status |
|--------|--------|--------|
| M7 — Reporting | View post-trade risk report | `coming_soon` |

#### `COMPLIANCE`
| Module | Access | Status |
|--------|--------|--------|
| M2 — Client Onboarding & KYC/AML | Final approval of KYC/AML documents | `coming_soon` |
| M4 — Pre-Trade Check & Allocation | View portfolio exposure limits; co-sign pre-trade allocation matrices | `coming_soon` |
| M5 — Allotment & Redemption | View, approve, and execute allotment/redemption requests | `coming_soon` |
| M6 — Model Client Assignment | View current client-to-model assignments | `coming_soon` |
| M7 — Reporting | View end-of-day internal report | `coming_soon` |
| M9 — KYC/AML Document Audit | Compliance audit log (system-written) | `coming_soon` |

#### `PC` (Portfolio Commander)
| Module | Access | Status |
|--------|--------|--------|
| M3 — Trading Models | Create and manage trading models | `coming_soon` |
| M4 — Pre-Trade Check & Allocation | View exposure limits; author and sign pre-trade allocation matrices | `coming_soon` |
| M5 — Allotment & Redemption | View, approve, and execute allotment/redemption requests | `coming_soon` |
| M6 — Model Client Assignment | View current client-to-model assignments | `coming_soon` |
| M7 — Reporting | View end-of-day internal report | `coming_soon` |

#### `PM` (Portfolio Manager)
| Module | Access | Status |
|--------|--------|--------|
| M4 — Pre-Trade Check & Allocation | View portfolio exposure limits report | `coming_soon` |
| M5 — Allotment & Redemption | View, approve, and execute allotment/redemption requests | `coming_soon` |
| M6 — Model Client Assignment | View current client-to-model assignments | `coming_soon` |
| M7 — Reporting | View end-of-day internal report | `coming_soon` |

#### `MOBO` (Mid/Back Office)
| Module | Access | Status |
|--------|--------|--------|
| M7 — Reporting | View end-of-day internal report | `coming_soon` |

#### `RM` (Relationship Manager)
| Module | Access | Status |
|--------|--------|--------|
| M2 — Client Onboarding & KYC/AML | Onboard clients; manage profiles; upload and level-1 review KYC/AML documents | `coming_soon` |

#### `ADMIN`
| Module | Access | Status |
|--------|--------|--------|
| M1 — Authentication & User Management | Manage all users: list, assign roles, activate/deactivate | `available` |
| M2 — Client Onboarding & KYC/AML | Full access | `coming_soon` |
| M3 — Trading Models | Full access | `coming_soon` |
| M4 — Pre-Trade Check & Allocation | Full access | `coming_soon` |
| M5 — Allotment & Redemption | Full access | `coming_soon` |
| M6 — Model Client Assignment | Full access | `coming_soon` |
| M7 — Reporting | Full access to all reports | `coming_soon` |
| M8 — Role & Feature Configuration | Configure which features are accessible to which roles | `coming_soon` |
| M9 — KYC/AML Document Audit | View compliance audit log | `coming_soon` |
| M10 — IB API Integration | (Placeholder — not yet implemented) | `coming_soon` |

---

## 6. API Endpoint Specifications

### Response schemas (new)

```
# app/schemas/user.py additions

UserOut:
  id:           int
  firebase_uid: str
  email:        str | None
  display_name: str | None        ← NEW
  role:         UserRole
  is_active:    bool              ← NEW

UserSelfUpdate:
  display_name: str | None = None ← NEW (email update removed — see note below)
  email:        EmailStr | None = None

ModuleInfo:
  id:          str          # "M1", "M2", ...
  name:        str
  description: str
  status:      Literal["available", "coming_soon"]

AuthResponse:
  user:               UserOut
  accessible_modules: list[ModuleInfo]
```

> **Note on email updates in `PATCH /users/me`:** The current skeleton allows the user to update their own email via `PATCH /users/me`. Email in MariaDB is kept in sync with Firebase, so a MariaDB-only email update creates a mismatch. For this phase, email update is **kept as-is** from the skeleton (MariaDB only) and flagged as a known inconsistency. A Firebase email-change flow is out of scope for Module 1.

---

### 6.1 `POST /api/auth/register`

**Purpose:** Create the MariaDB user record for a newly registered Firebase account. The frontend has already created the Firebase account via the client SDK and obtained an ID token; this endpoint validates that token and writes the application user row.

**Authentication:** None (public endpoint). The `id_token` in the body is the proof of identity.

> **Why the frontend handles Firebase account creation — not the backend:**
> The backend is a *resource server*: it validates credentials but never handles passwords. Firebase account creation requires a password, which must be processed exclusively by the Firebase client SDK on the user's device. The Firebase SDK also provides breach detection, rate limiting, and credential security at the auth layer. The backend receives only a short-lived signed token as proof that Firebase has already verified the registration — it never sees the password.

#### Request body

```json
{
  "id_token":     "eyJhbGciOi...",      // Firebase ID token issued after frontend sign-up; required
  "portal":       "client" | "admin",  // required; determines default role
  "display_name": "Jane Smith",         // required
  "role":         "PM"                  // optional; admin portal only (see Section 11)
}
```

When `FIREBASE_AUTH_DISABLED=true`, `id_token` may be omitted or any value.

#### Role assignment logic

```
if portal == "client":
    assigned_role = CLIENT          (ignore any submitted `role` field)
elif portal == "admin":
    assigned_role = submitted `role` field   (see Section 11 — temporary)
    if no role submitted: default = ADMIN   (same as current skeleton behaviour — see Section 11)
```

#### Backend steps

```
1. Validate request body (Pydantic)
2. If FIREBASE_AUTH_DISABLED:
     → skip step 3; derive firebase_uid as f"dev-{display_name}"
3. Call verify_firebase_id_token_string(body.id_token) → extract firebase_uid and email from claims
   → on invalid/expired token: HTTP 401
4. Check MariaDB: if a row with this firebase_uid already exists → HTTP 409
5. Insert new User row into MariaDB with:
       firebase_uid, email (from token claims), display_name, role (per assignment logic above), is_active=True
6. Return HTTP 201 + AuthResponse (UserOut + accessible_modules)
```

#### Success response — `201 Created`

```json
{
  "user": {
    "id": 1,
    "firebase_uid": "abc123",
    "email": "user@example.com",
    "display_name": "Jane Smith",
    "role": "PM",
    "is_active": true
  },
  "accessible_modules": [
    {
      "id": "M4",
      "name": "Pre-Trade Check & Allocation",
      "description": "View portfolio exposure limits report",
      "status": "coming_soon"
    },
    ...
  ]
}
```

#### Error responses

| HTTP | Condition |
|------|-----------|
| 400 | Missing required field (`display_name`, `portal`) |
| 401 | `id_token` is invalid or expired |
| 409 | A MariaDB user record already exists for this Firebase UID — call `POST /api/auth/login` instead |
| 500 | Firebase Admin SDK not configured |

---

### 6.2 `POST /api/auth/login`

**Purpose:** Verify the Firebase ID token (obtained by the frontend after `signInWithEmailAndPassword`) and return the user profile with module list.

**Authentication:** None (public). The `id_token` in the body IS the authentication proof.

**Note:** The skeleton's `login` endpoint performs an upsert (create if missing). That behaviour is **removed**. Login must now fail with `404` if no MariaDB row exists for the Firebase UID — the caller must register first. This prevents orphaned Firebase accounts from getting silent access.

#### Request body

```json
{
  "id_token": "eyJhbGciOi..."    // Firebase ID token from client SDK
}
```

When `FIREBASE_AUTH_DISABLED=true`, `id_token` may be omitted or any value.

#### Backend steps

```
1. Validate Firebase ID token (or skip if FIREBASE_AUTH_DISABLED)
2. Extract firebase_uid from token claims
3. Look up User in MariaDB by firebase_uid
   → not found: HTTP 404 "User not registered. Call POST /api/auth/register first."
4. If user.is_active == False: HTTP 403 "Account deactivated. Contact an administrator."
5. Sync email from token claims to MariaDB if changed (keep existing behaviour)
6. Return HTTP 200 + AuthResponse (UserOut + accessible_modules)
```

#### Success response — `200 OK`

```json
{
  "user": {
    "id": 1,
    "firebase_uid": "abc123",
    "email": "user@example.com",
    "display_name": "Jane Smith",
    "role": "PM",
    "is_active": true
  },
  "accessible_modules": [
    { "id": "M4", "name": "Pre-Trade Check & Allocation", "description": "...", "status": "coming_soon" },
    { "id": "M5", "name": "Allotment & Redemption",       "description": "...", "status": "coming_soon" },
    { "id": "M6", "name": "Model Client Assignment",      "description": "...", "status": "coming_soon" },
    { "id": "M7", "name": "Reporting",                    "description": "...", "status": "coming_soon" }
  ]
}
```

#### Error responses

| HTTP | Condition |
|------|-----------|
| 400 | `id_token` missing (when auth is enabled) |
| 401 | Token is invalid or expired |
| 403 | Account is deactivated |
| 404 | No MariaDB user record found for this Firebase UID |

---

### 6.3 `GET /api/auth/me`

**Purpose:** Return the current user's profile and module list. Called by the frontend on page load to restore session state.

**Authentication:** `Authorization: Bearer <Firebase ID token>` header required.

#### Backend steps

```
1. Validate Bearer token via `verify_firebase_token` dependency
2. Look up User in MariaDB
   → not found: HTTP 404
3. If user.is_active == False: HTTP 403
4. Return HTTP 200 + AuthResponse
```

#### Success response — `200 OK`

Same structure as login (Section 6.2).

#### Error responses

| HTTP | Condition |
|------|-----------|
| 401 | Missing or invalid bearer token |
| 403 | Account is deactivated |
| 404 | Token valid but no MariaDB record exists |

---

### 6.4 `POST /api/auth/logout`

**Purpose:** No-op server-side logout. Firebase tokens are stateless and expire client-side. This endpoint exists as a stable URL for the frontend to call for analytics or future server-side revocation.

**Authentication:** `Authorization: Bearer <Firebase ID token>` (validated but not required for the operation).

**Response:** `204 No Content` — unchanged from skeleton.

---

### 6.5 `GET /api/users/me`

**Purpose:** Alternative to `GET /api/auth/me`. Returns the same `AuthResponse`. Kept for frontend convenience.

**Authentication:** Bearer token required.

**Response:** `200 OK` — same `AuthResponse` as `GET /api/auth/me`.

---

### 6.6 `PATCH /api/users/me`

**Purpose:** Authenticated user updates their own profile fields.

**Authentication:** Bearer token required.

**Editable fields:** `display_name`, `email`

> **Email update caveat:** Updating `email` here only updates the MariaDB record. It does NOT update the Firebase account email. This is a known limitation, flagged for future resolution. For now, it is kept consistent with the existing skeleton behaviour.

#### Request body

```json
{
  "display_name": "Updated Name",   // optional
  "email": "new@example.com"        // optional
}
```

At least one field must be present; a body with both `null` is rejected with `400`.

#### Backend steps

```
1. Validate bearer token → get User from MariaDB
2. If user.is_active == False: HTTP 403
3. Apply non-null fields to the User row
4. db.commit()
5. Return HTTP 200 + AuthResponse
```

#### Success response — `200 OK`

`AuthResponse` with updated `UserOut`.

---

### 6.7 `GET /api/users/` (list all users)

**Purpose:** ADMIN retrieves a paginated list of all registered users.

**Authentication:** Bearer token required. **ADMIN role only.**

#### Query parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `skip` | int | 0 | Number of rows to skip (pagination offset) |
| `limit` | int | 50 | Maximum rows to return (max 200) |
| `role` | UserRole | None | Filter by role |
| `is_active` | bool | None | Filter by active status |

#### Backend steps

```
1. Validate bearer token → require ADMIN role
2. Query MariaDB users table with optional filters
3. Apply skip/limit
4. Return HTTP 200 + list of UserOut
```

#### Success response — `200 OK`

```json
{
  "total": 42,
  "users": [
    {
      "id": 1,
      "firebase_uid": "abc123",
      "email": "user@example.com",
      "display_name": "Jane Smith",
      "role": "PM",
      "is_active": true
    },
    ...
  ]
}
```

#### Error responses

| HTTP | Condition |
|------|-----------|
| 401 | Missing or invalid bearer token |
| 403 | Caller is not ADMIN |

---

### 6.8 `PATCH /api/users/{firebase_uid}/role`

**Purpose:** ADMIN changes the role of a target user.

**Authentication:** Bearer token required. **ADMIN role only.**

**Unchanged from skeleton except:** response now returns `AuthResponse` (with the target user's module list) rather than bare `UserOut`, for consistency.

#### Path parameter

| Parameter | Description |
|-----------|-------------|
| `firebase_uid` | The Firebase UID of the target user |

#### Request body

```json
{
  "role": "COMPLIANCE"    // required; must be a valid UserRole value
}
```

#### Backend steps

```
1. Validate bearer token → require ADMIN role
2. Look up target user by firebase_uid
   → not found: HTTP 404
3. Update target user's role
4. db.commit()
5. Return HTTP 200 + AuthResponse for the target user
```

#### Error responses

| HTTP | Condition |
|------|-----------|
| 401 | Missing or invalid bearer token |
| 403 | Caller is not ADMIN |
| 404 | Target firebase_uid not found |
| 422 | `role` value is not a valid UserRole |

---

### 6.9 `PATCH /api/users/{firebase_uid}/deactivate`

**Purpose:** ADMIN deactivates a user account. The user's Firebase account remains intact; only the `is_active` flag in MariaDB is set to `false`. Subsequent logins by the target user will be rejected with `403`.

**Authentication:** Bearer token required. **ADMIN role only.**

**Guard:** An ADMIN cannot deactivate their own account. This prevents accidental lockout.

#### Path parameter

| Parameter | Description |
|-----------|-------------|
| `firebase_uid` | Firebase UID of the user to deactivate |

#### Request body: none

#### Backend steps

```
1. Validate bearer token → require ADMIN role
2. Look up target user by firebase_uid
   → not found: HTTP 404
3. If target.firebase_uid == caller.firebase_uid: HTTP 400 "Cannot deactivate your own account"
4. If target.is_active == False: HTTP 409 "User is already deactivated"
5. Set target.is_active = False
6. db.commit()
7. Return HTTP 200 + UserOut
```

#### Error responses

| HTTP | Condition |
|------|-----------|
| 400 | Caller is trying to deactivate themselves |
| 401 | Missing or invalid bearer token |
| 403 | Caller is not ADMIN |
| 404 | Target firebase_uid not found |
| 409 | User is already deactivated |

---

### 6.10 `PATCH /api/users/{firebase_uid}/reactivate`

**Purpose:** ADMIN reactivates a previously deactivated user account.

**Authentication:** Bearer token required. **ADMIN role only.**

#### Backend steps

```
1. Validate bearer token → require ADMIN role
2. Look up target user by firebase_uid → 404 if not found
3. If target.is_active == True: HTTP 409 "User is already active"
4. Set target.is_active = True
5. db.commit()
6. Return HTTP 200 + UserOut
```

---

### 6.11 `GET /api/users/{firebase_uid}`

**Purpose:** ADMIN fetches any single user's profile by Firebase UID.

**Authentication:** Bearer token required. **ADMIN role only.**

> **Change from skeleton:** Previously accessible by ADMIN, COMPLIANCE, and PM. Restricted to ADMIN only per `proposal.md` Section 7.

#### Success response — `200 OK`

`UserOut` (not `AuthResponse` — the module list is for the caller's own session, not for inspecting others).

---

## 7. File-Level Change Inventory

The table below lists every file that must be created or modified. No other files in the skeleton need to change for Module 1.

### Files to MODIFY

| File | What changes |
|------|-------------|
| `app/models.py` | Update `UserRole` (add 4, remove 1); add `display_name` and `is_active` to `User` |
| `app/schemas/user.py` | Add `display_name`, `is_active` to `UserOut`; add `display_name` to `UserSelfUpdate`; add `ModuleInfo`, `AuthResponse`, `UserListResponse` schemas |
| `app/schemas/auth.py` | Replace `FirebaseLoginBody` with two new schemas: `RegisterBody` and `LoginBody` (see below) |
| `app/deps/auth.py` | Update `default_role_for_portal`; add `is_active` guard to `get_current_user`; remove upsert behaviour from login path |
| `app/routers/auth.py` | Extend `/register` to accept `display_name` and optional `role`; update `/login` and `/me` to return `AuthResponse` |
| `app/routers/users.py` | Update `/me` to return `AuthResponse`; update `PATCH /me` to include `display_name`; restrict `GET /{uid}` to ADMIN only; add `GET /`, `PATCH /{uid}/deactivate`, `PATCH /{uid}/reactivate` |
| `app/config.py` | No change for Module 1 (MariaDB connection string unchanged) |
| `requirements.txt` | Verify `firebase-admin` is present; add `alembic` if not present (see [Section 9](#9-dependencies)) |

### New schemas for `app/schemas/auth.py`

```python
class RegisterBody(BaseModel):
    id_token:     str | None = None
    portal:       Literal["client", "admin"] = "client"
    display_name: str = Field(min_length=1, max_length=128)
    role:         UserRole | None = None   # admin portal only; see Section 11

class LoginBody(BaseModel):
    id_token: str | None = Field(
        default=None,
        description="Firebase ID token. Optional when FIREBASE_AUTH_DISABLED=true."
    )
```

### Files to CREATE

| File | Purpose |
|------|---------|
| `app/services/module_access.py` | Static function `get_accessible_modules(role: UserRole) -> list[ModuleInfo]` — returns the module list for a given role |
| `alembic.ini` | Alembic configuration file (if Alembic not yet set up) |
| `alembic/env.py` | Alembic migration environment |
| `alembic/versions/0001_add_display_name_is_active.py` | First migration (see [Section 8](#8-database-migration-alembic)) |
| `tests/__init__.py` | Makes `tests/` a Python package |
| `tests/conftest.py` | Pytest fixtures: test DB session, override `get_db`, set `FIREBASE_AUTH_DISABLED=true` |
| `tests/test_module1.py` | All Module 1 tests (see [Section 10](#10-test-plan-independent)) |

---

## 8. Database Migration (Alembic)

### Why Alembic

The existing skeleton uses `Base.metadata.create_all()` at startup, which creates tables that don't exist but never alters existing ones. Since the `users` table already exists in MariaDB with columns that need to change, we need a proper migration tool. **Alembic** is the standard migration tool for SQLAlchemy projects.

### Setup (one-time)

```bash
# From api-backend/ directory
pip install alembic
alembic init alembic
```

In `alembic/env.py`, point Alembic at the same `DATABASE_URL` from `app/config.py` and import `Base` from `app/models.py`.

### Migration 0001 — add `display_name` and `is_active`

**File:** `alembic/versions/0001_add_display_name_is_active.py`

```python
"""Add display_name and is_active to users table

Revision ID: 0001
"""
from alembic import op
import sqlalchemy as sa

def upgrade():
    op.add_column("users", sa.Column("display_name", sa.String(128), nullable=True))
    op.add_column("users", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))

def downgrade():
    op.drop_column("users", "is_active")
    op.drop_column("users", "display_name")
```

### Handling the OPS role

The `OPS` role is removed from `UserRole`. The `role` column is stored as a plain VARCHAR (not a native MySQL ENUM), so no schema change is needed. However:

- **Before** removing `OPS` from the Python enum, confirm there are no existing rows in MariaDB with `role = 'OPS'`.
- If there are: manually update them to an appropriate role (e.g., `MOBO`), or add a second migration that does `UPDATE users SET role = 'MOBO' WHERE role = 'OPS'`.

### Running migrations

```bash
# Apply all pending migrations
alembic upgrade head

# Roll back one migration (for testing)
alembic downgrade -1
```

---

## 9. Dependencies

### Required packages (verify against `requirements.txt`)

| Package | Purpose | Already in skeleton? |
|---------|---------|---------------------|
| `fastapi` | Web framework | Yes |
| `uvicorn` | ASGI server | Yes |
| `sqlalchemy` | ORM + MariaDB connection | Yes |
| `pymysql` | MariaDB driver | Yes (inferred from `mysql+pymysql` URL) |
| `pydantic` | Request/response validation | Yes |
| `pydantic-settings` | Settings from `.env` | Yes |
| `firebase-admin` | Firebase token verification | Yes |
| `alembic` | Database migrations | **Add if missing** |
| `pytest` | Test runner | **Add if missing** |
| `httpx` | FastAPI `TestClient` transport | **Add if missing** |

### New entry for `requirements.txt` (if not present)

```
alembic>=1.13
pytest>=8.0
httpx>=0.27
```

---

## 10. Test Plan (Independent)

Module 1 can be tested **without any real Firebase account and without any running MariaDB instance** by using:
- `FIREBASE_AUTH_DISABLED=true` — bypasses Firebase token verification
- An **in-memory SQLite database** — overrides MariaDB for tests (SQLite is suitable here because Module 1 uses only simple column types with no MariaDB-specific features)

### Test setup (`tests/conftest.py`)

```python
import os, pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.database import get_db
from app.models import Base

os.environ["FIREBASE_AUTH_DISABLED"] = "true"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
TestingSession = sessionmaker(bind=engine)

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def db():
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()

@pytest.fixture
def client(db):
    def override_get_db():
        yield db
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

### Test cases (`tests/test_module1.py`)

#### Registration

| Test ID | Description | Expected |
|---------|-------------|----------|
| T1.1 | Register client-portal user | `201`; role=`CLIENT`; module list contains M5, M7 |
| T1.2 | Register admin-portal user with `role=PM` | `201`; role=`PM`; module list contains M4, M5, M6, M7 |
| T1.3 | Register admin-portal user with no `role` field | `201`; role=`ADMIN` (default for admin portal per temporary design) |
| T1.4 | Register client-portal user with `role=PM` in body | `201`; role=`CLIENT` (role field ignored for client portal) |
| T1.5 | Register with missing `display_name` | `422` validation error |
| T1.6 | Register with invalid or expired `id_token` | `401` |
| T1.7 | Register same user twice | Second call returns `409` |

#### Login

| Test ID | Description | Expected |
|---------|-------------|----------|
| T1.8 | Login with registered user | `200`; returns `user` + `accessible_modules` |
| T1.9 | Login with unregistered user | `404` |
| T1.10 | Login with deactivated user | `403` "Account deactivated" |
| T1.11 | Login response contains correct modules for each role | `200`; verify module IDs match Section 5.2 |

#### Module list correctness — one test per role

| Test ID | Role | Expected module IDs in response |
|---------|------|---------------------------------|
| T1.12 | `CLIENT` | `["M5", "M7"]` |
| T1.13 | `RISK` | `["M7"]` |
| T1.14 | `COMPLIANCE` | `["M2", "M4", "M5", "M6", "M7", "M9"]` |
| T1.15 | `PC` | `["M3", "M4", "M5", "M6", "M7"]` |
| T1.16 | `PM` | `["M4", "M5", "M6", "M7"]` |
| T1.17 | `MOBO` | `["M7"]` |
| T1.18 | `RM` | `["M2"]` |
| T1.19 | `ADMIN` | `["M1","M2","M3","M4","M5","M6","M7","M8","M9","M10"]` |

#### Own-profile management

| Test ID | Description | Expected |
|---------|-------------|----------|
| T1.20 | `GET /api/auth/me` with valid session | `200` + `AuthResponse` |
| T1.21 | `GET /api/auth/me` with no token | `401` |
| T1.22 | `PATCH /users/me` — update `display_name` | `200`; `display_name` updated in response |
| T1.23 | `PATCH /users/me` — empty body | `400` |

#### ADMIN user management

| Test ID | Description | Expected |
|---------|-------------|----------|
| T1.24 | `GET /api/users/` as ADMIN | `200` + list |
| T1.25 | `GET /api/users/` as non-ADMIN | `403` |
| T1.26 | `GET /api/users/` filter by `role=PM` | `200`; only PM users returned |
| T1.27 | `PATCH /{uid}/role` as ADMIN | `200`; role updated |
| T1.28 | `PATCH /{uid}/role` as non-ADMIN | `403` |
| T1.29 | `PATCH /{uid}/role` with invalid role value | `422` |
| T1.30 | `PATCH /{uid}/deactivate` as ADMIN | `200`; `is_active=false`; subsequent login returns `403` |
| T1.31 | ADMIN deactivates their own account | `400` "Cannot deactivate your own account" |
| T1.32 | `PATCH /{uid}/reactivate` as ADMIN | `200`; `is_active=true`; subsequent login succeeds |
| T1.33 | `GET /api/users/{uid}` as ADMIN | `200` + `UserOut` |
| T1.34 | `GET /api/users/{uid}` as PM | `403` (role guard tightened from skeleton) |

### Running tests

```bash
# From api-backend/ directory
pytest tests/test_module1.py -v
```

All 34 tests should pass before declaring Module 1 complete.

---

## 11. Temporary Design Decisions

The following decisions deviate from the long-term design in `proposal.md` and must be revisited when the full ADMIN module is implemented.

### TD-1 — Admin portal self-selected role

**Current design:** When registering through the admin portal, the caller supplies their own role in the request body. Any valid role value is accepted with no verification.

**Why:** The full ADMIN module (which would let a privileged user invite staff members and assign their roles) has not been implemented yet.

**Risk:** A user could register themselves as `ADMIN`. This is acceptable during development when the system has no real data, but **must be changed before any production or UAT deployment.**

**Future change:** Admin portal registration should either require an invite token issued by an existing ADMIN, or default all registrations to a `PENDING` / lowest-privilege role and require explicit role assignment by an ADMIN.

**Implementation note:** To make the future change easy, the role assignment logic is isolated in a single function in `app/deps/auth.py`. Only that function needs to change.

---

### TD-2 — Email update does not sync to Firebase

**Current design:** `PATCH /users/me` updates the email in MariaDB only. The Firebase account email is not updated.

**Why:** Firebase email updates require re-authentication flows and are more complex than a simple field update.

**Future change:** Implement a proper email-change flow: user submits new email → backend calls `firebase_admin.auth.update_user(uid, email=new_email)` → update MariaDB.

---

### TD-3 — No login rate limiting or brute-force protection

**Current design:** The login endpoint has no rate limiting.

**Future change:** Add rate limiting middleware (e.g., `slowapi`) before any public-facing deployment.
