"use server";

import { apiClient, type APIResult } from "@/server/api-client";
import { ENDPOINTS } from "@/server/endpoints";
import type { ClientListDTO, ClientListItemDTO } from "@/lib/rm/clients";
import type { AllotRdmptDTO, ClientSubscriptionsDTO, SubmitAllotmentReq, SubmitRedemptionReq, TransactionDetailDTO, TransactionDetailRequest } from "@/lib/onboarding/types";
import type { RmTicketDTO, TicketStatus } from "@/lib/rm/tickets";

export type { APIResult };

export async function getClients(): Promise<APIResult<ClientListDTO>> {
  return apiClient<ClientListDTO>(ENDPOINTS.RM.CLIENTS);
}

export async function getClient(id: string): Promise<APIResult<ClientListItemDTO>> {
  return apiClient<ClientListItemDTO>(ENDPOINTS.RM.CLIENT(id));
}

/** Model Subscription page (FE-6). */
export async function getSubscriptions(): Promise<APIResult<ClientSubscriptionsDTO[]>> {
  return apiClient<ClientSubscriptionsDTO[]>(ENDPOINTS.RM.SUBSCRIPTIONS);
}

export async function getClientAllotments(clientId: string): Promise<APIResult<AllotRdmptDTO[]>> {
  return apiClient<AllotRdmptDTO[]>(ENDPOINTS.RM.SUBSCRIPTION_ALLOTMENTS(clientId));
}

export async function submitAllotment(req: SubmitAllotmentReq): Promise<APIResult<AllotRdmptDTO>> {
  return apiClient<AllotRdmptDTO>(ENDPOINTS.RM.SUBMIT_ALLOTMENT, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function submitRedemption(req: SubmitRedemptionReq): Promise<APIResult<AllotRdmptDTO>> {
  return apiClient<AllotRdmptDTO>(ENDPOINTS.RM.SUBMIT_REDEMPTION, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function fileTransactionDetail(
  allotmentId: string,
  req: TransactionDetailRequest,
): Promise<APIResult<TransactionDetailDTO>> {
  return apiClient<TransactionDetailDTO>(ENDPOINTS.RM.TRANSACTION_DETAIL(allotmentId), {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function getTransactionDetail(
  allotmentId: string,
): Promise<APIResult<TransactionDetailDTO>> {
  return apiClient<TransactionDetailDTO>(ENDPOINTS.RM.TRANSACTION_DETAIL(allotmentId));
}

export async function getTickets(): Promise<APIResult<RmTicketDTO[]>> {
  return apiClient<RmTicketDTO[]>(ENDPOINTS.RM.TICKETS);
}

export async function getTicket(ref: string): Promise<APIResult<RmTicketDTO>> {
  return apiClient<RmTicketDTO>(ENDPOINTS.RM.TICKET(ref));
}

export async function setTicketStatus(
  ref: string,
  body: { status: TicketStatus; note?: string },
): Promise<APIResult<RmTicketDTO>> {
  return apiClient<RmTicketDTO>(ENDPOINTS.RM.TICKET_STATUS(ref), {
    method: "POST",
    body: JSON.stringify(body),
  });
}
