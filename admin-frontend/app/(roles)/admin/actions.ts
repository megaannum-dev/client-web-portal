"use server";

import {
  getStaff as _getStaff,
  enrollStaff as _enrollStaff,
  updateStaff as _updateStaff,
  sendSetPasswordLink as _sendSetPasswordLink,
  getMatrix as _getMatrix,
  publishMatrix as _publishMatrix,
  getOverrides as _getOverrides,
  grantOverride as _grantOverride,
  revokeOverride as _revokeOverride,
  getAudit as _getAudit,
  type APIResult,
  type StaffOut,
  type StaffEnrollIn,
  type StaffCreatedOut,
  type StaffUpdateIn,
  type LinkSentOut,
  type MatrixOut,
  type MatrixPublishIn,
  type OverrideOut,
  type OverrideIn,
  type AuditOut,
} from "@/server/admin";
import { logger } from "@/lib/logger";

function toErrorResult(error: unknown): { success: false; error: string; code: string } {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
    code: "ACTION_ERROR",
  };
}

export async function getStaff(): Promise<APIResult<StaffOut[]>> {
  try {
    logger.log("🔄 Fetching admin staff…");
    const response = await _getStaff();
    logger.json("✅ Get staff response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching admin staff:", { error });
    return toErrorResult(error);
  }
}

export async function enrollStaff(body: StaffEnrollIn): Promise<APIResult<StaffCreatedOut>> {
  try {
    logger.json("🔄 Enrolling staff with body:", body);
    const response = await _enrollStaff(body);
    logger.json("✅ Enroll staff response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error enrolling staff:", { error, body });
    return toErrorResult(error);
  }
}

export async function updateStaff(uid: string, body: StaffUpdateIn): Promise<APIResult<StaffOut>> {
  try {
    logger.json("🔄 Updating staff with body:", { uid, body });
    const response = await _updateStaff(uid, body);
    logger.json("✅ Update staff response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error updating staff:", { error, uid, body });
    return toErrorResult(error);
  }
}

export async function sendSetPasswordLink(uid: string): Promise<APIResult<LinkSentOut>> {
  try {
    logger.log("🔄 Sending set-password link:", uid);
    const response = await _sendSetPasswordLink(uid);
    logger.json("✅ Send set-password link response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error sending set-password link:", { error, uid });
    return toErrorResult(error);
  }
}

export async function getMatrix(): Promise<APIResult<MatrixOut>> {
  try {
    logger.log("🔄 Fetching access matrix…");
    const response = await _getMatrix();
    logger.json("✅ Get matrix response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching access matrix:", { error });
    return toErrorResult(error);
  }
}

export async function publishMatrix(body: MatrixPublishIn): Promise<APIResult<MatrixOut>> {
  try {
    logger.json("🔄 Publishing access matrix with body:", body);
    const response = await _publishMatrix(body);
    logger.json("✅ Publish matrix response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error publishing access matrix:", { error, body });
    return toErrorResult(error);
  }
}

export async function getOverrides(): Promise<APIResult<OverrideOut[]>> {
  try {
    logger.log("🔄 Fetching access overrides…");
    const response = await _getOverrides();
    logger.json("✅ Get overrides response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching access overrides:", { error });
    return toErrorResult(error);
  }
}

export async function grantOverride(body: OverrideIn): Promise<APIResult<OverrideOut>> {
  try {
    logger.json("🔄 Granting override with body:", body);
    const response = await _grantOverride(body);
    logger.json("✅ Grant override response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error granting override:", { error, body });
    return toErrorResult(error);
  }
}

export async function revokeOverride(id: string): Promise<APIResult<void>> {
  try {
    logger.log("🔄 Revoking override:", id);
    const response = await _revokeOverride(id);
    logger.json("✅ Revoke override response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error revoking override:", { error, id });
    return toErrorResult(error);
  }
}

export async function getAudit(params?: { limit?: number; before?: string }): Promise<APIResult<AuditOut[]>> {
  try {
    logger.json("🔄 Fetching admin audit with params:", params);
    const response = await _getAudit(params);
    logger.json("✅ Get audit response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching admin audit:", { error, params });
    return toErrorResult(error);
  }
}
