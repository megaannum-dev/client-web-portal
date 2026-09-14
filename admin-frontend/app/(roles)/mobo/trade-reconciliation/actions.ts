"use server";

import { getTradeRecords as _getTradeRecords, getExecutions as _getExecutions, type APIResult } from "@/server/mobo";
import type { TradeRecordsViewDTO } from "@/lib/mobo/types";
import type { UnifiedExecutionsViewDTO } from "@/lib/mobo/executions";
import { logger } from "@/lib/logger";

export async function getRecords(date?: string): Promise<APIResult<TradeRecordsViewDTO>> {
  try {
    logger.log("🔄 Fetching trade records:", { date });
    const response = await _getTradeRecords(date);
    logger.json("✅ Get trade records response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching trade records:", { error, date });
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: "ACTION_ERROR",
    };
  }
}

export async function getExecutionsView(day?: string): Promise<APIResult<UnifiedExecutionsViewDTO>> {
  try {
    logger.log("🔄 Fetching executions:", { day });
    const response = await _getExecutions(day);
    logger.json("✅ Get executions response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching executions:", { error, day });
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      code: "ACTION_ERROR",
    };
  }
}
