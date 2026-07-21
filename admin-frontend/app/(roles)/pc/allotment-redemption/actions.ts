"use server";

import {
  fetchAllotments as _fetchAllotments,
  acknowledgeAllotment as _acknowledgeAllotment,
  type APIResult,
} from "@/server/onboarding";
import type { AllotRdmptDTO } from "@/lib/onboarding/types";
import { logger } from "@/lib/logger";

function toErrorResult(error: unknown): { success: false; error: string; code: string } {
  return { success: false, error: error instanceof Error ? error.message : String(error), code: "ACTION_ERROR" };
}

export async function fetchAllotments(): Promise<APIResult<AllotRdmptDTO[]>> {
  try {
    logger.log("🔄 Fetching allotments...");
    const response = await _fetchAllotments();
    logger.json("✅ Get allotments response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching allotments:", { error });
    return toErrorResult(error);
  }
}

export async function acknowledgeAllotment(id: string): Promise<APIResult<AllotRdmptDTO>> {
  try {
    logger.log("🔄 Acknowledging allotment:", id);
    const response = await _acknowledgeAllotment(id);
    logger.json("✅ Acknowledge allotment response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error acknowledging allotment:", { error, id });
    return toErrorResult(error);
  }
}
