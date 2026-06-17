"use client";

/* ============================================================
   MOBO Trade Reconciliation — three-way, two-panel screen
   Resting: TWO side-by-side match panels.
     Left  — Trader vs IB   (ti leg — trader blotter ↔ stored IB)
     Right — IB vs CRM       (ic leg — set-membership integrity)
   Click any row → both panels compress into one severity queue
   (290px) and the field-by-field triage panel slides in on the
   right (TriageDetail). Column animation uses grid-template-columns
   px→px (reliable; flex/fr width transitions glitch).

   DATA REALITY (001 §6): consumed ONLY through loadReconciliation().
   The stored-IB column is the populated source; trader & fetched-IB
   columns render empty ("awaiting source"), NOT as breaks. Identifiers
   are the real ibOrderID / orderID. Counters are re-based to
   single-source counts from ReconCounters.
   Ported faithfully from the design handoff (MoboRecon.jsx).
   ============================================================ */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  SlidersHorizontal, Link2, Unlink, X, ChevronRight, Check,
} from "@/lib/icons";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Chip, type ChipTone } from "@/components/ui/Chip";
import {
  MetricStat, SegBar, TriageDetail, richSub, ExecCompare, INTEG,
} from "@/components/mobo/Shared";
import { loadReconciliation, AWAITING_SOURCE } from "@/lib/mobo/reconciliation";
import type {
  MatchState, ReconLeg, ReconTrade,
} from "@/lib/mobo/types";

/* ---- match gutter glyph ------------------------------------ */
const GUT: Record<MatchState, { icon: LucideIcon; bg: string; fg: string }> = {
  ok:   { icon: Link2, bg: "#e3f1e7", fg: "#2f7a47" },
  brk:  { icon: Unlink, bg: "#fdeccd", fg: "#b9741f" },
  miss: { icon: X, bg: "#f7ddd6", fg: "#b1402f" },
};
const ROW_TINT: Record<MatchState, string> = {
  ok: "transparent",
  brk: "rgba(242,116,5,0.05)",
  miss: "rgba(186,26,26,0.045)",
};
const RC_PANEL_H = 560;
const QW = 290;

const STATE_TONE: Record<MatchState, ChipTone> = { ok: "active", brk: "warm", miss: "failed" };
const STATE_LABEL: Record<MatchState, string> = { ok: "Matched", brk: "Break", miss: "Unmatched" };

/* ---- flat leg list -----------------------------------------
   Each trade yields two legs (ti — Trader↔IB, ic — IB↔CRM). A leg
   is the unit the panels render and the triage panel inspects; it
   carries its parent trade so it drops straight into TriageDetail. */
type LegKind = "ti" | "ic";
interface FlatLeg {
  key: string;
  lineId: string;
  kind: LegKind;
  inst: string;
  pair: string;
  /** Left column ref + summary. ti: Trader (awaiting). ic: IB · live. */
  leftRef: string | null;
  leftSub: string | null;
  /** Right column ref + summary. ti: stored IB (populated). ic: CRM · stored. */
  rightRef: string | null;
  rightSub: string | null;
  leg: ReconLeg;
  trade: ReconTrade;
}

function buildLegs(trades: ReconTrade[]): FlatLeg[] {
  const out: FlatLeg[] = [];
  trades.forEach((t) => {
    // Trader vs IB — IB is the populated right side; trader awaits source (left).
    out.push({
      key: `${t.id}-ti`, lineId: t.id, kind: "ti", inst: t.inst,
      pair: "Trader vs IB",
      leftRef: t.trader, leftSub: t.ti.ls,   // trader — awaiting source
      rightRef: t.ib, rightSub: t.ti.rs,     // stored IB — populated
      leg: t.ti, trade: t,
    });
    // IB vs CRM — live IB (left) vs stored copy (right). One side is absent on
    // orphaned (no live) / missingDb (not stored).
    const orphaned = t.ic.integrity === "orphaned";
    const missingDb = t.ic.integrity === "missingDb";
    out.push({
      key: `${t.id}-ic`, lineId: t.id, kind: "ic", inst: t.inst,
      pair: "IB vs CRM",
      leftRef: orphaned ? null : t.ib, leftSub: t.ic.ls,      // live IB
      rightRef: missingDb ? null : t.crm, rightSub: t.ic.rs,  // stored CRM copy
      leg: t.ic, trade: t,
    });
  });
  return out;
}

/* ---- two-sided match row (one leg) -------------------------
   Both columns share this layout. The populated stored-IB side
   is the LEFT cell; the counterpart (trader / crm) renders empty
   ("awaiting source") in today's data reality — NOT a break. The
   chevron expands the row into a per-execution comparison. */
function MatchRow({
  leg, first, onClick, defaultExpanded,
}: {
  leg: FlatLeg;
  first: boolean;
  onClick: () => void;
  defaultExpanded?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultExpanded);
  const g = GUT[leg.leg.state];
  const Icon = g.icon;
  const isIC = leg.kind === "ic";
  const hasExecs = !!leg.leg.execs && leg.leg.execs.length > 0;

  const cell = (ref: string | null, sub: string | null, right: boolean) => (
    <div className={`min-w-0 px-4 py-3 ${right ? "text-right" : "text-left"}`}>
      {ref ? (
        <>
          <div className="text-[13px] font-bold text-on-surface">{ref} · {leg.inst}</div>
          <div className="mt-0.5 text-[12px] tabular-nums text-secondary">{richSub(sub)}</div>
        </>
      ) : (
        <div className="text-[12px] italic text-secondary">awaiting source</div>
      )}
    </div>
  );

  return (
    <div style={{ borderTop: first ? "none" : "1px solid var(--outline-variant)" }}>
      <div
        onClick={onClick}
        title="Click to open the triage panel"
        className="grid cursor-pointer items-center transition-colors duration-100 hover:bg-surface-container"
        style={{ gridTemplateColumns: "28px 1fr 48px 1fr", background: ROW_TINT[leg.leg.state] }}
      >
        <div className="flex justify-center">
          {hasExecs && (
            <button
              type="button"
              title={open ? "Hide executions" : "Show executions"}
              onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
              className="flex rounded-md p-0.5 text-secondary transition-transform duration-150"
              style={{ transform: open ? "rotate(90deg)" : "none" }}
            >
              <ChevronRight size={15} strokeWidth={2.25} />
            </button>
          )}
        </div>
        {/* left column — ti: Trader (awaiting) · ic: IB live */}
        {cell(leg.leftRef, leg.leftSub, false)}
        <div className="flex justify-center">
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full" style={{ background: g.bg, color: g.fg }}>
            <Icon size={13} strokeWidth={2} />
          </span>
        </div>
        {/* right column — ti: stored IB (populated) · ic: CRM stored */}
        {cell(leg.rightRef, leg.rightSub, true)}
      </div>
      {open && hasExecs && (
        <div className="border-t border-outline-variant bg-surface-low px-4 pb-[14px] pl-11 pt-2.5">
          <ExecCompare
            execs={leg.leg.execs!}
            leftLabel={isIC ? "IB · live" : "Trader"}
            rightLabel={isIC ? "CRM · stored" : "IB"}
          />
        </div>
      )}
    </div>
  );
}

/* ---- one comparison panel (drives BOTH columns) ----------- */
function ReconPanel({
  title, legs, onPick, expanded, terms,
}: {
  title: string;
  legs: FlatLeg[];
  onPick: (key: string) => void;
  expanded?: string[];
  terms?: { clearLabel: string; resolveLabel: string };
}) {
  const t = terms ?? { clearLabel: "All matched", resolveLabel: "to resolve" };
  const breaks = legs.filter((l) => l.leg.state !== "ok").length;
  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-1 flex items-center gap-2.5">
        <h3 className="text-[15px] font-bold text-on-surface">{title}</h3>
        <Chip tone={breaks ? "warm" : "active"} dot={false}>
          {breaks ? `${breaks} ${t.resolveLabel}` : t.clearLabel}
        </Chip>
      </div>
      <div className="mt-2.5 overflow-hidden rounded-[14px] border border-outline-variant bg-surface-lowest shadow-card">
        {legs.map((l, i) => (
          <MatchRow
            key={l.key}
            leg={l}
            first={i === 0}
            onClick={() => onPick(l.key)}
            defaultExpanded={expanded?.includes(l.lineId)}
          />
        ))}
        {legs.length === 0 && (
          <div className="p-6 text-center text-[14px] text-secondary">No lines in this view.</div>
        )}
      </div>
    </div>
  );
}

function ReconLegend({ items }: { items: [MatchState, string][] }) {
  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-4 text-[12.5px] text-secondary">
      {items.map(([state, label], i) => <LegendDot key={i} state={state} label={label} />)}
    </div>
  );
}

function LegendDot({ state, label }: { state: MatchState; label: string }) {
  const g = GUT[state];
  const Icon = g.icon;
  return (
    <span className="flex items-center gap-[7px]">
      <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full" style={{ background: g.bg, color: g.fg }}>
        <Icon size={11} strokeWidth={2} />
      </span>
      {label}
    </span>
  );
}

/* ---- compressed queue row (focused state) ------------------ */
function QueueRow({
  leg, selected, onClick,
}: {
  leg: FlatLeg;
  selected: boolean;
  onClick: () => void;
}) {
  const integ = leg.kind === "ic" && leg.leg.integrity ? INTEG[leg.leg.integrity] : null;
  const dot = integ ? integ.fg : { ok: "#3f9d63", brk: "#e0922f", miss: "#d3654f" }[leg.leg.state];
  return (
    <div
      onClick={onClick}
      className={[
        "flex cursor-pointer items-center gap-[11px] rounded-[10px] border px-3 py-2.5 transition-all duration-100",
        selected ? "border-[rgba(242,116,5,0.35)] bg-[rgba(242,116,5,0.08)]" : "border-transparent hover:bg-surface-container",
      ].join(" ")}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-bold text-on-surface">
          {leg.rightRef || leg.leftRef || AWAITING_SOURCE} · {leg.inst}
        </div>
        <div className="text-[11.5px] text-secondary">{leg.pair}</div>
      </div>
      {integ
        ? <Chip tone={integ.tone} dot={false}>{integ.label}</Chip>
        : <Chip tone={STATE_TONE[leg.leg.state]} dot={false}>{STATE_LABEL[leg.leg.state]}</Chip>}
    </div>
  );
}

/* ---- Filters dropdown (lives on the header "Filters" button) ---- */
type Filter = "all" | MatchState;
const RECON_FILTERS: { f: Filter; label: string }[] = [
  { f: "all", label: "All" },
  { f: "ok", label: "Matched" },
  { f: "brk", label: "Breaks" },
  { f: "miss", label: "Unmatched" },
];

function FilterMenu({
  filter, setFilter, counts,
}: {
  filter: Filter;
  setFilter: (f: Filter) => void;
  counts: Record<Filter, number>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const cur = RECON_FILTERS.find((x) => x.f === filter) ?? RECON_FILTERS[0];
  const active = filter !== "all";
  return (
    <div ref={ref} className="relative">
      <Button
        variant={active || open ? "primary" : "secondary"}
        icon={SlidersHorizontal}
        onClick={() => setOpen((o) => !o)}
      >
        {active ? `Filters · ${cur.label}` : "Filters"}
      </Button>
      {open && (
        <div
          className="absolute right-0 z-40 w-56 rounded-2xl border border-outline-variant bg-white p-2 shadow-overlay"
          style={{ top: "calc(100% + 8px)" }}
        >
          <div className="px-2.5 pb-2 pt-1.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-secondary">
            Show lines
          </div>
          {RECON_FILTERS.map(({ f, label }) => {
            const on = filter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => { setFilter(f); setOpen(false); }}
                className={[
                  "flex w-full items-center justify-between gap-2.5 rounded-[9px] px-2.5 py-[9px] text-left text-[13.5px] transition-colors duration-100",
                  on ? "bg-primary-fixed font-bold text-primary" : "font-medium text-on-surface hover:bg-surface-container",
                ].join(" ")}
              >
                <span className="flex items-center gap-2">
                  <span className="flex w-[15px] shrink-0">
                    {on && <Check size={15} strokeWidth={2.5} />}
                  </span>
                  {label}
                </span>
                <span
                  className="rounded-full px-[7px] py-px text-[12px] font-bold tabular-nums"
                  style={{
                    background: on ? "rgba(242,116,5,0.16)" : "var(--surface-container)",
                    color: on ? "var(--primary)" : "var(--secondary)",
                  }}
                >
                  {counts[f]}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TradeReconciliationPage() {
  const view = useMemo(() => loadReconciliation(), []);
  const legs = useMemo(() => buildLegs(view.trades), [view.trades]);
  const { counters } = view;

  const [filter, setFilter] = useState<Filter>("all");
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const measure = () => { if (wrapRef.current) setW(wrapRef.current.clientWidth); };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (W > 0 && !ready) {
      const id = requestAnimationFrame(() => setReady(true));
      return () => cancelAnimationFrame(id);
    }
  }, [W, ready]);

  /* leg slices + filtered views */
  const tiLegs = useMemo(() => legs.filter((l) => l.kind === "ti"), [legs]);
  const icLegs = useMemo(() => legs.filter((l) => l.kind === "ic"), [legs]);
  const byFilter = (arr: FlatLeg[]) => (filter === "all" ? arr : arr.filter((l) => l.leg.state === filter));
  const count = (f: Filter) => (f === "all" ? legs.length : legs.filter((l) => l.leg.state === f).length);

  /* segmented bar from single-source counters (re-based) */
  const total = counters.reconciled || 1;
  const pct = (n: number) => Math.round((n / total) * 100);

  const focused = focusedKey ? legs.find((l) => l.key === focusedKey) ?? null : null;
  const isFocused = !!focused;
  const cols = isFocused ? `${QW}px ${Math.max(0, W - QW)}px` : `${W || 0}px 0px`;

  /* triage queue: only the focused column's legs, honoring the active
     filter, breaks + unmatched first then matched */
  const queue: FlatLeg[] = focused
    ? byFilter(legs.filter((l) => l.kind === focused.kind)).slice().sort((a, b) => {
        const rank: Record<MatchState, number> = { brk: 0, miss: 1, ok: 2 };
        return rank[a.leg.state] - rank[b.leg.state];
      })
    : [];

  return (
    <div className="mx-auto max-w-[1240px]">
      <div className="mb-7">
        <PageHeader
          title="Trade Reconciliation"
          subtitle={`Three-way match · Trader → IB → MegaCRM · ${view.settleDay}`}
          actions={
            <>
              <FilterMenu
                filter={filter}
                setFilter={setFilter}
                counts={{ all: count("all"), ok: count("ok"), brk: count("brk"), miss: count("miss") }}
              />
              <Button icon={Link2}>Auto-match</Button>
            </>
          }
        />
      </div>

      {/* summary counters — single-source re-base from ReconCounters */}
      <div className="mb-4 grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-5">
        <MetricStat label="Trades reconciled" value={counters.reconciled.toLocaleString("en-US")} />
        <MetricStat label="Auto-matched" value={counters.autoMatchedPct} tone="ok" />
        <MetricStat label="Matched clean" value={counters.matched} tone="ok" />
        <MetricStat label="Breaks" value={counters.breaks} tone="warn" />
        <MetricStat label="Unmatched" value={counters.unmatched} tone="bad" />
      </div>
      <div className="mb-[22px]">
        <SegBar ok={pct(counters.matched)} warn={pct(counters.breaks)} bad={pct(counters.unmatched)} height={10} />
      </div>

      <div className="mb-[13px] flex items-center gap-3">
        {!isFocused && <span className="text-[16px] font-bold text-on-surface">Full book</span>}
        <span className="ml-auto text-[12.5px] text-secondary">
          {isFocused ? "Click another row to inspect · ✕ returns to the book" : "Click any row to open the field-by-field triage panel"}
        </span>
      </div>

      {/* two-pane wrap (book ⇄ queue + triage) */}
      <div
        ref={wrapRef}
        className="grid items-start"
        style={{
          gridTemplateColumns: cols,
          transition: ready ? "grid-template-columns .34s cubic-bezier(.4,0,.2,1)" : "none",
        }}
      >
        {/* LEFT — full book (two panels) OR triage queue */}
        <div className="min-w-0 overflow-hidden">
          {isFocused ? (
            <div
              className="overflow-y-auto rounded-[14px] border border-outline-variant bg-surface-lowest p-2 shadow-card"
              style={{ height: RC_PANEL_H, boxSizing: "border-box" }}
            >
              <div className="flex flex-col gap-0.5">
                {queue.map((l) => (
                  <QueueRow key={l.key} leg={l} selected={l.key === focusedKey} onClick={() => setFocusedKey(l.key)} />
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-2">
                <div className="min-w-0">
                  <ReconPanel
                    title="Trader vs IB"
                    legs={byFilter(tiLegs)}
                    onPick={setFocusedKey}
                    terms={{ clearLabel: "All matched", resolveLabel: "to resolve" }}
                  />
                  <ReconLegend items={[["ok", "Matched"], ["brk", "Field break"], ["miss", "Missing fill"]]} />
                </div>
                <div className="min-w-0">
                  <ReconPanel
                    title="IB vs CRM"
                    legs={byFilter(icLegs)}
                    onPick={setFocusedKey}
                    terms={{ clearLabel: "All in sync", resolveLabel: "to re-sync" }}
                  />
                  <ReconLegend items={[["ok", "In sync"], ["brk", "Drifted"], ["miss", "Missing"]]} />
                </div>
              </div>
            </>
          )}
        </div>

        {/* RIGHT — triage panel */}
        <div className={`min-w-0 overflow-hidden ${isFocused ? "pl-[18px]" : ""}`}>
          <div
            className="overflow-hidden rounded-[14px] border border-outline-variant bg-surface-lowest px-5 py-[18px] shadow-card"
            style={{
              height: isFocused ? RC_PANEL_H : "auto",
              minHeight: isFocused ? undefined : 460,
              boxSizing: "border-box",
            }}
          >
            {focused && (
              <TriageDetail
                leg={focused.leg}
                trade={focused.trade}
                onClose={() => setFocusedKey(null)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
