/* ============================================================
   PC (Portfolio Commander) — domain type layer (backend-aligned)

   These types are the PERMANENT layer of the PC workspace. Field
   names and shapes mirror the eventual backend columns: when the
   API lands, its payload deserializes straight into these and the
   data-access seams (`lib/pc/models.ts`, `lib/pc/allocation.ts`)
   flip from the mock to a fetch — with ZERO changes to types or
   components.

   The throwaway mock dataset (`lib/mock/pc-data`) does NOT survive
   the move to the API; THESE TYPES DO. Screens depend on types +
   seam signatures only — never on the mock.
   ============================================================ */

/* ---- Model book (Model Management) ------------------------- */

/** A marketing / reference document attached to a model, versioned. */
export interface Material {
  file: string;
  ver: string;
  date: string;
  size: string;
}

/** One audit-trail entry in a model's change history. */
export interface ChangeEntry {
  date: string;
  user: string;
  change: string;
  ver: string;
}

/** Lifecycle state of a model. */
export type ModelStatus = "live" | "draft";

/**
 * A trading model in the model book. `size` is the model size (the
 * total figure shown in the book; the allocation matrix carries a
 * per-unit size); `mgmt` / `incentive` are fee percentages (whole
 * numbers, e.g. 1.0 = 1%, 20 = 20%).
 */
export interface Model {
  id: string;
  name: string;
  size: number;
  manager: string;
  intro: string;
  symbols: string[];
  mgmt: number;
  incentive: number;
  status: ModelStatus;
  version: string;
  materials: Material[];
  changes: ChangeEntry[];
}

/** Fee figures derived from a model (see `computeFees`). */
export interface FeeBreakdown {
  mgmtFee: number;
  incFee: number;
  total: number;
  excess: number;
}

/* ---- Allocation matrix ------------------------------------- */

/**
 * A model as it appears in the allocation matrix. `size` here is the
 * PER-UNIT model size (account fund = units × size). Models do NOT
 * carry an IB account — the IB account is a property of the client
 * (see `AllocationClient.acct`), and every allocation a client holds
 * trades through that single account.
 */
export interface AllocationModel {
  id: string;
  name: string;
  size: number;
  live: boolean;
}

/**
 * A client (row) in the allocation matrix. `acct` is the client's one
 * IB account — ALL of this client's model allocations trade through it.
 */
export interface AllocationClient {
  id: string;
  name: string;
  code: string;
  acct: string;
}

/** One cell of the allocation matrix: the unit multiplier (input). */
export interface AllocationCell {
  units: number;
}

/** Sparse allocation grid keyed `"${clientId}-${modelId}"`. */
export type AllocationMap = Record<string, AllocationCell>;

/** Whether an allocation period is editable or frozen. */
export type PeriodStatus = "open" | "locked";

/** One allocation period (e.g. a month). */
export interface Period {
  label: string;
  status: PeriodStatus;
}
