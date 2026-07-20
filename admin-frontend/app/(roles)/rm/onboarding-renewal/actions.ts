"use server";

import {
  fetchBoard as _fetchBoard,
  startOnboarding as _startOnboarding,
  uploadDocument as _uploadDocument,
  submitAll as _submitAll,
  fetchRmOptions as _fetchRmOptions,
  type APIResult,
} from "@/server/onboarding";
import type { BoardDTO, DocumentDTO, OnboardingDTO, RmOptionDTO, StartOnboardingReq } from "@/lib/onboarding/types";
import { logger } from "@/lib/logger";

function toErrorResult(error: unknown): { success: false; error: string; code: string } {
  return { success: false, error: error instanceof Error ? error.message : String(error), code: "ACTION_ERROR" };
}

export async function fetchBoard(): Promise<APIResult<BoardDTO>> {
  try {
    logger.log("🔄 Fetching onboarding board...");
    const response = await _fetchBoard();
    logger.json("✅ Get board response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching onboarding board:", { error });
    return toErrorResult(error);
  }
}

export async function startOnboarding(body: StartOnboardingReq): Promise<APIResult<OnboardingDTO>> {
  try {
    logger.json("🔄 Starting onboarding:", body);
    const response = await _startOnboarding(body);
    logger.json("✅ Start onboarding response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error starting onboarding:", { error, body });
    return toErrorResult(error);
  }
}

export async function uploadDocument(
  onboardingId: string, docType: string, formData: FormData,
): Promise<APIResult<DocumentDTO>> {
  try {
    logger.log("🔄 Uploading onboarding document:", { onboardingId, docType });
    const response = await _uploadDocument(onboardingId, docType, formData);
    logger.json("✅ Upload document response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error uploading onboarding document:", { error, onboardingId, docType });
    return toErrorResult(error);
  }
}

export async function submitAll(onboardingId: string): Promise<APIResult<OnboardingDTO>> {
  try {
    logger.log("🔄 Submitting onboarding:", onboardingId);
    const response = await _submitAll(onboardingId);
    logger.json("✅ Submit all response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error submitting onboarding:", { error, onboardingId });
    return toErrorResult(error);
  }
}

export async function fetchRmOptions(): Promise<APIResult<RmOptionDTO[]>> {
  try {
    logger.log("🔄 Fetching RM options...");
    const response = await _fetchRmOptions();
    logger.json("✅ Get RM options response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching RM options:", { error });
    return toErrorResult(error);
  }
}
