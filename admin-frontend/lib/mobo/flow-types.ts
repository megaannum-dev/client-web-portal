/* ============================================================
   MOBO — Trade Reconciliation FLOW VIEW (view layer)

   Three-row flow model, distinct from the two-panel triage model
   in `./types` (Trader vs IB / IB vs CRM — still used by the
   recon-overview + daily-exception-report screens, untouched).

   Row 1 — AlgoTrade: model orders + executions.
   Row 2 — IB Clients: per-client allocation, derived from orders
           via the (mock) client/model subscription matrix.
   Row 3 — CRM: per-client post-trade portfolio impact.

   Ported from the design handoff (mobo/mobo-app/MoboRecon.jsx).
   ============================================================ */

export type RcModelId = "mA" | "mB" | "mC";
export type FlowState = "ok" | "brk";

export interface RcModelMeta {
  name: string;
  color: string;
}

export interface RcExec {
  id: string;
  qty: string;
  px: string;
  t: string;
  st: FlowState;
}

/** One AlgoTrade model order (row 1). */
export interface RcOrder {
  id: string;
  m: RcModelId;
  inst: string;
  cat: string;
  side: string;
  qty: string;
  px: string;
  not: string;
  notVal: number;
  ref: string;
  ib: string;
  st: FlowState;
  execs: RcExec[];
  /** Break narrative, e.g. "IB filled $2.67M vs $3.28M ordered". */
  brk?: string;
}

/** One client's allocation of a single model (nested in RcAlloc). */
export interface RcAllocModelLine {
  m: RcModelId;
  units: number;
  amt: string;
  amtVal: number;
  st: FlowState;
  note?: string;
}

/** One client's full allocation across subscribed models (row 2). */
export interface RcAlloc {
  cid: string;
  client: string;
  st: FlowState;
  total: string;
  totalVal: number;
  models: RcAllocModelLine[];
}

/** One client's post-trade portfolio impact (row 3). */
export interface RcPort {
  cid: string;
  client: string;
  st: FlowState;
  pre: string;
  post: string;
  chg: string;
  pct: string;
  inTrade: number;
  cash: number;
  total: number;
}

export interface RcBreakCounts {
  algIbBrk: number;
  ibCrmBrk: number;
  algCrmBrk: number;
  totalBrk: number;
}

/** The bundle `loadReconciliationFlow()` returns. */
export interface ReconciliationFlowView {
  settleDay: string;
  orders: RcOrder[];
  allocs: RcAlloc[];
  ports: RcPort[];
  algoTotal: string;
  ibTotal: string;
  crmTotal: string;
  counts: RcBreakCounts;
}

export type RcScenarioKey = "all-ok" | "breaks";

/** Wire shape returned by the backend — kept as a distinct alias (FE-1) so it can diverge from the view type later without renaming call sites. */
export type ReconciliationFlowViewDTO = ReconciliationFlowView;

/* ---- shared formatting helpers (no mock data dependency) ---- */
export function fmtUsd(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}k`;
  return `$${n.toLocaleString("en-US")}`;
}

export function pctOf(part: number, whole: number): string {
  return whole ? `${((part / whole) * 100).toFixed(1)}%` : "—";
}
