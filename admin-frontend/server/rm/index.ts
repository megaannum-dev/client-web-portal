"use server";

import { apiClient, type APIResult } from "@/server/api-client";
import { ENDPOINTS } from "@/server/endpoints";
import type { ClientListDTO, ClientListItemDTO } from "@/lib/rm/clients";
import type { AllotRdmptDTO, ClientSubscriptionsDTO, SubmitAllotmentReq, SubmitRedemptionReq } from "@/lib/onboarding/types";

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
