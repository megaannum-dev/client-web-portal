import {
  Briefcase,
  Building2,
  Users,
  Layers,
  Grid3x3,
  Inbox,
  ArrowLeftRight,
  CalendarDays,
  UserPlus,
  Shield,
  ShieldCheck,
  LayoutDashboardIcon,
  Wallet,
  Ticket,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { Receipt } from "@/lib/icons";

export type Role = "ADMIN" | "MOBO" | "RM" | "PM" | "PC" | "COMPLIANCE";

/** The single access vocabulary — DB enum, wire DTOs, route guard and admin console
 *  all use these three spellings. Replaces the old two-level route-guard vocabulary
 *  (proposal 009) and lib/admin/types.ts's old lowercase three-level vocabulary. */
export type AccessLevel = "NONE" | "VIEW" | "EDIT";

export type PageId =
  | "rm.client-info"
  | "rm.onboarding-renewal"
  | "rm.model-subscription"
  | "rm.request-tickets"
  | "mobo.recon-overview"
  | "mobo.trade-reconciliation"
  | "mobo.post-trade-allocation"
  | "mobo.commission-tracking"
  | "mobo.post-trade-allocation"
  | "pc.model-management"
  | "pc.allocation-matrix"
  | "pc.allotment-redemption"
  | "compliance.overview"
  | "compliance.review"
  | "shared.monthly-reports"
  | "admin.enroll-user"
  | "admin.system-config";

/** What a `UserOut.grants` map looks like on the client. Absent key === "NONE". */
export type GrantMap = Partial<Record<PageId, "VIEW" | "EDIT">>;

export type NavGroup = {
  label: string;
  icon: LucideIcon;
  home: string; // resolved path of the group's home PageId
  pages: { label: string; href: string; icon: LucideIcon; subgroup?: string }[];
};

// label + icon are the page's "default name" — canonical for breadcrumbs / titles / dropdown children.
// hideFromNav: page is reachable only by click-through or rendered outside the role's one nav
// group (detail views, the Shared section) — never listed as a child in groupsFor.
export type PageDef = {
  id: PageId;
  path: string;
  label: string;
  icon: LucideIcon;
  hideFromNav?: boolean;
  subgroup?: string;
};

// Declaration order mirrors api-backend/app/libs/access/pages.py's PAGE_META
// exactly (§ D-8) — groupsFor() below walks this order, so it's also the
// sidebar's item order within each subgroup and the subgroup header order
// (first occurrence, RoleGroup.tsx's groupBySubgroup).
export const PAGES: Record<PageId, PageDef> = {
  "rm.client-info": {
    id: "rm.client-info",
    path: "/rm/client-info",
    label: "Client Information",
    icon: Users,
    subgroup: "Client Management",
  },
  "rm.onboarding-renewal": {
    id: "rm.onboarding-renewal",
    path: "/rm/onboarding-renewal",
    label: "Onboarding & Renewal",
    icon: UserPlus,
    subgroup: "Client Management",
  },
  "rm.model-subscription": {
    id: "rm.model-subscription",
    path: "/rm/model-subscription",
    label: "Model Subscription",
    icon: Layers,
    subgroup: "Client Management",
  },
  "rm.request-tickets": {
    id: "rm.request-tickets",
    path: "/rm/requests",
    label: "Request Tickets",
    icon: Ticket,
    subgroup: "Client Management",
  },
  "compliance.review": {
    id: "compliance.review",
    path: "/compliance/review",
    label: "Compliance Review",
    icon: ShieldCheck,
    subgroup: "Compliance",
  },
  "pc.allotment-redemption": {
    id: "pc.allotment-redemption",
    path: "/pc/allotment-redemption",
    label: "Allotment & Redemption",
    icon: Inbox,
    subgroup: "Client Management",
  },
  "pc.allocation-matrix": {
    id: "pc.allocation-matrix",
    path: "/pc/allocation-matrix",
    label: "Allocation Matrix",
    icon: Grid3x3,
    subgroup: "Trade Management",
  },
  "mobo.post-trade-allocation": {
    id: "mobo.post-trade-allocation",
    path: "/mobo/post-trade-allocation",
    label: "Post-Trade Allocation",
    icon: Wallet,
    subgroup: "Trade Management",
  },
  "mobo.trade-reconciliation": {
    id: "mobo.trade-reconciliation",
    path: "/mobo/trade-reconciliation",
    label: "Trade Reconciliation",
    icon: ArrowLeftRight,
    subgroup: "Trade Management",
  },
  "mobo.commission-tracking": {
    id: "mobo.commission-tracking",
    path: "/mobo/commission-tracking",
    label: "Commission Tracking",
    icon: Receipt,
    subgroup: "Trade Management",
  },
  "shared.monthly-reports": {
    id: "shared.monthly-reports",
    path: "/monthly-reports",
    label: "Monthly Reports (Models)",
    icon: CalendarDays,
    subgroup: "Trade Management",
  },
  "pc.model-management": {
    id: "pc.model-management",
    path: "/pc/model-management",
    label: "Model Management",
    icon: Layers,
    subgroup: "System",
  },
  "admin.enroll-user": {
    id: "admin.enroll-user",
    path: "/admin/enroll-user",
    label: "Enroll User",
    icon: UserPlus,
    subgroup: "System",
  },
  "admin.system-config": {
    id: "admin.system-config",
    path: "/admin/system-config",
    label: "System Config",
    icon: Settings,
    subgroup: "System",
  },
  // — Hidden (not in nav) —
  "mobo.recon-overview": {
    id: "mobo.recon-overview",
    path: "/mobo/recon-overview",
    label: "Reconciliation Overview",
    icon: LayoutDashboardIcon,
    hideFromNav: true,
  },
  "compliance.overview": {
    id: "compliance.overview",
    path: "/compliance/overview",
    label: "Compliance Overview",
    icon: LayoutDashboardIcon,
    hideFromNav: true,
  },
};

// One nav parent per role (Yes — user req.: a role sees exactly one workspace
// parent, never a mix of other roles' domains). Roles with no grants (PM) are
// omitted — groupsFor returns [] for them regardless.
const ROLE_NAV: Partial<Record<Role, { label: string; icon: LucideIcon }>> = {
  RM: { label: "Relationship Manager", icon: Briefcase },
  MOBO: { label: "Middle / Back Office", icon: Building2 },
  PC: { label: "Portfolio Commander", icon: Layers },
  COMPLIANCE: { label: "Compliance", icon: Shield },
  ADMIN: { label: "Admin", icon: ShieldCheck },
};

export const ROLE_DEFAULT_PAGE: Record<Role, PageId | null> = {
  RM: "rm.client-info",
  MOBO: "mobo.recon-overview",
  PC: "pc.model-management",
  ADMIN: "rm.client-info",
  PM: null,
  COMPLIANCE: "compliance.overview",
};

export function defaultPathFor(role: string): string | null {
  const id = (ROLE_DEFAULT_PAGE as Record<string, PageId | null>)[role] ?? null;
  return id ? PAGES[id].path : null;
}

/** The page a pathname belongs to, by exact match or prefix. This is the surviving half
 *  of the old path→role lookup — the half that reads PAGES rather than the deleted
 *  per-role page map. */
export function pageIdForPath(pathname: string): PageId | null {
  const page = Object.values(PAGES).find(
    (p) => pathname === p.path || pathname.startsWith(`${p.path}/`),
  );
  return page ? page.id : null;
}

/** One nav parent per role, built from the caller's OWN grants. A page the grant map
 *  omits (i.e. NONE) is simply not listed — that is the primary effect of NONE (Q-4).
 *  A role with no ROLE_NAV entry, or an empty grant set, renders no groups at all. */
export function groupsFor(grants: GrantMap, role: string): NavGroup[] {
  const nav = (
    ROLE_NAV as Record<string, { label: string; icon: LucideIcon } | undefined>
  )[role];
  if (!nav) return [];
  const pages = (Object.keys(PAGES) as PageId[])
    .filter((id) => id in grants)
    .map((id) => PAGES[id])
    .filter((p) => !p.hideFromNav)
    .map((p) => ({ label: p.label, href: p.path, icon: p.icon, subgroup: p.subgroup }));
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
