export interface EomReportCommentDTO {
  report_name: string;
  comment: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface EomCommentView {
  reportName: string;
  comment: string;
  updatedBy: string;
  updatedAt: string;
}
