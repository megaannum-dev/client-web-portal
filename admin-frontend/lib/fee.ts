// The ONLY fee parser/formatter in admin-frontend (proposal 020 Goal 1).
// Fee unit is the decimal fraction everywhere (seam §7.1(a)): 0.02 means 2%.

/**
 * "1.5%" | "1.5" -> 0.015. Accepts the modals' free-text fee inputs (with or
 * without a trailing "%"); strips everything but digits and the decimal point,
 * then divides by 100. THROWS on empty/unparseable input so the caller surfaces
 * a validation error instead of silently sending 0.
 * Moved verbatim from lib/onboarding/fee.ts:8-14 — it is no longer onboarding-specific.
 */
export function parseFeePercent(input: string): number {
  const cleaned = input.trim().replace(/[^\d.]/g, "");
  if (!cleaned) throw new Error(`Invalid fee value: "${input}"`);
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw new Error(`Invalid fee value: "${input}"`);
  return n / 100;
}

/**
 * 0.015 -> "1.5%". The inverse of parseFeePercent.
 * parseFloat after toFixed(2) trims trailing zeros (0.10 -> "10%", not "10.00%").
 * Moved from lib/rm/subscriptions.ts:38-40, where it was module-private.
 */
export function formatFeePercent(fraction: number): string {
  return `${parseFloat((fraction * 100).toFixed(2))}%`;
}
