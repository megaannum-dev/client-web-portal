"use client";

import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "@/lib/icons";
import { SOP_CATEGORIES, type SopCategory, type SopDocumentDTO } from "@/lib/sop/types";
import { fmtWin, hasEom, isPoint, monthLen, resDay, runsNote, tlActive, tlAxis, toWin, type Axis, type Win } from "@/lib/sop/schedule";

type Row = { sop: SopDocumentDTO; win: Win };
type Colors = { bg: string; fg: string };

function TlBar({ row, category, a, b, active, selected, c, onOpen }: {
  row: Row; category: SopCategory; a: number; b: number; active: boolean; selected: boolean; c: Colors; onOpen: () => void;
}) {
  const [hover, setHover] = useState(false);
  const label = fmtWin(category, row.win) ?? "";
  const solid = active || hover;
  const common = {
    type: "button" as const,
    title: `${row.sop.title} · ${label}`,
    onClick: onOpen,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
  };
  const ring = selected ? "outline outline-2 outline-offset-2 outline-primary" : "";
  const lift = hover ? "shadow-overlay" : "";
  const sideLabel = (style: CSSProperties) => (
    <span className="pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[12px] font-semibold text-on-surface" style={style}>{label}</span>
  );

  if (isPoint(row.win)) {
    const x = (a + b) / 2;
    return (
      <>
        <button
          {...common}
          aria-label={common.title}
          className={`absolute top-1/2 z-[3] -ml-[7px] -mt-[7px] h-3.5 w-3.5 rotate-45 cursor-pointer rounded-[3px] border-[1.5px] p-0 transition-all duration-150 ${ring} ${lift}`}
          style={{ left: `${x * 100}%`, borderColor: c.fg, background: solid ? c.fg : c.bg }}
        />
        {sideLabel(x > 0.8 ? { right: `calc(${(1 - x) * 100}% + 14px)` } : { left: `calc(${x * 100}% + 14px)` })}
      </>
    );
  }
  const inside = b - a >= 0.16;
  return (
    <>
      <button
        {...common}
        className={`absolute inset-y-[9px] z-[1] ml-px min-w-[6px] cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap rounded-[6px] border px-2 text-[12px] font-bold transition-all duration-150 ${ring} ${lift}`}
        style={{ left: `${a * 100}%`, width: `calc(${(b - a) * 100}% - 2px)`, borderColor: c.fg, background: solid ? c.fg : c.bg, color: solid ? "#fff" : c.fg }}
      >
        {inside ? label : ""}
      </button>
      {!inside && sideLabel(b > 0.78 ? { right: `calc(${(1 - a) * 100}% + 8px)` } : { left: `calc(${b * 100}% + 8px)` })}
    </>
  );
}

function Track({ ax, height = 52, top, children }: { ax: Axis; height?: number; top?: boolean; children: ReactNode }) {
  return (
    <div className={`relative ${top ? "" : "border-t border-outline-variant"}`} style={{ height }}>
      {ax.shade && <span className="absolute inset-y-0 right-0 bg-surface-low" style={{ left: `${ax.shade[0] * 100}%` }} />}
      {ax.lines.map((p, i) => <span key={i} className="absolute inset-y-0 w-px bg-surface-container" style={{ left: `${p * 100}%` }} />)}
      {ax.now != null && <span className="pointer-events-none absolute inset-y-0 z-[2] -ml-px w-0.5 bg-primary" style={{ left: `${ax.now * 100}%` }} />}
      {children}
    </div>
  );
}

/** Per-cadence schedule timeline: interval bars, stamp diamonds, a live "now" line. Monthly can step months. */
export function SopTimeline({ category, sops, openId, onOpen }: {
  category: SopCategory; sops: SopDocumentDTO[]; openId?: string | null; onOpen: (id: string) => void;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const [off, setOff] = useState(0);

  const monthly = category === "monthly";
  const ref = monthly ? new Date(now.getFullYear(), now.getMonth() + off, 1) : now;
  const key = (v: number) => (monthly ? resDay(v, monthLen(ref)) : v);
  const rows: Row[] = sops
    .map((sop) => ({ sop, win: toWin(sop.category, sop.starts_at, sop.ends_at) }))
    .filter((r): r is Row => r.win != null)
    .sort((x, y) => key(x.win.start) - key(y.win.start) || key(x.win.end) - key(y.win.end));
  if (!rows.length) return null;

  const ax = tlAxis(category, rows.map((r) => r.win), now, ref);
  const cat = SOP_CATEGORIES.find((c) => c.key === category) ?? SOP_CATEGORIES[0];
  const isActive = (w: Win) => ax.nowRaw != null && tlActive(category, w, ax.nowRaw);
  const live = rows.filter((r) => isActive(r.win)).length;

  const stepBtn = (Icon: typeof ChevronLeft, title: string, fn: () => void) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={fn}
      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-outline-variant bg-surface-lowest text-secondary"
    >
      <Icon size={15} strokeWidth={2} />
    </button>
  );
  const legend = (swatch: ReactNode, label: string) => (
    <span className="inline-flex items-center gap-1.5">{swatch}{label}</span>
  );

  return (
    <section className="mt-5 overflow-hidden rounded-lg border border-outline-variant bg-surface-lowest shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-[18px] font-semibold text-on-surface">{cat.label} Timeline</h2>
            {monthly && (
              <div className="inline-flex items-center gap-1.5">
                {stepBtn(ChevronLeft, "Previous month", () => setOff((o) => o - 1))}
                {stepBtn(ChevronRight, "Next month", () => setOff((o) => o + 1))}
                {off !== 0 && (
                  <button type="button" onClick={() => setOff(0)} className="cursor-pointer px-1 text-[13px] font-semibold text-primary">
                    This month
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="mt-0.5 text-[13px] text-secondary">
            {ax.sub} · {rows.length} SOP{rows.length > 1 ? "s" : ""}{live ? ` · ${live} in window now` : ""}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[12.5px] text-secondary">
          {legend(<span className="h-2.5 w-4 rounded-[3px] border" style={{ background: cat.bg, borderColor: cat.fg }} />, "Scheduled")}
          {legend(<span className="h-[9px] w-[9px] rotate-45 rounded-[2px] border-[1.5px]" style={{ background: cat.bg, borderColor: cat.fg }} />, category === "daily" ? "Timestamp" : "Day stamp")}
          {legend(<span className="h-2.5 w-4 rounded-[3px]" style={{ background: cat.fg }} />, "In window")}
          {legend(<span className="h-3.5 w-0.5 bg-primary" />, "Now")}
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className={`grid grid-cols-[240px_minmax(0,1fr)] pr-6 ${monthly ? "min-w-[900px]" : "min-w-[720px]"}`}>
          <div className="flex items-center px-5 text-[11px] font-semibold uppercase tracking-[0.05em] text-secondary">SOP</div>
          <Track ax={ax} top>
            {ax.ticks.map((t, i) => (
              <span
                key={i}
                className={`absolute top-2.5 z-[3] -translate-x-1/2 whitespace-nowrap text-[11px] ${t.strong ? "font-bold text-primary" : "font-semibold text-secondary"}`}
                style={{ left: `${t.at * 100}%` }}
              >
                {t.label}
              </span>
            ))}
            {ax.now != null && (
              <span
                className="absolute bottom-1 z-[3] -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-1.5 py-px text-[10.5px] font-bold text-white"
                style={{ left: `${ax.now * 100}%` }}
              >
                {ax.nowLabel}
              </span>
            )}
          </Track>
          {rows.map((r) => {
            const [a, b] = ax.pos(r.win);
            const active = isActive(r.win);
            const sel = openId === r.sop.id;
            return (
              <Fragment key={r.sop.id}>
                <button
                  type="button"
                  onClick={() => onOpen(r.sop.id)}
                  className={`flex min-w-0 cursor-pointer flex-col justify-center border-t border-outline-variant px-5 text-left ${sel ? "bg-[#fff3e8]" : "bg-transparent"}`}
                >
                  <span className="truncate text-[13.5px] font-semibold text-on-surface">{r.sop.title}</span>
                  <span
                    title={monthly && hasEom(r.win) ? runsNote(r.win, ref) : undefined}
                    className={`text-[12px] ${active ? "font-bold" : "text-secondary"}`}
                    style={active ? { color: cat.fg } : undefined}
                  >
                    {active ? "In window now" : fmtWin(category, r.win)}
                  </span>
                </button>
                <Track ax={ax}>
                  <TlBar row={r} category={category} a={a} b={b} active={active} selected={sel} c={cat} onOpen={() => onOpen(r.sop.id)} />
                </Track>
              </Fragment>
            );
          })}
        </div>
      </div>
    </section>
  );
}
