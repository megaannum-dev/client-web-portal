// THROWAWAY MOCK — delete on API integration. Imported ONLY by lib/pc/models.ts and lib/pc/allocation.ts.
/* ============================================================
   MegaCRM — PC (Portfolio Commander) purgeable mock dataset

   This is the ONLY file in the PC workspace that holds mock
   values. It conforms to the PERMANENT domain types in
   `@/lib/pc/types`; the data-access seams (`lib/pc/models.ts`,
   `lib/pc/allocation.ts`) are the ONLY modules that import it.

   PURGEABILITY: when the API lands, delete this file and repoint
   the two seams at the backend fetch. That swap touches NOTHING
   else — no component and no type changes, because screens bind to
   the seam signatures and `@/lib/pc/types` only, never to this
   mock. Values here are ported verbatim from the MegaCRM prototype
   (PCData.jsx / AllocationMatrix.jsx); do not edit the numbers.
   ============================================================ */

import type {
  AllocationClient,
  AllocationMap,
  AllocationModel,
  Model,
  Period,
} from "@/lib/pc/types";

/* ---- Model book (Model Management) ------------------------- */

export const PC_MODELS: Model[] = [
  {
    id: "mA",
    name: "Model A",
    size: 100000000,
    manager: "Wilson Capital",
    intro: "01 Jan 2020",
    symbols: ["AAPL", "MSFT", "NVDA", "TSLA"],
    mgmt: 1.0,
    incentive: 20,
    status: "live",
    version: "v2",
    materials: [
      { file: "ModelA_Marketing_v2.pdf", ver: "v2", date: "2026-02-10", size: "2.4 MB" },
      { file: "ModelA_Marketing_v1.pdf", ver: "v1", date: "2025-12-01", size: "2.1 MB" },
    ],
    changes: [
      { date: "2026-02-10", user: "Wilson", change: "Updated performance numbers and fee example", ver: "v2" },
      { date: "2025-12-01", user: "Marketing", change: "Initial materials uploaded", ver: "v1" },
    ],
  },
  {
    id: "mB",
    name: "Model B",
    size: 50000000,
    manager: "Wilson Capital",
    intro: "01 Jul 2021",
    symbols: ["JNJ", "LLY", "ABBV"],
    mgmt: 0.9,
    incentive: 15,
    status: "live",
    version: "v1",
    materials: [{ file: "ModelB_Marketing_v1.pdf", ver: "v1", date: "2025-09-15", size: "1.8 MB" }],
    changes: [{ date: "2025-09-15", user: "Marketing", change: "Initial materials uploaded", ver: "v1" }],
  },
  {
    id: "mC",
    name: "Model C",
    size: 25000000,
    manager: "Wilson Capital",
    intro: "01 Apr 2024",
    symbols: ["XOM"],
    mgmt: 0.75,
    incentive: 10,
    status: "live",
    version: "v1",
    materials: [{ file: "ModelC_Marketing_v1.pdf", ver: "v1", date: "2026-01-20", size: "1.5 MB" }],
    changes: [{ date: "2026-01-20", user: "Marketing", change: "Initial materials uploaded", ver: "v1" }],
  },
  {
    id: "mD",
    name: "Model D",
    size: 15000000,
    manager: "Wilson Capital",
    intro: "—",
    symbols: ["GLD", "SLV"],
    mgmt: 0.8,
    incentive: 12,
    status: "draft",
    version: "—",
    materials: [],
    changes: [],
  },
];

/* ---- Allocation matrix ------------------------------------- */

export const ALLOC_MODELS: AllocationModel[] = [
  { id: "mA", name: "Model A", size: 1000000, live: true },
  { id: "mB", name: "Model B", size: 1000000, live: true },
  { id: "mC", name: "Model C", size: 500000, live: true },
  { id: "mD", name: "Model D", size: 0, live: false },
];

export const ALLOC_CLIENTS: AllocationClient[] = [
  { id: "cA", name: "Client A", code: "AC-1042", acct: "U-7101" },
  { id: "cB", name: "Client B", code: "AC-1088", acct: "U-7148" },
  { id: "cC", name: "Client C", code: "AC-1130", acct: "U-7190" },
  { id: "cD", name: "Client D", code: "AC-1175", acct: "U-7235" },
  { id: "cE", name: "Client E", code: "AC-1206", acct: "U-7266" },
];

export const ALLOC: AllocationMap = {
  "cA-mA": { units: 1 },
  "cA-mB": { units: 2 },
  "cB-mA": { units: 5 },
  "cB-mB": { units: 2 },
  "cB-mC": { units: 4 },
  "cC-mB": { units: 20 },
  "cC-mC": { units: 1 },
  "cD-mA": { units: 1 },
  "cD-mC": { units: 3 },
  "cE-mA": { units: 1 },
  "cE-mB": { units: 1 },
  "cE-mC": { units: 1 },
};

/* ---- Allocation periods ------------------------------------ */

export const PERIODS: Period[] = [
  { label: "Aug 2026", status: "open" },
  { label: "Jul 2026", status: "confirmed" },
  { label: "Jun 2026", status: "confirmed" },
  { label: "May 2026", status: "confirmed" },
  { label: "Apr 2026", status: "confirmed" },
];
