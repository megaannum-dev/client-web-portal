# 009 — Role-Based Page Access as a Single Config, Not Scattered Hardcoding

> Status: **DRAFT — pending implementation approval.**
> Scope: `admin-frontend` only — replaces the hardcoded, per-file role→page wiring (route guards, sidebar nav, default-landing map) with one config file that declares, per role, which pages it can reach. No other layer touched.
> Constraint: byte-for-byte identical behavior for every existing role/page *grant*. No endpoint changes, no layout changes. The one deliberate exception: the registry now carries a per-grant access **level** (Operate vs. View), so a future View-only grant can hide a page's own mutating controls — but every grant that exists today is set to Operate, so nothing visibly changes for any current role.

---

## 1. Context and Motivation

Today, "which pages can role X see" is answered by reading **four separate hardcoded maps**, and they must be kept in sync by hand:

| # | File | What it hardcodes |
|---|---|---|
| 1 | `admin-frontend/app/(roles)/mobo/layout.tsx:9`, `rm/layout.tsx`, `pc/layout.tsx` | `<RoleGuard allowedRoles={["MOBO","ADMIN"]}>` — one literal array per namespace, gating the *entire* `/mobo/*`, `/rm/*`, `/pc/*` subtree at once |
| 2 | `admin-frontend/components/sidebar/SidebarNav.tsx:20-48,73-78` | `ROLE_GROUP` map (RM/MOBO/PC nav groups) plus a hand-written `role === "ADMIN"` branch that renders all three groups |
| 3 | `admin-frontend/app/page.tsx:12-17` | `ROLE_BASE_ROUTES` — the default landing route per role |
| 4 | `admin-frontend/types/portal.ts:5` | The role union itself (`"ADMIN" \| "MOBO" \| "RM" \| "PM" \| "PC" \| "COMPLIANCE"`) |

`ADMIN` already exists as a role and already sees every page — but only because someone remembered to add `"ADMIN"` to three `allowedRoles` arrays *and* write a special `role === "ADMIN"` branch in the sidebar *and* point its default route at MOBO's dashboard. Adding a new cross-cutting role, or carving a role-exclusive page out of an existing namespace (e.g. a page only "Admin" can reach), currently means editing N files with no single place that answers "what can this role see."

Guarding is also **per-namespace, not per-page**: `RoleGuard` is applied once at each `layout.tsx` and gates every page under that URL prefix identically. There's no way today to nest a role-exclusive page inside an existing tree, or to give one page a narrower audience than its siblings, without inventing a new URL prefix and copy-pasting another `layout.tsx`.

Access today is also **binary** — a role either reaches a page with full use of it, or doesn't reach it at all. `RoleGroup.tsx`'s parent row already links to `group.home` (confirmed: clicking the collapsible parent nav item *is* how a role reaches its one default page — e.g. `home: "/pc/model-management"` for PC, `home: "/mobo/dashboard"` for MOBO, `RoleGroup.tsx:101`), so "one confirmed default page per role" is already true and just needs to stay config-driven (§B-3). What's missing is a middle grant between "full access" and "no access": the backend's action model (per [[mobo_backend_integration]], e.g. `RECON_VIEW`) already distinguishes viewing a resource from operating on it (its mutating endpoints — see `admin-frontend/server/pc/index.ts:34-85` for `createModel`/`updateModel`/`publishModel`/`deleteModel`, all POST/PATCH). The frontend has no equivalent — any role that can reach a page can fully use it, full stop.

> **Why now / why this order.** The user-facing requirement ("Admin sees everything, plus enroll-user is Admin-only") is achievable today only by more hand-written special-casing — the same trap that produced the `ADMIN` branch in `SidebarNav`. This proposal removes the trap before a fifth call-site gets added.

---

## 2. Goals

1. Every role→page relationship is declared in **one file** (a new page registry + role-access map), replacing the four scattered maps in §1.
2. Granting a role access to a page is a **data edit** in that one file — no `layout.tsx`, `SidebarNav.tsx`, or `page.tsx` edit required for any role/page combination that already exists in the registry.
3. Each role has exactly one **default page** (where it lands right after login, and what its collapsible parent nav item links to — already the same route today, confirmed in §1), and that default is a one-line, per-role entry in the same file.
5. `ROLE_PAGES.ADMIN` is the literal union of every `PageId` in the registry — grep-checkable, so "Admin sees all pages" is an assertion the file itself satisfies, not a claim that has to be verified by reading three components.
6. The registry format can express a page visible to exactly one role, independent of what URL namespace it lives under — proven with one worked example (`admin.enroll-user`, a placeholder-only stub — see §Non-Goals).
7. `RoleGuard` and `RoleGroup` (the two existing presentational/guard components) are **not modified** — only the literal values fed into them change, from hand-typed arrays to values computed from the registry.
8. Each role/page grant carries an explicit **access level** — `OPERATE` (can view and trigger the page's own mutating actions) or `VIEW` (read-only; page-level, not caught by the route guard — a page must opt in to honor it) — declared in the same one file, mirroring the backend's view-vs-operate action split. A page absent from a role's grants stays hidden from the sidebar and blocked by the route guard, exactly like today.
9. Every grant that exists today (RM, MOBO, PC, ADMIN on their current pages) is set to `OPERATE` in the registry — the new level is additive, so no current role's usable functionality changes.

## 3. Non-Goals

- **Action/permission-level granularity below "operate vs. view"** (per-button, per-field, or the backend's full action taxonomy) — this proposal adds exactly one binary split on top of page-level access, matching the two states ("full use" vs. "read-only") that already exist implicitly in the backend's own action model. A future proposal can go finer if a real page needs it.
- **Retrofitting every existing page's mutating controls to check the new access level.** Introducing `VIEW` as a *possible* grant doesn't make any existing page read-only-aware — a page's own create/update/publish/delete/confirm buttons (e.g. `server/pc/index.ts:34-85`'s `createModel`/`updateModel`/`publishModel`/`deleteModel`, or `confirmPeriod`) keep firing regardless of grant level until that specific page is edited to call the new `usePageAccess` hook (§B-5) and gate them. Since every current grant is `OPERATE` anyway (Goal 7), no page needs that edit yet. §C's worked example shows the pattern for one hypothetical `VIEW` grant without editing the target page's controls — doing that page-specific wiring for a real grant is a future, page-by-page follow-up.
- **Building the real "enroll internal user" feature.** The registry needs *a* role-exclusive page to prove the mechanism end-to-end, but building that page's actual form/logic is a functionality change and explicitly out of scope here. §Frontend/C ships a placeholder stub only ("Coming soon"); the real enroll flow (and the question of whether it reuses or replaces the existing public `/register` flow, which currently redirects away any already-authenticated user — see `app/(auth)/register/page.tsx:37-41`) is owned by a future proposal.
- **PM / COMPLIANCE getting real pages.** They keep their current "no pages configured" dead end — this proposal only changes how that dead end is expressed (an empty grants object in the registry, same as today's absence from the maps).
- **Renaming existing routes, roles, or endpoints.** `/mobo/dashboard`, `ADMIN`, `POST /api/auth/login`, etc. are all unchanged.

---

## Frontend — role/page access registry

### A. Current surface

| File | Role in today's design | Lines |
|---|---|---|
| `admin-frontend/types/portal.ts` | Declares the `Role` union | 5 |
| `admin-frontend/app/(roles)/mobo/layout.tsx`, `rm/layout.tsx`, `pc/layout.tsx` | Per-namespace `RoleGuard` with a hardcoded `allowedRoles` array | 9 (each) |
| `admin-frontend/components/auth/RoleGuard.tsx` | Generic guard: takes `allowedRoles: string[]`, redirects if `portalUser.role` isn't in it | 7-40 |
| `admin-frontend/components/sidebar/SidebarNav.tsx` | Hardcoded `ROLE_GROUP` map + `role === "ADMIN"` branch that renders all groups | 20-48, 73-78 |
| `admin-frontend/components/sidebar/RoleGroup.tsx` | Generic, already data-driven presentational component (`RoleGroupConfig` in → rendered nav group out) | 11-17 |
| `admin-frontend/app/page.tsx` | Hardcoded `ROLE_BASE_ROUTES` map, used by the `/` redirect | 12-17 |

Both `RoleGuard` and `RoleGroup` already take their inputs as plain props/arrays — neither one is the problem. The problem is that the *values* passed into them are hand-typed in five different places instead of read from one.

### B. Findings

#### B-1. Four sources of truth for "role → pages" (Yes — user req.)

Evidence in §A: `allowedRoles` arrays (×3 files), `ROLE_GROUP` (+ the `ADMIN` special case), and `ROLE_BASE_ROUTES` each separately encode a role's page set. They agree today only because whoever added `ADMIN` remembered to update all three. Nothing enforces that they stay in sync.

**Refactor:** introduce one registry file, `admin-frontend/lib/pages.ts`, exporting:

```ts
export type Role = "ADMIN" | "MOBO" | "RM" | "PM" | "PC" | "COMPLIANCE";

export type PageId =
  | "rm.dashboard" | "rm.onboarding-renewal" | "rm.model-subscription" | "rm.clients"
  | "mobo.dashboard" | "mobo.trade-reconciliation" | "mobo.daily-exception-report"
  | "pc.model-management" | "pc.allocation-matrix"
  | "shared.monthly-reports"
  | "admin.enroll-user";

/** OPERATE = view + use the page's own mutating actions. VIEW = read-only; enforced only
 *  by pages that opt in via usePageAccess (§B-5) — the route guard/sidebar treat OPERATE
 *  and VIEW identically (see D-6). Absence of a PageId from a role's grants = no access. */
export type AccessLevel = "OPERATE" | "VIEW";

export type PageDef = {
  id: PageId;
  path: string;                 // prefix-matched against the pathname
  label?: string;                // omit for pages with no nav entry (e.g. rm.clients detail view)
  icon?: LucideIcon;
  group?: { label: string; icon: LucideIcon; home: PageId }; // nav parent; omit for ungrouped pages
};

export const PAGES: Record<PageId, PageDef> = { /* one entry per row in the inventory below */ };

const ALL_OPERATE = Object.fromEntries(
  Object.keys(PAGES).map((id) => [id, "OPERATE"]),
) as Record<PageId, AccessLevel>;

export const ROLE_PAGES: Record<Role, Partial<Record<PageId, AccessLevel>>> = {
  RM:         { "rm.dashboard": "OPERATE", "rm.onboarding-renewal": "OPERATE", "rm.model-subscription": "OPERATE", "rm.clients": "OPERATE", "shared.monthly-reports": "OPERATE" },
  MOBO:       { "mobo.dashboard": "OPERATE", "mobo.trade-reconciliation": "OPERATE", "mobo.daily-exception-report": "OPERATE", "shared.monthly-reports": "OPERATE" },
  PC:         { "pc.model-management": "OPERATE", "pc.allocation-matrix": "OPERATE", "shared.monthly-reports": "OPERATE" },
  PM:         {},
  COMPLIANCE: {},
  ADMIN:      ALL_OPERATE,   // literal union, all OPERATE — Goal 5 + Goal 9
};

export const ROLE_DEFAULT_PAGE: Record<Role, PageId | null> = {
  RM: "rm.dashboard", MOBO: "mobo.dashboard", PC: "pc.model-management",
  ADMIN: "mobo.dashboard",   // preserves today's exact ADMIN → /mobo/dashboard behavior
  PM: null, COMPLIANCE: null,
};

/** Default-deny: any role value not present in ROLE_PAGES (a future backend role the
 *  frontend registry hasn't been updated for yet, bad/stale data, a typo) resolves to
 *  "no grants" rather than throwing or falling through to any other role's set —
 *  including ADMIN's. ADMIN's all-pages grant is reachable ONLY via the literal
 *  ROLE_PAGES.ADMIN key; grantsFor() never substitutes it for an unrecognized role. */
function grantsFor(role: string): Partial<Record<PageId, AccessLevel>> {
  return (ROLE_PAGES as Record<string, Partial<Record<PageId, AccessLevel>>>)[role] ?? {};
}

export function rolesForPath(pathname: string): Role[] {
  const page = Object.values(PAGES).find(p => pathname === p.path || pathname.startsWith(`${p.path}/`));
  if (!page) return [];
  return (Object.keys(ROLE_PAGES) as Role[]).filter(r => page.id in grantsFor(r));
}

export function accessLevel(role: string, pageId: PageId): AccessLevel | null {
  return grantsFor(role)[pageId] ?? null;
}

export function pagesForRole(role: string): PageId[] {
  return Object.keys(grantsFor(role)) as PageId[];
}
```

`rolesForPath` reproduces today's per-namespace check (every page under `/mobo` resolves to the same role set today) and additionally supports a page whose `path` doesn't share a prefix with any sibling — i.e. a role-exclusive page (Goal 6). It treats `OPERATE` and `VIEW` as equally "has access" — the route guard and sidebar are binary (reachable or not); only `accessLevel()` distinguishes the two, and only for pages that ask.

Every exported helper takes an untyped `string` for `role`, not the `Role` union, and resolves through `grantsFor` — so a value that has drifted from the `Role` union at runtime (an unrecognized string, `undefined`, `""`) still resolves safely to "no pages," never to a crash and never to `ADMIN`'s set. `PAGES` itself has no equivalent risk — it's an implementation constant, never indexed by unvalidated input.

#### B-2. Sidebar nav re-derives role→group instead of reading it once — and must fail closed, not open (Yes — user req.)

`SidebarNav.tsx:20-48` restates each role's page set a second time (as nav groups), and lines 73-78 hardcode the `ADMIN` "show all three" case by name. Beyond de-duplication, this is a security-relevant surface: a role that isn't recognized, or a page nobody has explicitly granted, must render **nothing** — never all-pages, and never a crash that a caller works around by rendering an unfiltered list. `grantsFor`'s default-deny (above) is what B-2's refactor relies on to guarantee that; `ROLE_PAGES.ADMIN`'s all-pages grant only ever applies to the literal `ADMIN` role and is never used as a fallback.

**Refactor:**

```ts
// SidebarNav.tsx
const pageIds = pagesForRole(portalUser?.role ?? "");   // "" → grantsFor("") → {} → []
const groups = groupsFor(pageIds);   // helper in lib/pages.ts: dedupes PAGES[id].group by group.home

return (
  <>
    {groups.map(g => <RoleGroup key={g.home} group={g} isOpen={isOpen} />)}
    ...
  </>
);
```

No `role === "ADMIN"` branch, and no branch for "role I don't recognize" either — both collapse into `pagesForRole` returning `[]` (nothing rendered) or `ADMIN`'s full set, by construction, with the same one function. `RoleGroup.tsx` itself is untouched; it already accepts a `RoleGroupConfig` shape.

#### B-3. Default landing route is a fourth, independent map (Yes)

`app/page.tsx:12-17`'s `ROLE_BASE_ROUTES` restates the same information a third time.

**Refactor:**

```ts
// app/page.tsx
const destination = portalUser?.role
  ? PAGES[ROLE_DEFAULT_PAGE[portalUser.role] ?? ""]?.path
  : undefined;
```

Same fallback behavior as today: if the role has no default page (`PM`, `COMPLIANCE`, or an unlisted role), `destination` is `undefined` and the existing "No pages are configured for your role yet" branch (`app/page.tsx:41-46`) still renders unchanged.

This is the same page as the role's nav-group `home` (e.g. `ROLE_DEFAULT_PAGE.PC === "pc.model-management"` and `PAGES["pc.model-management"].group.home === "pc.model-management"`) — one config states it once, and both "what shows first on login" and "what the parent nav item links to" (Goal 3) read the same value instead of risking drift between two independently-maintained routes.

#### B-4. Per-namespace guards become a one-line lookup instead of a literal array (Yes)

**Refactor**, applied identically to `mobo/layout.tsx`, `rm/layout.tsx`, `pc/layout.tsx`:

```tsx
// before
<RoleGuard allowedRoles={["MOBO", "ADMIN"]}>{children}</RoleGuard>

// after
<RoleGuard allowedRoles={rolesForPath("/mobo/dashboard")}>{children}</RoleGuard>
```

`RoleGuard.tsx` itself needs zero changes — it already takes `allowedRoles: string[]`.

#### B-5. No way for a page to know whether its own role grant is Operate or View-only (Yes — user req.)

Nothing today distinguishes "can use this page fully" from "can only look at it" — every guard/nav path is presence-only. A page that wants to honor a `VIEW` grant (e.g. hide/disable the buttons behind `server/pc/index.ts`'s `createModel`/`updateModel`/`publishModel`/`deleteModel`/`confirmPeriod`) has no signal to check.

**Refactor:** add one hook next to the registry, `admin-frontend/hooks/usePageAccess.ts`:

```ts
export function usePageAccess(pageId: PageId): AccessLevel | null {
  const { portalUser } = useAuth();
  return portalUser ? accessLevel(portalUser.role, pageId) : null;
}
```

A page that has mutating controls calls this once and gates them:

```tsx
const access = usePageAccess("pc.model-management");
...
{access === "OPERATE" && <button onClick={publishModel}>Publish</button>}
```

This is opt-in per page — see Non-Goals for why no existing page is edited to call it in this proposal.

#### C. Worked examples — role-exclusive page and a View-only grant (Goals 6 & 8 proof)

**Role-exclusive page.** Add to the registry:

```ts
"admin.enroll-user": { id: "admin.enroll-user", path: "/admin/enroll-user", label: "Enroll User", icon: UserPlus,
  group: { label: "Admin", icon: ShieldCheck, home: "admin.enroll-user" } },
```

...and it's already present in `ROLE_PAGES.ADMIN` (which is `ALL_OPERATE = Object.keys(PAGES)`, so any new `PageId` is automatically Admin-visible — see D-3). For a role-exclusive page that should *not* also go to Admin's page set, the addition is instead one explicit key in exactly one role's grants object. A new `admin-frontend/app/(roles)/admin/layout.tsx` and `admin-frontend/app/(roles)/admin/enroll-user/page.tsx` (rendering a placeholder — "Coming soon", no form, no API call) follow the exact same pattern as B-4: `<RoleGuard allowedRoles={rolesForPath("/admin/enroll-user")}>`, which resolves to `["ADMIN"]`. No other role's guard, nav, or default route changes.

**View-only grant.** A plausible real future ask — Compliance gets read-only visibility into PC's models without being able to publish/delete them:

```ts
COMPLIANCE: { "pc.model-management": "VIEW", "shared.monthly-reports": "OPERATE" },
```

With only this registry edit: `rolesForPath("/pc/model-management")` now includes `COMPLIANCE`, so the route guard lets Compliance in and the sidebar shows the page (per Goal 8 — `VIEW` is still "has access", not "no access"). What this edit alone does **not** do: make `pc/model-management/page.tsx`'s own Publish/Delete/Confirm buttons disappear for Compliance — that page hasn't been changed to call `usePageAccess` (B-5), so those controls stay live for anyone who reaches the page, same as today. Making a specific `VIEW` grant actually read-only requires that specific page to opt in — explicitly out of scope here (see Non-Goals) and not needed for any *current* grant, since every current grant is `OPERATE`.

### D. Summary of changes

| # | Change | Required? | Effort |
|---|---|---|---|
| B-1 | New `admin-frontend/lib/pages.ts` registry (`PAGES`, `ROLE_PAGES` w/ `AccessLevel`, `ROLE_DEFAULT_PAGE`, `grantsFor`, `rolesForPath`, `accessLevel`, `pagesForRole` — all default-deny per D-7) | Yes — user req. | S |
| B-2 | `SidebarNav.tsx`: drop `ROLE_GROUP` + `ADMIN` branch, render from registry | Yes | S |
| B-3 | `app/page.tsx`: drop `ROLE_BASE_ROUTES`, look up `ROLE_DEFAULT_PAGE` | Yes | XS |
| B-4 | `mobo/layout.tsx`, `rm/layout.tsx`, `pc/layout.tsx`: `allowedRoles` becomes `rolesForPath(...)` | Yes | XS (×3) |
| B-5 | New `admin-frontend/hooks/usePageAccess.ts` hook | Yes — user req. | XS |
| C | Add `admin.enroll-user` placeholder page + `admin/` route group, as proof of Goal 6; add the Compliance/`VIEW` example grant to the registry as proof of Goal 8 (no page edited) | Recommend | S |

No change to: `RoleGuard.tsx`, `RoleGroup.tsx`, any page's internal component/UI, `types/portal.ts`'s `Role` union, any API route, any endpoint contract.

---

## Design decisions (settled)

- **D-1 — Access unit is the page, not the URL namespace.** Needed so a role-exclusive page can be declared without inventing rules for "partial namespace access." `rolesForPath` resolves per-`PageDef.path`, and today's namespace-wide behavior (`/mobo/*` all shares one role set) falls out naturally because every page under a namespace happens to list the same roles — no special case required.
- **D-2 — Plain `Record`/string-literal types, not enums.** Matches the existing style in `types/portal.ts` (`Role` is a string union, not a TS `enum`).
- **D-3 — `ADMIN`'s page grants are `Object.keys(PAGES)` all set to `OPERATE`, not a maintained literal object.** So "Admin sees and can use everything" stays true by construction as new pages are added to the registry — no second edit needed to keep Admin in sync.
- **D-4 — `RoleGuard` and `RoleGroup` keep their existing prop signatures.** Only call-sites change what they pass in. Keeps the diff to config + call-sites, and guarantees zero behavior change for the two components actually rendering UI.
- **D-5 — Access level is a per-grant value (`OPERATE`/`VIEW`), not a second parallel map.** One object (`ROLE_PAGES[role][pageId]`) answers both "does this role reach this page" (key present) and "how" (its value) — avoids a fifth source of truth.
- **D-6 — The route guard and sidebar are still binary.** `VIEW` and `OPERATE` are identical from `RoleGuard`'s and `SidebarNav`'s point of view — both mean "show it." Only a page that explicitly calls `usePageAccess` sees the distinction. This keeps the guard/nav components untouched (D-4) and matches the user's stated rule: only "no access" hides a page from the sidebar.
- **D-7 — Default-deny (Yes — user req., security).** Every registry lookup goes through `grantsFor(role)`, which resolves an unrecognized role to `{}` (no pages), never to a crash and never to `ADMIN`'s or any other role's grants. `ADMIN`'s all-pages set is reachable *only* via the literal `ROLE_PAGES.ADMIN` key — there is no fallback path, default parameter, or `??`-chain anywhere in the registry that can substitute it in for a different or unrecognized role. Net effect: a page nobody has explicitly granted to a role renders for no one and is unreachable by direct URL for no one, including a role value that doesn't exist yet in `ROLE_PAGES` (e.g. a new backend role added before the frontend registry catches up).

---

## Execution & verification

1. Add `admin-frontend/lib/pages.ts` with the full existing inventory (9 real pages + `shared.monthly-reports`), every grant set to `OPERATE` — no call-site changes yet. Verify: file compiles, matches the inventory in §A/B-1 exactly (every existing route has exactly one `PageId`); a unit test for `grantsFor`/`rolesForPath`/`pagesForRole` asserts they return `{}`/`[]`/`[]` for a role string not present in `ROLE_PAGES` (e.g. `"BOGUS"`, `""`, `undefined`) — the D-7 default-deny guarantee (Yes — user req., security).
2. Swap the three `layout.tsx` guards (B-4) and `app/page.tsx` (B-3) to read from the registry. Verify: for each of `RM`, `MOBO`, `PC`, `ADMIN`, `PM`, `COMPLIANCE`, manually log in and confirm identical redirect/landing behavior to pre-change (same destination or same "no pages configured" state).
3. Swap `SidebarNav.tsx` (B-2). Verify: for each role, the rendered nav groups/labels/order/icons are pixel-identical to today's (diff the rendered DOM or screenshot before/after).
4. Add `usePageAccess` (B-5) — unused by any page yet, so this step has nothing to manually verify beyond a type-check.
5. (Recommend) Add the `admin.enroll-user` placeholder and the Compliance/`VIEW` example grant (§C) as live proof of Goals 6 and 8. Verify: an `ADMIN` session reaches `/admin/enroll-user` and sees the stub, every other role is redirected away exactly like any other unauthorized route today; a `COMPLIANCE` session reaches `/pc/model-management` (new) and its Publish/Delete controls are still visible (documented limitation, not a bug — see §C).

**Human gate:** none required beyond the standard PR review — this is additive/reversible frontend wiring with no migration, no endpoint change, and no data at risk.

---

## Rollback

Purely additive/reversible: revert the branch. No persisted state, no migration, no endpoint touched — a `git revert` restores the four hardcoded maps exactly as they are today.
