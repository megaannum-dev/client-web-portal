"use client";

// 021 UI-3 — chat date-jump calendar popover. Owns its own view month.
//
// Positioned by the caller (ChatRoomPanel, UI-4) with `absolute right-6
// top-[60px]` — the design's `getBoundingClientRect` measurement bought
// nothing once the panel itself is the positioning context (plan §9).

import { useState } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "@/lib/icons";

const DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function isoOf(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function DayJumpCalendar({
  messageDates, selectedIso, today = new Date(), onPick, onClose,
}: {
  /** ISO (yyyy-mm-dd) dates that have at least one message. */
  messageDates: Set<string>;
  selectedIso: string | null;
  today?: Date;
  onPick: (iso: string) => void;
  onClose: () => void;
}) {
  const base = selectedIso ? new Date(selectedIso) : today;
  const [viewYear, setViewYear] = useState(base.getFullYear());
  const [viewMonth, setViewMonth] = useState(base.getMonth());

  const daysIn = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDow = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  function prev() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); } else setViewMonth((m) => m - 1);
  }
  function next() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); } else setViewMonth((m) => m + 1);
  }

  return (
    <>
      <div className="absolute inset-0 z-10" onClick={onClose} aria-hidden="true" />
      <div
        className="absolute right-6 top-[60px] z-20 w-[278px] select-none rounded-md border border-outline-variant bg-surface-lowest p-3.5 pb-2.5 shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <button type="button" aria-label="Previous month" onClick={prev} className="flex rounded-[6px] p-1 text-secondary">
            <ChevronLeft size={16} strokeWidth={2} />
          </button>
          <span className="text-[13px] font-bold text-on-surface">{monthLabel}</span>
          <button type="button" aria-label="Next month" onClick={next} className="flex rounded-[6px] p-1 text-secondary">
            <ChevronRight size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="mb-0.5 grid grid-cols-7 gap-0.5">
          {DOW.map((w) => (
            <div key={w} className="py-1 text-center text-[10.5px] font-bold tracking-[0.03em] text-secondary">
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: firstDow }).map((_, i) => (
            <div key={`pad-${i}`} className="invisible h-[30px]" />
          ))}
          {Array.from({ length: daysIn }, (_, i) => i + 1).map((day) => {
            const iso = isoOf(viewYear, viewMonth, day);
            const has = messageDates.has(iso);
            const selected = selectedIso === iso;
            const cellDate = new Date(viewYear, viewMonth, day);
            const disabled = cellDate > today || !has;
            return (
              <button
                key={iso}
                type="button"
                disabled={disabled}
                onClick={() => onPick(iso)}
                className={clsx(
                  "relative flex h-[30px] w-full items-center justify-center rounded text-[12.5px] font-semibold transition-all duration-100",
                  disabled ? "cursor-default text-outline opacity-45" : "cursor-pointer",
                  selected ? "bg-primary text-primary-foreground" : !disabled && "text-on-surface",
                )}
              >
                {day}
                {has && !selected && (
                  <span className="absolute bottom-[3px] left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex items-center gap-1.5 text-[10.5px] font-semibold text-secondary">
          <span className="h-[5px] w-[5px] rounded-full bg-primary" />
          <span>Days with messages</span>
        </div>
      </div>
    </>
  );
}
