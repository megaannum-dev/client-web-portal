"use server";

import {
  listIcNotes as _listIcNotes,
  uploadIcNote as _uploadIcNote,
  downloadIcNote as _downloadIcNote,
  type APIResult,
} from "@/server/ic-notes";
import type { IcNoteDTO } from "@/lib/ic-notes/types";
import { logger } from "@/lib/logger";

function toErrorResult(error: unknown): { success: false; error: string; code: string } {
  return { success: false, error: error instanceof Error ? error.message : String(error), code: "ACTION_ERROR" };
}

export async function listIcNotesAction(): Promise<APIResult<IcNoteDTO[]>> {
  try {
    logger.log("🔄 Fetching IC notes...");
    const response = await _listIcNotes();
    logger.json("✅ List IC notes response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error fetching IC notes:", { error });
    return toErrorResult(error);
  }
}

export async function uploadIcNoteAction(formData: FormData): Promise<APIResult<IcNoteDTO>> {
  try {
    logger.log("🔄 Uploading IC note...");
    const response = await _uploadIcNote(formData);
    logger.json("✅ Upload IC note response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error uploading IC note:", { error });
    return toErrorResult(error);
  }
}

export async function downloadIcNoteAction(
  id: string,
): Promise<APIResult<{ contentType: string; base64: string }>> {
  try {
    logger.log("🔄 Downloading IC note:", id);
    const response = await _downloadIcNote(id);
    logger.json("✅ Download IC note response:", response);
    return response;
  } catch (error) {
    console.error("❌ Error downloading IC note:", { error, id });
    return toErrorResult(error);
  }
}
