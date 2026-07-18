# 004 — Authentication Flow Rework · Implementation Details — Frontend

> Status: **DRAFT — pending implementation.**
> Implements: `docs/proposals/004-2026-06-11-auth-flow-rework.md` §6 ("Frontend impact") and §4.12 (dev-only self-registration, consumed as a client)
> Layer: Frontend — **one layer per file.** Covers BOTH `client-frontend/` and `admin-frontend/` (two separate Next.js apps, zero shared files, one branch).
> Sibling layer docs: `docs/implementations/004-auth-flow-rework-db.md` · `docs/implementations/004-auth-flow-rework-be.md`
> Execution schedule: `docs/execution-schedules/004-auth-flow-rework-fe.md`
> Branch: `rework-authentication-module-fe` — cut from `rework-authentication-module` (parent), same as the `-db`/`-be` siblings.
> Builds on / prerequisites: the Backend layer (`rework-authentication-module-be`, already committed) — this layer builds against its **response contracts** (§7 below), not against its branch. If `-be` has not merged to the parent yet, this layer still proceeds; only integration testing (out of scope here) needs both merged.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/004-2026-06-11-auth-flow-rework.md` §6, §4.12, §5 |
| Execution schedule | `docs/execution-schedules/004-auth-flow-rework-fe.md` |
| Sibling layer impl docs | `docs/implementations/004-auth-flow-rework-db.md` · `docs/implementations/004-auth-flow-rework-be.md` |
| Builds on | Backend layer's committed route contracts (BE-5 split login, BE-8 removed `/auth/register`, BE-17/BE-24 dev-only `/api/dev/register`) — see §7 |

**Why this layer exists (not in the original pipeline state):** the proposal's §6 originally scoped frontend work as a one-line coordination note ("both frontends stop calling `/register`, coordinate before merge"), not a full layer. Once the Backend layer landed, both `client-frontend` and `admin-frontend` broke at runtime — they still call the retired unified `POST /api/auth/login` / `POST /api/auth/register`. This doc promotes that one-liner into a proper spec so the fix is deliberate, tested, and reviewable, not an ad-hoc patch.

**Explicitly NOT in scope (per proposal §3 Non-Goals):** building new UI for `POST /api/rm/clients` (RM client-onboarding form) or `POST /api/admin/staff` (staff-enrollment form). The proposal states "Building the full admin-management console UI — backend endpoints only" is a non-goal. This layer only repoints the existing login/register flow to the new contract; it does not add new screens.

---

## 2. Branch & session contract

- **Branch:** `rework-authentication-module-fe` — all FE-* units land on this one branch.
- **Isolation:** implementable in its own session, independent of whether `-db`/`-be` have merged to the parent — it builds against the response contracts pinned in §7, which are already committed and stable on `-be`.
- **Preconditions (must be true before starting):**
  - [ ] §7's contracts (below) match what's actually committed in `api-backend/app/schemas/{auth,dev,users,staff}.py` and `api-backend/app/libs/{auth,dev,clients,staff}/router.py` on branch `rework-authentication-module-be` — spot-check before starting if that branch has moved since 2026-07-18.
  - [ ] Node toolchain installed for both `client-frontend/` and `admin-frontend/` (`npm install` already run — `node_modules/` present).
- **Read-first inventory** (every existing file a unit touches):
  - `client-frontend/lib/auth-api.ts` — old unified login/register calls (FE-1).
  - `client-frontend/types/portal.ts` — `PortalUser` type carries a dead `id: number` field never populated by the backend's `UserOut` (FE-1).
  - `client-frontend/components/auth/AuthProvider.tsx` — Firebase sign-in/sign-up orchestration; today races `postBackendLogin` against `postBackendRegister` on signup (FE-2).
  - `client-frontend/app/login/page.tsx`, `client-frontend/app/register/page.tsx` — user-facing error surfaces (FE-3).
  - `admin-frontend/lib/auth-api.ts` — old unified login/register calls, register sends a trusted `role` (FE-4).
  - `admin-frontend/types/portal.ts` — same dead `id` field (FE-4).
  - `admin-frontend/components/auth/AuthProvider.tsx` — already has an `isRegistering` guard client-frontend lacks; smaller delta (FE-5).
  - `admin-frontend/app/(auth)/login/page.tsx`, `admin-frontend/app/(auth)/register/page.tsx` — user-facing error surfaces (FE-6).
- **Hand-off / exit signal:** all FE-* units committed, `npx vitest run` + `npx next lint` green in both apps, PR opened against `rework-authentication-module`.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions
- Layering: `page (Server/Client Component) → AuthProvider (context) → lib/auth-api.ts (fetch wrapper) → backend`. A page never calls `fetch` directly against the backend — it goes through `AuthProvider`'s exposed methods, which call `lib/auth-api.ts`.
- Naming: `postBackend<Verb>` for `lib/auth-api.ts` functions (existing convention — keep it, do not rename).
- Error propagation: `lib/auth-api.ts` functions throw a plain `Error` on non-2xx; from this layer on, that `Error` additionally carries a `status: number` property (the HTTP status) so callers can branch on 403 (no/disabled account) vs. 404 (route not mounted — e.g. dev-only register in a non-dev environment) vs. other failures, without re-parsing the message string.
- `PortalUser` type mirrors the backend's `UserOut` field-for-field — no extra client-only fields (see FE-1, drops the stale `id`).

### 3.2 CI/CD & engineering discipline
- **Trunk-friendly, small units.** Each FE-* unit is one commit, leaves the branch green (lint + vitest pass).
- **Every unit is independently revertible.**
- **Gates before merge**, in this order — confirmed configured (both apps have `vitest.config.ts` + a `"test": "vitest run"` script in `package.json`; neither has a `tsc`/`typecheck` script, so type errors surface only via `next build`'s own type-check pass, not a standalone command):
  ```bash
  # client-frontend/ and admin-frontend/, run independently
  npx vitest run && npx next lint
  ```
  `next build` (which also runs `next lint` + a full TS type-check) is the **W-final** gate, not a per-unit gate — it's slower and covers the whole app, not just the touched files.
- **No secrets, no manual steps in the merge path.**
- **Reversibility:** every unit here is a pure code change (no data migration) — reverting the commit fully reverts the behavior.

---

## 4. Architecture (level 1 of 3)

**Target layout (no new files, only modified — both apps use the identical existing shape):**
```
client-frontend/
  lib/auth-api.ts             # modified: FE-1
  types/portal.ts             # modified: FE-1
  components/auth/AuthProvider.tsx   # modified: FE-2
  app/login/page.tsx           # modified: FE-3
  app/register/page.tsx        # modified: FE-3

admin-frontend/
  lib/auth-api.ts              # modified: FE-4
  types/portal.ts              # modified: FE-4
  components/auth/AuthProvider.tsx   # modified: FE-5
  app/(auth)/login/page.tsx    # modified: FE-6
  app/(auth)/register/page.tsx # modified: FE-6
```

**Dependency direction:** `page → AuthProvider → auth-api.ts → backend`. Neither app imports from the other (they are physically separate Next.js projects); this layer touches both in parallel, never crossing between them.

**External seams:** the Backend layer's `POST /api/auth/client/login`, `POST /api/auth/admin/login`, `POST /api/dev/register`, `GET /api/auth/me`, `POST /api/auth/logout` routes (§7). No DB seam (frontend never touches the database directly).

---

## 5. Modules (level 2 of 3)

### 5.1 `client-frontend` auth module
- **Responsibility:** bind an existing client account on login; provision (dev-only) or reject on registration; surface account-state errors (no account / disabled account / dev-register unavailable) distinctly from Firebase-side auth errors.
- **Files:** `lib/auth-api.ts`, `types/portal.ts`, `components/auth/AuthProvider.tsx`, `app/login/page.tsx`, `app/register/page.tsx`.
- **Public surface:** `postBackendLogin`, `postBackendRegister`, `postBackendLogout`, `syncPortalUserAfterFirebaseAuth` (all exported from `lib/auth-api.ts`); `AuthProvider`'s context value (`user`, `loading`, `signInWithGoogle`, `signInWithEmailPassword`, `signUpWithEmailPassword`, `signOut` — names as they exist today, unchanged).
- **Owns features:** FE-1, FE-2, FE-3.

### 5.2 `admin-frontend` auth module
- **Responsibility:** same as 5.1, mirrored for the admin portal — login binds via `/api/auth/admin/login`; dev-only register additionally trusts a `role` field.
- **Files:** `lib/auth-api.ts`, `types/portal.ts`, `components/auth/AuthProvider.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`.
- **Public surface:** same shape as 5.1, plus `admin-frontend`'s existing `isRegistering` ref pattern in `AuthProvider` (kept, not removed).
- **Owns features:** FE-4, FE-5, FE-6.

---

## 6. Features (level 3 of 3 — the work units)

### FE-1 — client-frontend: repoint `auth-api.ts` + fix `PortalUser` (MANDATORY)

- **Proposal ref:** §5 (API surface), §6 (frontend impact)
- **Module:** 5.1
- **Files:** `modify: client-frontend/lib/auth-api.ts`, `modify: client-frontend/types/portal.ts`
- **Dependencies:** none — parallel-safe (root of the client-frontend chain)

**Contract (required code):**

```typescript
// types/portal.ts — drop the dead `id` field; UserOut never serialises a numeric id (D-A/005: firebase_uid is the public key)
export type PortalUser = {
  firebase_uid: string;
  email: string | null;
  role: string;
};

// lib/auth-api.ts
export class BackendAuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "BackendAuthError";
  }
}

// Bind-only — 403 means "no account staged for this uid, or account disabled".
// Body drops the old `portal` field: the route itself is portal-scoped now.
export async function postBackendLogin(idToken: string | null): Promise<PortalUser> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/auth/client/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken }),
  });
  if (!res.ok) {
    throw new BackendAuthError(await parseApiError(res, "POST /api/auth/client/login"), res.status);
  }
  return (await res.json()) as PortalUser;
}

// Dev-only provisioning surface. 404 in a non-dev backend means "not mounted",
// not "restart the server" — parseApiError's existing 404 message is wrong for
// this permanently-absent-in-prod case and must be corrected (see Behavior below).
export async function postBackendRegister(idToken: string | null): Promise<PortalUser> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/dev/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken, portal: "client" }),
  });
  if (!res.ok) {
    throw new BackendAuthError(await parseApiError(res, "POST /api/dev/register"), res.status);
  }
  return (await res.json()) as PortalUser;
}
```

**Behavior / invariants:**
- `postBackendLogin` never creates a row — a `403` is an expected, distinguishable outcome (unknown uid, or `status='disabled'`), not a generic failure. Callers (FE-2) must branch on `err.status === 403` and show a specific message, not `err.message` raw.
- `parseApiError`'s existing `404` branch (`"...restart the FastAPI server"`) is **only accurate for a route that should exist but doesn't yet** (a dev-loop mistake). For `/api/dev/register`, a `404` in a real deployment means the dev router is correctly unmounted (`dev_mode=False`) — the message must be split: keep the "restart the server" hint for `/api/auth/*` routes, and for `/api/dev/register` specifically return `"Self-registration is not available in this environment."` regardless of status.
- `syncPortalUserAfterFirebaseAuth`'s doc comment ("the backend login endpoint upserts missing users") is now false — update it to state login **binds only**, and `postBackendRegister` is the sole (dev-only) provisioning path from this frontend.
- `getApiBase`, `parseApiError`'s non-404 branches, `postBackendLogout` are unchanged.

**Done when:** both functions compile against the new routes; `PortalUser` has exactly `{firebase_uid, email, role}`; a thrown error from either function exposes `.status`.

---

### FE-2 — client-frontend: fix `AuthProvider` login/register race + 403 handling (MANDATORY)

- **Proposal ref:** §4.3 ("auth binds, never creates"), §4.12 (dev register)
- **Module:** 5.1
- **Files:** `modify: client-frontend/components/auth/AuthProvider.tsx`
- **Dependencies:** FE-1 (consumes `BackendAuthError`, the new `postBackendLogin`/`postBackendRegister` signatures)

**Contract (required code):**

```typescript
// AuthProvider.tsx — add a signup guard mirroring admin-frontend's existing pattern,
// so onAuthStateChanged's login-bind doesn't race the explicit register call.
const isRegisteringRef = useRef(false);

// Sign-up path (was: createUserWithEmailAndPassword → postBackendRegister, but
// onAuthStateChanged could ALSO fire postBackendLogin concurrently — no guard existed):
async function signUpWithEmailPassword(email: string, password: string) {
  isRegisteringRef.current = true;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const idToken = await cred.user.getIdToken();
    await postBackendRegister(idToken);
  } finally {
    isRegisteringRef.current = false;
  }
}

// onAuthStateChanged handler — skip the login-bind while a register call is in flight,
// and treat a 403 from postBackendLogin as "no account", not a generic error.
onAuthStateChanged(auth, async (firebaseUser) => {
  if (isRegisteringRef.current) return; // registration path owns this transition
  if (!firebaseUser) { setUser(null); setLoading(false); return; }
  try {
    const idToken = await firebaseUser.getIdToken();
    const portalUser = await postBackendLogin(idToken);
    setUser(portalUser);
  } catch (err) {
    if (err instanceof BackendAuthError && err.status === 403) {
      await signOut(auth); // do not leave the user Firebase-signed-in but backend-rejected
      setAuthError("No account found for this login, or your account is disabled. Contact your RM.");
    } else {
      setAuthError(err instanceof Error ? err.message : "Login failed.");
    }
    setUser(null);
  } finally {
    setLoading(false);
  }
});
```

**Behavior / invariants:**
- A `403` from `postBackendLogin` (unknown uid, or `status != 'active'`) must sign the user back out of Firebase — leaving them Firebase-authenticated but backend-rejected is a dead-end state the old code never had to handle (old login auto-created, so 403 never happened here).
- The registration path calls `postBackendRegister` (now `/api/dev/register`) explicitly; if it 404s (dev route unmounted), the same sign-out + distinct message applies ("Self-registration is not available. Contact your RM to be onboarded.").
- `isRegisteringRef` prevents the pre-existing race where `onAuthStateChanged` could call `postBackendLogin` against a uid that `postBackendRegister` hasn't finished provisioning yet (previously harmless because login auto-created; now harmful because login 403s on an unbound uid).
- Google sign-in (`signInWithPopup`) goes through the same `onAuthStateChanged` login-bind path — no separate register call for Google (matches existing behavior; Google sign-in was never wired to `postBackendRegister`).

**Done when:** signup no longer races login-bind against register; a 403 from either call produces a clear, portal-user-facing message and signs Firebase back out; Google/email-password login for an already-provisioned client is unaffected.

---

### FE-3 — client-frontend: login/register page error surfaces (MANDATORY)

- **Proposal ref:** §6
- **Module:** 5.1
- **Files:** `modify: client-frontend/app/login/page.tsx`, `modify: client-frontend/app/register/page.tsx`
- **Dependencies:** FE-2 (consumes `AuthProvider`'s new error states)

**Contract (required code):**

```tsx
// login/page.tsx — the existing error banner (currently only maps Firebase SDK
// error codes via lib/firebase-auth-errors.ts) must also render AuthProvider's
// authError string (already produced by FE-2) verbatim, without re-mapping it
// through the Firebase error-code table (it's a backend message, not a Firebase one).
{authError && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{authError}</p>}
```

**Behavior / invariants:**
- The footer link already reads "contact administrator" (existing copy, unchanged — it already anticipated this rework) pointing at `/register`; no copy change needed there.
- `register/page.tsx` renders the same `authError` surface for the dev-register-unavailable (404) case, distinct from Firebase-side signup errors (weak password, email in use, etc. — unchanged, still mapped via `firebase-auth-errors.ts`).

**Done when:** a 403 (login, no account) and a 404 (register, dev-only route absent) each render a distinct, correct message on their respective pages, verified manually or via a component test per §8.

---

### FE-4 — admin-frontend: repoint `auth-api.ts` + fix `PortalUser` (MANDATORY)

- **Proposal ref:** §5, §6
- **Module:** 5.2
- **Files:** `modify: admin-frontend/lib/auth-api.ts`, `modify: admin-frontend/types/portal.ts`
- **Dependencies:** none — parallel-safe (root of the admin-frontend chain; independent of FE-1..FE-3)

**Contract (required code):**

```typescript
// types/portal.ts — same fix as FE-1, admin side (role stays the existing union type)
export type PortalUser = {
  firebase_uid: string;
  email: string | null;
  role: "ADMIN" | "MOBO" | "RM" | "PM" | "PC" | "COMPLIANCE";
};

// lib/auth-api.ts
export class BackendAuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "BackendAuthError";
  }
}

export async function postBackendLogin(idToken: string | null): Promise<PortalUser> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken }),
  });
  if (!res.ok) {
    throw new BackendAuthError(await parseApiError(res, "POST /api/auth/admin/login"), res.status);
  }
  return (await res.json()) as PortalUser;
}

// role is trusted by the backend ONLY when dev_mode is on (app/schemas/dev.py:
// `role: AdminRole | None` — "trusted for admin portal in DEV ONLY"). The UI's
// existing role dropdown (ADMIN/MOBO/RM/PM/PC/COMPLIANCE) is unchanged — it maps
// 1:1 onto AdminRole and is safe to keep sending as-is.
export async function postBackendRegister(idToken: string | null, role: string): Promise<PortalUser> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/dev/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken, portal: "admin", role }),
  });
  if (!res.ok) {
    throw new BackendAuthError(await parseApiError(res, "POST /api/dev/register"), res.status);
  }
  return (await res.json()) as PortalUser;
}
```

**Behavior / invariants:** identical to FE-1's, admin-scoped. Same `parseApiError` 404-message split applies here (own copy in `admin-frontend/lib/auth-api.ts` — not a shared file with client-frontend).

**Done when:** same acceptance shape as FE-1, admin side.

---

### FE-5 — admin-frontend: fix `AuthProvider` 403/404 handling (MANDATORY)

- **Proposal ref:** §4.3, §4.12
- **Module:** 5.2
- **Files:** `modify: admin-frontend/components/auth/AuthProvider.tsx`
- **Dependencies:** FE-4

**Contract (required code):**

```typescript
// AuthProvider.tsx — the isRegistering guard ALREADY EXISTS here (unlike
// client-frontend); this unit only needs to add the 403/404 branching FE-2
// introduced, reusing the existing guard rather than adding a new one.
onAuthStateChanged(auth, async (firebaseUser) => {
  if (isRegistering.current) return; // existing guard, unchanged
  if (!firebaseUser) { setUser(null); setLoading(false); return; }
  try {
    const idToken = await firebaseUser.getIdToken();
    const portalUser = await postBackendLogin(idToken);
    setUser(portalUser);
  } catch (err) {
    if (err instanceof BackendAuthError && err.status === 403) {
      await signOut(auth);
      setAuthError("No internal account found for this login, or your account is suspended.");
    } else {
      setAuthError(err instanceof Error ? err.message : "Login failed.");
    }
    setUser(null);
  } finally {
    setLoading(false);
  }
});
```

**Behavior / invariants:** same as FE-2's, admin-scoped; the cookie-mirroring (`onIdTokenChanged` → `writeIdTokenCookie`, `lib/id-token.ts`) is unrelated to login/register binding and is unchanged by this unit.

**Done when:** same acceptance shape as FE-2, admin side; existing `isRegistering` guard behavior is preserved (not replaced).

---

### FE-6 — admin-frontend: login/register page error surfaces (MANDATORY)

- **Proposal ref:** §6
- **Module:** 5.2
- **Files:** `modify: admin-frontend/app/(auth)/login/page.tsx`, `modify: admin-frontend/app/(auth)/register/page.tsx`
- **Dependencies:** FE-5

**Contract (required code):** same shape as FE-3 — render `authError` verbatim on both pages.

**Behavior / invariants:**
- Unlike client-frontend, the admin login page's `/register` link currently says "Create one" with no admin-gating language. Since dev-only register is real in dev but the route 404s in prod, update the link's surrounding copy to something environment-neutral, e.g. "New internal account? Register (dev only) →", so the 404 (when it happens) isn't a surprise. This is a **copy-only** change — no new dev-mode detection logic on the frontend (the proposal §4.8 explicitly defers a frontend dev-mode flag; this layer does not add one).

**Done when:** same acceptance shape as FE-3, admin side, plus the copy update above.

---

### FE-7 — admin-frontend: fix `signUpWithEmailPassword` role-arity gap (MANDATORY, follow-up)

- **Proposal ref:** none new — closes a gap introduced by FE-4/FE-5, found by W-final validation.
- **Module:** 5.2
- **Files:** `modify: admin-frontend/components/auth/AuthProvider.tsx`
- **Dependencies:** FE-4 (commit d38bebe, tightened `postBackendRegister`'s second param to required `role: string`), FE-5 (commit 4bc6b6a, did not update this caller).

**Contract (required code):**
- `signUpWithEmailPassword`'s `role` parameter (`AuthProvider.tsx:139`) changes from `role?: string` to `role: string` — a required parameter, matching `postBackendRegister(idToken, role)`'s now-required signature in `admin-frontend/lib/auth-api.ts`.
- No behavior change: the only caller (`register/page.tsx`) already always supplies a real string (`useState<string>("MOBO")`), so this is a type-level tightening only, not a runtime fix.

**Done when:** `signUpWithEmailPassword`'s `role` param is a required `string`; no caller passes `undefined`; the file type-checks cleanly once `pages-config.ts`'s unrelated pre-existing syntax error is fixed (that fix is out of scope for this unit — tracked separately).

---

## 7. Frozen seam (from the proposal — verbatim)

### 7.1 The seam (verbatim from proposal §5, §4.12 table, and the Backend layer's committed schemas)

```
/api/auth/client/login     bind existing client by uid; 403 if no staged/active account  (was /auth/login)
/api/auth/admin/login      bind existing internal user; 403 if disabled                  (was /auth/login)
/api/auth/me               shared, portal-agnostic                                       (unchanged)
/api/auth/logout           unchanged
— REMOVED: POST /api/auth/register
— DEV-ONLY (mounted iff dev_mode): POST /api/dev/register  self-registration module       (R7)

# Request/response shapes actually committed on rework-authentication-module-be:

FirebaseLoginBody { id_token: str | None }              # api-backend/app/schemas/auth.py
UserOut { firebase_uid: str, email: str | None, role: str }   # api-backend/app/schemas/users.py — frozen, unaffected by this rework
DevRegisterIn { id_token: str, portal: "client" | "admin", role: AdminRole | None }  # api-backend/app/schemas/dev.py — role trusted for admin portal in DEV ONLY

POST /api/auth/client/login  -> 200 UserOut | 403 (no/disabled account)
POST /api/auth/admin/login   -> 200 UserOut | 403 (no/disabled account)
POST /api/dev/register       -> 201 UserOut | 404 (not mounted, dev_mode off) | 409 (uid already registered)
GET  /api/auth/me            -> 200 UserOut
POST /api/auth/logout        -> 204
```

### 7.2 How this layer honours the seam
- **What this layer contributes:** both frontends call the portal-scoped login routes with `{id_token}` only (no `portal` field — the route implies it); both call `/api/dev/register` for self-serve provisioning instead of the retired `/api/auth/register`; both surface a `403` from login and a `404` from dev-register as distinct, user-facing states rather than a generic fetch error.
- **What this layer assumes from the other side:** the Backend layer's `UserOut` shape (`firebase_uid`, `email`, `role` — no `id`), the exact status codes above, and that `/api/dev/register` genuinely 404s (not 500s or silently no-ops) when `dev_mode` is off — per BE-22's fail-closed startup assertion and BE-24's conditional router mount, already committed.
- **Change protocol:** any edit to this seam goes to the proposal first; this section is then re-copied. Never edit §7 in isolation.

---

## 8. Internal unit testing

### 8.1 Test setup
- **Framework / runner:** vitest — command: `npx vitest run` (both apps; `package.json` already has `"test": "vitest run"` and a `vitest.config.ts` — confirmed present, no toolchain-setup unit needed).
- **Fixtures / seed:** `vi.mock("firebase/auth")` for SDK calls (`signInWithPopup`, `signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `onAuthStateChanged`); mocked global `fetch` for `lib/auth-api.ts` calls, matching the existing convention seen in `admin-frontend/tests/server/mobo/FE-1.server-mobo.test.ts` (`vi.mock("server-only")`, `vi.mock("next/headers")`, mocked `fetch`).
- **Isolation:** hermetic — no real network, no real Firebase project.
- **Layer isolation:** tests import only from this app's own code + stdlib + test doubles. No import of the sibling app (`client-frontend` tests never import from `admin-frontend` or vice versa) and no import from `api-backend` (the seam in §7 is faked, not executed).
- **Test location:** `client-frontend/tests/` and `admin-frontend/tests/`, mirroring source path (e.g. `client-frontend/tests/lib/auth-api.test.ts`, `client-frontend/tests/components/auth/AuthProvider.test.tsx`) — never co-located next to source.
- **Commit policy:** tests are **NEVER committed**. Both apps' `tests/` dirs are git-ignored.
- **Code generation:** the `test-gen` skill writes concrete tests from §8.3's goals, invoked before fan-out per the prompt doc.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| FE-1 | `postBackendLogin` hits `/api/auth/client/login` with `{id_token}` only; a non-2xx throws `BackendAuthError` carrying `.status`; `PortalUser` has no `id` field | mocked `fetch` returning 200 `UserOut`-shaped body, and a 403 body |
| FE-2 | signup guard prevents `onAuthStateChanged` from racing `postBackendRegister`; a 403 from login signs Firebase out and sets a specific message | mocked `firebase/auth` + mocked `postBackendLogin`/`postBackendRegister` |
| FE-3 | login page renders `authError` verbatim (not re-mapped through Firebase error codes); register page does the same for a 404 | mocked `AuthProvider` context value |
| FE-4 | `postBackendLogin` hits `/api/auth/admin/login`; `postBackendRegister` sends `{id_token, portal:"admin", role}`; `PortalUser` has no `id` field | mocked `fetch` |
| FE-5 | existing `isRegistering` guard preserved; 403 branch mirrors FE-2's | mocked `firebase/auth` + mocked `auth-api.ts` |
| FE-6 | same as FE-3, admin side, plus the register-link copy is environment-neutral | mocked `AuthProvider` context value |

### 8.3 Test goals (per unit)

#### FE-1
- **Positive:** `postBackendLogin(idToken)` issues `POST /api/auth/client/login` with body `{id_token: idToken}` (no `portal` key) and resolves to a `PortalUser` with exactly `firebase_uid`/`email`/`role`. `postBackendRegister(idToken)` issues `POST /api/dev/register` with `{id_token, portal:"client"}`.
- **Negative:** a mocked 403 response causes `postBackendLogin` to throw a `BackendAuthError` with `.status === 403`. A mocked 404 on `/api/dev/register` throws `BackendAuthError` with a message that does **not** mention "restart the FastAPI server".
- **Invariants:** `PortalUser`'s TS shape has no `id` field (compile-time — a test that constructs a `PortalUser` literal without `id` must type-check).
- **Seam mocks:** mocked `fetch` returning a `UserOut`-shaped JSON body (`{firebase_uid, email, role}`) for 200s, and `{detail: "..."}` for 403/404s.

#### FE-2
- **Positive:** `signUpWithEmailPassword` sets the registering-guard, calls `postBackendRegister`, and does not also trigger a login-bind call for the same uid while the guard is set.
- **Negative:** when `postBackendLogin` (via `onAuthStateChanged`) throws a `BackendAuthError` with `.status === 403`, the provider calls `signOut(auth)` and sets an error message distinct from a generic Firebase error.
- **Invariants:** the registering-guard is always cleared (even if `postBackendRegister` throws) — a `finally` block, not an unconditional post-call reset.
- **Seam mocks:** `vi.mock("firebase/auth")` stubbing `onAuthStateChanged` to invoke its callback synchronously with a fake `firebaseUser`; `vi.mock` on `lib/auth-api.ts` returning either a resolved `PortalUser` or a rejected `BackendAuthError`.

#### FE-3
- **Positive:** given an `authError` string in context, the login page renders it inside the existing red error banner element.
- **Negative:** a Firebase SDK error code (e.g. `auth/wrong-password`) still renders via the existing `firebase-auth-errors.ts` mapping, unaffected by this unit.
- **Invariants:** the two error surfaces (backend `authError` vs. Firebase error-code mapping) never both render at once for a single failed attempt.
- **Seam mocks:** a mocked `AuthProvider` context provider wrapping the page component in the test, with `authError` set directly (no real Firebase/network calls needed for this unit's tests).

#### FE-4
- **Positive:** `postBackendLogin(idToken)` issues `POST /api/auth/admin/login` with `{id_token}` only. `postBackendRegister(idToken, role)` issues `POST /api/dev/register` with `{id_token, portal:"admin", role}`.
- **Negative:** same 403/404 `BackendAuthError` behavior as FE-1.
- **Invariants:** `PortalUser`'s `role` union type is unchanged (`"ADMIN" | "MOBO" | "RM" | "PM" | "PC" | "COMPLIANCE"`) and has no `id` field.
- **Seam mocks:** same shape as FE-1's.

#### FE-5
- **Positive:** the existing `isRegistering` ref still suppresses `onAuthStateChanged`'s login-bind during an in-flight registration (regression check — this unit must not remove that guard while adding the 403 branch).
- **Negative:** a 403 from `postBackendLogin` signs Firebase out and sets a distinct message; unchanged from FE-2's shape but exercised against the admin provider's existing structure.
- **Invariants:** the `onIdTokenChanged` → `writeIdTokenCookie` cookie-mirroring behavior is unaffected by this unit (still fires on every token change, independent of the login-bind outcome).
- **Seam mocks:** same as FE-2's.

#### FE-6
- **Positive:** same as FE-3's, admin side.
- **Negative:** same as FE-3's, admin side.
- **Invariants:** same as FE-3's; additionally, the register-link copy no longer implies unconditional self-registration ("Create one" → environment-neutral dev-only phrasing).
- **Seam mocks:** same as FE-3's.

### 8.4 Aggregate gate
- All unit tests green is a local gate run before commit/PR hand-off, per app (`client-frontend/` and `admin-frontend/` each run their own `npx vitest run`).
- Target coverage for changed lines: no strict percentage — this is a small, well-bounded rework (6 units, all touching pre-existing files); every new branch (403, 404, guard) must have at least one test.
- Chosen `test-gen` level for this layer: **standard** (happy path + main negative + the seam-mock assertion per unit — `thorough` is not warranted for a bounded auth-plumbing fix with no enumerable domain to parametrize over).

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] FE-1 through FE-6 committed on `rework-authentication-module-fe`; each commit left the branch green.
- [ ] §8 unit tests all pass in both apps; `npx vitest run && npx next lint` green per app.
- [ ] §7 matches the proposal's frozen seam verbatim, checked against the Backend layer's actual committed schemas (not assumed from this doc alone — re-verify if `-be` has moved since 2026-07-18).
- [ ] PR opened; human owns the merge to `rework-authentication-module`.

**Rollback:** every unit here is a pure frontend code change with no data migration and no schema dependency — reverting the branch (or any individual commit) fully reverts the behavior. Not lossy.
