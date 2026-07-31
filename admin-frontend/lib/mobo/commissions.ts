/* ============================================================
   MOBO — Commission / Settlement data-access SEAM

   This is the SINGLE place data reaches the Commission Tracking
   screen and the Trade Reconciliation "Master ↔ Client Settlement"
   tab. Both bind to `loadCommissions()` / `loadSettlement()` and
   the types below — and NEVER import `lib/mock` directly.

   TODAY: NO DATA. Both providers return empty — the mock fee book
   and settlement roster (`lib/mock/mobo-commission-data.ts`, plus
   the ported `buildFeeBook`/`buildSettlementRows` generators) were
   deleted so no invented numbers can be mistaken for real ones.
   There is no fee/settlement API yet; when one lands, only the
   bodies of `loadCommissions` / `loadSettlement` change — the types,
   the formatters, `computeFeeTotals`, and every component stay as
   they are.
   ============================================================ */

/** A client on a fee line. Shape the fee sheet renders, nothing more. */
export interface FeeClient {
  id: string;
  name: string;
  accCode: string;
}

/** A model on a fee line, with the terms the calc breakdown needs. */
export interface FeeModel {
  id: string;
  name: string;
  acct: string;
  aum: number;
  mgmtBps: number;
  incPct: number;
}

/* ---- money formatters (ported from cmMoney/cmM) ------------- */
export function fmtFee(v: number): string {
  return (v < 0 ? "−$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US");
}

export function fmtFeeShort(v: number): string {
  return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}k`;
}

/* ============================================================
   FEE BOOK — one row per (model, client) pair
   ============================================================ */

export type FeeStatus = "paid" | "invoiced" | "accrued";

export interface FeeRow {
  key: string;
  client: FeeClient;
  model: FeeModel;
  units: number;
  aum: number;
  mgmtBps: number;
  mgmtFee: number;
  pnl: number;
  shortfall: number;
  gain: number;
  incPct: number;
  incFee: number;
  total: number;
  status: FeeStatus;
}

/** THE SINGLE DATA PROVIDER for Commission Tracking.
 *
 * No fee source exists yet, so this returns an empty book rather than
 * generated numbers. Wire a real API here; nothing downstream changes. */
export function loadCommissions(): { month: string; rows: FeeRow[] } {
  return { month: "—", rows: [] };
}

/** Port of MoboCommissions.jsx's dashboard-tile `cmFeeTotals()`, generalized to take rows. */
export function computeFeeTotals(rows: FeeRow[]): {
  mgmtTotal: number;
  incTotal: number;
  totalBillable: number;
  belowHwmCount: number;
} {
  const mgmtTotal = rows.reduce((s, r) => s + r.mgmtFee, 0);
  const incTotal = rows.reduce((s, r) => s + r.incFee, 0);
  return {
    mgmtTotal,
    incTotal,
    totalBillable: mgmtTotal + incTotal,
    belowHwmCount: rows.filter((r) => r.gain <= 0).length,
  };
}

/* ============================================================
   SETTLEMENT — Master ↔ Client Settlement tab
   ============================================================ */

export type SettlementStatus = "Settled" | "Pending";

export interface SettlementRow {
  key: string;
  account: string;
  type: "Master" | "Client";
  model: string;
  amount: string;
  status: SettlementStatus;
}

/** THE SINGLE DATA PROVIDER for the Master ↔ Client Settlement tab.
 *
 * No settlement source exists yet — empty until one is wired. */
export function loadSettlement(): SettlementRow[] {
  return [];
}
