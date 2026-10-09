// Pure SOP schedule logic (ported from the design prototype). No React.
import type { SopCategory } from "@/lib/sop/types";

/** daily: minutes from midnight; weekly: 0=Mon..6=Sun; monthly: 1..31, or -1..-10 counted back from month-end (-1 = last day). Stamp = start === end. */
export type Win = { start: number; end: number };

export const PERIODIC: SopCategory[] = ["daily", "weekly", "monthly"];
export const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DOW_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const pad = (n: number) => String(n).padStart(2, "0");
export const hm = (m: number) => pad(Math.floor(m / 60)) + ":" + pad(m % 60);
export const defWin = (cat: SopCategory): Win | null =>
  cat === "daily" ? { start: 540, end: 600 } : cat === "weekly" ? { start: 0, end: 0 } : cat === "monthly" ? { start: 1, end: 5 } : null;
export const isPoint = (w: Win | null | undefined): boolean => !!w && w.start === w.end;
export const ordinal = (n: number) =>
  n + (["th", "st", "nd", "rd"][(n % 100 - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");
export const mLbl = (v: number) => (v > 0 ? `Day ${v}` : v === -1 ? "Last day" : `${ordinal(-v)} last day`);
export const monthLen = (d: Date = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
export const resDay = (v: number, len: number = monthLen()) => (v > 0 ? Math.min(v, len) : len + 1 + v);
export const hasEom = (w: Win | null | undefined) => !!w && (w.start < 0 || w.end < 0 || w.start > 28 || w.end > 28);

export function runsNote(w: Win, now: Date = new Date()): string {
  const len = monthLen(now), a = resDay(w.start, len), b = resDay(w.end, len);
  const mon = now.toLocaleDateString("en-GB", { month: "short" });
  return a === b ? `Runs ${a} ${mon}` : `Runs ${a}–${b} ${mon}`;
}

/** A monthly range must stay in order for every month length (28–31). */
export function okRange(cat: SopCategory, s: number, e: number): boolean {
  if (cat !== "monthly") return s < e;
  if (s === e) return false;
  return [28, 29, 30, 31].every((n) => resDay(s, n) <= resDay(e, n)) && resDay(s, 31) < resDay(e, 31);
}
export const winValid = (cat: SopCategory, w: Win | null | undefined): boolean =>
  !!w && (isPoint(w) || okRange(cat, w.start, w.end));

export function fmtWin(cat: SopCategory, w: Win | null | undefined): string | null {
  if (!w || !PERIODIC.includes(cat)) return null;
  if (cat === "daily") return isPoint(w) ? `At ${hm(w.start)}` : `${hm(w.start)} – ${hm(w.end)}`;
  if (cat === "weekly") return isPoint(w) ? DOW_FULL[w.start] : `${DOW[w.start]} – ${DOW[w.end]}`;
  if (isPoint(w)) return mLbl(w.start);
  return w.start > 0 && w.end > 0 ? `Day ${w.start} – ${w.end}` : `${mLbl(w.start)} – ${mLbl(w.end)}`;
}

/** Select options [value, label] for a window start/end picker. */
export function windowOptions(cat: SopCategory): [number, string][] {
  if (cat === "daily") return Array.from({ length: 48 }, (_, i) => [i * 30, hm(i * 30)] as [number, string]);
  if (cat === "weekly") return DOW_FULL.map((d, i) => [i, d] as [number, string]);
  return [
    ...Array.from({ length: 31 }, (_, i) => [i + 1, `Day ${i + 1}`] as [number, string]),
    ...Array.from({ length: 10 }, (_, i) => [i - 10, mLbl(i - 10)] as [number, string]),
  ];
}

export type AxisTick = { at: number; label: string; strong?: boolean };
export type Axis = {
  sub: string;
  /** [start, end] as 0..1 fractions of the axis for a window. */
  pos: (w: Win) => [number, number];
  lines: number[];
  ticks: AxisTick[];
  now: number | null;
  nowLabel: string;
  /** daily: minutes now; weekly: 0..6; monthly: day-of-month (null if `ref` is another month). */
  nowRaw: number | null;
  cols?: number;
  shade?: [number, number] | null;
};

/** Timeline axis for one category. `wins` = the windows to fit; `ref` = month shown (monthly only). */
export function tlAxis(cat: SopCategory, wins: Win[], now: Date, ref: Date = now): Axis {
  if (cat === "daily") {
    const lo = Math.min(6, ...wins.map((w) => Math.floor(w.start / 60))) * 60;
    const hi = Math.max(20, ...wins.map((w) => Math.ceil(w.end / 60))) * 60;
    const span = hi - lo, n = now.getHours() * 60 + now.getMinutes();
    const hours = Array.from({ length: span / 60 + 1 }, (_, i) => i * 60);
    return {
      sub: `Hourly · ${hm(lo)} – ${hm(hi)}`,
      pos: (w) => [(w.start - lo) / span, (w.end - lo) / span],
      lines: hours.map((m) => m / span),
      ticks: hours.map((m) => ({ at: m / span, label: hm(lo + m) })),
      now: n >= lo && n <= hi ? (n - lo) / span : null,
      nowLabel: hm(n),
      nowRaw: n,
    };
  }
  const weekly = cat === "weekly";
  const cur = ref.getFullYear() === now.getFullYear() && ref.getMonth() === now.getMonth();
  const days = weekly ? 7 : monthLen(ref), base = weekly ? 0 : 1;
  const r = weekly ? (v: number) => v : (v: number) => resDay(v, days);
  const nd = weekly ? (now.getDay() + 6) % 7 : cur ? now.getDate() : null;
  const frac = (now.getHours() * 60 + now.getMinutes()) / 1440;
  return {
    sub: weekly ? "Days of the week" : `${ref.toLocaleDateString("en-GB", { month: "long", year: "numeric" })} · ${days} days`,
    cols: days,
    pos: (w) => [(r(w.start) - base) / days, (r(w.end) - base + 1) / days],
    lines: Array.from({ length: days + 1 }, (_, i) => i / days),
    shade: weekly ? [5 / 7, 1] : null,
    ticks: Array.from({ length: days }, (_, i) => ({ at: (i + 0.5) / days, label: weekly ? DOW[i] : String(i + 1), strong: i + base === nd })),
    now: nd == null ? null : (nd - base + frac) / days,
    nowLabel: nd == null ? "" : weekly ? DOW_FULL[nd] : now.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    nowRaw: nd,
  };
}

/** Is `n` (see Axis.nowRaw) inside window `w`? Daily stamps match ±15 min. */
export const tlActive = (cat: SopCategory, w: Win, n: number): boolean =>
  cat === "daily"
    ? isPoint(w) ? n >= w.start - 15 && n < w.start + 15 : n >= w.start && n < w.end
    : cat === "monthly" ? n >= resDay(w.start) && n <= resDay(w.end)
    : n >= w.start && n <= w.end;

/** Backend string pair -> Win. Null for ad_hoc or missing start; missing end = stamp. */
export function toWin(cat: SopCategory, starts_at: string | null, ends_at: string | null): Win | null {
  if (cat === "ad_hoc" || starts_at == null) return null;
  const p = (v: string) =>
    cat === "daily" ? Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5))
    : cat === "weekly" ? DOW_FULL.findIndex((d) => d.toLowerCase() === v.toLowerCase())
    : Number(v);
  const start = p(starts_at);
  return { start, end: ends_at == null ? start : p(ends_at) };
}

/** Win -> backend string pair. Stamp -> ends_at null. */
export function toWire(cat: SopCategory, win: Win | null): { starts_at: string | null; ends_at: string | null } {
  if (cat === "ad_hoc" || !win) return { starts_at: null, ends_at: null };
  const f = (v: number) => (cat === "daily" ? hm(v) : cat === "weekly" ? DOW_FULL[v].toLowerCase() : String(v));
  return { starts_at: f(win.start), ends_at: isPoint(win) ? null : f(win.end) };
}
