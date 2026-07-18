import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BackendAuthError,
  postBackendLogin,
  postBackendRegister,
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

describe("auth-api FE-1", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("postBackendLogin hits /api/auth/client/login with {id_token} only and resolves to PortalUser", async () => {
    const user: PortalUser = { firebase_uid: "uid-1", email: "a@b.com", role: "client" };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, user));
    vi.stubGlobal("fetch", fetchMock);

    const result = await postBackendLogin("tok-123");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/auth/client/login");
    expect(JSON.parse(init.body)).toEqual({ id_token: "tok-123" });
    expect(result).toEqual(user);
  });

  it("postBackendRegister hits /api/dev/register with {id_token, portal: 'client'}", async () => {
    const user: PortalUser = { firebase_uid: "uid-2", email: null, role: "client" };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, user));
    vi.stubGlobal("fetch", fetchMock);

    const result = await postBackendRegister("tok-456");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/dev/register");
    expect(JSON.parse(init.body)).toEqual({ id_token: "tok-456", portal: "client" });
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

  it("postBackendRegister throws BackendAuthError on 404 without the 'restart the FastAPI server' message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404, { detail: "Not Found" }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      await postBackendRegister("tok-000");
      expect.unreachable("expected postBackendRegister to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(BackendAuthError);
      expect((err as BackendAuthError).status).toBe(404);
      expect((err as BackendAuthError).message).not.toContain("restart the FastAPI server");
    }
  });

  it("PortalUser type has exactly firebase_uid/email/role (no id)", () => {
    // Compile-time invariant: this literal must type-check without an `id` field.
    const user: PortalUser = { firebase_uid: "uid-3", email: null, role: "client" };
    expect(Object.keys(user).sort()).toEqual(["email", "firebase_uid", "role"]);
  });
});
