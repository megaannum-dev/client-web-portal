"use server";

import {
  apiClient,
  apiClientConditional,
  apiClientFormData,
  type APIResult,
  type ConditionalResult,
} from "@/server/api-client";
import { ENDPOINTS } from "@/server/endpoints";
import type {
  AllocationDTO,
  ModelDTO,
  ModelsListDTO,
  PeriodDTO,
  PeriodsListDTO,
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
  return apiClient<ModelDTO>(ENDPOINTS.PC.PUBLISH(id), { method: "POST" });
}

export async function getMaterials(
  id: string,
): Promise<APIResult<{ materials: ModelDTO["materials"] }>> {
  return apiClient(ENDPOINTS.PC.MATERIALS(id));
}

export async function uploadMaterial(
  id: string,
  formData: FormData,
): Promise<APIResult<ModelDTO["materials"][number]>> {
  return apiClientFormData(ENDPOINTS.PC.MATERIALS(id), formData);
}

export async function getChanges(
  id: string,
): Promise<APIResult<{ changes: ModelDTO["changes"] }>> {
  return apiClient(ENDPOINTS.PC.CHANGES(id));
}

/* ---- Allocation matrix ------------------------------------- */

export async function getPeriods(): Promise<APIResult<PeriodsListDTO>> {
  return apiClient<PeriodsListDTO>(ENDPOINTS.PC.PERIODS);
}

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
  return apiClient<PeriodDTO>(ENDPOINTS.PC.CONFIRM(id), { method: "POST" });
}
