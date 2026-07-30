"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { CalendarClock, MailCheck, Lock, ArrowRightLeft, Info } from "@/lib/icons";

const RULES: [LucideIcon, string, string][] = [
  [CalendarClock, "Requests due the 20th", "All allotment and redemption requests are due by the 20th; the matrix is finalized that day."],
  [MailCheck, "PM confirmation", "Sent after final settlement — confirm before the 1st of next month."],
  [Lock, "Fixed for the period", "Units and % share do not change for the rest of the month once finalized."],
  [ArrowRightLeft, "Operational", "Trades and fees settle against these units; later requests roll into next month."],
];

const TIP_W = 340;
const MARGIN = 12;

/* ============================================================
   SOP INFO  ·  hover tooltip — how the pre-allocation matrix
   period gets finalized. Portal'd to <body> so it isn't clipped
   by the Matrix's scroll container.
   ============================================================ */
export function SopInfo() {
  const [tip, setTip] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!tip) return;
    const place = () => {
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      const left = Math.min(Math.max(r.left, MARGIN), window.innerWidth - TIP_W - MARGIN);
      setPos({ top: r.bottom + 8, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [tip]);

  return (
    <div className="relative" onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)}>
      <button
        ref={btnRef}
        type="button"
        aria-label="Pre-allocation cycle"
        className={[
          "flex h-10 w-10 cursor-help items-center justify-center rounded border border-outline-variant transition-all duration-150",
          tip ? "bg-surface-container text-on-surface" : "bg-white text-secondary",
        ].join(" ")}
      >
        <Info size={18} strokeWidth={1.75} />
      </button>
      {tip && pos &&
        createPortal(
          <div
            role="tooltip"
            className="fixed z-[999] box-border w-[340px] rounded-md border border-outline-variant bg-surface-lowest px-4 py-3.5 shadow-overlay"
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-secondary">Pre-allocation</div>
            <div className="mt-1 text-[14px] font-semibold text-on-surface">How this month’s matrix is finalized.</div>
            <div className="mt-[11px] flex flex-col gap-[9px]">
              {RULES.map(([Icon, label, text]) => (
                <div key={label} className="flex gap-2.5">
                  <Icon size={15} strokeWidth={1.75} className="mt-0.5 flex-none text-primary" />
                  <div>
                    <div className="text-[12.5px] font-bold text-on-surface">{label}</div>
                    <div className="mt-px text-[12.5px] leading-[1.5] text-secondary">{text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
