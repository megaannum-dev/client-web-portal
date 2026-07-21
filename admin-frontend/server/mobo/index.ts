"use server";

import { apiClient, type APIResult } from "@/server/api-client";
import { ENDPOINTS } from "@/server/endpoints";
import type { PtaViewDTO, PtaRunsDTO, PtaRunResultDTO, PtaHistoryDTO } from "@/lib/mobo/types";
import type { ReconciliationFlowViewDTO } from "@/lib/mobo/flow-types";

export type { APIResult };

/** GET the view for a trade date; omitted date = most recent run (§4.1). */
export async function getPostTradeAllocation(date?: string): Promise<APIResult<PtaViewDTO>> {
  const path = date ? `${ENDPOINTS.MOBO.PTA}?date=${encodeURIComponent(date)}` : ENDPOINTS.MOBO.PTA;
  return apiClient<PtaViewDTO>(path);
}

/** GET the run list feeding the DateControl dropdown. */
export async function getPostTradeAllocationRuns(): Promise<APIResult<PtaRunsDTO>> {
  return apiClient<PtaRunsDTO>(ENDPOINTS.MOBO.PTA_RUNS);
}

/** POST the manual "Sync" trigger — always 200, real or empty run (D-10). */
export async function runPostTradeAllocation(): Promise<APIResult<PtaRunResultDTO>> {
  return apiClient<PtaRunResultDTO>(ENDPOINTS.MOBO.PTA_RUN, { method: "POST", body: JSON.stringify({}) });
}

/** GET the PTA history series for a date range. */
export async function getPostTradeAllocationHistory(
  fromDate: string,
  toDate: string,
  modelId?: string,
): Promise<APIResult<PtaHistoryDTO>> {
  let path = `${ENDPOINTS.MOBO.PTA_HISTORY}?from_date=${encodeURIComponent(fromDate)}&to_date=${encodeURIComponent(toDate)}`;
  if (modelId) path += `&model_id=${encodeURIComponent(modelId)}`;
  return apiClient<PtaHistoryDTO>(path);
}

/** GET the reconciliation flow view for a session; omitted = latest (§4.1, Q-8). */
export async function getReconciliation(sessionId?: string): Promise<APIResult<ReconciliationFlowViewDTO>> {
  const path = sessionId
    ? `${ENDPOINTS.MOBO.RECONCILIATION}?session_id=${encodeURIComponent(sessionId)}`
    : ENDPOINTS.MOBO.RECONCILIATION;
  return apiClient<ReconciliationFlowViewDTO>(path);
}
