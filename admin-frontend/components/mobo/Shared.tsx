"use client";

/* ============================================================
   MOBO shared scaffolding & primitives
   MetricStat · SegBar · CompareGrid · Eyebrow · TriageDetail
   Ported from the design handoff (MoboShared.jsx).
   ============================================================ */

import { type ReactNode } from "react";
import {
  X, Clock, Check, UserRound, MessageSquare, ArrowUpRight, ShieldAlert,
} from "@/lib/icons";
import type { LucideIcon } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import {
  SEV_LABEL, SEV_TONE,
  type CompareField, type Exception, type ReconLine,
} from "@/lib/mock/mobo-data";

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

/* ---- render {b}…{/b} as a highlighted (break) span --------- */
export function richSub(s: string | null): ReactNode {
  if (!s) return null;
  const parts = String(s).split(/(\{b\}.*?\{\/b\})/g);
  return parts.map((p, i) => {
    const m = p.match(/^\{b\}(.*?)\{\/b\}$/);
    if (m) {
      return (
        <span key={i} className="font-bold" style={{ color: "#ba1a1a" }}>
          {m[1]}
        </span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

/* ---- Section eyebrow label --------------------------------- */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={["mb-2.5 text-[11px] font-bold uppercase tracking-[0.05em] text-secondary", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}

/* ---- Field-by-field comparison grid (Internal vs Custodian) */
export function CompareGrid({
  fields,
  leftLabel = "Internal book — OMS",
  rightLabel = "Custodian feed",
}: {
  fields: CompareField[];
  leftLabel?: string;
  rightLabel?: string;
}) {
  return (
    <div className="mb-[18px] overflow-hidden rounded-xl border border-outline-variant">
      <div className="grid grid-cols-2 border-b border-outline-variant">
        <div className="border-r border-outline-variant bg-surface-low px-3.5 py-[9px] text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">
          {leftLabel}
        </div>
        <div className="bg-surface-low px-3.5 py-[9px] text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">
          {rightLabel}
        </div>
      </div>
      {fields.map((f, i) => {
        const cellBg = f.d ? "rgba(186,26,26,0.05)" : "transparent";
        const valCls = f.d ? "font-bold" : "font-medium";
        const valColor = f.d ? "#93000a" : "var(--on-surface)";
        const borderTop = i ? "border-t border-outline-variant" : "";
        return (
          <div key={i} className="grid grid-cols-2">
            <div className={`border-r border-outline-variant px-3.5 py-2.5 ${borderTop}`} style={{ background: cellBg }}>
              <div className="mb-[3px] text-[10.5px] font-bold uppercase tracking-[0.04em] text-secondary">{f.k}</div>
              <div className={`text-[14px] tabular-nums ${valCls}`} style={{ color: valColor }}>{f.iv}</div>
            </div>
            <div className={`px-3.5 py-2.5 ${borderTop}`} style={{ background: cellBg }}>
              <div className="mb-[3px] text-[10.5px] font-bold uppercase tracking-[0.04em] text-secondary">{f.k}</div>
              <div className={`text-[14px] tabular-nums ${valCls}`} style={{ color: valColor }}>{f.cv}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---- Triage detail (reused: recon line OR exception) ------- */
export function TriageDetail({
  item, kind, onClose,
}: {
  item: ReconLine | Exception;
  kind: "recon" | "exception";
  onClose: () => void;
}) {
  const isRecon = kind === "recon";
  const reconItem = item as ReconLine;
  const excItem = item as Exception;
  const matched = isRecon && reconItem.state === "ok";

  let title: string;
  let sub: string;
  let chip: ReactNode;
  if (isRecon) {
    title = matched ? "Matched" : reconItem.breakType ?? "Break";
    sub = `${reconItem.intRef || "no internal record"} · ${reconItem.cusRef || "no custodian record"}`;
    const tone = reconItem.state === "ok" ? "active" : reconItem.state === "brk" ? "warm" : "failed";
    const label = reconItem.state === "ok" ? "Matched" : reconItem.state === "brk" ? "Break" : "Unmatched";
    chip = <Chip tone={tone} dot={false}>{label}</Chip>;
  } else {
    title = excItem.type;
    sub = `Raised ${excItem.raised} · ${excItem.srcRef} · from Trade Reconciliation`;
    chip = <Chip tone={SEV_TONE[excItem.sev]} dot={false}>{SEV_LABEL[excItem.sev]}</Chip>;
  }

  const carried = !isRecon && excItem.carried;

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[16px] font-bold leading-[1.3] text-on-surface">{title} · {item.inst}</div>
          <div className="mt-1 text-[12.5px] text-secondary">{sub}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {chip}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex rounded-md p-[3px] text-secondary transition-colors hover:bg-surface-container"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* carried-forward banner */}
      {carried && (
        <div
          className="mb-4 flex items-center gap-2.5 rounded-[10px] px-[13px] py-2.5"
          style={{ background: "#fff3e1", border: "1px solid #f3d9b4" }}
        >
          <span className="flex shrink-0" style={{ color: "#b9741f" }}>
            <Clock size={15} strokeWidth={2} />
          </span>
          <span className="text-[12.5px] font-semibold" style={{ color: "#8a5a16" }}>
            Carried forward {excItem.age} · resolve before today&apos;s 18:00 settlement cutoff
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <CompareGrid fields={item.fields} />

        {/* audit trail (exceptions only) */}
        {!isRecon && excItem.trail && (
          <div className="mb-1">
            <Eyebrow>Audit trail</Eyebrow>
            <div className="relative pl-[18px]">
              <span className="absolute bottom-2 left-1 top-1 w-[1.5px] bg-outline-variant" />
              {excItem.trail.map((x, i) => (
                <div key={i} className="relative" style={{ paddingBottom: i < excItem.trail.length - 1 ? 14 : 0 }}>
                  <span
                    className="absolute left-[-18px] top-[3px] h-[9px] w-[9px] rounded-full"
                    style={{
                      background: x.acc ? "var(--primary)" : "var(--surface-highest)",
                      border: `1.5px solid ${x.acc ? "var(--primary)" : "var(--outline)"}`,
                    }}
                  />
                  <div className="text-[13px] font-bold text-on-surface">{x.t}</div>
                  <div className="mt-px text-[12px] text-secondary">{x.d}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {isRecon && !matched && <Eyebrow className="mt-1">Raise exception</Eyebrow>}
      </div>

      {/* actions */}
      <div className="mt-3.5 shrink-0 border-t border-outline-variant pt-3.5">
        {matched ? (
          <div className="flex items-center gap-2 text-[13px] text-secondary">
            <Check size={15} strokeWidth={2} color="#16a34a" /> All fields match on this trade.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            <Button variant="secondary" icon={UserRound} className="min-w-0 flex-1 px-2.5 py-[9px]">Assign</Button>
            <Button variant="secondary" icon={MessageSquare} className="min-w-0 flex-1 px-2.5 py-[9px]">Comment</Button>
            <Button variant="secondary" icon={ArrowUpRight} className="min-w-0 flex-1 px-2.5 py-[9px]">Escalate</Button>
            <Button icon={isRecon ? ShieldAlert : Check} className="min-w-0 flex-1 px-2.5 py-[9px]">
              {isRecon ? "Raise" : "Resolve"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}