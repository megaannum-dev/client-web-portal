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

import { useState, useRef, useEffect, useCallback, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  BarChart3, BarChartHorizontal, Layers, Coins, CalendarDays, Check, RefreshCw,
  ChevronLeft, ChevronRight,
} from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { ptaMoney } from "@/lib/mobo/allocation";
import type { PtaClientShare, PtaModelAllocation, PtaRun } from "@/lib/mobo/types";

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
              <span className="font-semibold text-secondary">Allocated</span>
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
   DateControl — calendar picker with single-date + range modes
   ============================================================ */
const _dk = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const _sameDay = (a: Date | null, b: Date | null) =>
  a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const _inRange = (d: Date, s: Date, e: Date) => d >= s && d <= e;
const _fmtShort = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
const _fmtFull = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

const DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export function DateControl({
  dateLabel,
  runs,
  onPickDate,
  onPickRange,
}: {
  dateLabel: string;
  runs: PtaRun[];
  onPickDate: (d: string) => void;
  onPickRange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [isRange, setIsRange] = useState(false);
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null);
  const [hover, setHover] = useState<Date | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const dataSet = new Set(runs.map((r) => r.date));
  const today = _dk(now);

  // build grid for current month view
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startDow = (firstOfMonth.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: startDow }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewYear, viewMonth, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  };

  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const handleDayClick = useCallback((d: Date) => {
    if (!isRange) {
      onPickDate(_dk(d));
      setOpen(false);
      return;
    }
    // range mode
    if (!rangeStart || rangeEnd) {
      // first pick (or restart)
      setRangeStart(d);
      setRangeEnd(null);
    } else {
      // second pick — sort
      const [a, b] = d < rangeStart ? [d, rangeStart] : [rangeStart, d];
      setRangeStart(a);
      setRangeEnd(b);
    }
  }, [isRange, rangeStart, rangeEnd, onPickDate]);

  const applyRange = () => {
    if (rangeStart && rangeEnd) {
      onPickRange(_dk(rangeStart), _dk(rangeEnd));
      setOpen(false);
    }
  };

  // effective range end for hover preview
  const effectiveEnd = rangeEnd ?? (rangeStart && hover && !_sameDay(hover, rangeStart) ? hover : null);
  const sortedStart = rangeStart && effectiveEnd && effectiveEnd < rangeStart ? effectiveEnd : rangeStart;
  const sortedEnd = rangeStart && effectiveEnd && effectiveEnd < rangeStart ? rangeStart : effectiveEnd;

  return (
    <div className="relative" ref={ref}>
      <Button variant="secondary" icon={CalendarDays} onClick={() => setOpen((o) => !o)}>
        {dateLabel}
      </Button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-20 w-[296px] rounded-md border border-outline-variant bg-white p-3 shadow-overlay">
          {/* range toggle */}
          <label className="mb-2.5 flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-on-surface">
            <span
              className={[
                "flex h-[18px] w-[18px] items-center justify-center rounded border",
                isRange ? "border-primary bg-primary" : "border-outline-variant bg-white",
              ].join(" ")}
              onClick={() => { setIsRange((v) => !v); setRangeStart(null); setRangeEnd(null); }}
            >
              {isRange && <Check size={12} strokeWidth={2.5} className="text-white" />}
            </span>
            Select range
          </label>

          {/* month nav */}
          <div className="mb-1.5 flex items-center justify-between">
            <button type="button" onClick={prevMonth} className="flex h-7 w-7 items-center justify-center rounded hover:bg-surface-container">
              <ChevronLeft size={16} strokeWidth={1.75} />
            </button>
            <span className="text-[13px] font-bold text-on-surface">{monthLabel}</span>
            <button type="button" onClick={nextMonth} className="flex h-7 w-7 items-center justify-center rounded hover:bg-surface-container">
              <ChevronRight size={16} strokeWidth={1.75} />
            </button>
          </div>

          {/* DOW header */}
          <div className="mb-0.5 grid grid-cols-7 text-center text-[10.5px] font-bold text-secondary">
            {DOW.map((d) => <span key={d}>{d}</span>)}
          </div>

          {/* day grid */}
          <div className="grid grid-cols-7">
            {cells.map((cell, i) => {
              if (!cell) return <span key={`e${i}`} />;
              const key = _dk(cell);
              const dow = cell.getDay();
              const isWeekend = dow === 0 || dow === 6;
              const isFuture = key > today;
              const disabled = isWeekend || isFuture;
              const hasData = dataSet.has(key);
              const isStart = isRange && _sameDay(cell, sortedStart);
              const isEnd = isRange && _sameDay(cell, sortedEnd);
              const inRng = isRange && sortedStart && sortedEnd && _inRange(cell, sortedStart, sortedEnd) && !isStart && !isEnd;

              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleDayClick(cell)}
                  onMouseEnter={() => setHover(cell)}
                  onMouseLeave={() => setHover(null)}
                  className={[
                    "relative flex h-[34px] flex-col items-center justify-center rounded text-[12.5px] font-semibold transition-colors",
                    disabled ? "cursor-default text-on-surface opacity-[0.45]"
                      : (isStart || isEnd) ? "bg-primary text-white"
                      : inRng ? "bg-primary-fixed text-primary"
                      : "text-on-surface hover:bg-surface-container",
                  ].join(" ")}
                >
                  {cell.getDate()}
                  {hasData && (
                    <span className={[
                      "absolute bottom-[3px] h-1 w-1 rounded-full",
                      (isStart || isEnd) ? "bg-white" : "bg-primary-container",
                    ].join(" ")} />
                  )}
                </button>
              );
            })}
          </div>

          {/* legend */}
          <div className="mt-2 flex items-center gap-4 text-[10.5px] text-secondary">
            <span className="flex items-center gap-1">
              <span className="h-1 w-1 rounded-full bg-primary-container" /> Has data
            </span>
            <span>Greyed = weekend / future</span>
          </div>

          {/* range footer */}
          {isRange && (
            <div className="mt-2.5 border-t border-outline-variant pt-2.5">
              <div className="mb-2 text-[12px] text-secondary">
                {rangeStart && rangeEnd
                  ? `Range: ${_fmtFull(rangeStart)} – ${_fmtFull(rangeEnd)}`
                  : rangeStart
                  ? `Start: ${_fmtShort(rangeStart)} — pick end date`
                  : "Pick start date"}
              </div>
              <button
                type="button"
                disabled={!rangeStart || !rangeEnd}
                onClick={applyRange}
                className={[
                  "w-full rounded-md px-3 py-2 text-[13px] font-bold transition-colors",
                  rangeStart && rangeEnd
                    ? "bg-primary text-white hover:bg-primary/90"
                    : "cursor-default bg-surface-container text-secondary",
                ].join(" ")}
              >
                Apply range
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
