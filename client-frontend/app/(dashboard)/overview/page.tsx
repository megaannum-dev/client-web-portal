import Link from "next/link";
import {
  TrendingUp,
  ChevronRight,
  Download,
  FileText,
  AlertCircle,
  ShieldAlert,
  Plus,
} from "@/lib/icons";

// ── Data ──────────────────────────────────────────────────────────────────────

const REQUESTS = [
  {
    type: "Allotment",
    fund: "Alpha Core 60/40",
    submitted: "Oct 28, 2023",
    status: "PROCESSING" as const,
    amount: "$50,000.00",
  },
  {
    type: "Redemption",
    fund: "Global Growth Equity",
    submitted: "Oct 25, 2023",
    status: "APPROVED" as const,
    amount: "$125,000.00",
  },
];

const EOM_REPORTS = [
  { name: "EOM_Report_Oct_2023.pdf", period: "Oct 1 – Oct 31, 2023" },
  { name: "EOM_Report_Sep_2023.pdf", period: "Sep 1 – Sep 30, 2023" },
  { name: "EOM_Report_Aug_2023.pdf", period: "Aug 1 – Aug 31, 2023" },
  { name: "EOM_Report_Jul_2023.pdf", period: "Jul 1 – Jul 31, 2023" },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "PROCESSING" | "APPROVED" | "FINALIZED" }) {
  const styles = {
    PROCESSING: "bg-orange-50 text-orange-600 border border-orange-200",
    APPROVED:   "bg-green-50  text-green-700  border border-green-200",
    FINALIZED:  "bg-green-50  text-green-700  border border-green-200",
  } as const;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function SectionHeader({
  title,
  linkLabel,
  linkHref,
}: {
  title: string;
  linkLabel: string;
  linkHref: string;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-headline-md font-semibold text-on-surface">{title}</h2>
      <Link
        href={linkHref}
        className="flex items-center gap-0.5 text-label-md font-semibold uppercase tracking-[0.05em] text-primary hover:opacity-80 transition-opacity"
      >
        {linkLabel}
        <ChevronRight size={13} strokeWidth={2.5} />
      </Link>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  return (
    <div className="flex flex-col gap-8 pb-20">

      {/* Page header */}
      <div>
        <h1 className="text-headline-xl font-bold text-on-surface tracking-tight">
          External Client Dashboard
        </h1>
        <p className="mt-1 text-body-lg text-secondary">
          Global Opportunities Fund &bull; Portfolio ID: #AT-8842
        </p>
      </div>

      {/* ── Bento grid – 4 stat cards ────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">

        {/* Total Portfolio Value */}
        <div className="bg-surface-lowest border border-outline-variant rounded-lg p-6 flex flex-col gap-3">
          <span className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
            Total Portfolio Value
          </span>
          <span className="text-[28px] font-bold text-on-surface leading-none tracking-tight">
            $4,285,420.00
          </span>
          <span className="flex items-center gap-1.5 text-body-sm font-semibold text-primary">
            <TrendingUp size={14} strokeWidth={2} />
            +2.4% vs Last Month
          </span>
        </div>

        {/* Cash on Hand */}
        <div className="bg-surface-lowest border border-outline-variant rounded-lg p-6 flex flex-col gap-3">
          <span className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
            Cash on Hand
          </span>
          <span className="text-[28px] font-bold text-on-surface leading-none tracking-tight">
            $842,500.00
          </span>
          <span className="text-body-sm text-secondary">Available for Allotment</span>
        </div>

        {/* YTD Returns */}
        <div className="bg-surface-lowest border border-outline-variant rounded-lg p-6 flex flex-col gap-3">
          <span className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
            YTD Returns
          </span>
          <span className="text-[28px] font-bold text-on-surface leading-none tracking-tight">
            11.8%
          </span>
          <span className="text-body-sm text-secondary">Benchmark: 8.5% (MSCI)</span>
        </div>

        {/* Last Report */}
        <div className="bg-surface-lowest border border-outline-variant rounded-lg p-6 flex flex-col gap-3">
          <span className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
            Last Report
          </span>
          <span className="text-[28px] font-bold text-on-surface leading-none tracking-tight">
            31 OCT 2023
          </span>
          <Link
            href="/reports"
            className="text-body-sm font-semibold text-primary hover:opacity-80 transition-opacity"
          >
            Download PDF
          </Link>
        </div>
      </div>

      {/* ── Main section: left tables + right panel ───────────────────────── */}
      <div className="grid grid-cols-[2.5fr_1fr] gap-6 items-start">

        {/* LEFT ─────────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-8">

          {/* Recent Request Status */}
          <div>
            <SectionHeader
              title="Recent Request Status"
              linkLabel="View All Requests"
              linkHref="/portfolio"
            />
            <div className="border border-outline-variant rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-surface-container">
                  <tr>
                    {["Request Type", "Model / Fund", "Submitted", "Status", "Amount"].map((h) => (
                      <th
                        key={h}
                        className="text-left text-label-md font-semibold uppercase tracking-[0.05em] text-secondary px-5 py-3"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-surface-lowest divide-y divide-outline-variant">
                  {REQUESTS.map((r, i) => (
                    <tr key={i}>
                      <td className="px-5 py-[18px] text-body-sm text-on-surface">{r.type}</td>
                      <td className="px-5 py-[18px] text-body-sm text-on-surface">{r.fund}</td>
                      <td className="px-5 py-[18px] text-body-sm text-secondary">{r.submitted}</td>
                      <td className="px-5 py-[18px]">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-5 py-[18px] text-body-sm font-semibold text-on-surface">
                        {r.amount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Monthly EOM Reports */}
          <div>
            <SectionHeader
              title="Monthly EOM Reports"
              linkLabel="View Archive"
              linkHref="/reports"
            />
            <div className="border border-outline-variant rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-surface-container">
                  <tr>
                    {["Report Name", "Period", "Status", "Action"].map((h) => (
                      <th
                        key={h}
                        className="text-left text-label-md font-semibold uppercase tracking-[0.05em] text-secondary px-5 py-3"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-surface-lowest divide-y divide-outline-variant">
                  {EOM_REPORTS.map((r, i) => (
                    <tr key={i}>
                      <td className="px-5 py-[18px]">
                        <span className="flex items-center gap-2.5">
                          <FileText
                            size={16}
                            strokeWidth={1.75}
                            className="shrink-0 text-primary"
                          />
                          <span className="text-body-sm font-medium text-on-surface">
                            {r.name}
                          </span>
                        </span>
                      </td>
                      <td className="px-5 py-[18px] text-body-sm text-secondary">
                        {r.period}
                      </td>
                      <td className="px-5 py-[18px]">
                        <StatusBadge status="FINALIZED" />
                      </td>
                      <td className="px-5 py-[18px]">
                        <button
                          type="button"
                          className="text-primary hover:opacity-70 transition-opacity"
                          aria-label={`Download ${r.name}`}
                        >
                          <Download size={16} strokeWidth={1.75} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* RIGHT ────────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-6">

          {/* Manage Requests — orange card */}
          <div className="bg-primary rounded-lg p-6 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <h2 className="text-headline-md font-bold text-white">Manage Requests</h2>
              <p className="text-body-sm text-white/75 leading-snug">
                Easily submit or track your allotment and redemption intents.
              </p>
            </div>
            <Link
              href="/portfolio"
              className="block text-center border border-white/80 text-white font-bold text-body-sm rounded py-3 px-4 hover:bg-white/10 transition-colors duration-150"
            >
              New Request Initiation
            </Link>
            <p className="text-label-md uppercase tracking-[0.08em] text-white/50 text-center">
              Requires E-Signature
            </p>
          </div>

          {/* Pending Actions */}
          <div>
            <h2 className="text-headline-md font-semibold text-on-surface mb-4">
              Pending Actions
            </h2>
            <div className="flex flex-col gap-3">

              {/* Urgent compliance */}
              <div className="bg-surface-lowest border border-outline-variant rounded-lg p-4 flex items-start gap-3">
                <div className="shrink-0 w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                  <ShieldAlert size={16} strokeWidth={1.75} className="text-primary" />
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <p className="text-body-sm font-semibold text-on-surface">
                    [Urgent] Compliance Required
                  </p>
                  <p className="text-body-sm text-secondary leading-snug">
                    KYC / AML renewal is approaching in{" "}
                    <span className="text-primary font-semibold">10 days</span>
                    , upload as soon as possible!
                  </p>
                </div>
              </div>

              {/* Request review */}
              <div className="bg-surface-lowest border border-outline-variant rounded-lg p-4 flex items-start gap-3">
                <div className="shrink-0 w-9 h-9 rounded-full bg-surface-container flex items-center justify-center">
                  <AlertCircle size={16} strokeWidth={1.75} className="text-secondary" />
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <p className="text-body-sm font-semibold text-on-surface">Request Review</p>
                  <p className="text-body-sm text-secondary leading-snug">
                    Redemption request #RR-429 is under review
                  </p>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* Floating action button */}
      <Link
        href="/portfolio"
        className="fixed bottom-8 right-8 z-10 w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center shadow-overlay hover:opacity-90 transition-opacity"
        aria-label="New request"
      >
        <Plus size={20} strokeWidth={2} />
      </Link>
    </div>
  );
}
