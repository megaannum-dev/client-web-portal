import type { RcAlloc, RcOrder, RcPort } from "@/lib/mobo/flow-types";

export type EodStatus = "OPEN" | "SIGNED";
export type EodOutcome = "CLEAR" | "EXCEPTIONS";

export interface EodReportView {
  settleDay: string;
  tradeDate: string; // "YYYY-MM-DD"
  orders: RcOrder[];
  allocs: RcAlloc[];
  ports: RcPort[];
  algoTotal: string;
  ibTotal: string;
  crmTotal: string;
  counts: { algIbBrk: number; ibCrmBrk: number; algCrmBrk: number; totalBrk: number };
  status: EodStatus;
  signedOffBy: string | null;
  signedOffAt: string | null;
  generated: string | null;
  orderCount: number;
  executionCount: number;
  notionalTraded: string;
  breakTotal: number;
  outcome: EodOutcome;
  canSignOff: boolean;
  exportReady: boolean;
}

/** Wire shape returned by the backend — kept as a distinct alias (matches the
 * ReconciliationFlowViewDTO convention in flow-types.ts) so it can diverge from
 * the view type later without renaming call sites. */
export type EodReportViewDTO = EodReportView;
