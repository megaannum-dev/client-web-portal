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
} from "@/server/pc";
import type { MaterialDTO, ModelDTO, ModelsListDTO } from "@/lib/pc/types";
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
    logger.log("🔄 Fetching PC models...");
    const response = await _getModels();
    logger.json("✅ Get models response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching PC models:", { error });
    return toErrorResult(error);
  }
}

export async function getModel(id: string): Promise<APIResult<ModelDTO>> {
  try {
    logger.log("🔄 Fetching PC model:", id);
    const response = await _getModel(id);
    logger.json("✅ Get model response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching PC model:", { error, id });
    return toErrorResult(error);
  }
}

export async function createModel(
  body: Record<string, unknown>,
): Promise<APIResult<ModelDTO>> {
  try {
    logger.json("🔄 Creating PC model with body:", body);
    const response = await _createModel(body);
    logger.json("✅ Create model response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error creating PC model:", { error, body });
    return toErrorResult(error);
  }
}

export async function updateModel(
  id: string,
  body: Record<string, unknown>,
): Promise<APIResult<ModelDTO>> {
  try {
    logger.json("🔄 Updating PC model with body:", { id, body });
    const response = await _updateModel(id, body);
    logger.json("✅ Update model response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error updating PC model:", { error, id, body });
    return toErrorResult(error);
  }
}

export async function publishModel(id: string): Promise<APIResult<ModelDTO>> {
  try {
    logger.log("🔄 Publishing PC model:", id);
    const response = await _publishModel(id);
    logger.json("✅ Publish model response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error publishing PC model:", { error, id });
    return toErrorResult(error);
  }
}

export async function getMaterials(id: string): Promise<APIResult<MaterialDTO[]>> {
  try {
    logger.log("🔄 Fetching PC model materials:", id);
    const response = await _getMaterials(id);
    logger.json("✅ Get materials response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching PC model materials:", { error, id });
    return toErrorResult(error);
  }
}

export async function uploadMaterial(
  id: string,
  formData: FormData,
): Promise<APIResult<MaterialDTO>> {
  try {
    logger.log("🔄 Uploading PC model material:", id);
    const response = await _uploadMaterial(id, formData);
    logger.json("✅ Upload material response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error uploading PC model material:", { error, id });
    return toErrorResult(error);
  }
}

export async function deleteModel(id: string): Promise<APIResult<ModelDTO>> {
  try {
    logger.log("🔄 Deleting PC model:", id);
    const response = await _deleteModel(id);
    logger.json("✅ Delete model response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error deleting PC model:", { error, id });
    return toErrorResult(error);
  }
}

export async function downloadMaterial(
  modelId: string,
  materialId: string,
): Promise<APIResult<{ filename: string; contentType: string; base64: string }>> {
  try {
    logger.log("🔄 Downloading PC model material:", { modelId, materialId });
    const response = await _downloadMaterial(modelId, materialId);
    logger.json("✅ Download material response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error downloading PC model material:", { error, modelId, materialId });
    return toErrorResult(error);
  }
}

export async function getChanges(
  id: string,
): Promise<APIResult<ModelDTO["changes"]>> {
  try {
    logger.log("🔄 Fetching PC model changes:", id);
    const response = await _getChanges(id);
    logger.json("✅ Get changes response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching PC model changes:", { error, id });
    return toErrorResult(error);
  }
}
