"use server";

import {
  listSops as _listSops,
  createSop as _createSop,
  addSopVersion as _addSopVersion,
  updateSop as _updateSop,
  listSopVersions as _listSopVersions,
  downloadSopVersion as _downloadSopVersion,
  deleteSop as _deleteSop,
  deleteSopVersion as _deleteSopVersion,
  type APIResult,
} from "@/server/sop";
import type { SopCategory, SopDocumentDTO, SopVersionDTO } from "@/lib/sop/types";
import { logger } from "@/lib/logger";

function toErrorResult(error: unknown): { success: false; error: string; code: string } {
  return { success: false, error: error instanceof Error ? error.message : String(error), code: "ACTION_ERROR" };
}

export async function listSopsAction(): Promise<APIResult<SopDocumentDTO[]>> {
  try {
    logger.log("🔄 listSops...");
    const response = await _listSops();
    logger.json("✅ listSops response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error in listSops:", { error });
    return toErrorResult(error);
  }
}

export async function createSopAction(formData: FormData): Promise<APIResult<SopDocumentDTO>> {
  try {
    logger.log("🔄 createSop...");
    const response = await _createSop(formData);
    logger.json("✅ createSop response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error in createSop:", { error });
    return toErrorResult(error);
  }
}

export async function addSopVersionAction(id: string, formData: FormData): Promise<APIResult<SopVersionDTO>> {
  try {
    logger.log("🔄 addSopVersion...");
    const response = await _addSopVersion(id, formData);
    logger.json("✅ addSopVersion response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error in addSopVersion:", { error });
    return toErrorResult(error);
  }
}

export async function updateSopAction(id: string, body: { title?: string; category?: SopCategory }): Promise<APIResult<SopDocumentDTO>> {
  try {
    logger.log("🔄 updateSop...");
    const response = await _updateSop(id, body);
    logger.json("✅ updateSop response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error in updateSop:", { error });
    return toErrorResult(error);
  }
}

export async function listSopVersionsAction(id: string): Promise<APIResult<SopVersionDTO[]>> {
  try {
    logger.log("🔄 listSopVersions...");
    const response = await _listSopVersions(id);
    logger.json("✅ listSopVersions response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error in listSopVersions:", { error });
    return toErrorResult(error);
  }
}

export async function downloadSopVersionAction(id: string, v: number): Promise<APIResult<{ contentType: string; base64: string }>> {
  try {
    logger.log("🔄 downloadSopVersion...");
    const response = await _downloadSopVersion(id, v);
    logger.json("✅ downloadSopVersion response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error in downloadSopVersion:", { error });
    return toErrorResult(error);
  }
}

export async function deleteSopAction(id: string): Promise<APIResult<void>> {
  try {
    logger.log("🔄 deleteSop...");
    const response = await _deleteSop(id);
    logger.json("✅ deleteSop response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error in deleteSop:", { error });
    return toErrorResult(error);
  }
}

export async function deleteSopVersionAction(id: string, v: number): Promise<APIResult<void>> {
  try {
    logger.log("🔄 deleteSopVersion...");
    const response = await _deleteSopVersion(id, v);
    logger.json("✅ deleteSopVersion response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error in deleteSopVersion:", { error });
    return toErrorResult(error);
  }
}
