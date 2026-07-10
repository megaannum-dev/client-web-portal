"use client";

/* ============================================================
   MOBO — Post-Trade Allocation supporting panels
   Donut · ScopeToggle · OrientationToggle · ModelRow ·
   PerModelDetail · RangeCard · EmptyCard · DateControl

   Ported from the design handoff (MoboAllocation.jsx), re-styled
   to Tailwind + this codebase's component conventions. The
   "All models" stacked-bar chart and the top-level page composition
   live in sibling files — not here.
   ============================================================ */

import { useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  BarChart3, BarChartHorizontal, Layers, Coins, CalendarDays, Check, History, RefreshCw,
} from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { ptaMoney } from "@/lib/mobo/allocation";
import type { PtaClientShare, PtaModelAllocation, PtaTrendPoint } from "@/lib/mobo/types";

/* ============================================================
   Client → color

   Keyed by clientId (a hash), not by array position — so the same
   client always gets the same color here regardless of which subset
   of clients is passed in (a model's donut only ever sees the
   clients subscribed to THAT model). This also means the sibling
   `StackedBarChart` component, which independently colors the same
   client ids, only needs to call `clientColor(clientId)` the same
   way to land on the same palette — no shared client list required.
   If it instead colors by array index, the orchestrator should
   reconcile the two into one shared import.

   Hues are the dataviz-skill's validated categorical set (already
   passed the CVD/contrast checks — see the skill's reference
   palette), used in its fixed slot order.
   ============================================================ */
const CATEGORICAL_PALETTE = [
  "#2a78d6", // blue
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
  "#e87ba4", // magenta
  "#eb6834", // orange
];

export function clientColor(clientId: string): string {
  let h = 0;
  for (let i = 0; i < clientId.length; i++) h = (h * 31 + clientId.charCodeAt(i)) >>> 0;
  return CATEGORICAL_PALETTE[h % CATEGORICAL_PALETTE.length];
}

/* ============================================================
   Donut — SVG donut/pie built from stroked circle arcs, one client
   per segment. Hover a segment for a floating tooltip (portaled to
   <body>, positioned at the pointer).
   ============================================================ */
interface DonutTip {
  x: number;
  y: number;
  name: string;
  units: number;
  amt: string;
  pct: number;
  color: string;
}

export function Donut({
  shares,
  centerVal,
  centerSub,
  size = 200,
}: {
  shares: PtaClientShare[];
  centerVal: string;
  centerSub: string;
  size?: number;
}) {
  const [tip, setTip] = useState<DonutTip | null>(null);
  const r = size * 0.37;
  const cx = size / 2;
  const cy = size / 2;
  const sw = size * 0.145;
  const C = 2 * Math.PI * r;

  let off = 0;
  const arcs = shares.map((s) => {
    const startOff = off;
    off += (s.pct / 100) * C;
    return { ...s, startOff, color: clientColor(s.clientId) };
  });

  const move = (e: ReactMouseEvent, s: (typeof arcs)[number]) => {
    setTip({
      x: e.clientX,
      y: e.clientY,
      name: s.name,
      units: s.units,
      amt: ptaMoney(s.delegated),
      pct: s.pct,
      color: s.color,
    });
  };

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {arcs.map((s) => {
          const len = Math.max(0, (s.pct / 100) * C - 1.5);
          const hovered = tip?.name === s.name;
          return (
            <circle
              key={s.clientId}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={hovered ? sw * 1.1 : sw}
              strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`}
              strokeDashoffset={(-s.startOff).toFixed(2)}
              transform={`rotate(-90 ${cx} ${cy})`}
              className="transition-[stroke-width] duration-150"
              onMouseEnter={(e) => move(e, s)}
              onMouseMove={(e) => move(e, s)}
              onMouseLeave={() => setTip(null)}
            />
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span
          className="font-bold tabular-nums tracking-[-0.01em] text-on-surface"
          style={{ fontSize: size * 0.135 }}
        >
          {centerVal}
        </span>
        <span
          className="mt-1 font-bold uppercase tracking-[0.04em] text-secondary"
          style={{ fontSize: size * 0.06 }}
        >
          {centerSub}
        </span>
      </div>
      {tip &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[9999] min-w-[128px] rounded-md border border-outline-variant bg-white px-[9px] py-[7px] shadow-overlay"
            style={{ left: tip.x, top: tip.y, transform: "translate(-50%, calc(-100% - 14px))" }}
          >
            <div className="mb-1 flex items-center gap-1.5">
              <span className="h-[9px] w-[9px] shrink-0 rounded-sm" style={{ background: tip.color }} />
              <span className="text-[12px] font-bold text-on-surface">{tip.name}</span>
            </div>
            <div className="mb-0.5 flex justify-between gap-4 text-[11.5px]">
              <span className="font-semibold text-secondary">Units</span>
              <span className="font-bold tabular-nums text-on-surface">{tip.units}×</span>
            </div>
            <div className="mb-0.5 flex justify-between gap-4 text-[11.5px]">
              <span className="font-semibold text-secondary">Delegated</span>
              <span className="font-bold tabular-nums text-on-surface">{tip.amt}</span>
            </div>
            <div className="flex justify-between gap-4 text-[11.5px]">
              <span className="font-semibold text-secondary">Share</span>
              <span className="font-bold tabular-nums text-on-surface">{tip.pct}%</span>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/* ============================================================
   ScopeToggle — "All models" / "Per model" pill toggle
   ============================================================ */
export function ScopeToggle({
  value,
  onChange,
}: {
  value: "all" | "per";
  onChange: (v: "all" | "per") => void;
}) {
  const opts: { id: "all" | "per"; label: string }[] = [
    { id: "all", label: "All models" },
    { id: "per", label: "Per model" },
  ];
  return (
    <div className="inline-flex gap-0.5 rounded-md bg-surface-container p-[3px]">
      {opts.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={[
              "rounded px-4 py-2 text-[13px] font-bold transition-all duration-150",
              on ? "bg-white text-on-surface shadow-card" : "bg-transparent text-secondary",
            ].join(" ")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================
   OrientationToggle — icon-only vertical / horizontal bar toggle
   ============================================================ */
export function OrientationToggle({
  value,
  onChange,
}: {
  value: "vertical" | "horizontal";
  onChange: (v: "vertical" | "horizontal") => void;
}) {
  const opts: { id: "vertical" | "horizontal"; icon: typeof BarChart3; title: string }[] = [
    { id: "vertical", icon: BarChart3, title: "Vertical bars" },
    { id: "horizontal", icon: BarChartHorizontal, title: "Horizontal bars" },
  ];
  return (
    <div className="inline-flex gap-px rounded-md bg-surface-container p-0.5">
      {opts.map((o) => {
        const on = value === o.id;
        const Icon = o.icon;
        return (
          <button
            key={o.id}
            type="button"
            title={o.title}
            onClick={() => onChange(o.id)}
            className={[
              "flex h-7 w-7 items-center justify-center rounded transition-all duration-150",
              on ? "bg-white text-on-surface shadow-card" : "bg-transparent text-secondary",
            ].join(" ")}
          >
            <Icon size={15} strokeWidth={1.75} />
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================
   ModelRow — model list row (name/acct, traded, progress bar,
   client-count + units subtext)
   ============================================================ */
export function ModelRow({
  model,
  active,
  onClick,
  maxTraded,
}: {
  model: PtaModelAllocation;
  active: boolean;
  onClick: () => void;
  maxTraded: number;
}) {
  const pct = maxTraded > 0 ? Math.round((model.traded / maxTraded) * 100) : 0;
  return (
    <div
      onClick={onClick}
      className={[
        "cursor-pointer rounded-md bg-surface-lowest p-3.5 transition-shadow duration-150",
        active ? "border-[1.5px] border-primary" : "border border-outline-variant hover:shadow-hover",
      ].join(" ")}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[14px] font-bold text-on-surface">
          {model.name}
          <span className="ml-[7px] text-[11px] font-semibold text-secondary">{model.acct}</span>
        </span>
        <span className="shrink-0 text-[15px] font-bold tabular-nums text-on-surface">{ptaMoney(model.traded)}</span>
      </div>
      <div className="h-[7px] overflow-hidden rounded-full bg-surface-container">
        <span
          className={`block h-full rounded-full ${active ? "bg-primary" : "bg-outline"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 text-[11.5px] text-secondary">
        {model.clientShares.length} clients · {model.unitsTotal}× units
      </div>
    </div>
  );
}

/* ============================================================
   PerModelDetail — the "Per model" card: header + Donut + hint
   ============================================================ */
export function PerModelDetail({
  model,
  settleDay,
}: {
  model: PtaModelAllocation;
  settleDay: string;
}) {
  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-lowest px-[22px] pb-[22px] pt-[18px] shadow-card">
      <div className="mb-[18px] flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[18px] font-semibold text-on-surface">{model.name} — client delegation</h3>
          <p className="mt-1 text-[13px] text-secondary">
            {ptaMoney(model.traded)} traded · {model.acct} · {model.clientShares.length} clients · {settleDay}
          </p>
        </div>
        {/* ponytail: decorative per the prototype — no model detail route to wire yet */}
        <Button variant="secondary" icon={Layers} onClick={() => {}}>
          View model
        </Button>
      </div>
      <div className="flex justify-center py-2">
        <Donut shares={model.clientShares} centerVal={ptaMoney(model.traded)} centerSub="traded" size={260} />
      </div>
      <p className="mt-4 text-center text-[12px] text-secondary">
        Hover a segment for its client, units, delegated amount and share.
      </p>
    </div>
  );
}

/* ============================================================
   RangeCard — multi-day trend bar chart + date-range pill selector
   ============================================================ */
export function RangeCard({
  trend,
  onPickDate,
  onPickRange,
}: {
  trend: PtaTrendPoint[];
  onPickDate?: (label: string) => void;
  onPickRange?: () => void;
}) {
  const max = Math.max(1, ...trend.map((d) => d.total));
  const quickRanges = ["Last day", "Last 5 days", "Month to date"];
  const activeIdx = 1; // "Last 5 days" — decorative default, matches the prototype

  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-lowest px-[22px] pb-[22px] pt-[18px] shadow-card">
      <h3 className="mb-3.5 text-[17px] font-semibold text-on-surface">Date range</h3>

      <div className="mb-[18px] inline-flex flex-wrap items-center gap-0.5 rounded-md bg-surface-container p-[3px]">
        {quickRanges.map((l, i) => (
          <button
            key={l}
            type="button"
            onClick={() => onPickDate?.(l)}
            className={[
              "rounded px-3.5 py-2 text-[13px] font-bold transition-all duration-150",
              i === activeIdx ? "bg-white text-on-surface shadow-card" : "bg-transparent text-secondary",
            ].join(" ")}
          >
            {l}
          </button>
        ))}
        {/* ponytail: decorative affordance — no real date-range picker in this pass */}
        <button
          type="button"
          onClick={() => onPickRange?.()}
          className="flex items-center gap-1.5 rounded px-3.5 py-2 text-[13px] font-bold text-secondary"
        >
          <CalendarDays size={13} strokeWidth={2} /> Custom…
        </button>
      </div>

      <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">
        Total traded · last {trend.length} settlement days
      </div>

      <div className="flex h-[220px] items-end gap-5 border-b border-outline px-1.5 pt-6">
        {trend.map((d, i) => {
          const isToday = i === trend.length - 1;
          const hPct = Math.max(6, Math.round((d.total / max) * 100));
          return (
            <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end">
              <div
                className={`relative w-[56%] max-w-[90px] rounded-t-[7px] ${isToday ? "bg-primary" : "bg-outline"}`}
                style={{ height: `${hPct}%` }}
              >
                <span className="absolute -top-[22px] left-1/2 -translate-x-1/2 whitespace-nowrap text-[12.5px] font-bold tabular-nums text-on-surface">
                  {ptaMoney(d.total)}
                </span>
              </div>
              <div className="mt-2.5 text-center text-[12.5px] font-bold text-on-surface">
                {d.date}
                {isToday && (
                  <div className="text-[10.5px] font-bold uppercase tracking-[0.04em] text-primary">today</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-[18px] border-t border-outline-variant pt-3.5 text-[12.5px] leading-[1.55] text-secondary">
        Default is the <b className="text-on-surface">last settlement day</b>. Widen the range to total the money
        traded over several days — the charts and breakdown re-scale to the selected window.
      </p>
    </div>
  );
}

/* ============================================================
   EmptyCard — not-yet-settled empty state
   ============================================================ */
export function EmptyCard({ settleDay }: { settleDay: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-outline-variant bg-surface-lowest px-8 py-12 text-center shadow-card">
      <span className="flex h-14 w-14 items-center justify-center rounded-[14px] bg-primary-fixed text-primary">
        <Coins size={26} strokeWidth={1.75} />
      </span>
      <div className="text-[17px] font-bold text-on-surface">No post-trade allocation for {settleDay} yet</div>
      <div className="max-w-[440px] text-[13.5px] leading-[1.55] text-secondary">
        Trades settle after the <b className="text-on-surface">18:00 GMT cutoff</b>. The allocation view populates
        once the day&apos;s book has reconciled and cleared.
      </div>
      {/* ponytail: decorative actions — no last-settled-day nav or feed refresh wired yet */}
      <div className="mt-1.5 flex flex-wrap justify-center gap-2.5">
        <Button icon={CalendarDays} onClick={() => {}}>
          View last settled day
        </Button>
        <Button variant="secondary" icon={RefreshCw} onClick={() => {}}>
          Refresh feeds
        </Button>
      </div>
    </div>
  );
}

/* ============================================================
   DateControl — settlement-day dropdown (4 discrete dates, plus an
   optional historical range option)
   ============================================================ */
const PTA_DISCRETE_DATES = ["03 Jun 2026", "02 Jun 2026", "01 Jun 2026", "29 May 2026"];

export function DateControl({
  dateLabel,
  effectiveView,
  allowDateRange,
  onPickDate,
  onPickRange,
}: {
  dateLabel: string;
  effectiveView: "all" | "per" | "range" | "empty";
  allowDateRange: boolean;
  onPickDate: (d: string) => void;
  onPickRange: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <Button variant="secondary" icon={CalendarDays} onClick={() => setOpen((o) => !o)}>
        {dateLabel}
      </Button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-[190px] rounded-md border border-outline-variant bg-white p-1.5 shadow-overlay">
          <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.05em] text-secondary">
            Settlement day
          </div>
          {PTA_DISCRETE_DATES.map((d) => {
            const on = effectiveView !== "range" && d === dateLabel;
            return (
              <button
                key={d}
                type="button"
                onClick={() => {
                  onPickDate(d);
                  setOpen(false);
                }}
                className={[
                  "flex w-full items-center justify-between rounded px-2.5 py-2 text-left text-[13px] font-semibold text-on-surface",
                  on ? "bg-surface-container" : "bg-transparent",
                ].join(" ")}
              >
                {d}
                {on && <Check size={14} strokeWidth={2} className="text-primary" />}
              </button>
            );
          })}
          {allowDateRange && (
            <>
              <div className="mx-0.5 my-1 h-px bg-outline-variant" />
              <button
                type="button"
                onClick={() => {
                  onPickRange();
                  setOpen(false);
                }}
                className={[
                  "flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-[13px] font-bold text-primary",
                  effectiveView === "range" ? "bg-surface-container" : "bg-transparent",
                ].join(" ")}
              >
                <History size={14} strokeWidth={2} /> Last 5 days (historical)
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
