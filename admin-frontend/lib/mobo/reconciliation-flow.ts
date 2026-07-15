/* ============================================================
   MOBO — Trade Reconciliation FLOW VIEW data-access SEAM

   The single place the flow-view screen reaches data. Components
   bind ONLY to the mapper + hook and the types in `./flow-types` —
   never to `lib/mock` directly.
   ============================================================ */

import type { ReconciliationFlowView, ReconciliationFlowViewDTO } from "@/lib/mobo/flow-types";

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
