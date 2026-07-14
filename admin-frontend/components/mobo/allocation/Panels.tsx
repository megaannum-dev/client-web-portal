"use client";

/* ============================================================
   MOBO — Post-Trade Allocation supporting panels
   Donut · ScopeToggle · OrientationToggle · ModelRow ·
   PerModelDetail · EmptyCard · DateControl

   Ported from the design handoff (MoboAllocation.jsx), re-styled
   to Tailwind + this codebase's component conventions. The
   "All models" stacked-bar chart and the top-level page composition
   live in sibling files — not here.
   ============================================================ */

import { useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  BarChart3, BarChartHorizontal, Layers, Coins, CalendarDays, Check, RefreshCw,
} from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { ptaMoney } from "@/lib/mobo/allocation";
import type { PtaClientShare, PtaModelAllocation } from "@/lib/mobo/types";

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
   per segment. Scales to fill its container (largest square that
   fits). Hover a segment for a floating tooltip (portaled to
   <body>, positioned at the pointer).
   ============================================================ */
const DONUT_VIEW = 200;

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
}: {
  shares: PtaClientShare[];
  centerVal: string;
  centerSub: string;
}) {
  const [tip, setTip] = useState<DonutTip | null>(null);
  const r = DONUT_VIEW * 0.37;
  const cx = DONUT_VIEW / 2;
  const cy = DONUT_VIEW / 2;
  const sw = DONUT_VIEW * 0.145;
  const C = 2 * Math.PI * r;

  // Arc length uses the EXACT delegated-amount fraction, not `pct` (that's
  // pre-rounded to a whole percent for display and rarely sums to exactly
  // 100 across a model's clients — using it for geometry left visible
  // gaps or overlaps between segments). `pct` is still used for the
  // tooltip's displayed share.
  const total = shares.reduce((sum, s) => sum + s.allocated, 0) || 1;
  let off = 0;
  const arcs = shares.map((s) => {
    const frac = s.allocated / total;
    const startOff = off;
    off += frac * C;
    return { ...s, frac, startOff, color: clientColor(s.clientId) };
  });

  const move = (e: ReactMouseEvent, s: (typeof arcs)[number]) => {
    setTip({
      x: e.clientX,
      y: e.clientY,
      name: s.name,
      units: s.units,
      amt: ptaMoney(s.allocated),
      pct: s.pct,
      color: s.color,
    });
  };

  return (
    <div className="relative aspect-square h-[80%] w-auto max-w-full">
      <svg viewBox={`0 0 ${DONUT_VIEW} ${DONUT_VIEW}`} className="block h-full w-full">
        {arcs.map((s) => {
          const len = Math.max(0, s.frac * C - 1.5);
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
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--on-surface)"
          fontSize={DONUT_VIEW * 0.135}
          fontWeight={700}
          style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}
        >
          {centerVal}
        </text>
        <text
          x={cx}
          y={cy + DONUT_VIEW * 0.08}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--secondary)"
          fontSize={DONUT_VIEW * 0.06}
          fontWeight={700}
          style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}
        >
          {centerSub}
        </text>
      </svg>
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
    <div className="flex h-full flex-col rounded-2xl border border-outline-variant bg-surface-lowest px-[22px] pb-[22px] pt-[18px] shadow-card">
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
      <div className="flex min-h-0 flex-1 items-center justify-center py-2">
        <Donut shares={model.clientShares} centerVal={ptaMoney(model.traded)} centerSub="traded" />
      </div>
      <p className="mt-4 text-center text-[12px] text-secondary">
        Hover a segment for its client, units, delegated amount and share.
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
   DateControl — settlement-day dropdown (4 discrete dates)
   ============================================================ */
const PTA_DISCRETE_DATES = ["03 Jun 2026", "02 Jun 2026", "01 Jun 2026", "29 May 2026"];

export function DateControl({
  dateLabel,
  onPickDate,
}: {
  dateLabel: string;
  onPickDate: (d: string) => void;
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
            const on = d === dateLabel;
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
        </div>
      )}
    </div>
  );
}
