/**
 * "1.5%" → 0.015. Accepts the modal's free-text fee inputs (which may or
 * may not include a trailing "%", per today's placeholder examples "1.0%"
 * / "10%"); strips non-numeric characters except the decimal point, then
 * divides by 100. Throws on an empty/unparseable string so the caller can
 * surface a validation error rather than silently sending 0.
 */
export function parseFeePercent(input: string): number {
  const cleaned = input.trim().replace(/[^\d.]/g, "");
  if (!cleaned) throw new Error(`Invalid fee value: "${input}"`);
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw new Error(`Invalid fee value: "${input}"`);
  return n / 100;
}
