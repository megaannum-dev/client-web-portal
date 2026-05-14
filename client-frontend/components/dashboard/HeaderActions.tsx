"use client";

import { Bell, Settings } from "@/lib/icons";
import { useAuth } from "@/components/AuthProvider";

export function HeaderActions() {
  const { user } = useAuth();

  return (
    <div className="flex items-center gap-6">
      {/* Notification icons */}
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
          aria-label="Settings"
          className="cursor-pointer hover:text-on-surface transition-colors duration-150"
        >
          <Settings size={20} strokeWidth={1.75} />
        </button>
      </div>

      {/* Contact Advisor */}
      <button
        type="button"
        className="border border-outline rounded px-6 py-[9px] text-body-md font-bold text-secondary cursor-pointer hover:bg-surface-container transition-colors duration-150 whitespace-nowrap"
      >
        Contact Advisor
      </button>

      {/* User avatar */}
      <div className="size-10 rounded border border-outline overflow-hidden shrink-0">
        <div className="size-full flex items-center justify-center bg-surface-container text-label-md font-semibold text-on-surface uppercase">
          {user?.email?.[0] ?? "U"}
        </div>
      </div>
    </div>
  );
}
