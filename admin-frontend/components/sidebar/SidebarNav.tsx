"use client";

import { usePathname } from "next/navigation";
import {
  Briefcase,
  Building2,
  Users,
  Layers,
  Grid3x3,
  ArrowLeftRight,
  ShieldAlert,
  CalendarDays,
} from "@/lib/icons";
import { NavItem } from "./NavItem";
import { RoleGroup, type RoleGroupConfig } from "./RoleGroup";
import { useAuth } from "@/components/auth/AuthProvider";

/* Workspace group = the role's own pages (collapsible parent → dashboard + children).
   Shared pages sit outside the group and are visible to every role. */
const ROLE_GROUP: Record<string, RoleGroupConfig> = {
  RM: {
    label: "Relationship Manager",
    icon: Briefcase,
    home: "/rm/dashboard",
    pages: [
      { label: "Onboarding & Renewal", href: "/rm/onboarding-renewal", icon: Users  },
      { label: "Model Subscription",   href: "/rm/model-subscription", icon: Layers },
    ],
  },
  MOBO: {
    label: "Middle / Back Office",
    icon: Building2,
    home: "/mobo/dashboard",
    pages: [
      { label: "Trade Reconciliation", href: "/mobo/trade-reconciliation",   icon: ArrowLeftRight },
      { label: "Daily Exceptions",     href: "/mobo/daily-exception-report", icon: ShieldAlert    },
    ],
  },
  PC: {
    label: "Portfolio Commander",
    icon: Layers,
    home: "/pc/model-management",
    pages: [
      { label: "Model Management",  href: "/pc/model-management",  icon: Layers  },
      { label: "Allocation Matrix", href: "/pc/allocation-matrix", icon: Grid3x3 },
    ],
  },
};

interface SidebarNavProps {
  isOpen: boolean;
}

export function SidebarNav({ isOpen }: SidebarNavProps) {
  const pathname       = usePathname();
  const { portalUser } = useAuth();
  const role           = portalUser?.role ?? "";
  const group          = ROLE_GROUP[role];

  const reportsActive  =
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
      {role === "ADMIN" ? (
        <>
          <RoleGroup group={ROLE_GROUP.RM}   isOpen={isOpen} />
          <RoleGroup group={ROLE_GROUP.MOBO} isOpen={isOpen} />
          <RoleGroup group={ROLE_GROUP.PC}   isOpen={isOpen} />
        </>
      ) : (
        group && <RoleGroup group={group} isOpen={isOpen} />
      )}

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
