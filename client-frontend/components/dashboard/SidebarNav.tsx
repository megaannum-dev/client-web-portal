"use client";

import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  FileText,

  Activity,
  LifeBuoy,
} from "@/lib/icons";
import { NavItem } from "./NavItem";

const NAV_ITEMS = [
  { href: "/overview",   icon: LayoutDashboard, label: "Overview"  },
  { href: "/portfolio",  icon: Briefcase,        label: "Portfolio" },
  { href: "/reports",    icon: FileText,         label: "Reports"   },
  { href: "/activity",   icon: Activity,         label: "Activity"  },
  { href: "/support",    icon: LifeBuoy,         label: "Support"   },
] as const;

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 flex flex-col gap-2 px-4" aria-label="Main navigation">
      {NAV_ITEMS.map((item) => (
        <NavItem
          key={item.href}
          href={item.href}
          icon={item.icon}
          label={item.label}
          active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
        />
      ))}
    </nav>
  );
}
