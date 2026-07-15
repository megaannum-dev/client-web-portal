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

/** Format money: $X.XXM at/above 1e6, $Xk rounded at/above 1e3, else the plain dollar amount
 *  (small per-client allocations are common with real backend data and would otherwise all
 *  round to "$0k"). */
export function ptaMoney(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${Math.round(v / 1e3)}k`;
  return `$${Math.round(v)}`;
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
