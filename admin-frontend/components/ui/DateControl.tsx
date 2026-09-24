"use client";

/* ============================================================
   DateControl — calendar picker with single-date + range modes.

   Extracted from MOBO's Post-Trade Allocation panel (was
   components/mobo/allocation/Panels.tsx) so other pages (IC
   Meeting Notes) can reuse it. `runs: PtaRun[]` became the
   generic `markedDates: Set<string>` (ISO YYYY-MM-DD) — same
   "has data" dot, no MOBO-specific type. `disableWeekends` and
   `onClear` are optional additions for callers that don't share
   MOBO's trading-day/no-clear behaviour; omitting them keeps
   MOBO's original look/behaviour unchanged.
   ============================================================ */

import { useState, useRef, useEffect, useCallback } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight } from "@/lib/icons";
import { Button } from "@/components/ui/Button";

const _dk = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const _sameDay = (a: Date | null, b: Date | null) =>
  a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const _inRange = (d: Date, s: Date, e: Date) => d >= s && d <= e;
const _fmtShort = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
const _fmtFull = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

const DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export function DateControl({
  dateLabel,
  markedDates,
  markedLabel = "Has data",
  disableWeekends = true,
  onPickDate,
  onPickRange,
  onClear,
}: {
  dateLabel: string;
  markedDates: Set<string>;
  /** Legend text for the "has data" dot. Defaults to MOBO's wording. */
  markedLabel?: string;
  /** MOBO disables weekends as well as future days; other callers can opt out. */
  disableWeekends?: boolean;
  onPickDate: (d: string) => void;
  onPickRange: (from: string, to: string) => void;
  /** When provided, renders a "Clear" link that resets the picker to no selection. */
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [isRange, setIsRange] = useState(false);
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [rangeStart, setRangeStart] = useState<Date | null>(null);
  const [rangeEnd, setRangeEnd] = useState<Date | null>(null);
  const [hover, setHover] = useState<Date | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const today = _dk(now);

  // build grid for current month view
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startDow = (firstOfMonth.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: startDow }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewYear, viewMonth, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  };

  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const handleDayClick = useCallback((d: Date) => {
    if (!isRange) {
      onPickDate(_dk(d));
      setOpen(false);
      return;
    }
    // range mode
    if (!rangeStart || rangeEnd) {
      // first pick (or restart)
      setRangeStart(d);
      setRangeEnd(null);
    } else {
      // second pick — sort
      const [a, b] = d < rangeStart ? [d, rangeStart] : [rangeStart, d];
      setRangeStart(a);
      setRangeEnd(b);
    }
  }, [isRange, rangeStart, rangeEnd, onPickDate]);

  const applyRange = () => {
    if (rangeStart && rangeEnd) {
      onPickRange(_dk(rangeStart), _dk(rangeEnd));
      setOpen(false);
    }
  };

  const handleClear = () => {
    setRangeStart(null);
    setRangeEnd(null);
    onClear?.();
    setOpen(false);
  };

  // effective range end for hover preview
  const effectiveEnd = rangeEnd ?? (rangeStart && hover && !_sameDay(hover, rangeStart) ? hover : null);
  const sortedStart = rangeStart && effectiveEnd && effectiveEnd < rangeStart ? effectiveEnd : rangeStart;
  const sortedEnd = rangeStart && effectiveEnd && effectiveEnd < rangeStart ? rangeStart : effectiveEnd;

  return (
    <div className="relative" ref={ref}>
      <Button variant="secondary" icon={CalendarDays} onClick={() => setOpen((o) => !o)}>
        {dateLabel}
      </Button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-20 w-[296px] rounded-md border border-outline-variant bg-white p-3 shadow-overlay">
          {/* range toggle + clear */}
          <div className="mb-2.5 flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-on-surface">
              <span
                className={[
                  "flex h-[18px] w-[18px] items-center justify-center rounded border",
                  isRange ? "border-primary bg-primary" : "border-outline-variant bg-white",
                ].join(" ")}
                onClick={() => { setIsRange((v) => !v); setRangeStart(null); setRangeEnd(null); }}
              >
                {isRange && <Check size={12} strokeWidth={2.5} className="text-white" />}
              </span>
              Select range
            </label>
            {onClear && (
              <button
                type="button"
                onClick={handleClear}
                className="text-[12px] font-semibold text-primary hover:underline"
              >
                Clear
              </button>
            )}
          </div>

          {/* month nav */}
          <div className="mb-1.5 flex items-center justify-between">
            <button type="button" onClick={prevMonth} className="flex h-7 w-7 items-center justify-center rounded hover:bg-surface-container">
              <ChevronLeft size={16} strokeWidth={1.75} />
            </button>
            <span className="text-[13px] font-bold text-on-surface">{monthLabel}</span>
            <button type="button" onClick={nextMonth} className="flex h-7 w-7 items-center justify-center rounded hover:bg-surface-container">
              <ChevronRight size={16} strokeWidth={1.75} />
            </button>
          </div>

          {/* DOW header */}
          <div className="mb-0.5 grid grid-cols-7 text-center text-[10.5px] font-bold text-secondary">
            {DOW.map((d) => <span key={d}>{d}</span>)}
          </div>

          {/* day grid */}
          <div className="grid grid-cols-7">
            {cells.map((cell, i) => {
              if (!cell) return <span key={`e${i}`} />;
              const key = _dk(cell);
              const dow = cell.getDay();
              const isWeekend = dow === 0 || dow === 6;
              const isFuture = key > today;
              const disabled = (disableWeekends && isWeekend) || isFuture;
              const hasData = markedDates.has(key);
              const isStart = isRange && _sameDay(cell, sortedStart);
              const isEnd = isRange && _sameDay(cell, sortedEnd);
              const inRng = isRange && sortedStart && sortedEnd && _inRange(cell, sortedStart, sortedEnd) && !isStart && !isEnd;

              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleDayClick(cell)}
                  onMouseEnter={() => setHover(cell)}
                  onMouseLeave={() => setHover(null)}
                  className={[
                    "relative flex h-[34px] flex-col items-center justify-center rounded text-[12.5px] font-semibold transition-colors",
                    disabled ? "cursor-default text-on-surface opacity-[0.45]"
                      : (isStart || isEnd) ? "bg-primary text-white"
                      : inRng ? "bg-primary-fixed text-primary"
                      : "text-on-surface hover:bg-surface-container",
                  ].join(" ")}
                >
                  {cell.getDate()}
                  {hasData && (
                    <span className={[
                      "absolute bottom-[3px] h-1 w-1 rounded-full",
                      (isStart || isEnd) ? "bg-white" : "bg-primary-container",
                    ].join(" ")} />
                  )}
                </button>
              );
            })}
          </div>

          {/* legend */}
          <div className="mt-2 flex items-center gap-4 text-[10.5px] text-secondary">
            <span className="flex items-center gap-1">
              <span className="h-1 w-1 rounded-full bg-primary-container" /> {markedLabel}
            </span>
            <span>{disableWeekends ? "Greyed = weekend / future" : "Greyed = future"}</span>
          </div>

          {/* range footer */}
          {isRange && (
            <div className="mt-2.5 border-t border-outline-variant pt-2.5">
              <div className="mb-2 text-[12px] text-secondary">
                {rangeStart && rangeEnd
                  ? `Range: ${_fmtFull(rangeStart)} – ${_fmtFull(rangeEnd)}`
                  : rangeStart
                  ? `Start: ${_fmtShort(rangeStart)} — pick end date`
                  : "Pick start date"}
              </div>
              <button
                type="button"
                disabled={!rangeStart || !rangeEnd}
                onClick={applyRange}
                className={[
                  "w-full rounded-md px-3 py-2 text-[13px] font-bold transition-colors",
                  rangeStart && rangeEnd
                    ? "bg-primary text-white hover:bg-primary/90"
                    : "cursor-default bg-surface-container text-secondary",
                ].join(" ")}
              >
                Apply range
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
