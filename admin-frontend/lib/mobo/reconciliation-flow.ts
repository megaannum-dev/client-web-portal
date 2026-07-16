/* ============================================================
   MOBO — Trade Reconciliation FLOW VIEW data-access SEAM

   The single place the flow-view screen reaches data. Components
   bind ONLY to the mapper + hook and the types in `./flow-types` —
   never to `lib/mock` directly.
   ============================================================ */

import { SCENARIOS, SETTLE_DAY } from "@/lib/mock/mobo-flow-data";
import type {
  ReconciliationFlowView,
  ReconciliationFlowViewDTO,
  RcScenarioKey,
} from "@/lib/mobo/flow-types";
import { fmtUsd } from "@/lib/mobo/flow-types";

// ponytail: mock-backed loader kept only until FE-5 cuts page.tsx over to the
// real hook; deleted in FE-6 alongside lib/mock/mobo-flow-data.ts + RcScenarioKey.
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

/**
 * THE SINGLE DATA MAPPER for the reconciliation flow view. Near-identity
 * today because the backend already serves ReconciliationFlowView verbatim
 * (proposal D-1) — kept as an explicit function, not a raw pass-through,
 * so a future wire/view divergence has exactly one place to change.
 */
export function mapDtoToReconciliationFlow(dto: ReconciliationFlowViewDTO): ReconciliationFlowView {
  return dto;
}

export { fmtUsd, pctOf } from "@/lib/mobo/flow-types";
