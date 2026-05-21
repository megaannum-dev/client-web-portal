"use client";

import { useState } from "react";
import {
  ShieldCheck,
  Bell,
  SlidersHorizontal,
  CreditCard,
  Lock,
  Shield,
  Pencil,
  KeyRound,
  Trash2,
  Plus,
} from "@/lib/icons";
import { useAuth } from "@/components/auth/AuthProvider";
import { PageHeader }  from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab = "account" | "notifications" | "preferences" | "cards";

interface TabDef {
  id: Tab;
  label: string;
  icon: React.ElementType;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const TABS: TabDef[] = [
  { id: "account",       label: "Account and Safety", icon: ShieldCheck      },
  { id: "notifications", label: "Notifications",      icon: Bell             },
  { id: "preferences",   label: "Preferences",        icon: SlidersHorizontal },
  { id: "cards",         label: "Bank Cards",          icon: CreditCard       },
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
  const email = user?.email ?? "alex.thompson@example.com";
  const [twoFa, setTwoFa] = useState(false);

  return (
    <SectionCard>
      {/* ── Account Information ── */}
      <SubHeader icon={Lock} title="Account Information" />

      <div className="flex flex-col divide-y divide-outline-variant ">
        {/* Email row */}
        <div className="flex items-center justify-between py-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
              Email Address
            </span>
            <span className="text-body-sm text-on-surface">{email}</span>
          </div>
          <button
            type="button"
            className="flex items-center gap-1.5 text-body-sm font-semibold text-primary hover:opacity-75 transition-opacity shrink-0"
          >
            <Pencil size={13} strokeWidth={2} />
            Change Email
          </button>
        </div>

        {/* Phone row */}
        <div className="flex items-center justify-between py-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
              Phone Number
            </span>
            <span className="text-body-sm text-on-surface">+1 (555) 0123-4567</span>
          </div>
          <button
            type="button"
            className="flex items-center gap-1.5 text-body-sm font-semibold text-primary hover:opacity-75 transition-opacity shrink-0"
          >
            <Pencil size={13} strokeWidth={2} />
            Change Phone Number
          </button>
        </div>
      </div>

      <hr className="border-outline-variant mb-8" />

      {/* ── Safety ── */}
      <SubHeader icon={Shield} title="Safety" />

      <div className="flex flex-col gap-5">
        {/* 2FA toggle */}
        <div className="flex items-center justify-between p-4 bg-surface-container rounded-lg">
          <div>
            <p className="text-body-sm font-bold text-on-surface">Two-Factor Authentication</p>
            <p className="text-label-md text-secondary mt-0.5">
              Add an extra layer of security to your account.
            </p>
          </div>
          <Toggle on={twoFa} onToggle={() => setTwoFa((v) => !v)} />
        </div>

        {/* Change password */}
        <button
          type="button"
          className="flex items-center gap-2 text-body-sm font-bold text-primary hover:opacity-75 transition-opacity w-fit"
        >
          <KeyRound size={15} strokeWidth={2} />
          Change Password
        </button>

        {/* Save */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            className="bg-primary text-white font-bold text-body-sm px-8 py-3 rounded hover:opacity-90 transition-opacity"
          >
            Save Changes
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

function NotificationsPanel() {
  const [checked, setChecked] = useState({ email: true, push: true, sms: false });

  const items: { key: keyof typeof checked; label: string; desc: string }[] = [
    { key: "email", label: "Email Alerts",        desc: "Receive important account updates by email."       },
    { key: "push",  label: "Push Notifications",  desc: "Get real-time alerts on your device."              },
    { key: "sms",   label: "SMS Updates",         desc: "Receive text messages for critical notifications." },
  ];

  return (
    <SectionCard>
      <SubHeader icon={Bell} title="Notifications" />
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
          Save Changes
        </button>
      </div>
    </SectionCard>
  );
}

function PreferencesPanel() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  return (
    <SectionCard>
      <SubHeader icon={SlidersHorizontal} title="System Preferences" />
      <div className="flex flex-col gap-6">

        {/* Language */}
        <div className="flex flex-col gap-2">
          <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
            Language
          </label>
          <select className="h-11 px-4 rounded border border-outline-variant bg-surface-container text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-shadow w-64">
            <option>English (US)</option>
            <option>Spanish</option>
            <option>French</option>
          </select>
        </div>

        {/* Theme */}
        <div className="flex flex-col gap-2">
          <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
            Theme
          </label>
          <div className="flex gap-1 p-1 bg-surface-container rounded-lg w-fit">
            {(["light", "dark"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                className={[
                  "px-6 py-2 text-body-sm font-bold rounded capitalize transition-all duration-150",
                  theme === t
                    ? "bg-surface-lowest text-on-surface shadow-card"
                    : "text-secondary hover:text-on-surface",
                ].join(" ")}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            className="bg-primary text-white font-bold text-body-sm px-8 py-3 rounded hover:opacity-90 transition-opacity"
          >
            Save Changes
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

function BankCardsPanel() {
  const [cards, setCards] = useState(DUMMY_CARDS);

  const removeCard = (id: number) =>
    setCards((prev) => prev.filter((c) => c.id !== id));

  return (
    <SectionCard>
      <SubHeader icon={CreditCard} title="Bank Cards" />

      <div className="flex flex-col gap-3 mb-6">
        {cards.map((card) => (
          <div
            key={card.id}
            className="flex items-center justify-between p-4 bg-surface-container rounded-lg border border-outline-variant"
          >
            <div className="flex items-center gap-4">
              {/* Brand badge */}
              <div className="w-12 h-8 rounded flex items-center justify-center bg-surface-lowest border border-outline-variant shrink-0">
                <span className="text-[10px] font-black tracking-tight text-on-surface uppercase">
                  {card.brand === "Mastercard" ? "MC" : card.brand}
                </span>
              </div>

              {/* Card details */}
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-body-sm font-bold text-on-surface">
                    {card.brand} **** {card.last4}
                  </span>
                  {card.primary && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                      Primary
                    </span>
                  )}
                </div>
                <span className="text-label-md text-secondary">Expires {card.expiry}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => removeCard(card.id)}
              aria-label={`Remove ${card.brand} card ending ${card.last4}`}
              className="p-2 rounded text-secondary hover:text-error hover:bg-error-container/20 transition-colors duration-150 shrink-0"
            >
              <Trash2 size={16} strokeWidth={1.75} />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="flex items-center gap-2 w-full justify-center border border-dashed border-outline-variant rounded-lg py-3 text-body-sm font-semibold text-secondary hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors duration-150"
      >
        <Plus size={16} strokeWidth={2} />
        Add New Card
      </button>
    </SectionCard>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("account");
  const { user } = useAuth();

  return (
    <div className="flex flex-col gap-8 pb-8">

      <PageHeader
        title="Settings"
        subtitle="Manage your account security, notifications, and preferences."
      />

      <div className="flex gap-8 items-start">

        {/* Left tab nav */}
        <nav className="w-56 flex flex-col gap-1 shrink-0" aria-label="Settings navigation">
          {TABS.map(({ id, label, icon: Icon }) => (
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
              {label}
            </button>
          ))}
        </nav>

        {/* Tab panels */}
        <div className="flex-1 min-w-0">
          {activeTab === "account"       && <AccountAndSafetyPanel user={user} />}
          {activeTab === "notifications" && <NotificationsPanel />}
          {activeTab === "preferences"   && <PreferencesPanel />}
          {activeTab === "cards"         && <BankCardsPanel />}
        </div>
      </div>
    </div>
  );
}
