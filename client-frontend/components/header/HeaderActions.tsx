"use client";

import Link from "next/link";
import { Bell, HelpCircle } from "@/lib/icons";
import { useAuth } from "@/components/auth/AuthProvider";

export function HeaderActions() {
  const { user } = useAuth();

  const displayName = user?.displayName ?? "Alex Thompson";

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
        <div className="relative group flex items-center">
          <button
            type="button"
            aria-label="Help"
            className="cursor-pointer hover:text-on-surface transition-colors duration-150"
          >
            <HelpCircle size={20} strokeWidth={1.75} />
          </button>

          {/* Assistance popup — visible on group hover */}
          <div className="absolute -right-5 top-full pt-3 w-64 z-50 pointer-events-none opacity-0 invisible group-hover:opacity-100 group-hover:visible group-hover:pointer-events-auto transition-[opacity,visibility] duration-150">
          <div className="bg-white border border-outline-variant rounded-xl shadow-overlay p-4">
            <p className="text-[14px] font-bold text-on-surface mb-1.5">Need Assistance?</p>
            <p className="text-[12px] text-secondary leading-relaxed mb-4">
              Please consult your paired advisor prior to making any allotment or redemption requests to ensure optimal portfolio alignment.
            </p>
            <button
              type="button"
              className="w-full bg-primary text-white py-2.5 rounded-lg text-[13px] font-bold hover:opacity-90 transition-opacity"
            >
              Contact Advisor
            </button>
          </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="h-8 w-px bg-outline-variant" />

      {/* User info + avatar */}
      <div className="relative group flex items-center gap-3 cursor-pointer">
        <div className="flex flex-col items-end">
          <span className="text-body-sm font-semibold text-on-surface leading-tight whitespace-nowrap">
            {displayName}
          </span>
          <span className="text-label-md text-secondary leading-tight">
            Platinum Client
          </span>
        </div>
        <div className="size-10 rounded-full overflow-hidden shrink-0 shadow-card">
          <div className="size-full bg-gradient-to-br from-yellow-200 via-green-300 to-teal-600 flex items-center justify-center">
            <span className="text-[13px] font-bold text-white/80 select-none uppercase">{displayName[0]}</span>
          </div>
        </div>

        {/* Profile popup — visible on group hover */}
        <div className="absolute right-0 top-full pt-3 w-72 z-50 pointer-events-none opacity-0 invisible group-hover:opacity-100 group-hover:visible group-hover:pointer-events-auto transition-[opacity,visibility] duration-150">
        <div className="bg-white border border-outline-variant rounded-2xl shadow-overlay overflow-hidden">

          {/* Avatar + name */}
          <div className="flex items-center gap-4 px-5 pt-5 pb-4">
            <div className="size-14 rounded-full overflow-hidden shrink-0 shadow-card">
              <div className="size-full bg-gradient-to-br from-yellow-200 via-green-300 to-teal-600 flex items-center justify-center">
                <span className="text-[20px] font-bold text-white/80 select-none uppercase">{displayName[0]}</span>
              </div>
            </div>
            <div>
              <p className="text-[17px] font-bold text-on-surface leading-snug">{displayName}</p>
              <p className="text-[11px] font-extrabold text-primary uppercase tracking-widest mt-0.5">Platinum Client</p>
            </div>
          </div>

          <div className="h-px bg-outline-variant mx-5" />

          {/* Fields */}
          <div className="px-5 py-4 flex flex-col gap-3.5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-secondary mb-1">Email</p>
              <p className="text-[13px] text-on-surface truncate">{user?.email ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-secondary mb-1">Occupation</p>
              <p className="text-[13px] text-on-surface">Investment Portfolio Manager</p>
            </div>
          </div>

          <div className="h-px bg-outline-variant mx-5" />

          {/* Footer link */}
          <div className="px-5 py-4">
            <Link
              href="/profile"
              className="text-[14px] font-bold text-primary hover:opacity-75 transition-opacity"
            >
              View Full Profile
            </Link>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
