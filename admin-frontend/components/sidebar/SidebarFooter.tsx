"use client";

import { useTranslation } from "react-i18next";
import { LogOut, Settings } from "@/lib/icons";
import { useAuth } from "@/components/auth/AuthProvider";
import { NavItem } from "./NavItem";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const FOOTER_ITEMS = [
  { href: "/settings", icon: Settings, labelKey: "nav.settings" },
] as const;

interface SidebarFooterProps {
  isOpen: boolean;
}

export function SidebarFooter({ isOpen }: SidebarFooterProps) {
  const { signOutUser } = useAuth();
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <div className={clsx("pb-4 flex flex-col gap-2", isOpen ? "px-4" : "px-2")}>
      {FOOTER_ITEMS.map((item) => (
        <NavItem
          key={item.href}
          href={item.href}
          icon={item.icon}
          label={t(item.labelKey)}
          active={pathname === item.href}
          isOpen={isOpen}
        />
      ))}

      <button
        type="button"
        onClick={signOutUser}
        className="flex items-center gap-3 py-3 pl-4 pr-5 w-full rounded text-error hover:bg-error-container/30 transition-colors duration-150 cursor-pointer"
      >
        <LogOut size={18} strokeWidth={1.75} className="shrink-0" />
        <span className="text-label-md font-semibold tracking-[0.05em] uppercase">
          Logout
        </span>
      </button>
    </div>
  );
}
