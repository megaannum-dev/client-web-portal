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
  Shield,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  Ticket,
} from "@/lib/icons";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useRequests } from "@/lib/hooks/useRequests";
import { usePortfolio } from "@/lib/hooks/usePortfolio";
import { usePortfolioHistory } from "@/lib/hooks/usePortfolioHistory";
import { useRecommendedModels } from "@/lib/hooks/useRecommendedModels";
import { modelMaterialDownloadUrl } from "@/lib/api/models";
import type { ClientRequestDTO, TicketStatus, TicketKind } from "@/lib/api/requests";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard }   from "@/components/ui/StatCard";
import { EyeToggle }  from "@/components/ui/EyeToggle";
import { RaiseTicketModal } from "@/components/ui/RaiseTicketModal";

// ── Data ──────────────────────────────────────────────────────────────────────

// Color cycle for per-model chart series; Cash and the synthetic "Total" bar/line get a fixed color.
const PALETTE = ["#06b6d4", "#6b7280", "#3b82f6", "#a855f7", "#f97316", "#10b981", "#ef4444", "#eab308"];
const CASH_COLOR = "#d4b8a8";
const TOTAL_COLOR = "#f97316";

const currencyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
function formatMoney(n: number) { return currencyFmt.format(n); }
// ponytail: mirrors the inline toLocaleDateString call already used in monthly-reports/page.tsx — no shared date util yet.
function formatDate(iso: string) { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }); }

const BENCHMARK_VALUE = 0;
const BENCHMARK_COLOR = "#585f6c";

// Table column header translation keys
const SUBSCRIBED_COL_KEYS = [
  "portfolio.subscribed_columns.model_name",
  "portfolio.subscribed_columns.amount",
  "portfolio.subscribed_columns.multiplier",
  "portfolio.subscribed_columns.model_limit",
  "portfolio.subscribed_columns.ib_account",
];
const RECOMMENDED_COL_KEYS = [
  "portfolio.recommended_columns.model_name",
  "portfolio.recommended_columns.category",
  "portfolio.recommended_columns.model_limit",
  "portfolio.recommended_columns.subscription_redemption",
  "portfolio.recommended_columns.market_material",
];

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

// Highlight box drawn over the synthetic "Total" bar — index of that bar varies with
// how many models the client holds, so the factory closes over the current index.
function makeTotalBarLabel(totalIndex: number) {
  return function TotalBarLabel(props: { x?: number; y?: number; width?: number; value?: number; index?: number }) {
    const { x = 0, y = 0, width = 0, value = 0, index } = props;
    if (index !== totalIndex) return <g />;
    const text = `${value >= 0 ? "+" : ""}${formatMoney(value)}`;
    return (
      <g>
        <rect x={x + width / 2 - Math.max(30, text.length * 3.2)} y={y - 28} width={Math.max(60, text.length * 6.4)} height={20} rx={4} fill={TOTAL_COLOR} />
        <text x={x + width / 2} y={y - 14} fill="#fff" textAnchor="middle" fontSize={11} fontWeight={700}>
          {text}
        </text>
      </g>
    );
  };
}

type LineTooltipEntry = { dataKey: string; value: number | string; color?: string };

function makeLineTooltip(seriesList: { key: string; color: string }[]) {
  return function LineTooltip({ active, payload, label }: { active?: boolean; payload?: LineTooltipEntry[]; label?: string }) {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.08)", padding: "8px 12px", minWidth: 140 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 6 }}>{label}</p>
        {payload.map((entry) => {
          const isTotal = entry.dataKey === "total";
          const meta = seriesList.find((s) => s.key === entry.dataKey);
          const name = isTotal ? "Total" : entry.dataKey;
          return (
            <div key={entry.dataKey} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 3 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: meta?.color ?? entry.color, flexShrink: 0 }} />
                <span style={{ fontWeight: isTotal ? 700 : 400, color: isTotal ? TOTAL_COLOR : "#374151" }}>{name}</span>
              </span>
              <span style={{ fontWeight: isTotal ? 700 : 600, color: isTotal ? TOTAL_COLOR : "#111827" }}>{formatMoney(Number(entry.value))}</span>
            </div>
          );
        })}
      </div>
    );
  };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const { t } = useTranslation();
  const config: Record<TicketStatus, { dot: string; cls: string }> = {
    new:         { dot: "bg-secondary",             cls: "bg-secondary/10 text-secondary border-secondary/20" },
    replied:     { dot: "bg-primary",               cls: "bg-primary/10 text-primary border-primary/20"       },
    in_progress: { dot: "bg-caution animate-pulse", cls: "bg-caution/10 text-caution border-caution/20"       },
    closed:      { dot: "bg-success",               cls: "bg-success/10 text-success border-success/20"       },
    declined:    { dot: "bg-warning",               cls: "bg-warning/10 text-warning border-warning/20"       },
  };
  const { dot, cls } = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold border ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {t(`status.${status}`)}
    </span>
  );
}

const TYPE_I18N_KEY: Record<TicketKind, string> = {
  allotment:  "request_type.allotment",
  redemption: "request_type.redemption",
  other:      "request_type.others",
};

function TypeBadge({ type }: { type: TicketKind }) {
  const { t } = useTranslation();
  const cls: Record<TicketKind, string> = {
    allotment:  "text-primary",
    redemption: "text-warning",
    other:      "text-secondary",
  };
  return <span className={`text-body-sm font-bold ${cls[type]}`}>{t(TYPE_I18N_KEY[type])}</span>;
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
  const { data: requests, refetch: refetchRequests } = useRequests();
  const { data: recommended, loading: recommendedLoading } = useRecommendedModels();
  const mask = (v: string) => (censored ? "********" : v);

  // ── Charts + stat cards (FE-2) — derived once per render from usePortfolio/usePortfolioHistory ──
  const { data: portfolio } = usePortfolio();
  const { data: history }   = usePortfolioHistory(6);

  const donutData = [
    ...(portfolio?.positions ?? []).map((p, i) => ({ name: p.model_name, value: p.amount, color: PALETTE[i % PALETTE.length] })),
    { name: "Cash", value: portfolio?.cash_deposit ?? 0, color: CASH_COLOR },
  ];

  const modelKeys = history.length ? Object.keys(history[history.length - 1].per_model) : [];
  const lineData  = history.map((h) => ({ month: h.month, total: h.total, ...h.per_model }));
  const lineSeries = modelKeys.map((k, i) => ({ key: k, color: PALETTE[i % PALETTE.length] }));
  const LineTooltip = makeLineTooltip(lineSeries);

  const barData = modelKeys.map((k) => ({
    name: k,
    value: history.length ? history[history.length - 1].per_model[k] - history[0].per_model[k] : 0,
  }));
  const totalBarValue = history.length ? history[history.length - 1].total - history[0].total : 0;
  const barChartData = [...barData, { name: "Total", value: totalBarValue }];
  const totalBarIndex = barChartData.length - 1;
  const TotalBarLabel = makeTotalBarLabel(totalBarIndex);

  const modelLimitTotal = (portfolio?.positions ?? []).reduce((sum, p) => (p.model_limit != null ? sum + p.model_limit : sum), 0);
  const isPositiveChange = (portfolio?.change_amount ?? 0) >= 0;
  const allocatedPct = portfolio && portfolio.total_value > 0
    ? ((portfolio.total_value - portfolio.cash_deposit) / portfolio.total_value) * 100
    : 0;

  // ── Historical requests — search + pagination ──────────────────────────────
  const [search,      setSearch]      = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter(
      (r) =>
        r.ref.toLowerCase().includes(q) ||
        r.kind.toLowerCase().includes(q) ||
        (r.model_name ?? "").toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q),
    );
  }, [requests, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData   = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleSearch(q: string) { setSearch(q); setCurrentPage(1); }
  function handleConfirm(req: ClientRequestDTO) { void req; refetchRequests(); setTicketOpen(false); }

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
            value={mask(portfolio ? formatMoney(portfolio.total_value) : "—")}
          />
          <StatCard
            label={t("portfolio.cash_balance")}
            value={mask(portfolio ? formatMoney(portfolio.cash_deposit) : "—")}
          />
          <StatCard
            label="Amount in Trade"
            value={mask(portfolio ? formatMoney(portfolio.amount_in_trade) : "—")}
            sub={
              <span className={clsx("flex items-center gap-1.5 text-body-sm font-semibold", isPositiveChange ? "text-success" : "text-warning")}>
                {isPositiveChange ? <TrendingUp size={14} strokeWidth={2} /> : <TrendingDown size={14} strokeWidth={2} />}
                {portfolio ? formatMoney(portfolio.change_amount) : "—"}
                {" "}
                <span className="font-normal text-secondary">
                  {portfolio?.change_pct != null ? `(${portfolio.change_pct >= 0 ? "+" : ""}${(portfolio.change_pct * 100).toFixed(1)}%)` : "—"}
                </span>
              </span>
            }
          />
          <StatCard
            label={t("portfolio.subscribed_models")}
            value={portfolio ? String(portfolio.positions.length) : "—"}
            sub={
              <span className="flex items-center gap-1.5 text-body-sm font-semibold text-secondary">
                <Shield size={14} strokeWidth={2} />
                {portfolio ? formatMoney(modelLimitTotal) : "—"} <span className="font-normal text-secondary">{t("portfolio.subscribed_columns.model_limit")}</span>
              </span>
            }
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
                <BarChart data={barChartData} barCategoryGap="35%" margin={{ top: 36, right: 16, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ede8e8" vertical={false} />
                  <XAxis dataKey="name"
                    tick={({ x, y, payload, index }) => (
                      <text x={x} y={(typeof y === "number" ? y : Number(y)) + 12} textAnchor="middle"
                        fontSize={11} fill={index === totalBarIndex ? TOTAL_COLOR : "#6b7280"} fontWeight={index === totalBarIndex ? 700 : 500}>
                        {payload.value}
                      </text>
                    )}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${Number(v) > 0 ? "+" : ""}${formatMoney(Number(v))}`, t("portfolio.return_tooltip")]} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                  <ReferenceLine y={BENCHMARK_VALUE} stroke={BENCHMARK_COLOR} strokeWidth={2} strokeDasharray="6 3"
                    label={{ value: `${t("portfolio.benchmark")} ${BENCHMARK_VALUE}%`, position: "insideTopRight", fontSize: 10, fill: BENCHMARK_COLOR, fontWeight: 700 }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {barChartData.map((_, i) => <Cell key={i} fill={i === totalBarIndex ? TOTAL_COLOR : PALETTE[i % PALETTE.length]} opacity={i === totalBarIndex ? 1 : 0.75} />)}
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- recharts' LabelContentType Props union doesn't structurally match a plain {x,y,width,value,index} shape; pre-existing pattern (was YtdAvgBarLabel as any before FE-2). */}
                    <LabelList dataKey="value" content={TotalBarLabel as any} />
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
                <LineChart data={lineData} margin={{ top: 4, right: 76, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ede8e8" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6b7280", fontWeight: 500 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  {/* content takes a component reference (not <LineTooltip/>) — recharts clones+calls it,
                      and a materialized element here breaks the test harness's recharts mock
                      (JSON.stringify chokes on the element's circular _owner fiber ref). `any` because
                      recharts' generic ContentType doesn't structurally match our prop shape — same
                      pre-existing pattern this file already used for YtdAvgBarLabel/YtdAvgEndLabel. */}
                  <Tooltip content={/* eslint-disable-line @typescript-eslint/no-explicit-any */ LineTooltip as any} />
                  {lineSeries.map((s) => (
                    <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color}
                      strokeWidth={1.5} strokeOpacity={0.6} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  ))}
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard title={t("portfolio.asset_distribution")}>
            <div className="flex flex-col items-center gap-6">
              <div className="relative">
                <PieChart width={200} height={200}>
                  <Pie data={donutData} cx={100} cy={100} innerRadius={62} outerRadius={90}
                    dataKey="value" startAngle={90} endAngle={-270} strokeWidth={0}>
                    {donutData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                </PieChart>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-[18px] font-bold text-on-surface leading-tight">{`${allocatedPct.toFixed(0)}%`}</p>
                    <p className="text-[9px] font-semibold text-secondary uppercase tracking-widest">{t("portfolio.allocated")}</p>
                  </div>
                </div>
              </div>
              <div className="w-full flex flex-col gap-2">
                {donutData.map((entry) => (
                  <div key={entry.name} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                      <span className="text-body-sm text-on-surface truncate">{entry.name}</span>
                    </div>
                    <span className="text-body-sm font-semibold text-on-surface shrink-0">{formatMoney(entry.value)}</span>
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
        <ModelTable columns={SUBSCRIBED_COL_KEYS.map((k) => t(k))} gridTemplate="15rem repeat(4, 1fr)">
          {!portfolio ? (
            <div className="px-6 py-8 text-center text-body-sm text-secondary">Loading…</div>
          ) : portfolio.positions.length === 0 ? (
            <div className="px-6 py-8 text-center text-body-sm text-secondary">{t("portfolio.no_results")}</div>
          ) : (
            portfolio.positions.map((p) => (
              <ModelRow key={p.model_id} gridTemplate="15rem repeat(4, 1fr)">
                <div className="px-5 py-4 flex items-center min-w-0"><span className="text-body-sm font-bold text-on-surface truncate">{p.model_name}</span></div>
                <div className="px-5 py-4 flex items-center text-body-sm font-medium text-on-surface">{formatMoney(p.amount)}</div>
                <div className="px-5 py-4 flex items-center text-body-sm text-on-surface">{`${p.units.toFixed(1)}x`}</div>
                <div className="px-5 py-4 flex items-center text-body-sm text-on-surface">{p.model_limit != null ? formatMoney(p.model_limit) : "—"}</div>
                <div className="px-5 py-4 flex items-center font-mono text-[12px] font-semibold text-primary">{p.ib_account ?? "—"}</div>
              </ModelRow>
            ))
          )}
        </ModelTable>
      </section>

      {/* ── Recommended Models ────────────────────────────────────────────── */}
      <section id="recommended-models">
        <h2 className="text-headline-md font-semibold text-on-surface mb-4">{t("portfolio.recommended_models")}</h2>
        <ModelTable columns={RECOMMENDED_COL_KEYS.map((k) => t(k))} gridTemplate="15rem repeat(4, 1fr)">
          {recommendedLoading ? (
            <div className="px-6 py-8 text-center text-body-sm text-secondary">Loading…</div>
          ) : recommended.length === 0 ? (
            <div className="px-6 py-8 text-center text-body-sm text-secondary">{t("portfolio.no_results")}</div>
          ) : (
            recommended.map((m) => (
              <ModelRow key={m.model_id} gridTemplate="15rem repeat(4, 1fr)">
                <div className="px-5 py-4 flex items-center min-w-0"><span className="text-body-sm font-bold text-on-surface truncate">{m.name}</span></div>
                <div className="px-5 py-4 flex items-center min-w-0"><span className="text-body-sm text-on-surface truncate">{m.category?.join(", ") ?? "—"}</span></div>
                <div className="px-5 py-4 flex items-center text-body-sm text-on-surface">{m.model_limit != null ? formatMoney(m.model_limit) : "—"}</div>
                <div className="px-5 py-4 flex items-center text-body-sm text-on-surface">{m.subscription_redemption ?? "—"}</div>
                <div className="px-5 py-4 flex items-center">
                  {m.has_material && (
                    <a
                      href={modelMaterialDownloadUrl(m.model_id)}
                      className="inline-flex items-center gap-1.5 text-primary text-[12.5px] font-semibold hover:underline transition-all"
                    >
                      <Download size={15} strokeWidth={2.5} />{t("common.download")}
                    </a>
                  )}
                </div>
              </ModelRow>
            ))
          )}
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
          <div className="grid bg-surface-container border-b border-outline-variant" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
            {[
              t("portfolio.ticket_columns.ticket_id"),
              t("portfolio.ticket_columns.type"),
              t("portfolio.ticket_columns.model_subject"),
              t("portfolio.ticket_columns.subject"),
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
              <div key={r.ref} className="grid border-b border-outline-variant last:border-b-0 bg-surface-lowest hover:bg-surface-container/40 transition-colors duration-100" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
                <div className="px-5 py-4 flex items-center font-mono text-[12px] text-secondary">{r.ref}</div>
                <div className="px-5 py-4 flex items-center"><TypeBadge type={r.kind} /></div>
                <div className="px-5 py-4 flex items-center text-body-sm text-on-surface truncate">{r.model_name ?? "—"}</div>
                <div className="px-5 py-4 flex items-center text-body-sm text-on-surface truncate">{r.subject}</div>
                <div className="px-5 py-4 flex items-center text-body-sm font-semibold text-on-surface">{r.amount != null ? formatMoney(r.amount) : "—"}</div>
                <div className="px-5 py-4 flex items-center text-body-sm text-secondary">{formatDate(r.created_at)}</div>
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
