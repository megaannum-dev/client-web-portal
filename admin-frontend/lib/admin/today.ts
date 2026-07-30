/* ============================================================
   Admin console — today's date, computed
   Replaces the deleted seed mock's frozen date constant, which
   hardcoded "27 Jul 2026" and would eventually claim a date in the
   past. FE-9.
   ============================================================ */

/** Today as the console renders a date: "27 Jul 2026". */
export function todayLabel(d: Date = new Date()): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** The wizard's free-text Start date field ("27 Jul 2026") -> an ISO date
 *  ("2026-07-27"), or null when empty/unparseable. `admin_profiles.start_date`
 *  is a DATE column, not a timestamp. */
export function isoDateOrNull(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** The Access step's expiry pick ("30 days" / "30 Sep 2026" / "No expiry") -> an ISO
 *  instant, or null for "No expiry". Mirrors LifecycleModals.tsx's expiryToISO. */
export function expiryToIso(exp: string): string | null {
  if (exp === "No expiry") return null;
  const relative = /^(\d+)\s+days$/.exec(exp);
  if (relative) {
    const d = new Date();
    d.setDate(d.getDate() + Number(relative[1]));
    return d.toISOString();
  }
  const d = new Date(exp);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
