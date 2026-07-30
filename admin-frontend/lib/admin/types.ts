/* ============================================================
   Admin console — domain types
   Ported from the design handoff (admin/admin-app/AdminData.jsx +
   ProtoStore.jsx). This models the internal-user directory and the
   role/page permission matrix shown in Enroll User + System Config.

   FE-8: the wire DTOs (StaffOut/StaffStatus/OverrideOut/AuditOut/
   MatrixOut, from server/admin — FE-7) are re-exported here so
   components import from one place, plus the display helpers that
   derive `tone`/`initials`/`seen` from them at render time instead of
   storing them.

   FE-9: AdminStoreContext.tsx is API-backed and the legacy mock shapes
   (AdminUser/Override/AuditEntry/UserStatus) are deleted — every
   consumer now reads the DTOs above. `EnrollDraft` (with its temp-
   password field and path-keyed `ovr`) is KEPT: the enroll wizard
   (app/(roles)/admin/enroll-user/page.tsx, components/admin/enroll/
   Wizard.tsx) still builds/consumes this exact shape until FE-11
   migrates it.
   ============================================================ */
import type { AccessLevel, PageId, Role } from "@/lib/pages-config";
import type { AuditOut, MatrixOut, OverrideOut, StaffOut, StaffStatus } from "@/server/admin";

export type { Role, PageId, AccessLevel };
/** Alias retained so the console's existing call sites read naturally. Same type. */
export type Level = AccessLevel;

// Re-export the DTOs so components import from one place, as they do today.
export type { StaffOut, StaffStatus, OverrideOut, AuditOut, MatrixOut };

/** Display tone for a status chip. DERIVED from status — never stored. */
export type StatusTone = "active" | "pending" | "neutral";
const STATUS_TONE: Record<StaffStatus, StatusTone> = {
  ACTIVE: "active", INITIATED: "pending", DEACTIVATED: "neutral",
};
export const toneFor = (s: StaffStatus): StatusTone => STATUS_TONE[s];

/** "Amara Rahim" → "AR". DERIVED from name — never stored. Null-safe, never throws. */
export const initialsFor = (name: string | null): string =>
  (name ?? "?").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

/** `last_sign_in_at` → the directory's "Last seen" cell. "—" when never signed in
 *  or the timestamp doesn't parse (never throws on a malformed string). */
export const seenFor = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) return `Today ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
};

/** Status chip label — the wire value title-cased, so the filter chips and the chip text
 *  read the DTO verbatim (no client-side derivation of status itself). */
export const STATUS_LABEL: Record<StaffStatus, string> = {
  ACTIVE: "Active", INITIATED: "Initiated", DEACTIVATED: "Deactivated",
};

/** A staged (unpublished) matrix edit, keyed by `page_id|role`. */
export interface StagedChange {
  page_id: PageId;
  label: string;
  role: Role;
  from: Level;
  to: Level;
}

/** Draft user identity + role + credentials, built up across the enroll wizard. */
export interface EnrollDraft {
  mode: "new" | "edit";
  orig?: string;
  first: string;
  last: string;
  email: string;
  phone: string;
  start: string;
  addr: string;
  dept: string;
  role: Role | "";
  ovr: Record<string, Level>;
  pw: string;
  expiry: string;
  invite: boolean;
}
