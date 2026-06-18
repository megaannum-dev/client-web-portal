"use client";

/* ============================================================
   MOBO shared scaffolding & primitives
   MetricStat · SegBar · CompareGrid · Eyebrow · TriageDetail
   Ported from the design handoff (MoboShared.jsx).
   ============================================================ */

import { useState, type ReactNode } from "react";
import {
  X, Clock, Check, UserRound, MessageSquare, ArrowUpRight, ShieldAlert,
  ChevronRight, Unlink, RefreshCw, Database, TriangleAlert, Workflow, Flag, Trash2,
} from "@/lib/icons";
import type { LucideIcon } from "lucide-react";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import { Button } from "@/components/ui/Button";
/* C1 view-layer contract — the EXACT shapes the triage primitives bind to.
   SEV_LABEL/SEV_TONE + CompareField/Exception now live in the type layer
   (the mock no longer re-exports them; ReconLine is removed entirely). */
import {
  SEV_LABEL, SEV_TONE,
  type CompareField,
  type Exception,
  type ExecRow as ExecRowData,
  type ExecSide,
  type IntegrityState,
  type MatchState,
  type ReconLeg,
  type ReconTrade,
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
    <div className="mb-[18px] overflow-hidden rounded-md border border-outline-variant">
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
  ok: "In sync", brk: "Drifted", miss: "Missing",
  countOk: "Counts match", countBad: "Count mismatch", missCell: "not in store",
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
  // one side has no fills (awaiting source) — not a count break
  const leftAbsent = tN === 0 && iN > 0;
  const rightAbsent = iN === 0 && tN > 0;
  const oneSided = leftAbsent || rightAbsent;
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
        {oneSided ? (
          <>
            <span className="text-[12.5px] font-semibold tabular-nums text-secondary">
              {rightAbsent ? `${leftLabel} ${tN} · ${rightLabel} awaiting` : `${leftLabel} awaiting · ${rightLabel} ${iN}`}
            </span>
            <Chip tone="review" dot={false}>Awaiting source</Chip>
          </>
        ) : (
          <>
            <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: countMatch ? "#2f7a47" : "#93000a" }}>
              {leftLabel} {tN} ↔ {rightLabel} {iN}
            </span>
            <Chip tone={countMatch ? "active" : "failed"} dot={false}>{countMatch ? terms.countOk : terms.countBad}</Chip>
          </>
        )}
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
  const counterpartAwaiting = !e.trader && !!e.ib; // trader side awaiting source — not a break
  const fields: CompareField[] = [
    { k: "Quantity", iv: e.trader ? e.trader.qty : "—", cv: e.ib ? e.ib.qty : "—", d: !counterpartAwaiting && (!e.ib || !!(e.trader && e.ib && e.trader.qty !== e.ib.qty)) },
    { k: "Price",    iv: e.trader ? e.trader.px : "—",  cv: e.ib ? e.ib.px : "—",  d: !counterpartAwaiting && (!e.ib || !!(e.trader && e.ib && e.trader.px !== e.ib.px)) },
    { k: "Time",     iv: e.trader ? e.trader.time : "—", cv: e.ib ? e.ib.time : "—", d: !counterpartAwaiting && (!e.ib || !!(e.trader && e.ib && e.trader.time !== e.ib.time)) },
    { k: "Trade ID", iv: e.trader?.tradeID ?? "—", cv: e.ib?.tradeID ?? "—", d: false },
  ];
  return (
    <div className="overflow-hidden rounded-md border border-outline-variant">
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
  leftTag = "expected", rightTag = "actual", attrFields = [],
}: {
  execs: ExecRowData[];
  leftLabel?: string;
  rightLabel?: string;
  terms?: ExecTerms;
  leftTag?: string;
  rightTag?: string;
  /** Added order-level attribute fields appended to the derived rollup. */
  attrFields?: CompareField[];
}) {
  const T = aggSide(execs, "trader");
  const I = aggSide(execs, "ib");
  const countMatch = T.count === I.count;
  // one side has no fills (awaiting source) — show "—", never a false diff
  const leftAbsent = T.count === 0 && I.count > 0;
  const rightAbsent = I.count === 0 && T.count > 0;
  const oneSided = leftAbsent || rightAbsent;
  // a derived field row that honours an absent (awaiting) side
  const mk = (k: string, tv: string, iv: string, diff: boolean): CompareField =>
    leftAbsent ? { k, iv: "—", cv: iv, d: false }
      : rightAbsent ? { k, iv: tv, cv: "—", d: false }
        : { k, iv: tv, cv: iv, d: diff };
  const orderFields: CompareField[] = [
    mk("Executions", String(T.count), String(I.count), T.count !== I.count),
    mk("Average price (VWAP)", fmtPxAgg(T.vwap), fmtPxAgg(I.vwap), Math.abs(T.vwap - I.vwap) >= 0.00005),
    mk("Total quantity", fmtQtyAgg(T.sumQty), fmtQtyAgg(I.sumQty), T.sumQty !== I.sumQty),
    mk("Trade amount", fmtAmtAgg(T.notional), fmtAmtAgg(I.notional), Math.round(T.notional) !== Math.round(I.notional)),
    ...attrFields,
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
        {oneSided ? (
          <>
            <span className="text-[12.5px] font-semibold tabular-nums text-secondary">
              {rightAbsent ? `${leftLabel} ${T.count} · ${rightLabel} awaiting` : `${leftLabel} awaiting · ${rightLabel} ${I.count}`}
            </span>
            <Chip tone="review" dot={false}>Awaiting source</Chip>
          </>
        ) : (
          <>
            <span className="text-[12.5px] font-semibold tabular-nums" style={{ color: countMatch ? "#2f7a47" : "#93000a" }}>
              {leftLabel} {T.count} ↔ {rightLabel} {I.count}
            </span>
            <Chip tone={countMatch ? "active" : "failed"} dot={false}>{countMatch ? terms.countOk : terms.countBad}</Chip>
          </>
        )}
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

   IB↔CRM is NOT a trade match. It validates the stored CRM copy
   against the live IB record — IB is the source of truth. This is
   the ORIGINAL Claude-Design model; the storage shape
   (ib_activity / ib_trades) is a DB concern and is NOT surfaced.
   States: synced · stale · drift · missingDb · orphaned.
   ============================================================ */

/* INTEG — IntegrityState → label / tone / icon / explanatory copy. */
export const INTEG: Record<IntegrityState, {
  label: string; tone: ChipTone; icon: LucideIcon; bg: string; fg: string;
  head: string; msg: string;
}> = {
  synced: {
    label: "In sync", tone: "active", icon: Check, bg: "#e3f1e7", fg: "#2f7a47",
    head: "In sync",
    msg: "The stored copy matches the live IB record field-for-field.",
  },
  stale: {
    label: "Stale", tone: "review", icon: Clock, bg: "#eef0f2", fg: "#6b6a6a",
    head: "Stale copy",
    msg: "Values still match, but the stored copy is older than the freshness window.",
  },
  drift: {
    label: "Drifted", tone: "warm", icon: TriangleAlert, bg: "#fdeccd", fg: "#b9741f",
    head: "Stored value drifted",
    msg: "A stored field no longer matches the live IB value — the copy is stale or was corrupted on ingest.",
  },
  missingDb: {
    label: "Missing in DB", tone: "failed", icon: Database, bg: "#f7ddd6", fg: "#b1402f",
    head: "Missing in store",
    msg: "Live IB returns this record, but the ingest pipeline never stored it. The store has a gap.",
  },
  orphaned: {
    label: "Orphaned", tone: "failed", icon: Unlink, bg: "#f7ddd6", fg: "#b1402f",
    head: "Orphaned in store",
    msg: "The stored record has no live IB counterpart — it was likely cancelled or amended upstream after ingest.",
  },
};

/* ---- IntegrityCompare — field grid for the integrity leg ----
   Live IB (source of truth) vs the stored CRM copy. Only the right
   (stored) cell is flagged when a field differs; live IB is the
   left source of truth. */
export function IntegrityCompare({ fields }: { fields: CompareField[] }) {
  const Head = ({ children, l, tag }: { children: ReactNode; l?: boolean; tag: string }) => (
    <div className={`flex items-center justify-between gap-2 bg-surface-low px-3.5 py-[9px] ${l ? "border-r border-outline-variant" : ""}`}>
      <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">{children}</span>
      <span className="text-[9.5px] font-bold uppercase tracking-[0.04em]" style={{ color: l ? "#2f7a47" : "var(--secondary)" }}>{tag}</span>
    </div>
  );
  return (
    <div className="mb-[18px] overflow-hidden rounded-md border border-outline-variant">
      <div className="grid grid-cols-2 border-b border-outline-variant">
        <Head l tag="source of truth">IB API · live</Head>
        <Head tag="the copy">CRM · stored</Head>
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

/* ---- SyncMeta — live-vs-stored sync timeline ---------------
   When the live IB record was last fetched, and when the stored
   copy was last synced. A stale copy surfaces its age. */
export function SyncMeta({ leg }: { leg: ReconLeg }) {
  const row = (label: string, val: string) => (
    <div className="flex items-baseline justify-between gap-3 py-[7px]">
      <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-secondary">{label}</span>
      <span className="text-right text-[13px] font-semibold tabular-nums text-on-surface">{val}</span>
    </div>
  );
  return (
    <div className="mb-4 rounded-md border border-outline-variant px-3.5 py-1">
      {row("Live IB fetched", leg.fetchAt || "—")}
      <div className="h-px bg-outline-variant" />
      {row("Stored copy synced", leg.syncAt || "never — not in store")}
      {leg.stale && (
        <>
          <div className="h-px bg-outline-variant" />
          <div className="flex items-center justify-between gap-3 py-[7px]">
            <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-secondary">Freshness</span>
            <Chip tone="review" dot={false}>Stale · {leg.staleAge ?? "past window"}</Chip>
          </div>
        </>
      )}
    </div>
  );
}

/* per-integrity-state action buttons (original Claude-Design). */
const INTEG_ACTIONS: Record<IntegrityState, { label: string; icon: LucideIcon; primary?: boolean }[]> = {
  synced:    [{ label: "Re-fetch from IB", icon: RefreshCw }],
  stale:     [{ label: "Re-sync from IB", icon: RefreshCw, primary: true }, { label: "View pipeline run", icon: Workflow }],
  drift:     [{ label: "Re-sync from IB", icon: RefreshCw, primary: true }, { label: "View pipeline run", icon: Workflow }, { label: "Raise exception", icon: ShieldAlert }],
  missingDb: [{ label: "Backfill into store", icon: Database, primary: true }, { label: "View pipeline run", icon: Workflow }],
  orphaned:  [{ label: "Flag for review", icon: Flag, primary: true }, { label: "Remove from store", icon: Trash2 }],
};

/* ---- IntegrityDetail — the `ic` leg triage view ------------
   Validates the stored CRM copy against the live IB record (IB is
   the source of truth). Renders the verdict, an explanatory banner,
   the sync timeline, and the SAME order-level comparison table as
   the Trader-vs-IB leg (OrderExecBreakdown), then per-state actions. */
export function IntegrityDetail({
  leg, trade, onClose,
}: {
  leg: ReconLeg;
  trade: Pick<ReconTrade, "inst" | "ib" | "crm">;
  onClose: () => void;
}) {
  const integrity: IntegrityState = leg.integrity ?? "synced";
  const cfg = INTEG[integrity] ?? INTEG.synced;
  const ok = integrity === "synced";
  const title = leg.integrityType || cfg.head;
  const CfgIcon = cfg.icon;
  const liveRef = integrity === "orphaned" ? null : trade.ib;
  const storedRef = integrity === "missingDb" ? null : trade.crm;
  const actions = INTEG_ACTIONS[integrity] ?? [];
  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[16px] font-bold leading-[1.3] text-on-surface">{title} · {trade.inst}</div>
          <div className="mt-1 text-[12.5px] text-secondary">
            Data-integrity check · {liveRef || "no live record"}{" "}
            <span style={{ color: "var(--primary)" }}>→</span> {storedRef || "not in store"}
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
        <Eyebrow>Sync timeline</Eyebrow>
        <SyncMeta leg={leg} />
        {leg.execs && leg.execs.length > 0 ? (
          <OrderExecBreakdown
            execs={leg.execs}
            leftLabel="IB · live"
            rightLabel="CRM · stored"
            terms={IC_TERMS}
            leftTag="source of truth"
            rightTag="stored copy"
            attrFields={leg.fields}
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
              <Check size={15} strokeWidth={2} color="#16a34a" /> Stored copy verified against live IB.
            </span>
            <Button variant="secondary" icon={RefreshCw} className="px-3 py-[9px]">Re-fetch</Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {actions.map((a, i) => (
              <Button
                key={i}
                variant={a.primary ? undefined : "secondary"}
                icon={a.icon}
                className="min-w-0 flex-1 px-2.5 py-[9px]"
              >
                {a.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- Triage detail (reused: recon line OR exception) -------
   C1 path: pass `leg` + `trade` to route an integrity (ic) leg to
   IntegrityDetail, or render a SINGLE order-level comparison table
   (OrderExecBreakdown) for a trade (ti) leg. */
export function ReconLegTriage({
  leg, trade, onClose,
}: {
  leg: ReconLeg;
  trade: Pick<ReconTrade, "inst" | "ib" | "trader" | "crm">;
  onClose: () => void;
}) {
  // integrity (ic) leg → live-vs-stored data-integrity view
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
        {/* ONE order-level comparison: derived rollup + the added attribute
            fields, then the per-execution breakdown. No duplicate grid. */}
        {hasExecs ? (
          <OrderExecBreakdown
            execs={leg.execs as ExecRowData[]}
            leftLabel="Trader"
            rightLabel="IB"
            attrFields={leg.fields}
          />
        ) : (
          <>
            <Eyebrow>Order-level comparison</Eyebrow>
            <CompareGrid fields={leg.fields} leftLabel="Trader" rightLabel="IB" />
          </>
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

/* ---- Triage detail (reused: ReconLeg OR daily Exception) ----
   The C1 recon path binds to a ReconLeg + its parent ReconTrade
   (the OLD `kind="recon"` / ReconLine branch is fully superseded by
   it and removed). The legacy carried-over path remains only for the
   daily Exception register. */
type TriageLegacyProps = {
  item: Exception;
  kind: "exception";
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
  const { item, onClose } = props;
  const excItem: Exception = item;
  const matched = false; // exceptions are never "matched"

  const title = excItem.type;
  const sub = `Raised ${excItem.raised} · ${excItem.srcRef} · from Trade Reconciliation`;
  const chip: ReactNode = <Chip tone={SEV_TONE[excItem.sev]} dot={false}>{SEV_LABEL[excItem.sev]}</Chip>;

  const carried = excItem.carried;

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
        {excItem.trail && (
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
            <Button icon={Check} className="min-w-0 flex-1 px-2.5 py-[9px]">Resolve</Button>
          </div>
        )}
      </div>
    </div>
  );
}