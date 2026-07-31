// DTO -> view mapper. Pure function only, no fetch logic — called by the hook.

import type { EomCommentView, EomReportCommentDTO } from "./types";

export function mapEomCommentsToRecord(dtos: EomReportCommentDTO[]): Record<string, EomCommentView> {
  const record: Record<string, EomCommentView> = {};
  for (const d of dtos) {
    record[d.report_name] = {
      reportName: d.report_name, comment: d.comment, updatedBy: d.updated_by, updatedAt: d.updated_at,
    };
  }
  return record;
}
