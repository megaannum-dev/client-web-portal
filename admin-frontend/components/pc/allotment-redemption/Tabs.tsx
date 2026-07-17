"use client";

import { Inbox, Shield } from "@/lib/icons";
import type { LucideIcon } from "lucide-react";

type TabKey = "allot" | "redeem";

function Tab({
  active, onClick, Icon, label, count, warn,
}: {
  active: boolean;
  onClick: () => void;
  Icon: LucideIcon;
  label: string;
  count: number;
  warn: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer items-center gap-2 border-none bg-transparent px-4 py-[11px] text-[14.5px] font-bold"
      style={{
        borderBottom: active ? "2px solid var(--primary)" : "2px solid transparent",
        color: active ? "var(--on-surface)" : "var(--secondary)",
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
}

export function ArTabs({
  tab, onTab, pendAllot, pendRedeem,
}: {
  tab: TabKey;
  onTab: (t: TabKey) => void;
  pendAllot: number;
  pendRedeem: number;
}) {
  return (
    <div className="mb-[18px] flex gap-1 border-b border-outline-variant">
      <Tab active={tab === "allot"} onClick={() => onTab("allot")} Icon={Inbox} label="Allotments" count={pendAllot} warn={false} />
      <Tab active={tab === "redeem"} onClick={() => onTab("redeem")} Icon={Shield} label="Redemptions" count={pendRedeem} warn />
    </div>
  );
}
