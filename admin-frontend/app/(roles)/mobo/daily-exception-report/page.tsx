"use client";

/* ============================================================
   MOBO Daily Exception Report
   The signed end-of-day report artifact (the output that rolls
   up into the Monthly Report). Leads with the day's TRADING
   VOLUME, then resolves into one of two states:
     · clear      — nothing reconciled out; nothing to raise.
     · exceptions — the exact broken records, by row, grouped
                    by where the break occurred:
                      Trader ↔ IB   (trader blotter vs broker)
                      IB ↔ CRM       (live broker vs stored book)

   Broken records are DERIVED from the reconciliation legs (the
   buildBreaks pass over each trade's ti/ic legs), so this report
   always matches the Trade Reconciliation screen. Data reaches
   this screen ONLY through `loadReconciliation()` (the C1 seam).
   Sign-off gated on zero open breaks.
   Ported from the design handoff (MoboExceptions.jsx).
   ============================================================ */

import type { ReactNode } from "react";
import {
  Download, Lock, Check, ShieldAlert, ShieldCheck, Layers, Wallet,
  ArrowLeftRight, ArrowRight, Unlink, CalendarDays,
} from "@/lib/icons";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { Eyebrow } from "@/components/mobo/Shared";
import { loadReconciliation } from "@/lib/mobo/reconciliation";
import type {
  CompareField, ReconTrade, ReconLeg, MatchState,
} from "@/lib/mobo/types";

/* ---- derive broken records from the reconciliation legs ----
   Mirrors buildBreaks in MoboExceptions.jsx: one row per broken
   leg, pulled straight from the leg's own fields so the report
   and the recon screen can never disagree. */
type LegKey = "ti" | "ic";

interface LegBreak {
  id: string;
  leg: LegKey;
  inst: string;
  book: string;
  leftRef: string | null;
  rightRef: string | null;
  state: MatchState;          // brk | miss
  breakType: string;
  diff: CompareField | null;
}

function legBreak(t: ReconTrade, leg: LegKey): LegBreak {
  const L: ReconLeg = t[leg];
  const isTI = leg === "ti";
  return {
    id: `${t.id}-${leg}`,
    leg,
    inst: t.inst,
    book: t.book,
    leftRef: isTI ? t.trader : t.ib,
    rightRef: isTI ? t.ib : t.crm,
    state: L.state,
    breakType: L.breakType || L.integrityType || "Break",
    diff: (L.fields || []).find((f) => f.d) || null,
  };
}

function buildBreaks(trades: ReconTrade[]): { ti: LegBreak[]; ic: LegBreak[] } {
  const ti: LegBreak[] = [];
  const ic: LegBreak[] = [];
  trades.forEach((t) => {
    if (t.ti.state !== "ok") ti.push(legBreak(t, "ti"));
    if (t.ic.state !== "ok") ic.push(legBreak(t, "ic"));
  });
  return { ti, ic };
}

/* ---- trading-volume tile (the lead) ------------------------ */
function VolumeTile({
  icon: Icon, iconColor, label, value, valueColor, sub,
}: {
  icon: LucideIcon;
  iconColor?: string;
  label: string;
  value: string;
  valueColor?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-[14px] border border-outline-variant bg-surface-low px-[18px] py-4">
      <div className="flex items-center gap-2">
        <span className="flex" style={{ color: iconColor || "var(--secondary)" }}>
          <Icon size={16} strokeWidth={1.75} />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">{label}</span>
      </div>
      <div
        className="mt-[9px] text-[30px] font-bold tabular-nums tracking-[-0.02em]"
        style={{ color: valueColor || "var(--on-surface)" }}
      >
        {value}
      </div>
      {sub && <div className="mt-[3px] text-[12.5px] text-secondary">{sub}</div>}
    </div>
  );
}

/* ---- month-to-EOM progress (lives in the date section) ----- */
function MonthProgress({ dayOf, daysInMonth }: { dayOf: number; daysInMonth: number }) {
  const pct = daysInMonth > 0 ? Math.round((dayOf / daysInMonth) * 100) : 0;
  return (
    <div className="mt-1 rounded-xl border border-outline-variant bg-surface-low px-[18px] py-[15px]">
      <div className="mb-[11px] flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-[9px] text-[13px] text-secondary">
          <span className="flex text-secondary"><CalendarDays size={16} strokeWidth={1.75} /></span>
          Rolls into the <b className="text-on-surface">June Monthly Report</b>
        </span>
        <span className="text-[12.5px] font-bold tabular-nums text-on-surface">Day {dayOf} of {daysInMonth}</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-container">
        <span style={{ width: `${pct}%`, background: "var(--primary)" }} />
      </div>
      <div className="mt-2 text-[12px] tabular-nums text-secondary">{pct}% of June’s settlement days signed</div>
    </div>
  );
}

/* ---- reference token (one side of a leg) ------------------- */
function Ref({ v }: { v: string | null }) {
  if (!v) return <span className="font-semibold italic" style={{ color: "#b1402f" }}>none</span>;
  return <span className="font-bold text-on-surface">{v}</span>;
}

/* ---- the mismatch cell (what broke) ------------------------ */
function Mismatch({ b }: { b: LegBreak }) {
  if (b.state === "miss") {
    const text = !b.leftRef
      ? (b.leg === "ti" ? "No trader record" : "No live IB record")
      : (b.leg === "ti" ? "No IB confirmation" : "Not booked in CRM");
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: "#b1402f" }}>
        <Unlink size={13} strokeWidth={2} /> {text}
      </span>
    );
  }
  if (!b.diff) return <span className="text-[13px] text-secondary">—</span>;
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.04em] text-secondary">{b.diff.k}</span>
      <span className="text-[13.5px] tabular-nums">
        <span className="text-secondary">{b.diff.iv}</span>
        <span className="mx-[7px] text-secondary">→</span>
        <span className="font-bold" style={{ color: "#93000a" }}>{b.diff.cv}</span>
      </span>
    </span>
  );
}

/* ---- one leg's table of broken records --------------------- */
function BreakTable({ leg, rows }: { leg: LegKey; rows: LegBreak[] }) {
  const isTI = leg === "ti";
  const title = isTI ? "Trader ↔ IB" : "IB ↔ CRM";
  const desc = isTI
    ? "Trader blotter reconciled against the executing broker (Interactive Brokers)."
    : "Stored MegaCRM book validated against the live IB record — IB is the source of truth.";
  const LegIcon = isTI ? ArrowLeftRight : Layers;
  const th = (t: string, align: "left" | "right" = "left") => (
    <th
      className="bg-surface-low px-4 py-[10px] text-[10.5px] font-bold uppercase tracking-[0.05em] text-secondary whitespace-nowrap"
      style={{ textAlign: align }}
    >
      {t}
    </th>
  );
  return (
    <div className="mb-[22px]">
      <div className="mb-[11px] flex flex-wrap items-center gap-[11px]">
        <span className="inline-flex items-center gap-2 text-[15px] font-bold text-on-surface">
          <span
            className="flex h-[26px] w-[26px] items-center justify-center rounded-lg"
            style={{
              background: isTI ? "rgba(242,116,5,0.1)" : "rgba(186,26,26,0.08)",
              color: isTI ? "var(--primary)" : "#b1402f",
            }}
          >
            <LegIcon size={14} strokeWidth={2} />
          </span>
          {title}
        </span>
        <Chip tone={isTI ? "warm" : "failed"} dot={false}>
          {rows.length} {rows.length === 1 ? "break" : "breaks"}
        </Chip>
        <span className="text-[12.5px] text-secondary">{desc}</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-outline-variant">
        <table className="w-full border-collapse text-[13.5px]">
          <thead>
            <tr>{th("Record")}{th("References")}{th("Break type")}{th("Mismatch")}{th("Status", "right")}</tr>
          </thead>
          <tbody>
            {rows.map((b, i) => <BreakRow key={b.id} b={b} first={i === 0} isTI={isTI} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BreakRow({ b, first, isTI }: { b: LegBreak; first: boolean; isTI: boolean }) {
  const miss = b.state === "miss";
  const statusLabel = isTI ? (miss ? "Unmatched" : "Break") : (miss ? "Missing" : "Drifted");
  const statusTone: ChipTone = miss ? "failed" : "warm";
  const tint = miss ? "rgba(186,26,26,0.035)" : "rgba(242,116,5,0.04)";
  const td = (children: ReactNode, align: "left" | "right" = "left") => (
    <td
      className="px-4 py-[13px] align-middle"
      style={{ borderTop: first ? "none" : "1px solid var(--outline-variant)", textAlign: align }}
    >
      {children}
    </td>
  );
  return (
    <tr style={{ background: tint }}>
      {td(
        <div>
          <div className="text-[13.5px] font-bold text-on-surface">{b.inst}</div>
          <div className="mt-0.5 text-[12px] text-secondary">{b.book}</div>
        </div>,
      )}
      {td(
        <span className="inline-flex items-center gap-2 text-[12.5px] tabular-nums">
          <Ref v={b.leftRef} />
          <ArrowRight size={13} strokeWidth={2} color="var(--primary)" />
          <Ref v={b.rightRef} />
        </span>,
      )}
      {td(<span className="text-[13px] text-on-surface">{b.breakType}</span>)}
      {td(<Mismatch b={b} />)}
      {td(<Chip tone={statusTone} dot={false}>{statusLabel}</Chip>, "right")}
    </tr>
  );
}

/* ---- all-clear verdict ------------------------------------- */
function AllClear({ tradesReconciled }: { tradesReconciled: number }) {
  const ConfirmLine = ({ icon: Icon, title, sub }: { icon: LucideIcon; title: string; sub: string }) => (
    <div className="flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-lowest px-4 py-[14px]">
      <span
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px]"
        style={{ background: "rgba(22,163,74,0.1)", color: "#15803d" }}
      >
        <Icon size={15} strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <div className="text-[13.5px] font-bold text-on-surface">{title}</div>
        <div className="mt-px text-[12.5px] text-secondary">{sub}</div>
      </div>
      <span className="ml-auto flex"><Check size={18} strokeWidth={2.25} color="#16a34a" /></span>
    </div>
  );
  return (
    <div className="rounded-2xl px-7 py-[30px]" style={{ border: "1px solid #c5e6cf", background: "#f0faf3" }}>
      <div className="mb-[22px] flex items-center gap-4">
        <span
          className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: "#16a34a", boxShadow: "0 4px 12px rgba(22,163,74,0.25)" }}
        >
          <Check size={28} strokeWidth={2.5} />
        </span>
        <div>
          <div className="text-[21px] font-bold tracking-[-0.01em]" style={{ color: "#14532d" }}>
            All clear — no exceptions to raise
          </div>
          <div className="mt-1 text-[14px]" style={{ color: "#3f6b4f" }}>
            Every trade reconciled clean across Trader → IB → CRM. Nothing to carry forward into June’s monthly report.
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ConfirmLine
          icon={ArrowLeftRight}
          title="Trader ↔ IB"
          sub={`${tradesReconciled.toLocaleString("en-US")} orders matched against the broker`}
        />
        <ConfirmLine icon={Layers} title="IB ↔ CRM" sub="Stored book in sync with the live IB record" />
      </div>
    </div>
  );
}

/* ---- signature line ---------------------------------------- */
function SignLine({ cap }: { cap: string }) {
  return (
    <div>
      <div className="h-9 w-[200px] border-b-[1.5px] border-outline" />
      <div className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-secondary">{cap}</div>
    </div>
  );
}

export default function DailyExceptionReportPage() {
  /* SINGLE SEAM — every figure below is derived from this bundle. */
  const { settleDay, trades, counters, eod } = loadReconciliation();

  /* Broken records, derived from each trade's ti/ic legs (single source
     of truth — same pass the recon screen uses). */
  const { ti, ic } = buildBreaks(trades);
  const open = ti.length + ic.length;
  const clear = open === 0;

  /* --- TRADING VOLUME, re-based to single-source counts ---
     trades reconciled  : counters.matched / counters.reconciled
     executions / fills : sum of the stored-IB execution rows on each
                          trade's ti leg; avg = executions / orders
     notional           : the EOD rollup figure (USD equivalent) */
  const reconciled = counters.reconciled;
  const matched = counters.matched;
  const executions = eod.executions ?? trades.reduce((n, t) => n + (t.ti.execs?.length ?? 0), 0);
  const avgFills = reconciled > 0 ? (executions / reconciled).toFixed(1) : "0.0";
  const notional = eod.notional ?? "—";

  const settleLabel = settleDay || "—";
  const generated = eod.generated || "—";

  const subtitle = clear
    ? `All reconciled · 0 exceptions · settlement day ${settleLabel}`
    : `${open} ${open === 1 ? "exception" : "exceptions"} to raise · ${ti.length} Trader↔IB · ${ic.length} IB↔CRM · settlement day ${settleLabel}`;

  return (
    <div className="mx-auto max-w-[1240px]">
      <div className="mb-7">
        <PageHeader
          title="Daily Exception Report"
          subtitle={subtitle}
          actions={<Button variant="secondary" icon={Download}>Export</Button>}
        />
      </div>

      <section className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-lowest shadow-card">
        {/* band */}
        <div className="flex items-center justify-between gap-4 border-b border-outline-variant bg-surface-low px-6 py-5">
          <div>
            <div className="text-[20px] font-bold tracking-[-0.01em] text-on-surface">Daily Exception Report</div>
            <div className="mt-1 text-[12.5px] text-secondary">
              Settlement day · {settleLabel} · Middle &amp; Back Office · Generated {generated}
            </div>
          </div>
          <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[14px] border-[1.5px] border-primary text-[14px] font-extrabold tracking-[0.06em] text-primary">
            EOD
          </span>
        </div>

        <div className="px-6 py-[22px]">
          {/* TRADING VOLUME — the lead (matched-vs-total merged into the first card) */}
          <Eyebrow>Trading volume — settlement day</Eyebrow>
          <div className="mb-[26px] grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            <VolumeTile
              icon={open ? ShieldAlert : ShieldCheck}
              iconColor={open ? "var(--primary)" : "#15803d"}
              label="Trades reconciled"
              value={`${matched.toLocaleString("en-US")} / ${reconciled.toLocaleString("en-US")}`}
              sub={open ? `${open} reconciled out` : "all matched clean"}
            />
            <VolumeTile
              icon={Layers}
              label="Executions / fills"
              value={executions.toLocaleString("en-US")}
              sub={`avg ${avgFills} per order`}
            />
            <VolumeTile icon={Wallet} label="Notional traded" value={notional} sub="USD equivalent" />
          </div>

          {/* VERDICT */}
          {clear ? (
            <AllClear tradesReconciled={reconciled} />
          ) : (
            <>
              <div className="mb-[18px] flex flex-wrap items-center gap-3">
                <Eyebrow className="mb-0">Broken records — by where the break occurred</Eyebrow>
                <div className="ml-auto flex gap-2">
                  <Chip tone="warm" dot={false}>Trader ↔ IB · {ti.length}</Chip>
                  <Chip tone="failed" dot={false}>IB ↔ CRM · {ic.length}</Chip>
                </div>
              </div>
              <BreakTable leg="ti" rows={ti} />
              <BreakTable leg="ic" rows={ic} />
            </>
          )}

          {/* date section — progress toward the June Monthly Report */}
          <MonthProgress dayOf={eod.dayOf} daysInMonth={eod.daysInMonth} />
        </div>

        {/* footer / sign-off */}
        <div className="flex flex-wrap items-center justify-between gap-6 border-t border-outline-variant bg-surface-lowest px-6 py-[18px]">
          <div className="flex flex-wrap gap-9">
            <SignLine cap="Prepared by · MOBO Analyst" />
            <SignLine cap="Reviewed by · Supervisor" />
          </div>
          <div className="flex items-center gap-3.5">
            {open === 0 ? (
              <>
                <span className="flex items-center gap-[7px] text-[12.5px] font-semibold" style={{ color: "#15803d" }}>
                  <Check size={15} strokeWidth={2.25} /> Ready to sign — 0 open breaks.
                </span>
                <Button icon={Lock}>Sign off &amp; lock</Button>
              </>
            ) : (
              <>
                <span className="max-w-[220px] text-right text-[12px] text-secondary">
                  Locked until {open} open {open === 1 ? "break is" : "breaks are"} cleared.
                </span>
                <Button icon={Lock} disabled>Sign off &amp; lock</Button>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
