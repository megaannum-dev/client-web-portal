// IC meeting notes DTOs. See api-backend/app/libs/ic_notes/router.py.

export type IcNoteRole = "ADMIN" | "MOBO" | "PM" | "PC" | "COMPLIANCE" | "RM";

export interface IcNoteDTO {
  id: string;
  title: string;
  meeting_at: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_by_uid: string;
  uploaded_by_name: string;
  uploaded_by_role: IcNoteRole;
  uploaded_by_email: string | null;
  uploaded_at: string;
}

export type IcNoteFormat = "pdf" | "docx" | "md";
export const IC_NOTE_FORMATS: readonly IcNoteFormat[] = ["pdf", "docx", "md"] as const;

/** Lowercased last extension of `filename`, "" if none. */
export function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i === -1 ? "" : filename.slice(i + 1).toLowerCase();
}
