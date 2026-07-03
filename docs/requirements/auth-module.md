# Authentication Module — Requirements

**Date:** 2026-06-12
**Author:** QinQipeng
**Status:** Approved (requirements) — design pending
**Satisfied by:** [004 — Authentication Flow Rework](../proposals/004-2026-06-11-auth-flow-rework.md)
**Builds on:** 002 (client/admin separation), 005 (UUID keys, live DB cutover applied)

---

## Scope

Define an **authentication architecture** (industrial-standard) that supports RM-led client
onboarding and controlled internal-admin enrollment.

**In scope:** the auth pipeline — identity creation chokepoints, login/binding, the per-portal
login gate, the dev-mode switch, and removing the auto-creation loophole.

**Out of scope (future features):** the onboarding business logic itself — the RM intake form,
document upload (signed contracts, ID, legal docs), and the compliance review workflow. The
architecture only needs to *support* these, not implement them.

### Onboarding flow (context only — drives requirements, not implemented here)

1. RM fills a CRM form with the client's personal info (name, email, phone, …).
2. RM collects and uploads signed contracts, ID, and legal documents → awaiting review.
3. Compliance reviews the documents and approves or rejects.
4. On approval the client account becomes **active** — the client may log in, and the RM may
   initiate model subscriptions on the client's behalf.

---

## Requirements

### R1 — No self-registration in production
No user of any type may create their own account in production. Every account originates from an
authority-gated provisioning action, never from a token or a public signup.

### R2 — Client accounts originate only from RM onboarding
A client account can be created **only** by an RM through the onboarding flow. The client's first
authentication **binds** to that pre-provisioned account; it never mints a new one. Unknown /
unmatched tokens are rejected.

### R3 — Internal-admin accounts originate only from a super-admin
Internal users (RM, COMPLIANCE, PM, PC, MOBO, …) can be created **only** by an account holding the
`ADMIN` role — the super-admin, distinct from the general "internal admin" roles.

- **Bootstrap invariant:** the database must always contain **at least one `ADMIN`** account,
  seeded (not self-registerable).

### R4 — Per-portal login status gate
Auth must deny login to accounts that are not active, even when Firebase credentials are valid.
The gate is **uniform in shape** ("may this resolved user authenticate?") with a **per-portal
source**:

| Branch | "Active?" source | Default |
|---|---|---|
| Client | `client_profiles.status` (`pending` → `active` / `disabled`) | `pending` |
| Internal admin | `admin_profiles.is_active` | `true` on provision |

- **R4a (client):** status is a field on the existing `client_profiles` table. Whatever sets it
  later (the compliance decision, eventually document-backed) plugs into this field without
  reshaping auth. Client login denied unless `active`.
- **R4b (internal admin):** `is_active` flag on `admin_profiles`, active-on-provision. Justified
  by **suspension / offboarding** (a near-certain need), not by an activation workflow — no fake
  pending/review state is invented for admins, since being provisioned by the super-admin *is*
  the authorization. Admin login denied if disabled.

> **Design rationale:** client activation is an external, async, document-backed review, so its
> status is derived; internal-admin activation has no review step, so creation = activation. If
> stakeholders later define an internal-admin activation flow, the admin "active?" source extends
> without touching clients.

> ⚠️ **DESIGN DEPENDENCY — live DB schema upgrade required.** This migration adds three columns,
> each placed **before** its table's two timestamp columns, to tables that already exist in the
> live database (005 cutover applied: 5 client / 10 admin rows) — no new table:
> - `client_profiles.status` (R4a) — `pending` | `active` | `disabled`
> - `admin_profiles.is_active` (R4b) — boolean
> - `users.authorized_by` (audit) — nullable FK → `users.firebase_uid`, recording who authorised
>   the account (onboarding RM for a client, enrolling super-admin for an internal user).
>
> Needs an Alembic migration with safe backfill defaults: existing clients → `status = active` (so
> current users aren't locked out); existing admins → `is_active = true`; all existing rows →
> `authorized_by = NULL` (provenance unknown pre-rework). Deferred to the design/implementation
> phase — do **not** enforce the status gate until the migration lands.

### R5 — Two authentication branches
Separate the auth surface into a **client** branch and an **internal-admin** branch, starting at
the authentication layer, over a **shared Firebase verification core** (one Firebase project). The
portal becomes a property of the route, not a forgeable body field. Per-branch policy (rate limits,
audit, future MFA on the higher-value admin surface) attaches cleanly.

### R6 — Backend is the sole Firebase-identity creator in production
Firebase Cloud is the credential authority (stores accounts + hashed passwords). In production:

- Both the **Firebase identity** (via Admin SDK) **and** the local `users` row are created **only**
  through RM onboarding — neither exists without an RM. A client can never self-create a Firebase
  credential in prod.
- The backend controls the `firebase_uid` from creation, so **binding is by `uid`**, not email —
  no email-drift reconciliation problem.
- The client receives a backend-issued **invite / set-password link** to activate their credential.
- **Remove the auto-creation loophole:** the local DB must **not** auto-create or auto-resync a
  user from a valid Firebase token. The current behavior — materializing a local row for any
  Firebase identity, surviving even a Docker container teardown — is the loophole and must go.

### R7 — Unified dev-mode flag; modular, dev-only self-registration
- A **single dev-mode switch governs both frontend and backend.** Treated as a **contract** (one
  canonical flag name both services read), not a dependency on a specific orchestrator file — the
  repo-root single-injector is the *eventual* home, but the backend behaves identically regardless
  of where the flag is physically injected. The backend default flips from on to **off**, so every
  launch path is secure-by-default (today `dev_mode` defaults on and lives only in the backend).
- Self-registration is **retained but decoupled** — a modular component available **only when
  dev-mode is on**, off in production, and structured to be **removable** as the project matures
  (deliberate fade-out, not a permanent feature).
- **Authentication binds, it never creates — in *every* mode.** Account creation is always an
  explicit, named provisioning surface; even dev self-registration is a *provisioning* endpoint
  (distinct from login), not a side-effect of authenticating. The dev login path binds only — an
  unknown token is rejected even in dev. This is what lets the legacy self-registration UX survive
  in dev without re-opening the auto-creation loophole (R6).

> **Scoping note:** the **backend** half of the flag (secure default, fail-closed assertion, the
> dev-only self-registration module) is in scope. The **frontend** half — propagating the flag to a
> build-time frontend variable — is build-time (baked at image build) rather than a run-time read,
> and is deferred pending the repo-root orchestrator decision. The shared flag *name* is the seam.

---

## Non-functional / standards

- **Single provisioning chokepoint per portal** — exactly one place may turn an identity into an
  account; authority-gated, never an anonymous token.
- **Fail-closed** — dev bypasses and self-registration must be impossible to leave enabled in
  prod (startup assertion, not just a default).
- **Preserve the load-bearing building blocks** — the Firebase verification core, RBAC
  (role → action), portal gates, and the frozen `UserOut` contract stay intact.
