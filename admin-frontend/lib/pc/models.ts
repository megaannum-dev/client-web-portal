/* ============================================================
   PC — model-book data-access SEAM + fee math

   data-access seam — flip this file to the API later; components
   never import the mock.

   Today `loadModels()` reads the purgeable mock (`@/lib/mock/pc-data`,
   landed by F2); tomorrow it fetches the backend and deserializes
   into `Model[]`. No component changes either way — screens bind to
   `loadModels()` / `modelById()` and the types in `./types` only.
   ============================================================ */

import { PC_MODELS } from "@/lib/mock/pc-data";
import type { FeeBreakdown, Model } from "./types";

/** THE model-book entry point. Every screen reads the book through this. */
export function loadModels(): Model[] {
  return PC_MODELS;
}

/** Convenience lookup of a single model by id. */
export function modelById(id: string): Model | undefined {
  return loadModels().find((m) => m.id === id);
}

/* ---- Formatters -------------------------------------------- */

/** `1000000` → `"$1,000,000"`. */
export function fmtMoney(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

/** Compact money: `$X.XM` / `$Xk` / `$X` (exact PCData.jsx semantics). */
export function fmtMoneyShort(v: number): string {
  if (v >= 1e6) {
    const x = v / 1e6;
    return "$" + (x % 1 === 0 ? x : x.toFixed(1)) + "M";
  }
  if (v >= 1e3) {
    const x = v / 1e3;
    return "$" + Math.round(x) + "k";
  }
  return "$" + v;
}

/* ---- Fee math ---------------------------------------------- */

/**
 * Compute management + incentive fees for a model given a performance
 * figure and hurdle (both whole-number percentages). Exact formula from
 * PCData.jsx:
 *   mgmtFee = (mgmt/100) × notional
 *   excess  = max(perf − hurdle, 0)
 *   incFee  = (incentive/100) × (excess/100) × notional
 *   total   = mgmtFee + incFee
 */
export function computeFees(m: Model, perf: number, hurdle: number): FeeBreakdown {
  const mgmtFee = (m.mgmt / 100) * m.notional;
  const excess = Math.max(perf - hurdle, 0);
  const incFee = (m.incentive / 100) * (excess / 100) * m.notional;
  return { mgmtFee, incFee, total: mgmtFee + incFee, excess };
}
