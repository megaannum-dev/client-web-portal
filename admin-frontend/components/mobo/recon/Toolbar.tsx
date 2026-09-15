"use client";

/* ============================================================
   MOBO Trade Reconciliation — Toolbar
   Search · per-column FilterMenu · Reset · count label ·
   ColumnMenu · ExpansionToggle (Trade/Order/Execution depth).

   Sub-widgets are module-private; only ReconToolbar is exported.
   ============================================================ */

import { useEffect, useRef, useState, type RefObject } from "react";
import { Search, ChevronDown, Check, X, Columns3 } from "@/lib/icons";
import { RECON_COLUMNS, RECON_FILTERS, type ReconColKey } from "@/lib/mobo/executions";

export interface ToolbarProps {
  q: string;
  onQ: (v: string) => void;
  filters: Record<string, string[]>;
  onFilters: (f: Record<string, string[]>) => void;
  options: Record<string, string[]>;
  hidden: ReconColKey[];
  onHidden: (h: ReconColKey[]) => void;
  depth: 0 | 1 | 2;
  onDepth: (d: 0 | 1 | 2) => void;
  counts: { shown: number; total: number };
  grouped: boolean;
  onReset: () => void;
}

function useOutsideClick(ref: RefObject<HTMLElement | null>, onAway: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onAway();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [active, ref, onAway]);
}

function FilterMenu({
  label, options, sel, onChange,
}: {
  label: string;
  options: string[];
  sel: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => setOpen(false), open);

  const toggle = (opt: string) => {
    onChange(sel.includes(opt) ? sel.filter((v) => v !== opt) : [...sel, opt]);
  };
  const active = sel.length > 0;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={[
          "flex items-center gap-[7px] px-[11px] py-[7px] rounded text-[12.5px] font-semibold whitespace-nowrap border",
          active ? "border-primary text-primary" : "border-outline-variant bg-surface-lowest text-secondary",
        ].join(" ")}
        style={active ? { background: "rgba(242,116,5,0.06)" } : undefined}
      >
        {label}
        {active && <span className="tabular-nums">· {sel.length}</span>}
        <ChevronDown size={13} strokeWidth={2} />
      </button>
      {open && (
        <div
          className="absolute top-[calc(100%+6px)] left-0 z-20 min-w-[186px] rounded-md border border-outline-variant bg-surface-lowest p-1.5"
          style={{ boxShadow: "0 12px 28px rgba(0,0,0,0.14)" }}
        >
          {options.map((opt) => {
            const checked = sel.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className={[
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12.5px]",
                  checked ? "bg-surface-low" : "",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[3px] border-[1.5px]",
                    checked ? "border-primary bg-primary" : "border-outline",
                  ].join(" ")}
                >
                  {checked && <Check size={10} strokeWidth={2.5} className="text-white" />}
                </span>
                {opt}
              </button>
            );
          })}
          {active && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full border-t border-outline-variant pt-1.5 text-left text-[12.5px] font-semibold text-secondary"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ColumnMenu({ hidden, onChange }: { hidden: ReconColKey[]; onChange: (h: ReconColKey[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => setOpen(false), open);

  const shown = RECON_COLUMNS.length - hidden.length;
  const active = hidden.length > 0;

  const toggle = (key: ReconColKey, locked?: boolean) => {
    if (locked) return;
    onChange(hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key]);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={[
          "flex items-center gap-[7px] px-[11px] py-[7px] rounded text-[12.5px] font-semibold whitespace-nowrap border",
          active ? "border-primary text-primary" : "border-outline-variant bg-surface-lowest text-secondary",
        ].join(" ")}
        style={active ? { background: "rgba(242,116,5,0.06)" } : undefined}
      >
        <Columns3 size={14} strokeWidth={1.75} />
        Columns
        <span className="tabular-nums">· {shown}/{RECON_COLUMNS.length}</span>
        <ChevronDown size={13} strokeWidth={2} />
      </button>
      {open && (
        <div
          className="absolute top-[calc(100%+6px)] right-0 z-20 w-[212px] max-h-[340px] overflow-y-auto rounded-md border border-outline-variant bg-surface-lowest p-1.5"
          style={{ boxShadow: "0 12px 28px rgba(0,0,0,0.14)" }}
        >
          {RECON_COLUMNS.map((col) => {
            const checked = !hidden.includes(col.key);
            return (
              <button
                key={col.key}
                type="button"
                disabled={col.locked}
                onClick={() => toggle(col.key, col.locked)}
                className={[
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12.5px]",
                  col.locked ? "cursor-default text-secondary" : checked ? "bg-surface-low" : "",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[3px] border-[1.5px]",
                    checked ? "border-primary bg-primary" : "border-outline",
                    col.locked ? "opacity-55" : "",
                  ].join(" ")}
                >
                  {checked && <Check size={10} strokeWidth={2.5} className="text-white" />}
                </span>
                {col.head}
              </button>
            );
          })}
          {active && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full border-t border-outline-variant pt-1.5 text-left text-[12.5px] font-semibold text-secondary"
            >
              Show all columns
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const DEPTHS: { id: 0 | 1 | 2; label: string }[] = [
  { id: 0, label: "Trade" },
  { id: 1, label: "Order" },
  { id: 2, label: "Execution" },
];

function ExpansionToggle({ depth, onDepth }: { depth: 0 | 1 | 2; onDepth: (d: 0 | 1 | 2) => void }) {
  return (
    <div className="flex gap-0.5 p-0.5 rounded-md border border-outline-variant bg-surface-low">
      {DEPTHS.map((d) => {
        const on = depth === d.id;
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => onDepth(d.id)}
            className={[
              "px-2.5 py-[5px] rounded text-[12px] font-semibold",
              on ? "bg-surface-lowest text-primary shadow-card" : "text-secondary",
            ].join(" ")}
          >
            {d.label}
          </button>
        );
      })}
    </div>
  );
}

export function ReconToolbar({
  q, onQ, filters, onFilters, options, hidden, onHidden, depth, onDepth, counts, grouped, onReset,
}: ToolbarProps) {
  const hasFilters = Object.values(filters).some((v) => v.length > 0);
  const showReset = q.length > 0 || hasFilters;

  return (
    <div className="flex flex-wrap items-center gap-[9px] mb-3">
      <div className="flex items-center gap-[7px] px-3 py-[7px] rounded-full border border-outline-variant bg-surface-lowest flex-[0_1_250px] min-w-[190px]">
        <Search size={14} strokeWidth={1.75} className="text-secondary" />
        <input
          value={q}
          onChange={(e) => onQ(e.target.value)}
          placeholder="Search account, contract, exchange…"
          className="text-[13px] w-full min-w-0 outline-none bg-transparent"
        />
      </div>

      {RECON_FILTERS.map((f) => (
        <FilterMenu
          key={f.key}
          label={f.label}
          options={options[f.key] ?? []}
          sel={filters[f.key] ?? []}
          onChange={(next) => onFilters({ ...filters, [f.key]: next })}
        />
      ))}

      {showReset && (
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1 text-[12.5px] font-semibold text-primary"
        >
          <X size={13} strokeWidth={2} />
          Reset
        </button>
      )}

      <span className="ml-auto text-[12.5px] text-secondary tabular-nums whitespace-nowrap">
        {counts.shown} of {counts.total} records
        {grouped ? " · grouped by trade" : " · sorted flat"}
      </span>

      <ColumnMenu hidden={hidden} onChange={onHidden} />

      <span className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-secondary">
        EXPANSION LEVEL
      </span>
      <ExpansionToggle depth={depth} onDepth={onDepth} />
    </div>
  );
}
