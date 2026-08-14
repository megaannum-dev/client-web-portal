import type { ChipTone } from "@/components/ui/Chip";
import type { DocStatus } from "@/lib/onboarding/types";

// DocStatus -> chip tone / display label — the shared styling lookup for every
// doc list (the KYC panel, the client-detail KYC card).
export const DOC_STATUS_TONE: Record<DocStatus, ChipTone> = {
  not_started: "neutral", uploaded: "pending", in_review: "review",
  verified: "active", pending: "pending", expired: "overdue",
};
export const DOC_STATUS_LABEL: Record<DocStatus, string> = {
  not_started: "Not started", uploaded: "Uploaded", in_review: "In review",
  verified: "Verified", pending: "Pending", expired: "Expired",
};

// Upload/approval audit trail is meaningful for any status backed by a real
// file still on record (uploaded/in_review/verified/pending) — only
// not_started/expired mean the prior uploaded_by/approved_at no longer
// describes what's actually on file (e.g. after a renewal reset).
// `pending` stays in: it doubles as "compliance flagged this, re-upload", and
// the backend's repository.flag_pending_upload sets ONLY status — storage_key,
// reviewed_by and reviewed_at are left intact — so a flagged document's audit
// trail still describes the file genuinely on record.
export const AUDIT_VISIBLE_STATUSES = new Set<DocStatus>(["uploaded", "in_review", "verified", "pending"]);
