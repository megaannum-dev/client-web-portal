import { authedGet } from "@/lib/api/onboarding";
import { getApiBase, parseApiError } from "@/lib/auth-api";

// DocumentDTO reused verbatim from the Backend's onboarding schemas (D-8);
// this module does not redefine it, it imports the shape as documented by the seam (§7.1).
export interface DocumentDTO {
  doc_type: string;
  status: "not_started" | "uploaded" | "in_review" | "verified" | "pending" | "expired";
  filename: string | null;
  uploaded_by: string | null;
  uploaded_at: string | null;
  reviewed_at: string | null;
  expires_at: string | null;
  version_no: number;
}

export interface KycPanelDTO {
  overall: "due" | "processing" | "verified";
  documents: DocumentDTO[];
  next_review_at: string | null;
  renewal_doc_type: string | null;
  renewal_doc_label: string | null;
  upload_opens_at: string | null;
  can_upload: boolean;
  upload_blocked_reason: "window_not_open" | "in_review" | "cycle_not_editable" | "no_cycle" | null;
}

/** GET /api/client/kyc */
export async function fetchKycPanel(token: string | null): Promise<KycPanelDTO> {
  return authedGet<KycPanelDTO>("/api/client/kyc", token);
}

/** POST /api/client/kyc/{doc_type} (multipart) — a local sibling of authedGet/authedPatch
 *  for the one caller that needs a FormData body instead of JSON; same Bearer/detail-unwrap
 *  convention as lib/api/onboarding.ts and lib/api/documents.ts. */
export async function uploadKycDocument(token: string | null, docType: string, file: File): Promise<DocumentDTO> {
  const path = `/api/client/kyc/${encodeURIComponent(docType)}`;
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${getApiBase()}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) throw new Error(await parseApiError(res, `POST ${path}`));
  return (await res.json()) as DocumentDTO;
}

/** GET /api/client/kyc/{doc_type}/download — file stream, not JSON. Same
 *  fetch-blob convention as lib/api/documents.ts's downloadDocument. */
export async function downloadKycDocument(token: string | null, docType: string): Promise<Blob> {
  const path = `/api/client/kyc/${encodeURIComponent(docType)}/download`;
  const res = await fetch(`${getApiBase()}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error(await parseApiError(res, `GET ${path}`));
  return res.blob();
}
