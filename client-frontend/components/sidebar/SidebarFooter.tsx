"use client";

import { LogOut } from "@/lib/icons";
import { useAuth } from "@/components/AuthProvider";

export function SidebarFooter() {
  const { signOutUser } = useAuth();

  return (
    <div className="px-4 pb-4">
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
