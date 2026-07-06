"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getModels,
  createModel as createModelAction,
  updateModel as updateModelAction,
  uploadMaterial as uploadMaterialAction,
  downloadMaterial as downloadMaterialAction,
  publishModel as publishModelAction,
  getMaterials as getMaterialsAction,
} from "@/app/(roles)/pc/model-management/actions";
import { joinCategoryList, mapDtoToModels } from "@/lib/pc/models";
import type { Model } from "@/lib/pc/types";

export interface UseModelsResult {
  data: Model[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  createModel: (params: {
    name: string;
    size: number;
    symbols: string[];
    status: "live" | "draft";
    file: File | null;
    category?: string[];
    subscription_redemption?: string | null;
    description?: string;
    underlyings?: string;
    risk?: string;
    liquidity?: string;
    reporting?: string;
    nav_perf?: string;
    mgmt_fee?: number | null;
    incentive_fee?: number | null;
  }) => Promise<{ success: boolean; error?: string; id?: string }>;
  updateModel: (id: string, patch: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>;
  uploadMaterial: (id: string, file: File) => Promise<{ success: boolean; error?: string }>;
  downloadMaterial: (
    modelId: string,
    materialId: string,
  ) => Promise<{ success: boolean; error?: string; filename?: string; contentType?: string; base64?: string }>;
  downloadLatestMaterial: (
    modelId: string,
  ) => Promise<{ success: boolean; error?: string; filename?: string; contentType?: string; base64?: string }>;
}

export function useModels(): UseModelsResult {
  const [data, setData] = useState<Model[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const fetch = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await getModels();
      if (result.success) {
        setData(mapDtoToModels(result.data));
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load models");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  // Orchestrates create → optional material upload → optional publish, then
  // does a single terminal refetch (not one per branch) so the model list
  // only re-renders once the whole flow has settled.
  const createModel = useCallback(
    async (params: {
      name: string;
      size: number;
      symbols: string[];
      status: "live" | "draft";
      file: File | null;
      category?: string[];
      subscription_redemption?: string | null;
      description?: string;
      underlyings?: string;
      risk?: string;
      liquidity?: string;
      reporting?: string;
      nav_perf?: string;
      mgmt_fee?: number | null;
      incentive_fee?: number | null;
    }) => {
      const created = await createModelAction({
        name: params.name,
        model_size: params.size,
        category: joinCategoryList(params.category ?? []),
        subscription_redemption: params.subscription_redemption,
        symbols: params.symbols,
        description: params.description,
        underlyings: params.underlyings,
        risk: params.risk,
        liquidity: params.liquidity,
        reporting: params.reporting,
        nav_perf: params.nav_perf,
        mgmt_fee: params.mgmt_fee,
        incentive_fee: params.incentive_fee,
      });
      if (!created.success) return { success: false, error: created.error };
      const newId = created.data.id;

      if (params.file) {
        const fd = new FormData();
        fd.append("file", params.file, params.file.name);
        const up = await uploadMaterialAction(newId, fd);
        if (!up.success) {
          fetch();
          return { success: false, error: up.error };
        }
      }

      if (params.status === "live") {
        const pub = await publishModelAction(newId);
        if (!pub.success) {
          fetch();
          return { success: false, error: pub.error };
        }
      }

      fetch();
      return { success: true, id: newId };
    },
    [fetch],
  );

  const updateModel = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      const result = await updateModelAction(id, patch);
      if (result.success) fetch();
      return { success: result.success, error: result.success ? undefined : result.error };
    },
    [fetch],
  );

  const uploadMaterial = useCallback(
    async (id: string, file: File) => {
      const fd = new FormData();
      fd.append("file", file, file.name);
      const result = await uploadMaterialAction(id, fd);
      if (result.success) fetch();
      return { success: result.success, error: result.success ? undefined : result.error };
    },
    [fetch],
  );

  const downloadMaterial = useCallback(async (modelId: string, materialId: string) => {
    const result = await downloadMaterialAction(modelId, materialId);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, ...result.data };
  }, []);

  // Materials come back ascending by created_at (repository.list_materials), so
  // the latest upload is the last element — no dedicated "latest" endpoint exists.
  const downloadLatestMaterial = useCallback(async (modelId: string) => {
    const materials = await getMaterialsAction(modelId);
    if (!materials.success) return { success: false, error: materials.error };
    if (!materials.data.length) return { success: false, error: "No materials uploaded" };
    const latest = materials.data[materials.data.length - 1];
    const result = await downloadMaterialAction(modelId, latest.id);
    if (!result.success) return { success: false, error: result.error };
    return { success: true, ...result.data };
  }, []);

  return {
    data, loading, error, refetch: fetch, createModel, updateModel,
    uploadMaterial, downloadMaterial, downloadLatestMaterial,
  };
}
