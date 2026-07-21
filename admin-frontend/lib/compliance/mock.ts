// PURGEABLE — prototype seed data, no backend. Replace with server layer when wiring.
//
// Compliance Officer (CO) data + helpers. Two work types on one page:
// onboarding package reviews, and large-redemption ( > US$300K ) compliance
// sign-off. Ported verbatim from the design prototype (CoData.jsx) — seed
// values are identical.

export type CrStatus = "pending_co" | "approved_co" | "rejected_co";

export interface Redemption {
  id: string;
  ref: string;
  mid: string;
  mult: number;
  rm: string;
  date: string;
  pcApproved: string;
  status: CrStatus;
  gateLimit: number;
  liquidity: number;
  emergent?: boolean;
}

/* ---- large-redemption review ------------------------------ */
export const CR_MODELS: Record<string, { name: string; notional: number }> = {
  mA: { name: "Model A", notional: 1000000 },
  mB: { name: "Model B", notional: 1000000 },
  mC: { name: "Model C", notional: 500000 },
};
export const COMPLIANCE_THRESHOLD = 300000;

/* status: pending_co | approved_co | rejected_co */
export const CR_REDEMPTIONS: Redemption[] = [
  { id: "cr1", ref: "RD-2026-001", mid: "mA", mult: 1, rm: "James Liu", date: "11 Jul 2026",
    pcApproved: "12 Jul 2026", status: "pending_co", gateLimit: 10, liquidity: 78, emergent: true },
  { id: "cr2", ref: "RD-2026-005", mid: "mB", mult: 2, rm: "Sarah Chen", date: "09 Jul 2026",
    pcApproved: "10 Jul 2026", status: "pending_co", gateLimit: 15, liquidity: 62 },
  { id: "cr3", ref: "RD-2026-003", mid: "mA", mult: 0.5, rm: "David Park", date: "06 Jul 2026",
    pcApproved: "07 Jul 2026", status: "approved_co", gateLimit: 10, liquidity: 85 },
  { id: "cr4", ref: "RD-2026-008", mid: "mC", mult: 3, rm: "James Liu", date: "13 Jul 2026",
    pcApproved: "14 Jul 2026", status: "pending_co", gateLimit: 8, liquidity: 44 },
];

/* ---- helpers ---------------------------------------------- */
export const coMoney = (n: number) => "$" + Number(n).toLocaleString("en-US");
export function coMoneyShort(v: number) {
  if (v >= 1e6) { const x = v / 1e6; return "$" + (x % 1 === 0 ? x : x.toFixed(1)) + "M"; }
  if (v >= 1e3) return "$" + Math.round(v / 1e3) + "k";
  return "$" + v;
}
export const crModel = (mid: string) => CR_MODELS[mid];
export const crAmt = (r: Redemption) => r.mult * crModel(r.mid).notional;
export function liquidityColor(pct: number) {
  if (pct >= 70) return "#15803d";
  if (pct >= 50) return "#c2410c";
  return "#ba1a1a";
}
export function riskLevel(r: Redemption): { label: string; tone: "failed" | "pending" | "active" } {
  const amt = crAmt(r);
  if (r.liquidity < 50 || amt > 1500000) return { label: "High", tone: "failed" };
  if (r.liquidity < 70 || amt > 800000) return { label: "Medium", tone: "pending" };
  return { label: "Low", tone: "active" };
}
export function clientInitial(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}
