// THROWAWAY MOCK — delete on API integration. Imported ONLY by lib/mobo/commissions.ts.
/* ============================================================
   MegaCRM — MOBO commission / settlement purgeable mock dataset
   Fee period: May 2026

   Self-contained CLIENT x MODEL roster reconstructed from the
   design handoff (mobo/mobo-app/MoboCommissions.jsx's FEE_TERMS,
   mobo/mobo-app/MoboRecon.jsx's CLIENT_META / ALLOC_UNITS). This
   is a SEPARATE small roster from `lib/mobo/allocation.ts`'s real
   per-client-IB-account model — do not merge the two.

   `lib/mobo/commissions.ts` is the ONLY module that imports this
   file; components bind to `loadCommissions()` / `loadSettlement()`,
   never here.
   ============================================================ */

export const FEE_MONTH = "May 2026";

/* ---- deterministic noise (ported verbatim from MoboCommissions.jsx) ---- */
export function cmHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}

export function cmRand(s: string): number {
  let a = cmHash(s) | 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/* ---- model roster (id, name, master IB account, subscription terms) ---- */
export interface PtaModel {
  id: string;
  name: string;
  acct: string;
  aum: number;
  mgmtBps: number;
  incPct: number;
}

export const PTA_MODELS: PtaModel[] = [
  { id: "mA", name: "Model A", acct: "IB-8801", aum: 96_000_000, mgmtBps: 100, incPct: 20 },
  { id: "mB", name: "Model B", acct: "IB-8802", aum: 204_000_000, mgmtBps: 85, incPct: 15 },
  { id: "mC", name: "Model C", acct: "IB-8803", aum: 43_500_000, mgmtBps: 120, incPct: 20 },
];

/* ---- client roster ------------------------------------------------- */
export interface PtaClient {
  id: string;
  name: string;
  accCode: string;
}

export const PTA_CLIENTS: PtaClient[] = [
  { id: "cA", name: "Ardent Capital", accCode: "ARD-4471" },
  { id: "cB", name: "Strathmore Fund", accCode: "STR-2298" },
  { id: "cC", name: "Vela Holdings", accCode: "VEL-6650" },
  { id: "cD", name: "Northbridge LP", accCode: "NOR-3312" },
  { id: "cE", name: "Selwyn Asset Mgmt", accCode: "SEL-8809" },
];

/* ---- allocation units, [modelId][clientId] (ported from MoboRecon.jsx's
   ALLOC_UNITS, regrouped by model) ---- */
export const PTA_UNITS: Record<string, Record<string, number>> = {
  mA: { cA: 1, cB: 5, cD: 1, cE: 1 },
  mB: { cA: 2, cB: 2, cC: 20, cE: 1 },
  mC: { cB: 4, cC: 1, cD: 3, cE: 1 },
};
