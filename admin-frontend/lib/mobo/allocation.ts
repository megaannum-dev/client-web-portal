/* ============================================================
   MOBO — Post-Trade Allocation data-access SEAM

   This is the SINGLE place data reaches the Post-Trade Allocation
   screens. Every screen binds to `loadPostTradeAllocation()` and
   the types in `./types` — and NEVER imports `lib/mock` directly.

   DATA REALITY: this is genuinely mock-only today. There is no
   backend for post-trade allocation — no stored settlement
   notionals, no subscription-units API, nothing to fetch. This
   loader reads the purgeable mock in `lib/mock/mobo-data.ts` (the
   ONLY import site of it) and computes the pro-rata client split
   itself. When a backend lands, only the body of
   `loadPostTradeAllocation` changes (fetch real settlement +
   subscription data → the same pro-rata computation below).

   PURGE TEST (acceptance): deleting `lib/mock` and pointing this
   loader at a real API must require ZERO edits in any component —
   only the body of `loadPostTradeAllocation`.
   ============================================================ */

import type {
  PostTradeAllocationView,
  PtaClientShare,
  PtaModelAllocation,
} from "./types";

/* ---- The ONE-AND-ONLY mock import site ---------------------- */
import {
  PTA_CLIENTS as MOCK_PTA_CLIENTS,
  PTA_MODELS as MOCK_PTA_MODELS,
  PTA_TREND as MOCK_PTA_TREND,
  PTA_UNITS as MOCK_PTA_UNITS,
  SETTLE_DAY as MOCK_SETTLE_DAY,
} from "../mock/mobo-data";

/** Format money the way the design prototype does: $X.XXM above 1e6, else $Xk rounded. */
export function ptaMoney(v: number): string {
  return v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1e3)}k`;
}

/**
 * Pro-rata client split for one model: each subscribing client's delegated
 * amount is `traded * clientUnits / modelUnitsTotal` (the design prototype's
 * `ptaDelegation` formula).
 */
function buildClientShares(
  modelId: string,
  traded: number
): { unitsTotal: number; clientShares: PtaClientShare[] } {
  const units = MOCK_PTA_UNITS[modelId] ?? {};
  const unitsTotal = Object.values(units).reduce((a, b) => a + b, 0);
  const clientShares: PtaClientShare[] = MOCK_PTA_CLIENTS.filter((c) => units[c.id]).map((c) => {
    const u = units[c.id];
    const delegated = unitsTotal > 0 ? (traded * u) / unitsTotal : 0;
    const pct = unitsTotal > 0 ? Math.round((u / unitsTotal) * 100) : 0;
    return { clientId: c.id, name: c.name, units: u, delegated, pct };
  });
  return { unitsTotal, clientShares };
}

/**
 * THE SINGLE DATA PROVIDER for Post-Trade Allocation. Every screen
 * (All models / Per model) calls this.
 */
export function loadPostTradeAllocation(): PostTradeAllocationView {
  const models: PtaModelAllocation[] = MOCK_PTA_MODELS.map((m) => {
    const { unitsTotal, clientShares } = buildClientShares(m.id, m.traded);
    return { ...m, unitsTotal, clientShares };
  });

  const grandTotal = MOCK_PTA_MODELS.reduce((n, m) => n + m.traded, 0);

  return {
    settleDay: MOCK_SETTLE_DAY,
    models,
    grandTotal,
    trend: MOCK_PTA_TREND,
  };
}
