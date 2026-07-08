import {
  Briefcase,
  Building2,
  Users,
  Layers,
  Grid3x3,
  ArrowLeftRight,
  ShieldAlert,
  CalendarDays,
  UserPlus,
  ShieldCheck,
  LayoutDashboardIcon,
  type LucideIcon,
} from "lucide-react";

export type Role = "ADMIN" | "MOBO" | "RM" | "PM" | "PC" | "COMPLIANCE";

export type AccessLevel = "OPERATE" | "VIEW";

export type PageId =
  | "rm.client-info"
  | "rm.onboarding-renewal"
  | "rm.model-subscription"
  | "rm.client-detail"
  | "mobo.recon-overview"
  | "mobo.trade-reconciliation"
  | "mobo.daily-exception-report"
  | "pc.model-management"
  | "pc.allocation-matrix"
  | "shared.monthly-reports"
  | "admin.enroll-user";

export type NavGroup = {
  label: string;
  icon: LucideIcon;
  home: string; // resolved path of the group's home PageId
  pages: { label: string; href: string; icon: LucideIcon }[];
};

// label + icon are the page's "default name" — canonical for breadcrumbs / titles / dropdown children.
// hideFromNav: page is reachable only by click-through or rendered outside the role's one nav
// group (detail views, the Shared section) — never listed as a child in groupsFor.
export type PageDef = {
  id: PageId;
  path: string;
  label: string;
  icon: LucideIcon;
};

export const PAGES: Record<PageId, PageDef> = {
  "admin.enroll-user": {
    id: "admin.enroll-user",
    path: "/admin/enroll-user",
    label: "Enroll User",
    icon: UserPlus,
  },
  "rm.client-info": {
    id: "rm.client-info",
    path: "/rm/client-info",
    label: "Client Information",
    icon: Users,
  },
  "rm.onboarding-renewal": {
    id: "rm.onboarding-renewal",
    path: "/rm/onboarding-renewal",
    label: "Onboarding & Renewal",
    icon: UserPlus,
  },
  "rm.model-subscription": {
    id: "rm.model-subscription",
    path: "/rm/model-subscription",
    label: "Model Subscription",
    icon: Layers,
  },
  "mobo.recon-overview": {
    id: "mobo.recon-overview",
    path: "/mobo/recon-overview",
    label: "Reconciliation Overview",
    icon: LayoutDashboardIcon,
  },
  "mobo.trade-reconciliation": {
    id: "mobo.trade-reconciliation",
    path: "/mobo/trade-reconciliation",
    label: "Trade Reconciliation",
    icon: ArrowLeftRight,
  },
  "mobo.daily-exception-report": {
    id: "mobo.daily-exception-report",
    path: "/mobo/daily-exception-report",
    label: "Daily Exceptions",
    icon: ShieldAlert,
  },
  "pc.model-management": {
    id: "pc.model-management",
    path: "/pc/model-management",
    label: "Model Management",
    icon: Layers,
  },
  "pc.allocation-matrix": {
    id: "pc.allocation-matrix",
    path: "/pc/allocation-matrix",
    label: "Allocation Matrix",
    icon: Grid3x3,
  },
  "shared.monthly-reports": {
    id: "shared.monthly-reports",
    path: "/monthly-reports",
    label: "Monthly Reports",
    icon: CalendarDays,
  },
};

// One nav parent per role (Yes — user req.: a role sees exactly one workspace
// parent, never a mix of other roles' domains). Roles with no grants (PM,
// COMPLIANCE) are omitted — groupsFor returns [] for them regardless.
const ROLE_NAV: Partial<Record<Role, { label: string; icon: LucideIcon }>> = {
  RM: { label: "Relationship Manager", icon: Briefcase },
  MOBO: { label: "Middle / Back Office", icon: Building2 },
  PC: { label: "Portfolio Commander", icon: Layers },
  ADMIN: { label: "Admin", icon: ShieldCheck },
};

const ALL_OPERATE = Object.fromEntries(
  (Object.keys(PAGES) as PageId[]).map((id) => [id, "OPERATE" as AccessLevel]),
) as Record<PageId, AccessLevel>;

export const ROLE_PAGES: Record<Role, Partial<Record<PageId, AccessLevel>>> = {
  RM: {
    "rm.client-info": "OPERATE",
    "rm.onboarding-renewal": "OPERATE",
    "rm.model-subscription": "OPERATE",
    "rm.client-detail": "OPERATE",
    "shared.monthly-reports": "OPERATE",
  },
  MOBO: {
    "mobo.recon-overview": "OPERATE",
    "mobo.trade-reconciliation": "OPERATE",
    "mobo.daily-exception-report": "OPERATE",
    "shared.monthly-reports": "OPERATE",
  },
  PC: {
    "pc.model-management": "OPERATE",
    "pc.allocation-matrix": "OPERATE",
    "shared.monthly-reports": "OPERATE",
  },
  PM: {},
  COMPLIANCE: {},
  ADMIN: ALL_OPERATE, // reachable ONLY via this literal key — see D-7
};

export const ROLE_DEFAULT_PAGE: Record<Role, PageId | null> = {
  RM: "rm.client-info",
  MOBO: "mobo.recon-overview",
  PC: "pc.model-management",
  ADMIN: "admin.enroll-user",
  PM: null,
  COMPLIANCE: null,
};

// Default-deny gate. Every exported lookup routes through here. An unrecognized
// role resolves to {} — never to ADMIN, never to another role, never throws.
function grantsFor(role: string): Partial<Record<PageId, AccessLevel>> {
  return (
    (ROLE_PAGES as Record<string, Partial<Record<PageId, AccessLevel>>>)[
      role
    ] ?? {}
  );
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
  return (Object.keys(ROLE_PAGES) as Role[]).filter(
    (r) => page.id in grantsFor(r),
  );
}

// One parent per role: the role's own name/icon, with every non-hidden granted
// page (including the default/home page) listed as a labeled child. A role
// with no ROLE_NAV entry or no grants renders no workspace groups at all —
// never falls back to another role's parent.
export function groupsFor(role: string): NavGroup[] {
  const nav = (
    ROLE_NAV as Record<string, { label: string; icon: LucideIcon } | undefined>
  )[role];
  if (!nav) return [];
  const pages = pagesForRole(role)
    .map((id) => PAGES[id])
    .filter((p) => p.id != ROLE_DEFAULT_PAGE[role as Role])
    .map((p) => ({ label: p.label, href: p.path, icon: p.icon }));
  if (pages.length === 0) return [];
  return [
    {
      label: nav.label,
      icon: nav.icon,
      home: defaultPathFor(role) ?? pages[0].href,
      pages,
    },
  ];
}
