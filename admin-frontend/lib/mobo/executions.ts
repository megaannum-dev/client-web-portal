/* ============================================================
   Unified executions — data layer only (types, formatters, mapper)

   Wire contract mirrors api-backend/app/schemas/unified_execution.py
   field-for-field: snake_case, no aliases. Decimal -> JSON string,
   date -> "YYYY-MM-DD", datetime -> ISO-8601 with offset. Do not
   re-sort `rows` — the backend pre-sorts fills under their parent
   order and this mapper relies on that order to derive `isFirst`.
   ============================================================ */

// ---- DTO (wire shape) -----------------------------------------------------

export interface UnifiedExecutionRowDTO {
  system: "CRM" | "IB" | "PC";
  grain: "order" | "fill";
  ref: string;
  group_ref: string;

  contract: string;
  underlying: string | null;
  expiry: string | null; // date
  right: string | null;
  strike: string | null; // Decimal-as-string
  multiplier: string | null;
  security_type: string | null;
  currency: string | null;
  account: string | null;

  event_ts_utc: string | null; // ISO datetime, UTC
  trade_date: string | null; // date

  direction: "BUY" | "SELL" | null;
  qty_signed: string | null;
  qty_abs: string | null;
  price: string | null;
  premium_signed: string | null;
  premium_gross: string | null;
  fee: string | null;
  cash_before_fees: string | null;
  cash_after_fees: string | null;

  status: string | null;
}

export interface UnifiedExecutionsViewDTO {
  day: string | null;
  days: string[];
  rows: UnifiedExecutionRowDTO[];
  warnings: string[];
}

// ---- View row (rendered shape) --------------------------------------------

export interface ExecutionRow {
  system: "CRM" | "IB" | "PC"; // raw — SysBadge takes it verbatim
  grain: string;
  contract: string;
  underlying: string;
  expiry: string;
  right: string;
  strike: string;
  multiplier: string;
  securityType: string;
  currency: string;
  account: string;
  time: string;
  tradeDate: string;
  direction: string;
  qtySigned: string;
  qtyAbs: string;
  price: string;
  premiumSigned: string;
  premiumGross: string;
  fee: string;
  cashBeforeFees: string;
  cashAfterFees: string;
  status: string;

  groupRef: string; // unrendered — grouping + row-selection key
  isFirst: boolean; // true on the first row of each group_ref run
  statusReal: boolean; // system === "PC"
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

// ---- Mapper -----------------------------------------------------------------

export function mapExecutions(view: UnifiedExecutionsViewDTO | null): ExecutionRow[] {
  if (!view) return [];
  const rows = view.rows;
  return rows.map((r, i) => ({
    system: r.system,
    grain: r.grain === "order" ? "Order" : "Fill",
    contract: dash(r.contract),
    underlying: dash(r.underlying),
    expiry: fmtDate(r.expiry),
    right: dash(r.right),
    strike: fmtNum(r.strike),
    multiplier: fmtNum(r.multiplier),
    securityType: dash(r.security_type),
    currency: dash(r.currency),
    account: dash(r.account),
    time: fmtEtTime(r.event_ts_utc),
    tradeDate: fmtDate(r.trade_date),
    direction: dash(r.direction),
    qtySigned: fmtNum(r.qty_signed),
    qtyAbs: fmtNum(r.qty_abs),
    price: fmtMoney(r.price),
    premiumSigned: fmtMoney(r.premium_signed),
    premiumGross: fmtMoney(r.premium_gross),
    fee: fmtMoney(r.fee),
    cashBeforeFees: fmtMoney(r.cash_before_fees),
    cashAfterFees: fmtMoney(r.cash_after_fees),
    status: dash(r.status),

    groupRef: r.group_ref,
    isFirst: i === 0 || rows[i - 1].group_ref !== r.group_ref,
    statusReal: r.system === "PC",
  }));
}
