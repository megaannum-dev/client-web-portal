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
