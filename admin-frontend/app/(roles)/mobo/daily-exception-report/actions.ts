"use server";

import { getEod as _getEod, signOffEod as _signOffEod, downloadEod as _downloadEod, type APIResult } from "@/server/mobo";
import type { EodReportViewDTO } from "@/lib/mobo/eod-types";
import { logger } from "@/lib/logger";

function toErrorResult(error: unknown): { success: false; error: string; code: string } {
  return { success: false, error: error instanceof Error ? error.message : String(error), code: "ACTION_ERROR" };
}

export async function getEodReport(tradeDate?: string): Promise<APIResult<EodReportViewDTO>> {
  try {
    logger.log("🔄 Fetching EoD report:", { tradeDate });
    const response = await _getEod(tradeDate);
    logger.json("✅ Get EoD report response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching EoD report:", { error, tradeDate });
    return toErrorResult(error);
  }
}

export async function signOff(tradeDate: string): Promise<APIResult<EodReportViewDTO>> {
  try {
    logger.log("🔄 Signing off EoD:", { tradeDate });
    const response = await _signOffEod(tradeDate);
    logger.json("✅ Sign-off response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error signing off EoD:", { error, tradeDate });
    return toErrorResult(error);
  }
}

export async function downloadEodPdf(
  tradeDate?: string,
): Promise<APIResult<{ filename: string; contentType: string; base64: string }>> {
  try {
    return await _downloadEod(tradeDate);
  } catch (error) {
    return toErrorResult(error);
  }
}
