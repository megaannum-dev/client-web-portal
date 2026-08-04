// FE-9 — verification unit for docs/implementations/020-schema-format-cleanup-refactor-fe.md §FE-9.
//
// Proposal § Layer 3 B row 3 / BE C-3 turns five previously-403 backend paths into 401s.
// The FE-side contract this depends on: apiClient / apiClientFormData / apiClientConditional
// all short-circuit a 401 into the fixed {error:"Unauthorized", code:"UNAUTHORIZED"} literal
// BEFORE parseErrorEnvelope ever runs — otherwise a real, well-formed error envelope on a 401
// response would leak its own `detail` through and the re-auth signal would be lost. FE-7
// rewrote the envelope-parsing branch in all three wrappers + the 5 base64 proxy sites; this
// test locks the ordering in so a future edit to that code can't silently swap the checks.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: () => ({ value: "test-token" }) }),
}));

import { apiClient, apiClientConditional, apiClientFormData } from "@/server/api-client";
import { downloadDocument } from "@/server/onboarding";
import { downloadMaterial } from "@/server/pc";

// A well-formed envelope whose `detail`/`code` are deliberately NOT "Unauthorized"/"UNAUTHORIZED" —
// if the ordering ever regresses (envelope parsed before/instead of the 401 check), this body's
// own values would leak through and the assertions below would fail.
const DECOY_ENVELOPE = { detail: "some other server message", code: "some_other_code" };

function mockFetchOnce(status: number, body: unknown = DECOY_ENVELOPE) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    headers: { get: () => null },
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  }) as unknown as typeof fetch;
}

describe("FE-9 — 401 short-circuit precedes envelope parsing (regression lock for FE-7)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("apiClient: 401 wins over a decoy envelope body", async () => {
    mockFetchOnce(401);
    expect(await apiClient("/x")).toEqual({ success: false, error: "Unauthorized", code: "UNAUTHORIZED" });
  });

  it("apiClientFormData: 401 wins over a decoy envelope body", async () => {
    mockFetchOnce(401);
    expect(await apiClientFormData("/x", new FormData())).toEqual({
      success: false, error: "Unauthorized", code: "UNAUTHORIZED",
    });
  });

  it("apiClientConditional: 401 wins over a decoy envelope body", async () => {
    mockFetchOnce(401);
    const { result, notModified } = await apiClientConditional("/x");
    expect(notModified).toBe(false);
    expect(result).toEqual({ success: false, error: "Unauthorized", code: "UNAUTHORIZED" });
  });

  it("apiClientConditional: 304 (not-modified) is not misread as unauthorized", async () => {
    mockFetchOnce(304, undefined);
    const { result, notModified } = await apiClientConditional("/x", "some-etag");
    expect(notModified).toBe(true);
    expect(result).toEqual({ success: false, error: "Not Modified", code: "NOT_MODIFIED" });
  });

  it("negative control: a 403 with the same decoy body is NOT swallowed into UNAUTHORIZED — it keeps the server's message", async () => {
    mockFetchOnce(403);
    expect(await apiClient("/x")).toEqual({ success: false, error: "some other server message", code: "some_other_code" });
  });

  it("spot check — server/onboarding downloadDocument (base64 proxy) keeps the same ordering", async () => {
    mockFetchOnce(401);
    expect(await downloadDocument("ob-1", "passport")).toEqual({
      success: false, error: "Unauthorized", code: "UNAUTHORIZED",
    });
  });

  it("spot check — server/pc downloadMaterial (base64 proxy) keeps the same ordering", async () => {
    mockFetchOnce(401);
    expect(await downloadMaterial("m-1", "mat-1")).toEqual({
      success: false, error: "Unauthorized", code: "UNAUTHORIZED",
    });
  });
});
