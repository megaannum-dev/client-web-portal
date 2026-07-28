/* ============================================================
   Admin console — domain types
   Ported from the design handoff (admin/admin-app/AdminData.jsx +
   ProtoStore.jsx). This models the internal-user directory and the
   role/page permission matrix shown in Enroll User + System Config.

   NOT wired to `lib/pages-config.ts` — that file is the real route
   guard (2 levels: OPERATE/VIEW). This is a separate, richer (3-level:
   none/view/edit) management console over the same role set, entirely
   mock-data-driven until a backend exists for it.
   ============================================================ */
import type { Role } from "@/lib/pages-config";

export type { Role };

/** Standing access level for a page × role cell. */
export type Level = "none" | "view" | "edit";

export interface RoleDef {
  code: Role;
  name: string;
}

/** One page in the catalog, with its per-role standing levels (indexed like ROLES). */
export interface PageDef {
  name: string;
  path: string;
  levels: Level[];
}

export type PageGroup = [group: string, pages: PageDef[]];

export interface FlatPage {
  group: string;
  name: string;
  path: string;
}

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

/** A staged (unpublished) matrix edit, keyed by `path|roleIndex`. */
export interface StagedChange {
  path: string;
  name: string;
  role: number;
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
