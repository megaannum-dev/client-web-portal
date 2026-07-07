/* ============================================================
   PC — model-book data-access SEAM + DTO→view mapper

   `loadModels()` reads the purgeable mock until FE-6 swaps the
   screens onto `useModels()`; then the mock is deleted. Components
   never import the mock directly.

   `mapDtoToModel` / `mapDtoToModels` are the permanent DTO→view
   mappers: structural shaping only, no derivation (all aggregates
   arrive precomputed from BE-5).

   Formatters and fee math live in `./format` — import them from
   there directly.
   ============================================================ */

import type { ChangeEntry, Material, MaterialDTO, Model, ModelDTO, ModelsListDTO, SymbolDTO } from "./types";

/* Hardcoded fee rates per 006 (`pc-workspace-006-decisions`):
   fees are NOT stored on the model — they are 2% / 20% across the board
   until per-client overrides land. */
const DEFAULT_MGMT_PCT = 2;
const DEFAULT_INCENTIVE_PCT = 20;

/* ---- DTO→view mappers -------------------------------------- */

function mapChangeEntry(c: ModelDTO["changes"][number]): ChangeEntry {
  return {
    kind: c.kind,
    detail: c.detail ?? {},
    user: c.actor,
    ver: c.version,
    date: c.created_at,
  };
}

/** Normalize backend `symbols` — an array of `SymbolDTO` objects.
 *  Stays defensive: accepts plain string arrays too, in case an older cached
 *  response comes through (treated as active). */
function normalizeSymbols(s: unknown): SymbolDTO[] {
  if (!Array.isArray(s)) return [];
  return s
    .map((it): SymbolDTO | null => {
      if (typeof it === "string") return it ? { symbol: it, weight: null, active: true } : null;
      const o = it as Partial<SymbolDTO> | null | undefined;
      return o?.symbol ? { symbol: o.symbol, weight: o.weight ?? null, active: o.active !== false } : null;
    })
    .filter((x): x is SymbolDTO => x !== null);
}

/** Map a single backend model DTO to the view `Model` type. */
export function mapDtoToModel(dto: Partial<ModelDTO> & { id: string; name: string }): Model {
  const symbols = normalizeSymbols(dto.symbols);
  return {
    id: dto.id,
    name: dto.name,
    size: Number(dto.model_size ?? 0),
    category: dto.category ?? [],
    subscription_redemption: dto.subscription_redemption ?? null,
    symbols: symbols.filter((s) => s.active !== false).map((s) => s.symbol),
    symbolBook: symbols.map((s) => ({ symbol: s.symbol, active: s.active !== false })),
    symbolAudit: (dto.symbol_audit ?? []).map((a) => ({
      symbol: a.symbol,
      op: a.op,
      note: a.note,
      user: a.actor ?? "—",
      date: a.created_at,
      ver: a.version ?? "—",
    })),
    mgmt: dto.mgmt_fee ?? DEFAULT_MGMT_PCT,
    incentive: dto.incentive_fee ?? DEFAULT_INCENTIVE_PCT,
    status: (dto.status ?? "draft") as Model["status"],
    version: dto.version ?? "—",
    materials: dto.materials ?? [],
    changes: (dto.changes ?? []).map(mapChangeEntry),
    description: dto.description ?? null,
    underlyings: dto.underlyings ?? null,
    risk: dto.risk ?? null,
    liquidity: dto.liquidity ?? null,
    reporting: dto.reporting ?? null,
    nav_perf: dto.nav_perf ?? null,
    mgmt_fee: dto.mgmt_fee ?? null,
    incentive_fee: dto.incentive_fee ?? null,
  };
}

/** Map the models-list DTO to `Model[]`. */
export function mapDtoToModels(dto: ModelsListDTO | null | undefined): Model[] {
  if (!dto) return [];
  const list = Array.isArray(dto.models) ? dto.models : [];
  return list.map(mapDtoToModel);
}

/** Human file size: 2_600_000 → "2.6 MB". */
function fmtFileSize(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return "—";
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`;
  return `${bytes} B`;
}

/** Map a backend MaterialDTO to the view `Material` (`v1`, `YYYY-MM-DD`, `2.6 MB`). */
export function mapDtoToMaterial(m: MaterialDTO): Material {
  return {
    id: m.id,
    file: m.filename,
    ver: m.version,
    date: (m.created_at ?? "").slice(0, 10),
    size: fmtFileSize(m.size_bytes),
  };
}
