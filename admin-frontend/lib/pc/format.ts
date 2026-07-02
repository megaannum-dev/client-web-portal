import type { FeeBreakdown, Model } from "./types";

/** `1000000` → `"$1,000,000"`. */
export function fmtMoney(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

/** ISO timestamp -> `"Jun 11, 2026, 2:32 PM"` for change-log entries. */
export function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** ISO timestamp split into separate date and time strings. */
export function fmtTimestampParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "—", time: "" };
  return {
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  };
}

/** Compact money: `$X.XM` / `$Xk` / `$X` (exact PCData.jsx semantics). */
export function fmtMoneyShort(v: number): string {
  if (v >= 1e6) {
    const x = v / 1e6;
    return "$" + (x % 1 === 0 ? x : x.toFixed(1)) + "M";
  }
  if (v >= 1e3) {
    const x = v / 1e3;
    return "$" + Math.round(x) + "k";
  }
  return "$" + v;
}

/**
 * Compute management + incentive fees for a model given a performance
 * figure and hurdle (both whole-number percentages). Hardcoded rates are
 * per-model (D-7); per-client overrides come later.
 */
export function computeFees(m: Model, perf: number, hurdle: number): FeeBreakdown {
  const mgmtFee = (m.mgmt / 100) * m.size;
  const excess = Math.max(perf - hurdle, 0);
  const incFee = (m.incentive / 100) * (excess / 100) * m.size;
  return { mgmtFee, incFee, total: mgmtFee + incFee, excess };
}
