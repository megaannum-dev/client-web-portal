"use client";

/* ============================================================
   MOBO Dashboard — operations control tower
   Ported from the design handoff (MoboDashboard.jsx).
   ============================================================ */

import { useRouter } from "next/navigation";
import {
  CalendarDays, ArrowLeftRight, Inbox, Link2, Unlink, Receipt,
  ArrowRight, ChevronRight, FileText, Lock,
} from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { MetricStat, SegBar, SysBadge } from "@/components/mobo/Shared";
import { useReconciliation } from "@/lib/mobo/reconciliation";
import { loadCommissions, computeFeeTotals, fmtFeeShort } from "@/lib/mobo/commissions";
import type { ReconTrade } from "@/lib/mobo/types";
import { useCanEdit } from "@/hooks/usePageAccess";

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-[7px] text-[12.5px] text-secondary">
      <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: color }} />
      {label} <b className="tabular-nums text-on-surface">{value}</b>
    </span>
  );
}

/* ---- broken-trade row helpers (ported from MoboDashboard.jsx) --- */
const MARKET_LABEL: Record<string, string> = { US: "NYSE / NASDAQ", LN: "LSE" };
function marketFor(inst: string): string {
  if (inst.includes("/")) return "FX";
  const suf = inst.split(" ").pop() ?? "";
  return MARKET_LABEL[suf] || suf;
}
function stockFor(inst: string): string {
  return inst.includes("/") ? inst : inst.split(" ")[0];
}
function qtyFor(ls: string | null): string {
  if (!ls) return "—";
  const parts = ls.replace(/\{\/?b\}/g, "").split("·").map((s) => s.trim());
  return (parts[1] || "—").split("@")[0].trim() || "—";
}
function sysForTrade(t: ReconTrade): "CRM" | "IB" | "PC" {
  if (!t.ib) return "IB";
  if (!t.crm) return "PC";
  if (t.ti.state !== "ok") return "IB";
  if (t.ic.state !== "ok") return "PC";
  return "CRM";
}

function ExcRow({ t, settleDay, onClick }: { t: ReconTrade; settleDay: string; onClick: () => void }) {
  return (
    <tr
      onClick={onClick}
      className="cursor-pointer transition-colors duration-100 hover:bg-surface-container [&>td]:border-t [&>td]:border-outline-variant"
    >
      <td className="px-[18px] py-3"><SysBadge sys={sysForTrade(t)} /></td>
      <td className="px-[18px] py-3 text-on-surface">{settleDay}</td>
      <td className="px-[18px] py-3 text-secondary">{marketFor(t.inst)}</td>
      <td className="px-[18px] py-3 font-bold text-on-surface">{stockFor(t.inst)}</td>
      <td className="px-[18px] py-3 text-right tabular-nums text-on-surface">{qtyFor(t.ti.ls)}</td>
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

  // SINGLE SOURCE: every figure on this page is read from the same bundle the
  // recon screen consumes, so the dashboard and recon never disagree.
  const { data, loading, error } = useReconciliation();
  // Empty today — the fee seam has no source wired, so this tile reads $0.
  const { month: feeMonth, rows: feeRows } = loadCommissions();
  const { totalBillable } = computeFeeTotals(feeRows);

  // ponytail: minimal inline loading/error states — FE-13 replaces these with
  // a shared RouteSkeleton once it lands for this route.
  if (loading) {
    return <div className="w-full py-16 text-center text-secondary">Loading…</div>;
  }
  if (error || !data) {
    return (
      <div className="w-full py-16 text-center text-secondary">
        {error ?? "No data"}
      </div>
    );
  }
  const { settleDay, counters, trades } = data;

  const openBreaks = counters.breaks + counters.unmatched;
  const brokenTrades = trades.filter((t) => t.ti.state !== "ok" || t.ic.state !== "ok");
  const top = brokenTrades.slice(0, 5);

  // Today's-reconciliation bar segments, derived from the single-source counts
  // (matched / breaks / unmatched) so the bar matches the legend below it. Each
  // segment is its own proportion (same method as the recon screen), so the
  // Breaks segment width tracks the Breaks count instead of absorbing rounding.
  // Nothing to reconcile reads as fully matched (100%), not an empty/0% bar.
  const pct = (n: number) => Math.round((n / counters.reconciled) * 100);
  const segOk = counters.reconciled > 0 ? pct(counters.matched) : 100;
  const segWarn = counters.reconciled > 0 ? pct(counters.breaks) : 0;
  const segBad = counters.reconciled > 0 ? pct(counters.unmatched) : 0;

  const goRecon = () => router.push("/mobo/trade-reconciliation");
  const goCommissions = () => router.push("/mobo/commission-tracking");

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
                  {["System", "Trade Date", "Market", "Stock", "Quantity", ""].map((h, i) => (
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
                {top.map((t) => (
                  <ExcRow key={t.id} t={t} settleDay={settleDay} onClick={goRecon} />
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
