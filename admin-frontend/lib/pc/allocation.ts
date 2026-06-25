/* ============================================================
   PC — allocation-matrix data-access SEAM + derived view

   data-access seam — flip this file to the API later; components
   never import the mock.

   `loadAllocation()` returns an `AllocationView` that bundles the
   loaded data AND every derived helper as a method, so screens never
   recompute allocation math. Today it reads the purgeable mock
   (`@/lib/mock/pc-data`, landed by F2); tomorrow it fetches the
   backend and assembles the same view. No component changes either way.

   Derived-math semantics match PCData.jsx exactly:
     - account fund = units × the model's PER-UNIT size
     - column totals sum over clients
     - total fund sums colFund over LIVE models only
     - count = # of (client, live-model) pairs that have a cell
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

/**
 * THE allocation entry point. Builds the derived view over the loaded
 * data so screens bind to methods, never to raw helpers or the mock.
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
