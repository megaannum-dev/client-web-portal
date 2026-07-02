"use client";

/* ============================================================
   useModelDetail — model detail-panel data hook

   NOTE: the backend has no combined "GET /models/{id}?include=
   materials,changes" endpoint — `GET /pc/models/{id}` (ModelOut)
   returns neither nested array; materials and changes are each
   served by their own dedicated endpoint (already wrapped as
   `getMaterials` / `getChanges` in the model-management actions
   module). This hook fans out to all three in parallel and folds
   the changes list into the ModelDTO before mapping, so
   `mapDtoToModel`'s existing change-log mapping is reused as-is.
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getModel,
  getMaterials as getMaterialsAction,
  getChanges as getChangesAction,
  uploadMaterial as uploadMaterialAction,
  downloadMaterial as downloadMaterialAction,
} from "@/app/(roles)/pc/model-management/actions";
import { mapDtoToModel, mapDtoToMaterial } from "@/lib/pc/models";
import type { Model, Material } from "@/lib/pc/types";

export interface UseModelDetailResult {
  data: { model: Model; materials: Material[] } | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  uploadMaterial: (file: File) => Promise<{ success: boolean; error?: string }>;
  downloadMaterial: (
    materialId: string,
  ) => Promise<{ success: boolean; error?: string; filename?: string; contentType?: string; base64?: string }>;
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
      const [modelResult, materialsResult, changesResult] = await Promise.all([
        getModel(modelId),
        getMaterialsAction(modelId),
        getChangesAction(modelId),
      ]);

      if (!modelResult.success) {
        setError(modelResult.error);
        return;
      }

      // Fold the separately-fetched change log into the DTO so
      // mapDtoToModel's existing (private) change-entry mapping handles it —
      // falls back to whatever (empty) `changes` the model DTO carries if
      // the changes call failed, rather than losing the whole detail view.
      const dto = {
        ...modelResult.data,
        changes: changesResult.success ? changesResult.data : modelResult.data.changes,
      };
      const model = mapDtoToModel(dto);
      const materials = materialsResult.success
        ? materialsResult.data.map(mapDtoToMaterial).reverse()
        : [];

      setData({ model, materials });
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

  const uploadMaterial = useCallback(
    async (file: File) => {
      if (!id) return { success: false, error: "No model selected" };
      const fd = new FormData();
      fd.append("file", file, file.name);
      const result = await uploadMaterialAction(id, fd);
      if (result.success) doFetch(id);
      return { success: result.success, error: result.success ? undefined : result.error };
    },
    [id, doFetch],
  );

  const downloadMaterial = useCallback(
    async (materialId: string) => {
      if (!id) return { success: false, error: "No model selected" };
      const result = await downloadMaterialAction(id, materialId);
      if (!result.success) return { success: false, error: result.error };
      return { success: true, ...result.data };
    },
    [id],
  );

  return {
    data,
    loading,
    error,
    refetch: () => {
      if (id) doFetch(id);
    },
    uploadMaterial,
    downloadMaterial,
  };
}
