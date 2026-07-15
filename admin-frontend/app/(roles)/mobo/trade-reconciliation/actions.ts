"use server";

import { getReconciliation as _getReconciliation, type APIResult } from "@/server/mobo";
import type { ReconciliationFlowViewDTO } from "@/lib/mobo/flow-types";
import { logger } from "@/lib/logger";

function toErrorResult(error: unknown): { success: false; error: string; code: string } {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
    code: "ACTION_ERROR",
  };
}

export async function getFlow(sessionId?: string): Promise<APIResult<ReconciliationFlowViewDTO>> {
  try {
    logger.log("🔄 Fetching reconciliation flow:", { sessionId });
    const response = await _getReconciliation(sessionId);
    logger.json("✅ Get reconciliation flow response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching reconciliation flow:", { error, sessionId });
    return toErrorResult(error);
  }
}
