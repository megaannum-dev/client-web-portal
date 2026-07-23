"use client";

/* ============================================================
   Compliance Overview — shared widgets (stat tile, panel, row).
   Ported from the design prototype (CoOverview.jsx).
   ============================================================ */

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ClipboardCheck, RefreshCw, Shield, FileText, ChevronRight } from "@/lib/icons";

/* ---- urgency tag (renewals due-date countdown) -------------- */
const URG_COLOR: Record<string, string> = { bad: "#ba1a1a", warn: "#c2410c", "": "var(--secondary)" };
export function ovUrg(days: number): { tone: "bad" | "warn" | ""; txt: string } {
  if (days < 0) return { tone: "bad", txt: `Overdue ${-days}d` };
  if (days <= 7) return { tone: "warn", txt: `Due in ${days}d` };
  return { tone: "", txt: `Due in ${days}d` };
}
export function UrgTag({ days }: { days: number }) {
  const u = ovUrg(days);
  return <span className="text-[12px] font-bold tabular-nums" style={{ color: URG_COLOR[u.tone] }}>{u.txt}</span>;
}

/* ---- one row inside an OvPanel ------------------------------ */
type RowKind = "onboarding" | "renewal" | "redemption" | "guideline";
const KIND_META: Record<RowKind, [LucideIcon, string, string]> = {
  onboarding: [ClipboardCheck, "var(--primary)", "rgba(242,116,5,0.1)"],
  renewal: [RefreshCw, "#7c5cbf", "#efe9fb"],
  redemption: [Shield, "#b1402f", "rgba(186,26,26,0.08)"],
  guideline: [FileText, "var(--secondary)", "var(--surface-container)"],
};
export function OvRow({
  kind, title, sub, right, onClick,
}: {
  kind: RowKind;
  title: string;
  sub: string;
  right?: ReactNode;
  onClick?: () => void;
}) {
  const [Icon, fg, bg] = KIND_META[kind];
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 border-t border-outline-variant px-0.5 py-[11px]"
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px]" style={{ background: bg, color: fg }}>
        <Icon size={15} strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-bold text-on-surface">{title}</div>
        <div className="mt-px text-[12px] text-secondary">{sub}</div>
      </div>
      <div className="flex flex-none items-center gap-2.5">{right}</div>
      <ChevronRight size={15} strokeWidth={2} className="text-secondary" />
    </div>
  );
}

/* ---- panel card (holds a list of OvRow) --------------------- */
export function OvPanel({
  icon: Icon, title, count, alertCount, viewLabel, onViewAll, children,
}: {
  icon: LucideIcon;
  title: string;
  count?: number;
  alertCount?: number;
  viewLabel?: string;
  onViewAll?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col rounded-[14px] border border-outline-variant bg-surface-lowest px-[18px] py-4 shadow-card">
      <div className="mb-0.5 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-[15px] font-bold text-on-surface">
          <Icon size={16} strokeWidth={2} />{title}
          {count != null && (
            <span
              className="inline-flex items-center rounded-full px-2 py-[3px] text-[11.5px] font-bold leading-none"
              style={{ color: alertCount ? "#93000a" : "var(--primary)", background: alertCount ? "#ffeceb" : "var(--primary-fixed)" }}
            >
              {count}
            </span>
          )}
        </span>
        {viewLabel && (
          <button
            type="button"
            onClick={onViewAll}
            className="flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-[12.5px] font-semibold text-primary"
          >
            {viewLabel}<ChevronRight size={13} strokeWidth={2} />
          </button>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

/* ---- summary tile (top stat row) ---------------------------- */
export function OvTile({
  icon: Icon, value, label, sub, subTone, alert,
}: {
  icon: LucideIcon;
  value: ReactNode;
  label: string;
  sub: string;
  subTone?: "bad" | "warn";
  alert?: boolean;
}) {
  return (
    <div
      className="rounded-[14px] border bg-surface-lowest px-[18px] py-4 shadow-card"
      style={{ borderColor: alert ? "#f3c6be" : "var(--outline-variant)" }}
    >
      <span className="flex text-secondary"><Icon size={16} strokeWidth={1.75} /></span>
      <div className="mt-[9px] text-[28px] font-bold tabular-nums tracking-[-0.02em]">{value}</div>
      <div className="mt-[3px] text-[12.5px] text-secondary">{label}</div>
      <div
        className="mt-1.5 text-[12px]"
        style={{ fontWeight: subTone ? 700 : 400, color: subTone === "bad" ? "#93000a" : subTone === "warn" ? "#c2410c" : "var(--secondary)" }}
      >
        {sub}
      </div>
    </div>
  );
}
