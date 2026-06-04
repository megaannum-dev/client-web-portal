"use client";

/* ============================================================
   MOBO Trade Reconciliation
   Resting: full-width two-sided match grid (internal vs custodian).
   Click any row → grid compresses into a severity queue (290px)
   and a field-by-field triage panel slides in on the right.
   Ported from the design handoff (MoboRecon.jsx).
   ============================================================ */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SlidersHorizontal, Link2, Unlink, X } from "@/lib/icons";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { MetricStat, SegBar, TriageDetail, richSub } from "@/components/mobo/Shared";
import {
  RECON_LINES, type ReconLine, type ReconState,
} from "@/lib/mock/mobo-data";

const GUT: Record<ReconState, { icon: LucideIcon; bg: string; fg: string }> = {
  ok:   { icon: Link2, bg: "#e3f1e7", fg: "#2f7a47" },
  brk:  { icon: Unlink, bg: "#fdeccd", fg: "#b9741f" },
  miss: { icon: X, bg: "#f7ddd6", fg: "#b1402f" },
};
const ROW_TINT: Record<ReconState, string> = {
  ok: "transparent",
  brk: "rgba(242,116,5,0.05)",
  miss: "rgba(186,26,26,0.045)",
};
const RC_PANEL_H = 560;
const QW = 290;

function MatchCell({ refTxt, sub, right, inst }: { refTxt: string | null; sub: string | null; right: boolean; inst: string }) {
  return (
    <div className={`min-w-0 px-[18px] py-[13px] ${right ? "text-right" : "text-left"}`}>
      {refTxt ? (
        <>
          <div className="text-[13.5px] font-bold text-on-surface">{refTxt} · {inst}</div>
          <div className="mt-0.5 text-[12.5px] tabular-nums text-secondary">{richSub(sub)}</div>
        </>
      ) : (
        <div className="text-[12.5px] italic text-secondary">{right ? "no custodian record" : "no internal record"}</div>
      )}
    </div>
  );
}

function MatchRow({ line, onClick }: { line: ReconLine; onClick: () => void }) {
  const g = GUT[line.state];
  const Icon = g.icon;
  return (
    <div
      onClick={onClick}
      className="grid cursor-pointer grid-cols-[1fr_58px_1fr] items-center border-t border-outline-variant transition-colors duration-100 hover:bg-surface-container"
      style={{ background: ROW_TINT[line.state] }}
    >
      <MatchCell refTxt={line.intRef} sub={line.intSub} right={false} inst={line.inst} />
      <div className="flex justify-center">
        <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: g.bg, color: g.fg }}>
          <Icon size={14} strokeWidth={2} />
        </span>
      </div>
      <MatchCell refTxt={line.cusRef} sub={line.cusSub} right inst={line.inst} />
    </div>
  );
}

function QueueRow({ line, selected, onClick }: { line: ReconLine; selected: boolean; onClick: () => void }) {
  const dot = { ok: "#3f9d63", brk: "#e0922f", miss: "#d3654f" }[line.state];
  const tone = line.state === "ok" ? "active" : line.state === "brk" ? "warm" : "failed";
  const label = line.state === "ok" ? "Matched" : line.state === "brk" ? "Break" : "Unmatched";
  return (
    <div
      onClick={onClick}
      className={[
        "flex cursor-pointer items-center gap-2.5 rounded-[10px] border px-3 py-[11px] transition-all duration-100",
        selected ? "border-[rgba(242,116,5,0.35)] bg-[rgba(242,116,5,0.08)]" : "border-transparent hover:bg-surface-container",
      ].join(" ")}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-bold text-on-surface">{line.intRef || line.cusRef}</div>
        <div className="text-[12px] text-secondary">{line.inst}</div>
      </div>
      <Chip tone={tone} dot={false}>{label}</Chip>
    </div>
  );
}

function LegendDot({ state, label }: { state: ReconState; label: string }) {
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

const RECON_FILTERS: { f: "all" | ReconState; label: string }[] = [
  { f: "all", label: "All" },
  { f: "ok", label: "Matched" },
  { f: "brk", label: "Breaks" },
  { f: "miss", label: "Unmatched" },
];

const H_COL = "bg-surface-low px-[18px] py-[11px] text-[11px] font-bold uppercase tracking-[0.05em] text-secondary";

export default function TradeReconciliationPage() {
  const LINES = RECON_LINES;
  const [filter, setFilter] = useState<"all" | ReconState>("all");
  const [focusedId, setFocusedId] = useState<string | null>(null);
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

  const count = (f: "all" | ReconState) => (f === "all" ? LINES.length : LINES.filter((l) => l.state === f).length);
  const gridLines = filter === "all" ? LINES : LINES.filter((l) => l.state === filter);
  const focused = focusedId ? LINES.find((l) => l.id === focusedId) ?? null : null;
  const isFocused = !!focusedId;

  const cols = isFocused ? `${QW}px ${Math.max(0, W - QW)}px` : `${W || 0}px 0px`;

  return (
    <div className="mx-auto max-w-[1240px]">
      <div className="mb-7">
        <PageHeader
          title="Trade Reconciliation"
          subtitle="Match the ATS records against the IB API feed · 03 Jun 2026"
          actions={
            <>
              <Button variant="secondary" icon={SlidersHorizontal}>Filters</Button>
              <Button icon={Link2}>Auto-match</Button>
            </>
          }
        />
      </div>

      {/* summary counters */}
      <div className="mb-4 grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-5">
        <MetricStat label="ATS Records" value="1,284" />
        <MetricStat label="IB API Records" value="1,279" />
        <MetricStat label="Matched" value="1,261" tone="ok" />
        <MetricStat label="Breaks" value="12" tone="warn" />
        <MetricStat label="Unmatched" value="11" tone="bad" />
      </div>
      <div className="mb-[22px]"><SegBar ok={82} warn={11} bad={7} height={10} /></div>

      <div className="mb-[13px] flex items-center gap-3">
        {!isFocused && <span className="text-[16px] font-bold text-on-surface">Full book</span>}
        <span className="ml-auto text-[12.5px] text-secondary">
          {isFocused ? "Click another row to inspect · ✕ returns to the grid" : "Click any row to open the field-by-field triage panel"}
        </span>
      </div>

      {/* filter pills — resting only */}
      {!isFocused && (
        <div className="mb-3.5 flex flex-wrap gap-2">
          {RECON_FILTERS.map(({ f, label }) => {
            const on = filter === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={[
                  "inline-flex items-center gap-[7px] rounded-full border px-[13px] py-1.5 text-[13px] font-semibold transition-all duration-150",
                  on ? "border-primary bg-primary text-white" : "border-outline-variant bg-white text-secondary",
                ].join(" ")}
              >
                {label}
                <span
                  className="rounded-full px-1.5 text-[12px] font-bold"
                  style={{
                    background: on ? "rgba(255,255,255,0.22)" : "var(--surface-container)",
                    color: on ? "#fff" : "var(--secondary)",
                  }}
                >
                  {count(f)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* two-pane wrap */}
      <div
        ref={wrapRef}
        className="grid items-start"
        style={{
          gridTemplateColumns: cols,
          transition: ready ? "grid-template-columns .34s cubic-bezier(.4,0,.2,1)" : "none",
        }}
      >
        {/* LEFT */}
        <div className="min-w-0 overflow-hidden">
          {isFocused ? (
            <div
              className="overflow-y-auto rounded-[14px] border border-outline-variant bg-surface-lowest p-2 shadow-card"
              style={{ height: RC_PANEL_H, boxSizing: "border-box" }}
            >
              <div className="flex flex-col gap-0.5">
                {LINES.map((l) => (
                  <QueueRow key={l.id} line={l} selected={l.id === focusedId} onClick={() => setFocusedId(l.id)} />
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-[14px] border border-outline-variant bg-surface-lowest shadow-card">
                <div className="grid grid-cols-[1fr_58px_1fr]">
                  <div className={H_COL}>Internal Records — ATS</div>
                  <div className="bg-surface-low" />
                  <div className={`${H_COL} text-right`}>IB API feed</div>
                </div>
                {gridLines.map((l) => <MatchRow key={l.id} line={l} onClick={() => setFocusedId(l.id)} />)}
                {gridLines.length === 0 && (
                  <div className="p-7 text-center text-[14px] text-secondary">No lines in this view.</div>
                )}
              </div>
              <div className="mt-3.5 flex items-center gap-[18px] text-[12.5px] text-secondary">
                <LegendDot state="ok" label="Matched" />
                <LegendDot state="brk" label="Field break" />
                <LegendDot state="miss" label="Missing one side" />
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
            {focused && <TriageDetail item={focused} kind="recon" onClose={() => setFocusedId(null)} />}
          </div>
        </div>
      </div>
    </div>
  );
}
