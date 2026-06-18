// THROWAWAY MOCK — delete on API integration. Imported ONLY by lib/mobo/reconciliation.ts.
/* ============================================================
   MegaCRM — MOBO purgeable mock dataset
   Settlement day: Tue 03 Jun 2026

   Shaped EXACTLY as the C1 DOMAIN types (`Order` with nested
   `Execution[]`) plus the C1 VIEW types (`Exception`, `Feed`,
   `EOD`). The reconciliation seam (`lib/mobo/reconciliation.ts`)
   is the ONLY module that imports this file; components bind to
   `loadReconciliation()`, never here.

   DATA REALITY (001 §6) is honoured at the source:
     - Only the stored-IB book exists. Each trade is modelled as
       an AF (ib_activity / Activity export) Order and, where the
       design implies the record reached Trade Confirms, a TCF
       (ib_trades / Trade-Confirm export) Order. The mapper feeds
       both into the awaiting-source comparison; it never invents
       a trader discrepancy.
     - Identifiers are the REAL ibOrderID (AF) / orderID (TCF).
       No synthetic TRD-/CRM- refs.
     - Numeric columns are DecimalStrings (strings, raw precision);
       dates are raw IB tokens (`YYYYMMDD` / `YYYYMMDD;HHMMSS`).
     - `fxRateToBase` is AF-only. There is NO FX-rate break.
     - The IB↔CRM leg follows the ORIGINAL Claude-Design model:
       live IB (source of truth) vs the stored CRM copy, with a
       sync verdict (synced / stale / drift / missingDb / orphaned).
       That verdict is carried as an explicit per-trade overlay
       (`STORED_INTEGRITY`) so the UI stays DECOUPLED from the
       storage shape (ib_activity / ib_trades) — the DB will be
       reworked and must not leak into the screen.
   ============================================================ */

import type { EOD as EODView, Exception, Feed, IntegrityState, Order } from "@/lib/mobo/types";

/* ---- Settlement day label --------------------------------- */
export const SETTLE_DAY = "Tue 03 Jun 2026";

/* ============================================================
   THE STORED IB BOOK — paired AF (Activity) / TCF (Trade-Confirm)
   orders. Each entry is the input the mapper consumes:
     { af?: Order; tcf?: Order }
   - both present       → record reached Trade Confirms (ic ok)
   - af only            → in Activity only (ic brk · data reframe)
   - tcf only           → in Trade Confirms only (ic brk · reframe)
   ============================================================ */

export interface StoredTrade {
  /** Display book / account (carried alongside the order pair). */
  book: string;
  /** ib_activity (AF / Activity export) order, when present. */
  af?: Order;
  /** ib_trades (TCF / Trade-Confirm export) order, when present. */
  tcf?: Order;
}

export const STORED_TRADES: StoredTrade[] = [
  /* --- 1 · AAPL · in both · 3 executions ------------------- */
  {
    book: "Ardent Capital",
    af: {
      id: "af-0001", levelOfDetail: "ORDER", source: "AF",
      ibOrderID: "401180022", symbol: "AAPL", buySell: "BUY",
      quantity: "12000", currency: "USD", assetCategory: "STK",
      tradeDate: "20260603", tradePrice: "187.4000000000",
      settleDateTarget: "20260605", ibCommission: "60.0000000000",
      tradeMoney: "2248800.0000000000", netCash: "2248860.0000000000",
      fxRateToBase: "1.0000000000",
      executions: [
        { id: "af-0001-x1", levelOfDetail: "EXECUTION", source: "AF",
          ibOrderID: "401180022", ibExecID: "0001f4e8.6650a1b2.01.01",
          symbol: "AAPL", buySell: "BUY", quantity: "5000",
          tradePrice: "187.3600000000", ibCommission: "25.0000000000",
          netCash: "936825.0000000000", currency: "USD",
          assetCategory: "STK", tradeDate: "20260603",
          dateTime: "20260603;093102" },
        { id: "af-0001-x2", levelOfDetail: "EXECUTION", source: "AF",
          ibOrderID: "401180022", ibExecID: "0001f4e8.6650a1b2.01.02",
          symbol: "AAPL", buySell: "BUY", quantity: "4000",
          tradePrice: "187.4100000000", ibCommission: "20.0000000000",
          netCash: "749640.0000000000", currency: "USD",
          assetCategory: "STK", tradeDate: "20260603",
          dateTime: "20260603;093348" },
        { id: "af-0001-x3", levelOfDetail: "EXECUTION", source: "AF",
          ibOrderID: "401180022", ibExecID: "0001f4e8.6650a1b2.01.03",
          symbol: "AAPL", buySell: "BUY", quantity: "3000",
          tradePrice: "187.4400000000", ibCommission: "15.0000000000",
          netCash: "562320.0000000000", currency: "USD",
          assetCategory: "STK", tradeDate: "20260603",
          dateTime: "20260603;093615" },
      ],
    },
    tcf: {
      id: "tcf-0001", levelOfDetail: "ORDER", source: "TCF",
      orderID: "401180022", symbol: "AAPL", buySell: "BUY",
      quantity: "12000", currency: "USD", assetCategory: "STK",
      tradeDate: "20260603", price: "187.4000000000",
      settleDate: "20260605", commission: "60.0000000000",
      amount: "2248800.0000000000", netCash: "2248860.0000000000",
    },
  },

  /* --- 2 · MSFT · in both · 3 executions ------------------- */
  {
    book: "Strathmore Fund",
    af: {
      id: "af-0002", levelOfDetail: "ORDER", source: "AF",
      ibOrderID: "401260047", symbol: "MSFT", buySell: "SELL",
      quantity: "8000", currency: "USD", assetCategory: "STK",
      tradeDate: "20260603", tradePrice: "410.2000000000",
      settleDateTarget: "20260605", ibCommission: "40.0000000000",
      tradeMoney: "3281600.0000000000", netCash: "3281560.0000000000",
      fxRateToBase: "1.0000000000",
      executions: [
        { id: "af-0002-x1", levelOfDetail: "EXECUTION", source: "AF",
          ibOrderID: "401260047", ibExecID: "0001f4e8.6650b3c1.02.01",
          symbol: "MSFT", buySell: "SELL", quantity: "3000",
          tradePrice: "410.2000000000", ibCommission: "15.0000000000",
          netCash: "1230585.0000000000", currency: "USD",
          assetCategory: "STK", tradeDate: "20260603",
          dateTime: "20260603;100211" },
        { id: "af-0002-x2", levelOfDetail: "EXECUTION", source: "AF",
          ibOrderID: "401260047", ibExecID: "0001f4e8.6650b3c1.02.02",
          symbol: "MSFT", buySell: "SELL", quantity: "3500",
          tradePrice: "410.2000000000", ibCommission: "17.5000000000",
          netCash: "1435682.5000000000", currency: "USD",
          assetCategory: "STK", tradeDate: "20260603",
          dateTime: "20260603;100539" },
        { id: "af-0002-x3", levelOfDetail: "EXECUTION", source: "AF",
          ibOrderID: "401260047", ibExecID: "0001f4e8.6650b3c1.02.03",
          symbol: "MSFT", buySell: "SELL", quantity: "1500",
          tradePrice: "410.2000000000", ibCommission: "7.5000000000",
          netCash: "615292.5000000000", currency: "USD",
          assetCategory: "STK", tradeDate: "20260603",
          dateTime: "20260603;100902" },
      ],
    },
    tcf: {
      id: "tcf-0002", levelOfDetail: "ORDER", source: "TCF",
      orderID: "401260047", symbol: "MSFT", buySell: "SELL",
      quantity: "8000", currency: "USD", assetCategory: "STK",
      tradeDate: "20260603", price: "410.2000000000",
      settleDate: "20260605", commission: "40.0000000000",
      amount: "3281600.0000000000", netCash: "3281560.0000000000",
    },
  },

  /* --- 3 · NVDA · in both · 2 executions ------------------- */
  {
    book: "Ardent Capital",
    af: {
      id: "af-0003", levelOfDetail: "ORDER", source: "AF",
      ibOrderID: "401390013", symbol: "NVDA", buySell: "BUY",
      quantity: "1200", currency: "USD", assetCategory: "STK",
      tradeDate: "20260603", tradePrice: "121.8500000000",
      settleDateTarget: "20260605", ibCommission: "6.0000000000",
      tradeMoney: "146220.0000000000", netCash: "146226.0000000000",
      fxRateToBase: "1.0000000000",
      executions: [
        { id: "af-0003-x1", levelOfDetail: "EXECUTION", source: "AF",
          ibOrderID: "401390013", ibExecID: "0001f4e8.6650c2d4.03.01",
          symbol: "NVDA", buySell: "BUY", quantity: "700",
          tradePrice: "121.8500000000", ibCommission: "3.5000000000",
          netCash: "85298.5000000000", currency: "USD",
          assetCategory: "STK", tradeDate: "20260603",
          dateTime: "20260603;111420" },
        { id: "af-0003-x2", levelOfDetail: "EXECUTION", source: "AF",
          ibOrderID: "401390013", ibExecID: "0001f4e8.6650c2d4.03.02",
          symbol: "NVDA", buySell: "BUY", quantity: "500",
          tradePrice: "121.8500000000", ibCommission: "2.5000000000",
          netCash: "60927.5000000000", currency: "USD",
          assetCategory: "STK", tradeDate: "20260603",
          dateTime: "20260603;111658" },
      ],
    },
    tcf: {
      id: "tcf-0003", levelOfDetail: "ORDER", source: "TCF",
      orderID: "401390013", symbol: "NVDA", buySell: "BUY",
      quantity: "1200", currency: "USD", assetCategory: "STK",
      tradeDate: "20260603", price: "121.8500000000",
      settleDate: "20260605", commission: "6.0000000000",
      amount: "146220.0000000000", netCash: "146226.0000000000",
    },
  },

  /* --- 4 · TSLA · in Activity only (no Trade-Confirm) ------ */
  {
    book: "Vela Holdings",
    af: {
      id: "af-0004", levelOfDetail: "ORDER", source: "AF",
      ibOrderID: "401700031", symbol: "TSLA", buySell: "BUY",
      quantity: "3400", currency: "USD", assetCategory: "STK",
      tradeDate: "20260603", tradePrice: "178.9000000000",
      settleDateTarget: "20260605", ibCommission: "17.0000000000",
      tradeMoney: "608260.0000000000", netCash: "608277.0000000000",
      fxRateToBase: "1.0000000000",
      executions: [
        { id: "af-0004-x1", levelOfDetail: "EXECUTION", source: "AF",
          ibOrderID: "401700031", ibExecID: "0001f4e8.6650d1e7.04.01",
          symbol: "TSLA", buySell: "BUY", quantity: "3400",
          tradePrice: "178.9000000000", ibCommission: "17.0000000000",
          netCash: "608277.0000000000", currency: "USD",
          assetCategory: "STK", tradeDate: "20260603",
          dateTime: "20260603;091205" },
      ],
    },
    // tcf intentionally absent → "In Activity only"
  },

  /* --- 5 · META · in Trade Confirms only (no Activity) ----- */
  {
    book: "Northbridge LP",
    tcf: {
      id: "tcf-0005", levelOfDetail: "ORDER", source: "TCF",
      orderID: "401500066", symbol: "META", buySell: "SELL",
      quantity: "900", currency: "USD", assetCategory: "STK",
      tradeDate: "20260603", price: "498.1000000000",
      settleDate: "20260605", commission: "4.5000000000",
      amount: "448290.0000000000", netCash: "448285.5000000000",
      executions: [
        { id: "tcf-0005-x1", levelOfDetail: "EXECUTION", source: "TCF",
          orderID: "401500066", execID: "TC0001f4e8.05.01",
          symbol: "META", buySell: "SELL", quantity: "900",
          price: "498.1000000000", commission: "4.5000000000",
          netCash: "448285.5000000000", currency: "USD",
          assetCategory: "STK", tradeDate: "20260603",
          dateTime: "20260603;134410" },
      ],
    },
    // af intentionally absent → "In Trade Confirms only"
  },

  /* --- 6 · GOOGL · in both · single fill ------------------- */
  {
    book: "Selwyn Asset Mgmt",
    af: {
      id: "af-0006", levelOfDetail: "ORDER", source: "AF",
      ibOrderID: "401610019", symbol: "GOOGL", buySell: "BUY",
      quantity: "2100", currency: "USD", assetCategory: "STK",
      tradeDate: "20260603", tradePrice: "176.3000000000",
      settleDateTarget: "20260605", ibCommission: "10.5000000000",
      tradeMoney: "370230.0000000000", netCash: "370240.5000000000",
      fxRateToBase: "1.0000000000",
      executions: [
        { id: "af-0006-x1", levelOfDetail: "EXECUTION", source: "AF",
          ibOrderID: "401610019", ibExecID: "0001f4e8.6650e3f8.06.01",
          symbol: "GOOGL", buySell: "BUY", quantity: "2100",
          tradePrice: "176.3000000000", ibCommission: "10.5000000000",
          netCash: "370240.5000000000", currency: "USD",
          assetCategory: "STK", tradeDate: "20260603",
          dateTime: "20260603;104733" },
      ],
    },
    tcf: {
      id: "tcf-0006", levelOfDetail: "ORDER", source: "TCF",
      orderID: "401610019", symbol: "GOOGL", buySell: "BUY",
      quantity: "2100", currency: "USD", assetCategory: "STK",
      tradeDate: "20260603", price: "176.3000000000",
      settleDate: "20260605", commission: "10.5000000000",
      amount: "370230.0000000000", netCash: "370240.5000000000",
    },
  },

  /* --- 7 · HSBC LN · in both · GBP --------------------------- */
  {
    book: "Meridian Trust",
    af: {
      id: "af-0007", levelOfDetail: "ORDER", source: "AF",
      ibOrderID: "401700099", symbol: "HSBA", buySell: "BUY",
      quantity: "40000", currency: "GBP", assetCategory: "STK",
      tradeDate: "20260603", tradePrice: "6.8200000000",
      settleDateTarget: "20260605", ibCommission: "136.4000000000",
      tradeMoney: "272800.0000000000", netCash: "272936.4000000000",
      fxRateToBase: "1.2740000000",
      executions: [
        { id: "af-0007-x1", levelOfDetail: "EXECUTION", source: "AF",
          ibOrderID: "401700099", ibExecID: "0001f4e8.6650f4a9.07.01",
          symbol: "HSBA", buySell: "BUY", quantity: "25000",
          tradePrice: "6.8200000000", ibCommission: "85.2500000000",
          netCash: "170585.2500000000", currency: "GBP",
          assetCategory: "STK", tradeDate: "20260603",
          dateTime: "20260603;080620" },
        { id: "af-0007-x2", levelOfDetail: "EXECUTION", source: "AF",
          ibOrderID: "401700099", ibExecID: "0001f4e8.6650f4a9.07.02",
          symbol: "HSBA", buySell: "BUY", quantity: "15000",
          tradePrice: "6.8200000000", ibCommission: "51.1500000000",
          netCash: "102351.1500000000", currency: "GBP",
          assetCategory: "STK", tradeDate: "20260603",
          dateTime: "20260603;081145" },
      ],
    },
    tcf: {
      id: "tcf-0007", levelOfDetail: "ORDER", source: "TCF",
      orderID: "401700099", symbol: "HSBA", buySell: "BUY",
      quantity: "40000", currency: "GBP", assetCategory: "STK",
      tradeDate: "20260603", price: "6.8200000000",
      settleDate: "20260605", commission: "136.4000000000",
      amount: "272800.0000000000", netCash: "272936.4000000000",
    },
  },

  /* --- 8 · JPM · in both · 2 executions -------------------- */
  {
    book: "Pike & Vance",
    af: {
      id: "af-0008", levelOfDetail: "ORDER", source: "AF",
      ibOrderID: "401810052", symbol: "JPM", buySell: "BUY",
      quantity: "5500", currency: "USD", assetCategory: "STK",
      tradeDate: "20260603", tradePrice: "198.0500000000",
      settleDateTarget: "20260605", ibCommission: "27.5000000000",
      tradeMoney: "1089275.0000000000", netCash: "1089302.5000000000",
      fxRateToBase: "1.0000000000",
      executions: [
        { id: "af-0008-x1", levelOfDetail: "EXECUTION", source: "AF",
          ibOrderID: "401810052", ibExecID: "0001f4e8.665105ba.08.01",
          symbol: "JPM", buySell: "BUY", quantity: "2500",
          tradePrice: "198.0500000000", ibCommission: "12.5000000000",
          netCash: "495137.5000000000", currency: "USD",
          assetCategory: "STK", tradeDate: "20260603",
          dateTime: "20260603;134011" },
        { id: "af-0008-x2", levelOfDetail: "EXECUTION", source: "AF",
          ibOrderID: "401810052", ibExecID: "0001f4e8.665105ba.08.02",
          symbol: "JPM", buySell: "BUY", quantity: "3000",
          tradePrice: "198.0500000000", ibCommission: "15.0000000000",
          netCash: "594165.0000000000", currency: "USD",
          assetCategory: "STK", tradeDate: "20260603",
          dateTime: "20260603;134450" },
      ],
    },
    tcf: {
      id: "tcf-0008", levelOfDetail: "ORDER", source: "TCF",
      orderID: "401810052", symbol: "JPM", buySell: "BUY",
      quantity: "5500", currency: "USD", assetCategory: "STK",
      tradeDate: "20260603", price: "198.0500000000",
      settleDate: "20260605", commission: "27.5000000000",
      amount: "1089275.0000000000", netCash: "1089302.5000000000",
    },
  },

  /* --- 9 · AMZN · in both · single fill -------------------- */
  {
    book: "Vela Holdings",
    af: {
      id: "af-0009", levelOfDetail: "ORDER", source: "AF",
      ibOrderID: "401920028", symbol: "AMZN", buySell: "SELL",
      quantity: "1800", currency: "USD", assetCategory: "STK",
      tradeDate: "20260603", tradePrice: "205.6000000000",
      settleDateTarget: "20260605", ibCommission: "9.0000000000",
      tradeMoney: "370080.0000000000", netCash: "370071.0000000000",
      fxRateToBase: "1.0000000000",
      executions: [
        { id: "af-0009-x1", levelOfDetail: "EXECUTION", source: "AF",
          ibOrderID: "401920028", ibExecID: "0001f4e8.665116cb.09.01",
          symbol: "AMZN", buySell: "SELL", quantity: "1800",
          tradePrice: "205.6000000000", ibCommission: "9.0000000000",
          netCash: "370071.0000000000", currency: "USD",
          assetCategory: "STK", tradeDate: "20260603",
          dateTime: "20260603;124915" },
      ],
    },
    tcf: {
      id: "tcf-0009", levelOfDetail: "ORDER", source: "TCF",
      orderID: "401920028", symbol: "AMZN", buySell: "SELL",
      quantity: "1800", currency: "USD", assetCategory: "STK",
      tradeDate: "20260603", price: "205.6000000000",
      settleDate: "20260605", commission: "9.0000000000",
      amount: "370080.0000000000", netCash: "370071.0000000000",
    },
  },

  /* --- 10 · EUR.USD FX · in Activity only (no TCF / cash) -- */
  {
    book: "Selwyn Asset Mgmt",
    af: {
      id: "af-0010", levelOfDetail: "ORDER", source: "AF",
      ibOrderID: "402050017", symbol: "EUR.USD", buySell: "BUY",
      quantity: "2000000", currency: "EUR", assetCategory: "CASH",
      tradeDate: "20260603", tradePrice: "1.0851000000",
      settleDateTarget: "20260605", ibCommission: "20.0000000000",
      tradeMoney: "2170200.0000000000", netCash: "2170220.0000000000",
      fxRateToBase: "1.0851000000",
      executions: [
        { id: "af-0010-x1", levelOfDetail: "EXECUTION", source: "AF",
          ibOrderID: "402050017", ibExecID: "0001f4e8.665127dc.10.01",
          symbol: "EUR.USD", buySell: "BUY", quantity: "2000000",
          tradePrice: "1.0851000000", ibCommission: "20.0000000000",
          netCash: "2170220.0000000000", currency: "EUR",
          assetCategory: "CASH", tradeDate: "20260603",
          dateTime: "20260603;074005" },
      ],
    },
    // tcf intentionally absent (FX cash trades skip Trade Confirms here)
  },

  /* --- 11 · V · in both · single fill ---------------------- */
  {
    book: "Ardent Capital",
    af: {
      id: "af-0011", levelOfDetail: "ORDER", source: "AF",
      ibOrderID: "402170044", symbol: "V", buySell: "BUY",
      quantity: "3000", currency: "USD", assetCategory: "STK",
      tradeDate: "20260603", tradePrice: "289.1500000000",
      settleDateTarget: "20260605", ibCommission: "15.0000000000",
      tradeMoney: "867450.0000000000", netCash: "867465.0000000000",
      fxRateToBase: "1.0000000000",
      executions: [
        { id: "af-0011-x1", levelOfDetail: "EXECUTION", source: "AF",
          ibOrderID: "402170044", ibExecID: "0001f4e8.665138ed.11.01",
          symbol: "V", buySell: "BUY", quantity: "3000",
          tradePrice: "289.1500000000", ibCommission: "15.0000000000",
          netCash: "867465.0000000000", currency: "USD",
          assetCategory: "STK", tradeDate: "20260603",
          dateTime: "20260603;141320" },
      ],
    },
    tcf: {
      id: "tcf-0011", levelOfDetail: "ORDER", source: "TCF",
      orderID: "402170044", symbol: "V", buySell: "BUY",
      quantity: "3000", currency: "USD", assetCategory: "STK",
      tradeDate: "20260603", price: "289.1500000000",
      settleDate: "20260605", commission: "15.0000000000",
      amount: "867450.0000000000", netCash: "867465.0000000000",
    },
  },

  /* --- 12 · BRK.B · in both · single fill ------------------ */
  {
    book: "Harlow Family Office",
    af: {
      id: "af-0012", levelOfDetail: "ORDER", source: "AF",
      ibOrderID: "402280071", symbol: "BRK B", buySell: "BUY",
      quantity: "900", currency: "USD", assetCategory: "STK",
      tradeDate: "20260603", tradePrice: "441.2000000000",
      settleDateTarget: "20260605", ibCommission: "4.5000000000",
      tradeMoney: "397080.0000000000", netCash: "397084.5000000000",
      fxRateToBase: "1.0000000000",
      executions: [
        { id: "af-0012-x1", levelOfDetail: "EXECUTION", source: "AF",
          ibOrderID: "402280071", ibExecID: "0001f4e8.665149fe.12.01",
          symbol: "BRK B", buySell: "BUY", quantity: "900",
          tradePrice: "441.2000000000", ibCommission: "4.5000000000",
          netCash: "397084.5000000000", currency: "USD",
          assetCategory: "STK", tradeDate: "20260603",
          dateTime: "20260603;151230" },
      ],
    },
    tcf: {
      id: "tcf-0012", levelOfDetail: "ORDER", source: "TCF",
      orderID: "402280071", symbol: "BRK B", buySell: "BUY",
      quantity: "900", currency: "USD", assetCategory: "STK",
      tradeDate: "20260603", price: "441.2000000000",
      settleDate: "20260605", commission: "4.5000000000",
      amount: "397080.0000000000", netCash: "397084.5000000000",
    },
  },
];

/* ============================================================
   IB ↔ CRM INTEGRITY OVERLAY (original Claude-Design model)
   Keyed by the order join key (ibOrderID / orderID). Carries the
   live-vs-stored verdict + sync timeline as an EXPLICIT per-trade
   overlay so the recon screen stays decoupled from the storage
   shape (ib_activity / ib_trades). The mapper reads this to build
   the `ic` leg; trades absent from the map default to `synced`.
     drift     → `driftField` names the order-level field; `driftValue`
                 is the stored copy's (drifted) display value.
     missingDb → live IB has it, the store does not (stored side "—").
     orphaned  → the store has it, live IB does not (live side "—").
   ============================================================ */
export interface StoredIntegrity {
  integrity: IntegrityState;
  integrityType?: string;
  /** When the live IB record was last fetched (raw display token). */
  fetchAt?: string | null;
  /** When the stored copy was last synced (raw display token). */
  syncAt?: string | null;
  /** Stored copy is past its freshness window. */
  stale?: boolean;
  /** Human age of a stale copy. */
  staleAge?: string | null;
  /** Order-level field label that drifted (drift only). */
  driftField?: string;
  /** Stored-copy display value for the drifted field (drift only). */
  driftValue?: string;
}

export const STORED_INTEGRITY: Record<string, StoredIntegrity> = {
  "401180022": { integrity: "synced", fetchAt: "14:31:08", syncAt: "14:02 · run #4471" }, // AAPL
  "401260047": { integrity: "synced", fetchAt: "14:31:08", syncAt: "14:06 · run #4471" }, // MSFT
  "401390013": { integrity: "drift", integrityType: "Price drifted in store",
    driftField: "Average price (VWAP)", driftValue: "$121.10",
    fetchAt: "14:31:09", syncAt: "02:14 · run #4470" }, // NVDA
  "401700031": { integrity: "orphaned", integrityType: "Orphaned — no live IB record",
    fetchAt: "14:31:10", syncAt: "02:14 · run #4470" }, // TSLA
  "401500066": { integrity: "missingDb", integrityType: "Missing — never stored from live IB",
    fetchAt: "14:31:10", syncAt: null }, // META
  "401610019": { integrity: "synced", fetchAt: "14:31:10", syncAt: "14:09 · run #4471" }, // GOOGL
  "401700099": { integrity: "drift", integrityType: "Settlement drifted in store",
    driftField: "Settlement date", driftValue: "06 Jun 2026",
    fetchAt: "14:31:11", syncAt: "02:14 · run #4470" }, // HSBA
  "401810052": { integrity: "stale", integrityType: "Stale copy", stale: true,
    staleAge: "4h 43m ago", fetchAt: "14:31:11", syncAt: "09:48 · run #4468" }, // JPM
  "401920028": { integrity: "synced", fetchAt: "14:31:12", syncAt: "14:11 · run #4471" }, // AMZN
  "402050017": { integrity: "synced", fetchAt: "14:31:12", syncAt: "14:12 · run #4471" }, // EUR.USD
  "402170044": { integrity: "synced", fetchAt: "14:31:13", syncAt: "14:13 · run #4471" }, // V
  "402280071": { integrity: "synced", fetchAt: "14:31:13", syncAt: "14:15 · run #4471" }, // BRK.B
};

/* ============================================================
   DAILY EXCEPTION REGISTER (C1 view type `Exception[]`)
   Carried-forward first. Break `type` drawn from the re-based
   vocabulary (no FX-rate break). `ref` / `srcRef` are the real
   IB ibOrderID / orderID. The data-reality "missing" cases are
   the set-membership outcomes (in Activity only / Trade Confirms
   only); `cv` cells render the awaiting-source sentinel "—".
   ============================================================ */
export const EXCEPTIONS: Exception[] = [
  /* --- carried forward --- */
  {
    id: "e1", sev: "hi", carried: true, type: "Missing — one side only",
    ref: "401500066", book: "Northbridge LP", inst: "META US",
    age: "1d 6h", owner: "A. Reyes", status: "Escalated", statusTone: "bad",
    raised: "Jun 02 07:55", srcRef: "401500066",
    fields: [
      { k: "Side", iv: "—", cv: "Sell", d: true },
      { k: "Quantity", iv: "—", cv: "900", d: true },
      { k: "Price", iv: "—", cv: "$498.10", d: true },
      { k: "Settlement date", iv: "—", cv: "05 Jun 2026", d: true },
      { k: "Net amount", iv: "—", cv: "$448,286", d: true },
    ],
    trail: [
      { t: "Raised from reconciliation", d: "Jun 02 07:55 · auto · in Trade Confirms only — no Activity row" },
      { t: "Escalated to desk", d: "Jun 02 14:20 · by A. Reyes — Trade-Confirm fill not in Activity export" },
      { t: "Carried forward to Jun 03", d: "Jun 02 18:00 · unresolved at EOD sign-off", acc: true },
    ],
  },
  {
    id: "e2", sev: "med", carried: true, type: "Commission break",
    ref: "401370088", book: "Selwyn Asset Mgmt", inst: "GS US",
    age: "1d 2h", owner: "K. Mehta", status: "Investigating", statusTone: "warn",
    raised: "Jun 02 11:30", srcRef: "401370088",
    fields: [
      { k: "Side", iv: "Buy", cv: "—", d: false },
      { k: "Quantity", iv: "1,500", cv: "—", d: false },
      { k: "Commission", iv: "$148.00", cv: "—", d: false },
      { k: "Settlement date", iv: "05 Jun 2026", cv: "—", d: false },
      { k: "Net amount", iv: "$520,648", cv: "—", d: false },
    ],
    trail: [
      { t: "Raised from reconciliation", d: "Jun 02 11:30 · auto · commission flagged on review" },
      { t: "Assigned to K. Mehta", d: "Jun 02 12:05 · by K. Mehta" },
      { t: "Carried forward to Jun 03", d: "Jun 02 18:00 · unresolved at EOD sign-off", acc: true },
    ],
  },
  /* --- new today · high --- */
  {
    id: "e3", sev: "hi", carried: false, type: "Missing — one side only",
    ref: "401700031", book: "Vela Holdings", inst: "TSLA US",
    age: "0:48", owner: "Unassigned", status: "New", statusTone: "info",
    raised: "Jun 03 09:12", srcRef: "401700031",
    fields: [
      { k: "Side", iv: "Buy", cv: "—", d: true },
      { k: "Quantity", iv: "3,400", cv: "—", d: true },
      { k: "Price", iv: "$178.90", cv: "—", d: true },
      { k: "Settlement date", iv: "05 Jun 2026", cv: "—", d: true },
      { k: "Net amount", iv: "$608,277", cv: "—", d: true },
    ],
    trail: [
      { t: "Raised from reconciliation", d: "Jun 03 09:12 · auto · in Activity only — no Trade-Confirm row" },
    ],
  },
  {
    id: "e4", sev: "hi", carried: false, type: "Missing — one side only",
    ref: "402050017", book: "Selwyn Asset Mgmt", inst: "EUR/USD",
    age: "0:35", owner: "Unassigned", status: "New", statusTone: "info",
    raised: "Jun 03 09:25", srcRef: "402050017",
    fields: [
      { k: "Side", iv: "Buy", cv: "—", d: true },
      { k: "Quantity", iv: "2,000,000", cv: "—", d: true },
      { k: "Price", iv: "€1.0851", cv: "—", d: true },
      { k: "Settlement date", iv: "05 Jun 2026", cv: "—", d: true },
      { k: "Net amount", iv: "€2,170,220", cv: "—", d: true },
    ],
    trail: [
      { t: "Raised from reconciliation", d: "Jun 03 09:25 · auto · in Activity only — no Trade-Confirm row" },
    ],
  },
  /* --- new today · medium --- */
  {
    id: "e5", sev: "med", carried: false, type: "Settlement mismatch",
    ref: "401700099", book: "Meridian Trust", inst: "HSBC LN",
    age: "1:54", owner: "Unassigned", status: "New", statusTone: "info",
    raised: "Jun 03 08:06", srcRef: "401700099",
    fields: [
      { k: "Side", iv: "Buy", cv: "—", d: false },
      { k: "Quantity", iv: "40,000", cv: "—", d: false },
      { k: "Price", iv: "£6.82", cv: "—", d: false },
      { k: "Settlement date", iv: "05 Jun 2026", cv: "—", d: false },
      { k: "Net amount", iv: "£272,936", cv: "—", d: false },
    ],
    trail: [
      { t: "Raised from reconciliation", d: "Jun 03 08:06 · auto · settlement flagged for review" },
    ],
  },
  /* --- new today · low --- */
  {
    id: "e6", sev: "lo", carried: false, type: "Commission break",
    ref: "401390013", book: "Ardent Capital", inst: "NVDA US",
    age: "3:05", owner: "K. Mehta", status: "Investigating", statusTone: "warn",
    raised: "Jun 03 06:55", srcRef: "401390013",
    fields: [
      { k: "Side", iv: "Buy", cv: "—", d: false },
      { k: "Quantity", iv: "1,200", cv: "—", d: false },
      { k: "Commission", iv: "$6.00", cv: "—", d: false },
      { k: "Settlement date", iv: "05 Jun 2026", cv: "—", d: false },
      { k: "Net amount", iv: "$146,226", cv: "—", d: false },
    ],
    trail: [
      { t: "Raised from reconciliation", d: "Jun 03 06:55 · auto · commission flagged on review" },
      { t: "Assigned to K. Mehta", d: "Jun 03 07:20 · by K. Mehta" },
    ],
  },
];

/* ============================================================
   CUSTODIAN / BROKER FEEDS (C1 view type `Feed[]`)
   `state` uses the MatchState vocabulary (ok | brk | miss).
   ============================================================ */
export const FEEDS: Feed[] = [
  { name: "IB Activity export (ib_activity)", state: "ok", note: "Received 06:02" },
  { name: "IB Trade Confirms (ib_trades)", state: "ok", note: "Received 06:05" },
  { name: "Trader blotter feed", state: "miss", note: "Awaiting source" },
  { name: "Live IB fetch", state: "miss", note: "Awaiting source" },
];

/* ============================================================
   END-OF-DAY ROLLUP (C1 view type `EOD`)
   Enriched: executions, notional, books, matched-clean. The
   `byType` table is left empty here — `loadReconciliation`
   derives it from the mapped trades via `deriveEodByType` so
   the report never disagrees with the recon screen.
   ============================================================ */
export const EOD: EODView = {
  generated: "17:42 GMT",
  tradesReconciled: 12,
  executions: 17,
  notional: "$11.3M",
  books: 7,
  matchedClean: 9,
  breaksRaised: 3,
  resolved: 0,
  carried: 3,
  dayOf: 3,
  daysInMonth: 30,
  byType: [],
};
