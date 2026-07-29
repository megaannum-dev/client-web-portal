import { getApiBase } from "@/lib/auth-api";

export type TicketKind = "allotment" | "redemption" | "other";
export type TicketStatus = "new" | "in_progress" | "resolved" | "declined";

export interface RaiseTicketReq {
  kind: TicketKind;
  model_id?: string;
  subject?: string;
  category?: string;
  amount?: number;
  multiplier?: number;
  currency?: string;
  message: string;
}

export interface ClientRequestDTO {
  source: "ticket" | "allotment";
  ref: string;
  kind: TicketKind;
  subject: string;
  model_name: string | null;
  amount: number | null;
  created_at: string;
  status: TicketStatus;
}

/** POST /api/client/tickets — a local sibling of lib/api/onboarding.ts's authedGet/authedPatch
 *  (same Bearer/detail-unwrap convention as onboarding.ts and kyc.ts); kept local since this
 *  unit's file allowlist does not include onboarding.ts. */
export async function submitTicket(token: string | null, req: RaiseTicketReq): Promise<ClientRequestDTO> {
  const path = "/api/client/tickets";
  const res = await fetch(`${getApiBase()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body: unknown = await res.json();
      if (typeof body === "object" && body !== null && "detail" in body) {
        const d = (body as { detail?: unknown }).detail;
        if (typeof d === "string") detail = d;
      }
    } catch { /* noop */ }
    throw new Error(`${detail} (${res.status} ${path})`);
  }
  return (await res.json()) as ClientRequestDTO;
}
