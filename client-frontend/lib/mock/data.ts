/**
 * Mock data layer — single source of truth for all dummy data.
 *
 * Migration guide (when backend is ready):
 *   1. Replace each MOCK_* constant with a real API response shape.
 *   2. Update MockStoreInit to no longer seed localStorage (or remove it).
 *   3. Update each hook to fetch from the API instead of reading localStorage.
 *   Nothing else in the app needs to change.
 */

// ── Shared types ───────────────────────────────────────────────────────────────

export type KycStatus   = "due" | "processing" | "verified";
export type ActionLevel = "urgent" | "caution" | "primary" | "info" | "neutral";
export type ActionVariant = "filled" | "outline";
export type EventCategory = "Market News" | "Account Reminders" | "Requests";

export interface LatestEvent {
  id: string;
  level: ActionLevel;
  title: string;
  description: string;
  href?: string;
}

export interface AllotmentRequest {
  id: string;
  type: "Allotment" | "Redemption";
  model: string;
  amount: string;
  date: string;
  status: "Processing" | "Completed";
}

// Serialisable event entry — icon resolved at render time via ICON_MAP
export type EventIconType = "trending-up" | "alarm-clock" | "file-text" | "bar-chart" | "shield" | "briefcase";

export interface EventEntry {
  id: string;
  iconType: EventIconType;
  level: ActionLevel;
  title: string;
  time: string;
  description: string;
  category: EventCategory;
  primaryLabel: string;
  primaryVariant: ActionVariant;
  secondaryLabel: string;
}

// ── Defaults written to localStorage on first load ────────────────────────────

export const MOCK_KYC_STATUS: KycStatus = "due";

export const MOCK_LATEST_EVENTS: LatestEvent[] = [
  {
    id: "request-review",
    level: "caution",
    title: "Request Review",
    description: "Redemption request #RR-429 is under review",
  },
  {
    id: "kyc-renewal",
    level: "urgent",
    title: "[Urgent] Compliance Required",
    description: "KYC / AML renewal is approaching in 10 days, upload as soon as possible!",
    href: "/profile#document-verification",
  },
];

// ── Portfolio stats ───────────────────────────────────────────────────────────

export interface PortfolioStats {
  totalValue: string;
  cashBalance: string;
  ytdReturns: string;
  ytdChange: string;
  benchmark: string;
  lastReportDate: string;
}

export const MOCK_PORTFOLIO_STATS: PortfolioStats = {
  totalValue:     "$1,240,500.00",
  cashBalance:    "$85,200.00",
  ytdReturns:     "+12.4%",
  ytdChange:      "+2.5%",
  benchmark:      "8.5% (MSCI)",
  lastReportDate: "31 OCT 2023",
};

// ── Documents ─────────────────────────────────────────────────────────────────

export interface EomReport {
  name: string;
  period: string;
  range: string;
  generated: string;
}

export const MOCK_EOM_REPORTS: EomReport[] = [
  { name: "EOM_Report_Oct_2023.pdf", period: "October 2023",   range: "Oct 1 – Oct 31, 2023", generated: "Nov 01, 2023" },
  { name: "EOM_Report_Sep_2023.pdf", period: "September 2023", range: "Sep 1 – Sep 30, 2023", generated: "Oct 01, 2023" },
  { name: "EOM_Report_Aug_2023.pdf", period: "August 2023",    range: "Aug 1 – Aug 31, 2023", generated: "Sep 01, 2023" },
  { name: "EOM_Report_Jul_2023.pdf", period: "July 2023",      range: "Jul 1 – Jul 31, 2023", generated: "Aug 01, 2023" },
  { name: "EOM_Report_Jun_2023.pdf", period: "June 2023",      range: "Jun 1 – Jun 30, 2023", generated: "Jul 01, 2023" },
  { name: "EOM_Report_May_2023.pdf", period: "May 2023",       range: "May 1 – May 31, 2023", generated: "Jun 01, 2023" },
];

export const MOCK_ALLOTMENT_REQUESTS: AllotmentRequest[] = [
  { id: "#RR-429", type: "Redemption", model: "ESG Impact Growth",       amount: "$12,000.00", date: "Nov 01, 2023", status: "Processing" },
  { id: "#AT-771", type: "Allotment",  model: "Alpha Core 60/40",        amount: "$50,000.00", date: "Oct 12, 2023", status: "Completed"  },
  { id: "#RR-765", type: "Redemption", model: "ESG Impact Growth",       amount: "$12,000.00", date: "Oct 08, 2023", status: "Completed"  },
  { id: "#AT-760", type: "Allotment",  model: "Alpha Core 60/40",        amount: "$25,000.00", date: "Oct 24, 2023", status: "Processing" },
  { id: "#AT-754", type: "Allotment",  model: "Institutional Bond Core", amount: "$15,000.00", date: "Sep 28, 2023", status: "Completed"  },
  { id: "#RR-749", type: "Redemption", model: "Global Tech Growth",      amount: "$8,500.00",  date: "Sep 15, 2023", status: "Completed"  },
  { id: "#AT-742", type: "Allotment",  model: "Diversified Real Estate", amount: "$10,000.00", date: "Sep 02, 2023", status: "Completed"  },
];

// ── Portfolio ─────────────────────────────────────────────────────────────────

export type RiskLevel = "High" | "Medium" | "Low";

export interface AllottedModel {
  name: string;
  symbol: string;
  country: string;
  sector: string;
  amount: string;
  weight: string;
  multiplier: string;
}

export interface AvailableModel {
  name: string;
  assetClass: string;
  symbol: string;
  country: string;
  sector: string;
  modelLimit: string;
  risk: RiskLevel;
  minInvestment: string;
}

export const MOCK_ALLOTTED_MODELS: AllottedModel[] = [
  { name: "Model A", symbol: "AC60", country: "USA",    sector: "Medical Healthcare",   amount: "$774,072.00", weight: "62.4%", multiplier: "1.0x" },
  { name: "Model B", symbol: "ESGI", country: "Global", sector: "Sustainable Tech",      amount: "$466,428.00", weight: "37.6%", multiplier: "1.0x" },
  { name: "Model C", symbol: "GLIN", country: "Global", sector: "Global Infrastructure", amount: "$120,000.00", weight: "9.7%",  multiplier: "1.0x" },
  { name: "Model D", symbol: "TDIS", country: "USA/CN", sector: "Tech Disruptors",       amount: "$95,000.00",  weight: "7.6%",  multiplier: "1.2x" },
];

export const MOCK_AVAILABLE_MODELS: AvailableModel[] = [
  { name: "Global Tech Growth",      assetClass: "Equity",       symbol: "GTGR", country: "Global", sector: "Technology",   modelLimit: "$500,000",   risk: "High",   minInvestment: "$10,000"  },
  { name: "Institutional Bond Core", assetClass: "Fixed Income", symbol: "IBCO", country: "USA",    sector: "Fixed Income", modelLimit: "$2,000,000", risk: "Low",    minInvestment: "$50,000"  },
  { name: "Diversified Real Estate", assetClass: "Real Assets",  symbol: "DVRE", country: "USA",    sector: "Real Estate",  modelLimit: "$1,000,000", risk: "Medium", minInvestment: "$25,000"  },
  { name: "Emerging Markets Alpha",  assetClass: "Equity",       symbol: "EMAA", country: "Global", sector: "Equities",     modelLimit: "$750,000",   risk: "High",   minInvestment: "$15,000"  },
  { name: "Fixed Income Plus",       assetClass: "Fixed Income", symbol: "FIXP", country: "USA",    sector: "Fixed Income", modelLimit: "$3,000,000", risk: "Low",    minInvestment: "$100,000" },
];

// ── Events ────────────────────────────────────────────────────────────────────

export const MOCK_EVENT_ITEMS: EventEntry[] = [
  {
    id:             "event-fed-rate",
    iconType:       "trending-up",
    level:          "primary",
    title:          "Fed Interest Rate Decision Released",
    time:           "2 hours ago",
    description:    "The Federal Reserve has announced its latest interest rate decision, impacting market volatility and portfolio yields. Historical news and reminders relevant to the client are now updated in your dashboard.",
    category:       "Market News",
    primaryLabel:   "Read Full Report",
    primaryVariant: "outline",
    secondaryLabel: "Mark as Read",
  },
  {
    id:             "event-kyc-reminder",
    iconType:       "alarm-clock",
    level:          "urgent",
    title:          "KYC Upload Reminder",
    time:           "5 hours ago",
    description:    "Your annual renewal for KYC document is due in next 10 days. Please ensure recent compliance documents are uploaded to avoid processing delays.",
    category:       "Account Reminders",
    primaryLabel:   "Go Upload",
    primaryVariant: "filled",
    secondaryLabel: "Mark as Read",
  },
  {
    id:             "event-compliance-policy",
    iconType:       "file-text",
    level:          "neutral",
    title:          "New Compliance Policy Update",
    time:           "Yesterday",
    description:    "We have updated our institutional AML declaration protocols to align with new regional regulations. Review the changes to ensure your account remains compliant.",
    category:       "Account Reminders",
    primaryLabel:   "Review Policy",
    primaryVariant: "outline",
    secondaryLabel: "Dismiss",
  },
  {
    id:             "event-tech-rebound",
    iconType:       "bar-chart",
    level:          "primary",
    title:          "Market Insight: Tech Sector Rebound",
    time:           "Oct 18, 2023",
    description:    "Our analysts have released a new brief on the projected growth of the technology sector following the latest earnings reports from major providers.",
    category:       "Market News",
    primaryLabel:   "View Insight",
    primaryVariant: "outline",
    secondaryLabel: "Mark as Read",
  },
  {
    id:             "event-security-alert",
    iconType:       "shield",
    level:          "caution",
    title:          "Security Alert: New Login Detected",
    time:           "Oct 17, 2023",
    description:    "A new login was detected from a Chrome browser on macOS. If this was not you, please secure your account immediately by changing your password.",
    category:       "Account Reminders",
    primaryLabel:   "Manage Devices",
    primaryVariant: "outline",
    secondaryLabel: "I recognize this",
  },
];

// ── localStorage key registry ─────────────────────────────────────────────────
// Centralised so key strings are never duplicated across files.

export const STORE_KEYS = {
  kycStatus:           "kyc_status",
  latestEvents:        "latest_events",
  allotmentRequests:   "allotment_requests",
  eventItems:          "event_items",
  requestCounter:      "request_counter",
  redemptionCounter:   "redemption_counter",
} as const;
