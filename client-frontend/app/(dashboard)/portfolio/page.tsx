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
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Shield,
  ChevronLeft,
  ChevronRight,
} from "@/lib/icons";
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
const BAR_COLORS = ["#22c55e", "#ef4444", "#3b82f6", "#a855f7", "#f97316"];

const LINE_DATA = [
  { month: "Jun", modelA: 100, modelB: 98,  modelC: 100, modelD: 100 },
  { month: "Jul", modelA: 104, modelB: 97,  modelC: 102, modelD: 105 },
  { month: "Aug", modelA: 109, modelB: 95,  modelC: 103, modelD: 108 },
  { month: "Sep", modelA: 114, modelB: 94,  modelC: 105, modelD: 112 },
  { month: "Oct", modelA: 119, modelB: 93,  modelC: 107, modelD: 116 },
  { month: "Nov", modelA: 124, modelB: 92,  modelC: 110, modelD: 121 },
];
const LINE_SERIES = [
  { key: "modelA", label: "Model A", color: "#f97316" },
  { key: "modelB", label: "Model B", color: "#6b7280" },
  { key: "modelC", label: "Model C", color: "#3b82f6" },
  { key: "modelD", label: "Model D", color: "#a855f7" },
];

const DONUT_DATA = [
  { name: "Model A", value: 774072, color: "#f97316", display: "$774,072" },
  { name: "Model B", value: 466428, color: "#6b7280", display: "$466,428" },
  { name: "Model C", value: 120000, color: "#3b82f6", display: "$120,000" },
  { name: "Model D", value: 95000,  color: "#a855f7", display: "$95,000"  },
  { name: "Cash",    value: 85200,  color: "#d4b8a8", display: "$85,200"  },
];

const ALLOTTED_MODELS = [
  { name: "Model A", symbol: "AC60", country: "USA",    sector: "Medical Healthcare",    amount: "$774,072.00", weight: "62.4%", multiplier: "1.0x" },
  { name: "Model B", symbol: "ESGI", country: "Global", sector: "Sustainable Tech",       amount: "$466,428.00", weight: "37.6%", multiplier: "1.0x" },
  { name: "Model C", symbol: "GLIN", country: "Global", sector: "Global Infrastructure",  amount: "$120,000.00", weight: "9.7%",  multiplier: "1.0x" },
  { name: "Model D", symbol: "TDIS", country: "USA/CN", sector: "Tech Disruptors",        amount: "$95,000.00",  weight: "7.6%",  multiplier: "1.2x" },
];

const AVAILABLE_MODELS = [
  { name: "Global Tech Growth",      assetClass: "Equity",       risk: "High"   as const, minInvestment: "$10,000"  },
  { name: "Institutional Bond Core", assetClass: "Fixed Income", risk: "Low"    as const, minInvestment: "$50,000"  },
  { name: "Diversified Real Estate", assetClass: "Alternatives", risk: "Medium" as const, minInvestment: "$25,000"  },
  { name: "Emerging Markets Alpha",  assetClass: "Equity",       risk: "High"   as const, minInvestment: "$15,000"  },
  { name: "Fixed Income Plus",       assetClass: "Fixed Income", risk: "Low"    as const, minInvestment: "$100,000" },
];

const HISTORICAL_REQUESTS = [
  { id: "#RR-429", type: "Redemption" as const, model: "ESG Impact Growth",       amount: "$12,000.00", date: "Nov 01, 2023", status: "Processing" as const },
  { id: "#AT-771", type: "Allotment"  as const, model: "Alpha Core 60/40",        amount: "$50,000.00", date: "Oct 12, 2023", status: "Completed"  as const },
  { id: "#RR-765", type: "Redemption" as const, model: "ESG Impact Growth",       amount: "$12,000.00", date: "Oct 08, 2023", status: "Completed"  as const },
  { id: "#AT-760", type: "Allotment"  as const, model: "Alpha Core 60/40",        amount: "$25,000.00", date: "Oct 24, 2023", status: "Processing" as const },
  { id: "#AT-754", type: "Allotment"  as const, model: "Institutional Bond Core", amount: "$15,000.00", date: "Sep 28, 2023", status: "Completed"  as const },
  { id: "#RR-749", type: "Redemption" as const, model: "Global Tech Growth",      amount: "$8,500.00",  date: "Sep 15, 2023", status: "Completed"  as const },
  { id: "#AT-742", type: "Allotment"  as const, model: "Diversified Real Estate", amount: "$10,000.00", date: "Sep 02, 2023", status: "Completed"  as const },
];

// ── Chart tooltip ──────────────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  backgroundColor: "#fff",
  border: "1px solid #e0e0e0",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: "High" | "Medium" | "Low" }) {
  const styles = {
    High:   "bg-warning-container text-warning-on-container border border-warning/25",
    Medium: "bg-orange-50 text-orange-700 border border-orange-200",
    Low:    "bg-green-50  text-green-700  border border-green-200",
  } as const;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide ${styles[level]}`}>
      {level}
    </span>
  );
}

function RequestStatusBadge({ status }: { status: "Processing" | "Completed" }) {
  const dot  = status === "Processing" ? "bg-orange-500"  : "bg-green-600";
  const pill = status === "Processing" ? "bg-orange-100 text-orange-800" : "bg-green-100 text-green-800";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold ${pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {status}
    </span>
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

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const [censored, setCensored] = useState(true);
  const mask = (v: string) => (censored ? "********" : v);

  return (
    <div className="flex flex-col gap-8 pb-8">

      <PageHeader
        title="Portfolio Details"
        subtitle="Global Opportunities Fund • #AT-8842"
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
            value={mask("$1,240,500.00")}
            sub={
              <span className="flex items-center gap-1.5 text-body-sm font-semibold text-green-600">
                <TrendingUp size={14} strokeWidth={2} />
                +2.5% <span className="font-normal text-secondary">vs last month</span>
              </span>
            }
          />
          <StatCard
            label="Cash Balance"
            value={mask("$85,200.00")}
            sub={
              <span className="flex items-center gap-1.5 text-body-sm font-semibold text-warning">
                <TrendingDown size={14} strokeWidth={2} />
                -1.2% <span className="font-normal text-secondary">unallocated</span>
              </span>
            }
          />
          <StatCard
            label="YTD Returns"
            value={mask("+12.4%")}
            sub={
              <span className="flex items-center gap-1.5 text-body-sm font-semibold text-green-600">
                <CheckCircle2 size={14} strokeWidth={2} />
                Outperforming <span className="font-normal text-secondary">Benchmark</span>
              </span>
            }
          />
          <StatCard
            label="Portfolio Health"
            value="Optimal"
            sub={
              <span className="flex items-center gap-1.5 text-body-sm font-semibold text-primary">
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
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={BAR_DATA} barCategoryGap="35%" margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ede8e8" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "#6b7280", fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v) => [`${Number(v) > 0 ? "+" : ""}${Number(v)}%`, "Return"]}
                    cursor={{ fill: "rgba(0,0,0,0.04)" }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {BAR_DATA.map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-center text-[11px] text-secondary mt-2">Performance vs Internal Benchmarks</p>
            </ChartCard>

            {/* Historical Track */}
            <ChartCard title="Historical Track (6M)">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={LINE_DATA} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ede8e8" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: "#6b7280", fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v) => [`${(Number(v) - 100).toFixed(1)}%`, ""]}
                  />
                  {LINE_SERIES.map((s) => (
                    <Line
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      stroke={s.color}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                  ))}
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(v) => LINE_SERIES.find((s) => s.key === v)?.label ?? v}
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
      <section>
        <h2 className="text-headline-md font-semibold text-on-surface mb-4">Allotted Models</h2>
        <div className="bg-surface-lowest border border-outline-variant rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-container">
              <tr>
                {["Model Name", "Symbol", "Country", "Sector", "Amount ($)", "Weighting (%)", "Multiplier", "Action"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-6 py-4 border-b border-outline-variant text-label-md font-semibold uppercase tracking-[0.05em] text-secondary${i === 7 ? " text-center" : ""}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {ALLOTTED_MODELS.map((m) => (
                <tr key={m.symbol} className="bg-surface-lowest hover:bg-surface-container/40 transition-colors duration-100">
                  <td className="px-6 py-4 text-body-sm font-bold text-on-surface">{m.name}</td>
                  <td className="px-6 py-4 font-mono text-[12px] font-bold text-primary">{m.symbol}</td>
                  <td className="px-6 py-4 text-body-sm text-on-surface">{m.country}</td>
                  <td className="px-6 py-4 text-body-sm text-on-surface">{m.sector}</td>
                  <td className="px-6 py-4 text-body-sm font-medium text-on-surface">{m.amount}</td>
                  <td className="px-6 py-4 text-body-sm text-on-surface">{m.weight}</td>
                  <td className="px-6 py-4 text-body-sm text-on-surface">{m.multiplier}</td>
                  <td className="px-6 py-4 text-center">
                    <button type="button" className="bg-primary text-white w-20 py-1.5 rounded text-[11px] font-bold hover:opacity-90 transition-opacity">
                      Redeem
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Available Models ──────────────────────────────────────────────── */}
      <section>
        <h2 className="text-headline-md font-semibold text-on-surface mb-4">Available Models</h2>
        <div className="bg-surface-lowest border border-outline-variant rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-container">
              <tr>
                {[
                  { label: "Model Name",      width: "w-[38%]"            },
                  { label: "Asset Class",     width: "w-[20%]"            },
                  { label: "Risk Level",      width: "w-[14%]"            },
                  { label: "Min. Investment", width: "w-[18%]"            },
                  { label: "Action",          width: "w-[10%]", center: true },
                ].map(({ label, width, center }) => (
                  <th
                    key={label}
                    className={`px-6 py-4 border-b border-outline-variant text-label-md font-semibold uppercase tracking-[0.05em] text-secondary ${width}${center ? " text-center" : ""}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {AVAILABLE_MODELS.map((m) => (
                <tr key={m.name} className="bg-surface-lowest hover:bg-surface-container/40 transition-colors duration-100">
                  <td className="px-6 py-4 text-body-sm font-bold text-on-surface">{m.name}</td>
                  <td className="px-6 py-4 text-body-sm text-on-surface">{m.assetClass}</td>
                  <td className="px-6 py-4"><RiskBadge level={m.risk} /></td>
                  <td className="px-6 py-4 text-body-sm font-medium text-on-surface">{m.minInvestment}</td>
                  <td className="px-6 py-4 text-center">
                    <button type="button" className="bg-primary text-white w-20 py-1.5 rounded text-[11px] font-bold hover:opacity-90 transition-opacity">
                      Allot
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-container">
              <tr>
                {["Request ID", "Type", "Model", "Amount", "Date", "Status"].map((h) => (
                  <th key={h} className="px-6 py-3 border-b border-outline-variant text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {HISTORICAL_REQUESTS.map((r) => (
                <tr key={r.id} className="bg-surface-lowest hover:bg-surface-container/40 transition-colors duration-100">
                  <td className="px-6 py-4 font-mono text-[12px] text-secondary">{r.id}</td>
                  <td className={`px-6 py-4 text-body-sm font-bold ${r.type === "Redemption" ? "text-warning" : "text-primary"}`}>
                    {r.type}
                  </td>
                  <td className="px-6 py-4 text-body-sm text-on-surface">{r.model}</td>
                  <td className="px-6 py-4 text-body-sm font-semibold text-on-surface">{r.amount}</td>
                  <td className="px-6 py-4 text-body-sm text-secondary">{r.date}</td>
                  <td className="px-6 py-4"><RequestStatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>

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
                    className={`w-7 h-7 flex items-center justify-center rounded text-[12px] font-semibold transition-colors ${page === 1 ? "bg-primary text-white" : "text-secondary hover:bg-surface-container"}`}
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
    </div>
  );
}
