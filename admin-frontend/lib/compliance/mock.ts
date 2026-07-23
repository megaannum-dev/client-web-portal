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

// ponytail: the prototype's riskLevel() also weighs a "liquidity %" that has
// no backend counterpart (AllotRdmptDTO carries no liquidity field) — Compliance
// Overview's redemption risk chip uses amount tier alone. Add the liquidity leg
// back if/when that data lands on the DTO.
export function redemptionAmountRisk(amount: number): { label: string; tone: "failed" | "pending" | "active" } {
  if (amount > 1500000) return { label: "High", tone: "failed" };
  if (amount > 800000) return { label: "Medium", tone: "pending" };
  return { label: "Low", tone: "active" };
}
export function clientInitial(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

/* ---- investment guidelines (read-only reference, per client) ----
   No backend endpoint exists for this yet (PM-authored guideline docs
   aren't modeled anywhere in the API) — ported verbatim from the design
   prototype (CoData.jsx GR_GUIDELINES), same as the rest of this file. */
export interface Guideline {
  id: string; ref: string; name: string; mandate: string;
  pm: string; client: string; effective: string; file: string;
  status: "active" | string; version: number;
}
export const GR_GUIDELINES: Guideline[] = [
  { id: "gr1", ref: "OB-2026-011", name: "Global Growth Mandate — IPS 2026", mandate: "Discretionary · Growth",
    pm: "James Liu", client: "Marcus Chen", effective: "01 Aug 2026", file: "IG_OB-2026-011_v1.pdf", status: "active", version: 1 },
  { id: "gr2", ref: "OB-2026-009", name: "Fixed Income Guideline — IPS 2026", mandate: "Advisory · Income",
    pm: "David Park", client: "Thomas Berg", effective: "20 Jul 2026", file: "IG_OB-2026-009_v2.pdf", status: "active", version: 2 },
  { id: "gr3", ref: "OB-2026-013", name: "Multi-Asset Discretionary Guideline", mandate: "Discretionary · Balanced",
    pm: "Sarah Chen", client: "Aiko Tanaka", effective: "15 Jul 2026", file: "IG_OB-2026-013_v1.pdf", status: "active", version: 1 },
  { id: "gr4", ref: "OB-2026-007", name: "Concentrated Equity Guideline", mandate: "Discretionary · Growth",
    pm: "James Liu", client: "Elena Vasquez", effective: "—", file: "IG_OB-2026-007_v1.pdf", status: "active", version: 1 },
];

/* ---- renewals approaching (CO must re-verify docs on renewal) ----
   Same story: no "next renewal due date" tracking exists on the onboarding
   backend yet, so this stays mock-only like GR_GUIDELINES above. */
export interface Renewal {
  client: string; rm: string; mandate: string; due: string; days: number;
}
export const CO_RENEWALS: Renewal[] = [
  { client: "Nadia Rahman", rm: "Sarah Chen", mandate: "Discretionary · Growth", due: "21 Jul 2026", days: -2 },
  { client: "Thomas Berg", rm: "David Park", mandate: "Advisory · Income", due: "26 Jul 2026", days: 3 },
  { client: "Aiko Tanaka", rm: "James Liu", mandate: "Discretionary · Balanced", due: "31 Jul 2026", days: 8 },
  { client: "Sofia Marchetti", rm: "David Park", mandate: "Advisory · Income", due: "13 Aug 2026", days: 21 },
  { client: "Grace Okonkwo", rm: "Sarah Chen", mandate: "Discretionary · Growth", due: "20 Aug 2026", days: 28 },
];
