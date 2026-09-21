"use client";

/* ============================================================
   Exception Bento — four-card summary strip above the recon
   spreadsheet: total-exception verdict card + one per-system
   exception card (CRM / IB / PC), in that order.
   ============================================================ */

import { Check, ShieldAlert } from "@/lib/icons";
import { SysBadge, SYS_CLR } from "@/components/mobo/Shared";
import { walkNodes, type ReconNode, type Sys } from "@/lib/mobo/executions";

const SYS_ORDER: Sys[] = ["CRM", "IB", "PC"];

function SysExcCard({ sys, n, total }: { sys: Sys; n: number; total: number }) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return (
    <div className="rounded-[14px] border border-outline-variant bg-surface-lowest shadow-card px-[18px] py-4 min-w-0 flex flex-col justify-between gap-3">
      <div className="flex items-center gap-2">
        <SysBadge sys={sys} />
        <span className="text-[11.5px] font-bold uppercase tracking-[0.05em] text-secondary">
          Exceptions
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={`text-[30px] font-bold tracking-[-0.02em] tabular-nums ${n === 0 ? "text-secondary" : "text-on-surface"}`}
        >
          {n}
        </span>
        <span className="text-[13px] font-semibold text-secondary">of {total} records</span>
      </div>
      <div className="h-[5px] rounded-full bg-surface-container overflow-hidden">
        <span className="block h-full" style={{ width: `${pct}%`, background: SYS_CLR[sys] }} />
      </div>
    </div>
  );
}

export function ExceptionBento({ trades, dayLabel }: { trades: ReconNode[]; dayLabel: string }) {
  // Total exceptions = top-level trades carrying a break or a missing
  // counterpart anywhere beneath them (hasBreak/hasMissing already fold
  // in descendants — see mapTrade in lib/mobo/executions.ts).
  const brokenTrades = trades.filter((t) => t.hasBreak || t.hasMissing).length;
  const clean = brokenTrades === 0;

  // Per-system counts are read off every node in the tree, not just
  // trades: `system` is null on trade rows (a trade spans all three
  // systems), so trade rows never land in a bucket here — that's correct,
  // exceptions are counted per source record, not per trade. A missing
  // placeholder still counts toward its system's TOTAL: a record that
  // system owes but doesn't have is still a record it's on the hook for.
  const all = walkNodes(trades);
  const perSys = Object.fromEntries(
    SYS_ORDER.map((sys) => {
      const nodes = all.filter((n) => n.system === sys);
      const flagged = nodes.filter((n) => n.missing || n.breaks.length > 0).length;
      return [sys, { flagged, total: nodes.length }];
    }),
  ) as Record<Sys, { flagged: number; total: number }>;

  const flaggedNodes = SYS_ORDER.reduce((sum, s) => sum + perSys[s].flagged, 0);
  const totalNodes = SYS_ORDER.reduce((sum, s) => sum + perSys[s].total, 0);

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(198px,1fr))] gap-3.5 mb-[18px] items-stretch">
      <div
        className="rounded-[14px] bg-surface-lowest shadow-card px-[18px] py-4 min-w-0 flex flex-col justify-between gap-3"
        style={{ border: `1.5px solid ${clean ? "rgba(47,122,71,0.25)" : "rgba(242,116,5,0.35)"}` }}
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-[7px] w-[7px] rounded-full"
            style={{ background: clean ? "#16a34a" : "#ba1a1a" }}
          />
          <span className="text-[11.5px] font-bold uppercase tracking-[0.05em] text-secondary">
            Total Exceptions
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full"
            style={{
              background: clean ? "#e3f1e7" : "#f7ddd6",
              color: clean ? "#2f7a47" : "#93000a",
            }}
          >
            {clean ? <Check size={18} /> : <ShieldAlert size={18} />}
          </span>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-[44px] font-bold tracking-[-0.02em] leading-none tabular-nums ${clean ? "text-on-surface" : ""}`}
              style={clean ? undefined : { color: "#93000a" }}
            >
              {brokenTrades}
            </span>
            <span className="text-[13px] font-semibold text-secondary">trades broken</span>
          </div>
        </div>
        <p className="text-[12.5px] text-secondary">
          {clean ? (
            <>
              <strong className="text-on-surface">All {trades.length} trades reconciled.</strong> No
              breaks across CRM, IB, and Portfolio Commander for {dayLabel}.
            </>
          ) : (
            <>
              {flaggedNodes} of {totalNodes} records flagged across three systems · resolve before the{" "}
              {dayLabel} cutoff
            </>
          )}
        </p>
      </div>
      {SYS_ORDER.map((sys) => (
        <SysExcCard key={sys} sys={sys} n={perSys[sys].flagged} total={perSys[sys].total} />
      ))}
    </div>
  );
}
