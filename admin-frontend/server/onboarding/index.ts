"use server";

import { apiClient, apiClientFormData, type APIResult } from "@/server/api-client";
import { ENDPOINTS } from "@/server/endpoints";
import { cookies } from "next/headers";
import { getApiBase } from "@/lib/auth-api";
import type {
  AllotRdmptDTO, BoardDTO, ClientEventDTO, DocSpecDTO, DocumentDTO, OnboardingDTO,
  RedemptionDecisionReq, RejectReq, RmOptionDTO, StartOnboardingReq, VerdictReq,
} from "@/lib/onboarding/types";

export type { APIResult };

/* ---- RM ---- */
export async function fetchBoard(): Promise<APIResult<BoardDTO>> {
  return apiClient<BoardDTO>(ENDPOINTS.RM.ONBOARDINGS);
}
export async function startOnboarding(body: StartOnboardingReq): Promise<APIResult<OnboardingDTO>> {
  return apiClient<OnboardingDTO>(ENDPOINTS.RM.ONBOARDINGS, { method: "POST", body: JSON.stringify(body) });
}
/** Board rows omit `documents` (perf) -- the KYC panel calls this on open to get the real doc rows. */
export async function fetchOnboarding(onboardingId: string): Promise<APIResult<OnboardingDTO>> {
  return apiClient<OnboardingDTO>(ENDPOINTS.RM.ONBOARDING(onboardingId));
}
export async function uploadDocument(
  onboardingId: string, docType: string, formData: FormData,
): Promise<APIResult<DocumentDTO>> {
  return apiClientFormData<DocumentDTO>(ENDPOINTS.RM.ONBOARDING_DOC(onboardingId, docType), formData);
}
export async function submitAll(onboardingId: string): Promise<APIResult<OnboardingDTO>> {
  return apiClient<OnboardingDTO>(ENDPOINTS.RM.ONBOARDING_SUBMIT(onboardingId), { method: "POST" });
}
/** RM name list for the "Assigned RM" picker. The FE only renders the picker
 * for ADMIN callers; the backend independently pins non-ADMIN overrides back
 * to the caller regardless of what's submitted. */
export async function fetchRmOptions(): Promise<APIResult<RmOptionDTO[]>> {
  return apiClient<RmOptionDTO[]>(ENDPOINTS.RM.ONBOARDING_RM_OPTIONS);
}
/** The 7 required-doc catalog, server-authoritative -- same list the KYC
 * panel renders, fetched here so the "Start Onboarding" wizard's Documents
 * step never hardcodes its own (divergent) copy. */
export async function fetchDocSpecs(): Promise<APIResult<DocSpecDTO[]>> {
  return apiClient<DocSpecDTO[]>(ENDPOINTS.RM.ONBOARDING_DOC_SPECS);
}
/** Client-detail page's KYC & Documents card (FE-4) -- 404 if the client has no onboarding row. */
export async function fetchOnboardingByClient(clientId: string): Promise<APIResult<OnboardingDTO>> {
  return apiClient<OnboardingDTO>(ENDPOINTS.RM.ONBOARDING_BY_CLIENT(clientId));
}
/** Client-detail page's History card (FE-4). */
export async function fetchClientEvents(clientId: string): Promise<APIResult<ClientEventDTO[]>> {
  return apiClient<ClientEventDTO[]>(ENDPOINTS.RM.CLIENT_EVENTS(clientId));
}
/** RM-scoped mirror of Compliance's downloadDocument below (base64 proxy —
 * cookie token can't ride a plain <a href>). */
export async function downloadDocumentRm(
  onboardingId: string, docType: string,
): Promise<APIResult<{ filename: string; contentType: string; base64: string }>> {
  const token = (await cookies()).get("id_token")?.value ?? "";
  const url = `${getApiBase()}${ENDPOINTS.RM.ONBOARDING_DOWNLOAD(onboardingId, docType)}`;
  try {
    const res = await fetch(url, { cache: "no-store", headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (res.status === 401) return { success: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    if (!res.ok) return { success: false, error: `HTTP ${res.status}`, code: `HTTP_${res.status}` };
    const cd = res.headers.get("Content-Disposition") ?? "";
    const filename = /filename="?([^";]+)"?/i.exec(cd)?.[1] ?? docType;
    const contentType = res.headers.get("Content-Type") ?? "application/octet-stream";
    const buf = Buffer.from(await res.arrayBuffer());
    return { success: true, data: { filename, contentType, base64: buf.toString("base64") } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error", code: "NETWORK_ERROR" };
  }
}
/** Zips every uploaded doc for one onboarding — same base64 proxy, no
 * per-file Content-Disposition to parse so the filename/type are static. */
export async function downloadAllDocuments(
  onboardingId: string,
): Promise<APIResult<{ filename: string; contentType: string; base64: string }>> {
  const token = (await cookies()).get("id_token")?.value ?? "";
  const url = `${getApiBase()}${ENDPOINTS.RM.ONBOARDING_DOWNLOAD_ALL(onboardingId)}`;
  try {
    const res = await fetch(url, { cache: "no-store", headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (res.status === 401) return { success: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    if (!res.ok) return { success: false, error: `HTTP ${res.status}`, code: `HTTP_${res.status}` };
    const contentType = res.headers.get("Content-Type") ?? "application/zip";
    const buf = Buffer.from(await res.arrayBuffer());
    return { success: true, data: { filename: "kyc-documents.zip", contentType, base64: buf.toString("base64") } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error", code: "NETWORK_ERROR" };
  }
}

/* ---- Compliance ---- */
export async function fetchComplianceQueue(): Promise<APIResult<OnboardingDTO[]>> {
  return apiClient<OnboardingDTO[]>(ENDPOINTS.COMPLIANCE.ONBOARDINGS);
}
export async function submitVerdict(
  onboardingId: string, docType: string, body: VerdictReq,
): Promise<APIResult<DocumentDTO>> {
  return apiClient<DocumentDTO>(ENDPOINTS.COMPLIANCE.ONBOARDING_VERDICT(onboardingId, docType), {
    method: "POST", body: JSON.stringify(body),
  });
}
export async function approveOnboarding(onboardingId: string): Promise<APIResult<OnboardingDTO>> {
  return apiClient<OnboardingDTO>(ENDPOINTS.COMPLIANCE.ONBOARDING_APPROVE(onboardingId), { method: "POST" });
}
export async function rejectOnboarding(onboardingId: string, body: RejectReq): Promise<APIResult<OnboardingDTO>> {
  return apiClient<OnboardingDTO>(ENDPOINTS.COMPLIANCE.ONBOARDING_REJECT(onboardingId), {
    method: "POST", body: JSON.stringify(body),
  });
}
/** Base64 proxy — mirrors server/pc/index.ts's downloadMaterial (cookie token can't ride a plain <a href>). */
export async function downloadDocument(
  onboardingId: string, docType: string,
): Promise<APIResult<{ filename: string; contentType: string; base64: string }>> {
  const token = (await cookies()).get("id_token")?.value ?? "";
  const url = `${getApiBase()}${ENDPOINTS.COMPLIANCE.ONBOARDING_DOWNLOAD(onboardingId, docType)}`;
  try {
    const res = await fetch(url, { cache: "no-store", headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (res.status === 401) return { success: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    if (!res.ok) return { success: false, error: `HTTP ${res.status}`, code: `HTTP_${res.status}` };
    const cd = res.headers.get("Content-Disposition") ?? "";
    const filename = /filename="?([^";]+)"?/i.exec(cd)?.[1] ?? docType;
    const contentType = res.headers.get("Content-Type") ?? "application/octet-stream";
    const buf = Buffer.from(await res.arrayBuffer());
    return { success: true, data: { filename, contentType, base64: buf.toString("base64") } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error", code: "NETWORK_ERROR" };
  }
}

/* ---- PC ---- */
export async function fetchAllotments(): Promise<APIResult<AllotRdmptDTO[]>> {
  return apiClient<AllotRdmptDTO[]>(ENDPOINTS.PC.ALLOTMENTS);
}
export async function acknowledgeAllotment(id: string): Promise<APIResult<AllotRdmptDTO>> {
  return apiClient<AllotRdmptDTO>(ENDPOINTS.PC.ALLOTMENT_ACK(id), { method: "POST" });
}
export async function pcDecideRedemption(
  id: string, body: RedemptionDecisionReq,
): Promise<APIResult<AllotRdmptDTO>> {
  return apiClient<AllotRdmptDTO>(ENDPOINTS.PC.REDEMPTION_DECIDE(id), {
    method: "POST", body: JSON.stringify(body),
  });
}
export async function coDecideRedemption(
  id: string, body: RedemptionDecisionReq,
): Promise<APIResult<AllotRdmptDTO>> {
  return apiClient<AllotRdmptDTO>(ENDPOINTS.COMPLIANCE.REDEMPTION_DECIDE(id), {
    method: "POST", body: JSON.stringify(body),
  });
}
export async function fetchCoRedemptions(): Promise<APIResult<AllotRdmptDTO[]>> {
  return apiClient<AllotRdmptDTO[]>(ENDPOINTS.COMPLIANCE.REDEMPTIONS);
}
