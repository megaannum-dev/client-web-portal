"use server";

import { logger } from "@/lib/logger";
import { getClient as _getClient } from "@/server/rm";
import { fetchOnboardingByClient as _fetchOnboardingByClient, fetchClientEvents as _fetchClientEvents } from "@/server/onboarding";

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

export async function getOnboardingByClient(clientId: string) {
  try {
    const r = await _fetchOnboardingByClient(clientId);
    logger.json("rm.getOnboardingByClient", r.success ? { id: r.data.id } : r);
    return r;
  } catch (e) {
    return toErrorResult(e);
  }
}

export async function getClientEvents(clientId: string) {
  try {
    const r = await _fetchClientEvents(clientId);
    logger.json("rm.getClientEvents", r.success ? { count: r.data.length } : r);
    return r;
  } catch (e) {
    return toErrorResult(e);
  }
}
