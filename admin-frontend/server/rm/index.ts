"use server";

import { apiClient, type APIResult } from "@/server/api-client";
import { ENDPOINTS } from "@/server/endpoints";
import type { ClientListDTO, ClientListItemDTO } from "@/lib/rm/clients";

export type { APIResult };

export async function getClients(): Promise<APIResult<ClientListDTO>> {
  return apiClient<ClientListDTO>(ENDPOINTS.RM.CLIENTS);
}

export async function getClient(id: string): Promise<APIResult<ClientListItemDTO>> {
  return apiClient<ClientListItemDTO>(ENDPOINTS.RM.CLIENT(id));
}
