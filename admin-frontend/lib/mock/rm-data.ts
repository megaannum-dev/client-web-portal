/* ============================================================
   MegaCRM — RM demo data (ported from the design handoff Data.jsx)
   All data is mock; no backend wiring.
   ============================================================ */
import type { ChipTone } from "@/components/ui/Chip";
import type { SummaryItem, ClientDoc, HistoryEntry } from "@/lib/rm/types";

export type RmClient = {
  id: string;
  name: string;
  mandate: string;
  status: string;
  tone: ChipTone;
  aum: string;
  renewal: string;
  kyc: string;
  kycTone: ChipTone;
  since: string;
  models: number;
  contact: string;
  title: string;
  email: string;
  assignedRm: string;
};

export const RM_CLIENTS: RmClient[] = [
  // { id: "ardent", name: "Ardent Capital", mandate: "Discretionary", status: "Active", tone: "active",
  //   aum: "$42.1M", renewal: "Jun 14, 2026", kyc: "Verified", kycTone: "active", since: "2021", models: 3,
  //   contact: "Helena Voss", title: "Chief Investment Officer", email: "h.voss@ardentcap.com", assignedRm: "Dana Okafor" },
  // { id: "northbridge", name: "Northbridge LP", mandate: "Advisory", status: "Pending", tone: "pending",
  //   aum: "$18.9M", renewal: "Aug 02, 2026", kyc: "Pending", kycTone: "pending", since: "2023", models: 2,
  //   contact: "Marcus Lin", title: "Managing Partner", email: "m.lin@northbridge.lp", assignedRm: "Dana Okafor" },
  // { id: "vela", name: "Vela Holdings", mandate: "Discretionary", status: "Active", tone: "active",
  //   aum: "$31.4M", renewal: "Jun 21, 2026", kyc: "Verified", kycTone: "active", since: "2020", models: 4,
  //   contact: "Priya Anand", title: "Treasurer", email: "priya@velaholdings.com", assignedRm: "Jules Bennett" },
  // { id: "meridian", name: "Meridian Trust", mandate: "Advisory", status: "In Review", tone: "review",
  //   aum: "$12.0M", renewal: "Jul 09, 2026", kyc: "In Review", kycTone: "review", since: "2024", models: 1,
  //   contact: "Daniel Reyes", title: "Trustee", email: "d.reyes@meridiantrust.org", assignedRm: "Sana Iqbal" },
  // { id: "coalfield", name: "Coalfield & Co.", mandate: "Discretionary", status: "Overdue", tone: "overdue",
  //   aum: "$9.7M", renewal: "Overdue", kyc: "Expired", kycTone: "overdue", since: "2019", models: 2,
  //   contact: "Susan Pike", title: "Finance Director", email: "spike@coalfield.co", assignedRm: "Dana Okafor" },
  // { id: "selwyn", name: "Selwyn Asset Mgmt", mandate: "Discretionary", status: "Active", tone: "active",
  //   aum: "$27.3M", renewal: "Sep 18, 2026", kyc: "Verified", kycTone: "active", since: "2022", models: 3,
  //   contact: "Omar Haddad", title: "Head of Portfolios", email: "o.haddad@selwyn.am", assignedRm: "Jules Bennett" },
  // { id: "harlow", name: "Harlow Family Office", mandate: "Advisory", status: "Pending", tone: "pending",
  //   aum: "$54.8M", renewal: "Oct 01, 2026", kyc: "Pending", kycTone: "pending", since: "2025", models: 0,
  //   contact: "Lena Okonkwo", title: "Principal", email: "lena@harlowfo.com", assignedRm: "Sana Iqbal" },
  // { id: "pike", name: "Pike & Vance", mandate: "Discretionary", status: "Active", tone: "active",
  //   aum: "$22.6M", renewal: "Nov 12, 2026", kyc: "Verified", kycTone: "active", since: "2021", models: 2,
  //   contact: "Greg Vance", title: "Partner", email: "g.vance@pikevance.com", assignedRm: "Dana Okafor" },
];

/** Renewals Due rail card — one row per client, sourced from RM_CLIENTS. */
export const RENEWALS_DUE: SummaryItem[] = RM_CLIENTS.map((c) => ({
  id: c.id,
  c: c.name,
  d: c.renewal === "Overdue" ? "Overdue" : c.renewal.replace(", 2026", ""),
  t: c.tone === "overdue" ? "overdue" : "neutral",
}));

/* ---- Per-client DETAIL mock data --------------------------- */
type ClientModel = { name: string; status: string; tone: ChipTone; account: string; notes: string };

type ClientExtra = {
  address: string;
  country: string;
  clientId: string;
  phone: string;
  cashValue: string;
  portfolioValue?: string;
  models: ClientModel[];
};

export const CLIENT_EXTRA: Record<string, ClientExtra> = {
  // ardent: {
  //   address: "120 Battery Street, Suite 1400\nSan Francisco, CA 94111",
  //   country: "United States", clientId: "MEGA-0481", phone: "+1 (415) 555-0142", cashValue: "$3.84M",
  //   models: [
  //     { name: "Global Balanced", status: "Active", tone: "active", account: "IB-4471", notes: "Quarterly rebalance" },
  //     { name: "Model A", status: "Active", tone: "active", account: "IB-4471", notes: "First subscription" },
  //     { name: "ESG Tilt", status: "In Review", tone: "review", account: "IB-5582", notes: "Awaiting compliance" },
  //   ],
  //   preferences: {
  //     birthday: "Mar 14, 1978", anniversary: "Sep 9, 2006", occupation: "Chief Investment Officer", spouseName: "Marcus Voss",
  //     childrenNames: "Elise (14), Theo (11)", personalInterests: "Sailing, contemporary art, single-origin coffee",
  //     commPrefs: "Prefers calls over email; avoid Fridays", giftPrefs: "No alcohol — enjoys fine dining", otherPrefNotes: "Introduced by Jules Bennett in 2021.",
  //   },
  // },
  // northbridge: {
  //   address: "8 Finsbury Circus\nLondon EC2M 7EA",
  //   country: "United Kingdom", clientId: "MEGA-0613", phone: "+44 20 7946 0318", cashValue: "$1.62M",
  //   models: [
  //     { name: "Income Core", status: "Active", tone: "active", account: "IB-3310", notes: "Monthly income" },
  //     { name: "Global Balanced", status: "Pending", tone: "pending", account: "IB-3310", notes: "Allotment scheduled" },
  //   ],
  //   preferences: {
  //     birthday: "Nov 2, 1985", anniversary: "—", occupation: "Managing Partner", spouseName: "—", childrenNames: "—",
  //     personalInterests: "Rugby, whisky collecting", commPrefs: "Email preferred; short-form updates", giftPrefs: "—", otherPrefNotes: "Very time-constrained — keep meetings to 30 min.",
  //   },
  // },
  // vela: {
  //   address: "1 Raffles Place, #44-01\nSingapore 048616",
  //   country: "Singapore", clientId: "MEGA-0298", phone: "+65 6812 4477", cashValue: "$2.97M",
  //   models: [
  //     { name: "Global Balanced", status: "Active", tone: "active", account: "IB-2204", notes: "Quarterly rebalance" },
  //     { name: "Equity Growth", status: "Active", tone: "active", account: "IB-2204", notes: "High conviction" },
  //     { name: "Income Core", status: "Active", tone: "active", account: "IB-2255", notes: "Liquidity sleeve" },
  //     { name: "ESG Tilt", status: "Active", tone: "active", account: "IB-2255", notes: "Client mandate" },
  //   ],
  //   preferences: {
  //     birthday: "Jul 22, 1971", anniversary: "Jan 30, 1999", occupation: "Treasurer", spouseName: "Devan Anand",
  //     childrenNames: "Riya (19)", personalInterests: "Marathon running, ESG research", commPrefs: "Video calls; morning SGT",
  //     giftPrefs: "Vegetarian — no leather goods", otherPrefNotes: "Board seat on a local arts foundation.",
  //   },
  // },
  // meridian: {
  //   address: "200 Bay Street, Suite 3200\nToronto, ON M5J 2J3",
  //   country: "Canada", clientId: "MEGA-0744", phone: "+1 (416) 555-0190", cashValue: "$0.91M",
  //   models: [
  //     { name: "Income Core", status: "In Review", tone: "review", account: "IB-7781", notes: "Onboarding model" },
  //   ],
  // },
  // coalfield: {
  //   address: "55 Collins Street\nMelbourne, VIC 3000",
  //   country: "Australia", clientId: "MEGA-0152", phone: "+61 3 9012 5566", cashValue: "$0.44M",
  //   models: [
  //     { name: "Global Balanced", status: "Active", tone: "active", account: "IB-1190", notes: "Review overdue" },
  //     { name: "Model A", status: "Overdue", tone: "overdue", account: "IB-1190", notes: "KYC expired — frozen" },
  //   ],
  // },
  // selwyn: {
  //   address: "Bahnhofstrasse 45\n8001 Zürich",
  //   country: "Switzerland", clientId: "MEGA-0526", phone: "+41 44 668 1120", cashValue: "$2.15M",
  //   models: [
  //     { name: "Global Balanced", status: "Active", tone: "active", account: "IB-6620", notes: "Quarterly rebalance" },
  //     { name: "Equity Growth", status: "Active", tone: "active", account: "IB-6620", notes: "Core holding" },
  //     { name: "ESG Tilt", status: "Active", tone: "active", account: "IB-6655", notes: "Thematic tilt" },
  //   ],
  // },
  // harlow: {
  //   address: "443 Park Avenue, Floor 28\nNew York, NY 10022",
  //   country: "United States", clientId: "MEGA-0807", phone: "+1 (212) 555-0177", cashValue: "$6.30M",
  //   models: [],
  // },
  // pike: {
  //   address: "2 Pacific Place, 88 Queensway\nHong Kong",
  //   country: "Hong Kong SAR", clientId: "MEGA-0369", phone: "+852 3018 4422", cashValue: "$1.78M",
  //   models: [
  //     { name: "Global Balanced", status: "Active", tone: "active", account: "IB-9012", notes: "Quarterly rebalance" },
  //     { name: "Income Core", status: "Active", tone: "active", account: "IB-9012", notes: "Yield focus" },
  //   ],
  // },
};

function clientDocs(c: Pick<RmClient, "kyc" | "tone">): ClientDoc[] {
  const v = c.kyc === "Verified";
  const overdue = c.tone === "overdue";
  return [
    // { name: "Passport / ID", status: v ? "Verified" : "Pending", tone: v ? "active" : "pending", icon: v ? "check" : "clock" },
    // { name: "Proof of Address", status: v ? "Verified" : "Pending review", tone: v ? "active" : "pending", icon: v ? "check" : "clock" },
    // { name: "Source of Wealth", status: overdue ? "Expired" : v ? "Verified" : "Missing", tone: overdue ? "overdue" : v ? "active" : "pending", icon: overdue ? "x" : v ? "check" : "clock" },
    // { name: "Tax Residency (CRS)", status: "Verified", tone: "active", icon: "check" },
    // { name: "Sanctions / PEP Screen", status: v ? "Verified" : "In Review", tone: v ? "active" : "review", icon: v ? "check" : "search" },
  ];
}

function clientHistory(c: Pick<RmClient, "kyc" | "mandate">, models: ClientModel[]): HistoryEntry[] {
  const rm = "Dana Okafor";
  const m0 = models[0] ? models[0].name : null;
  const m1 = models[1] ? models[1].name : null;
  return [
    // m0
    //   ? { t: `Subscribed to ${m0}`, d: "May 28", accent: true, detail: ["Allotment · 2× model multiple", `Ref SUB-20418 · logged by ${rm}`] }
    //   : { t: "Onboarding started", d: "May 28", accent: true, detail: ["KYC pack issued to client", `Owner: ${rm}`] },
    // c.kyc === "Verified"
    //   ? { t: "KYC renewal completed", d: "May 12", detail: ["All documents re-verified", "Next review scheduled"] }
    //   : c.kyc === "Expired"
    //     ? { t: "KYC flagged expired", d: "May 12", detail: ["Source of Wealth lapsed", "Account actions frozen"] }
    //     : { t: "KYC documents requested", d: "May 12", detail: ["Awaiting client upload", "Compliance notified"] },
    // { t: "Quarterly review call", d: "Apr 03", detail: ["45 min · portfolio + rebalancing", "Notes added to relationship file"] },
    // { t: "Statement dispatched", d: "Mar 31", detail: ["Q1 2026 consolidated statement", "Delivered via secure portal"] },
    // m1
    //   ? { t: `Subscribed to ${m1}`, d: "Mar 12", detail: ["Allotment · 1× model multiple", `Ref SUB-19744 · logged by ${rm}`] }
    //   : { t: "Mandate confirmed", d: "Mar 12", detail: ["Mandate documents countersigned", "Filed with compliance"] },
    // { t: "Mandate amended", d: "Feb 20", detail: [`${c.mandate} limits revised`, "Signed by client & RM"] },
    // { t: "Address updated", d: "Feb 02", detail: ["Registered address changed", "Re-verified against proof of address"] },
  ];
}

/* ---- Model size & fee catalog — subscription entry form / onboarding modal */
export const MODEL_SIZES: Record<string, number> = {
  "Global Balanced": 100000,
  "Equity Growth": 150000,
  "Income Core": 100000,
  "ESG Tilt": 80000,
  "Model A": 120000,
};
export const MODEL_SIZE_LIST = Object.entries(MODEL_SIZES).map(([name, size]) => ({ name, size }));

export type ModelCatalogEntry = { model_id: string; name: string; mgmtFee: string; incentiveFee: string };
export const OB_MODEL_CATALOG: ModelCatalogEntry[] = [
  { model_id: "global-balanced", name: "Global Balanced", mgmtFee: "1.0%", incentiveFee: "10%" },
  { model_id: "equity-growth", name: "Equity Growth", mgmtFee: "1.5%", incentiveFee: "20%" },
  { model_id: "income-core", name: "Income Core", mgmtFee: "0.75%", incentiveFee: "8%" },
  { model_id: "esg-tilt", name: "ESG Tilt", mgmtFee: "0.8%", incentiveFee: "10%" },
];

/* ============================================================
   Client Book — hash-based mock overlay (FE-8)
   Real client ids now come from the DB; these are the fields that
   stay mock-only after the live-data cutover. Any real id hashes
   deterministically onto one of today's 8 canned entries below.
   ============================================================ */
export interface MockOverlay {
  status: string;
  tone: ChipTone;
  mandate: string;
  aum: string;
  renewal: string;
  kyc: string;
  kycTone: ChipTone;
  since: string;
  models: ClientModel[];
  cashValue: string;
  portfolioValue?: string;
  contact: string;
  title: string;
  docs: ClientDoc[];
  history: HistoryEntry[];
}

type OverlayCore = Omit<MockOverlay, "docs" | "history">;

/** The 8 canned overlay entries — same content as today's RM_CLIENTS +
 *  CLIENT_EXTRA combined, minus the DB-backed fields (name/phone/address/
 *  country/etc). Order is stable — hashString(id) % length indexes into it. */
const OVERLAY_ROTATION: readonly OverlayCore[] = RM_CLIENTS.map((c): OverlayCore => {
  const x = CLIENT_EXTRA[c.id] ?? ({} as Partial<ClientExtra>);
  return {
    status: c.status,
    tone: c.tone,
    mandate: c.mandate,
    aum: c.aum,
    renewal: c.renewal,
    kyc: c.kyc,
    kycTone: c.kycTone,
    since: c.since,
    models: x.models ?? [],
    cashValue: x.cashValue || "—",
    portfolioValue: x.portfolioValue,
    contact: c.contact,
    title: c.title,
  };
});

/** FNV-1a 32-bit — deterministic, browser-safe, no dependency. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Used when RM_CLIENTS has no entries to rotate through — keeps callers
 *  (dashboard counts, client-book table) rendering placeholders instead of throwing. */
const EMPTY_OVERLAY: OverlayCore = {
  status: "—", tone: "neutral", mandate: "—", aum: "—", renewal: "—",
  kyc: "—", kycTone: "neutral", since: "—", models: [], cashValue: "—",
  contact: "—", title: "—",
};

/** Stable per-id mock overlay: a real client id always hashes onto the
 *  same rotation entry, so repeated lookups for the same id are identical. */
export function getMockOverlay(id: string): MockOverlay {
  const core = OVERLAY_ROTATION.length
    ? OVERLAY_ROTATION[hashString(id) % OVERLAY_ROTATION.length]
    : EMPTY_OVERLAY;
  return {
    ...core,
    docs: clientDocs(core),
    history: clientHistory(core, core.models),
  };
}
