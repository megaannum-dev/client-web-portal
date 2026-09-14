"use client";

/* ============================================================
   MOBO — Reconciliation data-access SEAM

   This is the SINGLE place data reaches the MOBO UI. Every screen
   binds to `useReconciliation()` and the types in `./types`.

   Sources from GET /api/mobo/trade-records via the existing
   `useTradeRecords` hook (already live behind the sibling
   trade-reconciliation page) and maps each row through
   `mapTradeRecordToReconTrade`. The former mock-backed
   `loadReconciliation()` is retired — `lib/mock/mobo-data.ts` is
   deleted.

   DATA REALITY: only CRM is wired today (no trader feed, no live
   IB fetch), so both legs are always "ok" with `fields: []` —
   see `mapTradeRecordToReconTrade` below.
   ============================================================ */

import type {
  EOD,
  EODByType,
  ReconCounters,
  ReconTrade,
  ReconLeg,
  ReconView,
  TradeRecordRowDTO,
} from "./types";
import { useTradeRecords } from "@/hooks/api/useTradeRecords";

/* ---- "awaiting source" sentinel ----------------------------
   In today's data reality the trader and fetched-IB columns have
   no feed. Their comparison cells render empty rather than as
   breaks. This is the single token the mapper emits for them. */
export const AWAITING_SOURCE = "—";

/**
 * Maps a single-source trade-records row (`GET /api/mobo/trade-records`) into
 * a `ReconTrade` view model. DATA REALITY: with only CRM wired, nothing can
 * disagree — both legs are always `"ok"`, no `breakType`, `fields: []`. This
 * is not a placeholder; it is the correct verdict for today's actual data
 * (see trade-reconciliation page's own "every break counter is 0" reality).
 */
export function mapTradeRecordToReconTrade(row: TradeRecordRowDTO): ReconTrade {
  const okLeg: ReconLeg = { state: "ok", ls: null, rs: null, fields: [] };
  return {
    id: row.tradeId,
    inst: row.stock,
    book: AWAITING_SOURCE, // no book/account field on this DTO yet
    ib: row.ref,
    trader: null, // awaiting source — no trader feed
    crm: row.ref, // the row itself is the CRM record (sys is always "CRM" today)
    ti: okLeg,
    ic: okLeg,
  };
}

/**
 * Re-base the top-of-page counters to SINGLE-SOURCE counts (no two-way
 * internal-vs-custodian gap). Derived from the mapped trades so the screens
 * never disagree with the recon table.
 */
export function deriveCounters(trades: ReconTrade[]): ReconCounters {
  const reconciled = trades.length;
  let matched = 0;
  let breaks = 0;
  let unmatched = 0;
  for (const t of trades) {
    const legs = [t.ti, t.ic];
    if (legs.some((l) => l.state === "miss")) unmatched += 1;
    else if (legs.some((l) => l.state === "brk")) breaks += 1;
    else matched += 1;
  }
  // Vacuously 100% when there's nothing to reconcile — an empty book isn't
  // 0% matched, it has no unmatched trades left.
  const pct = reconciled > 0 ? (matched / reconciled) * 100 : 100;
  return {
    reconciled,
    matched,
    breaks,
    unmatched,
    autoMatchedPct: `${pct.toFixed(1)}%`,
  };
}

/** Roll mapped trades up into the EOD by-type break table (single-source). */
export function deriveEodByType(trades: ReconTrade[]): EODByType[] {
  const counts = new Map<string, number>();
  for (const t of trades) {
    for (const leg of [t.ti, t.ic]) {
      if (leg.state !== "ok" && leg.breakType) {
        counts.set(leg.breakType, (counts.get(leg.breakType) ?? 0) + 1);
      }
    }
  }
  return Array.from(counts.entries()).map(([type, raised]) => ({
    type,
    raised,
    resolved: 0,
    carried: raised,
  }));
}

/* ============================================================
   PROVIDER — the seam itself
   ============================================================ */

/** Honest empty EOD bundle — no EOD-aggregation source is wired yet. */
const EMPTY_EOD: EOD = {
  generated: AWAITING_SOURCE,
  tradesReconciled: 0,
  executions: 0,
  notional: "$0",
  books: 0,
  matchedClean: 0,
  breaksRaised: 0,
  resolved: 0,
  carried: 0,
  dayOf: 0,
  daysInMonth: 0,
  byType: [],
};

/**
 * THE SINGLE DATA PROVIDER. Every MOBO screen calls this.
 *
 * Sources from `GET /api/mobo/trade-records` via the existing
 * `useTradeRecords` hook and maps each row through
 * `mapTradeRecordToReconTrade`. `exceptions`/`feeds` are honestly empty —
 * no source is wired for either yet.
 */
export function useReconciliation(): {
  data: ReconView | null;
  loading: boolean;
  error: string | null;
} {
  const { data: records, loading, error } = useTradeRecords();

  const data: ReconView | null = records
    ? (() => {
        const trades = records.rows.map(mapTradeRecordToReconTrade);
        return {
          settleDay: records.day,
          trades,
          counters: deriveCounters(trades), // unchanged — consumes ReconTrade[] only
          exceptions: [],
          feeds: [],
          eod: { ...EMPTY_EOD, byType: deriveEodByType(trades) }, // unchanged derivation
        };
      })()
    : null;

  return { data, loading, error };
}
