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
export type EventCategory = "Market News" | "Account Notification" | "Requests Status" | "Others";

export interface LatestEvent {
  id: string;
  level: ActionLevel;
  title: string;
  description: string;
  href?: string;
}

export interface AllotmentRequest {
  id: string;
  type: "Allotment" | "Redemption" | "Others";
  model: string;   // subject line for "Others" tickets
  amount: string;  // "—" for "Others" tickets
  date: string;
  status: "Sent" | "Received" | "Processing" | "Fulfilled";
  subject?: string; // free-text subject, "Others" tickets only
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
    id: "signature-required",
    level: "urgent",
    title: "Signature Required",
    description: "Redemption request #RR-429 requires authorization by EOD.",
    href: "/portfolio",
  },
  {
    id: "compliance-review",
    level: "caution",
    title: "Compliance Review",
    description: "Quarterly KYC update has been received and is under review.",
  },
  {
    id: "kyc-verified",
    level: "info",
    title: "KYC Verified",
    description: "Your identity documents have been successfully verified.",
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
  { id: "#AT-771", type: "Allotment",  model: "Alpha Core 60/40",        amount: "$50,000.00", date: "Oct 12, 2023", status: "Fulfilled"  },
  { id: "#RR-765", type: "Redemption", model: "ESG Impact Growth",       amount: "$12,000.00", date: "Oct 08, 2023", status: "Fulfilled"  },
  { id: "#OT-044", type: "Others",     model: "General Inquiry",          amount: "—",          date: "Oct 24, 2023", status: "Fulfilled",  subject: "Account Rebalancing Query" },
  { id: "#AT-760", type: "Allotment",  model: "Alpha Core 60/40",        amount: "$25,000.00", date: "Oct 24, 2023", status: "Received"   },
  { id: "#AT-754", type: "Allotment",  model: "Institutional Bond Core", amount: "$15,000.00", date: "Sep 28, 2023", status: "Fulfilled"  },
  { id: "#RR-749", type: "Redemption", model: "Global Tech Growth",      amount: "$8,500.00",  date: "Sep 15, 2023", status: "Fulfilled"  },
  { id: "#AT-742", type: "Allotment",  model: "Diversified Real Estate", amount: "$10,000.00", date: "Sep 02, 2023", status: "Fulfilled"  },
  { id: "#OT-038", type: "Others",     model: "Document Request",         amount: "—",          date: "Aug 28, 2023", status: "Fulfilled",  subject: "Request for Q2 Performance Report" },
  { id: "#RR-731", type: "Redemption", model: "Fixed Income Plus",       amount: "$5,000.00",  date: "Aug 14, 2023", status: "Fulfilled"  },
  { id: "#AT-728", type: "Allotment",  model: "Emerging Markets Alpha",  amount: "$20,000.00", date: "Jul 30, 2023", status: "Fulfilled"  },
  { id: "#OT-021", type: "Others",     model: "General Inquiry",          amount: "—",          date: "Jul 10, 2023", status: "Fulfilled",  subject: "Questionnaire — Risk Appetite Update" },
];

// ── Portfolio ─────────────────────────────────────────────────────────────────

export type RiskLevel = "High" | "Medium" | "Low";

export interface SubscribedModel {
  name: string;
  symbol: string;
  country: string;
  sector: string;
  amount: string;
  multiplier: string;
  modelLimit: string;   // e.g. "$2,000,000"
  ibAccount: string;    // Interactive Brokers account number
}

export interface RecommendedModel {
  name: string;
  assetClass: string;
  symbol: string;
  country: string;
  sector: string;
  modelLimit: string;
  risk: RiskLevel;
  minInvestment: string;
}

export const MOCK_SUBSCRIBED_MODELS: SubscribedModel[] = [
  { name: "Model A", symbol: "AC60", country: "USA",    sector: "Medical Healthcare",   amount: "$774,072.00", multiplier: "1.0x", modelLimit: "$2,000,000", ibAccount: "U4829301" },
  { name: "Model B", symbol: "ESGI", country: "Global", sector: "Sustainable Tech",      amount: "$466,428.00", multiplier: "1.0x", modelLimit: "$1,500,000", ibAccount: "U4829302" },
  { name: "Model C", symbol: "GLIN", country: "Global", sector: "Global Infrastructure", amount: "$120,000.00", multiplier: "1.0x", modelLimit: "$1,000,000", ibAccount: "U4829303" },
  { name: "Model D", symbol: "TDIS", country: "USA/CN", sector: "Tech Disruptors",       amount: "$95,000.00",  multiplier: "1.2x", modelLimit: "$750,000",   ibAccount: "U4829304" },
];

export const MOCK_RECOMMENDED_MODELS: RecommendedModel[] = [
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
    category:       "Account Notification",
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
    category:       "Account Notification",
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
    category:       "Account Notification",
    primaryLabel:   "Manage Devices",
    primaryVariant: "outline",
    secondaryLabel: "I recognize this",
  },
  {
    id:             "event-annual-review",
    iconType:       "file-text",
    level:          "info",
    title:          "Annual Portfolio Review Scheduled",
    time:           "Oct 10, 2023",
    description:    "Your annual portfolio review has been scheduled with your Relationship Manager for next month. A calendar invitation will be sent to your registered email address.",
    category:       "Others",
    primaryLabel:   "Acknowledge",
    primaryVariant: "outline",
    secondaryLabel: "Mark as Read",
  },
];

// ── RM contact ────────────────────────────────────────────────────────────────

export interface RmContact {
  name: string;
  email: string;
  whatsappNumber: string; // formatted display, e.g. "+1 (555) 982-4610"
}

export const MOCK_RM_CONTACT: RmContact = {
  name:            "Sarah Mitchell",
  email:           "sarah.mitchell@megaanuum.com",
  whatsappNumber:  "+1 (555) 982-4610",
};

// ── Profile info ───────────────────────────────────────────────────────────────

export interface ProfileInfo {
  fullName:            string;
  company:             string;
  occupation:          string;
  residentialAddress:  string;
  locationOfResidence: string;
}

export const DEFAULT_PROFILE_INFO: ProfileInfo = {
  fullName:            "Alex Thompson",
  company:             "Thompson Global Holdings",
  occupation:          "Chief Executive Officer",
  residentialAddress:  "123 Maple Avenue, Suite 400",
  locationOfResidence: "New York, NY, USA",
};

// ── Supporting documents ───────────────────────────────────────────────────────

export type SupportingDocStatus = "not_uploaded" | "processing" | "verified";

export interface SupportingDoc {
  id: string;
  category: string;   // "Questionnaire" | "Others" | future categories
  filename: string;
  status: SupportingDocStatus;
  submittedDate: string;
}

// Categories available in the upload modal dropdown.
// Keep as a plain array so new entries can be added without touching the modal.
export const SUPPORTING_DOC_CATEGORIES = ["Questionnaire", "Others"] as const;
export type SupportingDocCategory = (typeof SUPPORTING_DOC_CATEGORIES)[number];

// ── Legal / reference documents ────────────────────────────────────────────────

export interface LegalDocument {
  name:        string;
  description: string;
  filename:    string;
  category:    string;
}

export const MOCK_LEGAL_DOCUMENTS: LegalDocument[] = [
  { name: "Fund Prospectus",                 description: "Full disclosure document for the Global Opportunities Fund.",              filename: "Fund_Prospectus.pdf",                category: "Fund Documents"   },
  { name: "Risk Disclosure Statement",       description: "Key risks associated with investment strategies managed by Megaanuum.",     filename: "Risk_Disclosure.pdf",                category: "Fund Documents"   },
  { name: "Investment Management Agreement", description: "Governing agreement between client and Megaanuum Asset Management.",       filename: "IMA.pdf",                            category: "Legal Agreements" },
  { name: "Terms of Service",               description: "Terms governing access to and use of the client portal.",                   filename: "Terms_of_Service.pdf",               category: "Legal Agreements" },
  { name: "Privacy Policy",                 description: "How we collect, use, and protect your personal data.",                     filename: "Privacy_Policy.pdf",                 category: "Legal Agreements" },
  { name: "Anti-Money Laundering Policy",   description: "AML compliance framework, client obligations, and reporting procedures.",  filename: "AML_Policy.pdf",                     category: "Compliance"       },
  { name: "Suitability Assessment Guide",   description: "Framework used to assess investor suitability and risk tolerance.",        filename: "Suitability_Assessment.pdf",         category: "Compliance"       },
  { name: "Fee Schedule",                   description: "Management, performance, and administrative fee structure.",               filename: "Fee_Schedule.pdf",                   category: "Fund Documents"   },
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
  otherCounter:        "other_counter",
  profileInfo:         "profile_info",
  supportingDocs:      "supporting_docs",
} as const;
