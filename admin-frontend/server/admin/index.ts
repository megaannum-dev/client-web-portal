"use server";

import { apiClient, type APIResult } from "@/server/api-client";
import { ENDPOINTS } from "@/server/endpoints";
import type { AccessLevel, PageId, Role } from "@/lib/pages-config";

export type { APIResult };

/* ---- DTOs: verbatim §7.1, snake_case preserved ------------------------- */
export type StaffStatus = "ACTIVE" | "INITIATED" | "DEACTIVATED";

export interface StaffOut {
  firebase_uid: string;
  email: string | null;
  name: string | null;
  role: Role;
  department: string | null;
  phone_number: string | null;
  status: StaffStatus;
  last_sign_in_at: string | null;
  override_count: number;
  client_count: number | null;        // RM only; null for every other role
  open_ticket_count: number | null;   // RM only; null for every other role
}

export interface StaffEnrollIn {
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  phone_number?: string | null;
  department?: string | null;
  start_date?: string | null;
  address?: string | null;
  notify: boolean;
  password: string;
  overrides?: Array<{ page_id: PageId; level: AccessLevel; reason: string; expires_at: string | null }>;
}

export interface StaffCreatedOut {
  firebase_uid: string; email: string; role: Role;
  status: StaffStatus; link_sent: boolean; override_count: number;
  generated_password: string;
}

export interface StaffUpdateIn {
  role?: Role; name?: string; email?: string; phone_number?: string | null;
  department?: string | null;
  status?: "ACTIVE" | "DEACTIVATED";
  deactivate_reason?: string | null;
  reassign_book_to?: string | null;
}

export interface LinkSentOut { link_sent: boolean }

export interface MatrixOut {
  pages: Array<{ page_id: PageId; group: string; label: string; path: string }>;
  roles: Array<{ code: Role; name: string; user_count: number }>;
  levels: Array<{ page_id: PageId; role: Role; level: "VIEW" | "EDIT" }>;
  published: { at: string; by: string } | null;
}

export interface MatrixPublishIn {
  changes: Array<{ page_id: PageId; role: Role; level: AccessLevel }>;
  note?: string | null;
  /** §4.1: the request MUST carry this, matching the server's current MAX(published_at).
   *  `null` is the legitimate value for a matrix that has never been published. */
  base_published_at: string | null;
}

export interface OverrideOut {
  id: string;
  firebase_uid: string; user_name: string; user_role: Role;
  page_id: PageId; page_label: string; page_path: string;
  role_default: AccessLevel;
  level: AccessLevel;
  reason: string;
  granted_by: string;
  expires_at: string | null;
  expiring_soon: boolean;
}

export interface OverrideIn {
  firebase_uid: string; page_id: PageId; level: AccessLevel;
  reason: string; expires_at: string | null;
}

export interface AuditOut { id: string; at: string; actor_name: string; event: string; detail: string }

/* ---- one function per route -------------------------------------------- */
export async function getStaff(): Promise<APIResult<StaffOut[]>> {
  return apiClient<StaffOut[]>(ENDPOINTS.ADMIN.STAFF);
}

export async function enrollStaff(body: StaffEnrollIn): Promise<APIResult<StaffCreatedOut>> {
  return apiClient<StaffCreatedOut>(ENDPOINTS.ADMIN.STAFF, {
    method: "POST", body: JSON.stringify(body),
  });
}

export async function updateStaff(uid: string, body: StaffUpdateIn): Promise<APIResult<StaffOut>> {
  return apiClient<StaffOut>(ENDPOINTS.ADMIN.STAFF_MEMBER(uid), {
    method: "PATCH", body: JSON.stringify(body),
  });
}

export async function sendSetPasswordLink(uid: string): Promise<APIResult<LinkSentOut>> {
  return apiClient<LinkSentOut>(ENDPOINTS.ADMIN.STAFF_SET_PW_LINK(uid), { method: "POST" });
}

export async function getMatrix(): Promise<APIResult<MatrixOut>> {
  return apiClient<MatrixOut>(ENDPOINTS.ADMIN.ACCESS_MATRIX);
}

export async function publishMatrix(body: MatrixPublishIn): Promise<APIResult<MatrixOut>> {
  return apiClient<MatrixOut>(ENDPOINTS.ADMIN.ACCESS_MATRIX, {
    method: "PUT", body: JSON.stringify(body),
  });
}

export async function getOverrides(): Promise<APIResult<OverrideOut[]>> {
  return apiClient<OverrideOut[]>(ENDPOINTS.ADMIN.ACCESS_OVERRIDES);
}

export async function grantOverride(body: OverrideIn): Promise<APIResult<OverrideOut>> {
  return apiClient<OverrideOut>(ENDPOINTS.ADMIN.ACCESS_OVERRIDES, {
    method: "POST", body: JSON.stringify(body),
  });
}

export async function revokeOverride(id: string): Promise<APIResult<void>> {
  return apiClient<void>(ENDPOINTS.ADMIN.ACCESS_OVERRIDE(id), { method: "DELETE" });
}

export async function getAudit(params?: { limit?: number; before?: string }): Promise<APIResult<AuditOut[]>> {
  const q = new URLSearchParams();
  if (params?.limit  != null) q.set("limit", String(params.limit));
  if (params?.before != null) q.set("before", params.before);
  const qs = q.toString();
  return apiClient<AuditOut[]>(qs ? `${ENDPOINTS.ADMIN.AUDIT}?${qs}` : ENDPOINTS.ADMIN.AUDIT);
}
