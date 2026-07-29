"use client";

/* ============================================================
   MOBO — small 2-tab underline bar (Trade Reconciliation page).
   Not a generic tab framework — just {key,label,badge?,tone?}[].
   Ported from the design handoff's `TabBar` (window.MOBO.TabBar).
   ============================================================ */

import { Chip, type ChipTone } from "@/components/ui/Chip";

export interface TabBarTab {
  key: string;
  label: string;
  /** Count shown as a Chip badge next to the label; omitted when falsy. */
  badge?: number;
  tone?: ChipTone;
}

export function TabBar({
  tabs, active, onChange,
}: {
  tabs: TabBarTab[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="mb-5 flex gap-1 border-b border-outline-variant">
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={`flex items-center gap-2 border-b-2 px-4 py-[11px] text-[14.5px] font-bold transition-colors duration-150 ${
              isActive ? "border-primary text-on-surface" : "border-transparent text-secondary hover:text-on-surface"
            }`}
          >
            {t.label}
            {t.badge != null && (
              <Chip tone={t.tone ?? "neutral"} dot={false}>{t.badge}</Chip>
            )}
          </button>
        );
      })}
    </div>
  );
}
