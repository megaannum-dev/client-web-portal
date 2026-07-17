// PURGEABLE — prototype seed data, no backend. Replace with server layer when wiring.
//
// Ported from the hi-fi prototype (pc-app/PCData.jsx + AllotmentRedemption.jsx).
// The allotment/redemption ALLOC_MODELS variant carries per-UNIT notionals
// (mA/mB = 1,000,000, mC = 500,000, mD = 0) — distinct from Model Management's
// per-model notionals. `acct` is per-client in production; these are anonymized
// prototype values shown for display only (see MEMORY: pc-ib-account-per-client).
//
// fmtMoney / fmtMoneyShort are reused from `@/lib/pc/format` (identical to the
// prototype's) rather than re-declared here.

export type AllotStatus = "pending" | "acknowledged";
export type RedeemStatus = "pending_pc" | "approved" | "rejected" | "pending_compliance";

export interface ArModel {
  id: string;
  name: string;
  notional: number;
  acct: string | null;
  live: boolean;
}

export interface Allotment {
  id: string;
  mid: string;
  mult: number;
  aggBefore: number;
  aggAfter: number;
  cashIn: string;
  rm: string;
  ref: string;
  status: AllotStatus;
  date: string;
}

export interface Redemption {
  id: string;
  mid: string;
  mult: number;
  rm: string;
  ref: string;
  status: RedeemStatus;
  date: string;
  emergent?: boolean;
}

export const COMPLIANCE_THRESHOLD = 300000;

export const ALLOC_MODELS: ArModel[] = [
  { id: "mA", name: "Model A", notional: 1_000_000, acct: "U-1011", live: true },
  { id: "mB", name: "Model B", notional: 1_000_000, acct: "U-2044", live: true },
  { id: "mC", name: "Model C", notional: 500_000, acct: "U-3077", live: true },
  { id: "mD", name: "Model D", notional: 0, acct: null, live: false },
];

export const AR_ALLOTMENTS_SEED: Allotment[] = [
  { id: "al1", mid: "mA", mult: 2, aggBefore: 8, aggAfter: 10, cashIn: "15 Aug 2026", rm: "Sarah Chen", ref: "AL-2026-001", status: "pending", date: "10 Jul 2026" },
  { id: "al2", mid: "mB", mult: 1, aggBefore: 25, aggAfter: 26, cashIn: "22 Aug 2026", rm: "James Liu", ref: "AL-2026-002", status: "acknowledged", date: "08 Jul 2026" },
  { id: "al3", mid: "mA", mult: 3, aggBefore: 10, aggAfter: 13, cashIn: "01 Sep 2026", rm: "Sarah Chen", ref: "AL-2026-003", status: "pending", date: "12 Jul 2026" },
  { id: "al4", mid: "mC", mult: 1, aggBefore: 5, aggAfter: 6, cashIn: "28 Aug 2026", rm: "David Park", ref: "AL-2026-004", status: "acknowledged", date: "05 Jul 2026" },
];

export const AR_REDEMPTIONS_SEED: Redemption[] = [
  { id: "rd1", mid: "mA", mult: 1, rm: "James Liu", ref: "RD-2026-001", status: "pending_pc", date: "11 Jul 2026", emergent: true },
  { id: "rd2", mid: "mC", mult: 2, rm: "Sarah Chen", ref: "RD-2026-002", status: "pending_pc", date: "09 Jul 2026" },
  { id: "rd3", mid: "mB", mult: 0.5, rm: "James Liu", ref: "RD-2026-003", status: "approved", date: "06 Jul 2026" },
  { id: "rd4", mid: "mC", mult: 0.5, rm: "Sarah Chen", ref: "RD-2026-004", status: "pending_pc", date: "13 Jul 2026" },
];

export const arModelById = (id: string): ArModel =>
  ALLOC_MODELS.find((m) => m.id === id) ?? ALLOC_MODELS[0];

export const arAllotAmt = (a: Allotment): number => a.mult * arModelById(a.mid).notional;
export const arRedeemAmt = (r: Redemption): number => r.mult * arModelById(r.mid).notional;
export const arNeedsCompliance = (r: Redemption): boolean => arRedeemAmt(r) > COMPLIANCE_THRESHOLD;
