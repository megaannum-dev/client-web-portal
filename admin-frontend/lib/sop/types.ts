// SOP document DTOs. See api-backend/app/libs/sop/router.py (schemas.py).
import type { IcNoteRole } from "@/lib/ic-notes/types";

export { extOf } from "@/lib/ic-notes/types";

export type SopCategory = "daily" | "weekly" | "monthly" | "ad_hoc";

export interface SopVersionDTO {
  id: string;
  sop_id: string;
  version_no: number;
  change_note: string | null;
  filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_by_uid: string;
  uploaded_by_name: string;
  uploaded_by_role: IcNoteRole;
  uploaded_by_email: string | null;
  uploaded_at: string;
}

export interface SopDocumentDTO {
  id: string;
  title: string;
  category: SopCategory;
  created_by_uid: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  latest: SopVersionDTO;
  version_count: number;
}

export const SOP_CATEGORIES: { key: SopCategory; label: string; bg: string; fg: string }[] = [
  { key: "daily", label: "Daily", bg: "#fff3e8", fg: "#b45309" },
  { key: "weekly", label: "Weekly", bg: "#e8f0fe", fg: "#1a56b8" },
  { key: "monthly", label: "Monthly", bg: "#e6f4ea", fg: "#1e7a3c" },
  { key: "ad_hoc", label: "Ad hoc", bg: "var(--surface-container)", fg: "var(--on-surface)" },
];

const DOC = { bg: "#e8f0fe", fg: "#1a56b8" };
const PPT = { bg: "#fff3e8", fg: "#b45309" };
const XLS = { bg: "#e6f4ea", fg: "#1e7a3c" };
const TXT = { bg: "var(--surface-container)", fg: "var(--on-surface)" };
const IMG = { bg: "#f1ecfb", fg: "#5b3aa8", image: true };

// Must stay in sync with _EXT_CONTENT_TYPES in api-backend/app/libs/sop/service.py.
export const SOP_FORMATS: Record<string, { label: string; bg: string; fg: string; image?: boolean }> = {
  pdf: { label: "PDF", bg: "#fdecea", fg: "#b3261e" },
  docx: { label: "DOCX", ...DOC },
  doc: { label: "DOC", ...DOC },
  pptx: { label: "PPTX", ...PPT },
  ppt: { label: "PPT", ...PPT },
  xlsx: { label: "XLSX", ...XLS },
  xls: { label: "XLS", ...XLS },
  txt: { label: "TXT", ...TXT },
  md: { label: "MD", ...TXT },
  png: { label: "PNG", ...IMG },
  jpg: { label: "JPG", ...IMG },
  jpeg: { label: "JPG", ...IMG },
  gif: { label: "GIF", ...IMG },
  webp: { label: "WEBP", ...IMG },
};

export const SOP_ACCEPT = Object.keys(SOP_FORMATS).map((e) => `.${e}`).join(",");
