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
     - NO FX-rate break; the IB↔CRM leg follows the original
       live-vs-stored integrity model (synced/stale/drift/
       missingDb/orphaned) via an explicit per-trade overlay,
       so the screen stays decoupled from the storage shape
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
  STORED_INTEGRITY as MOCK_STORED_INTEGRITY,
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
 * Trader-vs-IB per-execution rows. The IB side (`ib`) is the populated stored
 * data; the trader side (`trader`) is left `null` = "awaiting source" (no
 * trader feed today). In the breakdown the IB column is the right side.
 */
function buildExecRows(order: Order): ExecRow[] | null {
  const execs = order.executions ?? [];
  if (execs.length === 0) return null;
  return execs.map((e, i) => ({
    id: coalesceExec.execId(e) ?? `${coalesce.joinKey(order) ?? order.id}-x${i + 1}`,
    state: "ok" as MatchState, // single-source: nothing to disagree with yet
    trader: null,              // awaiting source (left)
    ib: execSide(e),           // stored IB (right)
  }));
}

/**
 * The per-trade IB↔CRM integrity overlay the mapper consumes. Structurally
 * matches `STORED_INTEGRITY` in the mock, but declared here so the mapper
 * stays decoupled from the mock module (the seam injects it).
 */
interface IntegrityOverlay {
  integrity: IntegrityState;
  integrityType?: string;
  fetchAt?: string | null;
  syncAt?: string | null;
  stale?: boolean;
  staleAge?: string | null;
  driftField?: string;
  driftValue?: string;
}

/**
 * IB↔CRM per-execution rows: live IB (`trader` = left) vs the stored copy
 * (`ib` = right). Both sides are populated. A price drift overrides the
 * stored side's price so the difference shows at both order- and exec-level.
 */
function buildIcExecRows(order: Order, ov: IntegrityOverlay): ExecRow[] | null {
  const execs = order.executions ?? [];
  if (execs.length === 0) return null;
  const priceDrift = ov.integrity === "drift" && ov.driftField === "Average price (VWAP)";
  return execs.map((e, i) => {
    const live = execSide(e);
    const stored: ExecSide =
      priceDrift && ov.driftValue ? { ...live, px: ov.driftValue } : { ...live };
    return {
      id: coalesceExec.execId(e) ?? `${coalesce.joinKey(order) ?? order.id}-x${i + 1}`,
      state: (priceDrift ? "brk" : "ok") as MatchState,
      trader: live,   // live IB (left)
      ib: stored,     // stored CRM copy (right)
    };
  });
}

/**
 * The four added order-level attribute fields (Settlement date, Currency,
 * Asset class, Trade date), appended to the derived rollup. The `iv`/`cv`
 * convention follows the leg's columns.
 */
function buildTiAttrFields(order: Order): CompareField[] {
  // ti columns: left = Trader (awaiting), right = IB (data). iv=left, cv=right.
  const f = (k: string, ib: string): CompareField => ({ k, iv: AWAITING_SOURCE, cv: ib, d: false });
  return [
    f("Settlement date", fmtDate(coalesce.settleDate(order))),
    f("Currency", order.currency ?? AWAITING_SOURCE),
    f("Asset class", order.assetCategory ?? AWAITING_SOURCE),
    f("Trade date", fmtDate(order.tradeDate)),
  ];
}

function buildIcAttrFields(order: Order, ov: IntegrityOverlay): CompareField[] {
  // ic columns: left = IB live, right = CRM stored. iv=live, cv=stored.
  const liveSettle = fmtDate(coalesce.settleDate(order));
  const settleCv =
    ov.integrity === "drift" && ov.driftField === "Settlement date" && ov.driftValue
      ? ov.driftValue
      : liveSettle;
  const cur = order.currency ?? AWAITING_SOURCE;
  const ac = order.assetCategory ?? AWAITING_SOURCE;
  const td = fmtDate(order.tradeDate);
  return [
    { k: "Settlement date", iv: liveSettle, cv: settleCv, d: settleCv !== liveSettle },
    { k: "Currency", iv: cur, cv: cur, d: false },
    { k: "Asset class", iv: ac, cv: ac, d: false },
    { k: "Trade date", iv: td, cv: td, d: false },
  ];
}

/**
 * IB↔CRM order-level field grid for the no-execution path (missingDb /
 * orphaned). One side renders the awaiting-source sentinel: orphaned = live
 * absent (left), missingDb = stored absent (right).
 */
function buildIcSingleSidedFields(order: Order, integrity: IntegrityState): CompareField[] {
  const vals: [string, string][] = [
    ["Side", order.buySell ?? AWAITING_SOURCE],
    ["Quantity", fmtQty(order.quantity)],
    ["Price", fmtPrice(coalesce.price(order), order.currency)],
    ["Settlement date", fmtDate(coalesce.settleDate(order))],
    ["Net amount", fmtAmt(coalesce.netAmount(order), order.currency)],
  ];
  const orphaned = integrity === "orphaned"; // live absent, stored present
  return vals.map(([k, v]) => ({
    k,
    iv: orphaned ? AWAITING_SOURCE : v, // live (left)
    cv: orphaned ? v : AWAITING_SOURCE, // stored (right)
    d: true,
  }));
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
  // Any execution discrepancy — a value break OR a missing/extra fill — makes
  // the order a break: the order is present on both sides but doesn't fully
  // reconcile. `miss` is reserved for a fully one-sided order (the ic
  // missingDb/orphaned case), NOT a partial-fill gap.
  if (execs.some((e) => e.state !== "ok")) return orderState === "ok" ? "brk" : orderState;
  return orderState;
}

/**
 * Map the IB↔CRM integrity verdict to a leg match state:
 *   synced / stale → ok   (values match the live record)
 *   drift          → brk  (a stored field drifted)
 *   missingDb / orphaned → miss (present on one side only)
 */
function deriveIcState(integrity: IntegrityState): MatchState {
  if (integrity === "synced" || integrity === "stale") return "ok";
  if (integrity === "drift") return "brk";
  return "miss";
}

/** The break-type label an integrity verdict raises (for the EOD by-type roll). */
function deriveIcBreakType(ov: IntegrityOverlay): BreakType | undefined {
  if (ov.integrity === "drift") {
    if (ov.driftField === "Settlement date") return "Settlement mismatch";
    return "Price break";
  }
  if (ov.integrity === "missingDb" || ov.integrity === "orphaned") {
    return "Missing — one side only";
  }
  return undefined;
}

/**
 * The single drifted field, ready to render (k, live→stored). A settlement
 * drift also lives in `buildIcAttrFields`, but a VWAP price drift lives only in
 * the execution rollup — so flat consumers (the daily exception report) that
 * pick "the field that broke" need it surfaced explicitly here. Returns
 * undefined for non-drift verdicts (missing-one-side legs carry their own copy).
 */
function buildIcBreakField(order: Order, ov: IntegrityOverlay): CompareField | undefined {
  if (ov.integrity !== "drift" || !ov.driftField) return undefined;
  const cv = ov.driftValue ?? AWAITING_SOURCE;
  if (ov.driftField === "Settlement date") {
    return { k: "Settlement date", iv: fmtDate(coalesce.settleDate(order)), cv, d: true };
  }
  if (ov.driftField === "Average price (VWAP)") {
    return { k: "Average price (VWAP)", iv: fmtPrice(coalesce.price(order), order.currency), cv, d: true };
  }
  return { k: ov.driftField, iv: AWAITING_SOURCE, cv, d: true };
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
  ic?: IntegrityOverlay | null;
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
  const summary = buildSummary(stored);

  // --- Trader ↔ IB leg ---
  // IB is the populated side (right column); the trader side is awaiting source
  // (left column, no feed). An empty counterpart is NOT a break, so the leg is
  // `ok` today — execution-break propagation is wired for when a trader feed lands.
  const tiExecs = buildExecRows(stored);
  const tiState = rollUpState("ok", tiExecs);
  const ti: ReconLeg = {
    state: tiState,
    breakType: undefined,
    ls: null,             // trader awaiting source (left)
    rs: summary,          // stored IB (right/populated)
    fields: buildTiAttrFields(stored),
    execs: tiExecs,
  };

  // --- IB ↔ CRM leg (live IB vs stored copy · data integrity) ---
  const ov: IntegrityOverlay = input.ic ?? { integrity: "synced" };
  const icState = deriveIcState(ov.integrity);
  // synced/stale/drift compare live vs stored field-for-field (with executions);
  // missingDb/orphaned have no counterpart to break down → single-sided grid.
  const hasIcExecs = ov.integrity === "synced" || ov.integrity === "stale" || ov.integrity === "drift";
  const ic: ReconLeg = {
    state: icState,
    breakType: deriveIcBreakType(ov),
    ls: ov.integrity === "orphaned" ? null : summary, // live (left) absent when orphaned
    rs: ov.integrity === "missingDb" ? null : summary, // stored (right) absent when missingDb
    fields: hasIcExecs ? buildIcAttrFields(stored, ov) : buildIcSingleSidedFields(stored, ov.integrity),
    execs: hasIcExecs ? buildIcExecRows(stored, ov) : null,
    breakField: buildIcBreakField(stored, ov),
    integrity: ov.integrity,
    integrityType: ov.integrityType,
    fetchAt: ov.fetchAt ?? null,
    syncAt: ov.syncAt ?? null,
    stale: ov.stale ?? false,
    staleAge: ov.staleAge ?? null,
    driftField: ov.driftField,
  };

  return {
    id: joinKey ?? stored.id,
    inst,
    book: AWAITING_SOURCE, // overlaid with the real account name by the seam
    ib: joinKey,           // real ibOrderID / orderID
    trader: null,          // awaiting source
    crm: ov.integrity === "missingDb" ? null : joinKey, // stored copy keyed by the IB id
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
  const trades: ReconTrade[] = MOCK_STORED_TRADES.map((t) => {
    const key = t.af?.ibOrderID ?? t.tcf?.orderID ?? "";
    return {
      ...mapOrdersToReconTrade({ af: t.af, tcf: t.tcf, ic: MOCK_STORED_INTEGRITY[key] }),
      book: t.book,
    };
  });

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
