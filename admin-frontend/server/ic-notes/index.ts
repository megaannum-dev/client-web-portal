import "server-only";
import { cookies } from "next/headers";
import { getApiBase } from "@/lib/auth-api";
import { apiClient, apiClientFormData, parseErrorEnvelope, type APIResult } from "@/server/api-client";
import { ENDPOINTS } from "@/server/endpoints";
import type { IcNoteDTO } from "@/lib/ic-notes/types";

export type { APIResult };

export async function listIcNotes(): Promise<APIResult<IcNoteDTO[]>> {
  return apiClient<IcNoteDTO[]>(ENDPOINTS.IC_NOTES.LIST);
}

export async function uploadIcNote(formData: FormData): Promise<APIResult<IcNoteDTO>> {
  return apiClientFormData<IcNoteDTO>(ENDPOINTS.IC_NOTES.LIST, formData);
}

/** Base64 proxy — same pattern as downloadDocument in server/onboarding/index.ts
 * (cookie token can't ride a plain <a href>). Filename is not parsed here — the
 * caller already has it from the IcNoteDTO. */
export async function downloadIcNote(
  id: string,
): Promise<APIResult<{ contentType: string; base64: string }>> {
  const token = (await cookies()).get("id_token")?.value ?? "";
  const url = `${getApiBase()}${ENDPOINTS.IC_NOTES.DOWNLOAD(id)}`;
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
