"use server";

import { apiClient, type APIResult } from "@/server/api-client";
import { ENDPOINTS } from "@/server/endpoints";
import type { EomReportCommentDTO } from "@/lib/eom-comments/types";

export type { APIResult };

export async function fetchEomComments(): Promise<APIResult<EomReportCommentDTO[]>> {
  return apiClient<EomReportCommentDTO[]>(ENDPOINTS.REPORTS.EOM_COMMENTS);
}

export async function saveEomComment(reportName: string, comment: string): Promise<APIResult<EomReportCommentDTO>> {
  return apiClient<EomReportCommentDTO>(ENDPOINTS.REPORTS.EOM_COMMENT(reportName), {
    method: "PUT",
    body: JSON.stringify({ comment }),
  });
}
