# 019 — Admin Access Control & Staff Enrollment: Backend and Database Integration

> Status: **DRAFT — pending implementation approval.**
> Scope: the two admin pages (`/admin/enroll-user`, `/admin/system-config`) move from mock-data-only to DB-backed, and the access levels they manage become the **single authority** enforced by both the frontend gate functions and the backend action guards. Account provisioning switches to a **set-password link** for both portals — staff at enrollment, clients at onboarding approval — and the stalled `/register` self-signup flow is deleted from both frontends and the backend. Out of frame: client-portal *page* access (clients have no page matrix), and any page's business logic other than its view/edit gating.
> Constraint: no design/layout change to either admin page beyond these four, each traceable to a decision above — (a) the overrides ledger relocating from Enroll User to System Config, (b) the "temporary password" → "password" wording change, (c) the wizard's Credentials step losing its password field and expiry select, since a set-password link means no password ever exists to display or expire, and (d) the deactivate modal's fabricated "reassign 4 open items" checkbox becoming a real receiving-RM picker, mirrored in the wizard's Role step in edit mode. Every other screen, panel and modal keeps its current shape; the 32 `{/* View/Edit Gate Function */}` sites gain a `disabled`/hidden state, they are not re-laid-out.

---

## 1. Context and Motivation

Both admin pages exist today as **fully-built UI over an in-memory store**. `admin-frontend/lib/admin/AdminStoreContext.tsx` seeds itself from `admin-frontend/lib/mock/admin-data.ts` (6 users, 3 overrides, 3 audit rows) and mutates React state; nothing is persisted, nothing is enforced, and a page refresh restores the mock. The header comment in `admin-frontend/lib/admin/types.ts:1-11` states this plainly — "entirely mock-data-driven until a backend exists for it."

Meanwhile there are **three separate, mutually-inconsistent notions of access** in the repo:

| # | Where | Model | Authority over |
|---|---|---|---|
| 1 | `admin-frontend/lib/pages-config.ts:23` — `AccessLevel = "OPERATE" \| "VIEW"`, `ROLE_PAGES` | 2 levels, hardcoded, **every current grant is `OPERATE`** | the real route guard (`RoleGuard` via `rolesForPath`, 5 `layout.tsx` files) and the sidebar |
| 2 | `admin-frontend/lib/admin/types.ts:17` — `Level = "none" \| "view" \| "edit"`, `PAGE_CATALOG` | 3 levels, mock data | nothing — the admin console displays and edits it, and it reaches no guard |
| 3 | `api-backend/app/libs/auth/actions.py:34` — `ROLE_ACTIONS: dict[AdminRole, set[Action]]` | 22 actions, hardcoded per role | every mutating endpoint, via `require_action(...)` (`app/libs/auth/deps.py:66`) |

They do not agree, and #2 does not even address the same pages as #1: of `PAGE_CATALOG`'s 17 paths, **14 point at routes that do not exist** (`/rm/dashboard`, `/mobo/reconciliation`, `/pc/matrix`, `/pc/guidelines`, `/rm/reports`, `/mobo/exceptions`, `/compliance/guidelines`, …). The real routes are `/rm/client-info`, `/mobo/trade-reconciliation`, `/pc/allocation-matrix`, `/monthly-reports`, and so on (`pages-config.ts:62-179`, 16 `PageId`s). Only `/compliance/overview`, `/admin/enroll-user` and `/admin/system-config` line up. So an administrator can today "publish" access changes against pages that are not in the product.

On the backend, `api-backend/app/libs/staff/` already implements a real enrollment saga — `StaffService.enroll` (Firebase identity first, DB row second, compensating delete on commit failure) behind `POST /api/admin/staff` — but:

- every enrolled staff member is created with the **same hardcoded password**, `_DEFAULT_PASSWORD = "12345678"` (`app/libs/identity/service.py:8,22`);
- no email is ever sent — `generate_invite_link` returns `auth.generate_password_reset_link(email)` and hands the URL back in the 201 response for someone to copy by hand (`app/libs/staff/router.py:44`);
- the frontend does not call it at all; the wizard's "Create account" writes to React state (`app/(roles)/admin/enroll-user/page.tsx:72-94`).

Finally, `get_actions_for_role` carries the comment "Today: reads from hardcoded dict. **Tomorrow: replace body with a DB query**" (`actions.py:56`). This proposal is that tomorrow.

> **Why now / why this order.** The gate-function sites are already annotated across 11 files (32 `{/* View/Edit Gate Function */}` markers) waiting for something to read; and proposal 009 shipped `AccessLevel` explicitly as a forward declaration ("every grant that exists today is set to Operate, so nothing visibly changes"). Both are placeholders whose cost rises with every page added. Wiring the admin console is also the only way the level ever becomes non-`OPERATE` in practice — the two are one change, not two.

---

## 2. Goals

1. `admin-frontend/lib/admin/catalog.ts`'s `PAGE_CATALOG` is **derived from** `pages-config.ts`'s `PAGES` and keyed by `PageId`, not by hand-written paths — so the matrix can only ever manage pages that exist (grep: no string literal path in `catalog.ts`).
2. One access vocabulary, `NONE | VIEW | EDIT`, used in the DB enum, the wire DTOs, `pages-config.ts` and `lib/admin/types.ts`. `AccessLevel = "OPERATE" | "VIEW"` no longer appears anywhere (grep: zero hits for `OPERATE`). On the backend the matching half of the vocabulary is `Action.*_VIEW` / `Action.*_WRITE` — every `_MANAGE` action is renamed `_WRITE` (grep: zero hits for `MANAGE` / `manage` in `app/libs/auth/actions.py` and its call sites).
3. Role→page standing levels and per-account overrides are **persisted** (`page_access`, `page_access_overrides`) and survive a refresh; publishing from System Config is one atomic transaction plus one audit row.
4. The **backend** resolves an admin caller's effective level per page and derives their action set from it — `get_actions_for_role`'s hardcoded dict is replaced by a DB-backed resolver, and a `VIEW`-level grant makes that page's mutating endpoints return 403 (checkable: seed a `VIEW` grant, `PATCH /api/pc/models/{id}` → 403; `GET /api/pc/models` → 200).
5. The **frontend** receives its effective grants from the backend at login (`UserOut.grants`) and every one of the 32 `{/* View/Edit Gate Function */}` sites is gated by `usePageAccess(pageId)` — no site keeps an unconditional mutating control.
6. **No password is ever generated, transmitted, displayed or stored for a provisioned account, in either portal.** Enrolling a staff member creates a Firebase identity with no password and emails a **set-password link**; a client receives the same email at the moment Compliance approves their onboarding. `_DEFAULT_PASSWORD = "12345678"` is deleted (grep: zero hits for `12345678` in `api-backend/`).
7. The overrides ledger lives on System Config as a third view alongside Matrix and Role, and Enroll User's `Overrides (N)` button navigates there.
8. Every user-visible occurrence of "temporary password" reads "password" (grep: zero hits for `temporary password`, case-insensitive, in `admin-frontend/`).
9. The `/register` self-signup flow is **gone**, not disabled: no `register` route in either frontend, no `signUpWithEmailPassword` in either `AuthProvider`, no `POST /api/dev/register`, no `app/libs/dev/`, no `Settings.dev_mode` (grep: zero hits for `signUpWithEmailPassword`, `postBackendRegister`, `dev_register`, `dev_mode`). Every account in the system is provisioned by an authorised actor — an ADMIN for staff, an RM plus Compliance for clients.

## 3. Non-Goals

- **Sub-page (per-button, per-field) permissions.** The unit of access stays the page; `EDIT` unlocks all of a page's mutating controls at once. Individual buttons are gated by their page's level, not by their own grant.
- **Client-portal *page* access control.** `Portal.CLIENT` users have no page matrix; `/api/client/*` guards are untouched. The client portal is in scope for exactly one thing: receiving the set-password email at approval (Backend C-8).
- **Replacing Firebase Auth, or changing the login flow.** `POST /api/auth/{client,admin}/login` keeps its behavior; `UserOut` grows one field and `login_and_bind` writes one timestamp. Registration is not *changed*, it is deleted (Goal 9).
- **Changing the onboarding pipeline's stages or verdict rules.** `OnboardingService.approve` / `_approve_initial` gain one email send after their existing commit; no stage, guard or status transition moves.
- **A server-side draft/staging table for the matrix.** Staged changes stay client-side exactly as today (`AdminStoreContext.staged`); "publish" is a single write. Multi-admin concurrent staging is out of scope (see Q-2).
- **Approval workflow / second approver for enrollment.** The current "creates the account immediately — no second approver" behavior (`Wizard.tsx:218`) is preserved deliberately.
- **Password rotation policy, expiry, lockout, MFA.** With no password ever issued by the system, the wizard's "Password expires" select has nothing to govern and is removed rather than reimplemented; link lifetime is Firebase's action-link setting, configured in the Firebase console, not in this codebase.
- **SSO / Google sign-in changes.** `signInWithGoogle` is untouched.

---

## 4. Cross-layer seam (frozen here)

### 4.1 The wire contract

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
| Frontend | Consumes `grants` from login/me into `usePageAccess(pageId)`; gates all 32 marker sites; replaces `AdminStoreContext`'s mock seed with the §4.1 endpoints; keeps staging client-side and publishes one `MatrixPublishIn`. | `grants` is present on every `UserOut` (`{}` for a client); `page_id`/`group`/`label`/`path` in `MatrixOut.pages` are display-ready and ordered — the FE does not re-sort or re-label **what the matrix renders**. Division of authority: the local `PAGES` registry stays the authority on which `PageId`s *exist* (and is the pre-load fallback for labels/paths/icons, which the server does not own); `MatrixOut.pages` is the authority on what the matrix *displays and in what order*. A page in one and not the other is a drift bug, caught by the §Frontend A-1 check. |

### 4.3 Change protocol (post-freeze)

- Any edit to §4 requires a new proposal revision or an explicit dated addendum in this file.
- Every impl doc's §7 is re-copied from §4 in the same change set — the seam never lives in only one place.

---

## Layer 1 — Database

### A. Tables / objects in scope

| File | Tables / objects |
|---|---|
| `app/models/users.py` | `users` (2 new columns), `admin_profiles` (1 new column), `AccountStatus` (unchanged) |
| `app/models/access.py` *(new)* | `page_access`, `page_access_overrides`, `page_access_publications`, `admin_audit_events`, `AccessLevelEnum` |
| `alembic/versions/<rev>_0028_admin_access_control.py` *(new)* | all of the above + the `page_access` seed |

### B. Findings

#### B-1. There is no persistence for role→page access at all (MANDATORY)

The only role→page data in the system is `admin-frontend/lib/pages-config.ts:196-225` — a TypeScript literal shipped in the frontend bundle. Nothing in `api-backend/app/models/` mentions pages. `ROLE_ACTIONS` (`app/libs/auth/actions.py:34`) is the backend's parallel hardcoding, and its own comment (`:56`) says a DB query is the intended replacement.

**Refactor:** new table:

```
page_access
  id           INT PK AUTOINCREMENT
  page_id      VARCHAR(64)  NOT NULL          -- a PageId literal
  role         ENUM(adminrole)  NOT NULL      -- reuses the existing AdminRole values
  level        ENUM('view','edit') NOT NULL
  updated_at   DATETIME  NOT NULL  DEFAULT now() ON UPDATE now()
  UNIQUE (page_id, role)
  INDEX (role)
```

`NONE` is the absence of a row — no third enum value, no tombstones. `page_id` is a plain `VARCHAR`, deliberately **not** an FK to a pages table: the page registry is presentation code (`PAGES` in `pages-config.ts` owns paths, labels, icons) and does not belong in the DB. Rows whose `page_id` is no longer a known `PageId` are ignored by the resolver and reported by the `pages.check.ts`-style validator (Frontend A-1).

**Migration plan — the seed comes from the System Config catalog, not from `ROLE_PAGES` (D-11).** `admin-frontend/lib/admin/catalog.ts:23-51`'s `PAGE_CATALOG` already carries a **per-page, per-role, three-level matrix** (`levels: Level[]`, positionally indexed by `ROLES`) — the design handoff's actual access intent. `ROLE_PAGES` is uniformly `OPERATE` and cannot express `view` at all, so seeding from it would discard the only real level data in the repo and leave the `VIEW` level with no instances. The catalog's *paths* are unusable (A-1: 14 of 17 are fictional); its *levels* are the point.

Seed construction, in three rules:

1. **The 14 catalog rows that map to a real `PageId`** supply that page's whole column, verbatim. The renames: `/rm/dashboard`→`rm.client-info`, `/rm/onboarding`→`rm.onboarding-renewal`, `/rm/subscription`→`rm.model-subscription`, `/rm/reports`→`shared.monthly-reports`, `/mobo/dashboard`→`mobo.recon-overview`, `/mobo/reconciliation`→`mobo.trade-reconciliation`, `/mobo/allocation`→`mobo.post-trade-allocation`, `/pc/models`→`pc.model-management`, `/pc/matrix`→`pc.allocation-matrix`, `/pc/allotment`→`pc.allotment-redemption`, `/compliance/overview`→`compliance.overview`, `/compliance/guidelines`→`compliance.review`, plus `admin.enroll-user` and `admin.system-config` unchanged. The 3 catalog rows with no real page (`/mobo/exceptions`, `/pc/guidelines`, `/compliance/redemptions`) are **dropped**.
2. **The 2 real pages the catalog never modelled** — `rm.request-tickets`, `mobo.commission-tracking` — keep today's `ROLE_PAGES` grant (`edit` for the owning role + ADMIN). Without this rule RM silently loses Request Tickets and MOBO loses Commission Tracking, both currently working pages.
3. **Two overrides on the catalog's values:** every `PM` cell becomes `none` (D-12), and `PC × mobo.post-trade-allocation` becomes `view` rather than the catalog's `edit` (D-10).

The result is a literal `INSERT ... VALUES` list — **55 rows: 30 `edit`, 25 `view`** — written out, not computed:

| Page (`page_id`) | RM | MOBO | PM | PC | COMPLIANCE | ADMIN |
|---|---|---|---|---|---|---|
| `rm.client-info` | edit | — | — | — | view | edit |
| `rm.onboarding-renewal` | edit | view | — | — | view | edit |
| `rm.model-subscription` | edit | view | — | view | view | edit |
| `rm.request-tickets` *(rule 2)* | edit | — | — | — | — | edit |
| `shared.monthly-reports` | view | view | — | **edit** *(D-13)* | view | edit |
| `mobo.recon-overview` | — | edit | — | view | view | edit |
| `mobo.trade-reconciliation` | — | edit | — | view | view | edit |
| `mobo.post-trade-allocation` | — | edit | — | **view** *(D-10)* | view | edit |
| `mobo.commission-tracking` *(rule 2)* | — | edit | — | — | — | edit |
| `pc.model-management` | view | view | — | edit | view | edit |
| `pc.allocation-matrix` | — | view | — | edit | view | edit |
| `pc.allotment-redemption` | view | view | — | edit | view | edit |
| `compliance.overview` | — | — | — | view | edit | edit |
| `compliance.review` | — | — | — | view | edit | edit |
| `admin.enroll-user` | — | — | — | — | — | edit |
| `admin.system-config` | — | — | — | — | — | edit |

(— = no row, i.e. `NONE`.) Per-role row counts, asserted by the migration test: **RM 7, MOBO 10, PM 0, PC 10, COMPLIANCE 12, ADMIN 16 = 55.** ADMIN holds exactly one `edit` row per page, so "ADMIN sees everything" stays an assertion the data itself satisfies.

**This seed deliberately changes day-one access — it is not a parity seed.** Every change it makes:

| Change | Detail |
|---|---|
| Many new **reads** | COMPLIANCE gains `view` on 10 pages it cannot reach today; PC gains `view` on the three MOBO pages and 2 RM pages; RM and MOBO gain `view` on PC pages. All read-only — the catalog's intent, now actually enforceable. |
| RM and MOBO **lose write** on Monthly Reports; PC keeps it | The catalog gives RM/MOBO/PC `view` on `shared.monthly-reports`. Overridden for PC, which keeps `edit` (D-13); RM and MOBO drop from today's `OPERATE` to `view`. The only narrowing in the seed. |
| PC gains a working PTA read | Per D-10; currently 403. |
| **Nobody loses a page** | Rules 2 and 3 exist to guarantee this. Every role keeps `edit` on every page it owns today, Monthly Reports excepted. |

Because the seed is a policy statement rather than a copy, it is reviewable in the diff as a table, and the down-migration is still a plain `DROP TABLE`.

#### B-2. Per-account overrides have no home (MANDATORY)

`Override` (`admin-frontend/lib/admin/types.ts:53-66`) carries `from`/`to` levels, a mandatory `why`, a granter and an expiry, and three seed rows live in `lib/mock/admin-data.ts:22-26`. Nothing persists them; `AdminStoreContext.addOverride` pushes onto a React array (`:156-162`).

**Refactor:**

```
page_access_overrides
  id           CHAR(36) PK                    -- UUID, matches the wire `id`
  user_id      BINARY/CHAR(36) NOT NULL FK users.id ON DELETE CASCADE
  page_id      VARCHAR(64)  NOT NULL
  level        ENUM('view','edit') NOT NULL   -- see note on NONE below
  reason       TEXT NOT NULL                  -- app-enforced non-empty (422)
  granted_by   VARCHAR(128) NULL FK users.firebase_uid ON DELETE SET NULL
  expires_at   DATETIME NULL                  -- NULL = no expiry
  created_at   DATETIME NOT NULL DEFAULT now()
  UNIQUE (user_id, page_id)
  INDEX (expires_at)
```

`ON DELETE CASCADE` on `user_id` (not `SET NULL`): an override without a subject is meaningless. `granted_by` uses `SET NULL` to match the existing `users.authorized_by` convention (`app/models/users.py:75-79`).

**Note on a `NONE` override.** The UI *can* grant `None` as a per-user exception (`ManageOverridesModal`'s level options include `none`, `LifecycleModals.tsx:123`) — i.e. "revoke this page for this one person even though their role has it". That is a real requirement and cannot be expressed by row-absence, because absence already means "fall back to the role default". **Decision:** the enum on this table is `('none','view','edit')` — three values here, two on `page_access`. The asymmetry is deliberate and documented in the model docstring.

#### B-3. The matrix's "last published by/at" and the audit log are UI-only (Yes)

System Config renders `Last published <b>{published.when}</b> by {published.by}` from `useState({ when: "12 Jul 2026", by: "Omar Bakri" })` (`AdminStoreContext.tsx:69`), and the audit log is three literal rows in `lib/mock/admin-data.ts:28-32`. Both are load-bearing for the page's own semantics — the publish flow's whole promise is "staged locally, nothing changes until you publish", which is unverifiable without a record of when publishing happened.

**Refactor:** two tables.

```
page_access_publications
  id            INT PK AUTOINCREMENT
  published_at  DATETIME NOT NULL DEFAULT now()
  actor_uid     VARCHAR(128) NULL FK users.firebase_uid ON DELETE SET NULL
  actor_name    VARCHAR(255) NULL      -- denormalised: survives the actor's deletion
  change_count  INT NOT NULL
  note          TEXT NULL              -- the PublishModal's "Change note"
  INDEX (published_at)

admin_audit_events
  id          CHAR(36) PK              -- UUID
  at          DATETIME NOT NULL DEFAULT now()
  actor_uid   VARCHAR(128) NULL FK users.firebase_uid ON DELETE SET NULL
  actor_name  VARCHAR(255) NULL        -- denormalised, as above
  event       VARCHAR(64)  NOT NULL    -- 'account.created', 'access.published', 'override.granted', …
  detail      TEXT NOT NULL            -- display string, already composed
  INDEX (at)
```

`actor_name` is denormalised on purpose: an audit row must still read correctly after the actor's account is gone. This mirrors `model_symbol_audit` (proposal 008), which is the existing pattern for an append-only trail in this codebase — same shape, no new convention.

`page_access_publications` doubles as the optimistic-concurrency token: `MatrixPublishIn.base_published_at` must equal `MAX(published_at)` or the write is rejected 409 (Backend C-5).

#### B-4. `users`/`admin_profiles` cannot express "initiated", "last seen", or the wizard's own profile fields (Yes — user req.)

The directory's three status filters are `Active | Initiated | Deactivated` and its `Last seen` column shows `Today 09:41` / `—` (`lib/mock/admin-data.ts:12-19`). `AccountStatus` has exactly two values, `active` and `disabled` (`app/models/users.py:26-28`), and there is no timestamp of any sign-in anywhere.

> The wizard's neighbouring `Password expires: Never | 24 hours | 72 hours | 7 days` control (`Wizard.tsx:210`) needed a column in the first draft of this proposal. With the set-password link (Backend C-3) no password is ever issued, so there is nothing to expire: **no `password_expires_at` column is added**, and the control is removed from the wizard (Frontend A-5). Link lifetime belongs to Firebase's action-link settings.

**Refactor:** one nullable column on `users`:

```
users.last_sign_in_at  DATETIME NULL   -- written by login_and_bind on every successful login
```

`INITIATED` is **derived**, not stored: `status='active' AND last_sign_in_at IS NULL`. Adding a third `AccountStatus` value would mean every existing `assert_can_authenticate` / status comparison in the codebase has to learn about it, and the two facts ("may they log in" vs. "have they ever") are genuinely independent — an enum conflates them.

And three on `admin_profiles`:

```
admin_profiles.department  VARCHAR(255) NULL   -- the directory's Dept column
admin_profiles.start_date  DATE         NULL   -- the wizard's "Start date" field
admin_profiles.address     TEXT         NULL   -- the wizard's "Correspondence address" field
```

`start_date` and `address` are here because the enrolment wizard already collects both (`Wizard.tsx:148-149`) and `StaffEnrollIn` carries them (§4.1). Without columns the backend would have to accept the two fields and silently discard them — a contract that lies to its caller, and an admin who types an address and sees it vanish on the next page load. Two nullable columns are cheaper than that, and `address` as `TEXT` matches the existing `client_profiles.address` precedent. `DATE` not `DATETIME` for `start_date`: it is a calendar day, and the wizard's help text says "Defaults to today".

**Migration plan (data-preserving):** purely additive — four nullable columns, no backfill. Existing admin rows read as `last_sign_in_at = NULL`, which renders them as `Initiated` in the directory until their next login. That is arguably *more* accurate than claiming a sign-in time nobody recorded; it self-corrects on first login. Down-migration drops the four columns (loses only data this feature created).

---

### C. Summary of DB-layer changes

| # | Change | Required? | Effort | Data migration? |
|---|---|---|---|---|
| B-1 | `page_access` table + 55-row seed derived from the System Config catalog matrix (D-11) | MANDATORY | M | Yes (seed only) |
| B-2 | `page_access_overrides` table (3-value level enum) | MANDATORY | S | No |
| B-3 | `page_access_publications` + `admin_audit_events` tables | Yes | S | No |
| B-4 | `users.last_sign_in_at`; `admin_profiles.department`, `.start_date`, `.address` | Yes — user req. | XS | No (additive, nullable) |

All four land in **one Alembic revision** (`0028_admin_access_control` — `0026` and `0027` are already taken by `client_portal_integration` and `ticket_status_consolidation`; the parent is the current head `b34f8c1a9d27`). Down-migration drops the four tables and four columns; it restores the pre-019 schema exactly, and the only data lost is data this feature created (access grants, overrides, audit trail, sign-in times).

**Rolling back this layer alone is not safe once the Backend layer is live.** C-2 deletes `ROLE_ACTIONS`, so there is no hardcoded grant set left to fall back to: a post-019 backend against a downgraded DB reads an empty `page_access` and denies every admin every guarded route (403). That is the deliberate fail-closed behavior, not a bug — but it means the DB downgrade is only a standalone operation while the Backend branch is *not* deployed. Otherwise revert both together, backend first. See §Rollback.

---

## Layer 2 — Backend

### A. Structural change: an `access` module, and `staff` grows a mailer

```
app/libs/access/          (new)
  __init__.py
  repository.py    -- page_access / overrides / publications / audit CRUD
  resolver.py      -- effective level per page for a user; the ONLY place the
                      override-vs-role precedence rule lives
  service.py       -- publish (atomic), grant/revoke override, audit composition
  router.py        -- /api/admin/access/{matrix,overrides}, /api/admin/audit
  pages.py         -- PAGE_IDS (the PageId literal set) + PAGE_ACTIONS map + group/label/path
app/libs/identity/
  mailer.py        (new) -- send_set_password_email(); the only email sender in the codebase
  service.py       -- create_user() creates a PASSWORDLESS identity; _DEFAULT_PASSWORD deleted
app/libs/staff/
  service.py       -- enroll() extended: set-password link, overrides, department
  router.py        -- + GET /api/admin/staff, POST /{uid}/set-password-link
app/libs/onboarding/
  service.py       -- _approve_initial() sends the client's set-password email (C-8)
app/libs/dev/      -- DELETED in full (C-9); app/schemas/dev.py deleted with it
```

Dependency direction: `auth.deps` → `access.resolver` → `access.repository`. `access` must **not** import `staff`; `staff` may import `access` (to write enrollment-time overrides). Nothing imports `auth.deps` from inside `access` (would cycle) — the resolver takes a `User` and a `Session`, not a dependency.

`pages.py` is the one place where the backend learns what pages exist. It is a hand-maintained mirror of `pages-config.ts`'s `PAGES` keys, kept honest by a test that fails when the two lists diverge (§Execution, phase 5). Generating one from the other across a language boundary buys less than it costs at 16 entries; a failing test is enough.

### B. Logic change: `require_action` resolves from the DB, and level gates the action

Today `require_action(Action.X)` looks up `ROLE_ACTIONS[role]` — a set per role, with no notion of a page or a level (`app/libs/auth/deps.py:66-82`). The action names already encode the split the frontend needs: `MODEL_VIEW` vs `MODEL_WRITE`, `POST_TRADE_ALLOCATION_VIEW` vs `_RUN`, `RECON_VIEW` (view-only, no write sibling). So the level→action derivation is a mapping, not a redesign. (`*_WRITE` is the renamed `*_MANAGE` — see C-10; the rename is what makes the map read as a straight `VIEW`/`EDIT` mirror.)

```python
# app/libs/access/pages.py
PAGE_ACTIONS: dict[str, tuple[frozenset[Action], frozenset[Action]]] = {
    #  page_id                    ( granted at VIEW ,               added at EDIT )
    "pc.model-management":       (fs(Action.MODEL_VIEW),           fs(Action.MODEL_WRITE)),
    "pc.allocation-matrix":      (fs(Action.ALLOCATION_VIEW),      fs(Action.ALLOCATION_WRITE)),
    "pc.allotment-redemption":   (fs(Action.ALLOTMENT_ACKNOWLEDGE),fs()),   # see note
    "mobo.post-trade-allocation":(fs(Action.POST_TRADE_ALLOCATION_VIEW), fs(Action.POST_TRADE_ALLOCATION_RUN)),
    "mobo.trade-reconciliation": (fs(Action.RECON_VIEW),           fs()),
    "mobo.recon-overview":       (fs(Action.RECON_VIEW),           fs()),
    "mobo.commission-tracking":  (fs(Action.RECON_VIEW),           fs()),
    "rm.client-info":            (fs(Action.CLIENT_VIEW),          fs(Action.CLIENT_WRITE)),
    "rm.onboarding-renewal":     (fs(),                            fs(Action.ONBOARDING_WRITE)),
    "compliance.review":         (fs(),                            fs(Action.ONBOARDING_REVIEW)),
    "admin.enroll-user":         (fs(Action.USER_VIEW),            fs(Action.USER_WRITE)),
    "admin.system-config":       (fs(Action.USER_VIEW),            fs(Action.USER_WRITE)),
    ...
}
```

`ALLOTMENT_ACKNOWLEDGE` sits in the VIEW bucket with nothing at EDIT because that page's only action *is* acknowledging, and today PC holds it unconditionally — putting it at EDIT would silently change behavior for a `VIEW`-granted PC. Where a page's action set genuinely has no read/write split (`RECON_VIEW`), EDIT adds nothing and the level distinction is enforced by the frontend gate only, for that page. This is recorded per-page rather than papered over: the map is the audit of which pages actually honor the split. `Action.EOD_SIGNOFF` is the one declared action with **no page in the registry at all** (the exception-report route was never added to `PAGES`) — it keeps its `ROLE_ACTIONS` grant for MOBO via an explicit `PAGELESS_ACTIONS` constant in `pages.py`, so the resolver cannot silently drop it. The full 16-entry map plus `PAGELESS_ACTIONS` belongs in the impl doc.

**Complexity/round-trips.** Today: 1 query per guarded request (`AdminProfileRepository.get_by_user_id`). After: 2 queries (`page_access` rows for the role + unexpired overrides for the user), both indexed, both keyed on values already in hand. Resolution is per-request with no cache — a published change takes effect on the caller's very next request, which is what the publish flow promises ("every affected user is updated at next page load", `ConfigModals.tsx:112`). A cache would need invalidation across workers to keep that promise; two indexed reads is cheaper than being wrong.

| | today | after | note |
|---|---|---|---|
| queries per guarded request | 1 | 3 | profile + role levels + overrides |
| queries per `GET /auth/me` | 1 | 3 | same resolver, populates `grants` |
| queries per `PUT /matrix` (N cells) | — | 1 txn: N upserts/deletes + 1 publication + 1 audit | atomic, one commit |

### C. Other backend findings

#### C-1. Every provisioned account — staff *and client* — gets the password `12345678` (MANDATORY)

`app/libs/identity/service.py:8` — `_DEFAULT_PASSWORD = "12345678"` — is passed to `auth.create_user(email=email, password=_DEFAULT_PASSWORD)` at `:22`. `create_user` is reached from `ensure_identity`, which has **two** callers: `StaffService.enroll` (`staff/service.py:50`) and `ClientService.create` (`clients/service.py:57`). So the shared constant is the initial password of every internal user *and* every onboarded client. Anyone who knows one provisioned address and this constant signs in as that person until they reset. It satisfies Firebase's documented six-character minimum, so Firebase raises nothing.

**Refactor:** `create_user(email)` creates a **passwordless** identity — `auth.create_user(email=email)` with no `password` argument — and `_DEFAULT_PASSWORD` is deleted. The account then has no password credential at all until the user sets one through the emailed link (C-3), so there is no interval during which a guessable credential exists. This is one edit in the one module that is allowed to touch Firebase identities, and it fixes both call paths at once; neither caller changes shape (`ensure_identity` still returns `(uid, created)`).

**Decision (Accepted) — link type: reset link first, email-link sign-in as the fallback.** `generate_password_reset_link` is documented for accounts that have a password provider, and this refactor mints them without one. The order is therefore: attempt `generate_password_reset_link`; if Firebase rejects it for a passwordless identity, use `generate_sign_in_with_email_link` and add a set-password step to the landing page. Explicitly **not** an option: creating the identity with a random server-chosen secret so that reset links definitely work — that re-introduces a credential the holder did not choose, which is the thing C-1 exists to remove, and "unguessable" is a property of today's generator, not a guarantee.

The choice is settled by **one integration test in phase 2** against a real Firebase project, not by argument, and it is contained: `send_set_password_email`'s signature is identical either way, so no other backend module observes the outcome. It is not contained on the frontend — the email-link branch needs a set-password form that does not exist today — so phase 2 must run **before** phase 3 is scheduled. That ordering is recorded in §Execution.

#### C-2. `ROLE_ACTIONS` is deleted, not demoted to a fallback (Yes — user req.)

`get_actions_for_role` (`actions.py:55-57`) is called from exactly one place, `require_action`'s closure (`deps.py:75`), and its own comment already names its fate: "Today: reads from hardcoded dict. Tomorrow: replace body with a DB query."

**Refactor:** `require_action` calls a new `access.resolver.actions_for(user, db) -> set[Action]`, which resolves the user's effective page levels and unions `PAGE_ACTIONS` accordingly. `ROLE_ACTIONS` and `get_actions_for_role` are **deleted outright** — the 55-row migration seed (DB B-1) is now the sole statement of which role gets what, and the hardcoded dict is the second source of truth that Goal 2 exists to remove.

An earlier draft kept them as a cold-start fallback for a backend deployed against an un-migrated DB. That is rejected: a fallback which silently grants today's full `EDIT` access whenever `page_access` reads empty is a bypass of the entire access system, reached by the very condition an attacker or a botched deploy would produce, and "it's only the documented cold-start path" is exactly how dead code justifies itself into permanence. **Instead the Backend branch declares the `0028_admin_access_control` revision a hard prerequisite.** An environment that skips the migration fails closed — every admin gets 403 on every guarded route, immediately and loudly — which is the correct failure mode for an authorisation component and is unmistakable within one page load. `Action` itself stays (it is the vocabulary `PAGE_ACTIONS` and `require_action` are written in); only the role→action dict goes.

#### C-3. Firebase's Admin SDK cannot send email; a transport must be chosen (Accepted)

Per the Firebase documentation (`https://firebase.google.com/docs/auth/admin/email-action-links`), **the Admin SDK does not send email** — `generate_password_reset_link`, `generate_email_verification_link` and `generate_sign_in_with_email_link` produce a URL that you must "insert into the custom email and then email to the corresponding user using a custom SMTP server." So `generate_invite_link` (`identity/service.py:44-48`), whose URL the current 201 responses hand back for someone to copy by hand, is not a send and never was — in either the staff or the client path.

**Decision (Accepted):** transport is the **Firebase "Trigger Email from Firestore" extension**. The backend writes one document to a Firestore `mail` collection through `firebase_admin.firestore` — the SDK it already initialises (`app/core/security.py:_init_firebase`) — and the extension delivers it through the SMTP provider configured in the Firebase console. Rationale: it satisfies "through the Firebase SDK" literally, adds no SMTP credentials to the backend's config or container, and needs no new Python dependency. The alternative considered was `smtplib` direct from the backend, rejected because it puts provider credentials in `Settings` and makes the backend responsible for retry/bounce handling that the extension already owns.

**Decision (Accepted) — the email carries a set-password link, never a password.** This supersedes the first draft of this proposal, which emailed a generated cleartext password. A link is strictly stronger: nothing reusable sits in two mailboxes and any relay between them, the link is single-use and time-bounded by Firebase, and combined with C-1's passwordless identity there is no window in which a credential exists that the user did not choose. It also removes a whole column (`password_expires_at`), a policy validator, and the "Shown once" copy-the-password affordance from the design.

**Refactor:** new `app/libs/identity/mailer.py` — one function, both portals:

```python
def send_set_password_email(
    *, to: str, name: str, link: str, portal: Portal, settings: Settings
) -> bool:
    """Queues one Firestore `mail` doc for the Trigger Email extension.
    Returns queued, not delivered. Never raises: a failed send must not roll back
    an account that Firebase and MariaDB have both already committed."""
```

Body content (fixed here so it is not invented at implementation time): the account email — stated explicitly, because it *is* the sign-in identity and the recipient may hold several addresses — the set-password link, one prominent line instructing them to set their password before signing in, a note that the link expires and that a fresh one can be requested from their administrator (staff) or their relationship manager (client), and the portal's own sign-in URL. `portal` selects between the staff and client wording and destination; there is one template file, not two senders. Under `firebase_auth_disabled` (the dev bypass) it logs the payload at INFO and returns `True`, matching how every other method in `identity/service.py` handles that flag.

`send_set_password_email` is called **after** the provisioning transaction commits. Its `bool` becomes `StaffCreatedOut.link_sent` / `LinkSentOut.link_sent`; a `False` surfaces in the UI as "account created — the invitation email could not be sent, resend it from the row menu" and is written to the audit trail. A send failure never fails the provisioning (the account exists in Firebase and MariaDB by then; failing the request would strand it), and it is always recoverable by re-sending, which is exactly what C-4's endpoint does.

#### C-4. No endpoint lists staff, and none reissues a password (Yes)

`app/libs/staff/router.py` has exactly two routes: `POST ""` and `PATCH "/{uid}"`. The directory needs a list; `ResetModal` (`LifecycleModals.tsx:27`) needs a reissue.

**Refactor:** add `GET /api/admin/staff` (→ `StaffOut[]`, `Action.USER_VIEW`; joins `admin_profiles`, counts overrides per user in one grouped subquery — not N+1) and `POST /api/admin/staff/{uid}/set-password-link` (→ `LinkSentOut`, `Action.USER_WRITE`; generates a fresh link, sends it, writes an audit row). The reissue endpoint does **not** touch the Firebase credential itself — no `update_user(password=...)` — so an admin cannot lock a user out by "resetting" them; generating a new link merely invalidates the previous unused one, and a password the user already set keeps working until they use the new link. Deactivate/reactivate are already expressible through the existing `PATCH` (`status`) and get no new routes — the FE's two modals both hit `PATCH`.

#### C-5. Publishing the matrix must be atomic and must not silently clobber (Yes)

The publish flow's stated contract is "Applies to every user holding the affected roles" as one act (`ConfigModals.tsx:105`), and two administrators can stage overlapping edits with no coordination — staging is local (Non-Goals).

**Refactor:** `PUT /api/admin/access/matrix` applies all `changes` in one transaction (upsert for `VIEW`/`EDIT`, delete for `NONE`), inserts one `page_access_publications` row and one `admin_audit_events` row, then commits. The request must carry `base_published_at` equal to the server's current `MAX(published_at)`; a mismatch returns `409 {detail: "matrix_changed_since_read", published: {...}}` and the FE re-reads and asks the admin to re-review. Last-write-wins without this check would let a stale tab silently revert another admin's publish.

#### C-6. Enrollment must reject non-`@megaannum.ai` addresses server-side (Yes)

The wizard enforces `/@megaannum\.ai$/` (`Wizard.tsx:42`) and blocks Next on failure. `StaffEnrollIn.email` is a bare `EmailStr` (`app/schemas/staff.py:6`), so a direct API call enrolls any address as an internal user.

**Refactor:** a Pydantic validator on `StaffEnrollIn.email` (and `StaffUpdateIn.email`) rejecting any domain but `megaannum.ai`, 422 with the same message the UI shows. Client-side validation is UX; this is the boundary.

#### C-7. `login_and_bind` records nothing about the login (Yes)

`POST /api/auth/admin/login` binds the token to the row and returns `UserOut` (`app/libs/auth/router.py:28-36`). Nothing writes a timestamp, so "Last seen" and the derived `INITIATED` status have no source (DB B-4).

**Refactor:** `login_and_bind` sets `users.last_sign_in_at = now()` on success, in the same transaction as the existing email-sync write. That is the whole change — the first draft also added a password-expiry gate here, which the set-password link makes unnecessary (C-3): there is no server-issued password to expire, and `assert_can_authenticate`'s existing status gate already blocks a deactivated account.

#### C-8. A client is activated with no way to sign in (Yes — user req.)

`OnboardingService._approve_initial` flips `user.status = AccountStatus.ACTIVE` (`app/libs/onboarding/service.py:339`) and writes a `client_events` row titled "Subscription active" — visible only *inside* the portal the client cannot yet enter. The client's Firebase identity was minted much earlier, at RM staging (`ClientService.create`, `clients/service.py:57`), with the shared `12345678` (C-1), and the reset link generated there (`:77`) is returned to the RM, not to the client. So today the only way in is the shared constant; after C-1 there is no way in at all. Approval is the correct moment to send: before it, `users.status` is `DISABLED` and `assert_can_authenticate` rejects the login anyway, so an earlier email would hand out a link to a door that is still locked.

**Refactor:** `_approve_initial` calls `send_set_password_email(portal=Portal.CLIENT, …)` after the approval transaction commits — same placement and same never-raises contract as the staff path. `identity` is already available to `OnboardingService` (`service.py:16` imports `FirebaseIdentityService`; `start` already takes one at `:117`), so `approve` takes the same dependency rather than a new one. `_approve_renewal` sends nothing: a renewal re-verifies documents on an account that already works. `ClientService.create` keeps returning its link in the response for now (no contract break) but that link stops being the delivery mechanism; a follow-up can drop the field.

#### C-9. `/register` is a live self-signup path into the admin portal (Yes — user req.)

`POST /api/dev/register` (`app/libs/dev/router.py:18`) takes an already-minted Firebase token plus a **caller-supplied `role`** and stages the matching `users` row itself, flipping clients straight to `ACTIVE` (`dev/service.py:22-60`). It is mounted only when `Settings.dev_mode` is true (`main.py:80`), and `main.py:35` fails closed if that flag is set in production — so it is not exploitable in a correctly-configured prod deployment. It is nonetheless a code path whose entire purpose is "create yourself an account with a role you chose", the flow is stalled, and both frontends still ship a `/register` page pointing at it.

**Refactor:** delete `app/libs/dev/` (router + service), `app/schemas/dev.py`, the conditional mount at `main.py:79-82`, and `Settings.dev_mode` with its comment at `config/py:16-18`. `main.py:35`'s fail-closed production check keeps its `firebase_auth_disabled` half and drops the `dev_mode` half. Nothing else imports the module — `dev_register` has exactly one caller (its own router), and `dev_mode` has exactly these two readers. Enrollment (`POST /api/admin/staff`) and client onboarding (`POST /api/rm/clients`) already cover every legitimate provisioning need, both behind `require_action`, so this deletes a capability rather than relocating one.

#### C-10. `MANAGE` reads as a third concept next to `VIEW`/`EDIT` (Yes — user req.)

Five actions are named `*_MANAGE` (`USER_MANAGE`, `CLIENT_MANAGE`, `MODEL_MANAGE`, `ALLOCATION_MANAGE`, `ONBOARDING_MANAGE`, `actions.py:8-24`), with values `"admin:user_manage"`, `"clients:manage"`, `"pc:model_manage"`, `"pc:allocation_manage"`, `"onboarding:manage"`. With the access level named `EDIT` on both sides of the seam (§4.1), "manage" is a third word for the same idea, and §B's `PAGE_ACTIONS` map — whose whole job is to read as a `VIEW`→`EDIT` mirror — is where the mismatch becomes actively confusing.

**Refactor:** mechanical rename to `*_WRITE`, values `"admin:user_write"`, `"clients:write"`, `"pc:model_write"`, `"pc:allocation_write"`, `"onboarding:write"`. **21 live `require_action` guard sites** — `onboarding/router.py` 10, `trade_models/router.py` 6, `allocation_matrix/router.py` 2, `staff/router.py` 2, `clients/router.py` 1 — plus 9 lines in `auth/actions.py` itself (5 enum members, 3 dict entries, 1 comment) and 2 comment references in `trade_models/test_router_symbols.py`: **32 matching lines across 7 files** (census verified against the tree, superseding this proposal's first estimate). `Action` values are not persisted anywhere and are not part of any wire contract (they appear only in `require_action` arguments and in 403 detail strings), so this is a rename with no migration and no client impact. Actions that are not `MANAGE` — `*_VIEW`, `POST_TRADE_ALLOCATION_RUN`, `EOD_SIGNOFF`, `ONBOARDING_REVIEW`, `ALLOTMENT_ACKNOWLEDGE`, `RECON_VIEW` — keep their names: they denote specific operations, not a generic write, and flattening them into `_WRITE` would lose that.

#### C-12. Two existing actions guard reads and writes with no split, and the D-11 seed would silently hand out the writes (MANDATORY)

The D-11 seed grants cross-role `view` on pages whose backend action model has never needed a read/write split, because until now only the page's owning role ever held any action there at all — and that role always held everything. Two concrete cases, both confirmed against the live route code:

- **`Action.ALLOTMENT_ACKNOWLEDGE`** is the *only* action on `pc.allotment-redemption`, and it guards all three routes: `GET /pc/allotments` (the read), `POST /pc/allotments/{id}/acknowledge`, and `POST /pc/redemptions/{id}/decide` (`onboarding/router.py:309-333`). There is no way, today, to grant "read this page" without also granting "acknowledge and decide on it."
- **`Action.CLIENT_VIEW`** correctly guards only reads in `clients/router.py`, but four routes on other routers reuse it for a write. Three of these are not an oversight — they are a **standing, twice-documented decision**: proposal 016 gates `POST /rm/allotment` and `POST /rm/redemption` (`onboarding/router.py:211,220`) on `CLIENT_VIEW`, and proposal 017 gates `POST /rm/allotments/{id}/transaction-detail` (`:234`) on it too, stating explicitly that this is "a write gated by a read-named action, accepted as-is rather than silently swapped" (017's impl doc §3.1) and instructing implementers to "reuse `Action.CLIENT_VIEW` — do not add a new `Action` member for this feature" (017's prompt). That call was correct when it was made: only RM and ADMIN ever held `CLIENT_VIEW`, and both already had every write action too, so no split existed to lose. The fourth, `POST /rm/tickets/{ref}/status` (`client_portal/router.py:231-236`), has no such paper trail and looks like a plain oversight.

Under `ROLE_ACTIONS`, none of this was reachable: only RM/PC and ADMIN ever held these actions, and both already had the corresponding write action too, so the missing split never mattered. D-11's seed changes that — it grants `view` on `pc.allotment-redemption` to RM, MOBO and COMPLIANCE, and `view` on `rm.client-info`/`rm.model-subscription` to MOBO, PC and COMPLIANCE. Mapped through the existing guards unmodified, each of those `view` grants would silently include the matching write action — any of those roles could call `POST /pc/allotments/{id}/acknowledge`, `POST /pc/redemptions/{id}/decide`, `POST /rm/allotment`, `POST /rm/redemption`, `POST /rm/allotments/{id}/transaction-detail`, or `POST /rm/tickets/{ref}/status` directly, regardless of what the frontend renders. This is a real privilege-escalation path introduced by adopting the catalog's levels, not a cosmetic inconsistency, and the ruling (2026-07-29) is to fix all six affected routes rather than deny the cells or ship the gap (D-16) — including the three 016/017 deliberately accepted, because the precondition that made accepting them safe ("only RM/ADMIN ever hold this action") is exactly what D-11 removes.

**Refactor:**
1. Add `Action.ALLOTMENT_VIEW = "pc:allotment_view"`. Repoint `GET /pc/allotments` (`onboarding/router.py:312`) from `ALLOTMENT_ACKNOWLEDGE` to `ALLOTMENT_VIEW`. `pc.allotment-redemption`'s `PAGE_ACTIONS` entry becomes `(fs(ALLOTMENT_VIEW), fs(ALLOTMENT_ACKNOWLEDGE))` — a `view` grant now reads the page and nothing else; an `edit` grant adds acknowledge/decide exactly as PC has today.
2. Repoint all **four** `CLIENT_VIEW`-guarded writes to `CLIENT_WRITE`: `POST /rm/tickets/{ref}/status` (`client_portal/router.py:236`), `POST /rm/allotment` (`onboarding/router.py:211`), `POST /rm/redemption` (`:220`), and `POST /rm/allotments/{id}/transaction-detail` (`:234`). The four matching **reads** stay on `CLIENT_VIEW` unchanged: `GET /rm/clients/{client_id}/events`, `GET /rm/subscriptions`, `GET /rm/subscriptions/{client_id}/allotments`, `GET /rm/allotments/{id}/transaction-detail`, plus `clients/router.py`'s three existing reads. `rm.client-info`/`rm.model-subscription`'s `PAGE_ACTIONS` entries stay `(fs(CLIENT_VIEW), fs(CLIENT_WRITE))` — now genuinely safe, since `CLIENT_VIEW` no longer guards anything but a read anywhere in the codebase.

One new action and six router-guard reassignments, zero DTO or route-shape changes — and they are the reason D-11's "no role gains a write it did not already have" holds as stated rather than as an aspiration. A reader tracing 016/017's history will find their "accepted as-is" notes; this is why 019 reopens that call rather than being inconsistent with it.

#### C-11. Deactivating **or demoting** an RM orphans their client book and their open tickets (Yes — user req.)

The UI's "Reassign **4 open items** to another user" checkbox (`LifecycleModals.tsx:165-173`) is a hardcoded literal offered to *every* role, with no backing concept. Underneath, one thing genuinely breaks and one thing genuinely does not:

- **Breaks: the client book.** `ClientRepository._scoped` filters non-full-visibility roles to `ClientProfile.assigned_rm_uid == rm_firebase_uid` (`clients/repository.py:103-108`). Deactivate an RM and their clients are visible to full-visibility roles only — no RM sees them, no RM can be assigned new work on them. Onboardings, allotments/redemptions and events carry **no** RM column (all keyed on `user_id` alone), so they follow the book automatically: re-point `assigned_rm_uid` and the whole downstream pipeline moves with it, with no per-record migration.
- **Breaks separately: open tickets.** `client_tickets.assigned_rm_uid` is a deliberate *denormalised snapshot* taken at raise time, specifically so that reassigning a book does **not** move historical tickets to a different RM (proposal 018, B-1, documented at `models/onboarding.py:368-372`). That rule is right for terminal tickets and wrong for live ones: a live ticket snapshotted to a deactivated RM sits in nobody's inbox. **"Open" means `TicketStatus IN ('new','in_progress')`** — the enum has no `closed` member (`models/onboarding.py:352-356`: `new`/`in_progress`/`resolved`/`declined`), and `resolved`/`declined` are terminal, so they keep their original snapshot exactly as 018 intended.
- **Does not break: every other role.** PC, COMPLIANCE, MOBO, PM and ADMIN own nothing per-person — no table carries a `pc_uid`/`compliance_uid` assignment for pending work, and full-visibility roles see everything regardless of who is active. There is nothing to hand over.

**Two triggers, not one (Accepted).** Deactivation is the obvious one. A **role change away from RM** does exactly the same damage while leaving the account alive: edit an RM holding 23 clients to `MOBO` and those 23 rows still carry their uid, so `_scoped` matches no active RM's book and only `ADMIN` (`FULL_VISIBILITY_ROLES = {AdminRole.ADMIN}`, `clients/repository.py:19`) can open them. New tickets those clients raise snapshot the ex-RM's uid at raise time and land in an inbox no RM holds (`client_portal/service.py:344` gates on `ticket.assigned_rm_uid != rm_uid`). And in reverse: if the matrix later grants MOBO a client page, or that user gets an override, `_scoped` still matches their uid — they would see a book belonging to a role they no longer hold.

**Refactor:** replace the fabricated checkbox with a **book handover**, scoped to RMs, fired by either trigger:

1. `StaffOut` gains `client_count` and `open_ticket_count`, computed in `GET /api/admin/staff`'s existing grouped subquery pass (two more aggregates alongside `override_count` — still one query, still not N+1) and **null for every non-RM role**. This is what both surfaces render, so the number shown is real.
2. `PATCH /api/admin/staff/{uid}` **requires** `reassign_book_to` when the target is an RM with `client_count > 0` **and** the patch either sets `status: "DEACTIVATED"` or sets `role` to anything other than `RM`. Without it: `409 "Reassign this RM's client book before deactivating"` / `409 "Reassign this RM's client book before changing their role"`. Refusing beats silently orphaning, and beats picking a receiver on the admin's behalf. The two triggers share one guard function — the condition is "this user is about to stop being an active RM", evaluated once, not two parallel checks that can drift.
3. Inside the same transaction as the status/role write: `UPDATE client_profiles SET assigned_rm_uid = :to WHERE assigned_rm_uid = :from`, then `UPDATE client_tickets SET assigned_rm_uid = :to WHERE assigned_rm_uid = :from AND status IN ('new','in_progress')`. Two statements, no row-by-row work, atomic with the change — there is never a committed state where the book is orphaned. `reassign_book_to` is validated first (exists, `ACTIVE`, `AdminRole.RM`, not the user being changed) → 422 otherwise, reusing `ClientService.assert_is_rm` rather than a second implementation.
4. One `admin_audit_events` row records the trigger, the counts and both parties: `"Deactivated A · book of 23 clients + 4 open tickets → B"` / `"A RM → MOBO · book of 23 clients + 4 open tickets → B"`.

Reactivation does **not** un-hand-over — the same asymmetry the UI already states for the old checkbox ("Reassignment is **not** undone on reactivation", `:167`), and the correct behavior: the receiving RM has been working those clients since. Nor does promoting someone back to RM restore a book.

> **ponytail:** this is the simpler alternative the user asked for. It replaces a generic per-item reassignment engine (an "open item" abstraction spanning tickets, onboardings and allotments, plus a queue and a UI for it) with two `UPDATE`s on the two columns that actually encode ownership. Closed tickets keep 018's snapshot semantics untouched, so nothing historical moves.

### D. Route / contract simplification

> **Decision (settled):** C-4, C-5, C-9 and C-12 are accepted. One route is **removed** (`POST /api/dev/register`, C-9); no route is renamed; **five** existing routes' action guards are **corrected** (C-12): `GET /pc/allotments` (`ALLOTMENT_ACKNOWLEDGE` → new `ALLOTMENT_VIEW`), `POST /rm/tickets/{ref}/status`, `POST /rm/allotment`, `POST /rm/redemption`, `POST /rm/allotments/{id}/transaction-detail` (all four `CLIENT_VIEW` → `CLIENT_WRITE`); `StaffOut` gains fields (additive — no current consumer, since the FE never called it).
>
> Final admin-surface route list after this layer lands:
> ```
> GET    /api/admin/staff                          staff directory (USER_VIEW)
> POST   /api/admin/staff                          enroll + email a set-password link (USER_WRITE)
> PATCH  /api/admin/staff/{uid}                    edit profile / role / status (USER_WRITE)
> POST   /api/admin/staff/{uid}/set-password-link  re-send a set-password link (USER_WRITE)
> GET    /api/admin/access/matrix                  pages × roles × levels + published meta (USER_VIEW)
> PUT    /api/admin/access/matrix                  atomic publish + audit (USER_WRITE)
> GET    /api/admin/access/overrides               ledger (USER_VIEW)
> POST   /api/admin/access/overrides               grant (USER_WRITE)
> DELETE /api/admin/access/overrides/{id}          revoke (USER_WRITE)
> GET    /api/admin/audit                          audit trail (USER_VIEW)
>
> DELETED: POST /api/dev/register                  (the whole app/libs/dev module)
> ```
> Net: **2 → 10 routes** on the admin surface, **−1** elsewhere (+1 extended: `UserOut.grants` on `/api/auth/me` and both `/api/auth/*/login`; the client path gains no route — its email fires inside the existing approve endpoint).

### E. Summary of Backend-layer changes

| # | Change | Required? | Effort |
|---|---|---|---|
| A | New `app/libs/access/` module (repository / resolver / service / router / pages) | MANDATORY | M |
| B | `require_action` resolves level→actions from the DB via `PAGE_ACTIONS`; `VIEW` blocks mutating endpoints | MANDATORY | M |
| C-1 | Delete `_DEFAULT_PASSWORD`; `create_user` mints a **passwordless** identity (fixes staff *and* client paths) | MANDATORY | XS |
| C-2 | **Delete** `ROLE_ACTIONS` + `get_actions_for_role`; the migration seed is the sole authority; missing migration fails closed | Yes — user req. | XS |
| C-3 | `identity/mailer.py` — set-password-link email via the Firestore Trigger Email extension, both portals | Yes — user req. | M |
| C-4 | `GET /api/admin/staff` + `POST /api/admin/staff/{uid}/set-password-link` | Yes | S |
| C-5 | Atomic matrix publish with `base_published_at` concurrency guard + audit row | Yes | S |
| C-6 | Server-side `@megaannum.ai` domain validation on enroll/update | Yes | XS |
| C-7 | `login_and_bind` writes `last_sign_in_at` | Yes — user req. | XS |
| C-8 | `_approve_initial` emails the client their set-password link at approval | Yes — user req. | S |
| C-9 | Delete `app/libs/dev/`, `app/schemas/dev.py`, the conditional mount and `Settings.dev_mode` | Yes — user req. | XS |
| C-10 | Rename `Action.*_MANAGE` → `*_WRITE` (5 members, 21 guard sites, 32 lines total) | Yes — user req. | S |
| C-11 | RM book handover on deactivation **and** on a role change away from RM: 2 counts on `StaffOut`, `reassign_book_to`, 2 `UPDATE`s, one shared guard, 409×2/422 | Yes — user req. | M |
| C-12 | New `Action.ALLOTMENT_VIEW`; repoint `GET /pc/allotments`'s guard and all four `CLIENT_VIEW`-guarded writes (`POST /rm/tickets/{ref}/status`, `/rm/allotment`, `/rm/redemption`, `/rm/allotments/{id}/transaction-detail`) so a `view` grant can no longer imply a write | MANDATORY | M |
| — | `UserOut.grants` populated by the resolver on `/auth/me` and both logins | MANDATORY | XS |

---

## Layer 3 — Frontend

| File | LOC | Role |
|---|---|---|
| `lib/admin/AdminStoreContext.tsx` | 203 | the mock store — every mutation is React state; becomes the API-backed store |
| `lib/admin/catalog.ts` | 74 | `ROLES` + `PAGE_CATALOG` with 17 hand-written paths, 14 of them non-existent |
| `lib/admin/types.ts` | 101 | `Level`, `Override`, `AdminUser`, `EnrollDraft`, `AuditEntry` |
| `lib/admin/password.ts` | 6 | 12-char generator, described as "temporary password" |
| `lib/mock/admin-data.ts` | 30 | the seed — deleted |
| `lib/pages-config.ts` | 291 | `AccessLevel`, `PAGES`, `ROLE_PAGES`, `rolesForPath`, `groupsFor` |
| `app/(roles)/admin/enroll-user/page.tsx` | 137 | directory / wizard / overrides view switch |
| `app/(roles)/admin/system-config/page.tsx` | 121 | matrix / role view switch, staged bar, publish |
| `components/admin/**` (10 files) | 1 934 | Directory, Wizard, LifecycleModals, OverridesLedger, Matrix, RoleView, ConfigModals, AccessEditor, AuditModal, Shared |
| 11 other files (see A-4) | — | 32 `{/* View/Edit Gate Function */}` markers |

Canonical data-flow chain in this repo: `page → server action (server/<domain>/index.ts) → apiClient → ENDPOINTS`. The admin pages are the only feature that skips it entirely — there is no `server/admin/` directory.

### A. Findings

#### A-1. `PAGE_CATALOG` manages 14 pages that do not exist (MANDATORY)

`lib/admin/catalog.ts:23-51` hand-writes 17 `{name, path, levels[]}` entries. Cross-checked against `pages-config.ts`'s `PAGES` (16 real `PageId`s), only `/compliance/overview`, `/admin/enroll-user` and `/admin/system-config` match. `/rm/dashboard`, `/rm/onboarding`, `/rm/subscription`, `/rm/reports`, `/mobo/dashboard`, `/mobo/reconciliation`, `/mobo/allocation`, `/mobo/exceptions`, `/pc/models`, `/pc/matrix`, `/pc/guidelines`, `/pc/allotment`, `/compliance/guidelines`, `/compliance/redemptions` are not routes in this application. Conversely the matrix cannot reach `rm.request-tickets`, `mobo.commission-tracking`, `mobo.recon-overview`, `shared.monthly-reports` or `pc.allotment-redemption` at all. The `levels[]` arrays are also positional — index 0..5 must silently match `ROLES` order (`kFor(path, roleIdx)`, `:63`), so a reorder corrupts every grant.

**The `levels[]` data itself is not discarded — it is promoted.** Per D-11 it is the source of the DB layer's 55-row seed, re-keyed onto real `PageId`s by the 14-row mapping in DB B-1. So this finding deletes the catalog's *fictional paths* and its *fragile positional indexing*, while its access policy survives the move into `page_access` and becomes enforceable for the first time. Once the migration carries those values, the frontend copy is redundant and goes with the rest of the literals.

**Refactor:** `PAGE_CATALOG` is derived, not written:

```ts
// lib/admin/catalog.ts — no path literals, no positional level arrays
import { PAGES, type PageId } from "@/lib/pages-config";
export const PAGE_GROUPS: Array<[group: string, pages: Array<{ id: PageId; label: string; path: string }>]>
  = groupBy(Object.values(PAGES), (p) => p.subgroup ?? "Other");
```

Every store key, override, staged change and wire field moves from `path` to `page_id`. `PAGE_BY_PATH` and `kFor(path, roleIdx)` become `PAGE_BY_ID` and `kFor(pageId, role)` — keyed by the role **code**, not its index, so `ROLES` order stops being load-bearing. `pages.check.ts` (the existing validator) gains an assertion that the server's `MatrixOut.pages` ids and the local `PAGES` keys are the same set.

#### A-2. Two access vocabularies, and `OPERATE` has to go (Yes — user req.)

`pages-config.ts:23` declares `AccessLevel = "OPERATE" | "VIEW"`; `lib/admin/types.ts:17` declares `Level = "none" | "view" | "edit"`. `OPERATE` and `edit` are the same thing under two names, and `none` has no counterpart in the guard's model (absence stands in for it there). "OPERATE" was chosen in proposal 009 to mirror the backend's action naming; the admin console — the surface a human actually reads — says "Edit", and its `CellModal` even spells out the three meanings for the user: "Hidden from nav, route blocked" / "Read-only — no writes or actions" / "Full use of the page's actions" (`ConfigModals.tsx:20-24`).

**Refactor:** one type, in `pages-config.ts`, matching §4.1: `export type AccessLevel = "NONE" | "VIEW" | "EDIT"`. `lib/admin/types.ts` re-exports it as `Level` for the console's existing call-sites (`LEVEL_LABEL`, `LevelSeg`, `LevelBadge`, `LevelDiff` keep working after a case fold). `ROLE_PAGES`'s literal values become `"EDIT"`, and `ALL_OPERATE` is renamed `ALL_EDIT`. Grep for `OPERATE` must return nothing.

#### A-3. The store is mock-backed; there is no `server/admin/` (MANDATORY)

`AdminStoreProvider` seeds from `ADMIN_USERS`/`ADMIN_OVERRIDES`/`ADMIN_AUDIT` and every mutator is a `setState` (`AdminStoreContext.tsx:65-70,156-187`). No file under `admin-frontend/server/` mentions admin/staff/access.

**Refactor:** new `server/admin/index.ts` exposing one server action per §4.1 route, and `ENDPOINTS.ADMIN` entries in `server/endpoints.ts`. `AdminStoreProvider` takes its initial `users`/`overrides`/`levels`/`audit`/`published` as props from a server component that fetches them, and each mutator becomes `await action(...)` followed by a local state patch on success and a `toast.error` on failure. `lib/mock/admin-data.ts` is deleted; `TODAY` (three importers, five use sites — one of them the store itself, not a component) moves to a local `todayLabel()` helper.

The staged-changes model is **unchanged** — `staged`, `stage()`, `discard()`, `stagedList` stay purely local, and `publish(note)` becomes one `PUT /matrix` carrying `changes` + `note` + `base_published_at`. On a 409 the store re-reads the matrix and surfaces "someone else published — review again".

#### A-4. The 32 gate markers are inert comments (Yes — user req.)

`{/* View/Edit Gate Function */}` appears 32 times across 11 files, each immediately above a mutating control, and nothing reads it:

| File | Markers | What is gated |
|---|---|---|
| `components/rm/OnboardingModal.tsx` | 7 | onboarding step actions |
| `components/rm/RequestTickets.tsx` | 4 | ticket create / respond / close |
| `components/rm/ContactLog.tsx` | 4 | log entry add / edit |
| `components/compliance/review/CrDetailPanel.tsx` | 4 | compliance verdict controls |
| `app/(roles)/mobo/trade-reconciliation/page.tsx` | 4 | recon actions |
| `components/compliance/review/ObDetailPanel.tsx` | 3 | onboarding review verdict |
| `app/(roles)/mobo/commission-tracking/page.tsx` | 2 | commission actions |
| `components/rm/SubscriptionAccordion.tsx` | 1 | subscription edit |
| `components/rm/TransactionDetailModal.tsx` | 1 | transaction edit |
| `app/(roles)/mobo/recon-overview/page.tsx` | 1 | overview action |
| `app/(roles)/rm/model-subscription/page.tsx` | 1 | subscription action |

**Refactor:** `admin-frontend/hooks/usePageAccess.ts` **already exists** — written in proposal 009 as the forward declaration for exactly this, and it has **zero consumers today** (grep: the only `usePageAccess` hit in the repo is its own definition). It is rewritten in place, not re-created elsewhere:

```ts
// hooks/usePageAccess.ts — EXISTING file. Body changes from the static
// accessLevel(role, pageId) lookup to the server-resolved grant map.
export function usePageAccess(pageId: PageId): AccessLevel {
  const { portalUser } = useAuth();
  return portalUser?.grants?.[pageId] ?? "NONE";   // was: accessLevel(portalUser.role, pageId)
}
export function useCanEdit(pageId: PageId): boolean {
  return usePageAccess(pageId) === "EDIT";
}
```

Its return type loses the `| null` (a missing grant is `"NONE"`, one spelling instead of two) and its docstring loses the `OPERATE` wording. `useCanEdit` is the new export — a one-line wrapper, because 32 call sites asking `=== "EDIT"` each is 32 chances to typo the comparison.

**Every marker site is HIDDEN, not disabled, at `VIEW` (Accepted — D-14).** Each site becomes `{canEdit && …}`, so a `VIEW` user sees a page with no mutating affordances at all rather than a page full of greyed-out ones. A disabled control still reads as *conditionally* operable — the user assumes some state, selection or record would light it up, tries to find it, and eventually asks why the button does not work. An absent control makes no such promise. Where a container's only children are gated controls (a toolbar row, an actions cell, a modal footer's action span), the container is hidden with them so no empty shell or stray divider is left behind; where a gated control sits beside surviving ones, only it goes.

The comment stays as the anchor. No component gains a new prop: the hook reads context, so `useCanEdit` is called in the component that owns the control.

> To be precise about what this buys: hiding and disabling are **equally cosmetic** — neither is a security boundary, and both are trivially defeated by anyone willing to open a console. The real gate is `require_action` on the endpoint (Backend B), which returns 403 regardless of what the DOM shows. Hiding is chosen purely because it tells the truth to an honest user, which is the whole job of the frontend half of this feature.

**The namespace guards change shape, because `rolesForPath` cannot survive as written.** Its body answers "which roles can reach this path" by iterating `ROLE_PAGES` (`pages-config.ts:259-267`) — and `ROLE_PAGES` is deleted. Worse, the question is no longer answerable in the browser at all: grants live in the DB, so the frontend knows only *its own* user's grants, never another role's. Any `allowedRoles={…}` computed client-side would be a guess.

So the five `layout.tsx` files invert the check: instead of "is my role in this path's role list", they ask "do I hold any grant under this prefix". `rolesForPath` splits — its path→`PageId` resolution half survives as `pageIdForPath(pathname)` (still pure, still local, used by both the guard and `<NoAccess>`), and its role-set half is deleted with `ROLE_PAGES`. `RoleGuard` keeps its component shape and its loading/redirect behaviour; only the predicate it is handed changes from a role-membership test to a grant test. Per-page precision then comes from `usePageAccess`, which is where the sub-page granularity actually needs to be.

**Cross-role grants appear under the role's existing single nav parent (D-15).** The seed gives COMPLIANCE `view` on nine pages outside its own domain, and PC `view` on the MOBO pages, so a role's nav children now span domains. `groupsFor` already produces exactly this — one parent labelled with the role's name, children grouped by their `subgroup` ("Client Management", "Trade Management", "System") which `RoleGroup` renders as headers. **No code change, and no new nav group.** Proposal 009's "never a mix of other roles' domains" rule is explicitly superseded here: it described an earlier business requirement, and cross-role read access is the current one.

**What a `NONE` grant does (settled, Q-4).** Its normal effect is invisibility: `groupsFor(role)` builds the sidebar from the grant set, so a `NONE` page simply is not listed — no link, no hint it exists. That is the whole story for the ordinary case, and it needs no new UI. The blocked state exists only for the ways a user can arrive at a page that is not in their sidebar — a typed or pasted URL, a bookmark from before the grant was reduced, a deep link in an email, or an in-app cross-link from a page they *do* hold. For those, the page renders one explicit blocker card ("You do not have access to this page. Ask an administrator if you need it." plus a link to their default page) rather than redirecting: a silent bounce from a URL a colleague just sent them reads as a broken link and generates a support question, where a named refusal answers it. One shared `<NoAccess pageId>` component in `components/auth/`, rendered by the guard when the pathname resolves to a `PageId` the user's grants omit; no per-page work.

#### A-5. "Temporary password" is the wrong name in 14 places — and with a set-password link there is no password to name (Yes — user req.)

Occurrences: `Wizard.tsx:64` ("Temporary password issued"), `:200` (field label), `:204`/`:206` (two toasts), `:209`/`:211` (help text), `:218` (Notice); `LifecycleModals.tsx:27` ("Reset temporary password"), `:43` ("Temporary password reissued"), `:44` (toast), `:53` (field label), `:62` (Notice), `:210` ("temporary password required"), `:249` ("Temporary password" label), `:260`; `Directory.tsx:139` (menu item "Reset temporary password"); `password.ts:3` (docstring). Plus `store.log` detail strings.

The requested rename ("temporary password" → "password") and the set-password link land on the same strings, so they are one edit. Where the string names a *field* the user no longer sees, the field goes with it:

**Refactor:**
- `lib/admin/password.ts` is **deleted** — the frontend no longer generates, displays or transmits a password (Backend C-1/C-3). Its three importers (`enroll-user/page.tsx:23`, `Wizard.tsx:21`, `LifecycleModals.tsx:20`) drop the import.
- **Wizard, Credentials step** (`Wizard.tsx:198-221`): the password `TextField` (with its regenerate/copy buttons) and the "Password expires" `SelectField` are removed; the "Email the invitation to <email>" checkbox and the "Creates the account immediately — no second approver" Notice stay. The step's help text becomes "…sets their own password from a link we email to {email}", the step label stays "Credentials", and `DONE.creds` becomes "Set-password link sent" / "Credentials unchanged" (edit mode). This is the layout change flagged in the front matter — it removes two controls from one step and adds none.
- **`ResetModal`** (`LifecycleModals.tsx:27-65`) becomes `SendLinkModal`: title "Send set-password link", no password field, no expiry select, keeps the "Email the new credentials to {email}" checkbox reworded to "Email the link to {email}", and its Notice becomes "Any earlier unused link stops working the moment this is sent." Its button calls `POST /api/admin/staff/{uid}/set-password-link`. `Directory.tsx:139`'s menu item becomes "Send set-password link".
- **`CreatedModal`** (`LifecycleModals.tsx:217-264`): the "Shown once" panel loses its password row and its `shown`/`EyeOff` reveal toggle; it keeps the email row and the "Copy" button (now copying the email alone). The footer note "Once this closes, only a password reset can issue a new one" becomes "The link expires — re-send it from the row menu if they miss it."
- **`ReactivateModal`** (`:210`): "Sign-in needs a fresh temporary password" → "Sign-in needs a fresh set-password link", and its `setStatus` call is followed by the same re-send action.
- Every remaining string: "password" / "Password" / "Set-password link sent".

#### A-8. The `/register` self-signup page must go from both frontends (Yes — user req.)

`admin-frontend/app/(auth)/register/page.tsx` posts through `postBackendRegister` (`lib/auth-api.ts:60-69`) → `POST /api/dev/register`, and `app/(auth)/login/page.tsx:129-130` links to it as "Register (dev only) →". `AuthProvider` carries the whole path: `signUpWithEmailPassword` (`:139-157`), the `isRegistering` ref and the `onAuthStateChanged` branch that exists solely to yield to it (`:44,68-74`), and both context entries (`:29,215,229`). `client-frontend` has the same five files (`app/register/page.tsx`, `app/login/page.tsx`, `lib/auth-api.ts`, `lib/firebase-auth-errors.ts`, `components/auth/AuthProvider.tsx`).

**Refactor:** in **both** frontends delete the `register` route directory, `postBackendRegister`, `signUpWithEmailPassword`, the `isRegistering` ref and its `onAuthStateChanged` branch, the two `AuthContextValue` entries, and the login page's register link. `lib/firebase-auth-errors.ts`'s `auth/email-already-in-use` branch goes too — `createUserWithEmailAndPassword` was its only producer. Deleting the `isRegistering` branch also removes the one code path that could leave `portalUser` null on a successful auth state change, which simplifies the provider rather than complicating it. Net: the client SDK is used for sign-in and token refresh only; no frontend can mint a Firebase identity.

#### A-6. The overrides ledger belongs to System Config (Yes — user req.)

Today it is a third page-local view inside Enroll User (`enroll-user/page.tsx:27,104-105`), reached from the directory's `Overrides ({n})` button (`Directory.tsx:66`), and `OverridesLedger` renders its own `PageHeader` with a "Back to directory" button. System Config already has a two-way `ViewSwitch` (`system-config/page.tsx:62`) and already displays the override count in its toolbar ("… · N per-user exceptions", `:65`) — the data is on that page's mind already.

**Refactor:**
- `components/admin/enroll/OverridesLedger.tsx` → `components/admin/config/OverridesLedger.tsx`; `AddOverrideModal` moves from `enroll/LifecycleModals.tsx` to `config/ConfigModals.tsx`. `ManageOverridesModal` (per-row, per-user) **stays** in Enroll User — it is a directory row action, not the ledger.
- `ConfigView` becomes `"matrix" | "role" | "overrides"` and `ViewSwitch` gains the third option. The ledger drops its own `PageHeader` and "Back to directory" button; its `Add override` button moves into the System Config header's actions, shown only on the overrides view. Its four stat cards are kept as-is.
- Enroll User's `Overrides ({n})` button becomes a `<Link href="/admin/system-config?view=overrides">`; System Config reads that one search param to pick the initial view. Enroll User's `View` union loses `"overrides"`.

Both pages remain under `AdminStoreProvider` (`app/(roles)/admin/layout.tsx`), so the ledger reads the same store after the move with no prop threading.

#### A-7. The wizard's Access-review step writes overrides that the seam does not carry as levels-by-path (Yes)

`createUser` walks `d.ovr` (`Record<path, Level>`) and calls `store.addOverride` per entry with `page: p.name, path` and a hardcoded `exp: "30 Sep 2026"` / `why: "Set during enrolment"` (`enroll-user/page.tsx:88-91`). A real enrollment cannot invent an expiry, and the reason is not the admin's.

**Refactor:** the wizard's Access step keeps its `AccessEditor` unchanged, but the enrollment request carries `overrides: [{page_id, level, reason, expires_at}]` (§4.1) built from `d.ovr`, with `reason` defaulting to the literal string shown in the step's own Notice and `expires_at` from a new per-enrollment expiry select that reuses `EXPIRY_OPTS` — the same control `AddOverrideModal` already has (`LifecycleModals.tsx:24,315`). One `SelectField` added to the Access step's existing Notice row; no other layout change.

### B. Adapting to changes in other layers

| Upstream change | Frontend change | Files touched |
|---|---|---|
| Backend `UserOut.grants` | `PortalUser` type gains `grants`; the **existing** `usePageAccess` is rewritten to read it and `useCanEdit` is added beside it — no new hook file | `types/portal.ts`, `hooks/usePageAccess.ts` |
| Backend B (`VIEW` blocks mutating endpoints) | Hide the 32 marker sites at `VIEW` (D-14) so a `VIEW` user is never shown a call that would 403 | the 11 files in A-4 |
| Backend C-1/C-3 (passwordless identity + set-password link) | No password anywhere in the FE: `password.ts` deleted, wizard's password field + expiry select removed, `CreatedModal`'s reveal panel loses its password row, `ResetModal` → `SendLinkModal` (A-5) | `Wizard.tsx`, `LifecycleModals.tsx`, `Directory.tsx`, `enroll-user/page.tsx`, `lib/admin/password.ts` (deleted) |
| Backend C-3 (`link_sent`) | `CreatedModal`'s "The invitation email has been sent" becomes conditional on `link_sent`; a `false` shows a warning Notice pointing at the row menu's re-send | `LifecycleModals.tsx:238` |
| Backend C-9 (`/api/dev/register` deleted) | Both frontends' register route, `postBackendRegister`, `signUpWithEmailPassword` and the login page's register link are deleted (A-8) | 5 files × 2 frontends |
| Backend C-10 (`*_MANAGE` → `*_WRITE`) | No frontend change — action names never crossed the wire; only 403 detail strings mention them, and those are displayed verbatim | — |
| Backend C-4 (`GET /api/admin/staff`) | Directory renders server data; `AdminUser.initials`/`tone` derive client-side from `name`/`status` rather than being stored | `AdminStoreContext.tsx`, `lib/admin/types.ts` |
| Backend C-5 (409 on stale publish) | `publish()` handles 409: re-read matrix, keep staged changes, toast "someone else published — review again" | `AdminStoreContext.tsx`, `ConfigModals.tsx` |
| DB B-4 (`INITIATED` derived) | Directory's status filter/chip reads `StaffOut.status` verbatim — no client-side derivation | `Directory.tsx` |
| Backend C-11 (book handover, both triggers) | `DeactivateModal`'s reassign control becomes required-for-RMs and hidden for everyone else, showing the real `client_count`/`open_ticket_count`; the wizard's Role step gains the same picker when an RM's role is changed away from RM; `PATCH` carries `reassign_book_to`; either 409 surfaces as "pick a receiving RM" | `LifecycleModals.tsx:133-181`, `Wizard.tsx:153-181`, `enroll-user/page.tsx`, `AdminStoreContext.tsx` |

### C. Additional findings

- **`AdminUser` carries derived fields** (`initials`, `tone`, `seen`) alongside stored ones (`lib/admin/types.ts:42-51`). `tone` is a pure function of `status` (`STATUS_TONE`, `AdminStoreContext.tsx:26`) and `initials` of `name`; both become computed at render, so the wire type is `StaffOut` and nothing has to be kept in sync. `seen` becomes a formatter over `last_sign_in_at`.
- **`Override.from`/`Override.role` are snapshots that drift.** `from` is the role default captured at grant time (`enroll-user/page.tsx:90` passes `store.eff(...)`); if the matrix later changes, the ledger's "Default → granted" column lies. §4.1's `OverrideOut.role_default` is resolved server-side at read time instead, so the column is always current. `Override.role`/`Override.name`/`initials` likewise come from the join, not from a copy.
- **`uid`/`nextId()`** (`AdminStoreContext.tsx:23-24`) generates `x1`, `x2`… client-side for overrides and audit rows. Both are server-assigned UUIDs now; the counter is deleted.
- **Deactivation's "4 open items reassigned"** (`LifecycleModals.tsx:152-153,165-173`) becomes the RM book handover (Backend C-11), which is a real, countable thing rather than a literal. `DeactivateModal` reads `client_count`/`open_ticket_count` off the user's `StaffOut`:
  - **RM with `client_count > 0`:** the checkbox becomes a **required** field, not an opt-in — label "Hand this RM's book to", copy "**{client_count} clients** and **{open_ticket_count} open tickets** move to the receiving RM. Closed tickets stay on the record as {name}'s." The `SelectField` lists active RMs only (filtered from the directory the page already holds — no new fetch), and the Deactivate button is disabled until one is picked. Same control, same slot, same layout; only the label, the copy and the required-ness change.
  - **Every other role, and an RM with an empty book:** the checkbox and its select are **not rendered**. The modal keeps its two informational rows (overrides held, sign-in identity reserved) and its reason field. This is a removal in a case where the control was lying, which the constraint permits.
  - The existing "Reassignment is **not** undone on reactivation" sub-line stays — it was already correct.
- **The wizard's Role step gains the same handover control, in edit mode only** (Backend C-11's second trigger). Editing an RM who holds a book and picking any role other than `RM` reveals, inside the step's existing `Notice` slot, "**{client_count} clients** and **{open_ticket_count} open tickets** move to:" plus the same active-RM `SelectField`, and `Save changes` stays disabled until a receiver is chosen. The step already renders a role-change warning Notice in edit mode (`Wizard.tsx:176-179`), so this replaces that Notice's text rather than adding a row. `startEdit` (`enroll-user/page.tsx:60-68`) already receives the full `AdminUser`, so it carries the two counts into the draft — no extra fetch. Picking `RM` again, or editing a non-RM, shows the current Notice unchanged.

### D. Summary of Frontend-layer changes

| # | Change | Required? | Effort |
|---|---|---|---|
| A-1 | `PAGE_CATALOG` derived from `PAGES`; everything re-keyed `path` → `page_id`, `roleIdx` → role code | MANDATORY | M |
| A-2 | One `AccessLevel = "NONE" \| "VIEW" \| "EDIT"`; `OPERATE` removed everywhere | Yes — user req. | S |
| A-3 | `server/admin/index.ts` + `ENDPOINTS.ADMIN`; store fetches and writes through it; mock deleted | MANDATORY | L |
| A-4 | `usePageAccess`/`useCanEdit`; all 32 marker sites **hidden** at `VIEW` (D-14); sidebar omits `NONE` pages; one shared `<NoAccess>` blocker card for direct navigation | Yes — user req. | M |
| A-5 | "temporary password" → "password"; `password.ts` deleted; wizard's password field + expiry select removed; `ResetModal` → `SendLinkModal`; `CreatedModal` reveal panel loses its password row | Yes — user req. | S |
| A-6 | Overrides ledger + `AddOverrideModal` move to System Config as a third view; Enroll User links across | Yes — user req. | S |
| A-7 | Wizard sends real `overrides[]` with an admin-chosen expiry; one `SelectField` added | Yes | S |
| A-8 | Delete the `/register` page, `postBackendRegister`, `signUpWithEmailPassword` and the login link — in **both** frontends | Yes — user req. | S |
| C | Derived `initials`/`tone`/`seen`; server-resolved `role_default`; delete `nextId()` | Yes | S |

---

## Dead code purged (complete list)

<!-- Assembled by grepping every symbol this proposal supersedes for surviving
readers. Anything this change makes unreachable is deleted in the same layer
branch that makes it unreachable — nothing is left "for later" or kept as a
fallback. A reviewer can check this table with the greps in the last column. -->

Two rules applied throughout: **(1)** if this proposal removes a symbol's last reader, the symbol goes in the same branch — not in a follow-up. **(2)** "kept as a fallback" is not an exemption; C-2 is the case where that reasoning was tried and rejected.

| Layer | Deleted | Why it is dead after this change | Grep to confirm |
|---|---|---|---|
| Backend | `ROLE_ACTIONS`, `get_actions_for_role` (`auth/actions.py:34-57`) | `access.resolver.actions_for` is the only authority; the seed replaces the dict (C-2) | `ROLE_ACTIONS` |
| Backend | `_DEFAULT_PASSWORD` (`identity/service.py:8`) | identities are created passwordless (C-1) | `12345678` |
| Backend | `app/libs/dev/` (router + service), `app/schemas/dev.py` | the only route it served is deleted (C-9) | `dev_register` |
| Backend | `Settings.dev_mode` + the conditional mount (`main.py:79-82`) + the `dev_mode` half of the prod fail-closed check (`main.py:35`) | its only two readers were the mount and that check (C-9) | `dev_mode` |
| Backend | `StaffOut.invite_link` (`schemas/staff.py:27`) | no consumer ever read it; delivery is the mailer's job now (C-3) | `invite_link` |
| Frontend | `lib/admin/password.ts` (whole file) | the FE neither generates nor displays a password (A-5) | `genPassword` |
| Frontend | `lib/mock/admin-data.ts` (whole file) | the store fetches real data (A-3); `TODAY` moves to a local helper | `mock/admin-data` |
| Frontend | `ROLE_PAGES`, `ALL_OPERATE`/`ALL_EDIT`, `accessLevel()`, `pagesForRole()` (`pages-config.ts:192-252`), **and `rolesForPath`'s role-set half** | grants come from `UserOut.grants`; the 55-row seed supersedes them, sourced from the catalog level matrix rather than these (A-2/A-3, D-11). `rolesForPath` cannot survive intact — its body iterates `ROLE_PAGES`, and "which roles can reach this path" is unanswerable client-side once grants live in the DB; it splits into `pageIdForPath` (path→`PageId`, survives) and a deleted role-set half (A-4). `PAGES`, `defaultPathFor`, `groupsFor` **survive**, read by the 5 layouts, `app/page.tsx` and `SidebarNav`, switched to the grant map | `ROLE_PAGES`, `OPERATE`, `rolesForPath` |
| Frontend | `seedLevels()` (`catalog.ts:66-74`) | the matrix's levels arrive from `GET /access/matrix` (A-1/A-3) | `seedLevels` |
| Frontend | `PAGE_CATALOG`'s 17 hand-written path/level literals (`catalog.ts:23-51`) | pages derived from `PAGES`; the `levels[]` policy was migrated into the `page_access` seed first (A-1, D-11) — promoted, then deleted, not dropped | any `"/rm/` literal in `catalog.ts` |
| Frontend | `ROLE_IDX` positional indexing | keys are role codes, not array positions (A-1) | `ROLE_IDX` |
| Frontend | `nextId()` + the `uid` counter (`AdminStoreContext.tsx:23-24`) | ids are server-assigned UUIDs (§C) | `nextId` |
| Frontend | `EnrollDraft.pw`, `.expiry` (`types.ts:98-99`); `AdminUser.tone` as a stored field; `Override.from` as a stored field | no password or expiry is drafted (A-5); `tone` derives from `status`, `role_default` is server-resolved (§C) | `\.pw\b`, `tone:` |
| Frontend | `app/(auth)/register/` + `app/register/`, `postBackendRegister`, `signUpWithEmailPassword`, `isRegistering` + its `onAuthStateChanged` branch, both `AuthContextValue` entries, the login page's register link, the `auth/email-already-in-use` error branch — **×2 frontends** | registration is deleted, not disabled (A-8/C-9) | `signUpWithEmailPassword`, `postBackendRegister` |

**Rewritten in place rather than duplicated** — the near-miss worth naming: `admin-frontend/hooks/usePageAccess.ts` already exists (proposal 009's forward declaration) and has **zero consumers**. It is dead code *today*. An earlier draft of this proposal created `components/auth/usePageAccess.ts` alongside it, which would have shipped two hooks with the same name and left the unused one rotting. The existing file is rewritten (A-4).

**Kept, with a reason** — so a reader does not "helpfully" delete them next:

- `identity/generate_invite_link` → **renamed** `generate_set_password_link`. Not dead: three callers, one of which is `app/cli/bootstrap_admin.py:57`, which prints the link for the first ADMIN. Bootstrap deliberately prints rather than emails — at that point no mailbox is trusted and the Trigger Email extension may not be configured yet — and it inherits C-1's passwordless fix for free, since it goes through the same `ensure_identity`.
- `lib/pages.check.ts` — its `ROLE_PAGES`/`OPERATE` assertions are rewritten against the new registry (it currently asserts `ROLE_PAGES.ADMIN[id] === "OPERATE"`, `pages.check.ts:19`), and it gains the `MatrixOut.pages` ↔ `PAGES` set assertion. It is a plain `node:assert` script run with `npx tsx`, not a Vitest suite — kept as-is in form.
- `Action` (the enum) and `firebase_auth_disabled` — both live: the former is `PAGE_ACTIONS`' vocabulary, the latter is the dev bypass every `identity` method already honours.
- `LEVEL_LABEL`, `kFor`, `ALL_PAGES`, `PAGE_BY_PATH`, `TOTAL_PAGES`, `AuditEntry`, `StagedChange`, `RoleGuard`, `RoleGroup`, `AccessEditor` — all re-keyed or re-sourced, none removed.
- Other pages' mock data (`lib/mock/rm-data.ts` and siblings) — those pages are not in this proposal's scope; deleting their mocks would break them.

---

## Design decisions (settled)

- **D-1 — The page is the unit of access; the backend enforces it.** Requirement 4.3 asked whether view/edit should be embedded in the backend. It must be: a frontend-only gate is a UI convenience, and every gated control corresponds to an endpoint that is reachable with `curl` and a valid token. The mechanism is cheap because `Action` already splits reading from writing (`MODEL_VIEW`/`MODEL_WRITE`, `PTA_VIEW`/`PTA_RUN`), so the level→action map (Backend B) is a table, not a redesign. Where a page's actions have no read/write split (`RECON_VIEW`), the map records that explicitly rather than pretending the split exists. The `*_MANAGE` → `*_WRITE` rename (Backend C-10) exists to make the map read as the mirror it is: `VIEW`→`_VIEW`, `EDIT`→`_WRITE`, one word per concept across all three layers.
- **D-2 — Grants are resolved per request from the DB, not carried in Firebase custom claims.** Claims are capped at 1000 bytes and only refresh when the ID token does, so a published change would take up to an hour to bite — breaking the publish flow's "updated at next page load" promise. Claims keep carrying only `portal` and `role` (as today, `set_portal_claims`); grants ride on `UserOut` for the frontend and are re-resolved server-side on every guarded request.
- **D-3 — `NONE` is the absence of a `page_access` row, but a real value on `page_access_overrides`.** On the matrix, "no grant" and "no row" are the same statement. On an override, `NONE` is an active statement ("revoke this page for this one person"), which absence cannot express. Hence a 2-value enum on one table and a 3-value enum on the other.
- **D-4 — `INITIATED` is derived, not a stored status.** "May they sign in" (`users.status`) and "have they ever" (`last_sign_in_at IS NULL`) are independent facts; a third enum value would conflate them and force every existing status comparison in the backend to learn about it. With the set-password link it also carries the right meaning for free: an `INITIATED` account is precisely one whose link has not been used yet.
- **D-5 — Staging stays client-side; publish is one atomic write with a concurrency token.** The UI's entire promise is "staged locally — no user is affected until you publish". A server-side draft table would add a lifecycle (whose draft? when discarded?) that nothing in the design asks for. Concurrent-admin safety comes from `base_published_at` (Backend C-5), not from a draft table.
- **D-6 — Provisioning emails a set-password link, never a password, in both portals — via the Firebase Trigger Email extension.** The Admin SDK cannot send mail (Backend C-3, citing the Firebase docs); the extension is the Firebase-native transport and keeps SMTP credentials out of the backend. The link supersedes this proposal's first draft (which emailed a generated password) and it deletes more than it adds: no password generator, no policy validator, no `password_expires_at` column, no expiry login gate, no "Shown once" reveal panel. Combined with the passwordless identity (C-1), no credential the user did not choose ever exists.
- **D-6a — The client's link is sent at Compliance approval, not at RM staging.** Before approval `users.status` is `DISABLED` and `assert_can_authenticate` rejects the login, so an earlier email would deliver a link to a locked door and invite a support ticket. `_approve_initial` is already the single place that flips a client active (Backend C-8), so it is the single place that sends.
- **D-7 — No account is self-provisioned; `/register` is deleted, not disabled.** The flow is stalled, and its endpoint's contract is "hand me a Firebase token and the role you'd like" (`dev/service.py`). A `dev_mode`-gated capability still has to be read, reasoned about and kept from leaking into prod at every future audit; a deleted one does not. Provisioning is now exactly two authorised paths — `POST /api/admin/staff` for staff, `POST /api/rm/clients` + Compliance approval for clients — both behind `require_action`.
- **D-8 — The `page_id` string is the contract between the DB, the backend and the frontend registry; no pages table.** Paths, labels, icons and grouping are presentation and stay in `pages-config.ts`. The DB stores the opaque id. Drift is caught by a test asserting `access/pages.py`'s `PAGE_IDS` equals `PAGES`' keys, not by a foreign key.
- **D-11 — The migration seed comes from the System Config catalog's level matrix, not from `ROLE_PAGES` (user ruling, 2026-07-29).** `PAGE_CATALOG` (`catalog.ts:23-51`) has carried a real per-page-per-role three-level matrix all along — it was written for the design handoff and has never been enforceable because it lives in the frontend as mock data with fictional paths. `ROLE_PAGES` cannot express `view` at all. Seeding from the catalog turns existing design intent into the enforced policy and gives the `VIEW` level 26 real instances on day one instead of one; seeding from `ROLE_PAGES` would have thrown that intent away at the exact moment the system finally became able to honour it. The catalog's *paths* are still discarded (A-1) — only its levels are adopted, re-keyed onto real `PageId`s by the 14-row mapping in DB B-1. Two rules protect against the catalog's gaps: pages it never modelled keep today's grant, and the `PM` column is ignored (D-12). The consequence, accepted with the ruling: this is **not** a parity seed — see DB B-1's change table.
- **D-16 — `ALLOTMENT_ACKNOWLEDGE` and `CLIENT_VIEW`'s read/write conflation is fixed in full, not papered over or partially closed (user ruling, 2026-07-29, confirmed on a wider scope the same day).** D-11's seed exposed a real gap the old `ROLE_ACTIONS` model had never needed to close: actions that guard both a read and a write with no split (C-12). The first pass fixed two of six affected routes; re-checking every `CLIENT_VIEW` guard site found three more — all on `onboarding/router.py`, two of them a standing decision from proposals 016/017 that reused `CLIENT_VIEW` for a write and explicitly declined to add a split, correctly, under a precondition (only RM/ADMIN ever hold the action) that D-11 now removes. The alternatives were denying the affected view cells (throws away oversight value the catalog intended and adds more one-off seed exceptions) or shipping the gap with a follow-up ticket (leaves live privilege-escalation paths — one of them a financial-workflow write — in production). Neither is acceptable for an authorisation feature whose stated purpose is exactly this kind of separation — so all six routes are fixed in this proposal: one new action, six router-guard corrections (C-12).
- **D-14 — At `VIEW`, mutating controls are hidden, not disabled (user ruling, 2026-07-29).** A greyed-out button implies it is *conditionally* operable — that some selection, state or record would enable it — so a read-only user spends effort hunting for the condition and then files a question. An absent button makes no such claim. All 32 gate sites therefore render conditionally (`{canEdit && …}`), collapsing their container when it would otherwise be left empty. Note that this is a truthfulness choice, not a security one: hiding and disabling are equally cosmetic, and `require_action` on the endpoint is what actually refuses the write.
- **D-15 — Cross-role `VIEW` grants list under the role's own single nav parent; 009's no-mixing rule is superseded (user ruling, 2026-07-29).** Proposal 009 required that "a role sees exactly one workspace parent, never a mix of other roles' domains". The business requirement has since changed — cross-role read access is now wanted — so the second half of that rule is dropped while the first half (one parent per role) stands. `groupsFor` + `RoleGroup` already deliver this with no code change: children are grouped under their `subgroup` headers, so a Compliance officer's parent reads "Client Management / Trade Management / …" rather than an undifferentiated list. Recorded because a reader coming from 009 will otherwise think this is a regression.
- **D-13 — PC keeps `EDIT` on Monthly Reports; RM and MOBO drop to `VIEW` (user ruling, 2026-07-29).** The catalog gives all three `view` on `shared.monthly-reports`, where all three hold `OPERATE` today. PC is overridden back to `edit`: the page is "Monthly Reports (Models)" and model reporting is Portfolio Control's output, so PC is the role that produces it while RM and MOBO consume it. This is the seed's only narrowing, and it now touches two roles instead of three.
- **D-12 — PM stays at zero grants; the catalog's PM column is ignored (user ruling, 2026-07-29).** The catalog would give PM `edit` on `pc.model-management` and `pc.allocation-matrix` plus `view` on six more. But `ROLE_PAGES.PM` is `{}` and `ROLE_NAV` has no PM entry, so PM has no pages and no sidebar today — granting write access to Portfolio Control's two core pages to a role with no current holder, no navigation, and no requester is a widening nothing asked for. PM's cells are seeded as absent rows. Nothing is lost: the moment PM becomes real, an administrator grants it pages from System Config in a few clicks, which is precisely the capability this proposal ships.
- **D-10 — PC gets Post-Trade Allocation at `VIEW`, not `EDIT` (user ruling, 2026-07-29).** Reconciling the two hardcodings exposed a disagreement they had been hiding: `ROLE_PAGES.PC` grants `mobo.post-trade-allocation: OPERATE` (`pages-config.ts:215`) while `ROLE_ACTIONS[AdminRole.PC]` holds **no** PTA action (`actions.py:43-49`). Today's effective behavior is therefore broken, not merely inconsistent — PC sees the page in its sidebar and every PTA endpoint 403s, including the read.
  PC access to that page is a requirement, but **read-only**: the seed writes that one cell as **`view`**, granting `POST_TRADE_ALLOCATION_VIEW` and *not* `POST_TRADE_ALLOCATION_RUN`. Running allocations stays MOBO's. So neither existing source was right — the frontend's `OPERATE` was too broad and the backend's empty set too narrow, and this is the first grant in the system to carry a level other than full access.
  Recorded as its own decision rather than as one cell of D-11's table, because it is the one place the seed deliberately **contradicts** the catalog it otherwise copies (the catalog says `edit`), and because it moves PC's access in both directions at once — a working read gained, a write it could never actually perform withheld. It is also the natural target for the phase-2 `VIEW` integration test: assert PC's PTA read succeeds while every PTA mutating route 403s for them.
- **D-9 — Nothing this change supersedes survives it.** Every symbol whose last reader this proposal removes is deleted in the same layer branch, enumerated in §Dead code purged with a grep per row. The one place a fallback was argued for (`ROLE_ACTIONS`, C-2) is the reason for the rule: a fallback in an authorisation component is a bypass that activates precisely when something has gone wrong, and it never gets removed later because it always has a story. Failing closed on a missing migration is the better failure.

---

## Objectives & standard of the expected outcome

- **Day-one access is a stated policy, and every difference from today is on one list.** This is deliberately *not* a parity seed (D-11): the seed adopts the System Config catalog's existing level matrix, which grants ~26 new read-only cells, narrows Monthly Reports from write to read for RM and MOBO (PC keeps write, D-13), and fixes PC's broken Post-Trade Allocation access. The checkable standard is therefore **not** "nothing changed" but: every change appears in DB B-1's change table, **no role loses a page it owns today**, PM gains nothing (D-12), and no role gains a *write* it did not already have. After that, every further change requires an administrator to publish a cell.
- **Access decided once.** After this lands, "can this user do this" has exactly one answer path: `page_access` + `page_access_overrides` → `access.resolver` → (`require_action` for endpoints, `UserOut.grants` → `usePageAccess` for controls). Grep for a second source — `ROLE_ACTIONS`, `ROLE_PAGES`, `accessLevel(`, `seedLevels`, any hardcoded `allowedRoles` literal — returns nothing anywhere in the repo, not "nothing outside the fallback".
- **Nothing superseded is left standing.** Every row of §Dead code purged is verified by its own grep, and the two files whose last reader disappears (`lib/admin/password.ts`, `lib/mock/admin-data.ts`) are gone rather than orphaned. `git diff --stat` shows net deletions in `pages-config.ts`, `catalog.ts`, `auth/actions.py` and both `AuthProvider.tsx` files.
- **The matrix cannot describe a page that does not exist.** `catalog.ts` contains no path literal; `pages.check.ts` and the backend `PAGE_IDS` test both fail if the three registries diverge.
- **No credential the system chose.** `12345678` appears nowhere, no password is generated, transmitted, displayed or stored by any layer, and every account's first password is one its own holder set through a single-use link. True for staff and clients alike.
- **One way in.** No route, page, function or flag can create an account outside the two authorised provisioning paths. `grep -r "signUpWithEmailPassword\|dev_register\|dev_mode"` across the repo returns nothing.
- **Every state-changing admin act is on the record.** Enrollment, edit, deactivation, link re-send, matrix publish, override grant and revoke each write one `admin_audit_events` row with an actor name that survives the actor's deletion.

---

## Execution & verification

0. **Prerequisite (no branch): configure the Firebase Trigger Email extension** and rotate the dead service-account key (see Out of scope). Nothing in phase 2 can be verified end to end without both. Verify: a scratch script writes one `mail` doc and the message arrives.
1. **DB layer** — one Alembic revision (four tables, four columns, the 55-row seed). Verify: `alembic upgrade head` then `alembic downgrade -1` then `upgrade head` again on a scratch DB; `SELECT role, COUNT(*) FROM page_access GROUP BY role` returns exactly **RM 7, MOBO 10, PM 0, PC 10, COMPLIANCE 12, ADMIN 16 = 55**; `SELECT level, COUNT(*)` returns **30 edit / 25 view**; ADMIN has one `edit` row per page and PM has none. Both the per-role and per-level counts are asserted, so a mistyped cell fails loudly instead of quietly shifting someone's access.
2. **Backend layer** — `access` module, resolver, `PAGE_ACTIONS`, extended `staff`, mailer, `UserOut.grants`, the `*_WRITE` rename, the `dev` deletion, the client approval email. Verify: unit tests for the resolver's precedence (an unexpired override beats the role level — including an override of `none`, which must DENY and must not fall through; an expired override does not; a role with no rows denies rather than falling back, since C-2 removed the fallback); an integration test for the `VIEW` level pointed at the real day-one case — PC × `mobo.post-trade-allocation` (D-10) — asserting the PTA read succeeds while every PTA mutating route 403s for PC, plus the same shape on a synthetic `VIEW` grant over `pc.model-management`; a C-12 test seeding RM with `view` on `pc.allotment-redemption` asserting `GET /pc/allotments` → 200 while `POST /pc/allotments/{id}/acknowledge` and `POST /pc/redemptions/{id}/decide` → 403; a matching test seeding COMPLIANCE with `view` on `rm.client-info`/`rm.model-subscription` asserting every `CLIENT_VIEW`-guarded read still 200s while all four now-`CLIENT_WRITE` routes (`POST /rm/tickets/{ref}/status`, `/rm/allotment`, `/rm/redemption`, `/rm/allotments/{id}/transaction-detail`) → 403; and a static sweep asserting no `Action` in any `PAGE_ACTIONS` VIEW bucket appears on a `POST`/`PATCH`/`DELETE` route anywhere in `app/libs/**/router.py`; a test that `PAGE_IDS == PAGES` keys; a test that `POST /api/admin/staff` with a non-`megaannum.ai` address → 422; a test that a mailer failure still returns 201 with `link_sent: false`; a test that `_approve_initial` sends exactly one client email and `_approve_renewal` sends none; C-11 tests — deactivating an RM with a book and no `reassign_book_to` → 409, **and the same for `PATCH {role: "MOBO"}` on that RM**, with a valid receiver → book and **open** tickets move while closed tickets keep their original `assigned_rm_uid`, a non-RM/inactive/self receiver → 422, `PATCH {role: "RM"}` on an RM (no-op role write) needs no receiver, and deactivating a PC or COMPLIANCE user needs no receiver; a decisive test for Q-5 — `generate_password_reset_link` against a freshly-created passwordless identity, whose outcome selects the link type and is recorded in the impl doc before phase 3 starts; `pytest` green after the rename (21 guard sites, 32 lines); every §Dead code purged backend grep returns nothing (`ROLE_ACTIONS`, `12345678`, `dev_mode`, `dev_register`, `invite_link`), and a deploy against an un-migrated DB is asserted to 403 rather than fall back.
3. **Frontend layer** — re-keying, the one `AccessLevel`, `server/admin/`, the store rewrite, the 32 gate sites, the `<NoAccess>` card, the ledger move, the wording, the password-surface removal, both handover controls, and the register purge in **both** frontends. **Scheduled after phase 2 reports Q-5's outcome**, since the email-link branch adds a set-password landing form to this layer's scope. Verify: `npx tsc --noEmit` and `npm run lint` clean in both; `npm run test` (Vitest) covers `usePageAccess` precedence and the re-keyed `catalog`; `grep -ri "OPERATE\|temporary password" admin-frontend/` returns nothing; every §Dead code purged frontend grep returns nothing (`signUpWithEmailPassword`, `postBackendRegister`, `genPassword`, `seedLevels`, `nextId`, `ROLE_PAGES`, `OPERATE`) across **both** frontends; `npx tsx admin-frontend/lib/pages.check.ts` passes against the rewritten assertions; `grep -c "View/Edit Gate Function"` still totals 32 and every one is adjacent to a `canEdit` reference in a **conditional-render** position (not a `disabled` prop — D-14); and a Vitest render test per gated file asserts the control is absent from the tree at `VIEW`, not merely non-interactive.
4. **Human gate — apply the migration to the live DB.** The seed writes real access rows that immediately govern real logins. A human runs `alembic upgrade head` against the live database after reviewing the seed list, and confirms the seed against DB B-1's table, role by role. **This seed changes access deliberately (D-11), so "nothing moved" is the wrong check** — the right one is that every difference appears on B-1's change list and nothing else does. Specifically verify: (a) every role still holds `edit` on every page it owns today; (b) RM and MOBO now hold `view` on Monthly Reports while PC keeps `edit` (D-13) — the only narrowing in the seed; (c) a PC user can load Post-Trade Allocation instead of getting 403, with its mutating controls disabled (D-10); (d) PM holds nothing (D-12); (e) RM still reaches Request Tickets and MOBO still reaches Commission Tracking (B-1 rule 2 — the two pages the catalog never modelled).
5. **Cross-layer smoke, on a live backend** — (a) enroll a real staff account end to end: passwordless Firebase identity created, set-password email received, password set through the link, sign-in works, `Initiated` → `Active` after first login, and the re-send action invalidates an unused link; (b) run one client through RM staging → Compliance approval and confirm the client's set-password email arrives at approval and not before, and that a sign-in attempt before approval is still rejected; (c) sign in as PC and confirm Post-Trade Allocation loads read-only with its mutating endpoints returning 403 — the seeded `view` grant from D-10, no publishing needed — then publish one further `VIEW` cell and confirm the same shape; (d) publish one `NONE` cell and confirm the page leaves that role's sidebar *and* that navigating to its URL directly shows the `<NoAccess>` card rather than redirecting; (e) grant and revoke one override; (f) deactivate a test RM holding a seeded book and confirm the receiving RM sees those clients and the open tickets, and that closed tickets stayed put. This is the only step that proves the seam; it cannot run inside a single layer's branch.

**Human gate(s):** (a) phase 0, because configuring the extension connects an SMTP provider that will send mail on this system's behalf; (b) phase 4, the live migration + seed, before any role's access is governed by the new tables; (c) phase 5, because it sends real invitation mail to real mailboxes — use addresses the operator owns, not colleagues' or clients', and get sign-off before the first genuine enrollment or client approval; (d) the merge of each layer branch into `main`, per the standing rule that the human owns `main`.

---

## Rollback

- **Frontend layer:** clean — revert the branch. Nothing persisted. Note that reverting restores the `/register` pages; if the purge is the part being kept, revert selectively.
- **Backend layer:** clean at the code level — revert the branch. Reverting restores `ROLE_ACTIONS`, so a reverted backend against a migrated DB behaves exactly as today and the extra tables are simply unread. Note the asymmetry created by C-2's deletion: the *forward* direction requires the migration (no fallback), so a deploy must be ordered DB-then-backend, while the revert direction needs no DB change at all. **Two Firebase-side caveats:** (i) accounts provisioned while the new code was live are **passwordless** — a reverted backend does not give them a password, so `POST /api/admin/staff/{uid}/set-password-link` disappearing leaves them dependent on the Firebase console's own "reset password" for a fresh link. Nobody is locked out permanently, but the in-app re-send is gone. (ii) reverting re-introduces `_DEFAULT_PASSWORD`, so any account provisioned *after* the revert is back on the shared constant — a revert of this branch is a security regression, not a neutral rollback, and should be paired with re-applying C-1 alone.
- **DB layer:** `alembic downgrade -1` drops four tables and four columns. **Lossy, and specifically:** every access grant and override an administrator published since the migration, the entire audit trail, and all recorded sign-in times. **A downgrade must be treated as a security-relevant event**, not a routine revert: dump `page_access` and `page_access_overrides` first, and re-apply any restriction by hand if the tables do not come back.
  - **Order matters, because C-2 left no fallback.** Against a *post-019* backend, a downgraded DB means an empty `page_access` and therefore 403 for every admin on every guarded route — the deliberate fail-closed behavior, but a full outage of the admin portal. So the DB downgrade is a standalone operation only while the Backend branch is not deployed; otherwise revert **backend first, then the DB**. The reverted backend restores `ROLE_ACTIONS` and behaves exactly as today, at which point dropping the tables changes nothing.
  - The mirror-image hazard on the way *forward*: deploying the backend before applying the migration produces the same 403 outage. Both directions have one safe order, and it is the same rule — the code that reads `page_access` must never be live while `page_access` is absent.

---

## Open questions

### Resolved

- **Q-1 — Cleartext password or set-password link? → link, both portals.** Decided 2026-07-29. The first draft emailed a generated password with a change-it-now instruction; that is now replaced by a single-use set-password link over a passwordless identity, and clients receive the same email at Compliance approval. See D-6 / D-6a, Backend C-1, C-3, C-8. Recorded rather than deleted because it removed a column, a validator and a UI panel from the earlier draft — a reader comparing revisions needs the reason.
- **Q-2 — Concurrent matrix staging by two administrators? → the 409 stands; concurrent editing is rare.** Confirmed 2026-07-29. `base_published_at` (Backend C-5) means the second publisher is told to re-review rather than silently clobbering the first. No server-side draft table, no locking, no live presence indicator. If concurrency ever stops being rare the symptom is visible (admins reporting the 409), and that is the trigger to revisit — not now.
- **Q-3 — What is an "open item" on deactivation? → nothing generic; hand over the RM's client book.** Decided 2026-07-29. Only RM owns anything per-person (`client_profiles.assigned_rm_uid` scopes their visibility; PC and COMPLIANCE are single-holder roles today and full-visibility besides). So the fabricated "4 open items" checkbox becomes a required receiving-RM picker for RMs with a non-empty book, hidden for every other role, implemented as two `UPDATE`s inside the deactivation transaction — the client book, plus **open** tickets only, since `client_tickets.assigned_rm_uid` is a deliberate historical snapshot (proposal 018, B-1). See Backend C-11 and Frontend §C. No "open item" abstraction, no reassignment queue.
- **Q-4 — Does a `NONE` grant redirect or render a blocker? → neither, normally: the page is not in the sidebar at all.** Decided 2026-07-29. Invisibility is the primary effect and needs no new UI (`groupsFor` is already grant-driven). A blocker card appears only on the edge cases — typed/pasted URL, stale bookmark, deep link, cross-link from a held page — where an explicit named refusal beats a silent bounce that reads as a broken link. One shared `<NoAccess>` component, no per-page work. See Frontend A-4.
- **Q-5 — Which Firebase link type over a passwordless identity? → reset link, falling back to email-link sign-in.** Decided 2026-07-29. Try `generate_password_reset_link`; if Firebase rejects it for an account with no password provider, use `generate_sign_in_with_email_link` and add a set-password step to the landing page. Rejected: minting the identity with a random server-chosen secret to keep reset links working — that re-introduces exactly the credential C-1 removes. One phase-2 integration test decides, and **phase 3 is scheduled only after it reports**, because the fallback branch adds a frontend form. See Backend C-3.
- **Q-6 — Should an unused invitation expire? → no sweep; the directory surfaces them.** Decided 2026-07-29. No column, no scheduled job. An `INITIATED` account whose link was never used stays visible under the directory's `Initiated` filter — which this proposal makes real for the first time — and an admin can deactivate or re-send from the row menu. Revisit if the backlog ever grows enough to be worth automating.
- **Q-7 — Should a role change away from RM also require a handover? → yes, in the same edit.** Decided 2026-07-29. Demoting an RM does the same damage as deactivating one: the book keeps pointing at their uid, no active RM sees those clients, and new tickets snapshot a dead assignment. Both triggers now share one guard ("this user is about to stop being an active RM") and one pair of `UPDATE`s, and the wizard's Role step gains the same receiving-RM picker in edit mode, inside the `Notice` slot it already renders for role changes. See Backend C-11 and Frontend §C.

### Out of scope (tracked elsewhere)

- **The dead Firebase service-account key** that surfaced as a 500 on `Invalid JWT Signature` — an environment fix, not a code change. It is not merely adjacent: every path this proposal adds signs with that key (`create_user`, `generate_*_link`, the Firestore write) and will fail the same way until it is rotated. **Rotation is phase 0, blocking.** Deleting `/register` (C-9) removes the symptom's original reporter, not the cause.
- **Client-portal page access** — no matrix exists for `Portal.CLIENT`; if one is ever wanted it is a separate proposal reusing these tables with a `portal` discriminator.
- **MFA, lockout, and password rotation policy** — a future auth-hardening proposal; requirements R1–R7 (`docs/requirements/auth-module.md`) already own that ground.
- **Dropping `invite_link` from `POST /api/rm/clients`' response** — now vestigial once C-8 owns delivery, but removing a response field is a contract change for the RM client-onboarding surface and belongs with whatever next touches it.
