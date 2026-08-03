"use server";

import { logger } from "@/lib/logger";
import { getClient as _getClient, updateClient as _updateClient } from "@/server/rm";
import {
  fetchOnboardingByClient as _fetchOnboardingByClient, fetchClientEvents as _fetchClientEvents,
  fetchContactLogs as _fetchContactLogs, createContactLogEntry as _createContactLogEntry,
  downloadContactLogAttachment as _downloadContactLogAttachment,
} from "@/server/onboarding";
import type { ClientPatchReq } from "@/lib/rm/clients";

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

export async function updateClient(clientId: string, patch: ClientPatchReq) {
  try {
    const r = await _updateClient(clientId, patch);
    logger.json("rm.updateClient", r.success ? { id: r.data.id } : r);
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

export async function getContactLogs(clientId: string) {
  try {
    const r = await _fetchContactLogs(clientId);
    logger.json("rm.getContactLogs", r.success ? { count: r.data.length } : r);
    return r;
  } catch (e) {
    return toErrorResult(e);
  }
}

export async function createContactLogEntry(clientId: string, formData: FormData) {
  try {
    const r = await _createContactLogEntry(clientId, formData);
    logger.json("rm.createContactLogEntry", r.success ? { id: r.data.id } : r);
    return r;
  } catch (e) {
    return toErrorResult(e);
  }
}

export async function downloadContactLogAttachment(clientId: string, logId: string) {
  try {
    const r = await _downloadContactLogAttachment(clientId, logId);
    logger.json("rm.downloadContactLogAttachment", r.success ? { filename: r.data.filename } : r);
    return r;
  } catch (e) {
    return toErrorResult(e);
  }
}
