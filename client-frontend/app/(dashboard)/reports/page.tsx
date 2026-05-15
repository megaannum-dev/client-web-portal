import Link from "next/link";
import { FileText, Download, ChevronRight } from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";

// ── Data ──────────────────────────────────────────────────────────────────────

const EOM_REPORTS = [
  { name: "End-of-Month Portfolio Summary", period: "October 2023",   generated: "Nov 01, 2023" },
  { name: "End-of-Month Portfolio Summary", period: "September 2023", generated: "Oct 01, 2023" },
  { name: "End-of-Month Portfolio Summary", period: "August 2023",    generated: "Sep 01, 2023" },
  { name: "End-of-Month Portfolio Summary", period: "July 2023",      generated: "Aug 01, 2023" },
  { name: "End-of-Month Portfolio Summary", period: "June 2023",      generated: "July 01, 2023" },
  { name: "End-of-Month Portfolio Summary", period: "May 2023",      generated: "June 01, 2023" },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function ComplianceBadge({ status }: { status: "Processing" | "Verified" }) {
  const dot  = status === "Processing" ? "bg-orange-400"  : "bg-green-500";
  const pill = status === "Processing"
    ? "bg-orange-100 text-orange-700 border border-orange-200"
    : "bg-green-100  text-green-700  border border-green-200";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      {status}
    </span>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-8 pb-8">

      {/* Page header */}
      <PageHeader
        title="Reports"
        subtitle="Access your monthly financial reports and review compliance renewal history."
      />

      {/* ── Historical EOM Reports ────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-headline-md font-semibold text-on-surface">Historical EOM Reports</h2>
          <Link
            href="#"
            className="flex items-center gap-0.5 text-label-md font-semibold uppercase tracking-[0.05em] text-primary hover:opacity-80 transition-opacity"
          >
            View All Documents
            <ChevronRight size={13} strokeWidth={2.5} />
          </Link>
        </div>

        <div className="border border-outline-variant rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-container">
              <tr>
                {[
                  { label: "Report Name",      right: false },
                  { label: "Reporting Period", right: false },
                  { label: "Generated Date",   right: false },
                  { label: "Actions",          right: false, center: true },
                ].map(({ label, right, center }) => (
                  <th
                    key={label}
                    className={`px-6 py-3 border-b border-outline-variant text-label-md font-semibold uppercase tracking-[0.05em] text-secondary${right ? " text-right" : center ? " text-center" : ""}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-surface-lowest divide-y divide-outline-variant">
              {EOM_REPORTS.map((r, i) => (
                <tr key={i} className="hover:bg-surface-container/40 transition-colors duration-100">
                  <td className="px-6 py-[18px]">
                    <span className="flex items-center gap-2.5">
                      <FileText size={16} strokeWidth={1.75} className="shrink-0 text-primary" />
                      <span className="text-body-sm font-medium text-on-surface">{r.name}</span>
                    </span>
                  </td>
                  <td className="px-6 py-[18px] text-body-sm text-secondary">{r.period}</td>
                  <td className="px-6 py-[18px] text-body-sm text-secondary">{r.generated}</td>
                  <td className="px-6 py-[18px] text-center">
                    <button
                      type="button"
                      className="text-primary hover:opacity-70 transition-opacity"
                      aria-label={`Download ${r.period} report`}
                    >
                      <Download size={16} strokeWidth={1.75} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
