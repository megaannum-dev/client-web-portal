# 009 — Role-Based Page Access as a Single Config · Implementation Details — Frontend

> Status: **DRAFT — pending implementation.**
> Implements: `docs/proposals/009-2026-07-07-role-based-page-access-config.md` § Frontend (findings B-1 through B-5, worked example §C).
> Layer: Frontend — **single-layer proposal, this is the only impl doc.**
> Sibling layer docs: none (single-layer).
> Execution schedule: `docs/execution-schedules/009-role-based-page-access-config-fe.md`.
> Branch: `frontend-rolebased-architecture-redesign-fe` — cut from parent `frontend-rolebased-architecture-redesign`.
> Builds on / prerequisites: none — additive, no migration, no endpoint touched.

---

## 1. Identity & cross-references

| Reference | Location |
|---|---|
| Proposal | `docs/proposals/009-2026-07-07-role-based-page-access-config.md` § Frontend |
| Execution schedule | `docs/execution-schedules/009-role-based-page-access-config-fe.md` |
| Sibling layer impl docs | none (single-layer) |
| Builds on | none |

---

## 2. Branch & session contract

- **Branch:** `frontend-rolebased-architecture-redesign-fe` — all units land on this one branch, cut from parent `frontend-rolebased-architecture-redesign`. Human owns the merge back to parent.
- **Isolation:** self-contained in `admin-frontend/`. No cross-repo, no endpoint change, no shared state with `client-frontend` or `api-backend`.
- **Preconditions:**
  - [ ] Proposal 009 approved as-is (§ Design decisions D-1…D-7).
  - [ ] Parent branch `frontend-rolebased-architecture-redesign` checked out clean.
- **Read-first inventory** (every existing file a unit touches — no discovery needed at session start):
  - `admin-frontend/types/portal.ts` — the `Role` union; FE-1 re-exports it, does not change it.
  - `admin-frontend/components/sidebar/SidebarNav.tsx` — FE-3 rewrites `ROLE_GROUP` + `ADMIN` branch.
  - `admin-frontend/components/sidebar/RoleGroup.tsx` — read only (its `RoleGroupConfig` shape is the target of FE-1's `groupsFor`).
  - `admin-frontend/components/auth/RoleGuard.tsx` — read only (unchanged, D-4).
  - `admin-frontend/app/page.tsx` — FE-4 rewrites `ROLE_BASE_ROUTES`.
  - `admin-frontend/app/(roles)/mobo/layout.tsx`, `rm/layout.tsx`, `pc/layout.tsx` — FE-5 rewrites each `allowedRoles` literal.
  - `admin-frontend/components/auth/AuthProvider.tsx` — read only (source of `useAuth().portalUser.role` used by FE-2).
- **Hand-off / exit signal:** all FE-* units committed, `npm run lint` and `npm run build` green, self-check script (§8) prints all `OK`, PR opened against parent branch.

---

## 3. Conventions & engineering principles

### 3.1 Codebase conventions

- **Path alias:** `@/*` → repo-root of `admin-frontend/` (from `admin-frontend/tsconfig.json`). Every new import uses `@/lib/...`, `@/hooks/...`, `@/components/...`.
- **File layout:** pure/no-React modules under `lib/`; React hooks under `hooks/`; presentational components under `components/`. FE-1 is `lib/`, FE-2 is `hooks/` — no exceptions.
- **String-literal unions, not enums.** Matches existing `Role` in `types/portal.ts` (D-2).
- **Default-deny by construction (D-7).** Every registry lookup goes through `grantsFor(role)`; no `??`/fallback substitutes another role's grants. `ROLE_PAGES.ADMIN`'s all-pages set is reachable **only** via the literal `ADMIN` key.
- **No new dependencies.** Pure TS + existing React + existing `lucide-react` icons. No test framework installed and none added by this branch — see §3.2 for the runnable check.
- **`"use client"` only where already required.** `lib/pages.ts` stays server-safe (no React import). `hooks/usePageAccess.ts` is client (uses `useAuth`).

### 3.2 CI/CD & engineering discipline

- **Trunk-friendly, small units.** Each FE-* unit is one atomic commit leaving the branch green (`npm run lint && npm run build`).
- **Additive first.** FE-1 (registry) and FE-2 (hook) land as pure additions before any call-site is rewritten. FE-3/4/5 swap call-sites one file at a time; each commit builds.
- **Gates before merge** (must pass in CI, in this order):
  ```bash
  cd admin-frontend && npm run lint && npm run build && npx tsx lib/pages.check.ts
  ```
  No `test`/`vitest` script exists in `admin-frontend/package.json` and this branch does not add one — the self-check in FE-1 runs via `npx tsx` (zero new devDependencies; `tsx` is fetched on demand by `npx`).
- **Every unit independently revertible.** FE-3/4/5 each revert to their own hardcoded literal without breaking the registry or sibling call-sites.
- **No secrets, no manual steps in the merge path.** No migration, no cutover, no live-DB gate — plain PR review.

---

## 4. Architecture

**Target layout** (only files added; every other file listed is untouched-in-shape, changed-in-content only):

```
admin-frontend/
├── lib/
│   ├── pages.ts             # NEW (FE-1) — the sole role×page registry + pure lookups
│   └── pages.check.ts       # NEW (FE-1) — assert-based self-check, run via `npx tsx`
├── hooks/
│   └── usePageAccess.ts     # NEW (FE-2) — client hook: (pageId) → AccessLevel | null
├── components/
│   ├── sidebar/SidebarNav.tsx     # rewritten (FE-3) — renders from registry, no ADMIN branch
│   ├── sidebar/RoleGroup.tsx      # unchanged (D-4)
│   ├── auth/RoleGuard.tsx         # unchanged (D-4)
│   └── auth/AuthProvider.tsx      # unchanged
├── app/
│   ├── page.tsx                   # rewritten (FE-4) — landing route from ROLE_DEFAULT_PAGE
│   └── (roles)/
│       ├── mobo/layout.tsx        # rewritten (FE-5) — allowedRoles from rolesForPath
│       ├── rm/layout.tsx          #   "
│       ├── pc/layout.tsx          #   "
│       └── admin/                 # NEW (FE-6, optional) — worked-example route group
│           ├── layout.tsx
│           └── enroll-user/page.tsx
└── types/portal.ts                # unchanged; Role union stays authoritative here
```

**Dependency direction:**
`lib/pages.ts` (pure, zero React) ← `hooks/usePageAccess.ts` (React) ← every consumer (`SidebarNav`, `app/page.tsx`, each `layout.tsx`, any page opting into `usePageAccess`). `lib/pages.ts` imports **nothing** from `components/`, `hooks/`, or `app/`. `RoleGroup.tsx` and `RoleGuard.tsx` do not import from `lib/pages.ts` — their callers do.

**External seams:** none — no API contract, no DB, no cross-service boundary.

---

## 5. Modules

### 5.1 `lib/pages` — the single registry

- **Responsibility:** hold the *only* role×page mapping in the codebase, and expose pure lookups (`rolesForPath`, `accessLevel`, `pagesForRole`) with default-deny (D-7).
- **Files:** `admin-frontend/lib/pages.ts`, `admin-frontend/lib/pages.check.ts`.
- **Public surface:**
  ```ts
  export type { Role, PageId, AccessLevel, PageDef, NavGroup };
  export const PAGES: Record<PageId, PageDef>;
  export const ROLE_PAGES: Record<Role, Partial<Record<PageId, AccessLevel>>>;
  export const ROLE_DEFAULT_PAGE: Record<Role, PageId | null>;
  export function rolesForPath(pathname: string): Role[];
  export function accessLevel(role: string, pageId: PageId): AccessLevel | null;
  export function pagesForRole(role: string): PageId[];
  export function groupsFor(pageIds: PageId[]): NavGroup[];
  export function defaultPathFor(role: string): string | null;
  ```
  (`grantsFor` is intentionally *not* exported — it's an internal default-deny gate; callers use the exported lookups.)
- **Owns features:** FE-1.

### 5.2 `hooks/usePageAccess` — React binding

- **Responsibility:** expose the current user's access level for one `PageId`.
- **Files:** `admin-frontend/hooks/usePageAccess.ts`.
- **Public surface:** `export function usePageAccess(pageId: PageId): AccessLevel | null;`
- **Owns features:** FE-2.

### 5.3 `components/sidebar/SidebarNav` — registry-driven nav

- **Responsibility:** render the role's granted nav groups. No `role === "ADMIN"` branch.
- **Files:** `admin-frontend/components/sidebar/SidebarNav.tsx`.
- **Public surface:** unchanged (`<SidebarNav isOpen>`).
- **Owns features:** FE-3.

### 5.4 `app/page` — landing redirect

- **Responsibility:** redirect authenticated user to their `ROLE_DEFAULT_PAGE` path; unchanged "no pages configured" fallback for empty defaults.
- **Files:** `admin-frontend/app/page.tsx`.
- **Public surface:** unchanged.
- **Owns features:** FE-4.

### 5.5 `app/(roles)/*/layout` — per-namespace guards

- **Responsibility:** each existing layout swaps its literal `allowedRoles` for `rolesForPath(...)`.
- **Files:** `admin-frontend/app/(roles)/mobo/layout.tsx`, `rm/layout.tsx`, `pc/layout.tsx`.
- **Owns features:** FE-5.

### 5.6 `app/(roles)/admin` — Goal 6 & 8 proof (Recommend)

- **Responsibility:** live proof that a role-exclusive page needs only registry + layout + placeholder page, no `SidebarNav`/`RoleGuard`/`RoleGroup` edit.
- **Files:** `admin-frontend/app/(roles)/admin/layout.tsx`, `admin-frontend/app/(roles)/admin/enroll-user/page.tsx`.
- **Owns features:** FE-6.

---

## 6. Features

### FE-1 — `lib/pages.ts` registry + `lib/pages.check.ts` self-check (Yes — user req.)

- **Proposal ref:** § Frontend B-1, D-7.
- **Module:** `lib/pages`.
- **Files:**
  - create `admin-frontend/lib/pages.ts`
  - create `admin-frontend/lib/pages.check.ts`
- **Dependencies:** none — parallel-safe, additive.

**Contract:**

```ts
// admin-frontend/lib/pages.ts
import {
  Briefcase, Building2, Users, Layers, Grid3x3,
  ArrowLeftRight, ShieldAlert, CalendarDays, UserPlus, ShieldCheck,
  type LucideIcon,
} from "@/lib/icons";

export type Role = "ADMIN" | "MOBO" | "RM" | "PM" | "PC" | "COMPLIANCE";

export type AccessLevel = "OPERATE" | "VIEW";

export type PageId =
  | "rm.dashboard" | "rm.onboarding-renewal" | "rm.model-subscription" | "rm.clients"
  | "mobo.dashboard" | "mobo.trade-reconciliation" | "mobo.daily-exception-report"
  | "pc.model-management" | "pc.allocation-matrix"
  | "shared.monthly-reports"
  | "admin.enroll-user";

export type NavGroup = {
  label: string;
  icon: LucideIcon;
  home: string;                                   // resolved path of the group's home PageId
  pages: { label: string; href: string; icon: LucideIcon }[];
};

export type PageDef = {
  id: PageId;
  path: string;
  label?: string;
  icon?: LucideIcon;
  group?: { label: string; icon: LucideIcon; home: PageId };
};

export const PAGES: Record<PageId, PageDef> = {
  "rm.dashboard":              { id: "rm.dashboard",              path: "/rm/dashboard",              group: { label: "Relationship Manager", icon: Briefcase, home: "rm.dashboard" } },
  "rm.onboarding-renewal":     { id: "rm.onboarding-renewal",     path: "/rm/onboarding-renewal",     label: "Onboarding & Renewal", icon: Users,  group: { label: "Relationship Manager", icon: Briefcase, home: "rm.dashboard" } },
  "rm.model-subscription":     { id: "rm.model-subscription",     path: "/rm/model-subscription",     label: "Model Subscription",   icon: Layers, group: { label: "Relationship Manager", icon: Briefcase, home: "rm.dashboard" } },
  "rm.clients":                { id: "rm.clients",                path: "/rm/clients" /* detail view, no nav entry */ },
  "mobo.dashboard":            { id: "mobo.dashboard",            path: "/mobo/dashboard",            group: { label: "Middle / Back Office", icon: Building2, home: "mobo.dashboard" } },
  "mobo.trade-reconciliation": { id: "mobo.trade-reconciliation", path: "/mobo/trade-reconciliation", label: "Trade Reconciliation", icon: ArrowLeftRight, group: { label: "Middle / Back Office", icon: Building2, home: "mobo.dashboard" } },
  "mobo.daily-exception-report": { id: "mobo.daily-exception-report", path: "/mobo/daily-exception-report", label: "Daily Exceptions", icon: ShieldAlert, group: { label: "Middle / Back Office", icon: Building2, home: "mobo.dashboard" } },
  "pc.model-management":       { id: "pc.model-management",       path: "/pc/model-management",       label: "Model Management",     icon: Layers,  group: { label: "Portfolio Commander", icon: Layers, home: "pc.model-management" } },
  "pc.allocation-matrix":      { id: "pc.allocation-matrix",      path: "/pc/allocation-matrix",      label: "Allocation Matrix",    icon: Grid3x3, group: { label: "Portfolio Commander", icon: Layers, home: "pc.model-management" } },
  "shared.monthly-reports":    { id: "shared.monthly-reports",    path: "/monthly-reports",           label: "Monthly Reports",      icon: CalendarDays /* no group — ungrouped shared page */ },
  "admin.enroll-user":         { id: "admin.enroll-user",         path: "/admin/enroll-user",         label: "Enroll User",          icon: UserPlus, group: { label: "Admin", icon: ShieldCheck, home: "admin.enroll-user" } },
};

const ALL_OPERATE = Object.fromEntries(
  (Object.keys(PAGES) as PageId[]).map((id) => [id, "OPERATE" as AccessLevel]),
) as Record<PageId, AccessLevel>;

export const ROLE_PAGES: Record<Role, Partial<Record<PageId, AccessLevel>>> = {
  RM:         { "rm.dashboard": "OPERATE", "rm.onboarding-renewal": "OPERATE", "rm.model-subscription": "OPERATE", "rm.clients": "OPERATE", "shared.monthly-reports": "OPERATE" },
  MOBO:       { "mobo.dashboard": "OPERATE", "mobo.trade-reconciliation": "OPERATE", "mobo.daily-exception-report": "OPERATE", "shared.monthly-reports": "OPERATE" },
  PC:         { "pc.model-management": "OPERATE", "pc.allocation-matrix": "OPERATE", "shared.monthly-reports": "OPERATE" },
  PM:         {},
  COMPLIANCE: {},
  ADMIN:      ALL_OPERATE,  // reachable ONLY via this literal key — see D-7
};

export const ROLE_DEFAULT_PAGE: Record<Role, PageId | null> = {
  RM: "rm.dashboard", MOBO: "mobo.dashboard", PC: "pc.model-management",
  ADMIN: "mobo.dashboard",
  PM: null, COMPLIANCE: null,
};

// Default-deny gate. Every exported lookup routes through here. An unrecognized
// role resolves to {} — never to ADMIN, never to another role, never throws.
function grantsFor(role: string): Partial<Record<PageId, AccessLevel>> {
  return (ROLE_PAGES as Record<string, Partial<Record<PageId, AccessLevel>>>)[role] ?? {};
}

export function accessLevel(role: string, pageId: PageId): AccessLevel | null {
  return grantsFor(role)[pageId] ?? null;
}

export function pagesForRole(role: string): PageId[] {
  return Object.keys(grantsFor(role)) as PageId[];
}

export function defaultPathFor(role: string): string | null {
  const id = (ROLE_DEFAULT_PAGE as Record<string, PageId | null>)[role] ?? null;
  return id ? PAGES[id].path : null;
}

export function rolesForPath(pathname: string): Role[] {
  const page = Object.values(PAGES).find(
    (p) => pathname === p.path || pathname.startsWith(`${p.path}/`),
  );
  if (!page) return [];
  return (Object.keys(ROLE_PAGES) as Role[]).filter((r) => page.id in grantsFor(r));
}

// Dedupe pages' groups by home PageId, preserving encounter order.
export function groupsFor(pageIds: PageId[]): NavGroup[] {
  const byHome = new Map<PageId, NavGroup>();
  for (const id of pageIds) {
    const def = PAGES[id];
    if (!def.group) continue;
    let g = byHome.get(def.group.home);
    if (!g) {
      g = {
        label: def.group.label,
        icon: def.group.icon,
        home: PAGES[def.group.home].path,
        pages: [],
      };
      byHome.set(def.group.home, g);
    }
    if (def.label && def.icon && def.id !== def.group.home) {
      g.pages.push({ label: def.label, href: def.path, icon: def.icon });
    }
  }
  return [...byHome.values()];
}
```

```ts
// admin-frontend/lib/pages.check.ts — run: `npx tsx admin-frontend/lib/pages.check.ts`
// One assert per D-7/B-1 invariant. No test framework.
import { strict as assert } from "node:assert";
import {
  PAGES, ROLE_PAGES, accessLevel, pagesForRole, defaultPathFor, rolesForPath, groupsFor,
} from "./pages";

// D-7: default-deny for unrecognized roles.
for (const bogus of ["BOGUS", "", "admin" /* case matters */, "undefined"]) {
  assert.deepEqual(pagesForRole(bogus), [], `pagesForRole(${JSON.stringify(bogus)}) must be []`);
  assert.equal(accessLevel(bogus, "pc.model-management"), null);
  assert.equal(defaultPathFor(bogus), null);
}

// D-7: ADMIN's all-pages set is reachable only via the literal key.
assert.equal(pagesForRole("ADMIN").length, Object.keys(PAGES).length, "ADMIN grants every PageId");
assert.ok(pagesForRole("ADMIN").every((id) => ROLE_PAGES.ADMIN[id] === "OPERATE"), "ADMIN grants are all OPERATE");

// B-1: no page under a namespace resolves to a role that isn't in ROLE_PAGES.
for (const p of Object.values(PAGES)) {
  const roles = rolesForPath(p.path);
  assert.ok(roles.every((r) => r in ROLE_PAGES), `rolesForPath(${p.path}) yielded unknown role`);
}

// Parity with pre-refactor: each existing namespace resolves to exactly today's role set.
assert.deepEqual(rolesForPath("/mobo/dashboard").sort(),               ["ADMIN", "MOBO"].sort());
assert.deepEqual(rolesForPath("/rm/onboarding-renewal").sort(),        ["ADMIN", "RM"].sort());
assert.deepEqual(rolesForPath("/pc/allocation-matrix").sort(),         ["ADMIN", "PC"].sort());
assert.deepEqual(rolesForPath("/monthly-reports").sort(),              ["ADMIN", "MOBO", "PC", "RM"].sort());
assert.deepEqual(rolesForPath("/admin/enroll-user"),                   ["ADMIN"]);

// Nav grouping: role's groups match its granted pages, deduped by home.
assert.deepEqual(groupsFor(pagesForRole("PC")).map((g) => g.home),     ["/pc/model-management"]);
assert.equal(groupsFor(pagesForRole("ADMIN")).length,                  4 /* RM, MOBO, PC, Admin */);

// Default landing page ↔ nav-group home coherence.
for (const role of ["RM", "MOBO", "PC", "ADMIN"] as const) {
  const dp = defaultPathFor(role);
  assert.ok(dp && rolesForPath(dp).includes(role), `${role}'s default page must be a page it can reach`);
}

console.log("pages.check.ts: OK");
```

**Behavior / invariants:**
- `grantsFor` is the sole path from a `role` string to a grants object. No exported function bypasses it.
- `ROLE_PAGES.ADMIN` derives from `PAGES` at module-init — a new `PageId` is Admin-visible without a second edit.
- `groupsFor` dedupes by group `home` and preserves encounter order (so RM/MOBO/PC render in the same order Admin sees them today: RM, MOBO, PC).

**Done when:** file compiles; `npx tsx admin-frontend/lib/pages.check.ts` prints `pages.check.ts: OK` (zero assertion failures).

---

### FE-2 — `hooks/usePageAccess.ts` (Yes — user req.)

- **Proposal ref:** § Frontend B-5.
- **Module:** `hooks/usePageAccess`.
- **Files:** create `admin-frontend/hooks/usePageAccess.ts`.
- **Dependencies:** FE-1.

**Contract:**

```ts
// admin-frontend/hooks/usePageAccess.ts
"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { accessLevel, type AccessLevel, type PageId } from "@/lib/pages";

/**
 * Access level of the current user for one page.
 * - "OPERATE" — reach + trigger the page's own mutating actions.
 * - "VIEW"    — read-only; page must opt in to gate its own controls.
 * - null      — no grant (route guard already blocks reach; hook returns null defensively).
 */
export function usePageAccess(pageId: PageId): AccessLevel | null {
  const { portalUser } = useAuth();
  return portalUser ? accessLevel(portalUser.role, pageId) : null;
}
```

**Behavior / invariants:**
- Returns `null` for any user without a matching grant (unauthenticated, unrecognized role, or role that doesn't grant `pageId`) — never throws, never returns `"OPERATE"` as a fallback.
- Pure passthrough over `accessLevel(...)`; adds no logic beyond wiring `useAuth`.

**Done when:** compiles; import site `import { usePageAccess } from "@/hooks/usePageAccess"` type-checks. No existing page is edited to call it in this branch (Non-Goal — Retrofitting existing pages).

---

### FE-3 — `SidebarNav.tsx` rewritten from registry (Yes)

- **Proposal ref:** § Frontend B-2, D-7.
- **Module:** `components/sidebar/SidebarNav`.
- **Files:** modify `admin-frontend/components/sidebar/SidebarNav.tsx`.
- **Dependencies:** FE-1.

**Contract:**

```tsx
"use client";

import { usePathname } from "next/navigation";
import { CalendarDays } from "@/lib/icons";
import { NavItem } from "./NavItem";
import { RoleGroup } from "./RoleGroup";
import { useAuth } from "@/components/auth/AuthProvider";
import { pagesForRole, groupsFor } from "@/lib/pages";

interface SidebarNavProps { isOpen: boolean }

export function SidebarNav({ isOpen }: SidebarNavProps) {
  const pathname       = usePathname();
  const { portalUser } = useAuth();
  const groups         = groupsFor(pagesForRole(portalUser?.role ?? ""));

  const reportsActive =
    pathname === "/monthly-reports" || pathname.startsWith("/monthly-reports/");

  return (
    <nav
      className={["flex-1 flex flex-col gap-1.5", isOpen ? "px-4" : "px-2"].join(" ")}
      aria-label="Main navigation"
    >
      {isOpen && (
        <span className="px-3.5 pb-0.5 pt-1 text-[10px] font-bold uppercase tracking-[0.06em] text-secondary">
          Workspace
        </span>
      )}
      {groups.map((g) => <RoleGroup key={g.home} group={g} isOpen={isOpen} />)}

      {isOpen && (
        <span className="px-3.5 pb-0.5 pt-3.5 text-[10px] font-bold uppercase tracking-[0.06em] text-secondary">
          Shared
        </span>
      )}
      <NavItem
        href="/monthly-reports"
        icon={CalendarDays}
        label="Monthly Reports"
        active={reportsActive}
        isOpen={isOpen}
        compact
      />
    </nav>
  );
}
```

**Behavior / invariants:**
- No `role === "ADMIN"` branch. Admin renders every group because `ROLE_PAGES.ADMIN = ALL_OPERATE` — not because SidebarNav names ADMIN.
- Unknown/absent role → `pagesForRole("")` returns `[]` → `groups` is `[]` → zero workspace groups render. The Shared "Monthly Reports" link still renders below (matches today, where `AuthGuard` — not this component — gates unauthenticated users).
- `RoleGroup.tsx` is not touched (D-4). Its existing `RoleGroupConfig` prop shape is what `groupsFor` returns.

**Done when:** for each of `{RM, MOBO, PC, ADMIN, PM, COMPLIANCE}`, the rendered nav's group order/labels/hrefs/icons are byte-identical to the pre-refactor render. Verified manually via `preview_snapshot` per role, or by diffing DOM.

---

### FE-4 — `app/page.tsx` uses `defaultPathFor` (Yes)

- **Proposal ref:** § Frontend B-3.
- **Module:** `app/page`.
- **Files:** modify `admin-frontend/app/page.tsx`.
- **Dependencies:** FE-1.

**Contract:**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { defaultPathFor } from "@/lib/pages";

export default function RootPage() {
  const { user, portalUser, loading, backendSyncing } = useAuth();
  const router = useRouter();

  const isLoading   = loading || backendSyncing;
  const destination = portalUser?.role ? defaultPathFor(portalUser.role) : null;

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace("/login"); return; }
    if (destination) { router.replace(destination); }
  }, [isLoading, user, destination, router]);

  if (isLoading || destination) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="size-6 animate-spin rounded-full border-2 border-outline-variant border-t-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <p className="text-body-sm text-secondary">
        No pages are configured for your role yet.
      </p>
    </div>
  );
}
```

**Behavior / invariants:**
- `defaultPathFor("PM")`, `defaultPathFor("COMPLIANCE")`, `defaultPathFor("BOGUS")` all return `null` → the "No pages are configured" branch renders unchanged.
- Removes the local `ROLE_BASE_ROUTES` constant entirely (§B-3).

**Done when:** logged in as each of the six roles, redirect destination matches pre-refactor exactly (RM→/rm/dashboard, MOBO→/mobo/dashboard, PC→/pc/model-management, ADMIN→/mobo/dashboard, PM & COMPLIANCE→"no pages configured").

---

### FE-5 — Per-namespace layouts use `rolesForPath` (Yes)

- **Proposal ref:** § Frontend B-4.
- **Module:** `app/(roles)/*/layout`.
- **Files:** modify `admin-frontend/app/(roles)/mobo/layout.tsx`, `rm/layout.tsx`, `pc/layout.tsx`.
- **Dependencies:** FE-1. Independent of FE-3/FE-4 — safe to commit in any order after FE-1.

**Contract** (identical shape for all three; showing `mobo/layout.tsx`):

```tsx
import { RoleGuard } from "@/components/auth/RoleGuard";
import { rolesForPath } from "@/lib/pages";

export default function MoboLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={rolesForPath("/mobo/dashboard")}>
      {children}
    </RoleGuard>
  );
}
```

For `rm/layout.tsx`: `rolesForPath("/rm/dashboard")`. For `pc/layout.tsx`: `rolesForPath("/pc/model-management")`. Each path is the namespace's default/home page — arbitrary choice among sibling pages, they all share the same role set today (D-1).

**Behavior / invariants:**
- `RoleGuard.tsx` is not touched (D-4). Its `allowedRoles: string[]` contract is unchanged.
- Redirect target on unauthorized access unchanged (default `"/"`).

**Done when:** for each of `{MOBO, ADMIN, RM, PC}`, direct-URL access to a page in each namespace matches pre-refactor allow/deny exactly.

---

### FE-6 — Worked example: `admin/enroll-user` placeholder (Recommend)

- **Proposal ref:** § Frontend C (worked example).
- **Module:** `app/(roles)/admin`.
- **Files:** create `admin-frontend/app/(roles)/admin/layout.tsx`, `admin-frontend/app/(roles)/admin/enroll-user/page.tsx`.
- **Dependencies:** FE-1 (registry must contain `admin.enroll-user`, which it does per FE-1's `PAGES` block).

**Contract:**

```tsx
// admin-frontend/app/(roles)/admin/layout.tsx
import { RoleGuard } from "@/components/auth/RoleGuard";
import { rolesForPath } from "@/lib/pages";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={rolesForPath("/admin/enroll-user")}>
      {children}
    </RoleGuard>
  );
}
```

```tsx
// admin-frontend/app/(roles)/admin/enroll-user/page.tsx
export default function EnrollUserPage() {
  return (
    <div className="p-6">
      <h1 className="text-title-md text-on-surface">Enroll User</h1>
      <p className="mt-2 text-body-sm text-secondary">Coming soon.</p>
    </div>
  );
}
```

**Behavior / invariants:**
- `rolesForPath("/admin/enroll-user")` returns `["ADMIN"]` because `admin.enroll-user` is only in `ROLE_PAGES.ADMIN` (via `ALL_OPERATE`).
- No form, no API call, no i18n — literally the smallest thing that proves the mechanism end-to-end.

**Done when:** `ADMIN` session lands on `/admin/enroll-user` and sees the "Coming soon" stub; any other role attempting the URL is redirected to `/` by `RoleGuard`.

---

## 8. Internal unit testing

### 8.1 Test setup

- **Runner:** none installed in `admin-frontend/`. This branch does **not** add one — introducing vitest/jest just to check three pure functions is over-engineering for a config file. Instead, FE-1 ships one self-check script:
  ```bash
  cd admin-frontend && npx tsx lib/pages.check.ts
  ```
  `npx tsx` fetches `tsx` on demand — no new `devDependencies` entry, no lock-file churn. The command exits non-zero on any `assert` failure (Node's `strict` assert throws → `tsx` propagates a non-zero exit).
- **Fixtures / seed:** none — the registry is the fixture.
- **Isolation:** the check runs against the imported module only; no network, no filesystem, no React.

### 8.2 Coverage matrix

| Unit | Check(s) in `pages.check.ts` | Asserts |
|---|---|---|
| FE-1 | default-deny for `{"BOGUS", "", "admin", "undefined"}` | `pagesForRole`/`accessLevel`/`defaultPathFor` all null/[] — D-7 (Yes — user req., security). |
| FE-1 | `pagesForRole("ADMIN").length === keys(PAGES).length` and all `OPERATE` | D-3 — Admin grants every page. |
| FE-1 | `rolesForPath` parity for `/mobo/dashboard`, `/rm/onboarding-renewal`, `/pc/allocation-matrix`, `/monthly-reports`, `/admin/enroll-user` | Byte-for-byte parity with pre-refactor `allowedRoles` arrays. |
| FE-1 | `groupsFor(pagesForRole("PC"))` yields exactly `[/pc/model-management]`; ADMIN yields 4 groups | B-2 dedup by group home. |
| FE-1 | For every role in {RM, MOBO, PC, ADMIN}, its `defaultPathFor` is a page it can reach | Goal 3 — default page coherence with grants. |
| FE-2 | *(no automated check)* — the hook is one line over `accessLevel`; FE-1's coverage suffices. Type-check via `npm run build` is the gate. | — |
| FE-3 | *(manual)* — per-role DOM snapshot equality with pre-refactor render, via `preview_snapshot`. | Group order + labels + hrefs. |
| FE-4 | *(manual)* — per-role login redirect matches pre-refactor. | RM→/rm/dashboard etc. |
| FE-5 | *(manual)* — direct-URL allow/deny matches pre-refactor. | Namespace guards. |
| FE-6 | *(manual)* — Admin reaches `/admin/enroll-user`; others get redirected. | `rolesForPath("/admin/enroll-user") = ["ADMIN"]`. |

*Why so many "manual"*: FE-3/4/5/6 are integration behavior of a React app whose sole change is *swapping* one already-generic component prop's source. FE-1's pure-function checks prove the source is correct; installing a jsdom test harness to also assert "React renders what its props say" would be testing React itself. If a real regression surfaces post-merge, the fix is one more assert in `pages.check.ts`, not a new test framework.

### 8.3 Tests

The full check body is in FE-1's `pages.check.ts` snippet — reproduced there, not duplicated here.

### 8.4 Aggregate gate

- `npm run lint && npm run build && npx tsx lib/pages.check.ts` all green is the merge gate.
- No coverage percentage target — this branch touches ~8 files and one of them (`pages.ts`) is fully covered by `pages.check.ts`.

---

## 9. Definition of done & rollback

**Definition of done (this layer):**
- [ ] FE-1 through FE-5 committed on `frontend-rolebased-architecture-redesign-fe`; each commit builds and lints.
- [ ] FE-6 committed *or* explicitly deferred with the registry entry for `admin.enroll-user` kept (harmless — it's grants-only, has no route until the layout+page files exist).
- [ ] `npx tsx admin-frontend/lib/pages.check.ts` prints `pages.check.ts: OK`.
- [ ] Per-role manual walkthrough (§8.2 "manual" rows) matches pre-refactor for every existing role.
- [ ] `ROLE_GROUP`, `ROLE_BASE_ROUTES`, and every literal `allowedRoles: ["…", "ADMIN"]` array are gone — `grep -rn 'ROLE_GROUP\|ROLE_BASE_ROUTES\|allowedRoles={\[' admin-frontend` returns only the `RoleGuard` component's own prop declaration.
- [ ] PR opened against parent branch `frontend-rolebased-architecture-redesign`.

**Rollback:** `git revert` the merge commit. Additive-only: no migration, no persisted state, no endpoint touched. Zero data at risk.
