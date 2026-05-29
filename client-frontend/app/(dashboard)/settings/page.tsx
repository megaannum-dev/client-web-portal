"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import {
  ShieldCheck,
  Bell,
  SlidersHorizontal,
  Lock,
  Shield,
  Pencil,
  KeyRound,
} from "@/lib/icons";
import { useAuth } from "@/components/auth/AuthProvider";
import { setLanguage } from "@/lib/i18n/client";
import { LANGUAGES, LANGUAGE_LABELS, type Language } from "@/lib/i18n/settings";
import { PageHeader }  from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab = "account" | "notifications" | "preferences" | "cards";

interface TabDef {
  id: Tab;
  labelKey: string;
  icon: React.ElementType;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const TABS: TabDef[] = [
  { id: "account",       labelKey: "settings.tabs.account",       icon: ShieldCheck      },
  { id: "notifications", labelKey: "settings.tabs.notifications", icon: Bell             },
  { id: "preferences",   labelKey: "settings.tabs.preferences",   icon: SlidersHorizontal },
];

const DUMMY_CARDS = [
  { id: 1, brand: "Visa",       last4: "4242", expiry: "08/26", primary: true  },
  { id: 2, brand: "Mastercard", last4: "8888", expiry: "03/27", primary: false },
  { id: 3, brand: "Visa",       last4: "1234", expiry: "11/25", primary: false },
];

// ── Shared primitives ──────────────────────────────────────────────────────────

function SubHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-5">
      <Icon size={18} strokeWidth={1.75} className="text-primary shrink-0" />
      <h3 className="text-body-lg font-bold text-on-surface">{title}</h3>
    </div>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={[
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40 shrink-0",
        on ? "bg-primary" : "bg-surface-high",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block size-5 transform rounded-full bg-white shadow transition-transform duration-200",
          on ? "translate-x-5" : "translate-x-0.5",
        ].join(" ")}
      />
    </button>
  );
}

// ── Tab panels ─────────────────────────────────────────────────────────────────

function AccountAndSafetyPanel({
  user,
}: {
  user: { displayName?: string | null; email?: string | null } | null;
}) {
  const { t } = useTranslation();
  const initialEmail = user?.email ?? "alex.thompson@example.com";
  const [twoFa, setTwoFa] = useState(false);

  const [email, setEmail]             = useState(initialEmail);
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft]   = useState(initialEmail);

  const [phone, setPhone]             = useState("+1 (555) 0123-4567");
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneDraft, setPhoneDraft]   = useState("+1 (555) 0123-4567");

  return (
    <SectionCard>
      {/* ── Account Information ── */}
      <SubHeader icon={Lock} title={t("settings.account_information")} />

      <div className="flex flex-col divide-y divide-outline-variant ">
        {/* Email row */}
        <div className="flex items-start justify-between py-4 gap-4">
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <span className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
              {t("settings.email_address")}
            </span>
            {editingEmail ? (
              <input
                type="email"
                value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                className="w-full border border-outline-variant rounded-lg px-3 py-2 text-body-sm text-on-surface bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                autoFocus
              />
            ) : (
              <span className="text-body-sm text-on-surface">{email}</span>
            )}
          </div>
          {editingEmail ? (
            <div className="flex items-center gap-2 shrink-0 pt-6">
              <button type="button" onClick={() => setEditingEmail(false)}
                className="px-3 py-1.5 text-body-sm font-semibold text-secondary rounded-lg border border-outline-variant hover:bg-surface-container transition-colors">
                {t("common.cancel")}
              </button>
              <button type="button" onClick={() => { setEmail(emailDraft); setEditingEmail(false); }}
                className="px-3 py-1.5 text-body-sm font-bold bg-primary text-white rounded-lg hover:opacity-90 transition-opacity">
                {t("common.save")}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => { setEmailDraft(email); setEditingEmail(true); }}
              className="flex items-center gap-1.5 text-body-sm font-semibold text-primary hover:opacity-75 transition-opacity shrink-0 mt-1">
              <Pencil size={13} strokeWidth={2} />
              {t("settings.change_email")}
            </button>
          )}
        </div>

        {/* Phone row */}
        <div className="flex items-start justify-between py-4 gap-4">
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            <span className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
              {t("settings.phone_number")}
            </span>
            {editingPhone ? (
              <input
                type="tel"
                value={phoneDraft}
                onChange={(e) => setPhoneDraft(e.target.value)}
                className="w-full border border-outline-variant rounded-lg px-3 py-2 text-body-sm text-on-surface bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                autoFocus
              />
            ) : (
              <span className="text-body-sm text-on-surface">{phone}</span>
            )}
          </div>
          {editingPhone ? (
            <div className="flex items-center gap-2 shrink-0 pt-6">
              <button type="button" onClick={() => setEditingPhone(false)}
                className="px-3 py-1.5 text-body-sm font-semibold text-secondary rounded-lg border border-outline-variant hover:bg-surface-container transition-colors">
                {t("common.cancel")}
              </button>
              <button type="button" onClick={() => { setPhone(phoneDraft); setEditingPhone(false); }}
                className="px-3 py-1.5 text-body-sm font-bold bg-primary text-white rounded-lg hover:opacity-90 transition-opacity">
                {t("common.save")}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => { setPhoneDraft(phone); setEditingPhone(true); }}
              className="flex items-center gap-1.5 text-body-sm font-semibold text-primary hover:opacity-75 transition-opacity shrink-0 mt-1">
              <Pencil size={13} strokeWidth={2} />
              {t("settings.change_phone_number")}
            </button>
          )}
        </div>
      </div>

      <hr className="border-outline-variant mb-8" />

      {/* ── Safety ── */}
      {/* <SubHeader icon={Shield} title={t("settings.safety")} /> */}

      <div className="flex flex-col gap-5">
        {/* 2FA toggle */}
        {/* <div className="flex items-center justify-between p-4 bg-surface-container rounded-lg">
          <div>
            <p className="text-body-sm font-bold text-on-surface">{t("settings.two_factor_auth")}</p>
            <p className="text-label-md text-secondary mt-0.5">
              {t("settings.two_factor_desc")}
            </p>
          </div>
          <Toggle on={twoFa} onToggle={() => setTwoFa((v) => !v)} />
        </div> */}

        {/* Change password */}
        <button
          type="button"
          className="flex items-center gap-2 text-body-sm font-bold text-primary hover:opacity-75 transition-opacity w-fit"
        >
          <KeyRound size={15} strokeWidth={2} />
          {t("settings.change_password")}
        </button>

        {/* Save */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            className="bg-primary text-white font-bold text-body-sm px-8 py-3 rounded hover:opacity-90 transition-opacity"
          >
            {t("common.save_changes")}
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

function NotificationsPanel() {
  const { t } = useTranslation();
  const [checked, setChecked] = useState({ email: true, push: true, sms: false });

  const items: { key: keyof typeof checked; label: string; desc: string }[] = [
    { key: "email", label: t("settings.notification_items.email_label"), desc: t("settings.notification_items.email_desc") },
    { key: "push",  label: t("settings.notification_items.push_label"),  desc: t("settings.notification_items.push_desc")  },
    { key: "sms",   label: t("settings.notification_items.sms_label"),   desc: t("settings.notification_items.sms_desc")   },
  ];

  return (
    <SectionCard>
      <SubHeader icon={Bell} title={t("settings.notifications_title")} />
      <div className="flex flex-col divide-y divide-outline-variant">
        {items.map(({ key, label, desc }) => (
          <div key={key} className="flex items-center justify-between py-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-body-sm font-bold text-on-surface">{label}</span>
              <span className="text-label-md text-secondary">{desc}</span>
            </div>
            <Toggle
              on={checked[key]}
              onToggle={() => setChecked((p) => ({ ...p, [key]: !p[key] }))}
            />
          </div>
        ))}
      </div>

      <div className="flex justify-end pt-6">
        <button
          type="button"
          className="bg-primary text-white font-bold text-body-sm px-8 py-3 rounded hover:opacity-90 transition-opacity"
        >
          {t("common.save_changes")}
        </button>
      </div>
    </SectionCard>
  );
}

function PreferencesPanel() {
  const { theme, setTheme } = useTheme();
  const { t, i18n } = useTranslation();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const activeTheme = mounted ? (theme ?? "system") : "system";
  const activeLang = mounted ? i18n.resolvedLanguage : undefined;

  return (
    <SectionCard>
      <SubHeader icon={SlidersHorizontal} title={t("settings.system_preferences")} />
      <div className="flex flex-col gap-6">

        {/* Language */}
        <div className="flex flex-col gap-2">
          <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
            {t("settings.language")}
          </label>
          <select
            value={activeLang ?? ""}
            onChange={(e) => setLanguage(e.target.value as Language)}
            className="h-11 px-4 rounded border border-outline-variant bg-surface-container text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-shadow w-64"
          >
            {LANGUAGES.map((lng) => (
              <option key={lng} value={lng}>{LANGUAGE_LABELS[lng]}</option>
            ))}
          </select>
        </div>

        {/* Theme — synced with the header toggle via next-themes */}
        <div className="flex flex-col gap-2">
          <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
            {t("settings.theme")}
          </label>
          <div className="flex gap-1 p-1 bg-surface-container rounded-lg w-fit">
            {(["light", "dark", "system"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setTheme(mode)}
                className={[
                  "px-5 py-2 text-body-sm font-bold rounded transition-all duration-150",
                  activeTheme === mode
                    ? "bg-surface-lowest text-on-surface shadow-card"
                    : "text-secondary hover:text-on-surface",
                ].join(" ")}
              >
                {t(`settings.theme_${mode}`)}
              </button>
            ))}
          </div>
          <p className="text-label-md text-secondary mt-0.5">
            {t("settings.theme_hint")}
          </p>
        </div>
      </div>
    </SectionCard>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("account");
  const { user } = useAuth();
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-8 pb-8">

      <PageHeader
        title={t("settings.title")}
        subtitle={t("settings.subtitle")}
      />

      <div className="flex gap-8 items-start">

        {/* Left tab nav */}
        <nav className="w-56 flex flex-col gap-1 shrink-0" aria-label={t("settings.navigation")}>
          {TABS.map(({ id, labelKey, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={[
                "flex items-center gap-3 px-4 py-3 rounded text-left transition-colors duration-150 font-semibold text-body-sm w-full",
                activeTab === id
                  ? "bg-primary/10 text-primary"
                  : "text-secondary hover:bg-surface-container hover:text-on-surface",
              ].join(" ")}
            >
              <Icon size={18} strokeWidth={1.75} className="shrink-0" />
              {t(labelKey)}
            </button>
          ))}
        </nav>

        {/* Tab panels */}
        <div className="flex-1 min-w-0">
          {activeTab === "account"       && <AccountAndSafetyPanel user={user} />}
          {activeTab === "notifications" && <NotificationsPanel />}
          {activeTab === "preferences"   && <PreferencesPanel />}
        </div>
      </div>
    </div>
  );
}
