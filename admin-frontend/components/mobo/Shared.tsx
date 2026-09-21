"use client";

/* ============================================================
   MOBO shared scaffolding & primitives
   MetricStat · SegBar · SysBadge · SystemCell
   Ported from the design handoff (MoboShared.jsx).
   ============================================================ */

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { ReconNode, Sys } from "@/lib/mobo/executions";

/* ---- Metric stat tile -------------------------------------- */
type StatTone = "" | "ok" | "warn" | "bad";

const STAT_TONE: Record<StatTone, { dot: string; val: string }> = {
  "":   { dot: "var(--secondary)", val: "var(--on-surface)" },
  ok:   { dot: "#16a34a", val: "var(--on-surface)" },
  warn: { dot: "#ea580c", val: "var(--on-surface)" },
  bad:  { dot: "#ba1a1a", val: "#93000a" },
};

export function MetricStat({
  label, value, sub, tone = "", icon: Icon, onClick,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: StatTone;
  icon?: LucideIcon;
  onClick?: () => void;
}) {
  const t = STAT_TONE[tone] ?? STAT_TONE[""];
  return (
    <div
      onClick={onClick}
      className={[
        "min-w-0 rounded-[14px] border border-outline-variant bg-surface-lowest px-[18px] py-4 shadow-card transition-shadow duration-150",
        onClick ? "cursor-pointer hover:shadow-hover" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: t.dot }} />
        <span className="truncate text-[11.5px] font-bold uppercase tracking-[0.05em] text-secondary">
          {label}
        </span>
        {Icon && (
          <span className="ml-auto flex text-secondary">
            <Icon size={15} strokeWidth={1.75} />
          </span>
        )}
      </div>
      <div className="mt-[9px] flex items-baseline gap-2">
        <span
          className="text-[30px] font-bold tabular-nums tracking-[-0.02em]"
          style={{ color: t.val }}
        >
          {value}
        </span>
        {sub && <span className="text-[13px] font-semibold text-secondary">{sub}</span>}
      </div>
    </div>
  );
}

/* ---- Segmented progress bar (matched / breaks / unmatched) - */
export function SegBar({ ok, warn, bad, height = 12 }: { ok: number; warn: number; bad: number; height?: number }) {
  return (
    <div
      className="flex overflow-hidden rounded-full bg-surface-container"
      style={{ height }}
    >
      <span style={{ width: `${ok}%`, background: "#3f9d63" }} />
      <span style={{ width: `${warn}%`, background: "#e0922f" }} />
      <span style={{ width: `${bad}%`, background: "#d3654f" }} />
    </div>
  );
}

/* ---- three-system source badge (CRM / IB / PC) ------------- */
export const SYS_CLR: Record<Sys, string> = {
  CRM: "var(--primary)",
  IB: "#3f6196",
  PC: "#6b6a6a",
};

export function SysBadge({ sys }: { sys: Sys }) {
  return (
    <span
      className="inline-flex min-w-[50px] items-center justify-center rounded-[5px] px-[8px] py-[3px] text-[11px] font-bold text-white"
      style={{ background: SYS_CLR[sys] }}
    >
      {sys}
    </span>
  );
}

/* ---- Which system(s) a recon row belongs to ----------------
   A trade spans systems, so it gets one colour square per contributing
   system; an order or a fill is system-scoped and gets the badge. */
export function SystemCell({ node }: { node: ReconNode }) {
  if (node.level === 0) {
    return (
      <span className="inline-flex gap-1">
        {node.systems.map((s) => (
          <span key={s} title={s} className="h-[9px] w-[9px] rounded-[2px]" style={{ background: SYS_CLR[s] }} />
        ))}
      </span>
    );
  }
  return node.system ? <SysBadge sys={node.system} /> : <span className="text-secondary">—</span>;
}
