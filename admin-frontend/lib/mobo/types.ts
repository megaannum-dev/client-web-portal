/* ============================================================
   MOBO — Post-trade allocation type layer

   The reconciliation half of this file is gone: it described the
   retired GET /api/mobo/trade-records shape and the ReconTrade view
   model derived from it. The live reconciliation contract lives in
   `lib/mobo/executions.ts`, which mirrors the backend schema
   field-for-field.
   ============================================================ */

/* ============================================================
   POST-TRADE ALLOCATION (view layer)

   How much was traded per allocation model on a settlement day,
   and how that money is delegated (pro-rata by subscribed units)
   to each subscribing client. DATA REALITY: this is mock-only
   today — no backend, no stored subscription-units source — see
   `lib/mobo/allocation.ts`'s header comment.
   ============================================================ */

/** An allocation model traded on the settlement day. */
export interface PtaModel {
  id: string;
  name: string;
  acct: string;
  traded: number;
}

/** A client that may subscribe (by units) to one or more models. */
export interface PtaClient {
  id: string;
  name: string;
}

/**
 * One client's pro-rata slice of a model's traded amount.
 *   units     — subscribed units backing the allocation
 *   allocated — raw allocated amount (was `delegated`; renamed D-7 to match
 *               page semantics — "post-trade allocation")
 *   pct       — rounded 0-100 share of the model's units
 */
export interface PtaClientShare {
  clientId: string;
  name: string;
  units: number;
  allocated: number; // was: delegated
  pct: number;
}

/** Wire shape of GET /api/mobo/post-trade-allocation (proposal §4.1). */
export interface PtaClientShareDTO {
  clientId: string;
  name: string;
  units: number;
  allocated: number;
  pct: number;
}
export interface PtaModelDTO {
  id: string;
  name: string;
  acct: string;
  traded: number;
  unitsTotal: number;
  clientShares: PtaClientShareDTO[];
}
export interface PtaViewDTO {
  tradeDate: string;
  settleDay: string;
  grandTotal: number;
  models: PtaModelDTO[];
}
export interface PtaRunDTO { date: string; label: string; grandTotal: number }
export interface PtaRunsDTO { runs: PtaRunDTO[] }
export interface PtaRunResultDTO { newRuns: PtaRunDTO[]; latest: PtaViewDTO; checkedAt: string }
export interface PtaHistoryEntryDTO { date: string; pnl: number }
export interface PtaHistoryDTO { series: PtaHistoryEntryDTO[] }

export interface PtaRun { date: string; label: string; grandTotal: number }
export interface PtaHistoryEntry { date: string; pnl: number }

/**
 * A model plus its precomputed client breakdown. `unitsTotal` and
 * `clientShares` are derived once by the loader so consumers never
 * re-derive the pro-rata split.
 */
export interface PtaModelAllocation extends PtaModel {
  unitsTotal: number;
  clientShares: PtaClientShare[];
}

/**
 * The bundle `loadPostTradeAllocation()` returns — what both the
 * "All models" and "Per model" screens bind to. Every model already
 * carries its own `clientShares`, so a page component needs zero
 * business-logic recomputation.
 */
export interface PostTradeAllocationView {
  /** Settlement day label (reuses the same `SETTLE_DAY` as reconciliation). */
  settleDay: string;
  models: PtaModelAllocation[];
  /** Sum of every model's `traded` (all-models chart total). */
  grandTotal: number;
}
