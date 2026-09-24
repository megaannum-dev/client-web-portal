// Modelled on tests/app/(roles)/compliance/review/FE-2.actions.test.ts (proposal 013).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/ic-notes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/ic-notes")>()),
  listIcNotes: vi.fn(),
  uploadIcNote: vi.fn(),
  downloadIcNote: vi.fn(),
}));

import * as serverIcNotes from "@/server/ic-notes";
import { listIcNotesAction, uploadIcNoteAction, downloadIcNoteAction } from "@/app/(roles)/compliance/ic-notes/actions";

describe("U2 compliance/ic-notes action wrappers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("listIcNotesAction() calls the server function and returns its success result verbatim", async () => {
    const ok = { success: true, data: [] };
    vi.mocked(serverIcNotes.listIcNotes).mockResolvedValue(ok as never);
    const result = await listIcNotesAction();
    expect(serverIcNotes.listIcNotes).toHaveBeenCalled();
    expect(result).toBe(ok);
  });

  it("listIcNotesAction() converts a thrown error into ACTION_ERROR instead of propagating", async () => {
    vi.mocked(serverIcNotes.listIcNotes).mockRejectedValue(new Error("network down"));
    const result = await listIcNotesAction();
    expect(result).toEqual({ success: false, error: "network down", code: "ACTION_ERROR" });
  });

  it("uploadIcNoteAction(formData) forwards the FormData unchanged", async () => {
    const ok = { success: true, data: { id: "n-1" } };
    vi.mocked(serverIcNotes.uploadIcNote).mockResolvedValue(ok as never);
    const fd = new FormData();
    const result = await uploadIcNoteAction(fd);
    expect(serverIcNotes.uploadIcNote).toHaveBeenCalledWith(fd);
    expect(result).toBe(ok);
  });

  it("uploadIcNoteAction() converts a thrown error into ACTION_ERROR instead of propagating", async () => {
    vi.mocked(serverIcNotes.uploadIcNote).mockRejectedValue(new Error("file too large"));
    const result = await uploadIcNoteAction(new FormData());
    expect(result).toEqual({ success: false, error: "file too large", code: "ACTION_ERROR" });
  });

  it("downloadIcNoteAction(id) passes a failure result through untouched", async () => {
    const err = { success: false, error: "Not Found", code: "HTTP_404" };
    vi.mocked(serverIcNotes.downloadIcNote).mockResolvedValue(err as never);
    const result = await downloadIcNoteAction("n-1");
    expect(serverIcNotes.downloadIcNote).toHaveBeenCalledWith("n-1");
    expect(result).toBe(err);
  });
});
