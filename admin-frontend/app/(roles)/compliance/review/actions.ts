"use server";

import {
  fetchComplianceQueue as _fetchComplianceQueue,
  submitVerdict as _submitVerdict,
  approveOnboarding as _approveOnboarding,
  rejectOnboarding as _rejectOnboarding,
  downloadDocument as _downloadDocument,
  coDecideRedemption as _coDecideRedemption,
  fetchCoRedemptions as _fetchCoRedemptions,
  type APIResult,
} from "@/server/onboarding";
import type { AllotRdmptDTO, DocumentDTO, OnboardingDTO, RedemptionDecisionReq, RejectReq, VerdictReq } from "@/lib/onboarding/types";
import { logger } from "@/lib/logger";

function toErrorResult(error: unknown): { success: false; error: string; code: string } {
  return { success: false, error: error instanceof Error ? error.message : String(error), code: "ACTION_ERROR" };
}

export async function fetchComplianceQueue(): Promise<APIResult<OnboardingDTO[]>> {
  try {
    logger.log("🔄 Fetching compliance queue...");
    const response = await _fetchComplianceQueue();
    logger.json("✅ Get compliance queue response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching compliance queue:", { error });
    return toErrorResult(error);
  }
}

export async function submitVerdict(
  onboardingId: string, docType: string, body: VerdictReq,
): Promise<APIResult<DocumentDTO>> {
  try {
    logger.json("🔄 Submitting document verdict:", { onboardingId, docType, body });
    const response = await _submitVerdict(onboardingId, docType, body);
    logger.json("✅ Submit verdict response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error submitting document verdict:", { error, onboardingId, docType, body });
    return toErrorResult(error);
  }
}

export async function approveOnboarding(onboardingId: string): Promise<APIResult<OnboardingDTO>> {
  try {
    logger.log("🔄 Approving onboarding:", onboardingId);
    const response = await _approveOnboarding(onboardingId);
    logger.json("✅ Approve onboarding response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error approving onboarding:", { error, onboardingId });
    return toErrorResult(error);
  }
}

export async function rejectOnboarding(onboardingId: string, body: RejectReq): Promise<APIResult<OnboardingDTO>> {
  try {
    logger.json("🔄 Rejecting onboarding:", { onboardingId, body });
    const response = await _rejectOnboarding(onboardingId, body);
    logger.json("✅ Reject onboarding response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error rejecting onboarding:", { error, onboardingId, body });
    return toErrorResult(error);
  }
}

export async function downloadDocument(
  onboardingId: string, docType: string,
): Promise<APIResult<{ filename: string; contentType: string; base64: string }>> {
  try {
    logger.log("🔄 Downloading onboarding document:", { onboardingId, docType });
    const response = await _downloadDocument(onboardingId, docType);
    logger.json("✅ Download document response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error downloading onboarding document:", { error, onboardingId, docType });
    return toErrorResult(error);
  }
}

export async function coDecideRedemption(id: string, body: RedemptionDecisionReq) {
  try {
    const r = await _coDecideRedemption(id, body);
    logger.json("co.decideRedemption", r.success ? { id: r.data.id, status: r.data.status } : r);
    return r;
  } catch (e) { return toErrorResult(e); }
}

export async function fetchCoRedemptions(): Promise<APIResult<AllotRdmptDTO[]>> {
  try {
    const response = await _fetchCoRedemptions();
    logger.json("co.fetchRedemptions", response.success ? { count: response.data.length } : response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching CO redemptions:", { error });
    return toErrorResult(error);
  }
}
