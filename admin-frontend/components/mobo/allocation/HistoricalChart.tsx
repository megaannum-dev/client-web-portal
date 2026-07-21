"use client";

/* ============================================================
   MOBO — Post-Trade Allocation historical P&L chart
   Bar/line chart with summary stats for daily P&L history.
   ============================================================ */

import { useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { BarChart3, TrendingUp } from "@/lib/icons";
import { ptaMoney } from "@/lib/mobo/allocation";
import type { PtaHistoryEntry } from "@/lib/mobo/types";

/* ── palette ─────────────────────────────────────────────── */
const PNL_GREEN = "#f27405";
const PNL_RED = "#b1402f";
const PNL_GREEN_BG = "#f68f33";
const PNL_RED_BG = "#d3654f";

/* ── tooltip state ───────────────────────────────────────── */
interface ChartTip {
  x: number;
  y: number;
  date: string;
  pnl: number;
}

/* ============================================================
   ChartTypeToggle — bar/line pill toggle
   ============================================================ */
function ChartTypeToggle({
  value,
  onChange,
}: {
  value: "bar" | "line";
  onChange: (v: "bar" | "line") => void;
}) {
  const opts: { id: "bar" | "line"; icon: typeof BarChart3; title: string }[] = [
    { id: "bar", icon: BarChart3, title: "Bar chart" },
    { id: "line", icon: TrendingUp, title: "Line chart" },
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
   Summary stats row
   ============================================================ */
function SummaryStats({ series }: { series: PtaHistoryEntry[] }) {
  const totalPnl = series.reduce((s, d) => s + d.pnl, 0);
  const winDays = series.filter((d) => d.pnl >= 0).length;
  const lossDays = series.filter((d) => d.pnl < 0).length;
  const maxPnl = series.length ? Math.max(...series.map((d) => d.pnl)) : 0;
  const minPnl = series.length ? Math.min(...series.map((d) => d.pnl)) : 0;

  const stats: { label: string; value: string; color: string }[] = [
    {
      label: "Net P&L",
      value: (totalPnl >= 0 ? "+" : "") + ptaMoney(totalPnl),
      color: totalPnl >= 0 ? PNL_GREEN : PNL_RED,
    },
    {
      label: "Profit / Loss",
      value: `${winDays} / ${lossDays}`,
      color: "inherit",
    },
    {
      label: "Best day",
      value: "+" + ptaMoney(maxPnl),
      color: PNL_GREEN,
    },
    {
      label: "Worst day",
      value: ptaMoney(minPnl),
      color: PNL_RED,
    },
  ];

  return (
    <div className="flex flex-wrap gap-5">
      {stats.map((s) => (
        <div key={s.label}>
          <div className="mb-[3px] text-[10px] font-bold uppercase tracking-[0.05em] text-secondary">
            {s.label}
          </div>
          <div className="text-[20px] font-bold tabular-nums" style={{ color: s.color }}>
            {s.label === "Profit / Loss" ? (
              <>
                <span style={{ color: PNL_GREEN }}>{winDays}</span>
                <span className="text-secondary"> / </span>
                <span style={{ color: PNL_RED }}>{lossDays}</span>
              </>
            ) : (
              s.value
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   X-axis labels — adaptive density
   ============================================================ */
function XLabels({ series, compact }: { series: PtaHistoryEntry[]; compact: boolean }) {
  const n = series.length;
  const step = n > 80 ? 20 : n > 30 ? 5 : 1;

  return (
    <div className="mt-1 flex justify-between">
      {series.map((d, i) => {
        const show = i % step === 0 || i === n - 1;
        return (
          <span
            key={d.date}
            className={[
              "shrink-0 font-semibold text-secondary",
              compact ? "text-[9px]" : "text-[10.5px]",
              show ? "visible" : "invisible",
            ].join(" ")}
            style={{ width: 0, textAlign: "center" }}
          >
            {show ? d.date : ""}
          </span>
        );
      })}
    </div>
  );
}

/* ============================================================
   BarChartInner — flex-column bar chart (profit up, loss down)
   ============================================================ */
function BarChartInner({
  series,
  maxAbs,
  halfH,
  tip,
  onTip,
  onClear,
}: {
  series: PtaHistoryEntry[];
  maxAbs: number;
  halfH: number;
  tip: ChartTip | null;
  onTip: (e: ReactMouseEvent, d: PtaHistoryEntry) => void;
  onClear: () => void;
}) {
  const n = series.length;
  const gap = n > 60 ? 1 : n > 30 ? 2 : 3;

  return (
    <div className="relative flex h-full items-center" style={{ gap }}>
      {series.map((d) => {
        const pct = maxAbs > 0 ? Math.abs(d.pnl) / maxAbs : 0;
        const barH = Math.max(2, pct * halfH);
        const profit = d.pnl >= 0;
        const hovered = tip?.date === d.date;
        const color = profit
          ? hovered ? PNL_GREEN : PNL_GREEN_BG
          : hovered ? PNL_RED : PNL_RED_BG;

        return (
          <div
            key={d.date}
            className="flex flex-1 cursor-crosshair flex-col justify-center"
            style={{ height: halfH * 2 }}
            onMouseEnter={(e) => onTip(e, d)}
            onMouseMove={(e) => onTip(e, d)}
            onMouseLeave={onClear}
          >
            {/* top half (profit bars grow upward) */}
            <div className="flex flex-1 items-end">
              {profit && (
                <div
                  className="w-full rounded-t-[1px] transition-colors duration-100"
                  style={{ height: barH, background: color }}
                />
              )}
            </div>
            {/* bottom half (loss bars grow downward) */}
            <div className="flex flex-1 items-start">
              {!profit && (
                <div
                  className="w-full rounded-b-[1px] transition-colors duration-100"
                  style={{ height: barH, background: color }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   LineChartInner — SVG path + hoverable nodes at peaks/valleys
   ============================================================ */
function LineChartInner({
  series,
  maxAbs,
  halfH,
  width,
  tip,
  onTip,
  onClear,
}: {
  series: PtaHistoryEntry[];
  maxAbs: number;
  halfH: number;
  width: number;
  tip: ChartTip | null;
  onTip: (e: ReactMouseEvent, d: PtaHistoryEntry) => void;
  onClear: () => void;
}) {
  const n = series.length;
  if (n === 0) return null;

  const h = halfH * 2;
  const points = series.map((d, i) => ({
    x: n === 1 ? width / 2 : (i / (n - 1)) * width,
    // y: 0 = top, h = bottom; pnl > 0 → above center (< halfH)
    y: maxAbs > 0 ? halfH - (d.pnl / maxAbs) * halfH : halfH,
    d,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  // Show nodes at endpoints + local peaks/valleys (direction change)
  const nodeIndices = new Set<number>([0, n - 1]);
  for (let i = 1; i < n - 1; i++) {
    const prev = series[i - 1].pnl;
    const cur = series[i].pnl;
    const next = series[i + 1].pnl;
    if ((cur >= prev && cur >= next) || (cur <= prev && cur <= next)) {
      nodeIndices.add(i);
    }
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${h}`}
      className="block h-full w-full"
      preserveAspectRatio="none"
    >
      <path d={pathD} fill="none" stroke="var(--on-surface)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {points.map((p, i) => {
        if (!nodeIndices.has(i)) return null;
        const hovered = tip?.date === p.d.date;
        const color = p.d.pnl >= 0 ? PNL_GREEN : PNL_RED;
        const r = hovered ? 10 : 7;
        // ponytail: non-scaling circles via transform trick would overcomplicate; fixed viewBox is fine
        const svgR = (r / h) * (halfH * 2); // scale radius to viewBox units
        return (
          <circle
            key={p.d.date}
            cx={p.x}
            cy={p.y}
            r={svgR}
            fill="white"
            stroke={color}
            strokeWidth={(2 / h) * (halfH * 2)}
            className="cursor-crosshair transition-[r] duration-100"
            onMouseEnter={(e) => onTip(e, p.d)}
            onMouseMove={(e) => onTip(e, p.d)}
            onMouseLeave={onClear}
          />
        );
      })}
    </svg>
  );
}

/* ============================================================
   HistoricalCard — main export
   ============================================================ */
export function HistoricalCard({
  series,
  scope,
  models,
  selectedModelId,
  onModelChange,
}: {
  series: PtaHistoryEntry[];
  scope: "all" | "per";
  models: { id: string; name: string; acct: string }[];
  selectedModelId?: string;
  onModelChange?: (id: string) => void;
}) {
  const [chartType, setChartType] = useState<"bar" | "line">("bar");
  const [tip, setTip] = useState<ChartTip | null>(null);

  const maxAbs = series.length
    ? Math.max(...series.map((d) => Math.abs(d.pnl)), 1)
    : 1;
  const halfH = 130;
  const chartH = 260;
  // ponytail: width for line SVG is approximate; CSS flex handles bar mode
  const lineWidth = 800;

  const onTip = (e: ReactMouseEvent, d: PtaHistoryEntry) =>
    setTip({ x: e.clientX, y: e.clientY, date: d.date, pnl: d.pnl });
  const onClear = () => setTip(null);

  const compact = series.length > 30;

  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-lowest px-[22px] pb-[22px] pt-[18px] shadow-card">
      {/* header row */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[16px] font-bold text-on-surface">Historical P&L</h3>
        <div className="flex items-center gap-2">
          {scope === "per" && models.length > 0 && (
            <select
              value={selectedModelId ?? ""}
              onChange={(e) => onModelChange?.(e.target.value)}
              className="h-8 rounded-md border border-outline-variant bg-surface-lowest px-2 text-[13px] font-semibold text-on-surface"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.acct})
                </option>
              ))}
            </select>
          )}
          <ChartTypeToggle value={chartType} onChange={setChartType} />
        </div>
      </div>

      {/* summary stats */}
      {series.length > 0 && (
        <div className="mb-5">
          <SummaryStats series={series} />
        </div>
      )}

      {/* chart area */}
      <div className="relative" style={{ height: chartH }}>
        {/* Y-axis */}
        <div
          className="absolute left-0 top-0 flex flex-col justify-between text-right text-[10px] font-semibold tabular-nums text-secondary"
          style={{ width: 50, height: chartH }}
        >
          <span>{ptaMoney(maxAbs)}</span>
          <span>$0</span>
          <span>{ptaMoney(-maxAbs)}</span>
        </div>

        {/* grid lines + chart */}
        <div className="absolute right-0 top-0" style={{ left: 56, height: chartH }}>
          {/* faint grid at 25%, 50% (zero), 75% */}
          <div
            className="pointer-events-none absolute left-0 right-0 border-t"
            style={{ top: "25%", borderColor: "var(--outline-variant)", opacity: 0.5 }}
          />
          <div
            className="pointer-events-none absolute left-0 right-0"
            style={{
              top: "50%",
              borderTop: "1.5px dashed var(--outline)",
            }}
          />
          <div
            className="pointer-events-none absolute left-0 right-0 border-t"
            style={{ top: "75%", borderColor: "var(--outline-variant)", opacity: 0.5 }}
          />

          {/* chart content */}
          <div className="h-full w-full">
            {chartType === "bar" ? (
              <BarChartInner
                series={series}
                maxAbs={maxAbs}
                halfH={halfH}
                tip={tip}
                onTip={onTip}
                onClear={onClear}
              />
            ) : (
              <LineChartInner
                series={series}
                maxAbs={maxAbs}
                halfH={halfH}
                width={lineWidth}
                tip={tip}
                onTip={onTip}
                onClear={onClear}
              />
            )}
          </div>
        </div>
      </div>

      {/* X-axis labels */}
      <div style={{ marginLeft: 56 }}>
        <XLabels series={series} compact={compact} />
      </div>

      {/* tooltip (portaled) */}
      {tip &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[9999] min-w-[120px] rounded-md border border-outline-variant bg-white px-[9px] py-[7px] shadow-overlay"
            style={{ left: tip.x, top: tip.y, transform: "translate(-50%, calc(-100% - 14px))" }}
          >
            <div className="mb-1 text-[12px] font-bold text-on-surface">{tip.date}</div>
            <div className="flex items-center gap-1.5 text-[11.5px]">
              <span
                className="h-[9px] w-[9px] shrink-0 rounded-sm"
                style={{ background: tip.pnl >= 0 ? PNL_GREEN : PNL_RED }}
              />
              <span className="font-bold tabular-nums" style={{ color: tip.pnl >= 0 ? PNL_GREEN : PNL_RED }}>
                {(tip.pnl >= 0 ? "+" : "") + ptaMoney(tip.pnl)}
              </span>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
