"use client";

import { HelpCircle, LogOut } from "@/lib/icons";
import { NavItem } from "./NavItem";
import { useAuth } from "@/components/AuthProvider";

export function SidebarFooter() {
  const { signOutUser } = useAuth();

  return (
    <div className="border-t border-outline-variant px-4 pt-6 pb-4 flex flex-col gap-2">
      <NavItem href="/common-query" icon={HelpCircle} label="Common Query" />
      <button
        type="button"
        onClick={signOutUser}
        className="flex items-center gap-3 py-3 pl-4 pr-5 w-full rounded text-secondary hover:bg-surface-container hover:text-on-surface transition-colors duration-150 cursor-pointer"
      >
        <LogOut size={18} strokeWidth={1.75} className="shrink-0" />
        <span className="text-label-md font-semibold tracking-[0.05em] uppercase">
          Logout
        </span>
      </button>
    </div>
  );
}
