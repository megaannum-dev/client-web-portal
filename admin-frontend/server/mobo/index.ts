"use server";

import { apiClient, type APIResult } from "@/server/api-client";
import { ENDPOINTS } from "@/server/endpoints";
import type { PtaViewDTO, PtaRunsDTO, PtaRunResultDTO, PtaHistoryDTO } from "@/lib/mobo/types";
import type { ReconciliationFlowViewDTO } from "@/lib/mobo/flow-types";
import type { EodReportViewDTO } from "@/lib/mobo/eod-types";
import { cookies } from "next/headers";
import { getApiBase } from "@/lib/auth-api";

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

/** GET the day-aggregated EoD report; omitted date = latest OPEN, falling back to latest SIGNED (§4.1, Q-3). */
export async function getEod(tradeDate?: string): Promise<APIResult<EodReportViewDTO>> {
  const path = tradeDate ? `${ENDPOINTS.MOBO.EOD}?trade_date=${encodeURIComponent(tradeDate)}` : ENDPOINTS.MOBO.EOD;
  return apiClient<EodReportViewDTO>(path);
}

/** POST sign-off — freezes the day's breaks, generates the PDF, locks it. */
export async function signOffEod(tradeDate: string): Promise<APIResult<EodReportViewDTO>> {
  return apiClient<EodReportViewDTO>(ENDPOINTS.MOBO.EOD_SIGNOFF, {
    method: "POST", body: JSON.stringify({ tradeDate }),
  });
}

/** Base64 proxy — mirrors server/onboarding/index.ts's downloadDocument (cookie token can't ride a plain <a href>). */
export async function downloadEod(
  tradeDate?: string,
): Promise<APIResult<{ filename: string; contentType: string; base64: string }>> {
  const token = (await cookies()).get("id_token")?.value ?? "";
  const path = tradeDate ? `${ENDPOINTS.MOBO.EOD_EXPORT}?trade_date=${encodeURIComponent(tradeDate)}` : ENDPOINTS.MOBO.EOD_EXPORT;
  const url = `${getApiBase()}${path}`;
  try {
    const res = await fetch(url, { cache: "no-store", headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (res.status === 401) return { success: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    if (!res.ok) return { success: false, error: `HTTP ${res.status}`, code: `HTTP_${res.status}` };
    const cd = res.headers.get("Content-Disposition") ?? "";
    const filename = /filename="?([^";]+)"?/i.exec(cd)?.[1] ?? "EoD-report.pdf";
    const contentType = res.headers.get("Content-Type") ?? "application/pdf";
    const buf = Buffer.from(await res.arrayBuffer());
    return { success: true, data: { filename, contentType, base64: buf.toString("base64") } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error", code: "NETWORK_ERROR" };
  }
}
