// Modelled on tests/server/onboarding/FE-1.server-onboarding.test.ts (proposal 013).
import { afterEach, describe, expect, it, vi } from "vitest";

// server/api-client.ts imports "server-only" + "next/headers" (cookies()).
// Neither resolves under Vitest/jsdom — stub both so the real apiClient/
// apiClientFormData run unmodified against a mocked global fetch.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: () => ({ value: "test-token" }) }),
}));

import { listIcNotes, uploadIcNote, downloadIcNote } from "@/server/ic-notes";
import { ENDPOINTS } from "@/server/endpoints";
import type { IcNoteDTO } from "@/lib/ic-notes/types";

const NOTE: IcNoteDTO = {
  id: "n-1", title: "Q3 IC Meeting", meeting_at: "2026-07-18T09:00:00Z",
  filename: "q3-notes.pdf", content_type: "application/pdf", size_bytes: 1234,
  uploaded_by_uid: "u-1", uploaded_by_name: "Jane PM", uploaded_by_role: "PM",
  uploaded_by_email: "jane@example.com", uploaded_at: "2026-07-18T10:00:00Z",
};

function mockFetchOnce(body: unknown, status = 200, headers: Record<string, string> = {}) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status < 300,
    status,
    headers: { get: (k: string) => headers[k] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(body)).buffer,
  }) as unknown as typeof fetch;
}

function calledUrl(): string {
  return (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as string;
}
function calledInit(): RequestInit | undefined {
  return (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1] as RequestInit | undefined;
}

describe("U2 server/ic-notes", () => {
  afterEach(() => vi.restoreAllMocks());

  it("listIcNotes() hits GET /api/ic-notes and returns the DTO list verbatim", async () => {
    mockFetchOnce([NOTE]);
    const result = await listIcNotes();
    expect(calledUrl().endsWith(ENDPOINTS.IC_NOTES.LIST)).toBe(true);
    expect(result).toEqual({ success: true, data: [NOTE] });
  });

  it("uploadIcNote(formData) POSTs the FormData unchanged to /api/ic-notes", async () => {
    mockFetchOnce(NOTE, 201);
    const fd = new FormData();
    fd.append("file", new Blob(["x"]), "q3-notes.pdf");
    fd.append("title", "Q3 IC Meeting");
    fd.append("meeting_at", "2026-07-18T09:00:00Z");
    const result = await uploadIcNote(fd);
    expect(calledUrl().endsWith(ENDPOINTS.IC_NOTES.LIST)).toBe(true);
    expect(calledInit()?.body).toBe(fd);
    expect(calledInit()?.method).toBe("POST");
    expect(result).toEqual({ success: true, data: NOTE });
  });

  it("uploadIcNote() surfaces a 415 error envelope's detail/code", async () => {
    mockFetchOnce({ detail: "Unsupported file type", code: "UNSUPPORTED_TYPE" }, 415);
    const result = await uploadIcNote(new FormData());
    expect(result).toEqual({ success: false, error: "Unsupported file type", code: "UNSUPPORTED_TYPE" });
  });

  it("downloadIcNote(id) hits GET /api/ic-notes/{id}/download and base64-encodes the body", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (k: string) => (k === "Content-Type" ? "application/pdf" : null) },
      arrayBuffer: async () => new TextEncoder().encode("pdf-bytes").buffer,
    }) as unknown as typeof fetch;
    const result = await downloadIcNote("n-1");
    expect(calledUrl().endsWith(ENDPOINTS.IC_NOTES.DOWNLOAD("n-1"))).toBe(true);
    expect(result).toEqual({
      success: true,
      data: { contentType: "application/pdf", base64: Buffer.from("pdf-bytes").toString("base64") },
    });
  });

  it("downloadIcNote() returns UNAUTHORIZED on a 401 without parsing a body", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, headers: { get: () => null } }) as unknown as typeof fetch;
    const result = await downloadIcNote("n-1");
    expect(result).toEqual({ success: false, error: "Unauthorized", code: "UNAUTHORIZED" });
  });
});
