"use server";

import {
  getAllocation as _getAllocation,
  confirmPeriod as _confirmPeriod,
  type APIResult,
  type AllocationFetchResult,
} from "@/server/pc";
import type { PeriodDTO } from "@/lib/pc/types";
import { logger } from "@/lib/logger";

function toErrorResult(error: unknown): { success: false; error: string; code: string } {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
    code: "ACTION_ERROR",
  };
}

/**
 * Fetch the allocation matrix for a given period.
 * Pass `etag` (from a prior 200 response) to get a conditional 304 if nothing changed.
 * Returns `notModified: true` on 304 — caller should keep the cached view.
 */
export async function getAllocation(
  period?: string,
  etag?: string,
): Promise<AllocationFetchResult> {
  try {
    logger.log("🔄 Fetching PC allocation matrix:", { period, etag });
    const response = await _getAllocation(period, etag);
    logger.json("✅ Get allocation response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching PC allocation matrix:", { error, period });
    return { result: toErrorResult(error), notModified: false };
  }
}

export async function confirmPeriod(id: string): Promise<APIResult<PeriodDTO>> {
  try {
    logger.log("🔄 Confirming PC allocation period:", id);
    const response = await _confirmPeriod(id);
    logger.json("✅ Confirm period response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error confirming PC allocation period:", { error, id });
    return toErrorResult(error);
  }
}
