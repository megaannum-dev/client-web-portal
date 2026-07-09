"use server";

import { logger } from "@/lib/logger";
import { getClients as _getClients } from "@/server/rm";

function toErrorResult(error: unknown): { success: false; error: string; code: string } {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
    code: "ACTION_ERROR",
  };
}

export async function getClients() {
  try {
    const r = await _getClients();
    logger.json("rm.getClients", r.success ? { count: r.data.items.length } : r);
    return r;
  } catch (e) {
    return toErrorResult(e);
  }
}
