"use client";

/* ============================================================
   MOBO Commissions Tracking — monthly fee book
   Ported from the design handoff (mobo/mobo-app/MoboCommissions.jsx).
   A flat client × model fee sheet; each row expands into its
   management-fee / incentive-fee calculation breakdown.

   DATA SEAM: reads `loadCommissions()` / `computeFeeTotals()` from
   lib/mobo/commissions.ts — no backend calls, no mock imports here.
   ============================================================ */

import { Fragment, useState } from "react";
import {
  Percent, TrendingUp, Receipt, ShieldAlert, ChevronRight,
  CalendarDays, FileText, Download, Check,
} from "@/lib/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { MetricStat, SegBar } from "@/components/mobo/Shared";
import {
  loadCommissions, computeFeeTotals, fmtFee, fmtFeeShort, type FeeRow,
} from "@/lib/mobo/commissions";

const FEE_STATUS: Record<FeeRow["status"], { label: string; tone: ChipTone }> = {
  paid: { label: "Paid", tone: "active" },
  invoiced: { label: "Invoiced", tone: "pending" },
  accrued: { label: "Accrued", tone: "warm" },
};

/* ---- fee calculation card — header, line items, highlighted result --- */
function CalcCard({
  title, note, lines, result, resultLabel,
}: {
  title: string;
  note?: string;
  lines: { k: string; v: string; tone?: string; em?: boolean }[];
  result: string;
  resultLabel: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-lowest">
      <div className="flex items-center justify-between gap-2.5 border-b border-outline-variant bg-surface-low px-3.5 py-[9px]">
        <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">{title}</span>
        {note && <span className="text-[11px] font-semibold text-secondary">{note}</span>}
      </div>
      <div className="px-3.5 py-1">
        {lines.map((l, i) => (
          <div
            key={i}
            className={`flex items-baseline justify-between gap-4 py-[7px] ${i ? "border-t border-outline-variant" : ""}`}
          >
            <span className="text-[12.5px] font-semibold text-secondary">{l.k}</span>
            <span
              className={`text-[13px] tabular-nums ${l.em ? "font-bold" : "font-semibold"}`}
              style={{ color: l.tone || "var(--on-surface)" }}
            >
              {l.v}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-baseline justify-between gap-4 border-t border-outline-variant bg-surface-low px-3.5 py-[11px]">
        <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">{resultLabel}</span>
        <span className="text-[17px] font-bold tabular-nums text-on-surface">{result}</span>
      </div>
    </div>
  );
}

/* ---- expanded row: management + incentive fee calc side by side --- */
function FeeBreakdown({ r, month }: { r: FeeRow; month: string }) {
  const noInc = r.gain <= 0;
  return (
    <div className="border-t border-outline-variant bg-surface-low px-[18px] py-4">
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <CalcCard
          title="Management fee"
          note={`${month} · 31 / 31 days accrued`}
          lines={[
            { k: "Fee basis — average AUM", v: fmtFee(r.aum) },
            { k: "Subscribed annual rate", v: `${r.mgmtBps} bps` },
            { k: "Monthly factor", v: "÷ 12" },
          ]}
          resultLabel="Monthly management fee"
          result={fmtFee(r.mgmtFee)}
        />
        <CalcCard
          title="Incentive fee"
          note={`${r.incPct}% of gain above high-water mark`}
          lines={[
            { k: "Month net P&L", v: fmtFee(r.pnl), tone: r.pnl >= 0 ? "#2f7a47" : "#93000a", em: true },
            {
              k: "High-water mark shortfall",
              v: r.shortfall ? `−${fmtFee(r.shortfall)}` : "None",
              tone: r.shortfall ? "#b1402f" : "var(--secondary)",
            },
            { k: "Crystallised gain", v: fmtFee(r.gain) },
            { k: "Incentive rate", v: `${r.incPct}%` },
          ]}
          resultLabel="Monthly incentive fee"
          result={fmtFee(r.incFee)}
        />
      </div>
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-4">
        <span className="max-w-[620px] text-[12.5px] leading-[1.5] text-secondary">
          {noInc ? (
            <>
              No incentive fee this month — the client sits{" "}
              <b className="text-on-surface">
                {fmtFee(r.shortfall - Math.max(0, r.pnl))} below its high-water mark
              </b>
              , and the shortfall carries into next month before any performance fee crystallises again.
            </>
          ) : (
            <>
              Fees invoice on the <b className="text-on-surface">5th business day</b> after month end. Management
              fee accrues daily on AUM; the incentive fee crystallises only on gain above the high-water mark.
            </>
          )}
        </span>
        <div className="flex flex-none gap-2.5">
          {/* View/Edit Gate Function */}
          <Button variant="secondary" icon={FileText}>Fee note</Button>
          {/* View/Edit Gate Function */}
          <Button icon={r.status === "accrued" ? Receipt : Check}>
            {r.status === "accrued" ? "Generate invoice" : "Fee approved"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---- flat fee spreadsheet — one row per client × model -------------- */
function FeeSheet({
  rows, month, open, onToggle,
}: {
  rows: FeeRow[];
  month: string;
  open: string | null;
  onToggle: (key: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-lowest shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[13.5px]">
          <thead>
            <tr>
              {["Client", "Model", "Management fee", "Incentive fee", "Total fee", "Status"].map((h, i) => (
                <th
                  key={h}
                  className={`whitespace-nowrap bg-surface-low px-3.5 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-secondary ${
                    i >= 2 && i <= 4 ? "text-right" : "text-left"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="border-t border-outline-variant px-3.5 py-12 text-center text-[13px] text-secondary">
                  No fee data — no fee source is wired yet.
                </td>
              </tr>
            )}
            {rows.map((r, i) => {
              const on = open === r.key;
              const topBorder = i ? "border-t border-outline-variant" : "";
              return (
                <Fragment key={r.key}>
                  <tr
                    onClick={() => onToggle(r.key)}
                    className={`cursor-pointer ${on ? "bg-surface-low" : ""}`}
                  >
                    <td className={`px-3.5 py-3 font-bold text-on-surface ${topBorder}`}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="flex text-secondary transition-transform duration-150"
                          style={{ transform: on ? "rotate(90deg)" : "none" }}
                        >
                          <ChevronRight size={14} strokeWidth={2.25} />
                        </span>
                        {r.client.name}
                        <span className="text-[11.5px] font-semibold text-secondary">{r.client.accCode}</span>
                      </span>
                    </td>
                    <td className={`px-3.5 py-3 text-secondary ${topBorder}`}>
                      {r.model.name} <span className="text-[11.5px] font-semibold">{r.model.acct}</span>
                    </td>
                    <td className={`px-3.5 py-3 text-right font-bold tabular-nums text-on-surface ${topBorder}`}>
                      {fmtFee(r.mgmtFee)}
                    </td>
                    <td
                      className={`px-3.5 py-3 text-right font-bold tabular-nums ${topBorder}`}
                      style={{ color: r.incFee ? "var(--on-surface)" : "var(--secondary)" }}
                    >
                      {r.incFee ? fmtFee(r.incFee) : "No fee"}
                    </td>
                    <td className={`px-3.5 py-3 text-right font-bold tabular-nums text-primary ${topBorder}`}>
                      {fmtFee(r.total)}
                    </td>
                    <td className={`px-3.5 py-3 ${topBorder}`}>
                      <Chip tone={FEE_STATUS[r.status].tone} dot={false}>{FEE_STATUS[r.status].label}</Chip>
                    </td>
                  </tr>
                  {on && (
                    <tr>
                      <td colSpan={6} className="p-0">
                        <FeeBreakdown r={r} month={month} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ============================================================
   PAGE
   ============================================================ */
export default function CommissionTrackingPage() {
  const { month, rows } = loadCommissions();
  const totals = computeFeeTotals(rows);
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (k: string) => setOpen((o) => (o === k ? null : k));

  const paid = rows.filter((r) => r.status === "paid").length;
  const invoiced = rows.filter((r) => r.status === "invoiced").length;
  const accrued = rows.filter((r) => r.status === "accrued").length;
  // Guard the empty book — 0/0 would put NaN into SegBar's widths.
  const pct = (n: number) => (rows.length ? Math.round((n / rows.length) * 100) : 0);

  return (
    <div className="w-full">
      <div className="mb-5">
        <PageHeader
          title="Commissions Tracking"
          subtitle={`Monthly management & incentive fees per client per model · ${month} · fee period closed`}
          actions={
            <>
              <Button variant="secondary" icon={CalendarDays}>{month}</Button>
              <Button icon={Download}>Export fee book</Button>
            </>
          }
        />
      </div>

      <div className="mb-[18px] grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <MetricStat label="Management fee" value={fmtFeeShort(totals.mgmtTotal)} sub={month} icon={Percent} />
        <MetricStat
          label="Incentive fee"
          value={fmtFeeShort(totals.incTotal)}
          sub="crystallised"
          tone="ok"
          icon={TrendingUp}
        />
        <MetricStat
          label="Total billable"
          value={fmtFeeShort(totals.totalBillable)}
          sub={`${rows.length} client × model lines`}
          icon={Receipt}
        />
        <MetricStat
          label="Below high-water mark"
          value={totals.belowHwmCount}
          sub="no incentive fee"
          tone={totals.belowHwmCount ? "warn" : ""}
          icon={ShieldAlert}
        />
      </div>

      <SegBar ok={pct(paid)} warn={pct(invoiced)} bad={pct(accrued)} />
      <div className="mb-[22px] mt-[9px] flex flex-wrap gap-[18px]">
        {(
          [
            ["#3f9d63", "Paid", paid],
            ["#e0922f", "Invoiced", invoiced],
            ["#d3654f", "Accrued — not yet invoiced", accrued],
          ] as const
        ).map(([c, l, n]) => (
          <span key={l} className="flex items-center gap-[7px] text-[12.5px] font-semibold text-secondary">
            <span className="h-[9px] w-[9px] rounded-[2px]" style={{ background: c }} />
            {l}
            <span className="font-bold tabular-nums text-on-surface">{n}</span>
          </span>
        ))}
      </div>

      <FeeSheet rows={rows} month={month} open={open} onToggle={toggle} />
    </div>
  );
}
