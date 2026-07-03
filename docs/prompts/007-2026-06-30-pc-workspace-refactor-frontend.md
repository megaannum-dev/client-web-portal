# 007 — PC Workspace Refactor: Frontend Layer (Layer 3) — Orchestrator Prompt

> **Date:** 2026-06-30
> **Branch:** current git branch (detect at startup with `git rev-parse --abbrev-ref HEAD`)
> **Layer scope:** Frontend only (`admin-frontend/`). Database migrations (Layer 1) and backend service restructuring (Layer 2) are **out of scope for this session**.
> **Proposal source:** `api-backend/docs/proposals/007-2026-06-30-pc-workspace-refactor.md`, Layer 3 section.

---

## Backend prerequisite note

The following backend route changes (proposal Layer 2, section D) **must be deployed** before certain frontend features function end-to-end:

| Backend change | Affects frontend feature |
|---|---|
| D-1: `PATCH /models/{id}` with `{status}` replaces `POST /publish` and `DELETE` | Feature 5 (endpoint constants), Feature 6 (mutation hooks), Feature 8 (page refactor) |
| D-2: `GET /allocation/periods` dropped; `PeriodOut` folded into `/allocation` response | Feature 5 (delete `getPeriods`), Feature 6 (`useAllocation`) |
| D-3: `PATCH /allocation/periods/{id}` with `{status:'confirmed'}` replaces `POST /confirm` | Feature 5 (endpoint constants), Feature 6 (`useAllocation`) |
| D-4: `GET /models/{id}?include=materials,changes` compound endpoint | Feature 6 (`useModelDetail` new hook) |
| DB B-1b: 8 new columns on `models` | Feature 4 (types), Feature 10 (UI) |

The **frontend changes in this prompt are structurally self-contained** — they compile and type-check without the backend changes being deployed. Features 5, 6, and 10 will be inert or partially functional until the corresponding backend lands.

---

## Role

You are the **orchestrator** for this session. You do not edit files directly. You delegate all implementation to sub-agents using the Agent tool. You wait for each phase to complete before starting the next phase. You spawn two final agents (validation + testing) after all implementation phases complete.

**First action:** run `git rev-parse --abbrev-ref HEAD` to capture `WORKING_BRANCH`.
Pass this to every sub-agent. You work exclusively on `WORKING_BRANCH`. Do not push.

---

## Environment

- **Repo root:** `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal\`
- **Frontend root:** `C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal\admin-frontend\`
- **Shell:** PowerShell primary (Bash also available for POSIX scripts)
- **OS:** Windows 11
- **Node/npm:** standard; run from `admin-frontend\` directory
- **TypeScript check:** `npx tsc --noEmit` from `admin-frontend\`

---

## Reference pattern for `actions.ts`

Canonical shape from `Megaannum-Frontend/src/app/(tms)/bank-reconciliation/actions.ts`:

```ts
"use server";

import { someServerFn } from "@/server/pc";
import { logger } from "@/lib/logger";

export async function doThing(body: SomeType): Promise<APIResponse<SomeDTO> | APIErrorResponse> {
  try {
    logger.log("🔄 Doing thing…");
    const response = await someServerFn(body);
    logger.json("✅ Do-thing response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error doing thing:", { error });
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
```

Key rules:
- `"use server"` directive at the top
- Each exported function: `try { logger.log + server call + logger.json } catch { return {success:false, error:...} }`
- Import from `@/server/pc` (not `@/app/(roles)/pc/.../action`)
- Return type: `Promise<APIResult<T>>` (using the `APIResult` type already exported from `@/server/pc/index.ts`)

---

## Features

### Feature 1 — Action tier (A-1)

**Proposal refs:** Layer 3, A-1

**What this does:**
- Rename `action.ts` → `actions.ts` (note: the `"use server"` directive is already present in the originals; keep it)
- Rewrite both files with try/catch + `logger.log`/`logger.json` envelopes per the reference pattern above
- All currently-exported function names stay identical

**Files to DELETE:**
- `admin-frontend/app/(roles)/pc/model-management/action.ts`
- `admin-frontend/app/(roles)/pc/allocation-matrix/action.ts`

**Files to CREATE:**

`admin-frontend/app/(roles)/pc/model-management/actions.ts`:
```
"use server";
imports from @/server/pc and @/lib/logger
exports (all with try/catch + logger pattern):
  getModels()
  getModel(id: string)
  createModel(body: Record<string, unknown>)
  updateModel(id: string, body: Record<string, unknown>)
  publishModel(id: string)
  getMaterials(id: string)
  uploadMaterial(id: string, formData: FormData)
  deleteModel(id: string)
  downloadMaterial(modelId: string, materialId: string)
  getChanges(id: string)
```

`admin-frontend/app/(roles)/pc/allocation-matrix/actions.ts`:
```
"use server";
imports from @/server/pc and @/lib/logger
exports (all with try/catch + logger pattern):
  getPeriods()
  getAllocation(period?: string, etag?: string)
  confirmPeriod(id: string)
```

**Import path updates required:** Any file that currently imports from `@/app/(roles)/pc/model-management/action` must be updated to import from `@/app/(roles)/pc/model-management/actions`. Same for allocation-matrix. At this stage, the consumers are:
- `admin-frontend/hooks/api/useModels.ts` — imports `getModels` from the old `action`
- `admin-frontend/hooks/api/useAllocation.ts` — imports `getAllocation` from the old `action`
- `admin-frontend/app/(roles)/pc/model-management/page.tsx` — imports 7 action functions
- `admin-frontend/app/(roles)/pc/allocation-matrix/page.tsx` — imports `confirmPeriod`

Update all four import sites to point to the new `actions` (plural) path.

**Sub-agent instruction:** Read each of the four existing files before editing. Delete the two old `action.ts` files. Create the two new `actions.ts` files. Update the four import sites. `git add` and `git commit` with message: `feat(pc): rename action.ts → actions.ts; add try/catch + logger envelopes`.

---

### Feature 2 — Component extraction: model-management (A-3a)

**Proposal refs:** Layer 3, A-3

**What this does:** Extract the 11 in-file components from `model-management/page.tsx` into individual files under `admin-frontend/components/pc/model-management/`. The page.tsx is NOT rewritten in this feature — only the components are moved. Import statements in page.tsx are updated.

**Files to CREATE** (one component per file):

| File | Component(s) to extract |
|---|---|
| `admin-frontend/components/pc/model-management/CardGrid.tsx` | `ModelCard` + `CardGrid` |
| `admin-frontend/components/pc/model-management/ModelTable.tsx` | `ModelTr` + `ModelTable` (including `TH_BASE` constant) |
| `admin-frontend/components/pc/model-management/ModelDetailPanel.tsx` | `ModelDetailPanel` |
| `admin-frontend/components/pc/model-management/OverviewTab.tsx` | `FactGrid` (rename export to `OverviewTab` — the panel calls it `FactGrid` today but the target component name is `OverviewTab`) |
| `admin-frontend/components/pc/model-management/MaterialsTab.tsx` | `MaterialsTab` + `fmtBytes` helper |
| `admin-frontend/components/pc/model-management/ChangesTab.tsx` | `ChangesTab` |
| `admin-frontend/components/pc/model-management/CreateModelForm.tsx` | `CreateField` + `NewModelDraft` interface + `CreateModelForm` + `MANAGER_OPTIONS` constant |
| `admin-frontend/components/pc/model-management/EditModelForm.tsx` | `EditModelForm` (also needs `CreateField`, `MANAGER_OPTIONS`, `fmtMoney` — import `CreateField` from `./CreateModelForm`, `MANAGER_OPTIONS` from `./CreateModelForm`, `fmtMoney` from `@/lib/pc/format`) |
| `admin-frontend/components/pc/model-management/CalcModal.tsx` | `CalcModal` |

Each extracted file must:
- Have `"use client"` if it uses React hooks or event handlers
- Import all dependencies it needs (icons, Button, Chip, Shared components, types, formatters)
- Export its primary component as a named export

**Prop interfaces to keep intact:** The existing prop shapes for each component must not change. Any inline type defined inside the component in page.tsx (e.g., `NewModelDraft`) should be exported from its new file so other files can import it.

**page.tsx after extraction:** Replace all in-file component definitions with import statements from `@/components/pc/model-management/*`. The local type declarations (`Layout`, `Tab`) stay in page.tsx. The `isoToday` helper can stay in page.tsx or move to a shared util — do not delete it. The `handleCreate`, `handlePublish`, `handleDelete`, `handleDuplicate`, `handleUploadMaterial`, `handleDownloadMaterial` handlers and all page-level state stay in page.tsx at this stage (they will be moved in Feature 8).

**Sub-agent instruction:** Read `admin-frontend/app/(roles)/pc/model-management/page.tsx` fully before starting. Create the 9 component files. Update page.tsx imports. Do NOT restructure handlers or state — only move the component definitions. `git add` and `git commit` with message: `refactor(pc): extract model-management in-file components to components/pc/model-management/`.

---

### Feature 3 — Component extraction: allocation-matrix (A-3b)

**Proposal refs:** Layer 3, A-3

**What this does:** Extract the 8 in-file components from `allocation-matrix/page.tsx` into individual files under `admin-frontend/components/pc/allocation-matrix/`. The `handleConfirm` handler and all page-level state stay in page.tsx.

**Files to CREATE:**

| File | Component(s) to extract |
|---|---|
| `admin-frontend/components/pc/allocation-matrix/StatStrip.tsx` | `StatStrip` |
| `admin-frontend/components/pc//allocation-matrix/PeriodPicker.tsx` | `PeriodPicker` |
| `admin-frontend/components/pc/allocation-matrix/ViewToggle.tsx` | `ViewToggle` + `Toggle` type |
| `admin-frontend/components/pc/allocation-matrix/HowToRead.tsx` | `HowToRead` + `LABEL` constant |
| `admin-frontend/components/pc/allocation-matrix/Matrix.tsx` | `Matrix` + `MatrixCell` + `TH` constant + `LABEL` constant (if not already in HowToRead) |
| `admin-frontend/components/pc/allocation-matrix/DetailPanel.tsx` | `DetailPanel` |
| `admin-frontend/components/pc/allocation-matrix/ConfirmModal.tsx` | `ConfirmModal` |
| `admin-frontend/components/pc/allocation-matrix/EmptyPeriod.tsx` | `EmptyPeriod` |

Notes:
- `LABEL` is used in both `StatStrip`/`PeriodPicker` and `HowToRead`/`Matrix`. Export it from one file (e.g., `HowToRead.tsx` or a `constants.ts`) and import in the others.
- `Toggle` type is `"units" | "pct"` — export from `ViewToggle.tsx`.
- `Coord` interface (`{ cid: string; mid: string }`) is page-local state shape — keep in page.tsx.
- Each file that uses the `AllocationView` interface must import it from `@/lib/pc/allocation`.

**page.tsx after extraction:** Replace in-file component definitions with imports. The `handleConfirm` handler, state (`periodLabel`, `view`, `open`, `confirmModal`, `justConfirmed`), and derived values (`LATEST`, `OPEN`, `period`, `selectedStatus`, `confirmed`, `historical`) stay in page.tsx at this stage.

**Sub-agent instruction:** Read `admin-frontend/app/(roles)/pc/allocation-matrix/page.tsx` fully before starting. Create the 8 component files. Update page.tsx imports. Do NOT restructure handlers or state. `git add` and `git commit` with message: `refactor(pc): extract allocation-matrix in-file components to components/pc/allocation-matrix/`.

---

### Feature 4 — New model fields: types (B-5a)

**Proposal refs:** Layer 3, B-5; Layer 1, B-1b

**What this does:** Add 8 new optional fields to the `ModelDTO` interface and the `Model` view type in `lib/pc/types.ts`; update `mapDtoToModel` in `lib/pc/models.ts` to map them.

**File to MODIFY: `admin-frontend/lib/pc/types.ts`**

In `ModelDTO` interface (currently at line ~142), add after `changes: ChangeEntryDTO[]`:
```ts
// New fields from DB B-1b (all nullable until backend populates them)
description?: string | null;
underlyings?: string | null;
risk?: string | null;
liquidity?: string | null;
reporting?: string | null;
nav_perf?: string | null;
mgmt_fee?: number | null;
incentive_fee?: number | null;
```

In `Model` interface (currently at line ~58), add after `changes: ChangeEntry[]`:
```ts
// Prospectus / fee fields (from DB B-1b)
description: string | null;
underlyings: string | null;
risk: string | null;
liquidity: string | null;
reporting: string | null;
nav_perf: string | null;
mgmt_fee: number | null;       // null → use DEFAULT_MGMT_PCT fallback
incentive_fee: number | null;  // null → use DEFAULT_INCENTIVE_PCT fallback
```

Also widen `Period` interface to carry the two optional fields from D-2 (since confirmed periods will return these):
```ts
export interface Period {
  id?: string;
  label: string;
  status: PeriodStatus;
  confirmed_at?: string | null;
  confirmed_by?: string | null;
}
```

**File to MODIFY: `admin-frontend/lib/pc/models.ts`**

In `mapDtoToModel`, add the 8 new fields to the returned object (after `changes:`):
```ts
description: dto.description ?? null,
underlyings: dto.underlyings ?? null,
risk: dto.risk ?? null,
liquidity: dto.liquidity ?? null,
reporting: dto.reporting ?? null,
nav_perf: dto.nav_perf ?? null,
mgmt_fee: dto.mgmt_fee ?? null,
incentive_fee: dto.incentive_fee ?? null,
```

The existing `mgmt` and `incentive` view fields keep their current fallback logic:
```ts
mgmt: dto.mgmt_fee ?? DEFAULT_MGMT_PCT,
incentive: dto.incentive_fee ?? DEFAULT_INCENTIVE_PCT,
```
(These stay for backward compatibility with components that already use `m.mgmt` / `m.incentive`.)

**Sub-agent instruction:** Read `lib/pc/types.ts` and `lib/pc/models.ts` before editing. Make the changes above. `git add` and `git commit` with message: `feat(pc): add 8 new model prospectus/fee fields to types + mapper (B-1b)`.

---

### Feature 5 — Backend endpoint adaptations (B-1 + B-2 + B-3)

**Proposal refs:** Layer 3, B-1; B-2; B-3; Layer 2, D-1, D-2, D-3

**What this does:** Update `server/pc/index.ts` and `server/endpoints.ts` to match the simplified route surface from D-1/D-2/D-3. The old routes no longer exist once the backend deploys; the frontend must use the new ones.

**File to MODIFY: `admin-frontend/server/endpoints.ts`**

Current:
```ts
PUBLISH: (id: string) => `${PC}/models/${id}/publish`,
DELETE:  (id: string) => `${PC}/models/${id}`,
PERIODS: `${PC}/allocation/periods`,
CONFIRM: (id: string) => `${PC}/allocation/periods/${id}/confirm`,
```

After (remove PUBLISH, keep DELETE renamed to PATCH_MODEL, remove PERIODS, remove CONFIRM, add PATCH_PERIOD):
```ts
// PUBLISH removed — use MODEL(id) with PATCH {status:'live'} (D-1)
// DELETE removed — use MODEL(id) with PATCH {status:'deleted'} (D-1)
// PERIODS removed — periods are embedded in GET /allocation (D-2)
// CONFIRM removed — use PATCH_PERIOD(id) with {status:'confirmed'} (D-3)
PATCH_PERIOD: (id: string) => `${PC}/allocation/periods/${id}`,
```

The `MODEL(id)` entry already points to `/api/pc/models/{id}` and is used for PATCH — no change needed there.

**File to MODIFY: `admin-frontend/server/pc/index.ts`**

1. **`publishModel`** — change from `POST ENDPOINTS.PC.PUBLISH(id)` to `PATCH ENDPOINTS.PC.MODEL(id)` with body `{status:'live'}`:
```ts
export async function publishModel(id: string): Promise<APIResult<ModelDTO>> {
  return apiClient<ModelDTO>(ENDPOINTS.PC.MODEL(id), {
    method: "PATCH",
    body: JSON.stringify({ status: "live" }),
  });
}
```

2. **`deleteModel`** — change from `DELETE ENDPOINTS.PC.DELETE(id)` to `PATCH ENDPOINTS.PC.MODEL(id)` with body `{status:'deleted'}`:
```ts
export async function deleteModel(id: string): Promise<APIResult<ModelDTO>> {
  return apiClient<ModelDTO>(ENDPOINTS.PC.MODEL(id), {
    method: "PATCH",
    body: JSON.stringify({ status: "deleted" }),
  });
}
```

3. **`getPeriods`** — DELETE this function entirely (D-2: the endpoint no longer exists).

4. **`confirmPeriod`** — change from `POST ENDPOINTS.PC.CONFIRM(id)` to `PATCH ENDPOINTS.PC.PATCH_PERIOD(id)` with body `{status:'confirmed'}`:
```ts
export async function confirmPeriod(id: string): Promise<APIResult<PeriodDTO>> {
  return apiClient<PeriodDTO>(ENDPOINTS.PC.PATCH_PERIOD(id), {
    method: "PATCH",
    body: JSON.stringify({ status: "confirmed" }),
  });
}
```

5. Remove `PeriodsListDTO` from the import in `server/pc/index.ts` if `getPeriods` was the only consumer (check before removing).

**Sub-agent instruction:** Read `server/endpoints.ts` and `server/pc/index.ts` before editing. Make all changes above. Verify that `PeriodsListDTO` is not used elsewhere before removing it from imports. `git add` and `git commit` with message: `feat(pc): adapt server layer to D-1/D-2/D-3 route changes (PATCH status transitions, drop getPeriods/confirm/periods)`.

---

### Feature 6 — Mutation hooks (A-2)

**Proposal refs:** Layer 3, A-2, B-4

**Depends on:** Features 1, 2, 3, 4, 5 (needs actions.ts to exist with plural name; needs updated endpoint constants)

**What this does:**

1. Extend `hooks/api/useModels.ts` to add `createModel`, `updateModel`, `uploadMaterial`, `downloadMaterial` mutation methods.
2. Extend `hooks/api/useAllocation.ts` to add a `confirmPeriod` mutation method.
3. Create new `hooks/api/useModelDetail.ts` that calls `GET /models/{id}?include=materials,changes`.

**File to MODIFY: `admin-frontend/hooks/api/useModels.ts`**

Update import to use `actions` (plural):
```ts
import { getModels, createModel as createModelAction, updateModel as updateModelAction,
         uploadMaterial as uploadMaterialAction, downloadMaterial as downloadMaterialAction,
         publishModel as publishModelAction, deleteModel as deleteModelAction
} from "@/app/(roles)/pc/model-management/actions";
```

Update `UseModelsResult` interface:
```ts
export interface UseModelsResult {
  data: Model[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  createModel: (params: {
    name: string;
    manager: string;
    size: number;
    symbols: string[];
    status: "live" | "draft";
    file: File | null;
  }) => Promise<{ success: boolean; error?: string; id?: string }>;
  updateModel: (id: string, patch: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
  uploadMaterial: (id: string, file: File) => Promise<{ success: boolean; error?: string }>;
  downloadMaterial: (modelId: string, materialId: string) => Promise<{ success: boolean; error?: string; filename?: string; contentType?: string; base64?: string }>;
}
```

Implement each method in the hook body. Key behaviors:

**`createModel`** — orchestrates create → optional uploadMaterial → optional publishModel, then one terminal `refetch()`:
```ts
async (params) => {
  const created = await createModelAction({ name, model_size: size, manager, symbols });
  if (!created.success) return { success: false, error: created.error };
  const newId = created.data.id;
  if (params.file) {
    const fd = new FormData();
    fd.append("file", params.file, params.file.name);
    const up = await uploadMaterialAction(newId, fd);
    if (!up.success) { refetch(); return { success: false, error: up.error }; }
  }
  if (params.status === "live") {
    const pub = await publishModelAction(newId);
    if (!pub.success) { refetch(); return { success: false, error: pub.error }; }
  }
  refetch();  // single terminal refetch
  return { success: true, id: newId };
}
```

**`updateModel`** — calls `updateModelAction(id, patch)` then `refetch()`:
```ts
async (id, patch) => {
  const result = await updateModelAction(id, patch);
  if (result.success) refetch();
  return { success: result.success, error: result.success ? undefined : result.error };
}
```

**`uploadMaterial`** — calls `uploadMaterialAction(id, fd)` then `refetch()`:
```ts
async (id, file) => {
  const fd = new FormData();
  fd.append("file", file, file.name);
  const result = await uploadMaterialAction(id, fd);
  if (result.success) refetch();
  return { success: result.success, error: result.success ? undefined : result.error };
}
```

**`downloadMaterial`** — calls `downloadMaterialAction(modelId, materialId)` and returns the data:
```ts
async (modelId, materialId) => {
  const result = await downloadMaterialAction(modelId, materialId);
  if (!result.success) return { success: false, error: result.error };
  return { success: true, ...result.data };
}
```

Update the return value to include all mutation methods.

**File to MODIFY: `admin-frontend/hooks/api/useAllocation.ts`**

Update import to use `actions` (plural):
```ts
import { getAllocation, confirmPeriod as confirmPeriodAction } from "@/app/(roles)/pc/allocation-matrix/actions";
```

Update `UseAllocationResult` interface to add `confirmPeriod`:
```ts
export interface UseAllocationResult {
  data: AllocationView | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  confirmPeriod: (periodId: string) => Promise<{ success: boolean; error?: string }>;
}
```

Implement `confirmPeriod` method:
```ts
const doConfirm = useCallback(async (periodId: string) => {
  try {
    const result = await confirmPeriodAction(periodId);
    if (result.success) {
      // Invalidate the cache entry for the current period so next refetch hits the network.
      cache.delete(cacheKey(periodRef.current));
      doFetch(periodRef.current);
    }
    return { success: result.success, error: result.success ? undefined : result.error };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Confirm failed" };
  }
}, [doFetch]);
```

Add `confirmPeriod: doConfirm` to the return value.

**File to CREATE: `admin-frontend/hooks/api/useModelDetail.ts`**

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getModel, uploadMaterial as uploadMaterialAction, downloadMaterial as downloadMaterialAction } from "@/app/(roles)/pc/model-management/actions";
import { mapDtoToModel, mapDtoToMaterial } from "@/lib/pc/models";
import type { Model, Material } from "@/lib/pc/types";

export interface UseModelDetailResult {
  data: { model: Model; materials: Material[] } | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  uploadMaterial: (file: File) => Promise<{ success: boolean; error?: string }>;
  downloadMaterial: (materialId: string) => Promise<{ success: boolean; error?: string; filename?: string; contentType?: string; base64?: string }>;
}

export function useModelDetail(id: string | null): UseModelDetailResult {
  const [data, setData] = useState<{ model: Model; materials: Material[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const doFetch = useCallback(async (modelId: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      // Calls GET /api/pc/models/{id}?include=materials,changes (D-4)
      const result = await getModel(modelId + "?include=materials,changes");
      if (result.success) {
        const model = mapDtoToModel(result.data);
        const materials = (result.data.materials ?? []).map(mapDtoToMaterial).reverse();
        setData({ model, materials });
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load model detail");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (id) doFetch(id);
    else setData(null);
  }, [id, doFetch]);

  const uploadMaterial = useCallback(async (file: File) => {
    if (!id) return { success: false, error: "No model selected" };
    const fd = new FormData();
    fd.append("file", file, file.name);
    const result = await uploadMaterialAction(id, fd);
    if (result.success) doFetch(id);
    return { success: result.success, error: result.success ? undefined : result.error };
  }, [id, doFetch]);

  const downloadMaterial = useCallback(async (materialId: string) => {
    if (!id) return { success: false, error: "No model selected" };
    const result = await downloadMaterialAction(id, materialId);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, ...result.data };
  }, [id]);

  return {
    data,
    loading,
    error,
    refetch: () => { if (id) doFetch(id); },
    uploadMaterial,
    downloadMaterial,
  };
}
```

**Note on `getModel` call signature:** `server/pc/index.ts::getModel(id)` calls `ENDPOINTS.PC.MODEL(id)` which produces `/api/pc/models/{id}`. Passing `id + "?include=materials,changes"` embeds the query string in the id segment. This is a pragmatic approach until a dedicated overload is added to `server/pc/index.ts`. The agent may alternatively add an overload:
```ts
export async function getModelDetail(id: string): Promise<APIResult<ModelDTO>> {
  return apiClient<ModelDTO>(`${ENDPOINTS.PC.MODEL(id)}?include=materials,changes`);
}
```
...and use `getModelDetail` in the hook. Either approach is acceptable; prefer the cleaner overload.

**Sub-agent instruction:** Read `hooks/api/useModels.ts`, `hooks/api/useAllocation.ts`, and `server/pc/index.ts` before editing. Implement all changes above. Create `hooks/api/useModelDetail.ts`. `git add` and `git commit` with message: `feat(pc): extend hooks with mutation methods; create useModelDetail (A-2, B-4)`.

---

### Feature 7 — Redundant wrapper cleanup (A-4)

**Proposal refs:** Layer 3, A-4; C-4

**Depends on:** Features 1–5 (Feature 4 extends models.ts before we trim it here)

**What this does:**

1. Delete re-export lines from `lib/pc/models.ts`
2. Replace `AllocationView` interface + `mapDtoToAllocationView` factory in `lib/pc/allocation.ts` with a plain selector shape
3. Drop the bare-array branch in `mapDtoToModels`
4. Update all consumer import sites

**File to MODIFY: `admin-frontend/lib/pc/models.ts`**

Delete this line (the re-export):
```ts
export { fmtMoney, fmtMoneyShort, computeFees } from "./format";
```

Consumers must import from `@/lib/pc/format` directly. Search for all files that import `fmtMoney`, `fmtMoneyShort`, or `computeFees` from `@/lib/pc/models` and update them to import from `@/lib/pc/format`.

Known consumers (check by grepping for `from "@/lib/pc/models"` and `fmtMoney|fmtMoneyShort|computeFees`):
- `admin-frontend/app/(roles)/pc/model-management/page.tsx` — imports `fmtMoney` from `@/lib/pc/models`
- `admin-frontend/app/(roles)/pc/allocation-matrix/page.tsx` — imports `fmtMoney`, `fmtMoneyShort` from `@/lib/pc/models`
- Any extracted component files created in Features 2 and 3 that re-use these formatters

In `mapDtoToModels`, drop the bare-array tolerance branch (C-4). Change:
```ts
const list = Array.isArray(dto) ? dto : Array.isArray(dto.models) ? dto.models : [];
```
to:
```ts
const list = Array.isArray(dto.models) ? dto.models : [];
```
Also update the function signature to remove `ModelDTO[]` from the union type:
```ts
export function mapDtoToModels(dto: ModelsListDTO | null | undefined): Model[]
```

**File to MODIFY: `admin-frontend/lib/pc/allocation.ts`**

Replace the `AllocationView` method-closure interface with a plain selector shape. The existing `AllocationView` interface uses method signatures (`.cell()`, `.colUnits()`, `.modelById()`, etc.) which close over O(N) `.find()` lookups. Replace with a plain data + useMemo-friendly shape:

```ts
/** Plain selector shape — build with mapDtoToAllocationView, memoize in the hook. */
export interface AllocationView {
  models: AllocationModel[];
  clients: AllocationClient[];
  liveModels: AllocationModel[];
  periods: Period[];
  openPeriod: string;
  // Lookup maps (built once by the mapper, consumed directly — no O(N) find)
  modelById: (id: string) => AllocationModel | undefined;
  clientById: (id: string) => AllocationClient | undefined;
  cell: (cid: string, mid: string) => AllocationCell | undefined;
  cellFund: (cid: string, mid: string) => number;
  colUnits: (mid: string) => number;
  colFund: (mid: string) => number;
  totalFund: () => number;
  count: () => number;
}
```

Note: The current `AllocationView` already uses function members. The refactor here is conceptual + removes the mixin-style factory concern. The actual `mapDtoToAllocationView` implementation today already builds Maps/closures correctly — the key change is just exporting a clean named type that components can depend on rather than the factory being the interface source of truth.

Keep `mapDtoToAllocationView` function intact (it already returns a conforming object). What is removed is any coupling to the factory through the interface itself.

If the current `allocation.ts` code already matches this shape (it does, as read — the interface and mapper are both in the file), the only actual code change is:
- Remove the `export function mapDtoToAllocationView` or keep it; the proposal says "replace with a plain selector shape" — the implementation remains, the intent is that consumers rely on the `AllocationView` type, not on the factory function being the interface definition. No functional change needed here if the interface already matches.

**Practical action:** The current code is already well-shaped. The only concrete code changes needed in this feature are:
1. Remove `export { fmtMoney, fmtMoneyShort, computeFees } from "./format"` from `lib/pc/models.ts`
2. Update all consumer import sites for those formatters
3. Fix `mapDtoToModels` signature and bare-array branch

**Sub-agent instruction:** Read `lib/pc/models.ts` and `lib/pc/allocation.ts`. Grep for all files importing `fmtMoney`, `fmtMoneyShort`, `computeFees` from `@/lib/pc/models` (search `admin-frontend/` recursively). Update all import sites to use `@/lib/pc/format`. Make the `mapDtoToModels` signature and bare-array fix. `git add` and `git commit` with message: `refactor(pc): remove re-export wrappers from lib/pc/models; fix mapDtoToModels signature (A-4, C-4)`.

---

### Feature 8 — Page refactor: model-management (A-2 + A-5 + C-1 + C-2)

**Proposal refs:** Layer 3, A-2, A-3, A-5, C-1, C-2

**Depends on:** Features 1–7 (needs hooks with mutations + extracted components + cleaned-up imports)

**Target:** `admin-frontend/app/(roles)/pc/model-management/page.tsx` shrinks to ≤ 120 LOC.

**What this does:** Rewrite `model-management/page.tsx` to:
1. Import `useModels` (for data + all mutations) and `useModelDetail` (for the open model's materials + changes)
2. Remove all direct action imports from `@/app/(roles)/pc/model-management/actions`
3. Remove the page-local `models` mirror state (`useState<Model[]>` + `useEffect(() => setModels(remote))`)
4. Remove the page-local `materialsById: Record<string, Material[]>` state
5. Remove the `useEffect` that fetches materials on `openId` change (now owned by `useModelDetail`)
6. Move `handleCreate`, `handlePublish`, `handleDelete`, `handleUploadMaterial`, `handleDownloadMaterial` logic into the hooks (they already exist in Feature 6's `useModels`)
7. Use extracted components from `@/components/pc/model-management/*`
8. Wire `useModelDetail` to `ModelDetailPanel` so the changes tab is populated (fix for C-1)

**Target page structure (~90 LOC):**

```tsx
"use client";

import { useState } from "react";
import { LayoutGrid, List, Calculator, Plus } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { useModels } from "@/hooks/api/useModels";
import { useModelDetail } from "@/hooks/api/useModelDetail";
import { CardGrid } from "@/components/pc/model-management/CardGrid";
import { ModelTable } from "@/components/pc/model-management/ModelTable";
import { ModelDetailPanel } from "@/components/pc/model-management/ModelDetailPanel";
import { CreateModelForm } from "@/components/pc/model-management/CreateModelForm";
import { EditModelForm } from "@/components/pc/model-management/EditModelForm";
import { CalcModal } from "@/components/pc/model-management/CalcModal";
import type { NewModelDraft } from "@/components/pc/model-management/CreateModelForm";
import type { Model } from "@/lib/pc/types";

type Layout = "grid" | "table";
type Tab = "overview" | "materials" | "changes";

export default function ModelManagementPage() {
  const { data: models, loading, createModel, updateModel, uploadMaterial, downloadMaterial } = useModels();
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [layout, setLayout] = useState<Layout>("grid");
  const [creating, setCreating] = useState(false);
  const [calc, setCalc] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [duplicateSeed, setDuplicateSeed] = useState<NewModelDraft | null>(null);

  const { data: detail, uploadMaterial: uploadDetailMaterial, downloadMaterial: downloadDetailMaterial } = useModelDetail(openId);

  const safeModels = models ?? [];
  const draftCount = safeModels.filter((x) => x.status === "draft").length;

  const open = (id: string, t: Tab) => { setOpenId(id); setTab(t ?? "overview"); };

  const handleCreate = (draft: NewModelDraft) => {
    setCreating(false);
    setDuplicateSeed(null);
    void createModel(draft).then((r) => {
      if (!r.success) { alert(`Could not create model: ${r.error}`); return; }
      setOpenId(r.id ?? null);
      setTab("overview");
    });
  };

  const handlePublish = (id: string) => {
    void updateModel(id, { status: "live" }).then((r) => {
      if (!r.success) alert(`Could not publish: ${r.error}`);
    });
  };

  const handleDelete = (id: string) => {
    void updateModel(id, { status: "deleted" }).then((r) => {
      if (r.success) setOpenId(null);
    });
  };

  const handleDuplicate = (id: string) => {
    const src = safeModels.find((x) => x.id === id);
    if (!src) return;
    setDuplicateSeed({ name: `${src.name} (copy)`, manager: src.manager, size: src.size, symbols: [...src.symbols], status: "draft", file: null });
    setOpenId(null);
    setCreating(true);
  };

  const m = safeModels.find((x) => x.id === openId);
  const editModel = editId ? safeModels.find((x) => x.id === editId) : undefined;

  const TOGGLES: [Layout, typeof LayoutGrid, string][] = [
    ["grid", LayoutGrid, "Card view"],
    ["table", List, "Table view"],
  ];

  return (
    <div className="relative -mx-16 -my-8 min-h-[calc(100vh_-_64px)]">
      <div className="px-16 py-8">
        <div className="mb-[26px] flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.01em] text-on-surface">Model Management</h1>
            <p className="mt-1.5 text-[15px] text-secondary">
              Create and manage the firm&rsquo;s trading strategies · {safeModels.length} models · {draftCount} draft
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex overflow-hidden rounded border border-outline">
              {TOGGLES.map(([k, IconCmp, title]) => (
                <button key={k} type="button" onClick={() => setLayout(k)} title={title}
                  className={`flex cursor-pointer items-center border-none px-[11px] py-2 transition-all duration-150 ${layout === k ? "bg-primary text-white" : "bg-white text-secondary"}`}>
                  <IconCmp size={17} strokeWidth={1.9} />
                </button>
              ))}
            </div>
            <Button variant="secondary" icon={Calculator} onClick={() => setCalc(true)} title="Fee calculator" aria-label="Fee calculator" className="px-[13px] py-2.5" />
            <Button icon={Plus} onClick={() => setCreating(true)}>New model</Button>
          </div>
        </div>
        {layout === "grid"
          ? <CardGrid models={safeModels} onOpen={open} />
          : <ModelTable models={safeModels} onOpen={open} />}
      </div>
      {m && (
        <ModelDetailPanel
          m={detail?.model ?? m}
          tab={tab}
          materials={detail?.materials ?? []}
          onTab={setTab}
          onClose={() => setOpenId(null)}
          onEdit={(id) => setEditId(id)}
          onDuplicate={handleDuplicate}
          onPublish={handlePublish}
          onDelete={handleDelete}
          onUploadMaterial={async (_id, file) => {
            const r = await uploadDetailMaterial(file);
            if (!r.success) alert(`Upload failed: ${r.error}`);
            return r.success;
          }}
          onDownloadMaterial={(_modelId, material) => {
            if (!material.id) return;
            void downloadDetailMaterial(material.id).then((r) => {
              if (!r.success) { alert(`Download failed: ${r.error}`); return; }
              const { filename, contentType, base64 } = r as { filename: string; contentType: string; base64: string };
              const bin = atob(base64);
              const bytes = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
              const blob = new Blob([bytes], { type: contentType });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = filename;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            });
          }}
        />
      )}
      {creating && (
        <CreateModelForm
          onClose={() => { setCreating(false); setDuplicateSeed(null); }}
          onCreate={(draft) => { setDuplicateSeed(null); handleCreate(draft); }}
          initial={duplicateSeed ?? undefined}
        />
      )}
      {editModel && (
        <EditModelForm
          model={editModel}
          onClose={() => setEditId(null)}
          onSaved={() => { /* refetch happens inside useModels.updateModel */ }}
        />
      )}
      {calc && <CalcModal models={safeModels} onClose={() => setCalc(false)} />}
    </div>
  );
}
```

**Important:** `EditModelForm` currently calls `updateModelAction` directly. After Feature 6, it should call through the `updateModel` method from `useModels`. Since `EditModelForm` is a component (not the page), pass `onSaved` as a callback. For now the simplest approach: pass `updateModel` from the hook as a prop to `EditModelForm`, or keep the existing direct action call inside `EditModelForm` and just trigger a refetch via `onSaved`. The latter is acceptable for this phase — do NOT break `EditModelForm`'s existing behavior.

**Sub-agent instruction:** Read the current `page.tsx` and all hook files before editing. Rewrite `page.tsx` to match the target structure above (adapt as needed for TypeScript correctness). Ensure no direct imports from `@/app/(roles)/pc/model-management/actions` remain in page.tsx. Verify the page is ≤ 120 LOC. `git add` and `git commit` with message: `refactor(pc): rewrite model-management page.tsx to ~90 LOC; use hooks for mutations (A-2, A-5, C-1, C-2)`.

---

### Feature 9 — Page refactor: allocation-matrix (A-2 + A-5)

**Proposal refs:** Layer 3, A-2, A-5

**Depends on:** Features 1–7

**Target:** `admin-frontend/app/(roles)/pc/allocation-matrix/page.tsx` shrinks to ≤ 100 LOC.

**What this does:** Rewrite `allocation-matrix/page.tsx` to:
1. Use `useAllocation()` for both data and `confirmPeriod` mutation
2. Remove the direct `confirmPeriodAction` import
3. Use extracted components from `@/components/pc/allocation-matrix/*`

**Target page structure (~80 LOC):**

```tsx
"use client";

import { useState } from "react";
import { Check, Eye } from "@/lib/icons";
import { Button } from "@/components/ui/Button";
import { useAllocation } from "@/hooks/api/useAllocation";
import { StatStrip } from "@/components/pc/allocation-matrix/StatStrip";
import { PeriodPicker } from "@/components/pc/allocation-matrix/PeriodPicker";
import { ViewToggle, type Toggle } from "@/components/pc/allocation-matrix/ViewToggle";
import { HowToRead } from "@/components/pc/allocation-matrix/HowToRead";
import { Matrix } from "@/components/pc/allocation-matrix/Matrix";
import { DetailPanel } from "@/components/pc/allocation-matrix/DetailPanel";
import { ConfirmModal } from "@/components/pc/allocation-matrix/ConfirmModal";
import { EmptyPeriod } from "@/components/pc/allocation-matrix/EmptyPeriod";
import { History } from "@/lib/icons";

interface Coord { cid: string; mid: string }

export default function AllocationMatrixPage() {
  const [periodLabel, setPeriodLabel] = useState<string | undefined>(undefined);
  const { data, loading, refetch, confirmPeriod } = useAllocation(periodLabel);

  const LATEST = data?.periods[0]?.label ?? "";
  const OPEN = data?.openPeriod ?? "";
  const period = periodLabel ?? LATEST;

  const [view, setView] = useState<Toggle>("units");
  const [open, setOpen] = useState<Coord | null>(null);
  const [confirmModal, setConfirmModal] = useState(false);
  const [justConfirmed, setJustConfirmed] = useState(false);

  const selectedStatus = data?.periods.find((p) => p.label === period)?.status;
  const confirmed = selectedStatus === "confirmed" || justConfirmed;
  const historical = !!OPEN && period !== OPEN;

  const handleConfirm = () => {
    const openPeriodId = data?.periods.find((p) => p.status === "open")?.id;
    if (!openPeriodId) return;
    void confirmPeriod(openPeriodId).then((r) => {
      if (r.success) { setConfirmModal(false); setJustConfirmed(true); }
      else { setConfirmModal(false); }
    });
  };

  if (loading && !data) {
    return (
      <div className="px-16 py-8">
        <h1 className="text-[28px] font-semibold tracking-[-0.01em] text-on-surface">Allocation Matrix</h1>
        <div className="mt-8 text-center text-[15px] text-secondary">Loading allocation…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="px-16 py-8">
        <h1 className="text-[28px] font-semibold tracking-[-0.01em] text-on-surface">Allocation Matrix</h1>
        <div className="mt-8"><EmptyPeriod onRetry={refetch} /></div>
      </div>
    );
  }

  return (
    <div className="relative -mx-16 -my-8 min-h-[calc(100vh_-_64px)]">
      <div className="px-16 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.01em] text-on-surface">Allocation Matrix</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <PeriodPicker view={data} period={period} onPick={setPeriodLabel} />
              <p className="text-[15px] text-secondary">
                {historical || confirmed ? "Historical · read-only" : "Pre-trade allocation · review & confirm"} · {data.clients.length} clients · {data.liveModels.length} live models
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ViewToggle view={view} onView={setView} />
            {historical ? (
              <Button variant="secondary" icon={Eye} disabled>Read-only preview</Button>
            ) : confirmed ? (
              <Button variant="secondary" icon={Check} disabled>Confirmed · read-only</Button>
            ) : (
              <Button icon={Check} onClick={() => setConfirmModal(true)}>Confirm allocation</Button>
            )}
          </div>
        </div>
        <StatStrip view={data} period={period} />
        {historical && (
          <div className="mb-[18px] flex items-start gap-3 rounded-md border border-outline-variant bg-surface-low px-4 py-[13px]">
            <span className="mt-px flex flex-none text-secondary"><History size={18} strokeWidth={2} /></span>
            <div className="flex-1">
              <div className="text-[13.5px] font-bold text-on-surface">Previewing {period} · historical</div>
              <div className="mt-0.5 text-[12.5px] text-secondary">Switch back to {OPEN} to edit the open allocation.</div>
            </div>
          </div>
        )}
        {confirmed && !historical && (
          <div className="mb-[18px] flex items-start gap-3 rounded-md border px-4 py-[13px]" style={{ background: "#fff6e6", borderColor: "#ffe2b0" }}>
            <span className="mt-px flex flex-none" style={{ color: "#9a5b00" }}><Check size={18} strokeWidth={2} /></span>
            <div className="flex-1">
              <div className="text-[13.5px] font-bold text-on-surface">{period} allocation is confirmed</div>
              <div className="mt-0.5 text-[12.5px]" style={{ color: "#9a5b00" }}>The matrix is frozen so trading can open.</div>
            </div>
          </div>
        )}
        <HowToRead view={view} />
        <Matrix data={data} view={view} onOpen={(cid, mid) => setOpen({ cid, mid })} />
      </div>
      {open && <DetailPanel data={data} period={period} cid={open.cid} mid={open.mid} onClose={() => setOpen(null)} />}
      {confirmModal && <ConfirmModal data={data} period={OPEN} onClose={() => setConfirmModal(false)} onConfirm={handleConfirm} />}
    </div>
  );
}
```

**Sub-agent instruction:** Read the current `allocation-matrix/page.tsx` and `hooks/api/useAllocation.ts` before editing. Rewrite `page.tsx` to match the target structure above. Ensure no direct imports from `@/app/(roles)/pc/allocation-matrix/actions` remain in page.tsx. Verify the page is ≤ 100 LOC. `git add` and `git commit` with message: `refactor(pc): rewrite allocation-matrix page.tsx to ~80 LOC; confirmPeriod through hook (A-2, A-5)`.

---

### Feature 10 — New model fields UI (B-5b)

**Proposal refs:** Layer 3, B-5; Layer 1, B-1b

**Depends on:** Features 1–7 (needs Feature 4's type changes; needs extracted component files)

**What this does:** Add the 8 new model fields from DB B-1b to the UI in three component files.

**File to MODIFY: `admin-frontend/components/pc/model-management/OverviewTab.tsx`** (extracted from page.tsx in Feature 2 as `FactGrid`)

Add 8 new `Fact` rows to the grid after the existing facts. Display nulls as `"—"`. Format fee fields as percentages:

```tsx
// After existing Fact rows (Model size, Manager, Mgmt fee, Incentive fee, Symbols, Introduced):
{m.description && <Fact label="Description" value={m.description} span />}
{m.underlyings && <Fact label="Traded Underlyings" value={m.underlyings} span />}
{m.risk && <Fact label="Leverage and Risk" value={m.risk} span />}
{m.liquidity && <Fact label="Liquidity" value={m.liquidity} />}
{m.reporting && <Fact label="Reporting" value={m.reporting} />}
{m.nav_perf && <Fact label="NAV and Performance" value={m.nav_perf} />}
{m.mgmt_fee != null && <Fact label="Mgmt Fee (stored)" value={`${(m.mgmt_fee * 100).toFixed(2)}%`} />}
{m.incentive_fee != null && <Fact label="Incentive Fee (stored)" value={`${(m.incentive_fee * 100).toFixed(2)}%`} />}
```

Note: `m.mgmt_fee` here is the raw decimal from the DTO (e.g. `0.020000`), not the already-converted `m.mgmt` percentage. Display as `mgmt_fee * 100` formatted to 2 decimal places. Only show if non-null (legacy models won't have it).

**File to MODIFY: `admin-frontend/components/pc/model-management/CreateModelForm.tsx`**

Add 8 new form inputs to the `CreateModelForm` grid. Insert them after the existing symbols field and before the material upload section:

- `description` — `<textarea>` (multi-line), label "Description"
- `underlyings` — `<textarea>` (multi-line), label "Traded Underlyings"
- `risk` — `<textarea>` (multi-line), label "Leverage and Risk"
- `liquidity` — `<input type="text">`, label "Liquidity", placeholder "e.g. Daily"
- `reporting` — `<input type="text">`, label "Reporting", placeholder "e.g. Monthly"
- `nav_perf` — `<input type="text">`, label "NAV and Performance", placeholder "e.g. Monthly"
- `mgmt_fee` — `<input type="text" inputMode="decimal">`, label "Mgmt Fee %", placeholder "e.g. 2.0"
- `incentive_fee` — `<input type="text" inputMode="decimal">`, label "Incentive Fee %", placeholder "e.g. 20.0"

Add corresponding state variables:
```ts
const [description, setDescription] = useState("");
const [underlyings, setUnderlyings] = useState("");
const [risk, setRisk] = useState("");
const [liquidity, setLiquidity] = useState("");
const [reporting, setReporting] = useState("");
const [navPerf, setNavPerf] = useState("");
const [mgmtFee, setMgmtFee] = useState("");
const [incentiveFee, setIncentiveFee] = useState("");
```

Include these in the `NewModelDraft` interface and the `submit()` call. The `NewModelDraft` interface must be updated:
```ts
export interface NewModelDraft {
  name: string;
  manager: string;
  size: number;
  symbols: string[];
  status: ModelStatus;
  file: File | null;
  description?: string;
  underlyings?: string;
  risk?: string;
  liquidity?: string;
  reporting?: string;
  nav_perf?: string;
  mgmt_fee?: number | null;
  incentive_fee?: number | null;
}
```

**File to MODIFY: `admin-frontend/components/pc/model-management/EditModelForm.tsx`**

Add the same 8 fields with initial values from `model.description`, `model.underlyings`, etc. (defaulting to `""` for null). Include them in `buildPatch()`. The `EditModelForm` calls `updateModel` (or `updateModelAction` directly — do not break existing save behavior, just add the new fields to the patch).

**Sub-agent instruction:** Read `components/pc/model-management/OverviewTab.tsx` (or `FactGrid.tsx` if still named that), `CreateModelForm.tsx`, and `EditModelForm.tsx` before editing. Add the new fields as described. Preserve all existing behavior. `git add` and `git commit` with message: `feat(pc): add 8 new model prospectus/fee fields to OverviewTab, CreateModelForm, EditModelForm (B-5b)`.

---

### Feature 11 — Minor fixes (C-4 already in F7; this feature is merged into Feature 7)

**Note:** C-4 (`mapDtoToModels` bare-array branch) is handled in Feature 7. C-2 (single terminal `refetch()` in `useModels.createModel`) is handled in Feature 6's `createModel` implementation above. No standalone Feature 11 agent needed.

---

## Execution plan

```
┌─ PHASE 1 (parallel — no dependencies between features) ────────────────┐
│  Feature 1: Action tier (actions.ts rename + try/catch)                │
│  Feature 2: Component extraction — model-management                   │
│  Feature 3: Component extraction — allocation-matrix                  │
│  Feature 4: New model fields — types (lib/pc/types.ts + models.ts)    │
│  Feature 5: Backend endpoint adaptations (server/pc + endpoints.ts)   │
└───────────────────────────────────────────────────────────────────────┘
        ↓ (wait for all Phase 1 agents to complete)
┌─ PHASE 2 (parallel) ──────────────────────────────────────────────────┐
│  Feature 6: Mutation hooks (useModels + useAllocation + useModelDetail)│
│  Feature 7: Redundant wrapper cleanup (lib/pc/models.ts re-exports)   │
└───────────────────────────────────────────────────────────────────────┘
        ↓ (wait for all Phase 2 agents to complete)
┌─ PHASE 3 (parallel) ──────────────────────────────────────────────────┐
│  Feature 8: Page refactor — model-management (~90 LOC)                │
│  Feature 9: Page refactor — allocation-matrix (~80 LOC)               │
│  Feature 10: New model fields UI (OverviewTab, CreateForm, EditForm)   │
└───────────────────────────────────────────────────────────────────────┘
        ↓ (wait for all Phase 3 agents to complete)
┌─ PHASE 4 (parallel) ──────────────────────────────────────────────────┐
│  Validation agent                                                      │
│  Testing agent                                                         │
└───────────────────────────────────────────────────────────────────────┘
```

**Orchestrator rules:**
- Phase 1: send a single message with 5 Agent tool calls (Features 1–5)
- Phase 2: send a single message with 2 Agent tool calls (Features 6–7) after all Phase 1 agents return
- Phase 3: send a single message with 3 Agent tool calls (Features 8–10) after all Phase 2 agents return
- Phase 4: send a single message with 2 Agent tool calls (Validation + Testing) after all Phase 3 agents return

**If a Phase 1 agent fails:** diagnose the error before proceeding to Phase 2. Do not silently swallow failures.

---

## Sub-agent commit protocol

Every sub-agent must follow this sequence exactly:

1. **Read** all files it will touch before making any edit
2. **Implement** the changes described in its feature section
3. **Stage** only the files changed in this feature: `git add <specific file paths>`
4. **Commit** on `WORKING_BRANCH` (the branch passed by the orchestrator):
   ```
   git commit -m "<message from feature section>"
   ```
5. **Report** back: list every file created/modified/deleted and note any TypeScript issues encountered

Sub-agents must NOT:
- Push to remote
- Merge branches
- `git add -A` or `git add .` (add specific files only)
- Work on a different branch

---

## Validation & testing

### Validation agent

Run from `admin-frontend\`:

1. **TypeScript check:**
   ```powershell
   cd "C:\Users\JohnQin\Desktop\John's Megaanuum working repository\client-web-portal\admin-frontend"
   npx tsc --noEmit
   ```
   Expected: zero errors. Report all errors if any exist.

2. **Component directory checks:**
   - Verify `components/pc/model-management/` contains: `CardGrid.tsx`, `ModelTable.tsx`, `ModelDetailPanel.tsx`, `OverviewTab.tsx`, `MaterialsTab.tsx`, `ChangesTab.tsx`, `CreateModelForm.tsx`, `EditModelForm.tsx`, `CalcModal.tsx` (9 files)
   - Verify `components/pc/allocation-matrix/` contains: `StatStrip.tsx`, `PeriodPicker.tsx`, `ViewToggle.tsx`, `HowToRead.tsx`, `Matrix.tsx`, `DetailPanel.tsx`, `ConfirmModal.tsx`, `EmptyPeriod.tsx` (8 files)

3. **Page size checks:**
   - Count LOC in `app/(roles)/pc/model-management/page.tsx` — must be ≤ 120
   - Count LOC in `app/(roles)/pc/allocation-matrix/page.tsx` — must be ≤ 100

4. **Import boundary checks:**
   - Grep `app/(roles)/pc/model-management/page.tsx` for `from "@/server/pc"` — must return 0 matches
   - Grep `app/(roles)/pc/allocation-matrix/page.tsx` for `from "@/server/pc"` — must return 0 matches
   - Grep `app/(roles)/pc/model-management/page.tsx` for `from "@/app/(roles)/pc/model-management/action"` (singular) — must return 0 matches
   - Grep `app/(roles)/pc/allocation-matrix/page.tsx` for `from "@/app/(roles)/pc/allocation-matrix/action"` (singular) — must return 0 matches

5. **Actions files (plural) exist:**
   - `app/(roles)/pc/model-management/actions.ts` — must exist
   - `app/(roles)/pc/allocation-matrix/actions.ts` — must exist
   - `app/(roles)/pc/model-management/action.ts` — must NOT exist
   - `app/(roles)/pc/allocation-matrix/action.ts` — must NOT exist

Report pass/fail for each check.

### Testing agent

Inspect source files (no compilation needed — grep/read checks):

1. **`lib/pc/models.ts` no longer re-exports formatters:**
   - Grep `lib/pc/models.ts` for `export.*fmtMoney` — must return 0 matches
   - Grep `lib/pc/models.ts` for `export.*fmtMoneyShort` — must return 0 matches
   - Grep `lib/pc/models.ts` for `export.*computeFees` — must return 0 matches

2. **`lib/pc/allocation.ts` retained (plain interface shape):**
   - Read `lib/pc/allocation.ts` — confirm `AllocationView` interface still exported
   - Confirm `mapDtoToAllocationView` function still exported

3. **`useModels` hook exports mutation methods:**
   - Read `hooks/api/useModels.ts`
   - Confirm `UseModelsResult` interface contains: `data`, `loading`, `error`, `refetch`, `createModel`, `updateModel`, `uploadMaterial`, `downloadMaterial`

4. **`useAllocation` hook exports `confirmPeriod`:**
   - Read `hooks/api/useAllocation.ts`
   - Confirm `UseAllocationResult` interface contains `confirmPeriod`

5. **`useModelDetail` hook exists:**
   - Confirm `hooks/api/useModelDetail.ts` exists
   - Read it — confirm it exports `useModelDetail` and `UseModelDetailResult`

6. **New model fields in types:**
   - Read `lib/pc/types.ts`
   - Confirm `Model` interface contains: `description`, `underlyings`, `risk`, `liquidity`, `reporting`, `nav_perf`, `mgmt_fee`, `incentive_fee`
   - Confirm `ModelDTO` interface contains the same 8 fields

7. **Endpoint constants updated:**
   - Read `server/endpoints.ts`
   - Confirm `PUBLISH` key is absent
   - Confirm `PERIODS` key is absent
   - Confirm `CONFIRM` key is absent
   - Confirm `PATCH_PERIOD` key is present

Report pass/fail for each check with file:line evidence.
