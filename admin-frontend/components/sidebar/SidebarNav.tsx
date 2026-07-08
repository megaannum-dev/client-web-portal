"use client";

import { usePathname } from "next/navigation";
import { CalendarDays } from "@/lib/icons";
import { NavItem } from "./NavItem";
import { RoleGroup } from "./RoleGroup";
import { useAuth } from "@/components/auth/AuthProvider";
import { groupsFor } from "@/lib/pages";

interface SidebarNavProps {
  isOpen: boolean;
}

export function SidebarNav({ isOpen }: SidebarNavProps) {
  const pathname       = usePathname();
  const { portalUser } = useAuth();
  const groups         = groupsFor(portalUser?.role ?? "");

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
