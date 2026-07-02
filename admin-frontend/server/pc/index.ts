"use server";

import {
  apiClient,
  apiClientConditional,
  apiClientFormData,
  type APIResult,
  type ConditionalResult,
} from "@/server/api-client";
import { ENDPOINTS } from "@/server/endpoints";
import { cookies } from "next/headers";
import { getApiBase } from "@/lib/auth-api";
import type {
  AllocationDTO,
  MaterialDTO,
  ModelDTO,
  ModelsListDTO,
  PeriodDTO,
} from "@/lib/pc/types";

export type { APIResult };
export type AllocationFetchResult = ConditionalResult<AllocationDTO>;

/* ---- Model book -------------------------------------------- */

export async function getModels(): Promise<APIResult<ModelsListDTO>> {
  return apiClient<ModelsListDTO>(ENDPOINTS.PC.MODELS);
}

export async function getModel(id: string): Promise<APIResult<ModelDTO>> {
  return apiClient<ModelDTO>(ENDPOINTS.PC.MODEL(id));
}

export async function createModel(
  body: Record<string, unknown>,
): Promise<APIResult<ModelDTO>> {
  return apiClient<ModelDTO>(ENDPOINTS.PC.MODELS, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateModel(
  id: string,
  body: Record<string, unknown>,
): Promise<APIResult<ModelDTO>> {
  return apiClient<ModelDTO>(ENDPOINTS.PC.MODEL(id), {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function publishModel(id: string): Promise<APIResult<ModelDTO>> {
  return apiClient<ModelDTO>(ENDPOINTS.PC.MODEL(id), {
    method: "PATCH",
    body: JSON.stringify({ status: "live" }),
  });
}

export async function deleteModel(id: string): Promise<APIResult<ModelDTO>> {
  return apiClient<ModelDTO>(ENDPOINTS.PC.MODEL(id), {
    method: "PATCH",
    body: JSON.stringify({ status: "deleted" }),
  });
}

export async function getMaterials(id: string): Promise<APIResult<MaterialDTO[]>> {
  return apiClient<MaterialDTO[]>(ENDPOINTS.PC.MATERIALS(id));
}

export async function uploadMaterial(
  id: string,
  formData: FormData,
): Promise<APIResult<MaterialDTO>> {
  return apiClientFormData<MaterialDTO>(ENDPOINTS.PC.MATERIALS(id), formData);
}

/** Fetch a material's bytes through the BE; returns base64 so the browser
 *  can rehydrate a Blob and trigger a download. The cookie-based auth
 *  token can't ride on a plain <a href>, hence the server-action proxy. */
export async function downloadMaterial(
  modelId: string,
  materialId: string,
): Promise<APIResult<{ filename: string; contentType: string; base64: string }>> {
  const token = (await cookies()).get("id_token")?.value ?? "";
  const url = `${getApiBase()}${ENDPOINTS.PC.DOWNLOAD(modelId, materialId)}`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.status === 401) return { success: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const errJson: unknown = await res.json();
        if (typeof errJson === "object" && errJson !== null && "detail" in errJson) {
          const d = (errJson as { detail?: unknown }).detail;
          if (typeof d === "string") msg = d;
        }
      } catch { /* noop */ }
      return { success: false, error: msg, code: `HTTP_${res.status}` };
    }
    // Pull the filename out of the Content-Disposition header (FastAPI sets
    // `attachment; filename="…"` in the download route).
    const cd = res.headers.get("Content-Disposition") ?? "";
    const match = /filename="?([^";]+)"?/i.exec(cd);
    const filename = match?.[1] ?? "material";
    const contentType = res.headers.get("Content-Type") ?? "application/octet-stream";
    const buf = Buffer.from(await res.arrayBuffer());
    return { success: true, data: { filename, contentType, base64: buf.toString("base64") } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error", code: "NETWORK_ERROR" };
  }
}

export async function getChanges(
  id: string,
): Promise<APIResult<ModelDTO["changes"]>> {
  return apiClient(ENDPOINTS.PC.CHANGES(id));
}

/* ---- Allocation matrix ------------------------------------- */

/**
 * Fetch the allocation matrix for a given period.
 * Pass `etag` (from a prior 200 response) to get a conditional 304 if nothing changed.
 * Returns `notModified: true` on 304 — caller should keep the cached view.
 */
export async function getAllocation(
  period?: string,
  etag?: string,
): Promise<AllocationFetchResult> {
  const path = period
    ? `${ENDPOINTS.PC.ALLOCATION}?period=${encodeURIComponent(period)}`
    : ENDPOINTS.PC.ALLOCATION;
  return apiClientConditional<AllocationDTO>(path, etag);
}

export async function confirmPeriod(id: string): Promise<APIResult<PeriodDTO>> {
  return apiClient<PeriodDTO>(ENDPOINTS.PC.PATCH_PERIOD(id), {
    method: "PATCH",
    body: JSON.stringify({ status: "confirmed" }),
  });
}
