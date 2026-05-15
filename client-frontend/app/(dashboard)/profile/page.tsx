"use client";

import { useState } from "react";
import { Pencil, Shield, Zap } from "@/lib/icons";
import { useAuth } from "@/components/AuthProvider";
import { PageHeader }  from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { EyeToggle }   from "@/components/ui/EyeToggle";

// ── Sub-components ─────────────────────────────────────────────────────────────

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 pb-3 border-b border-outline-variant">
      <span className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
        {label}
      </span>
      <span className="text-body-md text-on-surface">{value}</span>
    </div>
  );
}

function BalanceItem({ label, value, censored }: { label: string; value: string; censored: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
        {label}
      </span>
      <span className="text-[28px] font-bold text-on-surface leading-none tracking-tight">
        {censored ? "***********" : value}
      </span>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user } = useAuth();
  const [censored, setCensored] = useState(true);

  const displayName = user?.displayName ?? "Alex Thompson";
  const email       = user?.email       ?? "alex.thompson@example.com";

  return (
    <div className="flex flex-col gap-6 pb-8">

      <PageHeader
        title="User Profile"
        subtitle="Manage your personal information and document compliance status."
      />

      {/* ── Personal Information ─────────────────────────────────────────── */}
      <SectionCard
        title="Personal Information"
        action={
          <button
            type="button"
            aria-label="Edit personal information"
            className="p-2 rounded text-secondary hover:bg-surface-container hover:text-on-surface transition-colors duration-150"
          >
            <Pencil size={16} strokeWidth={1.75} />
          </button>
        }
      >
        <div className="flex gap-10 items-start">

          {/* Avatar */}
          <div className="flex flex-col items-center gap-2 shrink-0">
            <div className="size-24 rounded-full overflow-hidden shadow-card">
              <div className="size-full bg-gradient-to-br from-yellow-200 via-green-300 to-teal-600 flex items-center justify-center">
                <span className="text-headline-md font-bold text-white/80 select-none">
                  {displayName[0].toUpperCase()}
                </span>
              </div>
            </div>
            <button type="button" className="text-body-sm font-semibold text-primary hover:opacity-80 transition-opacity">
              Change Photo
            </button>
          </div>

          {/* Fields grid */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">
            <ProfileField label="Full Name" value={displayName} />
            <div className="grid grid-cols-2 gap-6">
              <ProfileField label="Phone Number" value="+1 (555) 0123-4567"           />
              <ProfileField label="Email"         value={email}                         />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <ProfileField label="Company"    value="Thompson Global Holdings" />
              <ProfileField label="Occupation" value="Chief Executive Officer"  />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <ProfileField label="Residential Address"   value="123 Maple Avenue, Suite 400" />
              <ProfileField label="Location of Residence" value="New York, NY, USA"           />
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── Account Balance ──────────────────────────────────────────────── */}
      <SectionCard
        title="Account Balance"
        action={<EyeToggle censored={censored} onToggle={() => setCensored((v) => !v)} />}
      >
        <div className="grid grid-cols-2 gap-8">
          <BalanceItem label="Total Portfolio Value" value="$1,240,500.00" censored={censored} />
          <BalanceItem label="Total Cash Value"      value="$85,200.00"    censored={censored} />
        </div>
      </SectionCard>

      {/* ── Document Verification ────────────────────────────────────────── */}
      <SectionCard title="Document Verification">
        <div className="grid grid-cols-2 gap-5">

          {/* KYC — due soon */}
          <div className="bg-warning-container border border-warning/25 rounded-lg p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Shield size={18} strokeWidth={1.75} className="text-warning shrink-0" />
                <span className="text-body-sm font-bold text-on-surface">KYC Document Status</span>
              </div>
              <span className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold bg-warning/10 text-warning border border-warning/25">
                Due in 10 days
              </span>
            </div>
            <p className="text-body-sm text-secondary leading-relaxed">
              Your annual Know Your Customer (KYC) renewal is required to maintain full account
              access. Please upload a valid government ID and proof of address.
            </p>
            <p className="text-body-sm text-on-surface">
              Annual Update Due:{" "}
              <span className="text-warning font-bold">25 Oct 2023</span>
            </p>
            <button type="button" className="w-full bg-warning text-white font-bold text-body-sm rounded-lg py-3 hover:opacity-90 transition-opacity">
              Upload KYC
            </button>
          </div>

          {/* AML — verified */}
          <div className="bg-surface-lowest border border-outline-variant rounded-lg p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Zap size={18} strokeWidth={1.75} className="text-primary shrink-0" />
                <span className="text-body-sm font-bold text-on-surface">AML Document Status</span>
              </div>
              <span className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold bg-green-50 text-green-700 border border-green-200">
                Verified
              </span>
            </div>
            <p className="text-body-sm text-secondary leading-relaxed">
              Anti-Money Laundering (AML) declaration is current. Next reporting cycle begins Oct
              2024. No immediate action required.
            </p>
            <p className="text-body-sm text-secondary">Annual Update Due: 13th Sept 2023</p>
            <button type="button" className="w-full border border-warning text-warning font-bold text-body-sm rounded-lg py-3 hover:bg-warning/5 transition-colors">
              Renew AML
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
