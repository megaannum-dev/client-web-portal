"use server";

import {
  getPostTradeAllocation as _getPostTradeAllocation,
  getPostTradeAllocationRuns as _getPostTradeAllocationRuns,
  runPostTradeAllocation as _runPostTradeAllocation,
  type APIResult,
} from "@/server/mobo";
import type { PtaViewDTO, PtaRunsDTO, PtaRunResultDTO } from "@/lib/mobo/types";
import { logger } from "@/lib/logger";

function toErrorResult(error: unknown): { success: false; error: string; code: string } {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
    code: "ACTION_ERROR",
  };
}

export async function getView(date?: string): Promise<APIResult<PtaViewDTO>> {
  try {
    logger.log("🔄 Fetching PTA view:", { date });
    const response = await _getPostTradeAllocation(date);
    logger.json("✅ Get PTA view response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching PTA view:", { error, date });
    return toErrorResult(error);
  }
}

export async function getRuns(): Promise<APIResult<PtaRunsDTO>> {
  try {
    logger.log("🔄 Fetching PTA runs...");
    const response = await _getPostTradeAllocationRuns();
    logger.json("✅ Get PTA runs response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching PTA runs:", { error });
    return toErrorResult(error);
  }
}

export async function runSync(): Promise<APIResult<PtaRunResultDTO>> {
  try {
    logger.log("🔄 Running PTA sync...");
    const response = await _runPostTradeAllocation();
    logger.json("✅ Run PTA sync response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error running PTA sync:", { error });
    return toErrorResult(error);
  }
}
