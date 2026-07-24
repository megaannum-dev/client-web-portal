// PURGEABLE — prototype seed data, no backend. Replace with server layer when wiring.
//
// Ported from the hi-fi prototype (pc-app/InvestmentGuideline.jsx). The PC
// uploads per-client investment guideline documents here; Compliance
// receives them read-only on their side (components/compliance/review).

export type GuidelineStatus = "active" | "pending";

export interface InvestmentGuideline {
  id: string;
  client: string;
  code: string;
  ref: string;
  name: string;
  mandate: string;
  effective: string;
  uploaded: string;
  file: string;
  status: GuidelineStatus;
  version: number;
}

export const IG_CLIENTS: { label: string; code: string }[] = [
  { label: "Marcus Chen", code: "MEGA-2044" },
  { label: "Thomas Berg", code: "MEGA-2071" },
  { label: "Aiko Tanaka", code: "MEGA-2119" },
  { label: "Wilson Lee", code: "MEGA-2156" },
  { label: "Elena Vasquez", code: "MEGA-2183" },
];

export const IG_MANDATES: string[] = [
  "Discretionary · Growth",
  "Discretionary · Balanced",
  "Advisory · Income",
  "Advisory · Growth",
];

export const IG_SEED: InvestmentGuideline[] = [
  { id: "ig1", client: "Marcus Chen", code: "MEGA-2044", ref: "IG-2026-001", name: "Global Growth Mandate — IPS 2026", mandate: "Discretionary · Growth",
    effective: "01 Aug 2026", uploaded: "11 Jul 2026", file: "IG_MEGA-2044_v1.pdf", status: "active", version: 1 },
  { id: "ig2", client: "Thomas Berg", code: "MEGA-2071", ref: "IG-2026-002", name: "Fixed Income Guideline — IPS 2026", mandate: "Advisory · Income",
    effective: "20 Jul 2026", uploaded: "09 Jul 2026", file: "IG_MEGA-2071_v2.pdf", status: "active", version: 2 },
  { id: "ig3", client: "Aiko Tanaka", code: "MEGA-2119", ref: "IG-2026-003", name: "Multi-Asset Discretionary Guideline", mandate: "Discretionary · Balanced",
    effective: "15 Jul 2026", uploaded: "08 Jul 2026", file: "IG_MEGA-2119_v1.pdf", status: "active", version: 1 },
  { id: "ig4", client: "Wilson Lee", code: "MEGA-2156", ref: "IG-2026-004", name: "—", mandate: "—",
    effective: "—", uploaded: "—", file: "", status: "pending", version: 0 },
];

export interface GuidelineUploadInput {
  client: string;
  code: string;
  name: string;
  mandate: string;
  effective: string;
  fileName: string;
}

const fmtUploadDate = (): string =>
  new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

/** Applies an upload (new guideline or new version of `existing`) to `rows`, matching the prototype's `handleUpload`. */
export function applyGuidelineUpload(
  rows: InvestmentGuideline[],
  existing: InvestmentGuideline | null,
  data: GuidelineUploadInput,
): InvestmentGuideline[] {
  if (existing) {
    return rows.map((g) =>
      g.id === existing.id
        ? {
            ...g,
            version: g.version + 1,
            name: data.name,
            mandate: data.mandate,
            effective: data.effective,
            uploaded: fmtUploadDate(),
            file: `IG_${g.code}_v${g.version + 1}.pdf`,
            status: "active" as const,
          }
        : g,
    );
  }
  const newId = `ig${rows.length + 1}`;
  const ref = `IG-2026-${String(rows.length + 1).padStart(3, "0")}`;
  return [
    ...rows,
    {
      id: newId,
      client: data.client,
      code: data.code,
      ref,
      name: data.name,
      mandate: data.mandate,
      effective: data.effective,
      uploaded: fmtUploadDate(),
      file: `IG_${data.code}_v1.pdf`,
      status: "active",
      version: 1,
    },
  ];
}
