"use server";

import {
  fetchComplianceQueue as _fetchComplianceQueue,
  submitVerdicts as _submitVerdicts,
  approveOnboarding as _approveOnboarding,
  requestReprovision as _requestReprovision,
  requestResubmit as _requestResubmit,
  downloadDocument as _downloadDocument,
  coDecideRedemption as _coDecideRedemption,
  fetchCoRedemptions as _fetchCoRedemptions,
  type APIResult,
} from "@/server/onboarding";
import type {
  AllotRdmptDTO, DocumentDTO, OnboardingDTO, RedemptionDecisionReq, ReprovisionReq, ResubmitReq,
  VerdictBatchReq,
} from "@/lib/onboarding/types";
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

export async function submitVerdicts(
  onboardingId: string, body: VerdictBatchReq,
): Promise<APIResult<DocumentDTO[]>> {
  try {
    logger.json("🔄 Submitting document verdicts (batch):", { onboardingId, body });
    const response = await _submitVerdicts(onboardingId, body);
    logger.json("✅ Submit verdicts response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error submitting document verdicts:", { error, onboardingId, body });
    return toErrorResult(error);
  }
}

export async function requestReprovision(
  onboardingId: string, body: ReprovisionReq,
): Promise<APIResult<OnboardingDTO>> {
  try {
    logger.json("🔄 Requesting document re-provision:", { onboardingId, body });
    const response = await _requestReprovision(onboardingId, body);
    logger.json("✅ Request reprovision response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error requesting document re-provision:", { error, onboardingId, body });
    return toErrorResult(error);
  }
}

export async function requestResubmit(
  onboardingId: string, body: ResubmitReq,
): Promise<APIResult<OnboardingDTO>> {
  try {
    logger.json("🔄 Requesting resubmit:", { onboardingId, body });
    const response = await _requestResubmit(onboardingId, body);
    logger.json("✅ Request resubmit response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error requesting resubmit:", { error, onboardingId, body });
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
