"use client";

import { renderChangeLines } from "@/lib/pc/change-log";
import { fmtTimestampParts } from "@/lib/pc/format";
import type { Model } from "@/lib/pc/types";

export function ChangesTab({ m }: { m: Model }) {
  if (!m.changes.length) {
    return <div className="py-[30px] text-center text-[13.5px] text-secondary">No changes recorded yet.</div>;
  }
  return (
    <div className="relative pl-[18px]">
      <span className="absolute left-1 top-1 bottom-2 w-[1.5px] bg-outline-variant" />
      {m.changes.map((c, i) => {
        const { date, time } = fmtTimestampParts(c.date);
        const lines = renderChangeLines(c);
        return (
          <div key={`${c.date}-${i}`} className="relative" style={{ paddingBottom: i < m.changes.length - 1 ? 16 : 0 }}>
            <span
              className="absolute left-[-18px] top-[3px] h-[9px] w-[9px] rounded-full"
              style={{
                background: i === 0 ? "rgb(var(--color-primary))" : "rgb(var(--color-surface-highest))",
                border: `1.5px solid ${i === 0 ? "rgb(var(--color-primary))" : "rgb(var(--color-outline))"}`,
              }}
            />
            <div className="flex items-start justify-between gap-3">
              <div className="text-[13.5px] font-bold text-on-surface">
                {lines.map((line, j) => (
                  <div key={j}>{line}</div>
                ))}
              </div>
              <div className="shrink-0 text-right text-[12px] text-secondary">
                <div>{date}</div>
                <div>{time}</div>
              </div>
            </div>
            <div className="mt-0.5 text-[12.5px] text-secondary">
              {c.user} · <span className="font-bold text-primary">{c.ver}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
