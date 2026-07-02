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
  /** Backend material UUID — present once loaded from the server; needed for download. */
  id?: string;
  file: string;
  ver: string;
  date: string;
  size: string;
}

/** Raw material DTO from the backend (GET /api/pc/models/{id}/materials). */
export interface MaterialDTO {
  id: string;
  model_id: string;
  filename: string;
  version: string;
  size_bytes: number | null;
  content_type: string | null;
  uploaded_by: string | null;
  created_at: string;
}

/** One audit-trail entry in a model's change history (view shape). */
export interface ChangeEntry {
  kind: ModelChangeKind;
  detail: Record<string, unknown>;
  user: string;
  ver: string;
  date: string;
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
  // Prospectus / fee fields (from DB B-1b)
  description: string | null;
  underlyings: string | null;
  risk: string | null;
  liquidity: string | null;
  reporting: string | null;
  nav_perf: string | null;
  mgmt_fee: number | null;       // null → use DEFAULT_MGMT_PCT fallback
  incentive_fee: number | null;  // null → use DEFAULT_INCENTIVE_PCT fallback
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

/** Whether an allocation period is editable or confirmed/frozen. */
export type PeriodStatus = "open" | "confirmed";

/** One allocation period (e.g. a month). */
export interface Period {
  /** Backend-assigned period UUID; present once the API is wired. */
  id?: string;
  label: string;
  status: PeriodStatus;
  confirmed_at?: string | null;
  confirmed_by?: string | null;
}

/* ---- Transport DTOs (backend payload shapes) --------------- */

/** Discriminant for change-log entries returned by the API. */
export type ModelChangeKind = "created" | "published" | "material_uploaded" | "edited";

/** Raw change-log entry from the backend. Mapped to `ChangeEntry` by FE-5. */
export interface ChangeEntryDTO {
  kind: ModelChangeKind;
  detail: Record<string, unknown>;
  actor: string;
  version: string;
  created_at: string;
}

/** Backend payload for a single model (GET /api/pc/models/:id and list). */
export interface ModelDTO {
  id: string;
  name: string;
  model_size: number;
  manager: string;
  intro: string;
  symbols: string[];
  status: "live" | "draft";
  version: string;
  materials: { file: string; ver: string; date: string; size: string }[];
  changes: ChangeEntryDTO[];
  // New fields from DB B-1b (all nullable until backend populates them)
  description?: string | null;
  underlyings?: string | null;
  risk?: string | null;
  liquidity?: string | null;
  reporting?: string | null;
  nav_perf?: string | null;
  mgmt_fee?: number | null;
  incentive_fee?: number | null;
}

/** Backend payload for GET /api/pc/models. */
export interface ModelsListDTO {
  models: ModelDTO[];
}

/** One cell in the allocation matrix as returned by the backend. */
export interface AllocationCellDTO {
  units: number;
  /** Precomputed: units × model_size (BE-5). */
  fund: number;
}

/** One model column in the allocation matrix payload. */
export interface AllocationModelDTO {
  id: string;
  name: string;
  model_size: number;
  live: boolean;
  /** Sum of units across all clients (precomputed, BE-5). */
  col_units: number;
  /** Sum of fund across all clients (precomputed, BE-5). */
  col_fund: number;
}

/** One client row in the allocation matrix payload. */
export interface AllocationClientDTO {
  id: string;
  name: string;
  code: string;
  ib_account: string;
}

/** Backend payload for a single period. */
export interface PeriodDTO {
  id: string;
  label: string;
  status: "open" | "confirmed";
}

/** Backend payload for GET /api/pc/allocation. All aggregates precomputed by BE-5. */
export interface AllocationDTO {
  models: AllocationModelDTO[];
  clients: AllocationClientDTO[];
  /** Sparse grid keyed `"${clientId}-${modelId}"`. */
  cells: Record<string, AllocationCellDTO>;
  /** Sum of col_fund over live models (precomputed, BE-5). */
  total_fund: number;
  /** # of (client, live-model) pairs with a cell (precomputed, BE-5). */
  count: number;
  periods: PeriodDTO[];
  open_period_id: string;
}

/** Backend payload for GET /api/pc/periods. */
export interface PeriodsListDTO {
  periods: PeriodDTO[];
}
