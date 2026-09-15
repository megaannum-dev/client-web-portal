/* ============================================================
   Unified executions — data layer only (types, formatters, mapper)

   Wire contract mirrors api-backend/app/schemas/unified_execution.py
   field-for-field: snake_case, no aliases. Decimal -> JSON string,
   date -> "YYYY-MM-DD", datetime -> ISO-8601 with offset.

   The endpoint returns a TREE, not a row list: Trade -> Order ->
   Execution. A Trade spans all three systems (its key is account +
   descrpt + trade_date + direction); the Orders beneath it stay
   system-scoped. Do not re-sort anything — the backend already orders
   trades, orders and fills.
   ============================================================ */

export type Sys = "CRM" | "IB" | "PC";

// ---- DTO (wire shape) -----------------------------------------------------

export interface UnifiedExecutionRowDTO {
  system: Sys;
  account: string | null;
  txn_type: "order" | "execution";
  descrpt: string | null; // display-ready, e.g. "SPY 20AUG26 766 C"
  exchange: string | null; // null on PC — structural, not a gap
  currency: string | null;
  asset_class: string | null; // display-ready, e.g. "OPT-CALL"

  trade_date: string | null; // date
  direction: "BUY" | "SELL" | null;
  price: string | null;
  qty: string | null;
  trade_amt: string | null;
  fee: string | null; // signed: positive = charge, negative = rebate. Never abs().
  settlement_amt: string | null;
  status: string | null;
  txn_time_utc: string | null; // ISO datetime, UTC

  group_ref: string; // unrendered — the parent order's key

  breaks: string[]; // wire field names that disagree across systems
  missing_from: string[]; // live systems carrying no counterpart for this record
}

/** A node in the tree: a source row plus its identity within the response. */
export interface ExecutionNodeDTO extends UnifiedExecutionRowDTO {
  ref: string; // stable within a response and across a refetch of the same day
  trade_ref: string;
  /** A synthesized placeholder for a record this system does NOT have.
   *  Every economic field is null on one — never render it as 0. */
  missing: boolean;
}

export interface OrderNodeDTO extends ExecutionNodeDTO {
  executions: ExecutionNodeDTO[];
}

/** One system's contribution to a trade. Never summed ACROSS systems. */
export interface TradeTotalsDTO {
  qty: string | null;
  price: string | null; // quantity-weighted average, rounded — compare with tolerance
  trade_amt: string | null;
  fee: string | null;
  settlement_amt: string | null;
}

export interface TradeNodeDTO {
  ref: string;
  account: string | null;
  descrpt: string | null;
  trade_date: string | null;
  direction: "BUY" | "SELL" | null;
  asset_class: string | null;
  by_system: Partial<Record<Sys, TradeTotalsDTO>>;
  breaks: string[];
  missing_from: string[];
  orders: OrderNodeDTO[];
}

export interface ReconSummaryDTO {
  broken_rows: string[]; // refs of nodes carrying >=1 break
  missing_rows: string[]; // refs of the synthesized `missing` placeholders
  by_field: Record<string, number>; // 'qty' -> 3, open buckets
  missing_by_system: Record<string, number>; // counts match-key BUCKETS, not rows
}

export interface UnifiedExecutionsViewDTO {
  day: string | null;
  days: string[];
  trades: TradeNodeDTO[];
  warnings: string[];
  recon: ReconSummaryDTO;
}

// ---- View model (rendered shape) -------------------------------------------

export type ReconColKey =
  | "system" | "account" | "kind" | "descrpt" | "exchange" | "currency"
  | "assetClass" | "tradeDate" | "direction" | "price" | "qty" | "tradeAmt"
  | "fee" | "settlementAmt" | "status" | "txnTime";

/** Columns whose value only exists at transaction grain — blank on a placeholder. */
export const RECON_TXN_COLS: ReconColKey[] = [
  "direction", "price", "qty", "tradeAmt", "fee", "settlementAmt", "txnTime",
];

export interface ReconColumn {
  key: ReconColKey;
  head: string;
  width: number;
  numeric?: boolean;
  /** Cannot be hidden — without it a row cannot be attributed to a system. */
  locked?: boolean;
}

export const RECON_COLUMNS: ReconColumn[] = [
  { key: "system", head: "System", width: 78, locked: true },
  { key: "account", head: "Account Number", width: 122 },
  { key: "kind", head: "Txn Type", width: 98 },
  { key: "descrpt", head: "Descrpt", width: 178 },
  { key: "exchange", head: "Exch", width: 98 },
  { key: "currency", head: "Currency", width: 86 },
  { key: "assetClass", head: "Asset Category", width: 128 },
  { key: "tradeDate", head: "Trade Date", width: 108 },
  { key: "direction", head: "Buy/Sell", width: 88 },
  { key: "price", head: "Price", width: 94, numeric: true },
  { key: "qty", head: "QTY", width: 82, numeric: true },
  { key: "tradeAmt", head: "Trade Amt", width: 114, numeric: true },
  { key: "fee", head: "Fee", width: 86, numeric: true },
  { key: "settlementAmt", head: "Settlement Amt", width: 128, numeric: true },
  { key: "status", head: "Status", width: 116 },
  { key: "txnTime", head: "Txn Time", width: 96 },
];

export const RECON_FILTERS: { key: ReconColKey; label: string }[] = [
  { key: "system", label: "System" },
  { key: "kind", label: "Txn Type" },
  { key: "assetClass", label: "Asset Category" },
  { key: "direction", label: "Buy/Sell" },
  { key: "status", label: "Status" },
];

/** Columns the search box scans. */
export const RECON_SEARCH_COLS: ReconColKey[] = [
  "account", "descrpt", "exchange", "assetClass", "currency", "system", "kind", "status",
];

export type BrkKey =
  | "price" | "qty" | "tradeAmt" | "fee" | "settlementAmt"
  | "exchange" | "currency" | "assetClass";

export interface ReconNode {
  ref: string;
  level: 0 | 1 | 2; // trade | order | execution
  kind: "Trade" | "Order" | "Execution";
  system: Sys | null; // null on a trade row — a trade spans systems
  systems: Sys[]; // trade rows only: which systems contributed

  // pre-formatted display strings; "—" when absent
  account: string;
  descrpt: string;
  exchange: string;
  currency: string;
  assetClass: string;
  tradeDate: string;
  direction: string;
  price: string;
  qty: string;
  tradeAmt: string;
  fee: string;
  settlementAmt: string;
  status: string;
  txnTime: string;

  /** Raw comparables for sorting; null sorts last. */
  sort: {
    price: number | null;
    qty: number | null;
    tradeAmt: number | null;
    fee: number | null;
    settlementAmt: number | null;
    txnTime: number | null;
  };

  missing: boolean; // this node is a synthesized placeholder
  breaks: string[]; // wire field names this node disagrees on
  hasMissing: boolean; // this node OR any descendant — survives collapsing
  hasBreak: boolean; // ditto

  /** Per-cell disagreement, for the red/bold cell treatment. */
  brk: Partial<Record<BrkKey, boolean>>;
  /** Per-system breakdown behind a disagreeing cell, for its `title`. */
  cellTitle: Partial<Record<BrkKey, string>>;

  statusReal: boolean; // only PC carries a real lifecycle status
  children: ReconNode[];
}

// ---- Formatters ------------------------------------------------------------

/** Decimal-as-string -> plain localized number, `"—"` when null/unparseable. */
function fmtNum(v: string | null): string {
  if (v == null) return "—";
  const n = Number(v);
  return Number.isNaN(n) ? "—" : n.toLocaleString("en-US");
}

/**
 * Decimal-as-string -> money, signed. Fee/cash/premium fields are
 * meaningfully signed (a negative fee is a real rebate) — never abs() the
 * input, and always show the sign so a rebate can't be misread as a charge.
 */
function fmtMoney(v: string | null): string {
  if (v == null) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return sign + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * ISO date ("YYYY-MM-DD") -> short display date, `"—"` when null/unparseable.
 *
 * Formatted in UTC on purpose. A bare date string parses as UTC midnight, so
 * rendering it in browser-local time shifts it a day backwards for any viewer
 * west of UTC — "2026-08-11" would show as Aug 10 in New York. These are
 * calendar dates (ET session date, option expiry), not instants; there is no
 * timezone to convert them into.
 */
function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * ISO datetime -> time-of-day in America/New_York. The backend day-scopes
 * on the ET session date (trade_date), so rendering in browser-local time
 * would visibly disagree with the TRADE DATE column next to it — e.g. a UTC
 * instant of 2026-08-12T01:24:00Z is trade_date 2026-08-11 and must show as
 * an evening ET time, not an early-morning local one.
 */
function fmtEtTime(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "America/New_York" });
}

const dash = (v: string | null): string => v ?? "—";

function num(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---- Trade-level agreement --------------------------------------------------

const SYS_ORDER: Sys[] = ["CRM", "IB", "PC"];

/**
 * A trade has NO single set of figures: `by_system` holds up to three totals for
 * the same lot, and summing them would count that lot three times. So a trade
 * cell shows the figure only when every contributing system agrees; when they
 * disagree it shows the first (CRM -> IB -> PC) and flags the cell, with each
 * system's own number carried in the tooltip. Never average them.
 */
function agree(
  entries: [Sys, string | null][],
  fmt: (v: string | null) => string,
  tol = 0,
): { text: string; raw: number | null; disagree: boolean; title?: string } {
  const present = entries.filter((e): e is [Sys, string] => e[1] != null);
  if (present.length === 0) return { text: "—", raw: null, disagree: false };
  const nums = present.map((e) => Number(e[1]));
  const finite = nums.every((n) => Number.isFinite(n));
  const spread = finite ? Math.max(...nums) - Math.min(...nums) : Infinity;
  const disagree = present.length > 1 && !(spread <= tol);
  return {
    text: fmt(present[0][1]),
    raw: finite ? nums[0] : null,
    disagree,
    title: disagree ? present.map((e) => e[0] + " " + fmt(e[1])).join(" · ") : undefined,
  };
}

/** Same rule for a string attribute read off the child orders (exchange, currency).
 *  Nulls take no part: PC has no venue column at all, so its structural null is
 *  not a disagreement. */
function agreeText(values: (string | null)[]): { text: string; disagree: boolean; title?: string } {
  const present = values.filter((v): v is string => v != null && v !== "");
  if (present.length === 0) return { text: "—", disagree: false };
  const distinct = Array.from(new Set(present));
  return {
    text: present[0],
    disagree: distinct.length > 1,
    title: distinct.length > 1 ? distinct.join(" · ") : undefined,
  };
}

// ---- Mapper -----------------------------------------------------------------

/** Wire field name -> the view column it lands in. */
const BRK_FIELD: Record<string, BrkKey> = {
  price: "price",
  qty: "qty",
  fee: "fee",
  exchange: "exchange",
  currency: "currency",
  trade_amt: "tradeAmt",
  settlement_amt: "settlementAmt",
  asset_class: "assetClass",
};

function mapRow(r: ExecutionNodeDTO, level: 1 | 2, children: ReconNode[]): ReconNode {
  // Every transaction-level field is null on a placeholder by construction;
  // the formatters already render those as "—", never as 0.
  const brk: Partial<Record<BrkKey, boolean>> = {};
  for (const f of r.breaks) {
    const k = BRK_FIELD[f];
    if (k) brk[k] = true;
  }
  return {
    ref: r.ref,
    level,
    kind: r.txn_type === "order" ? "Order" : "Execution",
    system: r.system,
    systems: [],
    account: dash(r.account),
    descrpt: dash(r.descrpt),
    exchange: dash(r.exchange),
    currency: dash(r.currency),
    assetClass: dash(r.asset_class),
    tradeDate: fmtDate(r.trade_date),
    direction: dash(r.direction),
    price: fmtMoney(r.price),
    qty: fmtNum(r.qty),
    tradeAmt: fmtMoney(r.trade_amt),
    fee: fmtMoney(r.fee),
    settlementAmt: fmtMoney(r.settlement_amt),
    status: r.missing ? "Missing" : dash(r.status),
    txnTime: fmtEtTime(r.txn_time_utc),
    sort: {
      price: num(r.price),
      qty: num(r.qty),
      tradeAmt: num(r.trade_amt),
      fee: num(r.fee),
      settlementAmt: num(r.settlement_amt),
      txnTime: r.txn_time_utc ? Date.parse(r.txn_time_utc) || null : null,
    },
    missing: r.missing,
    breaks: r.breaks,
    hasMissing: r.missing || children.some((c) => c.hasMissing),
    hasBreak: r.breaks.length > 0 || children.some((c) => c.hasBreak),
    brk,
    cellTitle: {},
    statusReal: r.system === "PC" && !r.missing,
    children,
  };
}

function mapTrade(t: TradeNodeDTO): ReconNode {
  const orders = t.orders.map((o) =>
    mapRow(o, 1, o.executions.map((e) => mapRow(e, 2, []))),
  );
  const systems = SYS_ORDER.filter((s) => t.by_system[s] != null);
  const totals = (f: keyof TradeTotalsDTO): [Sys, string | null][] =>
    systems.map((s) => [s, t.by_system[s]![f] ?? null]);

  // price is a rounded weighted average on every source — tolerance, never ==.
  const price = agree(totals("price"), fmtMoney, 1e-7);
  const qty = agree(totals("qty"), fmtNum);
  const tradeAmt = agree(totals("trade_amt"), fmtMoney);
  const fee = agree(totals("fee"), fmtMoney);
  const settle = agree(totals("settlement_amt"), fmtMoney);
  // Read off the real orders only: a placeholder has no venue or currency to agree with.
  const real = t.orders.filter((o) => !o.missing);
  const exchange = agreeText(real.map((o) => o.exchange));
  const currency = agreeText(real.map((o) => o.currency));

  const brk: Partial<Record<BrkKey, boolean>> = {};
  const cellTitle: Partial<Record<BrkKey, string>> = {};
  const mark = (k: BrkKey, r: { disagree: boolean; title?: string }) => {
    if (!r.disagree) return;
    brk[k] = true;
    if (r.title) cellTitle[k] = r.title;
  };
  mark("price", price);
  mark("qty", qty);
  mark("tradeAmt", tradeAmt);
  mark("fee", fee);
  mark("settlementAmt", settle);
  mark("exchange", exchange);
  mark("currency", currency);

  const hasMissing = t.missing_from.length > 0 || orders.some((o) => o.hasMissing);
  const hasBreak = t.breaks.length > 0 || orders.some((o) => o.hasBreak);

  return {
    ref: t.ref,
    level: 0,
    kind: "Trade",
    system: null,
    systems,
    account: dash(t.account),
    descrpt: dash(t.descrpt),
    exchange: exchange.text,
    currency: currency.text,
    assetClass: dash(t.asset_class),
    tradeDate: fmtDate(t.trade_date),
    direction: dash(t.direction),
    price: price.text,
    qty: qty.text,
    tradeAmt: tradeAmt.text,
    fee: fee.text,
    settlementAmt: settle.text,
    status: hasMissing || hasBreak ? "Break" : "Matched",
    txnTime: "—",
    sort: {
      price: price.raw,
      qty: qty.raw,
      tradeAmt: tradeAmt.raw,
      fee: fee.raw,
      settlementAmt: settle.raw,
      txnTime: null,
    },
    missing: false,
    breaks: t.breaks,
    hasMissing,
    hasBreak,
    brk,
    cellTitle,
    statusReal: false,
    children: orders,
  };
}

export function mapExecutions(view: UnifiedExecutionsViewDTO | null): ReconNode[] {
  if (!view) return [];
  // A backend still on the old flat contract sends `rows`, not `trades`. That is
  // FE/BE deploy skew, not corrupt data -- degrade to an empty view and say so in
  // the console rather than taking the whole page down on `undefined.map`.
  if (!Array.isArray(view.trades)) {
    console.error(
      "[mobo] /api/mobo/executions returned no `trades` array - the API is on an older contract.",
    );
    return [];
  }
  return view.trades.map(mapTrade);
}

/** Depth-first walk in render order. */
export function walkNodes(nodes: ReconNode[]): ReconNode[] {
  const out: ReconNode[] = [];
  const push = (n: ReconNode) => {
    out.push(n);
    n.children.forEach(push);
  };
  nodes.forEach(push);
  return out;
}
