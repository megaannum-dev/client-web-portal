// DTO→view mappers — PC half only (FE-5). See
// docs/implementations/013-client-onboarding-integration-fe.md §6 FE-5.
// NOTE: the RM (FE-3) and Compliance (FE-4) halves of this file are owned by
// sibling units and are stitched in separately — this worktree's copy
// contains only the PC allotments mapper.
import type { AllotRdmptDTO, AllotmentView } from "./types";

/**
 * AllotRdmptDTO[] → AllotmentView[]. Widened 2026-07-20 (D-9): the per-model
 * aggregate multiplier (aggBefore/aggAfter) and expected-cash-in date are now
 * read straight off the DTO — both are snapshotted server-side at insert
 * time (DB B-3, Backend C-2), never recomputed here. This mapper does zero
 * aggregate computation of its own.
 */
export function mapAllotmentsToView(dtos: AllotRdmptDTO[]): AllotmentView[] {
  return dtos.map((d) => ({
    id: d.id, ref: d.reference, modelName: d.model_name, mult: d.units, amount: d.amount,
    status: d.status, rm: d.rm, date: d.created_at, acknowledgedAt: d.acknowledged_at,
    expectedCashIn: d.expected_cash_in,
    aggBefore: d.agg_before, aggAfter: d.agg_after,
  }));
}
