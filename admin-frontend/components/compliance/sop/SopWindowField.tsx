"use client";

import { SOP_CATEGORIES, type SopCategory } from "@/lib/sop/types";
import { hasEom, isPoint, okRange, runsNote, windowOptions, type Win } from "@/lib/sop/schedule";

const LABEL = "text-[12px] font-semibold uppercase tracking-[0.05em] text-secondary";
const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%235f5e5e' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\") no-repeat right 12px center";

/** Interval / stamp picker for a periodic SOP. End options only offer values that keep the range in order. */
export function SopWindowField({ category, win, onChange }: { category: SopCategory; win: Win; onChange: (w: Win) => void }) {
  const opts = windowOptions(category);
  const point = isPoint(win);
  const stampLbl = category === "daily" ? "Timestamp" : "Day stamp";
  const endsFor = (s: number) => opts.filter(([e]) => okRange(category, s, e));
  const rangeStarts = opts.filter(([v]) => endsFor(v).length);
  const startOpts = point ? opts : rangeStarts;
  const firstEnd = (s: number) =>
    category === "daily" && okRange(category, s, s + 60) ? s + 60 : (endsFor(s)[0] ?? [s])[0];

  const setMode = (toPoint: boolean) => {
    if (toPoint) return onChange({ start: win.start, end: win.start });
    const s = endsFor(win.start).length ? win.start : (rangeStarts[rangeStarts.length - 1]?.[0] ?? win.start);
    onChange({ start: s, end: firstEnd(s) });
  };
  const setStart = (v: number) =>
    onChange(point ? { start: v, end: v } : { start: v, end: okRange(category, v, win.end) ? win.end : firstEnd(v) });

  const unit = point
    ? category === "daily" ? "A specific time of day" : category === "weekly" ? "A specific day of the week" : "A specific day of the month"
    : category === "daily" ? "Hourly window within the day" : category === "weekly" ? "Day range within the week" : "Day range within the month";
  const catLabel = SOP_CATEGORIES.find((c) => c.key === category)?.label ?? category;

  const select = (value: number, list: [number, string][], fn: (v: number) => void, label: string) => (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => fn(Number(e.target.value))}
      className="h-10 w-full cursor-pointer appearance-none rounded border border-outline-variant bg-surface-lowest pl-3 pr-[34px] text-[14px] text-on-surface outline-none"
      style={{ background: `rgb(var(--color-surface-lowest)) ${CHEVRON}` }}
    >
      {list.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  const modeBtn = (toPoint: boolean, label: string) => {
    const on = toPoint === point;
    return (
      <button
        type="button"
        aria-pressed={on}
        onClick={() => setMode(toPoint)}
        className={`h-[30px] cursor-pointer rounded-[6px] px-3.5 text-[13px] font-semibold transition-all duration-150 ${on ? "bg-surface-lowest text-on-surface shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "bg-transparent text-secondary"}`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={LABEL}>{point ? stampLbl : "Time interval"} <span className="text-primary">*</span></span>
        <div className="inline-flex gap-0.5 rounded bg-surface-container p-[3px]">
          {modeBtn(false, "Interval")}
          {modeBtn(true, stampLbl)}
        </div>
      </div>
      {point ? select(win.start, startOpts, setStart, stampLbl) : (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5">
          {select(win.start, startOpts, setStart, "Starts")}
          <span className="text-[13px] text-secondary">to</span>
          {select(win.end, endsFor(win.start), (v) => onChange({ ...win, end: v }), "Ends")}
        </div>
      )}
      <span className="text-[12.5px] text-secondary">
        {unit}
        {category === "monthly" ? " · Days 29–31 fall back to the last day in shorter months, or count back up to 10 days from month-end" : ""}.
        {" "}Shown on the {catLabel} timeline.
      </span>
      {category === "monthly" && hasEom(win) && (
        <span className="text-[12.5px] font-semibold text-on-surface">
          {runsNote(win)} · {runsNote(win, new Date(new Date().getFullYear(), 1, 1))}
        </span>
      )}
    </div>
  );
}
