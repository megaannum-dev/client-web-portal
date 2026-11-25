/** Positive integer draft. Empty is kept so the field can be cleared while typing. */
export function nextMultiplier(raw: string): string | null {
  const v = raw.trim();
  return v === "" || /^\d+$/.test(v) ? v : null;
}

export type MultiplierIssue = "invalid" | "exceeds";

/** Positive integer, and not above `max` units currently held. */
export function multiplierIssue(raw: string, max?: number): MultiplierIssue | null {
  if (!/^\d+$/.test(raw)) return "invalid";
  const mul = Number(raw);
  if (!Number.isSafeInteger(mul) || mul <= 0) return "invalid";
  if (max != null && mul > max) return "exceeds";
  return null;
}
