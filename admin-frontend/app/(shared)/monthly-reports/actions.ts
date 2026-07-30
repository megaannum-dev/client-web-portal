"use server";

import {
  fetchEomComments as _fetchEomComments,
  saveEomComment as _saveEomComment,
  type APIResult,
} from "@/server/eom-comments";
import type { EomReportCommentDTO } from "@/lib/eom-comments/types";
import { logger } from "@/lib/logger";

function toErrorResult(error: unknown): { success: false; error: string; code: string } {
  return { success: false, error: error instanceof Error ? error.message : String(error), code: "ACTION_ERROR" };
}

export async function fetchEomComments(): Promise<APIResult<EomReportCommentDTO[]>> {
  try {
    logger.log("🔄 Fetching EoM comments...");
    const response = await _fetchEomComments();
    logger.json("✅ Get EoM comments response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching EoM comments:", { error });
    return toErrorResult(error);
  }
}

export async function saveEomComment(reportName: string, comment: string): Promise<APIResult<EomReportCommentDTO>> {
  try {
    logger.log("🔄 Saving EoM comment:", reportName);
    const response = await _saveEomComment(reportName, comment);
    logger.json("✅ Save EoM comment response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error saving EoM comment:", { error, reportName });
    return toErrorResult(error);
  }
}
