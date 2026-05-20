"use client";

import Link from "next/link";
import { FileText, Download, ChevronRight } from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { downloadAs } from "@/lib/downloadFile";
import { MOCK_EOM_REPORTS } from "@/lib/mock/data";

// ── Constants ─────────────────────────────────────────────────────────────────

const EOM_COLUMNS = [
  { label: "Report Name",      right: false, center: false },
  { label: "Reporting Period", right: false, center: false },
  { label: "Generated Date",   right: false, center: false },
  { label: "Actions",          right: false, center: true },
] as const;

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
                {EOM_COLUMNS.map(({ label, right, center }) => (
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
              {MOCK_EOM_REPORTS.map((r, i) => (
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
                      onClick={() => downloadAs("/dummy-EoM-Report.pdf", r.name)}
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
      </section>
    </div>
  );
}
