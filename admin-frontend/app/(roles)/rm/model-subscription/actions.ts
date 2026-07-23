"use server";

import { logger } from "@/lib/logger";
import { getSubscriptions as _getSubscriptions, getClientAllotments as _getClientAllotments, submitAllotment as _submitAllotment, submitRedemption as _submitRedemption } from "@/server/rm";
import type { SubmitAllotmentReq, SubmitRedemptionReq } from "@/lib/onboarding/types";

function toErrorResult(error: unknown): { success: false; error: string; code: string } {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
    code: "ACTION_ERROR",
  };
}

export async function fetchSubscriptions() {
  try {
    const r = await _getSubscriptions();
    logger.json("rm.fetchSubscriptions", r.success ? { count: r.data.length } : r);
    return r;
  } catch (e) {
    return toErrorResult(e);
  }
}

export async function fetchClientAllotments(clientId: string) {
  try {
    const r = await _getClientAllotments(clientId);
    logger.json("rm.fetchClientAllotments", r.success ? { clientId, count: r.data.length } : r);
    return r;
  } catch (e) {
    return toErrorResult(e);
  }
}

export async function submitAllotment(req: SubmitAllotmentReq) {
  try {
    const r = await _submitAllotment(req);
    logger.json("rm.submitAllotment", r.success ? { id: r.data.id } : r);
    return r;
  } catch (e) {
    return toErrorResult(e);
  }
}

export async function submitRedemption(req: SubmitRedemptionReq) {
  try {
    const r = await _submitRedemption(req);
    logger.json("rm.submitRedemption", r.success ? { id: r.data.id } : r);
    return r;
  } catch (e) {
    return toErrorResult(e);
  }
}
