"use client";

import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  Briefcase,
  CalendarDays,
  Scale,
  Activity,
  UserRound,
} from "@/lib/icons";
import { NavItem }        from "./NavItem";
import { useSidebarOpen } from "./SidebarContext";

const NAV_ITEMS = [
  { href: "/overview",                    icon: LayoutDashboard, labelKey: "nav.overview"         },
  { href: "/portfolio",                   icon: Briefcase,       labelKey: "nav.portfolios"       },
  { href: "/profile",                     icon: UserRound,       labelKey: "nav.profile"          },
  { href: "/documents/monthly-reports",   icon: CalendarDays,    labelKey: "nav.monthly_reports"  },
  { href: "/documents/legal-reports",     icon: Scale,           labelKey: "nav.legal_reports"    },
  { href: "/events",                      icon: Activity,        labelKey: "nav.events"           },
  
] as const;

export function SidebarNav() {
  const pathname = usePathname();
  const isOpen   = useSidebarOpen();
  const { t }    = useTranslation();

  return (
    <nav
      className={["flex-1 flex flex-col gap-2", isOpen ? "px-4" : "px-2"].join(" ")}
      aria-label={t("nav.main_navigation")}
    >
      {NAV_ITEMS.map((item) => (
        <NavItem
          key={item.href}
          href={item.href}
          icon={item.icon}
          label={t(item.labelKey)}
          active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
        />
      ))}
    </nav>
  );
}
