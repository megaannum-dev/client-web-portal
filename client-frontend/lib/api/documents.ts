import { getApiBase } from "@/lib/auth-api";

export interface StoredFileDTO {
  key: string;
  filename: string;
  size_bytes: number | null;
  modified_at: string | null;
  category: string | null;
  period: string | null;
}

export type DocumentScope = "legal" | "statements";

function authHeaders(token: string | null): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function detailFromResponse(res: Response): Promise<string> {
  let detail = res.statusText;
  try {
    const body: unknown = await res.json();
    if (typeof body === "object" && body !== null && "detail" in body) {
      const d = (body as { detail?: unknown }).detail;
      if (typeof d === "string") detail = d;
    }
  } catch { /* noop */ }
  return detail;
}

/** GET /api/client/documents/{scope} */
export async function fetchDocuments(token: string | null, scope: DocumentScope): Promise<StoredFileDTO[]> {
  const res = await fetch(`${getApiBase()}/api/client/documents/${scope}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`${await detailFromResponse(res)} (${res.status} /api/client/documents/${scope})`);
  return (await res.json()) as StoredFileDTO[];
}

/** GET /api/client/documents/{scope}/download?key=<key> — file stream, not JSON. */
export async function downloadDocument(token: string | null, scope: DocumentScope, key: string): Promise<Blob> {
  const path = `/api/client/documents/${scope}/download?key=${encodeURIComponent(key)}`;
  const res = await fetch(`${getApiBase()}${path}`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`${await detailFromResponse(res)} (${res.status} ${path})`);
  return res.blob();
}
