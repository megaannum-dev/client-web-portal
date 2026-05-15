"use client";

import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  Activity,
  Settings,
  UserRound,
} from "@/lib/icons";
import { NavItem } from "./NavItem";

const NAV_ITEMS = [
  { href: "/overview",   icon: LayoutDashboard, label: "Overview"   },
  { href: "/portfolio",  icon: Briefcase,       label: "Portfolios" },
  { href: "/reports",    icon: FileText,        label: "Reports"    },
  { href: "/activity",   icon: Activity,        label: "Activity"   },
  { href: "/profile",    icon: UserRound,       label: "Profile"    },
  { href: "/settings",   icon: Settings,        label: "Settings"   },
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
