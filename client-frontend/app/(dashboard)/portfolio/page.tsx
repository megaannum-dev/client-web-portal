import {
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Shield,
  ChevronLeft,
  ChevronRight,
} from "@/lib/icons";

// ── Data ──────────────────────────────────────────────────────────────────────

const ALLOTTED_MODELS = [
  {
    name: "Model A",
    symbol: "AC60",
    country: "USA",
    sector: "Medical Healthcare",
    amount: "$774,072.00",
    weight: "62.4%",
    multiplier: "1.0x",
  },
  {
    name: "Model B",
    symbol: "ESGI",
    country: "Global",
    sector: "Sustainable Tech",
    amount: "$466,428.00",
    weight: "37.6%",
    multiplier: "1.0x",
  },
];

const AVAILABLE_MODELS = [
  {
    name: "Global Tech Growth",
    assetClass: "Equity",
    risk: "High" as const,
    minInvestment: "$10,000",
  },
  {
    name: "Institutional Bond Core",
    assetClass: "Fixed Income",
    risk: "Low" as const,
    minInvestment: "$50,000",
  },
  {
    name: "Diversified Real Estate",
    assetClass: "Alternatives",
    risk: "Medium" as const,
    minInvestment: "$25,000",
  },
];

const HISTORICAL_REQUESTS = [
  {
    id: "#RR-429",
    type: "Redemption" as const,
    model: "ESG Impact Growth",
    amount: "$12,000.00",
    date: "Nov 01, 2023",
    status: "Processing" as const,
  },
  {
    id: "#AT-771",
    type: "Allotment" as const,
    model: "Alpha Core 60/40",
    amount: "$50,000.00",
    date: "Oct 12, 2023",
    status: "Completed" as const,
  },
  {
    id: "#RR-765",
    type: "Redemption" as const,
    model: "ESG Impact Growth",
    amount: "$12,000.00",
    date: "Oct 08, 2023",
    status: "Completed" as const,
  },
  {
    id: "#AT-760",
    type: "Allotment" as const,
    model: "Alpha Core 60/40",
    amount: "$25,000.00",
    date: "Oct 24, 2023",
    status: "Processing" as const,
  },
  {
    id: "#AT-754",
    type: "Allotment" as const,
    model: "Institutional Bond Core",
    amount: "$15,000.00",
    date: "Sep 28, 2023",
    status: "Completed" as const,
  },
  {
    id: "#RR-749",
    type: "Redemption" as const,
    model: "Global Tech Growth",
    amount: "$8,500.00",
    date: "Sep 15, 2023",
    status: "Completed" as const,
  },
  {
    id: "#AT-742",
    type: "Allotment" as const,
    model: "Diversified Real Estate",
    amount: "$10,000.00",
    date: "Sep 02, 2023",
    status: "Completed" as const,
  },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: "High" | "Medium" | "Low" }) {
  const styles = {
    High:   "bg-red-50    text-red-700    border border-red-200",
    Medium: "bg-orange-50 text-orange-700 border border-orange-200",
    Low:    "bg-green-50  text-green-700  border border-green-200",
  } as const;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide ${styles[level]}`}
    >
      {level}
    </span>
  );
}

function RequestStatusBadge({ status }: { status: "Processing" | "Completed" }) {
  const dot =
    status === "Processing"
      ? "bg-orange-500"
      : "bg-green-600";
  const pill =
    status === "Processing"
      ? "bg-orange-100 text-orange-800"
      : "bg-green-100 text-green-800";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold ${pill}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {status}
    </span>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  return (
    <div className="flex flex-col gap-8 pb-8">

      {/* Page header */}
      <div>
        <h1 className="text-headline-xl font-bold text-on-surface tracking-tight">
          Portfolio Details
        </h1>
        <p className="mt-1 text-body-lg text-secondary">
          Global Opportunities Fund &bull; #AT-8842
        </p>
      </div>

      {/* ── Bento grid – 4 stat cards ────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">

        {/* Total Value */}
        <div className="bg-surface-lowest border border-outline-variant rounded-lg p-6 flex flex-col gap-3">
          <span className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
            Total Value
          </span>
          <span className="text-[28px] font-bold text-on-surface leading-none tracking-tight">
            $1,240,500.00
          </span>
          <span className="flex items-center gap-1.5 text-body-sm font-semibold text-green-600">
            <TrendingUp size={14} strokeWidth={2} />
            +2.5%
            <span className="font-normal text-secondary">vs last month</span>
          </span>
        </div>

        {/* Cash Balance */}
        <div className="bg-surface-lowest border border-outline-variant rounded-lg p-6 flex flex-col gap-3">
          <span className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
            Cash Balance
          </span>
          <span className="text-[28px] font-bold text-on-surface leading-none tracking-tight">
            $85,200.00
          </span>
          <span className="flex items-center gap-1.5 text-body-sm font-semibold text-red-600">
            <TrendingDown size={14} strokeWidth={2} />
            -1.2%
            <span className="font-normal text-secondary">unallocated</span>
          </span>
        </div>

        {/* YTD Returns */}
        <div className="bg-surface-lowest border border-outline-variant rounded-lg p-6 flex flex-col gap-3">
          <span className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
            YTD Returns
          </span>
          <span className="text-[28px] font-bold text-on-surface leading-none tracking-tight">
            +12.4%
          </span>
          <span className="flex items-center gap-1.5 text-body-sm font-semibold text-green-600">
            <CheckCircle2 size={14} strokeWidth={2} />
            Outperforming
            <span className="font-normal text-secondary">Benchmark</span>
          </span>
        </div>

        {/* Portfolio Health */}
        <div className="bg-surface-lowest border border-outline-variant rounded-lg p-6 flex flex-col gap-3">
          <span className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
            Portfolio Health
          </span>
          <span className="text-[28px] font-bold text-on-surface leading-none tracking-tight">
            Optimal
          </span>
          <span className="flex items-center gap-1.5 text-body-sm font-semibold text-primary">
            <Shield size={14} strokeWidth={2} />
            Risk Profile Stable
          </span>
        </div>
      </div>

      {/* ── Content sections ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-8">

        {/* Allotted Models */}
        <section>
          <h2 className="text-headline-md font-semibold text-on-surface mb-4">
            Allotted Models
          </h2>
          <div className="bg-surface-lowest border border-outline-variant rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container">
                <tr>
                  {[
                    "Model Name",
                    "Symbol",
                    "Country",
                    "Sector",
                    "Amount ($)",
                    "Weighting (%)",
                    "Multiplier",
                    "Action",
                  ].map((h, i) => (
                    <th
                      key={h}
                      className={`px-6 py-4 border-b border-outline-variant text-label-md font-semibold uppercase tracking-[0.05em] text-secondary${i >= 4 ? " text-right" : ""}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {ALLOTTED_MODELS.map((m) => (
                  <tr
                    key={m.symbol}
                    className="bg-surface-lowest hover:bg-surface-container/40 transition-colors duration-100"
                  >
                    <td className="px-6 py-4 text-body-sm font-bold text-on-surface">
                      {m.name}
                    </td>
                    <td className="px-6 py-4 font-mono text-[12px] font-bold text-primary">
                      {m.symbol}
                    </td>
                    <td className="px-6 py-4 text-body-sm text-on-surface">{m.country}</td>
                    <td className="px-6 py-4 text-body-sm text-on-surface">{m.sector}</td>
                    <td className="px-6 py-4 text-body-sm font-medium text-on-surface text-right">
                      {m.amount}
                    </td>
                    <td className="px-6 py-4 text-body-sm text-on-surface text-right">
                      {m.weight}
                    </td>
                    <td className="px-6 py-4 text-body-sm text-on-surface text-right">
                      {m.multiplier}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        className="bg-primary text-white px-4 py-1.5 rounded text-[11px] font-bold hover:opacity-90 transition-opacity"
                      >
                        Redeem
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Available Models */}
        <section>
          <h2 className="text-headline-md font-semibold text-on-surface mb-4">
            Available Models
          </h2>
          <div className="bg-surface-lowest border border-outline-variant rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container">
                <tr>
                  {["Model Name", "Asset Class", "Risk Level", "Min. Investment", "Action"].map(
                    (h, i) => (
                      <th
                        key={h}
                        className={`px-6 py-4 border-b border-outline-variant text-label-md font-semibold uppercase tracking-[0.05em] text-secondary${i >= 3 ? " text-right" : ""}`}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {AVAILABLE_MODELS.map((m) => (
                  <tr
                    key={m.name}
                    className="bg-surface-lowest hover:bg-surface-container/40 transition-colors duration-100"
                  >
                    <td className="px-6 py-4 text-body-sm font-bold text-on-surface">
                      {m.name}
                    </td>
                    <td className="px-6 py-4 text-body-sm text-on-surface">{m.assetClass}</td>
                    <td className="px-6 py-4">
                      <RiskBadge level={m.risk} />
                    </td>
                    <td className="px-6 py-4 text-body-sm font-medium text-on-surface text-right">
                      {m.minInvestment}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        className="bg-primary text-white px-4 py-1.5 rounded text-[11px] font-bold hover:opacity-90 transition-opacity"
                      >
                        Allot
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Historical Requests */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-headline-md font-semibold text-on-surface">
              Historical Requests
            </h2>
            <button
              type="button"
              className="text-label-md font-semibold text-primary hover:opacity-80 transition-opacity uppercase tracking-[0.05em]"
            >
              View All
            </button>
          </div>

          <div className="bg-surface-lowest border border-outline-variant rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container">
                <tr>
                  {[
                    { label: "Request ID", right: false },
                    { label: "Type",       right: false },
                    { label: "Model",      right: false },
                    { label: "Amount",     right: true  },
                    { label: "Date",       right: false },
                    { label: "Status",     right: false },
                  ].map(({ label, right }) => (
                    <th
                      key={label}
                      className={`px-6 py-3 border-b border-outline-variant text-label-md font-semibold uppercase tracking-[0.05em] text-secondary${right ? " text-right" : ""}`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {HISTORICAL_REQUESTS.map((r) => (
                  <tr
                    key={r.id}
                    className="bg-surface-lowest hover:bg-surface-container/40 transition-colors duration-100"
                  >
                    <td className="px-6 py-4 font-mono text-[12px] text-secondary">
                      {r.id}
                    </td>
                    <td
                      className={`px-6 py-4 text-body-sm font-bold ${
                        r.type === "Redemption" ? "text-red-600" : "text-primary"
                      }`}
                    >
                      {r.type}
                    </td>
                    <td className="px-6 py-4 text-body-sm text-on-surface">{r.model}</td>
                    <td className="px-6 py-4 text-body-sm font-semibold text-on-surface text-right">
                      {r.amount}
                    </td>
                    <td className="px-6 py-4 text-body-sm text-secondary">{r.date}</td>
                    <td className="px-6 py-4">
                      <RequestStatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination footer */}
            <div className="px-6 py-4 bg-surface-container border-t border-outline-variant flex items-center justify-between">
              <span className="text-label-md text-secondary">
                Showing 1–7 of 24 results
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="p-1.5 rounded border border-outline-variant hover:bg-surface-container transition-colors flex items-center justify-center"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={14} strokeWidth={2} className="text-secondary" />
                </button>
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((page) => (
                    <button
                      key={page}
                      type="button"
                      className={`w-7 h-7 flex items-center justify-center rounded text-[12px] font-semibold transition-colors ${
                        page === 1
                          ? "bg-primary text-white"
                          : "text-secondary hover:bg-surface-container"
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="p-1.5 rounded border border-outline-variant hover:bg-surface-container transition-colors flex items-center justify-center"
                  aria-label="Next page"
                >
                  <ChevronRight size={14} strokeWidth={2} className="text-secondary" />
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
