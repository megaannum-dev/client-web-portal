"use client";

import { useState } from "react";
import Link from "next/link";
import { downloadAs } from "@/lib/downloadFile";
import {
  TrendingUp,
  ChevronRight,
  Download,
  FileText,
  Plus,
} from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard }   from "@/components/ui/StatCard";
import { EyeToggle }  from "@/components/ui/EyeToggle";
import { useLatestEvents } from "@/lib/hooks/useLatestEvents";
import { useAllotmentRequests } from "@/lib/hooks/useAllotmentRequests";
import { LEVEL_CONFIG } from "@/lib/levelConfig";
import {
  MOCK_ALLOTMENT_REQUESTS,
  MOCK_EOM_REPORTS,
  MOCK_PORTFOLIO_STATS,
} from "@/lib/mock/data";

const STATUS_BADGE: Record<"Processing" | "Completed" | "Finalized", string> = {
  Processing: "badge-caution",
  Completed:  "badge-success",
  Finalized:  "badge-success",
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: keyof typeof STATUS_BADGE }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${STATUS_BADGE[status]}`}>
      {status}
    </span>
  );
}

function SectionHeader({ title, linkLabel, linkHref }: { title: string; linkLabel: string; linkHref: string }) {
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
  const [censored, setCensored] = useState(true);
  const latestEvents = useLatestEvents().slice(0, 3);
  const { dynamic: dynamicRequests } = useAllotmentRequests();
  const recentRequests = [...dynamicRequests, ...MOCK_ALLOTMENT_REQUESTS].slice(0, 3);
  const recentReports  = MOCK_EOM_REPORTS.slice(0, 4);
  const stats = MOCK_PORTFOLIO_STATS;
  const mask = (v: string) => (censored ? "********" : v);

  return (
    <div className="flex flex-col gap-8 pb-20">

      <PageHeader
        title="External Client Dashboard"
        subtitle="Global Opportunities Fund • Portfolio ID: #AT-8842"
      />

      {/* ── Stat cards ───────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-headline-md font-semibold text-on-surface">Account Summary</h2>
          <EyeToggle censored={censored} onToggle={() => setCensored((v) => !v)} />
        </div>

        <div className="grid grid-cols-4 gap-4">
          <StatCard
            label="Total Portfolio Value"
            value={mask(stats.totalValue)}
            sub={
              <span className="flex items-center gap-1.5 text-body-sm font-semibold text-primary">
                <TrendingUp size={14} strokeWidth={2} />
                {stats.ytdChange} vs Last Month
              </span>
            }
          />
          <StatCard
            label="Cash on Hand"
            value={mask(stats.cashBalance)}
            sub={<span className="text-body-sm text-secondary">Available for Allotment</span>}
          />
          <StatCard
            label="YTD Returns"
            value={mask(stats.ytdReturns)}
            sub={<span className="text-body-sm text-secondary">Benchmark: {stats.benchmark}</span>}
          />
          <StatCard
            label="Last Report"
            value={stats.lastReportDate}
            sub={
              <button
                type="button"
                onClick={() => downloadAs("/dummy-EoM-Report.pdf", MOCK_EOM_REPORTS[0].name)}
                className="flex text-body-sm font-semibold text-primary hover:opacity-80 transition-opacity"
              >
                Download PDF
              </button>
            }
          />
        </div>
      </div>

      {/* ── Main section: left tables + right panel ───────────────────────── */}
      <div className="grid grid-cols-[3fr_minmax(300px,1fr)] gap-6 items-start">

        {/* LEFT ─────────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-8">

          {/* Recent Request Status */}
          <div>
            <SectionHeader title="Recent Request Status" linkLabel="View All Requests" linkHref="/portfolio" />
            <div className="border border-outline-variant rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-surface-container">
                  <tr>
                    {["Request Type", "Model / Fund", "Submitted", "Status", "Amount"].map((h) => (
                      <th key={h} className="text-left text-label-md font-semibold uppercase tracking-[0.05em] text-secondary px-5 py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-surface-lowest divide-y divide-outline-variant">
                  {recentRequests.map((r) => (
                    <tr key={r.id}>
                      <td className="px-5 py-[18px] text-body-sm text-on-surface">{r.type}</td>
                      <td className="px-5 py-[18px] text-body-sm text-on-surface">{r.model}</td>
                      <td className="px-5 py-[18px] text-body-sm text-secondary">{r.date}</td>
                      <td className="px-5 py-[18px]"><StatusBadge status={r.status} /></td>
                      <td className="px-5 py-[18px] text-body-sm font-semibold text-on-surface">{r.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Monthly EOM Reports */}
          <div>
            <SectionHeader title="Monthly EOM Reports" linkLabel="View Archive" linkHref="/reports" />
            <div className="border border-outline-variant rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-surface-container">
                  <tr>
                    {["Report Name", "Period", "Status", "Action"].map((h) => (
                      <th key={h} className="text-left text-label-md font-semibold uppercase tracking-[0.05em] text-secondary px-5 py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-surface-lowest divide-y divide-outline-variant">
                  {recentReports.map((r) => (
                    <tr key={r.name}>
                      <td className="px-5 py-[18px]">
                        <span className="flex items-center gap-2.5">
                          <FileText size={16} strokeWidth={1.75} className="shrink-0 text-primary" />
                          <span className="text-body-sm font-medium text-on-surface">{r.name}</span>
                        </span>
                      </td>
                      <td className="px-5 py-[18px] text-body-sm text-secondary">{r.range}</td>
                      <td className="px-5 py-[18px]"><StatusBadge status="Finalized" /></td>
                      <td className="px-5 py-[18px]">
                        <button type="button" onClick={() => downloadAs("/dummy-EoM-Report.pdf", r.name)} className="text-primary hover:opacity-70 transition-opacity" aria-label={`Download ${r.name}`}>
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

          <div>
            <h2 className="text-headline-md font-semibold text-on-surface mb-4">Latest Events</h2>
            <div className="flex flex-col gap-3">
              {latestEvents.map((event) => {
                const { card, icon, title, Icon } = LEVEL_CONFIG[event.level];
                const cardContent = (
                  <>
                    <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${icon}`}>
                      <Icon size={16} strokeWidth={1.75} />
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <p className={`text-body-sm font-semibold ${title}`}>{event.title}</p>
                      <p className="text-body-sm text-secondary leading-snug">{event.description}</p>
                    </div>
                  </>
                );
                const baseClass = `border rounded-lg p-4 flex items-start gap-3 ${card}`;
                return event.href ? (
                  <Link key={event.id} href={event.href} className={`${baseClass} hover:opacity-80 transition-opacity cursor-pointer`}>
                    {cardContent}
                  </Link>
                ) : (
                  <div key={event.id} className={baseClass}>
                    {cardContent}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="h-px bg-outline-variant" />

          <div className="bg-primary rounded-lg p-6 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <h2 className="text-headline-md font-bold text-white">Manage Requests</h2>
              <p className="text-body-sm text-white/75 leading-snug">
                Easily submit or track your allotment and redemption intents.
              </p>
            </div>
            <Link
              href="/portfolio#allotted-models"
              className="block text-center border border-white/80 text-white font-bold text-body-sm rounded py-3 px-4 hover:bg-white/10 transition-colors duration-150"
            >
              New Request Initiation
            </Link>
            <p className="text-label-md uppercase tracking-[0.08em] text-white/50 text-center">
              Requires E-Signature
            </p>
          </div>
        </div>
      </div>

      {/* Floating Action Button */}
      {/* <Link
        href="/portfolio"
        className="fixed bottom-8 right-8 z-10 w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center shadow-overlay hover:opacity-90 transition-opacity"
        aria-label="New request"
      >
        <Plus size={20} strokeWidth={2} />
      </Link> */}
    </div>
  );
}
