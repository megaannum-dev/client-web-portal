import "server-only";
import { cookies } from "next/headers";
import { getApiBase } from "@/lib/auth-api";
import { apiClient, apiClientFormData, parseErrorEnvelope, type APIResult } from "@/server/api-client";
import { ENDPOINTS } from "@/server/endpoints";
import type { SopCategory, SopDocumentDTO, SopVersionDTO } from "@/lib/sop/types";

export type { APIResult };

export async function listSops(): Promise<APIResult<SopDocumentDTO[]>> {
  return apiClient<SopDocumentDTO[]>(ENDPOINTS.SOP.LIST);
}

export async function createSop(formData: FormData): Promise<APIResult<SopDocumentDTO>> {
  return apiClientFormData<SopDocumentDTO>(ENDPOINTS.SOP.LIST, formData);
}

export async function addSopVersion(id: string, formData: FormData): Promise<APIResult<SopVersionDTO>> {
  return apiClientFormData<SopVersionDTO>(ENDPOINTS.SOP.VERSIONS(id), formData);
}

export async function updateSop(
  id: string,
  body: { title?: string; category?: SopCategory },
): Promise<APIResult<SopDocumentDTO>> {
  return apiClient<SopDocumentDTO>(ENDPOINTS.SOP.ONE(id), { method: "PATCH", body: JSON.stringify(body) });
}

export async function listSopVersions(id: string): Promise<APIResult<SopVersionDTO[]>> {
  return apiClient<SopVersionDTO[]>(ENDPOINTS.SOP.VERSIONS(id));
}

/** Base64 proxy — same pattern as downloadDocument in server/onboarding/index.ts
 * (cookie token can't ride a plain <a href>). Filename is not parsed here — the
 * caller already has it from the SopVersionDTO. */
export async function downloadSopVersion(
  id: string,
  v: number,
): Promise<APIResult<{ contentType: string; base64: string }>> {
  const token = (await cookies()).get("id_token")?.value ?? "";
  const url = `${getApiBase()}${ENDPOINTS.SOP.DOWNLOAD(id, v)}`;
  try {
    const res = await fetch(url, { cache: "no-store", headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (res.status === 401) return { success: false, error: "Unauthorized", code: "UNAUTHORIZED" };
    if (!res.ok) {
      const { error, code } = await parseErrorEnvelope(res);
      return { success: false, error, code };
    }
    const contentType = res.headers.get("Content-Type") ?? "application/octet-stream";
    const buf = Buffer.from(await res.arrayBuffer());
    return { success: true, data: { contentType, base64: buf.toString("base64") } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Network error", code: "NETWORK_ERROR" };
  }
}

export async function deleteSop(id: string): Promise<APIResult<void>> {
  return apiClient<void>(ENDPOINTS.SOP.ONE(id), { method: "DELETE" });
}

/** Deleting the only version also deletes the document (backend rule). */
export async function deleteSopVersion(id: string, v: number): Promise<APIResult<void>> {
  return apiClient<void>(ENDPOINTS.SOP.VERSION(id, v), { method: "DELETE" });
}
