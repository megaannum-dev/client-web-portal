/* ============================================================
   MegaCRM — RM demo data (ported from the design handoff Data.jsx)
   All data is mock; no backend wiring.
   ============================================================ */
import type { ChipTone } from "@/components/ui/Chip";

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

export type SummaryItem = { id: string; c: string; d?: string; s?: string; t: ChipTone };

/** Count-only row for the Open Requests card (dot + label + number, no navigation). */
export type CountItem = { id: string; c: string; n: number; t: "primary" | "muted" };

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
  // },
  // northbridge: {
  //   address: "8 Finsbury Circus\nLondon EC2M 7EA",
  //   country: "United Kingdom", clientId: "MEGA-0613", phone: "+44 20 7946 0318", cashValue: "$1.62M",
  //   models: [
  //     { name: "Income Core", status: "Active", tone: "active", account: "IB-3310", notes: "Monthly income" },
  //     { name: "Global Balanced", status: "Pending", tone: "pending", account: "IB-3310", notes: "Allotment scheduled" },
  //   ],
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

export type ClientDoc = { name: string; status: string; tone: ChipTone; icon: string };

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

export type HistoryEntry = { t: string; d: string; accent?: boolean; detail?: string[] };

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

export type ClientDetail = {
  address: string;
  country: string;
  clientId: string;
  phone: string;
  portfolioValue: string;
  cashValue: string;
  models: ClientModel[];
  docs: ClientDoc[];
  history: HistoryEntry[];
};

/** Resolve full detail for a client id; returns null if unknown. */
export function getClientDetail(id: string): { client: RmClient; detail: ClientDetail } | null {
  const c = RM_CLIENTS.find((x) => x.id === id);
  if (!c) return null;
  const x = CLIENT_EXTRA[c.id] ?? ({} as Partial<ClientExtra>);
  const models = x.models ?? [];
  return {
    client: c,
    detail: {
      address: x.address || "—",
      country: x.country || "—",
      clientId: x.clientId || "MEGA-" + c.id.slice(0, 4).toUpperCase(),
      phone: x.phone || "—",
      portfolioValue: x.portfolioValue || c.aum,
      cashValue: x.cashValue || "—",
      models,
      docs: clientDocs(c),
      history: clientHistory(c, models),
    },
  };
}

/* ============================================================
   Model Subscription — client → models → transactions
   ============================================================ */
export type TxnRow = [string, string, string, string, string, string, string, string, string];
export type SubModel = {
  name: string;
  status: string;
  tone: ChipTone;
  mgmtFee: string;
  incentiveFee: string;
  account: string;
  rows: TxnRow[];
};
export type SubClient = {
  id: string;
  name: string;
  initials: string;
  mandate: string;
  aum: string;
  models: SubModel[];
};

export const SUB_CLIENTS: SubClient[] = [
  {
    id: "ardent", name: "Ardent Capital", initials: "AC", mandate: "Discretionary", aum: "$42.1M",
    models: [
      { name: "Global Balanced", status: "Active", tone: "active", mgmtFee: "1.0%", incentiveFee: "10%", account: "IB-4471",
        rows: [
          ["Allotment",  "01/01/2026", "IB-4471", "USD", "180,000",  "2×",  "200,000",  "25/12/2025", "—"],
          ["Redemption", "01/03/2026", "IB-4471", "USD", "(80,000)", "−1×", "(100,000)", "—", "01/03/2026"],
          ["Net",        "",           "",         "",    "100,000",  "1×",  "100,000",  "",  ""],
        ],
      },
      { name: "Model A", status: "Active", tone: "active", mgmtFee: "1.25%", incentiveFee: "15%", account: "IB-4471",
        rows: [
          ["Allotment", "15/02/2026", "IB-4471", "USD", "120,000", "2×", "240,000", "10/02/2026", "—"],
          ["Net",       "",           "",         "",    "120,000", "2×", "240,000", "",           ""],
        ],
      },
      { name: "ESG Tilt", status: "In Review", tone: "review", mgmtFee: "0.8%", incentiveFee: "10%", account: "IB-5582",
        rows: [
          ["Allotment", "28/05/2026", "IB-5582", "USD", "80,000", "2×", "160,000", "25/05/2026", "—"],
          ["Net",       "",           "",         "",    "80,000", "2×", "160,000", "",           ""],
        ],
      },
    ],
  },
  {
    id: "vela", name: "Vela Holdings", initials: "VH", mandate: "Discretionary", aum: "$31.4M",
    models: [
      { name: "Global Balanced", status: "Active", tone: "active", mgmtFee: "1.0%", incentiveFee: "10%", account: "IB-2204",
        rows: [
          ["Allotment",  "01/11/2025", "IB-2204", "USD", "300,000",   "3×",  "900,000",   "28/10/2025", "—"],
          ["Redemption", "01/04/2026", "IB-2204", "USD", "(100,000)", "−1×", "(300,000)", "—", "01/04/2026"],
          ["Net",        "",           "",         "",    "200,000",   "2×",  "600,000",   "",  ""],
        ],
      },
      { name: "Equity Growth", status: "Active", tone: "active", mgmtFee: "1.5%", incentiveFee: "20%", account: "IB-2204",
        rows: [
          ["Allotment", "15/01/2026", "IB-2204", "USD", "150,000", "2×", "300,000", "12/01/2026", "—"],
          ["Net",       "",           "",         "",    "150,000", "2×", "300,000", "",           ""],
        ],
      },
      { name: "Income Core", status: "Active", tone: "active", mgmtFee: "0.75%", incentiveFee: "8%", account: "IB-2255",
        rows: [
          ["Allotment", "01/03/2026", "IB-2255", "USD", "100,000", "2×", "200,000", "26/02/2026", "—"],
          ["Net",       "",           "",         "",    "100,000", "2×", "200,000", "",           ""],
        ],
      },
      { name: "ESG Tilt", status: "Active", tone: "active", mgmtFee: "0.8%", incentiveFee: "10%", account: "IB-2255",
        rows: [
          ["Allotment", "01/02/2026", "IB-2255", "USD", "50,000", "1×", "50,000", "28/01/2026", "—"],
          ["Net",       "",           "",         "",    "50,000", "1×", "50,000", "",           ""],
        ],
      },
    ],
  },
  {
    id: "northbridge", name: "Northbridge LP", initials: "NL", mandate: "Advisory", aum: "$18.9M",
    models: [
      { name: "Income Core", status: "Pending", tone: "pending", mgmtFee: "0.75%", incentiveFee: "8%", account: "IB-3310",
        rows: [
          ["Allotment", "15/06/2026", "IB-3310", "USD", "200,000", "2×", "400,000", "12/06/2026", "—"],
          ["Net",       "",           "",         "",    "200,000", "2×", "400,000", "",           ""],
        ],
      },
      { name: "Global Balanced", status: "Pending", tone: "pending", mgmtFee: "1.0%", incentiveFee: "10%", account: "IB-3310",
        rows: [
          ["Allotment", "01/07/2026", "IB-3310", "USD", "150,000", "2×", "300,000", "28/06/2026", "—"],
          ["Net",       "",           "",         "",    "150,000", "2×", "300,000", "",           ""],
        ],
      },
    ],
  },
  {
    id: "selwyn", name: "Selwyn Asset Mgmt", initials: "SA", mandate: "Discretionary", aum: "$27.3M",
    models: [
      { name: "Global Balanced", status: "Active", tone: "active", mgmtFee: "1.0%", incentiveFee: "10%", account: "IB-6620",
        rows: [
          ["Allotment",  "01/08/2025", "IB-6620", "CHF", "250,000",  "2×",    "500,000",   "28/07/2025", "—"],
          ["Redemption", "01/01/2026", "IB-6620", "CHF", "(50,000)", "−0.5×", "(100,000)", "—", "02/01/2026"],
          ["Net",        "",           "",         "",    "200,000",  "1.5×",  "400,000",   "",  ""],
        ],
      },
      { name: "Equity Growth", status: "Active", tone: "active", mgmtFee: "1.5%", incentiveFee: "20%", account: "IB-6620",
        rows: [
          ["Allotment", "15/03/2026", "IB-6620", "CHF", "100,000", "2×", "200,000", "12/03/2026", "—"],
          ["Net",       "",           "",         "",    "100,000", "2×", "200,000", "",           ""],
        ],
      },
      { name: "ESG Tilt", status: "Active", tone: "active", mgmtFee: "0.8%", incentiveFee: "10%", account: "IB-6655",
        rows: [
          ["Allotment", "10/03/2026", "IB-6655", "CHF", "100,000", "1×", "100,000", "07/03/2026", "—"],
          ["Net",       "",           "",         "",    "100,000", "1×", "100,000", "",           ""],
        ],
      },
    ],
  },
  {
    id: "coalfield", name: "Coalfield & Co.", initials: "CC", mandate: "Discretionary", aum: "$9.7M",
    models: [
      { name: "Global Balanced", status: "Active", tone: "active", mgmtFee: "1.0%", incentiveFee: "10%", account: "IB-1190",
        rows: [
          ["Allotment", "01/06/2025", "IB-1190", "AUD", "100,000", "2×", "200,000", "28/05/2025", "—"],
          ["Net",       "",           "",         "",    "100,000", "2×", "200,000", "",           ""],
        ],
      },
      { name: "Model A", status: "Overdue", tone: "overdue", mgmtFee: "1.25%", incentiveFee: "15%", account: "IB-1190",
        rows: [
          ["Allotment", "01/09/2025", "IB-1190", "AUD", "80,000", "2×", "160,000", "28/08/2025", "—"],
          ["Net",       "",           "",         "",    "80,000", "2×", "160,000", "",           ""],
        ],
      },
    ],
  },
  {
    id: "pike", name: "Pike & Vance", initials: "PV", mandate: "Discretionary", aum: "$22.6M",
    models: [
      { name: "Global Balanced", status: "Active", tone: "active", mgmtFee: "1.0%", incentiveFee: "10%", account: "IB-9012",
        rows: [
          ["Allotment", "15/04/2025", "IB-9012", "USD", "220,000", "2×", "440,000", "12/04/2025", "—"],
          ["Net",       "",           "",         "",    "220,000", "2×", "440,000", "",           ""],
        ],
      },
      { name: "Income Core", status: "Active", tone: "active", mgmtFee: "0.75%", incentiveFee: "8%", account: "IB-9012",
        rows: [
          ["Allotment", "01/09/2025", "IB-9012", "USD", "180,000", "2×", "360,000", "28/08/2025", "—"],
          ["Net",       "",           "",         "",    "180,000", "2×", "360,000", "",           ""],
        ],
      },
    ],
  },
];

/** Ids that have a full Client Detail page (present in RM_CLIENTS). */
export const KNOWN_CLIENT_IDS = new Set(RM_CLIENTS.map((c) => c.id));

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
   Request Tickets — client-raised inbox (RM acts on the client's
   behalf). NOTE: unrelated to REQUEST_TICKETS above (CountItem[],
   feeds the dashboard rail card) — this is the full ticket list
   behind the dedicated Request Tickets page.
   ============================================================ */
export type RequestTicket = {
  ref: string;
  client: string;
  contact: string;
  email: string;
  model?: string;
  account: string;
  type: "Allotment" | "Redemption" | "Other";
  ccy: string;
  cash: string;
  mult: string;
  notional: string;
  date: string;
  status: string;
  tone: ChipTone;
  subject?: string;
  message: string;
};

export const TICKET_QUEUE: RequestTicket[] = [
  // { ref: "REQ-2048", client: "Ardent Capital", contact: "Marcus Lindqvist", email: "m.lindqvist@ardentcap.com", model: "Global Balanced", account: "IB-4471", type: "Allotment", ccy: "USD", cash: "180,000", mult: "2×", notional: "360,000", date: "Jun 06", status: "New", tone: "warm",
  //   message: "Please allot a further USD 180,000 to our Global Balanced model at the standard 2× multiple ahead of the quarterly rebalance. Target settlement by mid-June." },
  // { ref: "REQ-2047", client: "Vela Holdings", contact: "Priya Nandakumar", email: "priya.n@velaholdings.com", model: "Equity Growth", account: "IB-2204", type: "Allotment", ccy: "USD", cash: "150,000", mult: "2×", notional: "300,000", date: "Jun 05", status: "New", tone: "warm",
  //   message: "Top up Equity Growth by USD 150,000 from the cash we wired Tuesday." },
  // { ref: "REQ-2045", client: "Selwyn Asset Mgmt", contact: "Tom Brockway", email: "tbrockway@selwynam.ch", model: "Global Balanced", account: "IB-6620", type: "Redemption", ccy: "CHF", cash: "(50,000)", mult: "−0.5×", notional: "(100,000)", date: "Jun 04", status: "In Progress", tone: "review",
  //   message: "Redeem CHF 50,000 from Global Balanced to fund an end-of-quarter distribution to our underlying client." },
  // { ref: "REQ-2044", client: "Northbridge LP", contact: "Helen Asari", email: "h.asari@northbridge.com", model: "Income Core", account: "IB-3310", type: "Allotment", ccy: "USD", cash: "200,000", mult: "2×", notional: "400,000", date: "Jun 04", status: "New", tone: "warm",
  //   message: "New allotment of USD 200,000 to Income Core, please." },
  // { ref: "REQ-2041", client: "Coalfield & Co.", contact: "Derek Mwangi", email: "derek@coalfield.com.au", account: "IB-1190", type: "Other", subject: "Update authorised signatory", ccy: "—", cash: "—", mult: "—", notional: "—", date: "Jun 03", status: "In Progress", tone: "review",
  //   message: "We've appointed a new CFO, Sarah Quinn, who should replace David Pell as authorised signatory across all our mandates. Could you advise what documentation you need from us to make the change?" },
  // { ref: "REQ-2038", client: "Pike & Vance", contact: "Owen Pike", email: "owen.pike@pikevance.com", model: "Income Core", account: "IB-9012", type: "Redemption", ccy: "USD", cash: "(80,000)", mult: "−1×", notional: "(80,000)", date: "Jun 02", status: "Closed", tone: "neutral",
  //   message: "Redeem USD 80,000 from Income Core." },
  // { ref: "REQ-2035", client: "Vela Holdings", contact: "Priya Nandakumar", email: "priya.n@velaholdings.com", account: "IB-2255", type: "Other", subject: "Fee schedule clarification", ccy: "—", cash: "—", mult: "—", notional: "—", date: "Jun 01", status: "Replied", tone: "active",
  //   message: "Could you confirm whether the incentive fee on ESG Tilt is charged on a high-water-mark basis, and when it crystallises?" },
  // { ref: "REQ-2031", client: "Meridian Trust", contact: "Anita Cole", email: "acole@meridiantrust.ca", model: "Income Core", account: "IB-7781", type: "Allotment", ccy: "CAD", cash: "120,000", mult: "1×", notional: "120,000", date: "May 30", status: "Declined", tone: "overdue",
  //   message: "Allot CAD 120,000 to Income Core." },
];

/** A ticket still needs RM attention (mirrors RequestTickets.tsx's isClosed). */
const isOpenTicket = (t: RequestTicket) =>
  t.status !== "Closed" && t.status !== "Declined" && t.status !== "Replied";

/** Open Requests card — count of still-open tickets per type, from TICKET_QUEUE. */
export const REQUEST_TICKETS: CountItem[] = [
  { id: "allotment", c: "Allotment", n: TICKET_QUEUE.filter((t) => t.type === "Allotment" && isOpenTicket(t)).length, t: "primary" },
  { id: "redemption", c: "Redemption", n: TICKET_QUEUE.filter((t) => t.type === "Redemption" && isOpenTicket(t)).length, t: "primary" },
  { id: "others", c: "Others", n: TICKET_QUEUE.filter((t) => t.type === "Other" && isOpenTicket(t)).length, t: "muted" },
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
