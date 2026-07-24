"use client";

import type { LucideIcon } from "lucide-react";
import { ClipboardCheck, Shield, FileText } from "@/lib/icons";

export type CoTab = "onboarding" | "redeem" | "guideline";

/* ---- Tab strip: Onboarding & Reviewing | Redemptions | Investment Guideline ---- */
export function CoTabs({
  tab, onTab, pendOb, pendCr, pendGr,
}: {
  tab: CoTab;
  onTab: (t: CoTab) => void;
  pendOb: number;
  pendCr: number;
  pendGr: number;
}) {
  const Tab = (key: CoTab, Icon: LucideIcon, label: string, count: number, warn: boolean) => {
    const on = tab === key;
    return (
      <button
        type="button"
        onClick={() => onTab(key)}
        className="flex cursor-pointer items-center gap-2 border-none bg-transparent px-4 py-[11px] text-[14.5px] font-bold"
        style={{
          borderBottom: on ? "2px solid var(--primary)" : "2px solid transparent",
          color: on ? "var(--on-surface)" : "var(--secondary)",
        }}
      >
        <Icon size={15} strokeWidth={2} />
        {label}
        {count > 0 && (
          <span
            className="rounded-full px-2 py-px text-[11.5px] font-bold"
            style={{
              color: warn ? "#994700" : "var(--primary)",
              background: warn ? "#fff3e8" : "var(--primary-fixed)",
            }}
          >
            {count}
          </span>
        )}
      </button>
    );
  };
  return (
    <div className="mb-[18px] flex gap-1 border-b border-outline-variant">
      {Tab("onboarding", ClipboardCheck, "Onboarding & Reviewing", pendOb, false)}
      {Tab("redeem", Shield, "Redemptions", pendCr, true)}
      {Tab("guideline", FileText, "Investment Guideline", pendGr, false)}
    </div>
  );
}
