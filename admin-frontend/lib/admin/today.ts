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

/** A date as the local calendar day in ISO form ("2026-07-27") -- the value an
 *  `<input type="date">` holds and `admin_profiles.start_date` (a DATE) stores.
 *  Local, not toISOString(), which would shift the day east of UTC. */
export function todayIso(d: Date = new Date()): string {
  return d.toLocaleDateString("en-CA");
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
