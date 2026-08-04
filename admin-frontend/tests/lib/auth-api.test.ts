import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BackendAuthError,
  postBackendLogin,
} from "@/lib/auth-api";
import type { PortalUser } from "@/types/portal";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("auth-api FE-4", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("postBackendLogin hits /api/auth/admin/login with {id_token} only and resolves to PortalUser", async () => {
    const user: PortalUser = { firebase_uid: "uid-1", email: "a@b.com", name: "Ada Admin", role: "ADMIN" };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, user));
    vi.stubGlobal("fetch", fetchMock);

    const result = await postBackendLogin("tok-123");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/auth/admin/login");
    expect(JSON.parse(init.body)).toEqual({ id_token: "tok-123" });
    expect(result).toEqual(user);
  });

  it("postBackendLogin throws BackendAuthError with .status === 403 on a 403 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(403, { detail: "no account" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(postBackendLogin("tok-789")).rejects.toMatchObject({
      status: 403,
    });
    await expect(postBackendLogin("tok-789")).rejects.toBeInstanceOf(BackendAuthError);
  });

  it("PortalUser type has exactly firebase_uid/email/name/role (no id)", () => {
    // Compile-time invariant: this literal must type-check without an `id` field.
    const user: PortalUser = { firebase_uid: "uid-3", email: null, name: null, role: "PC" };
    expect(Object.keys(user).sort()).toEqual(["email", "firebase_uid", "name", "role"]);
  });
});
