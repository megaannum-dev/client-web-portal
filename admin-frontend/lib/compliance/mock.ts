// PURGEABLE — prototype seed data, no backend. Replace with server layer when wiring.
//
// Compliance Officer (CO) data + helpers. Two work types on one page:
// onboarding package reviews, and large-redemption ( > US$300K ) compliance
// sign-off. Ported verbatim from the design prototype (CoData.jsx) — seed
// values are identical.

/* ---- doc verdict: null = unreviewed, "valid", "issue" ------ */
export type DocVerdict = "valid" | "issue" | null;

export type ObStatus = "pending" | "approved" | "rejected";

export interface Onboarding {
  id: string;
  client: string;
  email: string;
  phone: string;
  ibhk: string;
  silverwate: string;
  rm: string;
  submitted: string;
  status: ObStatus;
  type: string;
  /** 1 = valid, 0 = flagged (seed completeness only). */
  docs: number[];
  rejectReason?: string;
}

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

/* ---- the 7 required onboarding documents ------------------- */
export const DOC_NAMES = [
  "Discretionary PMS Service Agreement",
  "Investment Policy Statement",
  "Financial & Investment Fact Finder Questionnaire",
  "Financial Health Check — Derivatives Knowledge Form",
  "Fee Schedule",
  "Risk Disclosure Statement",
  "ID / Passport / Proof of Address",
];

/* docs: 1 = valid, 0 = flagged. status: pending | approved | rejected */
export const CO_ONBOARDING: Onboarding[] = [
  { id: "ob1", client: "Marcus Chen", email: "mchen@email.com", phone: "+852 9123 4567",
    ibhk: "U12345678", silverwate: "SW-001234", rm: "Sarah Chen", submitted: "08 Jul 2026",
    status: "pending", type: "Initial Onboarding", docs: [1, 1, 0, 1, 1, 1, 1] },
  { id: "ob2", client: "Elena Vasquez", email: "evasquez@mail.com", phone: "+852 6789 0123",
    ibhk: "U23456789", silverwate: "SW-002345", rm: "James Liu", submitted: "10 Jul 2026",
    status: "pending", type: "Yearly Renewal", docs: [1, 1, 1, 1, 1, 0, 0] },
  { id: "ob3", client: "James Wong", email: "jwong@corp.hk", phone: "+852 5555 1234",
    ibhk: "U34567890", silverwate: "SW-003456", rm: "Sarah Chen", submitted: "03 Jul 2026",
    status: "approved", type: "Initial Onboarding", docs: [1, 1, 1, 1, 1, 1, 1] },
  { id: "ob4", client: "Priya Sharma", email: "psharma@global.com", phone: "+852 8765 4321",
    ibhk: "U45678901", silverwate: "SW-004567", rm: "David Park", submitted: "05 Jul 2026",
    status: "rejected", type: "Yearly Renewal", docs: [1, 0, 1, 1, 0, 1, 1],
    rejectReason: "Investment Policy Statement missing signature page; Fee Schedule references outdated rate table." },
  { id: "ob5", client: "Robert Fischer", email: "rfischer@invest.ch", phone: "+41 79 234 5678",
    ibhk: "U56789012", silverwate: "SW-005678", rm: "James Liu", submitted: "12 Jul 2026",
    status: "pending", type: "Yearly Renewal", docs: [1, 1, 1, 0, 1, 1, 1] },
];

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
