/* ============================================================
   MOBO — Reconciliation data-access SEAM

   This is the SINGLE place data reaches the MOBO UI. Every screen
   and shared primitive binds to `loadReconciliation()` and the
   types in `./types` — and NEVER imports `lib/mock` directly.

   TODAY: `loadReconciliation()` returns a typed EMPTY bundle.
   C2 wires the purgeable mock here as the ONLY import site of
   `lib/mock`. When the backend API arrives, only the body of
   `loadReconciliation` changes (fetch → deserialize into `Order`
   / `Execution` → `mapOrdersToReconTrade`).

   PURGE TEST (acceptance): deleting `lib/mock` and pointing the
   provider at a real API must require ZERO edits here or in any
   component — only the body of `loadReconciliation`.

   DATA REALITY (001 §6) is encoded by the mapper below:
     - the stored-IB column is populated; trader & fetched-IB
       columns render empty ("awaiting source"), NOT as breaks
     - identifiers are the real ibOrderID / orderID
     - verdict is order-to-order over order + execution fields;
       an execution break propagates up to the order
     - added fields: Settlement date, Currency, Asset class,
       Trade date (order-level); Trade ID (execution-level)
     - NO FX-rate break; integrity is set-membership, not live-sync
     - counters are re-based to single-source counts
   ============================================================ */

import type {
  BreakType,
  CompareField,
  EODByType,
  Execution,
  ExecRow,
  ExecSide,
  IntegrityState,
  MatchState,
  Order,
  ReconCounters,
  ReconLeg,
  ReconTrade,
  ReconView,
} from "./types";

/* ---- The ONE-AND-ONLY mock import site ----------------------
   Every screen binds to `loadReconciliation()` below; the mock
   is reached ONLY here. Swapping to the real API replaces the
   body of `loadReconciliation` (fetch → deserialize into Order /
   Execution) and deletes this import — no component changes. */
import {
  EOD as MOCK_EOD,
  EXCEPTIONS as MOCK_EXCEPTIONS,
  FEEDS as MOCK_FEEDS,
  SETTLE_DAY as MOCK_SETTLE_DAY,
  STORED_TRADES as MOCK_STORED_TRADES,
} from "../mock/mobo-data";

/* ---- "awaiting source" sentinel ----------------------------
   In today's data reality the trader and fetched-IB columns have
   no feed. Their comparison cells render empty rather than as
   breaks. This is the single token the mapper emits for them. */
export const AWAITING_SOURCE = "—";

/* ============================================================
   FORMATTERS — DecimalString / IBDateString → display strings
   ============================================================ */

/** Parse a backend DecimalString (or any value) to a number, else null. */
function toNum(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Currency symbol for the common cases; falls back to a trailing code. */
function curPrefix(currency: string | null | undefined): { pre: string; post: string } {
  switch ((currency || "").toUpperCase()) {
    case "USD": return { pre: "$", post: "" };
    case "EUR": return { pre: "€", post: "" };
    case "GBP": return { pre: "£", post: "" };
    case "":    return { pre: "$", post: "" };
    default:    return { pre: "", post: ` ${currency}` };
  }
}

/** Format a price for display (2+ dp), with the order's currency. */
export function fmtPrice(v: string | null | undefined, currency?: string | null): string {
  const n = toNum(v);
  if (n == null) return AWAITING_SOURCE;
  const { pre, post } = curPrefix(currency);
  let s = n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  const dot = s.indexOf(".");
  if (dot === -1) s += ".00";
  else if (s.length - dot - 1 < 2) s += "0".repeat(2 - (s.length - dot - 1));
  return `${pre}${s}${post}`;
}

/** Format a whole quantity for display. */
export function fmtQty(v: string | null | undefined): string {
  const n = toNum(v);
  if (n == null) return AWAITING_SOURCE;
  return n.toLocaleString("en-US");
}

/** Format a money amount (net cash / trade amount) for display. */
export function fmtAmt(v: string | null | undefined, currency?: string | null): string {
  const n = toNum(v);
  if (n == null) return AWAITING_SOURCE;
  const { pre, post } = curPrefix(currency);
  return `${pre}${Math.round(n).toLocaleString("en-US")}${post}`;
}

/** Format a raw IB `YYYYMMDD` token as `DD Mon YYYY`. */
export function fmtDate(v: string | null | undefined): string {
  if (!v) return AWAITING_SOURCE;
  const m = String(v).match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return String(v);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mi = Number(m[2]) - 1;
  return `${m[3]} ${months[mi] ?? m[2]} ${m[1]}`;
}

/** Format a raw IB `YYYYMMDD;HHMMSS` token as `HH:MM:SS`. */
export function fmtTime(v: string | null | undefined): string {
  if (!v) return AWAITING_SOURCE;
  const m = String(v).match(/;(\d{2})(\d{2})(\d{2})/);
  if (!m) return String(v);
  return `${m[1]}:${m[2]}:${m[3]}`;
}

/* ============================================================
   COALESCING — AF (Activity) ↔ TCF (Trade-Confirm) column names
   A single accessor per logical field, preferring AF then TCF.
   ============================================================ */

const coalesce = {
  joinKey: (o: Pick<Order, "ibOrderID" | "orderID">): string | null =>
    o.ibOrderID ?? o.orderID ?? null,
  price: (o: Pick<Order, "tradePrice" | "price">): string | null =>
    o.tradePrice ?? o.price ?? null,
  settleDate: (o: Pick<Order, "settleDateTarget" | "settleDate">): string | null =>
    o.settleDateTarget ?? o.settleDate ?? null,
  commission: (o: Pick<Order, "ibCommission" | "commission">): string | null =>
    o.ibCommission ?? o.commission ?? null,
  netAmount: (o: Pick<Order, "netCash" | "tradeMoney" | "amount">): string | null =>
    o.netCash ?? o.tradeMoney ?? o.amount ?? null,
};

const coalesceExec = {
  price: (e: Pick<Execution, "tradePrice" | "price">): string | null =>
    e.tradePrice ?? e.price ?? null,
  execId: (e: Pick<Execution, "tradeID" | "ibExecID" | "execID">): string | null =>
    e.tradeID ?? e.ibExecID ?? e.execID ?? null,
};

/* ============================================================
   MAPPER — domain Order/Execution → view ReconTrade
   ============================================================ */

/** Build the per-execution stored-IB side (the only populated source). */
function execSide(e: Execution): ExecSide {
  return {
    time: fmtTime(e.dateTime),
    qty: fmtQty(e.quantity),
    px: fmtPrice(coalesceExec.price(e), e.currency),
    tradeID: coalesceExec.execId(e) ?? undefined, // added field: Trade ID
  };
}

/**
 * Map an order's executions to per-execution comparison rows. The stored-IB
 * side (`ib`) is populated; the trader side is left `null` = "awaiting
 * source" (no trader feed in today's data reality).
 */
function buildExecRows(order: Order): ExecRow[] | null {
  const execs = order.executions ?? [];
  if (execs.length === 0) return null;
  return execs.map((e, i) => ({
    id: coalesceExec.execId(e) ?? `${coalesce.joinKey(order) ?? order.id}-x${i + 1}`,
    state: "ok" as MatchState, // single-source: nothing to disagree with yet
    trader: null,              // awaiting source
    ib: execSide(e),           // stored IB
  }));
}

/**
 * Order-level comparison fields. The IB/stored value (`iv`) is populated;
 * the comparison value (`cv`) is "awaiting source". `d` (differs) stays
 * false because an empty counterpart is NOT a break (data reality).
 * Includes the added order-level fields: Settlement date, Currency,
 * Asset class, Trade date.
 */
function buildOrderFields(order: Order): CompareField[] {
  const f = (k: string, iv: string): CompareField => ({ k, iv, cv: AWAITING_SOURCE, d: false });
  return [
    f("Side", order.buySell ?? AWAITING_SOURCE),
    f("Quantity", fmtQty(order.quantity)),
    f("Price", fmtPrice(coalesce.price(order), order.currency)),
    f("Net amount", fmtAmt(coalesce.netAmount(order), order.currency)),
    f("Settlement date", fmtDate(coalesce.settleDate(order))),
    f("Currency", order.currency ?? AWAITING_SOURCE),
    f("Asset class", order.assetCategory ?? AWAITING_SOURCE),
    f("Trade date", fmtDate(order.tradeDate)),
    f("Commission", fmtAmt(coalesce.commission(order), order.currency)),
  ];
}

/** Compact stored-IB summary sub-line for a leg's right/IB side. */
function buildSummary(order: Order): string {
  const side = order.buySell ?? "";
  const qty = fmtQty(order.quantity);
  const px = fmtPrice(coalesce.price(order), order.currency);
  const bits = [side, qty !== AWAITING_SOURCE ? qty : null].filter(Boolean).join(" · ");
  return px !== AWAITING_SOURCE ? `${bits} @ ${px}` : bits;
}

/**
 * Roll the execution verdict up into the order verdict. An execution break or
 * missing fill propagates to the order. With single-source data this is `ok`,
 * but the propagation rule is wired so it holds once a counterpart feed lands.
 */
function rollUpState(orderState: MatchState, execs: ExecRow[] | null): MatchState {
  if (!execs || execs.length === 0) return orderState;
  if (execs.some((e) => e.state === "miss")) return orderState === "ok" ? "brk" : orderState;
  if (execs.some((e) => e.state === "brk")) return orderState === "ok" ? "brk" : orderState;
  return orderState;
}

/**
 * Derive the IB↔CRM set-membership state. Reframes the old live-sync
 * (synced/stale/drift) model: a record is in `both` sets when an AF (Activity)
 * order has a TCF (Trade-Confirm) counterpart, else in one set only.
 */
function deriveIntegrity(af: Order | null, tcf: Order | null): {
  state: IntegrityState;
  label: string;
} {
  if (af && tcf) return { state: "both", label: "In Activity & Trade Confirms" };
  if (af && !tcf) return { state: "activityOnly", label: "In Activity only" };
  return { state: "tradeConfirmOnly", label: "In Trade Confirms only" };
}

/**
 * Derive the match state of a leg from its compared fields + executions.
 * A field difference or a present-on-one-side-only condition is a break.
 */
function deriveState(fields: CompareField[], present: boolean, counterpartPresent: boolean): MatchState {
  if (!present || !counterpartPresent) return "miss";
  return fields.some((f) => f.d) ? "brk" : "ok";
}

/** Pick the break type implied by which order fields differ (no FX break). */
function pickBreakType(fields: CompareField[]): BreakType | undefined {
  const diff = (k: string) => fields.some((f) => f.k === k && f.d);
  if (diff("Quantity")) return "Quantity break";
  if (diff("Price")) return "Price break";
  if (diff("Settlement date")) return "Settlement mismatch";
  if (diff("Commission")) return "Commission break";
  if (diff("Net amount")) return "Net-amount break";
  return undefined;
}

/**
 * The core domain→view mapper. Takes the stored order pair for a single trade
 * (AF Activity row and/or its TCF Trade-Confirm counterpart) and produces the
 * `ReconTrade` view model the screens render.
 *
 * In today's data reality only the stored-IB order exists; trader and fetched
 * columns are emitted empty ("awaiting source"). Identifiers are the real
 * ibOrderID / orderID.
 */
export function mapOrdersToReconTrade(input: {
  af?: Order | null;
  tcf?: Order | null;
}): ReconTrade {
  const af = input.af ?? null;
  const tcf = input.tcf ?? null;
  // The stored-IB order is whichever export we hold (prefer AF / Activity).
  const stored = af ?? tcf;
  if (!stored) {
    throw new Error("mapOrdersToReconTrade requires at least one of af/tcf");
  }

  const joinKey = coalesce.joinKey(stored);
  const inst = stored.symbol ?? AWAITING_SOURCE;
  const execs = buildExecRows(stored);
  const orderFields = buildOrderFields(stored);
  const summary = buildSummary(stored);

  // --- Trader ↔ IB leg ---
  // Stored IB populated; trader side awaiting source (no feed). Field diffs
  // are false today (empty counterpart is not a break), so the leg is `ok`,
  // but execution-break propagation is wired for when the trader feed lands.
  const tiBaseState: MatchState = deriveState(orderFields, true, false) === "miss"
    // counterpart absent today → would be "miss"; data reality says NOT a
    // break/miss when the source is merely awaited, so treat as ok.
    ? "ok"
    : deriveState(orderFields, true, true);
  const tiState = rollUpState(tiBaseState, execs);
  const ti: ReconLeg = {
    state: tiState,
    breakType: tiState === "ok" ? undefined : pickBreakType(orderFields),
    ls: summary,          // stored IB (left/populated)
    rs: null,             // trader awaiting source
    fields: orderFields,
    execs,
  };

  // --- IB ↔ CRM leg (set membership) ---
  const integrity = deriveIntegrity(af, tcf);
  const icState: MatchState = integrity.state === "both" ? "ok" : "brk";
  const ic: ReconLeg = {
    state: icState,
    breakType: undefined,
    ls: summary,
    rs: null,
    fields: orderFields,
    execs,
    integrity: integrity.state,
    integrityType: integrity.label,
  };

  return {
    id: joinKey ?? stored.id,
    inst,
    book: stored.symbol ? (stored.symbol ?? AWAITING_SOURCE) : AWAITING_SOURCE, // book derived upstream; placeholder until provided
    ib: joinKey,          // real ibOrderID / orderID
    trader: null,         // awaiting source
    crm: tcf ? coalesce.joinKey(tcf) : null,
    ti,
    ic,
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
  const pct = reconciled > 0 ? (matched / reconciled) * 100 : 0;
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

/**
 * THE SINGLE DATA PROVIDER. Every MOBO screen calls this.
 *
 * C1: returns a typed EMPTY bundle.
 * C2: this body reads the purgeable mock (`lib/mock`) — the ONLY import
 *     site of the mock — and maps it through `mapOrdersToReconTrade`.
 * API: this body fetches the backend, deserializes into `Order` /
 *     `Execution`, and maps the same way. No component changes either time.
 */
export function loadReconciliation(): ReconView {
  // Map each stored AF/TCF order pair into a ReconTrade view model.
  // The mapper derives `book` as a placeholder (symbol) until provided
  // upstream; the mock carries the real account name, so overlay it here.
  const trades: ReconTrade[] = MOCK_STORED_TRADES.map((t) => ({
    ...mapOrdersToReconTrade({ af: t.af, tcf: t.tcf }),
    book: t.book,
  }));

  const counters = deriveCounters(trades);
  const byType = deriveEodByType(trades);

  return {
    settleDay: MOCK_SETTLE_DAY,
    trades,
    counters,
    exceptions: MOCK_EXCEPTIONS,
    feeds: MOCK_FEEDS,
    eod: { ...MOCK_EOD, byType },
  };
}
