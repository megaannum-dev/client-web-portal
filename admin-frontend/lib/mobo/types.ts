/* ============================================================
   MOBO — Reconciliation type layer (backend-aligned)

   Two layers live here, deliberately separated:

   1. DOMAIN types (`Order`, `Execution`) — named and shaped to
      mirror the backend SQLAlchemy models in
      `api-backend/app/models/reconciliation.py`
      (`IBActivity` = AF / Activity export, `IBTrade` = TCF /
      Trade-Confirmation export). Column names are the exact
      camelCase CSV header tokens the backend stores 1:1. When
      the API lands, its payload deserializes straight into these.

   2. VIEW types (`ReconTrade`, `CompareField`, `ExecRow`, …) —
      the shapes the screens render. These are DERIVED from the
      domain types by the mapper in `lib/mobo/reconciliation.ts`;
      they are never hand-authored inside components.

   DATA REALITY (see 001 §6): only stored-IB data exists today.
   There is no trader feed and no live-IB fetch. So:
     - The stored-IB column is the only populated source.
     - Trader and fetched-IB columns are surfaced as empty,
       "awaiting source" — NOT as breaks.
     - Identifiers are the real ibOrderID / orderID; no synthetic
       TRD-/CRM- refs.
     - The verdict is order-to-order, spanning order + execution
       fields; an execution break propagates up to the order.
     - There is NO FX-rate break in the vocabulary.
     - The IB↔CRM leg follows the original Claude-Design model:
       live IB (source of truth) vs the stored CRM copy, with a
       sync verdict (synced / stale / drift / missingDb / orphaned).
       The underlying storage shape (ib_activity / ib_trades) is a
       DB-level concern and is deliberately NOT surfaced here — the
       database will be reworked, so the UI stays decoupled from it.
   ============================================================ */

/* ============================================================
   DOMAIN LAYER — mirrors IBActivity (AF) / IBTrade (TCF)
   ============================================================ */

/** `levelOfDetail` discriminator shared by both staging tables. */
export type LevelOfDetail = "ORDER" | "EXECUTION";

/** Which IB Flex export a row originated from. */
export type IBSource = "AF" | "TCF";

/**
 * Numeric columns arrive from the backend as `Numeric(28,10)` and
 * are carried over the wire as strings to preserve precision (the
 * mapper formats them for display). All source columns are nullable.
 */
export type DecimalString = string;

/** `YYYYMMDD` (8) or `YYYYMMDD;HHMMSS` (20) raw IB date/datetime tokens. */
export type IBDateString = string;

/**
 * An ORDER- or EXECUTION-level row from `ib_activity` (AF / Activity export)
 * OR `ib_trades` (TCF / Trade-Confirmation export). The two exports use an
 * overlapping-but-distinct attribute set, so source-specific columns are
 * marked optional and the mapper coalesces them (e.g. `tradePrice`|`price`,
 * `settleDateTarget`|`settleDate`, `ibOrderID`|`orderID`,
 * `ibCommission`|`commission`, `tradeMoney`|`amount`).
 *
 * Attribute names track the backend columns exactly (camelCase = DB column).
 */
export interface Order {
  /** Infrastructure PK (backend UUID). */
  id: string;
  /** "ORDER" for this entity; an EXECUTION carries the parent's ibOrderID/orderID. */
  levelOfDetail: LevelOfDetail;
  /** Which export this row came from. */
  source: IBSource;

  // --- Join keys (string — IB emits dotted or numeric, never assume int) ---
  /** AF (ib_activity) reconciliation join key. */
  ibOrderID?: string | null;
  /** TCF (ib_trades) join key — same concept as ibOrderID, TCF naming. */
  orderID?: string | null;

  // --- Shared / coalesced order fields ---
  symbol?: string | null;
  buySell?: string | null;
  quantity?: DecimalString | null;
  currency?: string | null;
  assetCategory?: string | null;
  tradeDate?: IBDateString | null;
  netCash?: DecimalString | null;

  // --- Price (AF: tradePrice · TCF: price) ---
  /** AF Activity price column. */
  tradePrice?: DecimalString | null;
  /** TCF Trade-Confirm price column. */
  price?: DecimalString | null;

  // --- Settlement date (AF: settleDateTarget · TCF: settleDate) ---
  /** AF Activity settlement-date column. */
  settleDateTarget?: IBDateString | null;
  /** TCF Trade-Confirm settlement-date column. */
  settleDate?: IBDateString | null;

  // --- Commission (AF: ibCommission · TCF: commission) ---
  /** AF Activity commission column. */
  ibCommission?: DecimalString | null;
  /** TCF Trade-Confirm commission column. */
  commission?: DecimalString | null;

  // --- Net-amount-ish (AF: tradeMoney · TCF: amount) ---
  tradeMoney?: DecimalString | null;
  amount?: DecimalString | null;

  // --- AF-only ---
  /** FX rate to base — present on Activity (AF) rows only. */
  fxRateToBase?: DecimalString | null;

  /** The executions that fill this order (EXECUTION-level child rows). */
  executions?: Execution[];
}

/**
 * An EXECUTION-level fill of an `Order`. Mirrors the EXECUTION /
 * TradeConfirm `levelOfDetail` rows of the same staging tables, carrying
 * the parent order's join key.
 */
export interface Execution {
  /** Infrastructure PK (backend UUID). */
  id: string;
  levelOfDetail: "EXECUTION";
  source: IBSource;

  /** Parent order join key (AF). */
  ibOrderID?: string | null;
  /** Parent order join key (TCF). */
  orderID?: string | null;

  /** Execution identifier — surfaced as the "Trade ID" added field. */
  tradeID?: string | null;
  /** AF execution id. */
  ibExecID?: string | null;
  /** TCF execution id. */
  execID?: string | null;

  symbol?: string | null;
  buySell?: string | null;
  quantity?: DecimalString | null;

  // --- Price (AF: tradePrice · TCF: price) ---
  tradePrice?: DecimalString | null;
  price?: DecimalString | null;

  // --- Commission (AF: ibCommission · TCF: commission) ---
  ibCommission?: DecimalString | null;
  commission?: DecimalString | null;

  netCash?: DecimalString | null;
  currency?: string | null;
  assetCategory?: string | null;
  tradeDate?: IBDateString | null;

  /** Raw IB execution timestamp (`dateTime`, `YYYYMMDD;HHMMSS`). */
  dateTime?: IBDateString | null;
}

/* ============================================================
   VIEW LAYER — derived by the mapper; rendered by components
   ============================================================ */

/**
 * Order-to-order match verdict for a leg.
 *   ok   — every compared field matches (incl. executions rolled up)
 *   brk  — at least one field (order- or execution-level) differs
 *   miss — the order is present on one side only
 *
 * An execution break propagates up: if any execution row is `brk`/`miss`,
 * the order leg is at best `brk`.
 */
export type MatchState = "ok" | "brk" | "miss";

/**
 * Break vocabulary, re-based to single-source reality. NOTE: there is
 * deliberately NO `"FX rate break"` — FX drift is dropped per 001 §6.
 */
export type BreakType =
  | "Quantity break"
  | "Price break"
  | "Net-amount break"
  | "Settlement mismatch"
  | "Commission break"
  | "Missing — one side only";

/**
 * IB↔CRM data-integrity verdict (original Claude-Design model). Validates the
 * stored CRM copy against the live IB record — IB is the source of truth:
 *   synced    — stored copy matches live IB field-for-field
 *   stale     — values still match but the stored copy is past its freshness window
 *   drift     — a stored field no longer matches the live IB value
 *   missingDb — live IB returns the record but it was never stored
 *   orphaned  — the stored record has no live IB counterpart
 */
export type IntegrityState = "synced" | "stale" | "drift" | "missingDb" | "orphaned";

/**
 * One field in a side-by-side comparison.
 *   k  — field label
 *   iv — IB / stored value (the populated source)
 *   cv — comparison value (trader or fetched-IB; empty "awaiting source"
 *        in today's data reality)
 *   d  — differs flag (drives the break tint)
 */
export interface CompareField {
  k: string;
  iv: string;
  cv: string;
  d: boolean;
}

/** A single side (trader / IB / stored) of one execution, for display. */
export interface ExecSide {
  time: string;
  qty: string;
  px: string;
  /** Execution identifier surfaced as the "Trade ID" added field. */
  tradeID?: string;
}

/**
 * Per-execution comparison row. Either side may be `null`:
 *   - in today's data reality the populated side is `ib` (stored), and
 *     the counterpart (`trader`) is `null` = "awaiting source".
 */
export interface ExecRow {
  id: string;
  state: MatchState;
  trader: ExecSide | null;
  ib: ExecSide | null;
}

/**
 * One reconciliation leg of a trade. Both legs share this shape so a
 * single set of components renders them:
 *   ti — Trader vs IB     (trader blotter ↔ stored IB)
 *   ic — IB vs CRM        (live IB ↔ stored CRM copy · data integrity)
 */
export interface ReconLeg {
  /** Order-to-order verdict (execution breaks propagate up). */
  state: MatchState;
  /** Why it broke, when `state !== "ok"`. */
  breakType?: BreakType;
  /** Left summary sub-line (supports `{b}…{/b}` break highlight). */
  ls: string | null;
  /** Right summary sub-line (supports `{b}…{/b}`). */
  rs: string | null;
  /** Order-level field-by-field comparison. */
  fields: CompareField[];
  /** Per-execution breakdown, when the order fills across executions. */
  execs?: ExecRow[] | null;
  /** ic leg only: live-vs-stored data-integrity verdict (original design). */
  integrity?: IntegrityState;
  /** ic leg only: human label for the integrity verdict. */
  integrityType?: string;
  /** ic leg only: when the live IB record was last fetched (raw display). */
  fetchAt?: string | null;
  /** ic leg only: when the stored copy was last synced (raw display). */
  syncAt?: string | null;
  /** ic leg only: the stored copy is past its freshness window. */
  stale?: boolean;
  /** ic leg only: human age of a stale copy (e.g. "4h 43m ago"). */
  staleAge?: string | null;
  /** ic leg only: the order-level field that drifted, when integrity = drift. */
  driftField?: string;
  /**
   * The single field that broke, ready to render (k, before→after), when
   * `state === "brk"`. Set by the mapper so flat consumers (e.g. the daily
   * exception report) don't have to re-derive it — and so a break carried in
   * the execution rollup (e.g. a VWAP price drift) still surfaces a value
   * rather than scanning `fields` and finding none flagged.
   */
  breakField?: CompareField;
}

/**
 * The view model for one reconciled trade — the shape the recon screen and
 * triage panel consume. Identifiers are the real IB join keys
 * (ibOrderID / orderID); there are no synthetic refs.
 */
export interface ReconTrade {
  /** Stable row id (the order join key). */
  id: string;
  /** Instrument display token (symbol). */
  inst: string;
  /** Owning book / account. */
  book: string;
  /** Stored-IB order identifier (real ibOrderID / orderID). */
  ib: string | null;
  /**
   * Trader-side identifier — empty in today's data reality (no trader feed).
   */
  trader: string | null;
  /**
   * CRM / store-side identifier — empty in today's data reality.
   */
  crm: string | null;
  /** Trader ↔ IB leg. */
  ti: ReconLeg;
  /** IB ↔ CRM leg (live IB vs stored copy · data integrity). */
  ic: ReconLeg;
}

/* ---- Daily exception register (view layer) ----------------- */

export type Severity = "hi" | "med" | "lo";
export type StatusTone = "info" | "warn" | "bad";

export interface TrailEntry {
  t: string;
  d: string;
  acc?: boolean;
}

export interface Exception {
  id: string;
  sev: Severity;
  carried: boolean;
  /** Break type — drawn from the re-based vocabulary (no FX break). */
  type: BreakType | string;
  /** Real IB identifier (ibOrderID / orderID). */
  ref: string;
  book: string;
  inst: string;
  age: string;
  owner: string;
  status: string;
  statusTone: StatusTone;
  raised: string;
  /** Real IB source identifier. */
  srcRef: string;
  fields: CompareField[];
  trail: TrailEntry[];
}

/* ---- Custodian / broker feeds (dashboard) ------------------ */

export interface Feed {
  name: string;
  state: MatchState;
  note: string;
}

/* ---- End-of-day rollup (the report artifact) --------------- */

export interface EODByType {
  type: BreakType | string;
  raised: number;
  resolved: number;
  carried: number;
}

export interface EOD {
  generated: string;
  tradesReconciled: number;
  executions?: number;
  notional?: string;
  books?: number;
  matchedClean?: number;
  breaksRaised: number;
  resolved: number;
  carried: number;
  dayOf: number;
  daysInMonth: number;
  byType: EODByType[];
}

/* ---- Re-based reconciliation counters (single-source) ------
   Comparison-implying counters (e.g. internal vs custodian) are
   re-based to single-source counts: how many orders are stored,
   how many are clean, how many break, how many appear on one
   side of the set only. NO two-way "internal vs custodian" gap.
   ------------------------------------------------------------ */
export interface ReconCounters {
  /** Total stored orders reconciled. */
  reconciled: number;
  /** Orders clean on every compared field. */
  matched: number;
  /** Orders with at least one field break. */
  breaks: number;
  /** Orders present on one side of the set only. */
  unmatched: number;
  /** Auto-matched share (display string, e.g. "96.4%"). */
  autoMatchedPct: string;
}

/* ============================================================
   THE BUNDLE — what `loadReconciliation()` returns
   ============================================================ */

/**
 * Everything the MOBO screens need, in one typed bundle. Every screen
 * (recon, daily exceptions, dashboard) binds to THIS — never to the mock
 * module directly. Swapping the mock for the real API changes only the
 * body of `loadReconciliation` in `lib/mobo/reconciliation.ts`.
 */
export interface ReconView {
  /** Settlement day label. */
  settleDay: string;
  /** Derived view models for the recon screen + triage panel. */
  trades: ReconTrade[];
  /** Re-based single-source counters. */
  counters: ReconCounters;
  /** Daily exception register (carried-forward first). */
  exceptions: Exception[];
  /** Custodian / broker feed states (dashboard). */
  feeds: Feed[];
  /** End-of-day rollup (the report artifact). */
  eod: EOD;
}

/* ---- Severity labels / chip tones -------------------------- */
import type { ChipTone } from "@/components/ui/Chip";

export const SEV_LABEL: Record<Severity, string> = { hi: "High", med: "Med", lo: "Low" };
export const SEV_TONE: Record<Severity, ChipTone> = { hi: "failed", med: "pending", lo: "review" };
