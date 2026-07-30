/* ============================================================
   Admin console — domain types
   Ported from the design handoff (admin/admin-app/AdminData.jsx +
   ProtoStore.jsx). This models the internal-user directory and the
   role/page permission matrix shown in Enroll User + System Config.

   NOT wired to `lib/pages-config.ts` — that file is the real route
   guard. This is a separate, richer management console over the same
   role set, entirely mock-data-driven until a backend exists for it.
   ============================================================ */
import type { AccessLevel, PageId, Role } from "@/lib/pages-config";

export type { Role };
export type { AccessLevel };
/** Alias retained so the console's existing call sites read naturally. Same type. */
export type Level = AccessLevel;

export type UserStatus = "Active" | "Initiated" | "Deactivated";
export type StatusTone = "active" | "pending" | "neutral";

export interface AdminUser {
  initials: string;
  name: string;
  email: string;
  role: Role;
  dept: string;
  status: UserStatus;
  tone: StatusTone;
  seen: string;
}

export interface Override {
  id: string;
  initials: string;
  name: string;
  role: Role;
  page: string;
  path: string;
  from: Level;
  to: Level;
  why: string;
  by: string;
  exp: string;
  soon: boolean;
}

export interface AuditEntry {
  id: string;
  ts: string;
  who: string;
  what: string;
  detail: string;
}

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
