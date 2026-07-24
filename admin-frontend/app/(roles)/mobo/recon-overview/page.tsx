"use client";

/* ============================================================
   MOBO Dashboard — operations control tower
   Ported from the design handoff (MoboDashboard.jsx).
   ============================================================ */

import { useRouter } from "next/navigation";
import {
  CalendarDays, ArrowLeftRight, Inbox, Link2, Unlink, ShieldAlert,
  ArrowRight, FileText, Lock,
} from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { MetricStat, SegBar } from "@/components/mobo/Shared";
import { loadReconciliation } from "@/lib/mobo/reconciliation";

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-[7px] text-[12.5px] text-secondary">
      <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: color }} />
      {label} <b className="tabular-nums text-on-surface">{value}</b>
    </span>
  );
}

const CARD = "rounded-2xl border border-outline-variant bg-surface-lowest shadow-card";

export default function MoboDashboardPage() {
  const router = useRouter();

  // SINGLE SOURCE: every figure on this page is read from the same bundle the
  // recon screen consumes, so the dashboard and recon never disagree.
  const { settleDay, counters, exceptions } = loadReconciliation();

  const openBreaks = counters.breaks + counters.unmatched;
  const carriedExceptions = exceptions.filter((e) => e.carried).length;

  // Today's-reconciliation bar segments, derived from the single-source counts
  // (matched / breaks / unmatched) so the bar matches the legend below it. Each
  // segment is its own proportion (same method as the recon screen), so the
  // Breaks segment width tracks the Breaks count instead of absorbing rounding.
  const segTotal = counters.reconciled || 1;
  const pct = (n: number) => Math.round((n / segTotal) * 100);
  const segOk = pct(counters.matched);
  const segWarn = pct(counters.breaks);
  const segBad = pct(counters.unmatched);

  const goRecon = () => router.push("/mobo/trade-reconciliation");
  const goExceptions = () => router.push("/mobo/daily-exception-report");

  return (
    <div className="w-full">
      <div className="mb-7">
        <PageHeader
          title="Dashboard"
          subtitle={`Middle & back office · Settlement day ${settleDay}`}
          actions={
            <>
              <Button variant="secondary" icon={CalendarDays}>24 July 2026</Button>
              <Button icon={ArrowLeftRight} onClick={goRecon}>Run reconciliation</Button>
            </>
          }
        />
      </div>

      {/* four counters */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricStat label="Trades to reconcile" value={counters.reconciled.toLocaleString("en-US")} icon={Inbox} />
        <MetricStat label="Auto-matched" value={counters.autoMatchedPct} sub={counters.matched.toLocaleString("en-US")} tone="ok" icon={Link2} />
        <MetricStat label="Open breaks" value={openBreaks} sub={`${counters.breaks} field · ${counters.unmatched} unmatched`} tone="warn" icon={Unlink} onClick={goRecon} />
        <MetricStat label="Open exceptions" value={exceptions.length} sub={`${carriedExceptions} carried fwd`} tone="bad" icon={ShieldAlert} onClick={goExceptions} />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        {/* LEFT column */}
        <div className="flex flex-col gap-6">
          {/* Today's reconciliation */}
          <section className={`${CARD} px-5 pb-5 pt-[18px]`}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[17px] font-semibold text-on-surface">Today&apos;s reconciliation</h3>
              <Chip tone="warm" dot={false}>In progress</Chip>
            </div>
            <SegBar ok={segOk} warn={segWarn} bad={segBad} />
            <div className="mt-3.5 flex flex-wrap items-center gap-[18px]">
              <Legend color="#3f9d63" label="Matched" value={counters.matched.toLocaleString("en-US")} />
              <Legend color="#e0922f" label="Breaks" value={String(counters.breaks)} />
              <Legend color="#d3654f" label="Unmatched" value={String(counters.unmatched)} />
              <button
                type="button"
                onClick={goRecon}
                className="ml-auto flex items-center gap-[5px] text-[13px] font-bold text-primary hover:opacity-75"
              >
                Continue reconciliation <ArrowRight size={15} strokeWidth={2} />
              </button>
            </div>
          </section>
        </div>

        {/* RIGHT column */}
        <div className="flex flex-col gap-6">
          {/* End-of-day report */}
          <section className={`${CARD} px-5 pb-5 pt-[18px]`}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[17px] font-semibold text-on-surface">End-of-day report</h3>
              <Chip tone="warm" dot={false}>Draft</Chip>
            </div>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13.5px] text-secondary">Breaks outstanding</span>
              <span className="text-[18px] font-bold text-on-surface">{openBreaks}</span>
            </div>
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[13.5px] text-secondary">Yesterday</span>
              <Chip tone="active" dot={false}>Signed off</Chip>
            </div>
            <div className="flex gap-2.5">
              <Button variant="secondary" icon={FileText} full onClick={goExceptions}>Preview</Button>
              <Button icon={Lock} full disabled>Sign off</Button>
            </div>
            <p className="mt-3 text-[11.5px] leading-[1.45] text-secondary">
              Sign-off unlocks when open breaks reach zero.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
