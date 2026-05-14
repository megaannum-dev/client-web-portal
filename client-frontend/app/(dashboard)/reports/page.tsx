import Link from "next/link";
import {
  UserSearch,
  ClipboardCheck,
  Lock,
  FileText,
  Download,
  ChevronRight,
} from "@/lib/icons";

// ── Data ──────────────────────────────────────────────────────────────────────

const EOM_REPORTS = [
  { name: "End-of-Month Portfolio Summary", period: "October 2023",   generated: "Nov 01, 2023" },
  { name: "End-of-Month Portfolio Summary", period: "September 2023", generated: "Oct 01, 2023" },
  { name: "End-of-Month Portfolio Summary", period: "August 2023",    generated: "Sep 01, 2023" },
  { name: "End-of-Month Portfolio Summary", period: "July 2023",      generated: "Aug 01, 2023" },
];

const COMPLIANCE_HISTORY = [
  {
    date: "Oct 12, 2023",
    docType: "Proof of Residency (KYC)",
    status: "Processing" as const,
    reviewer: "Sarah Jenkins (Compliance)",
  },
  {
    date: "Aug 05, 2023",
    docType: "Institutional AML Declaration",
    status: "Verified" as const,
    reviewer: "Robert Chen (Auditor)",
  },
  {
    date: "May 19, 2023",
    docType: "Beneficial Ownership Disclosure",
    status: "Verified" as const,
    reviewer: "Sarah Jenkins (Compliance)",
  },
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
      <div>
        <h1 className="text-headline-xl font-bold text-on-surface tracking-tight">Reports</h1>
        <p className="mt-1 text-body-lg text-secondary">
          Manage compliance documents and monthly financial reports with automated tracking and
          historical audit trails.
        </p>
      </div>

      {/* ── Compliance upload cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-5">

        {/* KYC — urgent */}
        <div className="bg-surface-lowest border border-red-200 rounded-lg p-6 flex flex-col gap-5">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
            <UserSearch size={22} strokeWidth={1.75} className="text-red-600" />
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-headline-md font-bold text-on-surface">KYC Document Upload</h2>
            <p className="text-body-sm text-secondary leading-snug">
              Submit and verify latest Know Your Customer documentation. Accepted formats: PDF,
              PNG, JPG (Max 10MB per file).
            </p>
          </div>
          <div className="border-t border-outline-variant pt-4 flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
                Requirement
              </span>
              <span className="text-body-sm text-on-surface">
                Annual Update Due:{" "}
                <span className="text-red-600 font-semibold">25 Oct 2023</span>
              </span>
            </div>
            <button
              type="button"
              className="shrink-0 bg-primary text-white font-bold text-body-sm rounded px-5 py-2.5 hover:opacity-90 transition-opacity"
            >
              Upload KYC
            </button>
          </div>
        </div>

        {/* AML — locked */}
        <div className="bg-surface-lowest border border-outline-variant rounded-lg p-6 flex flex-col gap-5">
          <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center">
            <ClipboardCheck size={22} strokeWidth={1.75} className="text-primary" />
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-headline-md font-bold text-on-surface">AML Document Upload</h2>
            <p className="text-body-sm text-secondary leading-snug">
              Update Anti-Money Laundering compliance files for the current quarterly audit cycle
              to ensure uninterrupted service.
            </p>
          </div>
          <div className="border-t border-outline-variant pt-4 flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-label-md font-semibold uppercase tracking-[0.05em] text-secondary">
                Status
              </span>
              <span className="text-body-sm text-on-surface">Pending Review</span>
            </div>
            <button
              type="button"
              disabled
              className="shrink-0 bg-surface-container text-secondary font-bold text-body-sm rounded px-5 py-2.5 cursor-not-allowed flex items-center gap-2 opacity-75"
            >
              <Lock size={13} strokeWidth={2} />
              Upload Locked
            </button>
          </div>
        </div>
      </div>

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
                  { label: "Actions",          right: true  },
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
                  <td className="px-6 py-[18px] text-right">
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

      {/* ── Compliance Renewal History ────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-headline-md font-semibold text-on-surface">
            Compliance Renewal History
          </h2>
          <button
            type="button"
            className="flex items-center gap-1.5 border border-outline-variant rounded px-3 py-2 text-body-sm font-semibold text-secondary hover:bg-surface-container transition-colors duration-150"
          >
            <Download size={14} strokeWidth={1.75} />
            Export CSV
          </button>
        </div>

        <div className="border border-outline-variant rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-container">
              <tr>
                {[
                  { label: "Date",          right: false },
                  { label: "Document Type", right: false },
                  { label: "Status",        right: false },
                  { label: "Reviewer",      right: false },
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
            <tbody className="bg-surface-lowest divide-y divide-outline-variant">
              {COMPLIANCE_HISTORY.map((r, i) => (
                <tr key={i} className="hover:bg-surface-container/40 transition-colors duration-100">
                  <td className="px-6 py-[18px] text-body-sm font-medium text-on-surface">
                    {r.date}
                  </td>
                  <td className="px-6 py-[18px] text-body-sm text-on-surface">{r.docType}</td>
                  <td className="px-6 py-[18px]">
                    <ComplianceBadge status={r.status} />
                  </td>
                  <td className="px-6 py-[18px] text-body-sm text-secondary">{r.reviewer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
