"use client";

import { usePathname } from "next/navigation";
import {
  Users,
  FileText,
  CalendarDays,
  Layers,
  ArrowLeftRight,
  ShieldCheck,
  Grid3x3,
  ShieldAlert,
} from "@/lib/icons";
import { NavItem } from "./NavItem";
import { LucideIcon } from "lucide-react";

type NavEntry = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const NAV_ITEMS: NavEntry[] = [
  { label: "Clients",          href: "/dashboard/clients",          icon: Users          },
  { label: "Daily Reports",    href: "/dashboard/daily-reports",    icon: FileText       },
  { label: "Monthly Reports",  href: "/dashboard/monthly-reports",  icon: CalendarDays   },
  { label: "Models",           href: "/dashboard/models",           icon: Layers         },
  { label: "Transactions",     href: "/dashboard/transactions",     icon: ArrowLeftRight },
  { label: "Compliance",       href: "/dashboard/compliance",       icon: ShieldCheck    },
  { label: "Trade Allocation", href: "/dashboard/trade-allocation", icon: Grid3x3        },
  { label: "Risk Management",  href: "/dashboard/risk",             icon: ShieldAlert    },
];

interface SidebarNavProps {
  isOpen: boolean;
}

export function SidebarNav({ isOpen }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav
      className={["flex-1 flex flex-col gap-2", isOpen ? "px-4" : "px-2"].join(" ")}
      aria-label="Main navigation"
    >
      {NAV_ITEMS.map((item) => (
        <NavItem
          key={item.href}
          href={item.href}
          icon={item.icon}
          label={item.label}
          active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
          isOpen={isOpen}
        />
      ))}
    </nav>
  );
}
