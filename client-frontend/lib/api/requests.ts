import { authedGet } from "@/lib/api/onboarding";
import type { ClientRequestDTO } from "./tickets";

export { type ClientRequestDTO, type TicketStatus, type TicketKind } from "./tickets";

/** GET /api/client/requests — reuses onboarding.ts's authedGet (same Bearer/detail-unwrap
 *  convention as fetchSubscriptions/fetchEvents/fetchKycPanel). */
export async function fetchRequests(token: string | null): Promise<ClientRequestDTO[]> {
  return authedGet<ClientRequestDTO[]>("/api/client/requests", token);
}
