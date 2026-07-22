"use client";

/* ============================================================
   MOBO Daily Exception Report
   The signed end-of-day report artifact (the output that rolls
   up into the Monthly Report). Leads with the day's TRADING
   VOLUME, then resolves into one of two states:
     · clear      — every leg reconciled; nothing to raise.
     · exceptions — the exact broken records, grouped by the
                    leg of the flow where the break occurred:
       1. IB Source ↔ AlgoTrade   order attributes vs the broker fill
       2. AlgoTrade ↔ IB Client   model proceeds vs client allocation
       3. IB Client ↔ CRM        allocated amount vs account change

   Re-ported from the updated design handoff (mobo/mobo-app/
   MoboExceptions.jsx) onto the three-row FLOW model — the same
   model the Trade Reconciliation screen renders (`lib/mobo/
   flow-types.ts` + `lib/mobo/reconciliation-flow.ts`), so the two
   screens always agree. Superseding the old two-panel ti/ic model.
   UI/layout only: still reads the mock-backed `loadReconciliationFlow`
   loader (same as Trade Reconciliation before its FE-5 cutover) —
   no new data wiring.
   Sign-off gated on zero open breaks.
   ============================================================ */

import type { ReactNode } from "react";
import {
  Download, Lock, Check, ShieldAlert, ShieldCheck, Layers, Banknote, BarChart3,
  ArrowLeftRight, ArrowRight, Users, Database, CalendarDays,
} from "@/lib/icons";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { Eyebrow } from "@/components/mobo/Shared";
import { MPill } from "@/components/mobo/recon-flow/shared";
import { loadReconciliationFlow } from "@/lib/mobo/reconciliation-flow";
import { loadReconciliation } from "@/lib/mobo/reconciliation";
import type { RcAlloc, RcModelId, RcOrder, RcPort } from "@/lib/mobo/flow-types";

/* ---- number helpers ----------------------------------------- */
function numFromQty(s: string | null | undefined): number {
  return s == null ? 0 : Number(String(s).replace(/[^0-9.-]/g, "")) || 0;
}
function expectedFromNote(note: string | undefined): string | null {
  const m = note && note.match(/Expected (\S+)/);
  return m ? m[1] : null;
}

/* ---- derive broken records from the three flow rows ---------
   Mirrors buildLegs in MoboExceptions.jsx: one row per broken
   record, pulled straight from the flow view so the report and
   the Trade Reconciliation screen can never disagree. --------- */
type LegKey = "l1" | "l2" | "l3";

interface LegRow {
  id: string;
  kind: "order" | "alloc" | "port";
  inst?: string;
  model?: RcModelId;
  side?: string;
  cat?: string;
  client?: string;
  leftRef?: string | null;
  rightRef?: string | null;
  diffs: { k: string; iv: string; cv: string }[];
  meta?: string | null;
  breakType: string;
}

/* Leg 1 — IB Source ↔ AlgoTrade : order attributes vs broker fill */
function buildL1(orders: RcOrder[]): LegRow[] {
  return orders.filter((o) => o.st !== "ok").map((o) => {
    const filledQty = (o.execs ?? []).reduce((s, e) => s + numFromQty(e.qty), 0);
    const orderedQty = numFromQty(o.qty);
    const missingQty = orderedQty - filledQty;
    return {
      id: o.id, kind: "order", inst: o.inst, model: o.m, side: o.side, cat: o.cat,
      leftRef: o.ref, rightRef: o.ib,
      diffs: [{ k: "Quantity", iv: o.qty, cv: filledQty.toLocaleString("en-US") }],
      meta: missingQty > 0 ? `${missingQty.toLocaleString("en-US")} shares unconfirmed by IB` : null,
      breakType: "Fill break",
    };
  });
}

/* Leg 2 — AlgoTrade ↔ IB Client : aggregated model proceeds vs the
   amount allocated to each subscribing client. */
function buildL2(allocs: RcAlloc[]): LegRow[] {
  const rows: LegRow[] = [];
  allocs.filter((a) => a.st !== "ok").forEach((a) => {
    a.models.filter((m) => m.st !== "ok").forEach((m) => {
      rows.push({
        id: `${a.cid}-${m.m}`, kind: "alloc", client: a.client, model: m.m,
        diffs: [{ k: "Allocated amount", iv: expectedFromNote(m.note) ?? "—", cv: m.amt }],
        meta: `${m.units}× units subscribed`,
        breakType: "Allocation break",
      });
    });
  });
  return rows;
}

/* Leg 3 — IB Client ↔ CRM : intended post-trade allocated amount vs
   the change booked in the client's CRM account. */
function buildL3(ports: RcPort[]): LegRow[] {
  return ports.filter((p) => p.st !== "ok").map((p) => ({
    id: p.cid, kind: "port", client: p.client,
    diffs: [
      { k: "Allocated", iv: p.chg, cv: p.chg },
      { k: "Post-trade AUM", iv: p.post, cv: p.post },
    ],
    meta: null,
    breakType: "Account break",
  }));
}

/* ---- trading-volume tile (the report lead) ------------------ */
function VolumeTile({
  icon: Icon, iconColor, label, value, valueColor, sub,
}: {
  icon: LucideIcon;
  iconColor?: string;
  label: string;
  value: string | number;
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
        className="mt-[9px] text-[28px] font-bold tabular-nums tracking-[-0.02em]"
        style={{ color: valueColor || "var(--on-surface)" }}
      >
        {value}
      </div>
      {sub && <div className="mt-[3px] text-[12.5px] text-secondary">{sub}</div>}
    </div>
  );
}

/* ---- month-to-EOM progress (lives in the date section) ------ */
function MonthProgress({ dayOf, daysInMonth }: { dayOf: number; daysInMonth: number }) {
  const pct = daysInMonth > 0 ? Math.round((dayOf / daysInMonth) * 100) : 0;
  return (
    <div className="mt-1 rounded-md border border-outline-variant bg-surface-low px-[18px] py-[15px]">
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

/* ---- reference token (one side of a leg) --------------------- */
function Ref({ v }: { v: string | null | undefined }) {
  if (!v) return <span className="font-semibold italic" style={{ color: "#b1402f" }}>none</span>;
  return <span className="font-bold text-on-surface">{v}</span>;
}

/* ---- the mismatch cell (expected → actual, per field) -------- */
function Mismatch({ diffs, meta }: { diffs: LegRow["diffs"]; meta?: string | null }) {
  return (
    <span className="inline-flex flex-col gap-[5px]">
      {diffs.map((d, i) => (
        <span key={i} className="inline-flex flex-col gap-px">
          <span className="text-[10px] font-bold uppercase tracking-[0.04em] text-secondary">{d.k}</span>
          <span className="text-[13.5px] tabular-nums">
            <span className="text-secondary">{d.iv}</span>
            <span className="mx-[7px] text-secondary">→</span>
            <span className="font-bold" style={{ color: "#93000a" }}>{d.cv}</span>
          </span>
        </span>
      ))}
      {meta && <span className="mt-px text-[11px]" style={{ color: "#b1402f" }}>{meta}</span>}
    </span>
  );
}

/* ---- leg descriptor (title / icon / desc / column headers) --- */
const LEG_META: Record<LegKey, {
  n: number; title: string; icon: LucideIcon; tone: ChipTone; accent: string; tint: string;
  desc: string; recCol: string; refCol: string; clean: string;
}> = {
  l1: {
    n: 1, title: "IB Source ↔ AlgoTrade", icon: ArrowLeftRight, tone: "warm", accent: "var(--primary)", tint: "rgba(242,116,5,0.1)",
    desc: "AlgoTrade model orders reconciled against the executing broker (Interactive Brokers) — attribute for attribute.",
    recCol: "Order", refCol: "Order → IB fill", clean: "Every AlgoTrade order matched the IB fill attribute-for-attribute.",
  },
  l2: {
    n: 2, title: "AlgoTrade ↔ IB Client", icon: Users, tone: "warm", accent: "#b9741f", tint: "rgba(185,116,31,0.12)",
    desc: "Aggregated proceeds per model reconciled against the amount allocated to each subscribing client.",
    recCol: "Client", refCol: "Model", clean: "Every model’s proceeds aggregated exactly to its clients’ allocations.",
  },
  l3: {
    n: 3, title: "IB Client ↔ CRM", icon: Database, tone: "failed", accent: "#b1402f", tint: "rgba(186,26,26,0.08)",
    desc: "Intended post-trade allocated amount reconciled against the change booked in the client’s CRM account.",
    recCol: "Client", refCol: "Account", clean: "Every client’s CRM account moved by exactly the allocated amount.",
  },
};

/* ---- one leg's block: header + table (or clean strip) -------- */
function LegBlock({ legKey, rows }: { legKey: LegKey; rows: LegRow[] }) {
  const M = LEG_META[legKey];
  const LegIcon = M.icon;
  const th = (t: string, align: "left" | "right" = "left") => (
    <th
      className="whitespace-nowrap bg-surface-low px-4 py-[10px] text-[10.5px] font-bold uppercase tracking-[0.05em] text-secondary"
      style={{ textAlign: align }}
    >
      {t}
    </th>
  );
  const clean = rows.length === 0;
  return (
    <div className="mb-[22px]">
      <div className="mb-[11px] flex flex-wrap items-center gap-[11px]">
        <span className="inline-flex items-center gap-2 text-[15px] font-bold text-on-surface">
          <span
            className="flex h-[26px] w-[26px] items-center justify-center rounded"
            style={{ background: clean ? "rgba(22,163,74,0.1)" : M.tint, color: clean ? "#15803d" : M.accent }}
          >
            <LegIcon size={14} strokeWidth={2} />
          </span>
          <span className="text-[11px] font-extrabold tracking-[0.04em] text-secondary">{M.n}.</span>
          {M.title}
        </span>
        <Chip tone={clean ? "active" : M.tone} dot={false}>
          {clean ? "reconciled" : `${rows.length} ${rows.length === 1 ? "break" : "breaks"}`}
        </Chip>
        <span className="min-w-[180px] flex-1 text-[12.5px] text-secondary">{M.desc}</span>
      </div>
      {clean ? (
        <div className="flex items-center gap-[11px] rounded-md px-4 py-[13px]" style={{ background: "#f0faf3", border: "1px solid #c5e6cf" }}>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(22,163,74,0.12)", color: "#15803d" }}>
            <Check size={14} strokeWidth={2.5} />
          </span>
          <span className="text-[13px] font-semibold" style={{ color: "#2f6b46" }}>{M.clean}</span>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-outline-variant">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr>{th(M.recCol)}{th(M.refCol)}{th("Mismatch")}{th("Status", "right")}</tr>
            </thead>
            <tbody>
              {rows.map((b, i) => <LegRowView key={b.id} b={b} first={i === 0} legKey={legKey} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LegRowView({ b, first, legKey }: { b: LegRow; first: boolean; legKey: LegKey }) {
  const M = LEG_META[legKey];
  const tint = M.tone === "failed" ? "rgba(186,26,26,0.035)" : "rgba(242,116,5,0.04)";
  const td = (children: ReactNode, align: "left" | "right" = "left") => (
    <td
      className="px-4 py-[13px] align-top"
      style={{ borderTop: first ? "none" : "1px solid var(--outline-variant)", textAlign: align }}
    >
      {children}
    </td>
  );

  let rec: ReactNode;
  let refCell: ReactNode;
  if (b.kind === "order") {
    rec = (
      <div>
        <div className="flex items-center gap-[7px]">
          <span className="text-[13.5px] font-bold text-on-surface">{b.inst}</span>
          {b.model && <MPill mid={b.model} />}
        </div>
        <div className="mt-0.5 text-[12px] text-secondary">{b.side} · {b.cat}</div>
      </div>
    );
    refCell = (
      <span className="inline-flex items-center gap-2 text-[12.5px] tabular-nums">
        <Ref v={b.leftRef} /><ArrowRight size={13} strokeWidth={2} color="var(--primary)" /><Ref v={b.rightRef} />
      </span>
    );
  } else if (b.kind === "alloc") {
    rec = (
      <div>
        <div className="text-[13.5px] font-bold text-on-surface">{b.client}</div>
        <div className="mt-0.5 text-[12px] text-secondary">{b.meta}</div>
      </div>
    );
    refCell = b.model && <MPill mid={b.model} />;
  } else {
    rec = <div className="text-[13.5px] font-bold text-on-surface">{b.client}</div>;
    refCell = <span className="text-[12.5px] text-secondary">CRM account</span>;
  }

  return (
    <tr style={{ background: tint }}>
      {td(rec)}
      {td(refCell)}
      {td(<Mismatch diffs={b.diffs} meta={b.kind !== "alloc" ? b.meta : null} />)}
      {td(<Chip tone={M.tone} dot={false}>{b.breakType}</Chip>, "right")}
    </tr>
  );
}

/* ---- all-clear verdict --------------------------------------- */
function AllClear({ orders }: { orders: number }) {
  const ConfirmLine = ({ icon: Icon, n, title, sub }: { icon: LucideIcon; n: string; title: string; sub: string }) => (
    <div className="flex items-center gap-3 rounded-md border border-outline-variant bg-surface-lowest px-4 py-[14px]">
      <span
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px]"
        style={{ background: "rgba(22,163,74,0.1)", color: "#15803d" }}
      >
        <Icon size={15} strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <div className="text-[13.5px] font-bold text-on-surface"><span className="text-secondary">{n}. </span>{title}</div>
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
            All {orders} orders reconciled clean across every leg — AlgoTrade → IB Client → CRM. Nothing to carry forward into June’s monthly report.
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ConfirmLine icon={ArrowLeftRight} n="1" title="IB Source ↔ AlgoTrade" sub="Orders matched the broker fills" />
        <ConfirmLine icon={Users} n="2" title="AlgoTrade ↔ IB Client" sub="Proceeds aggregated to allocations" />
        <ConfirmLine icon={Database} n="3" title="IB Client ↔ CRM" sub="Accounts moved by the allocated amount" />
      </div>
    </div>
  );
}

/* ---- signature line ------------------------------------------ */
function SignLine({ cap }: { cap: string }) {
  return (
    <div>
      <div className="h-9 w-[200px] border-b-[1.5px] border-outline" />
      <div className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-secondary">{cap}</div>
    </div>
  );
}

export default function DailyExceptionReportPage() {
  /* Flow bundle — same three-row model the Trade Reconciliation screen
     renders, so the two screens can never disagree (SINGLE SEAM). */
  const { settleDay, orders, allocs, ports, ibTotal, counts } = loadReconciliationFlow("breaks");
  /* Report metadata (generated time / month-to-date) isn't part of the
     flow bundle — sourced from the existing EOD rollup, same as before. */
  const { eod } = loadReconciliation();

  const l1 = buildL1(orders);
  const l2 = buildL2(allocs);
  const l3 = buildL3(ports);
  const open = counts.totalBrk;

  /* trading-volume stats — straight off the flow bundle */
  const execs = orders.reduce((s, o) => s + (o.execs?.length ?? 0), 0);
  const avgFills = orders.length > 0 ? (execs / orders.length).toFixed(1) : "0.0";

  const subtitle = open === 0
    ? `All reconciled · 0 exceptions · settlement day ${settleDay}`
    : `${open} ${open === 1 ? "exception" : "exceptions"} · ${l1.length} IB↔Algo · ${l2.length} Algo↔Client · ${l3.length} Client↔CRM · settlement day ${settleDay}`;

  return (
    <div className="w-full">
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
              Settlement day · {settleDay} · Middle &amp; Back Office · Generated {eod.generated}
            </div>
          </div>
          <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[14px] border-[1.5px] border-primary text-[14px] font-extrabold tracking-[0.06em] text-primary">
            EOD
          </span>
        </div>

        <div className="px-6 py-[22px]">
          {/* TRADING VOLUME — the lead */}
          <Eyebrow>Trading volume — settlement day</Eyebrow>
          <div className="mb-[26px] grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <VolumeTile icon={BarChart3} label="Orders" value={orders.length} sub="AlgoTrade model orders" />
            <VolumeTile icon={Layers} label="Executions / fills" value={execs} sub={`avg ${avgFills} per order`} />
            <VolumeTile icon={Banknote} label="Notional traded" value={ibTotal} sub="USD equivalent" />
            <VolumeTile
              icon={open ? ShieldAlert : ShieldCheck}
              iconColor={open ? "var(--primary)" : "#15803d"}
              label="Total breaks"
              value={open}
              valueColor={open ? "#93000a" : "#15803d"}
              sub={open ? `${l1.length} · ${l2.length} · ${l3.length} across legs` : "all reconciled clean"}
            />
          </div>

          {/* VERDICT */}
          {open === 0 ? (
            <AllClear orders={orders.length} />
          ) : (
            <>
              <div className="mb-[18px] flex flex-wrap items-center gap-3">
                <Eyebrow className="mb-0">Broken records — by leg of the flow</Eyebrow>
                <div className="ml-auto flex flex-wrap gap-2">
                  <Chip tone={l1.length ? "warm" : "active"} dot={false}>1 · IB↔Algo · {l1.length}</Chip>
                  <Chip tone={l2.length ? "warm" : "active"} dot={false}>2 · Algo↔Client · {l2.length}</Chip>
                  <Chip tone={l3.length ? "failed" : "active"} dot={false}>3 · Client↔CRM · {l3.length}</Chip>
                </div>
              </div>
              <LegBlock legKey="l1" rows={l1} />
              <LegBlock legKey="l2" rows={l2} />
              <LegBlock legKey="l3" rows={l3} />
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
