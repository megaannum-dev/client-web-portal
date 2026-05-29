"use client";

import { useTranslation }   from "react-i18next";
import { LogOut, Settings }  from "@/lib/icons";
import { useAuth }           from "@/components/auth/AuthProvider";
import { useSidebarOpen }    from "./SidebarContext";
import { NavItem }        from "./NavItem";
import { usePathname } from "next/navigation";
import clsx from "clsx";


const FOOTER_ITEMS = [
  { href: "/settings",   icon: Settings,        labelKey: "nav.settings" },
] as const;

export function SidebarFooter() {
  const { signOutUser } = useAuth();
  const isOpen = useSidebarOpen();
  const { t } = useTranslation();

  return (
    <div className={clsx("pb-4 flex flex-col gap-2", isOpen ? "px-4" : "px-2")}>
      {FOOTER_ITEMS.map((item) => (
        <NavItem
          key={item.href}
          href={item.href}
          icon={item.icon}
          label={t(item.labelKey)}
        />))}

      <button
        type="button"
        title={!isOpen ? t("nav.logout") : undefined}
        onClick={signOutUser}
        className={clsx(
          "flex items-center rounded transition-colors duration-150 cursor-pointer",
          "text-error hover:bg-error-container/30",
          isOpen ? "gap-3 py-3 pl-4 pr-5 w-full" : "justify-center py-3 w-full",
        )}
      >
        <LogOut size={18} strokeWidth={1.75} className="shrink-0" />
        {isOpen && (
          <span className="text-label-md font-semibold tracking-[0.05em] uppercase">
            {t("nav.logout")}
          </span>
        )}
      </button>
    </div>
  );
}
