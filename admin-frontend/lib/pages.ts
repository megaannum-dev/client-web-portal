import {
  Briefcase, Building2, Users, Layers, Grid3x3,
  ArrowLeftRight, ShieldAlert, CalendarDays, UserPlus, ShieldCheck,
  type LucideIcon,
} from "lucide-react";

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
