"use client";

/* ============================================================
   MOBO — Post-Trade Allocation: stacked bar chart
   One stacked bar per allocation model, segmented by the clients
   it was delegated to (pro-rata by subscribed units). Two
   orientations: vertical columns (money = height) and horizontal
   rows (money = length) — see the `orientation` prop.

   Ported behavior from the design prototype's `StackedBarChart`
   (megaannum-crm-handoff/.../MoboAllocation.jsx) onto Recharts:
   click a bar → onSelectModel(modelId); hover a client segment →
   tooltip with client name, model name+account, delegated amount,
   and that client's % share of the model's traded total.

   Client → color comes from `./Panels`' `clientColor()` (shared with
   the sibling Donut) so the same client renders the same color in
   both the bar chart and the per-model pie.
   ============================================================ */

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { ptaMoney } from "@/lib/mobo/allocation";
import type { PtaClientShare, PtaModelAllocation } from "@/lib/mobo/types";
import { clientColor } from "./Panels";

/** Union of every client id that appears across all models, in first-seen
 * order (stable — doesn't reshuffle as the client list happens to sort). */
function unionClientIds(models: PtaModelAllocation[]): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const m of models) {
    for (const cs of m.clientShares) {
      if (!seen.has(cs.clientId)) {
        seen.add(cs.clientId);
        order.push(cs.clientId);
      }
    }
  }
  return order;
}

/* ---- Recharts row shape: one row per model, one numeric key per
   client (delegated amount). Clients absent from a model are simply
   omitted — Recharts stacks the rest correctly. `shares` carries the
   already-computed PtaClientShare per client for the tooltip, so
   nothing here is recomputed from scratch. ------------------------ */
interface ChartRow {
  modelId: string;
  modelName: string;
  modelAcct: string;
  traded: number;
  shares: Record<string, PtaClientShare>;
  [clientId: string]: unknown;
}

function buildChartData(models: PtaModelAllocation[]): ChartRow[] {
  return models.map((m) => {
    const shares: Record<string, PtaClientShare> = {};
    const row: ChartRow = {
      modelId: m.id,
      modelName: m.name,
      modelAcct: m.acct,
      traded: m.traded,
      shares,
    };
    for (const cs of m.clientShares) {
      shares[cs.clientId] = cs;
      row[cs.clientId] = cs.delegated;
    }
    return row;
  });
}

/* ---- custom tooltip — client name (+ swatch), model name+account,
   delegated amount, % share. `shared={false}` on <Tooltip> restricts
   the payload to the single hovered segment. ----------------------- */
function ChartTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload || payload.length === 0) return null;
  const entry = payload[0];
  const row = entry.payload as ChartRow | undefined;
  const clientId = entry.dataKey as string | undefined;
  const share = row && clientId ? row.shares[clientId] : undefined;
  if (!row || !share) return null;
  return (
    <div className="min-w-[150px] rounded-lg border border-outline-variant bg-white px-3 py-2 shadow-overlay">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: entry.color }} />
        <span className="text-[12px] font-bold text-on-surface">{share.name}</span>
      </div>
      <div className="mb-1.5 text-[10px] font-semibold text-secondary">
        {row.modelName} · {row.modelAcct}
      </div>
      <div className="flex items-center justify-between gap-4 text-[11.5px]">
        <span className="font-semibold text-secondary">Delegated</span>
        <span className="font-bold tabular-nums text-on-surface">{ptaMoney(share.delegated)}</span>
      </div>
      <div className="flex items-center justify-between gap-4 text-[11.5px]">
        <span className="font-semibold text-secondary">Share</span>
        <span className="font-bold tabular-nums text-on-surface">{share.pct}%</span>
      </div>
    </div>
  );
}

/* ---- custom axis tick — model name (bold) + account (secondary),
   two lines. `align` controls horizontal text anchor (vertical mode
   centers under the bar; horizontal mode right-aligns beside it). --- */
function ModelTick({
  x, y, payload, rows, align,
}: {
  x?: number | string;
  y?: number | string;
  payload?: { value: string };
  rows: ChartRow[];
  align: "middle" | "end";
}) {
  const row = rows.find((r) => r.modelId === payload?.value);
  if (!row || x == null || y == null) return null;
  const dy1 = align === "middle" ? 12 : -4;
  const dy2 = align === "middle" ? 26 : 11;
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={dy1} textAnchor={align} style={{ fill: "var(--on-surface)", fontSize: 13, fontWeight: 700 }}>
        {row.modelName}
      </text>
      <text x={0} y={dy2} textAnchor={align} style={{ fill: "var(--secondary)", fontSize: 11, fontWeight: 600 }}>
        {row.modelAcct}
      </text>
    </g>
  );
}

/* Recharts passes label-renderer coords as `string | number | undefined`
 * (SVG attrs can legally be either) — accept that shape and coerce to
 * plain numbers once, here, rather than at every call site. */
type LabelProps = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  index?: number;
};
function numLabelProps(props: LabelProps) {
  const n = (v: number | string | undefined) => (typeof v === "string" ? parseFloat(v) : v ?? 0);
  return { x: n(props.x), y: n(props.y), width: n(props.width), height: n(props.height), index: props.index ?? 0 };
}

export interface StackedBarChartProps {
  models: PtaModelAllocation[];
  orientation: "vertical" | "horizontal";
  onSelectModel?: (modelId: string) => void;
}

export function StackedBarChart({ models, orientation, onSelectModel }: StackedBarChartProps) {
  const allClientIds = unionClientIds(models);
  const chartData = buildChartData(models);
  const cursor = onSelectModel ? "pointer" : "default";

  const handleClick = (data: { payload?: ChartRow }) => {
    const modelId = data?.payload?.modelId;
    if (modelId) onSelectModel?.(modelId);
  };

  // Label sits on the TOP-most stacked segment (the last client rendered),
  // so its "top" position is the top of the whole stack, not one segment.
  const topClientId = allClientIds[allClientIds.length - 1];

  if (orientation === "horizontal") {
    const height = Math.max(220, models.length * 64);
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={chartData}
          layout="vertical"
          barCategoryGap="28%"
          margin={{ top: 8, right: 88, bottom: 8, left: 8 }}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="modelId"
            axisLine={false}
            tickLine={false}
            width={140}
            tick={(props) => <ModelTick {...props} rows={chartData} align="end" />}
          />
          <Tooltip content={ChartTooltip} shared={false} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
          {allClientIds.map((clientId) => (
            <Bar
              key={clientId}
              dataKey={clientId}
              stackId="traded"
              fill={clientColor(clientId)}
              maxBarSize={48}
              cursor={cursor}
              onClick={handleClick}
              label={
                clientId === topClientId
                  ? (props: LabelProps) => {
                      const { x, y, width, height: h, index = 0 } = numLabelProps(props);
                      const row = chartData[index];
                      if (!row) return <g />;
                      return (
                        <text
                          x={x + width + 8}
                          y={y + h / 2}
                          dy={4}
                          textAnchor="start"
                          style={{ fill: "var(--on-surface)", fontSize: 13, fontWeight: 700 }}
                        >
                          {ptaMoney(row.traded)}
                        </text>
                      );
                    }
                  : undefined
              }
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart
        data={chartData}
        layout="horizontal"
        barCategoryGap="28%"
        margin={{ top: 28, right: 8, bottom: 8, left: 8 }}
      >
        <XAxis
          dataKey="modelId"
          axisLine={{ stroke: "var(--outline)" }}
          tickLine={false}
          height={50}
          interval={0}
          tick={(props) => <ModelTick {...props} rows={chartData} align="middle" />}
        />
        <YAxis hide />
        <Tooltip content={ChartTooltip} shared={false} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
        {allClientIds.map((clientId) => (
          <Bar
            key={clientId}
            dataKey={clientId}
            stackId="traded"
            fill={clientColor(clientId)}
            maxBarSize={140}
            cursor={cursor}
            onClick={handleClick}
            label={
              clientId === topClientId
                ? (props: LabelProps) => {
                    const { x, y, width, index = 0 } = numLabelProps(props);
                    const row = chartData[index];
                    if (!row) return <g />;
                    return (
                      <text
                        x={x + width / 2}
                        y={y - 8}
                        textAnchor="middle"
                        style={{ fill: "var(--on-surface)", fontSize: 13, fontWeight: 700 }}
                      >
                        {ptaMoney(row.traded)}
                      </text>
                    );
                  }
                : undefined
            }
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
