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
  { label: "Wilson Lee", code: "MEGA-2156" },
];

export const IG_MANDATES: string[] = [
  "Discretionary · Growth",
  "Discretionary · Balanced",
  "Advisory · Income",
  "Advisory · Growth",
];

export const IG_SEED: InvestmentGuideline[] = [
  { id: "ig1", client: "Wilson Lee", code: "MEGA-2156", ref: "IG-2026-001", name: "—", mandate: "—",
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
