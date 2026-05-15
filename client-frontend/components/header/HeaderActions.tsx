"use client";

import { Bell, HelpCircle } from "@/lib/icons";
import { useAuth } from "@/components/AuthProvider";

export function HeaderActions() {
  const { user } = useAuth();

  const displayName = user?.displayName ?? user?.email?.split("@")[0] ?? "User";

  return (
    <div className="flex items-center gap-5">
      {/* Icon actions */}
      <div className="flex items-center gap-4 text-secondary">
        <button
          type="button"
          aria-label="Notifications"
          className="cursor-pointer hover:text-on-surface transition-colors duration-150"
        >
          <Bell size={18} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          aria-label="Help"
          className="cursor-pointer hover:text-on-surface transition-colors duration-150"
        >
          <HelpCircle size={20} strokeWidth={1.75} />
        </button>
      </div>

      {/* Divider */}
      <div className="h-8 w-px bg-outline-variant" />

      {/* User info + avatar */}
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-end">
          <span className="text-body-sm font-semibold text-on-surface leading-tight whitespace-nowrap">
            {displayName}
          </span>
          <span className="text-label-md text-secondary leading-tight">
            Platinum Client
          </span>
        </div>
        <div className="size-10 rounded-full border border-outline overflow-hidden shrink-0">
          <div className="size-full flex items-center justify-center bg-surface-container text-label-md font-semibold text-on-surface uppercase">
            {displayName[0]}
          </div>
        </div>
      </div>
    </div>
  );
}
