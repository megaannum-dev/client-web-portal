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
  getChanges as _getChanges,
} from "@/server/pc";

export async function getModels() { return _getModels(); }
export async function getModel(id: string) { return _getModel(id); }
export async function createModel(body: Record<string, unknown>) { return _createModel(body); }
export async function updateModel(id: string, body: Record<string, unknown>) { return _updateModel(id, body); }
export async function publishModel(id: string) { return _publishModel(id); }
export async function getMaterials(id: string) { return _getMaterials(id); }
export async function uploadMaterial(id: string, formData: FormData) { return _uploadMaterial(id, formData); }
export async function downloadMaterial(modelId: string, materialId: string) {
  return _downloadMaterial(modelId, materialId);
}
export async function getChanges(id: string) { return _getChanges(id); }
