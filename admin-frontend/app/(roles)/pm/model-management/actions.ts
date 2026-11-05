"use server";

import {
  getModels as _getModels,
  getModel as _getModel,
  createModel as _createModel,
  updateModel as _updateModel,
  publishModel as _publishModel,
  getMaterials as _getMaterials,
  uploadMaterial as _uploadMaterial,
  downloadMaterial as _downloadMaterial,
  deleteModel as _deleteModel,
  getChanges as _getChanges,
  type APIResult,
} from "@/server/pm";
import type { MaterialDTO, ModelDTO, ModelsListDTO } from "@/lib/pm/types";
import { logger } from "@/lib/logger";

function toErrorResult(error: unknown): { success: false; error: string; code: string } {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
    code: "ACTION_ERROR",
  };
}

export async function getModels(): Promise<APIResult<ModelsListDTO>> {
  try {
    logger.log("🔄 Fetching PM models...");
    const response = await _getModels();
    logger.json("✅ Get models response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching PM models:", { error });
    return toErrorResult(error);
  }
}

export async function getModel(id: string): Promise<APIResult<ModelDTO>> {
  try {
    logger.log("🔄 Fetching PM model:", id);
    const response = await _getModel(id);
    logger.json("✅ Get model response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching PM model:", { error, id });
    return toErrorResult(error);
  }
}

export async function createModel(
  body: Record<string, unknown>,
): Promise<APIResult<ModelDTO>> {
  try {
    logger.json("🔄 Creating PM model with body:", body);
    const response = await _createModel(body);
    logger.json("✅ Create model response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error creating PM model:", { error, body });
    return toErrorResult(error);
  }
}

export async function updateModel(
  id: string,
  body: Record<string, unknown>,
): Promise<APIResult<ModelDTO>> {
  try {
    logger.json("🔄 Updating PM model with body:", { id, body });
    const response = await _updateModel(id, body);
    logger.json("✅ Update model response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error updating PM model:", { error, id, body });
    return toErrorResult(error);
  }
}

export async function publishModel(id: string): Promise<APIResult<ModelDTO>> {
  try {
    logger.log("🔄 Publishing PM model:", id);
    const response = await _publishModel(id);
    logger.json("✅ Publish model response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error publishing PM model:", { error, id });
    return toErrorResult(error);
  }
}

export async function getMaterials(id: string): Promise<APIResult<MaterialDTO[]>> {
  try {
    logger.log("🔄 Fetching PM model materials:", id);
    const response = await _getMaterials(id);
    logger.json("✅ Get materials response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching PM model materials:", { error, id });
    return toErrorResult(error);
  }
}

export async function uploadMaterial(
  id: string,
  formData: FormData,
): Promise<APIResult<MaterialDTO>> {
  try {
    logger.log("🔄 Uploading PM model material:", id);
    const response = await _uploadMaterial(id, formData);
    logger.json("✅ Upload material response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error uploading PM model material:", { error, id });
    return toErrorResult(error);
  }
}

export async function deleteModel(id: string): Promise<APIResult<ModelDTO>> {
  try {
    logger.log("🔄 Deleting PM model:", id);
    const response = await _deleteModel(id);
    logger.json("✅ Delete model response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error deleting PM model:", { error, id });
    return toErrorResult(error);
  }
}

export async function downloadMaterial(
  modelId: string,
  materialId: string,
): Promise<APIResult<{ filename: string; contentType: string; base64: string }>> {
  try {
    logger.log("🔄 Downloading PM model material:", { modelId, materialId });
    const response = await _downloadMaterial(modelId, materialId);
    logger.json("✅ Download material response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error downloading PM model material:", { error, modelId, materialId });
    return toErrorResult(error);
  }
}

export async function getChanges(
  id: string,
): Promise<APIResult<ModelDTO["changes"]>> {
  try {
    logger.log("🔄 Fetching PM model changes:", id);
    const response = await _getChanges(id);
    logger.json("✅ Get changes response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching PM model changes:", { error, id });
    return toErrorResult(error);
  }
}
