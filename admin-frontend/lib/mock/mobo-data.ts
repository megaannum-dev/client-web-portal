/* ============================================================
   MegaCRM — MOBO (Middle & Back Office) demo data
   Settlement day: Tue 03 Jun 2026
   Drives: Dashboard · Trade Reconciliation · Daily Exceptions
   Ported from the design handoff (MoboData.jsx / MoboApp.jsx).
   ============================================================ */

export const SETTLE_DAY = "Tue 03 Jun 2026";

export type ReconState = "ok" | "brk" | "miss";

export interface CompareField {
  k: string;
  iv: string;
  cv: string;
  d: boolean;
}

export interface ReconLine {
  id: string;
  state: ReconState;
  breakType?: string;
  book: string;
  intRef: string | null;
  cusRef: string | null;
  inst: string;
  side: string;
  intSub: string | null;
  cusSub: string | null;
  fields: CompareField[];
}

/* ---- Top-of-page reconciliation summary -------------------- */
export const RECON_SUMMARY = {
  internal: 1284,
  custodian: 1279,
  matched: 1261,
  breaks: 12,
  unmatched: 11,
  autoMatchedPct: "96.4%",
};

/* ---- Reconciliation lines (two-sided match grid) ----------- */
export const RECON_LINES: ReconLine[] = [
  {
    id: "r1", state: "ok", book: "Ardent Capital",
    intRef: "TRD-88142", cusRef: "PRS-40118", inst: "AAPL US", side: "Buy",
    intSub: "Buy · 12,000 @ $187.40", cusSub: "Buy · 12,000 @ $187.40",
    fields: [
      { k: "Side", iv: "Buy", cv: "Buy", d: false },
      { k: "Quantity", iv: "12,000", cv: "12,000", d: false },
      { k: "Price", iv: "$187.40", cv: "$187.40", d: false },
      { k: "Settlement", iv: "05 Jun 2026", cv: "05 Jun 2026", d: false },
      { k: "Net amount", iv: "$2.25M", cv: "$2.25M", d: false },
    ],
  },
  {
    id: "r2", state: "brk", breakType: "Quantity break", book: "Strathmore Fund",
    intRef: "TRD-88150", cusRef: "PRS-40126", inst: "MSFT US", side: "Sell",
    intSub: "Sell · {b}8,000{/b} @ $410.20", cusSub: "Sell · {b}6,500{/b} @ $410.20",
    fields: [
      { k: "Side", iv: "Sell", cv: "Sell", d: false },
      { k: "Quantity", iv: "8,000", cv: "6,500", d: true },
      { k: "Price", iv: "$410.20", cv: "$410.20", d: false },
      { k: "Settlement", iv: "05 Jun 2026", cv: "05 Jun 2026", d: false },
      { k: "Net amount", iv: "$3.28M", cv: "$2.67M", d: true },
    ],
  },
  {
    id: "r3", state: "brk", breakType: "Price break", book: "Ardent Capital",
    intRef: "TRD-88163", cusRef: "PRS-40139", inst: "NVDA US", side: "Buy",
    intSub: "Buy · 1,200 @ {b}$121.10{/b}", cusSub: "Buy · 1,200 @ {b}$121.85{/b}",
    fields: [
      { k: "Side", iv: "Buy", cv: "Buy", d: false },
      { k: "Quantity", iv: "1,200", cv: "1,200", d: false },
      { k: "Price", iv: "$121.10", cv: "$121.85", d: true },
      { k: "Settlement", iv: "05 Jun 2026", cv: "05 Jun 2026", d: false },
      { k: "Net amount", iv: "$145,320", cv: "$146,220", d: true },
    ],
  },
  {
    id: "r4", state: "miss", breakType: "Missing — no custodian record", book: "Vela Holdings",
    intRef: "TRD-88170", cusRef: null, inst: "TSLA US", side: "Buy",
    intSub: "Buy · 3,400 @ $178.90", cusSub: null,
    fields: [
      { k: "Side", iv: "Buy", cv: "—", d: true },
      { k: "Quantity", iv: "3,400", cv: "—", d: true },
      { k: "Price", iv: "$178.90", cv: "—", d: true },
      { k: "Settlement", iv: "05 Jun 2026", cv: "—", d: true },
      { k: "Net amount", iv: "$608,260", cv: "—", d: true },
    ],
  },
  {
    id: "r5", state: "miss", breakType: "Missing — no internal record", book: "Northbridge LP",
    intRef: null, cusRef: "PRS-40150", inst: "META US", side: "Sell",
    intSub: null, cusSub: "Sell · 900 @ $498.10",
    fields: [
      { k: "Side", iv: "—", cv: "Sell", d: true },
      { k: "Quantity", iv: "—", cv: "900", d: true },
      { k: "Price", iv: "—", cv: "$498.10", d: true },
      { k: "Settlement", iv: "—", cv: "05 Jun 2026", d: true },
      { k: "Net amount", iv: "—", cv: "$448,290", d: true },
    ],
  },
  {
    id: "r6", state: "ok", book: "Selwyn Asset Mgmt",
    intRef: "TRD-88181", cusRef: "PRS-40161", inst: "GOOGL US", side: "Buy",
    intSub: "Buy · 2,100 @ $176.30", cusSub: "Buy · 2,100 @ $176.30",
    fields: [
      { k: "Side", iv: "Buy", cv: "Buy", d: false },
      { k: "Quantity", iv: "2,100", cv: "2,100", d: false },
      { k: "Price", iv: "$176.30", cv: "$176.30", d: false },
      { k: "Settlement", iv: "05 Jun 2026", cv: "05 Jun 2026", d: false },
      { k: "Net amount", iv: "$370,230", cv: "$370,230", d: false },
    ],
  },
  {
    id: "r7", state: "brk", breakType: "Settlement mismatch", book: "Meridian Trust",
    intRef: "TRD-88190", cusRef: "PRS-40170", inst: "HSBC LN", side: "Buy",
    intSub: "Buy · 40,000 · settle {b}05 Jun{/b}", cusSub: "Buy · 40,000 · settle {b}06 Jun{/b}",
    fields: [
      { k: "Side", iv: "Buy", cv: "Buy", d: false },
      { k: "Quantity", iv: "40,000", cv: "40,000", d: false },
      { k: "Price", iv: "GBP 6.82", cv: "GBP 6.82", d: false },
      { k: "Settlement", iv: "05 Jun 2026", cv: "06 Jun 2026", d: true },
      { k: "Net amount", iv: "£272,800", cv: "£272,800", d: false },
    ],
  },
  {
    id: "r8", state: "ok", book: "Pike & Vance",
    intRef: "TRD-88201", cusRef: "PRS-40181", inst: "JPM US", side: "Buy",
    intSub: "Buy · 5,500 @ $198.05", cusSub: "Buy · 5,500 @ $198.05",
    fields: [
      { k: "Side", iv: "Buy", cv: "Buy", d: false },
      { k: "Quantity", iv: "5,500", cv: "5,500", d: false },
      { k: "Price", iv: "$198.05", cv: "$198.05", d: false },
      { k: "Settlement", iv: "05 Jun 2026", cv: "05 Jun 2026", d: false },
      { k: "Net amount", iv: "$1.09M", cv: "$1.09M", d: false },
    ],
  },
  {
    id: "r9", state: "ok", book: "Vela Holdings",
    intRef: "TRD-88212", cusRef: "PRS-40192", inst: "AMZN US", side: "Sell",
    intSub: "Sell · 1,800 @ $205.60", cusSub: "Sell · 1,800 @ $205.60",
    fields: [
      { k: "Side", iv: "Sell", cv: "Sell", d: false },
      { k: "Quantity", iv: "1,800", cv: "1,800", d: false },
      { k: "Price", iv: "$205.60", cv: "$205.60", d: false },
      { k: "Settlement", iv: "05 Jun 2026", cv: "05 Jun 2026", d: false },
      { k: "Net amount", iv: "$370,080", cv: "$370,080", d: false },
    ],
  },
  {
    id: "r10", state: "brk", breakType: "FX rate break", book: "Selwyn Asset Mgmt",
    intRef: "FX-2098", cusRef: "PRS-40205", inst: "EUR/USD", side: "Buy",
    intSub: "Buy · €2.0M @ {b}1.0842{/b}", cusSub: "Buy · €2.0M @ {b}1.0851{/b}",
    fields: [
      { k: "Side", iv: "Buy", cv: "Buy", d: false },
      { k: "Notional", iv: "€2,000,000", cv: "€2,000,000", d: false },
      { k: "FX rate", iv: "1.0842", cv: "1.0851", d: true },
      { k: "Settlement", iv: "05 Jun 2026", cv: "05 Jun 2026", d: false },
      { k: "USD value", iv: "$2.168M", cv: "$2.170M", d: true },
    ],
  },
  {
    id: "r11", state: "ok", book: "Ardent Capital",
    intRef: "TRD-88224", cusRef: "PRS-40217", inst: "V US", side: "Buy",
    intSub: "Buy · 3,000 @ $289.15", cusSub: "Buy · 3,000 @ $289.15",
    fields: [
      { k: "Side", iv: "Buy", cv: "Buy", d: false },
      { k: "Quantity", iv: "3,000", cv: "3,000", d: false },
      { k: "Price", iv: "$289.15", cv: "$289.15", d: false },
      { k: "Settlement", iv: "05 Jun 2026", cv: "05 Jun 2026", d: false },
      { k: "Net amount", iv: "$867,450", cv: "$867,450", d: false },
    ],
  },
  {
    id: "r12", state: "ok", book: "Harlow Family Office",
    intRef: "TRD-88236", cusRef: "PRS-40228", inst: "BRK.B US", side: "Buy",
    intSub: "Buy · 900 @ $441.20", cusSub: "Buy · 900 @ $441.20",
    fields: [
      { k: "Side", iv: "Buy", cv: "Buy", d: false },
      { k: "Quantity", iv: "900", cv: "900", d: false },
      { k: "Price", iv: "$441.20", cv: "$441.20", d: false },
      { k: "Settlement", iv: "05 Jun 2026", cv: "05 Jun 2026", d: false },
      { k: "Net amount", iv: "$397,080", cv: "$397,080", d: false },
    ],
  },
];

/* ---- Daily exception register ------------------------------ */
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
  type: string;
  ref: string;
  book: string;
  inst: string;
  age: string;
  owner: string;
  status: string;
  statusTone: StatusTone;
  raised: string;
  srcRef: string;
  fields: CompareField[];
  trail: TrailEntry[];
}

export const EXCEPTIONS: Exception[] = [
  /* --- carried forward --- */
  {
    id: "e1", sev: "hi", carried: true, type: "Quantity break", ref: "TRD-88150",
    book: "Strathmore Fund", inst: "MSFT US", age: "1d 4h", owner: "A. Reyes",
    status: "Investigating", statusTone: "warn", raised: "Jun 02 09:40", srcRef: "TRD-88150",
    fields: [
      { k: "Trade ref", iv: "TRD-88150", cv: "PRS-40126", d: false },
      { k: "Side", iv: "Sell", cv: "Sell", d: false },
      { k: "Quantity", iv: "8,000", cv: "6,500", d: true },
      { k: "Price", iv: "$410.20", cv: "$410.20", d: false },
      { k: "Settlement", iv: "05 Jun 2026", cv: "05 Jun 2026", d: false },
      { k: "Net amount", iv: "$3.28M", cv: "$2.67M", d: true },
    ],
    trail: [
      { t: "Raised from reconciliation", d: "Jun 02 09:40 · auto · quantity mismatch 1,500" },
      { t: "Assigned to A. Reyes", d: "Jun 02 10:15 · by K. Mehta" },
      { t: "Carried forward to Jun 03", d: "Jun 02 18:00 · unresolved at EOD sign-off", acc: true },
    ],
  },
  {
    id: "e2", sev: "hi", carried: true, type: "Missing trade", ref: "CUS-55021",
    book: "Northbridge LP", inst: "META US", age: "1d 6h", owner: "A. Reyes",
    status: "Escalated", statusTone: "bad", raised: "Jun 02 07:55", srcRef: "PRS-40150",
    fields: [
      { k: "Trade ref", iv: "—", cv: "PRS-40150", d: true },
      { k: "Side", iv: "—", cv: "Sell", d: true },
      { k: "Quantity", iv: "—", cv: "900", d: true },
      { k: "Price", iv: "—", cv: "$498.10", d: true },
      { k: "Settlement", iv: "—", cv: "05 Jun 2026", d: true },
      { k: "Net amount", iv: "—", cv: "$448,290", d: true },
    ],
    trail: [
      { t: "Raised from reconciliation", d: "Jun 02 07:55 · auto · no internal record" },
      { t: "Escalated to desk", d: "Jun 02 14:20 · by A. Reyes — custodian fill not in OMS" },
      { t: "Carried forward to Jun 03", d: "Jun 02 18:00 · unresolved at EOD sign-off", acc: true },
    ],
  },
  /* --- new today · high --- */
  {
    id: "e3", sev: "hi", carried: false, type: "Missing trade", ref: "TRD-88170",
    book: "Vela Holdings", inst: "TSLA US", age: "0:48", owner: "Unassigned",
    status: "New", statusTone: "info", raised: "Jun 03 09:12", srcRef: "TRD-88170",
    fields: [
      { k: "Trade ref", iv: "TRD-88170", cv: "—", d: true },
      { k: "Side", iv: "Buy", cv: "—", d: true },
      { k: "Quantity", iv: "3,400", cv: "—", d: true },
      { k: "Price", iv: "$178.90", cv: "—", d: true },
      { k: "Settlement", iv: "05 Jun 2026", cv: "—", d: true },
      { k: "Net amount", iv: "$608,260", cv: "—", d: true },
    ],
    trail: [
      { t: "Raised from reconciliation", d: "Jun 03 09:12 · auto · no custodian record" },
    ],
  },
  /* --- new today · medium --- */
  {
    id: "e4", sev: "med", carried: false, type: "Price break", ref: "TRD-88163",
    book: "Ardent Capital", inst: "NVDA US", age: "1:10", owner: "A. Reyes",
    status: "Investigating", statusTone: "warn", raised: "Jun 03 08:50", srcRef: "TRD-88163",
    fields: [
      { k: "Trade ref", iv: "TRD-88163", cv: "PRS-40139", d: false },
      { k: "Side", iv: "Buy", cv: "Buy", d: false },
      { k: "Quantity", iv: "1,200", cv: "1,200", d: false },
      { k: "Price", iv: "$121.10", cv: "$121.85", d: true },
      { k: "Settlement", iv: "05 Jun 2026", cv: "05 Jun 2026", d: false },
      { k: "Net amount", iv: "$145,320", cv: "$146,220", d: true },
    ],
    trail: [
      { t: "Raised from reconciliation", d: "Jun 03 08:50 · auto · price mismatch $0.75" },
      { t: "Assigned to A. Reyes", d: "Jun 03 09:05 · by K. Mehta" },
    ],
  },
  {
    id: "e5", sev: "med", carried: false, type: "Settlement mismatch", ref: "TRD-88190",
    book: "Meridian Trust", inst: "HSBC LN", age: "1:54", owner: "Unassigned",
    status: "New", statusTone: "info", raised: "Jun 03 08:06", srcRef: "TRD-88190",
    fields: [
      { k: "Trade ref", iv: "TRD-88190", cv: "PRS-40170", d: false },
      { k: "Side", iv: "Buy", cv: "Buy", d: false },
      { k: "Quantity", iv: "40,000", cv: "40,000", d: false },
      { k: "Price", iv: "GBP 6.82", cv: "GBP 6.82", d: false },
      { k: "Settlement", iv: "05 Jun 2026", cv: "06 Jun 2026", d: true },
      { k: "Net amount", iv: "£272,800", cv: "£272,800", d: false },
    ],
    trail: [
      { t: "Raised from reconciliation", d: "Jun 03 08:06 · auto · settlement date +1 day" },
    ],
  },
  /* --- new today · low --- */
  {
    id: "e6", sev: "lo", carried: false, type: "FX rate break", ref: "FX-2098",
    book: "Selwyn Asset Mgmt", inst: "EUR/USD", age: "2:20", owner: "K. Mehta",
    status: "Investigating", statusTone: "warn", raised: "Jun 03 07:40", srcRef: "FX-2098",
    fields: [
      { k: "Side", iv: "Buy", cv: "Buy", d: false },
      { k: "Notional", iv: "€2,000,000", cv: "€2,000,000", d: false },
      { k: "FX rate", iv: "1.0842", cv: "1.0851", d: true },
      { k: "Settlement", iv: "05 Jun 2026", cv: "05 Jun 2026", d: false },
      { k: "USD value", iv: "$2.168M", cv: "$2.170M", d: true },
    ],
    trail: [
      { t: "Raised from reconciliation", d: "Jun 03 07:40 · auto · rate diff 0.0009" },
      { t: "Assigned to K. Mehta", d: "Jun 03 08:00 · self-assigned" },
    ],
  },
  {
    id: "e7", sev: "lo", carried: false, type: "Fee mismatch", ref: "TRD-88219",
    book: "Selwyn Asset Mgmt", inst: "GS US", age: "3:05", owner: "K. Mehta",
    status: "Investigating", statusTone: "warn", raised: "Jun 03 06:55", srcRef: "TRD-88219",
    fields: [
      { k: "Trade ref", iv: "TRD-88219", cv: "PRS-40233", d: false },
      { k: "Side", iv: "Buy", cv: "Buy", d: false },
      { k: "Quantity", iv: "1,500", cv: "1,500", d: false },
      { k: "Commission", iv: "$148.00", cv: "$162.50", d: true },
      { k: "Settlement", iv: "05 Jun 2026", cv: "05 Jun 2026", d: false },
      { k: "Net amount", iv: "$520,648", cv: "$520,663", d: true },
    ],
    trail: [
      { t: "Raised from reconciliation", d: "Jun 03 06:55 · auto · commission diff $14.50" },
      { t: "Assigned to K. Mehta", d: "Jun 03 07:20 · by K. Mehta" },
    ],
  },
];

/* ---- Custodian / broker feeds (dashboard) ------------------ */
export interface Feed {
  name: string;
  state: ReconState;
  note: string;
}

export const FEEDS: Feed[] = [
  { name: "Custodian A — Pershing", state: "ok", note: "Received 06:02" },
  { name: "Custodian B — BNY", state: "ok", note: "Received 06:05" },
  { name: "Prime broker — Goldman Sachs", state: "ok", note: "Received 06:11" },
  { name: "FX desk feed", state: "brk", note: "Partial · 06:40" },
];

/* ---- End-of-day rollup (the report artifact) --------------- */
export const EOD = {
  generated: "17:42 GMT",
  tradesReconciled: 1284,
  breaksRaised: 18,
  resolved: 11,
  carried: 7,
  dayOf: 3,
  daysInMonth: 30,
  byType: [
    { type: "Quantity break", raised: 6, resolved: 3, carried: 3 },
    { type: "Price break", raised: 5, resolved: 4, carried: 1 },
    { type: "Missing trade", raised: 3, resolved: 1, carried: 2 },
    { type: "Settlement mismatch", raised: 3, resolved: 2, carried: 1 },
    { type: "FX / fee", raised: 1, resolved: 1, carried: 0 },
  ],
};

/* ---- Severity labels / chip tones -------------------------- */
import type { ChipTone } from "@/components/ui/Chip";

export const SEV_LABEL: Record<Severity, string> = { hi: "High", med: "Med", lo: "Low" };
export const SEV_TONE: Record<Severity, ChipTone> = { hi: "failed", med: "pending", lo: "review" };
