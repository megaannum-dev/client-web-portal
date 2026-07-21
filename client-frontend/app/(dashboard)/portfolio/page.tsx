"use client";

import { useState, useMemo } from "react";
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
  Search,
  Ticket,
} from "@/lib/icons";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useAllotmentRequests } from "@/lib/hooks/useAllotmentRequests";
import { useSubscriptions } from "@/lib/hooks/useSubscriptions";
import {
  MOCK_ALLOTMENT_REQUESTS,
  MOCK_RECOMMENDED_MODELS,
  MOCK_PORTFOLIO_STATS,
  type AllotmentRequest,
} from "@/lib/mock/data";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard }   from "@/components/ui/StatCard";
import { EyeToggle }  from "@/components/ui/EyeToggle";
import { RaiseTicketModal } from "@/components/ui/RaiseTicketModal";

// ── Data ──────────────────────────────────────────────────────────────────────

const BAR_DATA = [
  { name: "Model A", value: 18.4 },
  { name: "Model B", value: -6.2 },
  { name: "Model C", value: 9.7  },
  { name: "Model D", value: 14.2 },
  { name: "YTD Avg", value: 12.4 },
];
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
const YTD_AVG_LINE = { key: "ytdAvg", label: "YTD Avg", color: "#f97316" };

const DONUT_DATA = [
  { name: "Model A", value: 774072, color: "#f97316", display: "$774,072" },
  { name: "Model B", value: 466428, color: "#6b7280", display: "$466,428" },
  { name: "Model C", value: 120000, color: "#3b82f6", display: "$120,000" },
  { name: "Model D", value: 95000,  color: "#a855f7", display: "$95,000"  },
  { name: "Cash",    value: 85200,  color: "#d4b8a8", display: "$85,200"  },
];

const BENCHMARK_VALUE = 0;
const BENCHMARK_COLOR = "#585f6c";

// Table column header translation keys
const SUBSCRIBED_COL_KEYS = [
  "portfolio.subscribed_columns.model_name",
  "portfolio.subscribed_columns.symbol",
  "portfolio.subscribed_columns.country",
  "portfolio.subscribed_columns.sector",
  "portfolio.subscribed_columns.model_limit",
  "portfolio.subscribed_columns.amount",
  "portfolio.subscribed_columns.multiplier",
  "portfolio.subscribed_columns.ib_account",
];
const RECOMMENDED_COL_KEYS = [
  "portfolio.recommended_columns.model_name",
  "portfolio.recommended_columns.symbol",
  "portfolio.recommended_columns.country",
  "portfolio.recommended_columns.sector",
  "portfolio.recommended_columns.model_limit",
  "portfolio.recommended_columns.min_investment",
  "portfolio.recommended_columns.risk_level",
  "portfolio.recommended_columns.market_material",
];

const YTD_AVG_INDEX = BAR_DATA.findIndex((d) => d.name === "YTD Avg");

const PAGE_SIZE = 7;

// ── Chart helpers ─────────────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  backgroundColor: "#fff",
  border: "1px solid #e0e0e0",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
};

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
  const { t } = useTranslation();
  const cls = { High: "badge-warning", Medium: "badge-caution", Low: "badge-success" } as const;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide border ${cls[level]}`}>
      {t(`risk.${level.toLowerCase()}`)}
    </span>
  );
}

function TicketStatusBadge({ status }: { status: AllotmentRequest["status"] }) {
  const { t } = useTranslation();
  const config: Record<AllotmentRequest["status"], { dot: string; cls: string }> = {
    Sent:       { dot: "bg-secondary",             cls: "bg-secondary/10 text-secondary border-secondary/20" },
    Received:   { dot: "bg-primary",               cls: "bg-primary/10 text-primary border-primary/20"       },
    Processing: { dot: "bg-caution animate-pulse", cls: "bg-caution/10 text-caution border-caution/20"       },
    Fulfilled:  { dot: "bg-success",               cls: "bg-success/10 text-success border-success/20"       },
  };
  const { dot, cls } = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold border ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {t(`status.${status.toLowerCase()}`)}
    </span>
  );
}

function TypeBadge({ type }: { type: AllotmentRequest["type"] }) {
  const { t } = useTranslation();
  const cls: Record<AllotmentRequest["type"], string> = {
    Allotment:  "text-primary",
    Redemption: "text-warning",
    Others:     "text-secondary",
  };
  return <span className={`text-body-sm font-bold ${cls[type]}`}>{t(`request_type.${type.toLowerCase()}`)}</span>;
}

function ModelTable({ columns, gridTemplate, children }: {
  columns: string[];
  gridTemplate: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface-lowest border border-outline-variant rounded-lg overflow-hidden">
      <div className="grid bg-surface-container border-b border-outline-variant" style={{ gridTemplateColumns: gridTemplate }}>
        {columns.map((h) => (
          <div key={h} className="px-5 py-3 text-label-md font-semibold uppercase tracking-[0.05em] text-secondary flex items-center">
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

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const { t } = useTranslation();
  const [censored,    setCensored]    = useState(true);
  const [ticketOpen,  setTicketOpen]  = useState(false);
  const { dynamic, addRequest }       = useAllotmentRequests();
  const { data: subscribedModels, loading: subsLoading } = useSubscriptions();
  const mask = (v: string) => (censored ? "********" : v);

  // ── Historical requests — search + pagination ──────────────────────────────
  const [search,      setSearch]      = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const allRequests = useMemo(() => [...dynamic, ...MOCK_ALLOTMENT_REQUESTS], [dynamic]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allRequests;
    return allRequests.filter(
      (r) =>
        r.id.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q) ||
        r.model.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q),
    );
  }, [allRequests, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData   = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleSearch(q: string) { setSearch(q); setCurrentPage(1); }
  function handleConfirm(req: AllotmentRequest) { addRequest(req); setTicketOpen(false); }

  return (
    <div className="flex flex-col gap-8 pb-8">

      <PageHeader
        title={t("portfolio.title")}
        subtitle={t("portfolio.subtitle")}
        action={
          <button
            type="button"
            onClick={() => setTicketOpen(true)}
            className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-lg text-body-sm font-bold hover:opacity-90 transition-opacity shadow-sm"
          >
            <Ticket size={16} strokeWidth={2} />
            {t("portfolio.raise_ticket")}
          </button>
        }
      />

      {/* ── Stat cards ───────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-headline-md font-semibold text-on-surface">{t("portfolio.portfolio_summary")}</h2>
          <EyeToggle censored={censored} onToggle={() => setCensored((v) => !v)} />
        </div>

        <div className="grid grid-cols-4 gap-4">
          <StatCard
            label={t("portfolio.total_value")}
            value={mask(MOCK_PORTFOLIO_STATS.totalValue)}
            sub={<span className="flex items-center gap-1.5 text-body-sm font-semibold text-success"><TrendingUp size={14} strokeWidth={2} />{MOCK_PORTFOLIO_STATS.ytdChange} <span className="font-normal text-secondary">{t("portfolio.vs_last_month")}</span></span>}
          />
          <StatCard
            label={t("portfolio.cash_balance")}
            value={mask(MOCK_PORTFOLIO_STATS.cashBalance)}
            sub={<span className="flex items-center gap-1.5 text-body-sm font-semibold text-warning"><TrendingDown size={14} strokeWidth={2} />-1.2% <span className="font-normal text-secondary">{t("portfolio.unallocated")}</span></span>}
          />
          <StatCard
            label={t("portfolio.ytd_returns")}
            value={mask(MOCK_PORTFOLIO_STATS.ytdReturns)}
            sub={<span className="flex items-center gap-1.5 text-body-sm font-semibold text-success"><CheckCircle2 size={14} strokeWidth={2} />{t("portfolio.outperforming")} <span className="font-normal text-secondary">{t("portfolio.benchmark")}</span></span>}
          />
          <StatCard
            label={t("portfolio.portfolio_health")}
            value={t("portfolio.optimal")}
            sub={<span className="flex items-center gap-1.5 text-body-sm font-semibold text-success"><Shield size={14} strokeWidth={2} />{t("portfolio.risk_profile_stable")}</span>}
          />
        </div>
      </div>

      {/* ── Portfolio Insights ────────────────────────────────────────────── */}
      <section>
        <h2 className="text-headline-md font-semibold text-on-surface mb-4">{t("portfolio.portfolio_insights")}</h2>

        <div className="grid grid-cols-[1fr_320px] gap-4">
          <div className="flex flex-col gap-4">
            <ChartCard title={t("portfolio.return_loss_performance")}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={BAR_DATA} barCategoryGap="35%" margin={{ top: 36, right: 16, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ede8e8" vertical={false} />
                  <XAxis dataKey="name"
                    tick={({ x, y, payload, index }) => (
                      <text x={x} y={(typeof y === "number" ? y : Number(y)) + 12} textAnchor="middle"
                        fontSize={11} fill={index === 4 ? "#f97316" : "#6b7280"} fontWeight={index === 4 ? 700 : 500}>
                        {payload.value}
                      </text>
                    )}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${Number(v) > 0 ? "+" : ""}${Number(v)}%`, t("portfolio.return_tooltip")]} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                  <ReferenceLine y={BENCHMARK_VALUE} stroke={BENCHMARK_COLOR} strokeWidth={2} strokeDasharray="6 3"
                    label={{ value: `${t("portfolio.benchmark")} ${BENCHMARK_VALUE}%`, position: "insideTopRight", fontSize: 10, fill: BENCHMARK_COLOR, fontWeight: 700 }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {BAR_DATA.map((_, i) => <Cell key={i} fill={BAR_COLORS[i]} opacity={i === 4 ? 1 : 0.75} />)}
                    <LabelList dataKey="value" content={YtdAvgBarLabel as any} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-4 mt-2">
                <p className="text-[11px] text-secondary">{t("portfolio.performance_vs_benchmarks")}</p>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-tertiary">
                  <span className="inline-block w-6 border-t-2 border-dashed border-tertiary" />{t("portfolio.benchmark_legend")}
                </span>
              </div>
            </ChartCard>

            <ChartCard title={t("portfolio.historical_track")}>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={LINE_DATA} margin={{ top: 4, right: 76, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ede8e8" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6b7280", fontWeight: 500 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip content={<LineTooltip />} />
                  {LINE_SERIES.map((s) => (
                    <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color}
                      strokeWidth={1.5} strokeOpacity={0.6} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  ))}
                  <Line type="monotone" dataKey={YTD_AVG_LINE.key} stroke={YTD_AVG_LINE.color}
                    strokeWidth={3} strokeDasharray="8 4" dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff", fill: YTD_AVG_LINE.color }}
                    label={<YtdAvgEndLabel />} />
                  <Legend iconType="circle" iconSize={8}
                    formatter={(v) => {
                      if (v === YTD_AVG_LINE.key) return <span style={{ color: YTD_AVG_LINE.color, fontWeight: 700 }}>YTD Avg</span>;
                      return LINE_SERIES.find((s) => s.key === v)?.label ?? v;
                    }}
                    wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard title={t("portfolio.asset_distribution")}>
            <div className="flex flex-col items-center gap-6">
              <div className="relative">
                <PieChart width={200} height={200}>
                  <Pie data={DONUT_DATA} cx={100} cy={100} innerRadius={62} outerRadius={90}
                    dataKey="value" startAngle={90} endAngle={-270} strokeWidth={0}>
                    {DONUT_DATA.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                </PieChart>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-[18px] font-bold text-on-surface leading-tight">100%</p>
                    <p className="text-[9px] font-semibold text-secondary uppercase tracking-widest">{t("portfolio.allocated")}</p>
                  </div>
                </div>
              </div>
              <div className="w-full flex flex-col gap-2">
                {DONUT_DATA.map((entry) => (
                  <div key={entry.name} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
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

      {/* ── Subscribed Models ────────────────────────────────────────────── */}
      <section id="subscribed-models">
        <h2 className="text-headline-md font-semibold text-on-surface mb-4">{t("portfolio.subscribed_models")}</h2>
        <ModelTable columns={SUBSCRIBED_COL_KEYS.map((k) => t(k))} gridTemplate="15rem repeat(7, 1fr)">
          {subsLoading ? (
            <div className="px-6 py-8 text-center text-body-sm text-secondary">Loading…</div>
          ) : subscribedModels.length === 0 ? (
            <div className="px-6 py-8 text-center text-body-sm text-secondary">{t("portfolio.no_results")}</div>
          ) : (
            subscribedModels.map((m, i) => (
              <ModelRow key={i} gridTemplate="15rem repeat(7, 1fr)">
                <div className="px-5 py-4 flex items-center min-w-0"><span className="text-body-sm font-bold text-on-surface truncate">{m.name}</span></div>
                <div className="px-5 py-4 flex items-center font-mono text-[12px] font-bold text-primary">{m.symbol}</div>
                <div className="px-5 py-4 flex items-center text-body-sm text-on-surface">{m.country}</div>
                <div className="px-5 py-4 flex items-center min-w-0"><span className="text-body-sm text-on-surface truncate">{m.sector}</span></div>
                <div className="px-5 py-4 flex items-center text-body-sm text-on-surface">{m.modelLimit}</div>
                <div className="px-5 py-4 flex items-center text-body-sm font-medium text-on-surface">{m.amount}</div>
                <div className="px-5 py-4 flex items-center text-body-sm text-on-surface">{m.multiplier}</div>
                <div className="px-5 py-4 flex items-center">
                  <a href="#" className="font-mono text-[12px] font-semibold text-primary hover:underline transition-all">
                    {m.ibAccount}
                  </a>
                </div>
              </ModelRow>
            ))
          )}
        </ModelTable>
      </section>

      {/* ── Recommended Models ────────────────────────────────────────────── */}
      <section>
        <h2 className="text-headline-md font-semibold text-on-surface mb-4">{t("portfolio.recommended_models")}</h2>
        <ModelTable columns={RECOMMENDED_COL_KEYS.map((k) => t(k))} gridTemplate="15rem repeat(7, 1fr)">
          {MOCK_RECOMMENDED_MODELS.map((m) => (
            <ModelRow key={m.name} gridTemplate="15rem repeat(7, 1fr)">
              <div className="px-5 py-4 flex items-center min-w-0"><span className="text-body-sm font-bold text-on-surface truncate">{m.name}</span></div>
              <div className="px-5 py-4 flex items-center font-mono text-[12px] font-bold text-primary">{m.symbol}</div>
              <div className="px-5 py-4 flex items-center text-body-sm text-on-surface">{m.country}</div>
              <div className="px-5 py-4 flex items-center min-w-0"><span className="text-body-sm text-on-surface truncate">{m.sector}</span></div>
              <div className="px-5 py-4 flex items-center text-body-sm text-on-surface">{m.modelLimit}</div>
              <div className="px-5 py-4 flex items-center"><RiskBadge level={m.risk} /></div>
              <div className="px-5 py-4 flex items-center text-body-sm font-medium text-on-surface">{m.minInvestment}</div>
              <div className="px-5 py-4 flex items-center">
                <button type="button" className="inline-flex items-center gap-1.5 text-primary text-[12.5px] font-semibold hover:underline transition-all">
                  <Download size={15} strokeWidth={2.5} />{t("common.download")}
                </button>
              </div>
            </ModelRow>
          ))}
        </ModelTable>
      </section>

      {/* ── Ticket History ────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-headline-md font-semibold text-on-surface">{t("portfolio.ticket_history")}</h2>

          {/* Search */}
          <div className="relative w-64">
            <Search size={14} strokeWidth={2} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary pointer-events-none" />
            <input
              type="search"
              placeholder={t("portfolio.search_placeholder")}
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-outline-variant rounded-lg text-body-sm text-on-surface bg-surface-lowest focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            />
          </div>
        </div>

        <div className="bg-surface-lowest border border-outline-variant rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid bg-surface-container border-b border-outline-variant" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
            {[
              t("portfolio.ticket_columns.ticket_id"),
              t("portfolio.ticket_columns.type"),
              t("portfolio.ticket_columns.model_subject"),
              t("portfolio.ticket_columns.amount"),
              t("portfolio.ticket_columns.date"),
              t("portfolio.ticket_columns.status"),
            ].map((h) => (
              <div key={h} className="px-5 py-3 text-label-md font-semibold uppercase tracking-[0.05em] text-secondary flex items-center">
                {h}
              </div>
            ))}
          </div>

          {/* Rows */}
          {pageData.length === 0 ? (
            <div className="px-6 py-8 text-center text-body-sm text-secondary">{t("portfolio.no_tickets_match")}</div>
          ) : (
            pageData.map((r) => (
              <div key={r.id} className="grid border-b border-outline-variant last:border-b-0 bg-surface-lowest hover:bg-surface-container/40 transition-colors duration-100" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
                <div className="px-5 py-4 flex items-center font-mono text-[12px] text-secondary">{r.id}</div>
                <div className="px-5 py-4 flex items-center"><TypeBadge type={r.type} /></div>
                <div className="px-5 py-4 flex items-center text-body-sm text-on-surface truncate">{r.model}</div>
                <div className="px-5 py-4 flex items-center text-body-sm font-semibold text-on-surface">{r.amount}</div>
                <div className="px-5 py-4 flex items-center text-body-sm text-secondary">{r.date}</div>
                <div className="px-5 py-4 flex items-center"><TicketStatusBadge status={r.status} /></div>
              </div>
            ))
          )}

          {/* Pagination footer */}
          <div className="px-6 py-4 bg-surface-container border-t border-outline-variant flex items-center justify-between">
            <span className="text-label-md text-secondary">
              {filtered.length === 0
                ? t("portfolio.no_results")
                : t("portfolio.showing_tickets", {
                    from: (currentPage - 1) * PAGE_SIZE + 1,
                    to: Math.min(currentPage * PAGE_SIZE, filtered.length),
                    total: filtered.length,
                  })}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}
                className="p-1.5 rounded border border-outline-variant hover:bg-surface-container transition-colors flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label={t("portfolio.previous_page")}>
                <ChevronLeft size={14} strokeWidth={2} className="text-secondary" />
              </button>
              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button key={page} type="button" onClick={() => setCurrentPage(page)}
                    className={clsx("w-7 h-7 flex items-center justify-center rounded text-[12px] font-semibold transition-colors",
                      page === currentPage ? "bg-primary text-white" : "text-secondary hover:bg-surface-container")}>
                    {page}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                className="p-1.5 rounded border border-outline-variant hover:bg-surface-container transition-colors flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label={t("portfolio.next_page")}>
                <ChevronRight size={14} strokeWidth={2} className="text-secondary" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {ticketOpen && (
        <RaiseTicketModal
          onClose={() => setTicketOpen(false)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
