"use server";

import { logger } from "@/lib/logger";
import { getClient as _getClient } from "@/server/rm";

function toErrorResult(error: unknown): { success: false; error: string; code: string } {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
    code: "ACTION_ERROR",
  };
}

export async function getClient(id: string) {
  try {
    const r = await _getClient(id);
    logger.json("rm.getClient", r.success ? { id: r.data.id, name: r.data.name } : r);
    return r;
  } catch (e) {
    return toErrorResult(e);
  }
}
