/* ============================================================
   PC — model-book data-access SEAM + DTO→view mapper

   `loadModels()` reads the purgeable mock until FE-6 swaps the
   screens onto `useModels()`; then the mock is deleted. Components
   never import the mock directly.

   `mapDtoToModel` / `mapDtoToModels` are the permanent DTO→view
   mappers: structural shaping only, no derivation (all aggregates
   arrive precomputed from BE-5).

   Formatters and fee math live in `./format` and are re-exported
   here so screens keep importing from `lib/pc/*`.
   ============================================================ */

import { PC_MODELS } from "@/lib/mock/pc-data";
import type { ChangeEntry, Model, ModelDTO, ModelsListDTO } from "./types";

/* ---- Re-export presentation helpers from format.ts --------- */
export { fmtMoney, fmtMoneyShort, computeFees } from "./format";

/* ---- Mock loader (deleted with the mock in FE-6) ----------- */

/** THE model-book entry point against the mock. Replaced by useModels() in FE-6. */
export function loadModels(): Model[] {
  return PC_MODELS;
}

/** Convenience lookup of a single model by id. */
export function modelById(id: string): Model | undefined {
  return loadModels().find((m) => m.id === id);
}

/* ---- DTO→view mappers -------------------------------------- */

function mapChangeEntry(c: ModelDTO["changes"][number]): ChangeEntry {
  return {
    kind: c.kind,
    detail: c.detail,
    user: c.actor,
    ver: c.version,
    date: c.date,
  };
}

/** Map a single backend model DTO to the view `Model` type. */
export function mapDtoToModel(dto: ModelDTO): Model {
  return {
    id: dto.id,
    name: dto.name,
    size: dto.model_size,
    manager: dto.manager,
    intro: dto.intro,
    symbols: dto.symbols,
    mgmt: dto.mgmt_fee,
    incentive: dto.incentive_fee,
    status: dto.status,
    version: dto.version,
    materials: dto.materials,
    changes: dto.changes.map(mapChangeEntry),
  };
}

/** Map the models-list DTO to `Model[]`. */
export function mapDtoToModels(dto: ModelsListDTO): Model[] {
  return dto.models.map(mapDtoToModel);
}
