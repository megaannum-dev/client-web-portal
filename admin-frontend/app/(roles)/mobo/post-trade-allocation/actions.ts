"use server";

import {
  getPostTradeAllocation,
  getPostTradeAllocationRuns,
  runPostTradeAllocation,
} from "@/server/mobo";
import type { APIResult } from "@/server/api-client";
import type { PtaViewDTO, PtaRunsDTO, PtaRunResultDTO } from "@/lib/mobo/types";

export async function getView(date?: string): Promise<APIResult<PtaViewDTO>> {
  return getPostTradeAllocation(date);
}

export async function getRuns(): Promise<APIResult<PtaRunsDTO>> {
  return getPostTradeAllocationRuns();
}

export async function runSync(): Promise<APIResult<PtaRunResultDTO>> {
  return runPostTradeAllocation();
}
