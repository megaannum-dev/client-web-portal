"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import {
  Download,
  UserRoundPlus,
  CalendarClock,
  ChevronRight,
  Inbox,
} from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { RailAccordion } from "@/components/rm/SummaryCard";
import {
  RM_CLIENTS,
  RENEWALS_DUE,
  ONBOARDING_QUEUE,
  REQUEST_TICKETS,
  KNOWN_CLIENT_IDS,
  type SummaryItem,
} from "@/lib/mock/rm-data";

const FILTERS = ["All", "Active", "Pending", "In Review"] as const;
const RM_NAME = "Dana Okafor";

export default function RmDashboardPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  const count = (f: string) => (f === "All" ? RM_CLIENTS.length : RM_CLIENTS.filter((c) => c.status === f).length);
  const filtered = filter === "All" ? RM_CLIENTS : RM_CLIENTS.filter((c) => c.status === filter);

  const openClient = (id: string) => {
    if (KNOWN_CLIENT_IDS.has(id)) router.push(`/rm/clients/${id}`);
  };
  const goSummary = (item: SummaryItem) => openClient(item.id);

  return (
    <div className="mx-auto max-w-[90%]">
      <div className="mb-4">
        <PageHeader
          title="Dashboard"
          subtitle={`Hello, ${RM_NAME} — here's your client book today.`}
          actions={<Button variant="secondary" icon={Download}>Export</Button>}
        />
      </div>

      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-[minmax(0,2.2fr)_minmax(280px,1fr)]">
        {/* Client book */}
        <section className="overflow-hidden rounded-lg border border-outline-variant bg-surface-lowest shadow-card">
          <header className="flex items-center justify-between gap-3 border-b border-outline-variant px-5 py-4">
            <div className="flex items-baseline gap-2.5">
              <h3 className="text-[18px] font-semibold text-on-surface">Client Book</h3>
              <span className="text-[13px] text-secondary">142 active mandates</span>
            </div>
            <Link href="/rm/onboarding-renewal">
              <Button icon={UserRoundPlus}>Onboard new</Button>
            </Link>
          </header>

          {/* Filter pills */}
          <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant px-5 py-3">
            {FILTERS.map((f) => {
              const on = filter === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={clsx(
                    "inline-flex items-center gap-[7px] rounded-full border px-[13px] py-1.5 text-[13px] font-semibold transition-all duration-150",
                    on ? "border-primary bg-primary text-white" : "border-outline-variant bg-white text-secondary",
                  )}
                >
                  {f}
                  <span
                    className={clsx(
                      "rounded-full px-1.5 text-[12px] font-bold",
                      on ? "bg-white/20 text-white" : "bg-surface-container text-secondary",
                    )}
                  >
                    {count(f)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Table */}
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr>
                {["Client", "Mandate", "Status", "AUM", "Renewal"].map((h, i) => (
                  <th
                    key={h}
                    className={clsx(
                      "bg-surface-low px-[18px] py-3 text-[11px] font-bold uppercase tracking-[0.05em] text-secondary",
                      i === 3 ? "text-right" : "text-left",
                    )}
                  >
                    {h}
                  </th>
                ))}
                <th className="w-11 bg-surface-low" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => openClient(r.id)}
                  className="group cursor-pointer transition-colors duration-100 hover:bg-surface-container"
                >
                  <td className="border-t border-outline-variant px-[18px] py-[13px] font-semibold text-on-surface">{r.name}</td>
                  <td className="border-t border-outline-variant px-[18px] py-[13px] text-secondary">{r.mandate}</td>
                  <td className="border-t border-outline-variant px-[18px] py-[13px]"><Chip tone={r.tone}>{r.status}</Chip></td>
                  <td className="border-t border-outline-variant px-[18px] py-[13px] text-right tabular-nums text-on-surface">{r.aum}</td>
                  <td
                    className={clsx(
                      "border-t border-outline-variant px-[18px] py-[13px]",
                      r.renewal === "Overdue" ? "font-semibold text-error" : "text-secondary",
                    )}
                  >
                    {r.renewal.replace(", 2026", "")}
                  </td>
                  <td className="border-t border-outline-variant px-3.5 py-[13px] text-right text-secondary group-hover:text-primary">
                    <ChevronRight size={16} strokeWidth={2} className="ml-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <Pagination from={filtered.length ? 1 : 0} to={filtered.length} total={filter === "All" ? 142 : filtered.length} />
        </section>

        {/* Right rail — accordion, one card open at a time, fills book height */}
        <RailAccordion
          cards={[
            {
              icon: Inbox,
              label: "Requests Tickets",
              value: "7",
              sub: "across 3 types",
              mode: "count",
              items: REQUEST_TICKETS,
              footerLabel: "Review requests",
              onFooter: () => {},
            },
            {
              icon: CalendarClock,
              label: "Renewals Due",
              value: "9",
              sub: "3 overdue",
              subTone: "down",
              items: RENEWALS_DUE,
              onItem: goSummary,
              footerLabel: "View all renewals",
              onFooter: () => router.push("/rm/onboarding-renewal"),
            },
            {
              icon: UserRoundPlus,
              label: "Onboarding",
              value: "6",
              sub: "2 awaiting KYC",
              items: ONBOARDING_QUEUE,
              onItem: goSummary,
              footerLabel: "Go to onboarding",
              onFooter: () => router.push("/rm/onboarding-renewal"),
            },
          ]}
        />
      </div>
    </div>
  );
}

function Pagination({ from, to, total }: { from: number; to: number; total: number }) {
  const Btn = ({ children, on, disabled }: { children: React.ReactNode; on?: boolean; disabled?: boolean }) => (
    <span
      className={clsx(
        "inline-flex h-[30px] min-w-[30px] items-center justify-center rounded-md border px-2 text-[13px] font-semibold",
        on ? "border-primary bg-primary text-white" : "border-outline-variant bg-white",
        !on && (disabled ? "text-outline-variant" : "text-secondary"),
      )}
    >
      {children}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-outline-variant px-[18px] py-3.5">
      <span className="text-[13px] text-secondary">
        Showing <b className="text-on-surface">{from}–{to}</b> of {total} clients
      </span>
      <div className="flex items-center gap-1.5">
        <Btn disabled>‹ Prev</Btn>
        <Btn on>1</Btn>
        <Btn>2</Btn>
        <Btn>3</Btn>
        <span className="px-0.5 text-secondary">…</span>
        <Btn>18</Btn>
        <Btn>Next ›</Btn>
      </div>
    </div>
  );
}
