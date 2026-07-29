# 019 — Admin Access Control & Staff Enrollment · Implementation Details — Frontend

> Status: **DRAFT — pending implementation.**
> Implements: proposal `docs/proposals/019-2026-07-29-admin-access-control-and-staff-enrollment.md` § "Layer 3 — Frontend" (findings A-1…A-8, § B "Adapting to changes in other layers", § C "Additional findings", § D summary), plus the Frontend rows of § "Dead code purged", § "Design decisions" D-1/D-3/D-6/D-7/D-9, § "Execution & verification" step 3, and § Rollback.
> Layer: Frontend — **one layer per file.** Covers **both** frontends: `admin-frontend/` (all of the access/console work) and `client-frontend/` (the register purge only, A-8).
> Sibling layer docs: `docs/implementations/019-admin-access-control-and-staff-enrollment-db.md` (Database), `docs/implementations/019-admin-access-control-and-staff-enrollment-be.md` (Backend).
> Execution schedule: `docs/execution-schedules/019-admin-access-control-and-staff-enrollment-fe.md`
> Branch: `claude/admin-pages-backend-proposal-f0c9fc-fe` — cut from parent `claude/admin-pages-backend-proposal-f0c9fc`, merged back into it. **The human owns that merge** (and the merge of the parent into `main`).
> Builds on / prerequisites:
> - The frozen seam (proposal § 4) is agreed. §7 below is a verbatim copy of it.
> - **Information precondition (the real scheduling constraint, proposal C-3 / Q-5 / Execution step 3):** the Backend layer's phase-2 integration test decides which Firebase link type works over a passwordless identity. If `generate_password_reset_link` succeeds, this layer's scope is exactly FE-1…FE-16. If it fails and the fallback `generate_sign_in_with_email_link` is used, this layer additionally owns a set-password landing form (FE-17). **This layer is scheduled only after that outcome is reported** — it is a precondition on *information* (a recorded test result in the Backend impl doc), not on a sibling branch's state; no sibling code is imported, stood up, or waited on.

<!-- Template: templates/implementation_details.md. Three levels only (§4 Architecture
→ §5 Modules → §6 Features). No git command sequences, no phase graph, no agent
choreography — those belong to the execution schedule. -->

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/019-2026-07-29-admin-access-control-and-staff-enrollment.md` § "Layer 3 — Frontend" |
| Execution schedule | `docs/execution-schedules/019-admin-access-control-and-staff-enrollment-fe.md` |
| Sibling layer impl docs | `docs/implementations/019-admin-access-control-and-staff-enrollment-db.md`, `docs/implementations/019-admin-access-control-and-staff-enrollment-be.md` |
| Builds on | The proposal's § 4 frozen seam (reproduced verbatim in §7) and design decisions D-1, D-3, D-5 through D-15. Proposal 009's `AccessLevel` forward declaration and its dormant `hooks/usePageAccess.ts` — whose "never a mix of other roles' domains" nav rule is superseded by D-15. Proposal 018's `client_tickets.assigned_rm_uid` snapshot semantics (context for FE-15's copy). |
| Information precondition | Backend layer's Q-5 test outcome (reset link vs. email-link sign-in) — gates whether FE-17 exists |

Traceability of every unit back to an approved decision is in §6 (each unit carries a **Proposal ref**), summarised:

| Proposal finding | Units |
|---|---|
| A-1 `PAGE_CATALOG` derived, re-keyed to `page_id` / role code | FE-2, FE-3 |
| A-2 one `AccessLevel = NONE\|VIEW\|EDIT` | FE-1 |
| A-3 `server/admin/` + API-backed store, mock deleted | FE-7, FE-8, FE-9, FE-10 |
| A-4 `usePageAccess`/`useCanEdit`, 32 gate sites **hidden** at `VIEW` (D-14), `<NoAccess>` (Q-4), cross-role nav under one parent (D-15) | FE-4, FE-5, FE-6 |
| D-11 / D-13 the seeded day-one matrix (55 rows, 30 `edit` / 25 `view`) — the catalog's `levels[]` promoted before deletion, and what the UI displays on day one | FE-2 (provenance), FE-5, FE-6, §9 |
| A-5 no password anywhere in the FE, wording | FE-11, FE-12 |
| A-6 overrides ledger → System Config | FE-13 |
| A-7 wizard sends real `overrides[]` | FE-14 |
| A-8 register purge, **both** frontends | FE-16 |
| § C derived `initials`/`tone`/`seen`, server `role_default`, `nextId()` deleted | FE-8 |
| § C / Backend C-11 RM book handover, two triggers | FE-15 |
| Q-5 fallback branch (conditional) | FE-17 |

---

## 2. Branch & session contract

- **Branch:** `claude/admin-pages-backend-proposal-f0c9fc-fe` — every FE-* unit lands on this one branch.
  - Naming: parent branch (captured at session start via `git rev-parse --abbrev-ref HEAD`) plus the `-fe` suffix. Merges back into the parent; the human owns that merge.
- **Isolation:** implementable in its own session, in parallel with the DB and Backend sessions. It shares state with them **only** through §7. No unit imports, mocks against, or waits on sibling-branch files; where a unit needs the other side of the seam it uses the §7 DTO shape as the fake (§8).
- **Preconditions (must be true before starting):**
  - [ ] The proposal's § 4 seam is agreed and unchanged (§7 is a verbatim copy of it, not a negotiation).
  - [ ] The Q-5 outcome from the Backend layer's phase-2 test is **recorded and readable** (in the Backend impl doc). If it selected the email-link fallback, FE-17 is in scope; otherwise FE-17 is dropped from this doc's unit set by the schedule.
  - [ ] `admin-frontend` and `client-frontend` both install clean and their existing gates pass on the parent branch (`npx vitest run && npx tsc --noEmit && npx next lint` in each) — the baseline this layer must not regress.
  - [ ] Node toolchain has `tsx` available for `npx tsx admin-frontend/lib/pages.check.ts` (already the documented way to run that script).
- **Read-first inventory** (every existing file a unit touches — no discovery phase needed):

  *Access registry & vocabulary*
  - `admin-frontend/lib/pages-config.ts` — `Role`, `AccessLevel` (`"OPERATE" | "VIEW"`, :23), `PageId` (16 keys), `PAGES`, `ROLE_NAV`, `ALL_OPERATE` (:192), `ROLE_PAGES` (:196), `ROLE_DEFAULT_PAGE`, `grantsFor`, `accessLevel`, `pagesForRole`, `defaultPathFor`, `rolesForPath`, `groupsFor`.
  - `admin-frontend/lib/pages.check.ts` — plain `node:assert` script; asserts `ROLE_PAGES.ADMIN[id] === "OPERATE"` (:17) and a `rolesForPath` parity block (:26-36) that must be rewritten.
  - `admin-frontend/hooks/usePageAccess.ts` — **exists, has zero consumers** (verified: `grep -rn "usePageAccess\|useCanEdit" admin-frontend client-frontend` returns exactly one hit, the definition at `hooks/usePageAccess.ts:12`). Rewritten in place; **no second hook file is created.**

  *Admin console*
  - `admin-frontend/lib/admin/types.ts` — `Level` (:17), `RoleDef`, `PageDef`, `PageGroup`, `FlatPage`, `UserStatus`, `StatusTone`, `AdminUser`, `Override`, `AuditEntry`, `StagedChange`, `EnrollDraft` (`.pw` :98, `.expiry` :99).
  - `admin-frontend/lib/admin/catalog.ts` — `ROLES`, `ROLE_IDX`, `LEVEL_LABEL`, `PAGE_CATALOG` (17 hand-written paths, :23-51), `ALL_PAGES`, `PAGE_BY_PATH`, `TOTAL_PAGES`, `kFor(path, roleIdx)` (:63), `seedLevels()` (:66).
  - `admin-frontend/lib/admin/AdminStoreContext.tsx` — `uid`/`nextId()` (:23-24), `STATUS_TONE` (:26), the `AdminStore` interface, every `setState` mutator, `publish` (:116), `eff` (:78), `ovrOn` (:98), `copyRole`/`resetRole` (role-index based).
  - `admin-frontend/lib/admin/password.ts` — `genPassword()`; **deleted**.
  - `admin-frontend/lib/mock/admin-data.ts` — `TODAY`, `ADMIN_USERS`, `ADMIN_OVERRIDES`, `ADMIN_AUDIT`; **deleted**.
  - `admin-frontend/components/admin/Shared.tsx` — `LEVEL_STYLE`/`LEVEL_TITLE` (:32-37), `LevelBadge`, `SEG_ORDER`/`LevelSeg`, `LevelDiff`, `ViewSwitch` (:319, two-way), plus the form/table/modal primitives.
  - `admin-frontend/components/admin/AccessEditor.tsx` — keyed on `path` throughout.
  - `admin-frontend/components/admin/AuditModal.tsx` — splits `a.ts` on `" · "`.
  - `admin-frontend/components/admin/config/Matrix.tsx` — `CellPayload {name, path, roleIdx}`, `locked = group === "Administration" && roleIdx === 5` (:148), `LevelKey`.
  - `admin-frontend/components/admin/config/RoleView.tsx` — `ROLE_IDX`-driven rail, `copyRole`/`resetRole`.
  - `admin-frontend/components/admin/config/ConfigModals.tsx` — `LEVEL_OPTIONS` (:19-23), `isReduction`, `CellModal`, `PublishModal`.
  - `admin-frontend/components/admin/enroll/Directory.tsx` — `Overrides ({n})` (:65), status counts, `"Reset temporary password"` menu item (:138).
  - `admin-frontend/components/admin/enroll/Wizard.tsx` — `roleIdx` (:40), `DONE.creds` (:64), Role step Notice (:175-179), Access step, Credentials step (:198-221).
  - `admin-frontend/components/admin/enroll/LifecycleModals.tsx` — `EXPIRY_OPTS` (:24), `ResetModal` (:27), `ManageOverridesModal` (:68), `DeactivateModal` (:133, the fabricated "4 open items" at :152-153/:165-173), `ReactivateModal` (:184), `CreatedInfo`/`CreatedModal` (:216-264), `AddOverrideModal` (:267).
  - `admin-frontend/components/admin/enroll/OverridesLedger.tsx` — own `PageHeader` + "Back to directory"; **moves**.
  - `admin-frontend/app/(roles)/admin/enroll-user/page.tsx` — `View` union (:27), `blankDraft()` (:38), `startEdit` (:60), `createUser` (:72-94).
  - `admin-frontend/app/(roles)/admin/system-config/page.tsx` — `ConfigView` (:25), `ViewSwitch` (:62), toolbar counts (:65), staged bar, `published` (:76).
  - `admin-frontend/app/(roles)/admin/layout.tsx` — server component: `RoleGuard allowedRoles={rolesForPath("/admin/enroll-user")}` wrapping `AdminStoreProvider`.

  *Data-access chain (the pattern FE-7 must match exactly)*
  - `admin-frontend/server/api-client.ts` — `APIResult<T>`, `apiClient`, `apiClientFormData`, `apiClientConditional`; `id_token` cookie → `Authorization: Bearer`.
  - `admin-frontend/server/endpoints.ts` — `ENDPOINTS` with `PC`/`RM`/`MOBO`/`COMPLIANCE` groups and per-group path constants.
  - `admin-frontend/server/pc/index.ts` — the reference domain module: `"use server"`, one exported async fn per route, each returning `apiClient<DTO>(ENDPOINTS.X.Y, {method, body: JSON.stringify(...)})`.
  - `admin-frontend/app/(roles)/pc/model-management/actions.ts` + `admin-frontend/hooks/api/useModels.ts` — the route-local logging wrapper and the client-side hook shape (`data`/`loading`/`error`/`refetch`, `inFlight` ref) that the rest of the repo uses to reach a `server/<domain>` module from a client component.

  *Auth / guards / nav*
  - `admin-frontend/components/auth/AuthProvider.tsx` — `AuthContextValue` (`signUpWithEmailPassword` :29), `isRegistering` ref (:44) and its `onAuthStateChanged` branch (:68-74), `signUpWithEmailPassword` (:139-159), the two `value`/deps entries (:215, :229).
  - `admin-frontend/components/auth/AuthGuard.tsx`, `admin-frontend/components/auth/RoleGuard.tsx` (:14-40, redirect-on-deny).
  - `admin-frontend/types/portal.ts` — `PortalUser`.
  - `admin-frontend/lib/auth-api.ts` — `postBackendLogin`, `postBackendRegister` (:60-71), the `/api/dev/register` 404 special-case (:27-29), `syncPortalUserAfterFirebaseAuth`.
  - `admin-frontend/lib/firebase-auth-errors.ts` — `auth/email-already-in-use` branch (:13-14).
  - `admin-frontend/app/(auth)/login/page.tsx` — the register `<Link>` (:129-130).
  - `admin-frontend/app/(auth)/register/page.tsx` — **deleted** (whole route dir).
  - `admin-frontend/app/page.tsx` — `defaultPathFor(portalUser.role)` destination resolution.
  - `admin-frontend/components/sidebar/SidebarNav.tsx` — `groupsFor(portalUser?.role ?? "")`.
  - `admin-frontend/components/sidebar/RoleGroup.tsx` — `RoleGroupConfig`/`RoleSubPage`, subgroup grouping (unchanged; consumes whatever `groupsFor` returns).

  *The 11 gate-marker files (32 markers, count verified)*
  - Verified with `grep -ro "View/Edit Gate Function" admin-frontend --include=*.tsx | wc -l` → **32**, distributed exactly as the proposal's A-4 table states. Gating `PageId` per file (resolved from each file's importing route):

    | File | Markers | Gating `PageId` | How resolved |
    |---|---|---|---|
    | `components/rm/OnboardingModal.tsx` | 7 | `rm.onboarding-renewal` | only importer: `app/(roles)/rm/onboarding-renewal/page.tsx` |
    | `components/rm/RequestTickets.tsx` | 4 | `rm.request-tickets` | importers: `app/(roles)/rm/requests/page.tsx`, `app/(roles)/rm/requests/[ref]/page.tsx` (both under `PAGES["rm.request-tickets"].path = "/rm/requests"`) |
    | `components/rm/ContactLog.tsx` | 4 | `rm.client-info` | only importer: `app/(roles)/rm/client-info/[id]/page.tsx` |
    | `components/compliance/review/CrDetailPanel.tsx` | 4 | `compliance.review` | only importer: `app/(roles)/compliance/review/page.tsx` |
    | `app/(roles)/mobo/trade-reconciliation/page.tsx` | 4 | `mobo.trade-reconciliation` | itself |
    | `components/compliance/review/ObDetailPanel.tsx` | 3 | `compliance.review` | only importer: `app/(roles)/compliance/review/page.tsx` |
    | `app/(roles)/mobo/commission-tracking/page.tsx` | 2 | `mobo.commission-tracking` | itself |
    | `components/rm/SubscriptionAccordion.tsx` | 1 | `rm.model-subscription` | only importer: `app/(roles)/rm/model-subscription/page.tsx` |
    | `components/rm/TransactionDetailModal.tsx` | 1 | `rm.model-subscription` | only importer: `components/rm/SubscriptionAccordion.tsx`, itself only imported by the model-subscription page |
    | `app/(roles)/mobo/recon-overview/page.tsx` | 1 | `mobo.recon-overview` | itself |
    | `app/(roles)/rm/model-subscription/page.tsx` | 1 | `rm.model-subscription` | itself |

  *client-frontend (register purge only)*
  - `client-frontend/app/register/page.tsx` (deleted), `client-frontend/app/login/page.tsx` (register `<Link>` :227), `client-frontend/lib/auth-api.ts` (`postBackendRegister` :45-55, the `/api/dev/register` 404 special-case :27), `client-frontend/lib/firebase-auth-errors.ts` (`auth/email-already-in-use` :13), `client-frontend/components/auth/AuthProvider.tsx` (`signUpWithEmailPassword` :27/:128/:216/:230, `isRegisteringRef` :44/:71/:156).

- **Hand-off / exit signal:** every FE-* unit committed on the layer branch, each commit green; `npx vitest run && npx tsc --noEmit && npx next lint` clean in **both** `admin-frontend/` and `client-frontend/`; `npx tsx admin-frontend/lib/pages.check.ts` prints `OK`; the proposal's step-3 greps all return nothing (`OPERATE`, `temporary password` case-insensitive, `signUpWithEmailPassword`, `postBackendRegister`, `genPassword`, `seedLevels`, `nextId`, `ROLE_PAGES`, `ROLE_IDX`, `mock/admin-data`) across both frontends; `grep -c "View/Edit Gate Function"` still totals **32** and every marker is adjacent to a `canEdit` reference **in a conditional-render position, not a `disabled` prop** (D-14); PR opened against the parent branch.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions

- **Data-access chain (must be matched exactly, not reinvented):** `client page/store → hooks/api/useX.ts or app/(roles)/<route>/actions.ts ("use server" logging wrapper) → server/<domain>/index.ts ("use server") → apiClient → ENDPOINTS`. `server/<domain>/index.ts` never imports a component or a hook; `actions.ts` adds only `logger` + `try/catch → {success:false, code:"ACTION_ERROR"}`; the hook/store owns `data`/`loading`/`error` and an `inFlight` ref. Established by `server/pc/index.ts` + `app/(roles)/pc/model-management/actions.ts` + `hooks/api/useModels.ts`.
- **Result envelope:** every server action returns `APIResult<T>` = `{success:true,data:T} | {success:false,error:string,code:string}`. Callers branch on `.success`; failures surface via `toast.error(result.error)`. No thrown errors cross the action boundary. HTTP status is recoverable from `code` (`"HTTP_409"`), which is how FE-10 detects the stale-publish conflict.
- **Wire DTOs are consumed verbatim (snake_case).** `page_id`, `firebase_uid`, `last_sign_in_at`, `expires_at`, `override_count`, `client_count`, `open_ticket_count`, `link_sent`, `base_published_at`, `reassign_book_to` keep their wire names in TS interfaces. No camelCase view-model layer is introduced; the console's existing display helpers read the DTO fields directly.
- **One access vocabulary.** `AccessLevel = "NONE" | "VIEW" | "EDIT"` lives in `lib/pages-config.ts` and is re-exported from `lib/admin/types.ts` as `Level` so the console's existing call sites (`LEVEL_LABEL`, `LEVEL_STYLE`, `LEVEL_TITLE`, `SEG_ORDER`, `LevelSeg`, `LevelBadge`, `LevelDiff`, `LEVEL_OPTIONS`) keep working after a case fold. Zero occurrences of `OPERATE` anywhere afterwards; the lowercase `"none"`/`"view"`/`"edit"` spellings do not survive either.
- **`page_id`, never `path`.** Every store key, staged change, override, catalog lookup and matrix cell is keyed by `PageId`. `path` remains a *display* field only (the matrix's route sub-line, the ledger's page sub-line), sourced from `MatrixOut.pages[].path`.
- **Role code, never role index.** `kFor(pageId, role)`, `eff(pageId, role)`, `stage(pageId, role, level)`. `ROLE_IDX` and every `roleIdx: number` parameter are deleted, so `ROLES` order stops being load-bearing.
- **Derived, not stored.** `initials` from `name`, `tone` from `status`, `seen` from `last_sign_in_at`, `role_default` from the server. Computed at render; never held in state alongside the DTO.
- **Server-authored display data is not re-sorted or re-labelled.** `MatrixOut.pages` (order, `group`, `label`, `path`) and `MatrixOut.roles` (order, `name`, `user_count`) are rendered as received (§7.2).
- **No new component props for gating.** `useCanEdit(pageId)` reads context inside the component that owns the control. Prop-threading a `canEdit` boolean is explicitly out.
- **No layout redesign.** Only the four changes the proposal's front matter sanctions (ledger relocation, password wording, the Credentials step losing two controls, the deactivate reassign control becoming real + its mirror in the wizard's Role step). Every gate site gains a conditional render in place (D-14) — no re-layout, no re-flow of the surviving content.
- **At `VIEW`, mutating controls are hidden, not disabled (D-14).** All 32 marker sites render `{canEdit && …}`. A container whose only children are gated controls is hidden with them, so no empty shell or orphan divider survives. This is a truthfulness choice, not a security one: hiding and disabling are equally cosmetic, and `require_action` on the endpoint is what actually refuses the write (§7's Backend obligation).
- **i18n:** the admin console is English-only today (no `useTranslation` in `components/admin/**`); this layer does not introduce i18n there.

### 3.2 CI/CD & engineering discipline

- **Trunk-friendly, small units.** Each §6 unit is one atomic, self-reviewable commit that leaves the branch green.
- **Every unit independently revertible**, with the dependencies named per unit. Two documented exceptions: FE-9 (mock deletion + API-backed store) cannot land before FE-7/FE-8, and FE-6 (32 gate sites) cannot land before FE-4.
- **Additive & backward-compatible first.** FE-1's `AccessLevel` widening and FE-7's new module/endpoints are additive; the contraction steps (`ROLE_PAGES`/`ALL_OPERATE`/`accessLevel`/`pagesForRole` removal in FE-5, `password.ts` in FE-11, `lib/mock/admin-data.ts` in FE-9, the register route in FE-16) are scheduled after their last reader is gone.
- **Gates before merge** — verified present: `admin-frontend/package.json` has `"test": "vitest run"` and `"lint": "next lint"`, and `admin-frontend/vitest.config.ts` exists; `client-frontend` likewise (`"test": "vitest run"`, `"lint": "next lint"`, `client-frontend/vitest.config.ts`).

  ```bash
  npx vitest run && npx tsc --noEmit && npx next lint
  ```

  This must pass in **both** working directories — `admin-frontend/` and `client-frontend/` — because A-8 spans both. Plus, from the repo root:

  ```bash
  npx tsx admin-frontend/lib/pages.check.ts
  ```

  `pages.check.ts` is a plain `node:assert` script, **not** a Vitest suite, and it is kept in that form. It currently asserts `ROLE_PAGES.ADMIN[id] === "OPERATE"` (:17) plus a `rolesForPath` parity block, both of which reference symbols this layer deletes — it must be rewritten (FE-3), not merely re-run.
- **No secrets, no manual steps in the merge path.** Nothing in this layer touches infra. The proposal's human gates (phase 0 Firebase extension, phase 4 live migration, phase 5 smoke mail) all sit outside this layer and are the schedule's concern.
- **Reversibility documented** (§9): pure frontend, nothing persisted — with the one honest caveat that reverting restores the `/register` pages.

---

## 4. Architecture

**Target layout** (`# NEW`, `# MOD`, `# DEL` per file; unit IDs in comments):

```
admin-frontend/
  lib/
    pages-config.ts                     # MOD — FE-1 (AccessLevel), FE-5 (ROLE_PAGES et al. deleted, pageIdForPath added)
    pages.check.ts                      # MOD — FE-3 (assertions rewritten)
    admin/
      types.ts                          # MOD — FE-1 (Level re-export), FE-8 (DTO-shaped types)
      catalog.ts                        # MOD — FE-2 (derived from PAGES, re-keyed)
      AdminStoreContext.tsx             # MOD — FE-9 (API-backed), FE-10 (publish + 409)
      password.ts                       # DEL — FE-11
      today.ts                          # NEW — FE-9 (todayLabel(), replaces mock TODAY)
    mock/admin-data.ts                  # DEL — FE-9
  hooks/
    usePageAccess.ts                    # MOD — FE-4 (rewritten in place; + useCanEdit)
  server/
    endpoints.ts                        # MOD — FE-7 (ENDPOINTS.ADMIN)
    admin/index.ts                      # NEW — FE-7 (one server action per §7.1 admin route)
  app/(roles)/admin/
    actions.ts                          # NEW — FE-7 (route-local logging wrapper, matches pc/model-management/actions.ts)
    layout.tsx                          # MOD — FE-5 (grant-driven guard), FE-9 (initial store props)
    enroll-user/page.tsx                # MOD — FE-9, FE-11, FE-13, FE-14, FE-15
    system-config/page.tsx              # MOD — FE-10, FE-13
  components/
    auth/
      NoAccess.tsx                      # NEW — FE-5
      RoleGuard.tsx                     # MOD — FE-5 (renders <NoAccess> instead of redirecting on a known-page deny)
      AuthProvider.tsx                  # MOD — FE-16
    admin/
      Shared.tsx                        # MOD — FE-1 (level maps case-fold), FE-13 (ViewSwitch third option)
      AccessEditor.tsx                  # MOD — FE-2 (pageId-keyed)
      AuditModal.tsx                     # MOD — FE-8 (AuditOut shape)
      config/
        Matrix.tsx                       # MOD — FE-2 (pageId + role code, lock re-expressed)
        RoleView.tsx                     # MOD — FE-2 (role code)
        ConfigModals.tsx                 # MOD — FE-1, FE-2, FE-10 (base_published_at + 409 copy)
        OverridesLedger.tsx              # NEW (moved from enroll/) — FE-13
      enroll/
        Directory.tsx                    # MOD — FE-8, FE-12, FE-13
        Wizard.tsx                       # MOD — FE-2, FE-11, FE-14, FE-15
        LifecycleModals.tsx              # MOD — FE-12, FE-15; AddOverrideModal moved out — FE-13
        OverridesLedger.tsx              # DEL (moved) — FE-13
    sidebar/SidebarNav.tsx               # MOD — FE-5 (grant-driven groupsFor)
  types/portal.ts                        # MOD — FE-4 (grants)
  lib/auth-api.ts                        # MOD — FE-16
  lib/firebase-auth-errors.ts            # MOD — FE-16
  app/(auth)/login/page.tsx              # MOD — FE-16
  app/(auth)/register/                   # DEL — FE-16
  app/(auth)/set-password/page.tsx       # NEW — FE-17 (CONDITIONAL on Q-5)

client-frontend/
  app/register/                          # DEL — FE-16
  app/login/page.tsx                     # MOD — FE-16
  lib/auth-api.ts                        # MOD — FE-16
  lib/firebase-auth-errors.ts            # MOD — FE-16
  components/auth/AuthProvider.tsx       # MOD — FE-16
```

**Dependency direction:**

```
app/(roles)/admin/*/page.tsx
        │  (client)
        ▼
lib/admin/AdminStoreContext.tsx ──▶ app/(roles)/admin/actions.ts ──▶ server/admin/index.ts ──▶ server/api-client.ts ──▶ ENDPOINTS.ADMIN
        │
        └──▶ lib/admin/catalog.ts ──▶ lib/pages-config.ts   (PAGES, PageId, AccessLevel)

components/** (gate sites) ──▶ hooks/usePageAccess.ts ──▶ components/auth/AuthProvider.tsx (portalUser.grants)
                                          └──▶ lib/pages-config.ts (PageId, AccessLevel)

components/auth/RoleGuard.tsx ──▶ lib/pages-config.ts (pageIdForPath) + AuthProvider (grants) ──▶ components/auth/NoAccess.tsx
components/sidebar/SidebarNav.tsx ──▶ lib/pages-config.ts (groupsFor(grants))
```

Rules: `lib/pages-config.ts` imports nothing from `lib/admin/**` (the arrow is one-way — `catalog.ts` derives from `PAGES`, never the reverse). `server/admin/index.ts` imports only `server/api-client.ts`, `server/endpoints.ts` and its own DTO types — never a component, hook or the store. `hooks/usePageAccess.ts` imports only `AuthProvider` and `pages-config`; it must not import `lib/admin/**` (the console's types are not on the gate path). `components/auth/NoAccess.tsx` imports `pages-config` + `AuthProvider` only, so `RoleGuard` gains no dependency on the admin console.

**External seams:** consumes all ten `/api/admin/*` routes of §7.1 plus the extended `UserOut` on `POST /api/auth/admin/login` and `GET /api/auth/me`. Writes nothing to any DB directly. Depends on the Backend layer only through §7. Deletes its dependency on `POST /api/dev/register` (FE-16).

---

## 5. Modules

### 5.1 `lib/pages-config.ts` — the page registry and the access vocabulary
- **Responsibility:** own the `PageId` universe, each page's presentation (`path`, `label`, `icon`, `subgroup`, `hideFromNav`), the single `AccessLevel` type, and the grant-driven nav/route helpers. It is the only place a `PageId` literal set is declared on the frontend.
- **Files:** `admin-frontend/lib/pages-config.ts`, `admin-frontend/lib/pages.check.ts`.
- **Public surface:** `Role`, `AccessLevel`, `PageId`, `PageDef`, `NavGroup`, `PAGES`, `ROLE_DEFAULT_PAGE`, `defaultPathFor(role)`, `pageIdForPath(pathname)`, `groupsFor(grants, role)`. **Removed:** `AccessLevel = "OPERATE" | "VIEW"`, `ALL_OPERATE`, `ROLE_PAGES`, `grantsFor`, `accessLevel`, `pagesForRole`, `rolesForPath`.
- **Owns features:** FE-1, FE-3, FE-5.

### 5.2 `hooks/usePageAccess.ts` — the gate hook
- **Responsibility:** answer "what may the current user do on this page" from the server-resolved grant map, for every gate site and for the guard. One file, two exports, no state of its own.
- **Files:** `admin-frontend/hooks/usePageAccess.ts` (existing, rewritten in place), `admin-frontend/types/portal.ts`.
- **Public surface:** `usePageAccess(pageId): AccessLevel`, `useCanEdit(pageId): boolean`.
- **Owns features:** FE-4.

### 5.3 `components/auth/**` — guards and the blocker card
- **Responsibility:** keep the namespace/authentication guards, and render one explicit refusal for the arrival paths that bypass the sidebar. Not a redesign: `RoleGuard` and `RoleGroup` are **not** replaced.
- **Files:** `components/auth/RoleGuard.tsx` (modified), `components/auth/NoAccess.tsx` (new), `components/auth/AuthProvider.tsx` (modified by FE-16), `components/sidebar/SidebarNav.tsx` (modified).
- **Public surface:** `<RoleGuard>`, `<NoAccess pageId>`.
- **Owns features:** FE-5, and FE-16's provider half.

### 5.4 `server/admin/` + `app/(roles)/admin/actions.ts` — the admin data-access chain
- **Responsibility:** be the *only* path from the admin console to the backend, in the shape the other four domains already use.
- **Files:** `server/endpoints.ts` (modified), `server/admin/index.ts` (new), `app/(roles)/admin/actions.ts` (new).
- **Public surface:** `getStaff`, `enrollStaff`, `updateStaff`, `sendSetPasswordLink`, `getMatrix`, `publishMatrix`, `getOverrides`, `grantOverride`, `revokeOverride`, `getAudit` — each `(…) => Promise<APIResult<DTO>>`.
- **Owns features:** FE-7.

### 5.5 `lib/admin/` — the console's types, derived catalog and store
- **Responsibility:** hold the wire-shaped types, derive the page/role catalog from `PAGES` + `MatrixOut`, and own the client-side staging model plus every mutator's call-then-patch.
- **Files:** `lib/admin/types.ts`, `lib/admin/catalog.ts`, `lib/admin/AdminStoreContext.tsx`, `lib/admin/today.ts` (new). **Deleted:** `lib/admin/password.ts`, `lib/mock/admin-data.ts`.
- **Public surface:** `Level` (re-export), the DTO interfaces, `PAGE_GROUPS`/`PAGE_BY_ID`/`ALL_PAGES`/`TOTAL_PAGES`/`LEVEL_LABEL`/`kFor(pageId, role)`, `AdminStoreProvider`, `useAdminStore()`, `todayLabel()`.
- **Owns features:** FE-2, FE-8, FE-9, FE-10.

### 5.6 `components/admin/**` — the two admin screens
- **Responsibility:** render the directory, wizard, matrix, role view, overrides ledger, audit log and every lifecycle modal against the store, with no password surface and with the ledger living on System Config.
- **Files:** `components/admin/Shared.tsx`, `AccessEditor.tsx`, `AuditModal.tsx`, `config/{Matrix,RoleView,ConfigModals,OverridesLedger}.tsx`, `enroll/{Directory,Wizard,LifecycleModals}.tsx`, `app/(roles)/admin/{layout,enroll-user/page,system-config/page}.tsx`.
- **Public surface:** the components named above; `<ViewSwitch view onChange>` widens to three options.
- **Owns features:** FE-11, FE-12, FE-13, FE-14, FE-15.

### 5.7 The 32 gate sites
- **Responsibility:** every annotated mutating control honours its page's level.
- **Files:** the 11 files tabled in §2.
- **Public surface:** none — leaf call sites.
- **Owns features:** FE-6.

### 5.8 Registration purge (both frontends)
- **Responsibility:** remove the self-signup capability entirely, in `admin-frontend` and `client-frontend` alike.
- **Files:** the ten files tabled in §2 under *client-frontend* and the admin-frontend auth files.
- **Public surface:** `AuthContextValue` loses `signUpWithEmailPassword`; `lib/auth-api.ts` loses `postBackendRegister`.
- **Owns features:** FE-16 (and FE-17, conditionally, since the set-password landing page lives under the same `(auth)` group).

---

## 6. Features (the work units)

<!-- Ordered by ID (logical grouping), NOT execution order — sequencing lives in the
execution schedule. -->

### FE-1 — One `AccessLevel` vocabulary; `OPERATE` and the lowercase `Level` deleted (Yes — user req.)

- **Proposal ref:** § Layer 3 A-2; Goal 2; § Dead code purged (`ROLE_PAGES`, `ALL_OPERATE`/`ALL_EDIT` row); D-1.
- **Module:** §5.1 `lib/pages-config.ts` (+ the console's level display maps in §5.5/§5.6).
- **Files:** modify `admin-frontend/lib/pages-config.ts`, `admin-frontend/lib/admin/types.ts`, `admin-frontend/components/admin/Shared.tsx`, `admin-frontend/components/admin/config/{ConfigModals,Matrix}.tsx`, `admin-frontend/lib/admin/catalog.ts` (the `LEVEL_LABEL` keys only).
- **Dependencies:** none — parallel-safe. Must land before FE-2/FE-4/FE-8, which are written in the new vocabulary.

**Contract:**

```ts
// admin-frontend/lib/pages-config.ts
/** The single access vocabulary — DB enum, wire DTOs, route guard and admin console
 *  all use these three spellings. Replaces `"OPERATE" | "VIEW"` (proposal 009) and
 *  lib/admin/types.ts's lowercase `"none" | "view" | "edit"`. */
export type AccessLevel = "NONE" | "VIEW" | "EDIT";

/** What a `UserOut.grants` map looks like on the client. Absent key === "NONE". */
export type GrantMap = Partial<Record<PageId, "VIEW" | "EDIT">>;
```

```ts
// admin-frontend/lib/admin/types.ts — the console keeps calling it `Level`
import type { AccessLevel } from "@/lib/pages-config";
export type { AccessLevel };
/** Alias retained so the console's existing call sites read naturally. Same type. */
export type Level = AccessLevel;
```

```ts
// admin-frontend/components/admin/Shared.tsx — keys case-folded, values untouched
const LEVEL_STYLE: Record<Level, { bg: string; fg: string; icon: typeof Minus }> = {
  NONE: { bg: "var(--surface-container)", fg: "var(--secondary)", icon: Minus },
  VIEW: { bg: "#eef2f7",                  fg: "#3d4655",          icon: Eye },
  EDIT: { bg: "rgba(242,116,5,0.14)",     fg: "var(--primary)",   icon: Pencil },
};
const LEVEL_TITLE: Record<Level, string> = { NONE: "None", VIEW: "View", EDIT: "Edit" };
const SEG_ORDER: Level[] = ["NONE", "VIEW", "EDIT"];

export function LevelBadge(p: { level?: Level; override?: boolean; size?: number }): JSX.Element;
export function LevelSeg(p: { value?: Level; override?: boolean; onChange?: (lv: Level) => void }): JSX.Element;
```

```ts
// admin-frontend/lib/admin/catalog.ts
export const LEVEL_LABEL: Record<Level, string> = { NONE: "None", VIEW: "View", EDIT: "Edit" };
```

```ts
// admin-frontend/components/admin/config/ConfigModals.tsx — copy unchanged, keys folded
const LEVEL_OPTIONS: [Level, string][] = [
  ["NONE", "Hidden from nav, route blocked"],
  ["VIEW", "Read-only — no writes or actions"],
  ["EDIT", "Full use of the page's actions"],
];
const isReduction = (s: StagedChange) => s.to === "NONE" || (s.from === "EDIT" && s.to === "VIEW");
```

**Behavior / invariants:**
- Uppercase is the **only** spelling in the frontend. User-visible strings stay title-case ("None"/"View"/"Edit") via `LEVEL_LABEL`/`LEVEL_TITLE` — no rendered copy changes.
- `ROLE_PAGES`'s literal values become `"EDIT"` and `ALL_OPERATE` is renamed `ALL_EDIT` **in this unit**, so the file type-checks and `pages.check.ts`/`groupsFor`/the five layouts keep working while FE-4/FE-5 are not yet in. Both symbols are then deleted outright in FE-5 — the additive-then-contract ordering of §3.2.
- `Matrix.tsx`'s `LevelKey` rows and `AccessEditor`'s `!== "none"` comparisons fold with everything else. Nothing keeps a lowercase level literal.
- **Grep gate:** `grep -rn "OPERATE" admin-frontend/` returns nothing; `grep -rnE '"(none|view|edit)"' admin-frontend/lib admin-frontend/components/admin` returns nothing.

**Done when:** both greps are clean, `npx tsc --noEmit` passes, `npx tsx admin-frontend/lib/pages.check.ts` still passes (its `"OPERATE"` assertion folded to `"EDIT"`; its full rewrite is FE-3), and the three level glyphs and labels render identically to before.

---

### FE-2 — `PAGE_CATALOG` derived from `PAGES`; everything re-keyed `path` → `page_id`, `roleIdx` → role code (MANDATORY)

- **Proposal ref:** § Layer 3 A-1 (including "The `levels[]` data itself is not discarded — it is promoted"); Goal 1; D-8; D-11; § Dead code purged (`seedLevels`, `PAGE_CATALOG`'s path literals, `ROLE_IDX`).

> **Provenance — the catalog's `levels[]` is promoted, then deleted, not dropped (D-11).** `PAGE_CATALOG`'s per-page-per-role three-level matrix (`catalog.ts:23-51`) is the design handoff's real access intent, and per the user ruling in D-11 it is the **source of the DB layer's 55-row `page_access` seed** (30 `edit` / 25 `view`), re-keyed onto real `PageId`s by DB B-1's 14-row rename map, with the `PM` column ignored (D-12), `PC × mobo.post-trade-allocation` narrowed to `view` (D-10), and `PC × shared.monthly-reports` overridden back to `edit` (D-13). This unit therefore deletes the catalog's **fictional paths** and its **fragile positional `roleIdx` indexing**; the *policy* in those arrays survives the move into `page_access` and becomes enforceable for the first time. Once the migration carries the values, the frontend copy is redundant and goes with the rest of the literals. **No frontend code reads `levels[]` at runtime, before or after** — the store's levels come from `GET /api/admin/access/matrix` exactly as §7.1 specifies.
- **Module:** §5.5 `lib/admin/` (+ the matrix / role view / editor components of §5.6).
- **Files:** modify `admin-frontend/lib/admin/catalog.ts`, `admin-frontend/lib/admin/types.ts`, `admin-frontend/components/admin/AccessEditor.tsx`, `admin-frontend/components/admin/config/{Matrix,RoleView,ConfigModals}.tsx`, `admin-frontend/components/admin/enroll/{Wizard,LifecycleModals}.tsx`, `admin-frontend/lib/admin/AdminStoreContext.tsx` (signatures only — its data source is FE-9).
- **Dependencies:** FE-1.

**Contract:**

```ts
// admin-frontend/lib/admin/catalog.ts — NO path literal, NO positional level array
import { PAGES, type PageId, type Role } from "@/lib/pages-config";

/** One page as the console renders it. `path` is display-only. */
export interface CatalogPage { page_id: PageId; label: string; path: string; group: string }

/** Grouped page catalog, DERIVED from PAGES. Group = the page's `subgroup`, or "Other"
 *  for the two hideFromNav pages that carry none (mobo.recon-overview,
 *  compliance.overview). Group order follows first appearance in PAGES, which is
 *  hand-ordered already. */
export const PAGE_GROUPS: Array<[group: string, pages: CatalogPage[]]>;

export const ALL_PAGES: CatalogPage[];                 // flat, same order
export const PAGE_BY_ID: Record<PageId, CatalogPage>;
export const TOTAL_PAGES: number;                      // === Object.keys(PAGES).length

/** Matrix / staging cell key, keyed by role CODE — `ROLES` order stops being load-bearing. */
export const kFor = (pageId: PageId, role: Role): string => `${pageId}|${role}`;

/** Fallback role order, used only until the first MatrixOut read resolves so the rails
 *  render. Display names and user counts come from MatrixOut.roles, never from here. */
export const ROLE_CODES: readonly Role[] = ["RM", "MOBO", "PM", "PC", "COMPLIANCE", "ADMIN"];

// DELETED: PAGE_CATALOG's 17 hand-written entries (their `levels[]` policy having first
//          been promoted into the DB layer's 55-row page_access seed — D-11), ROLE_IDX,
//          PAGE_BY_PATH, seedLevels(), and the ROLES {code,name}[] array.
```

```ts
// admin-frontend/lib/admin/types.ts
export interface StagedChange { page_id: PageId; label: string; role: Role; from: Level; to: Level }
// PageDef ({name, path, levels[]}) and FlatPage are deleted — CatalogPage replaces both.
```

```ts
// admin-frontend/components/admin/config/Matrix.tsx
export interface CellPayload { page_id: PageId; label: string; path: string; role: Role }

/** ADMIN × the admin pages stays locked — it is the only route back into the permission
 *  model. Re-expressed against the surviving keys: the old test was
 *  `group === "Administration" && roleIdx === 5`, and neither the group name nor the
 *  array index survives derivation from PAGES. */
const isLocked = (page_id: PageId, role: Role) => role === "ADMIN" && page_id.startsWith("admin.");
```

```ts
// admin-frontend/components/admin/AccessEditor.tsx — pageId-keyed, otherwise unchanged
export function AccessEditor(props: {
  valueFor: (pageId: PageId) => Level;
  defaultFor?: ((pageId: PageId) => Level) | null;
  onSet: (pageId: PageId, level: Level) => void;
  openGroups: string[];
  onToggleGroup: (group: string) => void;
  stagedOn?: (pageId: PageId) => boolean;
}): JSX.Element;
```

**Behavior / invariants:**
- **Which page list is rendered — division of authority, settled by §4.2 (§7.1's Frontend row).** The local `PAGES` registry is the authority on which `PageId`s **exist**, and is the pre-load fallback for labels, paths and icons, which the server does not own. `MatrixOut.pages` is the authority on what the matrix **displays and in what order**. So: `PAGE_GROUPS` (derived from `PAGES`) is what `pages.check.ts` asserts against and what the wizard's Access step and the two override page-pickers enumerate; the **matrix and role view render `MatrixOut.pages`** verbatim — never re-sorted, never re-labelled — and the store falls back to `PAGE_GROUPS` only until the first read resolves, so the table is never empty. **A page present in one and absent from the other is a drift bug**, caught by A-1's check (FE-3).
- **No `roleIdx` anywhere.** Every signature that took `roleIdx: number` takes `role: Role`. `RoleView`'s rail iterates the store's role list; `copyRole(from, to)` / `resetRole(role)` take codes. `Matrix`'s column headers read `user_count` off the store's role list instead of counting the directory client-side.
- **Role display names come from `MatrixOut.roles[].name`.** The old hardcoded `ROLES` names disagreed with `pages-config`'s `ROLE_NAV` ("Portfolio Controller" vs "Portfolio Commander"); deriving from the server removes the discrepancy rather than picking a local winner.
- **Overrides identify their page by `page_id`** plus the server's `page_label`/`page_path`. `ManageOverridesModal`'s already-taken filter compares `page_id`, not `path`.
- **Grep gate:** `grep -nE '"/(rm|pc|mobo|compliance|admin)/' admin-frontend/lib/admin/catalog.ts` returns nothing; `grep -rn "ROLE_IDX\|seedLevels\|PAGE_BY_PATH\|roleIdx" admin-frontend/` returns nothing.

**Done when:** both greps are clean, the matrix renders 16 pages × 6 roles (not 17 × 6), every cell / staged / override / wizard key is a `page_id`, and `TOTAL_PAGES === Object.keys(PAGES).length`.

---

### FE-3 — `pages.check.ts` rewritten against the new registry (Yes)

- **Proposal ref:** § Layer 3 A-1 (last paragraph); § "Kept, with a reason" (`lib/pages.check.ts`); § Execution step 3.
- **Module:** §5.1.
- **Files:** modify `admin-frontend/lib/pages.check.ts`.
- **Dependencies:** FE-2 (the derived catalog it asserts over), FE-5 (the helpers whose removal invalidates its current assertions), FE-7 (the `MatrixOut` type behind its page-set assertion).

**Contract:**

```ts
// admin-frontend/lib/pages.check.ts — run: `npx tsx admin-frontend/lib/pages.check.ts`
// Plain node:assert. NOT a Vitest suite — kept in that form deliberately.
import { strict as assert } from "node:assert";
import {
  PAGES, ROLE_DEFAULT_PAGE, defaultPathFor, pageIdForPath, groupsFor,
  type GrantMap, type PageId,
} from "./pages-config";
import { ALL_PAGES, PAGE_GROUPS, TOTAL_PAGES, kFor } from "./admin/catalog";
import type { MatrixOut } from "../server/admin";

// A-1: the derived catalog and PAGES are the same set — the matrix can neither describe
// a page that does not exist nor fail to reach one that does.
assert.deepEqual(ALL_PAGES.map((p) => p.page_id).sort(), (Object.keys(PAGES) as PageId[]).sort());
assert.equal(TOTAL_PAGES, Object.keys(PAGES).length);
assert.equal(PAGE_GROUPS.flatMap(([, ps]) => ps).length, TOTAL_PAGES);   // no page in two groups

// A-1: the SERVER's page set must equal the local one. Asserted against a committed
// fixture of MatrixOut["pages"] at the foot of this file — this script makes NO network
// call. The live equality is §8's FE-7 goal plus the proposal's phase-5 smoke.
const MATRIX_PAGES_FIXTURE: MatrixOut["pages"] = [ /* one entry per PageId */ ];
assert.deepEqual(
  MATRIX_PAGES_FIXTURE.map((p) => p.page_id).sort(),
  (Object.keys(PAGES) as PageId[]).sort(),
  "server MatrixOut.pages and local PAGES must be the same set",
);

// D-7's default-deny, restated for the grant model: an empty grant map yields no nav.
assert.deepEqual(groupsFor({}, "ADMIN"), []);
assert.deepEqual(groupsFor({}, "BOGUS"), []);
for (const bogus of ["BOGUS", "", "admin" /* case matters */, "undefined"]) {
  assert.equal(defaultPathFor(bogus), null);
}

// Grant-driven nav: one parent per role, hideFromNav never listed, a NONE page absent.
const allEdit: GrantMap = Object.fromEntries(
  (Object.keys(PAGES) as PageId[]).map((id) => [id, "EDIT"]),
);
assert.equal(groupsFor(allEdit, "ADMIN").length, 1, "ADMIN must have exactly one nav group");
assert.ok(!groupsFor(allEdit, "ADMIN")[0].pages.some((p) => p.href === "/mobo/recon-overview"));
{
  const reduced: GrantMap = { ...allEdit };
  delete reduced["pc.allocation-matrix"];
  assert.ok(!groupsFor(reduced, "PC")[0].pages.some((p) => p.href === "/pc/allocation-matrix"));
}
assert.deepEqual(groupsFor(allEdit, "PM"), []);      // no ROLE_NAV entry → zero groups

// Path resolution — the surviving half of the old rolesForPath.
assert.equal(pageIdForPath("/rm/client-info"),           "rm.client-info");
assert.equal(pageIdForPath("/rm/client-info/some-uuid"), "rm.client-info");  // prefix rule (010 A-6/D-6)
assert.equal(pageIdForPath("/rm/requests/REQ-1"),        "rm.request-tickets");
assert.equal(pageIdForPath("/monthly-reports"),          "shared.monthly-reports");
assert.equal(pageIdForPath("/nope"),                     null);

// Every page has a default name; every role's default page is a real PageId.
for (const p of Object.values(PAGES)) assert.ok(p.label && p.icon, `${p.id} missing label/icon`);
for (const [role, id] of Object.entries(ROLE_DEFAULT_PAGE)) {
  if (id) assert.ok(id in PAGES, `${role}'s default page must be a known PageId`);
}

// Cell keys are role-code keyed and collision-free.
assert.equal(kFor("pc.allocation-matrix", "PC"), "pc.allocation-matrix|PC");
assert.notEqual(kFor("pc.allocation-matrix", "PC"), kFor("pc.allocation-matrix", "PM"));

console.log("pages.check.ts: OK");
```

**Behavior / invariants:**
- Assertions deleted because their symbols are: the `ROLE_PAGES.ADMIN[id] === "OPERATE"` check (`:17`), the `pagesForRole(bogus)` / `accessLevel(bogus, …)` default-deny pair (`:10-11`), and the entire `rolesForPath(...)` role-set parity block (`:26-36`). The *intent* of each survives above in grant-driven form.
- Stays dependency-free (`node:assert` + local imports) and side-effect-free apart from its `console.log`, and makes **no network call**.
- Exits non-zero on the first failure — that is what makes it usable as a gate.

**Done when:** `npx tsx admin-frontend/lib/pages.check.ts` prints `pages.check.ts: OK`, and deliberately renaming one `PageId` in `PAGES` makes it exit non-zero.

---

### FE-4 — `PortalUser.grants`; `usePageAccess` rewritten in place, `useCanEdit` added (Yes — user req.)

- **Proposal ref:** § Layer 3 A-4 (the hook block); § B row 1; § "Rewritten in place rather than duplicated"; §4.1 `UserOut.grants`.
- **Module:** §5.2.
- **Files:** modify `admin-frontend/hooks/usePageAccess.ts`, `admin-frontend/types/portal.ts`.
- **Dependencies:** FE-1. Must land before FE-5 and FE-6.

**Contract:**

```ts
// admin-frontend/types/portal.ts
import type { GrantMap } from "@/lib/pages-config";

export type PortalUser = {
  firebase_uid: string;
  email: string | null;
  name: string | null;
  role: "ADMIN" | "MOBO" | "RM" | "PM" | "PC" | "COMPLIANCE";
  /** Server-resolved effective access per §4.1 `UserOut.grants`; an absent key is NONE.
   *  Optional in the type only so a not-yet-deployed backend does not crash the client —
   *  the hook's `?? "NONE"` makes a missing map grant nothing. */
  grants?: GrantMap;
};
```

```ts
// admin-frontend/hooks/usePageAccess.ts — EXISTING FILE, rewritten in place.
// Written in proposal 009 as the forward declaration for exactly this, and dead ever
// since: zero consumers. NOT re-created elsewhere — an earlier draft of proposal 019
// added components/auth/usePageAccess.ts beside it, which would have shipped two hooks
// of the same name and left the unused one rotting.
"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import type { AccessLevel, PageId } from "@/lib/pages-config";

/**
 * The current user's effective access to one page, as resolved by the backend
 * (unexpired override, else the role's standing level) and delivered on `UserOut.grants`.
 * - "EDIT" — may use the page's mutating controls.
 * - "VIEW" — read-only; the page's mutating controls are disabled.
 * - "NONE" — no grant: absent from the sidebar, and direct arrival renders <NoAccess>.
 * Default-deny: no user, no grant map, or an absent key all resolve to "NONE".
 */
export function usePageAccess(pageId: PageId): AccessLevel {
  const { portalUser } = useAuth();
  return portalUser?.grants?.[pageId] ?? "NONE";
}

/** `usePageAccess(id) === "EDIT"`, named once so 32 call sites cannot typo the comparison. */
export function useCanEdit(pageId: PageId): boolean {
  return usePageAccess(pageId) === "EDIT";
}
```

**Behavior / invariants:**
- The return type loses `| null`: `"NONE"` is the single spelling for "no grant", and no caller may branch on `null`.
- The docstring's `OPERATE` wording is gone; the three bullets name the three levels and the default-deny.
- No `accessLevel` import (FE-5 deletes it) and no import from `lib/admin/**` — the console's types are not on the gate path.
- `postBackendLogin` already casts the response to `PortalUser` (`lib/auth-api.ts:53`), so `grants` arrives with **no change to the fetch path**; only the type widens.
- `client-frontend/types/portal.ts` is **not** changed: a client's `grants` is always `{}` and nothing in that portal reads it (§Non-Goals — clients have no page matrix).
- **Zero-consumer claim, verified before rewriting:** `grep -rn "usePageAccess\|useCanEdit" admin-frontend client-frontend --include=*.ts --include=*.tsx` returned exactly one line — `admin-frontend/hooks/usePageAccess.ts:12`, the definition itself. It has no consumers; it is dead code today.

**Done when:** the file has exactly those two exports, no `| null`, no `accessLevel` import; `npx tsc --noEmit` passes; a grant map omitting a page yields `"NONE"`, and a `"VIEW"` grant yields `useCanEdit === false`.

---

### FE-5 — Grant-driven sidebar and guard; one shared `<NoAccess>`; `ROLE_PAGES` and friends deleted (Yes — user req.)

- **Proposal ref:** § Layer 3 A-4 (the `RoleGuard` paragraph and "What a `NONE` grant does", settled Q-4); Q-4; § Dead code purged (`ROLE_PAGES`, `ALL_OPERATE`/`ALL_EDIT`, `accessLevel()`, `pagesForRole()`); § Objectives ("any hardcoded `allowedRoles` literal — returns nothing").
- **Module:** §5.1 + §5.3.
- **Files:** create `admin-frontend/components/auth/NoAccess.tsx`; modify `admin-frontend/lib/pages-config.ts`, `admin-frontend/components/auth/RoleGuard.tsx`, `admin-frontend/components/sidebar/SidebarNav.tsx`, `admin-frontend/app/page.tsx`, and the five namespace layouts `admin-frontend/app/(roles)/{rm,mobo,pc,compliance,admin}/layout.tsx`.
- **Dependencies:** FE-4 (needs `grants` on `PortalUser`), FE-1.

**Contract:**

```ts
// admin-frontend/lib/pages-config.ts — grant-driven replacements
/** The page a pathname belongs to, by exact match or prefix. This is the surviving half
 *  of the old `rolesForPath` — the half that reads PAGES rather than ROLE_PAGES. */
export function pageIdForPath(pathname: string): PageId | null {
  const page = Object.values(PAGES).find(
    (p) => pathname === p.path || pathname.startsWith(`${p.path}/`),
  );
  return page ? page.id : null;
}

/** One nav parent per role, built from the caller's OWN grants. A page the grant map
 *  omits (i.e. NONE) is simply not listed — that is the primary effect of NONE (Q-4).
 *  A role with no ROLE_NAV entry, or an empty grant set, renders no groups at all. */
export function groupsFor(grants: GrantMap, role: string): NavGroup[];

/** Unchanged signature and body — reads ROLE_DEFAULT_PAGE + PAGES only. */
export function defaultPathFor(role: string): string | null;

// DELETED: ALL_OPERATE / ALL_EDIT, ROLE_PAGES, grantsFor(), accessLevel(),
//          pagesForRole(), rolesForPath().
// KEPT:    Role, AccessLevel, GrantMap, PageId, PageDef, NavGroup, PAGES, ROLE_NAV,
//          ROLE_DEFAULT_PAGE, defaultPathFor, groupsFor, pageIdForPath.
```

```tsx
// admin-frontend/components/auth/NoAccess.tsx — the ONLY blocker card; no per-page work
"use client";

import Link from "next/link";
import { ShieldAlert } from "@/lib/icons";
import { useAuth } from "@/components/auth/AuthProvider";
import { PAGES, defaultPathFor, type PageId } from "@/lib/pages-config";

/** Renders — it does NOT redirect. A silent bounce from a URL a colleague just sent
 *  reads as a broken link and generates a support question; a named refusal answers it. */
export function NoAccess({ pageId }: { pageId: PageId }) {
  const { portalUser } = useAuth();
  const home = portalUser ? defaultPathFor(portalUser.role) : null;
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3.5 p-6 text-center">
      <ShieldAlert size={28} strokeWidth={1.75} className="text-secondary" />
      <h1 className="text-[20px] font-bold text-on-surface">{PAGES[pageId].label}</h1>
      <p className="max-w-[420px] text-[13px] leading-[1.5] text-secondary">
        You do not have access to this page. Ask an administrator if you need it.
      </p>
      {home && (
        <Link href={home} className="text-[13px] font-semibold text-primary hover:underline">
          Go to your default page
        </Link>
      )}
    </div>
  );
}
```

```tsx
// admin-frontend/components/auth/RoleGuard.tsx — MODIFIED, not replaced. Same component
// shape, same loading/redirect behaviour; only the PREDICATE it is handed changes, from a
// role-membership test to a grant test (proposal A-4: "the namespace guards change shape").
interface RoleGuardProps {
  children: React.ReactNode;
  /** The namespace this layout owns, e.g. "/rm". The guard asks "do I hold any grant under
   *  this prefix" — replacing `allowedRoles`, which is unanswerable in the browser: grants
   *  live in the DB, so the frontend knows only its OWN user's grants, never another
   *  role's, and any client-computed allowedRoles would be a guess. */
  prefix: string;
  redirectTo?: string;   // default "/"
}
// Resolution order:
//   1. loading || backendSyncing                      → spinner   (unchanged)
//   2. portalUser == null                             → redirect  (unchanged)
//   3. pageIdForPath(pathname) is a PageId AND
//      portalUser.grants?.[pageId] is absent          → <NoAccess pageId />  (NO redirect)
//   4. no grant on any PageId whose path starts with `prefix`
//                                                     → redirect to `redirectTo`
//   5. otherwise                                      → children
```

```tsx
// the five namespace layouts, e.g. admin-frontend/app/(roles)/admin/layout.tsx
<RoleGuard prefix="/admin">          {/* was: allowedRoles={rolesForPath("/admin/enroll-user")} */}
  <AdminStoreProvider …>{children}</AdminStoreProvider>
</RoleGuard>
```

```tsx
// admin-frontend/components/sidebar/SidebarNav.tsx
const { portalUser } = useAuth();
const groups = groupsFor(portalUser?.grants ?? {}, portalUser?.role ?? "");
```

**Behavior / invariants:**
- **A `NONE` grant's primary effect is invisibility.** `groupsFor` builds the sidebar from the grant set, so the page is not listed — no link, no hint it exists. `<NoAccess>` covers only the arrival paths that bypass the sidebar: a typed or pasted URL, a stale bookmark, a deep link, an in-app cross-link from a page the user does hold.
- **Both behaviours are exercised on day one, not by a later publish.** The D-11 seed leaves many `NONE` cells: `PM` holds nothing at all (D-12, so a PM login renders zero nav groups — already `groupsFor`'s documented zero-group case), RM has no row for the three MOBO pages, `rm.request-tickets` and `mobo.commission-tracking` are absent for every role but their owner and ADMIN, and the two `admin.*` pages are ADMIN-only. So sidebar omission and the `<NoAccess>` card are live from the first login after the migration.
- `<NoAccess>` **renders**; it never calls `router.replace`. Exactly one instance exists, mounted by the guard.
- **`RoleGuard` and `RoleGroup` are not replaced.** `RoleGroup` is untouched — it consumes whatever `groupsFor` returns. `RoleGuard` keeps its component shape, its spinner and its redirect-when-unauthenticated; only the predicate it is handed changes, from a role-membership test to a grant test, plus the one new `<NoAccess>` branch.
- **Cross-role `VIEW` grants list under the role's own single nav parent — intended, not a problem to solve (D-15).** The seed gives COMPLIANCE `view` on nine pages outside its domain and PC `view` on the MOBO pages, so a role's nav children now span domains. `groupsFor` + `RoleGroup` already produce exactly the right thing with **no code change and no new nav group**: one parent labelled with the role's name, children grouped under their `subgroup` headers, so a Compliance officer's parent reads "Client Management / Trade Management / …". Proposal 009's "never a mix of other roles' domains" rule is **explicitly superseded** — it described an earlier business requirement, and cross-role read access is the current one. Do not add an "Oversight" group or any second parent, and do not treat the mixing as an open question.
- `app/page.tsx` keeps `defaultPathFor(portalUser.role)`, so a user whose grants are empty falls into the existing "authenticated but no destination" path (clear Firebase caches → `/login`) rather than a new dead end.
- **Copy is fixed by the proposal** and used verbatim: "You do not have access to this page. Ask an administrator if you need it." plus a link to the default page. The card's *layout* (icon, page label, sentence, link, vertically centred) is chosen here — the proposal does not pin it — and matches the existing centred guard states in `AuthGuard`/`RoleGuard`. `ShieldAlert` is already exported from `lib/icons`.
- **`rolesForPath` splits; it does not survive intact (settled — proposal A-4, "The namespace guards change shape").** Two independent reasons, both now in the proposal's text: its body iterates `ROLE_PAGES`, which is deleted, **and** the question it answers — "which roles can reach this path" — is no longer answerable in the browser at all, because grants live in the DB and the frontend knows only *its own* user's grants, never another role's. Any client-computed `allowedRoles` would be a guess. So the path→`PageId` half survives as `pageIdForPath` (pure, local, used by both the guard and `<NoAccess>`) and the role-set half is deleted with `ROLE_PAGES`; § Dead code purged lists that half as deleted with `rolesForPath` in its grep column. Per-page precision comes from `usePageAccess`, which is where sub-page granularity belongs.
- **Grep gate:** `grep -rn "ROLE_PAGES\|ALL_OPERATE\|ALL_EDIT\|accessLevel(\|pagesForRole\|rolesForPath" admin-frontend/` returns nothing; `grep -rn "allowedRoles" admin-frontend/` returns nothing.

**Done when:** the greps are clean; a PC user whose grants omit `pc.allocation-matrix` sees no such sidebar link and gets `<NoAccess>` (not a redirect) at `/pc/allocation-matrix`; an unauthenticated user still redirects to `/login`.

---

### FE-6 — All 32 gate marker sites honour their page's level (Yes — user req.)

- **Proposal ref:** § Layer 3 A-4 (the marker table and the `disabled`/hidden rule); § B row 2; Goal 5; § Execution step 3.
- **Module:** §5.7.
- **Files:** modify the 11 files tabled in §2 — `components/rm/{OnboardingModal,RequestTickets,ContactLog,SubscriptionAccordion,TransactionDetailModal}.tsx`, `components/compliance/review/{CrDetailPanel,ObDetailPanel}.tsx`, `app/(roles)/mobo/{trade-reconciliation,commission-tracking,recon-overview}/page.tsx`, `app/(roles)/rm/model-subscription/page.tsx`.
- **Dependencies:** FE-4.

**Contract:**

```tsx
// The shape at ALL 32 sites (D-14): conditional render, NOT a `disabled` prop.
// `useCanEdit` is called in the component that OWNS the control — no component gains a
// new prop, because the hook reads context.
const canEdit = useCanEdit("rm.model-subscription");   // the file's gating PageId, per the table below
…
{/* View/Edit Gate Function */}
{canEdit && <Button icon={Plus} onClick={…}>Add allotment</Button>}
```

```tsx
// Where a container's ONLY children are gated controls, the container goes with them —
// no empty shell, no orphan divider, no stray padding. E.g. SubscriptionAccordion's
// action row (:221-224), whose two Buttons are its entire content:
{/* View/Edit Gate Function */}
{canEdit && (
  <div className="flex gap-2.5 border-t border-outline-variant px-4 py-3">
    <Button icon={Plus} onClick={…}>Add allotment</Button>
    <Button variant="secondary" icon={ArrowDownToLine} onClick={…}>Add redemption</Button>
  </div>
)}
```

```tsx
// Where a gated control sits BESIDE surviving ones, only it goes. E.g. a modal footer
// that keeps its Cancel/Close but loses its confirm:
foot={
  <>
    <Button variant="secondary" onClick={onClose}>Cancel</Button>
    {/* View/Edit Gate Function */}
    {canEdit && <Button icon={Check} disabled={!valid} onClick={() => valid && save()}>Save log</Button>}
  </>
}
```

Per-file gating `PageId` — every one resolved from the file's importing route, not guessed:

| File | Sites | Call |
|---|---|---|
| `components/rm/OnboardingModal.tsx` | 7 | `useCanEdit("rm.onboarding-renewal")` |
| `components/rm/RequestTickets.tsx` | 4 | `useCanEdit("rm.request-tickets")` |
| `components/rm/ContactLog.tsx` | 4 | `useCanEdit("rm.client-info")` |
| `components/compliance/review/CrDetailPanel.tsx` | 4 | `useCanEdit("compliance.review")` |
| `app/(roles)/mobo/trade-reconciliation/page.tsx` | 4 | `useCanEdit("mobo.trade-reconciliation")` |
| `components/compliance/review/ObDetailPanel.tsx` | 3 | `useCanEdit("compliance.review")` |
| `app/(roles)/mobo/commission-tracking/page.tsx` | 2 | `useCanEdit("mobo.commission-tracking")` |
| `components/rm/SubscriptionAccordion.tsx` | 1 | `useCanEdit("rm.model-subscription")` |
| `components/rm/TransactionDetailModal.tsx` | 1 | `useCanEdit("rm.model-subscription")` |
| `app/(roles)/mobo/recon-overview/page.tsx` | 1 | `useCanEdit("mobo.recon-overview")` |
| `app/(roles)/rm/model-subscription/page.tsx` | 1 | `useCanEdit("rm.model-subscription")` |

**Behavior / invariants:**
- **Every site is `{canEdit && …}` — hidden, never disabled (D-14).** A greyed-out button implies it is *conditionally* operable: the user assumes some selection, record or state would light it up, hunts for that condition, and eventually files a question. An absent control makes no such promise. This reverses the earlier draft's "disabled preferred" rule; no site keeps a `disabled={!canEdit}`.
- **Hiding is cosmetic, not the boundary.** Hiding and disabling are equally cosmetic — `require_action` on the endpoint is what actually refuses the write (§7's Backend obligation, D-1). This unit exists so the UI does not offer what the API will refuse, not to enforce anything.
- **Containers collapse with their contents.** Where a container's only children are gated controls — a toolbar row, a table actions cell, a modal footer's action span — the container is hidden too, so no empty shell, stray divider or orphan padding is left. Where a gated control sits beside surviving ones, only it goes.
- **The marker count is invariant at 32.** The comment stays exactly as written; it is the anchor a reviewer greps for. No marker is added, removed or reworded. Each marker must sit in a **conditional-render** position — a `disabled` prop next to a marker is a defect, not an alternative.
- **Existing `disabled` predicates survive inside the conditional.** `ContactLog.tsx:147`'s `disabled={!valid}` stays as the control's own validity gate, wrapped by `{canEdit && …}` — the two are different questions ("may this user write" vs. "is this form complete") and neither is folded into the other. `recon-overview/page.tsx:201`'s Sign-off button keeps its unconditional `disabled` (zero open breaks) and is additionally hidden at `VIEW`.
- **No component gains a prop.** `TransactionDetailModal` and `SubscriptionAccordion` each call the hook themselves even though both render under one page — the hook is context-only and cheap.
- **A `VIEW` user fires no call that will 403.** That is the point of the pairing with the Backend layer's level→action gate (§7).
- **`VIEW` is the day-one expected case, not an edge case (D-11 seed: 55 rows, 30 `edit` / 25 `view`).** The seeded matrix is deliberately *not* "everything EDIT": COMPLIANCE holds `view` on ~10 pages including every RM page and both MOBO recon pages, PC holds `view` on all three MOBO pages, RM and MOBO hold `view` on PC pages, and `shared.monthly-reports` is `view` for RM and MOBO (PC keeps `edit`, D-13). So from the first login after the migration, a COMPLIANCE user opening `/rm/client-info`, and a PC user opening `/mobo/post-trade-allocation` (D-10), **must** see these controls absent. This unit is live on day one, not dormant — §8's goals treat `VIEW` as the primary path.
- **Grep gate:** `grep -ro "View/Edit Gate Function" admin-frontend --include=*.tsx | wc -l` → `32`; for each of the 11 files `grep -c "canEdit" <file>` ≥ 1; and `grep -rn -A2 "View/Edit Gate Function" admin-frontend --include=*.tsx | grep "disabled={!canEdit}"` returns nothing (D-14).

**Done when:** the count is still 32, every marker's enclosing JSX references `canEdit` in a conditional-render position, and with a `"VIEW"` grant on each of the six affected pages every mutating control in these 11 files is **absent from the rendered tree** — along with any container the gating emptied.

---

### FE-7 — `ENDPOINTS.ADMIN` + `server/admin/index.ts` + the route-local action wrapper (MANDATORY)

- **Proposal ref:** § Layer 3 A-3 (first half); § Layer 3 preamble ("Canonical data-flow chain … the admin pages are the only feature that skips it entirely"); §4.1 routes 2–5; Backend § D route list.
- **Module:** §5.4.
- **Files:** create `admin-frontend/server/admin/index.ts`, `admin-frontend/app/(roles)/admin/actions.ts`; modify `admin-frontend/server/endpoints.ts`.
- **Dependencies:** FE-1 (the `AccessLevel` type the DTOs use). Parallel-safe otherwise; must land before FE-9/FE-10.

**Contract:**

```ts
// admin-frontend/server/endpoints.ts — one new group, same shape as PC/RM/MOBO/COMPLIANCE
const ADMIN = "/api/admin";

export const ENDPOINTS = {
  // … PC, RM, MOBO, COMPLIANCE unchanged …
  ADMIN: {
    STAFF:               `${ADMIN}/staff`,
    STAFF_MEMBER:        (uid: string) => `${ADMIN}/staff/${encodeURIComponent(uid)}`,
    STAFF_SET_PW_LINK:   (uid: string) => `${ADMIN}/staff/${encodeURIComponent(uid)}/set-password-link`,
    ACCESS_MATRIX:       `${ADMIN}/access/matrix`,
    ACCESS_OVERRIDES:    `${ADMIN}/access/overrides`,
    ACCESS_OVERRIDE:     (id: string) => `${ADMIN}/access/overrides/${encodeURIComponent(id)}`,
    AUDIT:               `${ADMIN}/audit`,
  },
} as const;
```

```ts
// admin-frontend/server/admin/index.ts — NEW. Mirrors server/pc/index.ts exactly:
// "use server", one exported async fn per §4.1 route, each returning APIResult<DTO>
// from apiClient. Imports ONLY api-client + endpoints + its own DTO types.
"use server";

import { apiClient, type APIResult } from "@/server/api-client";
import { ENDPOINTS } from "@/server/endpoints";
import type { AccessLevel, PageId, Role } from "@/lib/pages-config";

export type { APIResult };

/* ---- DTOs: verbatim §4.1, snake_case preserved ------------------------- */
export type StaffStatus = "ACTIVE" | "INITIATED" | "DEACTIVATED";

export interface StaffOut {
  firebase_uid: string;
  email: string | null;
  name: string | null;
  role: Role;
  department: string | null;
  phone_number: string | null;
  status: StaffStatus;
  last_sign_in_at: string | null;
  override_count: number;
  client_count: number | null;        // RM only; null for every other role
  open_ticket_count: number | null;   // RM only; null for every other role
}

export interface StaffEnrollIn {
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  phone_number?: string | null;
  department?: string | null;
  start_date?: string | null;
  address?: string | null;
  send_link: boolean;
  overrides?: Array<{ page_id: PageId; level: AccessLevel; reason: string; expires_at: string | null }>;
}

export interface StaffCreatedOut {
  firebase_uid: string; email: string; role: Role;
  status: StaffStatus; link_sent: boolean; override_count: number;
}

export interface StaffUpdateIn {
  role?: Role; name?: string; email?: string; phone_number?: string | null;
  department?: string | null;
  status?: "ACTIVE" | "DEACTIVATED";
  deactivate_reason?: string | null;
  reassign_book_to?: string | null;
}

export interface LinkSentOut { link_sent: boolean }

export interface MatrixOut {
  pages: Array<{ page_id: PageId; group: string; label: string; path: string }>;
  roles: Array<{ code: Role; name: string; user_count: number }>;
  levels: Array<{ page_id: PageId; role: Role; level: "VIEW" | "EDIT" }>;
  published: { at: string; by: string } | null;
}

export interface MatrixPublishIn {
  changes: Array<{ page_id: PageId; role: Role; level: AccessLevel }>;
  note?: string | null;
  /** §4.1: the request MUST carry this, matching the server's current MAX(published_at).
   *  `null` is the legitimate value for a matrix that has never been published. */
  base_published_at: string | null;
}

export interface OverrideOut {
  id: string;
  firebase_uid: string; user_name: string; user_role: Role;
  page_id: PageId; page_label: string; page_path: string;
  role_default: AccessLevel;
  level: AccessLevel;
  reason: string;
  granted_by: string;
  expires_at: string | null;
  expiring_soon: boolean;
}

export interface OverrideIn {
  firebase_uid: string; page_id: PageId; level: AccessLevel;
  reason: string; expires_at: string | null;
}

export interface AuditOut { id: string; at: string; actor_name: string; event: string; detail: string }

/* ---- one function per route -------------------------------------------- */
export async function getStaff(): Promise<APIResult<StaffOut[]>> {
  return apiClient<StaffOut[]>(ENDPOINTS.ADMIN.STAFF);
}

export async function enrollStaff(body: StaffEnrollIn): Promise<APIResult<StaffCreatedOut>> {
  return apiClient<StaffCreatedOut>(ENDPOINTS.ADMIN.STAFF, {
    method: "POST", body: JSON.stringify(body),
  });
}

export async function updateStaff(uid: string, body: StaffUpdateIn): Promise<APIResult<StaffOut>> {
  return apiClient<StaffOut>(ENDPOINTS.ADMIN.STAFF_MEMBER(uid), {
    method: "PATCH", body: JSON.stringify(body),
  });
}

export async function sendSetPasswordLink(uid: string): Promise<APIResult<LinkSentOut>> {
  return apiClient<LinkSentOut>(ENDPOINTS.ADMIN.STAFF_SET_PW_LINK(uid), { method: "POST" });
}

export async function getMatrix(): Promise<APIResult<MatrixOut>> {
  return apiClient<MatrixOut>(ENDPOINTS.ADMIN.ACCESS_MATRIX);
}

export async function publishMatrix(body: MatrixPublishIn): Promise<APIResult<MatrixOut>> {
  return apiClient<MatrixOut>(ENDPOINTS.ADMIN.ACCESS_MATRIX, {
    method: "PUT", body: JSON.stringify(body),
  });
}

export async function getOverrides(): Promise<APIResult<OverrideOut[]>> {
  return apiClient<OverrideOut[]>(ENDPOINTS.ADMIN.ACCESS_OVERRIDES);
}

export async function grantOverride(body: OverrideIn): Promise<APIResult<OverrideOut>> {
  return apiClient<OverrideOut>(ENDPOINTS.ADMIN.ACCESS_OVERRIDES, {
    method: "POST", body: JSON.stringify(body),
  });
}

export async function revokeOverride(id: string): Promise<APIResult<void>> {
  return apiClient<void>(ENDPOINTS.ADMIN.ACCESS_OVERRIDE(id), { method: "DELETE" });
}

export async function getAudit(params?: { limit?: number; before?: string }): Promise<APIResult<AuditOut[]>> {
  const q = new URLSearchParams();
  if (params?.limit  != null) q.set("limit", String(params.limit));
  if (params?.before != null) q.set("before", params.before);
  const qs = q.toString();
  return apiClient<AuditOut[]>(qs ? `${ENDPOINTS.ADMIN.AUDIT}?${qs}` : ENDPOINTS.ADMIN.AUDIT);
}
```

```ts
// admin-frontend/app/(roles)/admin/actions.ts — NEW. Route-local logging wrapper, the
// same shape as app/(roles)/pc/model-management/actions.ts: re-export each server/admin
// function through logger + try/catch, so a thrown error never crosses to the store.
"use server";

import { getStaff as _getStaff, /* … one alias per export … */ type APIResult } from "@/server/admin";
import { logger } from "@/lib/logger";

function toErrorResult(error: unknown): { success: false; error: string; code: string } {
  return { success: false, error: error instanceof Error ? error.message : String(error), code: "ACTION_ERROR" };
}

export async function getStaff(): Promise<APIResult<StaffOut[]>> {
  try {
    logger.log("🔄 Fetching admin staff…");
    const response = await _getStaff();
    logger.json("✅ Get staff response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching admin staff:", { error });
    return toErrorResult(error);
  }
}
// … the same nine-line wrapper per function …
```

**Behavior / invariants:**
- **The chain is matched, not invented.** `apiClient` already reads the `id_token` cookie and sets `Authorization: Bearer` (`server/api-client.ts:13-23`), returns `{success:false, code:"UNAUTHORIZED"}` on 401 and `code: "HTTP_<status>"` otherwise. Nothing new is added to `api-client.ts`.
- **HTTP 409 is observable** as `code === "HTTP_409"` with `error` carrying the first 200 chars of the body — which is how FE-10 detects `matrix_changed_since_read` and how FE-15 detects the two handover conflicts. No new envelope is introduced for it.
- **`base_published_at` is a required field of `MatrixPublishIn`** (not optional), because §4.2 states the FE always sends it. `null` is the legitimate value when `MatrixOut.published` is `null`.
- **DTO field names are the wire's**, verbatim. No mapping layer, no camelCase.
- `server/admin/index.ts` imports no component, no hook and no `lib/admin/**` symbol other than the `pages-config` types. `revokeOverride` types as `APIResult<void>` for the 204.
- **File placement, chosen where the proposal is silent:** the proposal names only `server/admin/index.ts`. The route-local `app/(roles)/admin/actions.ts` is added because all four existing domains reach their `server/<domain>` module through exactly such a wrapper (`app/(roles)/pc/model-management/actions.ts`), and skipping it would make the admin pages the only feature that calls `server/*` directly — the same inconsistency A-3 exists to remove. The store imports the wrapper, not `server/admin` directly. **No `hooks/api/useAdmin*.ts` file is added:** `AdminStoreContext` already is the shared store the two pages read, so a hook layer beside it would be a second source of the same state.

**Done when:** `ENDPOINTS.ADMIN` covers all ten §7.1 admin routes and no other; `server/admin/index.ts` exports exactly the ten functions and the DTOs above; `npx tsc --noEmit` passes; a `grep -rn "fetch(" admin-frontend/app/\(roles\)/admin admin-frontend/lib/admin` returns nothing (no page or store fetches directly).

---

### FE-8 — Console types re-shaped to the wire DTOs; derived `initials`/`tone`/`seen`; `nextId()` deleted (Yes)

- **Proposal ref:** § Layer 3 § C (all four bullets); § B rows 4, 7 and 8; § Dead code purged (`nextId()`, `EnrollDraft.pw`/`.expiry`, `AdminUser.tone` as a stored field, `Override.from` as a stored field); §4.1 `StaffOut`/`OverrideOut`/`AuditOut`.
- **Module:** §5.5 + §5.6.
- **Files:** modify `admin-frontend/lib/admin/types.ts`, `admin-frontend/components/admin/enroll/Directory.tsx`, `admin-frontend/components/admin/AuditModal.tsx`, `admin-frontend/components/admin/Shared.tsx` (the `UserCell` call sites only), `admin-frontend/components/admin/enroll/LifecycleModals.tsx`, `admin-frontend/components/admin/config/OverridesLedger.tsx`.
- **Dependencies:** FE-1, FE-2, FE-7 (the DTO source).

**Contract:**

```ts
// admin-frontend/lib/admin/types.ts — the wire shapes ARE the view types
import type { AccessLevel, PageId, Role } from "@/lib/pages-config";
export type { Role, PageId, AccessLevel };
export type Level = AccessLevel;

// Re-export the DTOs so components import from one place, as they do today.
export type { StaffOut, StaffStatus, OverrideOut, AuditOut, MatrixOut } from "@/server/admin";

/** Display tone for a status chip. DERIVED from status — never stored. */
export type StatusTone = "active" | "pending" | "neutral";
const STATUS_TONE: Record<StaffStatus, StatusTone> = {
  ACTIVE: "active", INITIATED: "pending", DEACTIVATED: "neutral",
};
export const toneFor  = (s: StaffStatus): StatusTone => STATUS_TONE[s];

/** "Amara Rahim" → "AR". DERIVED from name — never stored. Null-safe. */
export const initialsFor = (name: string | null): string =>
  (name ?? "?").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

/** `last_sign_in_at` → the directory's "Last seen" cell. "—" when never signed in. */
export const seenFor = (iso: string | null): string => /* Today HH:MM | Yesterday | DD MMM | "—" */ "";

/** Status chip label — the wire value title-cased, so the filter chips and the chip text
 *  read the DTO verbatim (§B row "DB B-4": no client-side derivation of status itself). */
export const STATUS_LABEL: Record<StaffStatus, string> = {
  ACTIVE: "Active", INITIATED: "Initiated", DEACTIVATED: "Deactivated",
};

/** Draft carried across the enroll wizard. No password, no expiry (A-5). */
export interface EnrollDraft {
  mode: "new" | "edit";
  orig?: string;              // firebase_uid of the user being edited
  first: string; last: string; email: string; phone: string;
  start: string; addr: string; dept: string;
  role: Role | "";
  /** Access-step deltas from the role default, keyed by PageId (was: by path). */
  ovr: Partial<Record<PageId, Level>>;
  /** Expiry for every override this enrollment creates — FE-14. One of EXPIRY_OPTS. */
  ovrExpiry: string;
  invite: boolean;
  /** Handover counts carried in by startEdit so the Role step can show real numbers — FE-15. */
  client_count?: number | null;
  open_ticket_count?: number | null;
  /** Receiving RM chosen in the Role step when an RM is being moved off RM — FE-15. */
  reassign_book_to?: string | null;
}

// DELETED: AdminUser (StaffOut replaces it), Override (OverrideOut replaces it),
//          AuditEntry (AuditOut replaces it), UserStatus (StaffStatus replaces it),
//          RoleDef, PageDef, FlatPage, PageGroup, EnrollDraft.pw, EnrollDraft.expiry.
```

**Behavior / invariants:**
- **Nothing derived is stored.** `initials`, `tone` and `seen` are computed at render from `name`/`status`/`last_sign_in_at`. The store holds `StaffOut[]` verbatim, so nothing can drift out of sync.
- **`status` itself is read verbatim** from `StaffOut.status` (`"ACTIVE" | "INITIATED" | "DEACTIVATED"`). The FE does **not** derive `INITIATED` from `last_sign_in_at` — that is the server's job (DB B-4/D-4). `Directory`'s filter chips map `All | Active | Initiated | Deactivated` onto the three wire values via `STATUS_LABEL`; the chip and the filter read the same source.
- **Overrides carry no snapshot.** `role_default` comes from `OverrideOut` (server-resolved at read time), so the ledger's "Default → granted" column cannot lie after a matrix change — replacing the old `Override.from` captured at grant time. `user_name`/`user_role`/`page_label`/`page_path` likewise come from the join, not from a client-side copy, and `initials` is derived from `user_name`.
- **`expiring_soon` is server-computed** (`OverrideOut.expiring_soon`); the old client-side `soon: exp === "30 Sep 2026"` heuristic in `AddOverrideModal` (`LifecycleModals.tsx:284`) is gone.
- **Ids are server-assigned UUIDs.** `uid`/`nextId()` (`AdminStoreContext.tsx:23-24`) are deleted; `OverrideOut.id` and `AuditOut.id` are the React keys.
- **`AuditModal` reads the DTO.** `AuditOut` has `at` (ISO), `actor_name`, `event`, `detail` — replacing the mock's `ts` (a pre-split `"12 Jul 2026 · 16:20"` string), `who`, `what`. Its current `a.ts.split(" · ")` becomes a date/time format of `at`; the two-column layout is unchanged.
- **Grep gate:** `grep -rn "nextId\|STATUS_TONE\b" admin-frontend/lib/admin/AdminStoreContext.tsx` returns nothing; `grep -rn "\.pw\b\|expiry:" admin-frontend/lib/admin admin-frontend/components/admin admin-frontend/app/\(roles\)/admin` returns nothing (the surviving `ovrExpiry` is a different name deliberately, so the old grep stays clean).

**Done when:** the directory renders `StaffOut` rows with derived avatar initials, a status chip whose tone comes from `toneFor`, and a "Last seen" cell from `seenFor(last_sign_in_at)`; the ledger's default→granted column comes from `role_default`; no `nextId` exists.

---

### FE-9 — `AdminStoreProvider` is API-backed; the mock is deleted; `todayLabel()` replaces `TODAY` (MANDATORY)

- **Proposal ref:** § Layer 3 A-3 (second half); § B rows 4, 7, 8, 9; Goal 3; § Dead code purged (`lib/mock/admin-data.ts`).
- **Module:** §5.5.
- **Files:** modify `admin-frontend/lib/admin/AdminStoreContext.tsx`, `admin-frontend/app/(roles)/admin/layout.tsx`, `admin-frontend/app/(roles)/admin/enroll-user/page.tsx`, `admin-frontend/components/admin/enroll/LifecycleModals.tsx`; create `admin-frontend/lib/admin/today.ts`; delete `admin-frontend/lib/mock/admin-data.ts`.
- **Dependencies:** FE-2, FE-7, FE-8. Cannot land before them (§3.2's documented exception).

**Contract:**

```ts
// admin-frontend/lib/admin/today.ts — NEW. Replaces the mock's frozen TODAY constant.
/** Today as the console renders a date: "27 Jul 2026". The mock hardcoded this string;
 *  it is now computed, so a placeholder never claims a date in the past. */
export function todayLabel(d: Date = new Date()): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
```

```tsx
// admin-frontend/app/(roles)/admin/layout.tsx — server component fetches the initial world
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [staff, matrix, overrides, audit] = await Promise.all([
    getStaff(), getMatrix(), getOverrides(), getAudit({ limit: 50 }),
  ]);
  return (
    <RoleGuard>
      <AdminStoreProvider
        initialStaff={staff.success ? staff.data : []}
        initialMatrix={matrix.success ? matrix.data : null}
        initialOverrides={overrides.success ? overrides.data : []}
        initialAudit={audit.success ? audit.data : []}
        loadError={[staff, matrix, overrides, audit].find((r) => !r.success)?.error ?? null}
      >
        {children}
      </AdminStoreProvider>
    </RoleGuard>
  );
}
```

```ts
// admin-frontend/lib/admin/AdminStoreContext.tsx — the store's surface after the rewrite
interface AdminStore {
  /* ---- server state ---- */
  staff: StaffOut[];
  overrides: OverrideOut[];
  audit: AuditOut[];
  /** MatrixOut.pages / .roles / .levels, as received — never re-sorted or re-labelled. */
  pages: MatrixOut["pages"];
  roles: MatrixOut["roles"];
  published: { at: string; by: string } | null;
  totalPages: number;
  loadError: string | null;

  /* ---- staging: PURELY LOCAL, unchanged from today (D-5) ---- */
  staged: Record<string, StagedChange>;
  stagedList: StagedChange[];
  stage: (pageId: PageId, role: Role, to: Level) => void;
  discard: () => void;
  copyRole: (from: Role, to: Role) => void;
  resetRole: (role: Role) => void;

  /* ---- derived reads ---- */
  eff: (pageId: PageId, role: Role) => Level;   // staged ?? published ?? "NONE"
  grantedFor: (role: Role) => number;
  roleUsers: (role: Role) => number;            // from roles[].user_count, not counted locally
  ovrFor: (firebase_uid: string) => OverrideOut[];
  ovrOn: (pageId: PageId, role: Role) => boolean;

  /* ---- mutators: await the action, patch local state on success, toast on failure ---- */
  publish: (note?: string) => Promise<PublishResult>;              // FE-10
  addOverride: (body: OverrideIn) => Promise<boolean>;
  revokeOverride: (id: string) => Promise<boolean>;
  enroll: (body: StaffEnrollIn) => Promise<StaffCreatedOut | null>;
  updateStaff: (uid: string, body: StaffUpdateIn) => Promise<boolean>;
  sendLink: (uid: string) => Promise<boolean>;
  refreshStaff: () => Promise<void>;
  refreshMatrix: () => Promise<void>;

  // DELETED: log() (the audit trail is server-written — every mutator's audit row is
  //          created by the backend; the store re-reads `audit` instead of composing rows),
  //          addUser(), updateUser(email, patch), setStatus(email, status).
}
```

**Behavior / invariants:**
- **Every mutator is `await action(...)` → patch-on-success → `toast.error(result.error)` on failure.** No optimistic local write survives a failed call. Where the response carries the new row (`enroll` → `StaffCreatedOut`, `updateStaff` → `StaffOut`, `grantOverride` → `OverrideOut`) the store patches from it; `revokeOverride` (204) removes by id; anything whose shape it cannot patch precisely calls `refreshStaff()`/`refreshMatrix()`.
- **Users are keyed by `firebase_uid`, not by email.** The mock's `updateUser(email, …)` / `setStatus(email, …)` keyed on email, which is now mutable (`StaffUpdateIn.email`). `ovrFor` likewise takes a uid rather than a display name.
- **Staging stays purely client-side (D-5).** `staged`, `stage()`, `discard()`, `stagedList` are unchanged in behavior — only their key (`page_id|ROLE`) and level spelling change. No server-side draft, no lock, no presence indicator.
- **`eff` precedence is unchanged:** staged value if present, else the published level from `MatrixOut.levels`, else `"NONE"` (an omitted cell). `MatrixOut.levels` omits `NONE` cells by contract, so absence is the only encoding of `NONE` on the read path.
- **`roleUsers` reads `roles[].user_count`.** The mock counted non-deactivated directory rows; the server's count is authoritative and does not depend on the directory being loaded.
- **`log()` is gone.** Audit rows are written server-side by each endpoint (§7's Backend obligation); after a mutation the store re-reads `audit` rather than composing a display string locally. This deletes the `${TODAY} · 10:24` fabricated timestamp.
- **`TODAY`'s three importers are replaced.** Per the proposal (A-3, "three importers, five use sites, one of them the store itself, not a component") and verified here: `grep -rn "TODAY" admin-frontend --include=*.ts --include=*.tsx` shows imports in exactly **three** files — `app/(roles)/admin/enroll-user/page.tsx:24`, `components/admin/enroll/LifecycleModals.tsx:22`, `lib/admin/AdminStoreContext.tsx:20` — across **five** use sites: `enroll-user/page.tsx:40,64`; `LifecycleModals.tsx:178`; `AdminStoreContext.tsx:73,127`. Two of those five (`AdminStoreContext:73,127`) disappear with `log()` and `setPublished`; the remaining three become `todayLabel()` — the wizard's default start date, `startEdit`'s start date, and `DeactivateModal`'s reason placeholder.
- **A failed initial load renders the page's own empty states, not a crash.** `loadError` surfaces once as a `toast.error` from the provider; the directory shows "No users match this filter" and the matrix falls back to `PAGE_GROUPS` (FE-2) with every cell `NONE`.
- **`lib/mock/admin-data.ts` is deleted in this unit** — it is the last unit that reads it. Other pages' mocks (`lib/mock/rm-data.ts` and siblings) are **not** touched; those pages are out of this proposal's scope.
- **Grep gate:** `grep -rn "mock/admin-data\|ADMIN_USERS\|ADMIN_OVERRIDES\|ADMIN_AUDIT" admin-frontend/` returns nothing.

**Done when:** both admin pages render entirely from the four fetches; a refresh preserves published levels and loses only staged edits; every mutator round-trips through `app/(roles)/admin/actions.ts`; the mock file is gone and the grep is clean.

---

### FE-10 — `publish(note)` is one `PUT /matrix` with `base_published_at`, and 409 re-reads while keeping staged changes (Yes)

- **Proposal ref:** § Layer 3 A-3 (last paragraph); § B row 6; Backend C-5; D-5; §4.1 `MatrixPublishIn` + the 409 envelope.
- **Module:** §5.5 + §5.6.
- **Files:** modify `admin-frontend/lib/admin/AdminStoreContext.tsx`, `admin-frontend/components/admin/config/ConfigModals.tsx`, `admin-frontend/app/(roles)/admin/system-config/page.tsx`.
- **Dependencies:** FE-7, FE-9.

**Contract:**

```ts
// admin-frontend/lib/admin/AdminStoreContext.tsx
export type PublishResult =
  | { ok: true; published: { at: string; by: string } | null }
  /** Someone else published between this tab's read and its write (Backend C-5).
   *  The matrix has been re-read; `staged` is INTACT so the admin can re-review. */
  | { ok: false; conflict: true }
  | { ok: false; conflict: false; error: string };

const publish = useCallback(async (note?: string): Promise<PublishResult> => {
  const list = Object.values(staged);
  if (!list.length) return { ok: true, published };
  const result = await publishMatrix({
    changes: list.map((s) => ({ page_id: s.page_id, role: s.role, level: s.to })),
    note: note?.trim() || null,
    base_published_at: published?.at ?? null,     // §4.2: always sent
  });
  if (result.success) {
    setMatrix(result.data);                        // levels + published, server-authored
    setStaged({});
    await refreshAudit();
    return { ok: true, published: result.data.published };
  }
  if (result.code === "HTTP_409") {
    await refreshMatrix();                         // fresh levels + published; staged untouched
    return { ok: false, conflict: true };
  }
  return { ok: false, conflict: false, error: result.error };
}, [staged, published]);
```

```tsx
// admin-frontend/components/admin/config/ConfigModals.tsx — PublishModal's handler
const doPublish = async () => {
  const n = stagedList.length;
  if (!n) return;
  const r = await publish(note.trim());
  if (r.ok) {
    toast.success(`${n} change${n === 1 ? "" : "s"} published — every affected user is updated at next page load.`);
    onClose();
    return;
  }
  if (r.conflict) {
    // Modal STAYS OPEN, staged list intact, diff now recomputed against the fresh levels.
    toast.warning("Someone else published — review again. Your staged changes are unchanged.");
    return;
  }
  toast.error(r.error);
};
```

**Behavior / invariants:**
- **One request per publish, whatever the cell count.** No per-cell call; the transaction and the audit row are the server's (§7).
- **`base_published_at` is always sent**, `null` included, per §4.2. It is `MatrixOut.published?.at` — never a locally-generated timestamp.
- **On 409: re-read, keep staged.** The staged map is *not* cleared and the modal is *not* closed — the whole point is that the admin re-reviews their own diff against the new baseline. The diff rows recompute because `from` is read through `eff`, which now sees the refreshed levels.
- **`published` is never written locally.** The mock's `setPublished({ when: TODAY, by: "Omar Bakri" })` is gone; the value comes from `MatrixOut.published`, and the toolbar's "Last published **{at}** by {by}" formats the ISO string. A `null` (never published) renders the existing "Published" chip with no date rather than a fabricated one.
- **The staged-bar copy is unchanged** ("Staged locally — no user is affected until you publish."), and so is the reduction warning in the diff. The only new copy is the conflict toast.
- **`isReduction` keeps its meaning** with the uppercase levels (FE-1) — `to === "NONE"` or `EDIT → VIEW`.

**Done when:** publishing N staged cells issues exactly one `PUT /api/admin/access/matrix` carrying `changes`, `note` and `base_published_at`; a mocked 409 leaves `stagedList` unchanged, refreshes `published`, keeps the modal open and shows the review-again toast; a success clears `staged` and updates `published` from the response.

---

### FE-11 — The wizard loses its password field and expiry select; `password.ts` deleted (Yes — user req.)

- **Proposal ref:** § Layer 3 A-5 (first two bullets); § B row 3; front-matter sanctioned change (c); Goal 6; Goal 8; § Dead code purged (`lib/admin/password.ts`, `EnrollDraft.pw`/`.expiry`); Backend C-1/C-3; D-6.
- **Module:** §5.6.
- **Files:** modify `admin-frontend/components/admin/enroll/Wizard.tsx`, `admin-frontend/app/(roles)/admin/enroll-user/page.tsx`; delete `admin-frontend/lib/admin/password.ts`.
- **Dependencies:** FE-8 (the `EnrollDraft` without `pw`/`expiry`). FE-12 removes the other two importers of `password.ts`, so the file's deletion lands with whichever of the two is second — recorded here as this unit's only ordering note.

**Contract:**

```tsx
// admin-frontend/components/admin/enroll/Wizard.tsx — the Credentials step, after
// (was Wizard.tsx:198-221). TWO controls removed, NONE added. Nothing else re-laid-out.
{cur === "creds" && (
  <div className="grid grid-cols-2 items-start gap-x-5 gap-y-4">
    {/* the "Temporary password" TextField (with its RefreshCw/Copy trail) is GONE */}
    {/* the "Password expires" SelectField is GONE — no password exists to expire */}
    <div className="rounded-xl border border-outline-variant bg-surface-low p-[14px_16px]" style={{ gridColumn: "1 / -1" }}>
      <Checkbox on={d.invite} onChange={(v) => patchDraft({ invite: v })}>
        Email the invitation to <b>{d.email || "the work email"}</b>
      </Checkbox>
    </div>
    <div style={{ gridColumn: "1 / -1" }}>
      <Notice tone="warn">
        <b>Creates the account immediately</b> — no second approver.
      </Notice>
    </div>
  </div>
)}
```

```ts
// Wizard.tsx — the step's own copy
const DONE: Record<StepKey, string> = {
  …,
  creds: isEdit ? "Credentials unchanged" : "Set-password link sent",   // was "Temporary password issued"
};
const HEAD: Record<StepKey, ReactNode> = {
  …,
  creds: isEdit
    ? <>Re-send the set-password link for {d.first || "this user"}. Their current password keeps working until they use a new link.</>
    : <>{d.first || "This user"} sets their own password from a link we email to <b>{d.email || "the work email"}</b>. Nothing is sent until you create the account.</>,
};
const LABEL: Record<StepKey, string> = { …, creds: "Credentials" };   // step label UNCHANGED
const SUB:   Record<StepKey, string> = { …, creds: "How they get in." };   // UNCHANGED
```

```ts
// admin-frontend/app/(roles)/admin/enroll-user/page.tsx
function blankDraft(): EnrollDraft {
  return {
    mode: "new", first: "", last: "", email: "", phone: "",
    start: todayLabel(), addr: "", dept: "",
    role: "", ovr: {}, ovrExpiry: "90 days", invite: true,
  };                                   // no `pw`, no `expiry`
}
// import { genPassword } from "@/lib/admin/password";  ← DELETED (was :23)
```

**Behavior / invariants:**
- **`lib/admin/password.ts` is deleted whole.** Its three importers drop the import: `enroll-user/page.tsx:23`, `Wizard.tsx:21`, `LifecycleModals.tsx:20` (the last handled by FE-12).
- **The Credentials step keeps its label, its sub-line, its "Email the invitation" checkbox and its "no second approver" Notice.** It loses exactly the password `TextField` (with the regenerate and copy `IconButton`s) and the "Password expires" `SelectField` — the front matter's sanctioned change (c). The step is not otherwise re-laid-out and no control is added.
- **The Notice's second sentence goes with the field it described.** "The temporary password is shown once, on the screen after this." is dropped because nothing is shown once any more (FE-12 removes that panel row).
- **No password crosses any boundary.** `StaffEnrollIn` has no `password` field in or out (§7.1), and the FE neither generates, displays, copies nor transmits one. Goal 6's grep (`genPassword`) and Goal 8's grep (`temporary password`, case-insensitive) both come clean in this unit plus FE-12.
- **Grep gate (with FE-12):** `grep -rn "genPassword\|admin/password" admin-frontend/` returns nothing; `grep -rin "temporary password" admin-frontend/` returns nothing.

**Done when:** the Credentials step renders two controls fewer and nothing else changed; `lib/admin/password.ts` no longer exists; `npx tsc --noEmit` passes with no `pw`/`expiry` on `EnrollDraft`.

---

### FE-12 — `ResetModal` → `SendLinkModal`; `CreatedModal` loses its password row; every remaining string renamed (Yes — user req.)

- **Proposal ref:** § Layer 3 A-5 (bullets 3–5 and the closing line); § B rows 3 and 5; front-matter sanctioned change (b); Goal 8; Backend C-3/C-4.
- **Module:** §5.6.
- **Files:** modify `admin-frontend/components/admin/enroll/LifecycleModals.tsx`, `admin-frontend/components/admin/enroll/Directory.tsx`, `admin-frontend/app/(roles)/admin/enroll-user/page.tsx`.
- **Dependencies:** FE-8, FE-9 (needs `sendLink(uid)` on the store).

**Contract:**

```tsx
// admin-frontend/components/admin/enroll/LifecycleModals.tsx — ResetModal becomes:
export function SendLinkModal({ user: u, onClose }: { user: StaffOut; onClose: () => void }) {
  const { sendLink } = useAdminStore();
  const [mail, setMail] = useState(true);
  return (
    <Modal
      title="Send set-password link"
      sub={`${u.name} · ${u.status === "INITIATED" ? "initiated, not yet signed in" : u.role}`}
      width={430}
      onClose={onClose}
      foot={/* Cancel · <Button icon={Mail}>Send link</Button> → await sendLink(u.firebase_uid) */}
    >
      {/* the password TextField (+ regenerate/copy) is GONE; the "Expires" select is GONE */}
      <Checkbox on={mail} onChange={setMail}>Email the link to {u.email}</Checkbox>
      <Notice tone="info">Any earlier unused link stops working the moment this is sent.</Notice>
    </Modal>
  );
}
```

```tsx
// CreatedModal — driven by StaffCreatedOut, "Shown once" panel loses its password row
export interface CreatedInfo {
  name: string; email: string; roleCode: Role;
  link_sent: boolean;      // from StaffCreatedOut (Backend C-3)
  ovr: number;             // override_count
}

export function CreatedModal({ m, onEnrollAnother, onBackToDirectory }: { … }) {
  // no `shown` state, no Eye/EyeOff toggle
  return (
    <Modal title="Account created" sub={`${m.name} · ${m.roleCode} · ${m.ovr} override${m.ovr === 1 ? "" : "s"}`} …>
      {m.link_sent ? (
        <Notice tone="ok">
          <b>{m.name.split(" ")[0]} can set their password now</b> as {m.email}. The invitation email has been sent.
        </Notice>
      ) : (
        <Notice tone="warn">
          Account created as {m.email}, but <b>the invitation email could not be sent</b>. Re-send it from the row menu.
        </Notice>
      )}
      <div className="overflow-hidden rounded-xl border border-outline-variant">
        <div className="… border-b …">
          <Label>Sign-in identity</Label>
          <Button variant="secondary" icon={Copy} onClick={() => toast.success("Email copied to the clipboard.")}>Copy</Button>
        </div>
        <div className="…"><Label>Email</Label><span className="text-[13.5px] font-semibold">{m.email}</span></div>
        {/* the "Temporary password" row and its reveal toggle are GONE */}
      </div>
      <span className="flex items-center gap-2 text-[12px] text-secondary">
        <History size={14} strokeWidth={1.75} />
        The link expires — re-send it from the row menu if they miss it.
      </span>
    </Modal>
  );
}
```

```tsx
// ReactivateModal (was :210)
<Notice tone="info">
  Sign-in needs a fresh set-password link — the account lands back in <b>Initiated</b> until the first sign-in.
</Notice>
// its confirm handler: await updateStaff(u.firebase_uid, { status: "ACTIVE" }) THEN await sendLink(u.firebase_uid)

// Directory.tsx:138 — the row-menu item
["Send set-password link", KeyRound]        // was "Reset temporary password"
```

**Behavior / invariants:**
- **All 14 "temporary password" strings are renamed or removed** — `Wizard.tsx:64,200,204,206,209,211,218` (FE-11), `LifecycleModals.tsx:27,43,44,53,62,210,249,260`, `Directory.tsx:139`, `password.ts:3` (deleted). Nothing reads "temporary password", case-insensitive, afterwards, and the store's fabricated `log` detail strings go with `log()` itself (FE-9).
- **`SendLinkModal` calls `POST /api/admin/staff/{uid}/set-password-link`** through the store's `sendLink`. It does **not** touch the Firebase credential — a password the user already set keeps working until they use the new link, which is why the Notice says only that the *earlier unused link* stops working.
- **The "Shown once" panel survives as the sign-in-identity panel.** It keeps the email row and the Copy button (now copying the email alone) and loses the password row plus the `shown`/`EyeOff` reveal toggle. The panel's frame, borders and spacing are unchanged — this is a removed row, not a redesign.
- **`link_sent === false` is surfaced, not swallowed.** `CreatedModal` switches its lead `Notice` to a warning pointing at the row menu's re-send; the account still exists, per Backend C-3's never-fails-provisioning contract.
- **`ReactivateModal` re-sends after reactivating**, matching the copy it already shows, and reactivates to `status: "ACTIVE"` (the server derives `INITIATED` from a null `last_sign_in_at` — the FE never sets `INITIATED`, per §7.1's `StaffUpdateIn`).
- **The old `ResetModal` name has no surviving reference** — the modal state union in `enroll-user/page.tsx` renames `{kind:"reset"}` to `{kind:"sendLink"}`.
- **`ManageOverridesModal` keeps `"NONE"` in its level options.** The three options stay `None | View | Edit` (`LifecycleModals.tsx:123`): a `NONE` override is an active revocation for one person, which row-absence cannot express, and `page_access_overrides.level` is a three-value enum for exactly that reason (§7.1's map, D-3). It is **not** narrowed to View/Edit for symmetry with the matrix — the asymmetry is intentional.

**Done when:** `grep -rin "temporary password" admin-frontend/` returns nothing; the row menu reads "Send set-password link"; `CreatedModal` shows no password row and no reveal toggle and switches on `link_sent`; `ManageOverridesModal` still offers None.

---

### FE-13 — The overrides ledger and `AddOverrideModal` move to System Config as a third view (Yes — user req.)

- **Proposal ref:** § Layer 3 A-6; front-matter sanctioned change (a); Goal 7.
- **Module:** §5.6.
- **Files:** create `admin-frontend/components/admin/config/OverridesLedger.tsx` (moved) and add `AddOverrideModal` to `admin-frontend/components/admin/config/ConfigModals.tsx`; delete `admin-frontend/components/admin/enroll/OverridesLedger.tsx` and remove `AddOverrideModal` from `admin-frontend/components/admin/enroll/LifecycleModals.tsx`; modify `admin-frontend/app/(roles)/admin/system-config/page.tsx`, `admin-frontend/app/(roles)/admin/enroll-user/page.tsx`, `admin-frontend/components/admin/enroll/Directory.tsx`, `admin-frontend/components/admin/Shared.tsx`.
- **Dependencies:** FE-8, FE-9 (the ledger reads `OverrideOut` off the store).

**Contract:**

```tsx
// admin-frontend/components/admin/Shared.tsx — ViewSwitch widens from 2 to 3 options
export type ConfigView = "matrix" | "role" | "overrides";
export function ViewSwitch({ view, onChange }: { view: ConfigView; onChange: (v: ConfigView) => void }) {
  const items: [ConfigView, typeof Grid3x3, string][] = [
    ["matrix",    Grid3x3,   "Matrix"],
    ["role",      Users,     "By role"],
    ["overrides", UserRound, "Overrides"],
  ];
  /* same pill markup, same styles — one more button */
}
```

```tsx
// admin-frontend/components/admin/config/OverridesLedger.tsx — MOVED, header stripped
export interface OverridesLedgerProps { /* no onBack, no onAddOverride */ }

export function OverridesLedger() {
  const { overrides, revokeOverride } = useAdminStore();
  const soon = overrides.filter((o) => o.expiring_soon).length;
  const stats: [string, number, boolean][] = [
    ["Active overrides",     overrides.length,                              false],
    ["Expiring in 30 days",  soon,                                          soon > 0],
    ["Users affected",       new Set(overrides.map((o) => o.firebase_uid)).size, false],
    ["Roles affected",       new Set(overrides.map((o) => o.user_role)).size,    false],
  ];
  /* its own <PageHeader> and "Back to directory" Button are GONE — System Config owns the
     header. The four stat cards and the seven-column table are kept AS-IS. */
}
```

```tsx
// admin-frontend/app/(roles)/admin/system-config/page.tsx
const params = useSearchParams();
const [configView, setConfigView] = useState<ConfigView>(
  params.get("view") === "overrides" ? "overrides" : "role",     // one search param, read once
);

<PageHeader
  title="System Config"
  subtitle="Standing page access for every role. Changes apply to all users holding the role."
  actions={
    <>
      {configView === "overrides" && (
        <Button icon={Plus} onClick={() => setModal({ kind: "addOverride" })}>Add override</Button>
      )}
      <Button variant="secondary" icon={History} onClick={() => setModal({ kind: "audit" })}>Audit log</Button>
      <Button icon={Save} disabled={!n} onClick={() => n && setModal({ kind: "publish" })}>…</Button>
    </>
  }
/>
…
{configView === "matrix" ? <Matrix … /> : configView === "role" ? <RoleView … /> : <OverridesLedger />}
{modal?.kind === "addOverride" && <AddOverrideModal onClose={closeModal} />}
```

```tsx
// admin-frontend/components/admin/enroll/Directory.tsx — the button becomes a link
<Link href="/admin/system-config?view=overrides">
  <Button variant="secondary" icon={UserRound}>Overrides ({store.overrides.length})</Button>
</Link>
// DirectoryProps loses `onOverrides`.

// admin-frontend/app/(roles)/admin/enroll-user/page.tsx
type View = "directory" | "wizard";          // "overrides" removed from the union
```

**Behavior / invariants:**
- **`ManageOverridesModal` stays in Enroll User.** It is a directory *row* action (per user), not the ledger, and it keeps its place in `enroll/LifecycleModals.tsx` and in the directory's row menu. Only the ledger and `AddOverrideModal` move.
- **The ledger drops its own header.** System Config's existing `PageHeader` covers it; the "Add override" button moves into that header's actions and is rendered **only** on the overrides view. The "Back to directory" button is deleted — the `ViewSwitch` is the way back.
- **Its four stat cards are kept as-is**, re-sourced: `expiring_soon` from the DTO, distinct users by `firebase_uid`, distinct roles by `user_role`.
- **One search param, read once.** `?view=overrides` picks the initial view; switching views afterwards does not rewrite the URL (no history churn, and the existing `ViewSwitch` has no URL behavior today).
- **Both pages stay under `AdminStoreProvider`** (`app/(roles)/admin/layout.tsx`), so the ledger reads the same store after the move with no prop threading — the reason the move is cheap.
- **`AddOverrideModal` keeps `NONE` among its levels.** Its `LevelSeg` offers all three (`SEG_ORDER`), matching `ManageOverridesModal`; a `NONE` override is a real per-user revocation (D-3, and `page_access_overrides.level` is a three-value enum for it). Its dead `"On expiry"` select (`Revert to role default | Notify the admin only`, `:316`) is dropped — the seam carries no such field and the backend has no notify path; expiry always reverts to the role default.
- **System Config's toolbar count** reads `overrides.length` as today, now server-sourced.

**Done when:** `/admin/system-config?view=overrides` opens on the ledger with an "Add override" button in the page header; the `ViewSwitch` has three options; Enroll User's `Overrides (N)` navigates there; `enroll/OverridesLedger.tsx` no longer exists and `enroll-user/page.tsx`'s `View` union has two members.

---

### FE-14 — The wizard sends real `overrides[]` with an admin-chosen expiry (Yes)

- **Proposal ref:** § Layer 3 A-7; §4.1 `StaffEnrollIn.overrides`.
- **Module:** §5.6.
- **Files:** modify `admin-frontend/components/admin/enroll/Wizard.tsx`, `admin-frontend/app/(roles)/admin/enroll-user/page.tsx`.
- **Dependencies:** FE-2 (`ovr` keyed by `PageId`), FE-8 (`EnrollDraft.ovrExpiry`), FE-9 (`store.enroll`).

**Contract:**

```tsx
// admin-frontend/components/admin/enroll/Wizard.tsx — the Access step's Notice row gains
// ONE SelectField, reusing the same EXPIRY_OPTS that AddOverrideModal already has.
// (EXPIRY_OPTS moves from enroll/LifecycleModals.tsx:24 to lib/admin/catalog.ts so both
//  the wizard and config/ConfigModals.tsx read one list — it is no longer local to a
//  modal that FE-13 moved to a different directory.)
{cur === "access" && (
  <div className="flex flex-col gap-3.5">
    <AccessEditor valueFor={valueFor} defaultFor={defaultFor} onSet={setLevel}
      openGroups={openGroups} onToggleGroup={onToggleGroup} stagedOn={(id) => id in d.ovr} />
    <div className="flex items-start gap-4">
      <span className="flex-1">
        {ovrCount > 0 ? (
          <Notice tone="warn">
            <b>{ovrCount} override{ovrCount === 1 ? "" : "s"} on this account:</b>{" "}
            {(Object.keys(d.ovr) as PageId[])
              .map((id) => `${PAGE_BY_ID[id].label}, ${LEVEL_LABEL[defaultFor(id)]} → ${LEVEL_LABEL[d.ovr[id]!]}`)
              .join(" · ")}. Each is recorded with a reason and the expiry chosen here.
          </Notice>
        ) : (
          <Notice tone="info">No exceptions — {d.role} defaults apply exactly. Change any level above to record an override.</Notice>
        )}
      </span>
      {ovrCount > 0 && (
        <span className="w-[190px] shrink-0">
          <SelectField label="Overrides expire" value={d.ovrExpiry}
            onChange={(v) => patchDraft({ ovrExpiry: v })} options={EXPIRY_OPTS} />
        </span>
      )}
    </div>
  </div>
)}
```

```ts
// admin-frontend/app/(roles)/admin/enroll-user/page.tsx — createUser's enroll branch
const OVERRIDE_REASON = "Set during enrolment";   // the literal the step's own Notice shows

const created = await store.enroll({
  email: d.email.trim(),
  first_name: d.first.trim(),
  last_name: d.last.trim(),
  role: d.role as Role,
  phone_number: d.phone.trim() || null,
  department: d.dept.trim() || null,
  start_date: isoDateOrNull(d.start),        // the wizard's Start date field, now persisted
  address: d.addr.trim() || null,            // the wizard's Correspondence address, now persisted
  send_link: d.invite,
  overrides: (Object.keys(d.ovr) as PageId[]).map((page_id) => ({
    page_id,
    level: d.ovr[page_id]!,
    reason: OVERRIDE_REASON,
    expires_at: expiryToIso(d.ovrExpiry),    // null for "No expiry"
  })),
});
if (created) setModal({ kind: "created", info: { name, email: d.email, roleCode: d.role as Role, link_sent: created.link_sent, ovr: created.override_count } });
```

**Behavior / invariants:**
- **No fabricated expiry.** The old hardcoded `exp: "30 Sep 2026"` / `soon: true` (`enroll-user/page.tsx:90`) is gone; the admin picks one expiry for the whole enrollment from `EXPIRY_OPTS`, and `"No expiry"` maps to `expires_at: null`.
- **`reason` is the literal the step's own Notice shows** (`"Set during enrolment"`), named once as a constant rather than repeated — the proposal's stated default. It is not silently attributed to the admin as free text they did not write.
- **One `SelectField` added, no other layout change.** It sits in the Access step's existing Notice row and appears only when there is at least one override — otherwise there is nothing for it to govern.
- **Overrides ride on the enroll request**, not on N follow-up `POST /overrides` calls: `StaffEnrollIn.overrides` is part of the enrollment (§7.1), so an enrollment with overrides is one round-trip and one server-side transaction.
- **`start_date` and `address` are now sent**, because §7.1's field map persists both to `admin_profiles.start_date` / `.address`. The wizard already collects them (`Wizard.tsx:148-149`); they stop being discarded. `isoDateOrNull`/`expiryToIso` are small local helpers in `lib/admin/today.ts` beside `todayLabel()` — no date library is added (none is installed).
- **The edit branch does not send overrides.** In edit mode the wizard skips the Access step entirely (`keys` omits `"access"`, `Wizard.tsx:44`) and its Notice already directs the admin to **Manage overrides**; `createUser`'s edit path sends only a `StaffUpdateIn`.
- **`store.eff` is the source of the role default shown in the diff** — `defaultFor(pageId)`, i.e. the staged-aware published level for the drafted role. Unchanged behavior, re-keyed.

**Done when:** enrolling with two changed levels issues one `POST /api/admin/staff` whose `overrides` array carries two `{page_id, level, reason, expires_at}` entries with the chosen expiry; enrolling with none omits the array or sends `[]`; the Access step shows the expiry select only when `ovrCount > 0`.

---

### FE-15 — RM book handover, both triggers: `DeactivateModal` and the wizard's Role step in edit mode (Yes — user req.)

- **Proposal ref:** § Layer 3 § C bullets 4 and 5; § B row 10; Backend C-11; Q-3; Q-7; front-matter sanctioned change (d).
- **Module:** §5.6.
- **Files:** modify `admin-frontend/components/admin/enroll/LifecycleModals.tsx`, `admin-frontend/components/admin/enroll/Wizard.tsx`, `admin-frontend/app/(roles)/admin/enroll-user/page.tsx`, `admin-frontend/lib/admin/AdminStoreContext.tsx`.
- **Dependencies:** FE-8 (the two counts on `StaffOut`, the two draft fields), FE-9 (`updateStaff`).

**Contract:**

```tsx
// admin-frontend/components/admin/enroll/LifecycleModals.tsx — DeactivateModal
export function DeactivateModal({ user: u, onClose }: { user: StaffOut; onClose: () => void }) {
  const { staff, ovrFor, updateStaff } = useAdminStore();
  const held = ovrFor(u.firebase_uid);

  /** The handover is scoped to RMs with a non-empty book. Every other role owns nothing
   *  per-person (Backend C-11), so the control is NOT RENDERED for them. */
  const needsHandover = u.role === "RM" && (u.client_count ?? 0) > 0;
  const receivers = staff.filter(
    (x) => x.role === "RM" && x.status === "ACTIVE" && x.firebase_uid !== u.firebase_uid,
  );                                       // filtered from the directory the page already holds — no new fetch
  const [to, setTo] = useState("");
  const [why, setWhy] = useState("");

  return (
    <Modal title="Deactivate account" sub={`${u.name} · ${u.role}`} width={520} onClose={onClose}
      foot={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <span className="ml-auto">
            <Button icon={Ban} disabled={needsHandover && !to} onClick={async () => {
              const ok = await updateStaff(u.firebase_uid, {
                status: "DEACTIVATED",
                deactivate_reason: why.trim() || null,
                ...(needsHandover ? { reassign_book_to: to } : {}),
              });
              if (ok) { toast.success(`${u.name} deactivated.`); onClose(); }
            }}>Deactivate account</Button>
          </span>
        </>
      }
    >
      <Notice tone="warn"><b>Reversible.</b> Sign-in stops immediately, but the account, its role and its overrides are kept …</Notice>
      <div className="flex flex-col gap-[13px]">
        {needsHandover && (
          <div>
            {/* SAME slot the checkbox occupied. Now a REQUIRED field, not an opt-in. */}
            <Label>Hand this RM&apos;s book to <span style={{ color: "var(--primary)" }}>*</span></Label>
            <span className="mt-[3px] block text-[12px] text-secondary">
              <b>{u.client_count} clients</b> and <b>{u.open_ticket_count} open tickets</b> move to the
              receiving RM. Closed tickets stay on the record as {u.name}&apos;s.
              Reassignment is <b>not</b> undone on reactivation.
            </span>
            <div className="ml-[27px] mt-2.5 max-w-[260px]">
              <SelectField value={to} onChange={setTo} placeholder="Pick a receiving RM…"
                options={receivers.map((r) => ({ value: r.firebase_uid, label: `${r.name} · ${r.client_count ?? 0} clients` }))} />
            </div>
          </div>
        )}
        <Checkbox on><b>{held.length} override{held.length === 1 ? "" : "s"}</b> held, not revoked …</Checkbox>
        <Checkbox on>Sign-in identity stays reserved — the email cannot be reused</Checkbox>
      </div>
      <TextField label="Reason" value={why} onChange={setWhy} placeholder={`Left the firm — ${todayLabel()}`} span
        help="Shown on the account and in the audit log." />
    </Modal>
  );
}
```

```tsx
// admin-frontend/components/admin/enroll/Wizard.tsx — the Role step's EXISTING Notice slot,
// edit mode only. This REPLACES that Notice's text; it does not add a row (Wizard.tsx:175-179).
const leavingRm =
  isEdit && d.origRole === "RM" && d.role !== "" && d.role !== "RM" && (d.client_count ?? 0) > 0;

<Notice tone={leavingRm ? "warn" : "info"}>
  {leavingRm ? (
    <>
      <b>{d.client_count} clients</b> and <b>{d.open_ticket_count} open tickets</b> move to:
      <span className="mt-2 block max-w-[260px]">
        <SelectField value={d.reassign_book_to ?? ""} onChange={(v) => patchDraft({ reassign_book_to: v })}
          placeholder="Pick a receiving RM…" options={activeRmOptions} />
      </span>
      Closed tickets stay on the record as theirs. Existing exceptions stay — manage them from <b>Manage overrides</b>.
    </>
  ) : isEdit ? (
    <>Changing the role swaps the whole standing access set. Existing exceptions stay — manage them from <b>Manage overrides</b> in the directory.</>
  ) : (
    "Access is never set per person here — pick the closest role, then adjust on the next step if this person genuinely differs."
  )}
</Notice>

// `Save changes` stays disabled until a receiver is chosen:
const canSubmit = !leavingRm || !!d.reassign_book_to;
```

```ts
// admin-frontend/app/(roles)/admin/enroll-user/page.tsx
const startEdit = (u: StaffOut) => {
  const [first, ...rest] = (u.name ?? "").split(" ");
  setDraft({
    mode: "edit", orig: u.firebase_uid, origRole: u.role,
    first, last: rest.join(" "), email: u.email ?? "",
    phone: u.phone_number ?? "", start: todayLabel(), addr: "", dept: u.department ?? "",
    role: u.role, ovr: {}, ovrExpiry: "90 days", invite: false,
    client_count: u.client_count, open_ticket_count: u.open_ticket_count,   // carried in — no extra fetch
    reassign_book_to: null,
  });
  setStep(0); setView("wizard"); setKebab(null);
};

// createUser's edit branch
const ok = await store.updateStaff(d.orig!, {
  name, email: d.email.trim(), role: d.role as Role,
  phone_number: d.phone.trim() || null, department: d.dept.trim() || null,
  ...(d.reassign_book_to ? { reassign_book_to: d.reassign_book_to } : {}),
});
```

**Behavior / invariants:**
- **Two triggers, one shared condition.** "This user is about to stop being an active RM" — either `status: "DEACTIVATED"` or a role other than `RM` — and both send `reassign_book_to`. The FE evaluates the same predicate in both surfaces (`role === "RM" && client_count > 0` plus the trigger), and the server re-validates it; the FE's copy is UX, the server's is the boundary.
- **The control is not rendered at all for non-RMs, or for an RM with an empty book.** Both `client_count` and `open_ticket_count` are `null` for every non-RM role by contract (§7.1), so `?? 0` is the safe read and the check never renders a control against a `null`. The modal keeps its two informational rows and its reason field, and the fabricated "Reassign **4 open items**" checkbox is gone. This is a removal in a case where the control was lying, which the front-matter constraint permits.
- **Same slot, same layout.** For an RM with a book the control occupies exactly the slot the checkbox occupied; only the label, the copy and the required-ness change. The receiving-RM `SelectField` sits in the same indented `ml-[27px]` sub-slot.
- **The numbers shown are real** — `StaffOut.client_count` / `.open_ticket_count`, computed in `GET /api/admin/staff`'s grouped pass (§7.1). Nothing is hardcoded.
- **Receivers come from the directory the page already holds.** `staff.filter(role === "RM" && status === "ACTIVE" && uid !== target)` — no new fetch, and the option label carries the receiver's own client count so the admin can see the load they are adding.
- **Confirm stays disabled until a receiver is picked** in both surfaces (`Deactivate account`, `Save changes`).
- **Either 409 surfaces as "pick a receiving RM".** `updateStaff` returns `false` and the store toasts the server's `detail`; the modal/wizard stays open with the picker visible. `422 "reassign_book_to must be an active RM"` surfaces the same way — it should be unreachable, since the options are filtered to active RMs, which is exactly why it is a server-side check and not a client one.
- **The existing "Reassignment is not undone on reactivation" sub-line stays** — it was already correct, and reactivation does not un-hand-over.
- **Picking `RM` again, or editing a non-RM, shows the current Notice unchanged** (`leavingRm` is false), so the common edit path is untouched.
- **`EnrollDraft` gains `origRole`** alongside `orig`, because the trigger is "was an RM, is becoming something else" and `d.role` is already the *new* value by the time the Notice renders.

**Done when:** deactivating an RM with `client_count > 0` requires a receiving RM and sends `reassign_book_to`; deactivating a PC/COMPLIANCE/PM user (or an RM with an empty book) renders no picker and sends no `reassign_book_to`; editing an RM with a book to `MOBO` reveals the picker inside the Role step's existing Notice and keeps `Save changes` disabled until one is chosen; editing that RM back to `RM` shows the ordinary Notice.

---

### FE-16 — The `/register` self-signup path is deleted from **both** frontends (Yes — user req.)

- **Proposal ref:** § Layer 3 A-8; § B row 5 (`/api/dev/register` deleted); Goal 9; D-7; § Dead code purged (the `register` row, "×2 frontends"); Backend C-9.
- **Module:** §5.8.
- **Files:**
  - `admin-frontend`: delete `app/(auth)/register/` (whole dir); modify `components/auth/AuthProvider.tsx`, `lib/auth-api.ts`, `lib/firebase-auth-errors.ts`, `app/(auth)/login/page.tsx`.
  - `client-frontend`: delete `app/register/` (whole dir); modify `components/auth/AuthProvider.tsx`, `lib/auth-api.ts`, `lib/firebase-auth-errors.ts`, `app/login/page.tsx`.
- **Dependencies:** none — parallel-safe with every other unit (it touches no file any of them touch).

**Contract:**

```ts
// BOTH frontends — components/auth/AuthProvider.tsx
type AuthContextValue = {
  user: User | null;
  portalUser: PortalUser | null;
  loading: boolean;
  backendSyncing: boolean;
  backendSyncError: string | null;
  firebaseReady: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmailPassword: (email: string, password: string) => Promise<void>;
  // signUpWithEmailPassword — DELETED (admin-frontend :29, client-frontend :27)
  signOutUser: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  refreshPortalUser: () => Promise<void>;
};

// DELETED from the import list: createUserWithEmailAndPassword (firebase/auth),
//                               postBackendRegister (lib/auth-api).
// DELETED: the `isRegistering` / `isRegisteringRef` useRef (admin :44, client :44)
//          and the onAuthStateChanged branch that existed solely to yield to it
//          (admin :68-74, client :68-73), the signUpWithEmailPassword callback
//          (admin :139-159, client :128-158), and both `value`/deps entries
//          (admin :215 + :229, client :216 + :230).
```

```ts
// BOTH frontends — lib/auth-api.ts
// DELETED: postBackendRegister (admin :60-71, client :45-55) and the /api/dev/register
//          404 special-case inside parseApiError (admin :27-29, client :27).
/**
 * After Firebase sign-in or app reload, sync the portal profile via login only.
 * Login binds an existing account; nothing in this frontend can create one — every
 * account is provisioned by an authorised actor (D-7).
 */
export async function syncPortalUserAfterFirebaseAuth(idToken: string | null): Promise<PortalUser> {
  return postBackendLogin(idToken);
}
```

```ts
// BOTH frontends — lib/firebase-auth-errors.ts
export function formatFirebaseAuthError(error: unknown): string {
  const code = getFirebaseAuthErrorCode(error);
  switch (code) {
    // case "auth/email-already-in-use" — DELETED: createUserWithEmailAndPassword was its
    // only producer, and that call is gone (admin :13-14, client :13).
    case "auth/invalid-email":        return "That email address is not valid.";
    case "auth/weak-password":        return "Password is too weak. Use at least 6 characters.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":   return "Wrong email or password.";
    …
  }
}
```

```tsx
// admin-frontend/app/(auth)/login/page.tsx — the whole link block goes (:129-130)
// was: <Link href="/register" …>Register (dev only) →</Link>
// client-frontend/app/login/page.tsx — same, at :227
```

**Behavior / invariants:**
- **Deleted, not disabled.** No route, no function, no flag. The Firebase client SDK is left with sign-in and token refresh only; **no frontend can mint a Firebase identity.**
- **Deleting the `isRegistering` branch simplifies the provider.** It was the one code path that could leave `portalUser` null on a successful auth-state change; removing it means `onAuthStateChanged` always attempts the login bind.
- **`auth/weak-password` stays.** Its producer is not only `createUserWithEmailAndPassword` — Firebase raises it on `confirmPasswordReset` too, which is exactly the flow the set-password link lands in, so it is still reachable. Only `auth/email-already-in-use` loses its sole producer.
- **The two `<Link>` deletions are the only login-page change.** Neither login form, neither Google button, nothing else on either page is touched.
- **`client-frontend`'s `signUpWithEmailPassword` takes two arguments, `admin-frontend`'s takes three** (it also passed a caller-chosen `role`, which is the specific thing D-7 objects to). Both are deleted; there is no shared module to change once.
- **Grep gate, across BOTH frontends:** `grep -rn "signUpWithEmailPassword\|postBackendRegister\|isRegistering\|dev/register\|email-already-in-use" admin-frontend client-frontend` returns nothing, and neither `admin-frontend/app/(auth)/register` nor `client-frontend/app/register` exists.

**Done when:** the grep is clean in both frontends, both register directories are gone, `npx tsc --noEmit` and `npx next lint` pass in both, and signing in still works end to end in both.

---

### FE-17 — Set-password landing form (CONDITIONAL — only if Q-5 selected the email-link fallback) (Accepted)

- **Proposal ref:** Backend C-3's "Decision (Accepted) — link type"; Q-5; § Execution step 3 ("Scheduled after phase 2 reports Q-5's outcome, since the email-link branch adds a set-password landing form to this layer's scope").
- **Module:** §5.8.
- **Files:** create `admin-frontend/app/(auth)/set-password/page.tsx` (and the `client-frontend` sibling `app/set-password/page.tsx` if the client email uses the same link type).
- **Dependencies:** the recorded Q-5 outcome (§2's information precondition). **If Q-5 resolved to `generate_password_reset_link`, this unit does not exist** — Firebase's own hosted reset page handles the password, and no frontend route is needed.

**Contract:**

```tsx
// admin-frontend/app/(auth)/set-password/page.tsx — ONLY on the email-link branch.
// The emailed link is a sign-in link: following it authenticates the user with NO password,
// so this page's whole job is to make them set one before they go anywhere else.
"use client";

import { isSignInWithEmailLink, signInWithEmailLink, updatePassword } from "firebase/auth";

/** Flow:
 *  1. isSignInWithEmailLink(auth, window.location.href) — otherwise redirect to /login.
 *  2. signInWithEmailLink(auth, email, href). `email` comes from the `email` query param
 *     the mailer puts on the link (the recipient may hold several addresses, and §C-3's
 *     body already states the account email explicitly), with a prompt-free fallback to
 *     a one-field form if it is absent.
 *  3. Two password fields + a match check; on submit updatePassword(user, pw).
 *  4. router.replace("/") — app/page.tsx then resolves the role's default page as usual.
 *  Errors run through formatFirebaseAuthError (auth/weak-password, auth/invalid-action-code,
 *  auth/expired-action-code), with the expired case telling them to ask an administrator
 *  (staff) or their relationship manager (client) for a fresh link — the same wording the
 *  email carries.
 */
export default function SetPasswordPage(): JSX.Element;
```

**Behavior / invariants:**
- **It exists only on the fallback branch.** On the reset-link branch, Firebase's hosted page owns the form and this unit is dropped from the schedule rather than shipped empty.
- **No password is generated, only chosen.** The page never displays, suggests or transmits a password to the backend; `updatePassword` goes to Firebase directly, exactly as a normal password change would.
- **It is under `(auth)`, outside `AuthGuard`/`RoleGuard`,** because the arriving user is mid-authentication and holds no grants yet. It performs its own `isSignInWithEmailLink` check instead.
- **It does not create an account.** The identity already exists (created passwordless at enrollment or client staging); this only attaches a credential. That distinction is what keeps FE-16's "no frontend can mint an identity" invariant true.
- **Layout follows the existing login page** — same card, same field primitives — since the proposal does not pin it and a bespoke screen here would be a redesign nobody asked for.

**Done when:** either (a) Q-5 resolved to the reset link and this unit is recorded as dropped, with no `set-password` route in either frontend; or (b) following an email-link lands on the form, setting a password signs the user in and redirects to their default page, and an expired link shows the ask-for-a-fresh-one message.

---

## 7. Frozen seam (from the proposal — verbatim)

<!-- WHERE THE SEAM IS DEFINED: the proposal. This section is a VERBATIM COPY of its
§ 4.1 wire contract, the field-name <-> column-name map, and § 4.2 obligations table,
reproduced so an isolated layer-branch session has the contract in front of it.

RULE OF ISOLATION: this layer builds against the SEAM, not against sibling code.
Sibling-layer files are NOT visible on this branch. If the seam must change, the change
goes to the PROPOSAL first and every layer re-copies its § 7. -->

### 7.1 The seam (verbatim from proposal § 4.1 and § 4.2)

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

#### Per-layer obligations against the seam (verbatim from proposal § 4.2)

| Layer | What this layer contributes | What this layer assumes from the other side |
|---|---|---|
| Database | `page_access`, `page_access_overrides`, `page_access_publications`, `admin_audit_events`; `admin_profiles.{department,start_date,address}`; `users.last_sign_in_at`. Seeds `page_access` with the 55-row matrix in B-1, derived from the System Config catalog's own levels (D-11) — a stated policy, not a copy of today's grants. Uniqueness: `(page_id, role)` and `(user_id, page_id)`. | Backend only ever writes `page_id` values that are `PageId` literals and `level ∈ {view, edit}`; `NONE` arrives as a DELETE, never as a row. |
| Backend | Serves §4.1's 10 admin routes plus the extended `/auth/me` and `/auth/*/login`; resolves effective level = override (unexpired) **else** role standing level; derives the action set from that level via a code-side `PAGE_ACTIONS` map; returns `grants` on `UserOut`; mints passwordless identities and sends the set-password email for both portals. | The four tables and four columns exist with the §4.1 types; the FE never sends `"NONE"` as a stored level and always sends `base_published_at` on `PUT /matrix`. |
| Frontend | Consumes `grants` from login/me into `usePageAccess(pageId)`; gates all 32 marker sites; replaces `AdminStoreContext`'s mock seed with the §4.1 endpoints; keeps staging client-side and publishes one `MatrixPublishIn`. | `grants` is present on every `UserOut` (`{}` for a client); `page_id`/`group`/`label`/`path` in `MatrixOut.pages` are display-ready and ordered — the FE does not re-sort or re-label **what the matrix renders**. Division of authority: the local `PAGES` registry stays the authority on which `PageId`s *exist* (and is the pre-load fallback for labels/paths/icons, which the server does not own); `MatrixOut.pages` is the authority on what the matrix *displays and in what order*. A page in one and not the other is a drift bug, caught by the §Frontend A-1 check. |

### 7.2 How this layer honours the seam

- **What this layer contributes to the seam:**
  - Consumes `UserOut.grants` from `POST /api/auth/admin/login` and `GET /api/auth/me` into `usePageAccess(pageId)` / `useCanEdit(pageId)` (FE-4), and gates all **32** `{/* View/Edit Gate Function */}` sites from it, hiding rather than disabling at `VIEW` (FE-6, D-14). The gate is cosmetic by design — `require_action` on the endpoint is the actual refusal.
  - Treats an absent `grants` key as `"NONE"` — default-deny — and renders `NONE` as sidebar omission plus one `<NoAccess>` card on direct arrival (FE-5).
  - Replaces `AdminStoreContext`'s mock seed with the ten §7.1 admin endpoints, reached through `server/admin/index.ts` → `apiClient` → `ENDPOINTS.ADMIN` (FE-7, FE-9).
  - Keeps matrix staging **client-side** and publishes one `MatrixPublishIn` carrying `changes`, `note` and `base_published_at`; **never** sends `"NONE"` as a stored level on `page_access` — a `NONE` cell is emitted as a change whose `level` is `"NONE"`, which the server applies as a DELETE (FE-10).
  - Sends `"NONE"` as a *stored* override level only on `POST /api/admin/access/overrides`, where the three-value enum makes it a real revocation (FE-12, FE-13).
  - Sends `reassign_book_to` on `PATCH /api/admin/staff/{uid}` whenever the patch makes an RM with a non-empty book stop being an active RM (FE-15).
  - Sends `overrides[]` inline on `POST /api/admin/staff` with an admin-chosen `expires_at` (FE-14). Sends no `password` field, ever, in either direction (FE-11, FE-12).
- **What this layer assumes from the other side** (the assumptions §8's mocks encode — never a runtime dependency on sibling code):
  - `grants` is present on every `UserOut`, and is `{}` for a client.
  - `MatrixOut.pages` (`page_id`/`group`/`label`/`path`) and `MatrixOut.roles` (`code`/`name`/`user_count`) are display-ready and ordered — the FE does not re-sort or re-label them.
  - `MatrixOut.levels` omits `NONE` cells, so absence is the only read-path encoding of `NONE`.
  - `StaffOut.client_count` / `.open_ticket_count` are non-null **only** for `role === "RM"`.
  - `StaffOut.status` is one of `"ACTIVE" | "INITIATED" | "DEACTIVATED"`, with `INITIATED` already derived server-side — the FE never derives it.
  - `OverrideOut.role_default` and `.expiring_soon` are resolved/computed server-side at read time.
  - A stale publish returns HTTP **409** with `detail: "matrix_changed_since_read"`; the two handover conflicts and the last-ADMIN conflict also return 409; an invalid receiver returns 422.
  - `StaffCreatedOut.link_sent` / `LinkSentOut.link_sent` report *queued*, not delivered, and a `false` never means the account was not created.
- **Change protocol:** any edit to §7 requires editing the proposal first; this section is then re-copied from it. Never edit §7 in isolation.

---

## 8. Internal unit testing

<!-- GOALS ONLY — prose, no test code. The concrete tests are written by the `test-gen`
skill from these goals. "Internal" = within this layer only; cross-layer integration is a
separate track (the proposal's phase 5). -->

### 8.1 Test setup

- **Framework / runner:** `vitest` — command `npx vitest run`. Confirmed real, not assumed: `admin-frontend/package.json` has `"test": "vitest run"` and `admin-frontend/vitest.config.ts` exists; `client-frontend` has the same pair.
- **Fixtures / seed:** hand-built §7.1 DTO literals — a `StaffOut[]` covering one row per status and one RM with a non-empty book, a `MatrixOut` whose `pages` is the full 16-entry set and whose `levels` reproduce the D-11 day-one seed (so the `VIEW` cases under test are the real ones), an `OverrideOut[]` with one expiring-soon and one no-expiry row, and an `AuditOut[]`. No factory library is added — none is installed, and literal fixtures read better for a fixed 16 × 6 world.
- **Isolation:** hermetic. No network, no `localStorage`, no shared module state between files; safe to run in parallel.
- **Layer isolation (critical):** tests import only this layer's own code plus React Testing Library and Vitest. They must not import from `api-backend/`, stand up a backend, or hit a real endpoint. The seam is faked with `vi.mock` of `@/app/(roles)/admin/actions` (and of `@/server/admin` where a unit is tested below the wrapper), returning §7.1-shaped `APIResult` objects — `{success:true,data:<DTO fixture>}` for the happy path, `{success:false,code:"HTTP_409",error:"matrix_changed_since_read"}` and friends for the failure paths. `useAuth` is faked with `vi.mock` of `@/components/auth/AuthProvider` returning a `portalUser` with a chosen `grants` map. Firebase is never initialised.
- **Test location:** `admin-frontend/tests/**` and `client-frontend/tests/**`, mirroring the source path (e.g. `admin-frontend/tests/hooks/usePageAccess.test.ts`, `admin-frontend/tests/lib/admin/catalog.test.ts`). **Never co-located next to source.**
- **Commit policy:** tests are **never committed**. Both `tests/` dirs are already git-ignored (`admin-frontend/.gitignore:11` → `tests/`; `client-frontend/.gitignore:41` → `/tests`), so this is the existing arrangement, not a new one. They run locally / pre-hand-off, not from repo-committed CI.
- **Code generation:** the concrete test code is written by the `test-gen` skill (arg per §8.4) into those two dirs, using §8.2/§8.3 as its spec. This doc embeds no test code.

### 8.2 Coverage matrix

| Unit | Behaviour(s) to prove | Seam mocks needed |
|---|---|---|
| FE-1 | The three level spellings are the only ones the level maps accept; every label/glyph resolves for each of `NONE`/`VIEW`/`EDIT`; `isReduction` is true for any `→ NONE` and for `EDIT → VIEW` only | none |
| FE-2 | The derived catalog is exactly `PAGES`' key set, no page appears in two groups, cell keys are role-code-based and collision-free, the ADMIN×`admin.*` lock holds and holds nowhere else | none |
| FE-3 | The script passes on a correct registry and exits non-zero when a `PageId` is renamed or the fixture page set diverges | none (fixture is local) |
| FE-4 | `usePageAccess` returns the granted level, and `"NONE"` for a missing key / missing map / missing user; `useCanEdit` is true only for `"EDIT"` | `useAuth` → `portalUser.grants` |
| FE-5 | An omitted grant removes the page from `groupsFor`'s output; the guard renders `<NoAccess>` (and does **not** redirect) for a known page the grants omit; it still redirects when unauthenticated; `pageIdForPath` resolves exact and prefix paths and `null` otherwise | `useAuth`; `usePathname` |
| FE-6 | Under a `VIEW` grant every marked control in each of the 11 files is **absent from the rendered tree** (D-14), along with any container it emptied; under `EDIT` every one renders and is operable; the marker count is 32 and no marker sits on a `disabled` prop | `useAuth` per gating `PageId` |
| FE-7 | Each of the ten actions targets the right method + `ENDPOINTS.ADMIN` path and serialises the right body; `getAudit` builds its query string; a 409 surfaces as `code === "HTTP_409"` | `apiClient` |
| FE-8 | `initialsFor`/`toneFor`/`seenFor` derive correctly including their null cases; nothing derived is stored on the DTO; ids come from the DTO | none |
| FE-9 | The store renders from the four initial fetches; a mutator patches local state only on success and toasts on failure; staging survives a mutation; a failed load yields empty states rather than a throw | the actions module |
| FE-10 | Publish issues exactly one request carrying `changes` + `note` + `base_published_at`; success clears `staged` and updates `published`; a 409 keeps `staged` intact, refreshes the matrix and reports a conflict | the actions module (success + 409 + generic failure) |
| FE-11 | The Credentials step renders neither a password field nor an expiry select; `EnrollDraft` has no `pw`/`expiry`; no module imports `lib/admin/password` | none |
| FE-12 | `SendLinkModal` posts the set-password link for the right uid; `CreatedModal` switches its notice on `link_sent` and renders no password row or reveal toggle; the override modals still offer `NONE` | the actions module |
| FE-13 | `?view=overrides` selects the ledger; the "Add override" action appears only on that view; the ledger renders four stat cards from the DTO and has no back button; `ViewSwitch` has three options | the actions module |
| FE-14 | The enroll request carries one `overrides` entry per changed level with the chosen `expires_at` (and `null` for "No expiry") and the fixed reason; `start_date`/`address` are sent; the edit path sends no overrides | the actions module |
| FE-15 | The picker renders and confirm is blocked for an RM with a book, in both surfaces; nothing renders for other roles or an empty book; `reassign_book_to` is sent only when required; a 409 keeps the surface open | the actions module (success + both 409s + 422) |
| FE-16 | Neither `AuthContextValue` exposes `signUpWithEmailPassword`; neither `lib/auth-api` exports `postBackendRegister`; `auth/email-already-in-use` no longer maps; neither login page links to a register route | Firebase auth module (stubbed) |
| FE-17 | *(conditional)* a valid email link yields the form, a set password redirects to the default page, an expired link shows the fresh-link message | Firebase auth module (stubbed) |

### 8.3 Test goals (per unit)

#### FE-1
- **Positive:** each of `NONE`/`VIEW`/`EDIT` resolves to a style entry, a title, a `LEVEL_LABEL` and a `SEG_ORDER` position; the rendered label text is still "None"/"View"/"Edit".
- **Negative:** a lowercase or legacy value (`"none"`, `"OPERATE"`) is not a valid `Level` — the type rejects it, and the badge's runtime fallback resolves to the `NONE` style rather than rendering blank.
- **Invariants:** `isReduction` is true for every change whose `to` is `NONE` and for `EDIT → VIEW`, false for every widening and for a no-op; the level maps are total over the three values (no missing key).
- **Seam mocks:** none.

#### FE-2
- **Positive:** the derived catalog's `page_id` set equals `PAGES`' keys; group membership follows `subgroup`, with the two `hideFromNav` pages that carry none landing in a single "Other" group; `PAGE_BY_ID` resolves every key.
- **Negative:** no path literal is reachable from the catalog (assert against the module's own exports, not the file text — the file-text check is the grep gate); a lookup by a former path string yields nothing.
- **Invariants:** every page appears in exactly one group; `kFor` is injective over (`PageId`, `Role`) and its output never depends on array position; `isLocked` is true for `admin.*` × `ADMIN` and false for every other pair, including `admin.*` × any non-ADMIN role and any non-admin page × `ADMIN`.
- **Seam mocks:** none.

#### FE-3
- **Positive:** running the script against the shipped registry exits 0 and prints its OK line.
- **Negative:** mutating the registry — renaming a `PageId`, removing a group, dropping an entry from the page fixture — makes it exit non-zero with a message naming the failed assertion.
- **Invariants:** the script performs no network call and writes no file; it is safe to run repeatedly with the same result.
- **Seam mocks:** none — the server page set is a local fixture by design.

#### FE-4
- **Positive:** with `grants = {"pc.model-management":"EDIT"}`, `usePageAccess("pc.model-management")` is `"EDIT"` and `useCanEdit` is true.
- **Negative:** with `"VIEW"`, `useCanEdit` is false. With the key absent, with `grants` undefined, and with `portalUser` null, `usePageAccess` is `"NONE"` and `useCanEdit` is false in all three — the default-deny cases, which matter most because a wrong default silently grants write access.
- **Invariants:** the hook is pure with respect to its input map (same map, same answer, no memo staleness) and never throws for any `PageId`.
- **Seam mocks:** `@/components/auth/AuthProvider`'s `useAuth`, returning `{portalUser: {…, grants}}` — shaped per §7.1's `UserOut`.

#### FE-5
- **Positive:** with the D-11 day-one grants for COMPLIANCE, `groupsFor` lists exactly the pages that map holds and omits the rest; the guard renders children for a page the grants include.
- **Negative:** for a page the grants omit, the guard renders the `<NoAccess>` card and calls **no** router navigation — assert the absence of the redirect explicitly, since a redirect is the behaviour the proposal rejected. With no `portalUser`, it still redirects. For a pathname under the guard's `prefix` on which the user holds **no** grant at all, it redirects to `redirectTo`; for a pathname that resolves to no `PageId`, it does not block.
- **Invariants:** `pageIdForPath` resolves exact matches and `"<path>/<suffix>"` prefixes, never a partial-segment collision (e.g. `/rm/client-information` must not resolve to `rm.client-info`); an empty grant map yields zero nav groups for every role, including ADMIN and PM.
- **Seam mocks:** `useAuth` (grants) and `next/navigation`'s `usePathname` + `useRouter`.

#### FE-6
- **Positive:** with an `EDIT` grant on the file's gating page, every marked control renders and its handler fires; every container that the gating would otherwise collapse is present.
- **Negative (the primary case here — see D-11/D-14):** with a `VIEW` grant, assert each marked control is **absent from the rendered tree** — a query for it returns nothing — not that it is present-and-non-interactive. That is the whole point of D-14, so a test that only checks `toBeDisabled` would pass on the behaviour the ruling rejected. Also assert that a container whose only children were gated controls is gone with them (no empty row, no orphan divider), and that a container with surviving siblings is still present. Cover the real day-one pairs specifically — a COMPLIANCE user on the RM surfaces and on `mobo.recon-overview`/`mobo.trade-reconciliation`, and a PC user on `mobo.post-trade-allocation` (D-10) — because those are the configurations real users hit on the first login after the migration, not hypotheticals. With a `NONE` grant the same holds.
- **Invariants:** a control's own validity predicate survives inside the conditional (under `EDIT`, a control disabled for its own reason is still disabled — the two questions are not folded together); the marker count over the 11 files is exactly 32, each file references `canEdit`, and no marker is followed by a `disabled={!canEdit}`. Note for the reader of these goals: hiding and disabling are equally cosmetic — `require_action` on the endpoint is the real boundary — so none of these assertions is a security test.
- **Seam mocks:** `useAuth` per gating `PageId`; any data hook each component already uses is stubbed with its existing fixture shape (not part of this seam).

#### FE-7
- **Positive:** each action calls `apiClient` once with the expected path from `ENDPOINTS.ADMIN`, the expected method, and a JSON body matching the §7.1 input DTO; `getAudit` with `{limit, before}` appends both as query params and with no args appends none; `publishMatrix` always includes a `base_published_at` key, `null` included.
- **Negative:** a non-2xx from `apiClient` propagates as `{success:false}` with the status-derived `code` and is not swallowed; a 409 is distinguishable from a 422 and from a network error by `code` alone.
- **Invariants:** uid and override-id path segments are URL-encoded; no action throws (every failure is a returned envelope); `server/admin/index.ts` imports nothing from `components/`, `hooks/` or `lib/admin/`.
- **Seam mocks:** `@/server/api-client`'s `apiClient`, asserted on call args and stubbed per case.

#### FE-8
- **Positive:** `initialsFor("Amara Rahim")` is `"AR"`; a single-word name yields one letter; `toneFor` maps each status to its chip tone; `seenFor` formats a same-day timestamp, an earlier date, and returns the em-dash placeholder for `null`.
- **Negative:** `initialsFor(null)` and `initialsFor("")` return the placeholder rather than throwing or producing `"undefined"`; `seenFor` on a malformed string does not throw.
- **Invariants:** the derivations are pure functions of the DTO — calling them twice on the same row gives the same answer, and no code path writes a derived value back onto the DTO; every rendered id is the DTO's id (no generated `x1`-style key survives).
- **Seam mocks:** none.

#### FE-9
- **Positive:** given the four initial fetches, the store exposes `staff`/`overrides`/`audit`/`pages`/`roles`/`published` verbatim and in the received order; `eff` returns the published level for a present cell, the staged value when one is staged, and `"NONE"` for an omitted cell; `roleUsers` reads `user_count` rather than counting rows.
- **Negative:** a mutator whose action returns `{success:false}` leaves local state untouched and surfaces the error string; a failed initial load leaves the collections empty and does not throw; a mutation keyed on a `firebase_uid` that is not in `staff` is a no-op rather than a crash.
- **Invariants:** `staged` is never written by a read and never cleared by a failed mutation; the store issues no request outside its declared mutators and refreshers; no code path composes an audit row locally.
- **Seam mocks:** `@/app/(roles)/admin/actions` — every function stubbed to return §7.1 fixtures, with per-case failure envelopes.

#### FE-10
- **Positive:** publishing three staged cells calls `publishMatrix` exactly once with three `changes` entries, the trimmed note, and `base_published_at` equal to the current `published.at`; on success `staged` is empty and `published` comes from the response.
- **Negative:** a 409 leaves `stagedList` byte-identical, triggers a matrix re-read, reports a conflict, and does not close the modal; a generic failure reports the error and also leaves `staged` intact; publishing with nothing staged issues no request.
- **Invariants:** exactly one request per publish regardless of cell count; `base_published_at` is always present in the body and is `null` (not omitted, not a locally generated timestamp) when the matrix has never been published; a `NONE` change is sent as `level: "NONE"` and never as a row deletion the FE performs itself.
- **Seam mocks:** the actions module's `publishMatrix` and `getMatrix`, with success / `HTTP_409` / `HTTP_500` variants.

#### FE-11
- **Positive:** the Credentials step renders the invitation checkbox and the no-second-approver notice, and its stepper summary reads "Set-password link sent" for a new user and "Credentials unchanged" in edit mode.
- **Negative:** the step renders no password input, no regenerate or copy button, and no expiry select; a blank draft has no `pw` or `expiry` property.
- **Invariants:** no module in the tree imports `lib/admin/password`; no request body produced by the enroll flow contains a `password` key.
- **Seam mocks:** the actions module (for the enroll submit assertion).

#### FE-12
- **Positive:** `SendLinkModal`'s confirm calls the set-password-link action with the target's `firebase_uid` exactly once; `CreatedModal` with `link_sent: true` shows the sent notice; `ReactivateModal` patches status to `"ACTIVE"` and then sends a link.
- **Negative:** `CreatedModal` with `link_sent: false` shows the warning notice pointing at the row menu and still presents the account as created; no surface renders a password row or a reveal toggle; no rendered string matches "temporary password" case-insensitively; `ReactivateModal` never sets `"INITIATED"`.
- **Invariants:** both override modals still offer all three levels including `None`, and a `None` selection produces a `POST /overrides` body with `level: "NONE"` rather than being dropped or rewritten.
- **Seam mocks:** the actions module (`sendSetPasswordLink`, `updateStaff`, `grantOverride`).

#### FE-13
- **Positive:** mounting System Config with `?view=overrides` renders the ledger; the `ViewSwitch` offers three options and switches between all three; the ledger's four stat cards compute from the `OverrideOut[]` fixture (including the expiring-soon count off `expiring_soon`).
- **Negative:** the "Add override" header action is absent on the matrix and role views; the ledger renders no `PageHeader` of its own and no "Back to directory" button; Enroll User's view union has no `"overrides"` member.
- **Invariants:** `ManageOverridesModal` is still reachable from a directory row and still lives under Enroll User; switching views does not rewrite the URL or lose staged changes.
- **Seam mocks:** the actions module (`getOverrides`, `grantOverride`, `revokeOverride`).

#### FE-14
- **Positive:** with two changed levels and an expiry of "90 days", the enroll body carries two `overrides` entries with the right `page_id`/`level`, the fixed reason, and a non-null `expires_at`; `start_date` and `address` are present; `send_link` mirrors the checkbox.
- **Negative:** "No expiry" yields `expires_at: null`; no changed level yields no entries; the edit path sends a `StaffUpdateIn` with no `overrides` key; the expiry select is not rendered when the override count is zero.
- **Invariants:** one request per enrollment regardless of override count; every entry's `page_id` is a real `PageId`; the reason string is identical across entries and matches the step's own notice copy.
- **Seam mocks:** the actions module (`enrollStaff`).

#### FE-15
- **Positive:** for an RM with `client_count: 23`, `open_ticket_count: 4`, the deactivate modal renders the picker with those two numbers, lists only other active RMs, and on confirm sends `status: "DEACTIVATED"` plus `reassign_book_to`; the wizard's Role step shows the same picker when that RM's role is changed to `MOBO` and sends `reassign_book_to` on save.
- **Negative:** confirm/save is disabled until a receiver is chosen; no picker renders for a PC, COMPLIANCE, PM or ADMIN user, nor for an RM whose `client_count` is `0` or `null`, and those patches carry no `reassign_book_to`; changing an RM's role back to `RM` shows the ordinary notice; a 409 from either trigger, and a 422 for an invalid receiver, leave the surface open with the picker visible and surface the server's message.
- **Invariants:** the receiver list never contains the user being changed, a non-`ACTIVE` user, or a non-RM; both surfaces evaluate the same "about to stop being an active RM" predicate, so they cannot disagree; the "not undone on reactivation" line is present whenever the picker is.
- **Seam mocks:** the actions module (`updateStaff`) with success, both 409 messages, and the 422.

#### FE-16
- **Positive:** `useAuth`'s value exposes `signInWithGoogle`, `signInWithEmailPassword`, `signOutUser`, `getIdToken`, `refreshPortalUser` — and a successful auth-state change always attempts the login bind and sets `portalUser`.
- **Negative:** the context value has no `signUpWithEmailPassword` key; `lib/auth-api` has no `postBackendRegister` export; `formatFirebaseAuthError("auth/email-already-in-use")` falls through to the generic message rather than the registration copy; neither login page renders a link whose href is a register route. Assert all four in **both** frontends.
- **Invariants:** no module imports `createUserWithEmailAndPassword`; no request is ever issued to a `/api/dev/register` path.
- **Seam mocks:** `firebase/auth` stubbed (no real initialisation); `postBackendLogin` stubbed to return a `PortalUser`.

#### FE-17
- **Positive:** *(only if this unit exists)* a valid email link renders the two-field form; a matching pair calls `updatePassword` once and then navigates to `/`.
- **Negative:** a non-sign-in-link URL redirects to `/login`; mismatched fields block submit without calling Firebase; an expired action code renders the ask-for-a-fresh-link message.
- **Invariants:** the page never creates an identity and never posts a password to the backend; it is reachable without a grant map.
- **Seam mocks:** `firebase/auth`'s `isSignInWithEmailLink`, `signInWithEmailLink`, `updatePassword`; `next/navigation`'s `useRouter`.

### 8.4 Aggregate gate

- All unit tests green is a **local gate** run before commit / hand-off (§3.2). A red test blocks its unit. The tests themselves are never committed — both `tests/` dirs are git-ignored — so this gate runs on the implementer's / orchestrator's machine, not from repo-committed CI.
- Target coverage for changed lines: **≥ 90%** of new or changed statements in `admin-frontend/{lib/pages-config.ts,lib/admin,hooks,server/admin,components/admin,components/auth}` and in the FE-16 files of both frontends. The 32 gate sites are covered by presence/disabled assertions rather than by line coverage of their host components.
- **Chosen `test-gen` level for this layer: `thorough`** *(Recommend)* — this is an authorisation layer where the failure mode is silent over-permission, and `thorough`'s boundary and invalid-input classes are exactly where a default-deny gets it wrong (a missing grant key, a `null` `client_count`, a `NONE` override read as absence); `standard` would exercise one negative per goal and miss those.

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] Every §6 unit committed on `claude/admin-pages-backend-proposal-f0c9fc-fe`; each commit left the branch green. FE-17 is either committed or explicitly recorded as dropped because Q-5 selected the reset link.
- [ ] `npx vitest run && npx tsc --noEmit && npx next lint` green in **both** `admin-frontend/` and `client-frontend/`.
- [ ] `npx tsx admin-frontend/lib/pages.check.ts` prints `pages.check.ts: OK`.
- [ ] Every § Dead code purged frontend grep returns nothing, across both frontends: `OPERATE`, `temporary password` (case-insensitive), `genPassword`, `mock/admin-data`, `ROLE_PAGES`, `ALL_OPERATE`, `ALL_EDIT`, `accessLevel(`, `pagesForRole`, `rolesForPath`, `seedLevels`, `ROLE_IDX`, `PAGE_BY_PATH`, `nextId`, `signUpWithEmailPassword`, `postBackendRegister`, `isRegistering`, `email-already-in-use`, and any path literal in `lib/admin/catalog.ts`.
- [ ] `grep -ro "View/Edit Gate Function" admin-frontend --include=*.tsx | wc -l` is **32**, each of the 11 files references `canEdit`, and no marker is followed by a `disabled={!canEdit}` — every gate is a conditional render (D-14).
- [ ] `grep -rn "fetch(" admin-frontend/app/\(roles\)/admin admin-frontend/lib/admin` returns nothing — the admin pages reach the backend only through `server/admin`.
- [ ] **Day-one access matches the DB layer's stated policy, not "nothing changed".** The D-11 seed (55 rows, 30 `edit` / 25 `view`) deliberately moves access, so the FE check mirrors DB B-1's: every role still reaches every page it owns today; the seed's **only** narrowing is `shared.monthly-reports` dropping from write to read for **RM and MOBO**, with PC keeping `edit` (D-13); no role gains a *write* it does not have today; PM renders zero nav groups (D-12); and a PC user reaches Post-Trade Allocation read-only, with its marked controls **absent** (D-10 + D-14). A role whose nav parent now lists children from other domains is correct, not a regression (D-15). Anything outside DB B-1's change table is a defect.
- [ ] §7 matches the proposal's frozen § 4 verbatim — checked against the proposal on the parent branch, **not** against sibling layers' branches, which are not visible here.
- [ ] **No unresolved-ambiguity marker remains in this doc** (`grep -c "TODO" ` over §6 is 0). All three that the first draft carried (A-1 vs §4.2's division of authority, `rolesForPath`'s split, the `TODAY` importer count) are resolved in the proposal and cited as settled. If implementation surfaces a new ambiguity, it goes to the proposal first (§7.2's change protocol), not into a marker here.
  - **Exempt from that gate:** FE-17's conditionality. It is the only conditional unit left, and it is a genuine scheduling dependency — the Backend layer's BE-13 Q-5 test decides whether the set-password landing form is in scope — not an ambiguity in this doc. It is satisfied by *recording the outcome*: FE-17 committed, or FE-17 explicitly recorded as dropped.
- [ ] PR opened against `claude/admin-pages-backend-proposal-f0c9fc`. **The human owns that merge**, and the parent's merge to `main`.

**Rollback:**
- **Clean — revert the branch.** Every unit in this layer is a pure frontend change: nothing is persisted by the frontend, no migration is run, no schema or stored data is touched, and no `localStorage` key is introduced or removed. A revert restores the mock-backed store, the two access vocabularies and the inert markers, exactly as before.
- **One honest caveat, per the proposal's Rollback section:** reverting restores the `/register` pages in **both** frontends. Since their backend endpoint (`POST /api/dev/register`) is deleted by the Backend layer, a reverted frontend against a non-reverted backend leaves two routes that 404 on submit — visibly broken rather than dangerous, and `lib/auth-api.ts`'s restored 404 special-case ("Self-registration is not available in this environment.") is the message a user would see. **If the register purge is the part being kept, revert selectively** — FE-16 touches no file any other unit touches, so it reverts, or survives a revert, independently.
- **No unit in this layer is lossy.** The one deletion with content behind it — `PAGE_CATALOG`'s `levels[]` — is promoted into the DB layer's `page_access` seed before it is removed (D-11), so the policy survives in the database even if this branch is reverted entirely.
- **Ordering asymmetry to be aware of, not owned here:** the *forward* direction requires the Backend layer's `grants` field, because `usePageAccess` reads it and defaults to `"NONE"` — a frontend deployed ahead of the backend fails closed (every page absent from the sidebar, every marked control disabled) rather than open. That is the correct failure mode, and it is why the deploy order is DB → Backend → Frontend; the revert direction needs no coordination.
