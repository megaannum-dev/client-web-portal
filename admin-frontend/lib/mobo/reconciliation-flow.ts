/* ============================================================
   MOBO — Trade Reconciliation FLOW VIEW data-access SEAM

   The single place the flow-view screen reaches data. Components
   bind ONLY to `loadReconciliationFlow()` and the types in
   `./flow-types` — never to `lib/mock` directly.

   PURGE TEST: deleting `lib/mock/mobo-flow-data.ts` and pointing
   this loader at a real API requires zero edits to components —
   only the body of `loadReconciliationFlow`.
   ============================================================ */

import { SCENARIOS, SETTLE_DAY } from "@/lib/mock/mobo-flow-data";
import { fmtUsd, type ReconciliationFlowView, type RcScenarioKey } from "@/lib/mobo/flow-types";

export function loadReconciliationFlow(scenario: RcScenarioKey = "breaks"): ReconciliationFlowView {
  const sc = SCENARIOS[scenario] ?? SCENARIOS.breaks;

  const algIbBrk = sc.orders.filter((o) => o.st !== "ok").length;
  const ibCrmBrk = sc.allocs.filter((a) => a.st !== "ok").length;
  const algCrmBrk = sc.ports.filter((p) => p.st !== "ok").length;

  return {
    settleDay: SETTLE_DAY,
    orders: sc.orders,
    allocs: sc.allocs,
    ports: sc.ports,
    algoTotal: fmtUsd(sc.algoTotal),
    ibTotal: fmtUsd(sc.ibTotal),
    crmTotal: fmtUsd(sc.crmTotal),
    counts: {
      algIbBrk,
      ibCrmBrk,
      algCrmBrk,
      totalBrk: algIbBrk + ibCrmBrk + algCrmBrk,
    },
  };
}

export { fmtUsd, pctOf } from "@/lib/mobo/flow-types";
