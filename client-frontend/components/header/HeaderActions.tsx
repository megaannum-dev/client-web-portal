"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Bell, HelpCircle, Mail, MessageCircle } from "@/lib/icons";
import { useAuth } from "@/components/auth/AuthProvider";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { MOCK_RM_CONTACT } from "@/lib/mock/data";

export function HeaderActions() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const displayName = user?.displayName ?? "Alex Thompson";

  return (
    <div className="flex items-center gap-5">
      {/* Icon actions */}
      <div className="flex items-center gap-4 text-secondary">
        <button
          type="button"
          aria-label={t("header.notifications")}
          className="cursor-pointer hover:text-on-surface transition-colors duration-150"
        >
          <Bell size={18} strokeWidth={1.75} />
        </button>
        <ThemeToggle />
        <div className="relative group flex items-center">
          <button
            type="button"
            aria-label={t("header.help")}
            className="cursor-pointer hover:text-on-surface transition-colors duration-150"
          >
            <HelpCircle size={20} strokeWidth={1.75} />
          </button>

          {/* RM contact popup — visible on group hover */}
          <div className="absolute -right-5 top-full pt-3 w-72 z-50 pointer-events-none opacity-0 invisible group-hover:opacity-100 group-hover:visible group-hover:pointer-events-auto transition-[opacity,visibility] duration-150">
          <div className="bg-white border border-outline-variant rounded-xl shadow-overlay p-4">
            <p className="text-[14px] font-bold text-on-surface mb-0.5">{t("header.contact_rm")}</p>
            <p className="text-[11px] text-secondary mb-4">
              {MOCK_RM_CONTACT.name}
            </p>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Mail size={14} strokeWidth={1.75} className="text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-secondary mb-0.5">{t("header.email")}</p>
                  <p className="text-[12px] text-on-surface truncate">{MOCK_RM_CONTACT.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-lg bg-[#25D366]/10 flex items-center justify-center shrink-0">
                  <MessageCircle size={14} strokeWidth={1.75} className="text-[#25D366]" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-secondary mb-0.5">{t("header.whatsapp")}</p>
                  <p className="text-[12px] text-on-surface">{MOCK_RM_CONTACT.whatsappNumber}</p>
                </div>
              </div>
            </div>
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
            {t("header.platinum_client")}
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
              <p className="text-[11px] font-extrabold text-primary uppercase tracking-widest mt-0.5">{t("header.platinum_client")}</p>
            </div>
          </div>

          <div className="h-px bg-outline-variant mx-5" />

          {/* Fields */}
          <div className="px-5 py-4 flex flex-col gap-3.5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-secondary mb-1">{t("header.email")}</p>
              <p className="text-[13px] text-on-surface truncate">{user?.email ?? t("header.empty")}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-secondary mb-1">{t("header.occupation")}</p>
              <p className="text-[13px] text-on-surface">{t("header.occupation_value")}</p>
            </div>
          </div>

          <div className="h-px bg-outline-variant mx-5" />

          {/* Footer link */}
          <div className="px-5 py-4">
            <Link
              href="/profile"
              className="text-[14px] font-bold text-primary hover:opacity-75 transition-opacity"
            >
              {t("header.view_full_profile")}
            </Link>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
