"use client";

/* ============================================================
   MOBO Dashboard — operations control tower
   Ported from the design handoff (MoboDashboard.jsx).

   DATA: the same `GET /api/mobo/executions` tree the recon screen
   reads, folded by `mapExecutions`, so the two screens cannot
   disagree. This page is quick facts only, so it pins the day to
   TODAY's ET session date rather than following the latest day
   that happens to carry rows — an empty day is a real answer here.
   ============================================================ */

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays, ArrowLeftRight, Inbox, Link2, Unlink, Receipt,
  ArrowRight, ChevronRight, FileText, Lock,
} from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { MetricStat, SegBar, SystemCell } from "@/components/mobo/Shared";
import { useExecutions } from "@/hooks/api/useExecutions";
import { etToday, fmtDayLabel, mapExecutions, type ReconNode } from "@/lib/mobo/executions";
import { loadCommissions, computeFeeTotals, fmtFeeShort } from "@/lib/mobo/commissions";
import { useCanEdit } from "@/hooks/usePageAccess";
import ReconOverviewSkeleton from "./Skeleton";

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-[7px] text-[12.5px] text-secondary">
      <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: color }} />
      {label} <b className="tabular-nums text-on-surface">{value}</b>
    </span>
  );
}

/* ---- one exception row -------------------------------------
   Every cell is a pre-formatted string off the ReconNode — `mapExecutions`
   already did the formatting, so this page does none of its own. */
function ExcRow({ t, onClick }: { t: ReconNode; onClick: () => void }) {
  return (
    <tr
      onClick={onClick}
      className="cursor-pointer transition-colors duration-100 hover:bg-surface-container [&>td]:border-t [&>td]:border-outline-variant"
    >
      <td className="px-[18px] py-3"><SystemCell node={t} /></td>
      <td className="px-[18px] py-3 font-bold text-on-surface">{t.descrpt}</td>
      <td className="px-[18px] py-3 text-on-surface">{t.tradeDate}</td>
      <td className="px-[18px] py-3 text-secondary">{t.direction}</td>
      <td className="px-[18px] py-3 text-right tabular-nums text-on-surface">{t.qty}</td>
      <td className="px-[18px] py-3">
        {/* A trade is only ever "Break" or "Matched"; split the break in two so
            a one-sided trade reads as the gap it is, not a field mismatch. */}
        <Chip dot={false} tone={t.hasMissing ? "failed" : "warm"}>
          {t.hasMissing ? "Missing" : "Break"}
        </Chip>
      </td>
      <td className="px-[18px] py-3 text-right text-secondary">
        <ChevronRight size={16} strokeWidth={2} className="inline" />
      </td>
    </tr>
  );
}

const CARD = "rounded-2xl border border-outline-variant bg-surface-lowest shadow-card";

export default function MoboDashboardPage() {
  const router = useRouter();
  const canEdit = useCanEdit("mobo.recon-overview");

  // SINGLE SOURCE: the same day's tree the recon screen reads, so the dashboard
  // and recon never disagree. The day is pinned at mount so a session that
  // straddles ET midnight doesn't silently re-fetch under the reader.
  const day = useMemo(etToday, []);
  const { data, loading, error } = useExecutions(day);
  const trades = useMemo(() => mapExecutions(data), [data]);
  // Empty today — the fee seam has no source wired, so this tile reads $0.
  const { month: feeMonth, rows: feeRows } = loadCommissions();
  const { totalBillable } = computeFeeTotals(feeRows);

  if (loading && !data) return <ReconOverviewSkeleton />;
  if (error || !data) {
    return (
      <div className="w-full py-16 text-center text-secondary">
        {error ?? "No data"}
      </div>
    );
  }
  const dayLabel = fmtDayLabel(data.day ?? day);

  // Counts are per TRADE and read the ROLLED-UP flags, so a trade still reads
  // as broken when only a nested fill disagrees. Same expressions as the recon
  // page, which is what keeps the two screens' headline numbers identical.
  const top = trades.filter((t) => t.hasBreak || t.hasMissing);
  const openBreaks = top.length;
  const missingN = trades.filter((t) => t.hasMissing).length;
  const breakN = openBreaks - missingN;
  const matchedN = trades.length - openBreaks;

  // Today's-reconciliation bar segments, on the same denominator as the legend
  // below it. Nothing to reconcile reads as fully matched (100%), not an
  // empty/0% bar — an empty book has no unmatched trades left.
  const total = trades.length || 1;
  const matchedPct = trades.length > 0 ? (matchedN / total) * 100 : 100;
  const segBad = Math.round((missingN / total) * 100);
  const segWarn = Math.round((breakN / total) * 100);
  const segOk = 100 - segBad - segWarn; // absorbs the rounding so the bar fills

  const goRecon = () => router.push("/mobo/trade-reconciliation");
  const goCommissions = () => router.push("/mobo/commission-tracking");

  return (
    <div className="w-full">
      <div className="mb-7">
        <PageHeader
          title="Dashboard"
          subtitle={`Middle & back office · Settlement day ${dayLabel}`}
          actions={
            <>
              <Button variant="secondary" icon={CalendarDays}>{dayLabel}</Button>
              <Button icon={ArrowLeftRight} onClick={goRecon}>Run reconciliation</Button>
            </>
          }
        />
      </div>

      {/* four counters */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricStat label="Trades to reconcile" value={trades.length.toLocaleString("en-US")} icon={Inbox} />
        <MetricStat label="Auto-matched" value={`${matchedPct.toFixed(1)}%`} sub={matchedN.toLocaleString("en-US")} tone="ok" icon={Link2} />
        <MetricStat label="Open breaks" value={openBreaks} sub={`${breakN} field · ${missingN} missing`} tone="warn" icon={Unlink} onClick={goRecon} />
        <MetricStat label={`Fees billable · ${feeMonth}`} value={fmtFeeShort(totalBillable)} sub="management + incentive" icon={Receipt} onClick={goCommissions} />
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
              <Legend color="#3f9d63" label="Matched" value={matchedN.toLocaleString("en-US")} />
              <Legend color="#e0922f" label="Breaks" value={String(breakN)} />
              <Legend color="#d3654f" label="Missing" value={String(missingN)} />
              <button
                type="button"
                onClick={goRecon}
                className="ml-auto flex items-center gap-[5px] text-[13px] font-bold text-primary hover:opacity-75"
              >
                Continue reconciliation <ArrowRight size={15} strokeWidth={2} />
              </button>
            </div>
          </section>

          {/* Open exceptions */}
          <section className={`${CARD} overflow-hidden`}>
            <header className="flex items-center justify-between border-b border-outline-variant px-5 py-4">
              <h3 className="text-[17px] font-semibold text-on-surface">Open exceptions</h3>
              <button
                type="button"
                onClick={goRecon}
                className="text-[13px] font-bold text-primary hover:opacity-75"
              >
                View report →
              </button>
            </header>
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr>
                  {["System", "Description", "Trade Date", "Buy/Sell", "Quantity", "Status", ""].map((h, i) => (
                    <th
                      key={i}
                      className={`bg-surface-low px-[18px] py-2.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-secondary ${i === 4 ? "text-right" : "text-left"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {top.length === 0 && (
                  <tr>
                    <td colSpan={7} className="border-t border-outline-variant px-[18px] py-12 text-center text-[13px] text-secondary">
                      {trades.length === 0
                        ? `No trades for ${dayLabel}.`
                        : `No exceptions — all ${trades.length.toLocaleString("en-US")} trades reconciled.`}
                    </td>
                  </tr>
                )}
                {top.slice(0, 5).map((t) => (
                  <ExcRow key={t.ref} t={t} onClick={goRecon} />
                ))}
              </tbody>
            </table>
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
              {/* ponytail: the prototype points this at a new MOBO "Monthly Reports"
                  (EOD-aggregation) screen — out of this task's scope. Redirect to the
                  existing shared Monthly Reports page instead. */}
              <Button variant="secondary" icon={FileText} full onClick={() => router.push("/monthly-reports")}>Preview</Button>
              {/* View/Edit Gate Function */}
              {canEdit && <Button icon={Lock} full disabled>Sign off</Button>}
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
