/* ============================================================
   PC — allocation-matrix data-access SEAM + DTO→view mapper

   `loadAllocation()` reads the purgeable mock until FE-6 swaps the
   screen onto `useAllocation()`; then the mock is deleted.

   `mapDtoToAllocationView` is the permanent DTO→view mapper:
   structural shaping + formatting only — all aggregates
   (colUnits, colFund, totalFund, count) arrive precomputed from BE-5;
   the mapper assembles them into the same AllocationView method interface
   that screens already consume. No math is recomputed here.
   ============================================================ */

import {
  ALLOC,
  ALLOC_CLIENTS,
  ALLOC_MODELS,
  PERIODS,
} from "@/lib/mock/pc-data";
import type {
  AllocationCell,
  AllocationClient,
  AllocationDTO,
  AllocationMap,
  AllocationModel,
  Period,
} from "./types";

export interface AllocationView {
  models: AllocationModel[];
  clients: AllocationClient[];
  liveModels: AllocationModel[];
  periods: Period[];
  openPeriod: string;
  modelById(id: string): AllocationModel | undefined;
  clientById(id: string): AllocationClient | undefined;
  cell(cid: string, mid: string): AllocationCell | undefined;
  /** units × model size (0 if no cell or unknown model). */
  cellFund(cid: string, mid: string): number;
  colUnits(mid: string): number;
  colFund(mid: string): number;
  /** Sum of colFund over LIVE models. */
  totalFund(): number;
  /** # of (client, live-model) pairs with a cell. */
  count(): number;
}

/* ---- Mock loader (deleted with the mock in FE-6) ----------- */

/**
 * THE allocation entry point against the mock. Replaced by useAllocation() in FE-6.
 */
export function loadAllocation(): AllocationView {
  const models: AllocationModel[] = ALLOC_MODELS;
  const clients: AllocationClient[] = ALLOC_CLIENTS;
  const alloc: AllocationMap = ALLOC;
  const periods: Period[] = PERIODS;

  const liveModels = models.filter((m) => m.live);
  const openPeriod = periods.find((p) => p.status === "open")?.label ?? "";

  const modelById = (id: string): AllocationModel | undefined =>
    models.find((m) => m.id === id);
  const clientById = (id: string): AllocationClient | undefined =>
    clients.find((c) => c.id === id);
  const cell = (cid: string, mid: string): AllocationCell | undefined =>
    alloc[`${cid}-${mid}`];

  const cellFund = (cid: string, mid: string): number => {
    const c = cell(cid, mid);
    const m = modelById(mid);
    return c && m ? c.units * m.size : 0;
  };
  const colUnits = (mid: string): number =>
    clients.reduce((n, c) => n + (cell(c.id, mid)?.units ?? 0), 0);
  const colFund = (mid: string): number =>
    clients.reduce((n, c) => n + cellFund(c.id, mid), 0);
  const totalFund = (): number =>
    liveModels.reduce((n, m) => n + colFund(m.id), 0);
  const count = (): number =>
    clients.reduce(
      (n, c) => n + liveModels.filter((m) => cell(c.id, m.id)).length,
      0,
    );

  return {
    models,
    clients,
    liveModels,
    periods,
    openPeriod,
    modelById,
    clientById,
    cell,
    cellFund,
    colUnits,
    colFund,
    totalFund,
    count,
  };
}

/* ---- DTO→view mapper --------------------------------------- */

/**
 * Map the backend AllocationDTO to the AllocationView interface.
 * Structural shaping only — all aggregates arrive precomputed from BE-5;
 * methods close over the precomputed maps, no re-derivation.
 */
export function mapDtoToAllocationView(dto: AllocationDTO): AllocationView {
  const models: AllocationModel[] = dto.models.map((m) => ({
    id: m.id,
    name: m.name,
    size: m.model_size,
    live: m.live,
  }));

  const clients: AllocationClient[] = dto.clients.map((c) => ({
    id: c.id,
    name: c.name,
    code: c.code,
    acct: c.ib_account,
  }));

  const alloc: AllocationMap = {};
  for (const [key, cell] of Object.entries(dto.cells)) {
    alloc[key] = { units: cell.units };
  }

  const periods: Period[] = dto.periods.map((p) => ({
    id: p.id,
    label: p.label,
    status: p.status,
  }));

  const openPeriod =
    dto.periods.find((p) => p.id === dto.open_period_id)?.label ?? "";

  const liveModels = models.filter((m) => m.live);

  // Precomputed lookups from BE-5 — no re-summation.
  const colUnitsMap: Record<string, number> = {};
  const colFundMap: Record<string, number> = {};
  for (const m of dto.models) {
    colUnitsMap[m.id] = m.col_units;
    colFundMap[m.id] = m.col_fund;
  }

  const modelById = (id: string): AllocationModel | undefined =>
    models.find((m) => m.id === id);
  const clientById = (id: string): AllocationClient | undefined =>
    clients.find((c) => c.id === id);
  const cell = (cid: string, mid: string): AllocationCell | undefined =>
    alloc[`${cid}-${mid}`];

  const cellFund = (cid: string, mid: string): number =>
    dto.cells[`${cid}-${mid}`]?.fund ?? 0;

  return {
    models,
    clients,
    liveModels,
    periods,
    openPeriod,
    modelById,
    clientById,
    cell,
    cellFund,
    colUnits: (mid) => colUnitsMap[mid] ?? 0,
    colFund: (mid) => colFundMap[mid] ?? 0,
    totalFund: () => dto.total_fund,
    count: () => dto.count,
  };
}
