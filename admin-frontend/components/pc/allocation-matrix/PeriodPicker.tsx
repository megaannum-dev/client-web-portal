"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown, Check } from "@/lib/icons";
import { type AllocationView } from "@/lib/pc/allocation";
import { LABEL } from "./HowToRead";

/* ============================================================
   PERIOD PICKER  ·  preview historical matrices
   ============================================================ */
export function PeriodPicker({
  view, period, onPick,
}: { view: AllocationView; period: string; onPick: (p: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Switch period · preview a historical matrix"
        className={[
          "box-border inline-flex h-[42px] cursor-pointer items-center gap-2 rounded border border-outline px-[13px]",
          "text-[14px] font-bold text-on-surface",
          open ? "bg-surface-low" : "bg-white",
        ].join(" ")}
      >
        <CalendarDays size={15} strokeWidth={2} />
        {period}
        <ChevronDown
          size={14}
          strokeWidth={2}
          className="text-secondary transition-transform duration-150"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} className="fixed inset-0 z-20" />
          <div className="absolute left-0 top-[calc(100%+6px)] z-[21] min-w-[232px] overflow-hidden rounded-md border border-outline-variant bg-surface-lowest p-1.5 shadow-overlay">
            <div className={`${LABEL} px-2.5 pb-[5px] pt-[7px]`}>Allocation period</div>
            {view.periods.map((p) => {
              const sel = p.label === period;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { onPick(p.label); setOpen(false); }}
                  className={[
                    "flex w-full cursor-pointer items-center gap-2.5 rounded px-2.5 py-[9px] text-left text-[13.5px] text-on-surface",
                    sel ? "bg-surface-low" : "bg-transparent",
                  ].join(" ")}
                >
                  <span className={`flex-1 ${sel ? "font-bold" : "font-semibold"}`}>{p.label}</span>
                  {p.status === "open" ? (
                    <span className="rounded-[6px] bg-primary-fixed px-[7px] py-0.5 text-[11px] font-bold text-primary">
                      Open
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-secondary">
                      <Check size={11} strokeWidth={2} />Confirmed
                    </span>
                  )}
                  {sel && <Check size={15} strokeWidth={2.2} className="text-primary" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
