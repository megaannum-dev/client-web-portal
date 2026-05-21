"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  LineChart,
  Line,
  Legend,
  ReferenceLine,
  LabelList,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Shield,
  ChevronLeft,
  ChevronRight,
  Download,
  X,
  AlertCircle,
  Briefcase,
} from "@/lib/icons";
import clsx from "clsx";
import { useAllotmentRequests } from "@/lib/hooks/useAllotmentRequests";
import { submitAllotmentRequest, submitRedemptionRequest } from "@/lib/mock/store";
import {
  MOCK_ALLOTMENT_REQUESTS,
  MOCK_ALLOTTED_MODELS,
  MOCK_AVAILABLE_MODELS,
  MOCK_PORTFOLIO_STATS,
  type AllotmentRequest,
  type AllottedModel,
  type AvailableModel,
} from "@/lib/mock/data";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard }   from "@/components/ui/StatCard";
import { EyeToggle }  from "@/components/ui/EyeToggle";

// ── Data ──────────────────────────────────────────────────────────────────────

const BAR_DATA = [
  { name: "Model A", value: 18.4 },
  { name: "Model B", value: -6.2 },
  { name: "Model C", value: 9.7  },
  { name: "Model D", value: 14.2 },
  { name: "YTD Avg", value: 12.4 },
];
// Order: Model A, B, C, D, YTD Avg — kept in sync with LINE_SERIES and DONUT_DATA
const BAR_COLORS = ["#06b6d4", "#6b7280", "#3b82f6", "#a855f7", "#f97316"];

const LINE_DATA = [
  { month: "Jun", modelA: 100, modelB: 98,  modelC: 100, modelD: 100, ytdAvg: 99.5   },
  { month: "Jul", modelA: 104, modelB: 97,  modelC: 102, modelD: 105, ytdAvg: 102.0  },
  { month: "Aug", modelA: 109, modelB: 95,  modelC: 103, modelD: 108, ytdAvg: 103.75 },
  { month: "Sep", modelA: 114, modelB: 94,  modelC: 105, modelD: 112, ytdAvg: 106.25 },
  { month: "Oct", modelA: 119, modelB: 93,  modelC: 107, modelD: 116, ytdAvg: 108.75 },
  { month: "Nov", modelA: 124, modelB: 92,  modelC: 110, modelD: 121, ytdAvg: 111.75 },
];
const LINE_SERIES = [
  { key: "modelA", label: "Model A", color: "#06b6d4" },
  { key: "modelB", label: "Model B", color: "#6b7280" },
  { key: "modelC", label: "Model C", color: "#3b82f6" },
  { key: "modelD", label: "Model D", color: "#a855f7" },
];
// Rendered separately so it always sits on top with full emphasis
const YTD_AVG_LINE = { key: "ytdAvg", label: "YTD Avg", color: "#f97316" };

const DONUT_DATA = [
  { name: "Model A", value: 774072, color: "#f97316", display: "$774,072" },
  { name: "Model B", value: 466428, color: "#6b7280", display: "$466,428" },
  { name: "Model C", value: 120000, color: "#3b82f6", display: "$120,000" },
  { name: "Model D", value: 95000,  color: "#a855f7", display: "$95,000"  },
  { name: "Cash",    value: 85200,  color: "#d4b8a8", display: "$85,200"  },
];


const BENCHMARK_VALUE = 0; // % — market index benchmark drawn on bar chart
const BENCHMARK_COLOR = "#585f6c"; // tertiary token — distinct reference line color

// Shared grid templates — first (11rem) and last (7rem) columns are identical
// so Model Name and Action buttons sit flush across both grids.
const ALLOTTED_GRID  = "11rem repeat(6, minmax(0, 1fr)) 7rem";
const AVAILABLE_GRID = "11rem repeat(7, minmax(0, 1fr)) 7rem";
const REQUESTS_GRID  = "8rem 7rem 1fr 8rem 9rem 8rem";

const ALLOTTED_COLS  = ["Model Name", "Symbol", "Country", "Sector", "Amount ($)", "Weighting (%)", "Multiplier", "Action"];
const AVAILABLE_COLS = ["Model Name", "Symbol", "Country", "Sector", "Model Limits", "Risk Level", "Min. Investment", "Market Materials", "Action"];

const YTD_AVG_INDEX = BAR_DATA.findIndex((d) => d.name === "YTD Avg");

// ── Chart helpers ─────────────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  backgroundColor: "#fff",
  border: "1px solid #e0e0e0",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
};

// Floating label shown only above the YTD Avg bar
function YtdAvgBarLabel(props: { x?: number; y?: number; width?: number; value?: number; index?: number }) {
  const { x = 0, y = 0, width = 0, value = 0, index } = props;
  if (index !== YTD_AVG_INDEX) return <g />;
  return (
    <g>
      <rect x={x + width / 2 - 28} y={y - 28} width={56} height={20} rx={4} fill="#f97316" />
      <text x={x + width / 2} y={y - 14} fill="#fff" textAnchor="middle" fontSize={11} fontWeight={700}>
        +{value}% avg
      </text>
    </g>
  );
}

// Floating pill label rendered at the final data point of the YTD Avg line
function YtdAvgEndLabel(props: { x?: number; y?: number; index?: number }) {
  const { x = 0, y = 0, index } = props;
  if (index !== LINE_DATA.length - 1) return <g />;
  const color = YTD_AVG_LINE.color;
  return (
    <g>
      <rect x={x + 8} y={y - 12} width={60} height={20} rx={4} fill={color} />
      <text x={x + 38} y={y + 2} fill="#fff" textAnchor="middle" fontSize={10} fontWeight={700} letterSpacing={0.5}>
        YTD AVG
      </text>
    </g>
  );
}

// Custom tooltip for the line chart — names each series, bolds YTD Avg
function LineTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const allSeries = [...LINE_SERIES, YTD_AVG_LINE];
  return (
    <div style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.08)", padding: "8px 12px", minWidth: 140 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>{label}</p>
      {payload.map((entry: any) => {
        const isYtd = entry.dataKey === YTD_AVG_LINE.key;
        const name = allSeries.find((s) => s.key === entry.dataKey)?.label ?? entry.dataKey;
        const val = `${(Number(entry.value) - 100).toFixed(1)}%`;
        return (
          <div key={entry.dataKey} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 3 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: entry.color, flexShrink: 0 }} />
              <span style={{ fontWeight: isYtd ? 700 : 400, color: isYtd ? entry.color : "#374151" }}>{name}</span>
            </span>
            <span style={{ fontWeight: isYtd ? 700 : 600, color: isYtd ? entry.color : "#111827" }}>{val}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: "High" | "Medium" | "Low" }) {
  const cls = { High: "badge-warning", Medium: "badge-caution", Low: "badge-success" } as const;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide border ${cls[level]}`}>
      {level}
    </span>
  );
}

function RequestStatusBadge({ status }: { status: "Processing" | "Completed" }) {
  const cls = status === "Processing" ? "badge-dot-caution" : "badge-dot-success";
  const dot = status === "Processing" ? "dot-caution"       : "dot-success";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {status}
    </span>
  );
}

function ModelTable({ columns, gridTemplate, actionColIndex, children }: {
  columns: string[];
  gridTemplate: string;
  actionColIndex: number;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface-lowest border border-outline-variant rounded-lg overflow-hidden">
      <div className="grid bg-surface-container border-b border-outline-variant" style={{ gridTemplateColumns: gridTemplate }}>
        {columns.map((h, i) => (
          <div key={h} className={clsx("px-6 py-4 text-label-md font-semibold uppercase tracking-[0.05em] text-secondary flex items-center", i === actionColIndex && "justify-center")}>
            {h}
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}

function ModelRow({ gridTemplate, children }: { gridTemplate: string; children: React.ReactNode }) {
  return (
    <div className="grid border-b border-outline-variant last:border-b-0 hover:bg-surface-container/40 transition-colors duration-100" style={{ gridTemplateColumns: gridTemplate }}>
      {children}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-lowest border border-outline-variant rounded-lg p-6">
      <p className="text-label-md font-bold uppercase tracking-[0.08em] text-secondary mb-4">{title}</p>
      {children}
    </div>
  );
}

// ── Shared form utilities ─────────────────────────────────────────────────────

function fieldCls(err?: string) {
  return clsx(
    "w-full border rounded-lg px-3 py-2.5 text-body-sm text-on-surface bg-white",
    "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors",
    err ? "border-red-400" : "border-outline-variant",
  );
}

// ── Allotment Modal ────────────────────────────────────────────────────────────

function AllotmentModal({
  model,
  onClose,
  onConfirm,
}: {
  model: AvailableModel;
  onClose: () => void;
  onConfirm: (req: AllotmentRequest) => void;
}) {
  const [amount,        setAmount]        = useState("");
  const [weighting,     setWeighting]     = useState("");
  const [multiplier,    setMultiplier]    = useState("1.0");
  const cashOption = `Cash Balance: ${MOCK_PORTFOLIO_STATS.cashBalance}`;
  const [fundingSource, setFundingSource] = useState(cashOption);
  const [confirmed,     setConfirmed]     = useState(false);
  const [errors,        setErrors]        = useState<Record<string, string>>({});

  const RISK_LABEL: Record<"High" | "Medium" | "Low", { text: string; cls: string }> = {
    High:   { text: "HIGH RISK",   cls: "text-warning" },
    Medium: { text: "MEDIUM RISK", cls: "text-caution" },
    Low:    { text: "LOW RISK",    cls: "text-success"  },
  };

  const minAmt = parseFloat(model.minInvestment.replace(/[$,]/g, ""));

  function validate() {
    const e: Record<string, string> = {};
    const amt = parseFloat(amount);
    const wgt = parseFloat(weighting);
    const mul = parseFloat(multiplier);
    if (!amount || isNaN(amt) || amt <= 0)       e.amount     = "Please enter a valid amount.";
    else if (amt < minAmt)                        e.amount     = `Minimum allotment is ${model.minInvestment}.`;
    if (!weighting || isNaN(wgt) || wgt <= 0)    e.weighting  = "Please enter a valid weighting.";
    if (!multiplier || isNaN(mul) || mul <= 0)   e.multiplier = "Please enter a valid multiplier.";
    if (!confirmed)                               e.confirmed  = "Please confirm you have consulted your advisor.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(parseFloat(amount));
    const id  = submitAllotmentRequest({ model: model.name, amount: fmt });
    const date = new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
    onConfirm({ id, type: "Allotment", model: model.name, amount: fmt, date, status: "Processing" });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 pt-6 pb-4 border-b border-outline-variant">
          <div className="flex items-center gap-2.5">
            <Briefcase size={18} strokeWidth={1.75} className="text-primary" />
            <h2 className="text-[17px] font-bold text-on-surface">Allotment Request</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="p-1.5 rounded-lg text-secondary hover:bg-surface-container hover:text-on-surface transition-colors shrink-0">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-5">

          {/* Model card */}
          <div className="bg-surface-container rounded-xl px-4 py-3.5 flex items-center justify-between">
            <div>
              <p className="text-body-sm font-bold text-on-surface">{model.name}</p>
              <p className="text-label-md text-secondary mt-0.5">{model.assetClass}</p>
            </div>
            <span className={`text-[11px] font-extrabold tracking-wide ${RISK_LABEL[model.risk].cls}`}>
              {RISK_LABEL[model.risk].text}
            </span>
          </div>

          {/* Amount */}
          <div className="flex flex-col gap-1.5">
            <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">Amount ($)</label>
            <input type="number" min={0} placeholder="0.00" value={amount}
              onChange={(e) => { setAmount(e.target.value); setErrors((p) => ({ ...p, amount: "" })); }}
              className={fieldCls(errors.amount)} />
            {errors.amount
              ? <p className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={11} strokeWidth={2} />{errors.amount}</p>
              : <p className="flex items-center gap-1 text-[11px] text-secondary"><AlertCircle size={11} strokeWidth={1.75} />Minimum Allotment: {model.minInvestment}</p>
            }
          </div>

          {/* Weighting + Multiplier */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">Weighting (%)</label>
              <input type="number" min={0} placeholder="0.0" value={weighting}
                onChange={(e) => { setWeighting(e.target.value); setErrors((p) => ({ ...p, weighting: "" })); }}
                className={fieldCls(errors.weighting)} />
              {errors.weighting && <p className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={11} strokeWidth={2} />{errors.weighting}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">Multiplier (x)</label>
              <input type="number" min={0} step={0.1} placeholder="1.0" value={multiplier}
                onChange={(e) => { setMultiplier(e.target.value); setErrors((p) => ({ ...p, multiplier: "" })); }}
                className={fieldCls(errors.multiplier)} />
              {errors.multiplier && <p className="flex items-center gap-1 text-[11px] font-semibold text-red-600"><AlertCircle size={11} strokeWidth={2} />{errors.multiplier}</p>}
            </div>
          </div>

          {/* Funding Source */}
          <div className="flex flex-col gap-1.5">
            <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">Funding Source</label>
            <div className="relative">
              <select value={fundingSource} onChange={(e) => setFundingSource(e.target.value)}
                className="w-full border border-outline-variant rounded-lg px-3 py-2.5 text-body-sm text-on-surface bg-white appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary cursor-pointer">
                <option>{cashOption}</option>
                <option>External Transfer</option>
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-secondary">▾</span>
            </div>
          </div>

          {/* Confirmation checkbox */}
          <div className="flex flex-col gap-1.5">
            <label className={`flex items-start gap-3 cursor-pointer select-none ${errors.confirmed ? "text-red-600" : "text-secondary"}`}>
              <input type="checkbox" checked={confirmed}
                onChange={(e) => { setConfirmed(e.target.checked); setErrors((p) => ({ ...p, confirmed: "" })); }}
                className="mt-0.5 accent-primary w-4 h-4 shrink-0" />
              <span className="text-body-sm leading-relaxed">
                I confirm that I have consulted my advisor regarding this request.
              </span>
            </label>
            {errors.confirmed && <p className="flex items-center gap-1 text-[11px] font-semibold text-red-600 ml-7"><AlertCircle size={11} strokeWidth={2} />{errors.confirmed}</p>}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-outline-variant">
          <button type="button" onClick={onClose}
            className="px-5 py-2.5 text-body-sm font-semibold text-on-surface rounded-lg hover:bg-surface-container transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit}
            className="bg-primary text-white px-6 py-2.5 rounded-lg text-body-sm font-bold hover:opacity-90 transition-opacity">
            Confirm Allotment
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Redemption Modal ───────────────────────────────────────────────────────────


function RedemptionModal({
  model,
  onClose,
  onConfirm,
}: {
  model: AllottedModel;
  onClose: () => void;
  onConfirm: (req: AllotmentRequest) => void;
}) {
  const [redeemAll,  setRedeemAll]  = useState(false);
  const [amount,     setAmount]     = useState("");
  const [returnTo,   setReturnTo]   = useState("Cash Balance");
  const [confirmed,  setConfirmed]  = useState(false);
  const [errors,     setErrors]     = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (!redeemAll) {
      const amt = parseFloat(amount);
      if (!amount || isNaN(amt) || amt <= 0) e.amount = "Please enter a valid redemption amount.";
    }
    if (!confirmed) e.confirmed = "Please confirm you have consulted your advisor.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    const rawAmt  = redeemAll ? model.amount : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(parseFloat(amount));
    const id      = submitRedemptionRequest({ model: model.name, amount: rawAmt, redeemAll });
    const date    = new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
    onConfirm({ id, type: "Redemption", model: model.name, amount: rawAmt, date, status: "Processing" });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 pt-6 pb-4 border-b border-outline-variant">
          <h2 className="text-[17px] font-bold text-on-surface">Redemption Request</h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="p-1.5 rounded-lg text-secondary hover:bg-surface-container hover:text-on-surface transition-colors shrink-0">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-5">

          {/* Selected model card */}
          <div className="bg-surface-container rounded-xl px-4 py-3.5 flex items-center justify-between">
            <div>
              <p className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary mb-0.5">Selected Model</p>
              <p className="text-body-sm font-bold text-on-surface">{model.name}</p>
            </div>
            <span className="text-[15px] font-bold text-primary">{model.amount}</span>
          </div>

          {/* Redemption Type */}
          <div className="flex flex-col gap-2">
            <p className="text-body-sm font-semibold text-on-surface">Redemption Type</p>
            <div className="flex gap-3">
              {(["Partial Redemption", "Redeem All"] as const).map((opt) => {
                const active = (opt === "Redeem All") === redeemAll;
                return (
                  <label key={opt}
                    className={clsx(
                      "flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer text-body-sm font-semibold transition-colors select-none",
                      active ? "border-primary bg-primary/5 text-on-surface" : "border-outline-variant text-secondary hover:border-primary/50",
                    )}>
                    <input
                      type="radio"
                      name="redemptionType"
                      checked={active}
                      onChange={() => { setRedeemAll(opt === "Redeem All"); setErrors((p) => ({ ...p, amount: "" })); }}
                      className="accent-primary w-4 h-4 shrink-0"
                    />
                    {opt}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Redemption Amount */}
          <div className="flex flex-col gap-1.5">
            <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
              Redemption Amount ($)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary text-body-sm select-none">$</span>
              <input
                type="number"
                min={0}
                placeholder="0.00"
                value={redeemAll ? "" : amount}
                disabled={redeemAll}
                onChange={(e) => { setAmount(e.target.value); setErrors((p) => ({ ...p, amount: "" })); }}
                className={clsx("pl-7 disabled:bg-surface-container disabled:text-secondary disabled:cursor-not-allowed", fieldCls(errors.amount))}
              />
            </div>
            {errors.amount && (
              <p className="flex items-center gap-1 text-[11px] font-semibold text-red-600">
                <AlertCircle size={11} strokeWidth={2} />{errors.amount}
              </p>
            )}
          </div>

          {/* Returning To */}
          <div className="flex flex-col gap-1.5">
            <label className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">Returning To</label>
            <div className="relative">
              <select value={returnTo} onChange={(e) => setReturnTo(e.target.value)}
                className="w-full border border-outline-variant rounded-lg px-3 py-2.5 text-body-sm text-on-surface bg-white appearance-none pr-8 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary cursor-pointer">
                <option>Cash Balance</option>
                <option>External Transfer</option>
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-secondary">▾</span>
            </div>
          </div>

          {/* Info note */}
          <p className="flex items-center gap-2 text-[12px] text-secondary">
            <AlertCircle size={14} strokeWidth={1.75} className="shrink-0" />
            Redemption processing typically takes 2–3 business days.
          </p>

          {/* Confirmation checkbox */}
          <div className="flex flex-col gap-1.5">
            <label className={`flex items-start gap-3 cursor-pointer select-none ${errors.confirmed ? "text-red-600" : "text-secondary"}`}>
              <input type="checkbox" checked={confirmed}
                onChange={(e) => { setConfirmed(e.target.checked); setErrors((p) => ({ ...p, confirmed: "" })); }}
                className="mt-0.5 accent-primary w-4 h-4 shrink-0" />
              <span className="text-body-sm leading-relaxed">
                I confirm that I have consulted my advisor regarding this redemption request.
              </span>
            </label>
            {errors.confirmed && (
              <p className="flex items-center gap-1 text-[11px] font-semibold text-red-600 ml-7">
                <AlertCircle size={11} strokeWidth={2} />{errors.confirmed}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-outline-variant">
          <button type="button" onClick={onClose}
            className="px-5 py-2.5 text-body-sm font-semibold text-on-surface rounded-lg hover:bg-surface-container transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit}
            className="bg-primary text-white px-6 py-2.5 rounded-lg text-body-sm font-bold hover:opacity-90 transition-opacity">
            Request Redemption
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const [censored,    setCensored]    = useState(true);
  const [allotModel,  setAllotModel]  = useState<AvailableModel | null>(null);
  const [redeemModel, setRedeemModel] = useState<AllottedModel | null>(null);
  const { dynamic, addRequest }       = useAllotmentRequests();
  const mask = (v: string) => (censored ? "********" : v);

  return (
    <div className="flex flex-col gap-8 pb-8">

      <PageHeader
        title="Portfolio Details"
        subtitle="Global Opportunities Fund • Portfolio ID: #AT-8842"
      />

      {/* ── Stat cards ───────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-headline-md font-semibold text-on-surface">Portfolio Summary</h2>
          <EyeToggle censored={censored} onToggle={() => setCensored((v) => !v)} />
        </div>

        <div className="grid grid-cols-4 gap-4">
          <StatCard
            label="Total Value"
            value={mask(MOCK_PORTFOLIO_STATS.totalValue)}
            sub={
              <span className="flex items-center gap-1.5 text-body-sm font-semibold text-success">
                <TrendingUp size={14} strokeWidth={2} />
                {MOCK_PORTFOLIO_STATS.ytdChange} <span className="font-normal text-secondary">vs last month</span>
              </span>
            }
          />
          <StatCard
            label="Cash Balance"
            value={mask(MOCK_PORTFOLIO_STATS.cashBalance)}
            sub={
              <span className="flex items-center gap-1.5 text-body-sm font-semibold text-warning">
                <TrendingDown size={14} strokeWidth={2} />
                -1.2% <span className="font-normal text-secondary">unallocated</span>
              </span>
            }
          />
          <StatCard
            label="YTD Returns"
            value={mask(MOCK_PORTFOLIO_STATS.ytdReturns)}
            sub={
              <span className="flex items-center gap-1.5 text-body-sm font-semibold text-success">
                <CheckCircle2 size={14} strokeWidth={2} />
                Outperforming <span className="font-normal text-secondary">Benchmark</span>
              </span>
            }
          />
          <StatCard
            label="Portfolio Health"
            value="Optimal"
            sub={
              <span className="flex items-center gap-1.5 text-body-sm font-semibold text-success">
                <Shield size={14} strokeWidth={2} />
                Risk Profile Stable
              </span>
            }
          />
        </div>
      </div>

      {/* ── Portfolio Insights ────────────────────────────────────────────── */}
      <section>
        <h2 className="text-headline-md font-semibold text-on-surface mb-4">Portfolio Insights</h2>

        <div className="grid grid-cols-[1fr_320px] gap-4">

          {/* Left column: two stacked charts */}
          <div className="flex flex-col gap-4">

            {/* Return & Loss Performance */}
            <ChartCard title="Return & Loss Performance">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={BAR_DATA} barCategoryGap="35%" margin={{ top: 36, right: 16, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ede8e8" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={({ x, y, payload, index }) => (
                      <text
                        x={x} y={y + 12}
                        textAnchor="middle"
                        fontSize={11}
                        fill={index === 4 ? "#f97316" : "#6b7280"}
                        fontWeight={index === 4 ? 700 : 500}
                      >
                        {payload.value}
                      </text>
                    )}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v) => [`${Number(v) > 0 ? "+" : ""}${Number(v)}%`, "Return"]}
                    cursor={{ fill: "rgba(0,0,0,0.04)" }}
                  />
                  {/* Benchmark reference line */}
                  <ReferenceLine
                    y={BENCHMARK_VALUE}
                    stroke={BENCHMARK_COLOR}
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    label={{
                      value: `Benchmark ${BENCHMARK_VALUE}%`,
                      position: "insideTopRight",
                      fontSize: 10,
                      fill: BENCHMARK_COLOR,
                      fontWeight: 700,
                    }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {BAR_DATA.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={BAR_COLORS[i]}
                        opacity={i === 4 ? 1 : 0.75}
                      />
                    ))}
                    <LabelList dataKey="value" content={YtdAvgBarLabel as any} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-4 mt-2">
                <p className="text-[11px] text-secondary">Performance vs Internal Benchmarks</p>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-tertiary">
                  <span className="inline-block w-6 border-t-2 border-dashed border-tertiary" />
                  Benchmark
                </span>
              </div>
            </ChartCard>

            {/* Historical Track */}
            <ChartCard title="Historical Track (6M)">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={LINE_DATA} margin={{ top: 4, right: 76, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ede8e8" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: "#6b7280", fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip content={<LineTooltip />} />
                  {LINE_SERIES.map((s) => (
                    <Line
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      stroke={s.color}
                      strokeWidth={1.5}
                      strokeOpacity={0.6}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                  ))}
                  {/* YTD Avg — dashed, vibrant, always on top */}
                  <Line
                    type="monotone"
                    dataKey={YTD_AVG_LINE.key}
                    stroke={YTD_AVG_LINE.color}
                    strokeWidth={3}
                    strokeDasharray="8 4"
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff", fill: YTD_AVG_LINE.color }}
                    label={<YtdAvgEndLabel />}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(v) => {
                      if (v === YTD_AVG_LINE.key) return (
                        <span style={{ color: YTD_AVG_LINE.color, fontWeight: 700 }}>YTD Avg</span>
                      );
                      return LINE_SERIES.find((s) => s.key === v)?.label ?? v;
                    }}
                    wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Right column: donut + legend */}
          <ChartCard title="Asset Distribution">
            <div className="flex flex-col items-center gap-6">

              {/* Donut */}
              <div className="relative">
                <PieChart width={200} height={200}>
                  <Pie
                    data={DONUT_DATA}
                    cx={100}
                    cy={100}
                    innerRadius={62}
                    outerRadius={90}
                    dataKey="value"
                    startAngle={90}
                    endAngle={-270}
                    strokeWidth={0}
                  >
                    {DONUT_DATA.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-[18px] font-bold text-on-surface leading-tight">100%</p>
                    <p className="text-[9px] font-semibold text-secondary uppercase tracking-widest">Allocated</p>
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="w-full flex flex-col gap-2">
                {DONUT_DATA.map((entry) => (
                  <div key={entry.name} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="text-body-sm text-on-surface truncate">{entry.name}</span>
                    </div>
                    <span className="text-body-sm font-semibold text-on-surface shrink-0">{entry.display}</span>
                  </div>
                ))}
              </div>
            </div>
          </ChartCard>
        </div>
      </section>

      {/* ── Allotted Models ───────────────────────────────────────────────── */}
      <section id="allotted-models">
        <h2 className="text-headline-md font-semibold text-on-surface mb-4">Allotted Models</h2>
        <ModelTable columns={ALLOTTED_COLS} gridTemplate={ALLOTTED_GRID} actionColIndex={7}>
          {MOCK_ALLOTTED_MODELS.map((m) => (
            <ModelRow key={m.symbol} gridTemplate={ALLOTTED_GRID}>
              <div className="px-6 py-4 flex items-center min-w-0"><span className="text-body-sm font-bold text-on-surface truncate">{m.name}</span></div>
              <div className="px-6 py-4 flex items-center font-mono text-[12px] font-bold text-primary">{m.symbol}</div>
              <div className="px-6 py-4 flex items-center text-body-sm text-on-surface">{m.country}</div>
              <div className="px-6 py-4 flex items-center min-w-0"><span className="text-body-sm text-on-surface truncate">{m.sector}</span></div>
              <div className="px-6 py-4 flex items-center text-body-sm font-medium text-on-surface">{m.amount}</div>
              <div className="px-6 py-4 flex items-center text-body-sm text-on-surface">{m.weight}</div>
              <div className="px-6 py-4 flex items-center text-body-sm text-on-surface">{m.multiplier}</div>
              <div className="px-6 py-4 flex items-center justify-center">
                <button type="button" onClick={() => setRedeemModel(m)} className="bg-primary text-white w-20 py-1.5 rounded text-[11px] font-bold hover:opacity-90 transition-opacity">
                  Redeem
                </button>
              </div>
            </ModelRow>
          ))}
        </ModelTable>
      </section>

      {/* ── Available Models ──────────────────────────────────────────────── */}
      <section>
        <h2 className="text-headline-md font-semibold text-on-surface mb-4">Available Models</h2>
        <ModelTable columns={AVAILABLE_COLS} gridTemplate={AVAILABLE_GRID} actionColIndex={8}>
          {MOCK_AVAILABLE_MODELS.map((m) => (
            <ModelRow key={m.name} gridTemplate={AVAILABLE_GRID}>
              <div className="px-6 py-4 flex items-center min-w-0"><span className="text-body-sm font-bold text-on-surface truncate">{m.name}</span></div>
              <div className="px-6 py-4 flex items-center font-mono text-[12px] font-bold text-primary">{m.symbol}</div>
              <div className="px-6 py-4 flex items-center text-body-sm text-on-surface">{m.country}</div>
              <div className="px-6 py-4 flex items-center min-w-0"><span className="text-body-sm text-on-surface truncate">{m.sector}</span></div>
              <div className="px-6 py-4 flex items-center text-body-sm font-medium text-on-surface">{m.modelLimit}</div>
              <div className="px-6 py-4 flex items-center"><RiskBadge level={m.risk} /></div>
              <div className="px-6 py-4 flex items-center text-body-sm font-medium text-on-surface">{m.minInvestment}</div>
              <div className="px-6 py-4 flex items-center">
                <button type="button" className="inline-flex items-center gap-1.5 text-primary text-[12.5px] font-semibold hover:underline transition-all">
                  <Download size={15} strokeWidth={2.5} />
                  Download
                </button>
              </div>
              <div className="px-6 py-4 flex items-center justify-center">
                <button type="button" onClick={() => setAllotModel(m)} className="bg-primary text-white w-20 py-1.5 rounded text-[11px] font-bold hover:opacity-90 transition-opacity">
                  Allot
                </button>
              </div>
            </ModelRow>
          ))}
        </ModelTable>
      </section>

      {/* ── Historical Requests ───────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-headline-md font-semibold text-on-surface">Historical Requests</h2>
          <button type="button" className="text-label-md font-semibold text-primary hover:opacity-80 transition-opacity uppercase tracking-[0.05em]">
            View All
          </button>
        </div>

        <div className="bg-surface-lowest border border-outline-variant rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid bg-surface-container border-b border-outline-variant" style={{ gridTemplateColumns: REQUESTS_GRID }}>
            {["Request ID", "Type", "Model", "Amount", "Date", "Status"].map((h) => (
              <div key={h} className="px-6 py-3 text-label-md font-semibold uppercase tracking-[0.05em] text-secondary flex items-center">
                {h}
              </div>
            ))}
          </div>
          {/* Rows */}
          {[...dynamic, ...MOCK_ALLOTMENT_REQUESTS].map((r) => (
            <div key={r.id} className="grid border-b border-outline-variant last:border-b-0 bg-surface-lowest hover:bg-surface-container/40 transition-colors duration-100" style={{ gridTemplateColumns: REQUESTS_GRID }}>
              <div className="px-6 py-4 flex items-center font-mono text-[12px] text-secondary">{r.id}</div>
              <div className={clsx("px-6 py-4 flex items-center text-body-sm font-bold", r.type === "Redemption" ? "text-warning" : "text-primary")}>{r.type}</div>
              <div className="px-6 py-4 flex items-center text-body-sm text-on-surface">{r.model}</div>
              <div className="px-6 py-4 flex items-center text-body-sm font-semibold text-on-surface">{r.amount}</div>
              <div className="px-6 py-4 flex items-center text-body-sm text-secondary">{r.date}</div>
              <div className="px-6 py-4 flex items-center"><RequestStatusBadge status={r.status} /></div>
            </div>
          ))}

          <div className="px-6 py-4 bg-surface-container border-t border-outline-variant flex items-center justify-between">
            <span className="text-label-md text-secondary">Showing 1–7 of 24 results</span>
            <div className="flex items-center gap-2">
              <button type="button" className="p-1.5 rounded border border-outline-variant hover:bg-surface-container transition-colors flex items-center justify-center" aria-label="Previous page">
                <ChevronLeft size={14} strokeWidth={2} className="text-secondary" />
              </button>
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((page) => (
                  <button
                    key={page}
                    type="button"
                    className={clsx("w-7 h-7 flex items-center justify-center rounded text-[12px] font-semibold transition-colors", page === 1 ? "bg-primary text-white" : "text-secondary hover:bg-surface-container")}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <button type="button" className="p-1.5 rounded border border-outline-variant hover:bg-surface-container transition-colors flex items-center justify-center" aria-label="Next page">
                <ChevronRight size={14} strokeWidth={2} className="text-secondary" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {allotModel && (
        <AllotmentModal
          model={allotModel}
          onClose={() => setAllotModel(null)}
          onConfirm={(req) => { addRequest(req); setAllotModel(null); }}
        />
      )}

      {redeemModel && (
        <RedemptionModal
          model={redeemModel}
          onClose={() => setRedeemModel(null)}
          onConfirm={(req) => { addRequest(req); setRedeemModel(null); }}
        />
      )}
    </div>
  );
}
