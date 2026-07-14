/* ============================================================
   MOBO — Post-Trade Allocation data-access SEAM

   This is the SINGLE place data reaches the Post-Trade Allocation
   screens. Every screen binds to the types in `./types` and the
   mappers below — and NEVER imports `lib/mock` directly.

   Structural pass-through only: traded/unitsTotal/allocated/pct/
   grandTotal all arrive precomputed from the backend (proposal
   §4.1); these mappers do NO pro-rata math.
   ============================================================ */

import type {
  PostTradeAllocationView,
  PtaModelAllocation,
  PtaRun,
  PtaRunsDTO,
  PtaViewDTO,
} from "./types";

/** Format money the way the design prototype does: $X.XXM above 1e6, else $Xk rounded. */
export function ptaMoney(v: number): string {
  return v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1e3)}k`;
}

/**
 * THE SINGLE DATA MAPPER for Post-Trade Allocation. Structural pass-through
 * only — traded/unitsTotal/allocated/pct/grandTotal all arrive precomputed
 * from the backend (proposal §4.1); this function does NO pro-rata math.
 */
export function mapDtoToPostTradeAllocation(dto: PtaViewDTO): PostTradeAllocationView {
  const models: PtaModelAllocation[] = dto.models.map((m) => ({
    id: m.id,
    name: m.name,
    acct: m.acct,
    traded: m.traded,
    unitsTotal: m.unitsTotal,
    clientShares: m.clientShares,
  }));
  return { settleDay: dto.settleDay, models, grandTotal: dto.grandTotal };
}

/** Maps the /runs DTO to the DateControl's dropdown shape. */
export function mapDtoToRuns(dto: PtaRunsDTO): PtaRun[] {
  return dto.runs.map((r) => ({ date: r.date, label: r.label, grandTotal: r.grandTotal }));
}
