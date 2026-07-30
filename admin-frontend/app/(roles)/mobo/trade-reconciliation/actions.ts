"use server";

import { getTradeRecords as _getTradeRecords, type APIResult } from "@/server/mobo";
import type { TradeRecordsViewDTO } from "@/lib/mobo/types";
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
