// 021 UI-1 — the date-jump popover: Mo-first month grid, a day is pickable
// only if it has messages
"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "@/lib/icons";

function iso(date: Date): string {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

// ponytail: Mo-first weekday abbreviations via Intl instead of a duplicated
// i18n table for 7 short strings — this app has no shared date util (plan §5).
function weekdayAbbrevs(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
  // 2024-01-01 is a Monday — walk 7 consecutive days from there.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)).slice(0, 2));
}

export function DayJumpCalendar({
  recordedIsos,
  selectedIso,
  onPick,
}: {
  recordedIsos: Set<string>;
  selectedIso: string | null;
  onPick: (iso: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const dow = weekdayAbbrevs(i18n.language);
  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString(i18n.language, { month: "long", year: "numeric" });

  const daysIn = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDow = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Monday = 0

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); } else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); } else setViewMonth((m) => m + 1);
  }

  return (
    <div className="absolute right-6 top-[60px] z-[6] w-[278px] box-border bg-surface-lowest border border-outline-variant rounded-md shadow-overlay pt-3.5 px-3.5 pb-2.5 select-none">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={prevMonth} aria-label={t("messaging.calendar.prev_month")} className="border-none bg-transparent cursor-pointer p-1 rounded text-secondary flex">
          <ChevronLeft size={16} strokeWidth={1.75} />
        </button>
        <span className="text-[13px] font-bold text-on-surface">{monthLabel}</span>
        <button type="button" onClick={nextMonth} aria-label={t("messaging.calendar.next_month")} className="border-none bg-transparent cursor-pointer p-1 rounded text-secondary flex">
          <ChevronRight size={16} strokeWidth={1.75} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-0.5">
        {dow.map((w, i) => (
          <div key={i} className="text-center text-[10.5px] font-bold text-secondary py-1 tracking-[0.03em]">{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstDow }, (_, i) => (
          <div key={`lead-${i}`} className="w-full h-[30px] invisible" />
        ))}
        {Array.from({ length: daysIn }, (_, i) => {
          const d = i + 1;
          const date = new Date(viewYear, viewMonth, d);
          const cellIso = iso(date);
          const has = recordedIsos.has(cellIso);
          const selected = selectedIso === cellIso;
          const disabled = date > today || !has;
          return (
            <button
              key={cellIso}
              type="button"
              disabled={disabled}
              onClick={() => onPick(cellIso)}
              className={[
                "w-full h-[30px] border-none rounded text-[12.5px] font-semibold flex items-center justify-center relative",
                disabled ? "cursor-default opacity-45" : "cursor-pointer opacity-100",
                selected ? "bg-primary text-primary-foreground" : disabled ? "bg-transparent text-outline" : "bg-transparent text-on-surface",
              ].join(" ")}
            >
              <span>{d}</span>
              {has && !selected && (
                <span className="absolute bottom-[3px] left-1/2 -translate-x-1/2 size-1 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 mt-2 text-[10.5px] text-secondary font-semibold">
        <span className="size-[5px] rounded-full bg-primary" />
        <span>{t("messaging.calendar.days_with_messages")}</span>
      </div>
    </div>
  );
}
