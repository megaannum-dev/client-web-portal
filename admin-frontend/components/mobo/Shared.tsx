"use client";

/* ============================================================
   MOBO shared scaffolding & primitives
   MetricStat · SegBar · CompareGrid · Eyebrow · TriageDetail
   Ported from the design handoff (MoboShared.jsx).
   ============================================================ */

import { useState, type ReactNode } from "react";
import {
  X, Clock, Check, UserRound, MessageSquare, ArrowUpRight, ShieldAlert,
  ChevronRight, Unlink, RefreshCw, Database, Layers,
} from "@/lib/icons";
import type { LucideIcon } from "lucide-react";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
import {
  SEV_LABEL, SEV_TONE,
  type CompareField, type Exception, type ReconLine,
} from "@/lib/mock/mobo-data";
/* C1 view-layer contract — the EXACT shapes the new triage primitives bind to. */
import type {
  ExecRow as ExecRowData,
  ExecSide,
  IntegrityState,
  MatchState,
  ReconLeg,
  ReconTrade,
} from "@/lib/mobo/types";

/* ---- Metric stat tile -------------------------------------- */
type StatTone = "" | "ok" | "warn" | "bad";

const STAT_TONE: Record<StatTone, { dot: string; val: string }> = {
  "":   { dot: "var(--secondary)", val: "var(--on-surface)" },
  ok:   { dot: "#16a34a", val: "var(--on-surface)" },
  warn: { dot: "#ea580c", val: "var(--on-surface)" },
  bad:  { dot: "#ba1a1a", val: "#93000a" },
};

export function MetricStat({
  label, value, sub, tone = "", icon: Icon, onClick,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: StatTone;
  icon?: LucideIcon;
  onClick?: () => void;
}) {
  const t = STAT_TONE[tone] ?? STAT_TONE[""];
  return (
    <div
      onClick={onClick}
      className={[
        "min-w-0 rounded-[14px] border border-outline-variant bg-surface-lowest px-[18px] py-4 shadow-card transition-shadow duration-150",
        onClick ? "cursor-pointer hover:shadow-hover" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: t.dot }} />
        <span className="truncate text-[11.5px] font-bold uppercase tracking-[0.05em] text-secondary">
          {label}
        </span>
        {Icon && (
          <span className="ml-auto flex text-secondary">
            <Icon size={15} strokeWidth={1.75} />
          </span>
        )}
      </div>
      <div className="mt-[9px] flex items-baseline gap-2">
        <span
          className="text-[30px] font-bold tabular-nums tracking-[-0.02em]"
          style={{ color: t.val }}
        >
          {value}
        </span>
        {sub && <span className="text-[13px] font-semibold text-secondary">{sub}</span>}
      </div>
    </div>
  );
}

/* ---- Segmented progress bar (matched / breaks / unmatched) - */
export function SegBar({ ok, warn, bad, height = 12 }: { ok: number; warn: number; bad: number; height?: number }) {
  return (
    <div
      className="flex overflow-hidden rounded-full bg-surface-container"
      style={{ height }}
    >
      <span style={{ width: `${ok}%`, background: "#3f9d63" }} />
      <span style={{ width: `${warn}%`, background: "#e0922f" }} />
      <span style={{ width: `${bad}%`, background: "#d3654f" }} />
    </div>
  );
}

/* ---- render {b}…{/b} as a highlighted (break) span --------- */
export function richSub(s: string | null): ReactNode {
  if (!s) return null;
  const parts = String(s).split(/(\{b\}.*?\{\/b\})/g);
  return parts.map((p, i) => {
    const m = p.match(/^\{b\}(.*?)\{\/b\}$/);
    if (m) {
      return (
        <span key={i} className="font-bold" style={{ color: "#ba1a1a" }}>
          {m[1]}
        </span>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

/* ---- Section eyebrow label --------------------------------- */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={["mb-2.5 text-[11px] font-bold uppercase tracking-[0.05em] text-secondary", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}

/* ---- Field-by-field comparison grid (Internal vs Custodian) */
export function CompareGrid({
  fields,
  leftLabel = "Internal book — OMS",
  rightLabel = "Custodian feed",
}: {
  fields: CompareField[];
  leftLabel?: string;
  rightLabel?: string;
}) {
  return (
    <div className="mb-[18px] overflow-hidden rounded-xl border border-outline-variant">
      <div className="grid grid-cols-2 border-b border-outline-variant">
        <div className="border-r border-outline-variant bg-surface-low px-3.5 py-[9px] text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">
          {leftLabel}
        </div>
        <div className="bg-surface-low px-3.5 py-[9px] text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">
          {rightLabel}
        </div>
      </div>
      {fields.map((f, i) => {
        const cellBg = f.d ? "rgba(186,26,26,0.05)" : "transparent";
        const valCls = f.d ? "font-bold" : "font-medium";
        const valColor = f.d ? "#93000a" : "var(--on-surface)";
        const borderTop = i ? "border-t border-outline-variant" : "";
        return (
          <div key={i} className="grid grid-cols-2">
            <div className={`border-r border-outline-variant px-3.5 py-2.5 ${borderTop}`} style={{ background: cellBg }}>
              <div className="mb-[3px] text-[10.5px] font-bold uppercase tracking-[0.04em] text-secondary">{f.k}</div>
              <div className={`text-[14px] tabular-nums ${valCls}`} style={{ color: valColor }}>{f.iv}</div>
            </div>
            <div className={`px-3.5 py-2.5 ${borderTop}`} style={{ background: cellBg }}>
              <div className="mb-[3px] text-[10.5px] font-bold uppercase tracking-[0.04em] text-secondary">{f.k}</div>
              <div className={`text-[14px] tabular-nums ${valCls}`} style={{ color: valColor }}>{f.cv}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   EXECUTION-LEVEL TRIAGE (Trader ↔ IB)
   An order fills across one or more executions. Each ExecRow
   (C1 type) carries a populated stored-IB side (`ib`) and a
   counterpart side (`trader`) that is EMPTY ("awaiting source")
   in today's data reality — an empty counterpart is rendered as
   awaiting, NOT as a break. Ported faithfully from MoboShared.jsx.
   ============================================================ */

/* per-execution status glyph (mirrors EX_GLYPH) */
const EX_GLYPH: Record<MatchState, { icon: LucideIcon; bg: string; fg: string }> = {
  ok:   { icon: Check,  bg: "#e3f1e7", fg: "#2f7a47" },
  brk:  { icon: Unlink, bg: "#fdeccd", fg: "#b9741f" },
  miss: { icon: X,      bg: "#f7ddd6", fg: "#b1402f" },
};

/* status vocabulary — one set of components serves both the
   Trader↔IB trade match (TI) and the IB↔CRM set-membership view (IC).
   `missCell` is the empty counterpart label = awaiting source. */
type ExecTerms = {
  ok: string; brk: string; miss: string;
  countOk: string; countBad: string; missCell: string;
};
const TI_TERMS: ExecTerms = {
  ok: "Matched", brk: "Break", miss: "Awaiting trader",
  countOk: "Counts match", countBad: "Count break", missCell: "awaiting source",
};
const IC_TERMS: ExecTerms = {
  ok: "In both", brk: "Differs", miss: "One side only",
  countOk: "Counts match", countBad: "Count mismatch", missCell: "awaiting source",
};

const EX_ST_TONE: Record<MatchState, ChipTone> = { ok: "active", brk: "warm", miss: "failed" };

function ExecCellHead({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.04em] text-secondary ${right ? "text-right" : "text-left"}`}>
      {children}
    </div>
  );
}

/* ---- ExecCompare — per-execution trader-vs-IB compare list -
   Compact side-by-side grid of every execution with a status
   glyph in the gutter. The populated side is `ib`; `trader` is
   empty (awaiting source) and renders the `missCell` label. */
export function ExecCompare({
  execs, leftLabel = "Trader", rightLabel = "IB", terms = TI_TERMS, className,
}: {
  execs: ExecRowData[];
  leftLabel?: string;
  rightLabel?: string;
  terms?: ExecTerms;
  className?: string;
}) {
  const tN = execs.filter((e) => e.trader).length;
  const iN = execs.filter((e) => e.ib).length;
  const countMatch = tN === iN;
  const fill = (v: ExecSide | null, right: boolean) => (
    <div className={`min-w-0 px-3 py-[7px] ${right ? "text-right" : "text-left"}`}>
      {v ? (
        <>
          <div className="text-[12.5px] font-semibold tabular-nums text-on-surface">{v.qty} @ {v.px}</div>
          <div className="mt-px text-[11px] tabular-nums text-secondary">{v.time}</div>
        </>
      ) : (
        <div className="text-[11.5px] italic" style={{ color: "#b1402f" }}>{terms.missCell}</div>
      )}
    </div>
  );
  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center gap-[9px]">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-secondary">Executions</span>
        <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: countMatch ? "#2f7a47" : "#93000a" }}>
          {leftLabel} {tN} ↔ {rightLabel} {iN}
        </span>
        <Chip tone={countMatch ? "active" : "failed"} dot={false}>{countMatch ? terms.countOk : terms.countBad}</Chip>
      </div>
      <div className="overflow-hidden rounded-[10px] border border-outline-variant">
        <div className="grid grid-cols-[1fr_36px_1fr] border-b border-outline-variant bg-surface-low">
          <ExecCellHead>{leftLabel} fill</ExecCellHead>
          <div />
          <ExecCellHead right>{rightLabel} fill</ExecCellHead>
        </div>
        {execs.map((e, i) => {
          const g = EX_GLYPH[e.state] ?? EX_GLYPH.ok;
          const GIcon = g.icon;
          const tint = e.state === "ok" ? "transparent" : e.state === "miss" ? "rgba(186,26,26,0.05)" : "rgba(242,116,5,0.06)";
          return (
            <div
              key={e.id || i}
              className={`grid grid-cols-[1fr_36px_1fr] items-center ${i ? "border-t border-outline-variant" : ""}`}
              style={{ background: tint }}
            >
              {fill(e.trader, false)}
              <div className="flex justify-center">
                <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ background: g.bg, color: g.fg }}>
                  <GIcon size={11} strokeWidth={2.25} />
                </span>
              </div>
              {fill(e.ib, true)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---- numeric helpers for the order-level rollup (VWAP etc.) - */
function parseNum(s: string | undefined): number | null {
  return s == null ? null : Number(String(s).replace(/[^0-9.\-]/g, ""));
}
function fmtQtyAgg(n: number): string { return n.toLocaleString("en-US"); }
function fmtPxAgg(n: number): string {
  let s = n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  const dot = s.indexOf(".");
  if (dot === -1) s += ".00";
  else if (s.length - dot - 1 < 2) s += "0".repeat(2 - (s.length - dot - 1));
  return "$" + s;
}
function fmtAmtAgg(n: number): string { return "$" + Math.round(n).toLocaleString("en-US"); }
function aggSide(execs: ExecRowData[], side: "trader" | "ib") {
  const fills = execs.map((e) => e[side]).filter((v): v is ExecSide => !!v);
  let sumQty = 0, notional = 0;
  fills.forEach((v) => {
    const q = parseNum(v.qty) ?? 0;
    const p = parseNum(v.px) ?? 0;
    sumQty += q; notional += q * p;
  });
  return { count: fills.length, sumQty, notional, vwap: sumQty ? notional / sumQty : 0 };
}

/* ---- ExecRow — one expandable execution → its own compare card
   Break/missing executions open by default. The populated side is
   `ib`; the `trader` counterpart is empty (awaiting source). */
export function ExecRow({
  e, idx, leftLabel, rightLabel, terms = TI_TERMS,
}: {
  e: ExecRowData;
  idx: number;
  leftLabel: string;
  rightLabel: string;
  terms?: ExecTerms;
}) {
  const [open, setOpen] = useState(e.state !== "ok");
  const g = EX_GLYPH[e.state] ?? EX_GLYPH.ok;
  const GIcon = g.icon;
  const summ = (v: ExecSide | null) => (v ? `${v.qty} @ ${v.px}` : terms.missCell);
  const fields: CompareField[] = [
    { k: "Quantity", iv: e.trader ? e.trader.qty : "—", cv: e.ib ? e.ib.qty : "—", d: !e.ib || !!(e.trader && e.ib && e.trader.qty !== e.ib.qty) },
    { k: "Price",    iv: e.trader ? e.trader.px : "—",  cv: e.ib ? e.ib.px : "—",  d: !e.ib || !!(e.trader && e.ib && e.trader.px !== e.ib.px) },
    { k: "Time",     iv: e.trader ? e.trader.time : "—", cv: e.ib ? e.ib.time : "—", d: !e.ib },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`grid w-full cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 px-[13px] py-[9px] text-left ${open ? "bg-surface-low" : "bg-transparent"}`}
      >
        <span className="flex items-center gap-2">
          <span className="flex text-secondary transition-transform duration-150" style={{ transform: open ? "rotate(90deg)" : "none" }}>
            <ChevronRight size={14} strokeWidth={2.25} />
          </span>
          <span className="whitespace-nowrap text-[12.5px] font-bold text-on-surface">Execution {idx + 1}</span>
        </span>
        <span className="flex min-w-0 items-center justify-center gap-[9px] tabular-nums">
          <span className="text-[12px] font-semibold text-on-surface">{summ(e.trader)}</span>
          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full" style={{ background: g.bg, color: g.fg }}>
            <GIcon size={10} strokeWidth={2.25} />
          </span>
          <span
            className={`text-[12px] font-semibold ${e.ib ? "not-italic text-on-surface" : "italic"}`}
            style={e.ib ? undefined : { color: "#b1402f" }}
          >
            {e.ib ? summ(e.ib) : terms.missCell}
          </span>
        </span>
        <Chip tone={EX_ST_TONE[e.state] ?? "active"} dot={false}>{terms[e.state] ?? terms.ok}</Chip>
      </button>
      {open && (
        <div className="border-t border-outline-variant">
          <div className="grid grid-cols-2 border-b border-outline-variant">
            <div className="border-r border-outline-variant px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.04em] text-secondary">{leftLabel}</div>
            <div className="px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.04em] text-secondary">{rightLabel}</div>
          </div>
          {fields.map((f, j) => {
            const cellBg = f.d ? "rgba(186,26,26,0.05)" : "transparent";
            const valCls = f.d ? "font-bold" : "font-medium";
            const valColor = f.d ? "#93000a" : "var(--on-surface)";
            const borderTop = j ? "border-t border-outline-variant" : "";
            return (
              <div key={j} className="grid grid-cols-2">
                <div className={`border-r border-outline-variant px-3.5 py-[9px] ${borderTop}`} style={{ background: cellBg }}>
                  <div className="mb-[3px] text-[10px] font-bold uppercase tracking-[0.04em] text-secondary">{f.k}</div>
                  <div className={`text-[13.5px] tabular-nums ${valCls}`} style={{ color: valColor }}>{f.iv}</div>
                </div>
                <div className={`px-3.5 py-[9px] ${borderTop}`} style={{ background: cellBg }}>
                  <div className="mb-[3px] text-[10px] font-bold uppercase tracking-[0.04em] text-secondary">{f.k}</div>
                  <div className={`text-[13.5px] tabular-nums ${valCls}`} style={{ color: valColor }}>{f.cv}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---- OrderExecBreakdown — an order's per-execution comparison
   An order-level rollup (executions count, VWAP, total qty, trade
   amount) DERIVED from the executions, then every execution as an
   expandable ExecRow. The trader side aggregates to nothing today
   (awaiting source); the stored-IB side is populated. */
export function OrderExecBreakdown({
  execs, leftLabel = "Trader", rightLabel = "IB", terms = TI_TERMS,
  leftTag = "expected", rightTag = "actual",
}: {
  execs: ExecRowData[];
  leftLabel?: string;
  rightLabel?: string;
  terms?: ExecTerms;
  leftTag?: string;
  rightTag?: string;
}) {
  const T = aggSide(execs, "trader");
  const I = aggSide(execs, "ib");
  const countMatch = T.count === I.count;
  const orderFields: CompareField[] = [
    { k: "Executions", iv: String(T.count), cv: String(I.count), d: T.count !== I.count },
    { k: "Average price (VWAP)", iv: fmtPxAgg(T.vwap), cv: fmtPxAgg(I.vwap), d: Math.abs(T.vwap - I.vwap) >= 0.00005 },
    { k: "Total quantity", iv: fmtQtyAgg(T.sumQty), cv: fmtQtyAgg(I.sumQty), d: T.sumQty !== I.sumQty },
    { k: "Trade amount", iv: fmtAmtAgg(T.notional), cv: fmtAmtAgg(I.notional), d: Math.round(T.notional) !== Math.round(I.notional) },
  ];
  return (
    <>
      <Eyebrow>Order-level comparison</Eyebrow>
      <CompareGrid fields={orderFields} leftLabel={`${leftLabel} · ${leftTag}`} rightLabel={`${rightLabel} · ${rightTag}`} />
      <div className="mb-[18px] mt-[-10px] text-[11.5px] text-secondary">
        Trade amount = average price × total quantity, aggregated across every execution.
      </div>

      <div className="mb-2.5 flex flex-wrap items-center gap-[9px]">
        <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">Executions</span>
        <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: countMatch ? "#2f7a47" : "#93000a" }}>
          {leftLabel} {T.count} ↔ {rightLabel} {I.count}
        </span>
        <Chip tone={countMatch ? "active" : "failed"} dot={false}>{countMatch ? terms.countOk : terms.countBad}</Chip>
      </div>
      <div className="mb-[18px] flex flex-col gap-2.5">
        {execs.map((e, i) => (
          <ExecRow key={e.id || i} e={e} idx={i} leftLabel={leftLabel} rightLabel={rightLabel} terms={terms} />
        ))}
      </div>
    </>
  );
}

/* ============================================================
   INTEGRITY TRIAGE (IB ↔ CRM · the `ic` leg)

   IB↔CRM is NOT a trade match. It is a SET-MEMBERSHIP check over
   the two stored IB Flex exports: Activity (AF) and Trade Confirms
   (TCF). The C1 reframe (001 §6) replaces the old live-sync model
   (synced/stale/drift) with plain set membership:
     both             — present in BOTH Activity & Trade Confirms
     activityOnly     — in Activity only
     tradeConfirmOnly — in Trade Confirms only
   There is NO invented live-fetch timeline.
   ============================================================ */

/* INTEG — IntegrityState → label / tone / icon / explanatory copy.
   Keyed on the C1 IntegrityState set-membership values. */
export const INTEG: Record<IntegrityState, {
  label: string; tone: ChipTone; icon: LucideIcon; bg: string; fg: string;
  head: string; msg: string;
}> = {
  both: {
    label: "In both", tone: "active", icon: Check, bg: "#e3f1e7", fg: "#2f7a47",
    head: "In Activity & Trade Confirms",
    msg: "This record appears in both IB Flex exports — the Activity (AF) feed and the Trade Confirmations (TCF) feed.",
  },
  activityOnly: {
    label: "Activity only", tone: "warm", icon: Layers, bg: "#fdeccd", fg: "#b9741f",
    head: "In Activity only",
    msg: "This record appears in the Activity (AF) export but has no counterpart in the Trade Confirmations (TCF) export.",
  },
  tradeConfirmOnly: {
    label: "Trade Confirms only", tone: "warm", icon: Database, bg: "#fdeccd", fg: "#b9741f",
    head: "In Trade Confirms only",
    msg: "This record appears in the Trade Confirmations (TCF) export but has no counterpart in the Activity (AF) export.",
  },
};

/* ---- IntegrityCompare — field grid for the integrity leg ----
   Activity (AF) vs Trade Confirms (TCF). Only the right (TCF) cell
   is flagged when a field differs; AF is shown as the left source. */
export function IntegrityCompare({ fields }: { fields: CompareField[] }) {
  const Head = ({ children, l, tag }: { children: ReactNode; l?: boolean; tag: string }) => (
    <div className={`flex items-center justify-between gap-2 bg-surface-low px-3.5 py-[9px] ${l ? "border-r border-outline-variant" : ""}`}>
      <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">{children}</span>
      <span className="text-[9.5px] font-bold uppercase tracking-[0.04em]" style={{ color: l ? "#2f7a47" : "var(--secondary)" }}>{tag}</span>
    </div>
  );
  return (
    <div className="mb-[18px] overflow-hidden rounded-xl border border-outline-variant">
      <div className="grid grid-cols-2 border-b border-outline-variant">
        <Head l tag="Activity feed">IB · Activity</Head>
        <Head tag="Trade Confirms feed">IB · Trade Confirms</Head>
      </div>
      {fields.map((f, i) => {
        const borderTop = i ? "border-t border-outline-variant" : "";
        const cell = (val: string, l: boolean) => (
          <div
            className={`px-3.5 py-2.5 ${l ? "border-r border-outline-variant" : ""} ${borderTop}`}
            style={{ background: !l && f.d ? "rgba(242,116,5,0.08)" : "transparent" }}
          >
            <div className="mb-[3px] text-[10.5px] font-bold uppercase tracking-[0.04em] text-secondary">{f.k}</div>
            <div
              className={`text-[14px] tabular-nums ${f.d ? "font-bold" : "font-medium"}`}
              style={{ color: !l && f.d ? "#8a5a16" : "var(--on-surface)" }}
            >
              {val}
            </div>
          </div>
        );
        return (
          <div key={i} className="grid grid-cols-2">
            {cell(f.iv, true)}
            {cell(f.cv, false)}
          </div>
        );
      })}
    </div>
  );
}

/* ---- SyncMeta — set-membership metadata strip --------------
   Carries the integrity metadata faithfully to the design layout,
   but reframed to set membership — NO invented live-fetch timeline.
   Reports which export sets the record is present in. */
export function SyncMeta({ integrity }: { integrity: IntegrityState }) {
  const inActivity = integrity === "both" || integrity === "activityOnly";
  const inTradeConfirms = integrity === "both" || integrity === "tradeConfirmOnly";
  const row = (label: string, val: string) => (
    <div className="flex items-baseline justify-between gap-3 py-[7px]">
      <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-secondary">{label}</span>
      <span className="text-right text-[13px] font-semibold tabular-nums text-on-surface">{val}</span>
    </div>
  );
  return (
    <div className="mb-4 rounded-xl border border-outline-variant px-3.5 py-1">
      {row("Activity (AF) export", inActivity ? "present" : "not present")}
      <div className="h-px bg-outline-variant" />
      {row("Trade Confirms (TCF) export", inTradeConfirms ? "present" : "not present")}
    </div>
  );
}

/* ---- IntegrityDetail — the `ic` leg triage view ------------
   Renders the set-membership verdict, an explanatory banner, the
   SyncMeta presence strip, and either the per-execution breakdown
   (set-membership terms) or the field comparison grid. */
export function IntegrityDetail({
  leg, trade, onClose,
}: {
  leg: ReconLeg;
  trade: Pick<ReconTrade, "inst" | "ib" | "crm">;
  onClose: () => void;
}) {
  const integrity: IntegrityState = leg.integrity ?? "both";
  const cfg = INTEG[integrity] ?? INTEG.both;
  const ok = integrity === "both";
  const title = leg.integrityType || cfg.head;
  const CfgIcon = cfg.icon;
  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[16px] font-bold leading-[1.3] text-on-surface">{title} · {trade.inst}</div>
          <div className="mt-1 text-[12.5px] text-secondary">
            Data-integrity check · {trade.ib || "no Activity record"}{" "}
            <span style={{ color: "var(--primary)" }}>→</span> {trade.crm || "no Trade-Confirm record"}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Chip tone={cfg.tone} dot={false}>{cfg.label}</Chip>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex rounded-md p-[3px] text-secondary transition-colors hover:bg-surface-container"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* what this check means */}
      <div
        className="mb-4 flex items-start gap-2.5 rounded-[10px] border border-outline-variant px-[13px] py-[11px]"
        style={{ background: ok ? "#eef6f0" : "var(--surface-low)" }}
      >
        <span className="mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full" style={{ background: cfg.bg, color: cfg.fg }}>
          <CfgIcon size={13} strokeWidth={2.25} />
        </span>
        <span className="text-[12.5px] leading-[1.45] text-on-surface">{cfg.msg}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <Eyebrow>Set membership</Eyebrow>
        <SyncMeta integrity={integrity} />
        {leg.execs && leg.execs.length > 0 ? (
          <OrderExecBreakdown
            execs={leg.execs}
            leftLabel="IB · Activity"
            rightLabel="IB · Trade Confirms"
            terms={IC_TERMS}
            leftTag="Activity feed"
            rightTag="Trade Confirms feed"
          />
        ) : (
          <>
            <Eyebrow>Field comparison</Eyebrow>
            <IntegrityCompare fields={leg.fields} />
          </>
        )}
      </div>

      {/* actions */}
      <div className="mt-3.5 shrink-0 border-t border-outline-variant pt-3.5">
        {ok ? (
          <div className="flex items-center justify-between gap-2.5">
            <span className="flex items-center gap-2 text-[13px] text-secondary">
              <Check size={15} strokeWidth={2} color="#16a34a" /> Present in both Activity &amp; Trade Confirms.
            </span>
            <Button variant="secondary" icon={RefreshCw} className="px-3 py-[9px]">Re-check</Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            <Button variant="secondary" icon={UserRound} className="min-w-0 flex-1 px-2.5 py-[9px]">Assign</Button>
            <Button variant="secondary" icon={MessageSquare} className="min-w-0 flex-1 px-2.5 py-[9px]">Comment</Button>
            <Button variant="secondary" icon={ArrowUpRight} className="min-w-0 flex-1 px-2.5 py-[9px]">Escalate</Button>
            <Button icon={ShieldAlert} className="min-w-0 flex-1 px-2.5 py-[9px]">Raise</Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- Triage detail (reused: recon line OR exception) -------
   Carried-over path: a legacy ReconLine OR an Exception.
   C1 path: pass `leg` + `trade` to route an integrity (ic) leg to
   IntegrityDetail, or render the order-level CompareGrid PLUS the
   OrderExecBreakdown for a trade (ti) leg. */
export function ReconLegTriage({
  leg, trade, onClose,
}: {
  leg: ReconLeg;
  trade: Pick<ReconTrade, "inst" | "ib" | "trader" | "crm">;
  onClose: () => void;
}) {
  // integrity (ic) leg → set-membership view
  if (leg.integrity != null) {
    return <IntegrityDetail leg={leg} trade={trade} onClose={onClose} />;
  }

  const matched = leg.state === "ok";
  const title = matched ? "Matched" : leg.breakType ?? "Break";
  const sub = `${trade.trader || "awaiting trader source"} ↔ ${trade.ib || "no IB record"}`;
  const tone: ChipTone = leg.state === "ok" ? "active" : leg.state === "brk" ? "warm" : "failed";
  const label = leg.state === "ok" ? "Matched" : leg.state === "brk" ? "Break" : "Unmatched";
  const hasExecs = !!leg.execs && leg.execs.length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[16px] font-bold leading-[1.3] text-on-surface">{title} · {trade.inst}</div>
          <div className="mt-1 text-[12.5px] text-secondary">{sub}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Chip tone={tone} dot={false}>{label}</Chip>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex rounded-md p-[3px] text-secondary transition-colors hover:bg-surface-container"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {/* order-level CompareGrid PLUS the per-execution breakdown */}
        <Eyebrow>Order-level comparison</Eyebrow>
        <CompareGrid fields={leg.fields} leftLabel="Trader blotter" rightLabel="Interactive Brokers (IB)" />
        {hasExecs && (
          <OrderExecBreakdown
            execs={leg.execs as ExecRowData[]}
            leftLabel="Trader"
            rightLabel="IB"
          />
        )}
        {!matched && <Eyebrow className="mt-1">Raise exception</Eyebrow>}
      </div>

      {/* actions */}
      <div className="mt-3.5 shrink-0 border-t border-outline-variant pt-3.5">
        {matched ? (
          <div className="flex items-center gap-2 text-[13px] text-secondary">
            <Check size={15} strokeWidth={2} color="#16a34a" /> All fields match on this trade.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            <Button variant="secondary" icon={UserRound} className="min-w-0 flex-1 px-2.5 py-[9px]">Assign</Button>
            <Button variant="secondary" icon={MessageSquare} className="min-w-0 flex-1 px-2.5 py-[9px]">Comment</Button>
            <Button variant="secondary" icon={ArrowUpRight} className="min-w-0 flex-1 px-2.5 py-[9px]">Escalate</Button>
            <Button icon={ShieldAlert} className="min-w-0 flex-1 px-2.5 py-[9px]">Raise</Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- Triage detail (reused: recon line OR exception) ------- */
/* Legacy carried-over props (ReconLine / Exception). */
type TriageLegacyProps = {
  item: ReconLine | Exception;
  kind: "recon" | "exception";
  onClose: () => void;
  leg?: undefined;
  trade?: undefined;
};
/* C1 props — bind to a ReconLeg + its parent ReconTrade. An `ic`
   leg routes to IntegrityDetail; a `ti` leg renders the order-level
   CompareGrid PLUS the OrderExecBreakdown. */
type TriageLegProps = {
  leg: ReconLeg;
  trade: Pick<ReconTrade, "inst" | "ib" | "trader" | "crm">;
  onClose: () => void;
  item?: undefined;
  kind?: undefined;
};

export function TriageDetail(props: TriageLegacyProps | TriageLegProps) {
  // C1 path — route a ReconLeg (ti → exec breakdown, ic → integrity).
  if (props.leg) {
    return <ReconLegTriage leg={props.leg} trade={props.trade} onClose={props.onClose} />;
  }
  const { item, kind, onClose } = props;
  const isRecon = kind === "recon";
  const reconItem = item as ReconLine;
  const excItem = item as Exception;
  const matched = isRecon && reconItem.state === "ok";

  let title: string;
  let sub: string;
  let chip: ReactNode;
  if (isRecon) {
    title = matched ? "Matched" : reconItem.breakType ?? "Break";
    sub = `${reconItem.intRef || "no internal record"} · ${reconItem.cusRef || "no custodian record"}`;
    const tone = reconItem.state === "ok" ? "active" : reconItem.state === "brk" ? "warm" : "failed";
    const label = reconItem.state === "ok" ? "Matched" : reconItem.state === "brk" ? "Break" : "Unmatched";
    chip = <Chip tone={tone} dot={false}>{label}</Chip>;
  } else {
    title = excItem.type;
    sub = `Raised ${excItem.raised} · ${excItem.srcRef} · from Trade Reconciliation`;
    chip = <Chip tone={SEV_TONE[excItem.sev]} dot={false}>{SEV_LABEL[excItem.sev]}</Chip>;
  }

  const carried = !isRecon && excItem.carried;

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[16px] font-bold leading-[1.3] text-on-surface">{title} · {item.inst}</div>
          <div className="mt-1 text-[12.5px] text-secondary">{sub}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {chip}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex rounded-md p-[3px] text-secondary transition-colors hover:bg-surface-container"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* carried-forward banner */}
      {carried && (
        <div
          className="mb-4 flex items-center gap-2.5 rounded-[10px] px-[13px] py-2.5"
          style={{ background: "#fff3e1", border: "1px solid #f3d9b4" }}
        >
          <span className="flex shrink-0" style={{ color: "#b9741f" }}>
            <Clock size={15} strokeWidth={2} />
          </span>
          <span className="text-[12.5px] font-semibold" style={{ color: "#8a5a16" }}>
            Carried forward {excItem.age} · resolve before today&apos;s 18:00 settlement cutoff
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <CompareGrid fields={item.fields} />

        {/* audit trail (exceptions only) */}
        {!isRecon && excItem.trail && (
          <div className="mb-1">
            <Eyebrow>Audit trail</Eyebrow>
            <div className="relative pl-[18px]">
              <span className="absolute bottom-2 left-1 top-1 w-[1.5px] bg-outline-variant" />
              {excItem.trail.map((x, i) => (
                <div key={i} className="relative" style={{ paddingBottom: i < excItem.trail.length - 1 ? 14 : 0 }}>
                  <span
                    className="absolute left-[-18px] top-[3px] h-[9px] w-[9px] rounded-full"
                    style={{
                      background: x.acc ? "var(--primary)" : "var(--surface-highest)",
                      border: `1.5px solid ${x.acc ? "var(--primary)" : "var(--outline)"}`,
                    }}
                  />
                  <div className="text-[13px] font-bold text-on-surface">{x.t}</div>
                  <div className="mt-px text-[12px] text-secondary">{x.d}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {isRecon && !matched && <Eyebrow className="mt-1">Raise exception</Eyebrow>}
      </div>

      {/* actions */}
      <div className="mt-3.5 shrink-0 border-t border-outline-variant pt-3.5">
        {matched ? (
          <div className="flex items-center gap-2 text-[13px] text-secondary">
            <Check size={15} strokeWidth={2} color="#16a34a" /> All fields match on this trade.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            <Button variant="secondary" icon={UserRound} className="min-w-0 flex-1 px-2.5 py-[9px]">Assign</Button>
            <Button variant="secondary" icon={MessageSquare} className="min-w-0 flex-1 px-2.5 py-[9px]">Comment</Button>
            <Button variant="secondary" icon={ArrowUpRight} className="min-w-0 flex-1 px-2.5 py-[9px]">Escalate</Button>
            <Button icon={isRecon ? ShieldAlert : Check} className="min-w-0 flex-1 px-2.5 py-[9px]">
              {isRecon ? "Raise" : "Resolve"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}