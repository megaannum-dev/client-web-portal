/* ============================================================
   MOBO — Commission / Settlement data-access SEAM

   This is the SINGLE place data reaches the Commission Tracking
   screen and the Trade Reconciliation "Master ↔ Client Settlement"
   tab. Both bind to `loadCommissions()` / `loadSettlement()` and
   the types below — and NEVER import `lib/mock` directly.

   TODAY: mock-only, no backend. The mock (`lib/mock/mobo-commission-
   data.ts`) is reached ONLY here. When a real fee/settlement API
   arrives, only the bodies of `loadCommissions` / `loadSettlement`
   change — no component edits.

   Ported from the design handoff (mobo/mobo-app/MoboCommissions.jsx's
   `buildFeeBook`/`cmFeeTotals`, mobo/mobo-app/MoboRecon.jsx's
   `buildSettlementRows`). The design's `modelPnl` term (drawn from a
   perf-history series we don't have a mock for) is replaced by a
   deterministic per-model coin flip via `cmRand` — it only gated
   which of the two return ranges applied, so this keeps the fee
   math self-consistent without inventing a perf-history mock.
   ============================================================ */

import { FEE_MONTH, PTA_CLIENTS, PTA_MODELS, PTA_UNITS, cmRand, type PtaClient, type PtaModel } from "../mock/mobo-commission-data";

/* ---- money formatters (ported from cmMoney/cmM) ------------- */
export function fmtFee(v: number): string {
  return (v < 0 ? "−$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US");
}

export function fmtFeeShort(v: number): string {
  return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}k`;
}

/* ---- shared roster helpers ----------------------------------- */
function ptaModelUnits(modelId: string): number {
  const units = PTA_UNITS[modelId] ?? {};
  return Object.values(units).reduce((s, u) => s + u, 0);
}

function ptaModelClients(modelId: string): PtaClient[] {
  const units = PTA_UNITS[modelId] ?? {};
  return PTA_CLIENTS.filter((c) => units[c.id]);
}

/* ============================================================
   FEE BOOK — one row per (model, client) pair
   ============================================================ */

export type FeeStatus = "paid" | "invoiced" | "accrued";

export interface FeeRow {
  key: string;
  client: PtaClient;
  model: PtaModel;
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

/** Port of MoboCommissions.jsx's `buildFeeBook()`. */
function buildFeeBook(): FeeRow[] {
  const rows: FeeRow[] = [];
  PTA_MODELS.forEach((m) => {
    const totalUnits = ptaModelUnits(m.id);
    // ponytail: no perf-history mock exists here — a deterministic per-model
    // coin flip stands in for `modelPnl >= 0`, which only picked the return range.
    const modelPnlPositive = cmRand(`${m.id}|modelPnl`) >= 0.5;
    ptaModelClients(m.id).forEach((c) => {
      const key = `${m.id}|${c.id}`;
      const units = PTA_UNITS[m.id][c.id];
      const share = units / totalUnits;
      const aum = m.aum * share;
      const mgmtBps = m.mgmtBps + [-10, 0, 0, 10][Math.floor(cmRand(`${key}|r`) * 4)];
      const mgmtFee = (aum * mgmtBps) / 10000 / 12;
      const ret = modelPnlPositive
        ? 0.004 + cmRand(`${key}|p`) * 0.026
        : -0.018 + cmRand(`${key}|p`) * 0.024;
      const pnl = aum * ret;
      const r = cmRand(`${key}|h`);
      const shortfall =
        pnl <= 0
          ? Math.abs(pnl) * (1 + cmRand(`${key}|s`))
          : r < 0.3
            ? pnl * (0.4 + cmRand(`${key}|s`) * 0.9)
            : 0;
      const gain = Math.max(0, pnl - shortfall);
      const incFee = (gain * m.incPct) / 100;
      const sr = cmRand(`${key}|st`);
      const status: FeeStatus = sr < 0.4 ? "paid" : sr < 0.72 ? "invoiced" : "accrued";
      rows.push({
        key,
        client: c,
        model: m,
        units,
        aum,
        mgmtBps,
        mgmtFee,
        pnl,
        shortfall,
        gain,
        incPct: m.incPct,
        incFee,
        total: mgmtFee + incFee,
        status,
      });
    });
  });
  return rows;
}

/** THE SINGLE DATA PROVIDER for Commission Tracking. */
export function loadCommissions(): { month: string; rows: FeeRow[] } {
  return { month: FEE_MONTH, rows: buildFeeBook() };
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

/** Port of MoboRecon.jsx's `buildSettlementRows()`. */
export function loadSettlement(): SettlementRow[] {
  const rows: SettlementRow[] = [];
  PTA_MODELS.forEach((m) => {
    // Master row: the model's own master IB account holds the full traded amount.
    rows.push({ key: `${m.id}-master`, account: m.acct, type: "Master", model: m.name, amount: fmtFee(m.aum), status: "Settled" });
    const totalUnits = ptaModelUnits(m.id);
    ptaModelClients(m.id).forEach((c) => {
      const delegation = m.aum * (PTA_UNITS[m.id][c.id] / totalUnits);
      // ponytail: same scripted pending cell as the design handoff (mA/cD) — one demo exception.
      const pending = m.id === "mA" && c.id === "cD";
      rows.push({
        key: `${m.id}-${c.id}`,
        account: c.accCode,
        type: "Client",
        model: m.name,
        amount: fmtFee(delegation),
        status: pending ? "Pending" : "Settled",
      });
    });
  });
  return rows;
}
