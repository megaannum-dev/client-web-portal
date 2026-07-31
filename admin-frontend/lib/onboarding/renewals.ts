import type { AdminOnboardingRow } from "./types";

export interface RenewalDue {
  client: string;
  rm: string;
  docLabel: string;
  expiresAt: string;
  days: number;
}

export function renewalDueForRow(row: AdminOnboardingRow): RenewalDue | null {
  const candidates = row.documents.filter((d) => d.periodic_review && d.expires_at);
  if (candidates.length === 0) return null;
  const soonest = candidates.reduce((a, b) =>
    new Date(a.expires_at!).getTime() < new Date(b.expires_at!).getTime() ? a : b
  );
  const days = Math.ceil((new Date(soonest.expires_at!).getTime() - Date.now()) / 86_400_000);
  return { client: row.client, rm: row.rm, docLabel: soonest.label, expiresAt: soonest.expires_at!, days };
}
