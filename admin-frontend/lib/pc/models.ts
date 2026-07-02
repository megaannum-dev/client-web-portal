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

import type { ChangeEntry, Material, MaterialDTO, Model, ModelDTO, ModelsListDTO } from "./types";

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

/** Normalize backend `symbols` (may be null, list, or {tickers:[...]} dict). */
function normalizeSymbols(s: unknown): string[] {
  if (Array.isArray(s)) return s as string[];
  if (s && typeof s === "object" && Array.isArray((s as { tickers?: unknown }).tickers)) {
    return (s as { tickers: string[] }).tickers;
  }
  return [];
}

/** Map a single backend model DTO to the view `Model` type. */
export function mapDtoToModel(dto: Partial<ModelDTO> & { id: string; name: string }): Model {
  return {
    id: dto.id,
    name: dto.name,
    size: Number(dto.model_size ?? 0),
    manager: dto.manager ?? "",
    intro: dto.intro ?? "—",
    symbols: normalizeSymbols(dto.symbols),
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
